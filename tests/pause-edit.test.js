import { describe, it, expect } from 'vitest';
import { createGrid, rebuildDerived } from '../src/logic/grid.js';
import { applyDraft, draftFromGrid, emptyDraft } from '../src/logic/build.js';

describe('暂停改阵与罗盘冷却回归', () => {
  it('改阵保留所有格冷却，含换卡与收回后再次放置', () => {
    const grid = createGrid();
    applyDraft(grid, { ...emptyDraft(1), unlocked: [4, 5, 6, 7, 9, 10], slots: { 5: { kind: 'sigil', defId: 'arcane_bolt' } } });
    grid.cells.forEach((c, i) => { c.cooldownUntil = 10000 + i * 100; });
    const before = grid.cells.map(c => c.cooldownUntil);
    const draft = draftFromGrid(grid);
    draft.slots[5] = { kind: 'sigil', defId: 'starfall' };
    expect(applyDraft(grid, draft, { preserveFrom: grid }).ok).toBe(true);
    expect(grid.cells.map(c => c.cooldownUntil)).toEqual(before);
    delete draft.slots[5];
    expect(applyDraft(grid, draft, { preserveFrom: grid }).ok).toBe(true);
    expect(grid.cells[5].cooldownUntil).toBe(before[5]);
    draft.slots[5] = { kind: 'sigil', defId: 'arcane_bolt' };
    expect(applyDraft(grid, draft, { preserveFrom: grid }).ok).toBe(true);
    expect(grid.cells[5].cooldownUntil).toBe(before[5]);
  });
  it('罗盘冷却增益乘算后夹下限，重复推导不叠乘', () => {
    const grid = createGrid();
    rebuildDerived(grid, 900);
    const cd = grid.cells[5].effCooldownMs;
    grid.cells[5].cooldownUntil = 12345;
    rebuildDerived(grid, 900, { cooldownMul: 0.8 });
    expect(grid.cells[5].effCooldownMs).toBe(cd * 0.8);
    rebuildDerived(grid, 900, { cooldownMul: 0.8 });
    expect(grid.cells[5].effCooldownMs).toBe(cd * 0.8);
    expect(grid.cells[5].cooldownUntil).toBe(12345);
    rebuildDerived(grid, 900, { cooldownMul: 0.01 });
    expect(grid.cells[5].effCooldownMs).toBe(600);
  });
});
