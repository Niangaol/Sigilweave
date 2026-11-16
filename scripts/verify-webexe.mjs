import { chromium } from 'playwright';

const port = process.env.VERIFY_PORT || '9412';
const out = process.env.VERIFY_PNG || 'release-web/verify.png';

const browser = await chromium.connectOverCDP('http://127.0.0.1:' + port);
const contexts = browser.contexts();
const pages = contexts.flatMap((c) => c.pages());
console.log('pages=' + pages.length);
const page = pages[0];
if (!page) { console.log('no page'); process.exit(1); }
await page.waitForTimeout(2500);
console.log('url=' + page.url());
console.log('title=' + (await page.title()));
const info = await page.evaluate(() => ({
  canvases: document.querySelectorAll('canvas').length,
  canvasSize: (() => { const c = document.querySelector('canvas'); return c ? c.width + 'x' + c.height : null; })(),
  rootTag: document.querySelector('#game-root') ? document.querySelector('#game-root').firstElementChild?.tagName : null,
  hasAudio: typeof AudioContext !== 'undefined',
  webgl: (() => { try { const c = document.createElement('canvas'); return !!c.getContext('webgl2') || !!c.getContext('webgl'); } catch { return false; } })(),
  origin: location.origin,
}));
console.log(JSON.stringify(info));
await page.screenshot({ path: out });
console.log('screenshot=' + out);
await browser.close();
