// 敌人攻击工具：结果构造、预警、远程抬手、弹幕/召唤生成、近战一步。
// 从 logic/enemy-ai.js 拆出（2026-11-19 架构重构波 4）。
import { AI_PROFILE, TURRET_LIFE_MS, RUNE_LIFE_MS } from '../../data/enemy-tables.js';
import { leadAim, makeShot } from '../hostile.js';
import { finiteOr, lockAim, clampCoord } from './motion.js';

const TAU = Math.PI * 2;

export function makeResult(brain, shots = [], charging = false, windup = false, stomp = null, guard = false, melee = null, summon = null) {
  const x = clampCoord(finiteOr(brain.x, 0));
  const y = clampCoord(finiteOr(brain.y, 0));
  brain.x = x;
  brain.y = y;
  // melee / summon 是本轮新增的事件字段；旧字段保持原顺序原含义，场景侧按需读取。
  return { x, y, shots, stomp, charging, windup, guard, melee, summon };
}

export function isWindup(brain) {
  return brain.mode === 'windup' || brain.mode === 'cast' || brain.pauseLeft > 0 || brain.meleeLeft > 0;
}

export function tuneOf(ctx, fallback) {
  const tune = ctx?.tune;
  return tune && typeof tune === 'object' ? tune : fallback;
}

export function beginWindup(brain, ctx, tune) {
  brain.mode = 'windup';
  brain.windupLeft = Math.max(1, finiteOr(tune?.windupMs, 500));
  brain.attackIn = 0;
  lockAim(brain, ctx);
  brain.windups += 1;
  return makeResult(brain, [], false, true);
}

export function rangedSpecOf(brain) {
  const profile = brain && AI_PROFILE[brain.defId];
  return profile && profile.ranged ? profile.ranged : null;
}

export function beginCast(brain, ctx, tune, windupMs) {
  const ms = finiteOr(windupMs, finiteOr(tune?.windupMs, 500));
  brain.mode = 'windup';
  brain.windupLeft = Math.max(1, ms);
  brain.attackIn = 0;
  brain.windups += 1;
  return makeResult(brain, [], false, true);
}

export function stepMelee(brain, ctx, rule) {
  const { self, player, dt } = ctx;
  const neutral = brain.mode === 'walk' || brain.mode === 'hold';

  if (brain.meleeLeft > 0) {
    if (!neutral) {
      // 自身节拍抢占（开始蓄力/冲锋/格挡）：放弃这次近战，冷却不消耗
      brain.meleeLeft = 0;
      brain.meleePreview = null;
      return { active: false, melee: null };
    }
    brain.meleeLeft = Math.max(0, brain.meleeLeft - dt);
    if (brain.meleeLeft > 0) {
      brain.meleePreview = {
        angle: Math.atan2(player.y - self.y, player.x - self.x),
        arc: rule.arc,
        range: rule.range,
        kind: rule.kind,
      };
      return { active: true, melee: null };
    }
    // 前摇结束：出手（朝向取出手瞬间的玩家位置）
    brain.meleeLeft = 0;
    brain.meleeIn = Math.max(0, finiteOr(rule.cooldownMs, 1500));
    brain.melees += 1;
    const melee = {
      x: self.x,
      y: self.y,
      angle: Math.atan2(player.y - self.y, player.x - self.x),
      arc: rule.arc,
      range: rule.range,
      damage: Math.max(1, Math.round(finiteOr(ctx.opts?.damage, 8))),
      kind: rule.kind,
    };
    brain.meleePreview = null;
    return { active: false, melee };
  }

  // 冷却推进（没在前摇时才走）
  if (brain.meleeIn > 0) brain.meleeIn = Math.max(0, brain.meleeIn - dt);
  const dist = Math.hypot(player.x - self.x, player.y - self.y);
  if (!neutral || brain.meleeIn > 0 || dist > rule.range + 4) return { active: false, melee: null };

  brain.meleeLeft = Math.max(1, finiteOr(rule.windupMs, 400));
  brain.meleePreview = {
    angle: Math.atan2(player.y - self.y, player.x - self.x),
    arc: rule.arc,
    range: rule.range,
    kind: rule.kind,
  };
  return { active: true, melee: null };
}

export function shotDamage(ctx, spec) {
  const base = finiteOr(ctx?.opts?.damage, 8);
  return Math.max(1, Math.round(base * finiteOr(spec?.damageMul, 1)));
}

export function makeVolley(brain, ctx, spec, override = null) {
  const s = override ? { ...spec, ...override } : spec;
  const { self, player } = ctx;
  const speed = Math.max(0, finiteOr(s.speed, 100));
  const lifeMs = Math.max(1, finiteOr(s.lifeMs, 2000));
  const kind = s.kind === 'orb' || s.kind === 'homing' ? s.kind : 'bolt';
  const damage = shotDamage(ctx, s);
  const count = Math.max(0, Math.floor(finiteOr(s.count, 1)));
  if (!count) return [];

  const aim = leadAim(self, player, speed);
  const base = s.forward && brain.dir ? Math.atan2(brain.dir.y, brain.dir.x) : Math.atan2(aim.y, aim.x);
  const angles = [];
  if (s.ring) {
    for (let i = 0; i < count; i++) angles.push((i / count) * TAU);
  } else if (count === 1) {
    angles.push(base);
  } else {
    const spread = Math.max(0, finiteOr(s.spread, 0));
    const step = spread / (count - 1);
    for (let i = 0; i < count; i++) angles.push(base + (i - (count - 1) / 2) * step);
  }

  const offset = 6; // 出膛点：防止弹丸生成在身体正中（与旧 pushShot 口径一致）
  const shots = [];
  for (const a of angles) {
    const dir = { x: Math.cos(a), y: Math.sin(a) };
    shots.push(makeShot(
      { x: self.x + dir.x * offset, y: self.y + dir.y * offset },
      dir,
      { kind, speed, damage, lifeMs },
    ));
  }
  return shots;
}

export function makeSummonFor(brain, ctx, spec) {
  const kind = spec?.summonKind === 'rune' ? 'rune' : 'turret';
  const base = Math.max(0, finiteOr(ctx?.opts?.damage, 8));
  const at = kind === 'rune' ? ctx.player : ctx.self;
  const summon = {
    kind,
    x: clampCoord(finiteOr(at?.x, 0)),
    y: clampCoord(finiteOr(at?.y, 0)),
    damage: kind === 'turret' ? base * 0.6 : base,
    lifeMs: kind === 'turret' ? TURRET_LIFE_MS : RUNE_LIFE_MS,
  };
  const owner = brain?.id;
  if (Number.isFinite(owner) || typeof owner === 'string') summon.owner = owner;
  return summon;
}

export function finishCast(brain, ctx, spec, shots) {
  brain.casts += 1;
  brain.shots += shots.length;
  if (spec?.summonEvery && spec.summonKind && brain.casts % spec.summonEvery === 0) {
    return makeSummonFor(brain, ctx, spec);
  }
  return null;
}

