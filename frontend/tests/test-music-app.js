const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  console.log('🚀 开始测试音乐归档应用...\n');

  // 1. 确认 Puppeteer 已加载
  console.log('✅ 1️⃣ Puppeteer 已加载');

  // 启动浏览器
  console.log('\n📌 2️⃣ 启动浏览器...');
  const browser = await puppeteer.launch({
    headless: false, // 显示浏览器窗口
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1920, height: 1080 }
  });
  console.log('✅ 浏览器启动成功');

  const page = await browser.newPage();

  // 监控控制台消息和错误
  const consoleMessages = [];
  const errors = [];

  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    consoleMessages.push({ type, text });
    if (type === 'error') {
      console.error(`   ❌ 控制台错误: ${text}`);
      errors.push(text);
    } else if (type === 'warning') {
      console.warn(`   ⚠️  控制台警告: ${text}`);
    }
  });

  page.on('pageerror', error => {
    console.error(`   ❌ 页面错误: ${error.message}`);
    errors.push(error.message);
  });

  // 监控网络请求
  const networkRequests = [];
  page.on('request', request => {
    networkRequests.push({
      url: request.url(),
      method: request.method(),
      type: request.resourceType()
    });
  });

  page.on('response', response => {
    const status = response.status();
    if (status >= 400) {
      console.error(`   ❌ 网络错误: ${response.url()} (${status})`);
    }
  });

  // 3. 打开本地网页
  console.log('\n📌 3️⃣ 打开本地网页...');
  const filePath = 'file:///E:/Html-work/index.html';
  console.log(`   📍 文件路径: ${filePath}`);

  const startTime = Date.now();
  await page.goto(filePath, {
    waitUntil: 'networkidle2',
    timeout: 30000
  });
  const loadTime = Date.now() - startTime;
  console.log(`✅ 页面加载成功 (耗时: ${loadTime}ms)`);

  // 4. 截图查看页面渲染效果
  console.log('\n📌 4️⃣ 截图保存...');
  await page.screenshot({
    path: 'music-app-full-screenshot.png',
    fullPage: true
  });
  console.log('✅ 完整页面截图已保存: music-app-full-screenshot.png');

  // 等待页面完全渲染
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 获取页面基本信息
  console.log('\n📌 5️⃣ 页面基本信息...');
  const pageInfo = await page.evaluate(() => {
    return {
      title: document.title,
      url: window.location.href,
      artistCount: document.querySelectorAll('.artist-item')?.length || 0,
      albumCount: document.querySelectorAll('.album-item')?.length || 0,
      songCount: document.querySelectorAll('tbody tr')?.length || 0,
      categoryChips: document.querySelectorAll('.category-chip')?.length || 0
    };
  });
  console.log('   📄 页面标题:', pageInfo.title);
  console.log('   👨‍🎤 艺术家数量:', pageInfo.artistCount);
  console.log('   💿 专辑数量:', pageInfo.albumCount);
  console.log('   🎵 歌曲数量:', pageInfo.songCount);
  console.log('   🏷️  分类标签:', pageInfo.categoryChips);

  // 6. 测试交互功能
  console.log('\n📌 6️⃣ 测试交互功能...');

  // 测试点击第一个艺术家
  try {
    console.log('   🖱️  点击第一个艺术家...');
    const firstArtist = await page.$('.artist-item');
    if (firstArtist) {
      await firstArtist.click();
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log('✅ 艺术家点击成功');
      await page.screenshot({ path: 'music-app-artist-clicked.png' });
      console.log('   📸 截图已保存: music-app-artist-clicked.png');
    } else {
      console.warn('⚠️  未找到艺术家元素');
    }
  } catch (error) {
    console.error('❌ 艺术家点击测试失败:', error.message);
  }

  // 测试分类筛选
  try {
    console.log('\n   🏷️  测试分类筛选...');
    const categories = await page.$$('.category-chip');
    if (categories.length > 1) {
      await categories[1].click();
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log('✅ 分类点击成功');
      await page.screenshot({ path: 'music-app-category-filtered.png' });
      console.log('   📸 截图已保存: music-app-category-filtered.png');
    }
  } catch (error) {
    console.error('❌ 分类筛选测试失败:', error.message);
  }

  // 测试搜索功能
  try {
    console.log('\n   🔍 测试搜索功能...');
    const searchBox = await page.$('input[type="text"], input[placeholder*="搜索"]');
    if (searchBox) {
      await searchBox.type('周杰伦');
      await new Promise(resolve => setTimeout(resolve, 1500));
      console.log('✅ 搜索功能测试完成');
      await page.screenshot({ path: 'music-app-search-result.png' });
      console.log('   📸 截图已保存: music-app-search-result.png');
    } else {
      console.warn('⚠️  未找到搜索框');
    }
  } catch (error) {
    console.error('❌ 搜索功能测试失败:', error.message);
  }

  // 7. 分析性能和统计
  console.log('\n📌 7️⃣ 性能分析...');
  const performanceMetrics = await page.metrics();
  console.log('   ⏱️  性能指标:');
  console.log('      - Timestamp:', performanceMetrics.Timestamp);
  console.log('      - Documents:', performanceMetrics.Documents);
  console.log('      - Frames:', performanceMetrics.Frames);
  console.log('      - JSEventListeners:', performanceMetrics.JSEventListeners);

  // 8. 总结报告
  console.log('\n📊 测试总结报告:');
  console.log('═'.repeat(50));
  console.log(`✅ 页面加载时间: ${loadTime}ms`);
  console.log(`📄 页面标题: ${pageInfo.title}`);
  console.log(`👨‍🎤 艺术家数量: ${pageInfo.artistCount}`);
  console.log(`💿 专辑数量: ${pageInfo.albumCount}`);
  console.log(`🎵 歌曲数量: ${pageInfo.songCount}`);
  console.log(`🏷️  分类标签: ${pageInfo.categoryChips}`);
  console.log(`🌐 网络请求数: ${networkRequests.length}`);
  console.log(`💬 控制台消息: ${consoleMessages.length}`);
  console.log(`❌ 错误数量: ${errors.length}`);
  console.log('═'.repeat(50));

  if (errors.length > 0) {
    console.log('\n⚠️  发现的错误:');
    errors.forEach((err, i) => {
      console.log(`   ${i + 1}. ${err}`);
    });
  } else {
    console.log('\n✅ 未发现任何错误！');
  }

  // 保存详细报告
  const report = {
    timestamp: new Date().toISOString(),
    loadTime,
    pageInfo,
    performanceMetrics,
    networkRequests: networkRequests.length,
    consoleMessages: consoleMessages.length,
    errors,
    screenshots: [
      'music-app-full-screenshot.png',
      'music-app-artist-clicked.png',
      'music-app-category-filtered.png',
      'music-app-search-result.png'
    ]
  };

  fs.writeFileSync('music-app-test-report.json', JSON.stringify(report, null, 2));
  console.log('\n📄 详细报告已保存: music-app-test-report.json');

  console.log('\n⏳ 等待 5 秒后关闭浏览器...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  await browser.close();
  console.log('\n🎉 测试完成！');
})();
