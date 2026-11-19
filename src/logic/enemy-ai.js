// 敌人行为纯逻辑层：只负责「下一步坐标 + 本帧生成的弹丸」。
// 约束：不引用 Phaser / DOM，不调用 Math.random；所有随机性都由 createBrain 的 seed 决定，
// 因此同一 seed + 同一输入序列必然得到同一条轨迹（可回放、可测试）。
//
// 调用约定：
//   createBrain(defId, { now, seed }) -> brain（纯数据，可 structuredClone）
//   stepBrain(brain, { dtMs, now, self, player, opts })
//     -> { x, y, shots: [], stomp, charging, windup, guard }
//   stomp 为 null 或 { x, y, radius, damage }：践踏/砸地结算事件，由场景扣血。
//   guard 为布尔：举盾窗口（Enemy 据此把 armor 置 0.55，并由场景决定是否吃到伤害减免）。
//   self: { x, y, speed, radius }；opts: { BATTLE: { left, right, top, bottom }, damage }
//
// 2026-11 AI 差异化重构：
//   AI_PROFILE 是「defId → behavior + tune」的单一事实源，stepBrain 按 behavior 分派；
//   旧行为（weave/orbit/volley/phase/blink_caster/lunge/judge/slam/eclipse/charge/stomp/march）
//   的 tune 直接复用旧规则常量，时序与数值零漂移；新行为各有独立节拍。
//
// 腐尸的「慢 / 厚」仍是 roster 里的 speedMul / hpMul，由刷怪层乘算后再传进 speed / hp；
// 本层只按收到的 speed 行走。

import { leadAim, makeShot } from './hostile.js';

import {
  DEFAULT_BATTLE,
  AI_PROFILE,
  MELEE_RULES,
  RANGED_RULES,
  EMPTY_TUNE,
  LURCH_MOMENTUM,
  TURRET_LIFE_MS,
  RUNE_LIFE_MS,
  BAT_RULE,
  BULWARK_RULE,
  CHAIN_RULE,
  CHARGE_VOLLEY_RULE,
  CULTIST_RULE,
  DART_RULE,
  DOUBLE_CHARGE_RULE,
  DRIFT_RULE,
  ECLIPSE_RULE,
  ERUPTION_RULE,
  JUDGE_RULE,
  KNIGHT_RULE,
  LANCE_RULE,
  LUNGE_RULE,
  LURCH_RULE,
  MIRROR_RULE,
  OATH_RULE,
  PHASE_RULE,
  SKITTER_RULE,
  SLAM_CHARGE_RULE,
  SLAM_RULE,
  SPRING_RULE,
  STALK_RULE,
  STITCH_RULE,
  VOLLEY_RULE,
} from '../data/enemy-tables.js';
export * from '../data/enemy-tables.js';
// 26 个合法 defId 由 AI_PROFILE 派生：新增敌人只改 AI_PROFILE 一处。
const KNOWN_DEFS = new Set(Object.keys(AI_PROFILE));
const TAU = Math.PI * 2;
const MAX_STEP_MS = 10000;   // 单步上限：手滑传入超大 dt 也只前进 10s，不把坐标推到天边

import { seedText, hashSeed, nextRandom } from './enemy/rng.js';
import {
  finiteOr, clampCoord, finitePoint, unitVector, readBounds, readSelf, readPlayer,
  clampToBounds, approach, holdBand, lockAim,
} from './enemy/motion.js';
import {
  makeResult, isWindup, tuneOf, beginWindup, rangedSpecOf, beginCast, stepMelee,
  shotDamage, makeVolley, makeSummonFor, finishCast,
} from './enemy/attack.js';

export function createBrain(defId, options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const def = typeof defId === 'string' && KNOWN_DEFS.has(defId) ? defId : 'skeleton';
  const profile = AI_PROFILE[def];
  const tune = profile.tune;
  const brain = {
    defId: def,
    behavior: profile.behavior,  // 行为名（全局唯一），stepBrain 按它分派
    tune,                        // 该行为的参数表（旧行为直接引用旧常量）
    seed: seedText(opts.seed ?? 0),
    rngState: hashSeed(opts.seed ?? 0),
    // 召唤事件用 owner 标记施法者；场景可传 id（敌人 id 或任意稳定标识）
    id: Number.isFinite(opts.id) || typeof opts.id === 'string' ? opts.id : undefined,
    bornAt: finiteOr(opts.now, 0),
    now: finiteOr(opts.now, 0),
    mode: 'walk',        // walk | windup | charge | dash | hold | recover | guard | stagger | lateral | pause | sprint
    x: null,             // 最近一次输出坐标；null 表示还没走过
    y: null,
    dir: null,           // 锁定方向（直线、蝙蝠前进轴、冲锋轴、侧移轴……）
    perp: null,          // 蝙蝠摆动的垂直轴
    phase: 0,            // 蝙蝠正弦相位；也用作符纹蛛的分段计时
    wobbleSign: 0,
    orbitDir: 1,
    attackIn: 0,
    windupLeft: 0,
    chargeIn: 0,
    chargeLeft: 0,
    aim: null,           // 旧的「预警锁定点」字段：只保留给渲染/冲锋方向，远程弹道不再依赖它
    // 近战（§3）：meleeIn 冷却、meleeLeft 前摇剩余、melees 出手次数；
    // meleePreview 是前摇期间的扇形提示（T3 的 drawCastPose 用，angle 每帧指向玩家当前方向）。
    meleeIn: 0,
    meleeLeft: 0,
    melees: 0,
    meleePreview: null,
    // 远程（§4）：casts 已出手轮数（召唤节拍用）；castIn 是 dart/mirror 这类无内置节拍行为的施法间隔。
    casts: 0,
    castIn: 0,
    stompIn: 0,
    stomps: 0,
    blinkIn: 0,
    pauseLeft: 0,
    burstLeft: 0,
    burstIn: 0,
    blinks: 0,
    shots: 0,
    windups: 0,
    charges: 0,
  };

  // 按行为初始化计时器与随机侧向。顺序与旧版一致：同一 seed 下旧行为的随机序列不变。
  switch (profile.behavior) {
    case 'weave':
    case 'skitter':
      brain.wobbleSign = nextRandom(brain) < 0.5 ? -1 : 1;
      break;
    case 'stalk':
      brain.wobbleSign = nextRandom(brain) < 0.5 ? -1 : 1;
      brain.orbitDir = nextRandom(brain) < 0.5 ? -1 : 1;
      brain.attackIn = tune.intervalMs;
      break;
    case 'orbit':
    case 'volley':
    case 'phase':
    case 'blink_caster':
    case 'judge':
    case 'eclipse':
    case 'chain':
    case 'lance':
      brain.orbitDir = nextRandom(brain) < 0.5 ? -1 : 1;
      if (profile.behavior === 'orbit' || profile.behavior === 'volley'
        || profile.behavior === 'judge' || profile.behavior === 'eclipse') {
        brain.attackIn = tune.attackMs;
      } else if (profile.behavior === 'phase' || profile.behavior === 'blink_caster') {
        brain.blinkIn = tune.blinkMs;
      } else {
        // chain / lance：环带站位 + 攻击间隔
        brain.attackIn = tune.intervalMs;
      }
      break;
    case 'charge':
    case 'lunge':
    case 'slam_charge':
    case 'double_charge':
    case 'charge_volley':
      brain.chargeIn = tune.intervalMs;
      break;
    case 'stomp':
      brain.stompIn = tune.stompMs;
      break;
    case 'slam':
      brain.attackIn = tune.cooldownMs;
      break;
    case 'lurch':
    case 'spring':
      brain.attackIn = tune.walkMs;
      break;
    case 'bulwark':
      brain.attackIn = tune.guardEveryMs;
      break;
    case 'eruption':
      brain.chargeIn = tune.intervalMs;
      break;
    case 'drift':
      brain.blinkIn = tune.blinkEveryMs;
      break;
    case 'mirror':
      brain.chargeIn = tune.cooldownMs;
      brain.castIn = finiteOr(RANGED_RULES.dawn_shade?.attackMs, 3000);
      brain.lastPlayer = null;
      break;
    case 'dart':
      brain.mode = 'sprint';
      brain.attackIn = tune.sprintMs;
      brain.castIn = finiteOr(RANGED_RULES.ember_imp?.attackMs, 2600);
      break;
    case 'march':
    default:
      break;
  }
  return brain;
}

// ---------- 分行为：旧行为（tune 与旧常量逐值一致，逻辑未改） ----------
// 骷髅：出生首帧锁定玩家位置，之后直线推进（接触与自毁仍由战斗层负责）
function stepMarch(brain, ctx) {
  const { self, player, dt } = ctx;
  if (!brain.dir) brain.dir = unitVector(player.x - self.x, player.y - self.y) ?? { x: 0, y: 1 };
  brain.x = self.x + brain.dir.x * self.speed * (dt / 1000);
  brain.y = self.y + brain.dir.y * self.speed * (dt / 1000);
  return makeResult(brain);
}

// 噬魂蝠：直线基准点前进 + 垂直方向正弦偏移。
// 用上一帧相位还原基准点，所以即使外部改了 self 坐标也能继续摆动。
// （原 stepBat，2026-11 重命名；bat 的 behavior 就是 weave）
function stepWeave(brain, ctx) {
  const { self, player, dt } = ctx;
  const tune = tuneOf(ctx, BAT_RULE);
  const amplitude = finiteOr(tune.amplitude, BAT_RULE.amplitude);
  const periodMs = Math.max(1, finiteOr(tune.periodMs, BAT_RULE.periodMs));
  if (!brain.dir) {
    brain.dir = unitVector(player.x - self.x, player.y - self.y) ?? { x: 0, y: 1 };
    const sign = brain.wobbleSign === -1 ? -1 : 1;
    brain.perp = { x: -brain.dir.y * sign, y: brain.dir.x * sign };
  }
  const prevWobble = Math.sin((TAU * brain.phase) / periodMs);
  const baseX = self.x - brain.perp.x * amplitude * prevWobble;
  const baseY = self.y - brain.perp.y * amplitude * prevWobble;
  brain.phase = (brain.phase + dt) % periodMs;
  const wobble = Math.sin((TAU * brain.phase) / periodMs);
  brain.x = baseX + brain.dir.x * self.speed * (dt / 1000) + brain.perp.x * amplitude * wobble;
  brain.y = baseY + brain.dir.y * self.speed * (dt / 1000) + brain.perp.y * amplitude * wobble;
  return makeResult(brain);
}

// 邪教徒：环绕保持约 70px；每 2.2s 停稳进入抬手（只计时不锁定），
// 抬手结束的那一帧朝玩家当前位置打 3 发扇形慢弹（§4）。
function stepCultist(brain, ctx) {
  const { self, player, dt, bounds, opts } = ctx;
  const tune = tuneOf(ctx, CULTIST_RULE);
  const ranged = rangedSpecOf(brain) ?? RANGED_RULES.cultist;

  if (brain.mode === 'windup') {
    brain.windupLeft -= dt;
    brain.x = self.x;
    brain.y = self.y;
    if (brain.windupLeft > 0) return makeResult(brain, [], false, true);
    const shots = makeVolley(brain, ctx, ranged);
    brain.mode = 'walk';
    brain.windupLeft = 0;
    brain.attackIn = tune.attackMs;
    const summon = finishCast(brain, ctx, ranged, shots);
    return makeResult(brain, shots, false, false, null, false, null, summon);
  }

  const dx = player.x - self.x;
  const dy = player.y - self.y;
  const dist = Math.hypot(dx, dy);
  const nx = dist > 1e-6 ? dx / dist : 0;
  const ny = dist > 1e-6 ? dy / dist : 1;
  let vx = 0;
  let vy = 0;

  if (dist < tune.retreatDist) {
    // 贴身：沿反方向退开
    vx = -nx * self.speed * 1.1;
    vy = -ny * self.speed * 1.1;
  } else {
    const radial = Math.max(-self.speed, Math.min(self.speed, (dist - tune.holdDist) * 2.4));
    const tangential = self.speed * 0.85 * (brain.orbitDir < 0 ? -1 : 1);
    vx = -ny * tangential + nx * radial;
    vy = nx * tangential + ny * radial;
    const mag = Math.hypot(vx, vy);
    const cap = self.speed * 1.15;
    if (mag > cap && mag > 0) { vx = (vx / mag) * cap; vy = (vy / mag) * cap; }
  }

  brain.x = self.x + vx * (dt / 1000);
  brain.y = self.y + vy * (dt / 1000);
  clampToBounds(brain, bounds);

  brain.attackIn -= dt;
  if (brain.attackIn <= 0) return beginCast(brain, ctx, tune, ranged.windupMs);
  return makeResult(brain, [], false, false);
}

// 亡灵骑士：步行追人；每 2.6s 预警 600ms 锁定玩家当前点，接着 3.2 倍速度直线冲锋，
// 冲过目标点或 1.2s 后停下，恢复步行。
function stepKnight(brain, ctx) {
  const { self, player, dt, bounds } = ctx;
  const tune = tuneOf(ctx, KNIGHT_RULE);

  if (brain.mode === 'windup') {
    brain.windupLeft -= dt;
    brain.x = self.x;
    brain.y = self.y;
    if (brain.windupLeft > 0) return makeResult(brain, [], false, true);
    brain.mode = 'charge';
    brain.chargeLeft = tune.chargeMs;
    brain.dir = unitVector(brain.aim.x - self.x, brain.aim.y - self.y)
      ?? unitVector(player.x - self.x, player.y - self.y)
      ?? { x: 0, y: 1 };
    brain.charges += 1;
    return makeResult(brain, [], true, false);
  }

  if (brain.mode === 'charge') {
    const stepMs = Math.min(dt, brain.chargeLeft);
    const speed = self.speed * tune.chargeSpeedMul;
    brain.x = self.x + brain.dir.x * speed * (stepMs / 1000);
    brain.y = self.y + brain.dir.y * speed * (stepMs / 1000);
    clampToBounds(brain, bounds);
    brain.chargeLeft = Math.max(0, brain.chargeLeft - dt);
    const passed = (brain.x - brain.aim.x) * brain.dir.x + (brain.y - brain.aim.y) * brain.dir.y >= 0;
    if (brain.chargeLeft <= 0 || passed) {
      brain.mode = 'walk';
      brain.chargeLeft = 0;
      brain.chargeIn = tune.intervalMs;
      return makeResult(brain, [], false, false);
    }
    return makeResult(brain, [], true, false);
  }

  const dir = unitVector(player.x - self.x, player.y - self.y);
  if (dir) {
    brain.x = self.x + dir.x * self.speed * (dt / 1000);
    brain.y = self.y + dir.y * self.speed * (dt / 1000);
  } else {
    brain.x = self.x;
    brain.y = self.y;
  }
  clampToBounds(brain, bounds);

  brain.chargeIn -= dt;
  if (brain.chargeIn <= 0) {
    brain.mode = 'windup';
    brain.windupLeft = tune.windupMs;
    brain.chargeIn = 0;
    brain.aim = { x: player.x, y: player.y };
    brain.windups += 1;
    return makeResult(brain, [], false, true);
  }
  return makeResult(brain, [], false, false);
}

// 缝合尸魁：慢速追人；进入 26px 后站定，每 800ms 生成一次践踏事件（伤害由场景结算）。
function stepStitch(brain, ctx) {
  const { self, player, dt, bounds, opts } = ctx;
  const tune = tuneOf(ctx, STITCH_RULE);
  const dist = Math.hypot(player.x - self.x, player.y - self.y);
  let stomp = null;

  if (dist <= tune.stompDist) {
    // 贴身：站定蓄力，位置不变
    brain.x = self.x;
    brain.y = self.y;
    brain.stompIn -= dt;
    if (brain.stompIn <= 0) {
      brain.stompIn = tune.stompMs;
      brain.stomps += 1;
      stomp = {
        x: self.x,
        y: self.y,
        radius: tune.stompDist,
        damage: Math.max(1, Math.round(finiteOr(opts?.damage, 14))),
      };
    }
  } else {
    // 离开范围：重置蓄力，重新贴身需再等满 800ms
    brain.stompIn = tune.stompMs;
    const dir = unitVector(player.x - self.x, player.y - self.y);
    if (dir) {
      brain.x = self.x + dir.x * self.speed * (dt / 1000);
      brain.y = self.y + dir.y * self.speed * (dt / 1000);
    } else {
      brain.x = self.x;
      brain.y = self.y;
    }
    clampToBounds(brain, bounds);
  }
  return makeResult(brain, [], false, false, stomp);
}

// 咒誓主教：空闲时维持 110px 并缓慢环绕；每 4.2s 瞬移到玩家侧翼（seed 决定左右），
// 瞬移后抬手（不锁快照），随后 150ms 间隔打满三发快弹；第 2/4/6… 轮额外召唤一个神圣炮台。
// 瞬移节拍不因抬手/连弹顺延。
function stepOath(brain, ctx) {
  const { self, dt, bounds } = ctx;
  const tune = tuneOf(ctx, OATH_RULE);
  const ranged = rangedSpecOf(brain) ?? RANGED_RULES.oath_bishop;
  const { player } = ctx;

  brain.blinkIn -= dt;

  // 1) 瞬移后的抬手：不移动，第一发在抬手结束的同一帧射出（方向现算）
  if (brain.pauseLeft > 0) {
    brain.pauseLeft -= dt;
    brain.x = self.x;
    brain.y = self.y;
    if (brain.pauseLeft > 0) return makeResult(brain, [], false, true);
    brain.pauseLeft = 0;
    brain.burstLeft = Math.max(0, ranged.count - 1);
    brain.burstIn = ranged.gapMs;
    const shots = makeVolley(brain, ctx, ranged, { count: 1 });
    const summon = finishCast(brain, ctx, ranged, shots);
    return makeResult(brain, shots, false, false, null, false, null, summon);
  }

  // 2) 三连弹剩余两发：站定射击，每发都朝玩家当前位置
  if (brain.burstLeft > 0) {
    brain.burstIn -= dt;
    brain.x = self.x;
    brain.y = self.y;
    if (brain.burstIn <= 0) {
      brain.burstLeft -= 1;
      brain.burstIn = ranged.gapMs;
      const shots = makeVolley(brain, ctx, ranged, { count: 1 });
      brain.shots += shots.length;
      return makeResult(brain, shots, false, false);
    }
    return makeResult(brain, [], false, false);
  }

  // 3) 空闲：保持约 110px，缓慢环绕
  const dx = player.x - self.x;
  const dy = player.y - self.y;
  const dist = Math.hypot(dx, dy);
  const nx = dist > 1e-6 ? dx / dist : 0;
  const ny = dist > 1e-6 ? dy / dist : 1;
  const radial = Math.max(-self.speed, Math.min(self.speed, (dist - tune.holdDist) * 2));
  const tangential = self.speed * 0.6 * (brain.orbitDir < 0 ? -1 : 1);
  brain.x = self.x + (-ny * tangential + nx * radial) * (dt / 1000);
  brain.y = self.y + (nx * tangential + ny * radial) * (dt / 1000);
  clampToBounds(brain, bounds);

  // 4) 瞬移：落在玩家侧翼，左右由种子随机决定
  if (brain.blinkIn <= 0) {
    const side = nextRandom(brain) < 0.5 ? -1 : 1;
    brain.x = player.x + -ny * side * tune.holdDist;
    brain.y = player.y + nx * side * tune.holdDist;
    clampToBounds(brain, bounds);
    brain.pauseLeft = finiteOr(ranged.windupMs, tune.pauseMs);
    brain.blinkIn = tune.blinkMs;
    brain.blinks += 1;
    return makeResult(brain, [], false, true);
  }

  return makeResult(brain, [], false, false);
}

// 晶棘树妖：中距离站桩 → 抬手（只计时）→ 5 发窄扇（§4）。
function stepVolley(brain, ctx) {
  const { self, player, dt, bounds } = ctx;
  const tune = tuneOf(ctx, VOLLEY_RULE);
  const ranged = rangedSpecOf(brain) ?? RANGED_RULES.crystal_dryad;
  brain.attackIn -= dt;

  if (brain.mode === 'windup') {
    brain.x = self.x;
    brain.y = self.y;
    brain.windupLeft -= dt;
    if (brain.windupLeft <= 0) {
      brain.mode = 'walk';
      brain.attackIn = tune.attackMs;
      brain.windupLeft = 0;
      const shots = makeVolley(brain, ctx, ranged);
      const summon = finishCast(brain, ctx, ranged, shots);
      return makeResult(brain, shots, false, false, null, false, null, summon);
    }
    return makeResult(brain, [], false, true);
  }

  const dx = player.x - self.x;
  const dy = player.y - self.y;
  const dist = Math.hypot(dx, dy);
  const nx = dist > 1e-6 ? dx / dist : 0;
  const ny = dist > 1e-6 ? dy / dist : 1;
  const radial = Math.max(-self.speed * 0.7, Math.min(self.speed * 0.7, (dist - tune.holdDist) * 1.5));
  const tangential = self.speed * 0.28 * (brain.orbitDir < 0 ? -1 : 1);
  brain.x = self.x + (-ny * tangential + nx * radial) * (dt / 1000);
  brain.y = self.y + (nx * tangential + ny * radial) * (dt / 1000);
  clampToBounds(brain, bounds);

  if (brain.attackIn <= 0) return beginCast(brain, ctx, tune, ranged.windupMs);
  return makeResult(brain, [], false, false);
}

// 虚空元素：维持 86px；每 3.6s 瞬移侧翼，抬手后两发连射，每第 3 轮附送 1 个追踪球（§4）。
function stepPhase(brain, ctx) {
  const { self, player, dt, bounds } = ctx;
  const tune = tuneOf(ctx, PHASE_RULE);
  const ranged = rangedSpecOf(brain) ?? RANGED_RULES.void_elemental;
  brain.blinkIn -= dt;

  // 1) 抬手（瞬移后的停顿算抬手）：只计时，不锁快照
  if (brain.pauseLeft > 0) {
    brain.pauseLeft -= dt;
    brain.x = self.x;
    brain.y = self.y;
    if (brain.pauseLeft > 0) return makeResult(brain, [], false, true);
    brain.pauseLeft = 0;
    brain.casts += 1;
    brain.burstLeft = Math.max(0, ranged.count - 1);
    brain.burstIn = ranged.gapMs;
    const shots = makeVolley(brain, ctx, ranged, { count: 1 });
    if (ranged.every && brain.casts % ranged.every === 0) {
      shots.push(...makeVolley(brain, ctx, ranged, {
        count: 1, kind: 'homing', speed: 46, lifeMs: 4200, spread: 0,
      }));
    }
    brain.shots += shots.length;
    return makeResult(brain, shots, false, false);
  }

  // 2) 连射补发：每发都朝玩家当前位置
  if (brain.burstLeft > 0) {
    brain.burstIn -= dt;
    brain.x = self.x;
    brain.y = self.y;
    if (brain.burstIn <= 0) {
      brain.burstLeft -= 1;
      brain.burstIn = ranged.gapMs;
      const shots = makeVolley(brain, ctx, ranged, { count: 1 });
      brain.shots += shots.length;
      return makeResult(brain, shots, false, false);
    }
    return makeResult(brain, [], false, false);
  }

  const dx = player.x - self.x;
  const dy = player.y - self.y;
  const dist = Math.hypot(dx, dy);
  const nx = dist > 1e-6 ? dx / dist : 0;
  const ny = dist > 1e-6 ? dy / dist : 1;
  const radial = Math.max(-self.speed, Math.min(self.speed, (dist - tune.holdDist) * 1.8));
  const tangential = self.speed * 0.55 * (brain.orbitDir < 0 ? -1 : 1);
  brain.x = self.x + (-ny * tangential + nx * radial) * (dt / 1000);
  brain.y = self.y + (nx * tangential + ny * radial) * (dt / 1000);
  clampToBounds(brain, bounds);

  if (brain.blinkIn <= 0) {
    const side = nextRandom(brain) < 0.5 ? -1 : 1;
    brain.x = player.x + -ny * side * tune.holdDist;
    brain.y = player.y + nx * side * tune.holdDist;
    clampToBounds(brain, bounds);
    brain.pauseLeft = finiteOr(ranged.windupMs, tune.pauseMs);
    brain.blinkIn = tune.blinkMs;
    brain.blinks += 1;
    return makeResult(brain, [], false, true);
  }

  return makeResult(brain, [], false, false);
}

// 索引猎犬：走位接近 → 700ms 蓄力 → 900ms 高速扑咬（4.2 倍速），冲锋期接触伤害翻倍。
function stepLunge(brain, ctx) {
  const { self, player, dt, bounds } = ctx;
  const tune = tuneOf(ctx, LUNGE_RULE);

  if (brain.mode === 'windup') {
    brain.windupLeft -= dt;
    brain.x = self.x;
    brain.y = self.y;
    if (brain.windupLeft > 0) return makeResult(brain, [], false, true);
    brain.mode = 'charge';
    brain.chargeLeft = tune.chargeMs;
    brain.dir = unitVector(brain.aim.x - self.x, brain.aim.y - self.y)
      ?? unitVector(player.x - self.x, player.y - self.y)
      ?? { x: 0, y: 1 };
    brain.charges += 1;
    return makeResult(brain, [], true, false);
  }

  if (brain.mode === 'charge') {
    const stepMs = Math.min(dt, brain.chargeLeft);
    const speed = self.speed * tune.chargeSpeedMul;
    brain.x = self.x + brain.dir.x * speed * (stepMs / 1000);
    brain.y = self.y + brain.dir.y * speed * (stepMs / 1000);
    clampToBounds(brain, bounds);
    brain.chargeLeft = Math.max(0, brain.chargeLeft - dt);
    const passed = (brain.x - brain.aim.x) * brain.dir.x + (brain.y - brain.aim.y) * brain.dir.y >= 0;
    if (brain.chargeLeft <= 0 || passed) {
      brain.mode = 'walk';
      brain.chargeLeft = 0;
      brain.chargeIn = tune.intervalMs;
      return makeResult(brain, [], false, false);
    }
    return makeResult(brain, [], true, false);
  }

  const dir = unitVector(player.x - self.x, player.y - self.y);
  if (dir) {
    brain.x = self.x + dir.x * self.speed * (dt / 1000);
    brain.y = self.y + dir.y * self.speed * (dt / 1000);
  } else {
    brain.x = self.x;
    brain.y = self.y;
  }
  clampToBounds(brain, bounds);

  brain.chargeIn -= dt;
  if (brain.chargeIn <= 0) {
    brain.mode = 'windup';
    brain.windupLeft = tune.windupMs;
    brain.chargeIn = 0;
    brain.aim = { x: player.x, y: player.y };
    brain.windups += 1;
    return makeResult(brain, [], false, true);
  }
  return makeResult(brain, [], false, false);
}

// 铁砧暴君：慢速接近，进入 58px 后 650ms 蓄力，然后砸地产生 46px 半径震荡。
function stepSlam(brain, ctx) {
  const { self, player, dt, bounds, opts } = ctx;
  const tune = tuneOf(ctx, SLAM_RULE);

  if (brain.mode === 'windup') {
    brain.windupLeft -= dt;
    brain.x = self.x;
    brain.y = self.y;
    if (brain.windupLeft > 0) return makeResult(brain, [], false, true);
    brain.mode = 'walk';
    brain.attackIn = tune.cooldownMs;
    brain.stomps += 1;
    const stomp = {
      x: self.x,
      y: self.y,
      radius: tune.radius,
      damage: Math.max(1, Math.round(finiteOr(opts?.damage, 10) * tune.damageMul)),
    };
    return makeResult(brain, [], false, false, stomp);
  }

  const dir = unitVector(player.x - self.x, player.y - self.y);
  if (dir) {
    brain.x = self.x + dir.x * self.speed * (dt / 1000);
    brain.y = self.y + dir.y * self.speed * (dt / 1000);
  } else {
    brain.x = self.x;
    brain.y = self.y;
  }
  clampToBounds(brain, bounds);

  const dist = Math.hypot(player.x - self.x, player.y - self.y);
  brain.attackIn -= dt;
  if (dist <= tune.slamDist && brain.attackIn <= 0) {
    brain.mode = 'windup';
    brain.windupLeft = tune.windupMs;
    brain.aim = { x: player.x, y: player.y };
    brain.windups += 1;
    return makeResult(brain, [], false, true);
  }
  return makeResult(brain, [], false, false);
}

// 天平裁决者：保持 130px 环绕，3.6s 一次抬手，然后打一发慢速重弹（伤害 ×1.6）；
// 每第 2 轮在玩家脚下放一个裁决符文（§4/§5）。
function stepJudge(brain, ctx) {
  const { self, player, dt, bounds } = ctx;
  const tune = tuneOf(ctx, JUDGE_RULE);
  const ranged = rangedSpecOf(brain) ?? RANGED_RULES.scale_arbiter;

  if (brain.mode === 'windup') {
    brain.windupLeft -= dt;
    brain.x = self.x;
    brain.y = self.y;
    if (brain.windupLeft > 0) return makeResult(brain, [], false, true);
    const shots = makeVolley(brain, ctx, ranged);
    brain.mode = 'walk';
    brain.windupLeft = 0;
    brain.attackIn = tune.attackMs;
    const summon = finishCast(brain, ctx, ranged, shots);
    return makeResult(brain, shots, false, false, null, false, null, summon);
  }

  const dx = player.x - self.x;
  const dy = player.y - self.y;
  const dist = Math.hypot(dx, dy);
  const nx = dist > 1e-6 ? dx / dist : 0;
  const ny = dist > 1e-6 ? dy / dist : 1;
  let vx = 0;
  let vy = 0;
  if (dist < tune.retreatDist) {
    vx = -nx * self.speed * 1.1;
    vy = -ny * self.speed * 1.1;
  } else {
    const radial = Math.max(-self.speed, Math.min(self.speed, (dist - tune.holdDist) * 2.2));
    const tangential = self.speed * 0.7 * (brain.orbitDir < 0 ? -1 : 1);
    vx = -ny * tangential + nx * radial;
    vy = nx * tangential + ny * radial;
    const mag = Math.hypot(vx, vy);
    const cap = self.speed * 1.15;
    if (mag > cap && mag > 0) { vx = (vx / mag) * cap; vy = (vy / mag) * cap; }
  }
  brain.x = self.x + vx * (dt / 1000);
  brain.y = self.y + vy * (dt / 1000);
  clampToBounds(brain, bounds);

  brain.attackIn -= dt;
  if (brain.attackIn <= 0) return beginCast(brain, ctx, tune, ranged.windupMs);
  return makeResult(brain, [], false, false);
}

// 蚀日祭司：保持 100px 环绕，4.8s 一次抬手，然后打八向星环；每第 2 轮召唤一个蚀日炮台。
function stepEclipse(brain, ctx) {
  const { self, player, dt, bounds } = ctx;
  const tune = tuneOf(ctx, ECLIPSE_RULE);
  const ranged = rangedSpecOf(brain) ?? RANGED_RULES.eclipse_priest;

  if (brain.mode === 'windup') {
    brain.windupLeft -= dt;
    brain.x = self.x;
    brain.y = self.y;
    if (brain.windupLeft > 0) return makeResult(brain, [], false, true);
    const shots = makeVolley(brain, ctx, ranged);
    brain.mode = 'walk';
    brain.windupLeft = 0;
    brain.attackIn = tune.attackMs;
    const summon = finishCast(brain, ctx, ranged, shots);
    return makeResult(brain, shots, false, false, null, false, null, summon);
  }

  const dx = player.x - self.x;
  const dy = player.y - self.y;
  const dist = Math.hypot(dx, dy);
  const nx = dist > 1e-6 ? dx / dist : 0;
  const ny = dist > 1e-6 ? dy / dist : 1;
  let vx = 0;
  let vy = 0;
  if (dist < tune.retreatDist) {
    vx = -nx * self.speed * 1.1;
    vy = -ny * self.speed * 1.1;
  } else {
    const radial = Math.max(-self.speed, Math.min(self.speed, (dist - tune.holdDist) * 2.2));
    const tangential = self.speed * 0.5 * (brain.orbitDir < 0 ? -1 : 1);
    vx = -ny * tangential + nx * radial;
    vy = nx * tangential + ny * radial;
    const mag = Math.hypot(vx, vy);
    const cap = self.speed * 1.1;
    if (mag > cap && mag > 0) { vx = (vx / mag) * cap; vy = (vy / mag) * cap; }
  }
  brain.x = self.x + vx * (dt / 1000);
  brain.y = self.y + vy * (dt / 1000);
  clampToBounds(brain, bounds);

  brain.attackIn -= dt;
  if (brain.attackIn <= 0) return beginCast(brain, ctx, tune, ranged.windupMs);
  return makeResult(brain, [], false, false);
}

// ---------- 分行为：2026-11 新行为 ----------

// 腐尸「lurch」：踱步(walkMs) → 停顿(holdMs) → 贴身预警(windupMs) → 扑咬(lungeMs @lungeMul)
// → 收势(recoverMs，仅保留少量惯性)。玩家不在 triggerDist 内时只重复踱步/停顿。
function stepLurch(brain, ctx) {
  const { self, player, dt, bounds } = ctx;
  const tune = tuneOf(ctx, LURCH_RULE);

  if (brain.mode === 'windup') {
    brain.windupLeft -= dt;
    brain.x = self.x;
    brain.y = self.y;
    if (brain.windupLeft > 0) return makeResult(brain, [], false, true);
    brain.mode = 'charge';
    brain.chargeLeft = tune.lungeMs;
    brain.dir = unitVector(brain.aim.x - self.x, brain.aim.y - self.y)
      ?? unitVector(player.x - self.x, player.y - self.y)
      ?? { x: 0, y: 1 };
    brain.charges += 1;
    return makeResult(brain, [], true, false);
  }

  if (brain.mode === 'charge') {
    const stepMs = Math.min(dt, brain.chargeLeft);
    brain.x = self.x + brain.dir.x * self.speed * tune.lungeMul * (stepMs / 1000);
    brain.y = self.y + brain.dir.y * self.speed * tune.lungeMul * (stepMs / 1000);
    clampToBounds(brain, bounds);
    brain.chargeLeft = Math.max(0, brain.chargeLeft - dt);
    if (brain.chargeLeft <= 0) {
      brain.mode = 'recover';
      brain.chargeLeft = tune.recoverMs;
      return makeResult(brain, [], false, false);
    }
    return makeResult(brain, [], true, false);
  }

  if (brain.mode === 'recover') {
    const stepMs = Math.min(dt, brain.chargeLeft);
    const dir = unitVector(player.x - self.x, player.y - self.y) ?? brain.dir ?? { x: 0, y: 1 };
    brain.x = self.x + dir.x * self.speed * LURCH_MOMENTUM * (stepMs / 1000);
    brain.y = self.y + dir.y * self.speed * LURCH_MOMENTUM * (stepMs / 1000);
    clampToBounds(brain, bounds);
    brain.chargeLeft = Math.max(0, brain.chargeLeft - dt);
    if (brain.chargeLeft <= 0) {
      brain.mode = 'walk';
      brain.attackIn = tune.walkMs;
    }
    return makeResult(brain);
  }

  if (brain.mode === 'hold') {
    brain.x = self.x;
    brain.y = self.y;
    brain.attackIn -= dt;
    if (brain.attackIn <= 0) {
      brain.attackIn = 0;
      const dist = Math.hypot(player.x - self.x, player.y - self.y);
      if (dist <= tune.triggerDist) return beginWindup(brain, ctx, tune);
      brain.mode = 'walk';
      brain.attackIn = tune.walkMs;
    }
    return makeResult(brain);
  }

  // walk：朝玩家踱步
  approach(brain, ctx, 1);
  brain.attackIn -= dt;
  if (brain.attackIn <= 0) {
    brain.attackIn = 0;
    brain.mode = 'hold';
    brain.attackIn = tune.holdMs;
  }
  return makeResult(brain);
}

// 齿轮傀儡「spring」：上弦走位 → 预警 → 弹射冲刺 → 收势。
// 弹射阶段 mode='dash'，charging 恒为 false，因此不吃 Enemy 的 ×2.5 接触伤害。
function stepSpring(brain, ctx) {
  const { self, player, dt, bounds } = ctx;
  const tune = tuneOf(ctx, SPRING_RULE);

  if (brain.mode === 'windup') {
    brain.windupLeft -= dt;
    brain.x = self.x;
    brain.y = self.y;
    if (brain.windupLeft > 0) return makeResult(brain, [], false, true);
    brain.mode = 'dash';
    brain.chargeLeft = tune.dashMs;
    brain.dir = unitVector(brain.aim.x - self.x, brain.aim.y - self.y)
      ?? unitVector(player.x - self.x, player.y - self.y)
      ?? { x: 0, y: 1 };
    brain.charges += 1;
    return makeResult(brain, [], false, false);
  }

  if (brain.mode === 'dash') {
    const stepMs = Math.min(dt, brain.chargeLeft);
    brain.x = self.x + brain.dir.x * self.speed * tune.dashMul * (stepMs / 1000);
    brain.y = self.y + brain.dir.y * self.speed * tune.dashMul * (stepMs / 1000);
    clampToBounds(brain, bounds);
    brain.chargeLeft = Math.max(0, brain.chargeLeft - dt);
    if (brain.chargeLeft <= 0) {
      brain.mode = 'recover';
      brain.chargeLeft = tune.recoverMs;
    }
    return makeResult(brain);
  }

  if (brain.mode === 'recover') {
    brain.x = self.x;
    brain.y = self.y;
    brain.chargeLeft = Math.max(0, brain.chargeLeft - dt);
    if (brain.chargeLeft <= 0) {
      brain.mode = 'walk';
      brain.attackIn = tune.walkMs;
    }
    return makeResult(brain);
  }

  approach(brain, ctx, 1);
  brain.attackIn -= dt;
  if (brain.attackIn <= 0) return beginWindup(brain, ctx, tune);
  return makeResult(brain);
}

// 纸页傀儡「bulwark」：慢速前压，每 guardEveryMs 举盾 guardMs。
// 举盾窗口 guard=true 且移速 ×guardSlowMul（armor 由 Enemy 按 guard 置 0.55）。
function stepBulwark(brain, ctx) {
  const { self, player, dt } = ctx;
  const tune = tuneOf(ctx, BULWARK_RULE);

  if (brain.mode === 'guard') {
    approach(brain, ctx, tune.approachMul * tune.guardSlowMul);
    brain.windupLeft = Math.max(0, brain.windupLeft - dt);
    if (brain.windupLeft <= 0) {
      brain.mode = 'walk';
      brain.attackIn = tune.guardEveryMs;
      return makeResult(brain);
    }
    return makeResult(brain, [], false, false, null, true);
  }

  approach(brain, ctx, tune.approachMul);
  brain.attackIn -= dt;
  if (brain.attackIn <= 0) {
    brain.mode = 'guard';
    brain.windupLeft = tune.guardMs;
    brain.attackIn = 0;
    return makeResult(brain, [], false, false, null, true);
  }
  return makeResult(brain);
}

// 炉渣兽「eruption」：进入 triggerDist 且间隔到点时预警，随后砸出 stompRadius 熔岩圈。
// 结算事件复用 stomp 通道（伤害 = round(base × stompDamageMul)）。
function stepEruption(brain, ctx) {
  const { self, player, dt, bounds, opts } = ctx;
  const tune = tuneOf(ctx, ERUPTION_RULE);

  if (brain.mode === 'windup') {
    brain.windupLeft -= dt;
    brain.x = self.x;
    brain.y = self.y;
    if (brain.windupLeft > 0) return makeResult(brain, [], false, true);
    brain.mode = 'walk';
    brain.windupLeft = 0;
    brain.attackIn = tune.cooldownMs;
    brain.chargeIn = Math.max(0, tune.intervalMs - tune.cooldownMs);
    brain.stomps += 1;
    const stomp = {
      x: self.x,
      y: self.y,
      radius: tune.stompRadius,
      damage: Math.max(1, Math.round(finiteOr(opts?.damage, 10) * tune.stompDamageMul)),
    };
    return makeResult(brain, [], false, false, stomp);
  }

  // 砸地后摇：站定
  if (brain.attackIn > 0) {
    brain.attackIn = Math.max(0, brain.attackIn - dt);
    brain.chargeIn = Math.max(0, brain.chargeIn - dt);
    brain.x = self.x;
    brain.y = self.y;
    return makeResult(brain);
  }

  approach(brain, ctx, 1);
  brain.chargeIn = Math.max(0, brain.chargeIn - dt);
  const dist = Math.hypot(player.x - self.x, player.y - self.y);
  if (brain.chargeIn <= 0 && dist <= tune.triggerDist) return beginWindup(brain, ctx, tune);
  return makeResult(brain);
}

// 枷锁守卫「chain」：环带站位，抬手后 110ms 间隔打两发枷锁弹。
// 本轮只换了瞄准口径：不再锁抬手开始时的玩家快照，每发都朝玩家当前位置。
function stepChain(brain, ctx) {
  const { self, dt } = ctx;
  const tune = tuneOf(ctx, CHAIN_RULE);
  const spec = { count: 1, speed: tune.shotSpeed, lifeMs: tune.shotLifeMs, damageMul: tune.damageMul, kind: 'bolt' };
  brain.attackIn -= dt;

  if (brain.mode === 'windup') {
    brain.windupLeft -= dt;
    brain.x = self.x;
    brain.y = self.y;
    if (brain.windupLeft > 0) return makeResult(brain, [], false, true);
    // 抬手结束：立刻打第一发，剩下的按 gapMs 补射
    const shots = makeVolley(brain, ctx, spec);
    brain.mode = 'walk';
    brain.windupLeft = 0;
    brain.attackIn = tune.intervalMs;
    brain.burstLeft = Math.max(0, tune.shots - 1);
    brain.burstIn = tune.gapMs;
    brain.shots += shots.length;
    return makeResult(brain, shots, false, false);
  }

  if (brain.burstLeft > 0) {
    brain.burstIn -= dt;
    brain.x = self.x;
    brain.y = self.y;
    if (brain.burstIn <= 0) {
      const shots = makeVolley(brain, ctx, spec);
      brain.burstLeft -= 1;
      brain.burstIn = tune.gapMs;
      brain.shots += shots.length;
      return makeResult(brain, shots, false, false);
    }
    return makeResult(brain);
  }

  holdBand(brain, ctx, tune);
  if (brain.attackIn <= 0) return beginCast(brain, ctx, tune, tune.windupMs);
  return makeResult(brain);
}

// 符纹蛛「skitter」：直线猛窜 straightMs → 侧移 lateralMs（单段侧移不超过 lateralDist），交替。
function stepSkitter(brain, ctx) {
  const { self, player, dt, bounds } = ctx;
  const tune = tuneOf(ctx, SKITTER_RULE);
  brain.phase += dt;

  if (brain.mode === 'lateral') {
    const dir = brain.dir ?? { x: 1, y: 0 };
    brain.x = self.x + dir.x * self.speed * tune.lateralMul * (dt / 1000);
    brain.y = self.y + dir.y * self.speed * tune.lateralMul * (dt / 1000);
    clampToBounds(brain, bounds);
    const start = finitePoint(brain.aim) ? brain.aim : { x: self.x, y: self.y };
    const moved = Math.hypot(brain.x - start.x, brain.y - start.y);
    if (brain.phase >= tune.lateralMs || moved >= tune.lateralDist) {
      brain.mode = 'walk';
      brain.phase = 0;
    }
    return makeResult(brain);
  }

  approach(brain, ctx, tune.straightMul);
  if (brain.phase >= tune.straightMs) {
    const toPlayer = unitVector(player.x - brain.x, player.y - brain.y) ?? { x: 0, y: 1 };
    const side = brain.wobbleSign === -1 ? -1 : 1;
    brain.dir = { x: -toPlayer.y * side, y: toPlayer.x * side };
    brain.aim = { x: brain.x, y: brain.y };
    brain.mode = 'lateral';
    brain.phase = 0;
  }
  return makeResult(brain);
}

// 幽誓女妖「stalk」：环带 120px 慢绕，预警后 2.1 倍速突进，回收后再绕。
function stepStalk(brain, ctx) {
  const { self, player, dt, bounds } = ctx;
  const tune = tuneOf(ctx, STALK_RULE);

  if (brain.mode === 'windup') {
    brain.windupLeft -= dt;
    brain.x = self.x;
    brain.y = self.y;
    if (brain.windupLeft > 0) return makeResult(brain, [], false, true);
    brain.mode = 'charge';
    brain.chargeLeft = tune.dashMs;
    brain.dir = unitVector(brain.aim.x - self.x, brain.aim.y - self.y)
      ?? unitVector(player.x - self.x, player.y - self.y)
      ?? { x: 0, y: 1 };
    brain.charges += 1;
    return makeResult(brain, [], true, false);
  }

  if (brain.mode === 'charge') {
    const stepMs = Math.min(dt, brain.chargeLeft);
    brain.x = self.x + brain.dir.x * self.speed * tune.dashMul * (stepMs / 1000);
    brain.y = self.y + brain.dir.y * self.speed * tune.dashMul * (stepMs / 1000);
    clampToBounds(brain, bounds);
    brain.chargeLeft = Math.max(0, brain.chargeLeft - dt);
    if (brain.chargeLeft <= 0) {
      brain.mode = 'recover';
      brain.chargeLeft = tune.recoverMs;
      return makeResult(brain, [], false, false);
    }
    return makeResult(brain, [], true, false);
  }

  if (brain.mode === 'recover') {
    brain.x = self.x;
    brain.y = self.y;
    brain.chargeLeft = Math.max(0, brain.chargeLeft - dt);
    if (brain.chargeLeft <= 0) {
      brain.mode = 'walk';
      brain.attackIn = tune.intervalMs;
    }
    return makeResult(brain);
  }

  holdBand(brain, ctx, tune);
  brain.attackIn -= dt;
  if (brain.attackIn <= 0) return beginWindup(brain, ctx, tune);
  return makeResult(brain);
}

// 墨灵「drift」：慢速游走 + 每 blinkEveryMs 一次 40~60px 的确定性瞬移，且与玩家保持 ≥minPlayerDist。
function stepDrift(brain, ctx) {
  const { self, player, dt, bounds } = ctx;
  const tune = tuneOf(ctx, DRIFT_RULE);

  approach(brain, ctx, tune.approachMul);
  // 游走也不许贴到玩家身上：不足 minPlayerDist 时沿连线推开
  {
    const dx = brain.x - player.x;
    const dy = brain.y - player.y;
    const away = Math.hypot(dx, dy);
    if (away < tune.minPlayerDist) {
      const ux = away > 1e-6 ? dx / away : 1;
      const uy = away > 1e-6 ? dy / away : 0;
      brain.x = player.x + ux * tune.minPlayerDist;
      brain.y = player.y + uy * tune.minPlayerDist;
      clampToBounds(brain, bounds);
    }
  }
  brain.blinkIn -= dt;
  if (brain.blinkIn > 0) return makeResult(brain);

  brain.blinkIn = tune.blinkEveryMs;
  const angle = nextRandom(brain) * TAU;
  const span = Math.max(0, tune.blinkMax - tune.blinkMin);
  const hop = tune.blinkMin + nextRandom(brain) * span;
  let nx = brain.x + Math.cos(angle) * hop;
  let ny = brain.y + Math.sin(angle) * hop;
  // 瞬移不落进玩家身上：不足 minPlayerDist 时沿原方向推到边界距离
  const dx = nx - player.x;
  const dy = ny - player.y;
  const away = Math.hypot(dx, dy);
  if (away < tune.minPlayerDist) {
    const ux = away > 1e-6 ? dx / away : 1;
    const uy = away > 1e-6 ? dy / away : 0;
    nx = player.x + ux * tune.minPlayerDist;
    ny = player.y + uy * tune.minPlayerDist;
  }
  brain.x = nx;
  brain.y = ny;
  clampToBounds(brain, bounds);
  brain.blinks += 1;
  return makeResult(brain);
}

// 判词幽灵「lance」：环带 130px，抬手后打一发 160 速重弹；每第 3 轮在玩家脚下放一个裁决符文。
function stepLance(brain, ctx) {
  const { self, dt } = ctx;
  const tune = tuneOf(ctx, LANCE_RULE);
  const ranged = rangedSpecOf(brain) ?? RANGED_RULES.verdict_wraith;

  if (brain.mode === 'windup') {
    brain.windupLeft -= dt;
    brain.x = self.x;
    brain.y = self.y;
    if (brain.windupLeft > 0) return makeResult(brain, [], false, true);
    const shots = makeVolley(brain, ctx, ranged);
    brain.mode = 'walk';
    brain.windupLeft = 0;
    brain.attackIn = tune.intervalMs;
    const summon = finishCast(brain, ctx, ranged, shots);
    return makeResult(brain, shots, false, false, null, false, null, summon);
  }

  holdBand(brain, ctx, tune);
  brain.attackIn -= dt;
  if (brain.attackIn <= 0) return beginCast(brain, ctx, tune, ranged.windupMs);
  return makeResult(brain);
}

// 晓色之影「mirror」：环带 90px，冷却结束时沿玩家上一段位移方向冲刺（玩家不动则朝玩家）；
// 另有自己的施法节拍：每 3s 抬手后放 1 个追踪球（方向同样在发射帧现算）。
function stepMirror(brain, ctx) {
  const { self, player, dt, bounds } = ctx;
  const tune = tuneOf(ctx, MIRROR_RULE);
  const ranged = rangedSpecOf(brain) ?? RANGED_RULES.dawn_shade;

  if (brain.mode === 'windup') {
    brain.windupLeft -= dt;
    brain.x = self.x;
    brain.y = self.y;
    if (brain.windupLeft > 0) return makeResult(brain, [], false, true);
    const shots = makeVolley(brain, ctx, ranged);
    brain.mode = 'walk';
    brain.windupLeft = 0;
    brain.castIn = finiteOr(ranged.attackMs, 3000);
    const summon = finishCast(brain, ctx, ranged, shots);
    return makeResult(brain, shots, false, false, null, false, null, summon);
  }

  if (brain.mode === 'dash') {
    const stepMs = Math.min(dt, brain.chargeLeft);
    brain.x = self.x + brain.dir.x * self.speed * tune.dashMul * (stepMs / 1000);
    brain.y = self.y + brain.dir.y * self.speed * tune.dashMul * (stepMs / 1000);
    clampToBounds(brain, bounds);
    brain.chargeLeft = Math.max(0, brain.chargeLeft - dt);
    if (brain.chargeLeft <= 0) {
      brain.mode = 'walk';
      brain.chargeIn = tune.cooldownMs;
    }
    // 冲刺不吃 ×2.5 接触伤害：mirror 是「复刻走位」，不是冲锋攻击
    return makeResult(brain);
  }

  holdBand(brain, ctx, tune);
  brain.castIn = Math.max(0, brain.castIn - dt);
  if (brain.castIn <= 0) return beginCast(brain, ctx, tune, ranged.windupMs);

  const prev = finitePoint(brain.lastPlayer) ? brain.lastPlayer : null;
  brain.lastPlayer = { x: player.x, y: player.y };
  brain.chargeIn = Math.max(0, brain.chargeIn - dt);
  if (brain.chargeIn <= 0 && prev) {
    const mirrored = unitVector(player.x - prev.x, player.y - prev.y);
    const fallback = unitVector(player.x - self.x, player.y - self.y) ?? { x: 0, y: 1 };
    brain.mode = 'dash';
    brain.chargeLeft = tune.dashMs;
    brain.dir = mirrored ?? fallback;
    brain.charges += 1;
    return makeResult(brain);
  }
  return makeResult(brain);
}

// 火星精「dart」：sprintMs 倍速冲刺 / pauseMs 停顿，脉冲式贴脸；
// 每 2.6s 停手抬手（不锁快照），抬手结束打 3 发窄扇，然后回到原来的冲刺/停顿节奏。
function stepDart(brain, ctx) {
  const { self, dt } = ctx;
  const tune = tuneOf(ctx, DART_RULE);
  const ranged = rangedSpecOf(brain) ?? RANGED_RULES.ember_imp;

  if (brain.mode === 'windup') {
    brain.windupLeft -= dt;
    brain.x = self.x;
    brain.y = self.y;
    if (brain.windupLeft > 0) return makeResult(brain, [], false, true);
    const shots = makeVolley(brain, ctx, ranged);
    brain.mode = brain.castBack === 'pause' ? 'pause' : 'sprint';
    brain.castBack = null;
    brain.windupLeft = 0;
    brain.castIn = finiteOr(ranged.attackMs, 2600);
    const summon = finishCast(brain, ctx, ranged, shots);
    return makeResult(brain, shots, false, false, null, false, null, summon);
  }

  brain.castIn = Math.max(0, brain.castIn - dt);
  if (brain.castIn <= 0) {
    brain.castBack = brain.mode;
    return beginCast(brain, ctx, tune, ranged.windupMs);
  }

  if (brain.mode === 'pause') {
    brain.x = self.x;
    brain.y = self.y;
    brain.attackIn -= dt;
    if (brain.attackIn <= 0) {
      brain.mode = 'sprint';
      brain.attackIn = tune.sprintMs;
      brain.charges += 1;
    }
    return makeResult(brain);
  }

  approach(brain, ctx, tune.sprintMul);
  brain.attackIn -= dt;
  if (brain.attackIn <= 0) {
    brain.mode = 'pause';
    brain.attackIn = tune.pauseMs;
  }
  return makeResult(brain);
}

// 熔岩石像鬼「slam_charge」：预警 → 2.6 倍速冲锋 → 500ms 硬直（速度 0），然后重新计时。
function stepSlamCharge(brain, ctx) {
  const { self, player, dt, bounds } = ctx;
  const tune = tuneOf(ctx, SLAM_CHARGE_RULE);

  if (brain.mode === 'windup') {
    brain.windupLeft -= dt;
    brain.x = self.x;
    brain.y = self.y;
    if (brain.windupLeft > 0) return makeResult(brain, [], false, true);
    brain.mode = 'charge';
    brain.chargeLeft = tune.chargeMs;
    brain.dir = unitVector(brain.aim.x - self.x, brain.aim.y - self.y)
      ?? unitVector(player.x - self.x, player.y - self.y)
      ?? { x: 0, y: 1 };
    brain.charges += 1;
    return makeResult(brain, [], true, false);
  }

  if (brain.mode === 'charge') {
    const stepMs = Math.min(dt, brain.chargeLeft);
    brain.x = self.x + brain.dir.x * self.speed * tune.chargeMul * (stepMs / 1000);
    brain.y = self.y + brain.dir.y * self.speed * tune.chargeMul * (stepMs / 1000);
    clampToBounds(brain, bounds);
    brain.chargeLeft = Math.max(0, brain.chargeLeft - dt);
    if (brain.chargeLeft <= 0) {
      brain.mode = 'stagger';
      brain.chargeLeft = tune.staggerMs;
      brain.chargeIn = tune.intervalMs;
      return makeResult(brain, [], false, false);
    }
    return makeResult(brain, [], true, false);
  }

  if (brain.mode === 'stagger') {
    // 冲锋后的硬直：速度 0
    brain.x = self.x;
    brain.y = self.y;
    brain.chargeLeft = Math.max(0, brain.chargeLeft - dt);
    if (brain.chargeLeft <= 0) brain.mode = 'walk';
    return makeResult(brain);
  }

  approach(brain, ctx, 1);
  brain.chargeIn -= dt;
  if (brain.chargeIn <= 0) return beginWindup(brain, ctx, tune);
  return makeResult(brain);
}

// 黄铜守誓者「double_charge」：预警 → 第一段冲锋 → 短停 → 第二段冲锋（重新锁定玩家）→ 后摇。
// burstLeft 复用为「还有几段冲锋待打」：1 = 第一段，0 = 第二段。
function stepDoubleCharge(brain, ctx) {
  const { self, player, dt, bounds } = ctx;
  const tune = tuneOf(ctx, DOUBLE_CHARGE_RULE);

  if (brain.mode === 'windup') {
    brain.windupLeft -= dt;
    brain.x = self.x;
    brain.y = self.y;
    if (brain.windupLeft > 0) return makeResult(brain, [], false, true);
    brain.mode = 'charge';
    brain.chargeLeft = tune.chargeMs;
    brain.burstLeft = 1;
    brain.dir = unitVector(brain.aim.x - self.x, brain.aim.y - self.y)
      ?? unitVector(player.x - self.x, player.y - self.y)
      ?? { x: 0, y: 1 };
    brain.charges += 1;
    return makeResult(brain, [], true, false);
  }

  if (brain.mode === 'charge') {
    const second = brain.burstLeft <= 0;
    const stepMs = Math.min(dt, brain.chargeLeft);
    const mul = second ? tune.secondMul : tune.chargeMul;
    brain.x = self.x + brain.dir.x * self.speed * mul * (stepMs / 1000);
    brain.y = self.y + brain.dir.y * self.speed * mul * (stepMs / 1000);
    clampToBounds(brain, bounds);
    brain.chargeLeft = Math.max(0, brain.chargeLeft - dt);
    if (brain.chargeLeft <= 0) {
      if (!second) {
        // 两段之间的短停，第二段重新锁定玩家
        brain.mode = 'pause';
        brain.chargeLeft = tune.pauseMs;
      } else {
        brain.mode = 'recover';
        brain.chargeLeft = tune.cooldownMs;
        brain.chargeIn = Math.max(0, tune.intervalMs - tune.cooldownMs);
      }
      return makeResult(brain, [], false, false);
    }
    return makeResult(brain, [], true, false);
  }

  if (brain.mode === 'pause') {
    brain.x = self.x;
    brain.y = self.y;
    brain.chargeLeft = Math.max(0, brain.chargeLeft - dt);
    if (brain.chargeLeft <= 0) {
      brain.mode = 'charge';
      brain.burstLeft = 0;                 // 第二段：不再回收，结束后进后摇
      brain.chargeLeft = tune.secondChargeMs;
      brain.dir = unitVector(player.x - self.x, player.y - self.y) ?? brain.dir ?? { x: 0, y: 1 };
      brain.charges += 1;
      return makeResult(brain, [], true, false);
    }
    return makeResult(brain);
  }

  if (brain.mode === 'recover') {
    brain.x = self.x;
    brain.y = self.y;
    brain.chargeLeft = Math.max(0, brain.chargeLeft - dt);
    if (brain.chargeLeft <= 0) brain.mode = 'walk';
    return makeResult(brain);
  }

  approach(brain, ctx, 1);
  brain.chargeIn -= dt;
  if (brain.chargeIn <= 0) return beginWindup(brain, ctx, tune);
  return makeResult(brain);
}

// 星屑骑士「charge_volley」：预警 → 2.9 倍速冲锋 → 冲锋结束停 300ms（cast）→
// 沿冲锋方向打 4 发正向扇（总张角 0.5rad）→ 后摇。
// 注意：这里 brain.aim 仍用于「冲锋方向」这一移动决策（不是弹道）；弹道方向取 brain.dir，
// 不再依赖抬手瞬间的玩家快照。
function stepChargeVolley(brain, ctx) {
  const { self, player, dt, bounds } = ctx;
  const tune = tuneOf(ctx, CHARGE_VOLLEY_RULE);
  const ranged = rangedSpecOf(brain) ?? RANGED_RULES.stardust_knight;

  if (brain.mode === 'windup') {
    brain.windupLeft -= dt;
    brain.x = self.x;
    brain.y = self.y;
    if (brain.windupLeft > 0) return makeResult(brain, [], false, true);
    brain.mode = 'charge';
    brain.chargeLeft = tune.chargeMs;
    brain.dir = unitVector(brain.aim?.x - self.x, brain.aim?.y - self.y)
      ?? unitVector(player.x - self.x, player.y - self.y)
      ?? { x: 0, y: 1 };
    brain.charges += 1;
    return makeResult(brain, [], true, false);
  }

  if (brain.mode === 'charge') {
    const stepMs = Math.min(dt, brain.chargeLeft);
    brain.x = self.x + brain.dir.x * self.speed * tune.chargeMul * (stepMs / 1000);
    brain.y = self.y + brain.dir.y * self.speed * tune.chargeMul * (stepMs / 1000);
    clampToBounds(brain, bounds);
    brain.chargeLeft = Math.max(0, brain.chargeLeft - dt);
    if (brain.chargeLeft <= 0) {
      // 冲锋结束：站定 300ms 收势，随后才出弹（不是冲锋瞬间出弹）
      brain.mode = 'cast';
      brain.chargeLeft = finiteOr(ranged.windupMs, 300);
      return makeResult(brain, [], false, true);
    }
    return makeResult(brain, [], true, false);
  }

  if (brain.mode === 'cast') {
    brain.x = self.x;
    brain.y = self.y;
    brain.chargeLeft = Math.max(0, brain.chargeLeft - dt);
    if (brain.chargeLeft > 0) return makeResult(brain, [], false, true);
    // 4 发正向扇：中轴是冲锋方向（forward），玩家移动不会改这一轮的方向
    const shots = makeVolley(brain, ctx, ranged);
    brain.mode = 'recover';
    brain.chargeLeft = tune.cooldownMs;
    brain.chargeIn = Math.max(0, tune.intervalMs - tune.cooldownMs);
    const summon = finishCast(brain, ctx, ranged, shots);
    return makeResult(brain, shots, false, false, null, false, null, summon);
  }

  if (brain.mode === 'recover') {
    brain.x = self.x;
    brain.y = self.y;
    brain.chargeLeft = Math.max(0, brain.chargeLeft - dt);
    if (brain.chargeLeft <= 0) brain.mode = 'walk';
    return makeResult(brain);
  }

  approach(brain, ctx, 1);
  brain.chargeIn -= dt;
  if (brain.chargeIn <= 0) return beginWindup(brain, ctx, tune);
  return makeResult(brain);
}

// ---------- 行为分派表 ----------
export const STEP_BY_BEHAVIOR = Object.freeze({
  march: stepMarch,
  weave: stepWeave,
  orbit: stepCultist,
  volley: stepVolley,
  phase: stepPhase,
  blink_caster: stepOath,
  lunge: stepLunge,
  judge: stepJudge,
  slam: stepSlam,
  eclipse: stepEclipse,
  charge: stepKnight,
  stomp: stepStitch,
  lurch: stepLurch,
  spring: stepSpring,
  bulwark: stepBulwark,
  eruption: stepEruption,
  chain: stepChain,
  skitter: stepSkitter,
  stalk: stepStalk,
  drift: stepDrift,
  lance: stepLance,
  mirror: stepMirror,
  dart: stepDart,
  slam_charge: stepSlamCharge,
  double_charge: stepDoubleCharge,
  charge_volley: stepChargeVolley,
});

// ---------- 单步 ----------
export function stepBrain(brain, rawInput) {
  const input = rawInput && typeof rawInput === 'object' ? rawInput : {};
  const opts = input.opts && typeof input.opts === 'object' ? input.opts : {};
  const bounds = readBounds(opts);
  const self = readSelf(input.self, brain && typeof brain === 'object' ? brain : {}, bounds);
  const player = readPlayer(input.player, self);

  if (!brain || typeof brain !== 'object' || !KNOWN_DEFS.has(brain.defId)) {
    return { x: self.x, y: self.y, shots: [], stomp: null, charging: false, windup: false, guard: false, melee: null, summon: null };
  }

  // 兼容手写 brain：没有 behavior/tune 时按 defId 从 AI_PROFILE 取（不写回，保持纯数据可克隆）
  const profile = AI_PROFILE[brain.defId];
  const behavior = typeof brain.behavior === 'string' ? brain.behavior : profile.behavior;
  const tune = brain.tune && typeof brain.tune === 'object' ? brain.tune : profile.tune;

  const dtRaw = Number(input.dtMs);
  if (!Number.isFinite(dtRaw) || dtRaw < 0) {
    // 非法步长不推进状态，只回报当前旗标
    return {
      x: self.x,
      y: self.y,
      shots: [],
      stomp: null,
      charging: brain.mode === 'charge',
      windup: isWindup(brain),
      guard: brain.mode === 'guard',
      melee: null,
      summon: null,
    };
  }

  const dt = Math.min(dtRaw, MAX_STEP_MS);
  brain.now = finiteOr(input.now, brain.now);
  const ctx = { dt, self, player, bounds, opts, tune };

  // behavior 先推进（移动与自身节拍不受近战影响，旧时序零漂移）；
  // 近战作为附加事件层叠在结果上：前摇中补 windup=true，出手帧补 melee。
  const meleeRule = profile.melee;
  const step = STEP_BY_BEHAVIOR[behavior] ?? stepMarch;
  const result = step(brain, ctx);
  if (meleeRule) {
    // 近战事件的位置/朝向取「本帧输出位置」，与 result.x/y 一致（避免命中判定与绘制错位）
    const meleeCtx = { ...ctx, self: { ...self, x: result.x, y: result.y } };
    const m = stepMelee(brain, meleeCtx, meleeRule);
    if (m.active) result.windup = true;
    if (m.melee) result.melee = m.melee;
  }
  return result;
}
