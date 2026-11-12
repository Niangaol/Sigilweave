import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dioramaLayout, BAND_BUDGET } from '../src/ui/dioramas/registry.js';
import * as act3 from '../src/ui/dioramas/act3.js';
import { C } from '../src/ui/Palette.js';

// 记录型 graphics：把 fillRect / lineBetween / strokePoints / fillPoints 原样记下来，
// 既能数预算、查构图，也能核对「材质线依附在实体上」用到的坐标是否落在该落的区域。
function recorder() {
  const ops = [];
  const g = {
    _c: 0, _a: 1,
    fillStyle(c, a = 1) { this._c = c; this._a = a; return this; },
    lineStyle(w, c, a = 1) { this._c = c; this._a = a; return this; },
    fillRect(x, y, w, h) { ops.push({ t: 'r', x, y, w, h, c: this._c, a: this._a }); return this; },
    lineBetween(x1, y1, x2, y2) { ops.push({ t: 'l', x1, y1, x2, y2, c: this._c, a: this._a }); return this; },
    strokePoints(pts, close) { ops.push({ t: 'p', pts, close: !!close, c: this._c, a: this._a }); return this; },
    fillPoints(pts, close) { ops.push({ t: 'f', pts, close: close !== false, c: this._c, a: this._a }); return this; },
  };
  return { g, ops };
}

const run = (band, w, h) => {
  const { g, ops } = recorder();
  const L = dioramaLayout(3, w, h);
  act3[band](g, L);
  return { ops, L };
};

function bbox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

function opBox(op) {
  if (op.t === 'r') return { x0: op.x, y0: op.y, x1: op.x + op.w, y1: op.y + op.h, w: op.w, h: op.h };
  if (op.t === 'l') {
    return {
      x0: Math.min(op.x1, op.x2), y0: Math.min(op.y1, op.y2),
      x1: Math.max(op.x1, op.x2), y1: Math.max(op.y1, op.y2),
      w: Math.abs(op.x2 - op.x1), h: Math.abs(op.y2 - op.y1),
    };
  }
  return bbox(op.pts);
}

const ACCENTS = { };

describe('第 III 幕 星陨王庭', () => {
  it('锚点：保留占位数值，光源落在星野破洞中心', () => {
    // 占位文件里的两个锚点一个数都没改（后续幕契约共用，不能动）
    expect(act3.anchors.seal).toEqual({ x: 0.5, y: 0.42, r: 0.16 });
    expect(act3.anchors.gate).toEqual({ x: 0.5, y: 0.58, r: 0.12 });
    // 星野破洞 = 光源：横屏 (240,62)，对应设计规格 §4 的第 III 幕光源点
    expect(act3.anchors.light).toEqual({ x: 0.5, y: 0.2296, r: 0.05 });

    const L = dioramaLayout(3, 480, 270);
    expect(L.horizon).toBe(124);
    expect(L.anchors.seal).toEqual({ x: 240, y: 113, r: 43 });
    expect(L.anchors.gate).toEqual({ x: 240, y: 157, r: 32 });
    expect(L.anchors.light).toMatchObject({ x: 240, y: 62 });
    // 锚点必须落在碑座上沿之上，否则会被铭文带盖住
    expect(L.anchors.seal.y).toBeLessThanOrEqual(270 - 84);
    expect(L.anchors.gate.y).toBeLessThanOrEqual(270 - 84);

    const T = dioramaLayout(3, 480, 760);
    expect(T.horizon).toBe(350);
    expect(T.anchors.seal).toMatchObject({ x: 240, y: 319 });
    expect(T.anchors.gate).toMatchObject({ x: 240, y: 441 });
    expect(T.anchors.light).toMatchObject({ x: 240, y: 174 });
    expect(T.anchors.seal.y).toBeLessThanOrEqual(760 - 104);
  });

  it('三层都画、横竖屏都在单带预算内、坐标全整数、alpha 合法、同参确定', () => {
    for (const [w, h] of [[480, 270], [480, 760]]) {
      for (const band of ['back', 'mid', 'fore']) {
        const a = run(band, w, h);
        expect(a.ops.length, band + '/' + h).toBeGreaterThan(band === 'fore' ? 15 : 30);
        expect(a.ops.length, band + '/' + h + ':预算').toBeLessThanOrEqual(BAND_BUDGET[band]);
        for (const op of a.ops) {
          if (op.t === 'r') {
            for (const v of [op.x, op.y, op.w, op.h]) expect(Number.isInteger(v), op.t + ':' + v).toBe(true);
            expect(op.w).toBeGreaterThan(0);
            expect(op.h).toBeGreaterThan(0);
          } else if (op.t === 'l') {
            for (const v of [op.x1, op.y1, op.x2, op.y2]) expect(Number.isInteger(v), op.t + ':' + v).toBe(true);
          } else {
            for (const p of op.pts) expect(Number.isInteger(p.x) && Number.isInteger(p.y), op.t + ':' + p.x + ',' + p.y).toBe(true);
          }
          expect(op.a).toBeGreaterThanOrEqual(0);
          expect(op.a).toBeLessThanOrEqual(1);
        }
        expect(run(band, w, h).ops).toEqual(a.ops);
      }
    }
  });

  it('远景：星野破洞、三根巨柱、沿墙沿起伏的断裂栏板与三级台基', () => {
    const { ops, L } = run('back', 480, 270);

    // ① 星野：破洞里三档星点（白/骨白/幕色），且集中在画面上半
    const stars = ops.filter(o => o.t === 'r' && o.y < 100 && (o.c === C.white || o.c === C.bone));
    expect(stars.length).toBeGreaterThanOrEqual(24);
    expect(stars.filter(o => o.c === C.white).length).toBeGreaterThanOrEqual(6);
    expect(stars.filter(o => o.c === C.bone).length).toBeGreaterThanOrEqual(12);
    expect(ops.filter(o => o.t === 'r' && o.c === L.accent && o.y >= 30 && o.y <= 92 && o.x > 200 && o.x < 280).length).toBeGreaterThanOrEqual(2);

    // ② 三根巨柱：又高又窄的柱身，x 分散三处
    const shafts = ops.filter(o => o.t === 'r' && o.w >= 14 && o.w <= 30 && o.h >= 50);
    expect(new Set(shafts.map(o => o.x)).size).toBeGreaterThanOrEqual(3);

    // ③ 上层台基是断裂栏板，不是通栏横梁：栏板贴着坍顶的 V 形墙沿起伏、成段塌断，
    //    所以它是「高度随时间变化的多边形」，而不是一条横贯全屏的矩形平板。
    const coping = ops.filter(o => {
      if (o.t !== 'f' || o.pts.length < 6) return false;
      const b = bbox(o.pts);
      return b.w >= 80 && b.h >= 12 && b.y0 < 100;
    });
    expect(coping.length).toBeGreaterThanOrEqual(3);
    // 栏板顶上断续的垛口（缺的那几块就是塌掉的）
    const merlons = ops.filter(o => o.t === 'r' && o.w >= 5 && o.w <= 14 && o.h >= 4 && o.h <= 10 && o.y > 26 && o.y < 96);
    expect(merlons.length).toBeGreaterThanOrEqual(12);
    // 回归守卫：上一版读成「高架桥」的原因就是 y≈52 与 y≈87 两条通栏大平板。
    //    远景中段（破洞下方、台阶以上）不许再出现又宽又厚的横向矩形。
    const slabs = ops.filter(o => o.t === 'r' && o.w >= 300 && o.h >= 6 && o.y >= 26 && o.y <= 94);
    expect(slabs).toEqual([]);
    // ④ 下层台基：三级台阶向观众展开，宽度三档不同
    const terrace = ops.filter(o => o.t === 'r' && o.w >= 200 && o.h >= 4 && o.y >= 94 && o.y <= 130);
    expect(terrace.length).toBeGreaterThanOrEqual(3);
    const tw = [...new Set(terrace.map(o => o.w))].sort((a, b) => a - b);
    expect(tw.length).toBeGreaterThanOrEqual(3);
  });

  it('中景：地面石缝 + 王座三级台阶 + 陨坑三层环 + 三排悬浮碎星 + 倾倒立柱', () => {
    const { ops, L } = run('mid', 480, 270);

    // 地面铺在中景（fore 不许铺地，见下一组断言）：通栏石缝 ≥4 条
    const seams = ops.filter(o => o.t === 'r' && o.h === 1 && o.w >= 470 && o.y > L.horizon);
    expect(seams.length).toBeGreaterThanOrEqual(4);

    // 王座高背：中央一块 ≥24 高的石面
    const throneBack = ops.filter(o => o.t === 'r' && o.h >= 24 && o.w >= 24 && o.w <= 44 && Math.abs(o.x + o.w / 2 - 250) <= 10 && o.y < 160);
    expect(throneBack.length).toBeGreaterThanOrEqual(1);

    // 三级台阶：宽度递增、基座逐级下移
    const steps = ops.filter(o => o.t === 'r' && o.h >= 3 && o.h <= 8 && o.w >= 32 && o.w <= 70 && Math.abs(o.x + o.w / 2 - 250) <= 8 && o.y > 150);
    expect(steps.length).toBeGreaterThanOrEqual(3);
    const widths = [...new Set(steps.map(o => o.w))].sort((a, b) => a - b);
    expect(widths.length).toBeGreaterThanOrEqual(3);
    expect(widths[widths.length - 1] - widths[0]).toBeGreaterThanOrEqual(16);

    // 陨坑：右侧三层压扁椭圆环 + 坑里嵌着发光碎星
    const craterRings = ops.filter(o => {
      if (o.t !== 'p' || !o.close) return false;
      const b = bbox(o.pts);
      return b.w >= 40 && b.h >= 8 && b.w / b.h >= 2.2 && (b.x0 + b.x1) / 2 > 300;
    });
    expect(craterRings.length).toBeGreaterThanOrEqual(3);
    const embedded = ops.filter(o => o.t === 'r' && (o.c === L.accent || o.c === C.coldFlame || o.c === C.coldFlameCore) && o.x > 330 && o.x < 420 && o.y > 150 && o.y < 190);
    expect(embedded.length).toBeGreaterThanOrEqual(3);

    // 悬浮碎星：≥4 块六边晶体，按 y 分三排（远小近大）
    const crystals = ops.filter(o => o.t === 'f' && o.pts.length === 6 && bbox(o.pts).h >= 6);
    expect(crystals.length).toBeGreaterThanOrEqual(4);
    const centers = crystals.map(o => { const b = bbox(o.pts); return { y: (b.y0 + b.y1) / 2, h: b.h }; });
    expect(centers.filter(c => c.y <= L.horizon - 15).length).toBeGreaterThanOrEqual(1);
    expect(centers.filter(c => c.y > L.horizon - 10 && c.y <= L.horizon + 15).length).toBeGreaterThanOrEqual(1);
    expect(centers.filter(c => c.y >= L.horizon + 20).length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...centers.map(c => c.h))).toBeGreaterThanOrEqual(2 * Math.min(...centers.map(c => c.h)));

    // 倾倒立柱：左边横躺的鼓石（横向长条，不是竖柱）
    const fallen = ops.filter(o => o.t === 'r' && o.w >= 30 && o.w <= 120 && o.h >= 12 && o.x < 170 && o.y > 150);
    expect(fallen.length).toBeGreaterThanOrEqual(2);
  });

  it('近景：只压边、不铺地；左右有晶簇剪影 + 冷光雾带', () => {
    const { ops, L } = run('fore', 480, 270);
    const ground = L.h - 84;

    // 关键：地面在中景，近景整片铺地会盖掉中景
    expect(ops.filter(o => o.t === 'r' && o.w >= 400 && o.h >= 8).length).toBe(0);
    expect(ops.filter(o => o.t === 'r' && o.w >= 400 && o.h >= 4 && o.a > 0.2).length).toBe(0);

    // 左右下角压边晶簇（剪影高过 12px 且压到碑座）
    const edges = ops.filter(o => { const b = opBox(o); return b.h >= 12 && b.y1 >= ground - 2; });
    expect(edges.filter(o => opBox(o).x0 < 60).length).toBeGreaterThanOrEqual(2);
    expect(edges.filter(o => opBox(o).x1 > 420).length).toBeGreaterThanOrEqual(1);

    // 冷光雾：≤4px 的通栏低透明带
    const mist = ops.filter(o => o.t === 'r' && o.w >= 470 && o.h <= 4 && o.y > ground - 12 && o.a <= 0.12);
    expect(mist.length).toBeGreaterThanOrEqual(2);
  });

  it('幕色只上光源/纹样，不做整片染色；源码不写死色值、不用随机', () => {
    for (const band of ['back', 'mid', 'fore']) {
      const { ops, L } = run(band, 480, 270);
      expect(ops.filter(o => o.t === 'r' && o.c === L.accent && o.w > 192 && o.a > 0.2).length).toBe(0);
    }
    const src = readFileSync(new URL('../src/ui/dioramas/act3.js', import.meta.url), 'utf8');
    expect(src.includes('Math.random')).toBe(false);
    expect((src.match(/0x[0-9a-fA-F]{6}/g) || []).length).toBe(0);
    expect(/createLinearGradient|createRadialGradient|blur\(/.test(src)).toBe(false);
  });
});
