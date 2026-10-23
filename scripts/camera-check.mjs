import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/?scene=battle&seed=world-check');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  const before = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return { px: s.player.x, py: s.player.y, sx: s.cameras.main.scrollX, sy: s.cameras.main.scrollY, world: s.world };
  });
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(2500);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(1500);
  await page.keyboard.up('ArrowUp');
  const mid = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return { px: s.player.x, py: s.player.y, sx: s.cameras.main.scrollX, sy: s.cameras.main.scrollY,
      enemies: s.enemies.length, hudFixed: s.hud.bg.scrollFactorX };
  });
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(6000);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(6000);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('ArrowLeft');
  const clamped = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return { px: Math.round(s.player.x), py: Math.round(s.player.y), sx: Math.round(s.cameras.main.scrollX), sy: Math.round(s.cameras.main.scrollY) };
  });
  await page.screenshot({ path: 'docs/p6-大地图行走.png' });
  console.log(JSON.stringify({ before, mid, clamped, errors }));
} finally { await browser.close(); }
