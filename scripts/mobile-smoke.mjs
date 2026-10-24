// 手机端冒烟：竖屏（393×851 / DPR2 / 触摸）与横屏（851×393）下验证
// ①画布铺满宽度且内部按 DPR 出图（不被浏览器拉伸）②按住方向键人物真的走、松手停
// ③暂停按钮打开菜单、点菜单行返回 ④竖屏罗盘已绘制。触摸用 CDP 真实事件（合成事件进不了 Phaser 输入）。
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173';

async function runCase(browser, { name, width, height, dsf, portrait }) {
  const page = await browser.newPage({
    viewport: { width, height }, deviceScaleFactor: dsf, hasTouch: true, isMobile: true,
  });
  const cdp = await page.context().newCDPSession(page);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/?scene=battle&quick=1&seed=mobile-smoke');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play', null, { timeout: 30000 });
  const done = {};

  // 逻辑坐标 -> CSS 坐标（竖屏画布逻辑高 760，横屏 270）
  const cssOf = (lx, ly) => page.evaluate(({ lx, ly }) => {
    const cv = document.querySelector('canvas');
    const r = cv.getBoundingClientRect();
    const lh = window.innerHeight > window.innerWidth * 1.02 ? 760 : 270;
    return { x: r.left + lx * r.width / 480, y: r.top + ly * r.height / lh };
  }, { lx, ly });
  const touch = async (phase, id, lx, ly) => {
    const pt = await cssOf(lx, ly);
    await cdp.send('Input.dispatchTouchEvent', {
      type: phase, touchPoints: phase === 'touchEnd' ? [] : [{ x: pt.x, y: pt.y, id }],
    });
  };

  // ① 画布分辨率：竖屏铺满宽度；横屏 16:9 画面在 21:9 屏上高度铺满、宽度留黑边（正常）
  // 关键：内部出图按 DPR 放大（gameW 远大于 CSS 宽），不是 1:1 交给浏览器拉伸
  const size = await page.evaluate(() => {
    const cv = document.querySelector('canvas');
    const r = cv.getBoundingClientRect();
    return { cssW: Math.round(r.width), cssH: Math.round(r.height), gameW: window.__SIGILWEAVE__.scale.width };
  });
  if (portrait) assert.equal(size.cssW, width, name + ' 竖屏画布应铺满宽度');
  else {
    assert.equal(size.cssH, height, name + ' 横屏画布应铺满高度');
    assert.ok(size.cssW >= width * 0.7, name + ' 横屏留黑边不应超过 30%');
  }
  assert.ok(size.gameW >= size.cssW * 1.5, name + ' 内部出图应达到 DPR 而非 1:1 拉伸（gameW=' + size.gameW + '）');
  done.canvas = size.cssW + 'x' + size.cssH + ' game=' + Math.round(size.gameW);

  // ② 按住方向键（右）：axis=1 且人物持续右移；松手归零
  const dir = portrait ? { x: 174, y: 592 } : { x: 122, y: 202 };
  await touch('touchStart', 1, dir.x, dir.y);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.touch.axis.x), 1, name + ' 方向键右应给出 axis.x=1');
  const x0 = await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.player.x);
  await page.waitForTimeout(400);
  const x1 = await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.player.x);
  assert.ok(x1 > x0 + 5, name + ' 按住方向键人物应持续右移（' + x0 + '→' + x1 + '）');
  await touch('touchEnd', 1, dir.x, dir.y);
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.touch.axis.x), 0, name + ' 松手应停止');
  done.dpad = 'move+release ok';

  // ③ 暂停按钮 → 菜单打开 → 点「继续战斗」行返回
  const pause = portrait ? { x: 388, y: 590 } : { x: 192, y: 222 };
  await touch('touchStart', 2, pause.x, pause.y);
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.menuOpen), true, name + ' 暂停按钮应打开菜单');
  await touch('touchEnd', 2, pause.x, pause.y);
  done.pauseButton = 'opens menu';
  await touch('touchStart', 3, 240, 108);
  await touch('touchEnd', 3, 240, 108);
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.menuOpen === false, null, { timeout: 6000 });
  done.menuRow = 'resume by tap';

  // ④ 竖屏：罗盘画在触控台
  if (portrait) {
    const cmds = await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.board.baseG.commandBuffer?.length ?? -1);
    assert.ok(cmds > 0, name + ' 竖屏罗盘应有绘制内容');
    done.board = 'console board drawn';
  }

  assert.equal(errors.length, 0, errors.join('; '));
  console.log('MOBILE_OK', name, JSON.stringify({ done, errors }));
  await page.close();
}

const browser = await chromium.launch({ channel: 'msedge' });
try {
  await runCase(browser, { name: 'portrait-393x851', width: 393, height: 851, dsf: 2, portrait: true });
  await runCase(browser, { name: 'landscape-851x393', width: 851, height: 393, dsf: 2, portrait: false });
} finally { await browser.close(); }
