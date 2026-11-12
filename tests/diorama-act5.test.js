import { describe, expect, it } from 'vitest';
import { dioramaLayout, BAND_BUDGET } from '../src/ui/dioramas/registry.js';
import * as act5 from '../src/ui/dioramas/act5.js';
import { C } from '../src/ui/Palette.js';

// 记录型 graphics：把 fillRect / lineBetween / strokePoints / fillPoints 原样记下来，
// 既能数指令预算也能查构图。比 act1 的桩多记 lineBetween——地面石缝与透视缝走 1px 矢量线。
function recorder() {
  const ops = [];
  const g = {
    _c: 0, _a: 1,
    fillStyle(c, a = 1) { this._c = c; this._a = a; return this; },
    lineStyle(w, c, a = 1) { this._c = c; this._a = a; return this; },
    fillRect(x, y, w, h) { ops.push({ t: 'r', x, y, w, h, c: this._c, a: this._a }); return this; },
    lineBetween(x1, y1, x2, y2) { ops.push({ t: 'l', x1, y1, x2, y2, c: this._c, a: this._a }); return this; },
    strokePoints(pts, close) { ops.push({ t: 'p', pts, close, c: this._c, a: this._a }); return this; },
    fillPoints(pts, close) { ops.push({ t: 'f', pts, close, c: this._c, a: this._a }); return this; },
  };
  return { g, ops };
}

const run = (band, w, h) => {
  const { g, ops } = recorder();
  const L = dioramaLayout(5, w, h);
  act5[band](g, L);
  return { ops, L };
};

// op 的最左/最上坐标（多边形取顶点极值），给「光源只在右上高窗」这类断言用
const minX = (o) => (o.t === 'r' ? o.x : Math.min(...o.pts.map(p => p.x)));
const minY = (o) => (o.t === 'r' ? o.y : Math.min(...o.pts.map(p => p.y)));

describe('第 V 幕 衡律法庭', () => {
  it('锚点：地平线 135、幕色光源在右高窗、契约钉压在碑座上沿之上', () => {
    const L = dioramaLayout(5, 480, 270);
    expect(L.horizon).toBe(135);
    expect(L.accent).toBe(0xcfd6e0);
    expect(L.anchors.seal).toEqual({ x: 240, y: 113, r: 43 });
    expect(L.anchors.gate).toEqual({ x: 240, y: 157, r: 32 });
    expect(L.anchors.nail.x).toBe(240);
    expect(L.anchors.nail.y).toBeLessThanOrEqual(270 - 84);
    expect(L.anchors.lord.x).toBe(240);
    expect(L.anchors.lord.y).toBeLessThan(L.anchors.nail.y);
    expect(L.anchors.light.x).toBeGreaterThan(480 * 0.62);
    expect(L.anchors.light.y).toBeLessThan(L.horizon);

    const T = dioramaLayout(5, 480, 760);
    expect(T.horizon).toBe(380);
    expect(T.anchors.nail.y).toBeLessThanOrEqual(760 - 104);
    expect(T.anchors.light.y).toBeLessThan(T.horizon);
  });

  it('三层都画、预算内、坐标全整数、alpha 合法、同参完全确定', () => {
    for (const [w, h] of [[480, 270], [480, 760]]) {
      for (const band of ['back', 'mid', 'fore']) {
        const a = run(band, w, h);
        expect(a.ops.length, band + '/' + h).toBeGreaterThan(20);
        expect(a.ops.length, band + '/' + h + ':预算').toBeLessThanOrEqual(BAND_BUDGET[band]);
        for (const op of a.ops) {
          if (op.t === 'r') {
            for (const v of [op.x, op.y, op.w, op.h]) expect(Number.isInteger(v), JSON.stringify(op)).toBe(true);
          } else if (op.t === 'l') {
            for (const v of [op.x1, op.y1, op.x2, op.y2]) expect(Number.isInteger(v), JSON.stringify(op)).toBe(true);
          } else {
            for (const p of op.pts) expect(Number.isInteger(p.x) && Number.isInteger(p.y), JSON.stringify(op)).toBe(true);
          }
          expect(op.a).toBeGreaterThanOrEqual(0);
          expect(op.a).toBeLessThanOrEqual(1);
        }
        const b = run(band, w, h);
        expect(b.ops, band + '/' + h + ':确定性').toEqual(a.ops);
      }
    }
  });

  it('辨识标记：四根柱廊、天平横梁 + 双盘（一高一低）、三块判词碑三排', () => {
    const back = run('back', 480, 270);
    // 柱身：高 ≥80 的宽色块，四根且 x 互不相同
    const shafts = back.ops.filter(o => o.t === 'r' && o.c === C.stone && o.w >= 8 && o.h >= 80);
    expect(shafts.length).toBeGreaterThanOrEqual(4);
    expect(new Set(shafts.map(o => o.x)).size).toBeGreaterThanOrEqual(4);

    const mid = run('mid', 480, 270);
    const beam = mid.ops.filter(o => o.t === 'r' && o.c === C.brass && o.h <= 4 && o.w >= 24 && o.y < 140);
    expect(beam.reduce((s, o) => s + o.w, 0)).toBeGreaterThanOrEqual(80);
    // 秤盘：盘口是 24–32 宽的 2px 亮铜条，一左一右且高低不同
    const pans = mid.ops.filter(o => o.t === 'r' && o.c === C.brass && o.w >= 24 && o.w <= 32 && o.h === 2);
    expect(pans.length).toBeGreaterThanOrEqual(2);
    expect(new Set(pans.map(o => o.y)).size).toBe(2);

    // 判词碑：碑身 >=24 宽 / >=30 高，三块、三个不同基座高度
    const tablets = mid.ops.filter(o => o.t === 'r' && o.c === C.stone && o.w >= 24 && o.h >= 30 && o.x < 200);
    expect(tablets.length).toBeGreaterThanOrEqual(3);
    expect(new Set(tablets.map(o => o.y + o.h)).size).toBeGreaterThanOrEqual(3);
    // 蜡印：红点必在碑上
    const seals = mid.ops.filter(o => o.t === 'r' && o.c === C.blood);
    expect(seals.length).toBeGreaterThanOrEqual(1);
  });

  it('前景只有压边栏杆与雾：9 根栏柱 + 通栏横梁，且不铺整片地面', () => {
    const fore = run('fore', 480, 270);
    const bars = fore.ops.filter(o => o.t === 'r' && o.c === C.void && o.w <= 4 && o.h >= 8);
    expect(bars.length).toBeGreaterThanOrEqual(9);
    expect(fore.ops.some(o => o.t === 'r' && o.w === 480 && o.h >= 3)).toBe(true);
    // 地面必须在中景：前景不许出现通栏大地块
    expect(fore.ops.every(o => !(o.t === 'r' && o.w === 480 && o.h >= 20))).toBe(true);

    const mid = run('mid', 480, 270);
    const seams = mid.ops.filter(o => o.t === 'r' && o.w === 480 && o.h <= 2 && o.y > 135);
    expect(seams.length).toBeGreaterThanOrEqual(4);
  });

  it('幕色只上光源：集中在右高窗，不做整片染色', () => {
    const { ops, L } = run('back', 480, 270);
    const accent = ops.filter(o => o.c === L.accent);
    expect(accent.length).toBeGreaterThan(3);
    expect(accent.length).toBeLessThanOrEqual(60);
    for (const o of accent) {
      if (o.t === 'r') expect(o.w).toBeLessThan(200);
      else for (const p of o.pts) expect(Math.abs(p.x - 330)).toBeLessThan(120);
    }
    // 窗户落在 light 锚点附近
    expect(accent.some(o => minX(o) > 300 && minX(o) < 360 && minY(o) < 130)).toBe(true);

    const mid = run('mid', 480, 270);
    const midAccent = mid.ops.filter(o => o.c === L.accent);
    expect(midAccent.length).toBeLessThanOrEqual(40);
  });
});
