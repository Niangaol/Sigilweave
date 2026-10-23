import { describe, expect, it } from 'vitest';
import { STARTING_KITS, ACT1_STARTING_CELLS, getKit, createRun, recordAct } from '../src/logic/run.js';
import { applyDraft } from '../src/logic/build.js';
import { createGrid } from '../src/logic/grid.js';
import { SIGIL_DEFS } from '../src/data/cards.js';

const BASIC = new Set(['arcane_bolt', 'frost_arrow', 'flame_burst', 'holy_ward', 'mana_siphon', 'thorn_vine']);
const LATE = new Set(['starfall', 'judgment_hammer']);
const CELLS = [4, 5, 6, 7, 9, 10];
const slotsOf = draft => Object.entries(draft.slots);
const outputsOf = draft => slotsOf(draft).filter(([cellId, slot]) => slot?.kind === 'sigil'
  && !(draft.runes?.[cellId] ?? []).includes('relay'));
const slotIds = draft => slotsOf(draft).map(([, slot]) => slot.defId);

describe('开局法术套装', () => {
  it('第一套是默认 bolt，三套 id 唯一且带名称与一句话风格', () => {
    expect(STARTING_KITS).toHaveLength(3);
    expect(STARTING_KITS[0].id).toBe('bolt');
    expect(STARTING_KITS.map(kit => kit.id)).toEqual(['bolt', 'flame', 'ward']);
    expect(new Set(STARTING_KITS.map(kit => kit.id)).size).toBe(3);
    for (const kit of STARTING_KITS) {
      expect(kit.name.length).toBeGreaterThan(0);
      expect(kit.tagline.length).toBeGreaterThan(0);
      expect(kit.slots).toBeTruthy();
    }
  });

  it('每套四张主槽、只用基础法术、不偷放后期卡', () => {
    for (const kit of STARTING_KITS) {
      expect(Object.keys(kit.slots)).toHaveLength(4);
      for (const [cellId, slot] of Object.entries(kit.slots)) {
        expect(CELLS).toContain(Number(cellId));
        expect(slot.kind).toBe('sigil');
        expect(BASIC.has(slot.defId)).toBe(true);
        expect(LATE.has(slot.defId)).toBe(false);
        expect(SIGIL_DEFS[slot.defId]).toBeTruthy();
      }
      expect(new Set(slotIds(kit)).size).toBe(4);
    }
  });

  it('每套都通过 applyDraft，第一幕固定解封 6 格且至少两张非中继输出', () => {
    for (const kit of STARTING_KITS) {
      const run = createRun('balance', kit.id);
      expect(run.act).toBe(1);
      expect(run.draft.unlocked).toEqual(CELLS);
      expect(run.draft.unlocked).toEqual(ACT1_STARTING_CELLS);
      expect(run.draft.unlocked).toHaveLength(6);
      expect(slotsOf(run.draft)).toHaveLength(4);
      expect(outputsOf(run.draft).length).toBeGreaterThanOrEqual(2);
      const result = applyDraft(createGrid(), run.draft, { phase: 'intermission' });
      expect(result.ok).toBe(true);
      expect(result.snapshot).toBeTruthy();
      for (const [cellId, slot] of Object.entries(kit.slots)) {
        expect(result.snapshot.slots[cellId]).toEqual(slot);
      }
    }
  });

  it('风格与建议一致：疾风带飞弹寒霜、烈焰带喷涌汲取、壁垒带圣光', () => {
    const ids = new Map(STARTING_KITS.map(kit => [kit.id, slotIds(kit)]));
    expect(ids.get('bolt')).toEqual(expect.arrayContaining(['arcane_bolt', 'frost_arrow']));
    expect(ids.get('flame')).toEqual(expect.arrayContaining(['flame_burst', 'mana_siphon']));
    expect(ids.get('ward')).toEqual(expect.arrayContaining(['holy_ward', 'frost_arrow']));
  });

  it('createRun 默认兼容旧四张起手，且与显式 bolt 完全一致', () => {
    const run = createRun('compat');
    expect(run.seed).toBe('compat');
    expect(run.act).toBe(1);
    expect(run.shards).toBe(0);
    expect(run.draft.slots).toEqual({
      4: { kind: 'sigil', defId: 'frost_arrow' },
      5: { kind: 'sigil', defId: 'arcane_bolt' },
      6: { kind: 'sigil', defId: 'flame_burst' },
      9: { kind: 'sigil', defId: 'holy_ward' },
    });
    expect(createRun('compat').draft.slots).toEqual(createRun('compat', 'bolt').draft.slots);
    expect(createRun(123).seed).toBe('123');
    expect(getKit('bolt')).toBe(STARTING_KITS[0]);
    expect(getKit('flame').name).toBe('烈焰');
  });

  it('非法或缺失 kitId 回退第一套', () => {
    const base = createRun('fallback', 'bolt').draft.slots;
    for (const bad of ['nope', '', 'BOLT', null, 0, 42, {}]) {
      expect(createRun('fallback', bad).draft.slots).toEqual(base);
    }
    expect(createRun('fallback', undefined).draft.slots).toEqual(base);
    expect(getKit('nope')).toBe(STARTING_KITS[0]);
    expect(getKit(undefined)).toBe(STARTING_KITS[0]);
  });

  it('每次开局独立拷贝槽位，改本局不会污染套装模板', () => {
    const a = createRun('copy', 'flame');
    a.draft.slots[4].defId = 'starfall';
    const b = createRun('copy', 'flame');
    expect(b.draft.slots[4].defId).toBe('flame_burst');
    expect(getKit('flame').slots[4].defId).toBe('flame_burst');
  });

  it('同一幕只记录一次报告', () => {
    const run = createRun();
    expect(recordAct(run, { triggers: 1 })).toBe(true);
    expect(recordAct(run, { triggers: 999 })).toBe(false);
    expect(run.reports[0].triggers).toBe(1);
  });
});
