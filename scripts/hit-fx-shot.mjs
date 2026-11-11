// 受击细节与停火等待的真实浏览器截图（staged，但用的是真实 Phaser 渲染与场景 API）。
// 用法：先 npm run build，再 npx vite preview --port 4173，然后 node scripts/hit-fx-shot.mjs
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const OUT = process.env.OUT_DIR ?? 'docs/targeting-hit';
await mkdir(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE + '/?scene=battle&seed=hit-fx-shot');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  await sleep(1600); // 等 fadeIn / 开场演出收干净

  const rect = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const r = c.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  });

  // 冻结移动，在玩家右侧放一只不会乱跑的靶子
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    window.__clearFx = () => {
      s.effects.items.length = 0;
      for (const t of s.effects.texts) t.obj.destroy();
      s.effects.texts.length = 0;
      s.effects.g.clear();
    };
    s.player.invulnUntil = Number.MAX_SAFE_INTEGER;
    s.spawnTimer = 1e9;
    for (const e of [...s.enemies]) e.destroy();
    s.enemies.length = 0;
    s.updateEnemies = () => {};
    s.spawnEnemy({ hp: 500, speed: 0, damage: 0, maxAlive: 999 }, { x: s.player.x + 78, y: s.player.y - 6 });
    const e = s.enemies[s.enemies.length - 1];
    e.speed = 0; e.damage = 0; e.maxHp = 500; e.hp = 500; e.hpChip = 500; e.hpSeen = 500;
    e.draw(s.engine.now);
    window.__probeDummy = e;
    window.__clearFx();
  });
  await sleep(350);
  await page.evaluate(() => window.__clearFx());
  await page.screenshot({ path: OUT + '/0-受击前.png', clip: rect });

  // 真实结算一次（走 applySigil：伤害/飘字/火花全部真实），再把受击力度拉满方便截图看清后坐
  const hit = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const e = window.__probeDummy;
    const before = e.hp;
    s.applySigil(5, 'arcane_bolt', { x: e.x, y: e.y }, 0);
    e.hitReact(1, -0.2, 480, s.engine.now);
    e.draw(s.engine.now);
    return { before, after: e.hp, hitPower: e.hitPower, lastHitAmount: e.lastHitAmount };
  });
  console.log('HIT', JSON.stringify(hit));
  await sleep(28);
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    window.__probeDummy.draw(s.engine.now);
  });
  await page.screenshot({ path: OUT + '/1-受击-闪白与火花.png', clip: rect });

  await sleep(110);
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    window.__probeDummy.draw(s.engine.now);
  });
  await page.screenshot({ path: OUT + '/2-受击-后坐残红.png', clip: rect });

  // 停火等待：屏幕内清空后，法杖端点只画一圈待机环，不放弹丸
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    for (const e of [...s.enemies]) e.destroy();
    s.enemies.length = 0;
    window.__clearFx();
    const p = s.player.staffTip();
    s.effects.hold(p.x, p.y, 0xffb44d);
  });
  await sleep(60);
  await page.screenshot({ path: OUT + '/3-屏幕内无目标-停火等待.png', clip: rect });

  console.log(JSON.stringify({ hit, rect, errors }));
} finally { await browser.close(); }
