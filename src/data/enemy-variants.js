// 敌人变体静态数据与纯函数：零 Phaser / 零 DOM / 零 Math.random / 不改入参。
// 契约见 docs/superpowers/specs/2026-11-16-enemy-variants-ai-design.md §2。

export const ENEMY_VARIANTS = {
  swift: {
    id: 'swift', name: '疾行', prefix: '疾行', hpMul: 0.85, speedMul: 1.35, damageMul: 1,
    scale: 0.90, radiusMul: 0.95, shardsAdd: 0, cost: 1, minChapter: 1,
    tint: null, parts: [], shieldHpMul: 0,
  },
  heavy: {
    id: 'heavy', name: '重甲', prefix: '重甲', hpMul: 1.90, speedMul: 0.82, damageMul: 1.30,
    scale: 1.10, radiusMul: 1.06, shardsAdd: 3, cost: 2, minChapter: 2,
    tint: null, parts: ['pauldron', 'shield'], shieldHpMul: 0.60,
  },
  elite: {
    id: 'elite', name: '精英', prefix: '精英', hpMul: 2.60, speedMul: 0.95, damageMul: 1.60,
    scale: 1.30, radiusMul: 1.18, shardsAdd: 3, cost: 2, minChapter: 2,
    tint: null, parts: ['crown'], shieldHpMul: 0, elite: true,
  },
};

export const CHAPTER_VARIANT_WEIGHTS = {
  1: { normal: 0.94, swift: 0.06 },
  2: { normal: 0.84, swift: 0.07, heavy: 0.07, elite: 0.02 },
  3: { normal: 0.77, swift: 0.07, heavy: 0.13, elite: 0.03 },
  4: { normal: 0.72, swift: 0.06, heavy: 0.17, elite: 0.05 },
  5: { normal: 0.67, swift: 0.06, heavy: 0.20, elite: 0.07 },
};

// 累积权重必须按这个声明顺序累加；normal 不是变体，命中即 null。
const VARIANT_ORDER = ['normal', 'swift', 'heavy', 'elite'];

function isValidRoll(roll) {
  return typeof roll === 'number' && Number.isFinite(roll) && roll >= 0 && roll < 1;
}

// roll ∈ [0,1)。baseDef.elite 为真 → null；非法 chapter / 缺表 / 非法 roll → null。
// 命中变体的 minChapter > chapter → null。
export function pickEnemyVariant(chapter, baseDef, roll) {
  if (baseDef && baseDef.elite) return null;
  if (!Number.isInteger(chapter)) return null;
  const table = CHAPTER_VARIANT_WEIGHTS[chapter];
  if (!table) return null;
  if (!isValidRoll(roll)) return null;

  let acc = 0;
  for (const name of VARIANT_ORDER) {
    acc += table[name] ?? 0;
    if (roll < acc) {
      const variant = ENEMY_VARIANTS[name];
      if (!variant) return null; // normal
      return variant.minChapter > chapter ? null : variant;
    }
  }
  return null;
}

// variant 可为 null；返回新对象，不修改 baseDef。
export function composeEnemyDef(baseDef, variant) {
  const base = baseDef ?? {};
  const v = variant ?? null;
  return {
    ...base,
    id: base.id,
    baseId: base.id,
    name: v ? v.prefix + base.name : base.name,
    hpMul: (base.hpMul ?? 1) * (v?.hpMul ?? 1),
    speedMul: (base.speedMul ?? 1) * (v?.speedMul ?? 1),
    damage: Math.max(1, Math.round((base.damage ?? 1) * (v?.damageMul ?? 1))),
    shards: (base.shards ?? 1) + (v?.shardsAdd ?? 0),
    radius: Math.max(3, Math.round((base.radius ?? 6) * (v?.radiusMul ?? 1))),
    elite: base.elite || v?.elite || undefined,
    variant: v,
  };
}
