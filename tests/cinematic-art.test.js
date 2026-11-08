import { describe, expect, it } from 'vitest';
import * as art from '../src/ui/cinematic-art.js';

// 计数 stub：任何方法调用都计一条绘制指令（与 story-art 预算测试同思路）
function makeCounting() {
  const state = { n: 0 };
  const g = new Proxy({}, {
    get(t, k) {
      if (k === 'count') return state.n;
      return (...args) => {
        state.n++;
        for (const a of args) {
          if (typeof a === 'number' && !Number.isFinite(a)) throw new Error('非有限坐标: ' + String(a));
        }
        return g;
      };
    },
  });
  return g;
}

describe('drawShatter 符环碎裂', () => {
  it('是函数，进行中帧有绘制且 ≤80 条指令', () => {
    expect(typeof art.drawShatter).toBe('function');
    const g = makeCounting();
    art.drawShatter(g, { cx: 240, cy: 120, r: 28, p: 0.4, accent: 0xc9a227, seed: 7 });
    expect(g.count).toBeGreaterThan(0);
    expect(g.count).toBeLessThanOrEqual(80);
  });

  it('p≥1 碎片散尽不再绘制；p≤0 不绘制（未开始由调用方画整环）', () => {
    const done = makeCounting();
    art.drawShatter(done, { cx: 240, cy: 120, r: 28, p: 1, accent: 0xc9a227, seed: 7 });
    expect(done.count).toBe(0);
    const notStarted = makeCounting();
    art.drawShatter(notStarted, { cx: 240, cy: 120, r: 28, p: 0, accent: 0xc9a227, seed: 7 });
    expect(notStarted.count).toBe(0);
  });

  it('同种子同进度确定性，碎片数 ≤18', () => {
    const g1 = makeCounting();
    const g2 = makeCounting();
    const opts = { cx: 240, cy: 120, r: 28, p: 0.5, accent: 0xc9a227, seed: 7 };
    art.drawShatter(g1, opts);
    art.drawShatter(g2, opts);
    expect(g1.count).toBe(g2.count);
    // 12 段弧 × (lineStyle+strokePoints) + 12 碎片核心 × ≤3 条 = ≤60
    expect(g1.count).toBeLessThanOrEqual(60);
  });
});