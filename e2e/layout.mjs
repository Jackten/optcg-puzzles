// Layout check: opens a puzzle at several viewports, screenshots it, and reports any
// tappable zone whose centre is covered by a different element (a tap there would miss).
// Output: reports/layout.json + reports/layout/<w>x<h>.png. Usage: node e2e/layout.mjs [baseUrl] [--id=gen-0028]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const base = process.argv[2]?.startsWith('http') ? process.argv[2] : 'http://127.0.0.1:5199/';
const id = process.argv.find(a => a.startsWith('--id='))?.slice(5) || 'gen-0028';
const sizes = [[844, 390], [932, 430], [740, 360], [1024, 768], [1440, 900]];
fs.mkdirSync('reports/layout', { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const out = [];
for (const [w, h] of sizes) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  await page.goto(`${base}#p=${id}`); await page.waitForSelector('.table');
  const intro = page.getByRole('button', { name: /Take your seat/ }); if (await intro.count()) await intro.click();
  await page.waitForTimeout(300); await page.mouse.move(1, 1);
  const problems = await page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('.table [data-source], .table [data-target]')) {
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      const name = el.dataset.source || el.dataset.target;
      const x = r.x + r.width / 2, y = r.y + r.height / 2;
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) { bad.push(`${name}: off-screen`); continue; }
      const hit = document.elementFromPoint(x, y);
      const owner = hit?.closest('[data-source],[data-target]');
      if (owner && owner !== el && !el.contains(owner) && !owner.contains(el)) bad.push(`${name}: centre covered by ${owner.dataset.source || owner.dataset.target}`);
      else if (!owner && !el.contains(hit)) bad.push(`${name}: centre covered by ${hit?.className || hit?.tagName}`);
    }
    const doc = document.documentElement; if (doc.scrollWidth > innerWidth + 1) bad.push(`horizontal scroll ${doc.scrollWidth}>${innerWidth}`);
    return [...new Set(bad)];
  });
  await page.screenshot({ path: `reports/layout/${w}x${h}.png` });
  out.push({ size: `${w}x${h}`, problems }); console.log(`${w}x${h}`, problems.length ? problems.join('; ') : 'OK');
  await page.close();
}
fs.writeFileSync('reports/layout.json', JSON.stringify(out, null, 2)); await browser.close();
