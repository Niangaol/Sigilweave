import { chromium, firefox } from 'playwright';
import assert from 'node:assert/strict';
const browser = process.env.BROWSER === 'firefox'
  ? await firefox.launch()
  : await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto((process.env.BASE_URL ?? 'http://127.0.0.1:5173') + '/?seed=layout-check');
  await page.waitForFunction(() => window.__SIGILWEAVE__?.scene.isActive('TitleScene'));
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__SIGILWEAVE__?.scene.isActive('LoadoutScene'));
  await page.keyboard.press('Enter'); // 默认套装出发
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.player);
  const start = await page.evaluate(() => ({ y: window.__SIGILWEAVE_BATTLE__.player.y, cameraY: window.__SIGILWEAVE_BATTLE__.cameras.main.scrollY }));
  await page.keyboard.down('ArrowDown');
  await page.waitForFunction(y => window.__SIGILWEAVE_BATTLE__.player.y > y + 80, start.y);
  await page.keyboard.up('ArrowDown');
  const lowerMap = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return { playerY: s.player.y, cameraY: s.cameras.main.scrollY, lv: s.hud.lvText.text, exp: s.hud.expText.text, hudFixed: [s.hud.hpText, s.hud.shardText, s.hud.freqText, s.hud.actText, s.hud.timeText, s.hud.lvText, s.hud.expText].every(t => t.scrollFactorX === 0 && t.scrollFactorY === 0) };
  });
  assert(lowerMap.playerY > start.y + 80, '必须实际向世界下方移动');
  assert(lowerMap.cameraY > start.cameraY + 30, '镜头必须跟随玩家移动');
  assert.equal(lowerMap.hudFixed, true, '顶栏文字必须固定视口');
  assert.equal(lowerMap.lv, 'LV 1');
  assert.equal(lowerMap.exp, 'EXP 0/10');
  await page.keyboard.down('Space');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__.paused);
  await page.screenshot({ path: 'docs/布局修正-暂停.png' });
  await page.keyboard.up('Space');
  await page.waitForFunction(() => !window.__SIGILWEAVE_BATTLE__.paused);
  await page.screenshot({ path: 'docs/布局修正-地图与罗盘.png' });
  assert.equal(errors.length, 0, errors.join('; '));
  console.log(JSON.stringify({ lowerMap, pauseAndResume: true, errors }));
} finally {
  await browser.close();
}
