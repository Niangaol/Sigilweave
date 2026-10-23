import { describe, it, expect } from 'vitest';
import { createGrid, rebuildDerived } from '../src/logic/grid.js';
import { SigilEngine } from '../src/logic/engine.js';
import { buildComboCatalog } from '../src/logic/combo.js';

const combos = buildComboCatalog(['duo', 'line3', 'elbow3', 'ring4']);

function fullGrid(interval = 2000) {
  const grid = createGrid();
  for (const cell of grid.cells) cell.unlocked = true;
  rebuildDerived(grid, interval);
  return grid;
}

describe('联组断链诊断', () => {
  it('冷却受阻断链被记录为 cooldown 并发出事件', () => {
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
    expect(engine.summary(60000).comboBreaks.cooldown).toBe(breaks.length);
  });

  it('无可达出口消散时断链记为 dissipate', () => {
    const events = [];
    const grid = createGrid();
    grid.cells[5].unlocked = true;
    grid.cells[5].exits = new Set(); // 无出口
    rebuildDerived(grid, 2000);
    const engine = new SigilEngine({
      seed: 3, grid, startCells: [5], combos,
      onEvent: (type, data) => events.push({ type, data }),
    });
    engine.start();
    engine.advanceTo(20000);
    expect(events.some(e => e.type === 'signal:dissipate')).toBe(true);
    const dissipateBreaks = events.filter(e => e.type === 'combo:break' && e.data.reason === 'dissipate');
    expect(dissipateBreaks.length).toBeGreaterThan(0);
    expect(engine.summary(20000).comboBreaks.dissipate).toBe(dissipateBreaks.length);
  });

  it('不启用联组时诊断保持空对象，不产生假断链', () => {
    const grid = fullGrid(2000);
    const engine = new SigilEngine({ seed: 1, grid, startCells: [5] });
    engine.start();
    engine.advanceTo(10000);
    expect(engine.summary(10000).comboBreaks).toEqual({});
  });

  it('探路保底改道断链记为 fallback', () => {
    const events = [];
    const grid = createGrid();
    for (const cell of grid.cells) cell.unlocked = true;
    // 只留一条极短回路：5<->6 往返，制造大量“非新格”逼迫保底改道
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
    expect(engine.summary(120000).comboBreaks.fallback).toBe(fallback.length);
  });
});
