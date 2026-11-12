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

// 与 act1.js 内部的 groundOf 同式：地平线之下这块地方能站人的最近一条线
const groundOf = (L) => Math.min(L.anchors.nail.y, L.h - (L.tall ? 104 : 84));

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

  // ———— 第 I 幕细化（2026-11）：四类只属于荒废墓园的叙事物件 ————

  it('远景：荒冢丘陵 / 枯林带 / 月晕同心环 / 盘旋乌鸦 / 家族墓室', () => {
    const { ops, L } = run('back', 1, 480, 270);
    const hz = L.horizon;
    const xs = (o) => o.pts.map(p => p.x);
    const ys = (o) => o.pts.map(p => p.y);
    const span = (o) => Math.max(...xs(o)) - Math.min(...xs(o));

    // 1) 荒冢丘陵：一条横贯全幅的低起伏剪影，顶边带 1px 冷受光棱（折线描边）
    const ridge = ops.filter(o => o.t === 'f' && span(o) >= 480 * 0.9
      && Math.max(...ys(o)) <= hz && Math.min(...ys(o)) >= hz - 70);
    expect(ridge.length).toBeGreaterThanOrEqual(1);
    expect(ridge.some(o => o.c === C.void)).toBe(true);
    const crest = ops.filter(o => o.t === 'p' && o.close === false
      && o.pts.length >= 20 && o.c === C.glassBlue);
    expect(crest.length).toBeGreaterThanOrEqual(1);
    expect(crest[0].pts.every(p => p.y <= hz && p.y >= hz - 70)).toBe(true);

    // 2) 远处枯林带：12–18 棵 2–4px 宽的枯树剪影，横向疏密不均（不是等距栅栏）
    const trunks = ops.filter(o => o.t === 'r' && o.c === C.void
      && o.w >= 2 && o.w <= 4 && o.h >= 5 && o.h <= 22
      && o.y + o.h <= hz + 2 && o.y > hz - 40);
    expect(trunks.length).toBeGreaterThanOrEqual(12);
    expect(trunks.length).toBeLessThanOrEqual(60);
    const tx = [...new Set(trunks.map(o => o.x))].sort((a, b) => a - b);
    expect(tx[tx.length - 1] - tx[0]).toBeGreaterThan(480 * 0.6);
    const gaps = new Set();
    for (let i = 1; i < tx.length; i++) gaps.add(tx[i] - tx[i - 1]);
    expect(gaps.size).toBeGreaterThanOrEqual(3);

    // 3) 月晕：至少 4 圈同心环，圆心咬住 light 锚点
    const rings = ops.filter(o => o.t === 'p' && o.close === true).map((o) => {
      const cx = o.pts.reduce((s, p) => s + p.x, 0) / o.pts.length;
      const cy = o.pts.reduce((s, p) => s + p.y, 0) / o.pts.length;
      const r = o.pts.reduce((s, p) => s + Math.hypot(p.x - cx, p.y - cy), 0) / o.pts.length;
      return { cx, cy, r };
    }).filter(q => Math.abs(q.cx - L.anchors.light.x) <= 5 && Math.abs(q.cy - L.anchors.light.y) <= 5);
    expect(rings.filter(q => q.r >= 18 && q.r <= 60).length).toBeGreaterThanOrEqual(4);

    // 4) 盘旋乌鸦：上半空 ≥4 只 V 形（每只 ≥4 个暗像素，翼展 ≥4px）
    const dark = ops.filter(o => o.t === 'r' && o.c === C.void && o.w === 1 && o.h === 1
      && o.y < hz * 0.42 && o.x > 480 * 0.5);
    const groups = [];
    for (const o of dark) {
      const gp = groups.find(q => Math.abs(q.x - o.x) <= 8 && Math.abs(q.y - o.y) <= 6);
      if (gp) {
        gp.x = (gp.x * gp.n + o.x) / (gp.n + 1);
        gp.y = (gp.y * gp.n + o.y) / (gp.n + 1);
        gp.n++; gp.minX = Math.min(gp.minX, o.x); gp.maxX = Math.max(gp.maxX, o.x);
      } else groups.push({ x: o.x, y: o.y, n: 1, minX: o.x, maxX: o.x });
    }
    expect(groups.length).toBeGreaterThanOrEqual(4);
    expect(groups.every(q => q.n >= 4)).toBe(true);
    expect(Math.max(...groups.map(q => q.maxX - q.minX))).toBeGreaterThanOrEqual(4);

    // 5) 家族墓室（骨龛墙）：矮墙之后、礼拜堂更远的第二层次——横向墙身 + 檐口 + 一排小拱龛
    // 墙身按几何认，不按颜色认：远建筑现在是月光雾里的中调石色，不再是死黑一块
    const body = ops.find(o => o.t === 'r' && (o.c === C.void || o.c === C.stoneDark) && o.a >= 0.5
      && o.w >= 480 * 0.22 && o.w <= 480 * 0.36 && o.h >= 24 && o.y + o.h <= hz);
    expect(body).toBeTruthy();
    expect(body.y).toBeLessThanOrEqual(hz - 26); // 比矮墙顶更高：真的在第二层次上
    const cornice = ops.filter(o => o.t === 'r' && o.w >= body.w + 3 && o.h <= 3
      && Math.abs(o.y - body.y) <= 4);
    expect(cornice.length).toBeGreaterThanOrEqual(1);
    const niches = ops.filter(o => o.t === 'p' && o.pts.length <= 14
      && o.pts.every(p => p.x >= body.x - 2 && p.x <= body.x + body.w + 2)
      && o.pts.every(p => p.y >= body.y - 2 && p.y <= body.y + body.h + 2));
    expect(niches.length).toBeGreaterThanOrEqual(5);
  });

  it('中景：墓志浮雕 / 碑脚碎石 / 碑间薄雾 / 塌陷墓穴', () => {
    const { ops, L } = run('mid', 1, 480, 270);
    const ground = L.anchors.nail.y;

    // 1) 近排三块碑的墓志：≥9 行 1px 骨白刻线，且分散在三块碑上
    const insc = ops.filter(o => o.t === 'r' && o.c === C.bone && o.h === 1 && o.w >= 5 && o.w <= 26);
    expect(insc.length).toBeGreaterThanOrEqual(9);
    expect(new Set(insc.map(o => Math.round(o.x / 40))).size).toBeGreaterThanOrEqual(3);

    // 2) 碑额浮雕：三块近排碑各有一处刻记，且三块轮换不同种类（十字 / 菱形 / 圆盘）。
    //    三块碑共用同一个圆环在 1x 下会被读成「同一排展板上的圆窗」——碑的辨识来自它们不一样。
    const near = ops.filter(o => o.t === 'r' && o.c === C.stoneLight
      && o.w >= 18 && o.h >= 46 && o.a > 0.9).slice(0, 3);
    expect(near.length).toBeGreaterThanOrEqual(3);
    const markKind = near.map((s) => {
      const x0 = s.x - 4, x1 = s.x + s.w + 4, y0 = s.y - 8, y1 = s.y + Math.round(s.h * 0.62);
      const bones = ops.filter((o) => {
        if (o.c !== C.bone) return false;
        if (o.t === 'r') {
          return o.w <= 5 && o.h <= 5 && o.x >= x0 && o.x + o.w <= x1 && o.y >= y0 && o.y + o.h <= y1;
        }
        const xs = o.pts.map((p) => p.x), ys = o.pts.map((p) => p.y);
        return Math.min(...xs) >= x0 && Math.max(...xs) <= x1 && Math.min(...ys) >= y0 && Math.max(...ys) <= y1;
      });
      expect(bones.length, '碑额浮雕').toBeGreaterThanOrEqual(1);
      return bones.some((o) => o.t === 'p' && o.close === true) ? 'ring' : 'cross';
    });
    expect(new Set(markKind).size, '三块碑的浮雕种类应≥2').toBeGreaterThanOrEqual(2);

    // 3) 碑脚碎石 + 枯草：每块近排碑脚边 ≥4 块碎石
    const nearStones = ops.filter(o => o.t === 'r' && o.c === C.stoneLight
      && o.w >= 18 && o.h >= 46 && o.a > 0.9);
    expect(nearStones.length).toBeGreaterThanOrEqual(3);
    for (const s of nearStones.slice(0, 3)) {
      const foot = ops.filter(o => o.t === 'r' && o.w <= 3 && o.h <= 3
        && o.x >= s.x - 10 && o.x <= s.x + s.w + 10
        && o.y >= s.y + s.h - 2 && o.y <= s.y + s.h + 8);
      expect(foot.length).toBeGreaterThanOrEqual(4);
    }

    // 4) 碑间薄雾：≥3 条贴地的横向亮带（1–2px、alpha 0.05–0.09）
    const mist = ops.filter(o => o.t === 'r' && o.c === C.fog && o.h <= 2
      && o.w >= 60 && o.a >= 0.05 && o.a <= 0.09);
    expect(mist.length).toBeGreaterThanOrEqual(3);
    expect(mist.every(o => o.y >= ground - 22 && o.y <= ground + 2)).toBe(true);

    // 5) 塌陷墓穴：暗坑 + 翻倒的盖板 + 土堆
    const pit = ops.find(o => o.t === 'r' && o.c === C.void
      && o.w >= 24 && o.w <= 52 && o.h >= 4 && o.h <= 9 && o.y > L.horizon + 30);
    expect(pit).toBeTruthy();
    const lid = ops.filter(o => o.t === 'r' && (o.c === C.stone || o.c === C.stoneLight)
      && o.w >= 10 && o.h >= 2 && o.h <= 6
      && Math.abs(o.y - pit.y) <= 12 && o.x >= pit.x);
    expect(lid.length).toBeGreaterThanOrEqual(1);
    const mound = ops.filter(o => o.t === 'r' && o.c === C.stoneDark
      && o.w >= 6 && o.w <= 20 && Math.abs(o.y - pit.y) <= 8 && o.x <= pit.x + 4);
    expect(mound.length).toBeGreaterThanOrEqual(1);
  });

  it('天幕：亮星分档 / 月照云堤 / 丘陵受光坡（detail 的骨架）', () => {
    const { ops, L } = run('back', 1, 480, 270);
    const hz = L.horizon;
    const spanX = (o) => Math.max(...o.pts.map(p => p.x)) - Math.min(...o.pts.map(p => p.x));

    // 1) 亮星：2×2 星核 + 星芒，只在上半空、横向铺开（原来的 1px 星点读不出来）
    const cores = ops.filter(o => o.t === 'r' && o.w === 2 && o.h === 2
      && o.a >= 0.6 && o.y < hz * 0.55 && (o.c === C.bone || o.c === C.accent));
    expect(cores.length).toBeGreaterThanOrEqual(6);
    expect(new Set(cores.map(o => Math.floor(o.x / 60))).size).toBeGreaterThanOrEqual(4);

    // 2) 月照云堤：三团各由 5–6 个高低错落的"云球"叠成，而不是一条贯穿画面的横带
    //    （通栏长条的中间段左右邻格同值，软渲染里几乎不产生边缘，读起来像天花板）
    const lobes = ops.filter(o => o.t === 'r' && o.c === C.bone && o.w >= 18 && o.w <= L.w * 0.4
      && o.h >= 2 && o.h <= 20 && o.a >= 0.03 && o.a <= 0.16 && o.y < hz * 0.62);
    expect(lobes.length).toBeGreaterThanOrEqual(12);
    // 云顶有起伏：云球高度至少分四档
    expect(new Set(lobes.map(o => o.h)).size).toBeGreaterThanOrEqual(4);
    // 横向铺开：云球落在 ≥6 个 0.1W 宽的列里（三团分散在画面上空，不是攒成一坨）
    expect(new Set(lobes.map(o => Math.floor(o.x / (L.w * 0.1)))).size).toBeGreaterThanOrEqual(6);
    // 三团云分别悬在三个高度：云底排序后至少能断出三档（档间空档 ≥ 0.08 个地平线高）
    const bottoms = [...new Set(lobes.map(o => o.y + o.h))].sort((a, b) => a - b);
    let tiers = 1;
    for (let i = 1; i < bottoms.length; i += 1) if (bottoms[i] - bottoms[i - 1] > hz * 0.08) tiers += 1;
    expect(tiers, JSON.stringify(bottoms)).toBeGreaterThanOrEqual(3);
    // 每团云顶沿压一道更亮的银棱（月光在云的上缘，硬边，不用渐变）
    const rims = ops.filter(o => o.t === 'r' && o.c === C.bone && o.h <= 1 && o.w >= 10
      && o.a >= 0.12 && o.y < hz * 0.62);
    expect(rims.length).toBeGreaterThanOrEqual(6);

    // 3) 丘陵受光坡：山体上一条 ≥0.9W 的石色坡带（不是一条细线），压在山脚暗剪影里
    const lit = ops.filter(o => o.t === 'f' && o.c === C.stoneDark && o.a >= 0.4);
    expect(lit.length).toBeGreaterThanOrEqual(1);
    expect(spanX(lit[0])).toBeGreaterThanOrEqual(L.w * 0.9);
    expect(Math.max(...lit[0].pts.map(p => p.y))).toBeLessThanOrEqual(hz + 1);
  });

  it('竖屏也守预算与确定性（新物件跟随 L.tall 与 u 缩放）', () => {
    for (const band of ['back', 'mid', 'fore']) {
      const a = run(band, 1, 480, 760);
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
      const b = run(band, 1, 480, 760);
      expect(b.ops).toEqual(a.ops);
    }
    // 新物件必须跟着竖屏放大，横竖屏指令数不该完全相同
    expect(run('back', 1, 480, 760).ops.length).not.toBe(run('back', 1, 480, 270).ops.length);
    expect(run('mid', 1, 480, 760).ops.length).not.toBe(run('mid', 1, 480, 270).ops.length);
  });

  it('近景一层与门洞比例（竖屏下沿不能空、门不能被地平线拉成尖针）', () => {
    // 1) 门洞比例：门高受门宽约束。竖屏地平线是横屏的 2.8 倍，
    //    只按 horizon 缩放会让 77px 宽的门长到 210px 高，外面两圈拱券再放大成占满上半个画面的尖帐篷
    for (const [W, H] of [[480, 270], [480, 760]]) {
      const { ops, L } = run('back', 1, W, H);
      const gw = Math.round(W * 0.16);
      const arch = ops.filter(o => o.t === 'f' && o.pts.length >= 12
        && Math.abs(Math.max(...o.pts.map(p => p.x)) - Math.min(...o.pts.map(p => p.x)) - gw) <= 6
        && Math.abs(Math.max(...o.pts.map(p => p.y)) - L.horizon) <= 2);
      expect(arch.length, W + 'x' + H + ' 找不到门洞').toBeGreaterThanOrEqual(1);
      const ah = L.horizon - Math.min(...arch[0].pts.map(p => p.y));
      expect(ah).toBeLessThanOrEqual(gw * 1.4);
    }

    // 2) 近景一层：碑座前沿的下方（竖屏这 138px 最容易空）有东西站在地上
    const land = run('fore', 1, 480, 270);
    const tall = run('fore', 1, 480, 760);
    for (const f of [land, tall]) {
      const u = f.L.tall ? 1.5 : 1;
      // 倒伏的石十字：一块横躺的大石板（近景唯一的水平石体）
      const slab = f.ops.filter(o => o.t === 'r' && o.c === C.stone && o.a >= 0.9
        && o.w >= Math.round(24 * u) && o.h <= 6 && o.y > groundOf(f.L) - 20 * u);
      expect(slab.length).toBeGreaterThanOrEqual(1);
      // 贴地雾：≥3 条很淡的横向亮带
      const mist = f.ops.filter(o => o.t === 'r' && o.c === C.fog && o.a <= 0.1 && o.w >= f.L.w * 0.4);
      expect(mist.length).toBeGreaterThanOrEqual(3);
      // 近景绝不铺地面：不许出现通栏又厚的填充（地面与裂缝归中景）
      const groundSlab = f.ops.filter(o => o.t === 'r' && o.w >= f.L.w * 0.9 && o.h >= 8);
      expect(groundSlab.length).toBe(0);
    }
  });
});
