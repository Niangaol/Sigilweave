// 「残响祭坛」局外成长的静态常量：纯数据、零副作用，逻辑层与 UI 共用。
import { CHAPTERS, minorBossIdsOfStage, stagesOf } from '../logic/acts.js';

export const META_VERSION = 1;

// 11 条被动按来源分成两条升级线，顺序即 UI 排列顺序。
export const PASSIVE_LINES = Object.freeze({
  character: Object.freeze(['life', 'swift', 'magnet', 'tough', 'aegis']),
  compass: Object.freeze(['might', 'haste', 'chill', 'wide', 'chain', 'greed']),
});

export const PASSIVE_IDS = Object.freeze([...PASSIVE_LINES.character, ...PASSIVE_LINES.compass]);

export const MAX_META_LEVEL = 5;

// LEVEL_COSTS[level] = 从 level 升到 level+1 需要的残响。
export const LEVEL_COSTS = Object.freeze([10, 24, 48, 80, 120]);

export const DEFAULT_LEVEL_CAP = 2;

// 只有大 Boss 首杀能抬高全局被动等级上限，后期才有「把路线走满」的空间。
export const CAP_UNLOCKS = Object.freeze({ 'boss-3': 3, 'boss-5': 4, 'boss-7': 5 });

export const SETTLE = Object.freeze({
  actWeight: 8,
  killStep: 40,
  killPoint: 1,
  miniBoss: 2,
  majorBoss: 6,
  quiz: 4,
  victory: 60,
  deathRate: 0.6,
  quickRate: 0.5,
});

const CHAPTER_NUMBERS = CHAPTERS.map((c) => c.chapter);
const STAGES = CHAPTERS.flatMap((c) => stagesOf(c.chapter));
const MINOR_SUFFIX_LABELS = ['甲', '乙', '丙', '丁'];

// 34 个契约图鉴节点：7 大 Boss 首杀（按场）+ 20 小 Boss 首杀（按场，幕 1-3 各 4 条、幕 4-5 各 2 条）
// + 5 次幕通关 + 2 个特殊成就。小 Boss 一律由 acts.js 的幕-场表生成，避免手抄漏项。
export const MILESTONES = Object.freeze([
  ...STAGES.map((stage) => ({
    id: 'boss-' + stage,
    kind: 'major',
    bossId: 'boss-' + stage,
    reward: 25,
    ...(CAP_UNLOCKS['boss-' + stage] ? { unlockCap: CAP_UNLOCKS['boss-' + stage] } : {}),
    label: '契约主 · 第 ' + stage + ' 场',
  })),
  ...CHAPTERS.flatMap((chapter) => stagesOf(chapter.chapter).flatMap((stage) => (
    minorBossIdsOfStage(stage).map((id, index) => ({
      id,
      kind: 'minor',
      bossId: id,
      reward: 8,
      label: '小契约 · 第 ' + stage + ' 场' + (MINOR_SUFFIX_LABELS[index] || ''),
    }))
  ))),
  ...CHAPTER_NUMBERS.map((chapter) => ({
    id: 'clear-' + chapter,
    kind: 'chapter',
    reward: 30,
    label: '通关 · 第 ' + chapter + ' 幕',
  })),
  { id: 'quiz-5', kind: 'special', reward: 60, label: '破局者 · 问答击破 5 次' },
  { id: 'kills-300', kind: 'special', reward: 40, label: '清扫者 · 单局击杀 300' },
]);

export const MILESTONE_IDS = Object.freeze(MILESTONES.map((m) => m.id));

export const META_UI = Object.freeze({
  resonanceUnit: '残响',
  lockedHint: '需首杀',
});
