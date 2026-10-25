// 割草密度的纯逻辑战斗仿真：不依赖浏览器与 Phaser，全部走真实逻辑层。
// 用法：node scripts/density-sim.mjs [act] [seconds] [kit]
//   act 1..3（默认 1）、seconds（默认 180）、kit bolt|flame|ward（默认 bolt）
// 输出：每 10 秒的同屏数/屏内数、击杀速率、玩家血量，以及整局摘要。
//
// 口径（必须知道）：
// - 弹丸飞行时间被省略（触发即结算），所以击杀速率比实机略乐观；
// - 只模拟接触伤害，不模拟邪教徒/骑士/精英的弹幕与践踏（那些是额外压力）；
// - 玩家用简单风筝 AI：身边有怪就往反方向跑，离中心太远就回中，不会主动绕怪堆；
// - 不含宝箱、幕间、Boss 与问答。结论只用于「密度是否起得来 / 会不会一进场就死」的量级判断。
import { createGrid, rebuildDerived } from '../src/logic/grid.js';
import { applyDraft } from '../src/logic/build.js';
import { createRun } from '../src/logic/run.js';
import { SigilEngine } from '../src/logic/engine.js';
import { buildComboCatalog } from '../src/logic/combo.js';
import { resolveSigilTrigger, resolveComboBonus, resolveDeathBursts, SIGIL_DEFS } from '../src/logic/effects.js';
import { resolveVolley, volleyLimit } from '../src/logic/sector.js';
import { createBrain, stepBrain } from '../src/logic/enemy-ai.js';
import { pickWavePoints, separateEnemiesBucketed } from '../src/logic/spawn.js';
import { Rng } from '../src/logic/rng.js';
import { ACTS, WORLD_SIZES } from '../src/logic/constants.js';
import { createProgression, grantExp, levelStats } from '../src/logic/progression.js';
import {
  ENEMY_TYPES, SIGILS, PLAYER, DIFFICULTY, ACT_DENSITY, difficultyAt, pickEnemyType,
} from '../src/data/roster.js';

// 仿真可调档：用环境变量覆盖刷怪端点，方便在改默认值之前先扫一遍平衡。
// 不传时完全等价于 roster.difficultyAt(now, act)。
const num = (name, fallback) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) ? v : fallback;
};
const SPAWN_START = num('SIM_SPAWN_START', DIFFICULTY.spawnMsStart);
const SPAWN_END = num('SIM_SPAWN_END', DIFFICULTY.spawnMsEnd);
const MAX_START = num('SIM_MAX_START', DIFFICULTY.maxAliveStart);
const MAX_END = num('SIM_MAX_END', DIFFICULTY.maxAliveEnd);
const WAVE_END = num('SIM_WAVE_END', DIFFICULTY.waveEnd);
const DENSITY_OVERRIDE = process.env.SIM_NO_ACT_SCALE === '1' ? null : ACT_DENSITY;
function difficulty(now, act) {
  const k = Math.min(1, Math.max(0, now / DIFFICULTY.rampMs));
  const den = (DENSITY_OVERRIDE && DENSITY_OVERRIDE[act]) || { maxAlive: 1, spawnMs: 1 };
  return {
    hp: Math.round(DIFFICULTY.hpStart + (DIFFICULTY.hpEnd - DIFFICULTY.hpStart) * k),
    speed: DIFFICULTY.speedStart + (DIFFICULTY.speedEnd - DIFFICULTY.speedStart) * k,
    spawnMs: (SPAWN_START + (SPAWN_END - SPAWN_START) * k) * den.spawnMs,
    maxAlive: Math.round((MAX_START + (MAX_END - MAX_START) * k) * den.maxAlive),
    damage: Math.round(DIFFICULTY.damageStart + (DIFFICULTY.damageEnd - DIFFICULTY.damageStart) * k),
    wave: Math.max(1, Math.round(DIFFICULTY.waveStart + (WAVE_END - DIFFICULTY.waveStart) * k)),
  };
}

const act = Math.min(3, Math.max(1, Number(process.argv[2]) || 1));
const seconds = Math.min(600, Math.max(30, Number(process.argv[3]) || 180));
const kitId = process.argv[4] || 'bolt';
// 可选第 5 参数：尸爆比例（默认用 DEATH_BURST 的设计值），用于扫平衡
const burstRatio = Number(process.argv[5]);

const world = WORLD_SIZES[act];
const bounds = { left: 24, top: 40, right: world.w - 24, bottom: world.h - 24 };
const rng = new Rng('density-sim:' + act + ':' + kitId);

// ---------- 构筑：第一幕用起手套装；二三幕补满解封格并铺一套范围法术 ----------
const run = createRun('sim', kitId);
run.act = act;
const grid = createGrid();
if (act > 1) {
  const unlocked = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].slice(0, act === 2 ? 12 : 16);
  run.draft.act = act;
  run.draft.unlocked = unlocked;
  const fill = ['flame_burst', 'starfall', 'chain_lightning', 'thorn_vine', 'frost_arrow', 'quake_maw', 'pierce_lance', 'holy_ward'];
  run.draft.slots = {};
  unlocked.forEach((id, i) => { run.draft.slots[id] = { kind: 'sigil', defId: fill[i % fill.length] }; });
}
const applied = applyDraft(grid, run.draft, { phase: 'intermission' });
if (!applied.ok) throw new Error('构筑快照无效: ' + JSON.stringify(applied.errors));
rebuildDerived(grid, ACTS[act - 1].baseIntervalMs);

// ---------- 玩家 ----------
const player = {
  x: world.w / 2, y: world.h / 2, hp: PLAYER.hp, maxHp: PLAYER.hp,
  radius: PLAYER.radius, speed: PLAYER.speed, shield: 0, shieldCap: 40,
  alive: true, invulnUntil: 0,
};
const progression = createProgression();
let enemies = [];
let enemySeq = 1;
let invulnUntil = 0;
let killStreak = 0;
let lastKillAt = -99999;
let kills = 0;
let contactDeaths = 0;
let damageTaken = 0;
let expAccum = 0;
let levelUps = 0;
// 与 BattleScene.KILL_EXP_PER_POINT 一致；可用 SIM_EXP_FOLD 扫档
const EXP_PER_POINT = Math.max(1, Math.floor(num('SIM_EXP_FOLD', 1)));
let timeExpTimer = 0;

const aliveEnemies = () => enemies.filter((e) => e.alive);
const stats = { shots: 0, hits: 0, emptyShots: 0 };

// ---------- 引擎：真实脉流 + 真实索敌/结算 ----------
function combatState() {
  return { player, oath: grid.oath, now: engine.now, buffMul: 1, hitBonus: 0 };
}
function settleDead(bySpell) {
  for (const e of enemies) {
    if (!e.alive && !e.counted) {
      e.counted = true;
      if (bySpell) {
        kills++;
        const now = engine.now;
        if (now - lastKillAt > 1500) killStreak = 0;
        lastKillAt = now;
        killStreak++;
        if (killStreak % 12 === 0 && player.hp < player.maxHp) player.hp = Math.min(player.maxHp, player.hp + 1);
        expAccum += e.def?.elite ? 6 : 1;
        while (expAccum >= EXP_PER_POINT) {
          expAccum -= EXP_PER_POINT;
          const gained = grantExp(progression, 1, 1);
          if (gained.ok && gained.levelsGained > 0) levelUps += gained.levelsGained;
        }
      } else {
        contactDeaths++;
      }
    }
  }
  enemies = enemies.filter((e) => e.alive || !e.counted ? e.alive : false);
}

// 可选「法术溅射」试验：命中点周围的小范围伤害，用来评估割草强度（默认关闭）
const SPLASH_RATIO = num('SIM_SPLASH', 0);
function applySplash(result) {
  if (!SPLASH_RATIO || !result || !result.hits || !Array.isArray(result.targets)) return;
  const per = (result.damage / Math.max(1, result.hits)) * SPLASH_RATIO;
  const hitIds = new Set(result.targets.map((e) => e.id));
  for (const center of result.targets) {
    for (const e of enemies) {
      if (!e.alive || hitIds.has(e.id)) continue;
      const d = Math.hypot(e.x - center.x, e.y - center.y);
      if (d <= 26) applyDamageSmall(e, per);
    }
  }
}
function applyDamageSmall(e, amount) {
  const armor = Number.isFinite(e.armor) ? e.armor : 0;
  e.hp = Math.max(0, e.hp - amount * (1 - armor));
  if (e.hp === 0) e.alive = false;
}

// 割草连锁：与 BattleScene.triggerDeathBursts 同一套规则（0.5 最大生命、半径 30、最多 80 次）
function triggerDeathBursts() {
  const seeds = enemies.filter((e) => !e.alive && e.hp === 0 && !e.counted);
  if (seeds.length) resolveDeathBursts({ enemies, seeds, damageRatio: Number.isFinite(burstRatio) ? burstRatio : undefined });
}

const engine = new SigilEngine({
  seed: 'sim-signal:' + act,
  grid,
  startCells: grid.unlockedIds().slice(0, ACTS[act - 1].starts),
  comboWindowMul: 1,
  combos: buildComboCatalog(['duo', 'line3', 'elbow3', 'ring4'])
    .filter((inst) => inst.order.every((id) => grid.cells[id].unlocked && grid.cells[id].slot?.kind === 'sigil')),
  onEvent: (type, data) => {
    if (type === 'signal:trigger') {
      const cell = grid.cells[data.cellId];
      if (!cell?.slot || cell.slot.kind !== 'sigil' || cell.mutedOutput) return;
      const owner = { x: player.x, y: player.y };
      const kind = SIGIL_DEFS[cell.slot.defId]?.kind;
      // 与 BattleScene 一致：一次触发起 N 发齐射（区域/回声只打一发）
      const volley = resolveVolley(data.cellId, owner, aliveEnemies(), { maxTargets: volleyLimit(kind) });
      const shots = volley.targets.length ? volley.aims : [volley.aims[0]];
      for (const aim of shots) {
        const result = resolveSigilTrigger({
          grid, cellId: data.cellId, defId: cell.slot.defId,
          state: combatState(), enemies: aliveEnemies(), aimPoint: aim,
        });
        stats.shots++;
        stats.hits += result.hits;
        if (!result.hits) stats.emptyShots++;
        applySplash(result);
        triggerDeathBursts();
        settleDead(true);
      }
    } else if (type === 'combo:fire') {
      resolveComboBonus({ grid, order: data.order, defId: data.defId, bonus: data.bonus, state: combatState(), enemies: aliveEnemies() });
      triggerDeathBursts();
      settleDead(true);
    }
  },
});
engine.start();

// ---------- 刷怪：与 BattleScene.updateSpawner 同一套节奏 ----------
let spawnTimer = 900;
const WARMUP_MS = 1600;
function spawnWave(dif, count) {
  const points = pickWavePoints({
    rng: () => rng.next(), player, world,
    enemies: enemies.filter((e) => e.alive),
    count, minDist: 275, maxDist: 380, minGap: 30, nearDist: 250, farDist: 430,
  });
  for (const point of points) {
    const def = pickEnemyType(act, rng.next());
    const lv = levelStats(progression.level);
    const hp = Math.max(1, Math.round(dif.hp * (def.hpMul ?? 1) * lv.hpMul));
    enemies.push({
      id: enemySeq++, defId: def.id, def, x: point.x, y: point.y,
      hp, maxHp: hp, radius: def.radius, speed: dif.speed * (def.speedMul ?? 1) * lv.speedMul,
      damage: Math.round((def.damage ?? dif.damage) * lv.damageMul),
      alive: true, counted: false, isBoss: false,
      brain: createBrain(def.id, { now: engine.now, seed: def.id + ':' + enemySeq }),
    });
  }
}

// ---------- 玩家风筝 AI ----------
// 人类玩家不会一直朝一个方向直线逃跑：那样怪全拖在身后，前方三个扇区全是空射。
// 这里做「绕最近怪转圈」：保持 ~90px 距离并沿切线方向移动，让怪分布在自己周围，
// 四个方位的格子都能打到人。这是比「直线跑」更接近真实操作的基线模型。
function movePlayer(dtMs) {
  let nearest = null; let nd = Infinity;
  for (const e of enemies) {
    if (!e.alive) continue;
    const d = Math.hypot(e.x - player.x, e.y - player.y);
    if (d < nd) { nd = d; nearest = e; }
  }
  let ax = 0; let ay = 0;
  if (nearest) {
    const dx = player.x - nearest.x;
    const dy = player.y - nearest.y;
    const d = Math.hypot(dx, dy) || 1;
    // 径向：太近就退、太远就贴，保持在 90px 左右
    const radial = (d - 90) / 90;
    ax += (dx / d) * Math.max(-1, Math.min(1, radial));
    ay += (dy / d) * Math.max(-1, Math.min(1, radial));
    // 切向：绕怪转圈（顺时针），避免被逼到角落
    ax += (-dy / d) * 0.9;
    ay += (dx / d) * 0.9;
  }
  // 离地图中心太远就往回拉，否则会被怪推到边界
  const cx = world.w / 2 - player.x;
  const cy = world.h / 2 - player.y;
  const cd = Math.hypot(cx, cy);
  if (cd > 420) { ax += (cx / cd) * 1.2; ay += (cy / cd) * 1.2; }
  const len = Math.hypot(ax, ay);
  if (len < 1e-6) return;
  const speed = player.speed * (dtMs / 1000);
  player.x = Math.max(bounds.left, Math.min(bounds.right, player.x + (ax / len) * speed));
  player.y = Math.max(bounds.top, Math.min(bounds.bottom, player.y + (ay / len) * speed));
}

const dtMs = 1000 / 60;
const totalMs = seconds * 1000;
const timeline = [];
let nextSample = 0;
let maxAlive = 0;

for (let t = 0; t < totalMs; t += dtMs) {
  engine.advance(dtMs);
  movePlayer(dtMs);

  // 每 20 秒有效战斗时间保底 1 点经验（与 BattleScene 一致）
  timeExpTimer += dtMs;
  if (timeExpTimer >= 20000) {
    timeExpTimer -= 20000;
    const gained = grantExp(progression, 1, 1);
    if (gained.ok && gained.levelsGained > 0) levelUps += gained.levelsGained;
  }

  // 刷怪
  spawnTimer -= dtMs;
  if (spawnTimer <= 0) {
    const dif = difficulty(engine.now, act);
    const warming = engine.now < WARMUP_MS;
    const room = dif.maxAlive - aliveEnemies().length;
    if (room > 0) {
      const wave = warming ? 1 : Math.max(1, Math.min(dif.wave ?? 1, room));
      spawnWave(dif, wave);
      const jitter = 0.85 + rng.next() * 0.3;
      spawnTimer = Math.max(150, dif.spawnMs * jitter * (warming ? 2.2 : 1));
    } else {
      spawnTimer = 160;
    }
  }

  // 敌人推进
  for (const e of enemies) {
    if (!e.alive) continue;
    const res = stepBrain(e.brain, {
      dtMs, now: engine.now,
      self: { x: e.x, y: e.y, speed: e.speed, radius: e.radius },
      player: { x: player.x, y: player.y },
      opts: { BATTLE: bounds, damage: e.damage },
    });
    if (Number.isFinite(res.x)) e.x = res.x;
    if (Number.isFinite(res.y)) e.y = res.y;
  }

  // 拥挤分离（与战斗层同参数）
  if (enemies.length > 1) separateEnemiesBucketed(enemies, { gap: 20, player, contactDist: 26 });

  // 接触：怪物撞到玩家就碎，玩家吃一次伤害（900ms 无敌）
  for (const e of enemies) {
    if (!e.alive) continue;
    const d = Math.hypot(e.x - player.x, e.y - player.y);
    if (d < e.radius + player.radius) {
      if (engine.now >= invulnUntil) {
        // 与 Player.takeDamage 一致：护盾先吃满，再掉血，然后进入 900ms 无敌
        const CONTACT_MUL = num('SIM_CONTACT_MUL', 1);
        const IFRAMES = num('SIM_IFRAMES', PLAYER.iframesMs);
        const dmg = Math.max(1, Math.round(e.damage * CONTACT_MUL));
        const shield = Number.isFinite(player.shield) && player.shield > 0 ? player.shield : 0;
        const absorbed = Math.min(shield, dmg);
        player.shield = shield - absorbed;
        player.hp -= (dmg - absorbed);
        damageTaken += dmg;
        invulnUntil = engine.now + IFRAMES;
      }
      e.alive = false;
    } else if (d > 560) {
      e.alive = false;      // 离玩家过远回收，不算击杀
      e.counted = true;
    }
  }
  settleDead(false);

  const aliveNow = aliveEnemies().length;
  if (aliveNow > maxAlive) maxAlive = aliveNow;

  if (player.hp <= 0) {
    timeline.push({ t: Math.round(engine.now / 1000), alive: aliveNow, onScreen: 0, kills, hp: 0, dps: damageTaken });
    player.alive = false;
    break;
  }

  if (engine.now >= nextSample) {
    const onScreen = aliveEnemies().filter((e) => Math.abs(e.x - player.x) < 240 && Math.abs(e.y - player.y) < 135).length;
    timeline.push({
      t: Math.round(engine.now / 1000), alive: aliveNow, onScreen,
      kills, hp: Math.round(player.hp * 10) / 10, dmg: damageTaken,
    });
    nextSample += 10000;
  }
}

const survived = player.hp > 0 ? seconds : Math.round(engine.now / 1000);
const summary = {
  act, kit: kitId, seconds, survivedS: survived, aliveAtEnd: aliveEnemies().length, maxAlive,
  kills, killsPerSec: +(kills / survived).toFixed(2),
  contactDeaths, damageTaken, hpLeft: Math.max(0, Math.round(player.hp * 10) / 10),
  level: progression.level, levelUps, triggers: engine.stats.triggers,
  shots: stats.shots, hits: stats.hits, emptyShots: stats.emptyShots,
  blocked: engine.stats.blocked, combos: engine.stats.combos,
};
console.log('SIM_SUMMARY ' + JSON.stringify(summary));
console.log('t(s)\talive\tonScreen\tkills\thp\tdmg');
for (const row of timeline) console.log([row.t, row.alive, row.onScreen ?? '-', row.kills, row.hp, row.dmg ?? '-'].join('\t'));
