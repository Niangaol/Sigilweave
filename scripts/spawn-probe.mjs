import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.goto('http://127.0.0.1:5173/?scene=battle&seed=spawn-probe');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  await page.waitForTimeout(4000);
  const probe = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return { enemies: s.enemies.length, spawnTimer: s.spawnTimer, now: s.engine.now,
      phase: s.phase, paused: s.paused, types: s.enemies.map(e => e.defId) };
  });
  await page.waitForTimeout(4000);
  const probe2 = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return { enemies: s.enemies.length, spawnTimer: Math.round(s.spawnTimer), now: Math.round(s.engine.now),
      positions: s.enemies.map(e => [Math.round(e.x), Math.round(e.y)]) };
  });
  console.log(JSON.stringify({ probe, probe2 }));
} finally { await browser.close(); }
