// 战斗画面核查：中后期敌人分布、攻击光迹、暂停面板。
import { chromium } from 'playwright';
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/?seed=shot-late');
  await page.waitForFunction(() => window.__SIGILWEAVE__?.scene.isActive('TitleScene'));
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__SIGILWEAVE__?.scene.isActive('LoadoutScene'));
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  // 直接按中后期难度灌满同屏上限，检验落点间距与分离（走真实刷怪路径）
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    s.player.invulnUntil = Number.MAX_SAFE_INTEGER; // 只为观测分布，不让玩家被打死
    s.engine.now = 150000;
    for (let i = 0; i < 26; i++) s.spawnEnemy({ hp: 30, speed: 12, damage: 6, maxAlive: 999 });
  });
  await page.waitForTimeout(2500);
  // 关掉升级三选一，避免遮挡观察窗口
  if (await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.phase === 'levelup')) {
    await page.keyboard.press('Digit1');
  }
  await page.waitForTimeout(2500);
  const stats = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const d = s.enemies.map(e => Math.hypot(e.x - s.player.x, e.y - s.player.y));
    let minGap = Infinity;
    for (let i = 0; i < s.enemies.length; i++) for (let j = i + 1; j < s.enemies.length; j++) {
      minGap = Math.min(minGap, Math.hypot(s.enemies[i].x - s.enemies[j].x, s.enemies[i].y - s.enemies[j].y));
    }
    return {
      count: s.enemies.length,
      minPlayerDist: Math.round(Math.min(...d)),
      maxPlayerDist: Math.round(Math.max(...d)),
      minEnemyGap: Number.isFinite(minGap) ? Math.round(minGap) : null,
      offscreen: s.enemies.filter(e => Math.hypot(e.x - s.player.x, e.y - s.player.y) > 240).length,
      // 被扣血的屏外敌人：证明攻击不再只锁屏幕内
      offscreenHurt: s.enemies.filter(e => Math.hypot(e.x - s.player.x, e.y - s.player.y) > 240 && e.hp < e.maxHp).length,
      phase: s.phase,
    };
  });
  await page.screenshot({ path: 'docs/text-battle-late.png' });
  console.log(JSON.stringify({ stats, errors }));
} finally { await browser.close(); }
