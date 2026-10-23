import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.goto('http://127.0.0.1:5173/?scene=battle&seed=dbg');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    while (s.run.progression.level < 5) s.run.progression.level++;
  });
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'encounter', null, { timeout: 8000 });
  const idx = await page.evaluate(() => {
    const a = window.__SIGILWEAVE_BATTLE__.run.encounters.active;
    return a.choices.findIndex(c => c.id === a.correctChoiceId);
  });
  console.log('IDX', idx);
  await page.mouse.click(480, (156 + idx * 23) * 2, { delay: 60 });
  const afterSelect = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return { phase: s.phase, selected: s.run.encounters.active.selectedChoiceId, panelVisible: s.encounterPanel.view.visible };
  });
  console.log('AFTER_SELECT', JSON.stringify(afterSelect));
  await page.mouse.click(792, 476, { delay: 60 });
  await page.waitForTimeout(500);
  const afterConfirm = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return { phase: s.phase, bossDefeated: s.bossDefeated, result: s.run.encounters.active?.result, note: s.encounterPanel.current ? 'panel' : 'none' };
  });
  console.log('AFTER_CONFIRM', JSON.stringify(afterConfirm));
  await page.screenshot({ path: 'docs/p6-调试.png' });
} finally { await browser.close(); }
