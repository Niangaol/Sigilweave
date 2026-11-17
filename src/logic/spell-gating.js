// 法术按幕解锁：前期不让「一炮清屏」的法术进卡池。
// 分档只看输出量级（伤害 × 覆盖 × 前摇代价），不看手感；同档内仍由权重与变体决定。
// 任何新增符印都必须在 TIERS 里归一次档，否则它会被当成「未登记」按幕 1 放出（见 tests）。

export const TIERS = Object.freeze({
  // 轻：起手就能用的单体/小范围，伤害 5~12
  light: Object.freeze(['arcane_bolt', 'frost_arrow', 'flame_burst', 'holy_ward', 'mana_siphon', 'thorn_vine', 'ember_fan']),
  // 中：链式、穿透小、光环盾，伤害 8~15
  medium: Object.freeze(['chain_lightning', 'soul_lance', 'frost_nova', 'aegis_ring', 'sanctum', 'echo_sigil', 'soul_echo']),
  // 重：带前摇或大覆盖，伤害 15~22
  heavy: Object.freeze(['judgment_hammer', 'starfall', 'pierce_lance', 'void_lance', 'glacier', 'bramble_maul', 'thunder_storm', 'sunflare']),
  // 演出级：陨星裁决 / 地裂之颚，整屏判定 + 强震屏
  ultimate: Object.freeze(['meteor_judgment', 'quake_maw']),
});

// 档位 → 最早能在卡池里出现的幕号。
export const TIER_MIN_ACT = Object.freeze({ light: 1, medium: 2, heavy: 3, ultimate: 4 });

const TIER_OF = new Map();
for (const [tier, ids] of Object.entries(TIERS)) for (const id of ids) TIER_OF.set(id, tier);

export const TIER_ORDER = Object.freeze(['light', 'medium', 'heavy', 'ultimate']);

export function tierOf(defId) {
  return TIER_OF.get(defId) ?? null;
}

// 未登记的符印按「轻」处理，宁可多给也不让新法术默认被锁死。
export function minActOf(defId) {
  const tier = tierOf(defId);
  return tier ? TIER_MIN_ACT[tier] : TIER_MIN_ACT.light;
}

export function unlockedAt(defId, act) {
  const a = Number.isFinite(act) ? act : 1;
  return minActOf(defId) <= a;
}

// 卡池过滤：符印按幕解锁，辅助卡（共鸣石/沙漏等纯工具）始终可用。
export function cardsForAct(cards, act) {
  if (!Array.isArray(cards)) return [];
  return cards.filter(card => !card || card.kind !== 'sigil' ? true : unlockedAt(card.defId, act));
}

// 当前幕已解锁的符印 id，按档位从轻到重排好，供首轮三选一取「稳起手」。
export function sigilsForAct(defIds, act) {
  return defIds
    .filter(id => unlockedAt(id, act))
    .sort((a, b) => TIER_ORDER.indexOf(tierOf(a) ?? 'light') - TIER_ORDER.indexOf(tierOf(b) ?? 'light'));
}
