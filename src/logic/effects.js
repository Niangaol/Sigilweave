// 效果结算层：把「触发」翻译成伤害、护盾、减速等实际后果。
// 纯逻辑，不依赖 Phaser，可在 Node 里单测。
import { resolveTarget, visibleFilter } from './sector.js';
import { ORTHO_DIRS } from './constants.js';
import { neighborsOf } from './grid.js';
import { reactionAt, resonanceMultiplier } from './resonance.js';
import { UNDEAD_OR_CORRUPT } from '../data/factions.js';
import { evoModsOf, evolutionOf } from '../data/evolutions.js';
import { groupLinkage, linkageReady, markLinkage } from './linkage.js';

import { SIGIL_DEFS, AUX_DEFS, RUNE_DEFS, OATH_DEFS } from '../data/cards.js';
export { SIGIL_DEFS, AUX_DEFS, RUNE_DEFS, OATH_DEFS };

const SACRIFICE_SHIELD_COST = 8;
const SACRIFICE_DAMAGE_MUL = 2;

// 罗盘「扩域环带」的命中范围加成：单位像素。
// 只接受非负有限值，避免 NaN / Infinity / 负数污染半径计算。
function hitBonusOf(state) {
  const value = state && state.hitBonus;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function radiusWithBonus(base, bonus) {
  const safeBase = Number.isFinite(base) ? Math.max(0, base) : 0;
  return safeBase + bonus;
}

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
  // 同派系正交相邻共鸣：每邻 +10%，封顶 +30%。
  mul *= resonanceMultiplier(grid, cellId);
  // 进化路线的伤害倍率（slot.evo）
  const slot = grid.cells[cellId]?.slot;
  if (slot?.kind === 'sigil') mul *= evolutionOf(slot.defId, slot.evo)?.mods?.damageMul ?? 1;
  return mul;
}

export function applyDamage(enemy, amount, now) {
  if (!enemy?.alive || !Number.isFinite(enemy.hp) || !Number.isFinite(amount) || amount < 0) return 0;
  // 融化易伤：结算带当前时刻时，2 秒窗口内的目标多受 15%。不传 now 的旧调用完全走原路径。
  const vuln = Number.isFinite(now) && now < (enemy.vulnUntil ?? 0) ? (enemy.vulnFactor ?? 1) : 1;
  // 一次性护盾：固定顺序「盾 → 甲 → 血」。
  // 盾先吃掉最多 amount 点伤害；缺省/非有限/≤0 的 shield 直接跳过，完全走原护甲路径。
  let remaining = amount * vuln;
  let blocked = 0;
  const shield = Number.isFinite(enemy.shield) ? Math.max(0, enemy.shield) : 0;
  if (shield > 0) {
    blocked = Math.min(shield, remaining);
    enemy.shield = shield - blocked;
    remaining -= blocked;
    // 只置标记：破盾眩晕/碎片/回调统一由 Enemy.update 消费，本层不做表现。
    if (enemy.shield <= 0) enemy.shieldBrokenPending = true;
  }
  // 表现层只读字段：这一下被盾吸收的伤害（不参与结算）。
  enemy.lastBlocked = blocked;
  const armor = Number.isFinite(enemy.armor) ? Math.max(0, Math.min(1, enemy.armor)) : 0;
  const real = Math.min(Math.max(0, enemy.hp), remaining * (1 - armor));
  enemy.hp = Math.max(0, enemy.hp - real);
  // 表现层只读字段：这一下实际扣了多少血，供受击动画飘伤害数字（不参与任何结算）。
  enemy.lastHitAmount = real;
  if (enemy.hp === 0) enemy.alive = false;
  return real;
}

// 前摇时长：数据层唯一口径。0 表示瞬发；BattleScene 用 queueOrCommit 决定排队还是立刻结算。
export function castTimeOf(defId) {
  const ms = SIGIL_DEFS[defId]?.castMs;
  return Number.isFinite(ms) && ms > 0 ? ms : 0;
}

// 结算一次符印触发，返回命中数与总伤害，供统计与表现使用。
// 返回结构在原有 hits/damage/aim/empty/targets 之上追加献祭结算标记：
// sacrificeSpent 为本次扣除的护盾（8 或 0），sacrificeApplied 表示本次伤害是否翻倍。
function resolveSigilTriggerCore({ grid, cellId, defId, state, enemies, aimPoint, view }) {
  const def = Object.hasOwn(SIGIL_DEFS, defId) ? SIGIL_DEFS[defId] : null;
  const cell = grid.cells[cellId];
  if (!def || !cell || cell.mutedOutput) {
    return { hits: 0, damage: 0, aim: null, empty: true, targets: [], sacrificeSpent: 0, sacrificeApplied: false };
  }

  const player = state.player;
  const hitBonus = hitBonusOf(state);
  const evo = evoModsOf(cell.slot);
  // 屏幕可见性：所有命中候选都必须真的在镜头里（弹丸落点、扇形、扩散、贯穿、连锁、反弹）。
  // 这样即使弹丸飞行途中怪走出屏幕，也不会在屏外结算伤害。
  const screenView = view ?? state?.view;
  const visible = visibleFilter(screenView);
  // 落点单体命中半径：基础 28px + 罗盘命中加成
  const aimHitRadius = 28 + hitBonus;
  const selectTarget = () => {
    if (!aimPoint) return resolveTarget(cellId, player, enemies, { view: screenView });
    // 命中判定半径放宽：弹丸落点有轻微追踪，仍然允许侧身闪避
    const target = enemies.filter(e => e.alive && visible(e) && dist2(e, aimPoint) <= aimHitRadius * aimHitRadius)
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
      total += applyDamage(t.target, base * sac.mult, state.now);
      targets.push(t.target);
      const slow = evo?.slow ?? def.slow;
      if (slow) {
        t.target.slowUntil = state.now + (evo?.slowMs ?? def.slowMs);
        t.target.slowFactor = 1 - slow;
      }
      const armorBonus = evo?.armorBonus ?? def.armorBonus;
      if (armorBonus && t.target.armor > 0) {
        total += applyDamage(t.target, base * armorBonus * sac.mult, state.now);
      }
      total += applyEvoStatus(t.target, evo, base, state.now);
    }
    const heal = (def.heal ?? 0) + (evo?.heal ?? 0);
    if (heal) state.player.hp = Math.min(state.player.maxHp, state.player.hp + heal);
    return { hits: targets.length, damage: total, aim: t.aim, empty: t.empty, targets, sacrificeSpent: sac.spent, sacrificeApplied: sac.applied };
  }

  if (def.kind === "fan3") {
    const t = selectTarget();
    // 扇形三连的扩散半径：基础 50px + 罗盘命中加成
    const fanRadius = 50 + (evo?.fanRadius ?? 0) + hitBonus;
    const pool = enemies.filter((e) => e.alive && visible(e) && dist2(e, t.aim) <= fanRadius * fanRadius).sort((a, b) => dist2(a, t.aim) - dist2(b, t.aim) || a.id - b.id).slice(0, 3);
    const sac = spendSacrifice(grid, cellId, state, pool);
    for (const e of pool) {
      total += applyDamage(e, base * sac.mult, state.now);
      targets.push(e);
      // 扇形类也可以带减速（余烬扇），与单体分支保持同一套减速语义
      const slow = evo?.slow ?? def.slow;
      if (slow) {
        e.slowUntil = state.now + (evo?.slowMs ?? def.slowMs);
        e.slowFactor = 1 - slow;
      }
      total += applyEvoStatus(e, evo, base, state.now);
    }
    return { hits: targets.length, damage: total, aim: t.aim, empty: targets.length === 0, targets, sacrificeSpent: sac.spent, sacrificeApplied: sac.applied };
  }

  if (def.kind === "ward") {
    // 护盾类范围同样吃到命中范围加成；护盾上限优先读人物宝箱写回的 player.shieldCap
    const wardRadius = radiusWithBonus((def.radius ?? 0) + (evo?.radius ?? 0), hitBonus);
    const r2 = wardRadius * wardRadius;
    const hitList = enemies.filter((e) => e.alive && visible(e) && dist2(e, player) <= r2);
    // 献祭按触发瞬间的护盾判定，先扣费再结算本格护盾与伤害。
    const sac = spendSacrifice(grid, cellId, state, hitList);
    const playerCap = state.player.shieldCap;
    const cap = Number.isFinite(playerCap) && playerCap >= 0 ? playerCap : def.shieldCap;
    const currentShield = Number.isFinite(state.player.shield) && state.player.shield > 0
      ? state.player.shield
      : 0;
    state.player.shield = Math.min(cap + (evo?.shieldCap ?? 0), currentShield + (def.shield ?? 0) + (evo?.shield ?? 0));
    for (const e of hitList) {
      total += applyDamage(e, base * sac.mult, state.now);
      targets.push(e);
      total += applyEvoStatus(e, evo, base, state.now);
    }
    return { hits: targets.length, damage: total, aim: { x: player.x, y: player.y }, empty: targets.length === 0, targets, sacrificeSpent: sac.spent, sacrificeApplied: sac.applied };
  }

  // chain：命中后向附近最近的敌人跳跃，逐跳衰减；同一目标不重复命中。
  if (def.kind === "chain") {
    const t = selectTarget();
    const jumpR = Number.isFinite(def.jumpRadius) ? Math.max(0, def.jumpRadius) : 88;
    const jumpR2 = jumpR * jumpR;
    const jumps = (Number.isFinite(def.jumps) ? Math.max(0, Math.floor(def.jumps)) : 2) + (evo?.jumps ?? 0);
    const maxHits = 1 + jumps;
    const decay = Number.isFinite(evo?.decay) ? Math.max(0, evo.decay)
      : (Number.isFinite(def.decay) ? Math.max(0, def.decay) : 0.7);
    const chain = [];
    const used = new Set();
    let cur = t.target;
    while (cur && chain.length < maxHits) {
      chain.push(cur);
      used.add(cur.id);
      let next = null;
      let nd = Infinity;
      for (const e of enemies) {
        if (!e.alive || used.has(e.id) || !visible(e)) continue;
        const d = dist2(e, cur);
        if (d > jumpR2) continue;
        if (d < nd || (d === nd && next && e.id < next.id)) { nd = d; next = e; }
      }
      cur = next;
    }
    const sac = spendSacrifice(grid, cellId, state, chain);
    chain.forEach((e, i) => {
      total += applyDamage(e, base * sac.mult * Math.pow(decay, i), state.now);
      targets.push(e);
      total += applyEvoStatus(e, evo, base, state.now);
    });
    return { hits: targets.length, damage: total, aim: t.aim, empty: targets.length === 0, targets, sacrificeSpent: sac.spent, sacrificeApplied: sac.applied };
  }

  // pierce：沿「玩家 -> 落点」这条直线贯穿，命中走廊内的全部敌人，按距离由近到远。
  if (def.kind === "pierce") {
    const t = selectTarget();
    const dx = t.aim.x - player.x;
    const dy = t.aim.y - player.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const reach = (Number.isFinite(def.length) ? Math.max(0, def.length) : 420) + (evo?.length ?? 0);
    const halfW = ((Number.isFinite(def.width) ? Math.max(0, def.width) : 28) + (evo?.width ?? 0)) / 2 + hitBonus / 2;
    const hitList = enemies.filter((e) => {
      if (!e.alive || !visible(e)) return false;
      const px = e.x - player.x;
      const py = e.y - player.y;
      const along = px * ux + py * uy;
      if (along < 0 || along > reach) return false;
      return Math.abs(px * uy - py * ux) <= halfW;
    }).sort((a, b) => dist2(a, player) - dist2(b, player) || a.id - b.id);
    const sac = spendSacrifice(grid, cellId, state, hitList);
    for (const e of hitList) {
      total += applyDamage(e, base * sac.mult, state.now);
      targets.push(e);
      const slow = evo?.slow ?? def.slow;
      if (slow) {
        e.slowUntil = state.now + (evo?.slowMs ?? def.slowMs);
        e.slowFactor = 1 - slow;
      }
      total += applyEvoStatus(e, evo, base, state.now);
    }
    return { hits: targets.length, damage: total, aim: t.aim, empty: targets.length === 0, targets, sacrificeSpent: sac.spent, sacrificeApplied: sac.applied };
  }

  // echo：本格扇区与对侧扇区（15-id）各打最近的一个，同一敌人只结算一次。
  if (def.kind === "echo") {
    const own = resolveTarget(cellId, player, enemies, { view: screenView });
    const mirror = resolveTarget(15 - cellId, player, enemies, { assist: false, view: screenView });
    const hitList = [];
    for (const cand of [own.target, mirror.target]) {
      if (!cand || !cand.alive) continue;
      if (hitList.some((e) => e.id === cand.id)) continue;
      hitList.push(cand);
    }
    const sac = spendSacrifice(grid, cellId, state, hitList);
    for (const e of hitList) {
      total += applyDamage(e, base * sac.mult, state.now);
      targets.push(e);
      total += applyEvoStatus(e, evo, base, state.now);
    }
    const aim = own.target ? { x: own.target.x, y: own.target.y } : own.aim;
    return { hits: targets.length, damage: total, aim, empty: targets.length === 0, targets, sacrificeSpent: sac.spent, sacrificeApplied: sac.applied };
  }

  // nova：以玩家为圆心的环形爆发，不吃落点（霜华新星）。
  if (def.kind === "nova") {
    const novaRadius = radiusWithBonus((def.radius ?? 0) + (evo?.radius ?? 0), hitBonus);
    const novaR2 = novaRadius * novaRadius;
    const hitList = enemies.filter((e) => e.alive && visible(e) && dist2(e, player) <= novaR2);
    const sac = spendSacrifice(grid, cellId, state, hitList);
    for (const e of hitList) {
      total += applyDamage(e, base * sac.mult, state.now);
      targets.push(e);
      const slow = evo?.slow ?? def.slow;
      if (slow) {
        e.slowUntil = state.now + (evo?.slowMs ?? def.slowMs);
        e.slowFactor = 1 - slow;
      }
      const freeze = evo?.freezeMs ?? def.freezeMs;
      if (freeze) e.frozenUntil = Math.max(e.frozenUntil ?? 0, state.now + freeze);
      total += applyEvoStatus(e, evo, base, state.now);
    }
    return { hits: targets.length, damage: total, aim: { x: player.x, y: player.y }, empty: targets.length === 0, targets, sacrificeSpent: sac.spent, sacrificeApplied: sac.applied };
  }

  // area：以区域目标点为中心的范围伤害；星陨按目标到落点的距离分内圈/外圈。
  const t = selectTarget();
  // 范围半径：基础 def.radius + 罗盘命中加成
  const areaRadius = radiusWithBonus((def.radius ?? 0) + (evo?.radius ?? 0), hitBonus);
  const r2 = areaRadius * areaRadius;
  const inner = innerRingOf(def, defId);
  if (inner && Number.isFinite(evo?.innerMul)) inner.mul = evo.innerMul;
  const innerR2 = inner ? inner.radius * inner.radius : -1;
  const hitList = enemies.filter((e) => e.alive && visible(e) && dist2(e, t.aim) <= r2);
  const sac = spendSacrifice(grid, cellId, state, hitList);
  for (const e of hitList) {
    const factor = inner && dist2(e, t.aim) <= innerR2 ? inner.mul : 1;
    total += applyDamage(e, base * sac.mult * factor, state.now);
    targets.push(e);
    const rootMs = evo?.rootMs ?? def.rootMs;
    if (rootMs) e.rootUntil = state.now + rootMs;
    const freeze = evo?.freezeMs ?? def.freezeMs;
    if (freeze) e.frozenUntil = Math.max(e.frozenUntil ?? 0, state.now + freeze);
    total += applyEvoStatus(e, evo, base, state.now);
  }
  return { hits: targets.length, damage: total, aim: t.aim, empty: targets.length === 0, targets, sacrificeSpent: sac.spent, sacrificeApplied: sac.applied };
}

// ---------- 割草版「尸爆」：让密集怪群能被一次范围法术连环清掉 ----------
// 只由战斗层在结算完一次触发/联组后调用，不改 resolveSigilTrigger 的既有结算契约。
// 规则：被法术打死的敌人炸开，对半径内还活着的敌人造成「按目标最大生命比例」的真实伤害；
// 被炸死的敌人继续引爆（连锁），但同一只只爆一次、总命中数有上限，避免无限循环。
// damageRatio 默认 0.5：单次爆炸打不死同血量的怪，但同一片怪吃到两次就死 → 形成连锁清场。
export const DEATH_BURST = Object.freeze({ damageRatio: 0.5, radius: 30, maxHits: 80 });

export function resolveDeathBursts({
  enemies, seeds, damageRatio = DEATH_BURST.damageRatio,
  radius = DEATH_BURST.radius, maxHits = DEATH_BURST.maxHits, view,
} = {}) {
  const empty = { hits: 0, killed: 0, positions: [] };
  if (!Array.isArray(enemies) || !Array.isArray(seeds) || seeds.length === 0) return empty;
  const ratio = Number.isFinite(damageRatio) ? Math.min(2, Math.max(0, damageRatio)) : DEATH_BURST.damageRatio;
  const rad = Number.isFinite(radius) ? Math.max(0, radius) : DEATH_BURST.radius;
  const cap = Number.isFinite(maxHits) ? Math.max(0, Math.floor(maxHits)) : DEATH_BURST.maxHits;
  if (ratio === 0 || rad === 0 || cap === 0) return empty;

  const r2 = rad * rad;
  const exploded = new Set();
  const queue = [];
  for (const seed of seeds) {
    if (!seed || !Number.isFinite(seed.x) || !Number.isFinite(seed.y)) continue;
    if (seed.id !== undefined) {
      if (exploded.has(seed.id)) continue;
      exploded.add(seed.id);
    }
    queue.push({ x: seed.x, y: seed.y });
  }
  if (!queue.length) return empty;

  const positions = [];
  let hits = 0;
  let killed = 0;
  // 尸爆同样只伤屏幕内的怪：屏外怪不该被屏幕内的一次击杀带走
  const visible = visibleFilter(view);
  // 固定按 id 升序结算：同一次触发的爆炸顺序与结果可复现
  const ordered = enemies
    .filter((e) => e && Number.isFinite(e.x) && Number.isFinite(e.y))
    .sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

  for (let qi = 0; qi < queue.length && hits < cap; qi++) {
    const origin = queue[qi];
    for (const e of ordered) {
      if (hits >= cap) break;
      if (!e.alive || !visible(e) || !Number.isFinite(e.hp) || !Number.isFinite(e.maxHp)) continue;
      if (e.id !== undefined && exploded.has(e.id)) continue;
      const dx = e.x - origin.x;
      const dy = e.y - origin.y;
      if (dx * dx + dy * dy > r2) continue;
      const amount = Math.max(1, Math.ceil(e.maxHp * ratio));
      const wasAlive = e.hp > 0;
      applyDamage(e, amount);
      hits++;
      if (wasAlive && e.hp === 0) {
        killed++;
        positions.push({ x: e.x, y: e.y });
        if (e.id !== undefined) exploded.add(e.id);
        if (queue.length < cap) queue.push({ x: e.x, y: e.y });
      }
    }
  }
  return { hits, killed, positions };
}

// 一次触发的完整结算：先走原核心，再按派系组合补一层反应。
// 反应结果只追加到返回值的 reaction 字段，不改变 hits/targets 的原有语义。
export function resolveSigilTrigger(input) {
  return applyFactionReaction(input, resolveSigilTriggerCore(input));
}

const REACTION_COOLDOWN_MS = 2000;

function applyFactionReaction({ grid, cellId, defId, state, enemies }, result) {
  if (!result || result.empty || !Array.isArray(result.targets) || result.targets.length === 0) return result;
  const reaction = reactionAt(grid, cellId);
  if (!reaction) return result;
  const cell = grid.cells[cellId];
  const now = Number.isFinite(state?.now) ? state.now : 0;
  // 同一格 2 秒内只反应一次：脉流跳格很频繁，不冷却会每跳刷一次。
  if (Number.isFinite(cell.reactionUntil) && now < cell.reactionUntil) return result;
  cell.reactionUntil = now + REACTION_COOLDOWN_MS;

  const mul = damageMultiplier(grid, cellId, state) * (state?.buffMul ?? 1);
  const base = (SIGIL_DEFS[defId]?.damage ?? 0) * mul;
  const extra = [];
  let healed = 0;

  if (reaction.id === 'melt') {
    for (const e of result.targets) {
      e.vulnUntil = Math.max(e.vulnUntil ?? 0, now + reaction.vulnMs);
      e.vulnFactor = reaction.vulnFactor;
    }
  } else if (reaction.id === 'conduct') {
    for (const e of result.targets) e.frozenUntil = Math.max(e.frozenUntil ?? 0, now + reaction.freezeMs);
    // 补一跳：本批目标之外、离玩家最近的敌人
    const used = new Set(result.targets.map(e => e.id));
    let best = null;
    let bestD = Infinity;
    for (const e of enemies ?? []) {
      if (!e?.alive || used.has(e.id)) continue;
      const dx = e.x - (state?.player?.x ?? 0);
      const dy = e.y - (state?.player?.y ?? 0);
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = e; }
    }
    if (best) {
      result.damage = (result.damage ?? 0) + applyDamage(best, base * reaction.chainFactor, now);
      extra.push(best);
    }
  } else if (reaction.id === 'scorch') {
    const perTick = base * reaction.extraFactor / reaction.ticks;
    for (const e of result.targets) {
      for (let i = 0; i < reaction.ticks; i++) result.damage = (result.damage ?? 0) + applyDamage(e, perTick, now);
    }
  } else if (reaction.id === 'purify') {
    for (const e of result.targets) {
      if (!UNDEAD_OR_CORRUPT.includes(e.defId)) continue;
      result.damage = (result.damage ?? 0) + applyDamage(e, base * (reaction.undeadFactor - 1), now);
    }
    const player = state?.player;
    if (player && Number.isFinite(player.hp) && Number.isFinite(player.maxHp)) {
      const before = player.hp;
      player.hp = Math.min(player.maxHp, player.hp + reaction.heal);
      healed = player.hp - before;
    }
  }

  result.reaction = { id: reaction.id, name: reaction.name, extraTargets: extra, healed };
  return result;
}

// 进化附加状态：冻结/易伤/灼烧在命中后统一挂一次，避免每个分支各写一遍。
// 返回追加的灼烧伤害，调用方累加进 total。
function applyEvoStatus(target, evo, base, now) {
  if (!evo || !target) return 0;
  if (evo.freezeMs) target.frozenUntil = Math.max(target.frozenUntil ?? 0, now + evo.freezeMs);
  if (evo.vulnMs) {
    target.vulnUntil = Math.max(target.vulnUntil ?? 0, now + evo.vulnMs);
    target.vulnFactor = evo.vulnFactor ?? 1.15;
  }
  return evo.burnFactor ? applyDamage(target, base * evo.burnFactor, now) : 0;
}

// 联组成立时的追加结算：对组内各格追加一次按比例的伤害
export function resolveComboBonus({ grid, order, bonus, state, enemies, defId }) {
  let total = 0;
  let hits = 0;
  const targets = [];
  if (!Number.isFinite(bonus) || bonus < 0) return { hits, damage: total, targets };
  // 专属连携：组内出现配对的两种法术时，两格各追加一笔「连携伤害」（同对 1.5 秒冷却）。
  const pairInfo = groupLinkage(grid, order);
  const linkage = pairInfo && linkageReady(state, pairInfo.pair.a, pairInfo.pair.b)
    ? { id: pairInfo.pair.id, name: pairInfo.pair.name, damage: 0, targets: [] }
    : null;
  if (linkage) {
    for (const cellId of [pairInfo.aCell, pairInfo.bCell]) {
      const cell = grid.cells[cellId];
      const def = SIGIL_DEFS[cell?.slot?.defId];
      if (!def) continue;
      const t = resolveTarget(cellId, state.player, enemies, { view: state?.view });
      if (t.target) {
        const dmg = applyDamage(t.target, def.damage * damageMultiplier(grid, cellId, state) * pairInfo.pair.bonus, state.now);
        total += dmg;
        linkage.damage += dmg;
        linkage.targets.push(t.target);
      }
    }
    markLinkage(state, pairInfo.pair.a, pairInfo.pair.b);
  }

  const rewarded = defId === 'line3' ? order.slice(-1) : order;
  for (const cellId of rewarded) {
    const cell = grid.cells[cellId];
    if (!cell.slot || cell.slot.kind !== "sigil") continue;
    const def = SIGIL_DEFS[cell.slot.defId];
    if (!def) continue;
    const mul = damageMultiplier(grid, cellId, state);
    const t = resolveTarget(cellId, state.player, enemies, { view: state?.view });
    if (t.target) {
      total += applyDamage(t.target, def.damage * mul * bonus, state.now);
      hits++;
      targets.push(t.target);
    }
  }
  return { hits, damage: total, targets, linkage };
}
