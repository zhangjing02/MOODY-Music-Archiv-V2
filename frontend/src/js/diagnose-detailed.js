const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1024, height: 768 }
  });

  const path = require('path');
  const projectRoot = path.resolve(__dirname, '../../');
  const pagePath = 'file://' + path.join(projectRoot, 'Music-Archive-Project.html').replace(/\\/g, '/');

  const page = await browser.newPage();
  await page.goto(pagePath, {
    waitUntil: 'networkidle0',
    timeout: 30000
  });

  await new Promise(resolve => setTimeout(resolve, 2000));

  const result = await page.evaluate(() => {
    const firstArtist = document.querySelector('.artist-item');
    if (firstArtist) firstArtist.click();

    return new Promise(resolve => {
      setTimeout(() => {
        const songsTable = document.querySelector('.song-table');
        const rows = songsTable?.querySelectorAll('tbody tr') || [];
        const firstRow = rows[0];

        if (!firstRow) {
          resolve({ error: 'No rows found', rowCount: 0 });
          return;
        }

        const cells = firstRow.querySelectorAll('td');
        const cellInfo = [];

        cells.forEach((cell, i) => {
          cellInfo.push({
            index: i,
            className: cell.className,
            width: cell.offsetWidth,
            innerHTML: cell.innerHTML.substring(0, 80)
          });
        });

        resolve({
          rowCount: rows.length,
          cellCount: cells.length,
          cells: cellInfo
        });
      }, 1000);
    });
  });

  console.log('📊 诊断结果:');
  console.log('歌曲数量:', result.rowCount);
  console.log('单元格数量:', result.cellCount);

  if (result.cells) {
    console.log('\n单元格信息:');
    result.cells.forEach((cell) => {
      console.log(`  [${cell.index}] ${cell.className}`);
      console.log(`      宽度: ${cell.width}px`);
      console.log(`      内容: ${cell.innerHTML}`);
    });
  }

  await page.screenshot({ path: 'detailed-diagnosis.png' });
  console.log('\n📸 截图已保存');

  await browser.close();
})();
