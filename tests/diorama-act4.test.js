import { describe, expect, it } from 'vitest';
import { dioramaLayout, BAND_BUDGET } from '../src/ui/dioramas/registry.js';
import * as act4 from '../src/ui/dioramas/act4.js';
import { C } from '../src/ui/Palette.js';
import { createRaster } from '../scripts/lib/raster.mjs';

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

    // ② 铜钟：整体抬到地平线以上（钟口不压织毯），深铜为主体、亮金只做受光棱
    const mid = run('mid', 480, 270);
    const { seal } = mid.L.anchors;
    const bronze = mid.ops.filter(o => o.t === 'r' && [C.brass, C.brassDark, C.brassLight].includes(o.c)
      && o.x >= seal.x - 30 && o.x + o.w <= seal.x + 30 && o.a > 0.2);
    expect(bronze.length).toBeGreaterThanOrEqual(10);
    // 钟体每一笔都在地平线之上，钟口不再落在织毯上
    expect(bronze.filter(o => o.y + o.h > mid.L.horizon)).toEqual([]);
    // 主体是深铜剪影：按面积算，深铜要远多于亮金（亮金只做受光棱，笔数自然不少）
    const area = (o) => o.w * o.h;
    const darkBronze = bronze.filter(o => o.c === C.brassDark).reduce((s, o) => s + area(o), 0);
    const brightBronze = bronze.filter(o => o.c === C.brass || o.c === C.brassLight).reduce((s, o) => s + area(o), 0);
    expect(darkBronze).toBeGreaterThan(brightBronze * 2);
    // 横梁：缩短到「钟口宽 + 两侧各 24–30u」，梁身深铜、只有下沿 1px 亮金
    const beamOps = mid.ops.filter(o => o.t === 'r' && o.w >= 60 && o.w <= 160 && o.h >= 2
      && o.y < seal.y && o.y > seal.y - 60);
    expect(beamOps.length).toBeGreaterThanOrEqual(1);
    expect(mid.ops.some(o => o.t === 'r' && o.c === C.brassDark && o.a >= 0.85 && o.w >= 60 && o.h >= 2
      && o.y < seal.y && o.y > seal.y - 60), '梁身深铜').toBe(true);

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
    // 左右压边（石立柱 + 内侧书架）+ 飘落纸页
    expect(fore.ops.some(o => o.t === 'r' && o.x === 0 && o.w >= 10 && o.h > 100)).toBe(true);
    expect(fore.ops.some(o => o.t === 'r' && o.x + o.w === 480 && o.w >= 10 && o.h > 100)).toBe(true);
    expect(fore.ops.filter(o => o.t === 'f' && o.c === C.parchment).length).toBeGreaterThanOrEqual(3);
  });
});
// ---------- 第 4 轮打磨：软渲染抽样（评审 ① 金帐篷 / ② 书墙），看像素而不是看指令 ----------
const paint = (band, w, h) => {
  const L = dioramaLayout(4, w, h);
  const r = createRaster(w, h, C.void);
  act4[band](r.g, L);
  return { r, L };
};
const px = (r, x, y) => {
  const i = (y * r.width + x) * 4;
  const b = r.buffer;
  return { r: b[i], g: b[i + 1], b: b[i + 2], sum: b[i] + b[i + 1] + b[i + 2] };
};
// 「亮金」= 只有在 brass / brassLight 才成立的亮度；深铜剪影一个都不该有
const isBrightGold = (p) => p.r >= 190 && p.g >= 150 && p.b <= 130;
const isBronze = (p) => p.r >= 70 && p.g >= 50 && p.b < 90 && !isBrightGold(p);
// 钟的几何与 act4.js 同式（钟口离地平线留 6px，让落地影落在石板上）
const bellGeom = (L) => {
  const h = Math.max(34, Math.round(45 * (L.tall ? 1.6 : 1)));
  const bot = L.horizon - 6;
  return { bot, top: bot - h, h, mouthW: Math.max(22, Math.round(h * 0.92)) };
};

describe('第 IV 幕 · 第 4 轮打磨', () => {
  it('铜钟：深铜剪影 + 钟口内壁 void + 落地影只落在石板上', () => {
    for (const [w, h] of [[480, 270], [480, 760]]) {
      const { r, L } = paint('mid', w, h);
      const g = bellGeom(L);
      const cx = L.anchors.seal.x;
      const tag = h + ':';

      // 钟身中段：以深铜为主，亮金只允许出现在左侧一道受光棱
      const y0 = g.top + Math.round(g.h * 0.42);
      const y1 = g.top + Math.round(g.h * 0.82);
      const half = Math.max(3, Math.round(g.h * 0.3));
      let n = 0, bright = 0, bronze = 0;
      for (let y = y0; y <= y1; y++) for (let x = cx - half; x <= cx + half; x++) {
        const p = px(r, x, y);
        n += 1;
        if (isBrightGold(p)) bright += 1;
        else if (isBronze(p)) bronze += 1;
      }
      expect(n).toBeGreaterThan(100);
      expect(bright / n, tag + '亮金占比').toBeLessThan(0.25);
      expect(bronze / n, tag + '深铜占比').toBeGreaterThan(0.45);

      // 钟口内壁：口沿内侧是 void 暗腔，不是亮金（舌锤 2px 会占掉一部分，故取两行合计）
      let darkMouth = 0;
      for (const mouthY of [g.bot - 8, g.bot - 7]) {
        for (let x = cx - 4; x <= cx + 4; x++) if (px(r, x, mouthY).sum < 110) darkMouth += 1;
      }
      expect(darkMouth, tag + '钟口内壁').toBeGreaterThanOrEqual(9);
      // 暗腔收在钟身内：口沿附近「暗」的连续宽度不超过钟口宽 0.86，不再伸到钟外悬成洞
      let run = 0, widest = 0;
      for (let x = cx - 34; x <= cx + 34; x++) {
        if (px(r, x, g.bot - 9).sum < 110) { run += 1; widest = Math.max(widest, run); } else run = 0;
      }
      expect(widest, tag + '暗腔宽度').toBeLessThanOrEqual(Math.round(g.mouthW * 0.86));

      // 地平线以下（钟的落地影区）不许出现亮金：钟口不再压在金色织毯上
      let goldBelow = 0, shadowSum = 0, plainSum = 0;
      for (let y = L.horizon; y <= L.horizon + 4; y++) {
        for (let x = cx - 8; x <= cx + 8; x++) { if (isBrightGold(px(r, x, y))) goldBelow += 1; shadowSum += px(r, x, y).sum; }
        for (let x = cx + 60; x <= cx + 76; x++) plainSum += px(r, x, y).sum;
      }
      expect(goldBelow, tag + '地平线下亮金').toBe(0);
      expect(shadowSum, tag + '落地影未压暗').toBeLessThan(plainSum);
    }
  });

  it('织毯：一整块平铺梯形毯（不是逐排台阶），退到地平线之下', () => {
    for (const [w, h] of [[480, 270], [480, 760]]) {
      const { ops, L } = run('mid', w, h);
      const ground = L.h - (L.tall ? 104 : 84);
      // 整块毯一次 fill，透明度压到 0.40–0.44
      const rugs = ops.filter(o => o.t === 'f' && o.c === C.bloodDark);
      expect(rugs.length, h + ':整块毯').toBe(1);
      expect(rugs[0].a).toBeGreaterThanOrEqual(0.4);
      expect(rugs[0].a).toBeLessThanOrEqual(0.44);
      const b = bounds(rugs[0]);
      expect(b.y1, h + ':织毯起点').toBeGreaterThanOrEqual(L.horizon + 6);
      expect(Math.abs((b.x1 + b.x2) / 2 - w / 2), h + ':毯居中').toBeLessThanOrEqual(2);
      // 透视：近端明显宽于远端（但不再逐排收分，所以不存在台阶）
      const span = (ys) => {
        const ps = rugs[0].pts.filter(p => p.y === ys);
        return Math.max(...ps.map(p => p.x)) - Math.min(...ps.map(p => p.x));
      };
      expect(span(b.y2)).toBeGreaterThan(span(b.y1) * 1.6);
      expect(ops.filter(o => o.c === C.bloodDark && o.a > 0.25 && o.a < 0.5 && o.h >= 2 && o.h <= 6 && o.w >= 12),
        h + ':逐排台阶').toEqual([]);
      // 横向织纹只剩极淡 1px（alpha ≤ 0.12）
      const weft = ops.filter(o => o.t === 'r' && o.c === C.blood && o.h === 1 && o.a <= 0.12 && o.w >= 10);
      expect(weft.length, h + ':织纹').toBeGreaterThanOrEqual(2);
      for (const o of weft) expect(o.w).toBeLessThanOrEqual(w * 0.9);
      // 近端流苏 3–4 根 + 2 处磨损缺口露出石板
      const tassel = ops.filter(o => o.t === 'r' && o.c === C.blood && o.w <= 2 && o.h <= 2 && o.y >= ground - 4);
      expect(tassel.length, h + ':流苏').toBeGreaterThanOrEqual(3);
      const holes = ops.filter(o => o.t === 'r' && o.c === C.stoneDark && o.a >= 0.85 && o.h === 2
        && o.w >= 2 && o.w <= 4 && o.y > b.y1 && o.y < b.y2);
      expect(holes.length, h + ':磨损缺口').toBe(2);
    }
  });

  it('书架：外排内缩不贴画布边、三档纵深、前景是拱下画框', () => {
    const back = run('back', 480, 270);
    // 四座书架的柜体都不许顶到画布左右边缘
    const bodies = back.ops.filter(o => o.t === 'r' && o.c === C.void && o.a >= 0.8
      && o.w >= 80 && o.w <= 200 && o.h >= 60);
    expect(bodies.length).toBeGreaterThanOrEqual(4);
    for (const b of bodies) {
      expect(b.x, '柜体左缘').toBeGreaterThanOrEqual(2);
      expect(b.x + b.w, '柜体右缘').toBeLessThanOrEqual(478);
    }
    // 三档明度：远排柜内 void、中排 stoneDark、近排受光 stoneLight
    expect(back.ops.some(o => o.c === C.void && o.a >= 0.4 && o.a <= 0.5 && o.w >= 60)).toBe(true);
    expect(back.ops.some(o => o.c === C.stoneDark && o.a >= 0.5 && o.a <= 0.6 && o.w >= 60)).toBe(true);
    expect(back.ops.some(o => o.c === C.stoneLight && o.a >= 0.45 && o.w <= 3 && o.h >= 40)).toBe(true);

    const fore = run('fore', 480, 270);
    // 靠前的石立柱：贴左右边缘的窄高柱 + 柱头
    const left = fore.ops.filter(o => o.t === 'r' && o.x === 0 && o.h > 200);
    const right = fore.ops.filter(o => o.t === 'r' && o.x + o.w === 480 && o.h > 200);
    expect(left.length).toBeGreaterThanOrEqual(1);
    expect(right.length).toBeGreaterThanOrEqual(1);
    expect(left.some(o => o.w >= 8 && o.w <= 24)).toBe(true);
    expect(right.some(o => o.w >= 8 && o.w <= 24)).toBe(true);
    // 半拱拱腹：顶部多级阶梯（左右各 ≥4 级）
    const soffitL = fore.ops.filter(o => o.t === 'r' && o.y === 0 && o.x < 90 && o.h >= 4 && o.h <= 44);
    const soffitR = fore.ops.filter(o => o.t === 'r' && o.y === 0 && o.x + o.w > 390 && o.h >= 4 && o.h <= 44);
    expect(soffitL.length).toBeGreaterThanOrEqual(4);
    expect(soffitR.length).toBeGreaterThanOrEqual(4);
  });
});
