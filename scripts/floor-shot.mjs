// 地板重制 + 玩家朝向的实机核查截图。
// 用法：node scripts/floor-shot.mjs <输出目录>   （BASE_URL 默认 http://localhost:5180）
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const OUT = process.argv[2] ?? 'docs/地板重制';
const BASE = process.env.BASE_URL ?? 'http://localhost:5180';
const ZOOM = 4; // 1920x1080 下 renderScale = 4
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge' });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.setDefaultTimeout(30000);

  // 1) 一幕战斗：地板全屏
  await page.goto(BASE + '/?scene=battle&seed=floor-shot');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  const bakeMs = await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.background.bakeMs ?? null);
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    s.player.invulnUntil = Number.MAX_SAFE_INTEGER;
    for (const e of s.enemies) e.alive = false;
    s.enemies.length = 0;
    s.spawnTimer = 1e9;
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: OUT + '/1-地板全屏.png' });
  // 地板特写：裁一块没有 UI 遮挡的区域
  await page.screenshot({ path: OUT + '/2-地板特写.png', clip: { x: 320, y: 420, width: 620, height: 420 } });

  // 2) 朝向：真按方向键走，按当前镜头位置裁玩家附近
  const playerClip = async () => page.evaluate((z) => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const cam = s.cameras.main;
    const sx = (s.player.x - cam.worldView.x) * z;
    const sy = (s.player.y - cam.worldView.y) * z;
    return { x: Math.round(sx - 110), y: Math.round(sy - 130), width: 220, height: 180 };
  }, ZOOM);
  const shots = [];
  for (const [key, name] of [['ArrowRight', '3-朝向-向右走'], ['ArrowLeft', '4-朝向-向左走']]) {
    await page.keyboard.down(key);
    await page.waitForTimeout(700);
    await page.screenshot({ path: OUT + '/' + name + '.png', clip: await playerClip() });
    await page.keyboard.up(key);
    await page.waitForTimeout(250);
    shots.push(await page.evaluate(() => {
      const p = window.__SIGILWEAVE_BATTLE__.player;
      return { facing: p.facing, flip: p.sprite?.flipX };
    }));
  }

  // 3) 二 / 三幕回归：旧 drawTiles 路径必须还在（用世界尺寸判断真的换了幕）
  const regress = [];
  for (const [act, name, size] of [[2, '5-二幕回归', 2400 + 1600], [3, '6-三幕回归', 2400 + 1800]]) {
    // 注意：restart() 不带 data 会重建 run（act 回落到 1），必须把 run 一起传进去
    await page.evaluate((a) => {
      const s = window.__SIGILWEAVE_BATTLE__;
      s.run.act = a;
      s.scene.restart({ run: s.run });
    }, act);
    await page.waitForFunction((want) => {
      const s = window.__SIGILWEAVE_BATTLE__;
      return s?.phase === 'play' && (s.world.w + s.world.h) === want;
    }, size);
    await page.waitForTimeout(800);
    await page.screenshot({ path: OUT + '/' + name + '.png' });
    regress.push(await page.evaluate(() => ({
      act: window.__SIGILWEAVE_BATTLE__.act,
      floorImg: !!window.__SIGILWEAVE_BATTLE__.background.floorImg,
    })));
  }

  // 4) 实战：回到一幕，灌一批敌人看地板会不会把角色/特效压掉
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    s.run.act = 1;
    s.scene.restart({ run: s.run });
  });
  await page.waitForFunction(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return s?.phase === 'play' && (s.world.w + s.world.h) === 3360;
  });
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    s.player.invulnUntil = Number.MAX_SAFE_INTEGER;
    for (let i = 0; i < 18; i++) s.spawnEnemy({ hp: 30, speed: 12, damage: 6, maxAlive: 999 });
  });
  await page.waitForTimeout(2600);
  if (await page.evaluate(() => window.__SIGILWEAVE_BATTLE__?.phase === 'levelup')) {
    await page.keyboard.press('Digit1');
    await page.waitForTimeout(1200);
  }
  await page.screenshot({ path: OUT + '/7-实战.png' });

  console.log(JSON.stringify({ bakeMs, shots, regress, errors }));
} finally {
  await browser.close();
}
