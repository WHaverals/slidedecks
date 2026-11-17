// node sheet.cjs <outdir> <sheet.png> [scale] [casts comma list] [poses comma list]
const { chromium } = require('/Users/wouter/gitrepos/slidedecks/node_modules/playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const [dir, outPng, scaleArg, castsArg, posesArg] = process.argv.slice(2);
  const scale = parseFloat(scaleArg || '0.55');
  const casts = (castsArg || 'a-wash,b-bell,c-line').split(',');
  const poses = (posesArg || 'human,robot-question,robot-punch').split(',');
  const w = 560 * scale, h = 700 * scale;
  let html = `<body style="margin:0;background:#faf8f5"><div style="display:grid;grid-template-columns:repeat(${poses.length},${w}px);gap:6px;padding:8px">`;
  for (const c of casts) for (const p of poses) {
    const f = path.resolve(dir, `${c}-${p}.svg`);
    if (!fs.existsSync(f)) continue;
    html += `<img src="file://${f}" width="${w}" height="${h}">`;
  }
  html += '</div></body>';
  const tmp = path.resolve(dir, '_sheet.html');
  fs.writeFileSync(tmp, html);
  const b = await chromium.launch({ channel: 'chrome' });
  const pg = await b.newPage({ viewport: { width: Math.ceil(poses.length * (w + 6) + 16), height: 800 }, deviceScaleFactor: 2 });
  await pg.goto('file://' + tmp);
  await pg.waitForTimeout(600);
  await pg.screenshot({ path: outPng, fullPage: true });
  await b.close();
})();
