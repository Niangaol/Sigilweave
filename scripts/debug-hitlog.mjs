import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.goto('http://127.0.0.1:5173/?scene=battle&quick=1&seed=enc-b');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  const click = (x, y) => page.mouse.click(x * 2, y * 2, { delay: 60 });
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const p = s.eventPoints.find(p => p.type === 'npc' && !p.done);
    s.player.x = p.x; s.player.y = p.y + 12;
  });
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'encounter', null, { timeout: 20000 });
  const wrongIdx = await page.evaluate(() => {
    const a = window.__SIGILWEAVE_BATTLE__.run.encounters.active;
    return a.choices.findIndex(c => c.id !== a.correctChoiceId);
  });
  await click(240, 156 + wrongIdx * 23);
  await click(396, 238);
  await click(369, 236);
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play', null, { timeout: 8000 });
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    while (s.run.progression.level < 5) s.run.progression.level++;
  });
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'encounter', null, { timeout: 8000 });
  const wrongIdx2 = await page.evaluate(() => {
    const a = window.__SIGILWEAVE_BATTLE__.run.encounters.active;
    return a.choices.findIndex(c => c.id !== a.correctChoiceId);
  });
  await click(240, 156 + wrongIdx2 * 23);
  await click(396, 238);
  await page.waitForTimeout(500);
  const log = await page.evaluate(() => ({ hitlog: window.__HITLOG__, selected: window.__SIGILWEAVE_BATTLE__.run.encounters.active?.selectedChoiceId ?? null }));
  console.log('LOG', JSON.stringify(log));
} finally { await browser.close(); }
