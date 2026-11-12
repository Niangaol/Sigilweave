import { describe, expect, it } from 'vitest';
import { dioramaLayout, BAND_BUDGET } from '../src/ui/dioramas/registry.js';
import * as act6 from '../src/ui/dioramas/act6.js';
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
  const L = dioramaLayout(6, w, h);
  act6[band](g, L);
  return { ops, L };
};

const plinthTop = (h) => h - (h > 400 ? 104 : 84);

describe('第 VI 幕 熔星锻炉', () => {
  it('锚点：地平线 135、碑座上沿之上、光源落在炉膛口内', () => {
    const L = dioramaLayout(6, 480, 270);
    expect(L.horizon).toBe(135);
    // 占位锚点原值保留，一个都没改
    expect(L.anchors.seal).toMatchObject({ x: 240, y: 113 });
    expect(L.anchors.gate).toMatchObject({ x: 240, y: 157 });
    // 本幕新增：光源=炉芯、契约主=砧前、契约钉=砧前地面
    expect(L.anchors.light).toMatchObject({ x: 206, y: 120 });
    expect(L.anchors.lord).toMatchObject({ x: 258, y: 140 });
    expect(L.anchors.nail).toMatchObject({ x: 258, y: 184 });
    // 钉必须落在碑座上沿之上，否则会被铭文带盖住
    expect(L.anchors.nail.y).toBeLessThanOrEqual(plinthTop(270));
    // 光源锚点必须落进炉膛口的拱内（口宽 92、口高 78、口底 = 地平线）
    const m = L.anchors.light;
    expect(m.x).toBeGreaterThan(240 - 92 / 2);
    expect(m.x).toBeLessThan(240 + 92 / 2);
    expect(m.y).toBeGreaterThan(135 - 78);
    expect(m.y).toBeLessThan(135);

    const T = dioramaLayout(6, 480, 760);
    expect(T.horizon).toBe(380);
    expect(T.anchors.nail.y).toBeLessThanOrEqual(plinthTop(760));
    expect(T.anchors.light.x).toBe(206);
  });

  it('三层都画、预算内、坐标全为整数、同参确定（横屏与竖屏）', () => {
    for (const [w, h] of [[480, 270], [480, 760]]) {
      let total = 0;
      for (const band of ['back', 'mid', 'fore']) {
        const a = run(band, w, h);
        expect(a.ops.length, band + '/' + h).toBeGreaterThan(20);
        expect(a.ops.length, band + '/' + h).toBeLessThanOrEqual(BAND_BUDGET[band]);
        total += a.ops.length;
        for (const op of a.ops) {
          if (op.t === 'r') {
            for (const v of [op.x, op.y, op.w, op.h]) expect(Number.isInteger(v), band + ':' + JSON.stringify(op)).toBe(true);
          } else {
            for (const p of op.pts) expect(Number.isInteger(p.x) && Number.isInteger(p.y), band + ':非整数顶点').toBe(true);
          }
          expect(op.a).toBeGreaterThanOrEqual(0);
          expect(op.a).toBeLessThanOrEqual(1);
        }
        const b = run(band, w, h);
        expect(b.ops, band + '/' + h + ':确定性').toEqual(a.ops);
      }
      // 单幕静态层一次性预算 ≤3200
      expect(total, '整幕预算/' + h).toBeLessThanOrEqual(3200);
    }
  });

  it('辨识标记①：炉膛——拱形口 + 幕色火舌 + 亮芯 + 火星', () => {
    const back = run('back', 480, 270);
    // 拱形轮廓（炉口是圆拱，与第一幕的尖拱门洞区分）
    const arches = back.ops.filter(o => (o.t === 'p' || o.t === 'f') && o.pts.length >= 10);
    expect(arches.length).toBeGreaterThanOrEqual(1);
    // 炉芯位置在 light 锚点附近
    const mouth = { x0: 240 - 46, x1: 240 + 46, y0: 135 - 78, y1: 135 };
    const inMouth = (o) => o.t === 'r' && o.x >= mouth.x0 - 30 && o.x + o.w <= mouth.x1 + 30
      && o.y >= mouth.y0 - 20 && o.y + o.h <= mouth.y1;
    const flames = back.ops.filter(o => inMouth(o) && o.c === 0xff8a4d);
    expect(flames.length, '幕色火舌').toBeGreaterThanOrEqual(8);
    const hotCore = back.ops.filter(o => inMouth(o) && o.c === C.arcaneLight);
    expect(hotCore.length, '亮芯').toBeGreaterThanOrEqual(2);
    // 火星：幕色/亮色小点，至少 6 处
    const sparks = back.ops.filter(o => o.t === 'r' && o.w <= 2 && o.h <= 2 && (o.c === 0xff8a4d || o.c === C.arcaneLight));
    expect(sparks.length, '火星').toBeGreaterThanOrEqual(6);
    // 砖砌烟道：炉口上方的砖层（受光砖面 + 竖向砖缝）
    const seams = back.ops.filter(o => o.t === 'r' && o.h >= 3 && o.h <= 12 && o.w === 1 && o.y < mouth.y0);
    expect(seams.length, '烟道砖缝').toBeGreaterThanOrEqual(6);
  });

  it('辨识标记②：铁砧——宽台面 + 细腰 + 宽底座，砧上有发光工件', () => {
    const mid = run('mid', 480, 270);
    const cx = 258;
    const onAnvil = (o) => o.t === 'r' && o.x + o.w / 2 > cx - 40 && o.x + o.w / 2 < cx + 40;
    const face = mid.ops.filter(o => onAnvil(o) && o.w >= 34 && o.h <= 12 && o.y >= 140 && o.y <= 160);
    expect(face.length, '砧台面').toBeGreaterThanOrEqual(1);
    const waist = mid.ops.filter(o => onAnvil(o) && o.w <= 22 && o.w >= 6 && o.h >= 12 && o.y >= 154 && o.y <= 178);
    expect(waist.length, '砧腰').toBeGreaterThanOrEqual(1);
    const base = mid.ops.filter(o => onAnvil(o) && o.w >= 24 && o.h >= 5 && o.y >= 168 && o.y <= 186);
    expect(base.length, '砧底座').toBeGreaterThanOrEqual(1);
    // 砧面工件：三层热色（外圈幕色 + 中层 arcane + 芯 arcaneLight）
    const work = mid.ops.filter(o => onAnvil(o) && o.y >= 138 && o.y <= 152 && (o.c === 0xff8a4d || o.c === C.arcane || o.c === C.arcaneLight));
    expect(work.length, '砧上工件热色').toBeGreaterThanOrEqual(3);
  });

  it('辨识标记③：吊链——远景小链 + 前景压边大链与吊钩（至少三排纵深）', () => {
    const back = run('back', 480, 270);
    const fore = run('fore', 480, 270);
    // 远景链：1px 宽的小链环
    const farLinks = back.ops.filter(o => o.t === 'r' && o.w <= 3 && o.h <= 6 && o.y < 135);
    expect(farLinks.length, '远景链环').toBeGreaterThanOrEqual(12);
    // 前景链：左右两侧压边，各至少 8 个链环
    const bigLinks = fore.ops.filter(o => o.t === 'r' && o.w <= 6 && o.h <= 9 && o.h >= 3);
    const left = bigLinks.filter(o => o.x < 90);
    const right = bigLinks.filter(o => o.x > 390);
    expect(left.length, '左侧前景链').toBeGreaterThanOrEqual(8);
    expect(right.length, '右侧前景链').toBeGreaterThanOrEqual(8);
    // 吊钩：链末端有横向铁钩（宽 ≥5 的横条）
    const hooks = fore.ops.filter(o => o.t === 'r' && o.w >= 5 && o.h <= 3);
    expect(hooks.length, '吊钩').toBeGreaterThanOrEqual(2);
  });

  it('地面只在中景铺，近景只压边不盖中景；同类物件至少三排基座', () => {
    const mid = run('mid', 480, 270);
    const fore = run('fore', 480, 270);
    const groundBands = mid.ops.filter(o => o.t === 'r' && o.w === 480 && o.h > 3 && o.y >= 135);
    expect(groundBands.length, '中景地面带').toBeGreaterThanOrEqual(3);
    expect(fore.ops.filter(o => o.t === 'r' && o.w === 480 && o.h > 3 && o.y >= 135).length, '近景不许整幅铺地').toBe(0);
    // 中景物件的落地基座必须至少三档（远排/中排/近排）
    const bases = new Set();
    for (const o of mid.ops) {
      if (o.t !== 'r') continue;
      if (o.w < 8 || o.w > 220 || o.h < 6) continue;
      const base = o.y + o.h;
      if (base >= 135 && base <= 186) bases.add(base);
    }
    expect(bases.size, '基座档数').toBeGreaterThanOrEqual(3);
  });
});
