import { describe, it, expect } from 'vitest';
import { createGrid, rebuildDerived } from '../src/logic/grid.js';
import { validateDraft, BUILD_ERROR } from '../src/logic/build.js';
import { resolveSigilTrigger, SIGIL_DEFS } from '../src/logic/effects.js';
import { EVOLUTIONS, evolutionOf, evoModsOf, slotEvolved } from '../src/data/evolutions.js';
import { ACTS } from '../src/logic/constants.js';

function grid16() {
  const g = createGrid();
  for (const c of g.cells) c.unlocked = true;
  rebuildDerived(g, 2000);
  return g;
}

function state(now = 0) {
  return { player: { x: 0, y: 0, hp: 100, maxHp: 100, shield: 0 }, now };
}

function enemy(id, x, y, opts = {}) {
  const hp = opts.hp ?? 100;
  return { id, x, y, hp, maxHp: hp, alive: true, armor: opts.armor ?? 0 };
}

function place(grid, cellId, defId, evo, variant = 'base') {
  grid.cells[cellId].slot = { kind: 'sigil', defId, variant, evo };
}

function fire(grid, cellId, defId, { enemies = [enemy(1, 20, 0)], st = state(), aim } = {}) {
  return resolveSigilTrigger({ grid, cellId, defId, state: st, enemies, aimPoint: aim });
}

describe('进化数据', () => {
  it('每张法术两条路线，id 唯一且都有名字描述', () => {
    for (const [defId, routes] of Object.entries(EVOLUTIONS)) {
      expect(routes.length, defId).toBe(2);
      expect(new Set(routes.map(r => r.id)).size, defId).toBe(2);
      for (const route of routes) {
        expect(route.name, defId).toBeTruthy();
        expect(route.desc, defId).toBeTruthy();
        expect(route.mods && typeof route.mods).toBe('object');
      }
    }
  });

  it('现有 16 张符印全部有进化路线', () => {
    for (const defId of Object.keys(SIGIL_DEFS)) expect(EVOLUTIONS[defId], defId).toBeTruthy();
  });

  it('查询函数：未知法术/路线返回 null', () => {
    expect(evolutionOf('frost_arrow', 'glacier_arrow')?.name).toBe('冰河箭');
    expect(evolutionOf('frost_arrow', 'nope')).toBeNull();
    expect(evolutionOf('nope', 'glacier_arrow')).toBeNull();
    expect(evoModsOf({ kind: 'sigil', defId: 'frost_arrow' })).toBeNull();
    expect(evoModsOf({ kind: 'sigil', defId: 'frost_arrow', evo: 'glacier_arrow' }).damageMul).toBe(1.4);
    expect(slotEvolved({ kind: 'sigil', defId: 'frost_arrow', evo: 'glacier_arrow' })).toBe(true);
    expect(slotEvolved({ kind: 'auxiliary', defId: 'hourglass', evo: 'x' })).toBe(false);
  });
});

describe('进化校验', () => {
  const draft = (slot) => ({
    version: 1, act: 1, unlocked: [0, 1],
    slots: { 0: slot }, runes: {}, exits: {}, auxTargets: {},
  });

  it('合法进化通过', () => {
    expect(validateDraft(draft({ kind: 'sigil', defId: 'frost_arrow', evo: 'glacier_arrow' }))).toEqual([]);
  });

  it('未知路线报 unknown_evolution', () => {
    const errors = validateDraft(draft({ kind: 'sigil', defId: 'frost_arrow', evo: 'not_a_route' }));
    expect(errors[0].code).toBe(BUILD_ERROR.UNKNOWN_EVOLUTION);
  });

  it('辅助卡带 evo 报 slot_conflict', () => {
    const errors = validateDraft(draft({ kind: 'auxiliary', defId: 'hourglass', evo: 'glacier_arrow' }));
    expect(errors[0].code).toBe(BUILD_ERROR.SLOT_CONFLICT);
  });
});

describe('进化结算', () => {
  it('冰河箭：伤害 ×1.4、减速更强更久', () => {
    const g = grid16();
    place(g, 5, 'frost_arrow', 'glacier_arrow');
    const e = enemy(1, 20, 0);
    const r = fire(g, 5, 'frost_arrow', { enemies: [e] });
    expect(r.damage).toBeCloseTo(14, 6);
    expect(e.slowFactor).toBeCloseTo(0.45, 6);
    expect(e.slowUntil).toBe(2600);
  });

  it('碎冰箭：命中冻结 0.8 秒', () => {
    const g = grid16();
    place(g, 5, 'frost_arrow', 'shatter_arrow');
    const e = enemy(1, 20, 0);
    fire(g, 5, 'frost_arrow', { enemies: [e] });
    expect(e.frozenUntil).toBe(800);
  });

  it('风暴连锁：跳数 2 → 4，能连到 5 个目标', () => {
    const g = grid16();
    place(g, 5, 'chain_lightning', 'storm_chain');
    const enemies = [0, 40, 80, 120, 160].map((x, i) => enemy(i + 1, x, 0));
    const r = fire(g, 5, 'chain_lightning', { enemies });
    expect(r.hits).toBe(5);
  });

  it('过载：每跳衰减从 0.7 提到 0.88', () => {
    const g = grid16();
    place(g, 5, 'chain_lightning', 'overload');
    const enemies = [enemy(1, 20, 0), enemy(2, 60, 0)];
    const r = fire(g, 5, 'chain_lightning', { enemies });
    const expected = 12 + 12 * 0.88;
    expect(r.damage).toBeCloseTo(expected, 6);
  });

  it('毒藤：追加 60% 毒伤，一次触发打出 1.6 倍', () => {
    const g = grid16();
    place(g, 5, 'thorn_vine', 'venom_vine');
    const e = enemy(1, 20, 0);
    const r = fire(g, 5, 'thorn_vine', { enemies: [e] });
    expect(r.damage).toBeCloseTo(8, 6);
    expect(e.hp).toBeCloseTo(92, 6);
  });

  it('堡垒：护盾 7 → 17，上限 24 → 40', () => {
    const g = grid16();
    place(g, 5, 'holy_ward', 'bastion');
    const st = state();
    st.player.shield = 34;
    fire(g, 5, 'holy_ward', { enemies: [], st });
    expect(st.player.shield).toBe(40);
  });

  it('报应：对带护甲目标额外 40% 伤害', () => {
    const g = grid16();
    place(g, 5, 'judgment_hammer', 'retribution');
    // armor 是 0..1 的减伤比例：0.3 = 减伤 30%
    const e = enemy(1, 20, 0, { armor: 0.3 });
    fire(g, 5, 'judgment_hammer', { enemies: [e] });
    // base = 18 × 1.15 = 20.7；本体 20.7 × 0.7 = 14.49，报应追加 20.7 × 1.2 × 0.7 = 17.388
    expect(e.hp).toBeCloseTo(100 - 14.49 - 17.388, 6);
  });

  it('深渊之口：定身 2.4 秒', () => {
    const g = grid16();
    place(g, 5, 'quake_maw', 'abyss');
    const e = enemy(1, 20, 0);
    fire(g, 5, 'quake_maw', { enemies: [e] });
    expect(e.rootUntil).toBe(2400);
  });

  it('野火：冷却倍率 0.7 反映到 effCooldownMs', () => {
    const g = grid16();
    place(g, 15, 'flame_burst', null);
    rebuildDerived(g, ACTS[0].baseIntervalMs);
    const base = g.cells[15].effCooldownMs;
    place(g, 15, 'flame_burst', 'wildfire');
    rebuildDerived(g, ACTS[0].baseIntervalMs);
    expect(g.cells[15].effCooldownMs).toBeCloseTo(base * 0.7, 6);
  });
});
