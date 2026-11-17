import { describe, it, expect } from 'vitest';
import { createGrid, rebuildDerived } from '../src/logic/grid.js';
import { resolveComboBonus, SIGIL_DEFS, castTimeOf } from '../src/logic/effects.js';
import { LINKAGES, linkageFor, linkageKeyOf } from '../src/data/linkages.js';
import { groupLinkage, linkageReady, markLinkage, LINKAGE_COOLDOWN_MS } from '../src/logic/linkage.js';
import { slotComboEligible, COMBO_LOCKED } from '../src/data/variants.js';

function grid16() {
  const g = createGrid();
  for (const c of g.cells) c.unlocked = true;
  rebuildDerived(g, 2000);
  return g;
}

describe('连携数据', () => {
  it('10 对搭档，20 张法术每张只出现一次', () => {
    expect(LINKAGES.length).toBe(10);
    const seen = new Map();
    for (const item of LINKAGES) {
      for (const defId of [item.a, item.b]) seen.set(defId, (seen.get(defId) ?? 0) + 1);
    }
    expect(seen.size).toBe(20);
    for (const [defId, n] of seen) expect(n, defId).toBe(1);
  });

  it('每对 id 唯一、名字与加成都合法', () => {
    expect(new Set(LINKAGES.map(l => l.id)).size).toBe(10);
    for (const item of LINKAGES) {
      expect(item.name).toBeTruthy();
      expect(item.desc).toBeTruthy();
      expect(item.bonus).toBeGreaterThan(0);
      expect(SIGIL_DEFS[item.a], item.a).toBeTruthy();
      expect(SIGIL_DEFS[item.b], item.b).toBeTruthy();
    }
  });

  it('参与连携的法术都不是强力禁联组法术', () => {
    for (const item of LINKAGES) {
      expect(COMBO_LOCKED.includes(item.a), item.a).toBe(false);
      expect(COMBO_LOCKED.includes(item.b), item.b).toBe(false);
      // 谐律变体才可联组：数据层资格对 base 为 false，对 harmon 为 true
      expect(slotComboEligible({ kind: 'sigil', defId: item.a, variant: 'harmon' })).toBe(true);
      expect(slotComboEligible({ kind: 'sigil', defId: item.a, variant: 'base' })).toBe(false);
    }
  });

  it('linkageFor 无序，linkageKeyOf 与顺序无关', () => {
    expect(linkageFor('frost_arrow', 'flame_burst')?.name).toBe('霜火');
    expect(linkageFor('flame_burst', 'frost_arrow')?.name).toBe('霜火');
    expect(linkageFor('frost_arrow', 'sunflare')).toBeNull();
    expect(linkageKeyOf('a', 'b')).toBe(linkageKeyOf('b', 'a'));
  });
});

describe('组内配对与冷却', () => {
  it('groupLinkage 只在组里两种法术都在时成立', () => {
    const g = grid16();
    g.cells[0].slot = { kind: 'sigil', defId: 'frost_arrow', variant: 'harmon' };
    g.cells[1].slot = { kind: 'sigil', defId: 'frost_arrow', variant: 'harmon' };
    expect(groupLinkage(g, [0, 1])).toBeNull();
    g.cells[2].slot = { kind: 'sigil', defId: 'flame_burst', variant: 'harmon' };
    const hit = groupLinkage(g, [0, 1, 2]);
    expect(hit.pair.id).toBe('frostfire');
    expect(hit.aCell).toBe(0);
    expect(hit.bCell).toBe(2);
  });

  it('同对冷却 1.5 秒：冷却内不重复触发', () => {
    const st = { now: 0, linkageCd: {} };
    expect(linkageReady(st, 'frost_arrow', 'flame_burst')).toBe(true);
    markLinkage(st, 'frost_arrow', 'flame_burst');
    expect(st.linkageCd[linkageKeyOf('frost_arrow', 'flame_burst')]).toBe(LINKAGE_COOLDOWN_MS);
    expect(linkageReady(st, 'flame_burst', 'frost_arrow')).toBe(false);
    st.now = LINKAGE_COOLDOWN_MS;
    expect(linkageReady(st, 'frost_arrow', 'flame_burst')).toBe(true);
  });
});

describe('连携结算', () => {
  function state(now = 0) {
    return { player: { x: 0, y: 0, hp: 100, maxHp: 100, shield: 0 }, now, linkageCd: {} };
  }
  function enemy(id, x, y) {
    return { id, x, y, hp: 200, maxHp: 200, alive: true, armor: 0 };
  }

  it('组内有配对法术时追加一笔连携伤害，并记反馈字段', () => {
    const g = grid16();
    g.cells[0].slot = { kind: 'sigil', defId: 'frost_arrow', variant: 'harmon' };
    g.cells[1].slot = { kind: 'sigil', defId: 'flame_burst', variant: 'harmon' };
    const st = state();
    const e = enemy(1, 20, 0);
    const r = resolveComboBonus({ grid: g, order: [0, 1], bonus: 0.2, state: st, enemies: [e], defId: 'duo' });
    // 联组 3.8 + 连携（10 + 9）× 0.5 = 9.5
    expect(r.linkage?.name).toBe('霜火');
    expect(r.linkage.damage).toBeCloseTo(9.5, 6);
    expect(r.damage).toBeCloseTo(3.8 + 9.5, 6);
    expect(st.linkageCd.frost_arrow).toBeUndefined();
    expect(Object.keys(st.linkageCd).length).toBe(1);
  });

  it('冷却内第二次联组不再追加连携伤害', () => {
    const g = grid16();
    g.cells[0].slot = { kind: 'sigil', defId: 'frost_arrow', variant: 'harmon' };
    g.cells[1].slot = { kind: 'sigil', defId: 'flame_burst', variant: 'harmon' };
    const st = state();
    const e = enemy(1, 20, 0);
    const first = resolveComboBonus({ grid: g, order: [0, 1], bonus: 0.2, state: st, enemies: [e], defId: 'duo' });
    expect(first.linkage).toBeTruthy();
    const e2 = enemy(2, -20, 0);
    st.now = 500;
    const second = resolveComboBonus({ grid: g, order: [0, 1], bonus: 0.2, state: st, enemies: [e2], defId: 'duo' });
    expect(second.linkage).toBeNull();
    st.now = LINKAGE_COOLDOWN_MS;
    const third = resolveComboBonus({ grid: g, order: [0, 1], bonus: 0.2, state: st, enemies: [e2], defId: 'duo' });
    expect(third.linkage?.name).toBe('霜火');
  });

  it('组里没有配对法术时不产生连携', () => {
    const g = grid16();
    g.cells[0].slot = { kind: 'sigil', defId: 'frost_arrow', variant: 'harmon' };
    g.cells[1].slot = { kind: 'sigil', defId: 'thorn_vine', variant: 'harmon' };
    const r = resolveComboBonus({ grid: g, order: [0, 1], bonus: 0.2, state: state(), enemies: [enemy(1, 20, 0)], defId: 'duo' });
    expect(r.linkage ?? null).toBeNull();
  });
});

describe('前摇数据', () => {
  it('5 张「范围大/前摇长」的法术带 castMs，前摇口径为毫秒', () => {
    const withCast = Object.entries(SIGIL_DEFS).filter(([, def]) => Number.isFinite(def.castMs) && def.castMs > 0);
    expect(withCast.map(([id]) => id).sort()).toEqual(['bramble_maul', 'frost_nova', 'glacier', 'sunflare', 'thunder_storm']);
    for (const [defId, def] of withCast) expect(def.kind, defId).not.toBe('ward');
    expect(castTimeOf('frost_nova')).toBe(600);
    expect(castTimeOf('thunder_storm')).toBe(400);
    expect(castTimeOf('sunflare')).toBe(700);
    expect(castTimeOf('glacier')).toBe(450);
    expect(castTimeOf('frost_arrow')).toBe(0);
    expect(castTimeOf('not_a_spell')).toBe(0);
  });
});
