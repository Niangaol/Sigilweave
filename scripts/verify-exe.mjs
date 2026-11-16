import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9411', { timeout: 30000 });
const pages = browser.contexts().flatMap((c) => c.pages());
console.log('pages=' + pages.length);
const page = pages[0];
console.log('url=' + page.url());
console.log('title=' + (await page.title()));
await page.waitForTimeout(4000);
const info = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  return {
    canvases: document.querySelectorAll('canvas').length,
    canvasSize: c ? c.width + 'x' + c.height : null,
    rootTag: document.querySelector('#game-root')?.firstElementChild?.tagName ?? null,
    rootChildren: document.querySelector('#game-root')?.children.length ?? -1,
    hasAudio: typeof window.AudioContext !== 'undefined',
    webgl: !!document.createElement('canvas').getContext('webgl2'),
  };
});
console.log(JSON.stringify(info));
await page.screenshot({ path: process.env.VERIFY_PNG || 'release-out/exe-verify.png' });
await browser.close();
