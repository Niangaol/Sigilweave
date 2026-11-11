// 共振法阵 · 高级法术「多段演出」层（strike，2026-11-09）
// ---------------------------------------------------------------------------
// 与 spell-fx 的分工：
//   spell-fx 的 impact 是 260~420ms 的一帧重击（打的瞬间）；
//   本文件是 1.4~1.6s 的连续演出（打的后果）——一个法术拆成 5~6 段，
//   每段有自己的出现 / 峰值 / 退场，重量靠「阶段」而不是「外面再套一个更大的环」。
// 纪律（与 v2 设计规格一致）：
//   1. 只用 fillStyle + fillPoints / fillRect；顶点交给 kit 的 poly 取整。
//   2. 禁止 lineStyle / strokePoints / 渐变 / 模糊 / Math.random。
//   3. alpha 永远落在 [0,1]（kit 已夹紧）；同一 k 两次调用完全一致，clock 只改相位。
//   4. 单次调用 ≤ 220 条绘制指令（fillStyle 与 fillPoints/fillRect 各计 1）。
//   5. 主剪影最大边落在 1.8R~2.6R，余韵最多 3R；大形状一律带内层色阶 / 缺口 / 碎片。
// ---------------------------------------------------------------------------
import { C } from './Palette.js';
import {
  poly, dots, blocks, rects, band, ringPts, ring3, sectorPts, spikePts,
  blobPts, boltPts, nGonPts, starPts,
  hash01, hashSym, clamp01, num, TAU,
} from './spell-fx/kit.js';

// —— 两个法术的色阶（沿用各自 v2 impact 的本体色，保证同法术同色系）——
const M = {
  edge: C.outline,       // 近黑暗紫描边
  body: 0xb08252,        // 岩石本体
  core: 0xffc885,        // 炽核
  accent: 0xff8a3c,      // 熔岩橙
  ember: 0xffd06a,       // 上飘火星
  soot: 0x241c3a,        // 焦土
  deep: 0x171226,        // 焦黑
};
const Q = {
  edge: C.outline,
  body: 0xcc9c6c,        // 岩层
  core: 0xffe0b0,        // 岩芯高光
  accent: C.bone,        // 骨白碎屑 / 牙
  strata: 0x6c6c54,      // 苔褐夹层
  dust: C.mute,          // 尘土
  cavity: C.void,        // 黑腔
  deep: 0x0d0a17,        // 更深的黑
};

// ---------- 本地几何笔刷（只造顶点，绘制仍走 kit 的 poly / band）----------

// 贴地压扁的不规则团块（坑 / 焦痕 / 尘雾）
function flatBlob(cx, cy, rad, seed, squash, lobes = 12, wob = 0.26, spin = 0) {
  const pts = blobPts(cx, cy, rad, seed, lobes, wob, spin);
  for (let i = 0; i < pts.length; i++) pts[i] = { x: pts[i].x, y: cy + (pts[i].y - cy) * squash };
  return pts;
}

// 贴地压扁的扇环（冲击环的「带缺口」分段）
function flatSector(cx, cy, r0, r1, a0, a1, squash, seg = 8) {
  const pts = sectorPts(cx, cy, r0, r1, a0, a1, seg);
  for (let i = 0; i < pts.length; i++) pts[i] = { x: pts[i].x, y: cy + (pts[i].y - cy) * squash };
  return pts;
}

// 裂口内的透镜形黑腔：上下两条不规则弧，两端收尖、中间张开
function lensPts(cx, cy, halfLen, gap, seed, wob = 0.18) {
  const out = [];
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const j = 1 - wob + hash01(seed + i * 3) * wob * 2;
    out.push({ x: cx - halfLen + halfLen * 2 * u, y: cy - Math.max(0.6, gap * Math.sin(u * Math.PI) * j) });
  }
  for (let i = n; i >= 0; i--) {
    const u = i / n;
    const j = 1 - wob + hash01(seed + 41 + i * 3) * wob * 2;
    out.push({ x: cx - halfLen + halfLen * 2 * u, y: cy + Math.max(0.6, gap * Math.sin(u * Math.PI) * j) });
  }
  return out;
}

// 一排「牙床」：沿 ±x 展开，牙尖朝 tipY（伸进黑腔），牙谷在 rootY，背脊在 backY。
// 每颗牙长短不一（hash 决定），背脊也起伏——否则会读成一条锯条/木板。
function mawRim(halfLen, n, tipY, rootY, backY, seed, tipJit) {
  const step = (halfLen * 2) / n;
  const out = [];
  for (let i = 0; i < n; i++) {
    const x0 = -halfLen + i * step;
    const jt = hashSym(seed * 17 + i) * 0.24;                 // 牙距不均
    const tall = 0.3 + 0.7 * hash01(seed * 7 + i * 5 + 2);    // 牙高不均
    out.push([x0 + step * (0.46 + jt), rootY + (tipY - rootY) * tall + hashSym(seed * 31 + i * 3) * tipJit]);
    out.push([x0 + step, rootY]);
  }
  const backN = Math.max(5, Math.round(n * 0.7));
  for (let i = backN; i >= 0; i--) {
    const u = i / backN;
    out.push([-halfLen + halfLen * 2 * u, backY + hashSym(seed * 5 + i) * tipJit * 0.9]);
  }
  return out;
}
const worldJaw = (cx, cy, list, dy) => list.map((p) => ({ x: cx + p[0], y: cy + p[1] + dy }));

// 裂口两端向上翻起的岩板（侧向楔形，openP 控制翘起量）
function platePts(cx, side, L, gy, R, openP, seed) {
  const ex = cx + side * L;
  const lift = R * (0.06 + 0.2 * openP);
  const outw = R * (0.08 + 0.13 * openP);
  const q = 0.85 + hash01(seed) * 0.3;
  return [
    { x: ex, y: gy + R * 0.05 },
    { x: ex + side * outw * 0.25, y: gy - lift * 0.25 * q },
    { x: ex + side * outw * 0.8, y: gy - lift * 0.85 * q },
    { x: ex + side * outw * 1.35, y: gy - lift * 0.7 * q },
    { x: ex + side * outw * 1.75, y: gy - lift * 0.1 * q },
    { x: ex + side * outw * 1.5, y: gy + R * 0.12 },
    { x: ex + side * outw * 0.7, y: gy + R * 0.1 },
  ];
}
const shrinkTo = (pts, cx, cy, s) => pts.map((p) => ({ x: cx + (p.x - cx) * s, y: cy + (p.y - cy) * s }));

// ===========================================================================
// 陨星裁决 meteor_judgment —— 天降陨石砸地（1600ms）
// 段：0~8% 冲击帧 / 8~35% 双冲击环 / 20~60% 尘柱 / 35~75% 抛石 /
//     55~95% 余震环+裂缝 / 80~100% 焦痕+火星+压暗
// ===========================================================================
export const METEOR_STRIKE_DUR = 1600;

export function drawMeteorStrike(g, c) {
  const ctx = c && typeof c === 'object' ? c : {};
  const k = clamp01(num(ctx.k, 0));
  const clock = num(ctx.clock, 0);
  const ang = num(ctx.angle, 0);
  const R = Math.max(40, Math.min(160, num(ctx.radius, 100)));
  const x = num(ctx.x, 0);
  const y = num(ctx.y, 0);
  const gy = y + R * 0.12;                 // 地面线（命中点略下，读作「砸进地面」）
  const rot = clock / 900;

  // ——— 时间包络：全部由 k 决定；clock 只进旋转/摆动相位 ———
  const hit = clamp01(k / 0.02);                                    // 触地
  const flash = clamp01(k / 0.015) * clamp01((0.125 - k) / 0.07);   // 0~12.5% 白热核心
  const waveA = clamp01((k - 0.05) / 0.30);                         // 主冲击环 5%→35%
  const waveB = clamp01((k - 0.10) / 0.31);                         // 副冲击环 10%→41%
  const dustP = clamp01((k - 0.16) / 0.40);                         // 尘柱爬升 16%→56%
  const dustA = clamp01((k - 0.14) / 0.10) * clamp01((0.94 - k) / 0.34);
  const rockP = clamp01((k - 0.32) / 0.46);                         // 抛石 32%→78%
  const aftP = clamp01((k - 0.54) / 0.40);                          // 余震环 54%→94%
  const crackP = clamp01((k - 0.56) / 0.26);                        // 裂缝爬行 56%→82%
  const charP = clamp01((k - 0.64) / 0.22);                         // 焦痕 64%→86%
  const emberP = clamp01((k - 0.72) / 0.16);                        // 火星 72%→88%
  const endA = clamp01((1 - k) / 0.10);                             // 最后 10% 收尾

  // —— 段 1：地面与陨坑。三层「暗坑」：焦土外圈 / 坑沿 / 坑底，中心才是熔池 ——
  const craterA = hit * endA;
  if (craterA > 0.01) {
    poly(g, flatBlob(x, gy, R * 1.02, 81, 0.42, 16, 0.22, rot * 0.25), M.edge, craterA * 0.96);
    // 坑沿：三段落弧，带缺口（不是一整圈亮边）
    const rimA = ang + rot * 0.2;
    const rimArcs = [[0.1, 1.5], [1.9, 3.2], [3.6, 5.1]];
    for (let i = 0; i < 3; i++) {
      poly(g, flatSector(x, gy, R * 0.84, R * 0.96, rimA + rimArcs[i][0], rimA + rimArcs[i][1], 0.42, 10), M.accent, craterA * 0.75);
    }
    poly(g, flatBlob(x, gy, R * 0.74, 83, 0.42, 14, 0.3, -rot * 0.3), M.soot, craterA * 0.92);
    poly(g, flatBlob(x, gy, R * 0.24, 87, 0.42, 12, 0.3, rot * 0.5), M.accent, craterA * (0.4 + 0.6 * flash));
    poly(g, flatBlob(x, gy, R * 0.1, 89, 0.42, 8, 0.28, -rot), M.core, craterA * 0.85);
  }

  // —— 段 2：两道贴地压扁的冲击环（0.35 / 0.45），都带缺口，不是完整正圆 ——
  if (waveA > 0 && waveA < 1) {
    const rA = R * (0.3 + 1.3 * waveA);                        // → 1.6R
    const wA = Math.max(2.2, R * (0.17 - 0.08 * waveA));
    const aA = Math.pow(1 - waveA, 1.25) * 0.96;
    const base = ang + rot * 0.12;
    const arcs = [[0.0, 1.0], [1.44, 2.44], [2.86, 3.96], [4.4, 5.56]];
    for (let i = 0; i < 4; i++) {
      poly(g, flatSector(x, gy, rA - wA * 0.86, rA + wA * 0.86, base + arcs[i][0], base + arcs[i][1], 0.35, 8), M.edge, aA * 0.92);
      poly(g, flatSector(x, gy, rA - wA * 0.36, rA + wA * 0.36, base + arcs[i][0] + 0.05, base + arcs[i][1] - 0.05, 0.35, 8), M.accent, aA * 0.9);
    }
  }
  if (waveB > 0 && waveB < 1) {
    const rB = R * (0.25 + 0.85 * waveB);                      // → 1.1R
    const wB = Math.max(1.8, R * (0.12 - 0.05 * waveB));
    const aB = Math.pow(1 - waveB, 1.5) * 0.88;
    const baseB = ang - 0.5 - rot * 0.16;
    const arcsB = [[0.0, 1.22], [1.7, 2.72], [3.16, 4.2], [4.72, 5.84]];
    for (let i = 0; i < 4; i++) {
      poly(g, flatSector(x, gy, rB - wB * 0.5, rB + wB * 0.5, baseB + arcsB[i][0], baseB + arcsB[i][1], 0.45, 8), M.core, aB);
    }
  }

  // —— 段 3：尘柱。柱心剪影 + 6 层烟团：底宽顶窄，高度约 1.9R，上半段只留暗色 ——
  if (dustA > 0.015 && dustP > 0.01) {
    const colH = R * 1.86;
    const topY = gy - R * 0.05 - colH * dustP;
    const spread = 0.55 + 0.45 * dustP;
    const baseW = R * 0.5 * spread;
    const topW = R * 0.2 * spread;
    const left = [];
    const right = [];
    for (let i = 0; i <= 7; i++) {
      const u = i / 7;
      const yy = gy - R * 0.05 - (gy - R * 0.05 - topY) * u;
      const w = baseW + (topW - baseW) * u;
      const sway = Math.sin(u * 3.2 + rot) * R * 0.08 * u;
      left.push({ x: x + sway - w * (1 + hashSym(i * 7 + 3) * 0.16), y: yy });
      right.push({ x: x + sway + w * (1 + hashSym(i * 11 + 5) * 0.16), y: yy });
    }
    const silhouette = left.concat(right.reverse());
    poly(g, silhouette, M.edge, dustA * 0.95);
    poly(g, shrinkTo(silhouette, x, gy - colH * 0.42 * dustP, 0.86), C.stone, dustA * 0.7);
    // 6 层烟团（外轮廓交给上面的剪影，这里只堆体积与色阶）
    for (let i = 0; i < 6; i++) {
      const u = i / 5;
      const cyy = gy - R * 0.08 - colH * (0.05 + 0.9 * u) * dustP;
      const rad = R * (0.33 - 0.1 * u) * spread;
      const dx = hashSym(i * 13 + 5) * R * 0.12 * u + Math.sin(rot + i * 0.8) * R * 0.05;
      const a = dustA * (0.9 - 0.4 * u);
      const body = i < 2 ? M.body : i < 4 ? C.stoneLight : C.nightDeep;
      poly(g, blobPts(x + dx, cyy, rad, 91 + i * 7, 11, 0.24, rot + i * 0.4), body, a * (i < 2 ? 0.9 : 0.72));
    }
    // 柱顶两团翻卷：让烟柱有「顶」，不是一根等宽箱子
    poly(g, blobPts(x + R * 0.07, gy - colH * dustP * 0.93, R * 0.15, 131, 9, 0.28, -rot), C.nightDeep, dustA * 0.5);
    poly(g, spikePts(x - R * 0.05, gy - colH * dustP * 0.85, -Math.PI * 0.5 - 0.5, R * 0.26, Math.max(2, R * 0.07), 0.6), M.edge, dustA * 0.4);
  }

  // —— 段 4：抛射碎石。11 块小的 + 3 块大的，各自一条抛物线（用 k 算轨迹，不用随机）——
  if (rockP > 0.01) {
    const small = [];
    for (let i = 0; i < 11; i++) {
      const launch = 0.32 + hash01(i * 7 + 3) * 0.14;
      const u = clamp01((k - launch) / 0.42);
      const dir = (i / 11) * TAU + hashSym(i * 17 + 6) * 0.45;
      const d = R * (0.58 + 0.78 * hash01(i * 19 + 8));
      const h = R * (0.4 + 0.85 * hash01(i * 11 + 2));
      const px = x + Math.cos(dir) * d * u;
      const py = gy + Math.sin(dir) * d * 0.26 * u - 4 * h * u * (1 - u);
      const s = 3 + Math.round(hash01(i * 3 + 9) * 2);
      small.push([px - s / 2, py - s / 2, s, s]);
    }
    rects(g, small.map((q) => [q[0] - 1, q[1] - 1, q[2] + 2, q[3] + 2]), M.edge, 0.95 * endA);
    rects(g, small, M.body, 0.9 * endA);
    for (let j = 0; j < 3; j++) {
      const launch = 0.33 + hash01(j * 13 + 4) * 0.12;
      const u = clamp01((k - launch) / 0.4);
      const dir = ang + (j - 1) * 1.15 + hashSym(j * 7 + 9) * 0.4;
      const d = R * (0.9 + 0.5 * hash01(j * 5 + 6));
      const h = R * (0.7 + 0.7 * hash01(j * 3 + 1));
      const px = x + Math.cos(dir) * d * u;
      const py = gy + Math.sin(dir) * d * 0.24 * u - 4 * h * u * (1 - u);
      const rr = R * (0.085 + 0.03 * hash01(j * 17 + 5));
      poly(g, blobPts(px, py, rr * 1.22, 101 + j, 7, 0.34, rot + j), M.edge, 0.95 * endA);
      poly(g, blobPts(px, py, rr, 101 + j, 7, 0.3, rot + j), M.body, 0.92 * endA);
      if (u < 0.94) poly(g, blobPts(px - 1, py - 1, rr * 0.45, 107 + j, 6, 0.3, -rot), M.core, 0.8 * endA);
    }
  }

  // —— 段 5：余震。第二次小冲击环，再让裂缝从坑沿向外爬 4 条 ——
  if (aftP > 0 && aftP < 1) {
    const rAft = R * (0.45 + 1.05 * aftP);
    const aAft = Math.pow(1 - aftP, 1.5) * 0.8;
    ring3(g, x, gy, rAft, Math.max(1.6, R * 0.05), M, aAft, { squash: 0.42, phase: -rot * 0.6, seg: 22 });
    poly(g, ringPts(x, gy, rAft * 1.08, 1.2, rot * 0.9, 0.42, 22), M.accent, aAft * 0.5);
  }
  if (crackP > 0.01) {
    const crackA = (0.55 + 0.45 * (1 - crackP)) * 0.95 * endA;
    for (let i = 0; i < 4; i++) {
      const ca = ang + (i - 1.5) * 0.52 + hashSym(i * 19 + 3) * 0.3;
      const reach = R * (0.34 + 0.36 * hash01(i * 5 + 2)) * crackP;
      const p0 = { x: x + Math.cos(ca) * R * 0.76, y: gy + Math.sin(ca) * R * 0.76 * 0.5 };
      const p1 = { x: x + Math.cos(ca) * (R * 0.76 + reach), y: gy + Math.sin(ca) * (R * 0.76 + reach) * 0.5 };
      const zig = boltPts(p0.x, p0.y, p1.x, p1.y, i * 23 + 11, R * 0.055, 5);
      band(g, zig, Math.max(1.5, R * 0.075), 1, M.edge, crackA);
      band(g, zig, Math.max(1, R * 0.028), 0.8, M.accent, crackA * 0.85);
    }
  }

  // —— 段 6：余韵。焦土 + 余温亮缝 + 三层压暗雾 + 上飘火星 ——
  if (charP > 0.01) {
    const charA = charP * endA;
    poly(g, flatBlob(x, gy + R * 0.04, R * 0.94, 111, 0.46, 18, 0.24, rot * 0.2), M.edge, charA * 0.82);
    poly(g, flatBlob(x, gy + R * 0.04, R * 0.75, 113, 0.44, 16, 0.28, -rot * 0.2), M.soot, charA * 0.78);
    poly(g, flatBlob(x, gy + R * 0.05, R * 0.47, 117, 0.42, 14, 0.26, rot * 0.3), M.deep, charA * 0.66);
    band(g, boltPts(x - R * 0.48, gy + R * 0.02, x + R * 0.52, gy + R * 0.06, 31, R * 0.05, 5), Math.max(1.2, R * 0.035), 0.8, M.accent, charA * 0.7);
    band(g, boltPts(x - R * 0.2, gy + R * 0.15, x + R * 0.34, gy - R * 0.02, 37, R * 0.04, 4), Math.max(1, R * 0.028), 0.7, M.accent, charA * 0.5);
    for (let i = 0; i < 3; i++) {
      poly(g, flatBlob(x + hashSym(i * 5 + 1) * R * 0.85, gy - R * (0.06 + i * 0.16), R * (0.48 - i * 0.09), 121 + i, 0.55, 12, 0.32, rot * 0.3 + i), M.deep, charP * endA * (0.2 - i * 0.04));
    }
  }
  if (emberP > 0.01) {
    const eA = clamp01(emberP * 2.5) * endA;
    const sparks = [];
    for (let i = 0; i < 12; i++) {
      const h = hash01(i * 7 + 5);
      sparks.push({
        x: x + hashSym(i * 13 + 2) * R * (0.5 + 0.7 * h) + Math.sin(clock / 420 + i) * R * 0.05,
        y: gy - R * (0.12 + (0.3 + 1.35 * h) * emberP),
      });
    }
    dots(g, sparks, M.ember, eA * 0.9);
    blocks(g, sparks.slice(0, 4), M.core, eA * 0.8, 2);
  }

  // —— 段 0：冲击帧（最后画，保证盖在最上层）。中心 12px 纯白 + 两层炽核 + 白热双环 ——
  if (flash > 0.012) {
    poly(g, ringPts(x, gy - R * 0.1, R * (1.1 + 0.5 * (1 - flash)), Math.max(1.4, R * 0.03), rot * 1.1, 0.55, 26), C.white, flash * 0.3);
    poly(g, nGonPts(x, gy - R * 0.14, R * 0.5, 10, rot), M.edge, flash * 0.92);
    poly(g, starPts(x, gy - R * 0.14, -rot * 0.7, R * 0.46, R * 0.15, 7), M.accent, flash * 0.95);
    poly(g, nGonPts(x, gy - R * 0.16, R * 0.22, 8, -rot), M.core, flash);
    blocks(g, [{ x, y: gy - R * 0.14 }], C.white, flash, 12);
    poly(g, ringPts(x, gy - R * 0.12, R * (0.5 + 0.6 * (1 - flash)), Math.max(2, R * 0.04), rot * 1.3, 0.9, 20), C.white, flash * 0.55);
    rects(g, [[x - 2, gy - R * 1.1, 4, R * 0.6], [x - 1, gy - R * 0.5, 2, R * 0.3]], C.white, flash * 0.85);
  }
}

// ===========================================================================
// 地裂之颚 quake_maw —— 地面裂开并塌陷（1400ms）
// 段：0~6% 地面闪裂 / 6~30% 张开+岩层翘起 / 25~60% 裂纹蔓延 /
//     30~70% 碎石塌落 / 60~85% 二次开合+尘环 / 85~100% 黑腔+碎屑
// ===========================================================================
export const QUAKE_STRIKE_DUR = 1400;

export function drawQuakeStrike(g, c) {
  const ctx = c && typeof c === 'object' ? c : {};
  const k = clamp01(num(ctx.k, 0));
  const clock = num(ctx.clock, 0);
  const ang = num(ctx.angle, 0);
  const R = Math.max(40, Math.min(160, num(ctx.radius, 100)));
  const x = num(ctx.x, 0);
  const y = num(ctx.y, 0);
  const gy = y + R * 0.06;
  const rot = clock / 700;

  // ——— 时间包络 ———
  const firstIn = clamp01(k / 0.02);                                // 裂缝出现
  const flash = clamp01(k / 0.014) * clamp01((0.07 - k) / 0.035);   // 0~7% 地面白热
  const openP = clamp01((k - 0.035) / 0.22);                        // 6%→28% 张开
  const crackP = clamp01((k - 0.24) / 0.34);                        // 25%→58% 裂纹蔓延
  const fallP = clamp01((k - 0.28) / 0.40);                         // 30%→68% 塌落
  const pulse2 = clamp01((k - 0.58) / 0.26);                        // 60%→84% 二次开合
  const reopen = Math.sin(Math.PI * clamp01((k - 0.58) / 0.27));    // 二次张开量
  const darkP = clamp01((k - 0.82) / 0.18);                         // 85%→100% 变暗
  const endA = clamp01((1 - k) / 0.09);                             // 收尾

  // 裂口几何：总长 0.68R → 1.8R；上下张开；二次开合只改 gap，不改结构
  const L = R * (0.34 + 0.56 * openP);
  const gap = R * (0.02 + 0.16 * openP + 0.045 * reopen);
  const rimH = R * (0.03 + 0.03 * openP);
  const teeth = Math.max(7, Math.min(18, Math.round(L / (R * 0.07))));

  // —— 段 1：裂口周围的隆起土脊（暗、低平，只做「地面被顶起来」的底）——
  if (firstIn > 0.01) {
    poly(g, flatBlob(x, gy, L * 1.2, 43, 0.24, 16, 0.28, -rot * 0.15), Q.edge, firstIn * endA * 0.55);
    poly(g, flatBlob(x, gy, L * 1.02, 47, 0.24, 16, 0.3, rot * 0.15), Q.strata, firstIn * endA * 0.38);
  }

  // —— 段 2：黑腔（先于牙床画，牙咬在腔口上）——
  if (firstIn > 0.01) {
    poly(g, lensPts(x, gy, L * 1.04, gap * 0.98, 7), Q.edge, firstIn * endA * 0.92);
    poly(g, lensPts(x, gy, L, gap * 0.95, 19), Q.cavity, firstIn * endA * 0.97);
    poly(g, lensPts(x, gy, L * 0.74, gap * 0.5, 31), Q.deep, clamp01(openP * 0.9 + darkP * 0.6) * firstIn * endA * 0.92);
  }

  // —— 段 3：两侧岩层向上翻起（外扩 + 翘起，openP 越大越立）——
  if (openP > 0.01) {
    for (let s = 0; s < 2; s++) {
      const side = s === 0 ? -1 : 1;
      const plate = platePts(x, side, L, gy, R, openP, s * 11 + 3);
      poly(g, plate, Q.edge, openP * endA * 0.95);
      poly(g, shrinkTo(plate, x + side * L, gy, 0.76), Q.strata, openP * endA * 0.9);
      poly(g, shrinkTo(plate, x + side * L, gy, 0.52), Q.body, openP * endA * 0.85);
      // 岩层夹线：读作「翻起来的沉积层」（不是一块平石头）
      band(g, [{ x: x + side * (L + R * 0.03), y: gy + R * 0.02 }, { x: x + side * (L + R * 0.13 * openP), y: gy - R * 0.11 * openP }], 1.2, 1, Q.core, openP * endA * 0.4);
    }
  }

  // —— 段 4：上下锯齿牙床（连续多边形，牙长短不一）+ 6 颗骨白断牙 ——
  if (firstIn > 0.01) {
    const jawA = firstIn * endA * 0.96;
    const tipJit = Math.max(1, gap * 0.12);
    const top = mawRim(L, teeth, -gap * 0.08, -gap, -(gap + rimH), 3, tipJit);
    const bot = mawRim(L, teeth, gap * 0.08, gap, gap + rimH, 3, tipJit);
    poly(g, worldJaw(x, gy, top, -2), Q.edge, jawA * 0.95);
    poly(g, worldJaw(x, gy, top, 0), Q.body, jawA);
    poly(g, worldJaw(x, gy, bot, 2), Q.edge, jawA * 0.95);
    poly(g, worldJaw(x, gy, bot, 0), Q.body, jawA);
    // 外沿亮线（贴背脊）：岩沿被顶起来的那一面
    poly(g, worldJaw(x, gy, mawRim(L * 0.99, teeth, -(gap + rimH * 0.35), -(gap + rimH * 0.35), -(gap + rimH * 0.98), 9, tipJit * 0.4), 0), Q.core, jawA * 0.5);
    poly(g, worldJaw(x, gy, mawRim(L * 0.99, teeth, gap + rimH * 0.35, gap + rimH * 0.35, gap + rimH * 0.98, 9, tipJit * 0.4), 0), Q.core, jawA * 0.5);
    // 岩沿上的竖向断口：把一条「木板」切成几段岩层
    const notch = [];
    for (let i = 0; i < 6; i++) {
      const nx = x + (hash01(i * 13 + 3) * 2 - 1) * L * 0.86;
      const up = i % 2 === 0;
      notch.push([nx, gy + (up ? -gap - rimH : gap - 1), 2, rimH + 2]);
    }
    rects(g, notch, Q.edge, jawA * 0.75);
    // 6 颗骨白断牙：长短不一，咬进黑腔
    for (let f = 0; f < 6; f++) {
      const fx = x + (hash01(f * 13 + 2) * 1.66 - 0.83) * L;
      const up = f % 2 === 0;
      const len = gap * (0.35 + 0.55 * hash01(f * 7 + 1));
      poly(g, spikePts(fx, gy + (up ? -gap * 0.98 : gap * 0.98), up ? Math.PI * 0.5 : -Math.PI * 0.5, len, Math.max(1.5, R * 0.022), 0.45), Q.accent, jawA * 0.9);
    }
  }

  // —— 段 5：裂纹从主裂两端各爬出 3 条（锯齿、逐段变细）——
  if (crackP > 0.01) {
    const crackA = (0.5 + 0.5 * (1 - crackP * 0.6)) * endA * 0.95;
    for (let i = 0; i < 6; i++) {
      const side = i < 3 ? -1 : 1;
      const j = i % 3;
      const ca = (side < 0 ? Math.PI : 0) + (j - 1) * 0.62 + ang * 0.12;
      const reach = R * (0.3 + 0.3 * hash01(i * 7 + 2)) * crackP;
      const p0 = { x: x + side * L * 0.96, y: gy + (j - 1) * R * 0.02 };
      const p1 = { x: p0.x + Math.cos(ca) * reach, y: p0.y + Math.sin(ca) * reach * 0.5 };
      const zig = boltPts(p0.x, p0.y, p1.x, p1.y, i * 23 + 5, R * 0.045, 6);
      band(g, zig, Math.max(1.5, R * 0.065), 0.8, Q.edge, crackA);
      band(g, zig, Math.max(1, R * 0.03), 0.6, Q.accent, crackA * 0.75);
    }
  }

  // —— 段 6：塌落。11 块碎石从裂口边缘被抬起再翻进黑腔，带尘土 ——
  if (fallP > 0.01) {
    const rocks = [];
    for (let i = 0; i < 11; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const sx = x + side * L * (0.32 + 0.5 * hash01(i * 5 + 1));
      const u = clamp01((k - (0.28 + hash01(i * 11 + 7) * 0.18)) / 0.3);
      const arc = Math.sin(Math.PI * u) * R * 0.17;
      const px = sx + side * R * 0.3 * u * (0.4 + hash01(i * 3 + 2));
      const py = gy - arc + (R * 0.13 + gap * 0.5) * u * u;
      const s = 3 + Math.round(hash01(i * 9 + 2) * 2);
      rocks.push([px - s / 2, py - s / 2, s, s]);
    }
    rects(g, rocks.map((q) => [q[0] - 1, q[1] - 1, q[2] + 2, q[3] + 2]), Q.edge, 0.95 * endA);
    rects(g, rocks, Q.body, 0.92 * endA);
    const dust = [];
    for (let i = 0; i < 8; i++) {
      const u = hash01(i * 9 + 4);
      dust.push({ x: x + hashSym(i * 13 + 6) * L * 1.02, y: gy - R * (0.04 + 0.3 * u) * fallP });
    }
    dots(g, dust, Q.dust, fallP * endA * 0.55);
  }

  // —— 段 7：二次开合 —— 压扁的冲击尘环（带缺口）——
  if (pulse2 > 0 && pulse2 < 1) {
    const rD = R * (0.4 + 1.0 * pulse2);
    const aD = Math.pow(1 - pulse2, 1.4) * 0.75;
    const arcsD = [[0.0, 1.2], [1.62, 2.62], [3.04, 4.12], [4.54, 5.54]];
    for (let i = 0; i < 4; i++) {
      poly(g, flatSector(x, gy, rD - R * 0.075, rD, arcsD[i][0] + rot * 0.3, arcsD[i][1] + rot * 0.3, 0.3, 8), Q.edge, aD * 0.85);
      poly(g, flatSector(x, gy, rD - R * 0.04, rD + R * 0.012, arcsD[i][0] + rot * 0.3, arcsD[i][1] + rot * 0.3, 0.3, 8), Q.dust, aD * 0.45);
    }
    poly(g, ringPts(x, gy, rD * 1.04, 1.2, rot, 0.3, 20), Q.accent, aD * 0.4);
  }

  // —— 段 8：余韵。裂口变暗留黑腔，边缘留碎屑与余温 ——
  if (darkP > 0.01) {
    poly(g, lensPts(x, gy, L * 1.03, gap * 0.84, 61), Q.edge, darkP * endA * 0.85);
    poly(g, lensPts(x, gy, L * 0.96, gap * 0.68, 67), Q.deep, darkP * endA * 0.92);
    const crumbs = [];
    for (let i = 0; i < 9; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const u = hash01(i * 17 + 3);
      crumbs.push({ x: x + side * (L * (0.7 + 0.5 * u)), y: gy + (u - 0.5) * R * 0.14 });
    }
    blocks(g, crumbs, Q.strata, darkP * endA * 0.8, 3);
    const ember = [];
    for (let i = 0; i < 7; i++) {
      const u = hash01(i * 5 + 8);
      ember.push({ x: x + hashSym(i * 11 + 1) * L * 0.95, y: gy - R * (0.02 + 0.1 * u) });
    }
    dots(g, ember, Q.accent, darkP * endA * 0.55);
    poly(g, lensPts(x, gy, L * 0.5, gap * 0.22, 71), Q.accent, darkP * endA * 0.22);
  }

  // —— 段 0：地面闪（最后画，保证是一道压在裂口上的白热光）——
  if (flash > 0.012) {
    rects(g, [[x - R * 1.04, gy - 3, R * 2.08, 6]], Q.edge, flash * 0.8);
    rects(g, [[x - R * 0.98, gy - 2, R * 1.96, 3]], Q.accent, flash * 0.9);
    rects(g, [[x - R * 0.66, gy - 1, R * 1.32, 2], [x - R * 0.26, gy + 1, R * 0.52, 1], [x + R * 0.36, gy - 2, R * 0.22, 1]], C.white, flash * 0.95);
    const sparks = [];
    for (let i = 0; i < 7; i++) {
      const u = (i / 7) * 2 - 1;
      sparks.push({ x: x + u * R * 0.98, y: gy - 3 - (i % 3) * 2 });
    }
    dots(g, sparks, Q.core, flash * 0.8);
  }
}
