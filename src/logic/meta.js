// 局外成长（残响祭坛）：存档、升级判定、对局结算。全部是可注入 storage 的纯逻辑。
import {
  CAP_UNLOCKS,
  DEFAULT_LEVEL_CAP,
  LEVEL_COSTS,
  MAX_META_LEVEL,
  META_VERSION,
  MILESTONES,
  MILESTONE_IDS,
  PASSIVE_IDS,
  SETTLE,
} from '../data/meta.js';

export const STORAGE_KEY = 'sigilweave:meta:v1';

const MILESTONE_BY_ID = new Map(MILESTONES.map((m) => [m.id, m]));
const levelOf = (value) => (Number.isSafeInteger(value) && value > 0 ? Math.min(MAX_META_LEVEL, value) : 0);
const countOf = (value) => (Number.isSafeInteger(value) && value > 0 ? value : 0);

// 无 window（测试 / SSR）时的兜底：同一进程内共享，保证读到自己刚写的档。
const memoryStore = (() => {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
  };
})();

function resolveStorage(storage) {
  if (storage && typeof storage.getItem === 'function') return storage;
  try {
    if (typeof window !== 'undefined' && window.localStorage
      && typeof window.localStorage.getItem === 'function') return window.localStorage;
  } catch {
    // 隐私模式 / 禁用存储：落到内存桩。
  }
  return memoryStore;
}

export function defaultMeta() {
  return {
    v: META_VERSION,
    resonance: 0,
    levels: Object.fromEntries(PASSIVE_IDS.map((id) => [id, 0])),
    milestones: [],
    counters: { runs: 0, wins: 0, quizWins: 0, bestAct: 1, bestKills: 0 },
    updatedAt: 0,
  };
}

// 坏档一律回落默认值，绝不抛异常：局外档损坏不能导致游戏进不去。
export function sanitizeMeta(raw) {
  let data = raw;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch { return defaultMeta(); }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return defaultMeta();

  const base = defaultMeta();
  const resonance = Number.isSafeInteger(data.resonance) && data.resonance >= 0 ? data.resonance : 0;

  const levels = { ...base.levels };
  const rawLevels = data.levels && typeof data.levels === 'object' && !Array.isArray(data.levels) ? data.levels : {};
  for (const id of PASSIVE_IDS) levels[id] = levelOf(rawLevels[id]);

  const seen = new Set();
  const milestones = (Array.isArray(data.milestones) ? data.milestones : [])
    .filter((id) => typeof id === 'string' && MILESTONE_BY_ID.has(id) && !seen.has(id) && seen.add(id));

  const rawCounters = data.counters && typeof data.counters === 'object' ? data.counters : {};
  const counters = {
    runs: countOf(rawCounters.runs),
    wins: countOf(rawCounters.wins),
    quizWins: countOf(rawCounters.quizWins),
    bestAct: Math.max(1, countOf(rawCounters.bestAct)),
    bestKills: countOf(rawCounters.bestKills),
  };

  return {
    v: META_VERSION,
    resonance,
    levels,
    milestones,
    counters,
    updatedAt: countOf(data.updatedAt),
  };
}

export function loadMeta(storage) {
  const store = resolveStorage(storage);
  try { return sanitizeMeta(store.getItem(STORAGE_KEY)); } catch { return defaultMeta(); }
}

export function saveMeta(save, storage) {
  const clean = sanitizeMeta(save);
  const store = resolveStorage(storage);
  try { store.setItem(STORAGE_KEY, JSON.stringify(clean)); } catch { /* 配额/隐私模式：静默忽略 */ }
  try {
    if (typeof window !== 'undefined') window.__SIGILWEAVE_META__ = { ...(window.__SIGILWEAVE_META__ || {}), save: clean };
  } catch { /* 忽略 */ }
  return clean;
}

export function resetMeta(storage) {
  const store = resolveStorage(storage);
  try { store.removeItem(STORAGE_KEY); } catch { /* 忽略 */ }
  return defaultMeta();
}

export function metaLevel(save, id) {
  if (!save || !save.levels || !PASSIVE_IDS.includes(id)) return 0;
  return levelOf(save.levels[id]);
}

export function levelCap(save) {
  const milestones = save && Array.isArray(save.milestones) ? save.milestones : [];
  return milestones.reduce((cap, id) => Math.max(cap, CAP_UNLOCKS[id] || 0), DEFAULT_LEVEL_CAP);
}

export function upgradeCost(save, id) {
  if (!PASSIVE_IDS.includes(id)) return null;
  const lv = metaLevel(save, id);
  if (lv >= MAX_META_LEVEL) return null;
  const cost = LEVEL_COSTS[lv];
  return Number.isSafeInteger(cost) ? cost : null;
}

export function canUpgrade(save, id) {
  const cap = levelCap(save);
  if (!PASSIVE_IDS.includes(id)) return { ok: false, reason: 'unknown', cost: null, cap };
  const lv = metaLevel(save, id);
  const cost = upgradeCost(save, id);
  if (lv >= MAX_META_LEVEL) return { ok: false, reason: 'maxlevel', cost: null, cap };
  if (lv >= cap) return { ok: false, reason: 'maxcap', cost, cap };
  if (!Number.isSafeInteger(cost) || (save.resonance || 0) < cost) return { ok: false, reason: 'cost', cost, cap };
  return { ok: true, reason: 'ok', cost, cap };
}

// 成功才扣残响；失败原样返回入参对象，调用方可直接用返回值。
export function upgradePassive(save, id) {
  const verdict = canUpgrade(save, id);
  if (!verdict.ok) return { ok: false, reason: verdict.reason, save };
  const lv = metaLevel(save, id);
  return {
    ok: true,
    reason: 'ok',
    cost: verdict.cost,
    save: {
      ...save,
      resonance: save.resonance - verdict.cost,
      levels: { ...save.levels, [id]: lv + 1 },
      updatedAt: Date.now(),
    },
  };
}

const receipts = (value) => (value && typeof value === 'object' ? Object.values(value) : [])
  .filter((r) => r && typeof r === 'object');

export function settleRun(save, summary) {
  const base = sanitizeMeta(save);
  const none = { save: base, gained: 0, base: 0, multiplier: 0, newMilestones: [] };
  if (!summary || typeof summary !== 'object') return none;
  // 演武、压测、中途退出都不结算，避免刷分。
  if (summary.trainingComplete || summary.dnf || summary.stress) return none;

  const act = Number.isSafeInteger(summary.act) && summary.act >= 1 ? Math.min(7, summary.act) : 1;
  const kills = countOf(summary.kills);
  const victory = summary.victory === true;

  const major = receipts(summary.bossResolutions).filter((r) => r.tier !== 'mini');
  const mini = receipts(summary.miniBossResolutions);
  const quizWins = [...major, ...mini].filter((r) => r.method === 'quiz').length;

  const rawBase = act * SETTLE.actWeight
    + Math.floor(kills / SETTLE.killStep) * SETTLE.killPoint
    + mini.length * SETTLE.miniBoss
    + major.length * SETTLE.majorBoss
    + quizWins * SETTLE.quiz
    + (victory ? SETTLE.victory : 0);
  const multiplier = (victory ? 1 : SETTLE.deathRate) * (summary.quick ? SETTLE.quickRate : 1);
  const gained = Math.max(0, Math.round(rawBase * multiplier));

  const counters = {
    runs: base.counters.runs + 1,
    wins: base.counters.wins + (victory ? 1 : 0),
    quizWins: base.counters.quizWins + quizWins,
    bestAct: Math.max(base.counters.bestAct, act),
    bestKills: Math.max(base.counters.bestKills, kills),
  };

  // 首杀与特殊成就：候选按 MILESTONES 顺序收敛，已点亮的过滤掉。
  const candidates = [
    ...major.map((r) => 'boss-' + r.act),
    ...mini.map((r) => r.bossId),
    counters.quizWins >= 5 ? 'quiz-5' : null,
    kills >= 300 ? 'kills-300' : null,
    victory ? 'clear' : null,
  ].filter((id) => typeof id === 'string' && MILESTONE_BY_ID.has(id));

  const owned = new Set(base.milestones);
  const newMilestones = MILESTONE_IDS
    .filter((id) => candidates.includes(id) && !owned.has(id))
    .map((id) => {
      const m = MILESTONE_BY_ID.get(id);
      return { id, label: m.label, reward: m.reward };
    });

  const reward = newMilestones.reduce((sum, m) => sum + m.reward, 0);
  const milestones = [...MILESTONE_IDS.filter((id) => owned.has(id) || newMilestones.some((m) => m.id === id))];

  return {
    save: {
      ...base,
      resonance: base.resonance + gained + reward,
      milestones,
      counters,
      updatedAt: Date.now(),
    },
    gained,
    base: rawBase,
    multiplier,
    newMilestones,
  };
}

// 场景侧助手：把「局外等级」喂给局内的被动应用，文案统一在这里拼。
export function applyPassiveToCharacter(buff, adapter, level = 0) {
  if (!buff || typeof buff.apply !== 'function') return '';
  return buff.apply(adapter, level) || '';
}

export function applyPassiveToCompass(buff, compassBuffs, level = 0) {
  if (!buff || typeof buff.apply !== 'function') return '';
  return buff.apply(compassBuffs, level) || '';
}

export function metaPassiveLabel(level) {
  const lv = levelOf(level);
  return lv > 0 ? '（残响 ' + lv + '）' : '';
}
