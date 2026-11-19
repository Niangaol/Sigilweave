// 频率统计：5 秒滑窗分桶、过期剔除、非法输入回退、峰值只升不降。
import { describe, expect, it } from 'vitest';
import { computeFrequency, FREQ_WINDOW_MS } from '../src/ui/battle-frequency.js';

describe('computeFrequency', () => {
  it('窗口内按秒分桶，末端触发落进最后一个桶', () => {
    const now = 10000;
    const times = [6000, 7500, 8500, 9900];
    const r = computeFrequency(times, now, { freqStart: 0, peakRate: 0 });
    // floor = 5000；6000 → 桶 1，7500 → 桶 2，8500 → 桶 3，9900 → 桶 4
    expect(r.buckets).toEqual([0, 1, 1, 1, 1]);
    expect(r.recentRate).toBeCloseTo(4 / (FREQ_WINDOW_MS / 1000), 6);
  });

  it('窗口外的旧触发被游标剔除', () => {
    const times = [1000, 2000, 9500];
    const r = computeFrequency(times, 10000, { freqStart: 0, peakRate: 0 });
    expect(r.freqStart).toBe(2);
    expect(r.buckets).toEqual([0, 0, 0, 0, 1]);
  });

  it('从上次游标继续，不回头重数', () => {
    const times = [1000, 2000, 9500];
    const r = computeFrequency(times, 10000, { freqStart: 2, peakRate: 0 });
    expect(r.freqStart).toBe(2);
    expect(r.buckets).toEqual([0, 0, 0, 0, 1]);
  });

  it('非法输入回退：空/非数组/NaN 时间/坏 prev', () => {
    expect(computeFrequency(null, 1000, null)).toEqual({
      freqStart: 0, buckets: [0, 0, 0, 0, 0], recentRate: 0, peakRate: 0,
    });
    expect(computeFrequency([], NaN, { freqStart: -3, peakRate: NaN })).toEqual({
      freqStart: 0, buckets: [0, 0, 0, 0, 0], recentRate: 0, peakRate: 0,
    });
  });

  it('峰值只升不降', () => {
    const a = computeFrequency([9000, 9500], 10000, { freqStart: 0, peakRate: 0 });
    expect(a.peakRate).toBeCloseTo(2 / 5, 6);
    const b = computeFrequency([9900], 10000, { freqStart: 0, peakRate: 3 });
    expect(b.peakRate).toBe(3);
  });
});
