// 素材接入实机验收：玩家四态、七种敌人、双 Boss（石像鬼/巫妖）、符文碎片。
// 全部通过真实运行通路构造（动态 import 实体类 + 场景既有方法），不碰游戏源码。
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const OUT = 'docs/素材加工';
const browser = await chromium.launch({ channel: 'msedge' });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE + '/?scene=battle&seed=sprites-shot');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  await page.waitForTimeout(600);

  // ---------- 1. 玩家四态 ----------
  // 1a 待机
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    s.player.invulnUntil = Number.MAX_SAFE_INTEGER;
    for (const e of [...s.enemies]) e.destroy();
    s.enemies.length = 0;
  });
  await page.screenshot({ path: OUT + '/验收-玩家-待机.png' });

  // 1b 行走（按住右键 500ms 内连拍）
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(120);
  await page.screenshot({ path: OUT + '/验收-玩家-行走.png' });
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(200);

  // 1c 受击白闪（hurtAt 置为当前帧，白闪窗口 180ms）
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    s.player.hurtAt = s.engine.now;
  });
  await page.screenshot({ path: OUT + '/验收-玩家-受击.png' });

  // 1d 无敌冲刺帧（takeDamage 后 900ms 无敌，dash 姿势 + 明暗闪烁）
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    s.player.hurtAt = -9999;
    s.player.takeDamage(1, s.engine.now);
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: OUT + '/验收-玩家-无敌冲刺.png' });

  // ---------- 2. 七种敌人全家福 ----------
  await page.evaluate(async () => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const { default: Enemy } = await import('/src/entities/Enemy.js');
    const { ENEMY_TYPES } = await import('/src/data/roster.js');
    const types = ['skeleton', 'bat', 'corpse', 'cultist', 'knight', 'stitch_abomination', 'oath_bishop'];
    const cx = s.player.x, cy = s.player.y;
    types.forEach((id, i) => {
      const ang = (i / types.length) * Math.PI * 2 - Math.PI / 2;
      const x = Math.round(cx + Math.cos(ang) * 95);
      const y = Math.round(cy + Math.sin(ang) * 52);
      s.enemies.push(new Enemy(s, ENEMY_TYPES[id], x, y, { x: cx, y: cy }, 40, 18, 5, 9000 + i));
    });
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: OUT + '/验收-敌人全家福.png' });

  // ---------- 3. 双 Boss ----------
  for (const [name, def, act] of [['小Boss石像鬼', { tier: 'mini' }, 1], ['幕Boss巫妖', { tier: 'final' }, 3]]) {
    await page.evaluate(async ({ def, act }) => {
      const s = window.__SIGILWEAVE_BATTLE__;
      const { default: Boss } = await import('/src/entities/Boss.js');
      for (const e of [...s.enemies]) e.destroy();
      s.enemies.length = 0;
      const boss = new Boss(s, def, act, 9500);
      boss.x = s.player.x;
      boss.y = Math.max(60, s.player.y - 110);
      s.enemies.push(boss);
      s.boss = boss;
    }, { def, act });
    await page.waitForTimeout(700);
    await page.screenshot({ path: OUT + '/验收-' + name + '.png' });
  }

  // ---------- 4. 符文碎片 ----------
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    for (const e of [...s.enemies]) e.destroy();
    s.enemies.length = 0;
    for (let i = 0; i < 6; i++) {
      s.spawnShard(s.player.x - 60 + i * 24, s.player.y - 10 + (i % 2) * 8);
    }
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: OUT + '/验收-符文碎片.png' });

  // ---------- 5. 素材加载核对 ----------
  const loaded = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const keys = ['player', 'skeleton', 'corpse', 'undead_bat', 'gargoyle', 'cultist', 'ghoul', 'death_knight', 'lesser_demon', 'lich', 'rune_shard', 'attack_warning'];
    return keys.map((k) => ({ key: k, ok: s.textures.exists(k) }));
  });
  console.log('TEXTURES ' + JSON.stringify(loaded));
  console.log('ERRORS ' + JSON.stringify(errors));
} finally {
  await browser.close();
}
