/**
 * MOODY CMS 管理后台配置中心 (Single Source of Truth)
 * 由 scripts/switch-domain.js 自动生成与维护
 */
(function() {
    if (!window.MOODY_CONFIG) {
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        window.MOODY_CONFIG = {
            API_BASE: isLocal ? 'http://127.0.0.1:8787' : 'https://m-api.changgepd.ccwu.cc',
            R2_BASE: 'https://r2.changgepd.ccwu.cc'
        };
        window.API_BASE = window.MOODY_CONFIG.API_BASE;
    }
})();
