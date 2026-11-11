// 索敌与拥挤回归（2026-11-09 口径：只打屏幕内）
// 1) 屏幕外的敌人不得被攻击命中；屏幕内的敌人照常被打
// 2) 屏幕内没有任何可选目标时，输出符印「停火等待」，不放空炮
// 3) 灌满同屏后敌人之间要拉开间距，不叠成一坨
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE + '/?scene=battle&seed=targeting-smoke');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');

  // ---------- 1. 屏幕内空场时停火 ----------
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    s.player.invulnUntil = Number.MAX_SAFE_INTEGER;
    s.spawnTimer = 1e9;                       // 关掉自然刷怪
    for (const e of [...s.enemies]) e.destroy();
    s.enemies.length = 0;
    s.__fired = 0;
    const orig = s.fireProjectile.bind(s);
    s.fireProjectile = (...args) => { s.__fired += 1; return orig(...args); };
  });
  await page.waitForTimeout(3800);
  const hold = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return { fired: s.__fired, triggers: s.engine.stats.triggers, view: {
      x: s.cameras.main.worldView.x, y: s.cameras.main.worldView.y,
      w: s.cameras.main.worldView.width, h: s.cameras.main.worldView.height,
    } };
  });
  console.log('HOLD', JSON.stringify(hold));
  assert.equal(hold.fired, 0, '屏幕内一个目标都没有时不应放弹丸，实际 ' + hold.fired);
  assert(hold.triggers > 0, '引擎应继续触发（只是不发射），实际 triggers=' + hold.triggers);

  // ---------- 2. 可控靶子：屏内必中，屏外必不中 ----------
  // 冻结敌人移动：部分敌种会瞬移/绕行，会把靶子挪出屏，导致判定不稳定。
  const placed = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    s.__origUpdateEnemies = s.updateEnemies;
    s.updateEnemies = () => {};               // 只冻结移动/画怪，弹丸与索敌照常跑
    const put = (dx, dy, hp = 9999) => {
      // spawnEnemy(dif, point)：第一参是难度数据，第二参才是落点
      s.spawnEnemy({ hp, speed: 0, damage: 0, maxAlive: 999 }, { x: s.player.x + dx, y: s.player.y + dy });
      const e = s.enemies[s.enemies.length - 1];
      e.speed = 0; e.damage = 0; e.baseDamage = 0;
      e.brain.dir = { x: 0, y: 0 };
      e.maxHp = hp; e.hp = hp; e.hpChip = hp; e.hpSeen = hp;
      return e;
    };
    // 屏内（左半屏 / 右半屏 / 下半屏）
    const inside = [put(-80, -40), put(80, -40), put(-60, 60)];
    // 屏外（左外侧 / 右外侧 / 上外侧）
    const outside = [put(-420, -40), put(430, -40), put(-60, -260)];
    s.__hp0 = {};
    for (const e of [...inside, ...outside]) s.__hp0[e.id] = e.hp;
    return { view: { x: s.cameras.main.worldView.x, y: s.cameras.main.worldView.y, w: s.cameras.main.worldView.width, h: s.cameras.main.worldView.height }, player: { x: s.player.x, y: s.player.y } };
  });
  console.log('PLACED', JSON.stringify(placed));
  await page.waitForTimeout(7000);

  const stats = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const v = s.cameras.main.worldView;
    const inView = (e) => e.x + e.radius >= v.x && e.x - e.radius <= v.right
      && e.y + e.radius >= v.y && e.y - e.radius <= v.bottom;
    return s.enemies.map((e) => ({
      id: e.id,
      x: Math.round(e.x), y: Math.round(e.y),
      hp: Math.round(e.hp), hp0: s.__hp0[e.id],
      inView: inView(e),
      hurt: e.hp < s.__hp0[e.id],
      hitPower: e.hitPower,
    }));
  });
  const inside = stats.filter((e) => e.inView);
  const outside = stats.filter((e) => !e.inView);
  console.log('TARGETING', JSON.stringify({ inside, outside }));
  assert(inside.length >= 2, '应有至少 2 只屏幕内靶子，实际 ' + inside.length);
  assert(outside.length >= 2, '应有至少 2 只屏幕外靶子，实际 ' + outside.length);
  assert(inside.some((e) => e.hurt), '屏幕内的靶子必须被攻击命中');
  assert(inside.some((e) => e.hitPower > 0), '屏幕内靶子应有受击表现（hitPower>0）');
  assert.equal(outside.filter((e) => e.hurt).length, 0,
    '屏幕外的靶子不得掉血：' + JSON.stringify(outside.filter((e) => e.hurt)));

  // ---------- 3. 同屏分离（压测灌满） ----------
  const crowd = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    if (s.__origUpdateEnemies) s.updateEnemies = s.__origUpdateEnemies;
    for (const e of [...s.enemies]) e.destroy();
    s.enemies.length = 0;
    s.spawnTimer = 1e9;
    for (let i = 0; i < 26; i++) s.spawnEnemy({ hp: 60, speed: 8, damage: 4, maxAlive: 999 });
    return s.enemies.length;
  });
  await page.waitForTimeout(6000);
  const spread = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    let minGap = Infinity;
    for (let i = 0; i < s.enemies.length; i++) {
      for (let j = i + 1; j < s.enemies.length; j++) {
        minGap = Math.min(minGap, Math.hypot(s.enemies[i].x - s.enemies[j].x, s.enemies[i].y - s.enemies[j].y));
      }
    }
    return { count: s.enemies.length, minGap: Number.isFinite(minGap) ? Math.round(minGap) : null };
  });
  console.log('SPREAD', JSON.stringify({ crowd, spread }));
  assert(spread.count >= 8, '灌满后应有一定同屏数量，实际 ' + spread.count);
  assert(spread.minGap === null || spread.minGap >= 18, '敌人之间不得堆叠，最近间距 ' + spread.minGap);
  assert.equal(errors.length, 0, errors.join('; '));
  console.log(JSON.stringify({ hold, placed, inside, outside, spread, errors }));
} finally { await browser.close(); }
