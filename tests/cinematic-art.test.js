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

describe('编舞工具库', () => {
  it('drawFlood 幕色闪洪：一帧一条全屏硬边矩形，alpha≤0 不画', () => {
    const g = makeCounting();
    art.drawFlood(g, { w: 480, h: 270, color: 0xc9a227, alpha: 0.22 });
    expect(g.count).toBe(1);
    const zero = makeCounting();
    art.drawFlood(zero, { w: 480, h: 270, color: 0xc9a227, alpha: 0 });
    expect(zero.count).toBe(0);
  });

  it('drawWhipStreaks 甩镜 streak：进行中 ≤40 条且确定，首尾不画', () => {
    for (const p of [0.2, 0.5, 0.8]) {
      const g1 = makeCounting();
      const g2 = makeCounting();
      art.drawWhipStreaks(g1, { w: 480, h: 270, p, dir: 1, color: 0xc9a227 });
      art.drawWhipStreaks(g2, { w: 480, h: 270, p, dir: 1, color: 0xc9a227 });
      expect(g1.count).toBeGreaterThan(0);
      expect(g1.count).toBeLessThanOrEqual(40);
      expect(g1.count).toBe(g2.count);
    }
    for (const p of [0, 1]) {
      const g = makeCounting();
      art.drawWhipStreaks(g, { w: 480, h: 270, p, dir: -1, color: 0xc9a227 });
      expect(g.count).toBe(0);
    }
  });

  it('drawIris 阶梯收边：p=0 不画，进行中 ≤12 条，p=1 满覆盖', () => {
    const open = makeCounting();
    art.drawIris(open, { w: 480, h: 270, p: 0, color: 0xa83b39 });
    expect(open.count).toBe(0);
    const mid = makeCounting();
    art.drawIris(mid, { w: 480, h: 270, p: 0.5, color: 0xa83b39 });
    expect(mid.count).toBeGreaterThan(0);
    expect(mid.count).toBeLessThanOrEqual(12);
    const closed = makeCounting();
    art.drawIris(closed, { w: 480, h: 270, p: 1, color: 0xa83b39 });
    expect(closed.count).toBeGreaterThan(0);
    expect(closed.count).toBeLessThanOrEqual(12);
  });

  it('drawGlitchSlices 错位切片：≤6 条，同时间量子同种子确定', () => {
    const g1 = makeCounting();
    const g2 = makeCounting();
    art.drawGlitchSlices(g1, { w: 480, h: 270, t: 1000, seed: 7, color: 0xa83b39 });
    art.drawGlitchSlices(g2, { w: 480, h: 270, t: 1050, seed: 7, color: 0xa83b39 });
    expect(g1.count).toBeGreaterThan(0);
    expect(g1.count).toBeLessThanOrEqual(6);
    expect(g1.count).toBe(g2.count);
  });

  it('drawNumeral 巨号幕数字：I/II/III 分别 3/6/9 条，alpha≤0 不画', () => {
    for (const [act, n] of [[1, 3], [2, 6], [3, 9]]) {
      const g = makeCounting();
      art.drawNumeral(g, { cx: 240, cy: 135, act, accent: 0xc9a227, alpha: 0.14 });
      expect(g.count).toBe(n);
    }
    const zero = makeCounting();
    art.drawNumeral(zero, { cx: 240, cy: 135, act: 2, accent: 0xc9a227, alpha: 0 });
    expect(zero.count).toBe(0);
  });
});