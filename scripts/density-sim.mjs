// 割草密度的纯逻辑战斗仿真：不依赖浏览器与 Phaser，全部走真实逻辑层。
// 用法：node scripts/density-sim.mjs [stage] [seconds] [kit] [burstRatio] [flags]
//   stage 1..7（默认 1；幕由场反推：1/2/3→同号，4/5→幕4，6/7→幕5）、
//   seconds（默认 180）、kit bolt|flame|ward（默认 bolt）、burstRatio（可选，尸爆比例）
// flags（可以放任意位置，也可以全不写）：
//   --no-variants      基线模式：不 roll 变体、不叠护盾、所有怪占 1 槽（等价旧版刷怪构图）
//   --repeat=N         用 N 个不同 seed 连续跑，输出 N 行 SIM_SUMMARY + 一行 SIM_AGGREGATE（均值/中位数）
//   --seed=TAG         给随机种子加后缀（默认空，保持旧 seed 序列可比）
//   --dense            高密度档：同屏 60→90、刷怪 450→330ms（未显式给 SIM_* 环境变量时生效）
//   --no-timeline      不打印逐 10 秒明细表（--repeat>1 时自动关闭）
// 环境变量（与 flag 等价，方便脚本里对比）：
//   SIM_STAY=1         2026-11-17 新接触模型：怪不自毁、接触冷却 600ms、顶开 18px、玩家吃伤害
//   SIM_DASH=1         反硬控档：接触挂击退僵直 240ms + 把玩家顶开 36px（DEFAULT_CONTACT_CONTROL），
//                      受控期间每 1.2 秒按一次冲刺（复刻 Player.startDash 的 108px/180ms/无敌 220ms），
//                      冲刺位移中位置完全由时间轴决定、风筝 AI 不参与；需配合 SIM_STAY=1 才有受控事件
//   SIM_BOSS=1         Boss 战档：只刷本场大 Boss（同 BattleScene「bossStarted 就停杂兵刷怪」），
//                      接真实阶段机（stepBoss + hpRatio）与破防窗口，记录一战时长/阶段切换/大招/破防次数
//   SIM_FORMATION=1    编队档（波 C：编队刷怪 + 护卫光环）：每 DIFFICULTY.formationEvery 轮试一次整团
//                      编队（rollFormation，抽不到就整轮降级成普通波），成员打 formationId/formationPath；
//                      每帧按 BattleScene.refreshFormationAuras 的语义重算光环（同队前排活着 →
//                      其余非精英成员 +甲、×0.9 移速），移速在喂 stepBrain 之前乘上。
//                      默认关闭；关闭时输出与加档之前逐字节一致（本档字段也只在开档时出现）。
// 输出：
//   SIM_SUMMARY {json}  每次运行一行，字段见文件末尾 buildSummary
//   SIM_VARIANTS {json} 变体构成（每幕每变体只数/占比）
//   SIM_AGGREGATE {json} --repeat>1 时的均值/中位数/极值
//   t(s) alive ...       逐 10 秒明细（单次运行时）
//
// 口径（必须知道）：
// - 刷怪链路与 BattleScene.spawnEnemy 完全同序：
//   pickEnemyType →（天生精英跳过变体 roll）→ pickEnemyVariant → composeEnemyDef；
//   RNG 调用顺序（落点 → 类型 roll → 变体 roll）与战斗层一致，同一 seed 可复现。
// - 同屏按「槽位」算：room = dif.maxAlive - enemySpawnLoad(enemies)，持盾/精英/天生精英 cost 2。
// - 护盾按 effects.applyDamage 的真实路径结算（盾 → 甲 → 血），破盾后 0.4s 眩晕冻结走位，
//   与 Enemy.consumeShieldBreak 一致；盾吸收/破盾次数都在这里统计。
// - 敌方弹丸只计数不结算伤害（与旧版一致的乐观口径），用于判断 BattleScene 的 64 发上限会不会被顶满。
// - 弹丸飞行时间、践踏、宝箱、幕间、问答都不模拟；玩家用「绕最近怪转圈」的简化风筝 AI。
//   SIM_BOSS=1 下这条口径不变：Boss 的大招弹同样只计数，所以「一战时长」是纯 DPS 口径，
//   不含「被大招压掉走位输出」的损失——验收时按这个前提读数字。
// - 结论只用于「密度是否起得来 / 会不会一进场就死 / 变体层是否跑偏」的量级判断。
import { createGrid, rebuildDerived } from '../src/logic/grid.js';
import { applyDraft } from '../src/logic/build.js';
import { createRun } from '../src/logic/run.js';
import { SigilEngine } from '../src/logic/engine.js';
import { buildComboCatalog } from '../src/logic/combo.js';
import {
  applyDamage, resolveSigilTrigger, resolveComboBonus, resolveDeathBursts, SIGIL_DEFS,
} from '../src/logic/effects.js';
import { resolveVolley, volleyLimit } from '../src/logic/sector.js';
import { createBrain, stepBrain } from '../src/logic/enemy-ai.js';
import { HOSTILE_LIMITS } from '../src/logic/hostile.js';
import { enemySpawnLoad, pickWavePoints, rollFormation, separateEnemiesBucketed } from '../src/logic/spawn.js';
import { FORMATIONS, formationAuraOf } from '../src/data/formations.js';
import { ENEMY_VARIANTS, composeEnemyDef, pickEnemyVariant } from '../src/data/enemy-variants.js';
import { Rng } from '../src/logic/rng.js';
import { ACTS, WORLD_SIZES } from '../src/logic/constants.js';
import { chapterOf } from '../src/logic/acts.js';
import { createProgression, grantExp, levelStats } from '../src/logic/progression.js';
import { createBossModel, stepBoss, bossStats } from '../src/logic/boss.js';
import { BREAK_WINDOW_MS } from '../src/data/boss-phases.js';
import {
  ENEMY_TYPES, SIGILS, PLAYER, DIFFICULTY, ACT_DENSITY, difficultyAt, pickEnemyType,
} from '../src/data/roster.js';

// BattleScene.addHostileShot 的弹丸上限：仿真里不截断（要看它会不会被顶满），只记超限帧数。
// 与场景共用 hostile.HOSTILE_LIMITS.shots（T3 起 64 → 96）。
const HOSTILE_CAP = HOSTILE_LIMITS.shots;
// 编队 id → 模板：光环数值的唯一来源（与 BattleScene 的 FORMATION_BY_ID 同一份映射）。
// 表只有 8 条且模块已深冻，建一次就行——不每帧在数组里 find，也不在仿真里另存一套数值。
const FORMATION_BY_ID = new Map(FORMATIONS.map((f) => [f.id, f]));

// 稳态采样起点：跳过暖场与前几波爬坡，避免把「刚开局没人」算进稳态。
const STEADY_AFTER_MS = 20000;

// ---------- 命令行 ----------
const argv = process.argv.slice(2);
const flags = new Set();
const positional = [];
for (const arg of argv) {
  if (typeof arg === 'string' && arg.startsWith('--')) flags.add(arg);
  else positional.push(arg);
}
const flagNumber = (name, fallback) => {
  for (const f of flags) {
    if (f.startsWith(name + '=')) {
      const v = Number(f.slice(name.length + 1));
      return Number.isFinite(v) ? v : fallback;
    }
  }
  return fallback;
};
const flagString = (name, fallback) => {
  for (const f of flags) if (f.startsWith(name + '=')) return f.slice(name.length + 1);
  return fallback;
};
const NO_VARIANTS = flags.has('--no-variants');
const DENSE = flags.has('--dense');
const QUIET = flags.has('--no-timeline');
const REPEAT = Math.max(1, Math.min(16, Math.floor(flagNumber('--repeat', 1))));
const SEED_TAG = flagString('--seed', '');

// 仿真可调档：用环境变量覆盖刷怪端点，方便在改默认值之前先扫一遍平衡。
// 不传时完全等价于 roster.difficultyAt(now, stage)；--dense 只是给这组覆盖起个名字。
const STAY = (process.env.SIM_STAY ?? '0') === '1';
// 反硬控档：被接触挂上击退僵直后，玩家按右键冲刺挣开（见文件头说明）。
// 与 Player.startDash 同一组数值，不另设一套，保证仿真口径与游戏内一致。
const DASH_ON = (process.env.SIM_DASH ?? '0') === '1';
// Boss 战档：把 Boss 血量与阶段机接进仿真（spec §4.1 的量级验收）。
const BOSS_ON = (process.env.SIM_BOSS ?? '0') === '1';
// 编队档（Wave C）：编队刷怪 + 护卫光环。默认关闭，且必须保证关闭时输出零漂移，
// 所以所有新逻辑都挂在这个开关上，连 summary 的字段都是按开关收放的。
const FORMATION_ON = (process.env.SIM_FORMATION ?? '0') === '1';
const DASH = PLAYER.dash;
const CONTACT_CONTROL_MS = 240;   // DEFAULT_CONTACT_CONTROL.ms（击退僵直）
const CONTACT_CONTROL_FORCE = 36; // DEFAULT_CONTACT_CONTROL.force（玩家被顶开的像素）
const DASH_TRY_EVERY_MS = 1200;   // 受控期间每 1.2 秒按一次冲刺（与冷却同口径）
const num = (name, fallback) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) ? v : fallback;
};
const SPAWN_START = num('SIM_SPAWN_START', DENSE ? 450 : DIFFICULTY.spawnMsStart);
const SPAWN_END = num('SIM_SPAWN_END', DENSE ? 330 : DIFFICULTY.spawnMsEnd);
const MAX_START = num('SIM_MAX_START', DENSE ? 60 : DIFFICULTY.maxAliveStart);
const MAX_END = num('SIM_MAX_END', DENSE ? 90 : DIFFICULTY.maxAliveEnd);
const WAVE_END = num('SIM_WAVE_END', DIFFICULTY.waveEnd);
const DENSITY_OVERRIDE = process.env.SIM_NO_ACT_SCALE === '1' ? null : ACT_DENSITY;
function difficulty(now, stage) {
  const k = Math.min(1, Math.max(0, now / DIFFICULTY.rampMs));
  const den = (DENSITY_OVERRIDE && DENSITY_OVERRIDE[stage]) || { maxAlive: 1, spawnMs: 1 };
  return {
    hp: Math.round(DIFFICULTY.hpStart + (DIFFICULTY.hpEnd - DIFFICULTY.hpStart) * k),
    speed: DIFFICULTY.speedStart + (DIFFICULTY.speedEnd - DIFFICULTY.speedStart) * k,
    spawnMs: (SPAWN_START + (SPAWN_END - SPAWN_START) * k) * den.spawnMs,
    maxAlive: Math.round((MAX_START + (MAX_END - MAX_START) * k) * den.maxAlive),
    damage: Math.round(DIFFICULTY.damageStart + (DIFFICULTY.damageEnd - DIFFICULTY.damageStart) * k),
    wave: Math.max(1, Math.round(DIFFICULTY.waveStart + (WAVE_END - DIFFICULTY.waveStart) * k)),
  };
}

const clampStage = (v) => Math.min(7, Math.max(1, Number(v) || 1));

// 场是玩法单位：一次仿真跑一场，幕号由场号反推（与 src/logic/acts.js 同一条规则）。
const stage = clampStage(positional[0]);
const seconds = Math.min(600, Math.max(30, Number(positional[1]) || 180));
const kitId = positional[2] || 'bolt';
// 可选第 4 个位置参数：尸爆比例（默认用 DEATH_BURST 的设计值），用于扫平衡
const burstRatio = Number(positional[3]);

function mean(list) {
  if (!list.length) return null;
  let sum = 0;
  for (const v of list) sum += v;
  return sum / list.length;
}
function median(list) {
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
const round1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
const roundInt = (v) => (Number.isFinite(v) ? Math.round(v) : null);

// ---------- 单次仿真 ----------
// 返回 { summary, timeline }，不打印；CLI 负责输出格式。
function runSim({ stage: stageArg, seconds: secondsArg, kitId: kitArg, burstRatio: burstArg, seedTag, noVariants }) {
  const chapter = chapterOf(stageArg);
  const world = WORLD_SIZES[stageArg];
  const bounds = { left: 24, top: 40, right: world.w - 24, bottom: world.h - 24 };
  const rng = new Rng('density-sim:' + stageArg + ':' + kitArg + (seedTag ? ':' + seedTag : ''));

  // ---------- 构筑：第一幕用起手套装；后续幕补满本幕解封格并铺一套范围法术 ----------
  // 解封上限与脉流起点都按「幕」取（ACTS[chapter-1]）；draft.act 也是幕号，不是场号。
  const run = createRun('sim', kitArg);
  run.chapter = chapter;
  run.stage = stageArg;
  const grid = createGrid();
  if (chapter > 1) {
    const unlocked = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].slice(0, ACTS[chapter - 1].unlocked);
    run.draft.act = chapter;
    run.draft.unlocked = unlocked;
    const fill = ['flame_burst', 'starfall', 'chain_lightning', 'thorn_vine', 'frost_arrow', 'quake_maw', 'pierce_lance', 'holy_ward'];
    run.draft.slots = {};
    unlocked.forEach((id, i) => { run.draft.slots[id] = { kind: 'sigil', defId: fill[i % fill.length] }; });
  }
  const applied = applyDraft(grid, run.draft, { phase: 'intermission' });
  if (!applied.ok) throw new Error('构筑快照无效: ' + JSON.stringify(applied.errors));
  rebuildDerived(grid, ACTS[chapter - 1].baseIntervalMs);

  // ---------- 玩家 ----------
  const player = {
    x: world.w / 2, y: world.h / 2, hp: PLAYER.hp, maxHp: PLAYER.hp,
    radius: PLAYER.radius, speed: PLAYER.speed, shield: 0, shieldCap: 40,
    alive: true, invulnUntil: 0,
  };
  // 反硬控档（SIM_DASH=1）：接触挂上的击退僵直 + 冲刺状态机。
  // 与 Player 侧同一组语义：僵直期位移被锁死、冲刺期间位移由时间轴接管并附带无敌。
  let controlUntil = 0;
  const dash = { until: 0, invulnUntil: 0, readyAt: 0, dirX: 1, dirY: 0, fromX: 0, fromY: 0 };
  let nextDashTryAt = 0;
  let controlHits = 0;
  let dashTries = 0;
  let dashStarted = 0;
  let dashClearedControl = 0;
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

  // ---------- 新统计口径 ----------
  // 变体构成：只数刷出来的怪，normal = 没叠变体（含天生精英）
  const variantCounts = { normal: 0 };
  for (const id of Object.keys(ENEMY_VARIANTS)) variantCounts[id] = 0;
  let spawns = 0;
  let naturalEliteSpawns = 0;
  // 编队档（SIM_FORMATION=1）：轮次 / 成功编队轮数 / 降级次数 / 成员只数 / 光环生效帧数。
  // waveIndex 与 BattleScene 同义——只在真正刷出怪之后 +1，满场早退不推进。
  let waveIndex = 0;
  let formationWaves = 0;
  let formationDegrades = 0;
  let formationMembers = 0;
  // 编队批次序号（同 BattleScene.formationSeq）：拼 formationUid 用，同模板两批互不串队。
  let formationSeq = 0;
  let auraActiveFrames = 0;
  // 变体 roll 只发生在「非天生精英」上，所以变体占比会被天生精英稀释；
  // variantPctEligible 才是与 CHAPTER_VARIANT_WEIGHTS 可直接对照的口径。
  let variantEligibleSpawns = 0;
  // 护盾：盾吸收总量 / 破盾次数（按 shield 由正归零的跳变计数）
  let shieldAbsorbed = 0;
  let shieldBreaks = 0;
  let shieldBreakConsumed = 0;
  // 清怪速度：每次法术击杀的「出生→死亡」间隔、每波怪的「开刷→全清」间隔
  const clearSamples = [];
  const waveClearSamples = [];
  const openCohorts = [];
  // 同屏：峰值（只数）与稳态均值（槽位/只数）
  let maxAlive = 0;
  let loadPeak = 0;
  let steadyFrames = 0;
  let steadyAliveSum = 0;
  let steadyLoadSum = 0;
  // 敌方弹丸：与 BattleScene.addHostileShot 同一套 64 上限（超限静默丢弃），只计数不结算伤害
  const hostile = [];
  let hostilePeak = 0;
  let hostilePeakAt = 0;
  let hostileDropped = 0;
  let hostileFramesOverCap = 0;
  let hostileDropThisFrame = false;
  let loadOverCapEvents = 0;
  // 所有刷出来过的怪（含已死）：护盾衰减按对象跟踪，死亡后仍要能算最后一段吸收
  const allSpawned = [];

  // ---------- Boss 战（SIM_BOSS=1）----------
  // 与 BattleScene.beginEncounter 同一条规则：大 Boss 一登场就停掉杂兵刷怪
  // （updateSpawner 的 `if (this.bossStarted) return;`）。仿真里同样不刷杂兵——
  // 否则玩家的伤害被杂兵分走，「一战时长」就不再是 Boss 战时长。
  // Boss 数值走 logic/boss.js 的 bossStats（血 = (170+85×场)×1.45，减伤 30% 走 armor 通道）。
  const bossStatsNow = bossStats(stageArg, 'major');
  const boss = BOSS_ON ? {
    isBoss: true, defId: 'boss', def: null,
    // 落点照抄 beginEncounter：贴在玩家上方 92px，并被 HUD 下限夹住
    x: player.x, y: Math.max(42 + 104 - 21, player.y - 92),
    hp: bossStatsNow.hp, maxHp: bossStatsNow.hp, radius: 14,
    damage: 12,                      // entities/Boss.js 的 this.damage
    armor: bossStatsNow.armor, baseArmor: bossStatsNow.armor,
    alive: true, counted: false, breakUntil: 0,
    model: createBossModel(stageArg),
  } : null;
  // Boss 战统计：一战时长 / 阶段切换 / 大招与破防次数（B8 的验收口径）
  let bossKilled = false;
  let bossKilledAt = 0;
  let bossPhaseShifts = 0;
  let bossPhasesReached = 0;
  let bossUlts = 0;
  let bossBreaks = 0;
  let bossShots = 0;
  if (boss) { enemies.push(boss); allSpawned.push(boss); }

  // Boss 阶段机：与 entities/Boss.js 的 update 同一条路径（stepBoss + ctx.hpRatio）。
  // 破防窗口起点同样由「场景层」在 mode 边沿写——logic/boss.js 不持有时钟字段。
  function updateBoss(b, dtMs) {
    const lastMode = b.model.mode;
    const lastPhase = b.model.phase;
    // 追击：同 Boss.update 的规则（>55px 且不在预警里时以 14px/s 贴近玩家）
    const dx = player.x - b.x, dy = player.y - b.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > 55 && b.model.windupLeft <= 0) {
      b.x += dx / d * 14 * dtMs / 1000;
      b.y += dy / d * 14 * dtMs / 1000;
    }
    const shots = stepBoss(b.model, dtMs, b, player, { hpRatio: b.hp / b.maxHp });
    bossShots += shots.length;
    for (const shot of shots) addHostileShot(shot);
    const now = engine.now;
    if (b.model.mode !== lastMode) {
      if (b.model.mode === 'ultimate') bossUlts++;
      if (b.model.mode === 'break') {
        b.breakUntil = now + BREAK_WINDOW_MS;
        bossBreaks++;
      }
    }
    if (b.model.phase !== lastPhase) {
      // 首帧 model.phase 是 undefined，stepBoss 首次调用才补 0：那一次不是「换阶段」，
      // 不计入切换次数，否则场 1 也会凭空多记一次（PHASE_THRESHOLDS 只有两档）。
      if (Number.isFinite(lastPhase)) {
        bossPhaseShifts++;
        if (b.model.phase > bossPhasesReached) bossPhasesReached = b.model.phase;
      }
    }
    // 破防期间护甲归零（原值存 baseArmor）：窗口内只吃 ×1.2 却仍被 30% 减伤挡掉的话，
    // 仿真会把一战时长算长——这里必须复现玩家实际感受到的窗口收益。
    if (b.model.mode === 'break') {
      if (b.armor !== 0) { b.baseArmor = b.armor; b.armor = 0; }
    } else if (b.baseArmor !== undefined && b.armor === 0) {
      b.armor = b.baseArmor;
    }
  }

  const aliveEnemies = () => enemies.filter((e) => e.alive);
  const stats = { shots: 0, hits: 0, emptyShots: 0 };
  // T2/T3 新增的攻击事件：只计数、不结算玩家伤害（用于判断弹幕/召唤压力与渲染预算）。
  const attackEvents = { melee: 0, summon: 0, turret: 0, rune: 0 };

  // ---------- 引擎：真实脉流 + 真实索敌/结算 ----------
  function combatState() {
    return { player, oath: grid.oath, now: engine.now, buffMul: 1, hitBonus: 0 };
  }
  function resolveShieldTracking() {
    // 盾只减不增：逐对象比较上一次观测值，差值即本帧被盾吸收的伤害。
    for (const e of allSpawned) {
      const seen = Number.isFinite(e.shieldSeen) ? e.shieldSeen : 0;
      const now = Number.isFinite(e.shield) ? Math.max(0, e.shield) : 0;
      if (seen > now) {
        shieldAbsorbed += seen - now;
        if (now <= 0) shieldBreaks++;
      }
      e.shieldSeen = now;
    }
  }
  function settleDead(bySpell) {
    for (const e of enemies) {
      if (!e.alive && !e.counted) {
        e.counted = true;
        // Boss 一战时长：从登场到倒下的整段墙钟时间（杂兵口径不掺进来）
        if (e.isBoss) { bossKilled = true; bossKilledAt = engine.now; }
        if (bySpell) {
          kills++;
          const now = engine.now;
          if (now - lastKillAt > 1500) killStreak = 0;
          lastKillAt = now;
          killStreak++;
          if (killStreak % 12 === 0 && player.hp < player.maxHp) player.hp = Math.min(player.maxHp, player.hp + 1);
          if (Number.isFinite(e.spawnAt)) clearSamples.push(now - e.spawnAt);
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
  function updateCohorts() {
    // 一波怪全清（击杀/撞人/回收都算「解除占位」）才记一次清波时间
    for (let i = openCohorts.length - 1; i >= 0; i--) {
      const cohort = openCohorts[i];
      let done = true;
      for (const e of cohort.members) if (!e.counted) { done = false; break; }
      if (done) {
        waveClearSamples.push(engine.now - cohort.at);
        openCohorts.splice(i, 1);
      }
    }
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
        // 走真实 applyDamage：溅射同样先吃盾，统计口径才一致
        if (d <= 26) applyDamage(e, per);
      }
    }
  }

  // 割草连锁：与 BattleScene.triggerDeathBursts 同一套规则（0.5 最大生命、半径 30、最多 80 次）
  function triggerDeathBursts() {
    const seeds = enemies.filter((e) => !e.alive && e.hp === 0 && !e.counted);
    if (seeds.length) resolveDeathBursts({ enemies, seeds, damageRatio: Number.isFinite(burstArg) ? burstArg : undefined });
  }

  const engine = new SigilEngine({
    seed: 'sim-signal:' + stageArg,
    grid,
    startCells: grid.unlockedIds().slice(0, ACTS[chapter - 1].starts),
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
          resolveShieldTracking();
          settleDead(true);
        }
      } else if (type === 'combo:fire') {
        resolveComboBonus({ grid, order: data.order, defId: data.defId, bonus: data.bonus, state: combatState(), enemies: aliveEnemies() });
        triggerDeathBursts();
        resolveShieldTracking();
        settleDead(true);
      }
    },
  });
  engine.start();

  // Boss 登场即停刷怪（见上），同时按 BattleScene.stageIntro 的口径给玩家 900ms 无敌：
  // 真机里 Boss 是贴在玩家头上现形的，没这段无敌第一下接触伤害必吃。
  if (boss) invulnUntil = engine.now + 900;

  // ---------- 刷怪：与 BattleScene.updateSpawner / spawnWave / spawnEnemy 同一套节奏与顺序 ----------
  let spawnTimer = 900;
  const WARMUP_MS = 1600;

  // spawnEnemy：落点 → 类型 roll →（天生精英跳过变体 roll）→ 变体 roll → composeEnemyDef
  // opts.defId / opts.formationId：编队波由 rollFormation 指定怪种与编队（spec §5.2）。
  // 普通波不传 opts，行为与旧版逐字一致。
  function spawnEnemy(dif, point, opts = {}) {
    const x = point.x;
    const y = point.y;
    // 编队波指定怪种时不再抽类型（rollFormation 已按幕过滤过）：与 BattleScene 一样
    // 少一次 rng 调用。这是编队波固有的消耗差异，不额外补 roll——补了反而会让同 seed 漂移。
    const base = opts.defId && ENEMY_TYPES[opts.defId]
      ? ENEMY_TYPES[opts.defId]
      : pickEnemyType(chapter, rng.next());
    // 天生精英不再叠变体；这两次 roll 的顺序必须与 BattleScene 一致，否则同 seed 序列会位移
    const variant = noVariants || base.elite ? null : pickEnemyVariant(chapter, base, rng.next());
    const def = noVariants ? composeEnemyDef(base, null) : composeEnemyDef(base, variant);
    const lv = levelStats(progression.level);
    const hp = Math.max(1, Math.round(dif.hp * (def.hpMul ?? 1) * lv.hpMul));
    // id 用后自增：旧版把 ++ 写在对象字面量里，导致 brain seed 实际用的是 id+1。
    // 这里显式保持同一顺序，否则同一 seed 的刷怪序列会整体位移，与旧基线不可比。
    const id = enemySeq++;
    const enemy = {
      id, defId: def.id, def, x, y,
      hp, maxHp: hp, radius: def.radius,
      speed: dif.speed * (def.speedMul ?? 1) * lv.speedMul,
      damage: Math.round((def.damage ?? dif.damage) * lv.damageMul),
      alive: true, counted: false, isBoss: false,
      armor: 0, guard: false, charging: false,
      // 护盾：与 Enemy 构造一致，按最终 hp × shieldHpMul 取整；非持盾变体恒为 0
      shield: 0, shieldMax: 0, shieldSeen: 0,
      shieldBrokenPending: false, stunUntil: -1,
      lastBlocked: 0, lastHitAmount: 0,
      spawnAt: engine.now,
      brain: createBrain(def.id, { now: engine.now, seed: def.id + ':' + enemySeq }),
    };
    const shieldMax = Math.max(0, Math.round(hp * (def.variant?.shieldHpMul ?? 0)));
    enemy.shieldMax = shieldMax;
    enemy.shield = shieldMax;
    enemy.shieldSeen = shieldMax;
    enemies.push(enemy);
    allSpawned.push(enemy);
    spawns++;
    variantCounts[def.variant?.id ?? 'normal']++;
    if (def.elite && !def.variant) naturalEliteSpawns++;
    else variantEligibleSpawns++;
    // 编队成员打标（spec §5.2）：光环按「这一批」分桶，formationPath 决定谁算前排。
    // formationPath 必须随成员落库而不是靠 defId 反查——同一个 defId 在不同编队里站位不同。
    // formationId 是模板（取数值），formationUid 是这一批（分组）：同模板两批是两支独立的队。
    if (opts.formationId) {
      enemy.formationId = opts.formationId;
      enemy.formationUid = opts.formationUid ?? opts.formationId;
      if (opts.formationPath) enemy.formationPath = opts.formationPath;
      formationMembers++;
    }
    return enemy;
  }

  function spawnWave(dif, count) {
    const points = pickWavePoints({
      rng: () => rng.next(), player, world,
      enemies: enemies.filter((e) => e.alive),
      count, minDist: 275, maxDist: 380, minGap: 30, nearDist: 250, farDist: 430,
    });
    const members = [];
    let spawned = 0;
    for (const point of points) {
      // 槽位预算：cost 2 的怪顶两只；一只都没刷时仍落第一只，避免整波空转（同 BattleScene）
      if (spawned > 0 && enemySpawnLoad(enemies) >= dif.maxAlive) break;
      members.push(spawnEnemy(dif, point));
      spawned++;
      // 战斗层刻意允许「最多超发 1 只」：这里记下实际超出槽位上限的次数，验收时看它是不是只有个位数
      if (enemySpawnLoad(enemies) > dif.maxAlive) loadOverCapEvents++;
    }
    if (members.length) openCohorts.push({ at: engine.now, members });
    // 返回实际落地只数：编队档要拿它判断「这一轮到底刷没刷出怪」，与 BattleScene 同口径。
    // 旧调用方不看返回值，所以默认档的输出不受影响。
    return members.length;
  }

  // 编队波（SIM_FORMATION=1）：整团落地，顺序照抄 BattleScene.spawnFormation——
  // rollFormation 抽模板与怪种（模板一次 + 每 role 一次 rng），抽不到就返回 0 让调用方降级。
  // 扇区方向：仿真的玩家对象没有 facing 字段，按 BattleScene 的 `?? 1` 兜底取「朝右」，
  // 于是 sectorAngle 同样等于 π：整队从玩家正面之外的一个方向压过来，队形读得出来。
  function spawnFormation(dif) {
    const roll = rollFormation({
      chapter,
      load: enemySpawnLoad(enemies),
      maxAlive: dif.maxAlive,
      rng: () => rng.next(),
    });
    if (!roll) {
      // 整轮降级：本幕抽不到模板/怪种，或总员额超过槽位闸（spawn.js 的 40% 规则）
      formationDegrades++;
      return 0;
    }
    // 这一批的实例 id（同 BattleScene.spawnFormation）：分组用 uid，取数值用模板 id。
    const formationUid = `${roll.formation.id}#${++formationSeq}`;
    const facing = Number.isFinite(player.facing) ? player.facing : 1;
    const sectorAngle = facing < 0 ? 0 : Math.PI;
    const sectorSpread = 1.2; // spec 的 ±0.6rad（扇区公式里 spread 是全宽）
    let spawned = 0;
    for (const pick of roll.picks) {
      const points = pickWavePoints({
        rng: () => rng.next(),
        player, world,
        enemies: enemies.filter((e) => e.alive),
        count: pick.count,
        sectorAngle, sectorSpread,
        minDist: 275, maxDist: 380, minGap: 30, nearDist: 250, farDist: 430,
      });
      for (const point of points) {
        // 槽位预算与普通波同一套：已落地 ≥1 只后超载就收手，已落地的成员留着——
        // 半支编队比整轮回滚自然（BattleScene 同）。
        if (spawned > 0 && enemySpawnLoad(enemies) >= dif.maxAlive) {
          formationWaves++;
          return spawned;
        }
        spawnEnemy(dif, point, {
          defId: pick.defId,
          formationId: roll.formation.id,
          formationUid,
          formationPath: pick.path,
        });
        spawned++;
      }
    }
    if (spawned > 0) formationWaves++;
    return spawned;
  }

  // 护卫光环（spec §5.3）：每帧重算，逐条对齐 BattleScene.refreshFormationAuras。
  // 不缓存是刻意的——前排这一帧刚死，后排这一帧喂给 stepBrain 的 speed 就必须已经没加成；
  // 缓存会留下「前排死了半秒内还在加成」的窗口，玩家看到的正是这个 bug。
  // 三条硬规则：①Boss 不进桶、不吃光环、也不能当「前排还活着」的证据；
  // ②精英可以当前排并给后排发光环，但自己不吃；③前排自己不拿光环（spec 写的是「其余成员」）。
  function refreshFormationAuras() {
    const groups = new Map();
    for (const e of enemies) {
      if (!e?.alive || !e.formationId || e.isBoss) continue;
      const key = e.formationUid ?? e.formationId;
      const arr = groups.get(key);
      if (arr) arr.push(e); else groups.set(key, [e]);
    }
    let anyAura = false;
    // 遍历「场上所有敌人」而不是仅分组成员：Boss/精英/刚死的成员也要走到这里被删一次，
    // 否则上一帧残留的字段会留到对象被移出列表为止。
    for (const e of enemies) {
      const inFormation = !!e && e.alive === true && !e.isBoss && !!e.formationId;
      const members = inFormation ? groups.get(e.formationUid ?? e.formationId) : null;
      // 模板缺失（拼错/旧 id）按「无光环」处理：宁可没有加成，也不凭 id 猜数值。
      const aura = members ? formationAuraOf(FORMATION_BY_ID.get(e.formationId)) : null;
      const hasVanguard = aura != null && members.some((m) => m.alive && m.formationPath === 'vanguard');
      // 收方剔除精英（表里「编队只给杂兵」说的是收方）与上前排的那只自己。
      const receives = hasVanguard && !e.def?.elite && e.formationPath !== 'vanguard';
      if (!receives) {
        // delete 而不是置 null：applyDamage 读的是 e.formationAura?.armorBonus，
        // 两种「没有」写两套判断只会让后续排查多一层。
        delete e.formationAura;
      } else {
        // 每帧新对象：某只被单独改字段时不能污染全队。
        e.formationAura = { armorBonus: aura.armorBonus, speedMul: aura.speedMul };
        anyAura = true;
      }
    }
    if (anyAura) auraActiveFrames++;
  }

  // ---------- 敌方弹丸：只计数不结算 ----------
  function addHostileShot(shot) {
    if (!shot || !Number.isFinite(shot.x) || !Number.isFinite(shot.y)) return;
    // 上限与 BattleScene 一致：满 64 发后新弹静默丢弃（仿真里把丢弃次数记下来，作为弹幕压力指标）
    if (hostile.length >= HOSTILE_CAP) {
      hostileDropped++;
      hostileDropThisFrame = true;
      return;
    }
    hostile.push({
      x: shot.x, y: shot.y,
      vx: Number.isFinite(shot.vx) ? shot.vx : 0,
      vy: Number.isFinite(shot.vy) ? shot.vy : 0,
      lifeMs: Number.isFinite(shot.lifeMs) ? shot.lifeMs : 2000,
    });
  }
  function updateHostileShots(dtMs) {
    const dt = dtMs;
    for (let i = hostile.length - 1; i >= 0; i--) {
      const s = hostile[i];
      s.lifeMs -= dt;
      s.x += s.vx * dt / 1000;
      s.y += s.vy * dt / 1000;
      if (s.lifeMs <= 0 || s.x < 0 || s.x > world.w || s.y < 0 || s.y > world.h) hostile.splice(i, 1);
    }
    if (hostile.length > hostilePeak) { hostilePeak = hostile.length; hostilePeakAt = engine.now; }
    // 「上限顶满」按帧计一次，和「丢弃发数」区分开
    if (hostileDropThisFrame) { hostileFramesOverCap++; hostileDropThisFrame = false; }
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
      // Boss 单独取反：共享风筝 AI 的径向符号是「往最近怪身上贴」的模型——杂兵撞一下就碎，
      // 贴上去换血是有效打法；但 Boss 撞不碎，贴过去等于站着白吃接触伤害。
      // 所以只有 SIM_BOSS=1 的目标里出现 Boss 时才改这一项的符号，杂兵基线一动不动。
      const radial = nearest.isBoss ? (90 - d) / 90 : (d - 90) / 90;
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

  // 反硬控档的「按右键」：复刻 Player.startDash（含清 root/slow/击退僵直、越界钳制、
  // 冷却 >= ms+afterMs 与 cooldownMs 的较大值）。方向取「远离最近怪」——真人被贴脸时
  // 也是朝空档闪，不会往怪堆里冲。
  function tryDash(now) {
    if (now < dash.readyAt || now < dash.until) { dashTries++; return false; }
    let nearest = null;
    let nd = Infinity;
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - player.x, e.y - player.y);
      if (d < nd) { nd = d; nearest = e; }
    }
    let ux = 1;
    let uy = 0;
    if (nearest) {
      const dx = player.x - nearest.x;
      const dy = player.y - nearest.y;
      const len = Math.hypot(dx, dy) || 1;
      ux = dx / len;
      uy = dy / len;
    }
    dash.fromX = player.x;
    dash.fromY = player.y;
    dash.dirX = ux;
    dash.dirY = uy;
    dash.until = now + DASH.ms;
    dash.invulnUntil = now + DASH.invulnMs;
    dash.readyAt = now + Math.max(DASH.ms + DASH.afterMs, DASH.cooldownMs);
    dashStarted++;
    if (engine.now < controlUntil) dashClearedControl++;
    controlUntil = 0; // startDash 清掉 root/slow/击退僵直
    dashTries++;
    return true;
  }

  const dtMs = 1000 / 60;
  const totalMs = secondsArg * 1000;
  const timeline = [];
  let nextSample = 0;
  let maxAliveCap = 0;

  for (let t = 0; t < totalMs; t += dtMs) {
    engine.advance(dtMs);
    resolveShieldTracking();
    // ---------- 反硬控：受控期间每 1.2 秒按一次右键冲刺 ----------
    // 与 Player.startDash 同口径：冲刺会把 root/slow/击退僵直一起清掉，所以这里
    // 「按下去」的同时立刻解除控制；位移与无敌由下面的时间轴接管。
    if (DASH_ON && engine.now < controlUntil && engine.now >= nextDashTryAt) {
      tryDash(engine.now);
      nextDashTryAt = engine.now + DASH_TRY_EVERY_MS;
    }

    // ---------- 玩家位移 ----------
    // 冲刺中位置完全由时间轴决定（同 Player.update 的早退分支），风筝 AI 这一帧不参与。
    if (DASH_ON && engine.now <= dash.until) {
      const k = Math.min(1, Math.max(0, (engine.now - (dash.until - DASH.ms)) / DASH.ms));
      player.x = Math.max(bounds.left, Math.min(bounds.right, dash.fromX + dash.dirX * DASH.distance * k));
      player.y = Math.max(bounds.top, Math.min(bounds.bottom, dash.fromY + dash.dirY * DASH.distance * k));
    } else if (DASH_ON && engine.now < controlUntil) {
      // 击退僵直没被冲刺解掉：锁位移（HumanPlayer 被控时不产生输入）
    } else {
      movePlayer(dtMs);
    }

    // 每 20 秒有效战斗时间保底 1 点经验（与 BattleScene 一致）
    timeExpTimer += dtMs;
    if (timeExpTimer >= 20000) {
      timeExpTimer -= 20000;
      const gained = grantExp(progression, 1, 1);
      if (gained.ok && gained.levelsGained > 0) levelUps += gained.levelsGained;
    }

    // 刷怪（room 按槽位算，与 updateSpawner 一致）
    // SIM_BOSS=1 停刷杂兵：大 Boss 战时杂兵刷怪本来就是关的（updateSpawner 的 bossStarted 早退）
    if (!BOSS_ON) {
      spawnTimer -= dtMs;
      if (spawnTimer <= 0) {
      const dif = difficulty(engine.now, stageArg);
      if (dif.maxAlive > maxAliveCap) maxAliveCap = dif.maxAlive;
      const warming = engine.now < WARMUP_MS;
      const room = dif.maxAlive - enemySpawnLoad(enemies);
      if (room > 0) {
        // 编队轮次（SIM_FORMATION=1）：与 BattleScene.updateSpawner 同一条规则——
        // 满场走 else 早退，这一轮不消耗；只有真刷出怪才 waveIndex+1，所以「没编成而降级的
        // 普通波」也算一轮，每 formationEvery 轮试一次编队的节拍才稳定，不会被某幕常年
        // 抽不到编队挤成「每轮都试一次再降级」。
        let spawnedNow = 0;
        if (FORMATION_ON && waveIndex > 0 && waveIndex % DIFFICULTY.formationEvery === 0) {
          spawnedNow = spawnFormation(dif);
        }
        if (spawnedNow === 0) {
          const wave = warming ? 1 : Math.max(1, Math.min(dif.wave ?? 1, room));
          spawnedNow = spawnWave(dif, wave);
        }
        if (spawnedNow > 0) waveIndex++;
        const jitter = 0.85 + rng.next() * 0.3;
        spawnTimer = Math.max(150, dif.spawnMs * jitter * (warming ? 2.2 : 1));
      } else {
        spawnTimer = 160;
      }
      }
    }

    // 敌人推进
    // 光环必须先于逐只结算：这一帧前排刚死，后排这一帧算速度时就必须已经没加成
    // （BattleScene 也是在 updateEnemies 开头先 refreshFormationAuras）。
    if (FORMATION_ON) refreshFormationAuras();
    for (const e of enemies) {
      if (!e.alive) continue;
      // Boss 走阶段机，不走杂兵 AI（它没有 brain，也没有变体/护盾那套字段）
      if (e.isBoss) { updateBoss(e, dtMs); continue; }
      // 破盾先于 AI 消费：眩晕 400ms 内冻结走位、不产生弹丸（同 Enemy.update）
      if (e.shieldBrokenPending) {
        e.shieldBrokenPending = false;
        e.shield = 0;
        e.stunUntil = engine.now + 400;
        shieldBreakConsumed++;
      }
      if (engine.now < e.stunUntil) continue;
      // 移速光环（spec §5.3）：仿真的移动只认 e.speed（不走 Enemy.speedFactor），
      // 所以 ×0.9 必须在这里乘上，否则「减速」这一半机制在仿真里等于不存在。
      // 非有限值按 1 处理：坏数据退化成无光环，而不是让 speed 变 NaN 把怪定死在原地。
      const auraSpeedMul = e.formationAura?.speedMul;
      const moveSpeed = Number.isFinite(auraSpeedMul) ? e.speed * auraSpeedMul : e.speed;
      const res = stepBrain(e.brain, {
        dtMs, now: engine.now,
        self: { x: e.x, y: e.y, speed: moveSpeed, radius: e.radius },
        player: { x: player.x, y: player.y },
        opts: { BATTLE: bounds, damage: e.damage },
      });
      if (Number.isFinite(res.x)) e.x = res.x;
      if (Number.isFinite(res.y)) e.y = res.y;
      if (Array.isArray(res.shots)) for (const shot of res.shots) addHostileShot(shot);
      if (res.melee) attackEvents.melee++;
      if (res.summon) {
        attackEvents.summon++;
        if (res.summon.kind === 'rune') attackEvents.rune++;
        else attackEvents.turret++;
      }
    }
    updateHostileShots(dtMs);

    // 拥挤分离（与战斗层同参数）
    if (enemies.length > 1) separateEnemiesBucketed(enemies, { gap: 20, player, contactDist: 26 });

    // 接触：默认（SIM_STAY=0）沿用旧模型「撞到就碎」；SIM_STAY=1 走 2026-11-17 新模型：
    // 怪不自毁、接触冷却 600ms、把怪顶开 18px，玩家吃一次伤害（600ms 无敌）。
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - player.x, e.y - player.y);
      if (d < e.radius + player.radius) {
        // Boss 不参与「撞一下就碎」：它只会撞疼玩家，然后照旧放它的招
        // （BattleScene 的接触分支同样只对 !e.isBoss 顶开/自毁）。
        if (e.isBoss) {
          if (engine.now >= invulnUntil) {
            const dmg = Math.max(1, Math.round(e.damage));
            const shield = Number.isFinite(player.shield) && player.shield > 0 ? player.shield : 0;
            const absorbed = Math.min(shield, dmg);
            player.shield = shield - absorbed;
            player.hp -= (dmg - absorbed);
            damageTaken += dmg;
            invulnUntil = engine.now + PLAYER.iframesMs;
          }
          continue;
        }
        if (STAY) {
          if (engine.now >= (e.contactCdUntil ?? 0)) {
            e.contactCdUntil = engine.now + 600;
            const dashInvuln = DASH_ON && engine.now < dash.invulnUntil;
            if (engine.now >= invulnUntil && !dashInvuln) {
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
            // 反硬控档：接触=击退（DEFAULT_CONTACT_CONTROL），与是否吃到伤害无关，
            // 只要玩家活着就重新挂 240ms 僵直并把玩家顶开 36px（顺序同 BattleScene；
            // 多只怪同帧命中会各自顶一次，与游戏内一致）
            if (DASH_ON && player.alive) {
              controlHits++;
              controlUntil = engine.now + CONTACT_CONTROL_MS;
              // 冲刺期间位置归时间轴独占（同 BattleScene.applyPlayerControl 的 dashing 分支）：
              // 这里照常顶开也会被下一帧的插值抹掉，玩家看不出被撞开，所以只挂僵直不位移。
              const dashing = engine.now <= dash.until;
              if (d > 0.001 && !dashing) {
                player.x = Math.max(bounds.left, Math.min(bounds.right, player.x + ((player.x - e.x) / d) * CONTACT_CONTROL_FORCE));
                player.y = Math.max(bounds.top, Math.min(bounds.bottom, player.y + ((player.y - e.y) / d) * CONTACT_CONTROL_FORCE));
              }
            }
            if (d > 0.001) { e.x += ((e.x - player.x) / d) * 18; e.y += ((e.y - player.y) / d) * 18; }
          }
          continue;
        }
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
    updateCohorts();

    const aliveNow = aliveEnemies().length;
    const loadNow = enemySpawnLoad(enemies);
    if (aliveNow > maxAlive) maxAlive = aliveNow;
    if (loadNow > loadPeak) loadPeak = loadNow;
    if (engine.now >= STEADY_AFTER_MS) {
      steadyFrames++;
      steadyAliveSum += aliveNow;
      steadyLoadSum += loadNow;
    }

    if (player.hp <= 0) {
      timeline.push({ t: Math.round(engine.now / 1000), alive: aliveNow, onScreen: 0, kills, hp: 0, dps: damageTaken });
      player.alive = false;
      break;
    }

    // Boss 一战打完就收工：通幕余韵/过场不该算进「一战时长」
    if (BOSS_ON && bossKilled) break;

    if (engine.now >= nextSample) {
      const onScreen = aliveEnemies().filter((e) => Math.abs(e.x - player.x) < 240 && Math.abs(e.y - player.y) < 135).length;
      timeline.push({
        t: Math.round(engine.now / 1000), alive: aliveNow, onScreen,
        kills, hp: Math.round(player.hp * 10) / 10, dmg: damageTaken,
      });
      nextSample += 10000;
    }
  }
  // 收尾：最后一段盾吸收（玩家死亡提前 break 时也要算上）
  resolveShieldTracking();

  const survived = player.hp > 0 ? secondsArg : Math.round(engine.now / 1000);
  const safeSurvived = Math.max(1, survived);
  const variantPct = {};
  const variantPctEligible = {};
  for (const id of Object.keys(variantCounts)) {
    variantPct[id] = spawns > 0 ? round1((variantCounts[id] / spawns) * 100) : 0;
    // normal 要扣掉天生精英，否则「可 roll 分母」里混进了从不参与 roll 的那批
    const hit = id === 'normal' ? Math.max(0, variantCounts.normal - naturalEliteSpawns) : variantCounts[id];
    variantPctEligible[id] = variantEligibleSpawns > 0
      ? round1((hit / variantEligibleSpawns) * 100) : 0;
  }
  const summary = {
    mode: noVariants ? 'baseline' : 'variants',
    chapter, stage: stageArg, kit: kitArg, seconds: secondsArg, survivedS: survived,
    aliveAtEnd: aliveEnemies().length, maxAlive,
    kills, killsPerSec: +(kills / safeSurvived).toFixed(2),
    killsPerMin: Math.round((kills / safeSurvived) * 60),
    contactDeaths, damageTaken, hpLeft: Math.max(0, Math.round(player.hp * 10) / 10),
    level: progression.level, levelUps, triggers: engine.stats.triggers,
    shots: stats.shots, hits: stats.hits, emptyShots: stats.emptyShots,
    blocked: engine.stats.blocked, combos: engine.stats.combos,
    // ---- 变体层 / 密度口径 ----
    spawns, variantCounts, variantPct, variantPctEligible,
    naturalEliteSpawns, variantEligibleSpawns,
    shieldAbsorbed: Math.round(shieldAbsorbed), shieldBreaks, shieldBreakConsumed,
    clearMedianMs: roundInt(median(clearSamples)), clearMeanMs: roundInt(mean(clearSamples)),
    clearSamples: clearSamples.length,
    waveClearMedianMs: roundInt(median(waveClearSamples)), waveClearMeanMs: roundInt(mean(waveClearSamples)),
    waveClearSamples: waveClearSamples.length,
    loadPeak, loadSteady: round1(steadyFrames ? steadyLoadSum / steadyFrames : null),
    aliveSteady: round1(steadyFrames ? steadyAliveSum / steadyFrames : null),
    maxAliveCap,
    hostilePeak, hostilePeakAt: Math.round(hostilePeakAt / 1000),
    hostileDropped, hostileFramesOverCap, hostileCap: HOSTILE_CAP,
    attackEvents,
    loadOverCapEvents,
    // ---- 反硬控档（SIM_DASH=1）----
    dashOn: DASH_ON, stayOn: STAY,
    controlHits, dashTries, dashStarted, dashClearedControl,
    // ---- Boss 战档（SIM_BOSS=1）----
    // bossOn=false 时这组字段仍是 null/0：老口径的消费方（对比脚本）不用改代码。
    bossOn: BOSS_ON,
    bossHp: boss ? boss.maxHp : null,
    bossKilled, bossFightS: bossKilled ? Math.round(bossKilledAt / 1000) : null,
    bossHpLeft: boss ? Math.max(0, Math.round(boss.hp)) : null,
    bossPhaseShifts, bossPhasesReached, bossUlts, bossBreaks, bossShots,
    // ---- 编队档（SIM_FORMATION=1）----
    // 只在开档时出现，而不是 bossOn 那种「恒在字段 + null 占位」：本轮验收口径是
    // 「默认档输出逐字节不变」，恒在字段会直接改写每一行 SIM_SUMMARY（Boss 那次是
    // 明确改过基线口径的，这次不是）。formationWaves = 成功整团落地的轮次，
    // formationDegrades = rollFormation 抽不到而整轮降级的次数，auraActiveFrames =
    // 至少有一只成员吃到光环的帧数（60fps 下 /60 就是秒数）。
    ...(FORMATION_ON ? {
      formationWaves, formationDegrades, formationMembers, auraActiveFrames,
    } : {}),
  };
  return { summary, timeline };
}

// ---------- CLI ----------
const aggregate = (list) => {
  const numericKeys = [
    'kills', 'killsPerSec', 'killsPerMin', 'maxAlive', 'aliveAtEnd', 'aliveSteady',
    'loadPeak', 'loadSteady', 'maxAliveCap', 'clearMedianMs', 'waveClearMedianMs',
    'hostilePeak', 'hostileDropped', 'hostileFramesOverCap', 'loadOverCapEvents',
    'shieldAbsorbed', 'shieldBreaks',
    'damageTaken', 'hpLeft', 'level', 'contactDeaths',
    'controlHits', 'dashTries', 'dashStarted', 'dashClearedControl',
    'bossHp', 'bossFightS', 'bossHpLeft', 'bossPhaseShifts', 'bossPhasesReached',
    'bossUlts', 'bossBreaks', 'bossShots',
  ];
  // 编队档字段只在开档时进聚合表：--repeat 的输出形状同样要保证默认档零漂移
  if (FORMATION_ON) {
    numericKeys.push('formationWaves', 'formationDegrades', 'formationMembers', 'auraActiveFrames');
  }
  const out = {
    runs: list.length,
    mode: list[0].mode, chapter: list[0].chapter, stage: list[0].stage,
    kit: list[0].kit, seconds: list[0].seconds,
  };
  for (const key of numericKeys) {
    const vals = list.map((r) => r[key]).filter((v) => Number.isFinite(v));
    out[key] = vals.length
      ? {
        mean: round1(mean(vals)), median: round1(median(vals)),
        min: round1(Math.min(...vals)), max: round1(Math.max(...vals)), n: vals.length,
      }
      : null;
  }
  // 变体占比取均值（每幕每变体）
  const variantPctMean = {};
  const variantPctEligibleMean = {};
  for (const id of Object.keys(list[0].variantPct ?? {})) {
    const vals = list.map((r) => r.variantPct[id]).filter((v) => Number.isFinite(v));
    variantPctMean[id] = vals.length ? round1(mean(vals)) : null;
    const elig = list.map((r) => r.variantPctEligible?.[id]).filter((v) => Number.isFinite(v));
    variantPctEligibleMean[id] = elig.length ? round1(mean(elig)) : null;
  }
  out.variantPctMean = variantPctMean;
  out.variantPctEligibleMean = variantPctEligibleMean;
  // 攻击事件（近战出手/召唤物）取均值，便于判断压力是否随幕数超线性增长
  const attackMean = {};
  for (const key of ['melee', 'summon', 'turret', 'rune']) {
    const vals = list.map((r) => r.attackEvents?.[key]).filter((v) => Number.isFinite(v));
    attackMean[key] = vals.length ? round1(mean(vals)) : null;
  }
  out.attackEvents = attackMean;
  return out;
};

const results = [];
// 日志头部打印模式名：接触模型（stay/die）与反硬控档（dash），避免两次跑的数字对不上口径
console.log('SIM_MODE ' + JSON.stringify({
  contact: STAY ? 'stay' : 'die',
  dash: DASH_ON ? 'on' : 'off',
  boss: BOSS_ON ? 'on' : 'off',
  // 同样只在开档时出现：SIM_MODE 是每一行输出的第一行，加个恒在字段就等于改基线。
  ...(FORMATION_ON ? { formation: 'on' } : {}),
  variants: NO_VARIANTS ? 'baseline' : 'variants',
  dense: DENSE ? 'on' : 'off',
  chapter: chapterOf(stage), seconds: seconds,
}));
for (let i = 0; i < REPEAT; i++) {
  const seedTag = REPEAT > 1 ? ['r' + (i + 1)].concat(SEED_TAG ? [SEED_TAG] : []).join(':') : SEED_TAG;
  const { summary, timeline } = runSim({
    stage, seconds, kitId, burstRatio, seedTag, noVariants: NO_VARIANTS,
  });
  results.push(summary);
  console.log('SIM_SUMMARY ' + JSON.stringify(summary));
  console.log('SIM_VARIANTS ' + JSON.stringify({
    chapter: summary.chapter, stage: summary.stage, mode: summary.mode,
    spawns: summary.spawns, counts: summary.variantCounts, pct: summary.variantPct,
    pctEligible: summary.variantPctEligible,
    naturalEliteSpawns: summary.naturalEliteSpawns,
    variantEligibleSpawns: summary.variantEligibleSpawns,
  }));
  if (REPEAT === 1 && !QUIET) {
    console.log('t(s)\talive\tonScreen\tkills\thp\tdmg');
    for (const row of timeline) console.log([row.t, row.alive, row.onScreen ?? '-', row.kills, row.hp, row.dmg ?? '-'].join('\t'));
  }
}
if (REPEAT > 1) console.log('SIM_AGGREGATE ' + JSON.stringify(aggregate(results)));