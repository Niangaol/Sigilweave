import { describe, expect, it } from 'vitest';
import { dioramaLayout, BAND_BUDGET } from '../src/ui/dioramas/registry.js';
import * as act1 from '../src/ui/dioramas/act1.js';
import { C } from '../src/ui/Palette.js';

// 记录型 graphics：把 fillRect / strokePoints 原样记下来，既能数预算也能查构图。
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

const run = (band, act, w, h) => {
  const { g, ops } = recorder();
  const L = dioramaLayout(act, w, h);
  act1[band](g, L);
  return { ops, L };
};

describe('第 I 幕 荒废墓园', () => {
  it('锚点：地平线 120、钉/主/光 落在碑座上沿之上', () => {
    const L = dioramaLayout(1, 480, 270);
    expect(L.horizon).toBe(120);
    expect(L.anchors.nail).toEqual({ x: 240, y: 184, r: 5 });
    expect(L.anchors.lord).toMatchObject({ x: 268, y: 150 });
    expect(L.anchors.light).toMatchObject({ x: 106, y: 46 });
    expect(L.anchors.gate.x).toBe(130);
    expect(L.anchors.nail.y).toBeLessThanOrEqual(270 - 84);

    const T = dioramaLayout(1, 480, 760);
    expect(T.anchors.nail.y).toBeLessThanOrEqual(760 - 104);
    expect(T.horizon).toBe(338);
  });

  it('三层都画、预算内、坐标全为整数、同参确定', () => {
    for (const band of ['back', 'mid', 'fore']) {
      const a = run(band, 1, 480, 270);
      expect(a.ops.length).toBeGreaterThan(20);
      expect(a.ops.length).toBeLessThanOrEqual(BAND_BUDGET[band]);
      for (const op of a.ops) {
        if (op.t === 'r') {
          for (const v of [op.x, op.y, op.w, op.h]) expect(Number.isInteger(v)).toBe(true);
        } else {
          for (const p of op.pts) expect(Number.isInteger(p.x) && Number.isInteger(p.y)).toBe(true);
        }
        expect(op.a).toBeGreaterThanOrEqual(0);
        expect(op.a).toBeLessThanOrEqual(1);
      }
      const b = run(band, 1, 480, 270);
      expect(b.ops).toEqual(a.ops);
      expect(a.ops.length).toBeLessThanOrEqual(BAND_BUDGET[band]);
    }
  });

  it('辨识标记：残月有幕色、七碑错落、铁栅栏九根、石板错缝', () => {
    const back = run('back', 1, 480, 270);
    const moon = back.ops.filter(o => o.t === 'r' && o.c === 0xc9a227 && Math.abs(o.y - 46) <= 16 && Math.abs(o.x - 106) <= 16);
    expect(moon.length).toBeGreaterThan(6);
    // 幕色只上光源/纹样：远处星点也用幕色，但不许糊成一片
    const accentAll = back.ops.filter(o => o.t === 'r' && o.c === 0xc9a227);
    expect(accentAll.length - moon.length).toBeLessThan(40);

    const mid = run('mid', 1, 480, 270);
    const ground = mid.L.anchors.nail.y;
    // 碑体按纵深分三档明度（近 stoneLight / 中 stone / 远 stoneDark），三档都算"碑"
    const stoneTones = [C.stoneLight, C.stone, C.stoneDark];
    const stones = mid.ops.filter(o => o.t === 'r' && stoneTones.includes(o.c) && o.h >= 12 && o.w >= 12 && o.a > 0.7);
    expect(stones.length).toBeGreaterThanOrEqual(7);
    expect(new Set(stones.map(o => o.c)).size).toBeGreaterThanOrEqual(3);
    const bases = new Set(stones.map(o => o.y + o.h));
    expect(bases.size).toBeGreaterThanOrEqual(2);

    const bars = mid.ops.filter(o => o.t === 'r' && o.w === 1 && o.h >= 16 && o.x > 480 * 0.62);
    expect(bars.length).toBeGreaterThanOrEqual(9);

    const seams = mid.ops.filter(o => o.t === 'r' && o.h === 1 && o.w === 480 && o.y > mid.L.horizon);
    expect(seams.length).toBeGreaterThanOrEqual(4);
    expect(ground).toBe(184);
  });
});
