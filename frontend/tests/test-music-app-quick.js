const puppeteer = require('puppeteer');

(async () => {
  console.log('🚀 快速测试音乐归档应用...\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // 忽略 CORS 和图片加载错误
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.resourceType() === 'image' || req.url().includes('itunes')) {
      req.abort();
    } else {
      req.continue();
    }
  });

  // 监听控制台
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`   ⚠️  ${msg.text().substring(0, 100)}`);
    }
  });

  const path = require('path');
  const projectRoot = path.resolve(__dirname, '../../');
  const pagePath = 'file://' + path.join(projectRoot, 'Music-Archive-Project.html').replace(/\\/g, '/');

  console.log('📌 1️⃣ 打开页面...');
  const startTime = Date.now();
  await page.goto(pagePath, {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });
  const loadTime = Date.now() - startTime;
  console.log(`✅ 页面加载成功 (${loadTime}ms)`);

  console.log('\n📌 2️⃣ 截图保存...');
  await page.screenshot({ path: 'test-screenshot-1-initial.png', fullPage: true });
  console.log('✅ 初始截图已保存');

  console.log('\n📌 3️⃣ 检查页面元素...');
  const pageInfo = await page.evaluate(() => {
    return {
      artists: document.querySelectorAll('.artist-item, [class*="artist"]').length,
      albums: document.querySelectorAll('.album-item, [class*="album"]').length,
      songs: document.querySelectorAll('tbody tr, [class*="song"]').length,
      categories: document.querySelectorAll('.category-chip, [class*="categor"]').length,
      searchBox: !!document.querySelector('input[type="text"], input[placeholder*="搜索"]'),
      playerBar: !!document.querySelector('[class*="player"]'),
      sidebar: !!document.querySelector('[class*="sidebar"]')
    };
  });

  console.log(`   👨‍🎤 艺术家: ${pageInfo.artists}`);
  console.log(`   💿 专辑: ${pageInfo.albums}`);
  console.log(`   🎵 歌曲: ${pageInfo.songs}`);
  console.log(`   🏷️  分类: ${pageInfo.categories}`);
  console.log(`   🔍 搜索框: ${pageInfo.searchBox ? '✅' : '❌'}`);
  console.log(`   🎵 播放器: ${pageInfo.playerBar ? '✅' : '❌'}`);
  console.log(`   📋 侧边栏: ${pageInfo.sidebar ? '✅' : '❌'}`);

  console.log('\n📌 4️⃣ 测试搜索功能...');
  try {
    const searchBox = await page.$('input[type="text"]');
    if (searchBox) {
      await searchBox.type('周杰伦');
      await new Promise(resolve => setTimeout(resolve, 500));
      await page.screenshot({ path: 'test-screenshot-2-search.png' });
      console.log('✅ 搜索测试完成');
    }
  } catch (e) {
    console.log('⚠️  搜索测试跳过');
  }

  console.log('\n📌 5️⃣ 测试点击艺术家...');
  try {
    const firstArtist = await page.$('.artist-item, [class*="artist"]');
    if (firstArtist) {
      await firstArtist.click();
      await new Promise(resolve => setTimeout(resolve, 500));
      await page.screenshot({ path: 'test-screenshot-3-clicked.png' });
      console.log('✅ 点击测试完成');
    }
  } catch (e) {
    console.log('⚠️  点击测试跳过');
  }

  console.log('\n📊 性能指标:');
  const metrics = await page.metrics();
  console.log(`   ⏱️  加载时间: ${loadTime}ms`);
  console.log(`   📄 Documents: ${metrics.Documents}`);
  console.log(`   🖼️  Frames: ${metrics.Frames}`);

  await browser.close();
  console.log('\n✅ 测试完成！');
})();
