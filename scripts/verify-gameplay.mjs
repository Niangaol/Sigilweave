import { chromium } from 'playwright';
const port = process.env.VERIFY_PORT || '9418';
const browser = await chromium.connectOverCDP('http://127.0.0.1:' + port);
const page = browser.contexts().flatMap((c) => c.pages())[0];
await page.waitForTimeout(1500);
await page.screenshot({ path: 'release-web/game-title.png' });
await page.keyboard.press('Enter');
await page.waitForTimeout(1200);
await page.mouse.click(640, 380);
await page.waitForTimeout(5000);
const state = await page.evaluate(() => ({
  title: document.title,
  canvases: document.querySelectorAll('canvas').length,
  size: (() => { const c = document.querySelector('canvas'); return c ? c.width + 'x' + c.height : null; })(),
}));
console.log(JSON.stringify(state));
await page.screenshot({ path: 'release-web/game-play.png' });
console.log('ok');
await browser.close();
