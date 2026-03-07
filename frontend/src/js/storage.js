/**
 * 存储管理模块
 * 统一管理用户设置的本地存储，支持游客和登录用户两种模式
 */

console.log('📦 storage.js 已加载');

// ==================== 用户状态管理 ====================
const UserState = {
    currentUser: null,  // 当前登录用户信息，null 表示游客模式

    /**
     * 设置当前登录用户
     * @param {Object} user - 用户信息 {id, name, email, avatar, ...}
     */
    setCurrentUser(user) {
        this.currentUser = user;
        if (user) {
            // 保存登录用户信息
            localStorage.setItem('music_current_user', JSON.stringify(user));
            console.log('✓ 已设置登录用户:', user.name);
        } else {
            // 清除登录信息，切换到游客模式
            localStorage.removeItem('music_current_user');
            console.log('✓ 已切换到游客模式');
        }
    },

    /**
     * 获取当前用户
     * @returns {Object|null} 用户信息或 null（游客模式）
     */
    getCurrentUser() {
        if (!this.currentUser) {
            const saved = localStorage.getItem('music_current_user');
            if (saved) {
                try {
                    this.currentUser = JSON.parse(saved);
                } catch (e) {
                    console.error('解析用户信息失败:', e);
                }
            }
        }
        return this.currentUser;
    },

    /**
     * 检查是否为游客模式
     * @returns {boolean}
     */
    isGuest() {
        return !this.getCurrentUser();
    },

    /**
     * 获取存储键前缀
     * 游客模式使用 'guest_'，登录用户使用 'user_{userId}_'
     * @returns {string}
     */
    getStoragePrefix() {
        const user = this.getCurrentUser();
        if (user && user.id) {
            return `user_${user.id}_`;
        }
        return 'guest_';
    }
};

// ==================== 存储键常量 ====================
const STORAGE_KEYS = {
    VOLUME: 'volume',
    PLAY_MODE: 'play_mode',
    FAVORITES: 'favorites',
    LYRICS_OFFSET: 'lyrics_offset',
    THEME: 'theme',
    LAST_PLAYED: 'last_played',
    PLAY_COUNT: 'play_count',
    ATMOSPHERE: 'atmosphere'
};

// ==================== 存储管理 API ====================
const Storage = {
    /**
     * 保存数据到 localStorage
     * @param {string} key - 存储键（不包含前缀）
     * @param {any} value - 要保存的值
     */
    save(key, value) {
        const prefixedKey = UserState.getStoragePrefix() + key;
        try {
            localStorage.setItem(prefixedKey, JSON.stringify(value));
            console.log(`✓ 已保存 [${key}]:`, value);
        } catch (error) {
            console.error(`保存失败 [${key}]:`, error);
        }
    },

    /**
     * 从 localStorage 读取数据
     * @param {string} key - 存储键（不包含前缀）
     * @param {any} defaultValue - 默认值
     * @returns {any} 保存的值或默认值
     */
    load(key, defaultValue = null) {
        const prefixedKey = UserState.getStoragePrefix() + key;
        try {
            const saved = localStorage.getItem(prefixedKey);
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (error) {
            console.error(`读取失败 [${key}]:`, error);
        }
        return defaultValue;
    },

    /**
     * 删除数据
     * @param {string} key - 存储键（不包含前缀）
     */
    remove(key) {
        const prefixedKey = UserState.getStoragePrefix() + key;
        localStorage.removeItem(prefixedKey);
        console.log(`✓ 已删除 [${key}]`);
    },

    /**
     * 清除当前用户的所有数据
     */
    clear() {
        const prefix = UserState.getStoragePrefix();
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        console.log(`✓ 已清除 ${keysToRemove.length} 条数据`);
    }
};

// ==================== 设置管理 ====================
const Settings = {
    /**
     * 保存音量设置
     * @param {number} volume - 音量值 (0-1)
     */
    saveVolume(volume) {
        Storage.save(STORAGE_KEYS.VOLUME, volume);
    },

    /**
     * 加载音量设置
     * @returns {number} 音量值，默认 0.7
     */
    loadVolume() {
        return Storage.load(STORAGE_KEYS.VOLUME, 0.7);
    },

    /**
     * 保存播放模式
     * @param {string} mode - 播放模式 (sequence/loop/single/shuffle)
     */
    savePlayMode(mode) {
        Storage.save(STORAGE_KEYS.PLAY_MODE, mode);
    },

    /**
     * 加载播放模式
     * @returns {string} 播放模式，默认 'sequence'
     */
    loadPlayMode() {
        return Storage.load(STORAGE_KEYS.PLAY_MODE, 'sequence');
    },

    /**
     * 保存收藏列表
     * @param {Array} favorites - 收藏列表
     */
    saveFavorites(favorites) {
        Storage.save(STORAGE_KEYS.FAVORITES, favorites);
    },

    /**
     * 加载收藏列表
     * @returns {Array} 收藏列表
     */
    loadFavorites() {
        return Storage.load(STORAGE_KEYS.FAVORITES, []);
    },

    /**
     * 添加收藏
     * @param {Object} item - 要收藏的项目 {song, artist, album}
     * @returns {boolean} 是否成功添加
     */
    /**
     * 添加收藏
     * @param {Object} item - 要收藏的项目 {song, artist, album}
     * @returns {boolean} 是否成功添加
     */
    addFavorite(item) {
        // 严谨校验：必须有歌名和艺术家，且不能为空字符串
        if (!item || !item.song || !item.artist) {
            console.warn('⚠ 尝试收藏无效项目:', item);
            return false;
        }

        const favorites = this.loadFavorites();

        // 强制转为字符串比较，防止类型不匹配
        const targetSong = String(item.song).trim();
        const targetArtist = String(item.artist).trim();

        // 防止重复
        const exists = favorites.some(f => {
            if (!f.song || !f.artist) return false;
            return String(f.song).trim() === targetSong &&
                String(f.artist).trim() === targetArtist;
        });

        if (!exists) {
            favorites.push({
                ...item,
                song: targetSong,     // 存储清理后的数据
                artist: targetArtist,
                createdAt: new Date().toISOString()
            });
            this.saveFavorites(favorites);
            console.log('✓ 已添加收藏:', targetSong, '-', targetArtist);
            return true;
        }
        return false;
    },

    /**
     * 移除收藏
     * @param {string} song - 歌曲名
     * @param {string} artist - 艺术家
     * @returns {boolean} 是否成功移除
     */
    removeFavorite(song, artist) {
        if (!song || !artist) return false;

        const targetSong = String(song).trim();
        const targetArtist = String(artist).trim();

        const favorites = this.loadFavorites();
        const index = favorites.findIndex(f => {
            if (!f.song || !f.artist) return false;
            return String(f.song).trim() === targetSong &&
                String(f.artist).trim() === targetArtist;
        });

        if (index >= 0) {
            favorites.splice(index, 1);
            this.saveFavorites(favorites);
            console.log('✓ 已移除收藏:', targetSong);
            return true;
        }
        return false;
    },

    /**
     * 检查是否已收藏
     * @param {string} song - 歌曲名
     * @param {string} artist - 艺术家
     * @returns {boolean}
     */
    isFavorite(song, artist) {
        // 核心修复：拒绝空值比较，防止 undefined === undefined 导致的"全选"
        if (!song || !artist) return false;

        const targetSong = String(song).trim();
        const targetArtist = String(artist).trim();

        // 双重保险：如果是默认值或未知，也视为无效
        if (targetSong === '未知标题' || targetArtist === '未知艺术家') return false;

        const favorites = this.loadFavorites();
        return favorites.some(f => {
            if (!f.song || !f.artist) return false;
            return String(f.song).trim() === targetSong &&
                String(f.artist).trim() === targetArtist;
        });
    },

    /**
     * 保存歌词偏移量
     * @param {number} offset - 偏移量（秒）
     */
    saveLyricsOffset(offset) {
        Storage.save(STORAGE_KEYS.LYRICS_OFFSET, offset);
    },

    /**
     * 加载歌词偏移量
     * @returns {number} 偏移量（秒），默认 0
     */
    loadLyricsOffset() {
        return Storage.load(STORAGE_KEYS.LYRICS_OFFSET, 0);
    },

    /**
     * 保存主题设置
     * @param {string} theme - 主题名称
     */
    saveTheme(theme) {
        Storage.save(STORAGE_KEYS.THEME, theme);
    },

    /**
     * 加载主题设置
     * @returns {string} 主题名称，默认 'dark'
     */
    loadTheme() {
        return Storage.load(STORAGE_KEYS.THEME, 'dark');
    },

    /**
     * 保存最后播放的歌曲
     * @param {Object} track - {song, artist, album}
     */
    saveLastPlayed(track) {
        Storage.save(STORAGE_KEYS.LAST_PLAYED, {
            ...track,
            playedAt: new Date().toISOString()
        });
    },

    /**
     * 加载最后播放的歌曲
     * @returns {Object|null} 最后播放的信息
     */
    loadLastPlayed() {
        return Storage.load(STORAGE_KEYS.LAST_PLAYED, null);
    },

    /**
     * 记录播放次数
     * @param {string} song - 歌曲名
     * @param {string} artist - 艺术家
     */
    incrementPlayCount(song, artist) {
        const key = `play_count_${artist}_${song}`;
        const count = Storage.load(key, 0);
        Storage.save(key, count + 1);
    },

    /**
     * 获取播放次数
     * @param {string} song - 歌曲名
     * @param {string} artist - 艺术家
     * @returns {number} 播放次数
     */
    getPlayCount(song, artist) {
        const key = `play_count_${artist}_${song}`;
        return Storage.load(key, 0);
    },

    // 保存雪花/氛围特效开关状态
    saveAtmosphere(enabled) {
        Storage.save(STORAGE_KEYS.ATMOSPHERE, enabled);
    },

    // 加载雪花/氛围特效开关状态（默认关闭）
    loadAtmosphere() {
        return Storage.load(STORAGE_KEYS.ATMOSPHERE, false);
    }
};

// ==================== 数据迁移 ====================
/**
 * 当用户登录时，将游客数据迁移到用户账号
 */
function migrateGuestDataToUser(user) {
    console.log('🔄 开始迁移游客数据到用户账号:', user.name);

    // 备份游客数据
    const guestData = {
        volume: Settings.loadVolume(),
        playMode: Settings.loadPlayMode(),
        favorites: Settings.loadFavorites(),
        lyricsOffset: Settings.loadLyricsOffset(),
        theme: Settings.loadTheme()
    };

    // 切换到用户模式
    UserState.setCurrentUser(user);

    // 恢复数据到用户空间
    Settings.saveVolume(guestData.volume);
    Settings.savePlayMode(guestData.playMode);
    Settings.saveFavorites(guestData.favorites);
    Settings.saveLyricsOffset(guestData.lyricsOffset);
    Settings.saveTheme(guestData.theme);

    console.log('✓ 数据迁移完成');
    return guestData;
}

/**
 * 当用户登出时，清理用户数据
 */
function clearUserData() {
    Storage.clear();
    UserState.setCurrentUser(null);
    console.log('✓ 用户数据已清除');
}

// ==================== 初始化 ====================
/**
 * 初始化存储模块
 */
function initStorage() {
    // 检查是否有保存的用户信息
    const user = UserState.getCurrentUser();
    if (user) {
        console.log('✓ 已登录用户:', user.name);
    } else {
        console.log('✓ 游客模式');
    }

    // 输出当前存储的所有数据
    const prefix = UserState.getStoragePrefix();
    console.log('📋 当前存储的数据:');
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
            const value = localStorage.getItem(key);
            const shortKey = key.replace(prefix, '');
            console.log(`  - ${shortKey}:`, value.substring(0, 100) + (value.length > 100 ? '...' : ''));
        }
    }
}

// ==================== 导出 ====================
// 导出到全局
window.UserState = UserState;
window.Storage = Storage;
window.Settings = Settings;
window.STORAGE_KEYS = STORAGE_KEYS;
window.migrateGuestDataToUser = migrateGuestDataToUser;
window.clearUserData = clearUserData;
window.initStorage = initStorage;

console.log('✅ Storage 模块已导出到 window');
