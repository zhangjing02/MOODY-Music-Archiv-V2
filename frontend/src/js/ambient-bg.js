/**
 * MOODY MUSIC - 微动画环境氛围与黑胶屏保系统 (ambient-bg.js)
 * 核心逻辑：
 * 1. 常态下完全保持纯净黑胶暗黑界面，不显示任何半透明视频背景，零 GPU 开销
 * 2. 仅在音乐【正在播放中】且鼠标闲置 30 秒时，自动唤醒「沉浸黑胶巨幕屏保 (Zen Mode)」
 * 3. 退出屏保时立即暂停微动视频解码，切回纯粹暗黑界面
 * 4. 侧边栏底部保留场景切换 Dock，方便随时切换喜欢的素材，并可一键手动预览屏保
 */

(function () {
    'use strict';

    // ==================== 微动画素材配置 ====================
    // 支持未来部署时自由切换 CDN / 远端对象存储 (如 'https://cdn.yourdomain.com/video/')
    const VIDEO_BASE = window.AMBIENT_VIDEO_BASE_URL || 'src/assets/video/';

    const AMBIENT_SCENES = {
        ocean: {
            id: 'ocean',
            name: '深海荧光',
            desc: '静谧荧光水母与深蓝洋流',
            icon: '🌊',
            file: VIDEO_BASE + 'ocean.webm'
        },
        shinjuku: {
            id: 'shinjuku',
            name: '新宿雨夜',
            desc: '新宿街头真实长镜头车水马龙 (5分钟不重复实录)',
            icon: '🌧️',
            file: VIDEO_BASE + 'shinjuku.mp4'
        },
        cozy_rain: {
            id: 'cozy_rain',
            name: '极简雨窗',
            desc: '纯净微雨划过玻璃窗棂',
            icon: '☕',
            file: VIDEO_BASE + 'cozy_rain.webm'
        },
        cafe_rain: {
            id: 'cafe_rain',
            name: '街角咖啡',
            desc: '复古暖灯与街道雨景',
            icon: '🍂',
            file: VIDEO_BASE + 'cafe_rain.webm'
        },
        none: {
            id: 'none',
            name: '纯黑胶暗色',
            desc: '关闭微动，极致静谧',
            icon: '🚫',
            file: null
        }
    };

    const SCENE_KEYS = ['ocean', 'shinjuku', 'cozy_rain', 'cafe_rain'];

    // ==================== 全局状态管理 ====================
    let currentSceneId = 'ocean';
    let isZenMode = false;
    let autoZenEnabled = true;
    let idleTimer = null;
    let zenHudTimer = null;
    let lastTrackIdOrSrc = null;
    const IDLE_TIMEOUT = 30000; // 播放中闲置 30 秒切入黑胶屏保

    // DOM 元素缓存
    const dom = {
        videoContainer: null,
        video: null,
        switchDock: null,
        switchBtn: null,
        sbAmbIcon: null,
        sbAmbCurrentName: null,
        switchMenu: null,
        menuItems: null,
        zenModeQuickBtn: null,
        autoZenCheck: null,
        zenOverlay: null,
        zenScenePills: null,
        zenExitBtn: null,
        zenVinylDisc: null,
        zenVinylCover: null,
        zenTonearm: null,
        zenTrackAlbum: null,
        zenTrackTitle: null,
        zenTrackArtist: null,
        zenLyricsContainer: null,
        zenCurrentTime: null,
        zenProgressBar: null,
        zenProgressFill: null,
        zenDurationTime: null,
        zenPrevBtn: null,
        zenPlayPauseBtn: null,
        zenPlayIcon: null,
        zenPauseIcon: null,
        zenNextBtn: null
    };

    /**
     * 辅助时间格式化
     */
    function formatTime(secs) {
        if (!secs || isNaN(secs) || secs < 0) return '00:00';
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }

    /**
     * 初始化环境氛围系统
     */
    function initAmbientSystem() {
        cacheDOMElements();
        if (!dom.video) return;

        // 确保静音及行内播放属性
        dom.video.muted = true;
        dom.video.defaultMuted = true;
        dom.video.playsInline = true;

        // 1. 初始化素材：如果用户从未手动选过，先随机挑选一个预设
        let savedScene = localStorage.getItem('moody_ambient_scene');
        if (!savedScene || !AMBIENT_SCENES[savedScene]) {
            const randomIdx = Math.floor(Math.random() * SCENE_KEYS.length);
            savedScene = SCENE_KEYS[randomIdx];
            console.log(`[Ambient] 首次启动预设微动背景: ${savedScene}`);
        }
        currentSceneId = savedScene;

        // 2. 自动屏保开关 (默认开启)
        const savedAutoZen = localStorage.getItem('moody_auto_zen');
        autoZenEnabled = savedAutoZen !== 'false';
        if (dom.autoZenCheck) dom.autoZenCheck.checked = autoZenEnabled;

        // 3. 构建切换菜单与屏保内快捷 Pills
        renderSwitchMenu();
        renderZenScenePills();

        // 4. 应用背景场景 (常态下保持 pause，不耗能)
        applyScene(currentSceneId, false);

        // 5. 绑定事件与闲置监听
        bindEvents();

        // 6. 挂载全局对象
        window.AmbientBg = {
            switchScene: (id) => applyScene(id, true),
            enterZen: enterZenMode,
            exitZen: exitZenMode,
            toggleZen: toggleZenMode,
            getCurrentScene: () => AMBIENT_SCENES[currentSceneId]
        };

        console.log('✓ 微动屏保系统就绪 (已设为仅在播放时休眠唤醒)');
    }

    /**
     * 缓存 DOM 元素
     */
    function cacheDOMElements() {
        dom.videoContainer = document.getElementById('ambientBgContainer');
        dom.video = document.getElementById('ambientVideo');
        dom.switchDock = document.getElementById('sidebarAmbientDock');
        dom.switchBtn = document.getElementById('bgSwitchBtn');
        dom.sbAmbIcon = document.getElementById('sbAmbIcon');
        dom.sbAmbCurrentName = document.getElementById('sbAmbCurrentName');
        dom.switchMenu = document.getElementById('bgSwitchMenu');
        dom.menuItems = document.getElementById('bgMenuItems');
        dom.zenModeQuickBtn = document.getElementById('zenModeQuickBtn');
        dom.autoZenCheck = document.getElementById('autoZenCheckbox');
        dom.zenOverlay = document.getElementById('zenOverlay');
        dom.zenScenePills = document.getElementById('zenScenePills');
        dom.zenExitBtn = document.getElementById('zenExitBtn');
        dom.zenVinylDisc = document.getElementById('zenVinylDisc');
        dom.zenVinylCover = document.getElementById('zenVinylCover');
        dom.zenTonearm = document.getElementById('zenTonearm');
        dom.zenTrackTitle = document.getElementById('zenTrackTitle');
        dom.zenLyricsWrapper = document.querySelector('.zen-lyrics-wrapper');
        dom.zenLyricsContainer = document.getElementById('zenLyricsContainer');
        dom.zenCurrentTime = document.getElementById('zenCurrentTime');
        dom.zenProgressBar = document.getElementById('zenProgressBar');
        dom.zenProgressFill = document.getElementById('zenProgressFill');
        dom.zenDurationTime = document.getElementById('zenDurationTime');
        dom.zenPrevBtn = document.getElementById('zenPrevBtn');
        dom.zenPlayPauseBtn = document.getElementById('zenPlayPauseBtn');
        dom.zenPlayIcon = document.getElementById('zenPlayIcon');
        dom.zenPauseIcon = document.getElementById('zenPauseIcon');
        dom.zenNextBtn = document.getElementById('zenNextBtn');
    }

    /**
     * 渲染浮动菜单中的背景选项
     */
    function renderSwitchMenu() {
        if (!dom.menuItems) return;
        dom.menuItems.innerHTML = Object.values(AMBIENT_SCENES).map(scene => `
            <button class="bg-menu-item ${scene.id === currentSceneId ? 'active' : ''}" data-scene="${scene.id}">
                <div class="bg-item-left">
                    <span class="bg-item-icon">${scene.icon}</span>
                    <div class="bg-item-meta">
                        <span class="bg-item-name">${scene.name}</span>
                        <span class="bg-item-desc">${scene.desc}</span>
                    </div>
                </div>
                <span class="bg-item-check">✓</span>
            </button>
        `).join('');

        dom.menuItems.querySelectorAll('.bg-menu-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const sceneId = btn.getAttribute('data-scene');
                applyScene(sceneId, true);
                closeSwitchMenu();
            });
        });
    }

    /**
     * 渲染 Zen Mode 顶部的快捷场景切换 Pills
     */
    function renderZenScenePills() {
        if (!dom.zenScenePills) return;
        dom.zenScenePills.innerHTML = Object.values(AMBIENT_SCENES).map(scene => `
            <button class="zen-pill-btn ${scene.id === currentSceneId ? 'active' : ''}" data-scene="${scene.id}" title="${scene.desc}">
                ${scene.icon} ${scene.name}
            </button>
        `).join('');

        dom.zenScenePills.querySelectorAll('.zen-pill-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const sceneId = btn.getAttribute('data-scene');
                applyScene(sceneId, true);
                showZenHud(3500);
            });
        });
    }

    /**
     * 应用场景
     */
    function applyScene(sceneId, save = true) {
        const scene = AMBIENT_SCENES[sceneId];
        if (!scene) return;
        currentSceneId = sceneId;

        if (save) {
            localStorage.setItem('moody_ambient_scene', sceneId);
        }

        // 切换视频源
        if (scene.file) {
            dom.video.style.display = 'block';
            if (dom.video.getAttribute('data-loaded-scene') !== sceneId) {
                dom.video.setAttribute('data-loaded-scene', sceneId);
                dom.video.src = scene.file;
                dom.video.muted = true;
                dom.video.load();
                // 仅在屏保激活状态下才启动解码播放，常态下保持 pause
                if (isZenMode) {
                    dom.video.play().catch(() => {});
                } else {
                    dom.video.pause();
                }
            }
        } else {
            // 'none' 纯黑胶暗色
            dom.video.removeAttribute('data-loaded-scene');
            dom.video.pause();
            dom.video.style.display = 'none';
        }

        // 更新侧边栏底部 Dock 的名称和图标
        if (dom.sbAmbIcon) dom.sbAmbIcon.textContent = scene.icon;
        if (dom.sbAmbCurrentName) dom.sbAmbCurrentName.textContent = scene.name;

        // 更新菜单项与 Pills 的高亮
        if (dom.menuItems) {
            dom.menuItems.querySelectorAll('.bg-menu-item').forEach(el => {
                el.classList.toggle('active', el.getAttribute('data-scene') === sceneId);
            });
        }
        if (dom.zenScenePills) {
            dom.zenScenePills.querySelectorAll('.zen-pill-btn').forEach(el => {
                el.classList.toggle('active', el.getAttribute('data-scene') === sceneId);
            });
        }
    }

    /**
     * 展开/收起背景菜单
     */
    function toggleSwitchMenu(e) {
        if (e) e.stopPropagation();
        if (!dom.switchMenu || !dom.switchDock) return;
        const isOpen = dom.switchMenu.classList.contains('active');
        if (isOpen) {
            closeSwitchMenu();
        } else {
            dom.switchDock.classList.add('open');
            dom.switchMenu.classList.add('active');
        }
    }

    function closeSwitchMenu() {
        if (dom.switchDock) dom.switchDock.classList.remove('open');
        if (dom.switchMenu) dom.switchMenu.classList.remove('active');
    }

    /**
     * 唤醒并保持 Zen HUD
     */
    function showZenHud(duration = 3500) {
        if (!isZenMode || !dom.zenOverlay) return;
        dom.zenOverlay.classList.add('zen-show-hud');
        clearTimeout(zenHudTimer);
        zenHudTimer = setTimeout(() => {
            if (isZenMode && dom.zenOverlay) {
                dom.zenOverlay.classList.remove('zen-show-hud');
            }
        }, duration);
    }

    /**
     * 进入 Zen Mode (黑胶沉浸屏保)
     */
    function enterZenMode() {
        if (isZenMode) return;
        isZenMode = true;
        document.body.classList.add('zen-active');
        closeSwitchMenu();

        // 默认先浮现一次 HUD，4秒后隐去
        showZenHud(4000);

        // 同步当前曲目、封面、歌词与播放状态
        syncZenStateWithPlayer(true);

        // 唤醒微动画视频解码播放
        if (currentSceneId !== 'none' && dom.video) {
            dom.video.muted = true;
            dom.video.play().catch(() => {});
        }
    }

    /**
     * 退出 Zen Mode
     */
    function exitZenMode() {
        if (!isZenMode) return;
        isZenMode = false;
        document.body.classList.remove('zen-active');
        clearTimeout(zenHudTimer);
        if (dom.zenOverlay) dom.zenOverlay.classList.remove('zen-show-hud');

        // 退出屏保后，立即暂停微动画视频，释放 GPU/CPU
        if (dom.video) {
            dom.video.pause();
        }

        // 退出后重新启动闲置计时器
        resetIdleTimer();
    }

    /**
     * 切换 Zen Mode
     */
    function toggleZenMode() {
        if (isZenMode) {
            exitZenMode();
        } else {
            enterZenMode();
        }
    }

    /**
     * 重置闲置计时器 (恢复为：仅当音乐【正在播放】时才触发屏保)
     */
    function resetIdleTimer() {
        clearTimeout(idleTimer);
        if (!autoZenEnabled || isZenMode) return;

        // 仅在音乐处于播放状态时，闲置计时才生效
        const audio = document.getElementById('audioPlayer');
        const isPlaying = audio && !audio.paused && window.playerState && window.playerState.isPlaying;
        if (!isPlaying) return;

        idleTimer = setTimeout(() => {
            const audioNow = document.getElementById('audioPlayer');
            const isPlayingNow = audioNow && !audioNow.paused && window.playerState && window.playerState.isPlaying;
            if (isPlayingNow && autoZenEnabled && !isZenMode) {
                console.log('[Zen Mode] 播放中闲置 30 秒，切入黑胶沉浸屏保');
                enterZenMode();
            }
        }, IDLE_TIMEOUT);
    }

    /**
     * 同步 Zen Mode 界面与播放器数据
     */
    function syncZenStateWithPlayer(forceLyricsRebuild = false) {
        const audio = document.getElementById('audioPlayer');
        const state = window.playerState || {};
        const isPlaying = audio && !audio.paused;

        // 1. 同步黑胶转动与唱针
        if (dom.zenVinylDisc) {
            dom.zenVinylDisc.classList.toggle('playing', isPlaying);
        }

        // 2. 同步播放/暂停按钮图标
        if (dom.zenPlayIcon && dom.zenPauseIcon) {
            dom.zenPlayIcon.style.display = isPlaying ? 'none' : 'block';
            dom.zenPauseIcon.style.display = isPlaying ? 'block' : 'none';
        }

        // 3. 同步封面
        const vCover = document.getElementById('vCover');
        const pThumb = document.getElementById('pThumb');
        let coverSrc = '';
        if (pThumb && pThumb.src && !pThumb.src.endsWith('/')) {
            coverSrc = pThumb.src;
        } else if (vCover && vCover.src && !vCover.src.endsWith('/') && vCover.style.display !== 'none') {
            coverSrc = vCover.src;
        }
        if (dom.zenVinylCover && coverSrc && dom.zenVinylCover.src !== coverSrc) {
            dom.zenVinylCover.src = coverSrc;
        }

        // 4. 同步歌曲信息
        const vTitle = document.getElementById('vTitle');
        const vMeta = document.getElementById('vMeta');
        const pTitleOverlay = document.getElementById('pTitleOverlay');

        let songTitle = 'MOODY';
        if (state.currentSong?.title) {
            songTitle = state.currentSong.title;
        } else if (pTitleOverlay && pTitleOverlay.textContent && pTitleOverlay.textContent !== 'No Track Playing') {
            songTitle = pTitleOverlay.textContent;
        } else if (vTitle && vTitle.textContent && vTitle.textContent !== 'Select Artist') {
            songTitle = vTitle.textContent;
        }

        // 仅显示歌名：剥离后缀 " - 歌手名" 以及可能携带的连字符
        if (songTitle.includes(' - ')) {
            songTitle = songTitle.split(' - ')[0].trim();
        } else if (songTitle.includes(' — ')) {
            songTitle = songTitle.split(' — ')[0].trim();
        }

        if (dom.zenTrackTitle) dom.zenTrackTitle.textContent = songTitle;

        // 5. 同步时间与进度条
        if (audio && audio.duration) {
            const cur = audio.currentTime || 0;
            const dur = audio.duration || 0;
            if (dom.zenCurrentTime) dom.zenCurrentTime.textContent = formatTime(cur);
            if (dom.zenDurationTime) dom.zenDurationTime.textContent = formatTime(dur);
            if (dom.zenProgressFill) dom.zenProgressFill.style.width = `${Math.min(100, (cur / dur) * 100)}%`;
        }

        // 6. 重构歌词列表
        const currentSrc = audio ? audio.src : '';
        if (forceLyricsRebuild || currentSrc !== lastTrackIdOrSrc) {
            lastTrackIdOrSrc = currentSrc;
            buildZenLyrics();
        }

        // 7. 高亮并滚动当前歌词行
        syncZenLyricsHighlight();
    }

    /**
     * 生成 Zen Mode 中的大歌词 DOM
     */
    function buildZenLyrics() {
        if (!dom.zenLyricsContainer) return;
        const lyricsSync = window.LyricsSync;
        if (!lyricsSync || !lyricsSync.currentLyrics || lyricsSync.currentLyrics.length === 0) {
            dom.zenLyricsContainer.innerHTML = '';
            if (dom.zenLyricsWrapper) dom.zenLyricsWrapper.style.display = 'none';
            return;
        }
        if (dom.zenLyricsWrapper) dom.zenLyricsWrapper.style.display = 'block';

        dom.zenLyricsContainer.innerHTML = lyricsSync.currentLyrics.map((line, idx) => `
            <div class="zen-lyric-line" data-index="${idx}" data-time="${line.time}">
                ${line.text}
            </div>
        `).join('');

        // 点击歌词跳转
        dom.zenLyricsContainer.querySelectorAll('.zen-lyric-line').forEach(lineEl => {
            lineEl.addEventListener('click', (e) => {
                e.stopPropagation();
                const targetTime = parseFloat(lineEl.getAttribute('data-time'));
                const audio = document.getElementById('audioPlayer');
                if (audio && !isNaN(targetTime)) {
                    audio.currentTime = targetTime;
                }
            });
        });
    }

    /**
     * 同步歌词高亮与平滑滚动
     */
    function syncZenLyricsHighlight() {
        if (!isZenMode || !dom.zenLyricsContainer) return;
        const lyricsSync = window.LyricsSync;
        if (!lyricsSync || !lyricsSync.currentLyrics) return;

        const activeIndex = lyricsSync.currentIndex;
        const lines = dom.zenLyricsContainer.querySelectorAll('.zen-lyric-line');
        if (lines.length === 0) return;

        let activeLine = null;
        lines.forEach((line, i) => {
            if (i === activeIndex) {
                line.classList.add('active');
                activeLine = line;
            } else {
                line.classList.remove('active');
            }
        });

        if (activeLine) {
            const container = dom.zenLyricsContainer;
            const containerHeight = container.offsetHeight;
            const lineTop = activeLine.offsetTop;
            const lineHeight = activeLine.offsetHeight;
            const targetScrollTop = lineTop - containerHeight / 2 + lineHeight / 2;

            container.scrollTo({
                top: targetScrollTop,
                behavior: 'smooth'
            });
        }
    }

    /**
     * 绑定各类用户与系统交互事件
     */
    function bindEvents() {
        // --- 1. 侧边栏底部 Dock 点击开关 ---
        if (dom.switchBtn) {
            dom.switchBtn.addEventListener('click', toggleSwitchMenu);
        }

        // 点击外部关闭菜单
        document.addEventListener('click', (e) => {
            if (dom.switchDock && !dom.switchDock.contains(e.target)) {
                closeSwitchMenu();
            }
        });

        // 菜单内立即进入屏保按钮
        if (dom.zenModeQuickBtn) {
            dom.zenModeQuickBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                enterZenMode();
            });
        }

        // 自动屏保复选框
        if (dom.autoZenCheck) {
            dom.autoZenCheck.addEventListener('change', (e) => {
                autoZenEnabled = e.target.checked;
                localStorage.setItem('moody_auto_zen', autoZenEnabled ? 'true' : 'false');
                resetIdleTimer();
            });
        }

        // --- 2. Zen Mode 退出按钮 ---
        if (dom.zenExitBtn) {
            dom.zenExitBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                exitZenMode();
            });
        }

        // --- 3. 点击 Zen 遮罩空白区域退出 ---
        if (dom.zenOverlay) {
            dom.zenOverlay.addEventListener('click', (e) => {
                if (e.target.closest('button') || e.target.closest('.zen-progress-bar') || e.target.closest('.zen-lyric-line') || e.target.closest('.zen-scene-pills')) {
                    return;
                }
                exitZenMode();
            });
        }

        // --- 4. Zen Mode 下的播放控制 ---
        if (dom.zenPlayPauseBtn) {
            dom.zenPlayPauseBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const playBtn = document.getElementById('playPauseBtn');
                if (playBtn) playBtn.click();
            });
        }
        if (dom.zenPrevBtn) {
            dom.zenPrevBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const prevBtn = document.getElementById('prevBtn');
                if (prevBtn) prevBtn.click();
            });
        }
        if (dom.zenNextBtn) {
            dom.zenNextBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const nextBtn = document.getElementById('nextBtn');
                if (nextBtn) nextBtn.click();
            });
        }

        // 进度条拖动/点击寻道
        if (dom.zenProgressBar) {
            dom.zenProgressBar.addEventListener('click', (e) => {
                e.stopPropagation();
                const rect = dom.zenProgressBar.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const pct = Math.max(0, Math.min(1, clickX / rect.width));
                const audio = document.getElementById('audioPlayer');
                if (audio && audio.duration) {
                    audio.currentTime = pct * audio.duration;
                }
            });
        }

        // --- 5. 全局键盘快捷键 ---
        document.addEventListener('keydown', (e) => {
            if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

            // Z 或 z：一键切换屏保模式
            if (e.key === 'z' || e.key === 'Z') {
                e.preventDefault();
                toggleZenMode();
                return;
            }

            // Esc：如果在 Zen Mode，快速退出
            if (e.key === 'Escape' && isZenMode) {
                e.preventDefault();
                exitZenMode();
                return;
            }

            // 空格键：在 Zen Mode 下也可切换播放/暂停
            if (e.key === ' ' && isZenMode) {
                e.preventDefault();
                const playBtn = document.getElementById('playPauseBtn');
                if (playBtn) playBtn.click();
                showZenHud(3500);
            }
        });

        // --- 6. 用户闲置与鼠标移动探测 ---
        const handleUserActivity = () => {
            if (isZenMode) {
                showZenHud(3500);
            } else {
                resetIdleTimer();
            }
        };

        ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach(evtName => {
            window.addEventListener(evtName, handleUserActivity, { passive: true });
        });

        // --- 7. 监听音频播放器事件 ---
        const audio = document.getElementById('audioPlayer');
        if (audio) {
            audio.addEventListener('play', () => {
                resetIdleTimer();
                if (isZenMode) {
                    syncZenStateWithPlayer();
                    if (currentSceneId !== 'none' && dom.video) dom.video.play().catch(() => {});
                }
            });
            audio.addEventListener('pause', () => {
                clearTimeout(idleTimer);
                if (isZenMode) {
                    syncZenStateWithPlayer();
                }
            });
            audio.addEventListener('timeupdate', () => {
                if (isZenMode) {
                    syncZenStateWithPlayer();
                }
            });
            audio.addEventListener('ended', () => {
                if (isZenMode) {
                    syncZenStateWithPlayer();
                }
            });
        }

        // --- 8. 智能节电：浏览器后台 Tab 切换时暂停微动背景 ---
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                if (dom.video) dom.video.pause();
            } else {
                if (isZenMode && currentSceneId !== 'none' && dom.video && dom.video.paused) {
                    dom.video.play().catch(() => {});
                }
            }
        });

        // 启动初始计时器
        resetIdleTimer();
    }

    // 页面就绪后自启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAmbientSystem);
    } else {
        initAmbientSystem();
    }

})();
