// 生成法阵盘动态预览 GIF：12 帧 / 100ms，只截 4×4 板面。
import { chromium } from 'playwright';
import { mkdir, rm } from 'node:fs/promises';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const DIR = 'docs/editor-unify/_frames';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await rm(DIR, { recursive: true, force: true });
await mkdir(DIR, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE + '/?scene=battle&seed=editor-motion-gif');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  await sleep(500);
  await page.evaluate(() => { const s = window.__SIGILWEAVE_BATTLE__; s.run.hand['sigil:starfall'] = 1; });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.menuOpen === true);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.editOpen === true);
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    s.editSelected = 'sigil:starfall';
    s.editFocus = 5;
    s.drawGridEdit();
  });
  await sleep(300);
  const clip = { x: 10 * 4, y: 42 * 4, width: 224 * 4, height: 210 * 4 };
  for (let i = 0; i < 12; i++) {
    await page.screenshot({ path: DIR + '/f' + String(i).padStart(2, '0') + '.png', clip });
    await sleep(100);
  }
  if (errors.length) throw new Error(errors.join('; '));
  console.log(JSON.stringify({ frames: 12, errors }));
} finally {
  await browser.close();
}
