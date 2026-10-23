import { describe, it, expect } from 'vitest';
import { createGrid, rebuildDerived } from '../src/logic/grid.js';
import { SigilEngine } from '../src/logic/engine.js';
import { buildComboCatalog } from '../src/logic/combo.js';

const combos = buildComboCatalog(['duo', 'line3', 'elbow3', 'ring4']);
const sumCount = (events) => events.reduce((a, e) => a + e.data.count, 0);

function fullGrid(interval = 2000) {
  const grid = createGrid();
  for (const cell of grid.cells) cell.unlocked = true;
  rebuildDerived(grid, interval);
  return grid;
}

describe('联组断链诊断', () => {
  it('冷却受阻断链：事件带形状，统计按断掉的实例数计', () => {
    const events = [];
    const grid = fullGrid(800); // 强制进入冷却吞跳区间
    const engine = new SigilEngine({
      seed: 7, grid, startCells: [5], combos,
      onEvent: (type, data) => events.push({ type, data }),
    });
    engine.start();
    engine.advanceTo(60000);
    const breaks = events.filter(e => e.type === 'combo:break' && e.data.reason === 'cooldown');
    expect(breaks.length).toBeGreaterThan(0);
    for (const e of breaks) {
      expect(e.data.count).toBeGreaterThan(0);
      expect(Array.isArray(e.data.shapes)).toBe(true);
      expect(e.data.shapes.length).toBeGreaterThan(0);
      for (const shape of e.data.shapes) expect(Object.hasOwn(buildComboCatalog([shape]).length ? { [shape]: 1 } : {}, shape)).toBe(true);
    }
    const summary = engine.summary(60000);
    expect(summary.comboBreaks.cooldown).toBe(sumCount(breaks));
    // comboBreaksByShape 跨所有原因聚合，应与全部断链事件的形状数一致
    const allBreaks = events.filter(e => e.type === 'combo:break');
    const shapeTotal = Object.values(summary.comboBreaksByShape).reduce((a, n) => a + n, 0);
    const eventShapeCount = allBreaks.reduce((a, e) => a + e.data.shapes.length, 0);
    expect(shapeTotal).toBe(eventShapeCount);
  });

  it('消散断链记为 dissipate，并已知形状名不越界', () => {
    const events = [];
    const grid = createGrid();
    grid.cells[5].unlocked = true;
    grid.cells[5].exits = new Set();
    rebuildDerived(grid, 2000);
    const engine = new SigilEngine({
      seed: 3, grid, startCells: [5], combos,
      onEvent: (type, data) => events.push({ type, data }),
    });
    engine.start();
    engine.advanceTo(20000);
    expect(events.some(e => e.type === 'signal:dissipate')).toBe(true);
    const breaks = events.filter(e => e.type === 'combo:break' && e.data.reason === 'dissipate');
    expect(breaks.length).toBeGreaterThan(0);
    expect(engine.summary(20000).comboBreaks.dissipate).toBe(sumCount(breaks));
    for (const e of breaks) for (const s of e.data.shapes) expect(['duo', 'line3', 'elbow3', 'ring4']).toContain(s);
  });

  it('不启用联组时诊断保持空对象，不产生假断链', () => {
    const grid = fullGrid(2000);
    const engine = new SigilEngine({ seed: 1, grid, startCells: [5] });
    engine.start();
    engine.advanceTo(10000);
    const summary = engine.summary(10000);
    expect(summary.comboBreaks).toEqual({});
    expect(summary.comboBreaksByShape).toEqual({});
  });

  it('保底改道断链记为 fallback', () => {
    const events = [];
    const grid = createGrid();
    for (const cell of grid.cells) cell.unlocked = true;
    grid.cells[5].exits = new Set(['right']);
    grid.cells[6].exits = new Set(['left']);
    rebuildDerived(grid, 2000);
    const engine = new SigilEngine({
      seed: 11, grid, startCells: [5], combos,
      onEvent: (type, data) => events.push({ type, data }),
    });
    engine.start();
    engine.advanceTo(120000);
    const fallback = events.filter(e => e.type === 'combo:break' && e.data.reason === 'fallback');
    expect(fallback.length).toBeGreaterThan(0);
    expect(engine.summary(120000).comboBreaks.fallback).toBe(sumCount(fallback));
  });

  it('breakAll 直接调用返回形状清单且可重复调用', async () => {
    const { ComboTracker } = await import('../src/logic/combo.js');
    const tracker = new ComboTracker(buildComboCatalog(['duo']));
    const grid = fullGrid(2000);
    tracker.onTrigger('sig-x', 5, 0, grid);
    const broken = tracker.breakAll('sig-x');
    expect(broken.count).toBeGreaterThan(0);
    expect(broken.shapes).toEqual(['duo']);
    expect(tracker.breakAll('sig-x')).toEqual({ count: 0, shapes: [] });
  });
});
