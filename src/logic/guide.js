// 灵宠新手引导 · 控制器（只做数据/去重/派发，不碰 Phaser 绘制）
// 文案与触发来自 docs/新手指引（guide-content.json 的运行时副本在 src/data/）。
// 去重状态挂在 run.guideSeen，一局内每个 id 只出现一次，新局随 createRun 重置。
import GUIDE from '../data/guide-content.json';
import { settingValue } from './settings.js';

export const GUIDE_ENABLED_KEY = 'guide';
export const GUIDE_EVENT = 'guide:show';
export const GUIDE_HIDE_EVENT = 'guide:hide';
// 引导显隐生命周期：战斗场景据此把「灵宠讲解」当作暂停键——讲解期间冻结战斗，
// 讲解全部读完才放行，实现「先听墨宝讲、怪兽再入场」的新手体验。
export const GUIDE_ACTIVE_EVENT = 'guide:active';
export const GUIDE_DONE_EVENT = 'guide:done';

const CARDS = new Map((GUIDE.guides ?? []).map((g) => [g.id, g]));
const STUCK = new Map((GUIDE.stuckHints ?? []).map((h) => [h.when, h]));

// URL ?guide=0 可整机关闭引导；默认开启。评审阶段方便对比有/无引导。
// 无 window 环境（Node 单测）默认开启，不在参数默认值里访问 window。
// 首页「设置 → 新手引导」也能关；?guide=0 仍然优先，两者任一关掉即不出现。
export function guideEnabled(params) {
  const p = params ?? (typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams());
  if (!settingValue('guide')) return false;
  return p.get(GUIDE_ENABLED_KEY) !== '0';
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

export function hideGuide(scene) {
  scene?.game?.events?.emit(GUIDE_HIDE_EVENT);
}

// 各场开场的「新手讲解」卡片 id：第一幕 G01 / 第二幕 G07 / 第三幕 G09 / 幕四起 G12。
export function openingGuideIdForStage(stage) {
  return stage === 1 ? 'G01' : stage === 2 ? 'G07' : stage === 3 ? 'G09' : 'G12';
}

// 是否要为本场开场讲解冻结战斗：引导开启 + 本局还没讲过 + 卡片存在。
// 这是纯函数，便于单测；战斗场景进场时据此立起「讲解闸门」。
export function shouldHoldForOpeningGuide(run, stage, params) {
  const id = openingGuideIdForStage(stage);
  return guideEnabled(params) && !wasSeen(run, id) && !!getCard(id);
}
