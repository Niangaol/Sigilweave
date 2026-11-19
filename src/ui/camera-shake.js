// 震屏预算：默认只让「大事件」震，同类事件之间有最小间隔。
// 设计口径（2026-11-17 用户拍板「只留大事件」）：
//   允许震的只有 —— 玩家受伤、Boss 登场/被击败、通幕、玩家死亡、陨星裁决/地裂之颚的演出级落点；
//   普通法术命中、近战挥砍、敌方弹幕炸开、破盾、连斩里程碑一律不震，靠火花/顿帧/音效给反馈。
// 纯函数：不碰 Phaser，便于单测。

import { settingValue } from '../logic/settings.js';

export const SHAKE_KINDS = Object.freeze({
  // 玩家受伤：受击无敌 1400ms 已经限过一次，再加 900ms 门槛，避免被围住时连环抖
  hurt: { gapMs: 900, ampScale: 0.8 },
  // 演出级法术（陨星裁决 / 地裂之颚）：多段演出，允许更强的震，但两次之间至少 800ms
  strike: { gapMs: 800, ampScale: 1 },
  // 大事件：Boss 登场/倒下、通幕、玩家死亡；只留 250ms 防同帧叠加，不再额外稀释
  major: { gapMs: 250, ampScale: 1 },
  // Boss 转阶段（B6）：换招是战斗节奏的转折点，必须震得出来；
  // 门槛压到 150ms，因为转阶段常紧跟一次受击（hurt 900ms），
  // 用 major 的 250ms 也够，但转阶段后往往还有破防/大招落地连着演，150ms 才排得开。
  phase: { gapMs: 150, ampScale: 1 },
});

export const DEFAULT_SHAKE_KIND = 'major';

export function createShakeGate() {
  return { lastAt: Object.create(null) };
}

export function shakeKindOf(kind) {
  return SHAKE_KINDS[kind] ?? SHAKE_KINDS[DEFAULT_SHAKE_KIND];
}

// 这次震屏放不放行；放行时记下时刻，之后的同类请求要等 gapMs。
// 非法 now（NaN/Infinity/非数字）一律拒绝，别让时间戳坏了预算。
export function admitShake(gate, kind, now) {
  if (!gate || typeof gate !== 'object') return false;
  if (!Number.isFinite(now)) return false;
  const key = Object.hasOwn(SHAKE_KINDS, kind) ? kind : DEFAULT_SHAKE_KIND;
  const { gapMs } = shakeKindOf(key);
  gate.lastAt ??= Object.create(null);
  const last = gate.lastAt[key];
  if (Number.isFinite(last) && now - last < gapMs) return false;
  gate.lastAt[key] = now;
  return true;
}

// 场景侧唯一入口：BattleScene 里所有震屏都走这里。
// 写成独立函数而不是场景方法，是为了让只挂了部分方法的测试场景也能调用。
export function shakeCamera(scene, kind, ms, amp) {
  const main = scene?.cameras?.main;
  if (!main || typeof main.shake !== 'function') return false;
  if (!Number.isFinite(ms) || !Number.isFinite(amp)) return false;
  // 设置里关掉震动后一律不震：玩家在首页「设置」里能随时关闭。
  if (!settingValue('shake')) return false;
  scene.shakeGate ??= createShakeGate();
  const now = Number.isFinite(scene?.engine?.now) ? scene.engine.now : (scene.time?.now ?? 0);
  if (!admitShake(scene.shakeGate, kind, now)) return false;
  main.shake(ms, amp * shakeKindOf(kind).ampScale);
  return true;
}
