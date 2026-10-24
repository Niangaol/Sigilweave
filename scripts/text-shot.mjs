// 文字渲染核查：按真实大屏尺寸截图，确认渲染倍率与文字纹理密度匹配（不再是放大位图）。
import { chromium } from 'playwright';
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const sizes = (process.env.SIZES ?? '1920x1080,2560x1440').split(',').map(s => s.split('x').map(Number));
const browser = await chromium.launch({ channel: 'msedge' });
try {
  for (const [w, h] of sizes) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE + '/?seed=textcheck');
    await page.waitForFunction(() => window.__SIGILWEAVE__?.scene.isActive('TitleScene'));
    await page.waitForTimeout(700);
    const geo = await page.evaluate(() => {
      const g = window.__SIGILWEAVE__;
      const cam = g.scene.getScene('TitleScene').cameras.main;
      return {
        game: { w: g.scale.width, h: g.scale.height },
        canvasCss: { w: g.canvas.clientWidth, h: g.canvas.clientHeight },
        canvasBacking: { w: g.canvas.width, h: g.canvas.height },
        zoom: cam.zoom,
        oneToONe: g.canvas.clientWidth === g.canvas.width && g.canvas.clientHeight === g.canvas.height,
      };
    });
    await page.screenshot({ path: `docs/text-title-${w}.png` });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__SIGILWEAVE__?.scene.isActive('LoadoutScene'));
    await page.waitForTimeout(450);
    await page.screenshot({ path: `docs/text-loadout-${w}.png` });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play', null, { timeout: 20000 });
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `docs/text-battle-${w}.png` });
    console.log(JSON.stringify({ w, h, geo, errors }));
    await page.close();
  }
} finally { await browser.close(); }
