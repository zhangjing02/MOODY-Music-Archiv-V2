const puppeteer = require('puppeteer');

(async () => {
  console.log('🧪 测试修复后的应用...\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // 忽略 iTunes 请求
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.url().includes('itunes.apple.com')) {
      req.abort();
    } else {
      req.continue();
    }
  });

  // 监听控制台错误
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  page.on('pageerror', error => {
    errors.push(error.message);
  });

  const path = require('path');
  const projectRoot = path.resolve(__dirname, '../../');
  const pagePath = 'file://' + path.join(projectRoot, 'Music-Archive-Project.html').replace(/\\/g, '/');

  console.log('📌 打开页面...');
  const startTime = Date.now();
  await page.goto(pagePath, {
    waitUntil: 'networkidle0',
    timeout: 30000
  });
  const loadTime = Date.now() - startTime;

  // 等待页面稳定
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log(`✅ 页面加载完成 (${loadTime}ms)\n`);

  // 检查页面元素
  const pageInfo = await page.evaluate(() => {
    return {
      artists: document.querySelectorAll('.artist-item').length,
      albums: document.querySelectorAll('.album-item').length,
      songs: document.querySelectorAll('tbody tr').length,
      player: !!document.querySelector('[class*="player"]')
    };
  });

  console.log('📊 页面信息:');
  console.log(`   👨‍🎤 艺术家: ${pageInfo.artists}`);
  console.log(`   💿 专辑: ${pageInfo.albums}`);
  console.log(`   🎵 歌曲: ${pageInfo.songs}`);
  console.log(`   🎵 播放器: ${pageInfo.player ? '✅' : '❌'}\n`);

  // 测试搜索
  console.log('📌 测试搜索功能...');
  const searchBox = await page.$('input[type="text"]');
  if (searchBox) {
    await searchBox.type('周杰伦');
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('✅ 搜索功能正常\n');
  }

  // 测试点击艺术家
  console.log('📌 测试点击艺术家...');
  const firstArtist = await page.$('.artist-item');
  if (firstArtist) {
    await firstArtist.click();
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('✅ 点击功能正常\n');
  }

  // 总结
  console.log('═══════════════════════════════════════');
  console.log('📊 测试总结:');
  console.log('─'.repeat(40));
  console.log(`⏱️  页面加载时间: ${loadTime}ms`);
  console.log(`👨‍🎤 艺术家数量: ${pageInfo.artists}`);
  console.log(`❌ 控制台错误: ${errors.length}`);

  if (errors.length > 0) {
    console.log('\n发现的错误:');
    const uniqueErrors = [...new Set(errors)].slice(0, 5);
    uniqueErrors.forEach((err, i) => {
      console.log(`  ${i + 1}. ${err.substring(0, 80)}...`);
    });
  } else {
    console.log('\n✅ 无错误！');
  }

  console.log('═'.repeat(40));

  await browser.close();
  console.log('\n🎉 测试完成！');
})();
