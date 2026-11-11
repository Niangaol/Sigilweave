// 雷 / 重击系四法术（v2 大胆版）
//   chain_lightning 连锁闪电 —— 动作：分叉跳跃（锯齿主干 + 两条分叉 + 白热芯，命中朝来向抽回粗主干电弧）
//   pierce_lance    贯穿长枪 —— 动作：直线穿刺（细长锥 + 尾羽 + 三层残影贯穿光束）
//   judgment_hammer 裁决之锤 —— 动作：砸落压扁（锤头 + squash 0.45 的冲击环 + 竖直光柱 + 地面十字裂）
//   quake_maw       地裂之颚 —— 动作：地面张嘴（俯视角：一圈岩齿咬住不规则黑腔，牙朝内、外圈崩裂）
import { C } from '../../Palette.js';
import {
  poly, dots, blocks, rects, shell, band, band3, ringPts, ring3, sectorPts, spikePts,
  blobPts, boltPts, hexPts, starPts, arrowPts, rectPts, shape, offset, lineDots, ringDots,
  scatterPts, drawTrail, peak, rise, fade, pulse, hash01, hashSym, rnd, TAU,
} from '../kit.js';

// ---------- 本地笔刷：连续锯齿牙床 ----------
// 一整条连续多边形（不是散点）：沿局部 ±x 展开，牙尖朝 tipY，牙谷朝 rootY，背脊在 backY。
// 顶点数 = 2n + 3，所以半径越大牙越多、顶点越多，大半径下牙床永远是实心的一整块。
function toothRow(halfLen, n, tipY, rootY, backY, seed = 0) {
  const step = (halfLen * 2) / n;
  const out = [[-halfLen, rootY]];
  for (let i = 0; i < n; i++) {
    const x0 = -halfLen + i * step;
    // 牙尖横向微抖（< ±0.16 格），保持 x 单调，不会自交
    const jit = seed ? hashSym(seed * 17 + i) * 0.16 : 0;
    out.push([x0 + step * (0.5 + jit), tipY]);
    out.push([x0 + step, rootY]);
  }
  out.push([halfLen, backY]);
  out.push([-halfLen, backY]);
  return out;
}
// 牙数 = clamp(round(R / 3.2), 7, 26)
const teethFor = (R) => Math.max(7, Math.min(26, Math.round(R / 3.2)));

export const storm = {
  // ------------------------------------------------------------------
  // 连锁闪电：分叉跳跃。锯齿主干 + 两条分叉 + 白热芯；clock 只重抖锯齿，段数不变。
  // 命中：朝 c.angle 反方向抽回一条粗主干电弧，另外 6 条分叉朝不同方向炸开。
  // ------------------------------------------------------------------
  chain_lightning: {
    silhouette: 'fork-bolt',
    trail: { max: 8, style: 'spark' },
    colors: { edge: C.outline, body: 0xfff0a0, core: 0xfffbe6, accent: 0x7fd7ff },
    opBudget: 56,
    projectile(g, c, col) {
      const { x, y, angle, clock } = c;
      const a = 1 - c.k * 0.1;
      const seed = Math.floor(clock / 70); // 只当相位：改锯齿，不改段数
      const tail = offset(x, y, angle, -12, 0);
      const head = offset(x, y, angle, 14, 0);
      // 主干：粗锯齿（振幅 5.8px，粗 5.6→3.8px）
      band3(g, boltPts(tail.x, tail.y, head.x, head.y, seed, 5.8, 8), 5.6, 3.8, col, a, 3);
      // 白热芯：同走向再抖一条细的，压在主干的中心
      band(g, boltPts(tail.x, tail.y, head.x, head.y, seed + 7, 2.8, 6), 2, 1.4, col.core, a * 0.95);
      // 两条分叉：从中段朝两侧甩出去，比主干细
      for (let f = 0; f < 2; f++) {
        const side = f ? 1 : -1;
        const root = offset(x, y, angle, 3 - f * 6, 0);
        const dir = angle + side * (0.66 + 0.2 * hash01(seed + f * 9 + 3));
        const len = 11 + 5 * hash01(seed * 3 + f * 5 + 1);
        const tip = offset(root.x, root.y, dir, len, 0);
        band3(g, boltPts(root.x, root.y, tip.x, tip.y, seed + 11 + f * 3, 3.6, 5), 2.8, 1.4, col, a * 0.95, 2.2);
        dots(g, [tip], col.core, a);
      }
      // 头部白热点 + 尾部残电
      blocks(g, [head], C.white, a, 4);
      dots(g, [offset(x, y, angle, -16, 1), offset(x, y, angle, -19, -1)], col.accent, a * 0.7);
    },
    trailFx(g, c, col) {
      drawTrail(g, c, col, { max: 8, farW: 2.2, nearW: 6.8, style: 'spark', sway: 1.6 });
    },
    cast(g, c, col) {
      const a = fade(c.k);
      const p = rise(c.k, 0.42);
      const seed = Math.floor(c.clock / 60);
      const rot = c.clock / 260;
      // 1) 杖尖先炸一团电：实心电离球（三层）
      shell(g, (s) => blobPts(c.x, c.y, (6 + 10 * p) * s, 5, 9, 0.24, rot), col, a);
      // 2) 6 条粗电弧朝四周炸开
      for (let i = 0; i < 6; i++) {
        const ang = rot + (i / 6) * TAU;
        const tip = offset(c.x, c.y, ang, 11 + 18 * p, 0);
        band3(g, boltPts(c.x, c.y, tip.x, tip.y, seed + i * 7, 4, 4), 3.4, 1.4, col, a * 0.92, 2.2);
      }
      // 3) 再拉出主干：朝朝向甩一段长锯齿
      const lash = offset(c.x, c.y, c.angle, 18 + 26 * p, 0);
      band3(g, boltPts(c.x, c.y, lash.x, lash.y, seed + 51, 6, 8), 6.4, 2.4, col, a * 0.95, 3);
      // 4) 预警电环 + 杖尖白点
      ring3(g, c.x, c.y, 7 + 17 * p, 3.6, col, a * 0.85, { phase: -rot, seg: 22 });
      blocks(g, [{ x: c.x, y: c.y }], C.white, a * 0.9, 5);
    },
    impact(g, c, col) {
      // 分叉跳跃。关键在「一条压得住画面的主干」：先一根 15px 的粗电弧朝来向抽回，
      // 再让 2 条分叉从主干上跳出去。v1 把 4~6 条同粗的枝和中心电离球叠在一起，实战会糊成乱线。
      const a = fade(c.k);
      const fl = peak(c.k, 0.16);
      const R = c.radius;
      const seed = Math.floor(c.clock / 55);
      const back = c.angle + Math.PI;
      const grow = R * (0.9 + 0.9 * rise(c.k, 0.55));
      // 贴地电环（细、压扁）：脚下一圈电，不是正圆
      ring3(g, c.x, c.y, grow, 3, col, a * 0.8, { phase: -c.clock / 240, squash: 0.55, seg: 22 });
      // 主干：暗边 15px / 金 9px / 白热芯 3.6px，抖动 11px —— 一眼读成闪电
      const root = offset(c.x, c.y, back, R * (1.1 + 1.6 * (0.25 + 0.75 * c.k)), 0);
      const spine = boltPts(c.x, c.y, root.x, root.y, seed, 11, 8);
      band(g, spine, 15, 6, col.edge, a * 0.95);
      band(g, spine, 9, 3.4, col.body, a);
      band(g, spine, 3.6, 1.2, C.white, a * 0.95);
      // 2 条分叉：从命中点朝两侧跳出去
      for (let i = 0; i < 2; i++) {
        const ang = back + (i ? 1.15 : -1.0) + hashSym(seed + i * 13) * 0.15;
        const tip = offset(c.x, c.y, ang, grow * (0.85 + 0.3 * hash01(seed + i * 5 + 2)), 0);
        const bp = boltPts(c.x, c.y, tip.x, tip.y, seed + i * 23 + 5, 7, 5);
        band(g, bp, 9, 2.4, col.edge, a * 0.9);
        band(g, bp, 5, 1.6, col.body, a);
        band(g, bp, 2, 0.8, C.white, a * 0.85);
        dots(g, [tip], C.white, a * 0.95);
      }
      // 命中瞬间：白热电星
      if (fl > 0.02) {
        const fr = 6 + 0.08 * R;
        poly(g, starPts(c.x, c.y, c.clock / 300, fr * (0.7 + 0.8 * fl), fr * 0.3, 6), C.white, fl);
        blocks(g, [{ x: c.x, y: c.y }], C.white, fl, 7);
      }
      // 余韵：残环 + 地表电弧刺 + 焦痕
      poly(g, ringPts(c.x, c.y, grow * 1.22, 1.8, -c.clock / 200, 0.55, 20), col.accent, a * 0.45);
      const ticks = [];
      for (let i = 0; i < 8; i++) ticks.push(offset(c.x, c.y, (i / 8) * TAU + 0.3, grow * (1.02 + (i % 2) * 0.18), 0));
      dots(g, ticks, col.core, a * 0.7);
      rects(g, [[rnd(c.x - grow * 0.8), rnd(c.y + grow * 0.35), rnd(grow * 1.3), 2]], col.edge, a * 0.45);
    },
    ward(g, c, col) {
      const a = fade(c.k);
      const R = Math.max(6, c.radius);
      const rot = c.clock / 700;
      ring3(g, c.x, c.y, R * 0.86, 4.2, col, a * 0.85, { phase: rot, seg: 24 });
      // 4 段电弧压在环外沿（顺时针跳）
      for (let i = 0; i < 4; i++) {
        const a0 = rot + (i / 4) * TAU;
        const p0 = offset(c.x, c.y, a0, R * 0.92, 0);
        const p1 = offset(c.x, c.y, a0 + 0.7, R * 0.92, 0);
        band3(g, boltPts(p0.x, p0.y, p1.x, p1.y, i * 31 + 7, 4.2, 4), 3.2, 2.2, col, a * 0.95, 2.4);
      }
      // 内层细环 + 8 颗电点
      poly(g, ringPts(c.x, c.y, R * 0.56, 2, -rot * 1.5, 1, 18), col.accent, a * 0.7);
      dots(g, ringDots(c.x, c.y, R * 0.86, 8, rot), col.core, a * 0.95);
    },
    link(g, c, col) {
      const a = (1 - c.k) * 0.95;
      const seed = Math.floor(c.clock / 80);
      // 主丝带：锯齿状（电不会走直线）
      const mid = {
        x: (c.from.x + c.to.x) * 0.5 + hashSym(seed) * 7,
        y: (c.from.y + c.to.y) * 0.5 + hashSym(seed + 4) * 7,
      };
      band3(g, [c.from, mid, c.to], 4.4, 6.6, col, a, 3);
      // 流向节拍块：从起手流向落点
      const flow = lineDots(c.from.x, c.from.y, c.to.x, c.to.y, 6);
      blocks(g, flow.filter((p, i) => i % 2 === 0), col.core, a * 0.9, 3);
      // 两端电球
      blocks(g, [c.from, c.to], C.white, a, 4);
      dots(g, [mid], col.accent, a * 0.85);
    },
  },

  // ------------------------------------------------------------------
  // 贯穿长枪：直线穿刺。细长锥（长 33px）+ 尾羽 + 亮芯线；命中三层残影贯穿光束。
  // ------------------------------------------------------------------
  pierce_lance: {
    silhouette: 'lance-streak',
    trail: { max: 8, style: 'dash' },
    colors: { edge: C.outline, body: 0xe0c35a, core: 0xfff8d8, accent: 0xfff1c0 },
    opBudget: 50,
    projectile(g, c, col) {
      const { x, y, angle, clock } = c;
      const a = 1 - c.k * 0.1;
      const p = pulse(clock, 300);
      // 枪体：细长锥（长 33px，半宽 4.6px）——「直线穿刺」的剪影
      shell(g, (s) => shape(x, y, angle, [
        [18 * s, 0], [4 * s, -4.6 * s], [-15 * s, -1.6 * s], [-15 * s, 1.6 * s], [4 * s, 4.6 * s],
      ]), col, a);
      // 亮芯线：压过枪体、两端各探出一点，读作「穿透」
      band(g, [offset(x, y, angle, -14, 0), offset(x, y, angle, 17, 0)], 1.8, 1, col.core, a * 0.95);
      // 尾羽：3 根向后斜甩的细羽（中间长、两侧短，随呼吸微张）
      for (let i = 0; i < 3; i++) {
        const side = i - 1;
        const base = offset(x, y, angle, -13, side * 1.4);
        const len = 9 - Math.abs(side) * 2.6 + p * 2.4;
        poly(g, spikePts(base.x, base.y, angle + Math.PI + side * (0.3 + 0.1 * p), len, 2.2), col.accent, a * 0.9);
      }
      // 两侧破风鳍：贴在枪身中段
      for (let i = 0; i < 2; i++) {
        const side = i ? 1 : -1;
        const base = offset(x, y, angle, -2, side * 4.2);
        poly(g, spikePts(base.x, base.y, angle + side * 1.15, 7.5, 2.4), col.body, a * 0.85);
      }
      // 枪尖亮锥：细长的白热前刺（枪体最前沿）
      poly(g, shape(x, y, angle, [[18.5, 0], [9, -2.4], [11, 0], [9, 2.4]]), col.core, a * 0.9);
      // 枪尖白点 + 上下破风横块 + 尾部气爆点
      blocks(g, [offset(x, y, angle, 19, 0)], C.white, a, 3);
      rects(g, [
        [rnd(x - 3), rnd(y - 12), 6, 1],
        [rnd(x - 1), rnd(y + 11), 4, 1],
      ], col.core, a * 0.55);
      dots(g, [offset(x, y, angle, -20, -2), offset(x, y, angle, -23, 1)], col.accent, a * 0.6);
    },
    trailFx(g, c, col) {
      drawTrail(g, c, col, { max: 8, farW: 2.6, nearW: 7.2, style: 'dash' });
    },
    cast(g, c, col) {
      const a = fade(c.k);
      const p = rise(c.k, 0.4);
      const ang = c.angle;
      // 杖尖蓄势：压扁的小环
      ring3(g, c.x, c.y, 5 + 12 * p, 3.2, col, a * 0.85, { phase: c.clock / 400, squash: 0.7, seg: 20 });
      // 枪体在杖尖拉出（越起手越长）
      const px = c.x + Math.cos(ang) * 6 * p;
      const py = c.y + Math.sin(ang) * 6 * p;
      shell(g, (s) => shape(px, py, ang, [
        [(9 + 9 * p) * s, 0], [2 * s, -4.4 * s], [-(8 + 8 * p) * s, 0], [2 * s, 4.4 * s],
      ]), col, a);
      // 3 道破风线：沿朝向向后甩
      for (let i = 0; i < 3; i++) {
        const off = (i - 1) * 4.2;
        const q0 = offset(c.x, c.y, ang, -2, off);
        const q1 = offset(c.x, c.y, ang, -10 - 12 * p, off * (1 + p));
        band(g, [q0, q1], 1.8, 1, col.accent, a * 0.7);
      }
      // 杖尖白点
      blocks(g, [{ x: c.x, y: c.y }], C.white, a * 0.9, 3);
    },
    impact(g, c, col) {
      const a = fade(c.k);
      const fl = peak(c.k, 0.13);
      const R = c.radius;
      const ang = c.angle;
      const perp = ang + Math.PI / 2;
      const L = R * 3.8; // 总跨度 ≈ 3.8R（测试要求 > 2.5R）
      const p0 = offset(c.x, c.y, ang + Math.PI, L * 0.45, 0);
      const p1 = offset(c.x, c.y, ang, L * 0.55, 0);
      // ---- 3 层残影贯穿光束（排在同一条线上）----
      band(g, [p0, p1], 14, 3, col.edge, a * 0.95); // 外描边：最宽
      band(g, [p0, p1], 9.5, 2.2, col.body, a); // 本体
      band(g, [
        offset(p0.x, p0.y, ang, -R * 0.18, 0),
        offset(p1.x, p1.y, ang, R * 0.2, 0),
      ], 3.6, 1.2, col.core, a * 0.95); // 亮芯：两端再探出去
      // 两侧错位残影（第二、第三层，破风）
      for (let i = 0; i < 2; i++) {
        const side = i ? 1 : -1;
        const q0 = offset(p0.x, p0.y, perp, side * 6.5, 0);
        const q1 = offset(p1.x, p1.y, perp, side * 6.5, 0);
        band(g, [q0, q1], 4.6, 1.4, col.accent, a * (0.42 - i * 0.12));
      }
      // 两端冲击锥：枪尖穿出的一瞬
      poly(g, shape(p1.x, p1.y, ang, [[10, 0], [-6, -5.4], [-3, 0], [-6, 5.4]]), col.core, a * 0.8);
      poly(g, shape(p0.x, p0.y, ang + Math.PI, [[8, 0], [-5, -4.4], [-2, 0], [-5, 4.4]]), col.body, a * 0.7);
      // 沿线的风痕点（断续，像被枪风刮过）
      const wind = lineDots(p0.x, p0.y, p1.x, p1.y, 9);
      blocks(g, wind.filter((p, i) => i % 2 === 0), col.core, a * 0.6, 2);
      // 命中裂口：3 条横向短裂，垂直于贯穿轴
      for (let i = 0; i < 3; i++) {
        const side = i - 1;
        const base = offset(c.x, c.y, perp + side * 0.16, 2, 0);
        const tip = offset(c.x, c.y, perp + side * 0.16, 9 + (i === 1 ? 6 : 0), 0);
        band(g, boltPts(base.x, base.y, tip.x, tip.y, 51 + i * 7, 2.8, 4), 3.6, 1.2, col.edge, a * 0.9);
      }
      // 沿线的风环节点：贯穿路径上被枪风撕开的三个小环
      for (let i = 0; i < 3; i++) {
        const q = offset(p0.x, p0.y, ang, L * (0.24 + i * 0.28), 0);
        poly(g, ringPts(q.x, q.y, R * (0.28 - i * 0.05), 1.8, ang, 0.5, 12), col.accent, a * 0.5);
      }
      // 枪风甩出的碎屑（余韵）
      dots(g, scatterPts(c.x, c.y, 8, 21, R * 0.5, R * 1.2), col.core, a * 0.55);
      // 落点白闪（k 前 13%）：中心小块 + 小十字星
      if (fl > 0.02) {
        const fr = 4 + 0.05 * R;
        poly(g, starPts(c.x, c.y, ang, fr * (0.8 + 0.7 * fl), fr * 0.3, 4), C.white, fl);
        blocks(g, [{ x: c.x, y: c.y }], C.white, fl, 6);
      }
      // 余韵（k>0.6）：贯穿轴上的残环 + 落点焦痕块
      poly(g, ringPts(c.x, c.y, R * 0.9, 2, ang, 0.55, 20), col.accent, a * 0.45);
      rects(g, [
        [rnd(c.x - R * 0.55), rnd(c.y - 1), rnd(R * 1.1), 2],
        [rnd(c.x - R * 0.32), rnd(c.y + 3), rnd(R * 0.64), 1],
      ], col.edge, a * 0.4);
    },
    ward(g, c, col) {
      const a = fade(c.k);
      const R = Math.max(6, c.radius);
      const rot = c.clock / 800;
      ring3(g, c.x, c.y, R * 0.88, 3.4, col, a * 0.6, { phase: rot, seg: 22 });
      // 3 道细长盾条：绕环切向排布，像三根并排的枪杆（三层实体，不是细线）
      for (let i = 0; i < 3; i++) {
        const ang = rot + (i / 3) * TAU;
        const base = offset(c.x, c.y, ang, R * 0.88, 0);
        const tan = ang + Math.PI / 2;
        const tipA = offset(base.x, base.y, tan, 14, 0);
        poly(g, [
          offset(base.x, base.y, tan, -14, 0), offset(base.x, base.y, tan, 0, -4),
          tipA, offset(base.x, base.y, tan, 0, 4),
        ], col.edge, a * 0.9);
        poly(g, [
          offset(base.x, base.y, tan, -12, 0), offset(base.x, base.y, tan, 0, -2.8),
          offset(base.x, base.y, tan, 12, 0), offset(base.x, base.y, tan, 0, 2.8),
        ], col.body, a * 0.95);
        band(g, [offset(base.x, base.y, tan, -10, 0), offset(base.x, base.y, tan, 10, 0)], 1.6, 1.2, col.core, a * 0.9);
        // 盾条外沿的枪尖
        poly(g, spikePts(tipA.x, tipA.y, tan, 7, 3), col.accent, a * 0.85);
        blocks(g, [base], col.core, a * 0.9, 3);
      }
      dots(g, ringDots(c.x, c.y, R * 0.64, 6, -rot), col.accent, a * 0.7);
    },
    link(g, c, col) {
      const a = (1 - c.k) * 0.95;
      const pts = lineDots(c.from.x, c.from.y, c.to.x, c.to.y, 5);
      const ang = Math.atan2(c.to.y - c.from.y, c.to.x - c.from.x);
      band3(g, pts, 3.6, 7.2, col, a, 3);
      // 断续破风横块：沿连线朝落点推
      const dashes = [];
      for (let i = 1; i < 5; i++) dashes.push([pts[i].x - 4, pts[i].y - 2, 8, 3]);
      rects(g, dashes, col.core, a * 0.85);
      // 落点枪尖
      poly(g, arrowPts(c.to.x, c.to.y, ang, 10, 6, 5), col.body, a * 0.95);
      blocks(g, [c.to], C.white, a * 0.9, 3);
    },
  },

  // ------------------------------------------------------------------
  // 裁决之锤：砸落压扁。锤头（宽 16px 八方块）+ 短柄 + 上方下压冲击弧。
  // 命中签名：squash 0.45 的横向压扁冲击环（不是正圆）+ 竖直光柱 + 地面十字裂。
  // ------------------------------------------------------------------
  judgment_hammer: {
    silhouette: 'squash-hammer',
    trail: { max: 7, style: 'rubble' },
    colors: { edge: C.outline, body: 0xc9a227, core: 0xf0d9a8, accent: 0xe0c35a },
    opBudget: 79,
    projectile(g, c, col) {
      const { x, y, angle, clock } = c;
      const a = 1 - c.k * 0.1;
      const p = pulse(clock, 260);
      // 锤头：宽 16px（横向）、长 12px（沿飞行方向）的八方块
      shell(g, (s) => shape(x, y, angle, [
        [-6 * s, -8 * s], [5.4 * s, -8 * s], [7.6 * s, -4.4 * s], [7.6 * s, 4.4 * s],
        [5.4 * s, 8 * s], [-6 * s, 8 * s], [-7.6 * s, 4.4 * s], [-7.6 * s, -4.4 * s],
      ]), col, a);
      // 打击面高光（+x 侧）
      poly(g, shape(x, y, angle, [[7, -6], [8.4, -3], [8.4, 3], [7, 6]]), col.core, a * 0.9);
      // 锤头上沿的亮棱（别让锤头糊成一块暗金）
      poly(g, shape(x, y, angle, [[-5, -8], [4.6, -8], [3.4, -5.6], [-4, -5.6]]), col.accent, a * 0.8);
      // 短柄：从锤头背后伸出 + 柄尾配重环
      const h0 = offset(x, y, angle, -7, 0);
      const h1 = offset(x, y, angle, -21, 0);
      band3(g, [h0, h1], 4.6, 3.6, col, a, 2.4);
      poly(g, ringPts(h1.x, h1.y, 3.2, 2.4, angle, 1, 10), col.accent, a * 0.9);
      // 下压的冲击弧：锤头上方两圈压扁弧（读作正在往下砸）
      poly(g, sectorPts(x, y - 3, 13 + 2 * p, 19 + 2 * p, Math.PI * 1.12, Math.PI * 1.88, 10), col.edge, a * 0.6);
      poly(g, sectorPts(x, y - 3, 14 + 2 * p, 17.5 + 2 * p, Math.PI * 1.18, Math.PI * 1.82, 10), col.accent, a * 0.75);
      // 速度线：两条竖直短块
      rects(g, [
        [rnd(x - 9), rnd(y - 15 - 3 * p), 2, 7],
        [rnd(x + 7), rnd(y - 14 - 4 * p), 2, 6],
      ], col.body, a * 0.7);
    },
    trailFx(g, c, col) {
      drawTrail(g, c, col, { max: 7, farW: 2.4, nearW: 7.4, style: 'rubble', sway: 0.6 });
    },
    cast(g, c, col) {
      const a = fade(c.k);
      const p = rise(c.k, 0.55);
      // 地面预警环（压扁，和命中同一套变形语言）
      ring3(g, c.x, c.y, 8 + 17 * p, 3.6, col, a * 0.85, { squash: 0.42, seg: 20 });
      poly(g, ringPts(c.x, c.y, 10 + 22 * p, 2.2, 0, 0.3, 20), col.accent, a * 0.5);
      // 锤影从上方压下：越晚越近越大
      const hy = c.y - (70 - 46 * p);
      const sc = 0.55 + 0.65 * p;
      shell(g, (s) => shape(c.x, hy, Math.PI / 2, [
        [-6 * s, -8 * s], [5.4 * s, -8 * s], [7.6 * s, -4.4 * s], [7.6 * s, 4.4 * s],
        [5.4 * s, 8 * s], [-6 * s, 8 * s], [-7.6 * s, 4.4 * s], [-7.6 * s, -4.4 * s],
      ].map((q) => [q[0] * sc, q[1] * sc])), col, a);
      // 锤头上沿亮棱（下压时朝上的那条边最亮）
      poly(g, shape(c.x, hy, Math.PI / 2, [
        [-5, -8], [4.6, -8], [3.4, -5.6], [-4, -5.6],
      ].map((q) => [q[0] * sc, q[1] * sc])), col.accent, a * 0.85);
      // 拖影：上方两道逐渐变淡的锤头轮廓（下压速度感）
      for (let i = 0; i < 2; i++) {
        poly(g, shape(c.x, hy - (10 + i * 9), Math.PI / 2, [
          [-6, -8], [5.4, -8], [7.6, -4.4], [7.6, 4.4], [5.4, 8], [-6, 8], [-7.6, 4.4], [-7.6, -4.4],
        ].map((q) => [q[0] * sc * 0.9, q[1] * sc * 0.9])), col.accent, a * (0.4 - i * 0.15));
      }
      // 下落速度线
      rects(g, [
        [rnd(c.x - 12), rnd(hy - 22), 2, 10],
        [rnd(c.x + 10), rnd(hy - 20), 2, 8],
      ], col.body, a * 0.55);
    },
    impact(g, c, col) {
      const a = fade(c.k);
      const fl = peak(c.k, 0.14);
      const R = c.radius;
      const spread = R * (1.05 + 0.55 * rise(c.k, 0.55)); // 1.05R → 1.6R，外圈封顶 ~2.3R
      // ---- 签名：横向压扁的冲击环（squash 0.45，粗 7.5px）----
      ring3(g, c.x, c.y, spread, 7.5, col, a, { squash: 0.45, seg: 26 });
      // 第二、第三圈更扁更宽，读作连续冲击波
      poly(g, ringPts(c.x, c.y, spread * 1.22, 5, 0, 0.4, 26), col.body, a * 0.7);
      poly(g, ringPts(c.x, c.y, spread * 1.46, 2.6, 0, 0.33, 24), col.accent, a * 0.45);
      // ---- 砸出来的扁坑（地面被压陷的深色横缝）----
      poly(g, shape(c.x, c.y, 0, [
        [-R * 0.62, 0], [-R * 0.34, -R * 0.14], [0, -R * 0.05], [R * 0.4, -R * 0.12], [R * 0.62, 0],
        [R * 0.34, R * 0.13], [-R * 0.34, R * 0.12],
      ]), col.edge, a * 0.85);
      // ---- 竖直光柱：从命中点向上冲（2.05R），底宽顶收 ----
      const top = R * 2.05;
      poly(g, shape(c.x, c.y, 0, [[-10, 6], [-13, -top * 0.82], [0, -top], [13, -top * 0.82], [10, 6]]), col.edge, a * 0.7);
      poly(g, shape(c.x, c.y, 0, [[-7, 4], [-9.5, -top * 0.8], [0, -top * 0.94], [9.5, -top * 0.8], [7, 4]]), col.body, a * 0.9);
      poly(g, shape(c.x, c.y, 0, [[-3, 0], [-4.4, -top * 0.74], [0, -top * 0.86], [4.4, -top * 0.74], [3, 0]]), col.core, a * 0.95);
      // 光柱根部被压开的气流楔
      poly(g, shape(c.x, c.y, 0, [[-12, 2], [-R * 0.5, -R * 0.46], [-R * 0.66, -R * 0.06]]), col.body, a * 0.5);
      poly(g, shape(c.x, c.y, 0, [[12, 2], [R * 0.5, -R * 0.46], [R * 0.66, -R * 0.06]]), col.body, a * 0.5);
      // ---- 地面十字裂（暗边 + 亮芯）----
      band(g, boltPts(c.x - R * 1.5, c.y + R * 0.06, c.x - R * 0.2, c.y - R * 0.02, 31, 2.6, 4), 5.4, 2, col.edge, a * 0.95);
      band(g, boltPts(c.x + R * 0.1, c.y + R * 0.04, c.x + R * 1.45, c.y - R * 0.04, 37, 2.6, 4), 5.4, 2, col.edge, a * 0.95);
      band(g, boltPts(c.x, c.y, c.x + R * 0.12, c.y + R * 0.95, 41, 2.4, 4), 4.2, 1.6, col.edge, a * 0.85);
      band(g, boltPts(c.x - R * 1.35, c.y + R * 0.05, c.x - R * 0.3, c.y, 43, 1.6, 4), 1.8, 1, col.core, a * 0.7);
      band(g, boltPts(c.x + R * 0.15, c.y + R * 0.03, c.x + R * 1.3, c.y, 47, 1.6, 4), 1.8, 1, col.core, a * 0.7);
      // ---- 溅起的碎石 + 扬尘 ----
      blocks(g, scatterPts(c.x, c.y, 10, 9, R * 0.75, R * 1.7), col.body, a * 0.9, 4);
      blocks(g, scatterPts(c.x, c.y, 7, 13, R * 1.05, R * 2.0), col.accent, a * 0.7, 3);
      blocks(g, scatterPts(c.x, c.y, 8, 17, R * 1.4, R * 2.2), C.mute, a * 0.35, 3);
      // ---- 砸落前段：一柄锤头从上方压下来（k<0.28 才看得见），补足「锤」的读感 ----
      if (c.k < 0.28) {
        const fall = 1 - c.k / 0.28;                       // 1=最高 0=贴地
        const hy = c.y - R * (2.4 * fall) - R * 0.35;
        const hw = R * 0.52;
        const hh = R * 0.3;
        poly(g, rectPts(c.x - hw, hy - hh, hw * 2, hh * 2), col.edge, a * 0.95);
        poly(g, rectPts(c.x - hw * 0.86, hy - hh * 0.82, hw * 1.72, hh * 1.64), col.body, a);
        poly(g, rectPts(c.x - hw * 0.5, hy - hh * 0.5, hw, hh), col.core, a * 0.9);
        // 短柄
        poly(g, rectPts(c.x - hw * 0.16, hy + hh * 0.9, hw * 0.32, R * 0.5), col.edge, a * 0.9);
        poly(g, rectPts(c.x - hw * 0.1, hy + hh * 0.9, hw * 0.2, R * 0.48), col.body, a * 0.85);
      }
      // ---- 白闪（k 前 14%）：中心十字 + 小块 ----
      if (fl > 0.02) {
        const fr = 4 + 0.07 * R;
        poly(g, starPts(c.x, c.y, 0, fr * (0.7 + 0.8 * fl), fr * 0.3, 4), C.white, fl);
        blocks(g, [{ x: c.x, y: c.y }], C.white, fl, 8);
      }
      // ---- 余韵（k>0.6）：更扁的残环 + 环形焦痕点 ----
      poly(g, ringPts(c.x, c.y, spread * 1.6, 2.8, 0, 0.2, 24), col.edge, a * 0.4);
      dots(g, ringDots(c.x, c.y, spread * 1.1, 12, 0, 0.45), col.core, a * 0.45);
    },
    ward(g, c, col) {
      const a = fade(c.k);
      const R = Math.max(6, c.radius);
      const rot = c.clock / 900;
      // 压扁的护盾环带（和命中同一种变形语言）
      ring3(g, c.x, c.y, R * 0.8, 4.2, col, a * 0.85, { phase: rot, squash: 0.62, seg: 24 });
      // 6 颗锤头形盾块绕环
      for (let i = 0; i < 6; i++) {
        const ang = rot + (i / 6) * TAU;
        const px = c.x + Math.cos(ang) * R * 0.8;
        const py = c.y + Math.sin(ang) * R * 0.8 * 0.62;
        poly(g, shape(px, py, ang + Math.PI / 2, [[-5, -6], [5, -6], [5, 6], [-5, 6]]), col.body, a * 0.92);
        poly(g, shape(px, py, ang + Math.PI / 2, [[-5, -6], [5, -6], [3, -3], [-4, -3]]), col.accent, a * 0.7);
        blocks(g, [{ x: px, y: py }], col.core, a * 0.9, 3);
      }
      dots(g, ringDots(c.x, c.y, R * 0.55, 8, -rot, 0.62), col.accent, a * 0.6);
    },
    link(g, c, col) {
      const a = (1 - c.k) * 0.95;
      const pts = lineDots(c.from.x, c.from.y, c.to.x, c.to.y, 5);
      // 丝带中段被锤的重量压弯
      const sag = pts.map((p, i) => ({ x: p.x, y: p.y + Math.sin((i / (pts.length - 1)) * Math.PI) * 5 }));
      band3(g, sag, 4, 7, col, a, 3);
      // 节拍块：从中点流向落点
      blocks(g, sag.slice(1, 4), col.core, a * 0.85, 3);
      // 落点锤印
      poly(g, hexPts(c.to.x, c.to.y, 8, c.clock / 400), col.accent, a * 0.9);
      blocks(g, [c.to], C.white, a, 4);
    },
  },

  // ------------------------------------------------------------------
  // 地裂之颚：地面张嘴。上下两排「整条连续锯齿多边形」夹一道裂口，牙数随半径加密。
  // 硬约束：R=20 → 多边形≥6、最大顶点≥9；R=80 → 最大顶点≥40 且大于 R=20。牙数 = clamp(round(R/3.2),7,26)。
  // ------------------------------------------------------------------
  quake_maw: {
    silhouette: 'toothed-maw',
    trail: { max: 8, style: 'rubble' },
    colors: { edge: C.outline, body: 0xcc9c6c, core: 0xffe0b0, accent: 0xe4dcc4 },
    opBudget: 110,
    projectile(g, c, col) {
      const { x, y, angle, clock } = c;
      const a = 1 - c.k * 0.12;
      const n = 5;
      const halfLen = 12;
      const open = 0.55 + 0.45 * pulse(clock, 460); // 微微开合（clock 只改相位）
      const gap = 1.6 + 1.5 * open;
      const depth = 2.6;
      const jawH = 2.2;
      // 上牙床 / 下牙床：各是一整条连续多边形
      shell(g, (s) => shape(x, y, angle, toothRow(halfLen * s, n, -gap * s, -(gap + depth) * s, -(gap + depth + jawH) * s, 3)), col, a);
      shell(g, (s) => shape(x, y, angle, toothRow(halfLen * s, n, gap * s, (gap + depth) * s, (gap + depth + jawH) * s, 3)), col, a);
      // 中间的暗色裂口
      poly(g, shape(x, y, angle, [[-halfLen * 0.94, -gap], [halfLen * 0.94, -gap], [halfLen * 0.94, gap], [-halfLen * 0.94, gap]]), col.edge, a * 0.9);
      // 牙尖骨白 + 后方碎石点
      dots(g, shape(x, y, angle, [[0, -gap], [-halfLen * 0.45, -gap * 0.9], [halfLen * 0.45, -gap * 0.9], [0, gap], [-halfLen * 0.45, gap * 0.9], [halfLen * 0.45, gap * 0.9]]), col.accent, a * 0.85);
      blocks(g, shape(x, y, angle, [[-halfLen - 4, -3], [-halfLen - 6, 2]]), col.accent, a * 0.55, 2);
    },
    trailFx(g, c, col) {
      drawTrail(g, c, col, { max: 8, farW: 2.8, nearW: 7.8, style: 'rubble', driftY: 2 });
    },
    cast(g, c, col) {
      const a = fade(c.k);
      const p = rise(c.k, 0.5);
      // 贴地的压扁预警环（两道）
      ring3(g, c.x, c.y, 7 + 16 * p, 3.4, col, a * 0.85, { squash: 0.42, seg: 20 });
      poly(g, ringPts(c.x, c.y, 12 + 20 * p, 2.4, 0, 0.3, 20), col.accent, a * 0.5);
      // 裂口先开：一条细长暗缝向外拉开
      const halfLen = 7 + 20 * p;
      poly(g, shape(c.x, c.y, 0, [[-halfLen, -2.4], [halfLen, -2.4], [halfLen, 2.4], [-halfLen, 2.4]]), col.edge, a * 0.9);
      // 上下牙从地里冒出来（和命中同一种连续锯齿）
      const n = teethFor(c.radius);
      const gap = 1 + 4.5 * p;
      poly(g, shape(c.x, c.y, 0, toothRow(halfLen * 0.82, n, -gap, -gap - 3.2, -gap - 5.4, 4)), col.body, a * 0.95);
      poly(g, shape(c.x, c.y, 0, toothRow(halfLen * 0.82, n, gap, gap + 3.2, gap + 5.4, 4)), col.body, a * 0.95);
      // 牙尖骨白
      poly(g, shape(c.x, c.y, 0, toothRow(halfLen * 0.82, n, -gap * 0.92, -gap * 0.92 - 1.4, -gap - 2.2, 4)), col.accent, a * 0.75);
      // 碎石从缝里往上蹦
      blocks(g, scatterPts(c.x, c.y, 6, 4, 4, 10 + 12 * p), col.accent, a * 0.85, 2);
    },
    impact(g, c, col) {
      // 俯视角的「地面张嘴」：一圈岩齿咬住一个不规则黑腔，牙朝内、外圈崩裂、碎石飞出。
      // 不做上下两排横牙——那种画法在俯视战场里会读成「一道栅栏」。
      const a = fade(c.k);
      const fl = peak(c.k, 0.15);
      const R = c.radius;
      const seed = Math.floor(c.clock / 90);
      const bite = rise(c.k, 0.45);                       // 咬合进度
      const rOut = R * (0.72 + 0.5 * rise(c.k, 0.55));     // 外轮廓 0.72R → 1.22R
      const rCav = rOut * (0.62 - 0.14 * bite);            // 黑腔随咬合收窄
      const teeth = Math.max(8, Math.min(14, Math.round(rOut / 3.0)));
      // 1) 外圈：一整条连续锯齿（牙朝外，越大越密）
      const rim = [];
      for (let i = 0; i < teeth; i++) {
        const ang = (i / teeth) * TAU;
        const k1 = i % 2 === 0 ? 1.2 : 0.94;
        const j = k1 * (0.9 + hash01(seed + i * 7) * 0.22);
        rim.push(offset(c.x, c.y, ang, rOut * j, 0));
      }
      poly(g, rim, col.edge, a * 0.95);
      // 2) 岩边（比外圈小一圈的岩色，形成「外暗内亮」的硬边）
      const rim2 = [];
      for (let i = 0; i < teeth; i++) {
        const ang = (i / teeth) * TAU;
        const k1 = i % 2 === 0 ? 1.12 : 0.9;
        rim2.push(offset(c.x, c.y, ang, rOut * 0.9 * k1, 0));
      }
      poly(g, rim2, col.body, a * 0.95);
      // 3) 黑腔：开口本身（不规则椭圆），深到看不见底
      const cav = [];
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * TAU;
        const j = 0.9 + hash01(seed + 50 + i * 3) * 0.2;
        cav.push(offset(c.x, c.y, ang, rCav * j, 0));
      }
      poly(g, cav, C.void, a * 0.96);
      // 4) 牙：从岩边朝内咬合的三角齿（交替长短），这是「嘴」的读感来源
      for (let i = 0; i < teeth; i++) {
        const ang = (i / teeth) * TAU;
        const base = offset(c.x, c.y, ang, rOut * 0.88, 0);
        const len = rOut * (i % 2 === 0 ? 0.42 : 0.3) * (0.6 + 0.4 * bite);
        poly(g, spikePts(base.x, base.y, ang + Math.PI, len, Math.max(2, rOut * 0.09), 0.5), col.body, a * 0.95);
        // 亮芯隔一颗画一次：省一半指令，牙仍然看得清
        if (i % 2 === 0) poly(g, spikePts(base.x, base.y, ang + Math.PI, len * 0.55, Math.max(1.5, rOut * 0.045), 0.5), col.core, a * 0.75);
      }
      // 5) 腔底一道亮岩缝（不闪白，避免读成「星星」）
      poly(g, shape(c.x, c.y, c.clock / 900, [[-rCav * 0.5, 0], [0, -rCav * 0.22], [rCav * 0.5, 0], [0, rCav * 0.22]]), col.accent, a * 0.5);
      if (fl > 0.02) {
        // 命中瞬间：腔口炸出一道白热缝 + 小亮点，不是星形
        rects(g, [[rnd(c.x - rOut * 0.45), rnd(c.y - 2), rnd(rOut * 0.9), 4]], C.white, fl * 0.85);
        blocks(g, [{ x: c.x, y: c.y }], C.white, fl, 5);
      }
      // 6) 放射状地裂：从外圈朝外崩（越远越细）
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * TAU + 0.4 + hashSym(seed + i * 11) * 0.2;
        const s0 = offset(c.x, c.y, ang, rOut * 0.92, 0);
        const s1 = offset(c.x, c.y, ang + 0.12, rOut * (1.35 + hash01(seed + i * 5) * 0.3), 0);
        band(g, boltPts(s0.x, s0.y, s1.x, s1.y, seed + i * 17 + 3, rOut * 0.07, 4), Math.max(2, rOut * 0.1), 1.2, col.edge, a * 0.8);
      }
      // 7) 碎石 + 地尘
      blocks(g, scatterPts(c.x, c.y, 9, 11, rOut * 0.97, rOut * 1.4), col.body, a * 0.9, 3);
      blocks(g, scatterPts(c.x, c.y, 7, 23, rOut * 1.05, rOut * 1.5), col.accent, a * 0.6, 2);
      dots(g, scatterPts(c.x, c.y, 10, 31, rOut * 1.0, rOut * 1.55), C.mute, a * 0.45);
      // 8) 余韵：咬合后的暗环 + 牙尖碎屑
      poly(g, ringPts(c.x, c.y, rOut * 0.95, 2.2, 0, 0.22, 14), col.edge, a * 0.45);
      dots(g, ringDots(c.x, c.y, rOut * 0.86, teeth, 0, 0.2), col.core, a * 0.4);
    },
    ward(g, c, col) {
      const a = fade(c.k);
      const R = Math.max(6, c.radius);
      const rot = c.clock / 900;
      // 压扁的岩环（贴地）
      ring3(g, c.x, c.y, R * 0.84, 4, col, a * 0.85, { phase: rot, squash: 0.62, seg: 24 });
      // 8 颗石牙绕环（朝外）
      for (let i = 0; i < 8; i++) {
        const ang = rot + (i / 8) * TAU;
        const px = c.x + Math.cos(ang) * R * 0.84;
        const py = c.y + Math.sin(ang) * R * 0.84 * 0.62;
        poly(g, spikePts(px, py, ang, 9 + (i % 2) * 3, 4), col.body, a * 0.95);
        poly(g, spikePts(px, py, ang, 5 + (i % 2) * 1.5, 1.9), col.core, a * 0.9);
      }
      dots(g, ringDots(c.x, c.y, R * 0.58, 6, -rot, 0.62), col.accent, a * 0.7);
    },
    link(g, c, col) {
      const a = (1 - c.k) * 0.95;
      const ang = Math.atan2(c.to.y - c.from.y, c.to.x - c.from.x);
      const pts = lineDots(c.from.x, c.from.y, c.to.x, c.to.y, 5);
      band3(g, pts, 4, 7, col, a, 3);
      // 碎石节拍块沿连线滚向落点
      blocks(g, pts.slice(1, 4), col.accent, a * 0.85, 3);
      // 落点小牙环（沿连线方向张开）
      poly(g, shape(c.to.x, c.to.y, ang, toothRow(11, 7, -3.5, -6.5, -8.5, 2)), col.body, a * 0.92);
      poly(g, shape(c.to.x, c.to.y, ang, toothRow(11, 7, 3.5, 6.5, 8.5, 2)), col.body, a * 0.92);
      blocks(g, [c.to], C.white, a, 3);
    },
  },
};
