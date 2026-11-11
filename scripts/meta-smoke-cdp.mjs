// 残响祭坛冒烟：?scene=meta 直达、?resonance=999 验收、两页切换、升级扣残响、标题 B 键入口。
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const shot = (page, name) => page.screenshot({ path: 'docs/' + name });
// 沙箱不允许 spawn 浏览器：连到已在沙箱外启动的 Edge（--remote-debugging-port=9222）
const browser = await chromium.connectOverCDP(process.env.CDP_URL ?? 'http://127.0.0.1:9222');
try {
  const context = browser.contexts()[0] ?? await browser.newContext();
  const page = context.pages()[0] ?? await context.newPage();
  await page.setViewportSize({ width: 960, height: 540 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(BASE + '/');
  await page.evaluate(() => localStorage.clear());

  // 1) 直达 + 验收残响
  await page.goto(BASE + '/?scene=meta&resonance=999');
  await page.waitForFunction(() => window.__SIGILWEAVE_META__?.save);
  const first = await page.evaluate(() => window.__SIGILWEAVE_META__);
  assert.equal(first.save.resonance, 999, '?resonance=999 应灌满残响');
  assert.equal(first.page, 0, '默认停在被动升级页');
  const leveled = await page.evaluate(() => Object.values(window.__SIGILWEAVE_META__.save.levels).filter((n) => n > 0).length);
  assert.equal(leveled, 0, '初始 11 条被动全为 0 级');
  await page.waitForTimeout(200);
  await shot(page, 'p7-残响祭坛-被动页.png');

  // 2) 升级第一条：Enter 扣 10 残响、等级 +1
  const pickedId = await page.evaluate(() => window.__SIGILWEAVE_META__.selected);
  await page.keyboard.press('Enter');
  const afterUpgrade = await page.evaluate(() => window.__SIGILWEAVE_META__);
  const picked = afterUpgrade.save.levels[pickedId];
  assert.equal(picked, 1, 'Enter 应把选中被动升到 1 级');
  assert.equal(afterUpgrade.save.resonance, 989, '升级应扣 10 残响');
  await page.waitForTimeout(200);
  await shot(page, 'p7-残响祭坛-升级后.png');

  // 3) 升到上限 2 后被拦
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  const capped = await page.evaluate(() => ({ s: window.__SIGILWEAVE_META__, levels: window.__SIGILWEAVE_META__.save.levels }));
  assert.equal(capped.levels[pickedId], 2, '默认上限 2 级');
  assert.match(String(capped.s.lastMessage ?? ''), /上限|首杀/, '到上限应给出提示');
  await shot(page, 'p7-残响祭坛-上限提示.png');

  // 4) Tab 切到契约图鉴页
  await page.keyboard.press('Tab');
  await page.waitForFunction(() => window.__SIGILWEAVE_META__.page === 1);
  const unlocked = await page.evaluate(() => window.__SIGILWEAVE_META__.save.milestones.length);
  assert.equal(unlocked, 0, '新档没有任何契约节点');
  await page.waitForTimeout(200);
  await shot(page, 'p7-残响祭坛-契约图鉴.png');

  // 5) 标题 B 键进祭坛
  await page.goto(BASE + '/?cine=0');
  await page.waitForFunction(() => window.__SIGILWEAVE__?.scene?.isActive('TitleScene'));
  await page.keyboard.press('KeyB');
  await page.waitForFunction(() => window.__SIGILWEAVE__?.scene?.isActive('MetaScene'), null, { timeout: 5000 });
  assert.equal(errors.length, 0, '页面无运行时报错: ' + errors.join(' | '));
  console.log('META_SMOKE_OK');
} finally {
  await browser.close();
}