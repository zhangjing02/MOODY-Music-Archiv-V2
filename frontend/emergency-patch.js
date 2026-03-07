// ==================== EMERGENCY PATCH FOR MOODY ====================
// 这个脚本直接修复音频播放问题
// 在开发者控制台运行此脚本

console.log('[PATCH] 开始应用紧急修复...');

// 1. 检查当前数据状态
console.log('[PATCH] 当前 allArtistsData:', window.allArtistsData);

// 2. 如果是Mock数据，但后端有数据，强制重新加载
async function forceReloadBackendData() {
    try {
        console.log('[PATCH] 强制从后端重新加载数据...');
        const response = await fetch('/api/songs');
        const data = await response.json();

        console.log('[PATCH] 后端数据:', data);

        // 直接替换全局数据
        window.allArtistsData = data;

        console.log('[PATCH] ✓ 数据已替换');

        // 重新渲染UI
        if (typeof filterAndRender === 'function') {
            filterAndRender();
            console.log('[PATCH] ✓ UI已刷新');
        }

        return true;
    } catch (e) {
        console.error('[PATCH] 加载失败:', e);
        return false;
    }
}

// 3. 修补播放器逻辑
if (window.audioPlayer && window.audioPlayer.playAlbum) {
    const originalPlayAlbum = window.audioPlayer.playAlbum;

    window.audioPlayer.playAlbum = async function (songs, artist, albumInfo, startSongIndex) {
        console.log('[PATCH] playAlbum 被调用, songs:', songs);

        // 检查歌曲数据类型
        if (songs && songs.length > 0) {
            const firstSong = songs[0];
            console.log('[PATCH] 第一首歌数据类型:', typeof firstSong);
            console.log('[PATCH] 第一首歌内容:', firstSong);

            if (typeof firstSong === 'string') {
                console.warn('[PATCH] 检测到字符串数组 - 这是Mock数据!');
                console.log('[PATCH] 尝试重新加载后端数据...');

                const reloaded = await forceReloadBackendData();
                if (reloaded) {
                    // 重新获取当前艺术家和专辑的数据
                    const newArtist = window.allArtistsData.find(a => a.name === artist);
                    if (newArtist) {
                        const newAlbum = newArtist.albums.find(alb => alb.title === albumInfo.title);
                        if (newAlbum) {
                            console.log('[PATCH] ✓ 找到了后端数据，使用新的songs数组');
                            songs = newAlbum.songs;
                        }
                    }
                }
            }
        }

        // 调用原始函数
        return originalPlayAlbum.call(this, songs, artist, albumInfo, startSongIndex);
    };

    console.log('[PATCH] ✓ playAlbum 已打补丁');
}

// 4. 立即尝试重新加载
forceReloadBackendData().then(success => {
    if (success) {
        console.log('[PATCH] ====================');
        console.log('[PATCH] 修复完成！');
        console.log('[PATCH] 请点击一首歌曲测试');
        console.log('[PATCH] ====================');
    }
});

// 导出修复函数供手动调用
window.MOODY_PATCH = {
    reload: forceReloadBackendData,
    getData: () => window.allArtistsData
};

console.log('[PATCH] 可用命令:');
console.log('[PATCH]   MOODY_PATCH.reload() - 重新加载后端数据');
console.log('[PATCH]   MOODY_PATCH.getData() - 查看当前数据');
