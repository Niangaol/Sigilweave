// 法阵盘动态细节验收：确认两处编辑器的动画层在跑，并且同一区域前后两帧不同。
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const OUT = 'docs/editor-unify';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE + '/?scene=battle&seed=editor-motion');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  await sleep(600);

  // 战斗内编辑
  await page.evaluate(() => { const s = window.__SIGILWEAVE_BATTLE__; s.run.hand['sigil:starfall'] = 1; });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.menuOpen === true);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.editOpen === true);
  await sleep(500);
  const battleFrames1 = await page.evaluate(() => window.__SIGILWEAVE_BATTLE__?.editAnimFrames ?? 0);
  const boardClip = { x: 10 * 4, y: 42 * 4, width: 224 * 4, height: 210 * 4 };
  const b1 = await page.screenshot({ clip: boardClip, path: OUT + '/motion-战斗内-A.png' });
  await sleep(450);
  const b2 = await page.screenshot({ clip: boardClip, path: OUT + '/motion-战斗内-B.png' });
  const battleFrames2 = await page.evaluate(() => window.__SIGILWEAVE_BATTLE__?.editAnimFrames ?? 0);
  assert.ok(battleFrames1 > 2, '战斗内动态层没有跑起来：' + battleFrames1);
  assert.ok(battleFrames2 > battleFrames1, '战斗内动态层帧数没有增长');
  assert.notEqual(Buffer.compare(b1, b2), 0, '战斗内两帧完全相同，动画可能没画出来');

  // 关掉编辑，进幕间
  await page.evaluate(() => window.__SIGILWEAVE_BATTLE__?.closeGridEdit?.());
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.editOpen === false);
  await page.evaluate(() => {
    const b = window.__SIGILWEAVE_BATTLE__;
    window.__SIGILWEAVE__.scene.start('IntermissionScene', {
      run: structuredClone(b.run),
      report: { triggers: 12, blocked: 1, kills: 26 },
      __cine: false,
    });
  });
  await page.waitForFunction(() => !!window.__SIGILWEAVE_WORKSHOP__?.workshop, null, { timeout: 15000 });
  await sleep(500);
  const workshopFrames1 = await page.evaluate(() => window.__SIGILWEAVE_WORKSHOP__?.animFrames ?? 0);
  const boardClip2 = { x: 10 * 4, y: 72 * 4, width: 224 * 4, height: 124 * 4 };
  const w1 = await page.screenshot({ clip: boardClip2, path: OUT + '/motion-幕间-A.png' });
  await sleep(450);
  const w2 = await page.screenshot({ clip: boardClip2, path: OUT + '/motion-幕间-B.png' });
  const workshopFrames2 = await page.evaluate(() => window.__SIGILWEAVE_WORKSHOP__?.animFrames ?? 0);
  assert.ok(workshopFrames1 > 2, '幕间动态层没有跑起来：' + workshopFrames1);
  assert.ok(workshopFrames2 > workshopFrames1, '幕间动态层帧数没有增长');
  assert.notEqual(Buffer.compare(w1, w2), 0, '幕间两帧完全相同，动画可能没画出来');

  assert.equal(errors.length, 0, errors.join('; '));
  console.log(JSON.stringify({ battleFrames1, battleFrames2, workshopFrames1, workshopFrames2, errors }));
} finally {
  await browser.close();
}
