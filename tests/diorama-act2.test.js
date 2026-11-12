import { describe, expect, it } from 'vitest';
import { dioramaLayout, BAND_BUDGET } from '../src/ui/dioramas/registry.js';
import * as act2 from '../src/ui/dioramas/act2.js';
import { C } from '../src/ui/Palette.js';

const ACCENT = 0x7cc9a8;

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
  const L = dioramaLayout(2, w, h);
  act2[band](g, L);
  return { ops, L };
};

// 指令的包围盒：矩形直接算，折线/多边形取点集范围。
const bbox = (op) => {
  if (op.t === 'r') return { x0: op.x, y0: op.y, x1: op.x + op.w, y1: op.y + op.h };
  const xs = op.pts.map(p => p.x);
  const ys = op.pts.map(p => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
};

const near = (op, x, y, pad) => {
  const b = bbox(op);
  return b.x1 >= x - pad && b.x0 <= x + pad && b.y1 >= y - pad && b.y0 <= y + pad;
};

describe('第 II 幕 腐沼教堂', () => {
  it('锚点：地平线 127、彩窗光源在 (336,54)、钉落点压在碑座上沿', () => {
    const L = dioramaLayout(2, 480, 270);
    expect(L.horizon).toBe(127);
    // 占位文件里已有的 seal / gate 数值保持原样
    expect(L.anchors.seal).toEqual({ x: 240, y: 113, r: 43 });
    expect(L.anchors.gate).toEqual({ x: 240, y: 157, r: 32 });
    expect(L.anchors.nail).toEqual({ x: 240, y: 184, r: 5 });
    expect(L.anchors.lord).toMatchObject({ x: 240, y: 152 });
    expect(L.anchors.light).toMatchObject({ x: 336, y: 54 });
    expect(L.anchors.nail.y).toBeLessThanOrEqual(270 - 84);
    expect(L.anchors.light.x).toBeGreaterThan(L.w * 0.5);

    const T = dioramaLayout(2, 480, 760);
    expect(T.horizon).toBe(357);
    expect(T.anchors.nail.y).toBeLessThanOrEqual(760 - 104);
    expect(T.anchors.light.y).toBeLessThan(T.horizon);
  });

  it('三层都画、预算内、坐标全为整数、同参确定', () => {
    for (const [w, h] of [[480, 270], [480, 760]]) {
      for (const band of ['back', 'mid', 'fore']) {
        const a = run(band, w, h);
        expect(a.ops.length, band + '@' + h).toBeGreaterThan(20);
        expect(a.ops.length, band + '@' + h + ':预算').toBeLessThanOrEqual(BAND_BUDGET[band]);
        for (const op of a.ops) {
          if (op.t === 'r') {
            for (const v of [op.x, op.y, op.w, op.h]) expect(Number.isInteger(v), band + ':' + op.t).toBe(true);
          } else {
            for (const p of op.pts) expect(Number.isInteger(p.x) && Number.isInteger(p.y), band + ':pts').toBe(true);
          }
          expect(op.a).toBeGreaterThanOrEqual(0);
          expect(op.a).toBeLessThanOrEqual(1);
        }
        const b = run(band, w, h);
        expect(b.ops).toEqual(a.ops);
      }
    }
  });

  it('地面只在中景：中景先铺满水与烂地板，近景不铺整片地面', () => {
    const mid = run('mid', 480, 270);
    const ground = mid.ops.filter(o => o.t === 'r' && o.w >= 480 && o.y <= mid.L.horizon + 4 && o.h >= 8);
    expect(ground.length).toBeGreaterThanOrEqual(1);
    // 中景的地面必须一路铺到碑座，不能留空
    const deep = mid.ops.filter(o => o.t === 'r' && o.w >= 480 && o.y + o.h >= 270 - 84);
    expect(deep.length).toBeGreaterThanOrEqual(1);

    const fore = run('fore', 480, 270);
    const whole = fore.ops.filter(o => o.t === 'r' && o.w >= 480 * 0.8 && o.h > 12);
    expect(whole).toHaveLength(0);
  });

  it('辨识标记：圆彩窗玻璃格、铁链吊钟、水中长椅倒影与三排长椅', () => {
    // ① 彩窗：红/蓝玻璃格贴在光源锚点周围，幕色只上光源
    const back = run('back', 480, 270);
    const light = back.L.anchors.light;
    const red = back.ops.filter(o => (o.t === 'r' || o.t === 'f') && o.c === C.glassRed && near(o, light.x, light.y, 22));
    const blue = back.ops.filter(o => (o.t === 'r' || o.t === 'f') && o.c === C.glassBlue && near(o, light.x, light.y, 22));
    expect(red.length).toBeGreaterThanOrEqual(3);
    expect(blue.length).toBeGreaterThanOrEqual(3);
    const accent = back.ops.filter(o => (o.t === 'r' || o.t === 'f') && o.c === ACCENT && near(o, light.x, light.y, 40));
    expect(accent.length).toBeGreaterThanOrEqual(3);
    expect(back.ops.filter(o => o.c === ACCENT).length).toBeLessThan(80);
    // 尖窗玻璃格（3×4）用红蓝两色，且都落在后墙上
    const panes = back.ops.filter(o => o.t === 'r' && (o.c === C.glassRed || o.c === C.glassBlue) && o.w >= 2 && o.h >= 2);
    expect(panes.length).toBeGreaterThanOrEqual(16);
    // ② 肋骨拱顶：至少两条折线拱肋
    const ribs = back.ops.filter(o => o.t === 'p' && bbox(o).y0 < back.L.horizon * 0.5 && bbox(o).x1 - bbox(o).x0 > 60);
    expect(ribs.length).toBeGreaterThanOrEqual(2);

    const mid = run('mid', 480, 270);
    const nail = mid.L.anchors.nail;
    // 吊钟：钟体是幕色左右的铜色大块，钟口压在锚点附近
    const bell = mid.ops.filter(o => (o.t === 'r' || o.t === 'f') && o.c === C.brassDark && near(o, nail.x, nail.y - 12, 26));
    expect(bell.length).toBeGreaterThanOrEqual(2);
    const rim = mid.ops.filter(o => o.t === 'r' && o.c === C.brassLight && near(o, nail.x, nail.y - 8, 26));
    expect(rim.length).toBeGreaterThanOrEqual(1);
    // 铁链：钟口以上、锚点两侧的 1px 竖链节
    const links = mid.ops.filter(o => o.t === 'r' && o.w <= 2 && o.h >= 2 && o.x >= nail.x - 22 && o.x <= nail.x + 22 && o.y < nail.y - 24);
    expect(links.length).toBeGreaterThanOrEqual(10);
    // ③ 长椅三排：座面基座 y 至少三种，近排最大
    const seats = mid.ops.filter(o => o.t === 'r' && o.c === C.mauve && o.w >= 14 && o.a >= 0.8);
    const bases = new Set(seats.map(o => o.y + o.h));
    expect(bases.size).toBeGreaterThanOrEqual(3);
    expect(Math.max(...seats.map(o => o.w))).toBeGreaterThanOrEqual(30);
    // 长椅倒影：水面里长椅正下方的竖向暗纹
    const refl = mid.ops.filter(o => o.t === 'r' && o.c === C.inkDark && o.w <= 2 && o.h >= 2 && o.h <= 5 && o.y > mid.L.horizon + 4);
    expect(refl.length).toBeGreaterThanOrEqual(12);
    // 水面本身：沼水 + 幕色反光
    expect(mid.ops.filter(o => o.t === 'r' && o.w >= 480 && o.c === C.swampWater).length).toBeGreaterThanOrEqual(1);
    expect(mid.ops.filter(o => o.c === C.swampGlint).length).toBeGreaterThanOrEqual(6);
  });

  it('近景只放压边物件：断柱压边、芦苇、低雾、水面波光', () => {
    const fore = run('fore', 480, 270);
    // 左下断柱：宽 ≥ 0.05W 的暗块，压在画面左缘
    const left = fore.ops.filter(o => (o.t === 'r' || o.t === 'f') && bbox(o).x0 <= 4 && bbox(o).x1 - bbox(o).x0 >= 20 && bbox(o).y1 >= fore.L.anchors.nail.y);
    expect(left.length).toBeGreaterThanOrEqual(1);
    // 芦苇：细高竖条，落在右半屏
    const reeds = fore.ops.filter(o => o.t === 'r' && o.w <= 2 && o.h >= 12 && o.x > 480 * 0.68);
    expect(reeds.length).toBeGreaterThanOrEqual(5);
    // 低雾：通栏细带
    const fog = fore.ops.filter(o => o.t === 'r' && o.w >= 480 && o.h <= 4 && o.c === C.fog);
    expect(fog.length).toBeGreaterThanOrEqual(1);
    // 波光：幕色细横条
    const glint = fore.ops.filter(o => o.t === 'r' && o.c === ACCENT && o.h <= 2);
    expect(glint.length).toBeGreaterThanOrEqual(4);
  });
});
