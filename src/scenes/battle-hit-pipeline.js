// 法术命中管线：结算、受击反馈、尸爆连锁、击杀收集、前摇排队与到点。
// 从 BattleScene 迁出（2026-11-19 架构重构波 3）。场景方法保留同名一行委托；
// 跨模块调用一律走 scene.xxx()，不互相 import。
import { C, HEX } from '../ui/Palette.js';
import { cellCenter } from '../ui/SigilBoard.js';
import { SIGIL_DEFS, resolveSigilTrigger, resolveDeathBursts, castTimeOf } from '../logic/effects.js';
import { sfx } from '../audio/Sfx.js';

export function applySigil(scene, cellId, defId, aimPoint, impactAngle = null) {
  // 防御：没有格号的弹丸（调试/压测里手工造出来的）不能把整局打崩
  const cell = scene.grid.cells[cellId];
  if (!cell) {
    return { hits: 0, damage: 0, aim: null, empty: true, targets: [], sacrificeSpent: 0, sacrificeApplied: false };
  }
  // 清掉上一轮的伤害读数：applyDamage 会把这一下真实扣血写回 enemy.lastHitAmount。
  // lastBlocked 也清零，避免 applyDamage 早退（已死/非法伤害）时残留上一发的护盾火花。
  for (const e of scene.enemies) {
    e.lastHitAmount = 0;
    e.lastBlocked = 0;
  }
  // 召唤物的读数一起清（它们走同一套 onEnemyHit 反馈，但不进敌人列表）
  for (const s of scene.summons ?? []) {
    if (!s) continue;
    s.lastHitAmount = 0;
    s.lastBlocked = 0;
  }
  const view = scene.viewRect();
  // 召唤物也能被法术选中/打掉：只在这一处把敌人列表换成「敌人 + 召唤物」，
  // 其余结算循环（经验/碎片/尸爆/连斩）仍只看 scene.enemies。
  const result = resolveSigilTrigger({ grid: scene.grid, cellId, defId, state: scene.combatState(), enemies: scene.combatTargets(), aimPoint, view });
  if (result.sacrificeApplied) {
    const c = cellCenter(cellId);
    scene.effects.text(c.x, c.y - 10, '献祭 -8盾 双倍', HEX.blood, true);
  }
  // 命中反馈：单体/护盾给逐目标小火花；范围/贯穿/连锁交给 spellImpact 的整片图案，
  // 否则一次扫 20 只会叠出 20 份描边，帧时间会崩。
  const visual = scene.sigilOf(cellId);
  const perTarget = result.targets.length <= 3;
  for (const enemy of result.targets) scene.onEnemyHit(enemy, aimPoint, impactAngle, visual, perTarget);
  scene.triggerDeathBursts();
  scene.collectDefeated();
  // 被法术打掉的召唤物：只做爆散，不给经验/碎片/尸爆种子（不进 collectDefeated）
  scene.sweepSummons();
  return result;
}

// 小怪受击：先算「这一下从哪来」，交给实体做后坐/挤压/闪白，再补火花与飘字。
// 公式与方向只在这里算一次，实体只负责表现，不改逻辑坐标（碰撞/索敌不受影响）。

export function onEnemyHit(scene, enemy, aimPoint, impactAngle, visual, detailed = true) {
  const now = scene.engine.now;
  const ax = Number.isFinite(aimPoint?.x) ? aimPoint.x : scene.player.x;
  const ay = Number.isFinite(aimPoint?.y) ? aimPoint.y : scene.player.y;
  let dx = enemy.x - ax;
  let dy = enemy.y - ay;
  if (Math.hypot(dx, dy) < 0.5) {
    const ang = Number.isFinite(impactAngle)
      ? impactAngle
      : Math.atan2(enemy.y - scene.player.y, enemy.x - scene.player.x);
    dx = Math.cos(ang);
    dy = Math.sin(ang);
  }
  const amount = Number.isFinite(enemy.lastHitAmount) ? enemy.lastHitAmount : 0;
  enemy.hitAt = now;
  enemy.hitReact?.(dx, dy, amount, now);
  // 护盾吸收：青钢色火花 + 金属音，和普通受击叠加（护盾档伤害时 amount=0，不会重复飘字）。
  // 放在 detailed 早退之前：低细节档（群伤）也要有「这只有盾」的反馈。
  if (Number.isFinite(enemy.lastBlocked) && enemy.lastBlocked > 0) {
    scene.effects.hitSpark(enemy.x, enemy.y, dx, dy, C.teal, 0.5);
    sfx.shieldHit();
  }
  if (!detailed) return;
  const color = visual?.color ?? C.arcane;
  scene.effects.hitSpark(enemy.x, enemy.y, dx, dy, color, enemy.hitPower ?? 0.6);
  if (amount > 0) {
    const heavy = enemy.maxHp > 0 && amount / enemy.maxHp >= 0.28;
    // 飘字落在头顶而不是脸前：视觉外框的 top 是负值（向上），素材怪比逻辑半径高得多
    const ext = enemy.viewExtent;
    const topOffset = ext && Number.isFinite(ext.top)
      ? Math.abs(ext.top) + 2
      : (Number.isFinite(enemy.radius) ? enemy.radius : 6) + 14;
    scene.effects.damageNumber(enemy.x, enemy.y - topOffset, amount, heavy ? HEX.brassLight : HEX.white, heavy);
  }
  scene.effects.impact(enemy.x, enemy.y, color, false);
}

// 割草连锁：被法术打死的怪炸开，按最大生命比例炸伤周围的怪；炸死的继续引爆（纯逻辑在 effects.js）。
// 奖励/经验/碎片统一走 onEnemyKilled，不在这里重复结算。

export function triggerDeathBursts(scene) {
  const seeds = scene.enemies.filter((e) => !e.alive && e.hp === 0 && !e.rewarded);
  if (!seeds.length) return 0;
  const burst = resolveDeathBursts({ enemies: scene.enemies, seeds, view: scene.viewRect() });
  // 连锁炸死 4 只以上给一层骨屑冲击（只画在第一个爆点，避免满屏叠加）
  if (burst.killed >= 4) scene.effects.burst(seeds[0].x, seeds[0].y, C.bone, 6);
  return burst.killed;
}

// 破盾：碎片爆散 + 金属碎裂音 + 一次 ≤2px/120ms 的轻震屏。
// 由 Enemy.consumeShieldBreak 在 update 里只回调一次；这里不重复结算伤害/碎片。

export function collectDefeated(scene) {
  for (const enemy of [...scene.enemies]) if (!enemy.alive && enemy.hp === 0) scene.onEnemyKilled(enemy);
}


export function resolveProjectile(scene, p) {
  if (!Number.isInteger(p.cellId)) return;   // 没有格号的弹丸不结算，见 applySigil 的防御
  const impactAngle = Math.atan2(p.ty - p.sy, p.tx - p.sx);
  // 有前摇的法术：先亮预警圈，castMs 后再真正结算（弹丸这一下已经飞到了，等的是「落点要爆」）
  scene.queueOrCommit(p.cellId, p.def.id, { x: p.tx, y: p.ty }, impactAngle);
}

// 前摇统一入口：castMs > 0 只排队 + 预警，否则立刻结算。

export function queueOrCommit(scene, cellId, defId, point, angle) {
  const def = SIGIL_DEFS[defId];
  const castMs = castTimeOf(defId);
  if (castMs > 0) {
    scene.pendingCasts.push({ cellId, defId, x: point.x, y: point.y, angle, at: scene.engine.now + castMs });
    scene.effects.telegraph(point.x, point.y, castMs, def.color, def.radius ?? 46);
    return null;
  }
  return scene.commitSigil(cellId, defId, point, angle);
}

// 真正结算一次命中 + 播全部命中表现。resolveProjectile 与前摇到点都走这里，保证两路表现一致。

export function commitSigil(scene, cellId, defId, point, angle) {
  const result = scene.applySigil(cellId, defId, point, angle);
  const def = SIGIL_DEFS[defId];
  const radius = Number.isFinite(def?.radius) ? def.radius
    : defId === 'meteor_judgment' ? 95
      : defId === 'quake_maw' ? 80
        : defId === 'starfall' ? 70
          : 14;
  scene.effects.spellImpact(defId, point.x, point.y, radius, angle);
  scene.spellPunch(defId, point.x, point.y, radius, angle);
  scene.spellLinkFx(defId, {}, result);
  scene.reactionFx({ tx: point.x, ty: point.y }, result);
  if (!result.hits) scene.effects.impact(point.x, point.y, def?.color ?? C.arcane, true);
  return result;
}

// 前摇到点：engine.now 到 at 才结算。暂停/顿帧时 engine.now 不走，前摇自然停住。

export function tickPendingCasts(scene) {
  if (!scene.pendingCasts?.length) return;
  const now = scene.engine.now;
  const due = scene.pendingCasts.filter(cast => now >= cast.at);
  if (!due.length) return;
  scene.pendingCasts = scene.pendingCasts.filter(cast => now < cast.at);
  for (const cast of due) scene.commitSigil(cast.cellId, cast.defId, { x: cast.x, y: cast.y }, cast.angle);
}

// 命中重量：按法术分级震屏，重击额外给短顿帧。同法术 gapMs 内只吃一次，
// 否则一刀扫 3 只会把震屏叠成连续抖动，反而糊。
