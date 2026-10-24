// 鼠标可达性回归：所有需要“选”的地方都必须能用鼠标点完成，不能只有键盘路径。
// 覆盖：标题开始、选包卡片、进入战斗按钮、升级三选一、暂停菜单四项、结算页再战。
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const VIEW = { width: 1920, height: 1080 };
const SCALE = Math.floor(Math.min(VIEW.width / 480, VIEW.height / 270)); // 与 main.js 同一算法
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: VIEW });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const click = async (lx, ly) => { await page.mouse.click(lx * SCALE, ly * SCALE, { delay: 50 }); };
  const done = {};

  await page.goto(BASE + '/?seed=pointer-smoke');
  await page.waitForFunction(() => window.__SIGILWEAVE__?.scene.isActive('TitleScene'));
  await page.waitForTimeout(600);

  // 1) 标题：点一下开始
  await click(240, 200);
  await page.waitForFunction(() => window.__SIGILWEAVE__?.scene.isActive('LoadoutScene'), null, { timeout: 8000 });
  done.title = 'click';

  // 2) 选包：点卡片切套装，点按钮出战
  await page.waitForTimeout(400);
  const kitBefore = await page.evaluate(() => window.__SIGILWEAVE_LOADOUT__.kitId);
  await click(240, 130);
  await page.waitForTimeout(250);
  const kitAfter = await page.evaluate(() => window.__SIGILWEAVE_LOADOUT__.kitId);
  assert.notEqual(kitAfter, kitBefore, '点击卡片必须切换套装');
  done.loadoutCard = kitBefore + '->' + kitAfter;

  await click(240, 243);
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play', null, { timeout: 15000 });
  done.loadoutStart = 'click';

  // 3) 升级三选一：点卡片进手牌
  await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.queueLevelPicks(1));
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'levelup', null, { timeout: 8000 });
  const handBefore = await page.evaluate(() => Object.values(window.__SIGILWEAVE_BATTLE__.run.hand).reduce((a, b) => a + b, 0));
  await click(132, 135);
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play', null, { timeout: 6000 });
  const handAfter = await page.evaluate(() => Object.values(window.__SIGILWEAVE_BATTLE__.run.hand).reduce((a, b) => a + b, 0));
  assert.equal(handAfter, handBefore + 1, '点击升级卡必须进手牌');
  done.levelupCard = handBefore + '->' + handAfter;

  // 4) 暂停菜单：四项都能点（开菜单本身仍用 Esc，属于全局快捷键）
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.menuOpen === true);
  await click(240, 156); // 编辑法阵
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.editOpen === true, null, { timeout: 6000 });
  done.pauseEdit = 'click';
  await click(434, 236); // 完成
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.editOpen === false, null, { timeout: 6000 });
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.menuOpen === true);
  await click(240, 108); // 继续战斗
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.menuOpen === false, null, { timeout: 6000 });
  done.pauseResume = 'click';

  // 5) 暂停菜单：返回标题（同样点，不按 T）
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.menuOpen === true);
  await click(240, 140);
  await page.waitForFunction(() => window.__SIGILWEAVE__?.scene.isActive('TitleScene'), null, { timeout: 8000 });
  done.pauseTitle = 'click';

  // 6) 暂停菜单：重开本局（点，不按 R）
  await page.goto(BASE + '/?scene=battle&seed=pointer-restart');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  const bootBefore = await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.bootCount);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.menuOpen === true);
  await click(240, 124);
  await page.waitForFunction((b) => window.__SIGILWEAVE_BATTLE__?.bootCount > b, bootBefore, { timeout: 15000 });
  done.pauseRestart = 'click';

  // 7) 结算页：点一下再战
  await page.goto(BASE + '/?scene=gameover');
  await page.waitForFunction(() => window.__SIGILWEAVE__?.scene.isActive('GameOverScene'));
  await page.waitForTimeout(500);
  await click(240, 150);
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play', null, { timeout: 15000 });
  done.gameover = 'click';

  assert.equal(errors.length, 0, errors.join('; '));
  console.log('POINTER_OK', JSON.stringify({ scale: SCALE, done, errors }));
} finally { await browser.close(); }
