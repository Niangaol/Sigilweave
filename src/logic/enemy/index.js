// 敌人行为入口：brain 构造与单步分派（26 个行为在 behaviors.js）。
// 从 logic/enemy-ai.js 拆出（2026-11-19 架构重构波 4）。对外导出面不变。
import { AI_PROFILE, MELEE_RULES, RANGED_RULES } from '../../data/enemy-tables.js';
import { nextRandom, hashSeed, seedText } from './rng.js';
import { finiteOr, readBounds, readSelf, readPlayer, clampToBounds } from './motion.js';
import { stepMelee, isWindup } from './attack.js';
import { STEP_BY_BEHAVIOR } from './behaviors.js';

// 26 个合法 defId 由 AI_PROFILE 派生：新增敌人只改 AI_PROFILE 一处。
const KNOWN_DEFS = new Set(Object.keys(AI_PROFILE));
const MAX_STEP_MS = 10000;   // 单步上限：手滑传入超大 dt 也只前进 10s，不把坐标推到天边

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
