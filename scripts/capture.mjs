import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'load' });
await page.waitForTimeout(800);
await page.keyboard.press('Space');
await page.waitForTimeout(900);

// 轮询到下一次触发立刻截图，捕捉方位光迹
let before = await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.engine.stats.triggers);
let hit = false;
for (let i = 0; i < 120; i++) {
  await page.waitForTimeout(40);
  const now = await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.engine.stats.triggers);
  if (now > before) { hit = true; break; }
}
await page.screenshot({ path: "docs/p1-方位光迹.png" });

// 继续跑，等敌人靠近再截一张战斗态势
await page.waitForTimeout(4000);
await page.screenshot({ path: "docs/p1-战斗中.png" });

// 按住空格：暂停观察态
await page.keyboard.down('Space');
await page.waitForTimeout(500);
await page.screenshot({ path: "docs/p1-暂停观察.png" });
await page.keyboard.up('Space');

const st = await page.evaluate(() => {
  const s = window.__SIGILWEAVE_BATTLE__;
  return {
    triggers: s.engine.stats.triggers,
    combos: s.engine.stats.combos,
    alive: s.enemies.filter((e) => e.alive).length,
    pausedAfter: s.engine.paused,
  };
});
await browser.close();
console.log(JSON.stringify({ hitTrace: hit, st, errors }));
