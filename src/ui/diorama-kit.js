// 过场布景材质工具库（diorama kit）
// 只做「静态布景」用得到的硬边像素几何：砖石/拱券/立柱/木梁/裂纹/苔痕/水面/星野。
// 全部纯绘制函数，坐标取整、种子确定、不读时间、不建对象——静态层只在 create 时跑一次，
// 所以这里可以花指令，但单带仍要守住 ~1300 条（见 tests/diorama-kit.test.js）。
import { C, pxRect, pxLine, pxPoly, pxFrame, pxDiamond } from './Palette.js';
import { clamp01, makeRng, thinLine } from './cinematic-art.js';

const R = Math.round;
const fin = (v) => (Number.isFinite(v) ? v : 0);

// ---------- 基础色块 ----------
export function fill(g, x, y, w, h, color, alpha = 1) {
  if (w <= 0 || h <= 0) return;
  pxRect(g, R(x), R(y), R(w), R(h), color, alpha);
}

// 横向砖带：只画明暗层与水平灰缝，竖向砖缝靠上方 bricks() 补
export function courses(g, { x, y, w, h, rowH = 7, color, alpha = 1, light, lightAlpha = 0.18 }) {
  fill(g, x, y, w, h, color, alpha);
  const rows = Math.max(1, Math.floor(h / rowH));
  for (let i = 0; i < rows; i++) {
    const yy = y + i * rowH;
    pxRect(g, R(x), R(yy), R(w), 1, C.void, 0.22 * alpha);
    if (light && i % 2 === 0) pxRect(g, R(x), R(yy + 1), R(w), 1, light, lightAlpha * alpha);
  }
}

// 砖墙：底带 + 逐砖面 + 稀疏竖向砖缝。
// density 0..1 控制真正描出的砖（远处的墙只留横缝，省指令也避免高频噪点）。
export function bricks(g, {
  x, y, w, h, rowH = 8, segW = 16, color, alpha = 1,
  face, faceAlpha = 0.35, dark, seed = 1, density = 0.55, shade = 0.16,
}) {
  courses(g, { x, y, w, h, rowH, color, alpha, light: face });
  const rng = makeRng(seed);
  const rows = Math.max(1, Math.floor(h / rowH));
  const cols = Math.max(1, Math.floor(w / segW));
  for (let r = 0; r < rows; r++) {
    const yy = y + r * rowH;
    const offset = (r % 2) * (segW / 2);
    for (let c = 0; c <= cols; c++) {
      const bx = x - offset + c * segW;
      if (bx + segW < x || bx > x + w) continue;
      const x0 = Math.max(x, bx), x1 = Math.min(x + w, bx + segW);
      if (x1 - x0 < 3) continue;
      if (rng() > density) continue;
      pxRect(g, R(x0) + 1, R(yy) + 1, R(x1 - x0) - 2, rowH - 1, C.void, 0.16 * alpha);
      if (face && rng() > 0.55) {
        pxRect(g, R(x0) + 1, R(yy) + 1, R(x1 - x0) - 2, 1, face, faceAlpha * alpha * shade);
      }
      if (dark && rng() > 0.86) {
        pxRect(g, R(x0) + 2, R(yy) + rowH - 2, Math.max(1, R(x1 - x0) - 4), 1, dark, 0.3 * alpha);
      }
    }
  }
}

// 乱石块：不规则宽度的层砌，用在废墟/台座/断裂墙体
export function ashlar(g, {
  x, y, w, h, rowH = 11, color, alpha = 1, face, dark, seed = 3, density = 0.8,
}) {
  fill(g, x, y, w, h, color, alpha);
  const rng = makeRng(seed);
  const rows = Math.max(1, Math.floor(h / rowH));
  for (let r = 0; r < rows; r++) {
    const yy = y + r * rowH;
    let bx = x - rng() * rowH;
    while (bx < x + w) {
      const bw = rowH * (1.4 + rng() * 2.1);
      const x0 = Math.max(x, bx), x1 = Math.min(x + w, bx + bw);
      if (x1 - x0 > 5 && rng() < density) {
        pxRect(g, R(x0) + 1, R(yy) + 1, R(x1 - x0) - 2, rowH - 2, C.void, 0.14 * alpha);
        if (face) pxRect(g, R(x0) + 2, R(yy) + 2, R(x1 - x0) - 4, 1, face, 0.22 * alpha);
        if (dark && rng() > 0.7) pxRect(g, R(x0) + 2, R(yy) + rowH - 3, R(x1 - x0) - 4, 1, dark, 0.26 * alpha);
      }
      bx = x1 + (rng() > 0.6 ? 1 : 0);
    }
  }
}

// ---------- 拱券 ----------
// 尖拱轮廓点（真正的双心哥特拱）：baseY 是起拱线，h 是矢高。
// 左半弧圆心落在起拱线上 xc = cx + a，a = (h² - (w/2)²) / w；h > w/2 时 a > 0，拱顶收成尖角。
// h <= w/2 会退化成半圆拱（a <= 0），此时按半圆处理，避免圆心跑到拱内。
export function archPoints(cx, baseY, w, h, segs = 14) {
  const half = Math.max(1, w / 2);
  const hh = Math.max(1, h);
  let a = (hh * hh - half * half) / w;
  if (a < 0) a = 0;
  const rad = Math.hypot(a, hh);
  const apex = Math.atan2(hh, -a); // 从圆心看拱顶的角度（第二象限）
  const left = [];
  for (let i = 0; i <= segs; i++) {
    const th = Math.PI + (apex - Math.PI) * (i / segs);
    left.push({ x: R(cx + a + rad * Math.cos(th)), y: R(baseY - rad * Math.sin(th)) });
  }
  const pts = left.slice();
  for (let i = left.length - 2; i >= 0; i--) {
    pts.push({ x: R(2 * cx - left[i].x), y: left[i].y });
  }
  return pts;
}

// 尖拱：实心窗洞 + 轮廓描边（t=0 只画轮廓）
export function pointedArch(g, { cx, baseY, w, h, t = 1, color, alpha = 1, fillColor, fillAlpha = 1, segs = 14 }) {
  const outline = archPoints(cx, baseY, w, h, segs);
  if (fillColor) {
    const poly = [{ x: R(cx - w / 2), y: R(baseY) }, ...outline, { x: R(cx + w / 2), y: R(baseY) }];
    pxPoly(g, poly, fillColor, fillAlpha);
  }
  if (t > 0) {
    g.lineStyle(t, color, alpha);
    g.strokePoints(outline, false);
    pxRect(g, R(cx - w / 2), R(baseY), 1, t, color, alpha);
    pxRect(g, R(cx + w / 2), R(baseY), 1, t, color, alpha);
  }
}

// 圆拱轮廓点（半椭圆）
export function roundArchPoints(cx, baseY, w, h, segs = 12) {
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const a = Math.PI * (i / segs);
    pts.push({ x: R(cx - Math.cos(a) * w / 2), y: R(baseY - Math.sin(a) * h) });
  }
  return pts;
}

export function roundArch(g, { cx, baseY, w, h, t = 1, color, alpha = 1, fillColor, fillAlpha = 1 }) {
  const outline = roundArchPoints(cx, baseY, w, h);
  if (fillColor) {
    const poly = [{ x: R(cx - w / 2), y: R(baseY) }, ...outline, { x: R(cx + w / 2), y: R(baseY) }];
    pxPoly(g, poly, fillColor, fillAlpha);
  }
  g.lineStyle(t, color, alpha);
  g.strokePoints(outline, false);
}

// 彩窗：尖拱玻璃 + 竖棂 + 三块色格，每个镜子都靠窗色认幕
export function archWindow(g, {
  cx, baseY, w, h, frame = C.ink, glass = C.runeDim, glass2, mullions = 2, alpha = 1, mullionColor = C.ink,
}) {
  pointedArch(g, { cx, baseY, w, h, t: 0, fillColor: frame, fillAlpha: alpha });
  const inset = 3;
  const gw = w - inset * 2;
  const gh = h - inset;
  if (glass2) {
    pxRect(g, R(cx - gw / 2), R(baseY - gh * 0.42), R(gw), R(gh * 0.42), glass2, 0.55 * alpha);
    pxRect(g, R(cx - gw / 2), R(baseY - gh), R(gw), R(gh * 0.58), glass, 0.5 * alpha);
  } else {
    pxRect(g, R(cx - gw / 2), R(baseY - gh), R(gw), R(gh), glass, 0.42 * alpha);
  }
  for (let i = 1; i <= mullions; i++) {
    const x = R(cx - gw / 2 + (gw * i) / (mullions + 1));
    pxRect(g, x, R(baseY - gh), 1, R(gh), mullionColor, 0.85 * alpha);
  }
  pxRect(g, R(cx - gw / 2), R(baseY - gh * 0.5), R(gw), 1, mullionColor, 0.7 * alpha);
}

// ---------- 建筑构件 ----------
export function column(g, {
  cx, topY, bottomY, w = 10, shaft = C.stone, light = C.stoneLight, dark = C.stoneDark,
  capH = 4, baseH = 4, alpha = 1, flutes = 3,
}) {
  const h = bottomY - topY;
  if (h <= 0) return;
  pxRect(g, R(cx - w / 2), R(topY), R(w), R(h), shaft, alpha);
  pxRect(g, R(cx - w / 2), R(topY), 1, R(h), light, 0.35 * alpha);
  pxRect(g, R(cx + w / 2) - 1, R(topY), 1, R(h), C.void, 0.4 * alpha);
  for (let i = 1; i <= flutes; i++) {
    const x = R(cx - w / 2 + (w * i) / (flutes + 1));
    pxRect(g, x, R(topY) + capH, 1, R(h) - capH - baseH, dark, 0.5 * alpha);
  }
  pxRect(g, R(cx - w / 2 - 1), R(topY), R(w + 2), capH, light, 0.5 * alpha);
  pxRect(g, R(cx - w / 2 - 1), R(topY), R(w + 2), 1, light, 0.8 * alpha);
  pxRect(g, R(cx - w / 2 - 1), R(bottomY) - baseH, R(w + 2), baseH, dark, 0.85 * alpha);
}

// 木梁/木架：横梁 + 两端铁箍
export function beam(g, { x, y, w, h = 4, color = 0x4a3826, light = 0x6a5236, alpha = 1, bolts = true }) {
  pxRect(g, R(x), R(y), R(w), R(h), color, alpha);
  pxRect(g, R(x), R(y), R(w), 1, light, 0.7 * alpha);
  pxRect(g, R(x), R(y + h) - 1, R(w), 1, C.void, 0.35 * alpha);
  if (bolts) {
    pxRect(g, R(x) + 2, R(y) + 1, 1, Math.max(1, h - 2), C.stone, 0.5 * alpha);
    pxRect(g, R(x + w) - 3, R(y) + 1, 1, Math.max(1, h - 2), C.stone, 0.5 * alpha);
  }
}

// 木板面：水平拼板 + 木节
export function planks(g, { x, y, w, h, color, dark, light, alpha = 1, rowH = 6, seed = 5 }) {
  pxRect(g, R(x), R(y), R(w), R(h), color, alpha);
  const rng = makeRng(seed);
  const rows = Math.max(1, Math.floor(h / rowH));
  for (let i = 0; i < rows; i++) {
    const yy = y + i * rowH;
    pxRect(g, R(x), R(yy), R(w), 1, light, 0.22 * alpha);
    pxRect(g, R(x), R(yy + rowH) - 1, R(w), 1, dark, 0.55 * alpha);
    if (rng() > 0.5) {
      const kx = R(x + rng() * (w - 4)) + 2;
      pxRect(g, kx, R(yy) + 2, 2, 1, dark, 0.7 * alpha);
    }
  }
}

// 阶梯
export function steps(g, { cx, y, w, count = 3, rise = 4, color, light, alpha = 1 }) {
  for (let i = 0; i < count; i++) {
    const ww = w - i * 8;
    const yy = y + i * rise;
    pxRect(g, R(cx - ww / 2), R(yy), R(ww), rise, color, alpha);
    pxRect(g, R(cx - ww / 2), R(yy), R(ww), 1, light, 0.45 * alpha);
  }
}

// ---------- 破损/材质依附 ----------
// 裂缝：主干 + 分叉；沿墙走，用来把「砖缝」和「破损」绑在同一材质上
export function cracks(g, { x, y, len = 40, seed = 1, color = C.void, alpha = 0.75, branches = 2, drift = 8, t = 1 }) {
  const rng = makeRng(seed);
  let px = x, py = y;
  for (let i = 0; i < len; i++) {
    px += Math.round((rng() - 0.5) * 2.2);
    py += 1;
    pxRect(g, R(px), R(py), 1, 1, color, alpha);
    if (i === Math.floor(len * 0.4) || i === Math.floor(len * 0.75)) {
      for (let b = 0; b < branches; b++) {
        const dir = rng() > 0.5 ? 1 : -1;
        let bx = px, by = py;
        const bl = 3 + Math.floor(rng() * drift);
        for (let k = 0; k < bl; k++) {
          bx += dir;
          by += rng() > 0.6 ? 1 : 0;
          pxRect(g, R(bx), R(by), 1, 1, color, alpha * 0.8);
        }
      }
    }
  }
}

// 苔痕/霉斑：依附在石缝与墙角，密度低、颜色单一，不能变成随机噪点
export function moss(g, { x, y, w, h, seed = 2, color = C.sage, color2, count = 40, alpha = 0.5 }) {
  const rng = makeRng(seed);
  for (let i = 0; i < count; i++) {
    const mx = R(x + rng() * w);
    const my = R(y + Math.pow(rng(), 0.6) * h);
    const c = color2 && rng() > 0.7 ? color2 : color;
    pxRect(g, mx, my, rng() > 0.7 ? 2 : 1, 1, c, alpha * (0.5 + rng() * 0.5));
  }
}

// 碎石/瓦砾堆：贴地三角形分布
export function rubble(g, { x, y, w, h = 10, seed = 7, color, color2, count = 26, alpha = 1 }) {
  const rng = makeRng(seed);
  for (let i = 0; i < count; i++) {
    const rx = R(x + rng() * w);
    const ry = R(y + Math.pow(rng(), 0.5) * h);
    const sz = rng() > 0.8 ? 3 : rng() > 0.5 ? 2 : 1;
    pxRect(g, rx, ry, sz, Math.max(1, sz - 1), color2 && rng() > 0.55 ? color2 : color, alpha * (0.55 + rng() * 0.45));
  }
}

// 水面：暗水 + 横向反光条 + 稀疏涟漪，反光颜色由幕色给
export function water(g, { x, y, w, h, base = C.swampWater, glint = C.swampGlint, seed = 9, alpha = 1, rows = 5, ripples = 12 }) {
  pxRect(g, R(x), R(y), R(w), R(h), base, alpha);
  const rng = makeRng(seed);
  for (let i = 0; i < rows; i++) {
    const yy = y + (h * (i + 0.5)) / rows;
    const ww = w * (0.45 + rng() * 0.4);
    pxRect(g, R(x + rng() * (w - ww)), R(yy), R(ww), 1, glint, (0.14 + rng() * 0.14) * alpha);
  }
  for (let i = 0; i < ripples; i++) {
    const rx = R(x + rng() * w), ry = R(y + rng() * h);
    pxRect(g, rx, ry, 2 + Math.floor(rng() * 4), 1, glint, 0.22 * alpha);
  }
}

// 星野：三档亮度，固定种子；幕色只影响最亮档
export function starfield(g, { x, y, w, h, seed = 11, count = 60, color = C.bone, bright = C.white, accent, alpha = 1 }) {
  const rng = makeRng(seed);
  for (let i = 0; i < count; i++) {
    const sx = R(x + rng() * w), sy = R(y + rng() * h);
    const r = rng();
    if (r > 0.94) {
      pxRect(g, sx, sy, 2, 1, accent ?? bright, 0.9 * alpha);
      pxRect(g, sx, sy - 1, 1, 3, accent ?? bright, 0.5 * alpha);
    } else if (r > 0.7) pxRect(g, sx, sy, 1, 1, bright, 0.85 * alpha);
    else pxRect(g, sx, sy, 1, 1, color, 0.45 * alpha);
  }
}

// 吊链：等距链环，越往下越暗（重量感）
export function chain(g, { x, y, h, color = C.stoneLight, alpha = 1, linkH = 4 }) {
  const n = Math.max(1, Math.floor(h / linkH));
  for (let i = 0; i < n; i++) {
    const yy = y + i * linkH;
    pxRect(g, R(x), R(yy), 1, Math.max(1, linkH - 1), color, alpha * (1 - i / (n * 1.6)));
  }
}

// 烛台：蜡身 + 火苗（静态层用固定相位；活动层另画跳动）
export function candle(g, { x, baseY, h = 12, wax = C.parchment, flame = C.arcaneLight, holder = C.brassDark, alpha = 1 }) {
  pxRect(g, R(x), R(baseY - h), 2, h, wax, 0.85 * alpha);
  pxRect(g, R(x - 2), R(baseY), 5, 2, holder, 0.95 * alpha);
  pxRect(g, R(x) + 1, R(baseY - h - 3), 1, 3, flame, 0.9 * alpha);
  pxRect(g, R(x), R(baseY - h - 2), 3, 2, flame, 0.35 * alpha);
}

// 剪影：任意多边形填充（棺/树/兽/王座靠它压形）；两点时退化为一根 1px 线（树枝/弦）。
export function silhouette(g, pts, color, alpha = 1) {
  if (!pts || pts.length < 2) return;
  const p = pts.map(q => ({ x: R(q.x), y: R(q.y) }));
  if (p.length === 2) {
    let [x0, y0] = [p[0].x, p[0].y];
    const [x1, y1] = [p[1].x, p[1].y];
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    for (;;) {
      pxRect(g, x0, y0, 1, 1, color, alpha);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
    return;
  }
  pxPoly(g, p, color, alpha);
}

// 地面透视：地平线、纵向缝与横向砖层
export function floor(g, { w, h, horizon, color = C.ink, lineColor = C.stoneDark, vx, alpha = 1, lines = 7, rows = 4 }) {
  pxRect(g, 0, R(horizon), R(w), R(h - horizon), color, 0.95 * alpha);
  pxRect(g, 0, R(horizon), R(w), 1, lineColor, 0.5 * alpha);
  const vX = vx ?? w / 2;
  for (let i = 1; i <= rows; i++) {
    const yy = horizon + (h - horizon) * (i / (rows + 1));
    pxRect(g, 0, R(yy), R(w), 1, lineColor, 0.18 * alpha);
  }
  for (let i = -lines; i <= lines; i++) {
    thinLine(g, vX + i * 34, horizon, vX + i * 118, h, lineColor, 0.14 * alpha);
  }
}

// ---- 圆/环：像素风不用抗锯齿弧线，全部折线或整行矩形 ----
export function disc(g, cx, cy, r, color, alpha = 1) {
  const R = Math.max(1, Math.round(r));
  for (let dy = -R; dy <= R; dy++) {
    const half = Math.floor(Math.sqrt(Math.max(0, R * R - dy * dy)));
    if (half <= 0) continue;
    g.fillStyle(color, alpha);
    g.fillRect(Math.round(cx - half), Math.round(cy + dy), half * 2, 1);
  }
}

export function ring(g, cx, cy, r, color, alpha = 1, segs = 32) {
  const R = Math.max(1, Math.round(r));
  g.lineStyle(1, color, alpha);
  const pts = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    pts.push({ x: Math.round(cx + Math.cos(a) * R), y: Math.round(cy + Math.sin(a) * R) });
  }
  g.strokePoints(pts, true);
}

export function ellipseRing(g, cx, cy, rx, ry, color, alpha = 1, segs = 28) {
  g.lineStyle(1, color, alpha);
  const pts = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    pts.push({ x: Math.round(cx + Math.cos(a) * rx), y: Math.round(cy + Math.sin(a) * ry) });
  }
  g.strokePoints(pts, true);
}
