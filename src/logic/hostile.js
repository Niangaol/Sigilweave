// 敌方攻击纯逻辑：弹道 / 追踪 / 召唤物 / 扇形命中 / 提前量。
// 契约见 docs/superpowers/specs/2026-11-17-enemy-attacks-design.md §2.5（冻结契约）。
//
// 纪律（别再往里加东西）：
// - 零 Phaser、零 DOM、零 Math.random（确定性：同输入必得同输出）；
// - 所有非法输入（null / NaN / Infinity / 负数 / 缺字段 / 类型不对）一律回退默认值，
//   绝不抛错——战斗循环里扔异常会直接把一帧打成黑屏；
// - 输出数组保持输入顺序，便于逐帧对拍与静态回归；
// - 不改动入参（内部一律先 normalize 出副本），调用方可以放心把上一帧的 list 再传回来。
//
// 场景侧（T2/T3）只负责表现与上限的「跨列表」统计，这里只管单列表推进。

export const HOSTILE_LIMITS = Object.freeze({
  shots: 96,    // 全场弹丸上限（spec §5.1：64 → 96）
  summons: 20,  // 全场召唤物上限
  turret: 12,   // 滞空炮台上限
  rune: 8,      // 地面符文上限
  homing: 16,   // 追踪小召唤物上限（计入弹丸池）
});

// 缺省毫秒步长：勾选不到 dt 时按 60fps 推进，避免整帧冻结。
const DEFAULT_DT_MS = 16;
// 角度比较的浮点容差：让「正好落在弧边界上」稳定算命中（含边界是契约要求）。
const ANGLE_EPS = 1e-9;

// 各弹种的缺省值。速度单位 px/s；turnRate 单位 rad/s（spec §5 追踪体 1.6）。
const SHOT_KINDS = Object.freeze({
  bolt: Object.freeze({ radius: 3, speed: 120, lifeMs: 6000, damage: 1, turnRate: 0 }),
  orb: Object.freeze({ radius: 6, speed: 80, lifeMs: 6000, damage: 1, turnRate: 0 }),
  homing: Object.freeze({ radius: 4, speed: 46, lifeMs: 4200, damage: 1, turnRate: 1.6 }),
});

// 召唤物缺省值。turret 每 1200ms 发 1 发慢弹；rune 的 lifeMs 就是引信（1200ms）。
// 注意：turret 的 damage 就是「弹丸伤害」，§5 的 ×0.6 由布置召唤物的一侧折算好再传进来，
// 这里不做隐式缩放，避免 T3 传已折算值造成双重打折。
const SUMMON_KINDS = Object.freeze({
  turret: Object.freeze({ lifeMs: 5000, hp: 12, radius: 6, damage: 1, intervalMs: 1200 }),
  rune: Object.freeze({ lifeMs: 1200, hp: 8, radius: 44, damage: 1, intervalMs: 0 }),
});

const TURRET_SHOT_SPEED = 60; // 炮台「慢弹」默认速度（px/s）

function isObj(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// 有限数守卫：只有 Number.isFinite 通过才算合法（字符串数字也当非法，避免 '12' 混入运算）。
function num(v, fallback) {
  return Number.isFinite(v) ? v : fallback;
}

// 非负有限值守卫。
function nonNeg(v, fallback) {
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

// 正有限值守卫（寿命 / 间隔这类必须 > 0 的字段）。
function positive(v, fallback) {
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

// 毫秒步长：非法（NaN/Infinity/非数）回退 16ms，负数按 0 处理（绝不倒放时间）。
function stepMs(v) {
  if (!Number.isFinite(v)) return DEFAULT_DT_MS;
  return v > 0 ? v : 0;
}

// 上限：非法回退默认值，小数向下取整，0 是合法上限（用于「本帧禁射」）。
function capOf(v, fallback) {
  return Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;
}

// 角度归一到 [-π, π]，用于跨 ±π 的夹角比较。
function wrapRad(a) {
  const two = Math.PI * 2;
  let r = a % two;
  if (r > Math.PI) r -= two;
  else if (r < -Math.PI) r += two;
  return r;
}

function kindDefaults(kind) {
  return SHOT_KINDS[kind] || SHOT_KINDS.bolt;
}

// 玩家快照：坐标不合法就当「场上没有可命中的目标」，跳过命中结算（不猜位置）。
// 保留 vx/vy：炮台发弹要跑 leadAim，提前量靠这两个分量。
function playerOf(p) {
  if (!isObj(p) || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  return {
    x: p.x,
    y: p.y,
    radius: nonNeg(p.radius, 0),
    vx: num(p.vx, 0),
    vy: num(p.vy, 0),
  };
}

// 世界边界：兼容 { x, y, w, h } 与 { left, top, right, bottom } 两种写法；
// 尺寸不合法（缺失 / 0 / 负）视为「没有边界」，不做清退。
function boundsOf(world) {
  if (!isObj(world)) return null;
  const width = num(world.w, num(world.width, 0));
  const height = num(world.h, num(world.height, 0));
  if (!(width > 0) || !(height > 0)) return null;
  const left = num(world.x, num(world.left, 0));
  const top = num(world.y, num(world.top, 0));
  return { left, top, right: left + width, bottom: top + height };
}

// 单位方向：零向量 / 非法输入回退 +x（弹丸总得有个朝向）。
function unitOf(dir) {
  const dx = isObj(dir) ? num(dir.x, 0) : 0;
  const dy = isObj(dir) ? num(dir.y, 0) : 0;
  const len = Math.hypot(dx, dy);
  if (!(len > 1e-9)) return { x: 1, y: 0 };
  return { x: dx / len, y: dy / len };
}

/**
 * 线性提前量：按目标当前速度外推一次（t = 距离 / 弹速），返回指向预测点的单位向量。
 * 只做一次外推（不做迭代收敛），保证确定性且不会在贴身时抖。
 * speed 非法 → 退化为「直指目标当前位置」。
 */
export function leadAim(from, target, speed) {
  const sx = isObj(from) ? num(from.x, NaN) : NaN;
  const sy = isObj(from) ? num(from.y, NaN) : NaN;
  const tx = isObj(target) ? num(target.x, NaN) : NaN;
  const ty = isObj(target) ? num(target.y, NaN) : NaN;
  if (!Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(tx) || !Number.isFinite(ty)) {
    return { x: 1, y: 0 };
  }
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy);
  const spd = num(speed, NaN);
  const flightSec = Number.isFinite(spd) && spd > 0 ? dist / spd : 0;
  const vx = isObj(target) ? num(target.vx, 0) : 0;
  const vy = isObj(target) ? num(target.vy, 0) : 0;
  const aimX = dx + vx * flightSec;
  const aimY = dy + vy * flightSec;
  const aimLen = Math.hypot(aimX, aimY);
  // 预测点恰好落回射手身上（目标朝射手扑过来）时退回「直指当前位置」。
  if (aimLen > 1e-9) return { x: aimX / aimLen, y: aimY / aimLen };
  if (dist > 1e-9) return { x: dx / dist, y: dy / dist };
  return { x: 1, y: 0 };
}

/**
 * 规范化一发敌方弹丸：字段全部转成有限数，未知字段原样保留（owner / color 等）。
 * 非法 kind → bolt；kind:'homing' 或 homing:true/1 → 追踪弹，turnRate 缺省 1.6。
 */
export function normalizeShot(spec) {
  const src = isObj(spec) ? spec : {};
  const kind = typeof src.kind === 'string' && SHOT_KINDS[src.kind] ? src.kind : 'bolt';
  const def = kindDefaults(kind);
  const homing = kind === 'homing' || src.homing === true || src.homing === 1;
  return {
    ...src,
    kind,
    x: num(src.x, 0),
    y: num(src.y, 0),
    vx: num(src.vx, 0),
    vy: num(src.vy, 0),
    damage: nonNeg(src.damage, def.damage),
    lifeMs: positive(src.lifeMs, def.lifeMs),
    radius: nonNeg(src.radius, def.radius),
    homing,
    turnRate: homing ? nonNeg(src.turnRate, def.turnRate) : nonNeg(src.turnRate, 0),
  };
}

/**
 * 由「出生点 + 方向 + 参数」造一发规范化弹丸。
 * dir 会被归一化；零向量 / 非法方向回退 +x；spec.speed 缺省按弹种取（bolt 120 / orb 80 / homing 46）。
 */
export function makeShot(from, dir, spec) {
  const src = isObj(spec) ? spec : {};
  // speed 是「构造入参」而不是弹丸字段：算完 vx/vy 就丢掉，避免下游把它当成速度来源二次换算。
  const { speed, ...rest } = src;
  const kind = typeof rest.kind === 'string' && SHOT_KINDS[rest.kind] ? rest.kind : 'bolt';
  const spd = nonNeg(speed, kindDefaults(kind).speed);
  const unit = unitOf(dir);
  const origin = isObj(from) ? from : {};
  return normalizeShot({
    ...rest,
    x: num(origin.x, 0),
    y: num(origin.y, 0),
    vx: unit.x * spd,
    vy: unit.y * spd,
  });
}

// 追踪弹转向：保持速度大小，只把方向朝玩家转 min(turnRate * dt, 需要转的角度)。
function turnToward(shot, who, dtMs) {
  if (!who) return;
  const speed = Math.hypot(shot.vx, shot.vy);
  const spd = speed > 1e-9 ? speed : kindDefaults(shot.kind).speed;
  const cur = speed > 1e-9 ? Math.atan2(shot.vy, shot.vx) : 0;
  const want = Math.atan2(who.y - shot.y, who.x - shot.x);
  const diff = wrapRad(want - cur);
  const maxTurn = shot.turnRate * (dtMs / 1000);
  if (!(maxTurn > 0)) return;
  const turn = Math.abs(diff) > maxTurn ? (diff < 0 ? -maxTurn : maxTurn) : diff;
  const angle = cur + turn;
  shot.vx = Math.cos(angle) * spd;
  shot.vy = Math.sin(angle) * spd;
}

/**
 * 推进一帧敌方弹丸。
 * - bolt / orb：按 vx/vy 直线位移；
 * - homing：以 turnRate 转向玩家当前位置后位移；
 * - 命中判定：dist < player.radius + shot.radius + 1（严格小于，正好贴上不算命中）；
 * - 寿命归零或出界即移除并计入 expired；命中移除不计入 expired（走 hits）。
 * 返回 { list, hits: [{ damage, x, y, kind }], expired }，list 保持输入顺序，并裁到 maxShots。
 */
export function stepHostileShots(list, opts) {
  const src = Array.isArray(list) ? list : [];
  const o = isObj(opts) ? opts : {};
  const dtMs = stepMs(o.dtMs);
  const who = playerOf(o.player);
  const bounds = boundsOf(o.world);
  const cap = capOf(o.maxShots, HOSTILE_LIMITS.shots);

  const out = [];
  const hits = [];
  let expired = 0;

  for (let i = 0; i < src.length; i++) {
    const raw = src[i];
    if (!isObj(raw)) continue; // 列表里的脏元素直接丢弃，不凭空造一发位于原点的弹
    const shot = normalizeShot(raw);
    if (shot.homing) turnToward(shot, who, dtMs);
    shot.x += (shot.vx * dtMs) / 1000;
    shot.y += (shot.vy * dtMs) / 1000;

    if (who && Math.hypot(shot.x - who.x, shot.y - who.y) < who.radius + shot.radius + 1) {
      // fromBoss 透传（B5）：只有 Boss 大招弹带这个标记，场景层据此挂 bossControlFor(stage)
      // 并跳过全场兜底迟滞；普通弹显式为 false，走 DEFAULT_SHOT_CONTROL。
      // 用 === true 而不是直接透传 shot.fromBoss：undefined 混进控制矩阵会让两条通道都漏挂。
      hits.push({ damage: shot.damage, x: shot.x, y: shot.y, kind: shot.kind, fromBoss: shot.fromBoss === true });
      continue;
    }
    if (bounds && (shot.x < bounds.left || shot.x > bounds.right || shot.y < bounds.top || shot.y > bounds.bottom)) {
      expired++;
      continue;
    }
    shot.lifeMs -= dtMs;
    if (shot.lifeMs <= 0) {
      expired++;
      continue;
    }
    out.push(shot);
  }

  if (out.length > cap) out.length = cap;
  return { list: out, hits, expired };
}

// 召唤物按种类取默认生命（damageSummon 在 hp 缺失时用）。
function defaultHpOf(kind) {
  if (kind === 'turret') return SUMMON_KINDS.turret.hp;
  if (kind === 'rune') return SUMMON_KINDS.rune.hp;
  return 6; // 追踪小召唤物
}

/**
 * 规范化一个召唤物：字段全部有限，未知字段保留。
 * - turret：lifeMs 5000 / hp 12 / radius 6 / intervalMs 1200 / timerMs 从 intervalMs 起算；
 * - rune：lifeMs 即引信 1200 / hp 8 / radius（爆炸半径）44；
 * - alive 缺省 true；kind 非法回退 turret。
 */
export function normalizeSummon(spec) {
  const src = isObj(spec) ? spec : {};
  const kind = src.kind === 'rune' ? 'rune' : 'turret';
  const def = SUMMON_KINDS[kind];
  const intervalMs = kind === 'turret'
    ? positive(src.intervalMs, def.intervalMs)
    : nonNeg(src.intervalMs, def.intervalMs);
  return {
    ...src,
    kind,
    x: num(src.x, 0),
    y: num(src.y, 0),
    lifeMs: positive(src.lifeMs, def.lifeMs),
    damage: nonNeg(src.damage, def.damage),
    radius: nonNeg(src.radius, def.radius),
    hp: nonNeg(src.hp, def.hp),
    alive: src.alive !== false,
    intervalMs,
    timerMs: nonNeg(src.timerMs, intervalMs),
  };
}

/**
 * 推进一帧召唤物。
 * - turret：timerMs 归零 → 用 leadAim 朝玩家当前位置发 1 发慢弹（kind bolt，速度取 shotSpeed 或 60），
 *   随后 timerMs 重置为 intervalMs（每帧最多发 1 发，dt 再大也不会爆发式倾泻）；
 * - rune：lifeMs（引信）归零 → 产出 detonations: [{ x, y, radius, damage }] 并移除；
 * - 两者 lifeMs 归零即移除；hp<=0 / alive===false 的召唤物直接被丢弃（由场景负责爆散表现）。
 * 返回 { list, shots, detonations, expired }，list 保持输入顺序，shots 裁到 maxShots。
 */
export function stepSummons(list, opts) {
  const src = Array.isArray(list) ? list : [];
  const o = isObj(opts) ? opts : {};
  const dtMs = stepMs(o.dtMs);
  const who = playerOf(o.player);
  const cap = capOf(o.maxShots, HOSTILE_LIMITS.shots);

  const out = [];
  const shots = [];
  const detonations = [];
  let expired = 0;

  for (let i = 0; i < src.length; i++) {
    const raw = src[i];
    if (!isObj(raw)) continue;
    const summon = normalizeSummon(raw);
    if (!summon.alive || summon.hp <= 0) continue;

    summon.lifeMs -= dtMs;

    if (summon.kind === 'rune') {
      if (summon.lifeMs <= 0) {
        detonations.push({
          x: summon.x,
          y: summon.y,
          radius: summon.radius,
          damage: summon.damage,
        });
        expired++;
        continue;
      }
      out.push(summon);
      continue;
    }

    summon.timerMs -= dtMs;
    if (summon.timerMs <= 0) {
      const speed = positive(summon.shotSpeed, TURRET_SHOT_SPEED);
      const dir = who ? leadAim(summon, who, speed) : { x: 1, y: 0 };
      shots.push(makeShot(summon, dir, {
        kind: 'bolt',
        speed,
        damage: summon.damage,
        radius: SHOT_KINDS.bolt.radius,
      }));
      summon.timerMs = summon.intervalMs;
    }

    if (summon.lifeMs <= 0) {
      expired++;
      continue;
    }
    out.push(summon);
  }

  if (shots.length > cap) shots.length = cap;
  return { list: out, shots, detonations, expired };
}

/**
 * 扇形命中：距离 ≤ range + pointRadius，且与 angle 的夹角 ≤ arc/2（含边界）。
 * arc 为总张角（弧度），超过 2π 按 2π（全向）处理；落点正好在原点算命中。
 * 任一入参非法 → 返回 false（宁可挥空，不可凭空命中）。
 */
export function arcHitTest(origin, angle, arc, range, point, pointRadius = 0) {
  if (!isObj(origin) || !isObj(point)) return false;
  if (!Number.isFinite(angle) || !Number.isFinite(arc) || !Number.isFinite(range)) return false;
  if (arc < 0 || range < 0) return false;
  if (!Number.isFinite(origin.x) || !Number.isFinite(origin.y)) return false;
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;

  const pad = nonNeg(pointRadius, 0);
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const dist = Math.hypot(dx, dy);
  if (!(dist <= range + pad)) return false;
  if (dist <= 1e-9) return true; // 站在射手身上：距离判定已过，不论朝向都算被扫到

  const half = Math.min(arc, Math.PI * 2) / 2;
  const delta = Math.abs(wrapRad(Math.atan2(dy, dx) - angle));
  return delta <= half + ANGLE_EPS;
}

/**
 * 近战命中：arcHitTest 的封装，用玩家半径扩展距离（spec §2：距离 ≤ range + 玩家半径）。
 * melee = { x, y, angle, arc, range }；字段缺失按非法处理 → false。
 */
export function meleeHits(melee, player) {
  if (!isObj(melee) || !isObj(player)) return false;
  return arcHitTest(
    melee,
    num(melee.angle, NaN),
    num(melee.arc, NaN),
    num(melee.range, NaN),
    player,
    num(player.radius, 0),
  );
}

/**
 * 扣召唤物生命：返回实扣（不会超过剩余生命）；hp 归零置 alive=false。
 * 直接修改 summon 对象并写入 lastHitAmount（§5.1 索敌/命中反馈要求的字段）。
 * 已死亡 / 非法 amount（0、负数、NaN、Infinity、非数）返回 0 且不改 hp。
 */
export function damageSummon(summon, amount) {
  if (!isObj(summon)) return 0;
  const hp = Math.max(0, num(summon.hp, defaultHpOf(summon.kind)));
  summon.hp = hp;
  if (summon.alive === false || hp <= 0) {
    summon.alive = false;
    summon.lastHitAmount = 0;
    return 0;
  }
  const wanted = Number.isFinite(amount) && amount > 0 ? amount : 0;
  const dealt = Math.min(hp, wanted);
  summon.hp = hp - dealt;
  summon.lastHitAmount = dealt;
  if (summon.hp <= 0) {
    summon.hp = 0;
    summon.alive = false;
  }
  return dealt;
}
