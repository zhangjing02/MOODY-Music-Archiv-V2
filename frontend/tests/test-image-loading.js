const puppeteer = require('puppeteer');

(async () => {
  console.log('🔍 测试本地图片加载...\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // 只拦截 iTunes API 请求，允许本地图片加载
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.url().includes('itunes.apple.com')) {
      req.abort();
    } else {
      req.continue();
    }
  });

  // 监听图片加载结果
  const imageResults = [];
  page.on('response', async (response) => {
    const url = response.url();
    // 通过 URL 判断是否是图片
    if (url.match(/\.(jpg|jpeg|png|gif|svg|webp)$/i)) {
      const status = response.status();
      const success = status >= 200 && status < 300;
      imageResults.push({ url, status, success });
    }
  });

  // 监听控制台中关于图片的消息
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('图片加载失败') && !text.includes('itunes')) {
      console.log(`❌ ${text}`);
    }
  });

  const path = require('path');
  const projectRoot = path.resolve(__dirname, '../../');
  const pagePath = 'file://' + path.join(projectRoot, 'Music-Archive-Project.html').replace(/\\/g, '/');

  console.log('📌 打开页面...');
  await page.goto(pagePath, {
    waitUntil: 'networkidle0',
    timeout: 30000
  });

  console.log('✅ 页面加载完成\n');

  // 等待一下让所有图片尝试加载
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('📊 图片加载统计:');
  console.log('═'.repeat(60));

  // 获取页面上的图片元素
  const imagesInfo = await page.evaluate(() => {
    const images = Array.from(document.querySelectorAll('img'));
    return images.map(img => ({
      src: img.src,
      loaded: img.complete && img.naturalHeight !== 0,
      error: false,
      alt: img.alt || ''
    })).slice(0, 10); // 只取前 10 个
  });

  console.log(`\n检查前 10 个图片:\n`);
  imagesInfo.forEach((img, i) => {
    const status = img.loaded ? '✅' : '❌';
    const filename = img.src.split('/').pop().substring(0, 40);
    console.log(`${i + 1}. ${status} ${filename}`);
  });

  console.log('\n═'.repeat(60));
  console.log(`\n总共尝试加载的图片数: ${imageResults.length}`);
  console.log(`成功的: ${imageResults.filter(r => r.success).length}`);
  console.log(`失败的: ${imageResults.filter(r => !r.success).length}`);

  // 检查是否有本地图片加载失败
  const failedLocalImages = imageResults.filter(r =>
    !r.success &&
    (r.url.includes('file://') || r.url.includes('images/'))
  );

  if (failedLocalImages.length > 0) {
    console.log('\n❌ 失败的本地图片:');
    failedLocalImages.forEach(img => {
      console.log(`   ${img.url} (${img.status})`);
    });
  } else if (imageResults.length > 0) {
    console.log('\n✅ 所有本地图片加载成功！');
  }

  await browser.close();
  console.log('\n🎉 测试完成！');
})();
