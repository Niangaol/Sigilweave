// 灵宠新手引导 · 控制器（只做数据/去重/派发，不碰 Phaser 绘制）
// 文案与触发来自 docs/新手指引（guide-content.json 的运行时副本在 src/data/）。
// 去重状态挂在 run.guideSeen，一局内每个 id 只出现一次，新局随 createRun 重置。
import GUIDE from '../data/guide-content.json';

export const GUIDE_ENABLED_KEY = 'guide';
export const GUIDE_EVENT = 'guide:show';
export const GUIDE_HIDE_EVENT = 'guide:hide';

const CARDS = new Map((GUIDE.guides ?? []).map((g) => [g.id, g]));
const STUCK = new Map((GUIDE.stuckHints ?? []).map((h) => [h.when, h]));

// URL ?guide=0 可整机关闭引导；默认开启。评审阶段方便对比有/无引导。
export function guideEnabled(params = new URLSearchParams(window.location.search)) {
  return params.get(GUIDE_ENABLED_KEY) !== '0';
}

export function getCard(id) {
  return CARDS.get(id) ?? null;
}

export function getStuckHint(when) {
  return STUCK.get(when) ?? null;
}

// 按幕/场解析某条卡片真正要显示的话（G12 用 linesByAct / linesByStage）。
export function resolveLines(card, { act, stage } = {}) {
  if (!card) return [];
  if (act && card.linesByAct?.[String(act)]) return card.linesByAct[String(act)];
  if (stage && card.linesByStage?.[String(stage)]) return card.linesByStage[String(stage)];
  if (Array.isArray(card.lines)) return card.lines;
  if (Array.isArray(card.steps)) return card.steps.flatMap((s) => s.lines ?? []);
  return [];
}

export function seenMap(run) {
  if (!run) return {};
  run.guideSeen ??= {};
  return run.guideSeen;
}

export function wasSeen(run, id) {
  return !!seenMap(run)[id];
}

export function markSeen(run, id) {
  seenMap(run)[id] = true;
}

// 场景里统一调用：fireGuide(this, run, 'G01')。
// 只发事件给 GuideScene，由覆盖层决定怎么画；不阻塞战斗、不改 phase。
export function fireGuide(scene, run, id, ctx = {}) {
  if (!guideEnabled()) return false;
  if (!scene?.game?.events) return false;
  if (!GUIDE.guides?.some((g) => g.id === id)) return false;
  if (wasSeen(run, id) && !ctx.force) return false;
  markSeen(run, id);
  scene.game.events.emit(GUIDE_EVENT, {
    id,
    card: getCard(id),
    run,
    ...ctx,
  });
  return true;
}

export function fireStuck(scene, runId, when) {
  if (!guideEnabled()) return false;
  const hint = getStuckHint(when);
  if (!hint || !scene?.game?.events) return false;
  scene.game.events.emit(GUIDE_EVENT, { id: 'STUCK_' + when, card: { id: 'STUCK_' + when, lines: hint.lines, pet: { emotion: 'curious' } }, runId, force: true });
  return true;
}

export function hideGuide(scene) {
  scene?.game?.events?.emit(GUIDE_HIDE_EVENT);
}
