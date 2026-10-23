import { describe, it, expect } from 'vitest';
import { createGrid, rebuildDerived, toId } from '../src/logic/grid.js';
import { damageMultiplier, applyDamage, resolveSigilTrigger, resolveComboBonus, SIGIL_DEFS } from '../src/logic/effects.js';

function grid16() {
  const g = createGrid();
  for (const c of g.cells) c.unlocked = true;
  rebuildDerived(g, 2000);
  return g;
}

function player(x = 0, y = 0) {
  return { x, y, hp: 100, maxHp: 100, shield: 0 };
}

describe("伤害倍率", () => {
  it("单个熔炉铭文 +50%", () => {
    const g = grid16();
    g.cells[5].runes[0] = "forge";
    expect(damageMultiplier(g, 5, {})).toBeCloseTo(1.5, 6);
  });
  it("孤星之誓：角位邻居全空时 +50%，中心位做不到", () => {
    const g = grid16();
    const corner = toId(0, 0);
    expect(damageMultiplier(g, corner, { oath: "lone_star" })).toBeCloseTo(1.5, 6);
    // 中心位有 4 个邻格，只要有一个装了卡就不成立
    g.cells[toId(1, 2)].slot = { kind: "sigil", defId: "arcane_bolt" };
    expect(damageMultiplier(g, toId(2, 2), { oath: "lone_star" })).toBeCloseTo(1, 6);
  });
  it("守夜人之誓：邻居全满才 +40%，角位只需 2 格", () => {
    const g = grid16();
    const corner = toId(0, 0);
    g.cells[toId(0, 1)].slot = { kind: "sigil", defId: "arcane_bolt" };
    g.cells[toId(1, 0)].slot = { kind: "sigil", defId: "arcane_bolt" };
    expect(damageMultiplier(g, corner, { oath: "watcher" })).toBeCloseTo(1.4, 6);
    // 中心位要凑齐 4 格
    const center = toId(1, 1);
    expect(damageMultiplier(g, center, { oath: "watcher" })).toBeCloseTo(1, 6);
  });
  it("殉道者之誓：低血才生效", () => {
    const g = grid16();
    const hi = { player: { hp: 100, maxHp: 100 }, oath: "martyr" };
    const lo = { player: { hp: 30, maxHp: 100 }, oath: "martyr" };
    expect(damageMultiplier(g, 5, hi)).toBeCloseTo(1, 6);
    expect(damageMultiplier(g, 5, lo)).toBeCloseTo(1.3, 6);
  });
});

describe("伤害结算", () => {
  it("护甲会减伤，死亡后不重复扣血", () => {
    const e = { id: 1, alive: true, hp: 20, armor: 0.5, x: 0, y: 0 };
    expect(applyDamage(e, 10)).toBeCloseTo(5, 6);
    expect(e.hp).toBeCloseTo(15, 6);
    applyDamage(e, 100);
    expect(e.alive).toBe(false);
    expect(applyDamage(e, 10)).toBe(0);
  });
});

describe("符印触发", () => {
  it("单体符印只打本区域目标", () => {
    const g = grid16();
    g.cells[0].slot = { kind: "sigil", defId: "arcane_bolt" };
    const st = { player: player(0, 0), now: 0 };
    const enemies = [
      { id: 1, alive: true, hp: 100, x: -100, y: -100, armor: 0 },
      { id: 2, alive: true, hp: 100, x: 100, y: 100, armor: 0 },
    ];
    const r = resolveSigilTrigger({ grid: g, cellId: 0, defId: "arcane_bolt", state: st, enemies, half: 120 });
    expect(r.hits).toBe(1);
    expect(enemies[0].hp).toBeCloseTo(88, 6);
    expect(enemies[1].hp).toBe(100);
  });

  it("空区域也返回瞄准点，不跨区找敌", () => {
    const g = grid16();
    const st = { player: player(0, 0), now: 0 };
    const enemies = [{ id: 1, alive: true, hp: 100, x: 100, y: 100, armor: 0 }];
    const r = resolveSigilTrigger({ grid: g, cellId: 0, defId: "arcane_bolt", state: st, enemies, half: 120 });
    expect(r.hits).toBe(0);
    expect(r.empty).toBe(true);
    expect(r.aim).not.toBeNull();
    expect(enemies[0].hp).toBe(100);
  });

  it("圣光壁垒给自己护盾且有上限", () => {
    const g = grid16();
    const st = { player: player(0, 0), now: 0 };
    for (let i = 0; i < 5; i++) {
      resolveSigilTrigger({ grid: g, cellId: 5, defId: "holy_ward", state: st, enemies: [], half: 120 });
    }
    expect(st.player.shield).toBe(40);
  });

  it("熔炉铭文让本次伤害提升 50%", () => {
    const g = grid16();
    g.cells[0].runes[0] = "forge";
    const st = { player: player(0, 0), now: 0 };
    const enemies = [{ id: 1, alive: true, hp: 100, x: -100, y: -100, armor: 0 }];
    resolveSigilTrigger({ grid: g, cellId: 0, defId: "arcane_bolt", state: st, enemies, half: 120 });
    expect(enemies[0].hp).toBeCloseTo(100 - 12 * 1.5, 6);
  });
});

describe("联组追加结算", () => {
  it("按比例对组内格子追加一次伤害", () => {
    const g = grid16();
    for (const id of [0, 1]) g.cells[id].slot = { kind: "sigil", defId: "arcane_bolt" };
    const st = { player: player(0, 0), now: 0 };
    const enemies = [{ id: 9, alive: true, hp: 500, x: -100, y: -100, armor: 0 }];
    const r = resolveComboBonus({ grid: g, order: [0, 1], bonus: 0.2, state: st, enemies, half: 120 });
    expect(r.hits).toBe(1);
    expect(r.damage).toBeCloseTo(12 * 0.2, 6);
  });
});
