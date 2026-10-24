import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.goto('http://127.0.0.1:5173/?scene=battle&quick=1&seed=probe');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  const before = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return { points: s.eventPoints.map(p => ({ id: p.id, type: p.type, x: p.x, y: p.y, done: p.done, radius: p.radius })), px: s.player.x, py: s.player.y, hasFn: typeof s.checkProgressEvents };
  });
  console.log('BEFORE', JSON.stringify(before));
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const p = s.eventPoints.find(p => p.type === 'npc');
    s.player.x = p.x; s.player.y = p.y + 12;
  });
  await page.waitForTimeout(1000);
  const after = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return { phase: s.phase, px: Math.round(s.player.x), py: Math.round(s.player.y), completed: s.run.encounters.completed, active: s.run.encounters.active?.id ?? null };
  });
  console.log('AFTER', JSON.stringify(after));
} finally { await browser.close(); }
