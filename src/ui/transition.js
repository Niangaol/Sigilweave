// 过场入口：所有场景切换统一走这里。
// 调试/回归开关：?cine=0 关闭过场（直接切场），?stress=1 也关闭，避免压测被演出打断。
import { firstStageOf } from '../logic/acts.js';

export const CUTSCENE_KEY = 'CutsceneScene';

export function cutscenesDisabled() {
  if (typeof window === 'undefined') return true;
  if (window.__SIGILWEAVE_NO_CINEMA__ === true) return true;
  const params = new URLSearchParams(window.location.search);
  return params.get('cine') === '0' || params.get('stress') === '1';
}

export function playCutscene(scene, options = {}) {
  const { to, kind = 'sigil', payload = {}, act, report = null } = options;
  if (!to) return false;

  const hasOverlay = !!scene.scene.get(CUTSCENE_KEY);
  const overlayActive = scene.scene.isActive(CUTSCENE_KEY);

  // 关闭过场或本体没注册时，退回普通切场；保证任何情况下流程都能走完
  if (cutscenesDisabled() || !hasOverlay) {
    // 关闭过场时不要把 __cine 带过去，让目标场景恢复自己的淡入
    const fallback = { ...(payload && typeof payload === 'object' ? payload : {}) };
    delete fallback.__cine;
    scene.scene.start(to, fallback);
    return false;
  }
  // 已经在过场里：忽略重复触发，避免叠两层覆盖层
  if (overlayActive) return false;

  // act 是「幕」号（1..5）：叙事单位，标题卡与结局眉栏按它取。
  // stage 是「场」号（1..7）：玩法单位，布景与地图按它取；缺省时回退到该幕第一场，
  // 不能拿幕号当场号（否则幕 4 的死亡/终局会取到法庭布景而不是刚打的沉钟书库）。
  const resolvedAct = act ?? payload?.run?.chapter ?? 1;
  const resolvedStage = payload?.run?.stage ?? payload?.stage ?? firstStageOf(resolvedAct);
  scene.scene.launch(CUTSCENE_KEY, {
    from: scene.scene.key,
    to,
    payload,
    kind,
    act: resolvedAct,
    stage: resolvedStage,
    report,
  });
  return true;
}

