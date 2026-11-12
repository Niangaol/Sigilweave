import { describe, expect, it } from 'vitest';
import { dioramaLayout, BAND_BUDGET } from '../src/ui/dioramas/registry.js';
import * as act7 from '../src/ui/dioramas/act7.js';
import { C } from '../src/ui/Palette.js';

// 第 VII 幕的固定验收口径。记录型 graphics：把 fillRect / strokePoints / fillPoints 原样记下来，
// 既能数预算，也能查构图（和 act1 测试同一套写法）。
const ACCENT = 0xffd98a;

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

const run = (band, w = 480, h = 270) => {
  const { g, ops } = recorder();
  const L = dioramaLayout(7, w, h);
  act7[band](g, L);
  return { ops, L };
};

const spanX = (op) => (op.t === 'r' ? [op.x, op.x + op.w] : [Math.min(...op.pts.map(p => p.x)), Math.max(...op.pts.map(p => p.x))]);
const spanY = (op) => (op.t === 'r' ? [op.y, op.y + op.h] : [Math.min(...op.pts.map(p => p.y)), Math.max(...op.pts.map(p => p.y))]);

describe('第 VII 幕 破晓之座', () => {
  it('锚点：地平线 119、原 seal/gate 数值不变、nail 落在碑座上沿之上', () => {
    const L = dioramaLayout(7, 480, 270);
    expect(L.horizon).toBe(119);
    // 文件里原有的两个锚点，一个数都不许改
    expect(L.anchors.seal).toEqual({ x: 240, y: 113, r: 43 });
    expect(L.anchors.gate).toEqual({ x: 240, y: 157, r: 32 });
    // 事件层要用的光源/契约主/契约钉：light=日出位置，lord=座面，nail=台座脚下
    expect(L.anchors.light).toEqual({ x: 240, y: 113, r: 8 });
    expect(L.anchors.nail).toEqual({ x: 240, y: 186, r: 5 });
    expect(L.anchors.lord).toEqual({ x: 240, y: 156, r: 14 });
    expect(L.anchors.nail.y).toBeLessThanOrEqual(270 - 84);

    const T = dioramaLayout(7, 480, 760);
    expect(T.horizon).toBe(334);
    expect(T.anchors.seal).toEqual({ x: 240, y: 319, r: 77 });
    expect(T.anchors.gate).toEqual({ x: 240, y: 441, r: 58 });
    expect(T.anchors.nail.y).toBeLessThanOrEqual(760 - 104);
  });

  it('三层都画、预算内、坐标整数、alpha 0..1、同参确定（横竖屏）', () => {
    for (const [w, h] of [[480, 270], [480, 760]]) {
      for (const band of ['back', 'mid', 'fore']) {
        const a = run(band, w, h);
        expect(a.ops.length, band + '/' + h).toBeGreaterThan(30);
        expect(a.ops.length, band + '/' + h).toBeLessThanOrEqual(BAND_BUDGET[band]);
        for (const op of a.ops) {
          if (op.t === 'r') {
            for (const v of [op.x, op.y, op.w, op.h]) expect(Number.isInteger(v), band + ':' + JSON.stringify(op)).toBe(true);
          } else {
            for (const p of op.pts) expect(Number.isInteger(p.x) && Number.isInteger(p.y), band + ':pts').toBe(true);
          }
          expect(op.a).toBeGreaterThanOrEqual(0);
          expect(op.a).toBeLessThanOrEqual(1);
        }
        expect(run(band, w, h).ops).toEqual(a.ops);
      }
    }
  });

  it('辨识标记①：五段硬边天幕 + 晨光横带横扫地平线', () => {
    const { ops, L } = run('back');
    const sky = ops.filter(o => o.t === 'r' && o.w === 480 && o.h >= 10 && o.y < L.horizon);
    expect(sky.length).toBeGreaterThanOrEqual(4);

    const dawn = ops.filter(o => o.c === ACCENT && spanX(o)[1] - spanX(o)[0] >= 380 && spanY(o)[0] < L.horizon);
    expect(dawn.length).toBeGreaterThanOrEqual(3);
    // 晨光只压在地平线上方；最亮的一条紧贴地平线
    expect(dawn.every(o => spanY(o)[1] <= L.horizon + 1)).toBe(true);
    expect(dawn.some(o => spanY(o)[1] >= L.horizon - 3)).toBe(true);
  });

  it('辨识标记②：北斗七星成斗身+斗柄、星点有主次、6 段以上连线', () => {
    const { ops } = run('back');
    const F = [[0.615, 0.115], [0.668, 0.150], [0.715, 0.192], [0.762, 0.176], [0.822, 0.148], [0.850, 0.215], [0.790, 0.245]];
    for (const [fx, fy] of F) {
      const x = Math.round(480 * fx), y = Math.round(270 * fy);
      const hit = ops.some(o => o.t === 'r' && o.c === ACCENT && o.a >= 0.6 && Math.abs(o.x + o.w / 2 - x) <= 1 && Math.abs(o.y + o.h / 2 - y) <= 1);
      expect(hit, '缺星 ' + x + ',' + y).toBe(true);
    }
    const segs = ops.filter(o => o.t === 'p' && o.c === ACCENT).reduce((n, o) => n + o.pts.length - 1, 0);
    expect(segs).toBeGreaterThanOrEqual(6);
    // 星点大小要有主次（斗柄末端最亮最大、斗身四星中等）
    const starW = new Set(ops.filter(o => o.t === 'r' && o.c === ACCENT && o.a >= 0.9 && o.y < 90 && o.x > 250).map(o => o.w));
    expect(starW.size, '星点尺寸分级').toBeGreaterThanOrEqual(2);
  });

  it('辨识标记③：断裂王座——两段分离、断口透光、压到地面、剪影约 120×110', () => {
    const { ops } = run('mid');
    const rock = ops.filter(o => o.t === 'r' && o.c === C.void && o.a >= 0.85 && o.w >= 18 && Math.abs(o.x + o.w / 2 - 240) <= 80);
    expect(rock.length).toBeGreaterThanOrEqual(6);
    expect(rock.filter(o => o.y <= 100).length, '上半段').toBeGreaterThanOrEqual(2);
    expect(rock.filter(o => o.y >= 116).length, '下半段').toBeGreaterThanOrEqual(2);
    const top = Math.min(...rock.map(o => spanY(o)[0]));
    const bottom = Math.max(...rock.map(o => spanY(o)[1]));
    expect(top).toBeLessThan(100);
    expect(bottom).toBeGreaterThanOrEqual(158);
    expect(bottom - top, '王座高度').toBeGreaterThanOrEqual(100);
    expect(Math.max(...rock.map(o => o.w)), '王座宽度').toBeGreaterThanOrEqual(100);
    // 断口在 106–116 之间：这一带不许有黑影横过中轴，天光要透过去
    const blocked = ops.some(o => o.t === 'r' && o.c === C.void && o.a >= 0.85 && o.x < 240 && o.x + o.w > 240 && o.y < 116 && o.y + o.h > 106);
    expect(blocked).toBe(false);
  });

  it('中景：七钉柱远排、断柱中排、倒伏方尖碑近排、光池与光尘贴地', () => {
    const { ops, L } = run('mid');
    // 远排：地平线附近一排细钉柱
    const nails = ops.filter(o => o.t === 'r' && o.w >= 2 && o.w <= 5 && o.h >= 10 && o.y < L.horizon + 4 && o.y + o.h > L.horizon);
    expect(new Set(nails.map(o => o.x)).size).toBeGreaterThanOrEqual(7);

    // 中/近排至少有 3 种不同基座高度的石件（纵深要求）
    const bases = new Set(ops.filter(o => o.t === 'r' && o.h >= 8 && o.w >= 12 && (o.c === C.void || o.c === C.stoneDark) && o.y > L.horizon - 12).map(o => o.y + o.h));
    expect(bases.size).toBeGreaterThanOrEqual(3);

    // 近排：两座倒伏的方尖碑/断柱，躺在碑座边上（偏离中轴，别和王座混）
    const fallen = ops.filter(o => o.t === 'r' && o.c === C.void && o.w >= 45 && o.h >= 6 && o.y >= 166 && Math.abs(o.x + o.w / 2 - 240) >= 55);
    expect(fallen.length).toBeGreaterThanOrEqual(2);

    // 熄掉的残烛：只剩蜡身与蜡痕（贴着地面/台阶，不许悬空在天空）
    const wax = ops.filter(o => o.t === 'r' && o.c === C.bone && o.w <= 5 && o.h >= 5 && o.y > L.horizon);
    expect(wax.length, '熄烛残蜡').toBeGreaterThanOrEqual(2);

    const pool = ops.filter(o => o.t === 'r' && o.c === ACCENT && o.y > L.horizon && o.w >= 80);
    expect(pool.length).toBeGreaterThanOrEqual(3);
    const dust = ops.filter(o => o.t === 'r' && o.c === ACCENT && o.y < L.horizon && o.w <= 2 && o.h === 1);
    expect(dust.length).toBeGreaterThanOrEqual(10);
  });

  it('材质线依附实体：地面石缝、苔贴基座、锈贴铜件、凿痕贴王座', () => {
    const { ops, L } = run('mid');
    const seams = ops.filter(o => o.t === 'r' && o.h === 1 && o.w >= 300 && o.y > L.horizon);
    expect(seams.length).toBeGreaterThanOrEqual(3);
    const moss = ops.filter(o => o.t === 'r' && o.c === C.mossTileLit && o.y > L.horizon);
    expect(moss.length).toBeGreaterThanOrEqual(8);
    const rust = ops.filter(o => o.t === 'r' && o.c === C.brassDark && o.w <= 3);
    expect(rust.length).toBeGreaterThanOrEqual(2);
    const chisel = ops.filter(o => o.t === 'r' && o.c === C.groove && o.h <= 1 && o.y < L.horizon + 80);
    expect(chisel.length).toBeGreaterThanOrEqual(4);
  });

  it('近景只有压边：左右石阶 + 逆光雾，绝不整片铺地', () => {
    const { ops } = run('fore');
    // 中景的地面不能被近景盖住：没有横贯画面、6px 以上的厚板
    expect(ops.filter(o => o.t === 'r' && o.w >= 400 && o.h >= 6)).toHaveLength(0);
    const treads = ops.filter(o => o.t === 'r' && o.w >= 60 && o.h >= 4 && o.h <= 8 && o.y >= 168);
    expect(treads.length).toBeGreaterThanOrEqual(4);
    expect(new Set(treads.map(o => o.y)).size).toBeGreaterThanOrEqual(3);
    // 两段阶梯分居左右，中间留出王座
    expect(treads.some(o => o.x < 0)).toBe(true);
    expect(treads.some(o => o.x + o.w > 480)).toBe(true);
    expect(ops.filter(o => o.t === 'r' && o.c === C.fog && o.w >= 300).length).toBeGreaterThanOrEqual(2);
  });
});
