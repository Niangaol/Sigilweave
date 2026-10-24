import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.goto('http://127.0.0.1:5173/?scene=battle&quick=1&seed=dbg3');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    while (s.run.progression.level < 5) s.run.progression.level++;
  });
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'encounter', null, { timeout: 8000 });
  const before = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return { activeId: s.run.encounters.active.id, activePhase: s.run.encounters.active.phase,
      panelHasSelect: typeof s.encounterPanel.onSelect,
      panelCurrentId: s.encounterPanel.current?.id ?? null,
      sameRef: s.encounterPanel.current === s.run.encounters.active };
  });
  console.log('BEFORE', JSON.stringify(before));
  await page.evaluate(() => { window.__SIGILWEAVE_BATTLE__.selectEncounterAnswer('__proto__'); });
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const a = s.run.encounters.active;
    return { phase: s.phase, activePhase: a.phase, selected: a.selectedChoiceId,
      panelNoteVisible: s.encounterPanel.view.visible };
  });
  console.log('AFTER_SELECT_INVALID', JSON.stringify(after));
} finally { await browser.close(); }
