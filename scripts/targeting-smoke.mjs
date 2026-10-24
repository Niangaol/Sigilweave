// 索敌与拥挤回归：
// 1) 屏幕外（>240px）的敌人必须能被攻击命中，不能只锁屏幕内
// 2) 同屏灌满后敌人之间要拉开间距，不能堆在一起
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/?scene=battle&seed=targeting-smoke');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');

  // 走真实刷怪路径灌满同屏，观察分布（不改 URL、不动难度参数）
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    s.player.invulnUntil = Number.MAX_SAFE_INTEGER; // 只观测分布，不让玩家死亡中断
    for (let i = 0; i < 26; i++) s.spawnEnemy({ hp: 60, speed: 8, damage: 4, maxAlive: 999 });
  });
  await page.waitForTimeout(6000);

  const stats = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const dist = (e) => Math.hypot(e.x - s.player.x, e.y - s.player.y);
    let minGap = Infinity;
    for (let i = 0; i < s.enemies.length; i++) {
      for (let j = i + 1; j < s.enemies.length; j++) {
        const d = Math.hypot(s.enemies[i].x - s.enemies[j].x, s.enemies[i].y - s.enemies[j].y);
        if (d < minGap) minGap = d;
      }
    }
    return {
      count: s.enemies.length,
      offscreen: s.enemies.filter(e => dist(e) > 240).length,
      offscreenHurt: s.enemies.filter(e => dist(e) > 240 && e.hp < e.maxHp).length,
      anyHurt: s.enemies.filter(e => e.hp < e.maxHp).length,
      minGap: Number.isFinite(minGap) ? Math.round(minGap) : null,
      minDist: s.enemies.length ? Math.round(Math.min(...s.enemies.map(dist))) : null,
    };
  });
  console.log('TARGETING', JSON.stringify(stats));

  assert(stats.count >= 8, '灌满后应有一定同屏数量，实际 ' + stats.count);
  assert(stats.offscreen >= 1, '刷怪环在屏幕外，必须有敌人在视口之外');
  assert(stats.offscreenHurt >= 1, '屏幕外的敌人也必须被攻击命中（旧版只锁屏幕内）');
  assert(stats.minGap === null || stats.minGap >= 18, '敌人之间不得堆叠，最近间距 ' + stats.minGap);
  assert.equal(errors.length, 0, errors.join('; '));
  console.log(JSON.stringify({ stats, errors }));
} finally { await browser.close(); }
