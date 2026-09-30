// E2E: plays every puzzle's stored solution through the real UI with mouse drags/taps
// in headless Chrome at phone-landscape size, and checks the win screen appears.
// Output: reports/e2e.json + reports/e2e/*.png. Usage: node e2e/playthrough.mjs [baseUrl] [--only id,id] [--motion]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const base = process.argv[2]?.startsWith('http') ? process.argv[2] : 'http://127.0.0.1:5199/';
const only = (process.argv.find(a => a.startsWith('--only='))?.slice(7) || '').split(',').filter(Boolean);
const motion = process.argv.includes('--motion');
const set = JSON.parse(fs.readFileSync('public/puzzles.json', 'utf8'));
const defs = new Map(JSON.parse(fs.readFileSync('src/engine/cards.generated.json', 'utf8')).map(c => [c.id, c]));
fs.mkdirSync('reports/e2e', { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const results = [];
const puzzles = set.puzzles.filter(p => !only.length || only.includes(p.id));

function findUid(state, uid) {
  for (const side of ['me', 'opp']) { const p = state[side];
    for (const c of [p.leader, ...p.characters, ...(p.stage ? [p.stage] : []), ...p.hand]) if (c.uid === uid) return c; }
}
const physical = t => !t || t === 'yes' ? null : t.startsWith('$trash:') ? t.slice(7) : t.startsWith('$don:') ? ({ active: 'me-don', rested: 'me-don-rested' }[t.split(':')[1]] ?? t.split(':')[1]) : t.split('#')[0];

async function center(page, sel) {
  const el = page.locator(sel).first(); await el.waitFor({ state: 'visible', timeout: 4000 });
  const b = await el.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
const src = id => `[data-source="${id}"]`;
const tgt = id => `[data-source="${id}"], [data-target="${id}"]`;
async function drag(page, from, to) {
  const a = await center(page, from), b = await center(page, to);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(a.x + (b.x - a.x) * i / 8, a.y + (b.y - a.y) * i / 8);
  await page.mouse.up();
}
async function tap(page, sel) { const a = await center(page, sel); await page.mouse.click(a.x, a.y); }
// Several tokens can share one physical card (e.g. "m-0#1" vs "m-0#2"); the UI then asks in a modal.
async function pickFromModal(page, token) {
  await page.waitForTimeout(120);
  const btn = page.locator(`.choice-modal [data-token="${token}"]`);
  if (await btn.count()) await btn.click();
}
async function settle(page) {
  await page.waitForTimeout(80);
  await page.waitForFunction(() => document.querySelector('.table')?.dataset.busy !== '1', null, { timeout: 30000 });
}

for (const pz of puzzles) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, reducedMotion: motion ? 'no-preference' : 'reduce' });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  const r = { id: pz.id, difficulty: pz.difficulty, steps: pz.solution.length, ok: false, errors };
  try {
    await page.goto(`${base}#p=${pz.id}`); await page.getByRole('button', { name: /Take your seat/ }).click();
    let state = pz.state;
    for (const [i, { action: a }] of pz.solution.entries()) {
      if (a.type === 'attachDon') await drag(page, src('don'), tgt(a.target));
      else if (a.type === 'attack') await drag(page, src(a.attacker), tgt(a.target));
      else {
        const tokens = a.targets ?? [];
        if (a.type === 'activate') { await tap(page, src(a.uid)); await page.getByRole('button', { name: /Activate/ }).click(); }
        else {
          const def = defs.get(findUid(state, a.uid)?.defId);
          const first = physical(tokens[0]) ?? (def?.category === 'Stage' ? 'me-stage' : def?.category === 'Event' ? 'event-zone' : 'me-characters');
          await drag(page, src(a.uid), tgt(first));
          if (physical(tokens[0])) await pickFromModal(page, tokens.shift());
        }
        for (const t of tokens) {
          await page.waitForTimeout(150);
          if (await page.locator('.table').getAttribute('data-busy') === '1') break;
          const p = physical(t);
          if (p) await tap(page, tgt(p));
          else await page.getByRole('button', { name: 'Options' }).click();
          await pickFromModal(page, t);
        }
      }
      await settle(page);
      if (i === 0 || i === pz.solution.length - 1) await page.screenshot({ path: `reports/e2e/${pz.id}-step${i + 1}.png` });
      const log = await page.evaluate(() => document.querySelector('.log-drawer, aside')?.innerText ?? '');
      state = state; // UI owns state; we only need defIds for hand cards, which don't change uid.
    }
    await page.locator('.win-modal').waitFor({ timeout: 8000 });
    await page.screenshot({ path: `reports/e2e/${pz.id}-win.png` });
    r.ok = errors.length === 0;
  } catch (e) { r.fail = String(e).split('\n')[0]; await page.screenshot({ path: `reports/e2e/${pz.id}-FAIL.png` }).catch(() => {}); }
  results.push(r); console.log(r.ok ? 'PASS' : 'FAIL', pz.id, `d${pz.difficulty}`, r.fail ?? '', errors.slice(0, 2).join(' | '));
  await ctx.close();
}
await browser.close();
const summary = { at: new Date().toISOString(), base, viewport: '844x390', total: results.length, passed: results.filter(r => r.ok).length, results };
fs.writeFileSync('reports/e2e.json', JSON.stringify(summary, null, 2));
console.log(`\n${summary.passed}/${summary.total} solved through the UI`);
process.exit(summary.passed === summary.total ? 0 : 1);
