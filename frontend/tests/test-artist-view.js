const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox'],
    defaultViewport: { width: 1200, height: 800 }
  });

  const page = await browser.newPage();
  const path = require('path');
  const projectRoot = path.resolve(__dirname, '../../');
  const pagePath = 'file://' + path.join(projectRoot, 'Music-Archive-Project.html').replace(/\\/g, '/');
  await page.goto(pagePath);

  await new Promise(resolve => setTimeout(resolve, 2000));

  const result = await page.evaluate(() => {
    // 强制切换到艺术家视图
    if (typeof viewState !== 'undefined') {
      viewState.viewMode = 'artist';
      viewState.sIdx = 0; // 周杰伦
      viewState.aIdx = 0;

      // 渲染视图
      if (typeof updateView === 'function') {
        updateView();
      }
    }

    // 等待渲染
    return new Promise(resolve => {
      setTimeout(() => {
        const songsTable = document.querySelector('.song-table');
        const rows = songsTable?.querySelectorAll('tbody tr') || [];

        if (rows.length === 0) {
          resolve({ success: false, message: '没有歌曲行' });
          return;
        }

        const firstRow = rows[0];
        const cells = firstRow.querySelectorAll('td');

        resolve({
          success: true,
          rowCount: rows.length,
          cellCount: cells.length,
          cells: Array.from(cells).map((cell, i) => ({
            index: i,
            className: cell.className,
            width: cell.offsetWidth,
            hasUploadBtn: cell.querySelector('.upload') !== null
          }))
        });
      }, 1500);
    });
  });

  console.log('📊 测试结果:');
  console.log('成功:', result.success);
  console.log('歌曲数量:', result.rowCount);
  console.log('单元格数量:', result.cellCount);

  if (result.cells) {
    console.log('\n单元格详情:');
    result.cells.forEach((cell) => {
      console.log(`  [${cell.index}] ${cell.className}`);
      console.log(`      宽度: ${cell.width}px`);
      console.log(`      有上传按钮: ${cell.hasUploadBtn ? '✅' : '❌'}`);
    });
  }

  await page.screenshot({ path: 'artist-view-test.png' });
  console.log('\n📸 截图已保存');

  await browser.close();
})();
