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
    expect(frameTone(0.1)).toMatchObject({ breathHz: 0, pulseHz: 1.1, crackCount: 6, debrisPerSec: 4, seep: 1, bloodMix: 1 });
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
  it('条数准确，起点在画布最外沿，长度落在 4~6px', () => {
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
      expect(len).toBeGreaterThanOrEqual(4);
      expect(len).toBeLessThanOrEqual(6);
      for (const p of crack.points) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(479);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(269);
      }
    }
  });
  it('200 个种子下裂纹都只在 8px 框身里，绝不进内开口（HUD/罗盘）', () => {
    for (let i = 0; i < 200; i++) {
      for (const crack of frameCracks(`seed-${i}:frame:${i % 4}`, 6)) {
        for (const p of crack.points) {
          if (crack.edge === 'top') expect(p.y).toBeLessThanOrEqual(7);
          if (crack.edge === 'bottom') expect(p.y).toBeGreaterThanOrEqual(262);
          if (crack.edge === 'left') expect(p.x).toBeLessThanOrEqual(7);
          if (crack.edge === 'right') expect(p.x).toBeGreaterThanOrEqual(472);
        }
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

import { FRAME_DEBRIS_CAP } from '../src/ui/battle-frame.js';

// 30 秒、60fps、破损档的可视性统计：碎屑是低血四表现里唯一"动"的元素，
// 必须真的同屏挂着几颗，而不是每 1111ms 闪一颗、掉完就空。
function sampleDebris(seed, seconds = 30) {
  const frame = new BattleFrame(fakeScene(), seed);
  let now = 0;
  let peak = 0;
  let zeroFrames = 0;
  const frames = seconds * 60;
  for (let i = 0; i < frames; i++) {
    now += 16;
    frame.update({ ratio: 0.1, now, dt: 16 });
    peak = Math.max(peak, frame.debris.length);
    if (frame.debris.length === 0) zeroFrames++;
  }
  return { frame, peak, zeroFrames, frames };
}

describe('BattleFrame 动态层', () => {
  it('完好档动态层只有呼吸，不产生碎屑', () => {
    const frame = new BattleFrame(fakeScene(), 'seed');
    for (let t = 0; t < 3000; t += 16) frame.update({ ratio: 1, now: t, dt: 16 });
    expect(frame.debris).toHaveLength(0);
  });
  it('碎屑上限就是 8：导出值与字面量各守一遍', () => {
    expect(FRAME_DEBRIS_CAP).toBe(8);
    const { peak } = sampleDebris('frame:frame:1');
    expect(peak).toBeLessThanOrEqual(8);
  });
  it('破损档 30 秒同屏稳定 3 颗以上，空帧不足三成（低血"掉渣"真的看得见）', () => {
    for (const seed of ['frame:frame:1', 'seed']) {
      const { peak, zeroFrames, frames } = sampleDebris(seed);
      expect(peak).toBeGreaterThanOrEqual(3);
      expect(zeroFrames / frames).toBeLessThan(0.3);
    }
  });
  it('暂停（dt=0 且 now 不前进）时碎屑与动态图层输出都完全不变', () => {
    const frame = new BattleFrame(fakeScene(), 'seed');
    for (let t = 0; t < 2000; t += 16) frame.update({ ratio: 0.1, now: t, dt: 16 });
    const debrisBefore = frame.debris.map((d) => ({ ...d }));
    // 图元 calls 是累积的：只取最近一次 clear 之后的这一帧
    const lastFrame = () => {
      const calls = frame.dyn.calls;
      let start = 0;
      calls.forEach((c, i) => { if (c[0] === 'clear') start = i + 1; });
      return JSON.stringify(calls.slice(start).filter((c) => c[0] === 'rect'));
    };
    frame.update({ ratio: 0.1, now: 2000, dt: 0 });
    const callsBefore = lastFrame();
    expect(callsBefore.length).toBeGreaterThan(2);
    for (let i = 0; i < 30; i++) frame.update({ ratio: 0.1, now: 2000, dt: 0 });
    expect(frame.debris).toEqual(debrisBefore);
    expect(lastFrame()).toBe(callsBefore);
  });
  it('碎屑只在左右两条竖框里下落，30 秒里没有一颗飘进画面（终审 nit 3）', () => {
    // 上沿掉渣要横穿整幅画面才落地，会被读成画面里的噪点而不是画框在碎；
    // 所以只从左右竖框生成，且横向抖动也被夹在 8px 框身里。
    const frame = new BattleFrame(fakeScene(), 'frame:frame:1');
    let seen = 0;
    let offBand = 0;
    for (let now = 16; now <= 30000; now += 16) {
      frame.update({ ratio: 0.1, now, dt: 16 });
      for (const d of frame.debris) {
        seen++;
        const left = d.x >= 2 && d.x + d.size <= 8;
        const right = d.x >= 480 - 8 && d.x + d.size <= 480;
        if (!left && !right) offBand++;
      }
    }
    expect(seen).toBeGreaterThan(100);
    expect(offBand).toBe(0);
  });
  it('最坏帧：碎屑撑满 8 颗时，单帧动态层图元仍不超过 60 个', () => {
    const frame = new BattleFrame(fakeScene(), 'seed');
    frame.setRatio(0.1);
    frame.debris = Array.from({ length: 8 }, (_, i) => ({
      x: 3 + i, y: 3 + i, vx: 0, vy: 0, life: 2600, size: 2, tone: i % 2 ? 'brass' : 'stone',
    }));
    frame.update({ ratio: 0.1, now: 1234, dt: 16 });
    const rects = frame.dyn.calls.filter((c) => c[0] === 'rect').length;
    expect(rects).toBeLessThanOrEqual(60);
  });
  it('血量比例越界被夹到确定档位（不在 0..1 之外改状态）', () => {
    const frame = new BattleFrame(fakeScene(), 'seed');
    frame.update({ ratio: 5, now: 0, dt: 16 });
    expect(frame.tone.tier).toBe('intact');
    frame.update({ ratio: -2, now: 16, dt: 16 });
    expect(frame.tone.tier).toBe('failing');
  });
  it('磨损层像素全部落在框身内（裂纹高光也不越界）', () => {
    const frame = new BattleFrame(fakeScene(), 'seed');
    frame.setRatio(0.1);
    const rects = frame.wear.calls.filter((c) => c[0] === 'rect');
    expect(rects.length).toBeGreaterThan(0);
    for (const [, x, y, w, h] of rects) {
      const outside = x >= 472 || y >= 262 || x + w <= 8 || y + h <= 8;
      expect(outside).toBe(true);
    }
  });
});

import { afterEach, vi } from 'vitest';
import { setPortrait } from '../src/ui/Palette.js';
import { createBattleFrame } from '../src/scenes/BattleScene.js';

// 沙箱里没有浏览器：用最小 Phaser 替身只为让场景模块能被 import（与 tests/battle-flow.test.js 同款）
vi.mock('phaser', () => ({
  default: { Scene: class { constructor(key) { this.key = key; } } },
}));

function frameScene() {
  const made = [];
  return {
    made,
    add: { graphics: () => { const g = fakeGraphics(); made.push(g); return g; } },
  };
}

describe('画框接入战斗场景', () => {
  afterEach(() => setPortrait(false));
  it('横屏构造画框，种子带上局内 seed 与场次', () => {
    setPortrait(false);
    const frame = createBattleFrame(frameScene(), { seed: 'run-x', stage: 3 });
    expect(frame).toBeDefined();
    expect(frame.seed).toContain('run-x');
    expect(frame.seed).toContain('3');
  });
  it('竖屏不构造画框', () => {
    setPortrait(true);
    expect(createBattleFrame(frameScene(), { seed: 'run-x', stage: 1 })).toBeUndefined();
  });
});

import { applyBoardLayout, BOARD, hullPoints } from '../src/ui/SigilBoard.js';

describe('罗盘为画框让位', () => {
  it('横屏面板与台面都不越过内开口，也不被右下角角花咬掉（终审 nit 4）', () => {
    applyBoardLayout(false);
    expect(BOARD.panel.x).toBe(318);
    expect(BOARD.panel.x + BOARD.panel.w).toBeLessThanOrEqual(472);
    // 右下角角花占 x466..479 × y256..269（14×14），面板下沿早于 y256 才不被咬
    expect(BOARD.panel.y + BOARD.panel.h).toBeLessThan(256);
    expect(BOARD.panel.y + BOARD.panel.h).toBeLessThanOrEqual(262);
    const hull = hullPoints();
    expect(Math.max(...hull.map((p) => p.x))).toBeLessThanOrEqual(472);
    expect(Math.max(...hull.map((p) => p.y))).toBeLessThanOrEqual(262);
  });
});
