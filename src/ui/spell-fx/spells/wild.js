// 自然 / 守护组四法术（v2 大胆版）
//   thorn_vine 荆棘藤蔓 —— 动作：破土缠绕（双藤反相扭动；命中十根藤刺破土 + 缠绕圈由 1.6R 收紧到 0.7R）
//   soul_lance 噬魂之矛 —— 动作：紫雾拖拽（魂矢拖紫雾；命中魂火炸 + 4 条灵魂弧线朝 -angle 被抽走）
//   holy_ward  圣光壁垒 —— 动作：六面旋转盾（6 片实心盾面绕玩家转，招牌通道；六芒星展开 + 上升光柱）
//   aegis_ring 圣盾之环 —— 动作：双环反向符文（内外双环反向旋转 + 4 符文块夹在两环之间）
import { C } from '../../Palette.js';
import {
  poly, dots, blocks, shell, band, band3, ringPts, ring3, sectorPts, spikePts, blobPts,
  boltPts, hexPts, triPts, arrowPts, shape, offset, lineDots, ringDots, scatterPts,
  drawTrail, peak, rise, fade, hash01, TAU,
} from '../kit.js';

export const wild = {
  // ------------------------------------------------------------------
  // 荆棘藤蔓：破土缠绕。
  // 弹体是一根缠绕的藤（两条反相位粗藤 + 藤心实心团 + 骨白尖刺团 + 叶片），
  // 命中是「藤刺环破土」+「缠绕圈收紧」——收紧是本法术的签名动作，不做扩张环。
  // ------------------------------------------------------------------
  thorn_vine: {
    silhouette: 'thorn-coil',
    trail: { max: 8, style: 'leaf' },
    colors: { edge: C.outline, body: 0x849c6c, core: 0xd6efa8, accent: 0xe4dcc4 },
    opBudget: 93,
    projectile(g, c, col) {
      const x = c.x;
      const y = c.y;
      const angle = c.angle || 0;
      const a = 1 - c.k * 0.12;
      const w = c.clock / 320;
      // 藤心：中段实心团（16px 主体），两条藤绕过去才不会读成空心线
      shell(g, (s) => blobPts(x, y, 8.2 * s, 5, 7, 0.14, w * 0.3), col, a);
      // 两条交错粗藤（反相位、贴着实心团绕）—— 「缠绕」的读感
      for (let t = 0; t < 2; t++) {
        const pts = [];
        for (let i = 0; i < 7; i++) {
          const u = i / 6;
          const bulge = Math.sin(u * Math.PI) * 0.8 + 0.2;
          const ly = Math.sin(u * 8.6 + w + t * Math.PI) * 4.6 * bulge;
          pts.push(offset(x, y, angle, -13 + 26 * u, ly));
        }
        // 一深一亮两条藤：看得出「交错」而不是一团
        const vine = t === 0 ? col : { edge: col.edge, body: C.rot, core: col.body };
        band3(g, pts, 5, 4.4, vine, a * (t === 0 ? 1 : 0.95));
      }
      // 尖刺团：藤头是「荆棘锤」——一根长主刺 + 两对侧刺 + 两根后倒刺
      const main = offset(x, y, angle, 4, 0);
      poly(g, spikePts(main.x, main.y, angle, 12.5, 3.1, 0.44), col.accent, a * 0.95);
      for (let i = 0; i < 2; i++) {
        const side = i ? 1 : -1;
        const b = offset(x, y, angle, 0, side * 4.2);
        poly(g, spikePts(b.x, b.y, angle + side * (0.66 + Math.sin(w + i) * 0.06), 9, 2.7, 0.44), col.accent, a * 0.95);
        const r = offset(x, y, angle, -5, side * 4.6);
        poly(g, spikePts(r.x, r.y, angle + side * 2.1, 7.5, 2.3, 0.4), col.core, a * 0.9);
      }
      // 叶片：尾部上下交替甩出（比尖刺暗，退到后景）
      for (let i = 0; i < 4; i++) {
        const side = i % 2 ? 1 : -1;
        const p = offset(x, y, angle, -6 - i * 4.4, side * (5 + (i % 2)));
        poly(g, shape(p.x, p.y, angle + side * 0.8, [[7.4, 0], [0, -3.2], [-4, 0], [0, 3.2]]), C.rot, a * 0.9);
      }
      // 藤尖两点 + 中心白芯
      dots(g, [offset(x, y, angle, 13, -2), offset(x, y, angle, 14, 3)], col.core, a * 0.9);
      blocks(g, [{ x, y }], C.white, a * 0.85, 3);
    },
    trailFx(g, c, col) {
      drawTrail(g, c, col, { max: 8, farW: 2.2, nearW: 8, style: 'leaf', sway: 2.2 });
      if (c.trail.length < 3) return;
      // 藤倒刺：沿尾迹再插三根骨白尖刺 —— 只有荆棘拖尾这样
      for (let i = 0; i < 3; i++) {
        const p = c.trail[Math.max(0, c.trail.length - 1 - i * 2)];
        const ang = (c.angle || 0) + (i % 2 ? 1.15 : -1.15);
        poly(g, spikePts(p.x, p.y, ang, 7, 2.3), col.accent, fade(c.k) * 0.8);
      }
    },
    cast(g, c, col) {
      const a = fade(c.k);
      const p = rise(c.k, 0.5);
      const w = c.clock / 400;
      // 脚下预警：裂土圈（预警环必须由小到大）
      ring3(g, c.x, c.y, 6 + 20 * p, 3.4, col, a * 0.85, { phase: -w });
      poly(g, ringPts(c.x, c.y, 10 + 26 * p, 2.2, w, 0.82, 18), col.edge, a * 0.5);
      // 两根藤芽破土：一左一右斜着顶起来
      for (let t = 0; t < 2; t++) {
        const side = t ? 1 : -1;
        const pts = [];
        for (let i = 0; i < 4; i++) {
          const u = i / 3;
          const h = (7 + 20 * p) * u;
          pts.push(offset(c.x, c.y, side * 0.5, side * (3 + u * 7), -h + Math.sin(u * 4 + w) * 1.6));
        }
        band3(g, pts, 4.4, 1.8, col, a * 0.95);
        const tip = pts[3];
        poly(g, spikePts(tip.x, tip.y, -Math.PI / 2 + side * 0.5, 7 + 5 * p, 2.6), col.accent, a * 0.9);
        for (let l = 0; l < 2; l++) {
          poly(g, shape(tip.x, tip.y, side * (0.7 + l * 0.9), [[6, 0], [0, -2.8], [-3.5, 0], [0, 2.8]]), col.body, a * 0.85);
        }
      }
      // 土屑 + 中心白点
      dots(g, scatterPts(c.x, c.y, 6, 13, 12 + 10 * p, 22 + 16 * p), col.accent, a * 0.6);
      blocks(g, [{ x: c.x, y: c.y }], C.white, a * 0.8, 3);
    },
    impact(g, c, col) {
      const a = fade(c.k);
      const fl = peak(c.k, 0.16);
      const R = c.radius;
      const rot = c.clock / 900;
      const grow = R * (0.86 + 0.62 * rise(c.k, 0.5));
      // 破土：脚下翻起的土盘（暗色实心环，先给「地面被顶开」的底）
      poly(g, ringPts(c.x, c.y, grow * 0.92, grow * 0.62, rot, 1, 18), col.edge, a * 0.6);
      // 10 根藤刺从圈内朝外钻出，高 0.6~1.2R（根部藏进圈里，刺尖挑出圈外）
      for (let i = 0; i < 10; i++) {
        const ang = rot + (i / 10) * TAU;
        const h = R * (0.55 + 0.6 * hash01(i * 13 + 5)) + grow * 0.24;
        const base = offset(c.x, c.y, ang, grow * 0.62, 0);
        poly(g, spikePts(base.x, base.y, ang, h, R * 0.058 + 2.8, 0.42), col.body, a * 0.95);
        poly(g, spikePts(base.x, base.y, ang, h * 0.58, R * 0.026 + 1.5, 0.3), col.core, a * 0.9);
      }
      // —— 关键动作：缠绕圈收紧（1.6R → 0.7R，粗 4px）——
      const coil = R * (1.6 - 0.9 * rise(c.k, 0.85));
      ring3(g, c.x, c.y, coil, 4.4, col, a * 0.95, { phase: -rot * 1.6 });
      ring3(g, c.x, c.y, coil * 0.84, 3.2, col, a * 0.8, { phase: rot * 2.2, squash: 0.92 });
      // 被收紧圈拽进去的叶片（半径随 k 变小）
      for (let i = 0; i < 6; i++) {
        const ang = rot * 1.4 + (i / 6) * TAU;
        const p = offset(c.x, c.y, ang, coil * 0.92, 0);
        poly(g, shape(p.x, p.y, ang + 1.25, [[5.5, 0], [0, -2.8], [-3.4, 0], [0, 2.8]]), col.accent, a * 0.85);
      }
      // 命中瞬间：中心白闪 + 亮核
      if (fl > 0.02) {
        poly(g, shape(c.x, c.y, rot * 1.3, [[9, 0], [0, -9], [-9, 0], [0, 9]].map(([qx, qy]) => [qx * (0.6 + fl * 0.7), qy * (0.6 + fl * 0.7)])), col.core, fl * 0.95);
        poly(g, hexPts(c.x, c.y, 6 * (0.55 + fl * 0.6), rot * 2.1), C.white, fl);
        blocks(g, [{ x: c.x, y: c.y }], C.white, fl, 3);
      }
      // 余韵：崩出来的土渣 + 残刺点
      blocks(g, scatterPts(c.x, c.y, 9, 3, grow * 1.0, grow * 1.62), col.body, a * 0.7, 2);
      dots(g, scatterPts(c.x, c.y, 10, 7, coil * 0.4, coil * 1.05), col.accent, a * 0.45);
    },
    ward(g, c, col) {
      const a = fade(c.k);
      const R = Math.max(8, c.radius);
      const rot = c.clock / 800;
      // 藤环护体：三圈粗细不同的藤带（后两圈反向）
      ring3(g, c.x, c.y, R * 0.88, 3.8, col, a * 0.8, { phase: rot });
      ring3(g, c.x, c.y, R * 0.66, 2.8, col, a * 0.6, { phase: -rot * 1.7 });
      // 4 根从环上长出的藤刺
      for (let i = 0; i < 4; i++) {
        const ang = rot * 1.3 + (i / 4) * TAU;
        const p = offset(c.x, c.y, ang, R * 0.88, 0);
        poly(g, spikePts(p.x, p.y, ang, R * 0.28 + 5, 3.2), col.body, a * 0.95);
        poly(g, spikePts(p.x, p.y, ang, (R * 0.28 + 5) * 0.55, 1.4), col.core, a * 0.85);
        blocks(g, [p], col.accent, a * 0.9, 2);
      }
      dots(g, ringDots(c.x, c.y, R * 0.88, 8, -rot), col.accent, a * 0.5);
    },
    link(g, c, col) {
      const a = (1 - c.k) * 0.95;
      const pts = lineDots(c.from.x, c.from.y, c.to.x, c.to.y, 6);
      band3(g, pts, 2.2, 4.6, col, a);
      // 沿藤绳长叶
      for (let i = 1; i < pts.length; i += 2) {
        const side = i % 4 ? 1 : -1;
        poly(g, shape(pts[i].x, pts[i].y, side * 1.1, [[5.5, 0], [0, -2.6], [-3.2, 0], [0, 2.6]]), col.accent, a * 0.85);
      }
      poly(g, spikePts(c.to.x, c.to.y, -Math.PI / 2, 8, 2.8), col.core, a * 0.9);
      blocks(g, [c.to], C.white, a, 2);
    },
  },

  // ------------------------------------------------------------------
  // 噬魂之矛：紫雾拖拽。
  // 弹体是魂矢（长菱形 + 双飘带 + 外围紫雾团 + 亮箭尖），
  // 命中是魂火炸（紫雾团 + 亮芯）+ 4 条灵魂弧线朝 -angle 被抽走。
  // ------------------------------------------------------------------
  soul_lance: {
    silhouette: 'soul-arrow',
    trail: { max: 8, style: 'wisp' },
    colors: { edge: C.outline, body: 0xb8a0ff, core: 0xe8e0ff, accent: 0x8fe89a },
    opBudget: 78,
    projectile(g, c, col) {
      const x = c.x;
      const y = c.y;
      const angle = c.angle || 0;
      const a = 1 - c.k * 0.1;
      const w = c.clock / 300;
      // 外围紫雾团：三层 blob，低 alpha，缓慢翻滚
      poly(g, blobPts(x, y, 17, 24, 10, 0.36, -w * 0.22), col.body, a * 0.18);
      poly(g, blobPts(x, y, 13.5, 21, 9, 0.32, w * 0.3), col.body, a * 0.3);
      poly(g, blobPts(x, y, 10.5, 22, 8, 0.28, -w * 0.45), col.body, a * 0.26);
      poly(g, blobPts(x, y, 7.4, 23, 7, 0.22, w * 0.6), col.core, a * 0.24);
      // 魂矢本体：长菱形（16px 主体）
      shell(g, (s) => arrowPts(x, y, angle, 16 * s, 9.5 * s, 4.4 * s), col, a);
      // 双飘带：箭身后方交错甩出
      for (let t = 0; t < 2; t++) {
        const pts = [];
        for (let i = 0; i < 4; i++) {
          const u = i / 3;
          const ly = Math.sin(u * 4.6 + w + t * Math.PI) * (2.4 + 4.2 * u);
          pts.push(offset(x, y, angle, -6 - 13 * u, ly));
        }
        band(g, pts, 1.4, 3.8, t ? col.accent : col.core, a * 0.85);
      }
      // 亮箭尖 + 中心白点 + 两颗被甩下的魂光
      const tip = offset(x, y, angle, 8, 0);
      poly(g, arrowPts(tip.x, tip.y, angle, 9, 6, 2.6), col.core, a);
      blocks(g, [{ x, y }], C.white, a * 0.9, 3);
      dots(g, [
        offset(x, y, angle, -16, 4), offset(x, y, angle, -19, -3),
        offset(x, y, angle, -8, 9), offset(x, y, angle, 2, -10),
      ], col.accent, a * 0.85);
    },
    trailFx(g, c, col) {
      drawTrail(g, c, col, { max: 8, farW: 2, nearW: 7.4, style: 'wisp', sway: 1.8 });
      if (c.trail.length < 2) return;
      // 雾尾：沿尾迹撒三团低 alpha 紫雾
      const a = fade(c.k);
      for (let i = 0; i < 3; i++) {
        const p = c.trail[Math.max(0, c.trail.length - 2 - i * 2)];
        poly(g, blobPts(p.x, p.y, 4.6 + i, 31 + i, 6, 0.34, c.clock / 600 + i), col.body, a * 0.22);
      }
    },
    cast(g, c, col) {
      const a = fade(c.k);
      const p = rise(c.k, 0.45);
      const w = c.clock / 340;
      // 脚下魂雾盘（预警环）
      ring3(g, c.x, c.y, 5 + 18 * p, 3.4, col, a * 0.85, { phase: w });
      poly(g, blobPts(c.x, c.y, 8 + 16 * p, 41, 9, 0.3, -w * 0.4), col.body, a * 0.22);
      // 三道魂丝从雾里被抽上来（汇聚到一点）
      ring3(g, c.x, c.y, 3 + 12 * p, 2.2, col, a * 0.5, { phase: -w * 1.6 });
      for (let t = 0; t < 5; t++) {
        const ang = (t / 5) * TAU + w;
        const pts = [];
        for (let i = 0; i < 4; i++) {
          const u = i / 3;
          const r = (24 - 15 * p) * (1 - u * 0.92);
          pts.push(offset(c.x, c.y, ang + u * 0.8, r, -u * 4));
        }
        band(g, pts, 1, 3.4, t % 2 ? col.body : col.accent, a * 0.85);
      }
      // 魂矢在中心显形
      if (p > 0.15) {
        shell(g, (s) => arrowPts(c.x, c.y, -Math.PI / 2, 12 * p * s, 7 * p * s, 3.4 * p * s), col, a * 0.95);
      }
      blocks(g, [{ x: c.x, y: c.y }], C.white, a * 0.9, 3);
      dots(g, ringDots(c.x, c.y, 8 + 18 * p, 6, -w), col.accent, a * 0.6);
    },
    impact(g, c, col) {
      const a = fade(c.k);
      const fl = peak(c.k, 0.15);
      const R = c.radius;
      const ang = c.angle || 0;
      const back = ang + Math.PI;
      const w = c.clock / 380;
      const grow = R * (0.8 + 0.92 * rise(c.k, 0.55));
      // 魂火炸：紫雾三层（外圈散得最开）+ 亮芯
      poly(g, blobPts(c.x, c.y, grow * 1.4, 33, 11, 0.34, -w * 0.3), col.body, a * 0.26);
      shell(g, (s) => blobPts(c.x, c.y, grow * 0.82 * s, 31, 10, 0.3, w * 0.5), col, a * 0.95);
      poly(g, blobPts(c.x, c.y, grow * 1.12, 32, 9, 0.3, w * 0.4), col.body, a * 0.3);
      // 魂环（外扩残环）
      ring3(g, c.x, c.y, grow * 1.45, 3.2, col, a * 0.6, { phase: -w, squash: 0.88 });
      // —— 关键动作：4 条灵魂弧线朝 -angle 被抽走 ——
      for (let i = 0; i < 6; i++) {
        const spread = (i - 2.5) * 0.26;
        const len = R * (1.3 + 1.05 * rise(c.k, 0.72));
        const end = offset(c.x, c.y, back + spread, len, Math.sin(i * 1.3 + w) * R * 0.16);
        const arc = boltPts(c.x, c.y, end.x, end.y, 41 + i, R * 0.15, 6);
        const soul = i % 3 === 1 ? { edge: col.edge, body: col.accent, core: col.core } : col;
        band3(g, arc, 5.6, 1.4, soul, a * 0.92);
      }
      // 地面焦痕：被魂火舔过的暗斑
      poly(g, ringPts(c.x, c.y, grow * 1.05, grow * 0.55, -w * 0.5, 0.62, 16), col.edge, a * 0.45);
      // 命中瞬间：中心白闪
      if (fl > 0.02) {
        poly(g, ringPts(c.x, c.y, grow * 0.36 * (0.55 + fl * 0.7), grow * 0.26, w, 1, 14), C.white, fl * 0.95);
        blocks(g, [{ x: c.x, y: c.y }], C.white, fl, 7);
      }
      // 魂光点 + 被抽走的碎魂
      dots(g, scatterPts(c.x, c.y, 10, 9, grow * 0.9, grow * 1.7), col.accent, a * 0.7);
      blocks(g, ringDots(c.x, c.y, grow * 1.85, 6, w), col.core, a * 0.5, 2);
      dots(g, [offset(c.x, c.y, back, R * 1.9 * rise(c.k, 0.9), 0)], col.core, a * 0.8);
    },
    ward(g, c, col) {
      const a = fade(c.k);
      const R = Math.max(8, c.radius);
      const rot = c.clock / 700;
      // 魂环：外圈慢转、内圈反向
      ring3(g, c.x, c.y, R * 0.92, 3.4, col, a * 0.5, { phase: rot });
      ring3(g, c.x, c.y, R * 0.64, 2.2, col, a * 0.35, { phase: -rot * 1.6 });
      // 3 团鬼火绕环（每团：三层本体 + 火光晕 + 拖尾魂丝 + 白点）
      for (let i = 0; i < 3; i++) {
        const ang = rot + (i / 3) * TAU;
        const p = offset(c.x, c.y, ang, R * 0.92, 0);
        shell(g, (s) => blobPts(p.x, p.y, 8 * s, 51 + i, 8, 0.3, rot + i), col, a * 0.95);
        poly(g, ringPts(p.x, p.y, 10.5, 2.4, -rot, 1, 12), col.accent, a * 0.65);
        const tail = [];
        for (let j = 0; j < 3; j++) {
          tail.push(offset(c.x, c.y, ang - 0.26 * (j + 1), R * 0.92, Math.sin(j * 1.2 + rot) * 3));
        }
        band(g, tail, 1, 3.2, col.accent, a * 0.6);
        blocks(g, [p], C.white, a * 0.9, 2);
      }
      // 环上的魂点
      dots(g, ringDots(c.x, c.y, R * 0.92, 6, -rot * 1.3), col.core, a * 0.6);
    },
    link(g, c, col) {
      const a = (1 - c.k) * 0.95;
      const pts = lineDots(c.from.x, c.from.y, c.to.x, c.to.y, 6);
      const wave = pts.map((p, i) => ({ x: p.x, y: p.y + Math.sin(i * 1.35 + c.clock / 200) * 3.2 }));
      band3(g, wave, 2.2, 4.4, col, a);
      // 魂丝：主丝带两侧各一条
      band(g, pts.map((p, i) => ({ x: p.x, y: p.y - 4 - (i % 2) * 2 })), 1, 2, col.accent, a * 0.7);
      for (let i = 1; i < pts.length; i += 2) {
        poly(g, blobPts(pts[i].x, pts[i].y, 4, 61 + i, 5, 0.3, c.clock / 500), col.body, a * 0.4);
      }
      poly(g, ringPts(c.to.x, c.to.y, 6, 2.4, c.clock / 320), col.core, a * 0.9);
      blocks(g, [c.to], C.white, a, 2);
    },
  },

  // ------------------------------------------------------------------
  // 圣光壁垒：六面旋转盾（ward 是主角，指令数 100+）。
  // 6 片实心盾面（sectorPts 三层）+ 每片一条亮芯 + 片间圣光连接 + 外圈符文块。
  // ------------------------------------------------------------------
  holy_ward: {
    silhouette: 'shield-hex6',
    trail: { max: 6, style: 'rune' },
    colors: { edge: C.outline, body: 0xf0d9a8, core: 0xfff6e0, accent: 0xe0c35a },
    opBudget: 124,
    projectile(g, c, col) {
      const x = c.x;
      const y = c.y;
      const angle = c.angle || 0;
      const a = 1 - c.k * 0.1;
      const rot = c.clock / 420;
      // 盾形本体：短粗六边形（三层）
      shell(g, (s) => hexPts(x, y, 8.6 * s, rot), col, a);
      // 前后两道圣光边（飞行方向上的盾脊）
      for (let t = 0; t < 2; t++) {
        const dir = t ? 1 : -1;
        const p = offset(x, y, angle, dir * 9, 0);
        poly(g, shape(p.x, p.y, angle, [[3.4, 0], [0, -6.4], [-2.2, 0], [0, 6.4]]), col.core, a * 0.95);
      }
      // 六角亮角（6 个尖角）
      for (let i = 0; i < 6; i++) {
        const ang = rot + (i / 6) * TAU;
        const p = offset(x, y, 0, Math.cos(ang) * 8, Math.sin(ang) * 8);
        poly(g, spikePts(p.x, p.y, ang, 5.2, 2.2), col.accent, a * 0.9);
      }
      // 盾心符点：绕中心三颗，读作「符文之盾」而不是一块石头
      for (let i = 0; i < 3; i++) {
        blocks(g, [offset(x, y, -rot + (i / 3) * TAU, 4.6, 0)], col.core, a * 0.9, 2);
      }
      blocks(g, [{ x, y }], C.white, a * 0.9, 4);
    },
    trailFx(g, c, col) {
      drawTrail(g, c, col, { max: 6, farW: 1.8, nearW: 6.6, style: 'rune', sway: 0.9 });
      if (c.trail.length < 2) return;
      // 圣符余晖：尾迹上挂两枚小盾
      const a = fade(c.k);
      for (let i = 0; i < 2; i++) {
        const p = c.trail[Math.max(0, c.trail.length - 2 - i * 2)];
        poly(g, hexPts(p.x, p.y, 4.6 - i, c.clock / 600 + i), col.body, a * 0.6);
      }
    },
    cast(g, c, col) {
      const a = fade(c.k);
      const p = rise(c.k, 0.45);
      const rot = c.clock / 900;
      // 脚下预警环
      ring3(g, c.x, c.y, 6 + 20 * p, 3.6, col, a * 0.85, { phase: rot });
      // 六芒星从脚下展开：两个三角形三层
      shell(g, (s) => triPts(c.x, c.y, (6 + 27 * p) * s, rot * 0.6), col, a * 0.95);
      shell(g, (s) => triPts(c.x, c.y, (6 + 27 * p) * s, rot * 0.6 + Math.PI / 3), col, a * 0.85);
      // 向上抽起的金色光柱（三层）
      const h = 26 + 24 * p;
      poly(g, shape(c.x, c.y, 0, [[-7, 0], [-4.4, -h], [4.4, -h], [7, 0]]), col.edge, a * 0.9);
      poly(g, shape(c.x, c.y, 0, [[-5, 0], [-3, -h * 0.96], [3, -h * 0.96], [5, 0]]), col.body, a);
      poly(g, shape(c.x, c.y, 0, [[-2, 0], [-1.4, -h * 0.82], [1.4, -h * 0.82], [2, 0]]), col.core, a * 0.95);
      // 6 颗符文沿六芒星角就位
      for (let i = 0; i < 6; i++) {
        const q = offset(c.x, c.y, rot + (i / 6) * TAU, 9 + 23 * p, 0);
        poly(g, hexPts(q.x, q.y, 3.4, rot * 1.4 + i), col.accent, a * 0.9);
      }
      dots(g, ringDots(c.x, c.y, (9 + 23 * p) * 1.5, 8, -rot), col.core, a * 0.65);
      blocks(g, [{ x: c.x, y: c.y }], C.white, a * 0.9, 4);
    },
    impact(g, c, col) {
      const a = fade(c.k);
      const fl = peak(c.k, 0.14);
      const R = c.radius;
      const rot = c.clock / 800;
      const grow = R * (0.86 + 1.14 * rise(c.k, 0.6));
      // 六芒星爆：两个大三角 + 中心实心六边
      shell(g, (s) => triPts(c.x, c.y, grow * 0.84 * s, rot), col, a * 0.95);
      shell(g, (s) => triPts(c.x, c.y, grow * 0.84 * s, rot + Math.PI / 3), col, a * 0.85);
      shell(g, (s) => hexPts(c.x, c.y, grow * 0.34 * s, -rot), col, a);
      // 圣光柱（竖直，1.6R 高，三层）
      const hh = grow * 1.55;
      poly(g, shape(c.x, c.y, 0, [[-grow * 0.17, 0], [-grow * 0.09, -hh], [grow * 0.09, -hh], [grow * 0.17, 0]]), col.edge, a * 0.9);
      poly(g, shape(c.x, c.y, 0, [[-grow * 0.12, 0], [-grow * 0.06, -hh], [grow * 0.06, -hh], [grow * 0.12, 0]]), col.body, a);
      poly(g, shape(c.x, c.y, 0, [[-grow * 0.05, 0], [-grow * 0.022, -hh * 0.92], [grow * 0.022, -hh * 0.92], [grow * 0.05, 0]]), col.core, a * 0.95);
      // 双重圣环（一顺一逆）
      ring3(g, c.x, c.y, grow, 4.2, col, a * 0.9, { phase: rot });
      ring3(g, c.x, c.y, grow * 0.6, 2.8, col, a * 0.6, { phase: -rot * 1.6 });
      // 6 道圣光射线（沿六芒星角捅出去）
      for (let i = 0; i < 6; i++) {
        const ang = rot + (i / 6) * TAU;
        band3(g, [offset(c.x, c.y, ang, grow * 0.48, 0), offset(c.x, c.y, ang, grow * 1.5, 0)], 4.8, 1.4, col, a * 0.8);
      }
      // 命中瞬间中心白闪
      if (fl > 0.02) {
        poly(g, hexPts(c.x, c.y, grow * 0.3 * (0.6 + fl * 0.6), rot * 1.5), col.core, fl * 0.95);
        blocks(g, [{ x: c.x, y: c.y }], C.white, fl, 7);
      }
      // 余韵：符文块 + 圣光点 + 地面光斑
      blocks(g, ringDots(c.x, c.y, grow * 1.3, 8, rot), col.accent, a * 0.6, 2);
      dots(g, scatterPts(c.x, c.y, 8, 5, grow * 1.1, grow * 1.75), col.core, a * 0.5);
      poly(g, ringPts(c.x, c.y, grow * 0.94, 2.2, -rot, 0.55, 16), col.accent, a * 0.35);
    },
    ward(g, c, col) {
      const a = fade(c.k);
      const R = Math.max(10, c.radius);
      const rot = c.clock / 900;
      const half = 0.40;
      // 外圈符文带（逆向慢转）+ 内圈
      ring3(g, c.x, c.y, R * 1.06, 2.6, col, a * 0.55, { phase: -rot * 0.6 });
      ring3(g, c.x, c.y, R * 0.58, 2.2, col, a * 0.4, { phase: rot * 1.4 });
      // —— 6 片实心盾面：每片三层体积 + 一条亮芯 + 顶端符文钉 ——
      for (let i = 0; i < 6; i++) {
        const ang = rot + (i / 6) * TAU;
        const r0 = R * 0.7;
        const r1 = R * 1.0;
        shell(g, (s) => sectorPts(c.x, c.y, r0 * s, r1 * s, ang - half, ang + half, 4), col, a * 0.95);
        // 亮芯：盾面中线一条窄扇（「每片带一条亮芯」）
        poly(g, sectorPts(c.x, c.y, r0 + 3, r1 - 2, ang - 0.05, ang + 0.05, 2), col.core, a * 0.95);
        // 盾面顶端的符文钉
        const pin = offset(c.x, c.y, ang, r1 + 4, 0);
        poly(g, hexPts(pin.x, pin.y, 3.6, ang), col.accent, a * 0.95);
        blocks(g, [pin], col.core, a * 0.9, 2);
      }
      // 片间圣光连接（6 条短桥，盾面之间的缝也在发光）
      for (let i = 0; i < 6; i++) {
        const ang = rot + ((i + 0.5) / 6) * TAU;
        band(g, [offset(c.x, c.y, ang, R * 0.72, 0), offset(c.x, c.y, ang, R * 1.12, 0)], 2.6, 1.2, col.accent, a * 0.7);
      }
      // 外圈 10 颗符文块（逆向）+ 8 点圣光
      blocks(g, ringDots(c.x, c.y, R * 1.18, 10, -rot * 0.8), col.accent, a * 0.8, 2);
      dots(g, ringDots(c.x, c.y, R * 1.3, 8, rot * 1.1), col.body, a * 0.55);
      // 中央六边形淡光 + 白点
      shell(g, (s) => hexPts(c.x, c.y, R * 0.34 * s, rot * 0.5), col, a * 0.55);
      blocks(g, [{ x: c.x, y: c.y }], C.white, a * 0.85, 3);
    },
    link(g, c, col) {
      const a = (1 - c.k) * 0.95;
      const pts = lineDots(c.from.x, c.from.y, c.to.x, c.to.y, 6);
      band3(g, pts, 2.6, 5, col, a);
      // 沿途金色符块
      for (let i = 1; i < pts.length; i += 2) {
        poly(g, hexPts(pts[i].x, pts[i].y, 4, c.clock / 500 + i), col.accent, a * 0.85);
      }
      poly(g, hexPts(c.to.x, c.to.y, 6.5, -c.clock / 400), col.core, a * 0.9);
      blocks(g, [c.to], C.white, a, 2);
    },
  },

  // ------------------------------------------------------------------
  // 圣盾之环：双环反向符文。
  // ward 内外双环反向旋转（粗 4px）+ 4 个符文块夹在两环之间 + 中心淡光；
  // 命中是符文冲击波（双重外扩环 + 4 符文块向外弹）+ 反向双环余波。
  // ------------------------------------------------------------------
  aegis_ring: {
    silhouette: 'twin-ring',
    trail: { max: 7, style: 'ring' },
    colors: { edge: C.outline, body: 0xc8e8d0, core: 0xf4fff8, accent: 0x5ed0c8 },
    opBudget: 81,
    projectile(g, c, col) {
      const x = c.x;
      const y = c.y;
      const a = 1 - c.k * 0.1;
      const rot = c.clock / 380;
      // 外/内双环反向（粗环带 = 体积）
      ring3(g, x, y, 10, 3.8, col, a, { phase: rot });
      ring3(g, x, y, 5.6, 3, col, a * 0.9, { phase: -rot * 1.7 });
      // 夹在两环之间的 4 个符文块
      for (let i = 0; i < 4; i++) {
        const q = offset(x, y, rot * 0.8 + (i / 4) * TAU, 8, 0);
        poly(g, shape(q.x, q.y, rot + i, [[4.4, 0], [0, -4.4], [-4.4, 0], [0, 4.4]]), col.accent, a * 0.95);
        blocks(g, [q], col.core, a * 0.9, 2);
      }
      blocks(g, [{ x, y }], C.white, a, 3);
    },
    trailFx(g, c, col) {
      drawTrail(g, c, col, { max: 7, farW: 1.6, nearW: 6.2, style: 'ring', sway: 1.1 });
      if (c.trail.length < 2) return;
      // 尾迹上的双环残影（一大一小、反向）
      const a = fade(c.k);
      for (let i = 0; i < 2; i++) {
        const p = c.trail[Math.max(0, c.trail.length - 2 - i * 2)];
        poly(g, ringPts(p.x, p.y, 6 - i * 2, 2.2, c.clock / 500 * (i ? -1 : 1), 1, 10), col.accent, a * 0.55);
      }
    },
    cast(g, c, col) {
      const a = fade(c.k);
      const p = rise(c.k, 0.45);
      const rot = c.clock / 700;
      // 双环从脚下反向展开
      ring3(g, c.x, c.y, 5 + 21 * p, 3.8, col, a * 0.9, { phase: rot });
      ring3(g, c.x, c.y, 3 + 15 * p, 3.2, col, a * 0.8, { phase: -rot * 1.8 });
      ring3(g, c.x, c.y, 4 + 27 * p, 2, col, a * 0.4, { phase: rot * 2.4 });
      // 4 个符文沿两环之间就位
      for (let i = 0; i < 4; i++) {
        const ang = rot * 0.6 + (i / 4) * TAU;
        const q = offset(c.x, c.y, ang, (6 + 20 * p) * 0.84, 0);
        poly(g, shape(q.x, q.y, ang, [[5, 0], [0, -5], [-5, 0], [0, 5]]), col.accent, a * 0.9);
        band(g, [offset(c.x, c.y, ang, 4 + 13 * p, 0), q], 1.8, 1.2, col.core, a * 0.6);
      }
      // 中心淡光
      shell(g, (s) => hexPts(c.x, c.y, (3 + 9 * p) * s, rot * 0.5), col, a * 0.5);
      blocks(g, [{ x: c.x, y: c.y }], C.white, a * 0.85, 3);
    },
    impact(g, c, col) {
      const a = fade(c.k);
      const fl = peak(c.k, 0.15);
      const R = c.radius;
      const rot = c.clock / 600;
      const grow = R * (0.9 + 1.12 * rise(c.k, 0.6));
      // 冲击波双重环（外扩）
      ring3(g, c.x, c.y, grow, 4.4, col, a * 0.95, { phase: rot });
      ring3(g, c.x, c.y, grow * 0.76, 3.4, col, a * 0.8, { phase: -rot * 1.7 });
      // 反向双环（内收余波）
      ring3(g, c.x, c.y, grow * 0.5, 2.6, col, a * 0.55, { phase: rot * 2.2 });
      ring3(g, c.x, c.y, grow * 0.3, 2, col, a * 0.4, { phase: -rot * 2.8 });
      // 内圈 4 颗小符文（跟着双环反向转）
      blocks(g, ringDots(c.x, c.y, grow * 0.34, 4, -rot * 1.4), col.accent, a * 0.7, 2);
      // 4 个符文块向外弹（带拖出的冲击带）
      for (let i = 0; i < 4; i++) {
        const ang = rot * 0.4 + (i / 4) * TAU;
        const d = grow * (0.55 + 0.78 * rise(c.k, 0.7));
        const q = offset(c.x, c.y, ang, d, 0);
        poly(g, shape(q.x, q.y, ang, [[6.5, 0], [0, -6.5], [-6.5, 0], [0, 6.5]]), col.accent, a * 0.95);
        blocks(g, [q], col.core, a * 0.9, 3);
        band(g, [offset(c.x, c.y, ang, grow * 0.3, 0), offset(c.x, c.y, ang, Math.max(2, d - 8), 0)], 3.2, 1.2, col.core, a * 0.6);
      }
      // 中心实心六边 + 白闪
      shell(g, (s) => hexPts(c.x, c.y, grow * 0.42 * s, -rot), col, a * 0.9);
      if (fl > 0.02) {
        blocks(g, [{ x: c.x, y: c.y }], C.white, fl, 7);
        poly(g, hexPts(c.x, c.y, grow * 0.2 * (0.6 + fl * 0.7), rot), C.white, fl * 0.9);
      }
      // 余韵：环点 + 碎屑
      dots(g, ringDots(c.x, c.y, grow * 1.25, 10, -rot), col.core, a * 0.55);
      blocks(g, scatterPts(c.x, c.y, 6, 19, grow * 0.9, grow * 1.45), col.body, a * 0.6, 2);
    },
    ward(g, c, col) {
      const a = fade(c.k);
      const R = Math.max(10, c.radius);
      const rot = c.clock / 800;
      // —— 双环反向（粗 4px）——
      ring3(g, c.x, c.y, R * 0.98, 4.2, col, a * 0.95, { phase: rot });
      ring3(g, c.x, c.y, R * 0.66, 4, col, a * 0.85, { phase: -rot * 1.6 });
      // 4 个符文块夹在两环之间（带接线）
      for (let i = 0; i < 4; i++) {
        const ang = rot * 0.5 + (i / 4) * TAU;
        const q = offset(c.x, c.y, ang, R * 0.82, 0);
        poly(g, shape(q.x, q.y, ang, [[5.4, 0], [0, -5.4], [-5.4, 0], [0, 5.4]]), col.accent, a * 0.95);
        blocks(g, [q], col.core, a * 0.9, 3);
        band(g, [offset(c.x, c.y, ang, R * 0.68, 0), offset(c.x, c.y, ang, R * 0.96, 0)], 2.4, 2.4, col.accent, a * 0.45);
      }
      // 中心淡光
      shell(g, (s) => hexPts(c.x, c.y, R * 0.3 * s, rot * 0.4), col, a * 0.45);
      // 外圈 8 圣光点 + 内圈 4 反向符文
      dots(g, ringDots(c.x, c.y, R * 1.12, 8, -rot * 1.2), col.core, a * 0.7);
      blocks(g, ringDots(c.x, c.y, R * 0.48, 4, rot * 1.8), col.accent, a * 0.7, 2);
    },
    link(g, c, col) {
      const a = (1 - c.k) * 0.95;
      const pts = lineDots(c.from.x, c.from.y, c.to.x, c.to.y, 6);
      band3(g, pts, 2.4, 5, col, a);
      const rot = c.clock / 500;
      // 沿途小环一正一反
      for (let i = 1; i < pts.length; i += 2) {
        poly(g, ringPts(pts[i].x, pts[i].y, 5, 2.2, i % 4 ? rot : -rot), col.accent, a * 0.8);
      }
      poly(g, ringPts(c.to.x, c.to.y, 7, 2.8, -rot), col.core, a * 0.9);
      blocks(g, [c.to], C.white, a, 2);
    },
  },
};