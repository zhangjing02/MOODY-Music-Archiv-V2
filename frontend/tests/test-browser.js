/**
 * Puppeteer 测试脚本
 * 运行前需要安装: npm install puppeteer
 * 然后运行: node test-browser.js
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const HTML_FILE = 'file:///' + path.resolve(__dirname, 'Music-Archive-Project.html').replace(/\\/g, '/');

console.log('🚀 启动浏览器测试...\n');
console.log('📄 测试文件:', HTML_FILE);

(async () => {
    const browser = await puppeteer.launch({
        headless: false,  // 显示浏览器窗口
        devtools: true    // 打开开发者工具
    });

    const page = await browser.newPage();

    // ========== 1. 监听控制台消息 ==========
    console.log('\n📡 开始监控控制台消息...\n');

    const consoleMessages = [];
    page.on('console', msg => {
        const type = msg.type();
        const text = msg.text();
        consoleMessages.push({ type, text });

        if (type === 'error') {
            console.error('❌ [ERROR]', text);
        } else if (type === 'warning') {
            console.warn('⚠️  [WARN]', text);
        } else if (type === 'log') {
            console.log('📝 [LOG]', text);
        }
    });

    // ========== 2. 监听网络请求 ==========
    const networkRequests = [];
    page.on('request', request => {
        networkRequests.push({
            url: request.url(),
            method: request.method(),
            resourceType: request.resourceType()
        });
    });

    page.on('response', response => {
        if (!response.ok()) {
            console.error(`❌ [网络失败] ${response.url()} - ${response.status()}`);
        }
    });

    // ========== 3. 监听页面错误 ==========
    page.on('pageerror', error => {
        console.error('❌ [页面错误]', error.message);
    });

    // ========== 4. 打开页面 ==========
    console.log('\n🌐 正在打开页面...');
    try {
        await page.goto(HTML_FILE, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });
        console.log('✅ 页面加载成功\n');
    } catch (error) {
        console.error('❌ 页面加载失败:', error.message);
        await browser.close();
        return;
    }

    // ========== 5. 等待页面初始化 ==========
    await page.waitForTimeout(2000);

    // ========== 6. 截图 ==========
    console.log('📸 正在截图...');
    await page.screenshot({
        path: 'screenshots/homepage.png',
        fullPage: true
    });
    console.log('✅ 截图保存: screenshots/homepage.png\n');

    // ========== 7. 检查页面元素 ==========
    console.log('🔍 检查页面元素...\n');

    const checks = await page.evaluate(() => {
        return {
            // 检查侧边栏
            hasSidebar: !!document.querySelector('.sidebar'),

            // 检查分类列表
            categoryCount: document.querySelectorAll('.category-chip').length,

            // 检查艺术家列表
            artistCount: document.querySelectorAll('.artist-item').length,

            // 检查播放器
            hasPlayerBar: !!document.querySelector('.player-bar'),
            hasVinylRecord: !!document.querySelector('.vinyl-record'),

            // 检查全局变量
            hasMockDB: typeof window.MOCK_DB !== 'undefined',
            hasCategories: typeof window.CATEGORIES !== 'undefined',
            hasLazyLoader: typeof window.LazyLoader !== 'undefined',

            // 获取错误信息
            errors: window.__testErrors || []
        };
    });

    console.log('📊 页面检查结果:');
    console.log('  ✓ 侧边栏:', checks.hasSidebar ? '✅' : '❌');
    console.log('  ✓ 分类数量:', checks.categoryCount);
    console.log('  ✓ 艺术家数量:', checks.artistCount);
    console.log('  ✓ 播放器条:', checks.hasPlayerBar ? '✅' : '❌');
    console.log('  ✓ 黑胶唱片:', checks.hasVinylRecord ? '✅' : '❌');
    console.log('  ✓ MOCK_DB:', checks.hasMockDB ? '✅' : '❌');
    console.log('  ✓ CATEGORIES:', checks.hasCategories ? '✅' : '❌');
    console.log('  ✓ LazyLoader:', checks.hasLazyLoader ? '✅' : '❌');

    // ========== 8. 测试交互功能 ==========
    console.log('\n🎬 测试交互功能...\n');

    // 点击第一个艺术家
    const firstArtist = await page.$('.artist-item');
    if (firstArtist) {
        console.log('🖱️  点击第一个艺术家...');
        await firstArtist.click();
        await page.waitForTimeout(1000);

        // 截图
        await page.screenshot({ path: 'screenshots/after-artist-click.png' });
        console.log('✅ 截图保存: screenshots/after-artist-click.png');
    }

    // ========== 9. 性能分析 ==========
    const metrics = await page.metrics();
    console.log('\n📈 性能指标:');
    console.log('  - Timestamp:', metrics.Timestamp);
    console.log('  - Documents:', metrics.Documents);
    console.log('  - Frames:', metrics.Frames);
    console.log('  - JSEventListeners:', metrics.JSEventListeners);

    // ========== 10. 生成报告 ==========
    console.log('\n📋 生成测试报告...\n');

    const report = {
        timestamp: new Date().toISOString(),
        url: HTML_FILE,
        pageChecks: checks,
        consoleMessages: consoleMessages,
        networkRequests: networkRequests,
        metrics: metrics
    };

    // 确保截图目录存在
    if (!fs.existsSync('screenshots')) {
        fs.mkdirSync('screenshots');
    }

    fs.writeFileSync('test-report.json', JSON.stringify(report, null, 2));
    console.log('✅ 测试报告保存: test-report.json\n');

    // ========== 11. 保持浏览器打开 ==========
    console.log('✨ 测试完成！');
    console.log('📌 浏览器将保持打开状态，您可以手动测试更多功能');
    console.log('📌 按 Ctrl+C 退出脚本\n');

    // 不自动关闭浏览器，让用户可以继续测试
    // await browser.close();
})();
