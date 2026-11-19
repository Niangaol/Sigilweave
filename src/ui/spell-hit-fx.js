// 命中表现：顿帧、演出级震屏、连锁/贯穿/回声/汲取的连线、派系反应飘字。
// 从 BattleScene 迁出（2026-11-19 架构重构波 1），行为逐行复制，只把 this 换成 scene。
// 命名避开既有 ui/spell-punch.js（命中重量表）与 ui/spell-fx.js（特效门面）。
import { punchFor, shouldPunch, strikePunchFor } from './spell-punch.js';
import { shakeCamera } from './camera-shake.js';
import { C } from './Palette.js';
import { REACTIONS } from '../data/factions.js';

export function spellPunch(scene, defId, x = 0, y = 0, radius = 90, angle = 0) {
  // 演出级（陨星裁决 / 地裂之颚）：走多段演出 + 高一级的震屏/顿帧，不再叠加普通 punch
  const strike = strikePunchFor(defId);
  if (strike) {
    spellStrikeSequence(scene, defId, x, y, radius, angle);
    return;
  }
  if (!shouldPunch(defId, scene.engine.now, scene.lastPunchAt)) return;
  const spec = punchFor(defId);
  scene.lastPunchAt = scene.engine.now;
  // 普通法术只给顿帧，不震屏（震屏留给 Boss 事件与演出级落点）
  if (spec.stopMs > 0) scene.hitstopLeft = Math.max(scene.hitstopLeft, spec.stopMs);
}

// 高级法术演出：多段特效层 + 暗角收缩 + （陨星）一帧白闪 + 强震屏 + 顿帧
export function spellStrikeSequence(scene, defId, x, y, radius, angle) {
  const spec = strikePunchFor(defId);
  if (!spec) return;
  scene.effects.spellStrike(defId, x, y, radius, angle);
  scene.effects.vignette(defId === 'meteor_judgment' ? 1 : 0.8, 520);
  if (defId === 'meteor_judgment') scene.cameras.main.flash(80, 255, 246, 224);
  scene.lastPunchAt = scene.engine.now;
  shakeCamera(scene, 'strike', spec.ms, spec.amp);
  if (spec.stopMs > 0) scene.hitstopLeft = Math.max(scene.hitstopLeft, spec.stopMs);
}

// 法术的「连接关系」表现：连锁逐跳电弧、贯穿光柱、回声对侧、噬魂/汲取的丝线
export function spellLinkFx(scene, defId, p, result) {
  const targets = result.targets ?? [];
  if (!targets.length) return;
  if (defId === 'chain_lightning') {
    let prev = { x: scene.player.x, y: scene.player.y };
    targets.forEach((t, i) => { scene.effects.spellLink(defId, prev, t, i); prev = t; });
  } else if (defId === 'pierce_lance') {
    scene.effects.spellLink(defId, scene.player, targets[targets.length - 1], 0);
  } else if (defId === 'echo_sigil') {
    for (const t of targets) scene.effects.spellLink(defId, scene.player, t, 0);
  } else if (defId === 'soul_lance' || defId === 'mana_siphon') {
    for (const t of targets) scene.effects.spellLink(defId, t, scene.player, 0);
  }
}

// 派系反应的表现层：落点飘反应名，补跳目标点各自补一次元素色冲击，
// 净化回血在玩家头顶补一个绿色短词。数值全部已经在 effects.js 里结算完，这里只画。
export function reactionFx(scene, p, result) {
  const reaction = result?.reaction;
  if (!reaction) return;
  const color = parseInt(String(reaction.color ?? REACTIONS[reaction.id]?.color ?? '#b8a0ff').slice(1), 16);
  if (reaction.id === 'purify' && reaction.healed > 0) {
    scene.effects.labelPopup(scene.player.x, scene.player.y - 24, `+${reaction.healed}`, C.teal, 8);
  }
  for (const target of reaction.extraTargets ?? []) {
    scene.effects.hitSpark(target.x, target.y, target.x - p.tx, target.y - p.ty, color, 0.5);
  }
  scene.effects.labelPopup(p.tx, p.ty - 30, reaction.name, color, 9);
}
