// 验证 URL 平衡对照开关：默认不受影响，显式传参才生效。
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(BASE + '/?scene=battle&seed=variant-default');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  const plain = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return { tuning: s.tuning, starts: s.engine.startCells.length, interval: s.grid.cells[5].effIntervalMs, duo: s.engine.combos.instances.find(i => i.defId === 'duo').bonus };
  });
  assert.deepEqual(plain.tuning, { intervalMs: null, starts: null, duoBonus: null });
  assert.equal(plain.starts, 1);
  assert.equal(plain.interval, 2000);
  assert.equal(plain.duo, 0.2);

  await page.goto(BASE + '/?scene=battle&seed=variant-tuned&interval=1.0&starts=3&duo=0.08');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  const tuned = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return { tuning: s.tuning, starts: s.engine.startCells.length, interval: s.grid.cells[5].effIntervalMs, duo: s.engine.combos.instances.find(i => i.defId === 'duo').bonus };
  });
  assert.equal(tuned.tuning.intervalMs, 1000);
  assert.equal(tuned.tuning.starts, 3);
  assert.equal(tuned.tuning.duoBonus, 0.08);
  assert.equal(tuned.starts, 3);
  assert.equal(tuned.interval, 1000); // 1.0s 高于 800ms 硬下限，按原值生效
  assert.equal(tuned.duo, 0.08);

  // 非法参数必须被忽略，回到默认
  await page.goto(BASE + '/?scene=battle&seed=variant-bad&interval=0.1&starts=9&duo=abc');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  const fallback = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return { interval: s.tuning.intervalMs, starts: s.engine.startCells.length, duo: s.engine.combos.instances.find(i => i.defId === 'duo').bonus };
  });
  assert.equal(fallback.interval, null);
  assert.equal(fallback.starts, 1);
  assert.equal(fallback.duo, 0.2);
  assert.equal(errors.length, 0, errors.join('; '));
  console.log(JSON.stringify({ plain, tuned, fallback, errors }));
} finally { await browser.close(); }
