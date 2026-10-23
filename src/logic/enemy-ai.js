// 敌人行为纯逻辑层：只负责「下一步坐标 + 本帧生成的弹丸」。
// 约束：不引用 Phaser / DOM，不调用 Math.random；所有随机性都由 createBrain 的 seed 决定，
// 因此同一 seed + 同一输入序列必然得到同一条轨迹（可回放、可测试）。
//
// 调用约定：
//   createBrain(defId, { now, seed }) -> brain（纯数据，可 structuredClone）
//   stepBrain(brain, { dtMs, now, self, player, opts })
//     -> { x, y, shots: [], stomp, charging, windup }
//   stomp 为 null 或 { x, y, radius, damage }：缝合尸魁贴身践踏的结算事件，由场景扣血。
//   self: { x, y, speed, radius }；opts: { BATTLE: { left, right, top, bottom }, damage }
//
// 腐尸的「慢 / 厚」是 roster 里的 speedMul / hpMul，由刷怪层乘算后再传进 speed / hp；
// 本层只按收到的 speed 行走，因此同一份逻辑既服务骷髅也服务腐尸。

export const DEFAULT_BATTLE = Object.freeze({ left: 10, right: 470, top: 26, bottom: 262 });

// 噬魂蝠：沿锁定方向前进，同时做左右正弦摆动（垂直偏移 = 振幅 × sin）
export const BAT_RULE = Object.freeze({ amplitude: 14, periodMs: 900 });

// 邪教徒：保持距离环绕；每 2.2s 一次 700ms 预警，预警结束发射一枚慢弹
export const CULTIST_RULE = Object.freeze({
  holdDist: 70,
  retreatDist: 46,
  attackMs: 2200,
  windupMs: 700,
  shotSpeed: 85,
  shotLifeMs: 4200,
});

// 亡灵骑士：每 2.6s 一次 600ms 预警，然后以 3.2 倍步行速度直线冲锋，最多 1.2s
export const KNIGHT_RULE = Object.freeze({
  intervalMs: 2600,
  windupMs: 600,
  chargeMs: 1200,
  chargeSpeedMul: 3.2,
});

// 缝合尸魁（二幕精英）：慢速接近，贴身后每 0.8s 践踏一次；本层只产出事件与计时
export const STITCH_RULE = Object.freeze({ stompDist: 26, stompMs: 800 });

// 咒誓主教（三幕精英）：保持约 110px，每 4.2s 瞬移到玩家侧翼，停顿 0.5s 后 0.15s 间隔三连弹
export const OATH_RULE = Object.freeze({
  holdDist: 110,
  blinkMs: 4200,
  pauseMs: 500,
  burstShots: 3,
  burstGapMs: 150,
  shotSpeed: 150,
  shotLifeMs: 3200,
});

const KNOWN_DEFS = new Set([
  'skeleton', 'bat', 'corpse', 'cultist', 'knight',
  'stitch_abomination', 'oath_bishop',
]);
const TAU = Math.PI * 2;
const MAX_STEP_MS = 10000;   // 单步上限：手滑传入超大 dt 也只前进 10s，不把坐标推到天边
const COORD_LIMIT = 1e6;

// ---------- 确定性伪随机（mulberry32，状态只是一个整数，便于序列化/回放） ----------
function seedText(seed) {
  if (typeof seed === 'string') return seed;
  try { return String(seed); } catch { return '0'; }
}

function hashSeed(seed) {
  let h = 2166136261 >>> 0;
  const s = seedText(seed);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function nextRandom(brain) {
  brain.rngState = (brain.rngState + 0x6d2b79f5) >>> 0;
  let t = brain.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---------- 小工具 ----------
function finiteOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampCoord(value) {
  return Math.max(-COORD_LIMIT, Math.min(COORD_LIMIT, value));
}

function finitePoint(point) {
  return point !== null && typeof point === 'object'
    && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y));
}

function unitVector(dx, dy) {
  const len = Math.hypot(dx, dy);
  if (!Number.isFinite(len) || len < 1e-6) return null;
  return { x: dx / len, y: dy / len };
}

function readBounds(opts) {
  const raw = opts && (opts.BATTLE ?? opts.bounds);
  const source = raw && typeof raw === 'object' ? raw : DEFAULT_BATTLE;
  let left = finiteOr(source.left, DEFAULT_BATTLE.left);
  let right = finiteOr(source.right, DEFAULT_BATTLE.right);
  let top = finiteOr(source.top, DEFAULT_BATTLE.top);
  let bottom = finiteOr(source.bottom, DEFAULT_BATTLE.bottom);
  if (left >= right) { left = DEFAULT_BATTLE.left; right = DEFAULT_BATTLE.right; }
  if (top >= bottom) { top = DEFAULT_BATTLE.top; bottom = DEFAULT_BATTLE.bottom; }
  return { left, right, top, bottom };
}

function readSelf(self, brain, bounds) {
  const fallbackX = Number.isFinite(brain.x) ? brain.x : (bounds.left + bounds.right) / 2;
  const fallbackY = Number.isFinite(brain.y) ? brain.y : (bounds.top + bounds.bottom) / 2;
  const x = clampCoord(finiteOr(self?.x, fallbackX));
  const y = clampCoord(finiteOr(self?.y, fallbackY));
  const speed = Math.max(0, finiteOr(self?.speed, 0));
  const radius = Math.max(0, finiteOr(self?.radius, 0));
  return { x, y, speed, radius };
}

function readPlayer(player, self) {
  return {
    x: clampCoord(finiteOr(player?.x, self.x)),
    y: clampCoord(finiteOr(player?.y, self.y)),
  };
}

function clampToBounds(point, bounds) {
  point.x = Math.min(bounds.right, Math.max(bounds.left, point.x));
  point.y = Math.min(bounds.bottom, Math.max(bounds.top, point.y));
}

function makeResult(brain, shots = [], charging = false, windup = false, stomp = null) {
  const x = clampCoord(finiteOr(brain.x, 0));
  const y = clampCoord(finiteOr(brain.y, 0));
  brain.x = x;
  brain.y = y;
  return { x, y, shots, stomp, charging, windup };
}

function isWindup(brain) {
  return brain.mode === 'windup' || brain.pauseLeft > 0;
}

// ---------- 创建 ----------
export function createBrain(defId, options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const def = typeof defId === 'string' && KNOWN_DEFS.has(defId) ? defId : 'skeleton';
  const brain = {
    defId: def,
    seed: seedText(opts.seed ?? 0),
    rngState: hashSeed(opts.seed ?? 0),
    bornAt: finiteOr(opts.now, 0),
    now: finiteOr(opts.now, 0),
    mode: 'walk',        // walk | windup | charge（只有邪教徒/骑士会离开 walk）
    x: null,             // 最近一次输出坐标；null 表示还没走过
    y: null,
    dir: null,           // 锁定方向（骷髅/腐尸的直线、蝙蝠的前进轴、骑士的冲锋轴）
    perp: null,          // 蝙蝠摆动的垂直轴
    phase: 0,            // 蝙蝠正弦相位；也用作步行摆动的时钟
    wobbleSign: 0,
    orbitDir: 1,
    attackIn: 0,
    windupLeft: 0,
    chargeIn: 0,
    chargeLeft: 0,
    aim: null,           // 预警锁定的目标点快照
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

  if (def === 'bat') brain.wobbleSign = nextRandom(brain) < 0.5 ? -1 : 1;
  if (def === 'cultist') {
    brain.orbitDir = nextRandom(brain) < 0.5 ? -1 : 1;
    brain.attackIn = CULTIST_RULE.attackMs;
  }
  if (def === 'knight') brain.chargeIn = KNIGHT_RULE.intervalMs;
  if (def === 'stitch_abomination') brain.stompIn = STITCH_RULE.stompMs;
  if (def === 'oath_bishop') {
    brain.orbitDir = nextRandom(brain) < 0.5 ? -1 : 1;
    brain.blinkIn = OATH_RULE.blinkMs;
  }
  return brain;
}

// ---------- 分行为 ----------
// 骷髅 / 腐尸：出生首帧锁定玩家位置，之后直线推进（接触与自毁仍由战斗层负责）
function stepMarch(brain, ctx) {
  const { self, player, dt } = ctx;
  if (!brain.dir) brain.dir = unitVector(player.x - self.x, player.y - self.y) ?? { x: 0, y: 1 };
  brain.x = self.x + brain.dir.x * self.speed * (dt / 1000);
  brain.y = self.y + brain.dir.y * self.speed * (dt / 1000);
  return makeResult(brain);
}

// 噬魂蝠：直线基准点前进 + 垂直方向正弦偏移。
// 用上一帧相位还原基准点，所以即使外部改了 self 坐标也能继续摆动。
function stepBat(brain, ctx) {
  const { self, player, dt } = ctx;
  if (!brain.dir) {
    brain.dir = unitVector(player.x - self.x, player.y - self.y) ?? { x: 0, y: 1 };
    const sign = brain.wobbleSign === -1 ? -1 : 1;
    brain.perp = { x: -brain.dir.y * sign, y: brain.dir.x * sign };
  }
  const amplitude = BAT_RULE.amplitude;
  const prevWobble = Math.sin((TAU * brain.phase) / BAT_RULE.periodMs);
  const baseX = self.x - brain.perp.x * amplitude * prevWobble;
  const baseY = self.y - brain.perp.y * amplitude * prevWobble;
  brain.phase = (brain.phase + dt) % BAT_RULE.periodMs;
  const wobble = Math.sin((TAU * brain.phase) / BAT_RULE.periodMs);
  brain.x = baseX + brain.dir.x * self.speed * (dt / 1000) + brain.perp.x * amplitude * wobble;
  brain.y = baseY + brain.dir.y * self.speed * (dt / 1000) + brain.perp.y * amplitude * wobble;
  return makeResult(brain);
}

function makeCultistShot(brain, self, opts) {
  const aim = finitePoint(brain.aim) ? brain.aim : { x: self.x, y: self.y + 1 };
  const dir = unitVector(aim.x - self.x, aim.y - self.y) ?? { x: 0, y: 1 };
  const damage = Math.max(1, Math.round(finiteOr(opts?.damage, 8)));
  return {
    x: self.x + dir.x * 4,
    y: self.y + dir.y * 4,
    vx: dir.x * CULTIST_RULE.shotSpeed,
    vy: dir.y * CULTIST_RULE.shotSpeed,
    damage,
    lifeMs: CULTIST_RULE.shotLifeMs,
  };
}

// 邪教徒：环绕保持约 70px；每 2.2s 停稳进入 700ms 预警（锁定玩家快照），预警中不移动，
// 预警结束射出一枚慢弹；玩家贴身时直接后退。
function stepCultist(brain, ctx) {
  const { self, player, dt, bounds, opts } = ctx;

  if (brain.mode === 'windup') {
    brain.windupLeft -= dt;
    brain.x = self.x;
    brain.y = self.y;
    if (brain.windupLeft > 0) return makeResult(brain, [], false, true);
    const shot = makeCultistShot(brain, self, opts);
    brain.mode = 'walk';
    brain.windupLeft = 0;
    brain.attackIn = CULTIST_RULE.attackMs;
    brain.aim = null;
    brain.shots += 1;
    return makeResult(brain, [shot], false, false);
  }

  const dx = player.x - self.x;
  const dy = player.y - self.y;
  const dist = Math.hypot(dx, dy);
  const nx = dist > 1e-6 ? dx / dist : 0;
  const ny = dist > 1e-6 ? dy / dist : 1;
  let vx = 0;
  let vy = 0;

  if (dist < CULTIST_RULE.retreatDist) {
    // 贴身：沿反方向退开
    vx = -nx * self.speed * 1.1;
    vy = -ny * self.speed * 1.1;
  } else {
    const radial = Math.max(-self.speed, Math.min(self.speed, (dist - CULTIST_RULE.holdDist) * 2.4));
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
  if (brain.attackIn <= 0) {
    brain.mode = 'windup';
    brain.windupLeft = CULTIST_RULE.windupMs;
    brain.attackIn = 0;
    brain.aim = { x: player.x, y: player.y };
    brain.windups += 1;
    return makeResult(brain, [], false, true);
  }
  return makeResult(brain, [], false, false);
}

// 亡灵骑士：步行追人；每 2.6s 预警 600ms 锁定玩家当前点，接着 3.2 倍速度直线冲锋，
// 冲过目标点或 1.2s 后停下，恢复步行。
function stepKnight(brain, ctx) {
  const { self, player, dt, bounds } = ctx;

  if (brain.mode === 'windup') {
    brain.windupLeft -= dt;
    brain.x = self.x;
    brain.y = self.y;
    if (brain.windupLeft > 0) return makeResult(brain, [], false, true);
    brain.mode = 'charge';
    brain.chargeLeft = KNIGHT_RULE.chargeMs;
    brain.dir = unitVector(brain.aim.x - self.x, brain.aim.y - self.y)
      ?? unitVector(player.x - self.x, player.y - self.y)
      ?? { x: 0, y: 1 };
    brain.charges += 1;
    return makeResult(brain, [], true, false);
  }

  if (brain.mode === 'charge') {
    const stepMs = Math.min(dt, brain.chargeLeft);
    const speed = self.speed * KNIGHT_RULE.chargeSpeedMul;
    brain.x = self.x + brain.dir.x * speed * (stepMs / 1000);
    brain.y = self.y + brain.dir.y * speed * (stepMs / 1000);
    clampToBounds(brain, bounds);
    brain.chargeLeft = Math.max(0, brain.chargeLeft - dt);
    const passed = (brain.x - brain.aim.x) * brain.dir.x + (brain.y - brain.aim.y) * brain.dir.y >= 0;
    if (brain.chargeLeft <= 0 || passed) {
      brain.mode = 'walk';
      brain.chargeLeft = 0;
      brain.chargeIn = KNIGHT_RULE.intervalMs;
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
    brain.windupLeft = KNIGHT_RULE.windupMs;
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
  const dist = Math.hypot(player.x - self.x, player.y - self.y);
  let stomp = null;

  if (dist <= STITCH_RULE.stompDist) {
    // 贴身：站定蓄力，位置不变
    brain.x = self.x;
    brain.y = self.y;
    brain.stompIn -= dt;
    if (brain.stompIn <= 0) {
      brain.stompIn = STITCH_RULE.stompMs;
      brain.stomps += 1;
      stomp = {
        x: self.x,
        y: self.y,
        radius: STITCH_RULE.stompDist,
        damage: Math.max(1, Math.round(finiteOr(opts?.damage, 14))),
      };
    }
  } else {
    // 离开范围：重置蓄力，重新贴身需再等满 800ms
    brain.stompIn = STITCH_RULE.stompMs;
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

function makeOathShot(self, player, opts) {
  const dir = unitVector(player.x - self.x, player.y - self.y) ?? { x: 0, y: 1 };
  return {
    x: self.x + dir.x * 6,
    y: self.y + dir.y * 6,
    vx: dir.x * OATH_RULE.shotSpeed,
    vy: dir.y * OATH_RULE.shotSpeed,
    damage: Math.max(1, Math.round(finiteOr(opts?.damage, 10))),
    lifeMs: OATH_RULE.shotLifeMs,
  };
}

// 咒誓主教：空闲时维持 110px 并缓慢环绕；每 4.2s 瞬移到玩家侧翼（seed 决定左右），
// 瞬移后停顿 500ms（windup=true），随后 150ms 间隔打满三发；瞬移节拍不因停顿/连弹顺延。
function stepOath(brain, ctx) {
  const { self, player, dt, bounds, opts } = ctx;

  brain.blinkIn -= dt;

  // 1) 瞬移后的停顿：不移动，第一发在停顿结束的同一帧射出
  if (brain.pauseLeft > 0) {
    brain.pauseLeft -= dt;
    brain.x = self.x;
    brain.y = self.y;
    if (brain.pauseLeft > 0) return makeResult(brain, [], false, true);
    brain.pauseLeft = 0;
    brain.burstLeft = OATH_RULE.burstShots - 1;
    brain.burstIn = OATH_RULE.burstGapMs;
    return makeResult(brain, [makeOathShot(self, player, opts)], false, false);
  }

  // 2) 三连弹剩余两发：站定射击
  if (brain.burstLeft > 0) {
    brain.burstIn -= dt;
    brain.x = self.x;
    brain.y = self.y;
    if (brain.burstIn <= 0) {
      brain.burstLeft -= 1;
      brain.burstIn = OATH_RULE.burstGapMs;
      return makeResult(brain, [makeOathShot(self, player, opts)], false, false);
    }
    return makeResult(brain, [], false, false);
  }

  // 3) 空闲：保持约 110px，缓慢环绕
  const dx = player.x - self.x;
  const dy = player.y - self.y;
  const dist = Math.hypot(dx, dy);
  const nx = dist > 1e-6 ? dx / dist : 0;
  const ny = dist > 1e-6 ? dy / dist : 1;
  const radial = Math.max(-self.speed, Math.min(self.speed, (dist - OATH_RULE.holdDist) * 2));
  const tangential = self.speed * 0.6 * (brain.orbitDir < 0 ? -1 : 1);
  brain.x = self.x + (-ny * tangential + nx * radial) * (dt / 1000);
  brain.y = self.y + (nx * tangential + ny * radial) * (dt / 1000);
  clampToBounds(brain, bounds);

  // 4) 瞬移：落在玩家侧翼，左右由种子随机决定
  if (brain.blinkIn <= 0) {
    const side = nextRandom(brain) < 0.5 ? -1 : 1;
    brain.x = player.x + -ny * side * OATH_RULE.holdDist;
    brain.y = player.y + nx * side * OATH_RULE.holdDist;
    clampToBounds(brain, bounds);
    brain.pauseLeft = OATH_RULE.pauseMs;
    brain.blinkIn = OATH_RULE.blinkMs;
    brain.blinks += 1;
    return makeResult(brain, [], false, true);
  }

  return makeResult(brain, [], false, false);
}

// ---------- 单步 ----------
export function stepBrain(brain, rawInput) {
  const input = rawInput && typeof rawInput === 'object' ? rawInput : {};
  const opts = input.opts && typeof input.opts === 'object' ? input.opts : {};
  const bounds = readBounds(opts);
  const self = readSelf(input.self, brain && typeof brain === 'object' ? brain : {}, bounds);
  const player = readPlayer(input.player, self);

  if (!brain || typeof brain !== 'object' || !KNOWN_DEFS.has(brain.defId)) {
    return { x: self.x, y: self.y, shots: [], stomp: null, charging: false, windup: false };
  }

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
    };
  }

  const dt = Math.min(dtRaw, MAX_STEP_MS);
  brain.now = finiteOr(input.now, brain.now);
  const ctx = { dt, self, player, bounds, opts };

  switch (brain.defId) {
    case 'bat': return stepBat(brain, ctx);
    case 'corpse': return stepMarch(brain, ctx);
    case 'cultist': return stepCultist(brain, ctx);
    case 'knight': return stepKnight(brain, ctx);
    case 'stitch_abomination': return stepStitch(brain, ctx);
    case 'oath_bishop': return stepOath(brain, ctx);
    case 'skeleton':
    default: return stepMarch(brain, ctx);
  }
}
