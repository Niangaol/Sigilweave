// 玩家朝向特写：按真实方向键分别走左右，各自裁一张贴脸特写。
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
const OUT = process.argv[2] ?? 'docs/地板重制/facing';
const BASE = process.env.BASE_URL ?? 'http://localhost:5180';
const ZOOM = 4;
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge' });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE + '/?scene=battle&seed=facing-shot');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    s.player.invulnUntil = Number.MAX_SAFE_INTEGER;
    for (const e of s.enemies) e.alive = false;
    s.enemies.length = 0;
    s.spawnTimer = 1e9;
  });
  const clip = async () => page.evaluate((z) => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const cam = s.cameras.main;
    const sx = (s.player.x - cam.worldView.x) * z;
    const sy = (s.player.y - cam.worldView.y) * z;
    return { x: Math.round(sx - 90), y: Math.round(sy - 120), width: 180, height: 160 };
  }, ZOOM);
  for (const [key, name] of [['ArrowRight', '1-向右走'], ['ArrowLeft', '2-向左走']]) {
    await page.keyboard.down(key);
    await page.waitForTimeout(800);
    await page.screenshot({ path: OUT + '/' + name + '.png', clip: await clip() });
    await page.keyboard.up(key);
    await page.waitForTimeout(300);
  }
  const st = await page.evaluate(() => {
    const p = window.__SIGILWEAVE_BATTLE__.player;
    return { facing: p.facing, flip: p.sprite?.flipX, anim: p.sprite?.anims?.currentAnim?.key };
  });
  console.log(JSON.stringify({ st, errors }));
} finally { await browser.close(); }
