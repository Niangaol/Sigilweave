// 第三批八法术（v2 · 元素学派与终极法术）
//   frost_nova    霜华新星 —— 动作：环形爆开（双层霜环 + 十二根放射冰刺）
//   thunder_storm 雷霆风暴 —— 动作：云层落雷（乌云块 + 折线闪电 + 地面电弧）
//   sunflare      日轮耀斑 —— 动作：日轮光束（八芒日轮 + 十字光柱）
//   void_lance    虚空之矛 —— 动作：暗矛贯穿（细长黑矛 + 裂口吸入）
//   sanctum       圣所     —— 动作：穹顶展开（三层拱 + 地面基座）
//   bramble_maul  荆棘巨槌 —— 动作：砸地生长（槌头石块 + 裂缝 + 荆棘）
//   soul_echo     魂灵回声 —— 动作：双环对映（正反旋转魂环 + 魂火）
//   glacier       冰川裂谷 —— 动作：冰墙隆起（锯齿冰墙 + 裂缝线）
import { C } from '../../Palette.js';
import {
  poly, dots, blocks, rects, shell, band3, ringPts, ring3, spikePts, boltPts, starPts,
  arrowPts, hexPts, shape, offset, lineDots, ringDots, scatterPts, drawTrail,
  peak, rise, fade, pulse, rnd, TAU,
} from '../kit.js';

const COLD = { edge: C.outline, body: 0xbfe8ff, core: 0xeafcff, accent: 0x7fd7ff };
const STORM = { edge: C.outline, body: 0x8fd8ff, core: 0xffffff, accent: 0x6fb8ff };
const SUN = { edge: C.outline, body: 0xffd36b, core: 0xfff6d8, accent: 0xff9d3c };
const VOID = { edge: 0x140a24, body: 0xc4a6ff, core: 0xe6dcff, accent: 0x6b4fa8 };
const HOLY = { edge: C.outline, body: 0xffe3a3, core: 0xfffbe8, accent: 0xd8a44a };
const WILD = { edge: C.outline, body: 0x7f9a5e, core: 0xd8ecc0, accent: 0x4e5f3a };
const SOUL = { edge: C.outline, body: 0xa88bd8, core: 0xf0e4ff, accent: 0x6f529e };
const ICEWALL = { edge: C.outline, body: 0x9fd8ff, core: 0xf2fbff, accent: 0x6fb8e0 };

export const fourth = {
  // ------------------------------------------------------------------
  // 霜华新星：以自身为圆心的环形爆发。命中是「两圈冰环 + 一圈放射刺」。
  // ------------------------------------------------------------------
  frost_nova: {
    silhouette: 'nova-ring',
    trail: { max: 6, style: 'frost' },
    colors: COLD,
    opBudget: 70,
    projectile(g, c, col) {
      const a = 1 - c.k * 0.15;
      const spin = c.clock / 420;
      ring3(g, c.x, c.y, 7, 2.6, col, a * 0.9, { phase: spin });
      ring3(g, c.x, c.y, 4, 1.6, col, a * 0.7, { phase: -spin });
      for (let i = 0; i < 4; i++) poly(g, spikePts(c.x, c.y, spin * 0.6 + (i / 4) * TAU, 10, 2), col.accent, a * 0.9);
      poly(g, hexPts(c.x, c.y, 2.8, spin), col.core, a);
    },
    trailFx(g, c, col) {
      drawTrail(g, c, col, { max: 6, farW: 2, nearW: 7, style: 'frost', sway: 1.2 });
    },
    cast(g, c, col) {
      const a = fade(c.k);
      const p = rise(c.k, 0.4);
      ring3(g, c.x, c.y, 8 + 20 * p, 3, col, a * 0.85, { phase: c.clock / 500 });
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * TAU + c.clock / 1100;
        poly(g, spikePts(c.x, c.y, ang, 6 + 12 * p, 2.2), col.accent, a * 0.85);
      }
      poly(g, hexPts(c.x, c.y, 3.6 + 2.4 * p, c.clock / 700), C.white, a * 0.9);
    },
    impact(g, c, col) {
      const a = fade(c.k);
      const fl = peak(c.k, 0.16);
      const R = c.radius;
      const grow = R * (0.85 + 1.2 * rise(c.k, 0.55));
      const rot = c.clock / 640;
      // 外层大霜环 + 内层反向小环：一眼读作「从脚下炸开」
      ring3(g, c.x, c.y, grow, 4, col, a * 0.9, { phase: rot });
      ring3(g, c.x, c.y, grow * 0.62, 2.4, col, a * 0.7, { phase: -rot });
      // 十二根放射冰刺，长短交替
      for (let i = 0; i < 12; i++) {
        const ang = rot + (i / 12) * TAU;
        const len = grow * (i % 2 === 0 ? 1.18 : 0.82);
        poly(g, spikePts(c.x, c.y, ang, len, grow * 0.07), col.accent, a * 0.9);
        poly(g, spikePts(c.x, c.y, ang, len * 0.58, grow * 0.03), col.core, a * 0.75);
      }
      if (fl > 0.02) poly(g, hexPts(c.x, c.y, grow * 0.3 * (0.7 + fl * 0.5), rot), col.core, fl * 0.95);
      blocks(g, scatterPts(c.x, c.y, 8, 5, grow * 0.9, grow * 1.4), col.body, a * 0.7, 2);
      dots(g, ringDots(c.x, c.y, grow * 1.55, 10, rot), col.accent, a * 0.4);
    },
    ward(g, c, col) {
      const a = fade(c.k);
      const R = Math.max(6, c.radius);
      const rot = c.clock / 760;
      ring3(g, c.x, c.y, R * 0.88, 3, col, a * 0.6, { phase: rot });
      for (let i = 0; i < 6; i++) {
        const ang = rot + (i / 6) * TAU;
        const p = offset(c.x, c.y, ang, R * 0.88, 0);
        poly(g, spikePts(p.x, p.y, ang, 8, 3.8), col.body, a * 0.9);
        poly(g, spikePts(p.x, p.y, ang, 4.4, 1.6), col.core, a * 0.75);
      }
    },
    link(g, c, col) {
      const a = (1 - c.k) * 0.9;
      const pts = lineDots(c.from.x, c.from.y, c.to.x, c.to.y, 6);
      band3(g, pts, 2, 4, col, a);
      for (const p of [c.from, c.to]) poly(g, hexPts(p.x, p.y, 4, c.clock / 480), col.core, a * 0.85);
    },
  },

  // ------------------------------------------------------------------
  // 雷霆风暴：云层落雷。命中是「乌云块 + 折线闪电 + 地面电弧环」。
  // ------------------------------------------------------------------
  thunder_storm: {
    silhouette: 'storm-cloud',
    trail: { max: 5, style: 'arc' },
    colors: STORM,
    opBudget: 78,
    projectile(g, c, col) {
      const a = 1 - c.k * 0.12;
      const spin = c.clock / 300;
      poly(g, hexPts(c.x, c.y, 6.5, spin), col.accent, a * 0.95);
      poly(g, hexPts(c.x, c.y, 4.2, -spin), col.body, a);
      for (let i = 0; i < 3; i++) {
        const ang = spin * 1.3 + (i / 3) * TAU;
        const p = offset(c.x, c.y, ang, 6, 0);
        poly(g, boltPts(c.x, c.y, p.x, p.y, i + 1, 2.2, 4), col.core, a * 0.85);
      }
      poly(g, hexPts(c.x, c.y, 2, spin), C.white, a);
    },
    trailFx(g, c, col) {
      drawTrail(g, c, col, { max: 5, farW: 2, nearW: 7, style: 'arc', sway: 0 });
    },
    cast(g, c, col) {
      const a = fade(c.k);
      const p = rise(c.k, 0.35);
      // 头顶两团乌云积起来，云缝里露电光
      for (let i = 0; i < 3; i++) {
        const dx = (i - 1) * 9;
        poly(g, hexPts(c.x + dx, c.y - 14 - 4 * p, 6 + 2 * p, 0.3 + i), col.edge, a * 0.8);
        poly(g, hexPts(c.x + dx, c.y - 14 - 4 * p, 4.6 + 1.6 * p, 0.3 + i), col.body, a * 0.85);
      }
      poly(g, boltPts(c.x, c.y - 12, c.x, c.y + 6, 7, 3, 5), col.core, a * 0.9);
      ring3(g, c.x, c.y + 8, 5 + 8 * p, 1.8, col, a * 0.6, { phase: c.clock / 400 });
    },
    impact(g, c, col) {
      const a = fade(c.k);
      const fl = peak(c.k, 0.14);
      const R = c.radius;
      const grow = R * (0.8 + 1.15 * rise(c.k, 0.5));
      const rot = c.clock / 380;
      // 乌云块：三团横排，越远越暗
      for (let i = 0; i < 3; i++) {
        const cx = c.x + (i - 1) * grow * 0.66;
        const cy = c.y - grow * 0.5;
        poly(g, hexPts(cx, cy, grow * 0.42, rot + i), col.edge, a * 0.85);
        poly(g, hexPts(cx, cy + 2, grow * 0.3, rot + i), col.body, a * 0.55);
      }
      // 四道落雷：从云缝劈到地面
      for (let i = 0; i < 4; i++) {
        const sx = c.x + (i - 1.5) * grow * 0.42;
        const ex = sx + (i % 2 === 0 ? 6 : -6);
        poly(g, boltPts(sx, c.y - grow * 0.32, ex, c.y + grow * 0.5, i + 11, grow * 0.12, 5), col.core, a * 0.95);
        poly(g, boltPts(sx, c.y - grow * 0.32, ex, c.y + grow * 0.5, i + 11, grow * 0.2, 5), col.accent, a * 0.4);
      }
      // 地面电弧环 + 中心白闪
      ring3(g, c.x, c.y + grow * 0.42, grow * 0.9, 2.6, col, a * 0.85, { phase: rot, squash: 0.42 });
      if (fl > 0.02) poly(g, hexPts(c.x, c.y + grow * 0.4, grow * 0.34 * (0.6 + fl), rot), col.core, fl);
      blocks(g, scatterPts(c.x, c.y + grow * 0.3, 6, 9, grow * 0.7, grow * 1.1), col.accent, a * 0.55, 2);
      dots(g, ringDots(c.x, c.y + grow * 0.42, grow * 1.25, 8, rot), col.core, a * 0.35);
    },
    ward(g, c, col) {
      const a = fade(c.k);
      const R = Math.max(6, c.radius);
      const rot = c.clock / 500;
      for (let i = 0; i < 5; i++) {
        const ang = rot + (i / 5) * TAU;
        const p = offset(c.x, c.y, ang, R * 0.78, 0);
        poly(g, hexPts(p.x, p.y, 6, ang), col.body, a * 0.8);
        poly(g, hexPts(p.x, p.y, 3.4, ang), col.core, a * 0.7);
      }
      ring3(g, c.x, c.y, R * 0.8, 1.8, col, a * 0.5, { phase: -rot });
    },
    link(g, c, col) {
      const a = (1 - c.k) * 0.95;
      const mid = { x: (c.from.x + c.to.x) / 2 + 4, y: (c.from.y + c.to.y) / 2 - 5 };
      band3(g, [c.from, mid, c.to], 1.6, 1.2, col, a);
      poly(g, boltPts(c.from.x, c.from.y, mid.x, mid.y, 3, 2, 3), col.core, a * 0.9);
      dots(g, [mid], C.white, a);
    },
  },

  // ------------------------------------------------------------------
  // 日轮耀斑：八芒日轮 + 命中十字光柱。
  // ------------------------------------------------------------------
  sunflare: {
    silhouette: 'sun-wheel',
    trail: { max: 6, style: 'ember' },
    colors: SUN,
    opBudget: 74,
    projectile(g, c, col) {
      const a = 1 - c.k * 0.1;
      const spin = c.clock / 300;
      // 外圈日珥 + 内圈轮辐
      ring3(g, c.x, c.y, 7, 2.2, col, a * 0.85, { phase: spin });
      poly(g, starPts(c.x, c.y, spin, 9, 3.6, 8), col.body, a * 0.95);
      poly(g, starPts(c.x, c.y, -spin, 5.5, 2.2, 8), col.core, a);
      poly(g, hexPts(c.x, c.y, 2.2, spin), C.white, a);
      dots(g, ringDots(c.x, c.y, 10, 8, spin), col.accent, a * 0.7);
    },
    trailFx(g, c, col) {
      drawTrail(g, c, col, { max: 6, farW: 2, nearW: 7, style: 'ember', sway: 1 });
    },
    cast(g, c, col) {
      const a = fade(c.k);
      const p = rise(c.k, 0.45);
      ring3(g, c.x, c.y, 7 + 14 * p, 2.4, col, a * 0.85, { phase: c.clock / 420 });
      poly(g, starPts(c.x, c.y, c.clock / 500, 10 + 7 * p, 3.4, 8), col.body, a * 0.9);
      poly(g, starPts(c.x, c.y, -c.clock / 500, 5 + 3 * p, 1.8, 8), col.core, a);
      dots(g, ringDots(c.x, c.y, 15 + 8 * p, 8, 0), col.accent, a * 0.7);
    },
    impact(g, c, col) {
      const a = fade(c.k);
      const fl = peak(c.k, 0.15);
      const R = c.radius;
      const grow = R * (0.9 + 1.1 * rise(c.k, 0.5));
      const rot = c.clock / 460;
      // 十字光柱：一横一竖两道粗带
      band3(g, [{ x: c.x - grow * 1.5, y: c.y }, { x: c.x + grow * 1.5, y: c.y }], grow * 0.12, grow * 0.04, col, a * 0.9);
      band3(g, [{ x: c.x, y: c.y - grow * 1.5 }, { x: c.x, y: c.y + grow * 1.5 }], grow * 0.12, grow * 0.04, col, a * 0.9);
      // 日冕双环
      ring3(g, c.x, c.y, grow * 0.72, 3.2, col, a * 0.85, { phase: rot });
      ring3(g, c.x, c.y, grow * 0.44, 1.8, col, a * 0.55, { phase: -rot });
      // 八芒星
      poly(g, starPts(c.x, c.y, rot, grow * 0.6, grow * 0.22, 8), col.body, a * 0.9);
      if (fl > 0.02) {
        poly(g, starPts(c.x, c.y, -rot, grow * 0.36 * (0.6 + fl * 0.6), grow * 0.14, 8), col.core, fl);
        poly(g, hexPts(c.x, c.y, grow * 0.16, rot), C.white, fl * 0.95);
      }
      dots(g, ringDots(c.x, c.y, grow * 1.35, 12, rot), col.accent, a * 0.5);
      blocks(g, scatterPts(c.x, c.y, 5, 3, grow * 1.1, grow * 1.5), col.accent, a * 0.5, 2);
    },
    ward(g, c, col) {
      const a = fade(c.k);
      const R = Math.max(6, c.radius);
      const rot = c.clock / 600;
      ring3(g, c.x, c.y, R * 0.86, 2.6, col, a * 0.7, { phase: rot });
      poly(g, starPts(c.x, c.y, -rot, R * 0.62, R * 0.2, 8), col.body, a * 0.8);
      poly(g, hexPts(c.x, c.y, R * 0.16, rot), col.core, a * 0.9);
    },
    link(g, c, col) {
      const a = (1 - c.k) * 0.95;
      band3(g, [c.from, c.to], 5, 2.4, col, a);
      dots(g, lineDots(c.from.x, c.from.y, c.to.x, c.to.y, 8), col.core, a * 0.6);
    },
  },

  // ------------------------------------------------------------------
  // 虚空之矛：细长暗矛，命中撕开一个吸积裂口。
  // ------------------------------------------------------------------
  void_lance: {
    silhouette: 'void-spear',
    trail: { max: 7, style: 'void' },
    colors: VOID,
    opBudget: 68,
    projectile(g, c, col) {
      const a = 1 - c.k * 0.1;
      // 矛体：暗轮廓包紫芯，尾部拖着吸入的碎粒
      shell(g, (s) => arrowPts(c.x, c.y, c.angle, 20 * s, 6 * s, 3.2 * s), col, a);
      for (let i = 0; i < 3; i++) {
        const p = offset(c.x, c.y, c.angle, -10 - i * 3, (i - 1) * 2);
        blocks(g, [p], col.accent, a * 0.8, 2);
      }
      poly(g, hexPts(c.x, c.y, 2, c.clock / 240), C.white, a);
    },
    trailFx(g, c, col) {
      drawTrail(g, c, col, { max: 7, farW: 1, nearW: 6, style: 'void', sway: 0.8 });
    },
    cast(g, c, col) {
      const a = fade(c.k);
      const p = rise(c.k, 0.4);
      // 矛尖前的空间被压出一个暗点
      ring3(g, c.x, c.y, 5 + 9 * p, 1.8, col, a * 0.7, { phase: c.clock / 380 });
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * TAU + c.clock / 700;
        const q = offset(c.x, c.y, ang, 8 + 10 * p, 0);
        blocks(g, [q], col.accent, a * 0.75, 2);
      }
      poly(g, arrowPts(c.x, c.y, c.angle ?? 0, 10, 3, 2), col.core, a * 0.9);
    },
    impact(g, c, col) {
      const a = fade(c.k);
      const fl = peak(c.k, 0.2);
      const R = c.radius;
      const grow = R * (0.8 + 1.2 * rise(c.k, 0.55));
      const rot = c.clock / 520;
      // 椭圆暗穴：外紫环 + 深色内腔
      poly(g, ringPts(c.x, c.y, grow * 0.88, 4, rot, 0.62, 20), col.accent, a * 0.9);
      poly(g, ringPts(c.x, c.y, grow * 0.86, 1.4, rot, 0.62, 20), col.core, a * 0.8);
      poly(g, ringPts(c.x, c.y, grow * 0.52, grow * 0.34, -rot, 0.62, 16), col.edge, a * 0.95);
      // 边缘碎块被吸向中心
      for (let i = 0; i < 8; i++) {
        const ang = rot + (i / 8) * TAU;
        const q = offset(c.x, c.y, ang, grow * (1.1 - 0.5 * rise(c.k, 0.7)), 0);
        blocks(g, [q], col.body, a * 0.7, 2);
      }
      if (fl > 0.02) poly(g, hexPts(c.x, c.y, grow * 0.14 * (0.5 + fl), rot), C.white, fl * 0.9);
      dots(g, ringDots(c.x, c.y, grow * 1.35, 10, rot), col.accent, a * 0.4);
    },
    ward(g, c, col) {
      const a = fade(c.k);
      const R = Math.max(6, c.radius);
      const rot = c.clock / 420;
      ring3(g, c.x, c.y, R * 0.84, 2.6, col, a * 0.65, { phase: rot });
      for (let i = 0; i < 8; i++) {
        const ang = -rot + (i / 8) * TAU;
        const q = offset(c.x, c.y, ang, R * (0.5 + 0.3 * (0.5 + 0.5 * Math.sin(c.clock / 300 + i))), 0);
        blocks(g, [q], col.body, a * 0.65, 2);
      }
    },
    link(g, c, col) {
      const a = (1 - c.k) * 0.9;
      const pts = lineDots(c.from.x, c.from.y, c.to.x, c.to.y, 7);
      band3(g, pts, 1.2, 0.8, col, a);
      dots(g, [c.to], C.white, a * 0.9);
    },
  },

  // ------------------------------------------------------------------
  // 圣所：三层穹顶从脚下展开，命中是一圈圣光立柱。
  // ------------------------------------------------------------------
  sanctum: {
    silhouette: 'sanctum-dome',
    trail: { max: 5, style: 'holy' },
    colors: HOLY,
    opBudget: 76,
    projectile(g, c, col) {
      const a = 1 - c.k * 0.12;
      const spin = c.clock / 500;
      ring3(g, c.x, c.y, 6, 2, col, a * 0.8, { phase: spin });
      poly(g, shape(c.x, c.y, c.angle, [[-8, 0], [0, -7], [8, 0], [0, 3]]), col.body, a * 0.95);
      poly(g, shape(c.x, c.y, c.angle, [[-3, 0], [0, -3], [3, 0], [0, 1.4]]), col.core, a);
    },
    trailFx(g, c, col) {
      drawTrail(g, c, col, { max: 5, farW: 2, nearW: 6, style: 'holy', sway: 0.6 });
    },
    cast(g, c, col) {
      const a = fade(c.k);
      const p = rise(c.k, 0.5);
      // 三层拱从地面升起
      for (let i = 0; i < 3; i++) {
        const rr = 8 + i * 4 + 12 * p;
        poly(g, ringPts(c.x, c.y, rr, 2, 0, 0.55, 18), col.body, a * (0.8 - i * 0.15));
      }
      poly(g, shape(c.x, c.y, 0, [[-10, 2], [0, -10 - 6 * p], [10, 2]]), col.accent, a * 0.5);
      dots(g, [offset(c.x, c.y, -Math.PI / 2, 0, 2)], C.white, a);
    },
    impact(g, c, col) {
      const a = fade(c.k);
      const fl = peak(c.k, 0.18);
      const R = c.radius;
      const grow = R * (0.85 + 1.05 * rise(c.k, 0.55));
      const rot = c.clock / 640;
      ring3(g, c.x, c.y, grow, 3.6, col, a * 0.9, { phase: rot });
      ring3(g, c.x, c.y, grow * 0.6, 2, col, a * 0.6, { phase: -rot });
      // 四根立柱 + 中央十字
      for (let i = 0; i < 4; i++) {
        const ang = rot + (i / 4) * TAU;
        const q = offset(c.x, c.y, ang, grow * 0.78, 0);
        rects(g, [[q.x - 1, q.y - grow * 0.3, 3, grow * 0.42]], col.body, a * 0.85);
        blocks(g, [q], col.core, a * 0.9, 2);
      }
      rects(g, [[c.x - 1, c.y - grow * 0.5, 3, grow * 0.9], [c.x - grow * 0.35, c.y - 1, grow * 0.7, 3]], col.core, a * 0.85);
      if (fl > 0.02) poly(g, hexPts(c.x, c.y, grow * 0.26 * (0.7 + fl), rot), col.core, fl);
      dots(g, ringDots(c.x, c.y, grow * 1.3, 12, rot), col.accent, a * 0.35);
    },
    ward(g, c, col) {
      const a = fade(c.k);
      const R = Math.max(6, c.radius);
      // 穹顶：三层半圆拱 + 基座
      for (let i = 0; i < 3; i++) {
        const rr = R * (0.9 - i * 0.24);
        poly(g, ringPts(c.x, c.y, rr, 2.2, c.clock / 900 + i * 0.4, 1, 16), col.body, a * (0.75 - i * 0.14));
        poly(g, ringPts(c.x, c.y, rr, 1.2, c.clock / 900 + i * 0.4, 1, 16), col.core, a * (0.5 - i * 0.1));
      }
      rects(g, [[c.x - R * 0.9, c.y + R * 0.72, R * 1.8, 2]], col.accent, a * 0.7);
      dots(g, [offset(c.x, c.y, -Math.PI / 2, 0, -R * 0.94)], C.white, a * 0.9);
    },
    link(g, c, col) {
      const a = (1 - c.k) * 0.9;
      const pts = lineDots(c.from.x, c.from.y, c.to.x, c.to.y, 6);
      band3(g, pts, 1.4, 1, col, a);
      for (const p of [c.from, c.to]) poly(g, starPts(p.x, p.y, c.clock / 700, 4.5, 1.8, 4), col.core, a * 0.85);
    },
  },

  // ------------------------------------------------------------------
  // 荆棘巨槌：巨槌砸地，石块崩起、裂缝里长出荆棘。
  // ------------------------------------------------------------------
  bramble_maul: {
    silhouette: 'bramble-maul',
    trail: { max: 5, style: 'root' },
    colors: WILD,
    opBudget: 80,
    projectile(g, c, col) {
      const a = 1 - c.k * 0.1;
      // 槌头（方块）+ 木柄 + 锯齿刃
      shell(g, (s) => shape(c.x, c.y, c.angle, [[-7 * s, -6 * s], [7 * s, -6 * s], [7 * s, 6 * s], [-7 * s, 6 * s]]), col, a);
      poly(g, shape(c.x, c.y, c.angle, [[-9, -7], [-4, -7], [-4, 7], [-9, 7]]), col.accent, a * 0.85);
      for (let i = 0; i < 3; i++) poly(g, spikePts(offset(c.x, c.y, c.angle, 7, (i - 1) * 4).x, offset(c.x, c.y, c.angle, 7, (i - 1) * 4).y, c.angle, 4, 1.6), col.core, a * 0.8);
    },
    trailFx(g, c, col) {
      drawTrail(g, c, col, { max: 5, farW: 2, nearW: 7, style: 'root', sway: 1.6 });
    },
    cast(g, c, col) {
      const a = fade(c.k);
      const p = rise(c.k, 0.45);
      // 高举的槌影 + 地面裂纹
      poly(g, shape(c.x, c.y, c.angle, [[-4, -10 - 4 * p], [4, -10 - 4 * p], [4, 2], [-4, 2]]), col.body, a * 0.55);
      for (let i = 0; i < 4; i++) {
        const ang = (i / 4) * TAU + 0.6;
        poly(g, spikePts(c.x, c.y, ang, 6 + 8 * p, 1.8), col.accent, a * 0.7);
      }
      poly(g, hexPts(c.x, c.y, 3, 0), col.core, a * 0.9);
    },
    impact(g, c, col) {
      const a = fade(c.k);
      const fl = peak(c.k, 0.16);
      const R = c.radius;
      const grow = R * (0.8 + 1.15 * rise(c.k, 0.5));
      const rot = c.clock / 600;
      // 槌头印：中央方石
      rects(g, [
        [c.x - grow * 0.34, c.y - grow * 0.5, grow * 0.68, grow * 0.42],
        [c.x - grow * 0.22, c.y - grow * 0.62, grow * 0.44, grow * 0.14],
      ], col.edge, a * 0.9);
      rects(g, [[c.x - grow * 0.28, c.y - grow * 0.46, grow * 0.56, grow * 0.3]], col.body, a * 0.95);
      // 四条裂缝从槌印爬出去
      for (let i = 0; i < 4; i++) {
        const ang = rot + (i / 4) * TAU;
        const end = offset(c.x, c.y, ang, grow * 1.15, 0);
        poly(g, boltPts(c.x, c.y, end.x, end.y, i + 21, grow * 0.1, 5), col.edge, a * 0.55);
      }
      // 荆棘从裂缝里长出来（尖刺朝外）
      for (let i = 0; i < 8; i++) {
        const ang = rot + (i / 8) * TAU;
        const len = grow * (i % 2 === 0 ? 0.9 : 0.62);
        poly(g, spikePts(c.x, c.y, ang, len, grow * 0.06), col.accent, a * 0.9);
        poly(g, spikePts(c.x, c.y, ang, len * 0.6, grow * 0.028), col.core, a * 0.7);
      }
      // 崩起的土块
      blocks(g, scatterPts(c.x, c.y, 10, 4, grow * 0.5, grow * 1.3), col.accent, a * 0.75, 2);
      if (fl > 0.02) rects(g, [[c.x - grow * 0.3, c.y - grow * 0.4, grow * 0.6, 2]], col.core, fl);
      ring3(g, c.x, c.y, grow * 0.95, 2.2, col, a * 0.6, { phase: rot, squash: 0.55 });
    },
    ward(g, c, col) {
      const a = fade(c.k);
      const R = Math.max(6, c.radius);
      const rot = c.clock / 700;
      for (let i = 0; i < 10; i++) {
        const ang = rot + (i / 10) * TAU;
        const q = offset(c.x, c.y, ang, R * 0.8, 0);
        poly(g, spikePts(q.x, q.y, ang + Math.PI, 8, 2.6), col.body, a * 0.8);
        poly(g, spikePts(q.x, q.y, ang + Math.PI, 4.4, 1.2), col.core, a * 0.65);
      }
      ring3(g, c.x, c.y, R * 0.72, 2, col, a * 0.45, { phase: -rot });
    },
    link(g, c, col) {
      const a = (1 - c.k) * 0.9;
      const mid = { x: (c.from.x + c.to.x) / 2, y: (c.from.y + c.to.y) / 2 + 4 };
      band3(g, [c.from, mid, c.to], 1.8, 1.2, col, a);
      blocks(g, [mid, c.to], col.core, a * 0.8, 2);
    },
  },

  // ------------------------------------------------------------------
  // 魂灵回声：正反两环对映旋转，命中处魂火外溢。
  // ------------------------------------------------------------------
  soul_echo: {
    silhouette: 'soul-echo',
    trail: { max: 6, style: 'soul' },
    colors: SOUL,
    opBudget: 72,
    projectile(g, c, col) {
      const a = 1 - c.k * 0.12;
      const spin = c.clock / 420;
      ring3(g, c.x, c.y, 6.4, 2, col, a * 0.9, { phase: spin, squash: 0.9 });
      ring3(g, c.x, c.y, 4, 1.4, col, a * 0.75, { phase: -spin, squash: 0.9 });
      for (let i = 0; i < 3; i++) {
        const ang = spin + (i / 3) * TAU;
        poly(g, spikePts(c.x, c.y, ang, 8, 1.8), col.accent, a * 0.85);
      }
      poly(g, hexPts(c.x, c.y, 2.2, spin), col.core, a);
    },
    trailFx(g, c, col) {
      drawTrail(g, c, col, { max: 6, farW: 2, nearW: 6, style: 'soul', sway: 1.8 });
    },
    cast(g, c, col) {
      const a = fade(c.k);
      const p = rise(c.k, 0.5);
      ring3(g, c.x, c.y, 7 + 12 * p, 2, col, a * 0.8, { phase: c.clock / 460 });
      ring3(g, c.x, c.y, 4 + 7 * p, 1.4, col, a * 0.6, { phase: -c.clock / 460 });
      // 三缕魂火向上飘
      for (let i = 0; i < 3; i++) {
        const q = offset(c.x, c.y, c.clock / 600 + i * 2.1, 6 + 4 * p, -8 - 6 * p);
        blocks(g, [q], col.core, a * 0.75, 2);
      }
      poly(g, hexPts(c.x, c.y, 3, c.clock / 500), C.white, a * 0.9);
    },
    impact(g, c, col) {
      const a = fade(c.k);
      const fl = peak(c.k, 0.2);
      const R = c.radius;
      const grow = R * (0.85 + 1.05 * rise(c.k, 0.55));
      const rot = c.clock / 540;
      // 正反双环：一大一小、方向相反
      ring3(g, c.x, c.y, grow, 3.2, col, a * 0.9, { phase: rot, squash: 0.92 });
      ring3(g, c.x, c.y, grow * 0.64, 2, col, a * 0.7, { phase: -rot * 1.4, squash: 0.92 });
      // 八缕魂丝向外散
      for (let i = 0; i < 8; i++) {
        const ang = rot + (i / 8) * TAU;
        const q = offset(c.x, c.y, ang, grow * (1.05 + 0.15 * Math.sin(c.clock / 240 + i)), 0);
        blocks(g, [q], col.accent, a * 0.7, 2);
      }
      if (fl > 0.02) poly(g, hexPts(c.x, c.y, grow * 0.2 * (0.6 + fl * 0.6), rot), col.core, fl);
      dots(g, ringDots(c.x, c.y, grow * 1.3, 10, -rot), col.core, a * 0.45);
    },
    ward(g, c, col) {
      const a = fade(c.k);
      const R = Math.max(6, c.radius);
      const rot = c.clock / 700;
      ring3(g, c.x, c.y, R * 0.84, 2.6, col, a * 0.6, { phase: rot });
      for (let i = 0; i < 6; i++) {
        const ang = -rot + (i / 6) * TAU;
        const q = offset(c.x, c.y, ang, R * 0.84, 0);
        blocks(g, [q], col.body, a * 0.8, 2);
      }
      poly(g, hexPts(c.x, c.y, R * 0.2, rot), col.core, a * 0.7);
    },
    link(g, c, col) {
      const a = (1 - c.k) * 0.9;
      const pts = lineDots(c.from.x, c.from.y, c.to.x, c.to.y, 7);
      band3(g, pts, 1.4, 1.2, col, a);
      for (const p of [c.from, c.to]) ring3(g, p.x, p.y, 3.6, 1.2, col, a * 0.8, { phase: c.clock / 400 });
    },
  },

  // ------------------------------------------------------------------
  // 冰川裂谷：长条冰墙拔地而起，墙顶锯齿、墙脚裂缝。
  // ------------------------------------------------------------------
  glacier: {
    silhouette: 'ice-wall',
    trail: { max: 6, style: 'frost' },
    colors: ICEWALL,
    opBudget: 74,
    projectile(g, c, col) {
      const a = 1 - c.k * 0.1;
      // 冰棱长矛：细长箭形 + 三片冰羽
      shell(g, (s) => arrowPts(c.x, c.y, c.angle, 18 * s, 5.5 * s, 3 * s), col, a);
      for (let i = 0; i < 3; i++) {
        const p = offset(c.x, c.y, c.angle, -4 - i * 3, i % 2 === 0 ? -2 : 2);
        poly(g, spikePts(p.x, p.y, c.angle + (i % 2 === 0 ? -1.2 : 1.2), 6, 1.8), col.accent, a * 0.85);
      }
      poly(g, hexPts(c.x, c.y, 2, c.clock / 320), C.white, a);
      dots(g, ringDots(c.x, c.y, 9, 6, c.clock / 400), col.accent, a * 0.65);
    },
    trailFx(g, c, col) {
      drawTrail(g, c, col, { max: 6, farW: 2, nearW: 7, style: 'frost', sway: 1 });
    },
    cast(g, c, col) {
      const a = fade(c.k);
      const p = rise(c.k, 0.45);
      // 脚下冰墙的预兆：一排尖刺从地里顶出
      for (let i = 0; i < 5; i++) {
        const dx = (i - 2) * 7;
        poly(g, spikePts(c.x + dx, c.y + 4, -Math.PI / 2, 6 + 10 * p, 2.4), col.body, a * 0.85);
      }
      ring3(g, c.x, c.y + 4, 6 + 10 * p, 2, col, a * 0.55, { phase: 0, squash: 0.5 });
    },
    impact(g, c, col) {
      const a = fade(c.k);
      const fl = peak(c.k, 0.16);
      const R = c.radius;
      const grow = R * (0.85 + 1.05 * rise(c.k, 0.5));
      const rot = c.clock / 700;
      const w = grow * 1.5;
      const h = grow * 0.9;
      // 冰墙主体：长矩形 + 顶部锯齿
      rects(g, [[c.x - w / 2, c.y - h * 0.5, w, h * 0.55]], col.edge, a * 0.9);
      rects(g, [[c.x - w / 2 + 1, c.y - h * 0.5 + 1, w - 2, h * 0.6 - 2]], col.body, a * 0.95);
      for (let i = 0; i < 7; i++) {
        const sx = c.x - w / 2 + (i + 0.5) * (w / 7);
        poly(g, spikePts(sx, c.y - h * 0.5, -Math.PI / 2, h * (i % 2 === 0 ? 0.55 : 0.35), 3), col.accent, a * 0.9);
        poly(g, spikePts(sx, c.y - h * 0.5, -Math.PI / 2, h * (i % 2 === 0 ? 0.3 : 0.18), 1.4), col.core, a * 0.7);
      }
      // 墙脚裂缝 + 霜点
      for (let i = 0; i < 4; i++) {
        const ang = rot + (i / 4) * TAU;
        const end = offset(c.x, c.y + h * 0.3, ang, grow * 0.95, 0);
        poly(g, boltPts(c.x, c.y + h * 0.3, end.x, end.y, i + 31, grow * 0.08, 4), col.edge, a * 0.5);
      }
      if (fl > 0.02) rects(g, [[c.x - w / 2, c.y - h * 0.5, w, 2]], col.core, fl);
      dots(g, ringDots(c.x, c.y, grow * 1.35, 10, rot), col.accent, a * 0.4);
    },
    ward(g, c, col) {
      const a = fade(c.k);
      const R = Math.max(6, c.radius);
      const rot = c.clock / 800;
      // 冰墙盾：环绕的矩形冰板
      for (let i = 0; i < 6; i++) {
        const ang = rot + (i / 6) * TAU;
        const q = offset(c.x, c.y, ang, R * 0.86, 0);
        rects(g, [[q.x - 5, q.y - 7, 10, 14]], col.edge, a * 0.8);
        rects(g, [[q.x - 4, q.y - 6, 8, 12]], col.body, a * 0.9);
        poly(g, spikePts(q.x, q.y - 6, -Math.PI / 2, 5, 2), col.core, a * 0.7);
      }
    },
    link(g, c, col) {
      const a = (1 - c.k) * 0.9;
      const pts = lineDots(c.from.x, c.from.y, c.to.x, c.to.y, 7);
      band3(g, pts, 2, 1.6, col, a);
      for (const p of [c.from, c.to]) poly(g, spikePts(p.x, p.y, -Math.PI / 2, 6, 2), col.core, a * 0.8);
    },
  },
};
