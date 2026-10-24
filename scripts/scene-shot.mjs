// 其余场景可读性核查：幕间工作台、结算页（大屏尺寸）。
import { chromium } from 'playwright';
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/?scene=gameover');
  await page.waitForFunction(() => window.__SIGILWEAVE__?.scene.isActive('GameOverScene'));
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'docs/text-gameover-1920.png' });
  // 幕间：走一次快速流程进工作台
  await page.goto(BASE + '/?scene=battle&seed=intermission-shot&quick=1');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    s.run.progression.level = 5; // 触发大Boss等级线
  });
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'encounter', null, { timeout: 15000 });
  const idx = await page.evaluate(() => {
    const a = window.__SIGILWEAVE_BATTLE__.run.encounters.active;
    return a.choices.findIndex(c => c.id === a.correctChoiceId);
  });
  await page.evaluate((i) => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const r = s.encounterPanel.rects?.[i];
    if (r) s.selectEncounterAnswer(s.run.encounters.active.choices[i].id);
  }, idx);
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.confirmEncounterAnswer());
  await page.waitForTimeout(600);
  await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.continueEncounter());
  await page.waitForFunction(() => !!window.__SIGILWEAVE_WORKSHOP__, null, { timeout: 20000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'docs/text-intermission-1920.png' });
  console.log(JSON.stringify({ ok: true, errors }));
} finally { await browser.close(); }
