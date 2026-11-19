// 敌方弹幕与召唤物：入弹/推进/命中/受击结算、炮台与符文的入场、推进、引爆、绘制。
// 从 BattleScene 迁出（2026-11-19 架构重构波 3）。场景方法保留同名一行委托；
// 推进逻辑全在 logic/hostile.js，这里只做受击结算与表现。
import { C, pxRect, pxDiamond, pxRing } from '../ui/Palette.js';
import { HOSTILE_LIMITS, stepHostileShots, stepSummons, makeShot, normalizeSummon } from '../logic/hostile.js';
import { bossControlFor } from '../data/boss-phases.js';
import { DEFAULT_SHOT_CONTROL } from '../data/control.js';
import { drawHostileShot } from '../ui/hostile-draw.js';
import { sfx } from '../audio/Sfx.js';

export function addHostileShot(scene, shot) {
  if (!shot || scene.bossDefeated) return;
  const shots = Array.isArray(scene.hostileShots) ? scene.hostileShots : (scene.hostileShots = []);
  // 上限 96（spec §5.1：64 → 96），超限直接丢弃新弹，不抢占场上已有的弹
  if (shots.length >= HOSTILE_LIMITS.shots) return;
  shots.push({ ...shot });
  sfx.enemyShot();
}

export function updateHostileShots(scene, dt) {
  // 推进/命中/出界/寿命/上限全部在 hostile.js；这里只做受击结算与绘制。
  // 测试假场景可能没有 summons/summonG，此处不假设它们存在。
  const shots = Array.isArray(scene.hostileShots) ? scene.hostileShots : (scene.hostileShots = []);
  const result = stepHostileShots(shots, {
    dtMs: dt,
    player: scene.player,
    world: scene.world,
    maxShots: HOSTILE_LIMITS.shots,
  });
  scene.hostileShots = result.list;
  for (const hit of result.hits) {
    // 命中只走玩家 takeDamage（含 1400ms 无敌帧），命中反馈与旧版一致
    if (typeof scene.player?.takeDamage !== 'function') continue;
    if (scene.player.takeDamage(hit.damage, scene.engine?.now ?? 0)) {
      scene.effects?.hurt?.();
      scene.effects?.impact?.(hit.x, hit.y, C.blood, true);
      sfx.hurt();
      // B5 硬控分流：只有 Boss 大招弹带 fromBoss，挂该场专属控制；
      // 普通弹（含阶段倍率放大后的）仍走全场统一的轻迟滞。
      // 不按 fromBoss 一刀切，是因为普通 Boss 弹若跳过 DEFAULT_SHOT_CONTROL
      // 又在场 1/2 拿不到 bossControlFor（那两场为 null），等于完全没有控制。
      if (hit.fromBoss === true) {
        const cfg = scene.boss ? bossControlFor(scene.stage) : null;
        if (cfg) scene.applyPlayerControl(cfg, hit.x, hit.y, scene.engine?.now ?? 0);
      } else {
        scene.applyPlayerControl?.(DEFAULT_SHOT_CONTROL, hit.x, hit.y, scene.engine?.now ?? 0);
      }
    }
  }
  const g = scene.hostileG;
  if (!g) return;
  g.clear();
  for (const shot of scene.hostileShots) drawHostileShot(g, shot);
}

// 可被法术选中的目标：敌人 + 召唤物。只传给 resolveSigilTrigger 的 enemies 参数；
// 经验/碎片/尸爆/连斩等结算循环仍只看 scene.enemies，召唤物永远不算击杀。

export function combatTargets(scene) {
  const enemies = Array.isArray(scene.enemies) ? scene.enemies : [];
  const summons = Array.isArray(scene.summons) ? scene.summons : [];
  return enemies.concat(summons);
}

// 敌方召唤物入场：全场上限 20、跨列表炮台 12 / 符文 8、同一 owner 同时 1 个。
// 入列前 normalizeSummon 并分配负数 id（与敌人正 id 不冲突）；被拒绝时不产生任何表现。

export function addEnemySummon(scene, enemy, spec) {
  if (!spec || scene.bossDefeated) return null;
  const list = Array.isArray(scene.summons) ? scene.summons : (scene.summons = []);
  if (list.length >= HOSTILE_LIMITS.summons) return null;
  const kind = spec.kind === 'rune' ? 'rune' : 'turret';
  // owner 可能是数字 id 或字符串键（enemy-ai 两种都允许），只认非空值
  const hasOwner = (typeof spec.owner === 'string' && spec.owner.length > 0) || Number.isFinite(spec.owner);
  const owner = hasOwner ? spec.owner : (Number.isFinite(enemy?.id) ? enemy.id : -1);
  const cap = kind === 'rune' ? HOSTILE_LIMITS.rune : HOSTILE_LIMITS.turret;
  let sameKind = 0;
  let ownerBusy = false;
  for (const s of list) {
    if (!s || s.alive === false) continue;
    if (s.kind === kind) sameKind++;
    const sHasOwner = (typeof s.owner === 'string' && s.owner.length > 0) || Number.isFinite(s.owner);
    const sOwner = sHasOwner ? s.owner : -1;
    if (sOwner === owner) ownerBusy = true;
  }
  if (sameKind >= cap || ownerBusy) return null;
  // 炮台弹伤 = 召唤者伤害 ×0.6（hostile.js 明确不在这里打折，由场景侧折算一次）；
  // T2 若已在事件里给了折算后的 damage，就直接用，绝不二次乘。
  const fallbackDamage = Math.max(1, Math.round((enemy?.damage ?? enemy?.baseDamage ?? 6) * (kind === 'turret' ? 0.6 : 1)));
  const damage = Number.isFinite(spec.damage) && spec.damage > 0 ? spec.damage : fallbackDamage;
  scene.summonsSeq = Number.isFinite(scene.summonsSeq) ? scene.summonsSeq : -1;
  const summon = normalizeSummon({
    ...spec,
    kind,
    owner,
    id: scene.summonsSeq--,
    damage,
    def: {
      id: kind === 'rune' ? 'summon_rune' : 'summon_turret',
      color: spec.def?.color ?? (kind === 'rune' ? C.blood : C.arcane),
    },
    lastHitAmount: 0,
    lastBlocked: 0,
  });
  summon.lifeMax = summon.lifeMs;
  list.push(summon);
  scene.effects?.summonPulse?.(summon.x, summon.y, kind, summon.def.color);
  sfx.summon();
  return summon;
}

// 召唤物每帧：先兜底清扫死亡（stepSummons 会静默丢弃 dead 项，不扫就丢表现），
// 再推进（炮台弹并入 hostileShots、符文引信产出 detonations），最后单批绘制。

export function updateSummons(scene, dt) {
  scene.sweepSummons();
  const summons = Array.isArray(scene.summons) ? scene.summons : (scene.summons = []);
  const result = stepSummons(summons, {
    dtMs: dt,
    player: scene.player,
    world: scene.world,
    maxShots: HOSTILE_LIMITS.shots,
  });
  scene.summons = result.list;
  for (const shot of result.shots) scene.addHostileShot(shot);
  for (const det of result.detonations) scene.detonateRune(det);
  scene.drawSummons();
}

// 死亡扫描：applySigil 命中后 / 每帧推进前各兜底一次。
// 召唤物死亡只做爆散表现，不给经验/碎片/掉落，也不进 collectDefeated。

export function sweepSummons(scene) {
  const list = scene.summons;
  if (!Array.isArray(list) || !list.length) return 0;
  let removed = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    const summon = list[i];
    if (summon && summon.alive !== false && summon.hp > 0) continue;
    if (summon) scene.onSummonDestroyed(summon);
    list.splice(i, 1);
    removed++;
  }
  return removed;
}

export function onSummonDestroyed(scene, summon) {
  if (!summon) return;
  const x = Number.isFinite(summon.x) ? summon.x : scene.player.x;
  const y = Number.isFinite(summon.y) ? summon.y : scene.player.y;
  const color = summon.def?.color ?? C.bone;
  scene.effects?.deathScatter?.(x, y, color, { elite: false });
  scene.effects?.burst?.(x, y, color, 6);
  sfx.dissipate();
}

// 符文引爆：半径内玩家吃伤害（走 takeDamage 尊重无敌帧）+ 向外 6 发环形弹 + 爆炸表现。

export function detonateRune(scene, det) {
  if (!det) return;
  const x = Number.isFinite(det.x) ? det.x : scene.player.x;
  const y = Number.isFinite(det.y) ? det.y : scene.player.y;
  const radius = Number.isFinite(det.radius) ? det.radius : 44;
  const damage = Number.isFinite(det.damage) && det.damage > 0 ? det.damage : 8;
  scene.effects?.burst?.(x, y, C.blood, 14);
  scene.effects?.impact?.(x, y, C.blood, true);
  if (scene.player?.alive && typeof scene.player.takeDamage === 'function') {
    const dist = Math.hypot(scene.player.x - x, scene.player.y - y);
    if (dist <= radius + (scene.player.radius ?? 0)) {
      if (scene.player.takeDamage(damage, scene.engine?.now ?? 0)) {
        scene.effects?.hurt?.();
        sfx.hurt();
      }
    }
  }
  const ringDamage = Math.max(1, Math.round(damage * 0.5));
  for (let i = 0; i < 6; i++) {
    if (scene.hostileShots.length >= HOSTILE_LIMITS.shots) break;
    const a = (i / 6) * Math.PI * 2;
    scene.hostileShots.push(makeShot({ x, y }, { x: Math.cos(a), y: Math.sin(a) }, {
      kind: 'bolt', speed: 90, damage: ringDamage, radius: 3, lifeMs: 5200,
    }));
  }
  sfx.enemyShot();
}

// 召唤物绘制（两层）：符文贴地画在 summonG（低于敌人），炮台悬浮画在 summonAirG
// （高于敌人）。炮台悬停菱形环（now 推导上下浮动，确定性）/ 符文地面菱形 + 引信进度。

export function drawSummons(scene) {
  const ground = scene.summonG;
  const air = scene.summonAirG ?? scene.summonG;
  if (!ground && !air) return;
  ground?.clear();
  if (air !== ground) air?.clear();
  // 符文与炮台都画在上层：符文在玩家脚下（会被玩家身体遮住一半），炮台在施法者头顶。
  // 若场景只提供了 summonG（测试假场景），退回同一张画布即可。
  const g = air ?? ground;
  const now = Number.isFinite(scene.engine?.now) ? scene.engine.now : 0;
  for (const s of scene.summons ?? []) {
    if (!s || s.alive === false) continue;
    const x = Math.round(s.x);
    const y = Math.round(s.y);
    if (s.kind === 'rune') {
      const lifeMax = Number.isFinite(s.lifeMax) && s.lifeMax > 0 ? s.lifeMax : 1200;
      const progress = Math.max(0, Math.min(1, 1 - s.lifeMs / lifeMax));
      const gy = y + 5; // 视觉落点在脚前，逻辑判定仍在 (x, y)
      pxDiamond(g, x, gy, 6, C.outline, 0.9, false);
      pxDiamond(g, x, gy, 5, C.blood, 0.85, false);
      pxDiamond(g, x, gy, 2, C.bloodDark, 1, true);
      pxRing(g, x, gy, 10 - Math.round(6 * progress), C.blood, 0.6 + 0.4 * progress, 1);
      // 引信条：符头上方 9×1，随时间缩短；最后 300ms 闪白提示「马上炸」
      const flash = s.lifeMs < 300 && Math.floor(now / 80) % 2 === 0;
      pxRect(g, x - 5, gy - 10, 11, 1, C.void, 0.8);
      pxRect(g, x - 4, gy - 10, Math.max(1, Math.round(9 * (1 - progress))), 1, flash ? C.white : C.arcane, 1);
      continue;
    }
    const bob = Math.round(Math.sin((now + (s.id ?? 0) * 97) / 240) * 1.5);
    // 炮台画在施法者侧上方（视觉偏移 +14，逻辑位置不变），避免和施法者立绘糊成一团；
    // 地面投影留在视觉位置下方，读作「悬浮装置」。
    const sx = x + 14;
    const hy = y - 26 + bob;
    pxRect(g, sx - 5, y + 1, 11, 1, C.void, 0.45);
    pxRing(g, sx, hy, 7, C.arcane, 0.45, 1);
    pxDiamond(g, sx, hy, 4, C.outline, 0.95, false);
    pxDiamond(g, sx, hy, 3, C.arcane, 1, false);
    pxDiamond(g, sx, hy, 1, C.white, 1, true);
    // 两侧稳定翼 + 下垂天线 + 虚线锚索，读起来像「装置」而不是宝石
    pxRect(g, sx - 9, hy, 2, 3, C.arcaneLight, 0.85);
    pxRect(g, sx + 7, hy, 2, 3, C.arcaneLight, 0.85);
    pxRect(g, sx, hy + 4, 1, 3, C.arcaneLight, 0.9);
    for (let d = 10; d < 26; d += 5) pxRect(g, sx, y - d, 1, 1, C.arcane, 0.35);
  }
}

// 近战出手：扇形判定走 hostile.meleeHits（距离 ≤ range + 玩家半径、夹角 ≤ arc/2）。
// 命中才 takeDamage（尊重无敌帧）；无论命中都出 slash + meleeSwing + 轻震屏。
// 不走 applyDamage —— 那是敌人受伤的口径。
