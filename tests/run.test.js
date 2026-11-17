import { describe, expect, it } from 'vitest';
import { STARTING_KITS, ACT1_STARTING_CELLS, getKit, createRun, recordAct } from '../src/logic/run.js';
import { applyDraft } from '../src/logic/build.js';
import { CHARACTER_BUFFS, COMPASS_BUFFS } from '../src/logic/progression.js';
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
      expect(run.chapter).toBe(1);
      expect(run.stage).toBe(1);
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
    expect('act' in run).toBe(false);   // 本局只认 chapter/stage，不再有 act 字段
    expect(run.chapter).toBe(1);
    expect(run.stage).toBe(1);
    expect(run.shards).toBe(0);
    // 开局四张固定谐律形态：伤害 -18%，但第一幕就能摆联组。
    expect(run.draft.slots).toEqual({
      4: { kind: 'sigil', defId: 'frost_arrow', variant: 'harmon' },
      5: { kind: 'sigil', defId: 'arcane_bolt', variant: 'harmon' },
      6: { kind: 'sigil', defId: 'flame_burst', variant: 'harmon' },
      9: { kind: 'sigil', defId: 'holy_ward', variant: 'harmon' },
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

  it('同一幕只记录一次报告，报告里带 chapter 与 stage', () => {
    const run = createRun();
    expect(recordAct(run, { triggers: 1 })).toBe(true);
    expect(recordAct(run, { triggers: 999 })).toBe(false);
    expect(run.reports[0]).toMatchObject({ triggers: 1, chapter: 1, stage: 1 });
    // 幕内换场不重复记同一幕（第 4 幕两场只记一条），进下一幕才记第二条。
    run.stage = 5;
    expect(recordAct(run, { triggers: 2 })).toBe(false);
    run.chapter = 2;
    run.stage = 2;
    expect(recordAct(run, { triggers: 2 })).toBe(true);
    expect(run.reports.map(r => r.chapter)).toEqual([1, 2]);
    expect(run.reports[1].stage).toBe(2);
  });
});


describe('三职业本命被动', () => {
  it('每套绑两条 already-existing 被动，且 id 都能在现有池里查到', () => {
    const ids = new Set([...CHARACTER_BUFFS, ...COMPASS_BUFFS].map(b => b.id));
    for (const kit of STARTING_KITS) {
      expect(kit.role.length).toBeGreaterThan(0);
      expect(kit.affinity).toHaveLength(2);
      expect(new Set(kit.affinity).size).toBe(2);
      for (const id of kit.affinity) expect(ids.has(id)).toBe(true);
    }
    expect(STARTING_KITS.map(k => k.affinity)).toEqual([
      ['swift', 'haste'], ['might', 'chain'], ['aegis', 'tough'],
    ]);
  });

  it('疾风：开局移速 ×1.08、触发间隔 ×0.92', () => {
    const run = createRun('kit', 'bolt');
    expect(run.kitId).toBe('bolt');
    expect(run.kitAffinity).toEqual(['swift', 'haste']);
    expect(run.characterStats.speedMult).toBeCloseTo(1.08, 10);
    expect(run.characterStats.shield).toBe(0);
    expect(run.compassBuffs.intervalMul).toBeCloseTo(0.92, 10);
    expect(run.compassBuffs.damageMul).toBe(1);
  });

  it('烈焰：开局伤害 ×1.12、连击窗口 ×1.25', () => {
    const run = createRun('kit', 'flame');
    expect(run.characterStats.speedMult).toBe(1);
    expect(run.characterStats.maxHp).toBe(100);
    expect(run.compassBuffs.damageMul).toBeCloseTo(1.12, 10);
    expect(run.compassBuffs.comboWindowMul).toBeCloseTo(1.25, 10);
  });

  it('壁垒：护盾上限 34、无敌 +0.15s、开局 6 点盾', () => {
    const run = createRun('kit', 'ward');
    expect(run.characterStats.shieldCap).toBeCloseTo(34, 10);
    expect(run.characterStats.iframesBonus).toBeCloseTo(0.15, 10);
    expect(run.characterStats.shield).toBe(6);
    expect(run.compassBuffs.damageMul).toBe(1);
  });

  it('回退 kit 也带上第一套的职业数据', () => {
    const run = createRun('fallback-kit', 'nope');
    expect(run.kitId).toBe('bolt');
    expect(run.kitAffinity).toEqual(['swift', 'haste']);
    expect(run.characterStats.speedMult).toBeCloseTo(1.08, 10);
  });
});
