// 割草密度 + 16 法术特效的逐镜验收截图。
// 用法（先起 dev 或 preview 服务器）：
//   npm run dev                                   # 另开一个终端
//   node scripts/mow-fx-shot.mjs                  # BASE_URL 默认 http://127.0.0.1:5173
//   BASE_URL=http://127.0.0.1:4173 node scripts/mow-fx-shot.mjs
// 产物：docs/mow-fx/0-密度.png、1-连斩.png、<defId>-飞行.png、<defId>-命中.png
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const OUT = process.argv[2] ?? 'docs/mow-fx';
const SPELLS = [
  'frost_arrow', 'arcane_bolt', 'flame_burst', 'judgment_hammer',
  'thorn_vine', 'starfall', 'holy_ward', 'mana_siphon',
  'chain_lightning', 'pierce_lance', 'echo_sigil', 'ember_fan',
  'quake_maw', 'soul_lance', 'aegis_ring', 'meteor_judgment',
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge' });
const errors = [];
const report = { spells: [], shots: 0, errors };
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(BASE + '/?scene=battle&seed=mow-fx-shot');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play', null, { timeout: 20000 });
  // 截图期间关掉升级三选一与地图遭遇：它们会把 phase 切成 levelup/encounter，
  // 截图里混进面板不说，游戏也会停住。stressRunning 原本就是「别弹东西」的开关。
  await page.evaluate(() => { window.__SIGILWEAVE_BATTLE__.stressRunning = true; });

  // ---------- A. 密度：把时钟推到中后期难度，让真实刷怪器自己把同屏填起来 ----------
  // 不手动 spawn（手动 spawn 会把怪放到屏幕外，截图看不出密度），只改难度时钟 + 免伤，等它铺满。
  // 新密度是「刷怪 ≈ 清怪」的可持续节奏，铺到 30~50 只要真跑 40 秒左右；截图脚本不在乎这 30 秒。
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    s.player.invulnUntil = Number.MAX_SAFE_INTEGER;
    s.engine.now = 150000;                     // 中后期：maxAlive 64、spawnMs 520
  });
  await page.waitForTimeout(40000);
  if (await page.evaluate(() => window.__SIGILWEAVE_BATTLE__.phase === 'levelup')) {
    await page.keyboard.press('Digit1');
  }
  await page.waitForTimeout(600);
  const density = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const d = s.enemies.map((e) => Math.hypot(e.x - s.player.x, e.y - s.player.y));
    let minGap = Infinity;
    for (let i = 0; i < s.enemies.length; i++) {
      for (let j = i + 1; j < s.enemies.length; j++) {
        minGap = Math.min(minGap, Math.hypot(s.enemies[i].x - s.enemies[j].x, s.enemies[i].y - s.enemies[j].y));
      }
    }
    return {
      alive: s.enemies.length,
      onScreen: d.filter((v) => v < 270).length,
      minPlayerDist: Math.round(Math.min(...d)),
      minGap: Number.isFinite(minGap) ? Math.round(minGap) : null,
      hp: Math.round(s.player.hp),
    };
  });
  await page.screenshot({ path: OUT + '/0-密度.png' });
  report.shots++;

  // ---------- B. 连斩反馈：一波 26 只弱怪 + 星陨，观察连斩字幕 ----------
  const streak = await page.evaluate(async () => {
    const s = window.__SIGILWEAVE_BATTLE__;
    s.bossStarted = true;                      // 暂停自动刷怪，画面里只留这一波
    for (const e of [...s.enemies]) e.destroy();
    s.enemies.length = 0;
    s.grid.cells[5].slot = { kind: 'sigil', defId: 'starfall' };
    // 弱怪必须摆在玩家身边（半径 30~70），否则区域法术打的是屏幕外的怪
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const d = 30 + (i % 4) * 12;
      s.spawnEnemy({ hp: 1, speed: 4, damage: 1, maxAlive: 999 },
        { x: s.player.x + Math.cos(a) * d, y: s.player.y + Math.sin(a) * d });
    }
    await new Promise((r) => setTimeout(r, 260));
    s.onEngineEvent('signal:trigger', { cellId: 5 });
    await new Promise((r) => setTimeout(r, 520));
    return { streak: s.killStreak, kills: s.kills, alive: s.enemies.length };
  });
  await page.waitForTimeout(120);
  await page.screenshot({ path: OUT + '/1-连斩.png' });
  report.shots++;
  report.streak = streak;

  // ---------- C. 逐法术：真实触发一次，分别抓飞行体与命中 ----------
  for (const defId of SPELLS) {
    const ready = await page.evaluate((id) => {
      const s = window.__SIGILWEAVE_BATTLE__;
      if (!s || s.phase !== 'play') return false;
      s.player.invulnUntil = Number.MAX_SAFE_INTEGER;
      s.bossStarted = true;                    // 暂停自动刷怪，画面里只留本次法术
      for (const e of [...s.enemies]) e.destroy();
      s.enemies.length = 0;
      s.effects.items.length = 0;
      // 只让 5 号格输出，其余格静默，避免别的法术抢镜
      for (const c of s.grid.cells) c.mutedOutput = c.id !== 5;
      s.grid.cells[5].slot = { kind: 'sigil', defId: id };
      // 5 号格是「左上近」扇区：把靶子摆进去，保证有命中
      for (let i = 0; i < 7; i++) {
        const a = Math.PI * (1.05 + i * 0.05);
        const d = 56 + (i % 3) * 15;
        s.spawnEnemy({ hp: 60, speed: 18, damage: 1, maxAlive: 999 },
          { x: s.player.x + Math.cos(a) * d, y: s.player.y + Math.sin(a) * d });
      }
      return true;
    }, defId);
    if (!ready) { report.spells.push({ defId, skipped: true }); continue; }

    await page.waitForTimeout(140);
    await page.evaluate((id) => window.__SIGILWEAVE_BATTLE__.onEngineEvent('signal:trigger', { cellId: 5 }), defId);
    await page.waitForTimeout(90);
    await page.screenshot({ path: OUT + '/' + defId + '-飞行.png' });
    // 等弹丸落地（区域法术可能没有弹丸，最多等 1.2 秒）
    await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__.projectiles.length === 0, null, { timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(110);
    await page.screenshot({ path: OUT + '/' + defId + '-命中.png' });
    report.shots += 2;
    const state = await page.evaluate(() => {
      const s = window.__SIGILWEAVE_BATTLE__;
      return {
        fxItems: s.effects.items.length,
        projectiles: s.projectiles.length,
        enemies: s.enemies.length,
        damageDealt: s.enemies.some((e) => e.hp < e.maxHp),
      };
    });
    report.spells.push({ defId, ...state });
  }

  // ---------- D. 帧时间：同屏 70 怪 + 满特效下采样 2 秒 ----------
  const perf = await page.evaluate(async () => {
    const s = window.__SIGILWEAVE_BATTLE__;
    s.bossStarted = false;
    for (const c of s.grid.cells) c.mutedOutput = false;
    for (let i = 0; i < 70; i++) s.spawnEnemy({ hp: 12, speed: 36, damage: 4, maxAlive: 999 });
    const deltas = [];
    let last = performance.now();
    await new Promise((resolve) => {
      const begin = performance.now();
      const tick = (t) => { deltas.push(t - last); last = t; if (t - begin < 2000) requestAnimationFrame(tick); else resolve(); };
      requestAnimationFrame(tick);
    });
    const sorted = [...deltas].slice(2).sort((a, b) => a - b);
    const pick = (q) => +(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0).toFixed(2);
    return { frames: sorted.length, p50: pick(0.5), p95: pick(0.95), p99: pick(0.99), max: pick(1) };
  });
  report.perf = perf;
  console.log(JSON.stringify(report, null, 2));
  if (errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
