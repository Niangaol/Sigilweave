// 画框三档血量截图：完好 / 陈旧 / 破损，各截一张 1920×1080。
// 用 TitleScene 自带的调试直达 (?scene=battle) 跳过开场过场与套装选择。
import { chromium } from 'playwright';
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE + '/?seed=frame&scene=battle');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  const shots = [
    ['intact', 1],
    ['worn', 0.45],
    ['failing', 0.15],
  ];
  for (const [name, ratio] of shots) {
    await page.evaluate((r) => {
      const s = window.__SIGILWEAVE_BATTLE__;
      s.player.invulnUntil = Number.MAX_SAFE_INTEGER; // 只为看框，不让玩家被打死
      s.player.shield = 0;
      s.player.hp = Math.max(1, Math.round(s.player.maxHp * r));
    }, ratio);
    // 等一个档位切换 + 至少一次重绘
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `docs/frame-${name}.png` });
  }
  console.log(JSON.stringify({ errors }));
} finally {
  await browser.close();
}
