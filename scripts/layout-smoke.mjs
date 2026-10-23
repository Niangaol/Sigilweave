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
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.player);
  await page.keyboard.down('ArrowDown');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__.player.y > 210);
  await page.keyboard.up('ArrowDown');
  const lowerMap = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return { playerY: s.player.y };
  });
  assert(lowerMap.playerY > 210, '角色必须能进入原先被法阵占据的下半屏');
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
