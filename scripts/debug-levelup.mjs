import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  await page.goto('http://127.0.0.1:5173/?scene=battle&seed=probe');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  await page.evaluate(() => { window.__SIGILWEAVE_BATTLE__.queueLevelPicks(1); });
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'levelup');
  const state1 = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return { rects: s.levelupRects?.length, hasHandler: !!s.levelupHandler, phase: s.phase };
  });
  console.log('STATE1', JSON.stringify(state1));
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(600);
  const state2 = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return { phase: s.phase, pending: s.pendingPicks, hand: s.run.hand };
  });
  console.log('STATE2_AFTER_KEY', JSON.stringify(state2));
  if (state2.phase === 'levelup') {
    await page.evaluate(() => {
      const s = window.__SIGILWEAVE_BATTLE__;
      s.pickLevelupCard(s.levelupRects[0].card);
    });
    await page.waitForTimeout(400);
    const state3 = await page.evaluate(() => ({ phase: window.__SIGILWEAVE_BATTLE__.phase, hand: window.__SIGILWEAVE_BATTLE__.run.hand }));
    console.log('STATE3_AFTER_DIRECT', JSON.stringify(state3));
  }
} finally { await browser.close(); }
