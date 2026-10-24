import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.goto('http://127.0.0.1:5173/?scene=battle&seed=gate-probe');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const gate = s.eventPoints.find(p => p.type === 'miniboss' && !p.done);
    window.__GATE__ = gate ? { id: gate.id, x: gate.x, y: gate.y } : null;
    if (gate) { s.player.x = gate.x; s.player.y = gate.y + 12; }
  });
  await page.waitForTimeout(800);
  const state = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return {
      phase: s.phase,
      gate: window.__GATE__,
      px: Math.round(s.player.x), py: Math.round(s.player.y),
      completed: Object.keys(s.run.encounters.completed),
      active: s.run.encounters.active ? s.run.encounters.active.id : null,
      dist: window.__GATE__ ? Math.round(Math.hypot(s.player.x - window.__GATE__.x, s.player.y - window.__GATE__.y)) : null,
    };
  });
  console.log(JSON.stringify(state));
} finally { await browser.close(); }
