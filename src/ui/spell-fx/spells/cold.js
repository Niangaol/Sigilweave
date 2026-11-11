// 冷系 / 奥术系四法术（v2 大胆版）
//   frost_arrow 寒霜箭 —— 动作：结晶生长（冰棱向后生长 + 六角冰晶炸开）
//   arcane_bolt 奥术飞弹 —— 动作：螺旋缠卷（旋转方框 + 双螺旋臂 + 向内塌缩）
//   echo_sigil 回声符印 —— 动作：镜像分裂（错位同心环反向旋转 + 声波弧）
//   mana_siphon 秘能汲取 —— 动作：丝线回拉（螺旋丝把光球拽回来）
import { C } from '../../Palette.js';
import {
  poly, dots, blocks, rects, shell, band, band3, ringPts, ring3, sectorPts, spikePts,
  blobPts, boltPts, hexPts, starPts, arrowPts, shape, offset, lineDots, ringDots,
  scatterPts, drawTrail, peak, rise, fade, hump, pulse, hash01, hashSym, clamp01, rnd, TAU,
} from '../kit.js';

export const cold = {
  // ------------------------------------------------------------------
  // 寒霜箭：结晶生长。冰棱本体 + 6 根向后生长的冰羽（呼吸式伸缩），命中炸成六角冰晶。
  // ------------------------------------------------------------------
  frost_arrow: {
    silhouette: 'ice-shard',
    trail: { max: 7, style: 'frost' },
    colors: { edge: C.outline, body: 0xaee4ff, core: 0xeafcff, accent: 0x7fd7ff },
    opBudget: 60,
    projectile(g, c, col) {
      const { x, y, angle } = c;
      const a = 1 - c.k * 0.12;
      const breathe = 0.86 + 0.24 * pulse(c.clock, 520);
      // 主冰棱：三层体积（暗轮廓 / 冰蓝本体 / 冷白亮芯）
      shell(g, (s) => arrowPts(x, y, angle, 15 * s, 7 * s, 5.4 * s), col, a);
      // 向后生长的冰羽：上三下三，越长越靠外 —— 「生长」的读感
      for (let i = 0; i < 6; i++) {
        const side = i < 3 ? -1 : 1;
        const tier = i % 3;
        const backAng = angle + side * (0.58 + tier * 0.44);
        const len = (7.5 + tier * 5) * breathe;
        const base = offset(x, y, angle, -1.5 - tier * 3.4, side * 1.8);
        poly(g, spikePts(base.x, base.y, backAng, len, 2.4), col.accent, a * 0.95);
        poly(g, spikePts(base.x, base.y, backAng, len * 0.52, 1.1), col.core, a * 0.9);
      }
      // 尖端白点 + 两粒前向霜晶
      poly(g, arrowPts(x, y, angle, 5.5, 2, 1.8), col.core, a);
      dots(g, [offset(x, y, angle, 16.6, 0), offset(x, y, angle, 18.6, 1)], col.core, a * 0.9);
    },
    trailFx(g, c, col) {
      drawTrail(g, c, col, { max: 7, farW: 2, nearW: 8, style: 'frost', sway: 1.4 });
    },
    cast(g, c, col) {
      const a = fade(c.k);
      const p = rise(c.k, 0.45);
      // 预警：八边霜环展开
      ring3(g, c.x, c.y, 6 + 16 * p, 3.4, col, a * 0.9, { phase: c.clock / 500 });
      // 6 根冰棱从环上长出来
      const rot = c.clock / 900;
      for (let i = 0; i < 6; i++) {
        const ang = rot + (i / 6) * TAU;
        poly(g, spikePts(c.x, c.y, ang, 6 + 15 * p, 2.6), col.accent, a * 0.9);
      }
      // 向上抽起的冷气柱
      poly(g, shape(c.x, c.y, 0, [[-2, -2], [-3, -18 - 8 * p], [0, -24 - 8 * p], [3, -18 - 8 * p], [2, -2]]), col.body, a * 0.6);
      poly(g, hexPts(c.x, c.y, 3.5 + 2 * p, rot), C.white, a * 0.9);
    },
    impact(g, c, col) {
      const a = fade(c.k);
      const fl = peak(c.k, 0.18);
      const R = c.radius;
      const grow = R * (0.9 + 1.15 * rise(c.k, 0.6));
      const rot = c.clock / 700;
      // 扩散霜环（粗环带）
      ring3(g, c.x, c.y, grow, 4.2, col, a * 0.9, { phase: -rot });
      // 六角冰晶主体
      shell(g, (s) => hexPts(c.x, c.y, grow * 0.64 * s, rot), col, a);
      // 6 根长冰刺捅出环外
      for (let i = 0; i < 6; i++) {
        const ang = rot + (i / 6) * TAU;
        poly(g, spikePts(c.x, c.y, ang, grow * 1.2, grow * 0.11), col.accent, a * 0.95);
        poly(g, spikePts(c.x, c.y, ang, grow * 0.72, grow * 0.045), col.core, a * 0.85);
      }
      // 命中瞬间：中心白闪
      if (fl > 0.02) {
        poly(g, hexPts(c.x, c.y, grow * 0.32 * (0.7 + fl * 0.5), rot * 1.4), col.core, fl * 0.95);
        poly(g, hexPts(c.x, c.y, grow * 0.15, rot), C.white, fl);
      }
      // 碎冰屑 + 余韵霜点
      blocks(g, scatterPts(c.x, c.y, 8, 3, grow * 0.95, grow * 1.5), col.body, a * 0.8, 2);
      dots(g, ringDots(c.x, c.y, grow * 1.65, 10, rot), col.accent, a * 0.45);
    },
    ward(g, c, col) {
      const a = fade(c.k);
      const R = Math.max(6, c.radius);
      const rot = c.clock / 800;
      ring3(g, c.x, c.y, R * 0.86, 3.4, col, a * 0.6, { phase: rot });
      // 6 片冰盾面绕圈
      for (let i = 0; i < 6; i++) {
        const ang = rot + (i / 6) * TAU;
        const p = offset(c.x, c.y, ang, R * 0.86, 0);
        poly(g, spikePts(p.x, p.y, ang, 9, 4.5), col.body, a * 0.95);
        poly(g, spikePts(p.x, p.y, ang, 5, 2), col.core, a * 0.8);
      }
    },
    link(g, c, col) {
      const a = (1 - c.k) * 0.95;
      const pts = lineDots(c.from.x, c.from.y, c.to.x, c.to.y, 5);
      band3(g, pts, 2.6, 5, col, a);
      for (const p of [c.from, c.to]) {
        poly(g, hexPts(p.x, p.y, 4.5, c.clock / 500), col.core, a * 0.9);
      }
      blocks(g, [c.to], C.white, a, 2);
    },
  },

  // ------------------------------------------------------------------
  // 奥术飞弹：螺旋缠卷。旋转方框 + 两条绕轴螺旋臂；命中向内塌缩成一点。
  // ------------------------------------------------------------------
  arcane_bolt: {
    silhouette: 'spin-square',
    trail: { max: 7, style: 'rune' },
    colors: { edge: C.outline, body: 0xffb44d, core: 0xffd79a, accent: 0xe0c35a },
    opBudget: 46,
    projectile(g, c, col) {
      const { x, y, angle, clock } = c;
      const a = 1 - c.k * 0.12;
      const rot = clock / 240;
      // 外层旋转方框（体积三层）
      shell(g, (s) => shape(x, y, rot, [[11 * s, 0], [0, -11 * s], [-11 * s, 0], [0, 11 * s]]), col, a);
      // 内层反向菱形
      poly(g, shape(x, y, -rot * 1.6, [[6, 0], [0, -6], [-6, 0], [0, 6]]), col.core, a * 0.95);
      // 两条绕轴螺旋臂：沿飞行方向缠绕
      for (let arm = 0; arm < 2; arm++) {
        const pts = [];
        for (let i = 0; i < 6; i++) {
          const lx = -9 + i * 3.4;
          const ly = Math.sin(i * 1.15 + rot + arm * Math.PI) * 4.2;
          pts.push(shape(x, y, angle, [[lx, ly]])[0]);
        }
        band(g, pts, 1.4, 3.4, col.accent, a * 0.9);
      }
      // 白核
      blocks(g, [{ x, y }], C.white, a, 4);
    },
    trailFx(g, c, col) {
      drawTrail(g, c, col, { max: 7, farW: 1.8, nearW: 7.5, style: 'rune', sway: 0.8 });
    },
    cast(g, c, col) {
      const a = fade(c.k);
      const p = rise(c.k, 0.4);
      const rot = c.clock / 300;
      ring3(g, c.x, c.y, 5 + 15 * p, 3.2, col, a * 0.85, { phase: rot });
      // 3 个方框旋转着向外漂出
      for (let i = 0; i < 3; i++) {
        const q = offset(c.x, c.y, rot + (i / 3) * TAU, 5 + 13 * p, 0);
        poly(g, shape(q.x, q.y, rot * 1.5 + i, [[5, 0], [0, -5], [-5, 0], [0, 5]]), col.accent, a * 0.85);
      }
      // 向上抽起的琥珀光柱
      poly(g, shape(c.x, c.y, 0, [[-2.5, 0], [-3.5, -20 - 9 * p], [3.5, -20 - 9 * p], [2.5, 0]]), col.body, a * 0.55);
      blocks(g, [{ x: c.x, y: c.y }], C.white, a, 4);
    },
    impact(g, c, col) {
      const a = fade(c.k);
      const fl = peak(c.k, 0.22);
      const R = c.radius;
      // 向内塌缩：外圈先大后小，读作「被吸进去」
      const shrink = 1 - 0.62 * rise(c.k, 0.75);
      const rot = c.clock / 260;
      const outer = R * 1.7 * shrink;
      // 外圈：反向旋转的大方框（先铺底，让命中占满整片区域）
      const big = R * 1.98 * (0.85 + 0.15 * rise(c.k, 0.5));
      poly(g, shape(c.x, c.y, -rot * 0.55, [[big, 0], [0, -big], [-big, 0], [0, big]]), col.edge, a * 0.72);
      poly(g, shape(c.x, c.y, -rot * 0.55, [[big * 0.86, 0], [0, -big * 0.86], [-big * 0.86, 0], [0, big * 0.86]]), col.body, a * 0.5);
      shell(g, (s) => shape(c.x, c.y, rot, [[outer * s, 0], [0, -outer * s], [-outer * s, 0], [0, outer * s]]), col, a);
      poly(g, shape(c.x, c.y, -rot * 1.5, [[outer * 0.5, 0], [0, -outer * 0.5], [-outer * 0.5, 0], [0, outer * 0.5]]), col.core, a * 0.9);
      // 4 向粗光柱
      for (let i = 0; i < 4; i++) {
        const ang = rot + (i / 4) * TAU;
        const p0 = offset(c.x, c.y, ang, 2, 0);
        const p1 = offset(c.x, c.y, ang, outer * 1.25, 0);
        band(g, [p0, p1], 5, 1.5, col.accent, a * 0.8);
      }
      // 中心白闪
      if (fl > 0.02) {
        blocks(g, [{ x: c.x, y: c.y }], C.white, fl, 7);
        poly(g, shape(c.x, c.y, rot, [[10 * fl, 0], [0, -10 * fl], [-10 * fl, 0], [0, 10 * fl]]), col.core, fl * 0.9);
      }
      // 余韵：8 角火花 + 落定的符文块
      const motes = [];
      for (let i = 0; i < 8; i++) motes.push(offset(c.x, c.y, rot + 0.39 + (i / 8) * TAU, big * (0.9 + (i % 2) * 0.16), 0));
      blocks(g, motes, col.accent, a * 0.75, 2);
      dots(g, ringDots(c.x, c.y, big, 12, -rot), col.body, a * 0.5);
    },
    ward(g, c, col) {
      const a = fade(c.k);
      const R = Math.max(6, c.radius);
      const rot = c.clock / 500;
      ring3(g, c.x, c.y, R * 0.9, 2.8, col, a * 0.5, { phase: -rot });
      // 4 面方框护盾
      for (let i = 0; i < 4; i++) {
        const q = offset(c.x, c.y, rot + (i / 4) * TAU, R * 0.9, 0);
        poly(g, shape(q.x, q.y, rot + (i / 4) * TAU, [[7, 0], [0, -7], [-7, 0], [0, 7]]), col.body, a * 0.9);
        blocks(g, [q], col.core, a * 0.85, 2);
      }
    },
    link(g, c, col) {
      const a = (1 - c.k) * 0.95;
      const pts = lineDots(c.from.x, c.from.y, c.to.x, c.to.y, 6);
      band3(g, pts, 2.2, 4.6, col, a);
      const rot = c.clock / 260;
      for (const p of [c.from, c.to]) {
        poly(g, shape(p.x, p.y, rot, [[4.5, 0], [0, -4.5], [-4.5, 0], [0, 4.5]]), col.core, a * 0.9);
      }
    },
  },

  // ------------------------------------------------------------------
  // 回声符印：镜像分裂。双环错位 + 3 个反向旋转的椭圆环 + 声波弧。
  // ------------------------------------------------------------------
  echo_sigil: {
    silhouette: 'mirror-ring',
    trail: { max: 6, style: 'ring' },
    colors: { edge: C.outline, body: 0xffaa33, core: 0xffd79a, accent: 0x5ed0c8 },
    opBudget: 35,
    projectile(g, c, col) {
      const { x, y, clock } = c;
      const a = 1 - c.k * 0.12;
      const rot = clock / 380;
      // 外环粗带 + 内环（反向）
      ring3(g, x, y, 10, 3.6, col, a, { phase: rot });
      poly(g, ringPts(x, y, 5.5, 2, -rot * 1.6, 0.85), col.accent, a * 0.95);
      // 4 个符文块（夹在两环之间）
      for (let i = 0; i < 4; i++) {
        const q = offset(x, y, rot + (i / 4) * TAU, 8, 0);
        blocks(g, [q], col.core, a * 0.95, 3);
      }
      blocks(g, [{ x, y }], C.white, a, 3);
    },
    trailFx(g, c, col) {
      drawTrail(g, c, col, { max: 6, farW: 1.6, nearW: 6, style: 'ring', sway: 1.2 });
    },
    cast(g, c, col) {
      const a = fade(c.k);
      const p = rise(c.k, 0.5);
      const rot = c.clock / 420;
      // 三个错位环依次展开（镜像分裂）
      for (let i = 0; i < 3; i++) {
        const q = 4 + 17 * p - i * 3.5;
        if (q > 1.5) poly(g, ringPts(c.x, c.y, q, 3.2 - i * 0.5, rot * (i % 2 ? -1 : 1), 1), i === 0 ? col.body : col.accent, a * (0.9 - i * 0.2));
      }
      // 4 符文向外漂
      for (let i = 0; i < 4; i++) {
        const q = offset(c.x, c.y, rot + (i / 4) * TAU, 6 + 13 * p, 0);
        blocks(g, [q], col.core, a * 0.9, 3);
      }
    },
    impact(g, c, col) {
      const a = fade(c.k);
      const fl = peak(c.k, 0.2);
      const R = c.radius;
      const grow = R * (0.85 + 1.05 * rise(c.k, 0.6));
      const rot = c.clock / 400;
      // 3 个错位同心椭圆环，正反交替旋转 —— 这是「回声」的签名
      for (let i = 0; i < 3; i++) {
        const rad = grow * (1.55 - i * 0.34);
        const sq = 1 - i * 0.12;
        ring3(g, c.x, c.y, rad, 3.6 - i * 0.6, i === 1 ? col.accent : col,
          a * (0.95 - i * 0.15), { phase: rot * (i % 2 ? -1.4 : 1), squash: sq });
      }
      // 声波弧：从中心朝两个方向推开
      for (let i = 0; i < 2; i++) {
        const a0 = rot + i * Math.PI;
        poly(g, sectorPts(c.x, c.y, grow * 1.35, grow * 1.62, a0 - 0.42, a0 + 0.42, 6), col.core, a * 0.75);
      }
      // 对侧镜像小环
      poly(g, ringPts(c.x, c.y, grow * 0.55, 2.4, -rot), col.core, a * 0.8);
      if (fl > 0.02) blocks(g, [{ x: c.x, y: c.y }], C.white, fl, 6);
      // 余韵符文点
      dots(g, ringDots(c.x, c.y, grow * 1.75, 8, -rot), col.accent, a * 0.5);
    },
    ward(g, c, col) {
      const a = fade(c.k);
      const R = Math.max(6, c.radius);
      const rot = c.clock / 460;
      ring3(g, c.x, c.y, R * 0.78, 3.2, col, a * 0.75, { phase: rot });
      poly(g, ringPts(c.x, c.y, R * 0.78, 2.2, -rot * 1.6), col.accent, a * 0.9);
      for (let i = 0; i < 4; i++) {
        const q = offset(c.x, c.y, rot * 1.2 + (i / 4) * TAU, R * 0.62, 0);
        blocks(g, [q], col.core, a * 0.9, 3);
      }
    },
    link(g, c, col) {
      const a = (1 - c.k) * 0.95;
      const pts = lineDots(c.from.x, c.from.y, c.to.x, c.to.y, 7);
      band(g, pts, 2, 4.4, col.body, a);
      // 波纹：沿途 3 个小环
      for (let i = 1; i < pts.length; i += 3) {
        poly(g, ringPts(pts[i].x, pts[i].y, 4, 1.6, c.clock / 400 + i, 1, 10), col.accent, a * 0.8);
      }
      blocks(g, [c.to], C.white, a * 0.9, 2);
    },
  },

  // ------------------------------------------------------------------
  // 秘能汲取：丝线回拉。光球 + 3 条螺旋丝；命中时丝线朝来向抽回，把魂光拽走。
  // ------------------------------------------------------------------
  mana_siphon: {
    silhouette: 'orb-threads',
    trail: { max: 7, style: 'siphon' },
    colors: { edge: C.outline, body: 0x9fe8ff, core: 0xeafcff, accent: 0x5ed0c8 },
    opBudget: 55,
    projectile(g, c, col) {
      const { x, y, angle, clock } = c;
      const a = 1 - c.k * 0.12;
      // 光球本体（三层）
      shell(g, (s) => blobPts(x, y, 10 * s, 11, 9, 0.14, clock / 700), col, a);
      // 3 条螺旋丝：沿飞行方向缠绕并向后拉
      for (let t = 0; t < 3; t++) {
        const pts = [];
        for (let i = 0; i < 5; i++) {
          const lx = 2 - i * 4.4;
          const ly = Math.sin(i * 1.3 + clock / 220 + (t / 3) * TAU) * (3 + i * 0.9);
          pts.push(shape(x, y, angle, [[lx, ly]])[0]);
        }
        band(g, pts, 2.2, 0.8, col.accent, a * 0.9);
      }
      blocks(g, [{ x, y }], C.white, a, 5);
    },
    trailFx(g, c, col) {
      drawTrail(g, c, col, { max: 7, farW: 2, nearW: 7, style: 'siphon', sway: 1.6 });
    },
    cast(g, c, col) {
      const a = fade(c.k);
      const p = rise(c.k, 0.45);
      // 3 条丝从下方被抽上来
      for (let t = 0; t < 3; t++) {
        const ang = (t / 3) * TAU + c.clock / 600;
        const pts = [];
        for (let i = 0; i < 5; i++) {
          const u = i / 4;
          const r = 22 - 17 * u * p - 4 * p;
          pts.push(offset(c.x, c.y, ang + u * 0.9, r, Math.sin(u * 6 + c.clock / 200) * 3));
        }
        band(g, pts, 1, 3.2, col.accent, a * 0.85);
      }
      // 光球在丝线汇聚处成形
      if (p > 0.2) {
        shell(g, (s) => blobPts(c.x, c.y, 9 * s * p, 11, 9, 0.14, c.clock / 600), col, a);
        blocks(g, [{ x: c.x, y: c.y }], C.white, a * 0.9, 4);
      }
      ring3(g, c.x, c.y, 4 + 12 * p, 2.6, col, a * 0.5, { phase: -c.clock / 500 });
    },
    impact(g, c, col) {
      const a = fade(c.k);
      const fl = peak(c.k, 0.2);
      const R = c.radius;
      const back = c.angle + Math.PI;
      // 内爆环：由外向内收（粗 4.6px），读作「能量被抽走」
      const shrink = 1 - 0.52 * rise(c.k, 0.8);
      ring3(g, c.x, c.y, R * 1.75 * shrink, 4.6, col, a * 0.95, { phase: c.clock / 300, squash: 0.9 });
      ring3(g, c.x, c.y, R * 1.15 * shrink, 2.6, col, a * 0.55, { phase: -c.clock / 260, squash: 0.9 });
      // 光球被拽碎：内核（命中瞬间最亮）
      if (fl > 0.02) {
        shell(g, (s) => blobPts(c.x, c.y, R * 0.52 * (0.72 + fl * 0.5) * s, 11, 9, 0.16, c.clock / 500), col, fl);
        blocks(g, [{ x: c.x, y: c.y }], C.white, fl, 6);
      }
      // 3 条丝朝来向（-angle）抽回 —— 越远越细，是这套的签名动作
      for (let t = 0; t < 3; t++) {
        const off = (t - 1) * 0.5;
        const pts = [];
        for (let i = 0; i < 6; i++) {
          const u = i / 5;
          const len = R * (0.25 + 2.1 * u) * (0.35 + 0.65 * c.k);
          pts.push(offset(c.x, c.y, back + off + Math.sin(u * 5.2 + c.clock / 240) * 0.16, len, 0));
        }
        band3(g, pts, 4.4, 1.2, col, a * 0.95);
      }
      // 沿丝线被拽走的三颗光点
      for (let t = 0; t < 3; t++) {
        const u = 0.35 + 0.55 * c.k;
        const p = offset(c.x, c.y, back + (t - 1) * 0.5, R * 2.35 * u, 0);
        blocks(g, [p], col.core, a * 0.9, 3);
      }
      // 余韵：冷光碎屑
      dots(g, scatterPts(c.x, c.y, 10, 7, R * 0.7, R * 1.5), col.accent, a * 0.6);
    },
    ward(g, c, col) {
      const a = fade(c.k);
      const R = Math.max(6, c.radius);
      const rot = c.clock / 520;
      // 3 段弧组成环（断续感）
      for (let i = 0; i < 3; i++) {
        const a0 = rot + (i / 3) * TAU;
        poly(g, sectorPts(c.x, c.y, R * 0.78, R * 0.78 + 3.4, a0, a0 + 1.5, 8), col.body, a * 0.9);
      }
      ring3(g, c.x, c.y, R * 0.62, 2.2, col, a * 0.45, { phase: -rot * 1.4 });
      // 3 颗光点沿弧漂
      for (let i = 0; i < 3; i++) {
        const q = offset(c.x, c.y, rot * 1.2 + (i / 3) * TAU, R * 0.78, 0);
        blocks(g, [q], col.core, a * 0.95, 3);
      }
    },
    link(g, c, col) {
      const a = (1 - c.k) * 0.95;
      const pts = lineDots(c.from.x, c.from.y, c.to.x, c.to.y, 7);
      // 丝线上带节拍块，读作「被抽走」
      const wave = pts.map((p, i) => ({ x: p.x, y: p.y + Math.sin(i * 1.4 + c.clock / 180) * 3 }));
      band3(g, wave, 1.8, 4, col, a);
      for (let i = 1; i < pts.length; i += 2) {
        blocks(g, [pts[i]], col.accent, a * 0.85, 2);
      }
      poly(g, ringPts(c.to.x, c.to.y, 5, 2.2, c.clock / 300), col.core, a * 0.9);
    },
  },
};
