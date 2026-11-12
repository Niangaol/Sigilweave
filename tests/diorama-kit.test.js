import { describe, expect, it } from 'vitest';
import * as kit from '../src/ui/diorama-kit.js';

// 记录型 stub：既计指令数，也保存调用序列用于「同种子完全一致」的断言。
function makeRec() {
  const ops = [];
  const g = {
    ops,
    clear() { ops.push(['clear']); return g; },
    fillStyle(c, a) { ops.push(['fillStyle', c, a]); return g; },
    lineStyle(t, c, a) { ops.push(['lineStyle', t, c, a]); return g; },
    fillRect(x, y, w, h) { ops.push(['fillRect', x, y, w, h]); return g; },
    lineBetween(x1, y1, x2, y2) { ops.push(['lineBetween', x1, y1, x2, y2]); return g; },
    strokePoints(p) { ops.push(['strokePoints', p.length]); return g; },
    fillPoints(p) { ops.push(['fillPoints', p.length]); return g; },
    setDepth() { return g; },
    setBlendMode() { return g; },
  };
  return g;
}

function assertFinite(g) {
  for (const op of g.ops) {
    for (let i = 1; i < op.length; i++) {
      const v = op[i];
      if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('非有限数值: ' + op.join(','));
    }
  }
}

function assertInteger(g) {
  for (const op of g.ops) {
    if (op[0] !== 'fillRect') continue;
    for (let i = 1; i < op.length; i++) {
      if (!Number.isInteger(op[i])) throw new Error('非整数矩形: ' + op.join(','));
    }
  }
}

describe('diorama-kit 尖拱几何', () => {
  it('起拱点落在 baseY、拱顶正好抬到 h、左右对称', () => {
    const pts = kit.archPoints(240, 160, 60, 84, 16);
    expect(pts.length).toBe(33); // 左半 17 点（含拱顶）+ 镜像 16 点（含右起拱点）
    expect(pts[0]).toEqual({ x: 210, y: 160 });
    expect(pts[pts.length - 1]).toEqual({ x: 270, y: 160 });
    const minY = Math.min(...pts.map(p => p.y));
    expect(minY).toBe(160 - 84);
    // 对称：第一与最后一点关于 cx 镜像
    expect(pts[0].x + pts[pts.length - 1].x).toBe(480);
  });

  it('h ≤ w/2 退化为半圆拱，仍然收在两个起拱点上', () => {
    const pts = kit.archPoints(100, 90, 60, 20, 10);
    expect(pts[0].y).toBe(90);
    expect(pts[pts.length - 1].y).toBe(90);
    expect(Math.min(...pts.map(p => p.y))).toBe(70);
    for (const p of pts) expect(Number.isInteger(p.x) && Number.isInteger(p.y)).toBe(true);
  });
});

describe('diorama-kit 材质绘制', () => {
  it('砖墙：同种子完全一致、异种子不同，坐标全整数', () => {
    const opts = { x: 20, y: 30, w: 180, h: 90, rowH: 8, segW: 16, color: 0x2a2342, face: 0x4a4166, dark: 0x1c1729, seed: 3 };
    const a = makeRec(); kit.bricks(a, opts);
    const b = makeRec(); kit.bricks(b, opts);
    const c = makeRec(); kit.bricks(c, { ...opts, seed: 4 });
    expect(a.ops).toEqual(b.ops);
    expect(a.ops.length).toBe(c.ops.length);
    expect(JSON.stringify(a.ops)).not.toBe(JSON.stringify(c.ops));
    assertFinite(a); assertInteger(a);
    expect(a.ops.length).toBeLessThanOrEqual(520);
  });

  it('乱石块/瓦砾/苔痕都是确定性的，且不越界抖动', () => {
    const runs = [
      (g) => kit.ashlar(g, { x: 0, y: 0, w: 200, h: 60, color: 0x3b3157, face: 0x4a4166, seed: 2 }),
      (g) => kit.rubble(g, { x: 10, y: 100, w: 160, h: 12, color: 0x3b3157, color2: 0x2a2342, seed: 4 }),
      (g) => kit.moss(g, { x: 0, y: 80, w: 200, h: 40, seed: 6, color: 0x849c6c }),
      (g) => kit.cracks(g, { x: 100, y: 20, len: 40, seed: 8, color: 0x0d0a17 }),
      (g) => kit.starfield(g, { x: 0, y: 0, w: 480, h: 100, seed: 10, count: 60 }),
      (g) => kit.water(g, { x: 0, y: 120, w: 480, h: 40, seed: 12 }),
    ];
    for (const run of runs) {
      const a = makeRec(); run(a);
      const b = makeRec(); run(b);
      expect(a.ops).toEqual(b.ops);
      assertFinite(a); assertInteger(a);
    }
  });

  it('彩窗/立柱/木板/阶梯落笔数受控，且所有透明度落在 0..1', () => {
    const g = makeRec();
    kit.archWindow(g, { cx: 240, baseY: 200, w: 70, h: 110, glass: 0x2f5a8e, glass2: 0x8e2f3c });
    kit.column(g, { cx: 60, topY: 40, bottomY: 200, w: 12 });
    kit.planks(g, { x: 0, y: 200, w: 120, h: 40, color: 0x4a3826, dark: 0x2a1f14, light: 0x6a5236 });
    kit.steps(g, { cx: 240, y: 180, w: 120, count: 4, color: 0x3b3157, light: 0x4a4166 });
    assertFinite(g); assertInteger(g);
    for (const op of g.ops) {
      if (op[0] === 'fillStyle' || op[0] === 'lineStyle') {
        const a = op[op.length - 1];
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(1);
      }
    }
    expect(g.ops.length).toBeLessThanOrEqual(160);
  });

  it('一面「号称完整」的静态中景墙不超过 1300 条指令预算', () => {
    const g = makeRec();
    kit.bricks(g, { x: 0, y: 20, w: 480, h: 100, rowH: 8, segW: 18, color: 0x2a2342, face: 0x4a4166, dark: 0x1c1729, seed: 21, density: 0.4 });
    kit.pointedArch(g, { cx: 120, baseY: 150, w: 60, h: 84, t: 1, color: 0x6b5b8e });
    kit.pointedArch(g, { cx: 360, baseY: 150, w: 60, h: 84, t: 1, color: 0x6b5b8e });
    kit.column(g, { cx: 40, topY: 20, bottomY: 150, w: 12 });
    kit.floor(g, { w: 480, h: 270, horizon: 150 });
    kit.moss(g, { x: 0, y: 120, w: 480, h: 30, seed: 5, count: 60 });
    expect(g.ops.length).toBeLessThanOrEqual(1300);
  });
});
