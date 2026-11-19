// 战斗参数与起点：URL 非法值回退、起点格抽取、最近已解封格映射。
import { describe, expect, it } from 'vitest';
import { readTuning, pickStartCells, sampleStartCell } from '../src/scenes/battle-setup.js';
import { toId } from '../src/logic/grid.js';
import { ACT1_CELLS } from '../src/data/roster.js';

const q = (s) => new URLSearchParams(s);

describe('readTuning', () => {
  it('没传参数：三项全为 null', () => {
    expect(readTuning(q(''))).toEqual({ intervalMs: null, starts: null, duoBonus: null });
  });

  it('合法区间', () => {
    expect(readTuning(q('interval=1&starts=2&duo=1.5'))).toEqual({ intervalMs: 1000, starts: 2, duoBonus: 1.5 });
    expect(readTuning(q('interval=0.8&starts=1&duo=0')).intervalMs).toBe(800);
    expect(readTuning(q('interval=5&starts=4&duo=2')).starts).toBe(4);
  });

  it('非法值全部回退 null（不抛错）', () => {
    expect(readTuning(q('interval=abc'))).toEqual({ intervalMs: null, starts: null, duoBonus: null });
    expect(readTuning(q('interval=0.5'))).toEqual({ intervalMs: null, starts: null, duoBonus: null });
    expect(readTuning(q('interval=5.1'))).toEqual({ intervalMs: null, starts: null, duoBonus: null });
    expect(readTuning(q('interval=-1'))).toEqual({ intervalMs: null, starts: null, duoBonus: null });
    expect(readTuning(q('starts=0'))).toEqual({ intervalMs: null, starts: null, duoBonus: null });
    expect(readTuning(q('starts=2')).starts).toBe(2);
    expect(readTuning(q('starts=5'))).toEqual({ intervalMs: null, starts: null, duoBonus: null });
    // parseInt 口径：'2.5' 被截成 2（既有行为，URL 参数容错；不改成 parseFloat）
    expect(readTuning(q('starts=2.5'))).toEqual({ intervalMs: null, starts: 2, duoBonus: null });
    expect(readTuning(q('duo=-1'))).toEqual({ intervalMs: null, starts: null, duoBonus: null });
    expect(readTuning(q('duo=3'))).toEqual({ intervalMs: null, starts: null, duoBonus: null });
  });
});

describe('pickStartCells / sampleStartCell', () => {
  const grid = { unlockedIds: () => [0, 1, 5, 10] };

  it('起点优先、按解封顺序补足 starts 数量', () => {
    expect(pickStartCells({ grid, tuning: { starts: 3 }, chapter: 1, startCell: 5 })).toEqual([5, 0, 1]);
    expect(pickStartCells({ grid, tuning: null, chapter: 1, startCell: 10 }).length)
      .toBeGreaterThanOrEqual(1);
  });

  it('玩家位置映射到最近的已解封格', () => {
    const scene = { grid, player: { x: 300, y: 200 }, world: { w: 1200, h: 800 } };
    expect(sampleStartCell(scene)).toBe(toId(1, 1));
  });

  it('没有解封格时回退 ACT1_CELLS[0]', () => {
    const scene = { grid: { unlockedIds: () => [] }, player: { x: 0, y: 0 }, world: { w: 1200, h: 800 } };
    expect(sampleStartCell(scene)).toBe(ACT1_CELLS[0]);
  });
});
