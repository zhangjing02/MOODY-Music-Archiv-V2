console.log('[DEBUG] 开始初始化应用...');

// 创建一个全局调试对象
window.DEBUG_INFO = {
    backendDataLoaded: false,
    mockDataUsed: false,
    artistCount: 0,
    firstArtist: null,
    firstSong: null
};

async function initApp() {
    console.log('[DEBUG] initApp 函数开始执行');

    // 1. 尝试从后端加载数据
    try {
        console.log('[DEBUG] 正在从后端加载音乐库...');
        const response = await fetch('/api/songs');
        console.log('[DEBUG] API响应状态:', response.status);

        if (response.ok) {
            let backendData = await response.json();
            console.log('[DEBUG] 后端响应原始数据:', backendData);
            console.log('[DEBUG] 数据类型:', typeof backendData, 'isArray:', Array.isArray(backendData));

            // 兼容包装数据
            if (backendData && !Array.isArray(backendData) && Array.isArray(backendData.value)) {
                console.log('[DEBUG] 检测到包装数据，提取 value 字段');
                backendData = backendData.value;
            }

            if (Array.isArray(backendData) && backendData.length > 0) {
                allArtistsData = backendData;
                window.DEBUG_INFO.backendDataLoaded = true;
                window.DEBUG_INFO.artistCount = allArtistsData.length;
                window.DEBUG_INFO.firstArtist = allArtistsData[0];
                window.DEBUG_INFO.firstSong = allArtistsData[0]?.albums[0]?.songs[0];

                console.log('[SUCCESS] ✓ 已从后端同步', allArtistsData.length, '位艺术家');
                console.log('[DEBUG] 第一位艺术家:', allArtistsData[0]);
                console.log('[DEBUG] 第一首歌:', allArtistsData[0]?.albums[0]?.songs[0]);
            } else {
                console.warn('[WARNING] 后端音乐库无效或为空，使用 Mock 数据兜底');
                console.log('[DEBUG] 无效的 backendData:', backendData);
                allArtistsData = typeof MOCK_DB !== 'undefined' ? MOCK_DB : [];
                window.DEBUG_INFO.mockDataUsed = true;
            }
        } else {
            throw new Error(`HTTP 错误: ${response.status}`);
        }
    } catch (error) {
        console.error('[ERROR] 无法连接后端 API:', error);
        allArtistsData = typeof MOCK_DB !== 'undefined' ? MOCK_DB : [];
        window.DEBUG_INFO.mockDataUsed = true;
    }

    if (allArtistsData.length === 0) {
        console.error('[ERROR] 警告: 未加载到任何音乐数据!');
    }

    console.log('[DEBUG] 最终 allArtistsData 长度:', allArtistsData.length);
    console.log('[DEBUG] DEBUG_INFO:', window.DEBUG_INFO);

    // 2. 从 IndexedDB 加载本地上传的歌曲
    try {
        const loadedCount = await loadLocalSongsFromStorage();
        if (loadedCount > 0) {
            console.log(`[SUCCESS] ✓ 恢复了 ${loadedCount} 首本地上传歌曲`);
        }
    } catch (error) {
        console.error('[ERROR] 加载本地歌曲失败:', error);
    }

    // 3. UI 初始化
    document.addEventListener('focus', (e) => {
        if (e.target.closest('.artist-item, .st-row, .cat-chip, .tab, .act-btn, .idx-char')) {
            e.target.blur();
        }
    }, { capture: true, passive: true });

    renderCategories();
    filterAndRender();
    preloadArtistImages();

    dom.search.addEventListener('input', (e) => {
        viewState.search = e.target.value.toLowerCase();
        filterAndRender();
    });

    initDragScroll();
    initWheelScroll();

    console.log('[DEBUG] initApp 函数完成');
}
