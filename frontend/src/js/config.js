/**
 * MOODY 全局前端配置中心 (Single Source of Truth)
 * 由 scripts/switch-domain.js 自动生成与维护
 */
(function() {
    // 默认直连已部署的生产 Worker (https://m-api.changgepd.ccwu.cc)
    // 若需要调试本地 8787 端口的 Worker，可在 URL 后添加 ?env=local
    const urlParams = typeof window !== 'undefined' && window.location ? new URLSearchParams(window.location.search) : null;
    const isExplicitLocal = urlParams && urlParams.get('env') === 'local';
    
    window.MOODY_CONFIG = {
        // API 基础路径
        API_BASE: isExplicitLocal ? 'http://127.0.0.1:8787' : 'https://m-api.changgepd.ccwu.cc',
        
        // R2 对象存储基础路径
        R2_BASE: 'https://r2.changgepd.ccwu.cc'
    };

    // 兼容向后全局变量
    window.API_BASE = window.MOODY_CONFIG.API_BASE;
})();
