// 击杀爆散 + 经验粒子（替代经验珠）真实浏览器验收截图。
// 用法：npm run build && npx vite preview --port 4173 --strictPort && node scripts/death-scatter-shot.mjs
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const OUT = process.env.OUT_DIR ?? 'docs/death-scatter';
await mkdir(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE + '/?scene=battle&seed=death-scatter');
  await page.waitForFunction(() => window.__SIGILWEAVE_BATTLE__?.phase === 'play');
  await sleep(1600);

  const rect = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const r = c.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  });

  const setup = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    s.player.invulnUntil = Number.MAX_SAFE_INTEGER;
    s.spawnTimer = 1e9;
    for (const e of [...s.enemies]) e.destroy();
    s.enemies.length = 0;
    s.updateEnemies = () => {};   // 靶子站桩，别乱跑
    s.effects.items.length = 0;
    for (const t of s.effects.texts) t.obj.destroy();
    s.effects.texts.length = 0;
    const offs = [[-96, -34], [96, -34], [-52, 48], [52, 48], [0, 4]];
    const ids = [];
    for (const [dx, dy] of offs) {
      s.spawnEnemy({ hp: 1, speed: 0, damage: 0, maxAlive: 999 }, { x: s.player.x + dx, y: s.player.y + dy });
      const e = s.enemies[s.enemies.length - 1];
      e.speed = 0; e.damage = 0; e.maxHp = 1; e.hp = 1; e.hpChip = 1; e.hpSeen = 1;
      e.draw(s.engine.now);
      ids.push(e.id);
    }
    return { ids, exp0: s.run.progression.exp, lv0: s.run.progression.level, motes: s.expMotes.length };
  });
  console.log('SETUP', JSON.stringify(setup));

  // 同一帧打掉 5 只：真实走 applySigil → 伤害 → 死亡 → 爆散 + 经验粒子
  const killed = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    const targets = [...s.enemies];
    for (const e of targets) s.applySigil(5, 'arcane_bolt', { x: e.x, y: e.y }, 0);
    return {
      left: s.enemies.length,
      scatter: s.effects.items.filter((it) => it.kind === 'deathScatter').length,
      motes: s.expMotes.length,
      exp: s.run.progression.exp,
    };
  });
  console.log('KILLED', JSON.stringify(killed));
  const burst = await page.evaluate(() => ({
    scatter: window.__SIGILWEAVE_BATTLE__.effects.items.filter((it) => it.kind === 'deathScatter').length,
    motes: window.__SIGILWEAVE_BATTLE__.expMotes.length,
  }));

  await sleep(180);
  await page.screenshot({ path: OUT + '/1-击杀爆散.png', clip: rect });
  await sleep(240);
  await page.screenshot({ path: OUT + '/2-经验粒子飞向玩家.png', clip: rect });

  await sleep(2200);
  const settled = await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    return {
      exp: s.run.progression.exp,
      lv: s.run.progression.level,
      motes: s.expMotes.length,
      scatter: s.effects.items.filter((it) => it.kind === 'deathScatter').length,
    };
  });
  console.log('SETTLED', JSON.stringify(settled));
  await page.screenshot({ path: OUT + '/3-经验已吸收.png', clip: rect });

  const ok = burst.scatter === 5 && killed.motes === 5 && killed.exp === setup.exp0
    && settled.motes === 0 && settled.exp === setup.exp0 + 5 && errors.length === 0;
  console.log(JSON.stringify({ ok, burst, killed, settled, setup, errors }));
  if (!ok) throw new Error('爆散/经验粒子断言失败: ' + JSON.stringify({ burst, killed, settled, setup, errors }));
} finally { await browser.close(); }
