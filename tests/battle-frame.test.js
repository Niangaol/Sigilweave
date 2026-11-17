import { describe, it, expect } from 'vitest';
import { FRAME, FRAME_INNER, mixColor, frameTone, frameCracks } from '../src/ui/battle-frame.js';

describe('画框几何', () => {
  it('内开口与框厚自洽，正好覆盖 480×270', () => {
    expect(FRAME_INNER.left).toBe(FRAME.band);
    expect(FRAME_INNER.top).toBe(FRAME.band);
    expect(FRAME_INNER.right).toBe(480 - FRAME.band);
    expect(FRAME_INNER.bottom).toBe(270 - FRAME.band);
    expect(FRAME.band).toBe(8);
  });
  it('8px 框身的五层厚度相加等于框厚', () => {
    const sum = FRAME.outer + FRAME.brassDark + FRAME.brass + FRAME.stone + FRAME.inner;
    expect(sum).toBe(FRAME.band);
  });
});

describe('混色', () => {
  it('t=0 取 a、t=1 取 b、中间按通道线性插值', () => {
    expect(mixColor(0x000000, 0xffffff, 0)).toBe(0x000000);
    expect(mixColor(0x000000, 0xffffff, 1)).toBe(0xffffff);
    expect(mixColor(0x000000, 0xffffff, 0.5)).toBe(0x808080);
  });
  it('t 越界被夹到 0..1，非数值按 0 处理', () => {
    expect(mixColor(0x000000, 0xffffff, -3)).toBe(0x000000);
    expect(mixColor(0x000000, 0xffffff, 7)).toBe(0xffffff);
    expect(mixColor(0x000000, 0xffffff, NaN)).toBe(0x000000);
  });
});

describe('血量档位', () => {
  it('三档边界：>0.6 完好 / 0.3~0.6 陈旧 / <=0.3 破损', () => {
    expect(frameTone(1).tier).toBe('intact');
    expect(frameTone(0.61).tier).toBe('intact');
    expect(frameTone(0.6).tier).toBe('worn');
    expect(frameTone(0.31).tier).toBe('worn');
    expect(frameTone(0.3).tier).toBe('failing');
    expect(frameTone(0).tier).toBe('failing');
  });
  it('档位数值与设计文档一致', () => {
    expect(frameTone(1)).toMatchObject({ breathHz: 0.3, pulseHz: 0, crackCount: 0, debrisPerSec: 0, seep: 0, bloodMix: 0 });
    expect(frameTone(0.5)).toMatchObject({ breathHz: 0.2, pulseHz: 0, crackCount: 3, debrisPerSec: 0, seep: 0.35, bloodMix: 0.35 });
    expect(frameTone(0.1)).toMatchObject({ breathHz: 0, pulseHz: 1.1, crackCount: 6, debrisPerSec: 0.9, seep: 1, bloodMix: 1 });
  });
  it('NaN / Infinity / 负数不抛错，落到确定档位', () => {
    for (const bad of [NaN, Infinity, -Infinity, -1, undefined, null, '0.2']) {
      const tone = frameTone(bad);
      expect(['intact', 'worn', 'failing']).toContain(tone.tier);
    }
    expect(frameTone(NaN).tier).toBe('failing');
    expect(frameTone(-1).tier).toBe('failing');
    expect(frameTone(3).tier).toBe('intact');
  });
});

describe('裂纹生成', () => {
  it('同种子同结果，不同种子不同结果', () => {
    const a = frameCracks('run-1:frame:1', 6);
    const b = frameCracks('run-1:frame:1', 6);
    const c = frameCracks('run-2:frame:1', 6);
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });
  it('条数准确，起点在画布最外沿，长度落在 6~14px', () => {
    const cracks = frameCracks('s', 6);
    expect(cracks).toHaveLength(6);
    for (const crack of cracks) {
      const start = crack.points[0];
      const end = crack.points[crack.points.length - 1];
      if (crack.edge === 'top') expect(start.y).toBe(0);
      if (crack.edge === 'bottom') expect(start.y).toBe(269);
      if (crack.edge === 'left') expect(start.x).toBe(0);
      if (crack.edge === 'right') expect(start.x).toBe(479);
      const len = Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
      expect(len).toBeGreaterThanOrEqual(6);
      expect(len).toBeLessThanOrEqual(14);
      for (const p of crack.points) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(479);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(269);
      }
    }
  });
  it('count<=0 或非数值返回空数组且不抛错', () => {
    expect(frameCracks('s', 0)).toEqual([]);
    expect(frameCracks('s', -3)).toEqual([]);
    expect(frameCracks('s', NaN)).toEqual([]);
  });
});

import BattleFrame from '../src/ui/battle-frame.js';

function fakeGraphics() {
  const calls = [];
  const g = {
    calls,
    depth: 0,
    scrollFactorX: 1,
    scrollFactorY: 1,
    setDepth(d) { g.depth = d; return g; },
    setScrollFactor(n) { g.scrollFactorX = n; g.scrollFactorY = n; return g; },
    fillStyle: () => g,
    fillRect: (...a) => { calls.push(['rect', ...a]); return g; },
    lineStyle: () => g,
    strokePoints: () => g,
    fillPoints: () => g,
    clear: () => { calls.push(['clear']); return g; },
  };
  return g;
}

function fakeScene() {
  const made = [];
  return {
    made,
    add: {
      graphics: () => {
        const g = fakeGraphics();
        made.push(g);
        return g;
      },
    },
  };
}

describe('BattleFrame 静态层', () => {
  it('构造出三层 graphics，深度 6000/6001/6002 且固定于视口', () => {
    const frame = new BattleFrame(fakeScene(), 'seed');
    expect(frame.base.depth).toBe(6000);
    expect(frame.wear.depth).toBe(6001);
    expect(frame.dyn.depth).toBe(6002);
    for (const g of [frame.base, frame.wear, frame.dyn]) expect(g.scrollFactorX).toBe(0);
  });
  it('底图绘制覆盖四边框身，且不越出画布', () => {
    const frame = new BattleFrame(fakeScene(), 'seed');
    expect(frame.base.calls.length).toBeGreaterThan(40);
    for (const [, x, y, w, h] of frame.base.calls) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + w).toBeLessThanOrEqual(480);
      expect(y + h).toBeLessThanOrEqual(270);
    }
  });
  it('完好档不画裂纹；破损档画裂纹；血量回升后裂纹图元被清空', () => {
    const rectsSinceClear = (g) => {
      let start = 0;
      g.calls.forEach((c, i) => { if (c[0] === 'clear') start = i + 1; });
      return g.calls.slice(start).filter((c) => c[0] === 'rect').length;
    };
    const frame = new BattleFrame(fakeScene(), 'seed');
    expect(rectsSinceClear(frame.wear)).toBe(0);
    frame.setRatio(0.1);
    expect(frame.tone.tier).toBe('failing');
    expect(rectsSinceClear(frame.wear)).toBeGreaterThan(0);
    frame.setRatio(1);
    expect(frame.tone.tier).toBe('intact');
    expect(rectsSinceClear(frame.wear)).toBe(0);
  });
  it('同档位重复喂入不重复重绘', () => {
    const frame = new BattleFrame(fakeScene(), 'seed');
    frame.setRatio(0.1);
    const before = frame.wear.calls.length;
    frame.setRatio(0.12);
    expect(frame.wear.calls.length).toBe(before);
  });
});
