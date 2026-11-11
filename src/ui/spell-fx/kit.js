// 共振法阵 · 法术特效通用笔刷（v2「大胆版」，2026-11-09）
// ---------------------------------------------------------------------------
// 设计纪律（与 v1 的差别就在这里）：
//   1. 硬边像素：只用 fillPoints / fillRect，不用 lineStyle / 渐变 / 模糊；顶点一律取整。
//   2. 体积优先：主体不再是 1px 描边，而是「暗外轮廓 → 本体 → 亮芯」三层实心块。
//      弹体 10~16px（v1 是 3~7px），命中图案 1.6~2.2R（v1 是 0.5~0.9R）。
//   3. 一法术一动作：区分度靠「剪影 + 运动」，不靠换颜色 —— 生长/螺旋/坠落/张开/
//      缠绕/穿刺/回拉…每个法术只做一件别的法术不做的事。
//   4. 时间包络：起手（预警环）→ 命中峰值（k 前 15% 全尺寸最亮）→ 余韵（焦痕/碎屑/残环）。
//   5. 确定性：抖动只用 hash01，绝不 Math.random；clock 只改相位，不改绘图结构。
// ---------------------------------------------------------------------------
// 本文件只依赖 Palette，不 import Phaser、不碰 scene，纯函数。
import { C } from '../Palette.js';

export const TAU = Math.PI * 2;

export const clamp01 = (v) => (v <= 0 ? 0 : v >= 1 ? 1 : v);
export const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
export const rnd = (v) => Math.round(v);

// 确定性伪随机：0..1。同一个 seed 永远同一个结果。
export function hash01(seed) {
  let x = Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  x = (x ^ (x >>> 13)) >>> 0;
  x = Math.imul(x, 0xc2b2ae35) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
export const hashSym = (seed) => hash01(seed) * 2 - 1;

// ---------- 时间包络 ----------
// peak：命中瞬间的「全尺寸最亮」曲线。k 前 15% 冲到 1，之后收回 0（满足 alpha 单调 + 峰值读感）。
export const peak = (k, at = 0.15) => {
  const kk = clamp01(k);
  const a = at <= 0 ? 0.001 : at >= 0.999 ? 0.999 : at;
  return kk <= 0 ? 0 : kk < a ? kk / a : (1 - kk) / (1 - a);
};
export const rise = (k, span = 0.35) => clamp01(clamp01(k) / Math.max(0.001, span));
export const fade = (k) => clamp01(1 - clamp01(k));
// 生命周期内的三角脉冲（余韵残留用）：0→1→0
export const hump = (k, at = 0.5) => peak(k, at);
// clock 驱动的呼吸相位，0..1，暂停时冻结
export const pulse = (clock, periodMs = 600) => 0.5 + 0.5 * Math.sin((num(clock) / Math.max(1, periodMs)) * TAU);

// ---------- 基础绘制 ----------
function roundPts(pts) {
  const out = new Array(pts.length);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    out[i] = Array.isArray(p) ? { x: rnd(p[0]), y: rnd(p[1]) } : { x: rnd(p.x), y: rnd(p.y) };
  }
  return out;
}

// 一个实心多边形（自动取整 + alpha 夹紧 + 顶点不足 3 直接跳过）
export function poly(g, pts, color, alpha = 1) {
  if (!pts || pts.length < 3) return;
  g.fillStyle(color, clamp01(alpha));
  g.fillPoints(roundPts(pts), true);
}

export function dots(g, pts, color, alpha = 1) {
  if (!pts || !pts.length) return;
  g.fillStyle(color, clamp01(alpha));
  for (let i = 0; i < pts.length; i++) g.fillRect(rnd(pts[i].x), rnd(pts[i].y), 1, 1);
}

export function blocks(g, pts, color, alpha = 1, size = 2) {
  if (!pts || !pts.length) return;
  const s = Math.max(1, rnd(size));
  const o = Math.floor(s / 2);
  g.fillStyle(color, clamp01(alpha));
  for (let i = 0; i < pts.length; i++) g.fillRect(rnd(pts[i].x) - o, rnd(pts[i].y) - o, s, s);
}

// list: [[x, y, w, h], ...]
export function rects(g, list, color, alpha = 1) {
  if (!list || !list.length) return;
  g.fillStyle(color, clamp01(alpha));
  for (let i = 0; i < list.length; i++) {
    const q = list[i];
    g.fillRect(rnd(q[0]), rnd(q[1]), Math.max(1, rnd(q[2])), Math.max(1, rnd(q[3])));
  }
}

// ---------- 几何 ----------
// 局部 (lx, ly) 旋到世界；angle=0 朝 +x
export function offset(x, y, ang, lx, ly) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return { x: x + lx * c - ly * s, y: y + lx * s + ly * c };
}

// [[lx, ly], ...] → 世界点数组
export function shape(x, y, ang, list) {
  const out = new Array(list.length);
  for (let i = 0; i < list.length; i++) out[i] = offset(x, y, ang, list[i][0], list[i][1]);
  return out;
}

// 正多边形（sides=6 即六边形）
export function nGonPts(cx, cy, rad, sides = 6, rot = 0) {
  const out = [];
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * TAU;
    out.push({ x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad });
  }
  return out;
}
export const hexPts = (cx, cy, rad, rot = 0) => nGonPts(cx, cy, rad, 6, rot);
export const triPts = (cx, cy, rad, rot = 0) => nGonPts(cx, cy, rad, 3, rot);

// 五角星（外/内半径）
export function starPts(cx, cy, rot, outer, inner, arms = 5) {
  const out = [];
  const n = arms * 2;
  for (let i = 0; i < n; i++) {
    const rad = i % 2 === 0 ? outer : inner;
    const a = rot - Math.PI / 2 + (i / n) * TAU;
    out.push({ x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad });
  }
  return out;
}

// 轴对齐矩形 → 顶点（给 poly/shell 用，省得手写四次坐标）
export function rectPts(x, y, w, h) {
  return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
}

// 菱形（朝 +x 的长菱形；len 前尖、back 后尖、halfW 半宽）
export function arrowPts(x, y, ang, len, back, halfW) {
  return shape(x, y, ang, [[len, 0], [0, -halfW], [-back, 0], [0, halfW]]);
}

// 圆环带（annulus）：w 是环带厚度，squash<1 压扁成椭圆，phase 旋转
export function ringPts(cx, cy, rad, w = 3, phase = 0, squash = 1, seg = 24) {
  const r = Math.max(1.1, rad);
  const rOut = r + w / 2;
  const rIn = Math.max(0.4, r - w / 2);
  const out = [];
  for (let i = 0; i <= seg; i++) {
    const a = phase + (i / seg) * TAU;
    out.push({ x: cx + Math.cos(a) * rOut, y: cy + Math.sin(a) * rOut * squash });
  }
  for (let i = seg; i >= 0; i--) {
    const a = phase + (i / seg) * TAU;
    out.push({ x: cx + Math.cos(a) * rIn, y: cy + Math.sin(a) * rIn * squash });
  }
  return out;
}

// 环形扇面（扇形火舌/盾面/声波弧）
export function sectorPts(cx, cy, r0, r1, a0, a1, seg = 8) {
  const out = [];
  for (let i = 0; i <= seg; i++) {
    const a = a0 + (a1 - a0) * (i / seg);
    out.push({ x: cx + Math.cos(a) * r1, y: cy + Math.sin(a) * r1 });
  }
  for (let i = seg; i >= 0; i--) {
    const a = a0 + (a1 - a0) * (i / seg);
    out.push({ x: cx + Math.cos(a) * r0, y: cy + Math.sin(a) * r0 });
  }
  return out;
}

// 尖刺（冰棱/石刺/爪）：从 (x,y) 朝 ang 长 len，基部半宽 halfW
export function spikePts(x, y, ang, len, halfW, bulge = 0.5) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const nx = -s;
  const ny = c;
  const tip = { x: x + c * len, y: y + s * len };
  const b1 = { x: x + nx * halfW, y: y + ny * halfW };
  const b2 = { x: x - nx * halfW, y: y - ny * halfW };
  if (bulge <= 0) return [b1, tip, b2];
  const mb = halfW * bulge;
  const mx = x + c * len * 0.55;
  const my = y + s * len * 0.55;
  return [b1, { x: mx + nx * mb, y: my + ny * mb }, tip, { x: mx - nx * mb, y: my - ny * mb }, b2];
}

// 不规则团块（岩石/火团/烟团）：固定 seed → 固定形状
export function blobPts(cx, cy, rad, seed, lobes = 9, wob = 0.24, spin = 0) {
  const out = [];
  for (let i = 0; i < lobes; i++) {
    const a = spin + (i / lobes) * TAU;
    const r = rad * (1 - wob + hash01(seed * 31 + i) * wob * 2);
    out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return out;
}

// 锯齿电弧折线：a→b，amp 为横向抖动幅度（像素）
export function boltPts(ax, ay, bx, by, seed, amp, segs = 7) {
  const out = [{ x: ax, y: ay }];
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < segs; i++) {
    const u = i / segs;
    const j = hashSym(seed * 131 + i) * amp;
    out.push({ x: ax + dx * u - (dy / len) * j, y: ay + dy * u + (dx / len) * j });
  }
  out.push({ x: bx, y: by });
  return out;
}

// 沿线均分（硬边直线用）
export function lineDots(ax, ay, bx, by, count) {
  const n = Math.max(2, count | 0);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    out[i] = { x: ax + (bx - ax) * u, y: ay + (by - ay) * u };
  }
  return out;
}

export function ringDots(cx, cy, rad, count, phase = 0, squash = 1) {
  const out = new Array(count);
  for (let i = 0; i < count; i++) {
    const a = phase + (i / count) * TAU;
    out[i] = { x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad * squash };
  }
  return out;
}

// 确定性碎屑环：n 颗，半径 rMin..rMax 之间抖动
export function scatterPts(cx, cy, n, seed, rMin, rMax) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + hashSym(seed * 17 + i) * 0.5;
    const r = rMin + (rMax - rMin) * hash01(seed * 29 + i * 7 + 3);
    out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return out;
}

// ---------- 体积：一层形状画成 暗轮廓 + 本体 + 亮芯 ----------
// build(scale) → 顶点数组；scale 1 是外轮廓，0.8 是本体，0.44 是亮芯
export function shell(g, build, col, alpha = 1, scales) {
  const sc = scales ?? [[1, col.edge, 0.95], [0.8, col.body, 1], [0.44, col.core, 0.92]];
  for (let i = 0; i < sc.length; i++) {
    poly(g, build(sc[i][0]), sc[i][1], alpha * sc[i][2]);
  }
}

// ---------- 粗笔画 ----------
// 折线 → 锥形实体带（p0 处宽 w0，末点处宽 w1）
export function ribbon(pts, w0, w1) {
  const n = pts.length;
  if (n < 2) return [];
  const norm = (i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return { nx: -dy / len, ny: dx / len };
  };
  const left = [];
  const right = [];
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0 : i / (n - 1);
    const w = (w0 + (w1 - w0) * u) * 0.5;
    const { nx, ny } = norm(i);
    left.push({ x: pts[i].x + nx * w, y: pts[i].y + ny * w });
    right.push({ x: pts[i].x - nx * w, y: pts[i].y - ny * w });
  }
  const out = left.slice();
  for (let i = n - 1; i >= 0; i--) out.push(right[i]);
  return out;
}

export function band(g, pts, w0, w1, color, alpha = 1) {
  poly(g, ribbon(pts, w0, w1), color, alpha);
}

// 一条粗线的完整体积：暗边 + 本体 + 中心亮线
export function band3(g, pts, w0, w1, col, alpha = 1, edgePad = 3) {
  band(g, pts, w0 + edgePad, w1 + edgePad, col.edge, alpha * 0.95);
  band(g, pts, w0, w1, col.body, alpha);
  band(g, pts, Math.max(1, w0 * 0.34), Math.max(1.2, w1 * 0.34), col.core, alpha * 0.9);
}

// 环形带的体积版
export function ring3(g, cx, cy, rad, w, col, alpha = 1, opts = {}) {
  poly(g, ringPts(cx, cy, rad, w + 2.6, opts.phase ?? 0, opts.squash ?? 1, opts.seg ?? 24), col.edge, alpha * 0.95);
  poly(g, ringPts(cx, cy, rad, w, opts.phase ?? 0, opts.squash ?? 1, opts.seg ?? 24), col.body, alpha);
  poly(g, ringPts(cx, cy, rad, Math.max(1, w * 0.38), opts.phase ?? 0, opts.squash ?? 1, opts.seg ?? 24), col.core, alpha * 0.85);
}

// ---------- ctx 归一化 ----------
export function normalize(ctx) {
  const c = ctx && typeof ctx === 'object' ? ctx : {};
  const x = num(c.x);
  const y = num(c.y);
  const raw = Array.isArray(c.trail) ? c.trail : [];
  const trail = [];
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i];
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) trail.push({ x: p.x, y: p.y });
  }
  const from = c.from && Number.isFinite(c.from.x) && Number.isFinite(c.from.y) ? { x: c.from.x, y: c.from.y } : { x, y };
  const to = c.to && Number.isFinite(c.to.x) && Number.isFinite(c.to.y) ? { x: c.to.x, y: c.to.y } : { x, y };
  return {
    x, y,
    angle: num(c.angle, 0),
    k: clamp01(num(c.k)),
    clock: num(c.clock, 0),
    radius: Math.max(3, num(c.radius, 14)),
    index: num(c.index, 0),
    trail,
    from,
    to,
  };
}

// ---------- 拖尾：锥形丝带 + 元素花活 ----------
// raw 顺序为「旧 → 新」，丝带从尾（细）到头（粗）。
export function trailPts(c, o = {}) {
  const max = Math.max(1, Math.min(o.max ?? 7, 12));
  const raw = c.trail;
  const n = Math.min(raw.length, max);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const p = raw[raw.length - n + i];
    const u = n === 1 ? 1 : i / (n - 1);
    const sway = (o.sway ?? 0) * Math.sin(u * 5.4 + c.clock / 320);
    pts.push({
      x: p.x + (o.driftX ?? 0) * (1 - u) + sway,
      y: p.y + (o.driftY ?? 0) * (1 - u) - Math.abs(sway) * (o.swayUp ?? 0),
    });
  }
  return pts;
}

export function trailRibbon(g, c, col, o = {}) {
  const pts = trailPts(c, o);
  const a = fade(c.k);
  if (pts.length < 2) {
    // 只有一颗历史点：直接一颗方块，别断尾
    if (pts.length === 1) blocks(g, pts, col.body, a, o.nearW ?? 5);
    return;
  }
  const farW = o.farW ?? 1.6;
  const nearW = o.nearW ?? 6;
  band(g, pts, farW + 3, nearW + 3, col.edge, a * 0.9);
  band(g, pts, farW, nearW, col.body, a);
  band(g, pts, Math.max(1, farW * 0.4), Math.max(1.4, nearW * 0.36), col.core, a * 0.9);
  return pts;
}

// 元素化拖尾花活：style 决定「丝带之外还撒什么」
const TRAIL_FLOURISH = {
  frost(g, c, col, o, pts, a) {
    // 冰晶：沿丝带撒十字冰点，尾部更稀
    const cross = [];
    for (let i = 0; i < pts.length; i += 2) {
      const p = pts[i];
      const s = 1 + (i % 2);
      cross.push({ x: p.x, y: p.y - s }, { x: p.x - s, y: p.y }, { x: p.x + s, y: p.y });
    }
    dots(g, cross, col.core, a * 0.8);
    blocks(g, pts.slice(-2), col.accent, a * 0.7, 2);
  },
  rune(g, c, col, o, pts, a) {
    // 奥术方块：沿丝带挂旋转的小方
    const box = [];
    for (let i = 0; i < pts.length; i += 2) {
      const p = pts[i];
      box.push({ x: p.x - 1, y: p.y - 1 });
    }
    blocks(g, box, col.accent, a * 0.85, 3);
    dots(g, pts.filter((p, i) => i % 3 === 0), col.core, a);
  },
  ember(g, c, col, o, pts, a) {
    // 火星上飘：越靠近尾部越往上飘
    const up = [];
    for (let i = 0; i < pts.length; i++) {
      const u = pts.length === 1 ? 1 : i / (pts.length - 1);
      up.push({ x: pts[i].x + hashSym(i * 7 + 1) * 3, y: pts[i].y - (1 - u) * (6 + (i % 3) * 3) });
    }
    dots(g, up, col.accent, a * 0.85);
    blocks(g, pts.slice(-3), col.core, a, 2);
  },
  smoke(g, c, col, o, pts, a) {
    // 烟团：越远越大越暗
    const puff = [];
    for (let i = 0; i < pts.length; i++) {
      const u = pts.length === 1 ? 1 : i / (pts.length - 1);
      puff.push({ x: pts[i].x, y: pts[i].y - (1 - u) * 4 });
    }
    blocks(g, puff, C.mute, a * 0.5, 5);
    blocks(g, puff.filter((p, i) => i % 2 === 0), col.body, a * 0.55, 4);
    dots(g, pts.slice(-3), col.core, a);
  },
  spark(g, c, col, o, pts, a) {
    // 电点：沿丝带做锯齿跳动
    const zig = [];
    for (let i = 0; i < pts.length; i++) {
      zig.push({ x: pts[i].x + hashSym(i * 13 + 5) * 4, y: pts[i].y + hashSym(i * 19 + 2) * 4 });
    }
    dots(g, zig, col.core, a);
    band(g, pts, 1, 2, col.accent, a * 0.8);
  },
  ghost(g, c, col, o, pts, a) {
    // 残影：把丝带整体平移再画一层低 alpha
    const off = pts.map((p, i) => ({ x: p.x + 3 - (i % 2) * 6, y: p.y - 2 }));
    band(g, off, 2, 5, col.edge, a * 0.45);
    dots(g, pts.slice(-3), col.core, a);
  },
  siphon(g, c, col, o, pts, a) {
    // 螺旋丝：主丝带两侧各一条正弦细丝
    const l = [];
    const r = [];
    for (let i = 0; i < pts.length; i++) {
      const u = pts.length === 1 ? 0 : i / (pts.length - 1);
      const s = Math.sin(u * 8 + c.clock / 200) * 4;
      l.push({ x: pts[i].x, y: pts[i].y + s });
      r.push({ x: pts[i].x, y: pts[i].y - s });
    }
    band(g, l, 1, 2, col.accent, a * 0.9);
    band(g, r, 1, 2, col.accent, a * 0.9);
    dots(g, pts.slice(-2), col.core, a);
  },
  ring(g, c, col, o, pts, a) {
    // 沿途小环：回声/圣环
    const rr = [];
    for (let i = 0; i < pts.length; i += 2) rr.push(ringPts(pts[i].x, pts[i].y, 4, 2, i, 1, 10));
    for (const p of rr) poly(g, p, col.accent, a * 0.5);
    dots(g, pts.slice(-3), col.core, a);
  },
  leaf(g, c, col, o, pts, a) {
    // 叶片：两侧交替斜块
    const lv = [];
    for (let i = 0; i < pts.length; i++) {
      const s = i % 2 ? 1 : -1;
      lv.push({ x: pts[i].x + s * 3, y: pts[i].y + (i % 3) - 1 });
    }
    blocks(g, lv, col.accent, a * 0.85, 3);
    dots(g, pts.slice(-2), col.core, a);
  },
  rubble(g, c, col, o, pts, a) {
    // 碎石 + 尘土
    const rb = [];
    for (let i = 0; i < pts.length; i++) {
      const u = pts.length === 1 ? 1 : i / (pts.length - 1);
      rb.push({ x: pts[i].x + hashSym(i * 11 + 4) * 4, y: pts[i].y + (1 - u) * 3 });
    }
    blocks(g, rb, col.body, a * 0.9, 3);
    dots(g, rb.map((p, i) => ({ x: p.x, y: p.y + 3 })), C.mute, a * 0.5);
  },
  wisp(g, c, col, o, pts, a) {
    // 游魂波浪丝：双股交错
    const w1 = [];
    const w2 = [];
    for (let i = 0; i < pts.length; i++) {
      const u = pts.length === 1 ? 0 : i / (pts.length - 1);
      const s = Math.sin(u * 10 + c.clock / 260) * 5;
      w1.push({ x: pts[i].x + s, y: pts[i].y });
      w2.push({ x: pts[i].x - s, y: pts[i].y - 2 });
    }
    band(g, w1, 1, 2, col.body, a * 0.75);
    band(g, w2, 1, 2, col.accent, a * 0.6);
    dots(g, pts.slice(-2), col.core, a);
  },
  dash(g, c, col, o, pts, a) {
    // 破风虚线：断开的横块
    const out = [];
    for (let i = 0; i < pts.length; i += 2) {
      out.push([pts[i].x - 2, pts[i].y - 1, 5, 2]);
    }
    rects(g, out, col.body, a * 0.85);
    rects(g, out.slice(-2).map((q) => [q[0] - 1, q[1] + 1, 7, 1]), col.core, a * 0.7);
  },
  star(g, c, col, o, pts, a) {
    // 星屑：每颗历史点一颗四角星
    dots(g, pts, col.core, a * 0.9);
    dots(g, pts.map((p, i) => ({ x: p.x + (i % 2 ? 2 : -2), y: p.y - 1 })), col.accent, a * 0.7);
  },
};

export const TRAIL_STYLE_NAMES = Object.keys(TRAIL_FLOURISH);

// 统一入口：丝带 + 花活；style 不认识就只画丝带
export function drawTrail(g, c, col, o = {}) {
  if (!c.trail.length) return;
  const pts = trailRibbon(g, c, col, o);
  if (!pts || pts.length < 2) return;
  const fn = TRAIL_FLOURISH[o.style];
  if (fn) fn(g, c, col, o, pts, fade(c.k));
}

// ---------- 入场 / 退场（"出现"与"消失"） ----------
// 三类法术各有一套入退场语言，避免 16 个法术又长一个样：
//   弹道类 converge/dissipate：光点向心汇聚 → 命中后残余光点被吸回中心
//   爆裂类 erupt/settle      ：中心先炸开一圈亮环 → 余韵碎屑外飘上浮、中心留残环与焦痕
//   守护类 assemble/shatter  ：符文块与环从外归位 → 散场时环带碎裂飞散
// 都只吃 (g, ctx, colors, style)，调用方在主体之前/之后各叠一层，主体不受影响。
export const ENTRY_SPAN = 0.13;   // 前 13% 生命周期做入场
export const EXIT_START = 0.72;   // 72% 之后做退场

export function drawEntry(g, c, col, style = 'converge') {
  const k = clamp01(num(c.k));
  if (k >= ENTRY_SPAN) return;
  const p = clamp01(k / ENTRY_SPAN);
  const R = Math.max(6, num(c.radius, 16));
  const spin = num(c.clock) / 180;
  if (style === 'erupt') {
    // 炸开：一圈亮环瞬间撑开 + 碎屑甩出
    const rr = R * (0.32 + 0.9 * p);
    ring3(g, c.x, c.y, rr, 3.4 * (1 - 0.4 * p), col, (1 - p) * 0.95, { phase: spin, squash: 0.85, seg: 18 });
    blocks(g, scatterPts(c.x, c.y, 10, 3, rr * 0.9, rr * 1.35), col.accent, (1 - p) * 0.9, 2);
    dots(g, [c], C.white, (1 - p) * 0.9);
  } else if (style === 'assemble') {
    // 归位：符文块从 1.5R 收进来 + 外环合拢
    const rr = R * (1.5 - 0.5 * p);
    ring3(g, c.x, c.y, rr, 3, col, (0.35 + 0.65 * p) * 0.9, { phase: -spin, seg: 20 });
    const nodes = [];
    for (let i = 0; i < 6; i++) nodes.push(offset(c.x, c.y, spin + (i / 6) * TAU, rr * 0.92, 0));
    blocks(g, nodes, col.accent, 0.5 + 0.5 * p, 3);
  } else {
    // 凝聚：碎片/光点从 1.7R 向心汇聚，中心先亮
    const rr = R * (1.7 - 1.2 * p);
    const pts = [];
    for (let i = 0; i < 8; i++) {
      const ang = spin + (i / 8) * TAU;
      pts.push(offset(c.x, c.y, ang, rr * (0.85 + hash01(7 + i) * 0.3), 0));
    }
    dots(g, pts, col.accent, 0.55 + 0.45 * p);
    ring3(g, c.x, c.y, rr * 0.58, 2.6, col, (1 - p * 0.5) * 0.8, { phase: spin * 1.4, seg: 16 });
    blocks(g, [c], C.white, 0.35 + 0.55 * p, 3);
  }
}

export function drawExit(g, c, col, style = 'dissipate') {
  const k = clamp01(num(c.k));
  if (k <= EXIT_START) return;
  const p = clamp01((k - EXIT_START) / (1 - EXIT_START));
  const R = Math.max(6, num(c.radius, 16));
  const spin = num(c.clock) / 260;
  const a = 1 - p;
  if (style === 'settle') {
    // 沉降：碎屑外飘 + 上浮，中心留一圈残环和地面焦痕
    const out = [];
    for (let i = 0; i < 12; i++) {
      const ang = spin + (i / 12) * TAU + hashSym(23 + i) * 0.3;
      const rr = R * (0.7 + 0.75 * p) * (0.9 + hash01(23 + i * 3) * 0.25);
      out.push(offset(c.x, c.y, ang, rr, -R * 0.35 * p * (0.6 + hash01(23 + i * 5))));
    }
    blocks(g, out, col.edge, a * 0.9, 5);
    blocks(g, out, col.body, a * 0.95, 3);
    dots(g, out.filter((q, i) => i % 2 === 0), col.accent, a * 0.85);
    poly(g, ringPts(c.x, c.y, R * (1.1 + 0.3 * p), 2.6, -spin, 0.95, 18), col.accent, a * 0.45);
    poly(g, ringPts(c.x, c.y, R * (0.95 + 0.15 * p), 2.2, spin, 0.9, 18), col.edge, a * 0.55);
    rects(g, [[rnd(c.x - R * 0.6), rnd(c.y + R * 0.42), rnd(R * 1.2), 3]], col.edge, a * 0.5);
  } else if (style === 'shatter') {
    // 碎裂：环带断成楔形飞散
    for (let i = 0; i < 8; i++) {
      const a0 = spin + (i / 8) * TAU;
      const rr = R * (0.85 + 0.7 * p);
      const q = offset(c.x, c.y, a0, rr, 0);
      poly(g, sectorPts(q.x, q.y, 1.5, 5 + 3 * (1 - p), a0 + 0.15, a0 + 0.55, 4), i % 2 ? col.body : col.accent, a * 0.9);
    }
    poly(g, ringPts(c.x, c.y, R * (0.8 + 0.5 * p), 2, -spin, 1, 18), col.edge, a * 0.5);
  } else {
    // 收束：残余光点被吸回中心，最后只剩一颗
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const ang = spin + (i / 10) * TAU;
      const rr = R * (1.05 - 0.85 * p) * (0.85 + hash01(23 + i * 3) * 0.3);
      pts.push(offset(c.x, c.y, ang, rr, 0));
    }
    blocks(g, pts, col.edge, a * 0.85, 4);
    blocks(g, pts, col.accent, a * 0.95, 2);
    dots(g, pts.filter((q, i) => i % 2 === 0), C.white, a * 0.8);
    ring3(g, c.x, c.y, R * (0.9 - 0.6 * p), 3, col, a * 0.85, { phase: spin * 1.6, seg: 16 });
    blocks(g, [c], C.white, a * a, 2);
  }
}

// 弹丸出膛：只在飞行最初 8% 画一小圈"凝形"闪光（4 条指令，成本可忽略）
export function drawSpawnFlash(g, c, col) {
  const k = clamp01(num(c.k));
  if (k >= 0.08) return;
  const p = k / 0.08;
  const R = 5 + 7 * p;
  ringPts(c.x, c.y, R, 2.2, 0, 1, 12);
  poly(g, ringPts(c.x, c.y, R, 2.2, 0, 1, 12), col.accent, (1 - p) * 0.85);
  blocks(g, [c], C.white, (1 - p) * 0.9, 2);
}

