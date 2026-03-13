/**
 * 图片懒加载模块
 * 使用 Intersection Observer API 实现图片懒加载
 * 支持占位图、加载状态、错误处理
 */

console.log('🖼️ lazy-loader.js 已加载');

// ==================== 配置 ====================
const LAZY_LOAD_CONFIG = {
    // 触发加载的阈值（0-1，0表示只要有一点进入视野就加载）
    threshold: 0.01,
    // 根边距，提前多少像素开始加载（格式："top right bottom left"）
    rootMargin: '50px',
    // 占位图
    placeholder: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjMjIyIi8+PC9zdmc+',
    // 错误占位图
    errorPlaceholder: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjMzMzIi8+PHRleHQgeD0iMjAiIHk9IjI1IiBmb250LXNpemU9IjEwIiBmaWxsPSIjNjY2IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj7wn5OHPC90ZXh0Pjwvc3ZnPg=='
};

// ==================== Intersection Observer ====================
let lazyLoadObserver = null;

/**
 * 初始化懒加载观察器
 */
function initLazyLoadObserver() {
    // 检查浏览器支持
    if (!('IntersectionObserver' in window)) {
        console.warn('浏览器不支持 Intersection Observer，使用备用方案');
        // 降级方案：直接加载所有图片
        loadAllImagesImmediately();
        return;
    }

    lazyLoadObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            // 当图片进入视野
            if (entry.isIntersecting) {
                const img = entry.target;
                loadImage(img);
                // 加载后停止观察
                lazyLoadObserver.unobserve(img);
            }
        });
    }, {
        threshold: LAZY_LOAD_CONFIG.threshold,
        rootMargin: LAZY_LOAD_CONFIG.rootMargin
    });

    console.log('✓ 懒加载观察器已初始化');
}

/**
 * 立即加载所有图片（降级方案）
 */
function loadAllImagesImmediately() {
    const images = document.querySelectorAll('img[data-src]');
    images.forEach(img => loadImage(img));
}

/**
 * 加载单张图片
 * @param {HTMLImageElement} img - 图片元素
 */
function loadImage(img) {
    // 如果已经在加载中或已加载，跳过
    if (img.dataset.loaded === 'true' || img.dataset.loading === 'true') {
        return;
    }

    // 标记为加载中
    img.dataset.loading = 'true';

    // 获取真实的图片 URL
    let src = img.dataset.src;
    if (!src) {
        console.warn('图片没有 data-src 属性', img);
        img.dataset.loading = 'false';
        return;
    }

    // [New] 增加对 API_BASE 的支持 (适配 MOODY V2 远程/离线模式)
    if (!src.startsWith('http') && !src.startsWith('data:') && !src.startsWith('blob:') && typeof API_BASE !== 'undefined') {
        src = src.startsWith('/') ? API_BASE + src : API_BASE + '/' + src;
    }

    if (!src) {

    // 添加加载中的样式
    img.classList.add('lazy-loading');

    // 创建一个新的 Image 对象来预加载
    const tempImg = new Image();

    tempImg.onload = () => {
        // 加载成功
        img.src = src;
        img.dataset.loaded = 'true';
        img.dataset.loading = 'false';
        img.classList.remove('lazy-loading');
        img.classList.add('lazy-loaded');
        // 显式强制移除 filter（针对那些转场过慢的情况）
        img.style.filter = 'none';
        console.log(`✓ 图片加载成功: ${src.substring(0, 50)}...`);
    };

    tempImg.onerror = () => {
        // 加载失败
        console.error(`✗ 图片加载失败: ${src}`);
        img.dataset.loading = 'false';
        img.classList.remove('lazy-loading');
        img.classList.add('lazy-error');

        // 根据图片类型显示不同的错误占位图
        if (img.dataset.fallback) {
            // 使用指定的备用图
            img.src = img.dataset.fallback;
        } else {
            // 使用默认错误占位图
            img.src = LAZY_LOAD_CONFIG.errorPlaceholder;
        }
    };

    // 开始加载
    tempImg.src = src;
}

// ==================== API ====================

/**
 * 观察一个图片元素（开始懒加载）
 * @param {HTMLImageElement} img - 图片元素
 */
function observeImage(img) {
    if (!img || !img.dataset.src) {
        return;
    }

    // 设置初始占位图
    if (!img.src || img.src === window.location.href) {
        img.src = LAZY_LOAD_CONFIG.placeholder;
    }

    // 如果观察器已初始化，开始观察
    if (lazyLoadObserver) {
        lazyLoadObserver.observe(img);
    } else {
        // 否则直接加载
        loadImage(img);
    }
}

/**
 * 批量观察图片元素
 * @param {NodeList|Array} images - 图片元素列表
 */
function observeImages(images) {
    if (!images || images.length === 0) {
        return;
    }

    images.forEach(img => observeImage(img));
    console.log(`✓ 开始观察 ${images.length} 张图片`);
}

/**
 * 立即加载指定图片（跳过懒加载）
 * @param {HTMLImageElement} img - 图片元素
 */
function loadImageImmediately(img) {
    if (!img) return;

    // 如果正在被观察，先停止观察
    if (lazyLoadObserver) {
        lazyLoadObserver.unobserve(img);
    }

    loadImage(img);
}

/**
 * 重新初始化懒加载（用于动态添加的图片）
 */
function refreshLazyLoad() {
    // 查找所有带有 data-src 但未加载的图片
    const images = document.querySelectorAll('img[data-src]:not([data-loaded="true"])');
    observeImages(images);
}

/**
 * 销毁懒加载观察器
 */
function destroyLazyLoadObserver() {
    if (lazyLoadObserver) {
        lazyLoadObserver.disconnect();
        lazyLoadObserver = null;
        console.log('✓ 懒加载观察器已销毁');
    }
}

// ==================== 自动初始化 ====================

// DOM 加载完成后自动初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initLazyLoadObserver();
        refreshLazyLoad();
    });
} else {
    // DOM 已经加载完成
    initLazyLoadObserver();
    refreshLazyLoad();
}

// ==================== 导出 ====================
window.LazyLoader = {
    init: initLazyLoadObserver,
    observe: observeImage,
    observeMany: observeImages,
    loadImmediately: loadImageImmediately,
    refresh: refreshLazyLoad,
    destroy: destroyLazyLoadObserver,
    config: LAZY_LOAD_CONFIG
};

console.log('✅ LazyLoader 模块已导出到 window.LazyLoader');
