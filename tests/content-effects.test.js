import { describe, it, expect } from 'vitest';
import { createGrid, rebuildDerived } from '../src/logic/grid.js';
import { applyDraft, emptyDraft } from '../src/logic/build.js';
import { applyDamage, resolveSigilTrigger, resolveComboBonus } from '../src/logic/effects.js';

// 全部格解封的 4x4 法阵，派生值按 2000ms 基础间隔重算。
function full() {
  const grid = createGrid();
  for (const c of grid.cells) c.unlocked = true;
  rebuildDerived(grid, 2000);
  return grid;
}

function player(x = 0, y = 0, shield = 0) {
  return { x, y, hp: 100, maxHp: 100, shield };
}

function state(shield = 0) {
  return { player: player(0, 0, shield), now: 0 };
}

function enemy(id, x, y, opts = {}) {
  const hp = opts.hp ?? 100;
  return { id, x, y, hp, maxHp: hp, alive: opts.alive ?? true, armor: opts.armor ?? 0 };
}

function sigil(grid, cellId, defId) {
  grid.cells[cellId].slot = { kind: 'sigil', defId };
}

// 献祭占主槽：auxTarget 指向相邻符印格。
function sacrificeAt(grid, sigilCell, auxCell, sigilDefId = 'arcane_bolt') {
  sigil(grid, sigilCell, sigilDefId);
  grid.cells[auxCell].slot = { kind: 'auxiliary', defId: 'sacrifice' };
  grid.cells[auxCell].auxTarget = sigilCell;
  rebuildDerived(grid, 2000);
  return grid;
}

const RESULT_KEYS = ['hits', 'damage', 'aim', 'empty', 'targets', 'sacrificeSpent', 'sacrificeApplied'];

describe('星陨内圈衰减', () => {
  it('内圈目标受 70% 伤害，外圈目标全额，多目标同屏各自结算', () => {
    const g = full();
    sigil(g, 5, 'starfall');
    const inner = enemy(1, -30, -30); // 落点本身（区域 5 内最近敌）
    const outer = enemy(2, -30, 25); // 距落点 55，外圈
    const r = resolveSigilTrigger({ grid: g, cellId: 5, defId: 'starfall', state: state(), enemies: [inner, outer], half: 120 });
    expect(r.hits).toBe(2);
    expect(inner.hp).toBeCloseTo(100 - 22 * 0.7, 6);
    expect(outer.hp).toBeCloseTo(100 - 22, 6);
    expect(r.damage).toBeCloseTo(22 * 0.7 + 22, 6);
  });

  it('内圈边界 35 以内衰减、35 以外全额，外圈边界 70 仍命中', () => {
    const g = full();
    sigil(g, 5, 'starfall');
    const aim = { x: -30, y: -30 };
    const atInnerEdge = enemy(1, -30 + 35, -30); // 恰好 35
    const justOutsideInner = enemy(2, -30 + 36, -30); // 36
    const atOuterEdge = enemy(3, -30 + 70, -30); // 恰好 70
    const beyondOuter = enemy(4, -30 + 71, -30); // 71
    const r = resolveSigilTrigger({ grid: g, cellId: 5, defId: 'starfall', state: state(), enemies: [atInnerEdge, justOutsideInner, atOuterEdge, beyondOuter], aimPoint: aim, half: 120 });
    expect(r.hits).toBe(3);
    expect(atInnerEdge.hp).toBeCloseTo(100 - 22 * 0.7, 6);
    expect(justOutsideInner.hp).toBeCloseTo(100 - 22, 6);
    expect(atOuterEdge.hp).toBeCloseTo(100 - 22, 6);
    expect(beyondOuter.hp).toBe(100);
  });

  it('固定落点不随玩家身边最近敌人漂移，区域仍围绕落点结算', () => {
    const g = full();
    sigil(g, 5, 'starfall');
    const decoyNearPlayer = enemy(1, -30, -30); // 区域 5 最近敌，本该成为索敌点
    const landingInner = enemy(2, 130, 100); // 落点 30 距：内圈
    const landingOuter = enemy(3, 160, 100); // 落点 60 距：外圈
    const aim = { x: 100, y: 100 };
    const r = resolveSigilTrigger({ grid: g, cellId: 5, defId: 'starfall', state: state(), enemies: [decoyNearPlayer, landingInner, landingOuter], aimPoint: aim, half: 120 });
    expect(r.aim).toEqual(aim);
    expect(r.targets).toHaveLength(2);
    expect(decoyNearPlayer.hp).toBe(100);
    expect(landingInner.hp).toBeCloseTo(100 - 22 * 0.7, 6);
    expect(landingOuter.hp).toBeCloseTo(100 - 22, 6);
  });

  it('空射只返回落点与空结果，不产生伤害', () => {
    const g = full();
    sigil(g, 5, 'starfall');
    const r = resolveSigilTrigger({ grid: g, cellId: 5, defId: 'starfall', state: state(), enemies: [], half: 120 });
    expect(r.hits).toBe(0);
    expect(r.damage).toBe(0);
    expect(r.empty).toBe(true);
    expect(r.aim).toEqual({ x: -30, y: -30 });
    expect(r.sacrificeSpent).toBe(0);
    expect(r.sacrificeApplied).toBe(false);
  });

  it('非星陨区域符印（荆棘藤蔓）整圈全额并保留定身', () => {
    const g = full();
    sigil(g, 5, 'thorn_vine');
    const near = enemy(1, -30, -30);
    const far = enemy(2, -30, 20); // 距落点 50，超出半径 46
    const st = state();
    const r = resolveSigilTrigger({ grid: g, cellId: 5, defId: 'thorn_vine', state: st, enemies: [near, far], half: 120 });
    expect(r.hits).toBe(1);
    expect(near.hp).toBeCloseTo(95, 6);
    expect(near.rootUntil).toBe(1200);
    expect(far.hp).toBe(100);
  });
});

describe('献祭结算', () => {
  it('护盾 16：命中后先扣 8 再按双倍结算，剩 8', () => {
    const g = full();
    sacrificeAt(g, 5, 6);
    const st = state(16);
    const e = enemy(1, -30, -30);
    const r = resolveSigilTrigger({ grid: g, cellId: 5, defId: 'arcane_bolt', state: st, enemies: [e], half: 120 });
    expect(r.hits).toBe(1);
    expect(r.damage).toBeCloseTo(24, 6);
    expect(r.sacrificeSpent).toBe(8);
    expect(r.sacrificeApplied).toBe(true);
    expect(st.player.shield).toBe(8);
    expect(e.hp).toBeCloseTo(76, 6);
  });

  it('护盾恰好 8：扣到 0 并仍然翻倍', () => {
    const g = full();
    sacrificeAt(g, 5, 6);
    const st = state(8);
    const e = enemy(1, -30, -30);
    const r = resolveSigilTrigger({ grid: g, cellId: 5, defId: 'arcane_bolt', state: st, enemies: [e], half: 120 });
    expect(st.player.shield).toBe(0);
    expect(r.sacrificeSpent).toBe(8);
    expect(r.sacrificeApplied).toBe(true);
    expect(r.damage).toBeCloseTo(24, 6);
    expect(e.hp).toBeCloseTo(76, 6);
  });

  it('护盾 7：不扣、不翻倍、不报错', () => {
    const g = full();
    sacrificeAt(g, 5, 6);
    const st = state(7);
    const e = enemy(1, -30, -30);
    const r = resolveSigilTrigger({ grid: g, cellId: 5, defId: 'arcane_bolt', state: st, enemies: [e], half: 120 });
    expect(st.player.shield).toBe(7);
    expect(r.sacrificeSpent).toBe(0);
    expect(r.sacrificeApplied).toBe(false);
    expect(r.damage).toBeCloseTo(12, 6);
    expect(e.hp).toBeCloseTo(88, 6);
  });

  it('完全没有敌人时才是空射，不扣护盾', () => {
    const g = full();
    sacrificeAt(g, 5, 6);
    const st = state(16);
    const r = resolveSigilTrigger({ grid: g, cellId: 5, defId: 'arcane_bolt', state: st, enemies: [], half: 120 });
    expect(r.hits).toBe(0);
    expect(r.empty).toBe(true);
    expect(r.damage).toBe(0);
    expect(st.player.shield).toBe(16);
    expect(r.sacrificeSpent).toBe(0);
    expect(r.sacrificeApplied).toBe(false);
  });

  it('一次触发命中多个目标也只扣一次护盾', () => {
    const g = full();
    sacrificeAt(g, 5, 6, 'flame_burst');
    const st = state(16);
    const enemies = [enemy(1, -30, -30), enemy(2, -28, -28), enemy(3, -26, -26)];
    const r = resolveSigilTrigger({ grid: g, cellId: 5, defId: 'flame_burst', state: st, enemies, aimPoint: { x: -30, y: -30 }, half: 120 });
    expect(r.hits).toBe(3);
    expect(st.player.shield).toBe(8);
    expect(r.sacrificeSpent).toBe(8);
    expect(r.sacrificeApplied).toBe(true);
    for (const e of enemies) expect(e.hp).toBeCloseTo(100 - 9 * 2, 6);
    expect(r.damage).toBeCloseTo(9 * 2 * 3, 6);
  });

  it('星陨内圈与外圈在献祭下分别翻倍（星陨内 30.8 / 外 44）', () => {
    const g = full();
    sacrificeAt(g, 5, 6, 'starfall');
    const st = state(16);
    const inner = enemy(1, -30, -30);
    const outer = enemy(2, -30, 25);
    const r = resolveSigilTrigger({ grid: g, cellId: 5, defId: 'starfall', state: st, enemies: [inner, outer], half: 120 });
    expect(r.hits).toBe(2);
    expect(st.player.shield).toBe(8);
    expect(inner.hp).toBeCloseTo(100 - 22 * 0.7 * 2, 6);
    expect(outer.hp).toBeCloseTo(100 - 22 * 2, 6);
    expect(r.damage).toBeCloseTo(22 * 0.7 * 2 + 22 * 2, 6);
  });

  it('审判之锤的护甲追加伤害同样翻倍', () => {
    const g = full();
    sacrificeAt(g, 5, 6, 'judgment_hammer');
    const st = state(16);
    const e = enemy(1, -30, -30, { armor: 0.5 });
    const r = resolveSigilTrigger({ grid: g, cellId: 5, defId: 'judgment_hammer', state: st, enemies: [e], half: 120 });
    // 主体 18*2*0.5=18，护甲追加 18*0.5*2*0.5=9，共 27
    expect(r.damage).toBeCloseTo(27, 6);
    expect(e.hp).toBeCloseTo(73, 6);
    expect(st.player.shield).toBe(8);
  });

  it('护盾 NaN 不崩、不扣、不翻倍，也不写坏数值', () => {
    const g = full();
    sacrificeAt(g, 5, 6);
    const st = state(Number.NaN);
    const e = enemy(1, -30, -30);
    const r = resolveSigilTrigger({ grid: g, cellId: 5, defId: 'arcane_bolt', state: st, enemies: [e], half: 120 });
    expect(Number.isNaN(st.player.shield)).toBe(true);
    expect(Number.isFinite(r.damage)).toBe(true);
    expect(r.damage).toBeCloseTo(12, 6);
    expect(r.sacrificeSpent).toBe(0);
    expect(r.sacrificeApplied).toBe(false);
    expect(e.hp).toBeCloseTo(88, 6);
  });

  it('护盾负数按不足 8 处理，保持原值', () => {
    const g = full();
    sacrificeAt(g, 5, 6);
    const st = state(-3);
    const e = enemy(1, -30, -30);
    const r = resolveSigilTrigger({ grid: g, cellId: 5, defId: 'arcane_bolt', state: st, enemies: [e], half: 120 });
    expect(st.player.shield).toBe(-3);
    expect(r.damage).toBeCloseTo(12, 6);
    expect(r.sacrificeSpent).toBe(0);
    expect(r.sacrificeApplied).toBe(false);
  });
});

describe('献祭不生效的装备状态', () => {
  it('被指向格未装符印：照常结算伤害但不扣护盾', () => {
    const g = full();
    sacrificeAt(g, 5, 6);
    g.cells[5].slot = null;
    rebuildDerived(g, 2000);
    const st = state(16);
    const e = enemy(1, -30, -30);
    const r = resolveSigilTrigger({ grid: g, cellId: 5, defId: 'arcane_bolt', state: st, enemies: [e], half: 120 });
    expect(st.player.shield).toBe(16);
    expect(r.sacrificeApplied).toBe(false);
    expect(r.damage).toBeCloseTo(12, 6);
  });

  it('被指向的符印格未解封：不生效', () => {
    const g = full();
    sacrificeAt(g, 5, 6);
    g.cells[5].unlocked = false;
    const st = state(16);
    const e = enemy(1, -30, -30);
    const r = resolveSigilTrigger({ grid: g, cellId: 5, defId: 'arcane_bolt', state: st, enemies: [e], half: 120 });
    expect(st.player.shield).toBe(16);
    expect(r.sacrificeApplied).toBe(false);
    expect(r.sacrificeSpent).toBe(0);
  });

  it('辅助格未解封：不生效', () => {
    const g = full();
    sacrificeAt(g, 5, 6);
    g.cells[6].unlocked = false;
    const st = state(16);
    const e = enemy(1, -30, -30);
    const r = resolveSigilTrigger({ grid: g, cellId: 5, defId: 'arcane_bolt', state: st, enemies: [e], half: 120 });
    expect(st.player.shield).toBe(16);
    expect(r.sacrificeSpent).toBe(0);
    expect(r.damage).toBeCloseTo(12, 6);
  });

  it('辅助不是献祭：不生效', () => {
    const g = full();
    sacrificeAt(g, 5, 6);
    g.cells[6].slot = { kind: 'auxiliary', defId: 'hourglass' };
    const st = state(16);
    const e = enemy(1, -30, -30);
    const r = resolveSigilTrigger({ grid: g, cellId: 5, defId: 'arcane_bolt', state: st, enemies: [e], half: 120 });
    expect(st.player.shield).toBe(16);
    expect(r.sacrificeApplied).toBe(false);
  });

  it('auxTarget 指向别格：不生效', () => {
    const g = full();
    sacrificeAt(g, 5, 6);
    g.cells[6].auxTarget = 10;
    const st = state(16);
    const e = enemy(1, -30, -30);
    const r = resolveSigilTrigger({ grid: g, cellId: 5, defId: 'arcane_bolt', state: st, enemies: [e], half: 120 });
    expect(st.player.shield).toBe(16);
    expect(r.sacrificeApplied).toBe(false);
  });

  it('两个献祭指向同一格时，一次触发仍只扣一次', () => {
    const g = full();
    sacrificeAt(g, 5, 6);
    g.cells[4].slot = { kind: 'auxiliary', defId: 'sacrifice' };
    g.cells[4].auxTarget = 5;
    const st = state(16);
    const e = enemy(1, -30, -30);
    const r = resolveSigilTrigger({ grid: g, cellId: 5, defId: 'arcane_bolt', state: st, enemies: [e], half: 120 });
    expect(st.player.shield).toBe(8);
    expect(r.sacrificeSpent).toBe(8);
    expect(r.damage).toBeCloseTo(24, 6);
  });

  it('献祭格与目标格不相邻：不生效', () => {
    const g = full();
    sacrificeAt(g, 5, 6);
    g.cells[6].slot = null;
    g.cells[6].auxTarget = null;
    g.cells[0].slot = { kind: 'auxiliary', defId: 'sacrifice' };
    g.cells[0].auxTarget = 5; // 不相邻
    const st = state(16);
    const e = enemy(1, -30, -30);
    const r = resolveSigilTrigger({ grid: g, cellId: 5, defId: 'arcane_bolt', state: st, enemies: [e], half: 120 });
    expect(st.player.shield).toBe(16);
    expect(r.sacrificeApplied).toBe(false);
  });
});

describe('返回结构与既有行为回归', () => {
  it('所有触发结果都保留旧字段并新增献祭字段', () => {
    const g = full();
    sacrificeAt(g, 5, 6);
    const e = enemy(1, -30, -30);
    const r = resolveSigilTrigger({ grid: g, cellId: 5, defId: 'arcane_bolt', state: state(0), enemies: [e], half: 120 });
    for (const key of RESULT_KEYS) expect(r).toHaveProperty(key);
    expect(Array.isArray(r.targets)).toBe(true);
    expect(typeof r.hits).toBe('number');
    expect(typeof r.damage).toBe('number');
    expect(typeof r.sacrificeApplied).toBe('boolean');
  });

  it('中继抑制输出时返回空结果并带献祭字段，且不扣护盾', () => {
    const g = full();
    g.cells[0].slot = { kind: 'sigil', defId: 'arcane_bolt' };
    g.cells[0].runes[0] = 'relay';
    g.cells[1].slot = { kind: 'auxiliary', defId: 'sacrifice' };
    g.cells[1].auxTarget = 0;
    rebuildDerived(g, 2000);
    const e = enemy(1, -100, -100);
    const r = resolveSigilTrigger({ grid: g, cellId: 0, defId: 'arcane_bolt', state: state(16), enemies: [e], half: 120 });
    expect(r.hits).toBe(0);
    expect(r.empty).toBe(true);
    expect(r.targets).toEqual([]);
    expect(r.sacrificeSpent).toBe(0);
    expect(r.sacrificeApplied).toBe(false);
    expect(e.hp).toBe(100);
  });

  it('奥术飞弹单体 12 伤害', () => {
    const g = full();
    sigil(g, 5, 'arcane_bolt');
    const e = enemy(1, -30, -30);
    const r = resolveSigilTrigger({ grid: g, cellId: 5, defId: 'arcane_bolt', state: state(), enemies: [e], half: 120 });
    expect(r.hits).toBe(1);
    expect(r.damage).toBeCloseTo(12, 6);
    expect(e.hp).toBeCloseTo(88, 6);
  });

  it('烈焰喷涌最多命中 3 个落点附近目标', () => {
    const g = full();
    sigil(g, 5, 'flame_burst');
    const enemies = [enemy(1, -30, -30), enemy(2, -32, -32), enemy(3, -34, -34), enemy(4, -36, -36), enemy(5, 100, 100)];
    const r = resolveSigilTrigger({ grid: g, cellId: 5, defId: 'flame_burst', state: state(), enemies, aimPoint: { x: -30, y: -30 }, half: 120 });
    expect(r.hits).toBe(3);
    expect(enemies[4].hp).toBe(100);
    expect(r.damage).toBeCloseTo(27, 6);
  });

  it('圣光壁垒给盾、贴身伤害与 40 上限保持', () => {
    const g = full();
    sigil(g, 5, 'holy_ward');
    const close = enemy(1, -30, 0);
    const far = enemy(2, -100, 0);
    const st = state(0);
    const r = resolveSigilTrigger({ grid: g, cellId: 5, defId: 'holy_ward', state: st, enemies: [close, far], half: 120 });
    expect(st.player.shield).toBe(14);
    expect(close.hp).toBeCloseTo(94, 6);
    expect(far.hp).toBe(100);
    expect(r.hits).toBe(1);
    for (let i = 0; i < 4; i++) resolveSigilTrigger({ grid: g, cellId: 5, defId: 'holy_ward', state: st, enemies: [], half: 120 });
    expect(st.player.shield).toBe(40);
  });

  it('寒霜箭减速与伤害保持', () => {
    const g = full();
    sigil(g, 5, 'frost_arrow');
    const e = enemy(1, -30, -30);
    const r = resolveSigilTrigger({ grid: g, cellId: 5, defId: 'frost_arrow', state: state(), enemies: [e], half: 120 });
    expect(e.hp).toBeCloseTo(90, 6);
    expect(e.slowUntil).toBe(2000);
    expect(e.slowFactor).toBeCloseTo(0.6, 6);
    expect(r.hits).toBe(1);
  });

  it('审判之锤对护甲目标追加 50% 伤害保持', () => {
    const g = full();
    sigil(g, 5, 'judgment_hammer');
    const e = enemy(1, -30, -30, { armor: 0.5 });
    const r = resolveSigilTrigger({ grid: g, cellId: 5, defId: 'judgment_hammer', state: state(), enemies: [e], half: 120 });
    expect(r.damage).toBeCloseTo(13.5, 6);
    expect(e.hp).toBeCloseTo(86.5, 6);
  });

  it('秘能汲取造成伤害并回复 2 点生命', () => {
    const g = full();
    sigil(g, 5, 'mana_siphon');
    const st = state();
    st.player.hp = 90;
    const e = enemy(1, -30, -30);
    const r = resolveSigilTrigger({ grid: g, cellId: 5, defId: 'mana_siphon', state: st, enemies: [e], half: 120 });
    expect(r.damage).toBeCloseTo(8, 6);
    expect(e.hp).toBeCloseTo(92, 6);
    expect(st.player.hp).toBe(92);
  });

  it('联组追加结算规则不变：直线只追加末格', () => {
    const g = full();
    for (const id of [0, 1, 2]) sigil(g, id, 'arcane_bolt');
    const enemies = [enemy(1, -100, -100), enemy(2, -30, -100), enemy(3, 30, -100)];
    resolveComboBonus({ grid: g, order: [0, 1, 2], defId: 'line3', bonus: 0.4, state: state(), enemies, half: 120 });
    expect(enemies.map((e) => e.hp)).toEqual([100, 100, 95.2]);
  });

  it('从合法构筑草稿落地后，星陨与献祭直接可结算', () => {
    const draft = emptyDraft(3);
    draft.unlocked = [5, 6];
    draft.slots = {
      5: { kind: 'sigil', defId: 'starfall' },
      6: { kind: 'auxiliary', defId: 'sacrifice' },
    };
    draft.auxTargets = { 6: 5 };
    const g = createGrid();
    expect(applyDraft(g, draft).ok).toBe(true);

    const st = state(16);
    const inner = enemy(1, -30, -30);
    const outer = enemy(2, -30, 25);
    const r = resolveSigilTrigger({ grid: g, cellId: 5, defId: 'starfall', state: st, enemies: [inner, outer], half: 120 });
    expect(r.hits).toBe(2);
    expect(st.player.shield).toBe(8);
    expect(r.sacrificeApplied).toBe(true);
    expect(inner.hp).toBeCloseTo(100 - 22 * 0.7 * 2, 6);
    expect(outer.hp).toBeCloseTo(100 - 22 * 2, 6);
  });

  it('非法伤害不扣血（applyDamage 既有防御）', () => {
    for (const amount of [-1, Number.NaN, Infinity, -Infinity]) {
      const e = enemy(1, 0, 0, { hp: 10 });
      expect(applyDamage(e, amount)).toBe(0);
      expect(e.hp).toBe(10);
      expect(e.alive).toBe(true);
    }
  });
});
