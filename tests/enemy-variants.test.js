import { describe, expect, it } from 'vitest';
import {
  ENEMY_VARIANTS,
  CHAPTER_VARIANT_WEIGHTS,
  pickEnemyVariant,
  composeEnemyDef,
} from '../src/data/enemy-variants.js';

// 累积顺序与实现一致：normal → swift → heavy → elite。
const ORDER = ['normal', 'swift', 'heavy', 'elite'];
const segments = chapter => ORDER.filter(name => (CHAPTER_VARIANT_WEIGHTS[chapter][name] ?? 0) > 0);
const cumulative = (chapter, count) => ORDER.slice(0, count)
  .reduce((sum, name) => sum + (CHAPTER_VARIANT_WEIGHTS[chapter][name] ?? 0), 0);
const makeBase = (over = {}) => ({
  id: 'skeleton', name: '骷髅', hp: 30, speed: 40, damage: 7, shards: 1, radius: 6, ...over,
});
const snapshot = value => JSON.parse(JSON.stringify(value));

describe('ENEMY_VARIANTS 变体表', () => {
  it('恰好三个变体，键与 id 一致，声明顺序固定（铁甲与持盾已合并为重甲）', () => {
    expect(Object.keys(ENEMY_VARIANTS)).toEqual(['swift', 'heavy', 'elite']);
    for (const [key, variant] of Object.entries(ENEMY_VARIANTS)) {
      expect(variant.id).toBe(key);
      expect(typeof variant.name).toBe('string');
      expect(typeof variant.prefix).toBe('string');
      expect(variant.name.length).toBeGreaterThan(0);
    }
  });

  it('swift 字段与 spec §2 逐字一致', () => {
    expect(ENEMY_VARIANTS.swift).toEqual({
      id: 'swift', name: '疾行', prefix: '疾行', hpMul: 0.85, speedMul: 1.35, damageMul: 1,
      scale: 0.90, radiusMul: 0.95, shardsAdd: 0, cost: 1, minChapter: 1,
      tint: null, parts: [], shieldHpMul: 0,
    });
  });

  it('heavy 字段：铁甲（生命/移速/伤害）与持盾（护甲值）合并后的数值', () => {
    expect(ENEMY_VARIANTS.heavy).toEqual({
      id: 'heavy', name: '重甲', prefix: '重甲', hpMul: 1.60, speedMul: 0.82, damageMul: 1.10,
      scale: 1.10, radiusMul: 1.06, shardsAdd: 3, cost: 2, minChapter: 2,
      tint: null, parts: ['pauldron', 'shield'], shieldHpMul: 0.60,
    });
  });

  it('elite 字段与 spec §2 逐字一致，且只有 elite 带 elite:true', () => {
    expect(ENEMY_VARIANTS.elite).toEqual({
      id: 'elite', name: '精英', prefix: '精英', hpMul: 2.20, speedMul: 0.95, damageMul: 1.35,
      scale: 1.30, radiusMul: 1.18, shardsAdd: 3, cost: 2, minChapter: 2,
      tint: null, parts: ['crown'], shieldHpMul: 0, elite: true,
    });
    expect(ENEMY_VARIANTS.swift.elite).toBeUndefined();
    expect(ENEMY_VARIANTS.heavy.elite).toBeUndefined();
  });

  it('只有重甲带护甲值与双配件（肩甲+盾），其余不带', () => {
    expect(ENEMY_VARIANTS.heavy.shieldHpMul).toBe(0.60);
    expect(ENEMY_VARIANTS.heavy.parts).toEqual(['pauldron', 'shield']);
    expect(ENEMY_VARIANTS.heavy.cost).toBe(2);
    expect(ENEMY_VARIANTS.swift.shieldHpMul).toBe(0);
    expect(ENEMY_VARIANTS.swift.parts).toEqual([]);
    expect(ENEMY_VARIANTS.elite.shieldHpMul).toBe(0);
  });
});

describe('CHAPTER_VARIANT_WEIGHTS 权重表', () => {
  it('恰好覆盖第 1~5 幕，且没有多余幕', () => {
    expect(Object.keys(CHAPTER_VARIANT_WEIGHTS)).toEqual(['1', '2', '3', '4', '5']);
  });

  it('每幕权重和均为 1（12 位小数）', () => {
    for (const chapter of [1, 2, 3, 4, 5]) {
      const sum = Object.values(CHAPTER_VARIANT_WEIGHTS[chapter]).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 12);
    }
  });

  it('权重表逐字一致（重甲 = 原铁甲 + 原持盾）', () => {
    expect(CHAPTER_VARIANT_WEIGHTS).toEqual({
      1: { normal: 0.94, swift: 0.06 },
      2: { normal: 0.84, swift: 0.07, heavy: 0.07, elite: 0.02 },
      3: { normal: 0.77, swift: 0.07, heavy: 0.13, elite: 0.03 },
      4: { normal: 0.72, swift: 0.06, heavy: 0.17, elite: 0.05 },
      5: { normal: 0.67, swift: 0.06, heavy: 0.20, elite: 0.07 },
    });
  });

  it('第 1 幕没有重甲权重，第 2~5 幕有（第 2 幕起可以刷出重甲）', () => {
    expect(CHAPTER_VARIANT_WEIGHTS[1].heavy).toBeUndefined();
    for (const chapter of [2, 3, 4, 5]) {
      expect(CHAPTER_VARIANT_WEIGHTS[chapter].heavy).toBeGreaterThan(0);
    }
  });

  it('表里出现的每个变体在该幕都满足 minChapter 门槛', () => {
    for (const chapter of [1, 2, 3, 4, 5]) {
      for (const name of Object.keys(CHAPTER_VARIANT_WEIGHTS[chapter])) {
        expect(ORDER).toContain(name);
        if (name !== 'normal') {
          expect(ENEMY_VARIANTS[name].minChapter).toBeLessThanOrEqual(chapter);
        }
      }
    }
  });
});

describe('pickEnemyVariant 累积命中', () => {
  it('逐幕逐段命中：段内中值落到该段的变体（normal 段为 null）', () => {
    for (const chapter of [1, 2, 3, 4, 5]) {
      let lo = 0;
      for (const name of segments(chapter)) {
        const hi = lo + CHAPTER_VARIANT_WEIGHTS[chapter][name];
        const roll = lo + (hi - lo) / 2;
        const expected = ENEMY_VARIANTS[name] ?? null;
        expect(pickEnemyVariant(chapter, makeBase(), roll)).toBe(expected);
        lo = hi;
      }
    }
  });

  it('每段下边界（累积和恰好等于 roll）落到该段，区间为左闭右开', () => {
    for (const chapter of [1, 2, 3, 4, 5]) {
      const names = segments(chapter);
      for (let i = 0; i < names.length; i += 1) {
        const roll = cumulative(chapter, i);
        const expected = ENEMY_VARIANTS[names[i]] ?? null;
        expect(pickEnemyVariant(chapter, makeBase(), roll)).toBe(expected);
      }
    }
  });

  it('roll=0 恒落在首段（第 1 幕为 normal → null）', () => {
    for (const chapter of [1, 2, 3, 4, 5]) {
      expect(pickEnemyVariant(chapter, makeBase(), 0)).toBeNull();
    }
  });

  it('roll=0.999 落在末段：第 1 幕 swift，第 2~5 幕 elite', () => {
    expect(pickEnemyVariant(1, makeBase(), 0.999)).toBe(ENEMY_VARIANTS.swift);
    for (const chapter of [2, 3, 4, 5]) {
      expect(pickEnemyVariant(chapter, makeBase(), 0.999)).toBe(ENEMY_VARIANTS.elite);
    }
  });

  it('第 1 幕 0.94 以下是 normal（null），之后是 swift', () => {
    expect(pickEnemyVariant(1, makeBase(), 0)).toBeNull();
    expect(pickEnemyVariant(1, makeBase(), 0.5)).toBeNull();
    expect(pickEnemyVariant(1, makeBase(), 0.939)).toBeNull();
    expect(pickEnemyVariant(1, makeBase(), 0.94)).toBe(ENEMY_VARIANTS.swift);
    expect(pickEnemyVariant(1, makeBase(), 0.99)).toBe(ENEMY_VARIANTS.swift);
  });

  it('第 2 幕累积：normal 0.84 → swift 0.91 → heavy 0.98 → elite 1', () => {
    expect(pickEnemyVariant(2, makeBase(), 0.9)).toBe(ENEMY_VARIANTS.swift);
    expect(pickEnemyVariant(2, makeBase(), 0.95)).toBe(ENEMY_VARIANTS.heavy);
    expect(pickEnemyVariant(2, makeBase(), 0.985)).toBe(ENEMY_VARIANTS.elite);
  });

  it('第 5 幕逐段：0.67 前 null，0.67~0.73 swift，0.73~0.93 heavy，0.93 起 elite', () => {
    const b = makeBase();
    expect(pickEnemyVariant(5, b, 0.66)).toBeNull();
    expect(pickEnemyVariant(5, b, 0.72)).toBe(ENEMY_VARIANTS.swift);
    expect(pickEnemyVariant(5, b, 0.74)).toBe(ENEMY_VARIANTS.heavy);
    expect(pickEnemyVariant(5, b, 0.92)).toBe(ENEMY_VARIANTS.heavy);
    expect(pickEnemyVariant(5, b, 0.94)).toBe(ENEMY_VARIANTS.elite);
  });

  it('返回的是 ENEMY_VARIANTS 里的同一引用', () => {
    expect(pickEnemyVariant(3, makeBase(), 0.88)).toBe(ENEMY_VARIANTS.heavy);
  });
});

describe('pickEnemyVariant 非法输入', () => {
  it('非法 chapter → null', () => {
    for (const chapter of [0, 6, -1, 3.5, NaN, '3', null, undefined, {}]) {
      expect(pickEnemyVariant(chapter, makeBase(), 0.5)).toBeNull();
    }
  });

  it('非法 roll → null', () => {
    for (const roll of [-0.001, 1, 1.5, -1, NaN, Infinity, -Infinity, '0.5', null, undefined]) {
      expect(pickEnemyVariant(3, makeBase(), roll)).toBeNull();
    }
  });

  it('baseDef.elite 为真时恒为 null（不论幕与 roll）', () => {
    for (const chapter of [1, 2, 3, 4, 5]) {
      for (const roll of [0, 0.5, 0.9, 0.999]) {
        expect(pickEnemyVariant(chapter, { ...makeBase(), elite: true }, roll)).toBeNull();
      }
    }
  });

  it('baseDef.elite 为假或缺省时仍可命中变体', () => {
    expect(pickEnemyVariant(3, makeBase({ elite: false }), 0.88)).toBe(ENEMY_VARIANTS.heavy);
    expect(pickEnemyVariant(3, makeBase(), 0.88)).toBe(ENEMY_VARIANTS.heavy);
    expect(pickEnemyVariant(3, null, 0.88)).toBe(ENEMY_VARIANTS.heavy);
    expect(pickEnemyVariant(3, undefined, 0.88)).toBe(ENEMY_VARIANTS.heavy);
  });

  it('命中变体的 minChapter 大于当前幕 → null（临时注入第 1 幕重甲权重验证）', () => {
    const original = CHAPTER_VARIANT_WEIGHTS[1];
    CHAPTER_VARIANT_WEIGHTS[1] = { normal: 0.5, heavy: 0.5 };
    try {
      expect(pickEnemyVariant(1, makeBase(), 0.2)).toBeNull();      // normal 段
      expect(pickEnemyVariant(1, makeBase(), 0.75)).toBeNull();     // heavy 段但 minChapter 2 > 1
      expect(pickEnemyVariant(3, makeBase(), 0.94)).toBe(ENEMY_VARIANTS.heavy); // 正常幕仍可命中
    } finally {
      CHAPTER_VARIANT_WEIGHTS[1] = original;
    }
    expect(CHAPTER_VARIANT_WEIGHTS[1]).toEqual({ normal: 0.94, swift: 0.06 });
  });
});

describe('composeEnemyDef 合成', () => {
  it('variant 为 null 时字段原样回填', () => {
    const base = makeBase();
    const def = composeEnemyDef(base, null);
    expect(def).not.toBe(base);
    expect(def).toMatchObject({
      id: 'skeleton', baseId: 'skeleton', name: '骷髅', hp: 30, speed: 40,
      hpMul: 1, speedMul: 1, damage: 7, shards: 1, radius: 6,
    });
    expect(def.elite).toBeUndefined();
    expect(def.variant).toBeNull();
  });

  it('base 缺省字段时使用 spec 默认值', () => {
    const def = composeEnemyDef({ id: 'x', name: 'x' }, null);
    expect(def.hpMul).toBe(1);
    expect(def.speedMul).toBe(1);
    expect(def.damage).toBe(1);
    expect(def.shards).toBe(1);
    expect(def.radius).toBe(6);
  });

  it('swift 乘率/取整/前缀正确', () => {
    const base = makeBase();
    const def = composeEnemyDef(base, ENEMY_VARIANTS.swift);
    expect(def.id).toBe('skeleton');
    expect(def.baseId).toBe('skeleton');
    expect(def.name).toBe('疾行骷髅');
    expect(def.hpMul).toBeCloseTo(0.85, 12);
    expect(def.speedMul).toBeCloseTo(1.35, 12);
    expect(def.damage).toBe(7);
    expect(def.shards).toBe(1);
    expect(def.radius).toBe(6); // round(6 * 0.95) = round(5.7) = 6
    expect(def.elite).toBeUndefined();
    expect(def.variant).toBe(ENEMY_VARIANTS.swift);
    expect(def.hp).toBe(30); // 血量本体不被乘率改写
    expect(def.speed).toBe(40);
  });

  it('heavy 乘率/取整/额外碎片正确（生命 1.6 倍 + 0.6 倍护甲）', () => {
    const def = composeEnemyDef(makeBase(), ENEMY_VARIANTS.heavy);
    expect(def.name).toBe('重甲骷髅');
    expect(def.hpMul).toBeCloseTo(1.6, 12);
    expect(def.speedMul).toBeCloseTo(0.82, 12);
    expect(def.damage).toBe(8); // round(7 * 1.10) = 8
    expect(def.shards).toBe(4); // 1 + 3
    expect(def.radius).toBe(6); // round(6.36)
    expect(def.elite).toBeUndefined();
  });

  it('elite 乘率/取整/额外碎片/精英标记正确', () => {
    const def = composeEnemyDef(makeBase(), ENEMY_VARIANTS.elite);
    expect(def.name).toBe('精英骷髅');
    expect(def.hpMul).toBeCloseTo(2.2, 12);
    expect(def.speedMul).toBeCloseTo(0.95, 12);
    expect(def.damage).toBe(9); // round(7 * 1.35) = round(9.45) = 9
    expect(def.radius).toBe(7); // round(6 * 1.18) = round(7.08) = 7
    expect(def.shards).toBe(4);
    expect(def.elite).toBe(true);
    expect(def.variant).toBe(ENEMY_VARIANTS.elite);
  });

  it('base 自带 elite 时与变体取或，永远为真', () => {
    expect(composeEnemyDef(makeBase({ elite: true }), ENEMY_VARIANTS.swift).elite).toBe(true);
    expect(composeEnemyDef(makeBase({ elite: true }), null).elite).toBe(true);
    expect(composeEnemyDef(makeBase({ elite: false }), ENEMY_VARIANTS.swift).elite).toBeUndefined();
  });

  it('hpMul/speedMul 与基础乘率相乘（不是覆盖）；damage 只吃 variant.damageMul', () => {
    const def = composeEnemyDef(
      makeBase({ hpMul: 1.2, speedMul: 1.1, damageMul: 1.5, shardsAdd: 5 }),
      ENEMY_VARIANTS.heavy,
    );
    expect(def.hpMul).toBeCloseTo(1.92, 12);
    expect(def.speedMul).toBeCloseTo(0.902, 12);
    // spec 公式只读 variant.damageMul，base.damageMul 不参与：round(7 * 1.10) = 8
    expect(def.damage).toBe(8);
    // spec 公式只读 base.shards 与 variant.shardsAdd，base.shardsAdd 不参与：1 + 3 = 4
    expect(def.shards).toBe(4);
  });

  it('damage/radius 有 Math.max 下限与 Math.round 取整', () => {
    expect(composeEnemyDef(makeBase({ damage: 0.2 }), ENEMY_VARIANTS.swift).damage).toBe(1);
    expect(composeEnemyDef(makeBase({ damage: 5 }), ENEMY_VARIANTS.heavy).damage).toBe(6); // 5.5 → 6
    expect(composeEnemyDef(makeBase({ damage: 5 }), ENEMY_VARIANTS.swift).damage).toBe(5);
    expect(composeEnemyDef(makeBase({ radius: 0 }), ENEMY_VARIANTS.swift).radius).toBe(3);
    expect(composeEnemyDef(makeBase({ radius: 10 }), ENEMY_VARIANTS.swift).radius).toBe(10); // 9.5 → 10
    expect(composeEnemyDef(makeBase({ radius: 3 }), ENEMY_VARIANTS.elite).radius).toBe(4); // round(3.54) = 4
  });

  it('不修改 baseDef 与 variant（深比较前后快照）', () => {
    const base = makeBase({ nested: { list: [1, 2, 3] } });
    const baseBefore = snapshot(base);
    const variantBefore = snapshot(ENEMY_VARIANTS.heavy);
    const def = composeEnemyDef(base, ENEMY_VARIANTS.heavy);
    expect(base).toEqual(baseBefore);
    expect(ENEMY_VARIANTS.heavy).toEqual(variantBefore);
    expect(Object.keys(base)).toEqual(Object.keys(baseBefore));
    expect(def.nested).toBe(base.nested);
    expect(def).not.toBe(base);
  });

  it('每个变体合成后 variant 都是原引用、id/baseId 保持基础 id', () => {
    for (const variant of Object.values(ENEMY_VARIANTS)) {
      const def = composeEnemyDef(makeBase({ id: 'goblin' }), variant);
      expect(def.variant).toBe(variant);
      expect(def.id).toBe('goblin');
      expect(def.baseId).toBe('goblin');
      expect(def.name.startsWith(variant.prefix)).toBe(true);
      expect(Number.isInteger(def.damage)).toBe(true);
      expect(Number.isInteger(def.radius)).toBe(true);
      expect(Number.isInteger(def.shards)).toBe(true);
    }
  });
});
