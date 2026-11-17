// 波 1：法术变体 + 联组资格。变体决定「这张法术能不能参与联组」，
// 标准与锐化都不能，只有谐律能；强力终局法术连谐律都不存在。
import { describe, expect, it } from 'vitest';
import {
  VARIANT_DEFS, VARIANT_IDS, VARIANT_WEIGHTS, COMBO_LOCKED,
  variantOf, slotComboEligible, rollVariant,
} from '../src/data/variants.js';
import { SIGIL_DEFS } from '../src/data/cards.js';
import { validateDraft, emptyDraft, explainBuildErrors } from '../src/logic/build.js';
import { createWorkshop, chooseReward, placeCard, removeCard, cardKeyOf, cardOf } from '../src/logic/workshop.js';
import { createRun, STARTING_KITS } from '../src/logic/run.js';
import { ComboTracker } from '../src/logic/combo.js';
import { Rng } from '../src/logic/rng.js';

const ALL_DEFS = Object.keys(SIGIL_DEFS);
const NORMAL_DEFS = ALL_DEFS.filter(id => !COMBO_LOCKED.includes(id));
const isSigil = slot => slot?.kind === 'sigil' && typeof slot.defId === 'string';

describe('变体数据', () => {
  it('每张符印都有标准形态，普通法术另有锐/谐，终局法术只有标准', () => {
    for (const defId of ALL_DEFS) expect(VARIANT_DEFS[defId]).toBeTruthy();
    for (const defId of NORMAL_DEFS) {
      expect(Object.keys(VARIANT_DEFS[defId]).sort()).toEqual(['base', 'harmon', 'sharp']);
    }
    for (const defId of COMBO_LOCKED) {
      expect(Object.keys(VARIANT_DEFS[defId])).toEqual(['base']);
    }
    expect(Object.keys(VARIANT_DEFS).sort()).toEqual([...ALL_DEFS].sort());
  });

  it('伤害倍率：标准 1、锐 1.3、谐 0.82；只有谐能联组', () => {
    expect(variantOf('frost_arrow', 'base')).toMatchObject({ damageMul: 1, combo: false });
    expect(variantOf('frost_arrow', 'sharp')).toMatchObject({ damageMul: 1.3, combo: false });
    expect(variantOf('frost_arrow', 'harmon')).toMatchObject({ damageMul: 0.82, combo: true });
    expect(slotComboEligible({ kind: 'sigil', defId: 'frost_arrow', variant: 'harmon' })).toBe(true);
    expect(slotComboEligible({ kind: 'sigil', defId: 'frost_arrow', variant: 'sharp' })).toBe(false);
    expect(slotComboEligible({ kind: 'sigil', defId: 'frost_arrow' })).toBe(false);
    expect(slotComboEligible({ kind: 'auxiliary', defId: 'hourglass' })).toBe(false);
    expect(slotComboEligible(null)).toBe(false);
  });

  it('终局法术永远拿不到谐律形态，脏数据也回退标准', () => {
    for (const defId of COMBO_LOCKED) {
      expect(slotComboEligible({ kind: 'sigil', defId, variant: 'harmon' })).toBe(false);
      expect(variantOf(defId, 'harmon').combo).toBe(false);
    }
    expect(variantOf('not_a_sigil', 'harmon')).toMatchObject({ damageMul: 1, combo: false });
    expect(variantOf('frost_arrow', 'bogus')).toEqual(VARIANT_DEFS.frost_arrow.base);
  });

  it('抽卡权重总和为 1，rng 确定性且终局法术恒标准', () => {
    expect(Object.values(VARIANT_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    const a = new Rng('roll');
    const b = new Rng('roll');
    for (let i = 0; i < 200; i++) {
      expect(rollVariant(a, 'frost_arrow')).toBe(rollVariant(b, 'frost_arrow'));
    }
    for (const defId of COMBO_LOCKED) {
      const rng = new Rng('locked');
      for (let i = 0; i < 50; i++) expect(rollVariant(rng, defId)).toBe('base');
    }
    // 2000 次抽样里三种形态都出现，并且标准最多（权重最大）
    const rng = new Rng('distribution');
    const counts = Object.fromEntries(VARIANT_IDS.map(id => [id, 0]));
    for (let i = 0; i < 2000; i++) counts[rollVariant(rng, 'frost_arrow')]++;
    for (const id of VARIANT_IDS) expect(counts[id]).toBeGreaterThan(0);
    expect(counts.base).toBeGreaterThan(counts.sharp);
    expect(counts.base).toBeGreaterThan(counts.harmon);
  });
});

describe('构筑校验', () => {
  const draftWith = slot => {
    const d = emptyDraft(1);
    d.unlocked = [5];
    d.slots = { 5: slot };
    return d;
  };

  it('缺省变体等同标准形态，合法', () => {
    expect(validateDraft(draftWith({ kind: 'sigil', defId: 'frost_arrow' }))).toEqual([]);
    expect(validateDraft(draftWith({ kind: 'sigil', defId: 'frost_arrow', variant: 'base' }))).toEqual([]);
    expect(validateDraft(draftWith({ kind: 'sigil', defId: 'frost_arrow', variant: 'harmon' }))).toEqual([]);
    expect(validateDraft(draftWith({ kind: 'sigil', defId: 'frost_arrow', variant: 'sharp' }))).toEqual([]);
  });

  it('未知变体、终局法术硬塞谐律、进化字段非空都拒绝', () => {
    expect(validateDraft(draftWith({ kind: 'sigil', defId: 'frost_arrow', variant: 'wrong' })))
      .toEqual([{ code: 'unknown_variant', cellId: '5' }]);
    expect(validateDraft(draftWith({ kind: 'sigil', defId: 'starfall', variant: 'harmon' })))
      .toEqual([{ code: 'unknown_variant', cellId: '5' }]);
    expect(validateDraft(draftWith({ kind: 'sigil', defId: 'frost_arrow', evo: 'x' })).length).toBeGreaterThan(0);
  });

  it('错误说明带变体名', () => {
    const text = explainBuildErrors([{ code: 'unknown_variant', cellId: 5 }],
      { slots: { 5: { kind: 'sigil', defId: 'frost_arrow', variant: 'harmon' } } });
    expect(text).toContain('寒霜箭·谐');
    expect(text).toContain('变体');
  });
});

describe('工作台发牌', () => {
  const make = () => {
    const d = emptyDraft(1);
    d.unlocked = [5, 6];
    d.slots = { 5: { kind: 'sigil', defId: 'arcane_bolt' }, 6: { kind: 'sigil', defId: 'frost_arrow' } };
    return createWorkshop({ draft: d, seed: 'variant-workshop' });
  };

  it('抽出的符印带合法变体，手牌键是三段式', () => {
    const s = make();
    for (const card of s.offer.cards) {
      if (card.kind !== 'sigil') continue;
      expect(VARIANT_IDS).toContain(card.variant);
      expect(VARIANT_DEFS[card.defId][card.variant]).toBeTruthy();
      expect(cardKeyOf(card)).toBe('sigil:' + card.defId + '#' + card.variant);
    }
    expect(cardOf('sigil:frost_arrow#harmon')).toEqual({ kind: 'sigil', defId: 'frost_arrow', variant: 'harmon' });
    expect(cardOf('auxiliary:hourglass')).toEqual({ kind: 'auxiliary', defId: 'hourglass' });
    expect(cardOf('sigil:frost_arrow')).toEqual({ kind: 'sigil', defId: 'frost_arrow', variant: 'base' });
    expect(cardOf('bad')).toBeNull();
  });

  it('装/卸变体卡守恒，槽位保留变体', () => {
    const s = make();
    const card = s.offer.cards.find(c => c.kind === 'sigil' && c.variant === 'harmon')
      ?? { kind: 'sigil', defId: 'frost_arrow', variant: 'harmon' };
    s.hand[cardKeyOf(card)] = 1;
    expect(placeCard(s, 6, cardKeyOf(card)).ok).toBe(true);
    expect(s.draft.slots[6]).toEqual({ kind: 'sigil', defId: card.defId, variant: 'harmon' });
    expect(removeCard(s, 6).ok).toBe(true);
    expect(s.hand[cardKeyOf(card)]).toBe(1);
    expect(validateDraft(s.draft)).toEqual([]);
  });

  it('谐律卡可以抽到，锐化卡不能参与联组', () => {
    const s = make();
    const harmonKey = 'sigil:frost_arrow#harmon';
    s.hand[harmonKey] = 1;
    expect(placeCard(s, 6, harmonKey).ok).toBe(true);
    expect(slotComboEligible(s.draft.slots[6])).toBe(true);
    s.hand['sigil:frost_arrow#sharp'] = 1;
    expect(placeCard(s, 6, 'sigil:frost_arrow#sharp').ok).toBe(true);
    expect(slotComboEligible(s.draft.slots[6])).toBe(false);
  });
});

describe('联组资格闸', () => {
  const grid = (variants) => ({
    cells: {
      4: { slot: { kind: 'sigil', defId: 'frost_arrow', variant: variants[0] }, effIntervalMs: 1000 },
      5: { slot: { kind: 'sigil', defId: 'frost_arrow', variant: variants[1] }, effIntervalMs: 1000 },
    },
  });
  const duo = { defId: 'duo', order: [4, 5], bonus: 0.2 };
  const eligible = slot => slotComboEligible(slot);

  it('谐律摆对偶会触发', () => {
    const g = grid(['harmon', 'harmon']);
    const t = new ComboTracker([duo], 1, eligible);
    t.onTrigger('s', 4, 0, g);
    expect(t.onTrigger('s', 5, 100, g)).toHaveLength(1);
  });

  it('锐化或标准摆同样形状不触发', () => {
    for (const bad of ['sharp', 'base']) {
      const g = grid(['harmon', bad]);
      const t = new ComboTracker([duo], 1, eligible);
      t.onTrigger('s', 4, 0, g);
      expect(t.onTrigger('s', 5, 100, g)).toHaveLength(0);
    }
  });

  it('终局法术的格子永远不参与', () => {
    const g = grid(['harmon', 'harmon']);
    g.cells[5].slot = { kind: 'sigil', defId: 'starfall', variant: 'base' };
    const t = new ComboTracker([duo], 1, eligible);
    t.onTrigger('s', 4, 0, g);
    expect(t.onTrigger('s', 5, 100, g)).toHaveLength(0);
  });

  it('进行中目标格被换成锐化就断链', () => {
    const g = grid(['harmon', 'harmon']);
    const t = new ComboTracker([duo], 1, eligible);
    t.onTrigger('s', 4, 0, g);
    g.cells[5].slot = { kind: 'sigil', defId: 'frost_arrow', variant: 'sharp' };
    expect(t.onTrigger('s', 5, 100, g)).toHaveLength(0);
  });

  it('不传资格回调时保持旧行为（放行）', () => {
    const g = grid(['sharp', 'sharp']);
    const t = new ComboTracker([duo], 1);
    t.onTrigger('s', 4, 0, g);
    expect(t.onTrigger('s', 5, 100, g)).toHaveLength(1);
  });
});

describe('开局套装', () => {
  it('四张起手全部是谐律，第一幕就能摆联组', () => {
    for (const kit of STARTING_KITS) {
      for (const slot of Object.values(kit.slots)) {
        expect(slot.variant).toBe('harmon');
        expect(slotComboEligible(slot)).toBe(true);
      }
    }
    const run = createRun('seed', 'bolt');
    for (const slot of Object.values(run.draft.slots)) {
      expect(isSigil(slot)).toBe(true);
      expect(slotComboEligible(slot)).toBe(true);
    }
  });
});
