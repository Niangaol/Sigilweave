import { describe, expect, it } from 'vitest';
import {
  drawNail, drawLord, drawSoulFire, drawSevenStars, drawAshPile, drawBloodCracks, drawFog, drawCandle,
} from '../src/ui/cine-props.js';
import { C } from '../src/ui/Palette.js';

// 记录型 graphics：记录每次绘制与颜色，用来数预算、查确定性、验「未点燃不画焰」。
function rec() {
  const ops = [];
  const g = {
    _c: 0, _a: 1,
    fillStyle(c, a = 1) { this._c = c; this._a = a; return this; },
    lineStyle(w, c, a = 1) { this._c = c; this._a = a; return this; },
    fillRect(x, y, w, h) { ops.push({ x, y, w, h, c: this._c, a: this._a }); return this; },
    lineBetween(x1, y1, x2, y2) { ops.push({ x: x1, y: y1, w: x2, h: y2, c: this._c, a: this._a, line: true }); return this; },
    strokePoints() { ops.push({ pts: true, c: this._c, a: this._a }); return this; },
    fillPoints() { ops.push({ pts: true, c: this._c, a: this._a }); return this; },
  };
  return { g, ops };
}

const call = (fn, opts) => {
  const { g, ops } = rec();
  const returned = fn(g, opts);
  return { ops, returned };
};

const ints = (ops) => ops.every(o => o.pts || [o.x, o.y, o.w, o.h].every(Number.isInteger));
const alphas = (ops) => ops.every(o => o.a >= 0 && o.a <= 1);

describe('过场道具库', () => {
  const cases = [
    ['drawNail', drawNail, { x: 240, y: 180, len: 14 }],
    ['drawLord', drawLord, { x: 240, y: 120, act: 1 }],
    ['drawSoulFire', drawSoulFire, { x: 240, y: 150, r: 5 }],
    ['drawSevenStars', drawSevenStars, { cx: 240, cy: 100, r: 60 }],
    ['drawAshPile', drawAshPile, { x: 240, y: 180, w: 26, h: 8, seed: 4 }],
    ['drawBloodCracks', drawBloodCracks, { x: 240, y: 150, len: 26, seed: 3 }],
    ['drawFog', drawFog, { x: 0, y: 150, w: 120, count: 3, seed: 5 }],
    ['drawCandle', drawCandle, { x: 240, y: 180, h: 10 }],
  ];

  it.each(cases)('%s：≤60 指令、整数坐标、alpha 合法、同参确定', (name, fn, opts) => {
    const a = call(fn, opts);
    const b = call(fn, opts);
    expect(a.ops.length).toBeGreaterThan(0);
    expect(a.ops.length).toBeLessThanOrEqual(60);
    expect(a.returned).toBe(a.ops.length);
    expect(ints(a.ops)).toBe(true);
    expect(alphas(a.ops)).toBe(true);
    expect(a.ops).toEqual(b.ops);
  });

  it('未点燃的烛不画焰与光晕', () => {
    const lit = call(drawCandle, { x: 100, y: 180, h: 10, lit: true });
    const dark = call(drawCandle, { x: 100, y: 180, h: 10, lit: false });
    expect(lit.ops.length).toBeGreaterThan(dark.ops.length);
    const flame = dark.ops.filter(o => o.c === C.arcane || o.c === C.arcaneLight);
    expect(flame).toHaveLength(0);
  });

  it('契约主每幕都有剪影，第七幕不拿配件', () => {
    const counts = [1, 2, 3, 4, 5, 6, 7].map(act => call(drawLord, { x: 240, y: 120, act }).returned);
    counts.forEach(n => expect(n).toBeGreaterThan(5));
    expect(counts[6]).toBeLessThan(counts[0]);
  });

  it('北斗七星：连线可关，未点亮的星不出十字光', () => {
    const conn = call(drawSevenStars, { cx: 240, cy: 100, r: 60, connect: true });
    const plain = call(drawSevenStars, { cx: 240, cy: 100, r: 60, connect: false });
    expect(conn.ops.length).toBeGreaterThan(plain.ops.length);
    const off = call(drawSevenStars, { cx: 240, cy: 100, r: 60, connect: false, lit: [true, false, false, false, false, false, false] });
    expect(off.ops.length).toBeLessThan(plain.ops.length);
  });

  it('血纹按段点亮：段数越多指令越多', () => {
    const n = [0, 1, 2, 3, 4].map(lit => call(drawBloodCracks, { x: 200, y: 100, len: 40, lit }).returned);
    for (let i = 1; i < n.length; i++) expect(n[i]).toBeGreaterThanOrEqual(n[i - 1]);
    expect(n[4]).toBeGreaterThan(n[0]);
  });
});
