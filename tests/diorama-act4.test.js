import { describe, expect, it } from 'vitest';
import { dioramaLayout, BAND_BUDGET } from '../src/ui/dioramas/registry.js';
import * as act4 from '../src/ui/dioramas/act4.js';
import { C } from '../src/ui/Palette.js';

// 记录型 graphics：把 fillRect / strokePoints / fillPoints 原样记下来，既能数预算也能查构图。
function recorder() {
  const ops = [];
  const g = {
    _c: 0, _a: 1,
    fillStyle(c, a = 1) { this._c = c; this._a = a; return this; },
    lineStyle(w, c, a = 1) { this._c = c; this._a = a; return this; },
    fillRect(x, y, w, h) { ops.push({ t: 'r', x, y, w, h, c: this._c, a: this._a }); return this; },
    strokePoints(pts, close) { ops.push({ t: 'p', pts, close, c: this._c, a: this._a }); return this; },
    fillPoints(pts, close) { ops.push({ t: 'f', pts, close, c: this._c, a: this._a }); return this; },
  };
  return { g, ops };
}

const run = (band, w, h) => {
  const { g, ops } = recorder();
  const L = dioramaLayout(4, w, h);
  act4[band](g, L);
  return { ops, L };
};

const bounds = (op) => {
  if (op.t === 'r') return { x1: op.x, y1: op.y, x2: op.x + op.w, y2: op.y + op.h };
  const xs = op.pts.map(p => p.x), ys = op.pts.map(p => p.y);
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
};

const SPINES = [C.bloodDark, C.mossTileLit, C.runeDim];

describe('第 IV 幕 沉钟书库', () => {
  it('锚点：地平线 132、钟顶/钟口锚点落在碑座上沿之上', () => {
    const L = dioramaLayout(4, 480, 270);
    expect(L.horizon).toBe(132);
    expect(L.anchors.seal).toEqual({ x: 240, y: 113, r: 43 });
    expect(L.anchors.gate).toEqual({ x: 240, y: 157, r: 32 });
    expect(L.anchors.gate.y).toBeLessThanOrEqual(270 - 84);

    const T = dioramaLayout(4, 480, 760);
    expect(T.horizon).toBe(372);
    expect(T.anchors.seal.y).toBe(319);
    expect(T.anchors.gate.y).toBe(441);
    expect(T.anchors.gate.y).toBeLessThanOrEqual(760 - 104);
  });

  it('三层都画、横竖屏都在预算内、坐标全整数、同参确定', () => {
    for (const [w, h] of [[480, 270], [480, 760]]) {
      for (const band of ['back', 'mid', 'fore']) {
        const a = run(band, w, h);
        expect(a.ops.length, band + ':' + h).toBeGreaterThan(20);
        expect(a.ops.length, band + ':' + h + ':预算').toBeLessThanOrEqual(BAND_BUDGET[band]);
        for (const op of a.ops) {
          if (op.t === 'r') {
            for (const v of [op.x, op.y, op.w, op.h]) expect(Number.isInteger(v), JSON.stringify(op)).toBe(true);
          } else {
            for (const p of op.pts) expect(Number.isInteger(p.x) && Number.isInteger(p.y), JSON.stringify(op)).toBe(true);
          }
          expect(op.a).toBeGreaterThanOrEqual(0);
          expect(op.a).toBeLessThanOrEqual(1);
        }
        const b = run(band, w, h);
        expect(b.ops, band + ':' + h + ':确定性').toEqual(a.ops);
      }
    }
  });

  it('辨识标记：铜钟吊在木梁下、三色书脊成簇、翻飞书页', () => {
    const back = run('back', 480, 270);
    // ① 书架：三色书脊（暗红/苔绿/冷蓝）左右两侧都成簇，缺书处留黑洞
    const spines = back.ops.filter(o => o.t === 'r' && o.w >= 1 && o.w <= 6 && o.h >= 3 && o.h <= 30 && SPINES.includes(o.c));
    expect(spines.length).toBeGreaterThanOrEqual(30);
    for (const col of SPINES) expect(spines.filter(o => o.c === col).length, '书脊色').toBeGreaterThanOrEqual(6);
    expect(spines.some(o => o.x < 120)).toBe(true);
    expect(spines.some(o => o.x > 360)).toBe(true);
    // 幕色只上光源（高窗/吊烛），不许整片染色
    const accentOps = back.ops.filter(o => o.c === back.L.accent);
    expect(accentOps.length).toBeGreaterThan(8);
    expect(accentOps.filter(o => o.t === 'r' && o.w > 160 && o.h > 24)).toEqual([]);

    // ② 铜钟：钟口落在 gate 锚点，钟体从 seal 锚点垂下，横梁在钟顶上方
    const mid = run('mid', 480, 270);
    const { seal, gate } = mid.L.anchors;
    const brass = mid.ops.filter(o => o.t === 'r' && [C.brass, C.brassDark, C.brassLight].includes(o.c)
      && o.x >= seal.x - 40 && o.x + o.w <= seal.x + 41
      && o.y >= seal.y - 30 && o.y <= gate.y + 20 && o.a > 0.5);
    expect(brass.length).toBeGreaterThanOrEqual(8);
    expect(brass.filter(o => o.w >= 30 && Math.abs(o.y - gate.y) <= 24).length).toBeGreaterThanOrEqual(1);
    const beamOps = mid.ops.filter(o => o.t === 'r' && o.w >= 140 && o.h >= 4 && o.y < seal.y - 4 && o.y > seal.y - 40);
    expect(beamOps.length).toBeGreaterThanOrEqual(1);

    // ③ 翻飞书页：mid 里 ≥5 张独立纸页（不含阅读台上的两页也算够数）
    const leaves = mid.ops.filter(o => (o.t === 'f') && o.c === C.parchment).map(bounds);
    expect(leaves.length).toBeGreaterThanOrEqual(5);
    for (const b of leaves) {
      expect(b.x2 - b.x1).toBeGreaterThanOrEqual(4);
      expect(b.y2 - b.y1).toBeGreaterThanOrEqual(3);
      expect(b.x2 - b.x1).toBeLessThanOrEqual(60);
      expect(b.y2 - b.y1).toBeLessThanOrEqual(40);
    }
  });

  it('地面在中景：横向石缝铺在 mid，前景只压边不铺地', () => {
    const mid = run('mid', 480, 270);
    const seams = mid.ops.filter(o => o.t === 'r' && o.h === 1 && o.w === 480 && o.y > mid.L.horizon);
    expect(seams.length).toBeGreaterThanOrEqual(3);
    // 三排纵深：远/中/近三堆书基座 y 不同
    const stackBases = new Set(mid.ops.filter(o => o.t === 'r' && o.h >= 2 && o.h <= 6 && o.w >= 10 && o.w <= 46
      && [C.bloodDark, C.mossTileLit, C.runeDim, C.brassDark].includes(o.c)).map(o => o.y + o.h));
    expect(stackBases.size).toBeGreaterThanOrEqual(3);

    const fore = run('fore', 480, 270);
    // 前景绝不能整片铺地（会把中景盖掉）
    expect(fore.ops.filter(o => o.t === 'r' && o.w >= 400 && o.h > 6)).toEqual([]);
    // 左右压边书架 + 飘落纸页
    expect(fore.ops.some(o => o.t === 'r' && o.x === 0 && o.w >= 30 && o.h > 100)).toBe(true);
    expect(fore.ops.some(o => o.t === 'r' && o.x + o.w === 480 && o.w >= 30 && o.h > 100)).toBe(true);
    expect(fore.ops.filter(o => o.t === 'f' && o.c === C.parchment).length).toBeGreaterThanOrEqual(3);
  });
});
