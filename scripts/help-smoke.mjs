// 验证玩法说明面板与暂停诊断：H 开关、暂停显示联组/断链统计。
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/');
  await page.waitForFunction(() => window.__SIGILWEAVE__?.scene.isActive('TitleScene'));
  await page.keyboard.press('KeyH');
  await page.waitForFunction(() => window.__SIGILWEAVE_TITLE_HELP__ === true);
  const help = await page.evaluate(() => {
    const texts = window.__SIGILWEAVE__.scene.getScene('TitleScene').children.list
      .filter(x => x.type === 'Text').map(x => x.text);
    return { hasResonance: texts.some(t => t.includes('共鸣石')), hasBreak: texts.some(t => t.includes('断链')), hasQuiz: texts.some(t => t.includes('问答')) };
  });
  assert.deepEqual(help, { hasResonance: true, hasBreak: true, hasQuiz: true });
  await page.screenshot({ path: 'docs/p5-玩法说明.png' });
  await page.keyboard.press('KeyH');
  await page.waitForFunction(() => window.__SIGILWEAVE_TITLE_HELP__ === false);

  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__SIGILWEAVE__?.scene.isActive('LoadoutScene'));
  await page.keyboard.press('Enter'); // 默认套装疾风出发
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  // 等几次触发，保证暂停诊断有真实数据
  await page.waitForTimeout(12000); // 第一幕 2s 间隔，等足几次触发再开暂停
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.menuOpen === true);
  const diag = await page.evaluate(() => {
    const menu = window.__SIGILWEAVE_BATTLE__.pauseMenu;
    return { visible: menu.diag.visible, text: menu.diag.text };
  });
  assert.equal(diag.visible, true);
  assert.match(diag.text, /联组 [1-9]/);
  assert.match(diag.text, /断链：冷却/);
  await page.screenshot({ path: 'docs/p5-暂停诊断.png' });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.menuOpen === false);
  assert.equal(errors.length, 0, errors.join('; '));
  console.log(JSON.stringify({ help, diag, errors }));
} finally { await browser.close(); }
