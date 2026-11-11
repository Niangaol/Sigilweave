// 火 / 天体四法术（v2 大胆版）
//   flame_burst     烈焰喷涌 —— 动作：火柱上窜（三瓣火舌 + 地面火口 + 3 段窜升火柱 + 焦痕）
//   ember_fan       余烬扇   —— 动作：扇形张开（9 片羽毛扇 + 9 片扇面张开 + 弧形焦痕）
//   starfall        星陨     —— 动作：斜坠星痕（自转五角星 + 星形爆 + 内圈小星环 + 落点警示环）
//   meteor_judgment 陨星裁决 —— 动作：坠落冲击（岩石 + 冲击波双环 + 陨坑 + 尘埃柱 + 碎石）
// 只用 kit 的笔刷（fillStyle + fillPoints/fillRect 封装的 poly/dots/blocks/rects/shell/band/band3/ring3）。
// 顶点一律交给 poly 取整；alpha 由 fade/peak 夹紧；clock 只改相位，不改绘制结构。
import { C } from '../../Palette.js';
import {
  poly, dots, blocks, rects, shell, band, band3, ringPts, ring3, sectorPts, spikePts,
  blobPts, starPts, offset, lineDots, ringDots, scatterPts, drawTrail,
  peak, rise, fade, pulse, hash01, hashSym, TAU,
} from '../kit.js';

// 地面视感的压扁团块：把 blobPts 的 y 分量按 squash 压扁（陨坑 / 火口 / 焦痕底色）
function flatBlob(cx, cy, rad, seed, squash, lobes = 10, wob = 0.28, spin = 0) {
  const pts = blobPts(cx, cy, rad, seed, lobes, wob, spin);
  for (let i = 0; i < pts.length; i++) pts[i] = { x: pts[i].x, y: cy + (pts[i].y - cy) * squash };
  return pts;
}

// 地面视感的压扁扇弧：sectorPts 的 y 分量按 squash 压扁（弧形焦痕 / 地面余温）
function flatSector(cx, cy, r0, r1, a0, a1, squash, seg = 14) {
  const pts = sectorPts(cx, cy, r0, r1, a0, a1, seg);
  for (let i = 0; i < pts.length; i++) pts[i] = { x: pts[i].x, y: cy + (pts[i].y - cy) * squash };
  return pts;
}

// 竖直窜升火柱的中心线：底 → 顶，越往上摆得越松（交给 band3 做底粗顶细的锥形体积）
function columnPath(cx, baseY, height, lean, clock) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const u = i / 5;
    const sway = Math.sin(u * 4.2 + clock / 300) * (0.35 + u) * 2.6;
    pts.push({ x: cx + lean * height * 0.2 * u * u + sway, y: baseY - height * u });
  }
  return pts;
}

export const hot = {
  // ------------------------------------------------------------------
  // 烈焰喷涌：火柱上窜。三瓣粗根火舌 + 上飘火焰尾；命中是「地面火口 + 三段窜升火柱 + 焦痕」。
  // ------------------------------------------------------------------
  flame_burst: {
    silhouette: 'fire-column',
    trail: { max: 7, style: 'ember' },
    colors: { edge: C.outline, body: 0xff7a3c, core: 0xfff0cf, accent: 0xffb43a },
    opBudget: 86,
    projectile(g, c, col) {
      const { x, y, angle, clock } = c;
      const a = 1 - c.k * 0.12;
      const flick = pulse(clock, 360);
      // 主火团：不规则团块三层（暗边 / 橙本体 / 白热芯）
      shell(g, (s) => blobPts(x, y, 9.5 * s, 31, 9, 0.26, clock / 700), col, a);
      // 三瓣火舌：中间朝前、两瓣张开 ±0.62；基部半宽 5.6（≈11px 的粗根）
      for (let i = 0; i < 3; i++) {
        const ang = angle + (i - 1) * 0.62;
        const len = (14.5 - Math.abs(i - 1) * 2.4) * (0.88 + 0.22 * flick);
        const root = offset(x, y, ang, 2.4, 0);
        poly(g, spikePts(root.x, root.y, ang, len, 5.6, 0.55), i === 1 ? col.accent : col.body, a * 0.95);
        poly(g, spikePts(root.x, root.y, ang, len * 0.56, 2.5, 0.5), col.core, a * 0.9);
      }
      // 舌根之间的漏光（补满剪影，别让三瓣之间空掉）
      poly(g, blobPts(x, y, 7.2, 37, 8, 0.3, -clock / 900), col.accent, a * 0.55);
      // 上飘火星 + 白热点
      const up = [
        offset(x, y, angle + Math.PI, 9.5, -6 - 3 * flick),
        offset(x, y, angle + Math.PI, 12.5, -11 - 4 * flick),
        offset(x, y, angle + Math.PI, 6, -12 - 2 * flick),
      ];
      dots(g, up, col.accent, a * 0.85);
      blocks(g, [{ x, y }], C.white, a, 3);
    },
    trailFx(g, c, col) {
      // ember：丝带 + 尾部上飘火星（driftY / swayUp 让尾巴整体抬起来）
      drawTrail(g, c, col, { max: 7, farW: 2.2, nearW: 8.5, style: 'ember', sway: 2.4, swayUp: 1.8, driftY: -5 });
    },
    cast(g, c, col) {
      const a = fade(c.k);
      const p = rise(c.k, 0.5);
      // 脚下先裂开一道火口：暗色压扁多边形 + 椭圆环
      poly(g, flatBlob(c.x, c.y + 1, 8 + 7 * p, 41, 0.42), col.edge, a * 0.85);
      ring3(g, c.x, c.y + 1, 4 + 13 * p, 3.4, col, a * 0.9, { squash: 0.42 });
      poly(g, ringPts(c.x, c.y + 1, 2 + 7 * p, 2, -c.clock / 400, 0.42, 18), col.accent, a * 0.75);
      // 3 道火苗自下而上窜起，高度随起手进程长大
      for (let i = 0; i < 3; i++) {
        const side = i - 1;
        const dx = side * (4.5 + 4 * p);
        const h = (11 + 26 * p) * (1 - Math.abs(side) * 0.16);
        band3(g, columnPath(c.x + dx, c.y + 1, h, side, c.clock), 6 + 3 * p, 2, col, a * 0.92);
        // 顶端翻卷的火舌尖
        poly(g, spikePts(c.x + dx + side * 2, c.y + 1 - h, -Math.PI * 0.5 + side * 0.9, 6 + 5 * p, 2.2, 0.6), col.accent, a * 0.9);
        poly(g, spikePts(c.x + dx + side * 2, c.y + 1 - h * 0.82, -Math.PI * 0.5 - side * 0.7, 4 + 3 * p, 1.4, 0.5), col.core, a * 0.85);
      }
      // 火口上浮现的余烬
      dots(g, ringDots(c.x, c.y + 1, 7 + 9 * p, 6, c.clock / 300, 0.42), col.accent, a * 0.6);
    },
    impact(g, c, col) {
      const a = fade(c.k);
      const fl = peak(c.k, 0.15);
      const R = c.radius;
      const rot = c.clock / 700;
      const grow = R * (1.0 + 1.02 * rise(c.k, 0.62));      // 1.0R → 2.0R
      const baseY = c.y + R * 0.14;                          // 地面线
      // —— 地面层：火口阴影 + 横向焦痕短条（余韵靠它们撑住） ——
      poly(g, flatBlob(c.x, baseY, grow * 0.8, 41, 0.4, 12, 0.26), col.edge, a * 0.8);
      rects(g, [
        [c.x - R * 1.25, baseY + R * 0.1, R * 0.85, 2],
        [c.x + R * 0.15, baseY + R * 0.16, R * 1.0, 2],
        [c.x - R * 0.5, baseY + R * 0.32, R * 0.7, 1],
        [c.x + R * 0.55, baseY + R * 0.36, R * 0.5, 1],
      ], col.edge, a * 0.7);
      // —— 地面火口：横向压扁的椭圆环（粗环带 + 亮内环 + 熔池） ——
      ring3(g, c.x, baseY, grow * 0.86, 4.8, col, a * 0.95, { squash: 0.42, phase: rot * 0.4 });
      poly(g, ringPts(c.x, baseY, grow * 0.56, 2.4, -rot * 0.7, 0.42, 20), col.accent, a * 0.85);
      poly(g, flatBlob(c.x, baseY, grow * 0.36, 43, 0.4, 12, 0.3, rot), col.accent, a * 0.75);
      poly(g, flatBlob(c.x, baseY, grow * 0.16, 45, 0.4, 8, 0.3, -rot), col.core, a * 0.7);
      // —— 3 段窜升火柱：中心 2.2R / 两侧 1.9R，横向错开 ——
      for (let i = 0; i < 3; i++) {
        const side = i - 1;
        const dx = side * R * 0.44;
        const hgt = R * (3.0 - Math.abs(side) * 0.4);
        // 柱身：底粗顶细的锥形实体带（暗边 / 橙 / 白热芯）
        band3(g, columnPath(c.x + dx, baseY, hgt, side, c.clock), R * 0.52, Math.max(3, R * 0.2), col, a * 0.95);
        // 中段鼓起的火团：读作「喷」而不是「线」
        poly(g, blobPts(c.x + dx + side * 2.2, baseY - hgt * 0.42, R * 0.27, 51 + i * 7, 8, 0.3, rot + i), col.body, a * 0.92);
        poly(g, blobPts(c.x + dx + side * 2.2, baseY - hgt * 0.42, R * 0.14, 53 + i * 7, 7, 0.3, -rot - i), col.core, a * 0.8);
        // 顶部翻卷火舌：两根朝外卷
        poly(g, spikePts(c.x + dx, baseY - hgt * 0.9, -Math.PI * 0.5 + side * 0.55, R * 0.34, Math.max(2, R * 0.1), 0.65), col.accent, a * 0.9);
        poly(g, spikePts(c.x + dx, baseY - hgt * 0.78, -Math.PI * 0.5 - side * 0.8, R * 0.26, Math.max(1.6, R * 0.07), 0.6), col.body, a * 0.9);
      }
      // 火柱之间横向舔出的短舌（补满剪影）
      for (let i = 0; i < 2; i++) {
        const dir = i ? 1 : -1;
        poly(g, spikePts(c.x + dir * R * 0.18, baseY - R * 0.2, dir > 0 ? -0.32 : Math.PI + 0.32, R * 0.95, Math.max(2, R * 0.12), 0.55), col.accent, a * 0.8);
      }
      // —— 命中瞬间：中心白闪 + 白热柱核 ——
      if (fl > 0.02) {
        // 中心白热团（收在火口上方，别盖掉三段火柱）
        poly(g, blobPts(c.x, baseY - R * 0.4, R * 0.22 + 3 * fl, 47, 9, 0.26, rot), col.core, fl * 0.9);
        // 中心 4~6px 白闪：这是「打到了」的读感来源
        blocks(g, [{ x: c.x, y: baseY - R * 0.26 }], C.white, fl, 6);
        // 一根白热柱芯
        poly(g, spikePts(c.x, baseY - R * 0.1, -Math.PI * 0.5, R * (0.5 + 0.3 * fl), Math.max(2, R * 0.09), 0.6), C.white, fl * 0.8);
      }
      // —— 余韵：上飘火星 + 地面余烬 + 外圈残环 ——
      dots(g, ringDots(c.x, baseY - R * 0.5, R * 0.9, 7, rot), col.accent, a * 0.6);
      blocks(g, [
        { x: c.x - R * 0.9, y: baseY + R * 0.24 }, { x: c.x + R * 0.7, y: baseY + R * 0.2 },
        { x: c.x + R * 1.15, y: baseY + R * 0.32 }, { x: c.x - R * 1.3, y: baseY + R * 0.36 },
      ], col.body, a * 0.55, 2);
      poly(g, ringPts(c.x, baseY, grow * 1.15, 1.8, rot * 0.5, 0.42, 18), col.edge, a * 0.5);
    },
    ward(g, c, col) {
      const a = fade(c.k);
      const R = Math.max(6, c.radius);
      const rot = c.clock / 620;
      // 内外双环反向
      ring3(g, c.x, c.y, R * 0.9, 3.4, col, a * 0.8, { phase: rot });
      poly(g, ringPts(c.x, c.y, R * 0.68, 2.2, -rot * 1.5, 1, 20), col.accent, a * 0.85);
      // 6 束火苗绕轴转，尖端朝外
      for (let i = 0; i < 6; i++) {
        const ang = rot + (i / 6) * TAU;
        const q = offset(c.x, c.y, ang, R * 0.9, 0);
        poly(g, spikePts(q.x, q.y, ang, 9 + (i % 2) * 2, 4.4, 0.6), i % 2 ? col.accent : col.body, a * 0.95);
        poly(g, spikePts(q.x, q.y, ang, 5, 1.9, 0.5), col.core, a * 0.9);
      }
      // 内圈火种 + 上升余烬
      dots(g, ringDots(c.x, c.y, R * 0.44, 6, -rot), col.core, a * 0.7);
      dots(g, ringDots(c.x, c.y - R * 0.1, R * 1.06, 5, rot * 1.3), col.accent, a * 0.5);
    },
    link(g, c, col) {
      const a = (1 - c.k) * 0.95;
      const pts = lineDots(c.from.x, c.from.y, c.to.x, c.to.y, 7);
      band3(g, pts, 2.4, 5.4, col, a);
      // 沿线上飘的节拍火苗
      const up = [];
      for (let i = 1; i < pts.length; i += 2) up.push({ x: pts[i].x, y: pts[i].y - 3 - (i % 3) });
      blocks(g, up, col.accent, a * 0.9, 2);
      poly(g, blobPts(c.to.x, c.to.y, 5.5, 13, 8, 0.25, c.clock / 500), col.core, a * 0.9);
      dots(g, [pts[0], pts[3]], col.accent, a * 0.7);
    },
  },

  // ------------------------------------------------------------------
  // 余烬扇：扇形张开。9 片羽毛状火舌随呼吸开合；命中是 9 片扇面从中心张开、片间留缝、
  // 地面留一道弧形焦痕 —— 剪影一眼能数出片数。
  // ------------------------------------------------------------------
  ember_fan: {
    silhouette: 'ember-fan-nine',
    trail: { max: 7, style: 'ember' },
    colors: { edge: C.outline, body: 0xff8a4d, core: 0xffdca8, accent: 0xffc04a },
    opBudget: 98,
    projectile(g, c, col) {
      const { x, y, angle, clock } = c;
      const a = 1 - c.k * 0.12;
      const open = 1.5 + 0.3 * pulse(clock, 460);           // 扇面开合 1.5 ~ 1.8 rad
      // 扇心小核（三层）
      shell(g, (s) => blobPts(x, y, 6.5 * s, 61, 8, 0.24, clock / 800), col, a);
      // 9 片羽状火舌：中心最长，向两侧递减
      for (let i = 0; i < 9; i++) {
        const u = i / 8 - 0.5;
        const ang = angle + u * open;
        const len = (14 - Math.abs(u) * 3) * (1 - c.k * 0.1);
        const root = offset(x, y, ang, 2, 0);
        poly(g, spikePts(root.x, root.y, ang, len, 2.6, 0.62), col.body, a * 0.95);
        poly(g, spikePts(root.x, root.y, ang, len * 0.6, 1.2, 0.5), col.core, a * 0.9);
      }
      // 扇缘余烬
      dots(g, [offset(x, y, angle - open * 0.5, 16, 0), offset(x, y, angle + open * 0.5, 16, 0)], col.accent, a * 0.8);
      blocks(g, [{ x, y }], C.white, a, 3);
    },
    trailFx(g, c, col) {
      drawTrail(g, c, col, { max: 7, farW: 2, nearW: 7.5, style: 'ember', sway: 2.6, swayUp: 1.4, driftY: -3 });
    },
    cast(g, c, col) {
      const a = fade(c.k);
      const p = rise(c.k, 0.52);
      const rot = c.clock / 520;
      const span = 1.4 + 0.6 * p;
      // 张开中的扇弧：一道粗底弧 + 一道外沿亮弧
      poly(g, sectorPts(c.x, c.y, 3 + 5 * p, 5 + 7 * p, c.angle - span, c.angle + span, 12), col.body, a * 0.85);
      poly(g, sectorPts(c.x, c.y, 9 + 11 * p, 10 + 12 * p, c.angle - span * 0.9, c.angle + span * 0.9, 12), col.accent, a * 0.6);
      // 9 根扇骨依次立起
      for (let i = 0; i < 9; i++) {
        const u = i / 8 - 0.5;
        const ang = c.angle + u * span;
        poly(g, spikePts(c.x, c.y, ang, 6 + 10 * p, 2.6, 0.55), col.body, a * 0.9);
        poly(g, spikePts(c.x, c.y, ang, (6 + 10 * p) * 0.5, 1.2, 0.5), col.core, a * 0.85);
      }
      // 扇心余烬
      dots(g, ringDots(c.x, c.y, 5 + 9 * p, 6, rot), col.accent, a * 0.6);
    },
    impact(g, c, col) {
      const a = fade(c.k);
      const fl = peak(c.k, 0.16);
      const R = c.radius;
      const rot = c.clock / 260;
      const grow = R * (0.85 + 1.1 * rise(c.k, 0.62));       // 0.85R → 1.95R
      const span = 3.15;                                     // 约 180° 的扇面
      const base = c.angle - span * 0.5;
      // —— 地面弧形焦痕：贴着扇面外沿的一道弧 ——
      const gy = c.y + R * 0.22;
      poly(g, flatSector(c.x, gy, grow * 1.02, grow * 1.5, base, base + span, 0.36, 16), col.edge, a * 0.8);
      poly(g, flatSector(c.x, gy, grow * 1.14, grow * 1.3, base, base + span, 0.36, 16), col.accent, a * 0.4);
      // —— 9 片扇面张开：每片单独抖动、片间留缝 ——
      for (let i = 0; i < 9; i++) {
        const jit = hashSym(i * 7 + 3) * 0.05;
        const jit2 = hash01(i * 13 + 5);
        const a0 = base + (i / 9) * span + 0.035 + jit;
        const a1 = base + ((i + 1) / 9) * span - 0.035 + jit;
        const r1 = grow * (1.6 + 0.22 * jit2 + 0.1 * Math.sin(rot + i));
        const r0 = grow * 0.16;
        poly(g, sectorPts(c.x, c.y, r0, r1, a0, a1, 6), col.edge, a * 0.8);
        poly(g, sectorPts(c.x, c.y, r0 + 2, r1 - 3, a0 + 0.012, a1 - 0.012, 6), col.body, a);
        poly(g, sectorPts(c.x, c.y, r0 + 5, r1 * 0.6, a0 + 0.024, a1 - 0.024, 5), col.core, a * 0.85);
        // 扇骨：每片中央一根外伸尖舌
        poly(g, spikePts(c.x, c.y, (a0 + a1) * 0.5, r1 * 1.03, Math.max(2, grow * 0.075), 0.5), col.accent, a * 0.9);
      }
      // —— 命中瞬间：扇心白闪 ——
      if (fl > 0.02) {
        poly(g, sectorPts(c.x, c.y, 0, grow * 0.36, base, base + span, 10), col.core, fl * 0.85);
        blocks(g, [{ x: c.x, y: c.y }], C.white, fl, 5);
      }
      // —— 余韵：飞散火星 + 地面余温弧 ——
      dots(g, scatterPts(c.x, c.y, 9, 9, grow * 0.9, grow * 1.66), col.accent, a * 0.6);
      blocks(g, ringDots(c.x, c.y + R * 0.2, grow * 1.05, 5, rot, 0.4), col.body, a * 0.55, 2);
      poly(g, flatSector(c.x, gy, grow * 1.52, grow * 1.62, base, base + span, 0.36, 16), col.edge, a * 0.4);
    },
    ward(g, c, col) {
      const a = fade(c.k);
      const R = Math.max(6, c.radius);
      const rot = c.clock / 560;
      ring3(g, c.x, c.y, R * 0.84, 3.2, col, a * 0.65, { phase: rot });
      poly(g, ringPts(c.x, c.y, R * 0.55, 2, -rot * 1.6, 1, 18), col.accent, a * 0.75);
      // 6 片火花歪着绕成环（不是均匀齿轮，读作余烬）
      for (let i = 0; i < 6; i++) {
        const ang = rot + (i / 6) * TAU;
        const q = offset(c.x, c.y, ang, R * 0.84, 0);
        poly(g, spikePts(q.x, q.y, ang - 0.28, 10, 3.4, 0.6), col.body, a * 0.95);
        poly(g, spikePts(q.x, q.y, ang - 0.28, 5.4, 1.5, 0.5), col.core, a * 0.9);
      }
      dots(g, ringDots(c.x, c.y, R * 0.42, 5, -rot), col.core, a * 0.6);
    },
    link(g, c, col) {
      const a = (1 - c.k) * 0.95;
      const pts = lineDots(c.from.x, c.from.y, c.to.x, c.to.y, 7);
      band3(g, pts, 2, 4.8, col, a);
      // 沿途张开的 3 片小扇骨（方向取自连线本身，不依赖 ctx.angle）
      const dir = Math.atan2(c.to.y - c.from.y, c.to.x - c.from.x);
      for (let i = 1; i < pts.length - 1; i += 3) {
        poly(g, spikePts(pts[i].x, pts[i].y, dir - 0.5, 5, 1.6, 0.5), col.accent, a * 0.85);
        poly(g, spikePts(pts[i].x, pts[i].y, dir + 0.5, 5, 1.6, 0.5), col.accent, a * 0.85);
      }
      poly(g, blobPts(c.to.x, c.to.y, 5, 19, 8, 0.25, c.clock / 460), col.core, a * 0.9);
      dots(g, [pts[0], pts[2]], col.accent, a * 0.7);
    },
  },

  // ------------------------------------------------------------------
  // 星陨：斜坠星痕。自转的五角星 + 星尘长尾；命中是大星 + 错位小星 + 内圈小星环 + 落点警示环。
  // ------------------------------------------------------------------
  starfall: {
    silhouette: 'star-dive',
    trail: { max: 7, style: 'star' },
    colors: { edge: C.outline, body: 0xffd79a, core: 0xfffdf2, accent: 0xffe98a },
    opBudget: 66,
    projectile(g, c, col) {
      const { x, y, angle, clock } = c;
      const a = 1 - c.k * 0.12;
      const spin = clock / 900;
      // 大五角星：三层体积（外径 13 ≥ 12），随 clock 自转
      shell(g, (s) => starPts(x, y, spin, 13 * s, 5.6 * s), col, a);
      // 反向错位的小星（转得比本体快，读作星尘翻卷）
      poly(g, starPts(x + 1, y - 1, -spin * 1.5, 6.4, 2.7), col.core, a * 0.9);
      // 斜坠星痕：身后 3 段渐短的光条
      for (let i = 0; i < 3; i++) {
        const back = offset(x, y, angle + Math.PI, 9 + i * 5, (i - 1) * 2.2);
        poly(g, spikePts(back.x, back.y, angle + Math.PI + (i - 1) * 0.18, 7 - i, 2.2 - i * 0.4, 0.4), col.accent, a * 0.75);
      }
      // 星尖亮屑 + 白核
      const tips = [];
      for (let i = 0; i < 5; i++) tips.push(offset(x, y, spin - Math.PI * 0.5 + (i / 5) * TAU, 15.5, 0));
      dots(g, tips, col.accent, a * 0.85);
      blocks(g, [{ x, y }], C.white, a, 3);
    },
    trailFx(g, c, col) {
      drawTrail(g, c, col, { max: 7, farW: 1.8, nearW: 7, style: 'star', sway: 1.2, driftY: -2 });
    },
    cast(g, c, col) {
      const a = fade(c.k);
      const p = rise(c.k, 0.55);
      const rot = c.clock / 500;
      const skyY = c.y - 30 + 9 * p;                        // 头顶那颗星随起手缓缓下压
      // 头顶亮起的一颗星（三层）
      shell(g, (s) => starPts(c.x, skyY, rot, (7 + 5 * p) * s, (3 + 2 * p) * s), col, a);
      // 下坠光路
      band3(g, [{ x: c.x, y: skyY + 6 }, { x: c.x, y: c.y - 2 }], 4.5 + 3 * p, 1.6, col, a * 0.55);
      // 地面落点警示环（压扁）
      ring3(g, c.x, c.y, 4 + 12 * p, 3.2, col, a * 0.85, { squash: 0.4, phase: rot });
      poly(g, ringPts(c.x, c.y, 2 + 7 * p, 1.8, -rot, 0.4, 16), col.accent, a * 0.8);
      // 绕头顶星的 5 粒星屑
      for (let i = 0; i < 5; i++) {
        const q = offset(c.x, skyY, rot * 2 + (i / 5) * TAU, 12 + 4 * p, 0);
        poly(g, starPts(q.x, q.y, rot * 2, 2.6, 1.1), col.core, a * 0.8);
      }
      dots(g, [{ x: c.x, y: skyY }], C.white, a * 0.9);
    },
    impact(g, c, col) {
      const a = fade(c.k);
      const fl = peak(c.k, 0.15);
      const R = c.radius;
      const rot = c.clock / 620;
      const grow = R * (0.86 + 1.04 * rise(c.k, 0.6));        // 0.86R → 1.9R
      const gy = c.y + R * 0.3;
      const peakPhase = c.k < 0.52;                            // 后段只留余韵，不再铺满大星
      // —— 落点警示环（地面压扁，先垫底） ——
      ring3(g, c.x, gy, grow * 1.12, 3.6, col, a * 0.6, { squash: 0.36, phase: -rot });
      poly(g, ringPts(c.x, gy, grow * 0.72, 2.2, rot, 0.36, 20), col.accent, a * 0.45);
      // —— 主星：更尖的星（内径 0.3），暗底 + 金身 + 小亮芯，避免整块惨白 ——
      const starBuild = (s, qx = c.x, qy = c.y, rr = rot) => starPts(qx, qy, rr, grow * (peakPhase ? 1.0 : 0.5) * s, grow * (peakPhase ? 0.3 : 0.15) * s);
      // 斜坠来的那一下：星体略微偏向来向，读作「砸下来的」
      if (peakPhase) {
        poly(g, starBuild(1.02), col.edge, a * 0.95);
        poly(g, starBuild(0.74), col.body, a);
        poly(g, starBuild(0.3), col.core, a * 0.9);
      } else {
        poly(g, starBuild(1.0), col.edge, a * 0.7);
        poly(g, starBuild(0.7), col.body, a * 0.75);
      }
      // —— 5 道星芒：主星的「刺」，比小星更能读成星陨 ——
      for (let i = 0; i < 5; i++) {
        const ang = rot + (i / 5) * TAU - Math.PI / 2;
        poly(g, spikePts(c.x, c.y, ang, grow * (peakPhase ? 1.28 : 0.8), Math.max(2, grow * 0.07), 0.5), col.accent, a * (peakPhase ? 0.9 : 0.55));
      }
      // —— 内圈小星环（6 颗，反向转） ——
      for (let i = 0; i < 6; i++) {
        const ang = -rot * 0.8 + (i / 6) * TAU;
        const q = offset(c.x, c.y, ang, grow * 1.34, 0);
        poly(g, starPts(q.x, q.y, ang + rot, grow * 0.12 + 2, grow * 0.05 + 1), i % 3 === 0 ? col.core : col.accent, a * 0.9);
      }
      // —— 命中瞬间：中心白闪 + 白热小星 ——
      if (fl > 0.02) {
        poly(g, starPts(c.x, c.y, rot, grow * 0.42 * (0.6 + fl), grow * 0.16 * (0.6 + fl)), col.core, fl * 0.95);
        blocks(g, [{ x: c.x, y: c.y }], C.white, fl, 6);
      }
      // —— 余韵：散射星屑 + 外圈星点 + 斜坠星痕 ——
      blocks(g, scatterPts(c.x, c.y, 10, 11, grow * 0.8, grow * 1.55), col.body, a * 0.8, 2);
      dots(g, ringDots(c.x, c.y, grow * 1.62, 8, rot * 0.6), col.accent, a * 0.5);
      band3(g, [offset(c.x, c.y, c.angle + Math.PI, grow * 0.8, 0), offset(c.x, c.y, c.angle + Math.PI, grow * 1.9, 0)], Math.max(2, R * 0.16), 1.4, col, a * 0.6);
    },
    ward(g, c, col) {
      const a = fade(c.k);
      const R = Math.max(6, c.radius);
      const rot = c.clock / 700;
      ring3(g, c.x, c.y, R * 0.88, 3.2, col, a * 0.75, { phase: rot });
      poly(g, ringPts(c.x, c.y, R * 0.62, 2, -rot * 1.5, 1, 18), col.accent, a * 0.7);
      // 6 颗小星绕环
      for (let i = 0; i < 6; i++) {
        const ang = rot + (i / 6) * TAU;
        const q = offset(c.x, c.y, ang, R * 0.88, 0);
        poly(g, starPts(q.x, q.y, ang + rot, 4.4, 1.8), i % 2 ? col.body : col.accent, a * 0.95);
        dots(g, [q], col.core, a * 0.8);
      }
      blocks(g, [{ x: c.x, y: c.y }], C.white, a * 0.85, 3);
    },
    link(g, c, col) {
      const a = (1 - c.k) * 0.95;
      const pts = lineDots(c.from.x, c.from.y, c.to.x, c.to.y, 7);
      band3(g, pts, 1.8, 4.4, col, a);
      // 沿途星点（流向节拍）
      for (let i = 1; i < pts.length; i += 2) {
        poly(g, starPts(pts[i].x, pts[i].y, c.clock / 400 + i, 2.8, 1.2), col.core, a * 0.9);
      }
      poly(g, starPts(c.to.x, c.to.y, c.clock / 300, 6, 2.6), col.core, a * 0.9);
      blocks(g, [c.to], C.white, a * 0.9, 2);
    },
  },

  // ------------------------------------------------------------------
  // 陨星裁决：坠落冲击。16 个法术里最重的一套 —— 冲击波双环 + 陨坑 + 两段地裂 +
  // 尘埃柱 + 12 颗碎石，命中图案接近 140 指令上限。
  // ------------------------------------------------------------------
  meteor_judgment: {
    silhouette: 'meteor-crater',
    trail: { max: 8, style: 'smoke' },
    colors: { edge: C.outline, body: 0xb08252, core: 0xffc885, accent: 0xff8a3c },
    opBudget: 140,
    projectile(g, c, col) {
      const { x, y, angle, clock } = c;
      const a = 1 - c.k * 0.12;
      const rot = clock / 1100;
      // 岩石本体：不规则团块三层（直径 ≈21px，带暗边）
      shell(g, (s) => blobPts(x, y, 10.5 * s, 73, 9, 0.3, rot), col, a);
      // 熔岩裂纹：两道朝飞行方向裂开的缝
      band(g, [offset(x, y, angle, -3, -5), offset(x, y, angle, 2, 0), offset(x, y, angle, -2.5, 5)], 2.2, 2.2, col.accent, a * 0.9);
      band(g, [offset(x, y, angle, -6.5, 3.5), offset(x, y, angle, -1.5, 6.5)], 1.8, 1.2, col.accent, a * 0.8);
      // 前缘火焰（坠向那一侧的炽热前锋）
      for (let i = 0; i < 3; i++) {
        const ang = angle + (i - 1) * 0.5;
        const root = offset(x, y, ang, 8, (i - 1) * 2.6);
        poly(g, spikePts(root.x, root.y, ang, 8 - Math.abs(i - 1) * 2, 3.4, 0.55), col.body, a * 0.9);
        poly(g, spikePts(root.x, root.y, ang, 4.6 - Math.abs(i - 1) * 1.2, 1.5, 0.5), col.core, a * 0.85);
      }
      // 后缘黑烟块
      blocks(g, [
        offset(x, y, angle + Math.PI, 8, -4), offset(x, y, angle + Math.PI, 11, 1),
        offset(x, y, angle + Math.PI, 7, 5), offset(x, y, angle + Math.PI, 13, -2),
      ], C.mute, a * 0.55, 4);
      // 岩芯白热点
      blocks(g, [{ x, y }], col.core, a * 0.9, 3);
    },
    trailFx(g, c, col) {
      // smoke：烟团大、暗（far 更暗更大），补上「坠落"的重量」
      drawTrail(g, c, col, { max: 8, farW: 2.6, nearW: 9.5, style: 'smoke', sway: 0.9, driftY: -3 });
    },
    cast(g, c, col) {
      const a = fade(c.k);
      const p = rise(c.k, 0.5);
      const rot = c.clock / 700;
      const skyY = c.y - 42 + 16 * p;                        // 天空那颗炽核向下压
      // 下坠炽核（三层）
      shell(g, (s) => blobPts(c.x, skyY, (7 + 4 * p) * s, 91, 8, 0.3, rot), col, a);
      // 坠落尾迹（上粗下细）
      band3(g, [{ x: c.x, y: skyY + 5 }, { x: c.x + 2, y: (skyY + c.y) * 0.5 }, { x: c.x, y: c.y - 5 }], 6 + 3 * p, 2, col, a * 0.5);
      // 地面落点警示环 + 十字准星
      ring3(g, c.x, c.y, 5 + 14 * p, 3.6, col, a * 0.9, { squash: 0.42, phase: rot });
      poly(g, ringPts(c.x, c.y, 2 + 8 * p, 2, -rot, 0.42, 16), col.accent, a * 0.75);
      rects(g, [
        [c.x - 11, c.y, 8, 1], [c.x + 3, c.y, 8, 1],
        [c.x, c.y - 8, 1, 7], [c.x, c.y + 2, 1, 7],
      ], col.accent, a * 0.7);
      // 天空里被炽核拖出的火星
      dots(g, [offset(c.x, skyY, rot, 9, -4), offset(c.x, skyY, -rot, 11, 3), offset(c.x, skyY, rot * 1.6, 7, 6)], col.accent, a * 0.7);
    },
    impact(g, c, col) {
      const a = fade(c.k);
      const fl = peak(c.k, 0.13);
      const R = c.radius;
      const rot = c.clock / 800;
      const shock = R * (1.18 + 0.95 * rise(c.k, 0.55));      // 1.18R → 2.13R
      const gy = c.y + R * 0.18;                              // 地面线
      // —— 1) 陨坑：不规则暗色多边形 + 坑沿 + 熔池 ——
      poly(g, flatBlob(c.x, gy, R * 1.0, 81, 0.52, 16, 0.26, rot * 0.3), col.edge, a * 0.98);
      poly(g, flatBlob(c.x, gy, R * 0.3, 83, 0.44, 16, 0.34, rot * 0.3), col.accent, a * 0.5);
      poly(g, flatBlob(c.x, gy, R * 0.14, 87, 0.42, 11, 0.36, -rot * 0.4), col.core, a * 0.55);
      // —— 1b) 熔岩裂纹：坑底三道亮缝，避免坑心被上层烟团盖成一块灰饼 ——
      for (let i = 0; i < 2; i++) {
        const ang = rot * 1.5 + (i / 2) * TAU;
        const p0 = offset(c.x, gy, ang, R * 0.12, 0);
        const p1 = offset(c.x, gy, ang + 0.18, R * 0.62, 0);
        band(g, [p0, p1], Math.max(2, R * 0.1), 1, col.accent, a * 0.9);
      }
      // —— 2) 两段地裂短条：从坑沿往外裂 ——
      for (let i = 0; i < 2; i++) {
        const ang = c.angle + (i ? 0.95 : -0.85);
        const p0 = offset(c.x, gy, ang, R * 0.72, 0);
        const mid = offset(c.x, gy, ang + hashSym(i * 5 + 2) * 0.24, R * 1.16, 0);
        const p1 = offset(c.x, gy, ang, R * 1.62, 0);
        band3(g, [p0, mid, p1], R * 0.16 + 2, 1.6, col, a * 0.9);
      }
      // —— 3) 冲击波双环：一粗一细，横向压扁做地面感 ——
      ring3(g, c.x, gy, shock, 5.2, col, a * 0.95, { squash: 0.52, phase: rot });
      ring3(g, c.x, gy, shock * 0.8, 1.8, col, a * 0.7, { squash: 0.52, phase: -rot });
      poly(g, ringPts(c.x, gy, shock * 1.02, 1.4, rot * 1.6, 0.52, 22), col.accent, a * 0.45);
      // 掀起的尘幕（贴地的一圈暗尘）
      poly(g, flatBlob(c.x, gy, shock * 1.04, 95, 0.46, 16, 0.3, -rot * 0.2), C.mute, a * 0.16);
      // —— 4) 尘埃柱：竖直向上的不规则烟团（高 ≈1.75R） ——
      const dustH = R * 1.78;
      for (let i = 0; i < 5; i++) {
        const u = i / 4;
        const rad = R * (0.38 - 0.24 * u);
        const dx = hashSym(i * 11 + 4) * R * 0.2;
        const cyy = gy - dustH * (0.08 + u * 0.92);
        if (i < 2) {
          // 柱底三层：暗边 / 灰烟 / 被火光染暖的芯
          shell(g, (s) => blobPts(c.x + dx, cyy, rad * s, 91 + i * 5, 9, 0.3, rot + i), col, a * (0.92 - 0.5 * u),
            [[1, col.edge, 0.95], [0.78, C.tan, 0.85], [0.4, col.core, 0.35]]);
        } else {
          // 上半段只留暗边 + 灰烟：烟越往上越暗，不需要亮芯
          poly(g, blobPts(c.x + dx, cyy, rad * 1.26, 91 + i * 5, 9, 0.3, rot + i), col.edge, a * (0.92 - 0.5 * u) * 0.9);
          poly(g, blobPts(c.x + dx, cyy, rad, 91 + i * 5, 9, 0.3, rot + i), C.tan, a * (0.92 - 0.5 * u) * 0.5);
        }
      }
      // 柱顶翻卷的烟舌
      poly(g, spikePts(c.x + hashSym(7) * R * 0.1, gy - dustH * 0.96, -Math.PI * 0.5 + 0.5, R * 0.34, Math.max(2, R * 0.09), 0.6), C.tan, a * 0.45);
      poly(g, spikePts(c.x, gy - dustH * 0.9, -Math.PI * 0.5 - 0.6, R * 0.3, Math.max(2, R * 0.08), 0.6), col.edge, a * 0.6);
      // —— 5) 8~12 颗碎石飞出：小碎块 + 6 块大石 ——
      const chunks = [];
      for (let i = 0; i < 12; i++) {
        const ang = c.angle + hashSym(i * 17 + 6) * 1.5 + (i / 12) * Math.PI;
        const rr = R * (0.9 + 0.9 * (i / 12)) * (0.8 + 0.3 * c.k);
        chunks.push(offset(c.x, gy, ang, rr, -R * 0.22 * (0.3 + c.k)));
      }
      blocks(g, chunks, col.edge, a * 0.9, 4);
      blocks(g, chunks, col.body, a * 0.75, 3);
      for (let i = 0; i < 6; i++) {
        const ang = c.angle + (i / 6) * TAU + 0.2;
        const rr = R * (1.0 + 0.55 * ((i % 3) / 2)) * (0.75 + 0.35 * c.k);
        const q = offset(c.x, gy, ang, rr, -R * 0.3);
        poly(g, blobPts(q.x, q.y, R * 0.1 + 2.5, 101 + i, 6, 0.34, ang), col.body, a * 0.95);
        if (i < 2) poly(g, blobPts(q.x - 1, q.y - 1, (R * 0.1 + 2.5) * 0.55, 107 + i, 6, 0.3, ang), col.core, a * 0.8);
      }
      // —— 6) 命中瞬间：白闪 + 炽核 + 白热冲击环 ——
      if (fl > 0.02) {
        poly(g, blobPts(c.x, gy - R * 0.28, R * 0.22 + 3 * fl, 71, 9, 0.3, rot), col.accent, fl * 0.85);
        poly(g, ringPts(c.x, gy - R * 0.28, R * 0.4 + 4 * fl, 2 + 2 * fl, rot, 1, 14), col.core, fl * 0.7);
        blocks(g, [{ x: c.x, y: gy - R * 0.28 }], C.white, fl, 4);
        poly(g, ringPts(c.x, gy, shock * 0.5, 3 + 3 * fl, -rot, 0.55, 20), col.core, fl * 0.8);
      }
      // —— 7) 余韵：外圈残环 + 焦痕 + 上飘尘埃 ——
      poly(g, ringPts(c.x, gy, shock * 1.28, 1.6, rot * 0.6, 0.52, 20), col.edge, a * 0.5);
      rects(g, [
        [c.x - R * 1.3, gy + R * 0.34, R * 0.8, 2],
        [c.x + R * 0.2, gy + R * 0.4, R * 0.9, 2],
        [c.x - R * 0.4, gy + R * 0.5, R * 0.5, 1],
      ], col.edge, a * 0.6);
      blocks(g, ringDots(c.x, gy - R * 0.9, R * 1.1, 6, rot, 0.7), C.mute, a * 0.4, 3);
      dots(g, ringDots(c.x, gy, R * 1.5, 8, -rot, 0.55), col.accent, a * 0.5);
    },
    ward(g, c, col) {
      const a = fade(c.k);
      const R = Math.max(6, c.radius);
      const rot = c.clock / 900;
      ring3(g, c.x, c.y, R * 0.95, 4.2, col, a * 0.85, { phase: rot });
      poly(g, ringPts(c.x, c.y, R * 0.74, 2.2, -rot * 1.5, 1, 18), col.accent, a * 0.7);
      // 8 块环岩绕轴转（大小不一，像被吸住的碎石）
      for (let i = 0; i < 8; i++) {
        const ang = rot + (i / 8) * TAU;
        const q = offset(c.x, c.y, ang, R * 0.95, 0);
        poly(g, blobPts(q.x, q.y, 4.6 + hash01(i * 3 + 1) * 1.8, i * 5 + 3, 7, 0.3, ang), col.body, a * 0.95);
        dots(g, [q], col.core, a * 0.8);
      }
      dots(g, ringDots(c.x, c.y, R * 1.16, 6, -rot), C.mute, a * 0.5);
    },
    link(g, c, col) {
      const a = (1 - c.k) * 0.95;
      const pts = lineDots(c.from.x, c.from.y, c.to.x, c.to.y, 7);
      band3(g, pts, 2.6, 5.8, col, a);
      // 沿线坠落的烟团（流向节拍）
      blocks(g, pts.filter((p, i) => i % 2 === 1), C.mute, a * 0.5, 4);
      blocks(g, pts.filter((p, i) => i % 3 === 0), col.body, a * 0.8, 3);
      poly(g, blobPts(c.to.x, c.to.y, 6, 23, 8, 0.28, c.clock / 700), col.core, a * 0.9);
      blocks(g, [c.to], C.white, a * 0.85, 2);
    },
  },
};
