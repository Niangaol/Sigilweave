// 罗盘放大核查：裁出右下角盘面，确认角落/边上/中心三种装饰可辨识。
import { chromium } from 'playwright';
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/?scene=battle&seed=board-shot');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  await page.waitForTimeout(1200);
  // 盘面在逻辑坐标 326..478 / 174..262，4 倍后即 1304..1912 / 696..1048
  await page.screenshot({ path: 'docs/board-decor.png', clip: { x: 1296, y: 688, width: 624, height: 368 } });
  const zones = await page.evaluate(() => {
    const g = window.__SIGILWEAVE_BATTLE__.grid;
    return g.cells.map(c => ({ id: c.id, unlocked: c.unlocked }));
  });
  console.log(JSON.stringify({ zones, errors }));
} finally { await browser.close(); }
