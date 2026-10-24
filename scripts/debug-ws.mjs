import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.goto('http://127.0.0.1:5173/?scene=battle&quick=1&seed=dbg-ws');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  const click = (x, y) => page.mouse.click(x * 2, y * 2, { delay: 60 });
  const goToEvent = (type) => page.evaluate((type) => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const p = s.eventPoints.find(p => p.type === type && !p.done);
    s.player.x = p.x; s.player.y = p.y + 12;
  }, type);
  const answer = async () => {
    const idx = await page.evaluate(() => {
      const a = window.__SIGILWEAVE_BATTLE__.run.encounters.active;
      return a.choices.findIndex(c => c.id === a.correctChoiceId);
    });
    await click(240, 156 + idx * 23);
    await click(396, 238);
  };
  await goToEvent('npc'); await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'encounter');
  await answer(); await click(369, 236);
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  await page.evaluate(() => { const s = window.__SIGILWEAVE_BATTLE__; while (s.run.progression.level < 5) s.run.progression.level++; });
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'encounter');
  await answer(); await click(369, 236);
  await page.waitForTimeout(2500);
  const state = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return { phase: s.phase, bossDefeated: s.bossDefeated, workshop: !!window.__SIGILWEAVE_WORKSHOP__,
      scenes: window.__SIGILWEAVE__.scene.getScenes(true).map(x => x.scene.key),
      resolutions: Object.keys(s.run.bossResolutions) };
  });
  console.log(JSON.stringify(state));
  await page.screenshot({ path: 'docs/p6-调试.png' });
} finally { await browser.close(); }
