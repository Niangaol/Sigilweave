// 效果结算层：把「触发」翻译成伤害、护盾、减速等实际后果。
// 纯逻辑，不依赖 Phaser，可在 Node 里单测。
import { resolveTarget } from './sector.js';
import { ORTHO_DIRS } from './constants.js';
import { neighborsOf } from './grid.js';

import { SIGIL_DEFS, AUX_DEFS, RUNE_DEFS, OATH_DEFS } from '../data/cards.js';
export { SIGIL_DEFS, AUX_DEFS, RUNE_DEFS, OATH_DEFS };

const SACRIFICE_SHIELD_COST = 8;
const SACRIFICE_DAMAGE_MUL = 2;

// 区域符印的内圈衰减：星陨半径 70，其中半径 35 内伤害 -30%，外圈全额。
// 只有定义了内圈的区域符印才分段，其余（如荆棘藤蔓）整圈全额。
const AREA_INNER_RINGS = Object.freeze({
  starfall: Object.freeze({ radius: 35, mul: 0.7 }),
});

function dist2(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function innerRingOf(def, defId) {
  if (Object.hasOwn(AREA_INNER_RINGS, defId)) return AREA_INNER_RINGS[defId];
  if (Number.isFinite(def?.innerRadius) && def.innerRadius > 0) {
    return { radius: def.innerRadius, mul: Number.isFinite(def.innerMul) ? def.innerMul : 0.7 };
  }
  return null;
}

// 献祭辅助必须已解封、确实指向本格，且本格是已装符印的格子；
// 任何一条不满足都视为未装备，不扣护盾也不翻倍。
function sacrificeAt(grid, cellId) {
  const cell = grid.cells[cellId];
  if (!cell?.unlocked || cell.slot?.kind !== 'sigil') return null;
  for (const nb of neighborsOf(cellId, ORTHO_DIRS)) {
    const aux = grid.cells[nb.id];
    if (!aux?.unlocked || aux.slot?.kind !== 'auxiliary' || aux.slot.defId !== 'sacrifice') continue;
    if (aux.auxTarget === cellId) return aux;
  }
  return null;
}

// 命中目标确定后、扣血之前结算献祭：仅命中至少一个目标才扣，
// 一次触发只扣一次；护盾不足或数值非法时原样返回，不写入非法值。
function spendSacrifice(grid, cellId, state, hitTargets) {
  const idle = { mult: 1, spent: 0, applied: false };
  if (!Array.isArray(hitTargets) || hitTargets.length === 0) return idle;
  if (!sacrificeAt(grid, cellId)) return idle;
  const player = state?.player;
  const shield = player?.shield;
  if (!Number.isFinite(shield) || shield < SACRIFICE_SHIELD_COST) return idle;
  player.shield = shield - SACRIFICE_SHIELD_COST;
  return { mult: SACRIFICE_DAMAGE_MUL, spent: SACRIFICE_SHIELD_COST, applied: true };
}

// 本格伤害倍率：铭文与誓约，全部乘算
export function damageMultiplier(grid, cellId, state) {
  const cell = grid.cells[cellId];
  let mul = 1;
  if (cell.runes.includes("forge")) mul *= 1.5;
  const oath = state && state.oath;
  if (oath === "lone_star") {
    const nbs = neighborsOf(cellId, ORTHO_DIRS);
    if (nbs.every((n) => !grid.cells[n.id].slot)) mul *= 1.5;
  } else if (oath === "watcher") {
    const nbs = neighborsOf(cellId, ORTHO_DIRS);
    if (nbs.length > 0 && nbs.every((n) => !!grid.cells[n.id].slot)) mul *= 1.4;
  } else if (oath === "martyr") {
    const p = state && state.player;
    if (p && p.hp / p.maxHp < 0.4) mul *= 1.3;
  }
  return mul;
}

export function applyDamage(enemy, amount) {
  if (!enemy?.alive || !Number.isFinite(enemy.hp) || !Number.isFinite(amount) || amount < 0) return 0;
  const armor = Number.isFinite(enemy.armor) ? Math.max(0, Math.min(1, enemy.armor)) : 0;
  const real = Math.min(Math.max(0, enemy.hp), amount * (1 - armor));
  enemy.hp = Math.max(0, enemy.hp - real);
  if (enemy.hp === 0) enemy.alive = false;
  return real;
}

// 结算一次符印触发，返回命中数与总伤害，供统计与表现使用。
// 返回结构在原有 hits/damage/aim/empty/targets 之上追加献祭结算标记：
// sacrificeSpent 为本次扣除的护盾（8 或 0），sacrificeApplied 表示本次伤害是否翻倍。
export function resolveSigilTrigger({ grid, cellId, defId, state, enemies, half, aimPoint }) {
  const def = Object.hasOwn(SIGIL_DEFS, defId) ? SIGIL_DEFS[defId] : null;
  const cell = grid.cells[cellId];
  if (!def || !cell || cell.mutedOutput) {
    return { hits: 0, damage: 0, aim: null, empty: true, targets: [], sacrificeSpent: 0, sacrificeApplied: false };
  }

  const player = state.player;
  const selectTarget = () => {
    if (!aimPoint) return resolveTarget(cellId, player, enemies, half);
    // 命中判定半径放宽到 28px：弹丸落点有轻微追踪，仍然允许侧身闪避
    const target = enemies.filter(e => e.alive && dist2(e, aimPoint) <= 28 * 28)
      .sort((a, b) => dist2(a, aimPoint) - dist2(b, aimPoint) || a.id - b.id)[0] ?? null;
    return { target, aim: { ...aimPoint }, empty: !target };
  };
  const mul = damageMultiplier(grid, cellId, state) * (state.buffMul ?? 1);
  const base = def.damage * mul;
  const targets = [];
  let total = 0;

  if (def.kind === "single") {
    const t = selectTarget();
    const hitList = t.target ? [t.target] : [];
    const sac = spendSacrifice(grid, cellId, state, hitList);
    if (t.target) {
      total += applyDamage(t.target, base * sac.mult);
      targets.push(t.target);
      if (def.slow) {
        t.target.slowUntil = state.now + def.slowMs;
        t.target.slowFactor = 1 - def.slow;
      }
      if (def.armorBonus && t.target.armor > 0) {
        total += applyDamage(t.target, base * def.armorBonus * sac.mult);
      }
    }
    if (def.heal) state.player.hp = Math.min(state.player.maxHp, state.player.hp + def.heal);
    return { hits: targets.length, damage: total, aim: t.aim, empty: t.empty, targets, sacrificeSpent: sac.spent, sacrificeApplied: sac.applied };
  }

  if (def.kind === "fan3") {
    const t = selectTarget();
    const pool = enemies.filter((e) => e.alive && dist2(e, t.aim) <= 50 * 50).sort((a, b) => dist2(a, t.aim) - dist2(b, t.aim) || a.id - b.id).slice(0, 3);
    const sac = spendSacrifice(grid, cellId, state, pool);
    for (const e of pool) {
      total += applyDamage(e, base * sac.mult);
      targets.push(e);
    }
    return { hits: targets.length, damage: total, aim: t.aim, empty: targets.length === 0, targets, sacrificeSpent: sac.spent, sacrificeApplied: sac.applied };
  }

  if (def.kind === "ward") {
    const r2 = def.radius * def.radius;
    const hitList = enemies.filter((e) => e.alive && dist2(e, player) <= r2);
    // 献祭按触发瞬间的护盾判定，先扣费再结算本格护盾与伤害。
    const sac = spendSacrifice(grid, cellId, state, hitList);
    state.player.shield = Math.min(def.shieldCap, (state.player.shield || 0) + def.shield);
    for (const e of hitList) {
      total += applyDamage(e, base * sac.mult);
      targets.push(e);
    }
    return { hits: targets.length, damage: total, aim: { x: player.x, y: player.y }, empty: targets.length === 0, targets, sacrificeSpent: sac.spent, sacrificeApplied: sac.applied };
  }

  // area：以区域目标点为中心的范围伤害；星陨按目标到落点的距离分内圈/外圈。
  const t = selectTarget();
  const r2 = def.radius * def.radius;
  const inner = innerRingOf(def, defId);
  const innerR2 = inner ? inner.radius * inner.radius : -1;
  const hitList = enemies.filter((e) => e.alive && dist2(e, t.aim) <= r2);
  const sac = spendSacrifice(grid, cellId, state, hitList);
  for (const e of hitList) {
    const factor = inner && dist2(e, t.aim) <= innerR2 ? inner.mul : 1;
    total += applyDamage(e, base * sac.mult * factor);
    targets.push(e);
    if (def.rootMs) e.rootUntil = state.now + def.rootMs;
  }
  return { hits: targets.length, damage: total, aim: t.aim, empty: targets.length === 0, targets, sacrificeSpent: sac.spent, sacrificeApplied: sac.applied };
}

// 联组成立时的追加结算：对组内各格追加一次按比例的伤害
export function resolveComboBonus({ grid, order, bonus, state, enemies, half, defId }) {
  let total = 0;
  let hits = 0;
  if (!Number.isFinite(bonus) || bonus < 0) return { hits, damage: total };
  const rewarded = defId === 'line3' ? order.slice(-1) : order;
  for (const cellId of rewarded) {
    const cell = grid.cells[cellId];
    if (!cell.slot || cell.slot.kind !== "sigil") continue;
    const def = SIGIL_DEFS[cell.slot.defId];
    if (!def) continue;
    const mul = damageMultiplier(grid, cellId, state);
    const t = resolveTarget(cellId, state.player, enemies, half);
    if (t.target) {
      total += applyDamage(t.target, def.damage * mul * bonus);
      hits++;
    }
  }
  return { hits, damage: total };
}
