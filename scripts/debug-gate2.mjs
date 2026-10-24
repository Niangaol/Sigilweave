import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.goto('http://127.0.0.1:5173/?scene=battle&seed=gate2');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  const click = (x, y) => page.mouse.click(x * 2, y * 2, { delay: 60 });
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const gate = s.eventPoints.find(p => p.type === 'miniboss');
    s.player.x = gate.x; s.player.y = gate.y + 12;
  });
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'encounter');
  const cam1 = await page.evaluate(() => { const c = window.__SIGILWEAVE_BATTLE__.cameras.main; return { sx: Math.round(c.scrollX), sy: Math.round(c.scrollY) }; });
  console.log('CAM', JSON.stringify(cam1));
  const wrongIdx = await page.evaluate(() => {
    const a = window.__SIGILWEAVE_BATTLE__.run.encounters.active;
    return a.choices.findIndex(c => c.id !== a.correctChoiceId);
  });
  await click(240, 156 + wrongIdx * 23);
  const afterSelect = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const a = s.run.encounters.active;
    const cam = s.cameras.main;
    return { selected: a.selectedChoiceId, zones: s.encounterPanel.zones.map(z => ({ x: Math.round(z.x), y: Math.round(z.y), w: z.w, h: z.h, visible: z.visible, sf: z.scrollFactorX })), cam: { sx: Math.round(cam.scrollX), sy: Math.round(cam.scrollY) } };
  });
  console.log('AFTER_SELECT', JSON.stringify(afterSelect));
} finally { await browser.close(); }
