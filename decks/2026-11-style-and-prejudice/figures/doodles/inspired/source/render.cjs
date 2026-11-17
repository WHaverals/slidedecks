// node render.cjs <svgdir> <pngdir> : transparent 2x PNG of every svg
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const [src, dst] = process.argv.slice(2);
  fs.mkdirSync(dst, { recursive: true });
  const b = await chromium.launch({ channel: 'chrome' });
  const pg = await b.newPage({ viewport: { width: 560, height: 700 }, deviceScaleFactor: 2 });
  for (const f of fs.readdirSync(src).filter(n => n.endsWith('.svg')).sort()) {
    await pg.goto('file://' + path.resolve(src, f));
    await pg.waitForTimeout(250);
    await pg.screenshot({ path: path.join(dst, f.replace('.svg', '.png')), omitBackground: true, clip: { x: 0, y: 0, width: 560, height: 700 } });
  }
  await b.close();
})();
