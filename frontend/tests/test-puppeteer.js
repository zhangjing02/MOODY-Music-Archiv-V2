const puppeteer = require('puppeteer');

(async () => {
  console.log('🚀 Starting Puppeteer test...\n');

  try {
    // 启动浏览器
    console.log('1️⃣ Launching browser...');
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    console.log('✅ Browser launched successfully\n');

    // 创建新页面
    console.log('2️⃣ Creating new page...');
    const page = await browser.newPage();
    console.log('✅ Page created successfully\n');

    // 访问网页
    console.log('3️⃣ Navigating to example.com...');
    await page.goto('https://example.com', { waitUntil: 'networkidle2' });
    console.log('✅ Page loaded successfully\n');

    // 获取页面标题
    console.log('4️⃣ Getting page title...');
    const title = await page.title();
    console.log(`✅ Page title: "${title}"\n`);

    // 截图
    console.log('5️⃣ Taking screenshot...');
    await page.screenshot({ path: 'puppeteer-test-screenshot.png' });
    console.log('✅ Screenshot saved as "puppeteer-test-screenshot.png"\n');

    // 获取页面内容
    console.log('6️⃣ Getting page content...');
    const content = await page.evaluate(() => {
      return {
        heading: document.querySelector('h1')?.innerText || 'No heading found',
        paragraph: document.querySelector('p')?.innerText || 'No paragraph found'
      };
    });
    console.log('✅ Page content:', content);
    console.log();

    // 关闭浏览器
    console.log('7️⃣ Closing browser...');
    await browser.close();
    console.log('✅ Browser closed successfully\n');

    console.log('🎉 All tests passed! Puppeteer is working correctly.\n');

  } catch (error) {
    console.error('❌ Error occurred:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
})();
