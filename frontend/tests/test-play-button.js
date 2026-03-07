const puppeteer = require('puppeteer');

(async () => {
  console.log('🎵 测试播放按钮动画效果...\n');

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1400, height: 900 }
  });

  const page = await browser.newPage();

  const path = require('path');
  const projectRoot = path.resolve(__dirname, '../../');
  const pagePath = 'file://' + path.join(projectRoot, 'Music-Archive-Project.html').replace(/\\/g, '/');

  console.log('📌 打开应用...');
  await page.goto(pagePath, {
    waitUntil: 'networkidle0',
    timeout: 30000
  });

  // 等待页面加载
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('✅ 页面加载完成\n');

  // 测试播放按钮点击
  console.log('🎬 测试场景 1: 点击播放按钮');
  console.log('─'.repeat(50));

  const result = await page.evaluate(async () => {
    // 点击第一个艺术家
    const firstArtist = document.querySelector('.artist-item');
    if (firstArtist) {
      firstArtist.click();
      await new Promise(r => setTimeout(r, 500));
    }

    // 点击播放按钮
    const playBtn = document.getElementById('playPauseBtn');
    if (!playBtn) {
      return { error: '找不到播放按钮' };
    }

    // 获取按钮样式
    const computedStyle = window.getComputedStyle(playBtn);

    // 点击播放
    playBtn.click();
    await new Promise(r => setTimeout(r, 2000));

    // 检查状态
    const isPlaying = playBtn.classList.contains('playing');

    return {
      success: true,
      isPlaying,
      width: computedStyle.width,
      height: computedStyle.height,
      borderRadius: computedStyle.borderRadius,
      background: computedStyle.background.substring(0, 50) + '...',
      hasPlayIcon: !!playBtn.querySelector('.play-icon'),
      hasPauseIcon: !!playBtn.querySelector('.pause-icon')
    };
  });

  console.log(`按钮尺寸: ${result.width} × ${result.height}`);
  console.log(`圆角半径: ${result.borderRadius}`);
  console.log(`是否在播放状态: ${result.isPlaying ? '✅' : '❌'}`);
  console.log(`播放图标存在: ${result.hasPlayIcon ? '✅' : '❌'}`);
  console.log(`暂停图标存在: ${result.hasPauseIcon ? '✅' : '❌'}`);

  // 截图
  await page.screenshot({ path: 'play-button-test.png', fullPage: true });
  console.log('\n📸 截图已保存: play-button-test.png');

  // 测试暂停
  console.log('\n🎬 测试场景 2: 点击暂停');
  console.log('─'.repeat(50));

  await page.evaluate(async () => {
    const playBtn = document.getElementById('playPauseBtn');
    playBtn.click();
    await new Promise(r => setTimeout(r, 1500));
  });

  await page.screenshot({ path: 'pause-button-test.png', fullPage: true });
  console.log('📸 截图已保存: pause-button-test.png');

  console.log('\n✅ 测试完成！');
  console.log('请查看截图文件验证动画效果。');
  console.log('关闭浏览器...');

  await browser.close();
})();
