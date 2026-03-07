const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// 监控报告
const report = {
    startTime: new Date().toISOString(),
    actions: [],
    errors: [],
    warnings: [],
    networkIssues: [],
    performanceMetrics: []
};

// 动作计数器
let actionCounter = 0;

(async () => {
    console.log('🚀 启动实时监控系统...\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 监控功能已启用:');
    console.log('  ✓ 用户操作记录（点击、输入、滚动等）');
    console.log('  ✓ 控制台错误和警告');
    console.log('  ✓ 网络请求监控');
    console.log('  ✓ 性能指标追踪');
    console.log('  ✓ 页面元素状态检查');
    console.log('═══════════════════════════════════════════════════════════\n');

    // 启动浏览器（显示窗口）
    const browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        defaultViewport: { width: 1920, height: 1080 }
    });

    const page = await browser.newPage();

    // ========== 1. 监听用户操作 ==========
    console.log('✅ 用户操作监控已启动');

    // 监听点击事件
    await page.evaluateOnNewDocument(() => {
        window.addEventListener('click', (e) => {
            const target = e.target;
            const info = {
                type: 'click',
                timestamp: new Date().toISOString(),
                tagName: target.tagName,
                className: target.className,
                id: target.id,
                text: target.textContent?.substring(0, 50) || '',
                xpath: getXPath(target)
            };
            window.__monitorLog__(info);
        }, true);

        // 监听输入事件
        window.addEventListener('input', (e) => {
            const info = {
                type: 'input',
                timestamp: new Date().toISOString(),
                tagName: e.target.tagName,
                value: e.target.value?.substring(0, 50) || '',
                placeholder: e.target.placeholder || ''
            };
            window.__monitorLog__(info);
        }, true);

        // 监听滚动事件（节流）
        let scrollTimeout;
        window.addEventListener('scroll', (e) => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                const info = {
                    type: 'scroll',
                    timestamp: new Date().toISOString(),
                    scrollY: window.scrollY,
                    scrollX: window.scrollX
                };
                window.__monitorLog__(info);
            }, 500);
        }, true);

        // 获取元素的 XPath
        function getXPath(element) {
            if (element.id !== '') {
                return '//*[@id="' + element.id + '"]';
            }
            if (element === document.body) {
                return '/html/body';
            }

            const ix = Array.from(element.parentNode?.children || [])
                .filter(child => child.tagName === element.tagName)
                .indexOf(element) + 1;

            return (
                getXPath(element.parentNode) +
                '/' +
                element.tagName.toLowerCase() +
                '[' +
                ix +
                ']'
            );
        }
    });

    // 接收页面内的事件
    page.on('console', msg => {
        if (msg.text() === '__monitor_log__') {
            const args = msg.args();
            args[0].jsonValue().then(data => {
                actionCounter++;
                report.actions.push({ id: actionCounter, ...data });

                // 实时显示操作
                const icon = {
                    'click': '🖱️',
                    'input': '⌨️',
                    'scroll': '📜'
                }[data.type] || '📍';

                console.log(`${icon} [${actionCounter}] ${data.type.toUpperCase()}: ${data.tagName || 'N/A'} ${data.text || data.value || ''}`);
            });
        }
    });

    // 注入日志函数
    await page.evaluateOnNewDocument(() => {
        window.__monitorLog__ = (data) => {
            console.log('__monitor_log__', JSON.stringify(data));
        };
    });

    // ========== 2. 监听控制台错误 ==========
    console.log('✅ 控制台错误监控已启动');

    page.on('console', msg => {
        const type = msg.type();
        const text = msg.text();

        if (type === 'error') {
            const errorInfo = {
                timestamp: new Date().toISOString(),
                message: text,
                location: msg.location()
            };
            report.errors.push(errorInfo);
            console.log(`\n❌ 错误 [${report.errors.length}]: ${text}\n`);
        } else if (type === 'warning') {
            const warningInfo = {
                timestamp: new Date().toISOString(),
                message: text
            };
            report.warnings.push(warningInfo);
            console.log(`⚠️  警告: ${text}`);
        }
    });

    page.on('pageerror', error => {
        const errorInfo = {
            timestamp: new Date().toISOString(),
            message: error.message,
            stack: error.stack
        };
        report.errors.push(errorInfo);
        console.log(`\n❌ 页面错误: ${error.message}\n`);
    });

    // ========== 3. 监听网络请求 ==========
    console.log('✅ 网络请求监控已启动');

    page.on('request', request => {
        const url = request.url();
        // 只记录外部请求
        if (url.startsWith('http')) {
            console.log(`🌐 请求: ${request.method()} ${url.substring(0, 60)}...`);
        }
    });

    page.on('response', response => {
        const url = response.url();
        const status = response.status();

        if (url.startsWith('http') && status >= 400) {
            const issue = {
                timestamp: new Date().toISOString(),
                url: url,
                status: status,
                method: response.request().method()
            };
            report.networkIssues.push(issue);
            console.log(`\n❌ 网络错误 [${status}]: ${url}\n`);
        }
    });

    page.on('requestfailed', request => {
        const failure = request.failure();
        if (failure) {
            const issue = {
                timestamp: new Date().toISOString(),
                url: request.url(),
                error: failure.errorText
            };
            report.networkIssues.push(issue);
            console.log(`\n❌ 请求失败: ${request.url()} - ${failure.errorText}\n`);
        }
    });

    // ========== 4. 性能监控 ==========
    console.log('✅ 性能监控已启动\n');

    // 每30秒记录一次性能指标
    const performanceInterval = setInterval(async () => {
        try {
            const metrics = await page.metrics();
            const perfData = {
                timestamp: new Date().toISOString(),
                metrics: {
                    timestamp: metrics.Timestamp,
                    documents: metrics.Documents,
                    frames: metrics.Frames,
                    jSEventListeners: metrics.JSEventListeners,
                    nodes: metrics.Nodes,
                    jsHeapUsedSize: metrics.JSHeapUsedSize,
                    jsHeapTotalSize: metrics.JSHeapTotalSize
                }
            };
            report.performanceMetrics.push(perfData);

            const heapMB = (metrics.JSHeapUsedSize / 1024 / 1024).toFixed(2);
            console.log(`\n📊 性能快照: 内存使用 ${heapMB}MB, 文档 ${metrics.Documents}, 帧 ${metrics.Frames}\n`);
        } catch (e) {
            // 页面可能已关闭
        }
    }, 30000);

    // ========== 5. 打开页面 ==========
    const projectRoot = path.resolve(__dirname, '../../');
    const pagePath = 'file://' + path.join(projectRoot, 'Music-Archive-Project.html').replace(/\\/g, '/');

    console.log('📌 正在打开页面...\n');
    await page.goto(pagePath, {
        waitUntil: 'networkidle2',
        timeout: 60000
    });

    console.log('✅ 页面已加载！现在你可以开始操作网页了。\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('💡 提示: 正常操作网页，所有操作都会被记录');
    console.log('💡 完成后按 Ctrl+C 退出监控并生成报告');
    console.log('═══════════════════════════════════════════════════════════\n');

    // ========== 6. 定期保存报告 ==========
    const saveReport = () => {
        report.endTime = new Date().toISOString();
        report.summary = {
            totalActions: report.actions.length,
            totalErrors: report.errors.length,
            totalWarnings: report.warnings.length,
            totalNetworkIssues: report.networkIssues.length,
            performanceSnapshots: report.performanceMetrics.length
        };

        const reportPath = path.join(projectRoot, 'monitor-report.json');
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

        console.log('\n💾 报告已保存到: monitor-report.json');
    };

    // 每60秒自动保存一次
    const saveInterval = setInterval(saveReport, 60000);

    // ========== 7. 优雅退出 ==========
    process.on('SIGINT', async () => {
        console.log('\n\n═══════════════════════════════════════════════════════════');
        console.log('🛑 监控正在停止...\n');

        clearInterval(performanceInterval);
        clearInterval(saveInterval);
        saveReport();

        // 生成人类可读的摘要
        console.log('\n📊 监控摘要:');
        console.log('─'.repeat(60));
        console.log(`⏱️  开始时间: ${report.startTime}`);
        console.log(`⏱️  结束时间: ${report.endTime}`);
        console.log(`🖱️  用户操作: ${report.summary.totalActions} 次`);
        console.log(`❌ 错误: ${report.summary.totalErrors} 个`);
        console.log(`⚠️  警告: ${report.summary.totalWarnings} 个`);
        console.log(`🌐 网络问题: ${report.summary.totalNetworkIssues} 个`);
        console.log('─'.repeat(60));

        if (report.errors.length > 0) {
            console.log('\n❌ 发现的错误:\n');
            report.errors.slice(-5).forEach((err, i) => {
                console.log(`  ${i + 1}. ${err.message}`);
            });
        }

        if (report.networkIssues.length > 0) {
            console.log('\n🌐 网络问题:\n');
            const uniqueIssues = [...new Set(report.networkIssues.map(i => i.url))];
            uniqueIssues.slice(0, 5).forEach(url => {
                console.log(`  - ${url.substring(0, 80)}...`);
            });
        }

        console.log('\n✅ 详细报告已保存到: E:/Html-work/monitor-report.json\n');

        await browser.close();
        process.exit(0);
    });

})();
