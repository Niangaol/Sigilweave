import { describe, it, expect } from 'vitest';
import { createGrid, rebuildDerived } from '../src/logic/grid.js';
import { FACTIONS, SIGIL_FACTION, factionOf, REACTIONS, UNDEAD_OR_CORRUPT, RESONANCE_STEP, RESONANCE_CAP } from '../src/data/factions.js';
import { resonanceMultiplier, reactionFor, reactionAt, neighborFactions } from '../src/logic/resonance.js';
import { damageMultiplier, applyDamage, resolveSigilTrigger, SIGIL_DEFS } from '../src/logic/effects.js';
import { ENEMY_TYPES } from '../src/data/roster.js';

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
  return { id, x, y, hp, maxHp: hp, alive: opts.alive ?? true, armor: opts.armor ?? 0, defId: opts.defId };
}

describe('派系数据', () => {
  it('每张符印都有派系，且派系 id 合法', () => {
    const defIds = Object.keys(SIGIL_DEFS);
    for (const defId of defIds) {
      expect(SIGIL_FACTION[defId], defId).toBeTruthy();
      expect(FACTIONS[SIGIL_FACTION[defId]], defId).toBeTruthy();
    }
    // 波 4 的 8 张新法术先登记派系、数值后落地：允许映射表更宽，但不允许缺漏
    expect(Object.keys(SIGIL_FACTION).length).toBeGreaterThanOrEqual(defIds.length);
    for (const defId of Object.keys(SIGIL_DEFS)) expect(SIGIL_FACTION[defId], defId).toBeTruthy();
    expect(factionOf('not_a_spell')).toBeNull();
  });

  it('七派系每系至少一张法术', () => {
    for (const id of Object.keys(FACTIONS)) {
      expect(Object.values(SIGIL_FACTION).filter(f => f === id).length, id).toBeGreaterThan(0);
    }
  });

  it('四对反应合法且两两不同', () => {
    const pairs = Object.values(REACTIONS).map(r => r.pair);
    expect(pairs.length).toBe(4);
    for (const [a, b] of pairs) {
      expect(FACTIONS[a]).toBeTruthy();
      expect(FACTIONS[b]).toBeTruthy();
      expect(a).not.toBe(b);
    }
    expect(new Set(pairs.map(([a, b]) => [a, b].sort().join('+'))).size).toBe(4);
  });

  it('净化目标名都是真实敌人类型', () => {
    for (const defId of UNDEAD_OR_CORRUPT) expect(ENEMY_TYPES[defId], defId).toBeTruthy();
    for (const defId of UNDEAD_OR_CORRUPT) expect(['skeleton', 'bat', 'corpse', 'stitch_abomination', 'wraith', 'verdict_wraith', 'cultist', 'oath_bishop', 'void_elemental']).toContain(defId);
  });
});

describe('同系共鸣', () => {
  it('单个同派系正交邻居 +10%', () => {
    const g = grid16();
    g.cells[5].slot = { kind: 'sigil', defId: 'arcane_bolt' };
    g.cells[6].slot = { kind: 'sigil', defId: 'mana_siphon' };
    expect(resonanceMultiplier(g, 5)).toBeCloseTo(1 + RESONANCE_STEP, 6);
  });

  it('两个邻居 +20%，四个邻居封顶 +30%', () => {
    const g = grid16();
    g.cells[5].slot = { kind: 'sigil', defId: 'arcane_bolt' };
    g.cells[1].slot = { kind: 'sigil', defId: 'mana_siphon' };
    g.cells[9].slot = { kind: 'sigil', defId: 'echo_sigil' };
    expect(resonanceMultiplier(g, 5)).toBeCloseTo(1.2, 6);
    g.cells[4].slot = { kind: 'sigil', defId: 'pierce_lance' };
    g.cells[6].slot = { kind: 'sigil', defId: 'void_lance' };
    expect(resonanceMultiplier(g, 5)).toBeCloseTo(1 + RESONANCE_CAP, 6);
  });

  it('异派系、空格、辅助卡都不共鸣', () => {
    const g = grid16();
    g.cells[5].slot = { kind: 'sigil', defId: 'arcane_bolt' };
    g.cells[6].slot = { kind: 'sigil', defId: 'frost_arrow' };
    g.cells[1].slot = { kind: 'auxiliary', defId: 'slow_field' };
    expect(resonanceMultiplier(g, 5)).toBe(1);
    expect(resonanceMultiplier(g, 15)).toBe(1);
    expect(neighborFactions(g, 5)).toEqual(['frost']);
  });

  it('共鸣进伤害倍率：同系邻格让 12 点变 13.2', () => {
    const g = grid16();
    g.cells[5].slot = { kind: 'sigil', defId: 'arcane_bolt' };
    g.cells[6].slot = { kind: 'sigil', defId: 'mana_siphon' };
    const e = enemy(1, 10, 0);
    const r = resolveSigilTrigger({ grid: g, cellId: 5, defId: 'arcane_bolt', state: state(), enemies: [e] });
    expect(r.damage).toBeCloseTo(12 * 1.1, 6);
  });
});

describe('异系反应判定', () => {
  it('reactionFor 无序：正反都同一反应', () => {
    expect(reactionFor('frost', 'fire')?.id).toBe('melt');
    expect(reactionFor('fire', 'frost')?.id).toBe('melt');
    expect(reactionFor('storm', 'frost')?.id).toBe('conduct');
    expect(reactionFor('fire', 'wild')?.id).toBe('scorch');
    expect(reactionFor('soul', 'holy')?.id).toBe('purify');
    expect(reactionFor('frost', 'frost')).toBeNull();
    expect(reactionFor('frost', 'arcane')).toBeNull();
  });

  it('reactionAt 只看正交相邻', () => {
    const g = grid16();
    g.cells[5].slot = { kind: 'sigil', defId: 'frost_arrow' };
    expect(reactionAt(g, 5)).toBeNull();
    g.cells[6].slot = { kind: 'sigil', defId: 'flame_burst' };
    expect(reactionAt(g, 5)?.id).toBe('melt');
    expect(reactionAt(g, 6)?.id).toBe('melt');
  });
});

describe('反应结算', () => {
  it('融化：目标挂 2 秒 15% 易伤，窗口内伤害生效、过期失效', () => {
    const g = grid16();
    g.cells[5].slot = { kind: 'sigil', defId: 'frost_arrow' };
    g.cells[6].slot = { kind: 'sigil', defId: 'flame_burst' };
    const st = state();
    const e = enemy(1, 20, 0);
    const r = resolveSigilTrigger({ grid: g, cellId: 5, defId: 'frost_arrow', state: st, enemies: [e] });
    expect(r.reaction?.id).toBe('melt');
    expect(e.vulnUntil).toBe(2000);
    expect(e.vulnFactor).toBeCloseTo(1.15, 6);
    const hp = e.hp;
    applyDamage(e, 10, 0);
    expect(hp - e.hp).toBeCloseTo(11.5, 6);
    applyDamage(e, 10, 2000);
    expect(hp - e.hp).toBeCloseTo(21.5, 6);
  });

  it('导电：冻结 1.2 秒并向最近的其他敌人补一跳', () => {
    const g = grid16();
    g.cells[5].slot = { kind: 'sigil', defId: 'chain_lightning' };
    g.cells[6].slot = { kind: 'sigil', defId: 'frost_arrow' };
    const near = enemy(1, 20, 0);
    const far = enemy(2, 150, 0);
    const r = resolveSigilTrigger({ grid: g, cellId: 5, defId: 'chain_lightning', state: state(), enemies: [near, far] });
    expect(r.reaction?.id).toBe('conduct');
    expect(r.reaction.extraTargets).toEqual([far]);
    expect(near.frozenUntil).toBe(1200);
    expect(far.hp).toBeCloseTo(100 - 12 * 0.3, 6);
  });

  it('灼烧：每个目标额外 90% 伤害（分三段）', () => {
    const g = grid16();
    g.cells[5].slot = { kind: 'sigil', defId: 'flame_burst' };
    g.cells[6].slot = { kind: 'sigil', defId: 'thorn_vine' };
    const e = enemy(1, 20, 0);
    const r = resolveSigilTrigger({ grid: g, cellId: 5, defId: 'flame_burst', state: state(), enemies: [e], aimPoint: { x: 20, y: 0 } });
    expect(r.reaction?.id).toBe('scorch');
    expect(e.hp).toBeCloseTo(100 - 9 * 1.9, 6);
  });

  it('净化：不死目标额外 40% 伤害并回血 2', () => {
    const g = grid16();
    g.cells[5].slot = { kind: 'sigil', defId: 'soul_lance' };
    g.cells[6].slot = { kind: 'sigil', defId: 'holy_ward' };
    const st = state();
    st.player.hp = 90;
    const e = enemy(1, 20, 0, { defId: 'skeleton' });
    const r = resolveSigilTrigger({ grid: g, cellId: 5, defId: 'soul_lance', state: st, enemies: [e] });
    expect(r.reaction?.id).toBe('purify');
    expect(r.reaction.healed).toBe(2);
    // 噬魂箭自带回复 3，再加净化 2 → 95
    expect(st.player.hp).toBe(95);
    expect(e.hp).toBeCloseTo(100 - 15 * 1.4, 6);
  });

  it('同格 2 秒内只反应一次，冷却后恢复', () => {
    const g = grid16();
    g.cells[5].slot = { kind: 'sigil', defId: 'frost_arrow' };
    g.cells[6].slot = { kind: 'sigil', defId: 'flame_burst' };
    const st = state();
    const e = enemy(1, 20, 0);
    expect(resolveSigilTrigger({ grid: g, cellId: 5, defId: 'frost_arrow', state: st, enemies: [e] }).reaction?.id).toBe('melt');
    st.now = 1000;
    expect(resolveSigilTrigger({ grid: g, cellId: 5, defId: 'frost_arrow', state: st, enemies: [e] }).reaction).toBeUndefined();
    st.now = 2500;
    expect(resolveSigilTrigger({ grid: g, cellId: 5, defId: 'frost_arrow', state: st, enemies: [e] }).reaction?.id).toBe('melt');
  });

  it('不同格各自计冷却，互不影响', () => {
    const g = grid16();
    g.cells[5].slot = { kind: 'sigil', defId: 'frost_arrow' };
    g.cells[6].slot = { kind: 'sigil', defId: 'flame_burst' };
    const st = state();
    const e = enemy(1, 20, 0);
    expect(resolveSigilTrigger({ grid: g, cellId: 5, defId: 'frost_arrow', state: st, enemies: [e] }).reaction?.id).toBe('melt');
    expect(resolveSigilTrigger({ grid: g, cellId: 6, defId: 'flame_burst', state: st, enemies: [e], aimPoint: { x: 20, y: 0 } }).reaction?.id).toBe('melt');
  });
});
