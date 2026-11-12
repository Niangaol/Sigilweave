import { describe, expect, it } from 'vitest';
import { DIORAMAS, BAND_BUDGET, getDiorama, dioramaLayout, drawBand, DIORAMA_BANDS } from '../src/ui/dioramas/registry.js';

function makeRec() {
  const ops = [];
  const g = {
    ops,
    clear() { ops.push(['clear']); return g; },
    fillStyle(c, a) { g._c = c; g._a = a; return g; },
    lineStyle(t, c, a) { g._c = c; g._a = a; return g; },
    fillRect(x, y, w, h) { ops.push(['fillRect', x, y, w, h]); return g; },
    lineBetween(x1, y1, x2, y2) { ops.push(['lineBetween', x1, y1, x2, y2]); return g; },
    strokePoints(p) { ops.push(['strokePoints', p.length]); return g; },
    fillPoints(p) { ops.push(['fillPoints', p.length]); return g; },
    setDepth() { return g; },
    setBlendMode() { return g; },
  };
  return g;
}

describe('七幕布景注册表', () => {
  it('1..7 各有独立 id 与幕色；越界幕号夹取到最近一幕', () => {
    const ids = DIORAMAS.slice(1).map(d => d.id);
    expect(ids).toHaveLength(7);
    expect(new Set(ids).size).toBe(7);
    expect(new Set(DIORAMAS.slice(1).map(d => d.accent)).size).toBe(7);
    expect(getDiorama(0).act).toBe(1);
    expect(getDiorama(99).act).toBe(7);
    expect(getDiorama(undefined).act).toBe(1);
  });

  it('横屏与竖屏的锚点都是整数像素、落在画布内，地平线在 0.5–0.72 之间', () => {
    for (const act of [1, 2, 3, 4, 5, 6, 7]) {
      for (const [w, h] of [[480, 270], [480, 760]]) {
        const L = dioramaLayout(act, w, h);
        expect(Number.isInteger(L.horizon), act + '/' + h).toBe(true);
        expect(+((L.horizon / 270).toFixed(3))).toBeGreaterThanOrEqual(0.44);
        expect(L.horizon / h).toBeLessThanOrEqual(0.72);
        expect(L.floorY).toBeGreaterThan(L.horizon);
        for (const [key, p] of Object.entries(L.anchors)) {
          expect(Number.isInteger(p.x) && Number.isInteger(p.y) && Number.isInteger(p.r), act + ':' + key).toBe(true);
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.x).toBeLessThanOrEqual(w);
          expect(p.y).toBeGreaterThanOrEqual(0);
          expect(p.y).toBeLessThanOrEqual(h);
          expect(p.r).toBeGreaterThan(0);
        }
        expect(L.anchors.seal).toBeTruthy();
      }
    }
  });

  it('每幕三层都能画、同参确定性、单带不超预算、坐标全整数', () => {
    for (const act of [1, 2, 3, 4, 5, 6, 7]) {
      for (const [w, h] of [[480, 270], [480, 760]]) {
        const L = dioramaLayout(act, w, h);
        for (const band of DIORAMA_BANDS) {
          const a = makeRec();
          const b = makeRec();
          expect(drawBand(act, band, a, L), act + ':' + band).toBe(true);
          drawBand(act, band, b, L);
          expect(a.ops.length, act + ':' + band).toBeGreaterThan(0);
          expect(a.ops, act + ':' + band + ':确定性').toEqual(b.ops);
          expect(a.ops.length, act + ':' + band + ':预算').toBeLessThanOrEqual(BAND_BUDGET[band]);
          for (const op of a.ops) {
            for (let i = 1; i < op.length; i++) {
              const v = op[i];
              if (typeof v === 'number') expect(Number.isFinite(v), op.join(',')).toBe(true);
            }
            if (op[0] === 'fillRect') {
              for (let i = 1; i < op.length; i++) expect(Number.isInteger(op[i]), op.join(',')).toBe(true);
            }
          }
        }
      }
    }
  });
});
