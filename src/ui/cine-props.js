// 过场道具库：八类事件共用的小型像素道具。
// 全部硬边、整数坐标、固定种子；每个函数返回绘制指令数，便于测试与预算统计。
import { pxRect, pxLine, C } from './Palette.js';

const R = Math.round;
const clamp = (v) => Math.max(0, Math.min(1, v));
const hash = (seed) => {
  let h = (seed | 0) * 2654435761 % 4294967296;
  return () => {
    h = (h * 1664525 + 1013904223) % 4294967296;
    return h / 4294967296;
  };
};

function makeCount() {
  let n = 0;
  return { get: () => n, bump: () => { n += 1; } };
}

const RECT = (g, c, x, y, w, h, color, alpha) => {
  pxRect(g, R(x), R(y), Math.max(1, R(w)), Math.max(1, R(h)), color, clamp(alpha));
  c.bump();
};
// 直线统一走 1px 矢量线：pxLine 是 Bresenham 逐像素 fillRect，一条雾线就是几十条指令，
// 过场每帧预算只有 700，必须用 lineBetween 把长线压到 1 条指令。
const LINE = (g, c, x1, y1, x2, y2, color, alpha) => {
  if (typeof g.lineBetween === 'function') {
    g.lineStyle(1, color, clamp(alpha));
    g.lineBetween(R(x1), R(y1), R(x2), R(y2));
  } else {
    pxLine(g, R(x1), R(y1), R(x2), R(y2), color, clamp(alpha));
  }
  c.bump();
};
const RING = (g, c, cx, cy, r, color, alpha, segs = 20) => {
  const rr = Math.max(1, R(r));
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    RECT(g, c, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 1, 1, color, alpha);
  }
};

// 契约钉：钉帽 6×2 + 钉身 1px + 落地阴影
export function drawNail(g, { x = 0, y = 0, len = 14, w = 2, color = C.stoneLight, alpha = 1, shadow = true } = {}) {
  const c = makeCount();
  if (shadow) RECT(g, c, x - len * 0.4, y + len, len * 0.8, 1, C.void, 0.45 * alpha);
  RECT(g, c, x - w, y - 2, w * 3, 2, color, alpha);
  RECT(g, c, x - w / 2, y - 2, Math.max(1, w / 2), 1, C.bone, 0.5 * alpha);
  for (let i = 0; i < len; i += 1) {
    if (i % 3 === 0) RECT(g, c, x, y + i, 1, 1, color, alpha);
  }
  LINE(g, c, x, y + len, x, y + len + 2, color, 0.6 * alpha);
  return c.get();
}

// 契约主剪影：12×40，头/躯干/披风，每幕一件小配件
const LORD_PROPS = {
  1: 'spade', 2: 'censer', 3: 'staff', 4: 'book', 5: 'scale', 6: 'tongs', 7: null,
};
export function drawLord(g, { x = 0, y = 0, act = 1, alpha = 1, fade = 1, accent = C.brass } = {}) {
  const c = makeCount();
  const a = alpha * fade;
  if (a <= 0.02) return 0;
  const dark = C.void;
  // 头 4×4 + 兜帽
  RECT(g, c, x - 2, y, 4, 4, dark, a);
  RECT(g, c, x - 3, y + 1, 6, 2, dark, a);
  // 躯干 8×14
  RECT(g, c, x - 4, y + 5, 8, 14, dark, a);
  // 披风两笔（幕色）
  RECT(g, c, x - 6, y + 6, 2, 16, accent, 0.28 * a);
  RECT(g, c, x + 4, y + 6, 2, 16, accent, 0.28 * a);
  // 下摆 10×6
  RECT(g, c, x - 5, y + 19, 10, 6, dark, a);
  // 腿
  RECT(g, c, x - 3, y + 25, 2, 13, dark, a);
  RECT(g, c, x + 1, y + 25, 2, 13, dark, a);
  const prop = LORD_PROPS[act] ?? null;
  if (prop === 'spade') { RECT(g, c, x + 6, y + 10, 1, 22, C.stoneDark, a); RECT(g, c, x + 5, y + 32, 3, 3, C.stoneDark, a); }
  if (prop === 'censer') { RECT(g, c, x + 6, y + 12, 1, 8, C.brassDark, a); RING(g, c, x + 6, y + 22, 3, C.brass, 0.8 * a, 10); }
  if (prop === 'staff') { RECT(g, c, x + 7, y - 4, 1, 34, C.stoneLight, a); RECT(g, c, x + 5, y - 6, 5, 2, C.brass, a); }
  if (prop === 'book') { RECT(g, c, x + 5, y + 14, 5, 4, C.parchment, a); RECT(g, c, x + 7, y + 14, 1, 4, C.brassDark, a); }
  if (prop === 'scale') { RECT(g, c, x + 6, y + 8, 1, 12, C.stoneLight, a); RECT(g, c, x + 1, y + 8, 11, 1, C.stoneLight, a); RECT(g, c, x, y + 10, 3, 1, C.brass, a); RECT(g, c, x + 10, y + 10, 3, 1, C.brass, a); }
  if (prop === 'tongs') { RECT(g, c, x + 6, y + 16, 1, 14, C.stoneDark, a); RECT(g, c, x + 8, y + 16, 1, 14, C.stoneDark, a); RECT(g, c, x + 6, y + 30, 3, 2, C.arcane, 0.7 * a); }
  return c.get();
}

// 魂火：芯 3px + 晕 + 两缕尾
export function drawSoulFire(g, { x = 0, y = 0, r = 5, alpha = 1, color = C.teal } = {}) {
  const c = makeCount();
  RECT(g, c, x - 1, y - 2, 3, 4, C.white, 0.9 * alpha);
  RECT(g, c, x, y - 4, 1, 2, C.white, 0.7 * alpha);
  RING(g, c, x, y, r, color, 0.5 * alpha, 16);
  LINE(g, c, x, y + 2, x - 2, y + 6, color, 0.45 * alpha);
  LINE(g, c, x + 1, y + 2, x + 3, y + 5, color, 0.35 * alpha);
  return c.get();
}

// 北斗七星：7 点 + 6 段可选连线（单位坐标，横竖屏都能用）
const DIPPER = [
  [-0.95, -0.16], [-0.58, -0.44], [-0.2, -0.3], [-0.04, 0.12],
  [0.26, 0.44], [0.66, 0.22], [0.95, -0.18],
];
export function drawSevenStars(g, { cx = 0, cy = 0, r = 60, alpha = 1, lit = null, connect = true, color = C.parchment, link = C.stoneLight } = {}) {
  const c = makeCount();
  const pts = DIPPER.map(([ux, uy]) => ({ x: cx + ux * r, y: cy + uy * r }));
  if (connect) for (let i = 0; i < pts.length - 1; i++) LINE(g, c, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, link, 0.3 * alpha);
  for (let i = 0; i < pts.length; i++) {
    const on = lit ? !!lit[i] : true;
    const p = pts[i];
    RECT(g, c, p.x - 1, p.y - 1, 3, 3, color, (on ? 0.95 : 0.25) * alpha);
    if (on) {
      RECT(g, c, p.x, p.y - 2, 1, 1, color, 0.6 * alpha);
      RECT(g, c, p.x, p.y + 2, 1, 1, color, 0.6 * alpha);
      RECT(g, c, p.x - 2, p.y, 1, 1, color, 0.6 * alpha);
      RECT(g, c, p.x + 2, p.y, 1, 1, color, 0.6 * alpha);
    }
  }
  return c.get();
}

// 灰堆：三层梯形 + 6 粒
export function drawAshPile(g, { x = 0, y = 0, w = 26, h = 8, seed = 1, color = C.ash } = {}) {
  const c = makeCount();
  const rng = hash(seed);
  const layers = [
    [0.5, 0.4, 0.45],
    [0.28, 0.7, 0.65],
    [0.1, 1.0, 1.0],
  ];
  layers.forEach(([k, hh, aa]) => {
    const lw = w * (0.4 + k);
    RECT(g, c, x - lw / 2, y - h * hh, lw, h * hh, color, aa);
  });
  for (let i = 0; i < 6; i++) {
    RECT(g, c, x - w * 0.6 + rng() * w * 1.2, y - rng() * h, 1, 1, color, 0.5);
  }
  return c.get();
}

// 血纹：4 段折线，逐段可点亮
export function drawBloodCracks(g, { x = 0, y = 0, len = 26, seed = 3, color = C.blood, alpha = 1, lit = 4 } = {}) {
  const c = makeCount();
  const rng = hash(seed);
  let px = x, py = y;
  const seg = len / 4;
  for (let i = 0; i < 4; i++) {
    const dx = (rng() - 0.5) * seg * 1.4;
    const nx = px + dx, ny = py + seg;
    if (i < lit) {
      LINE(g, c, px, py, nx, ny, color, alpha);
      if (i % 2 === 0) LINE(g, c, nx, ny, nx + dx * 0.6, ny + seg * 0.35, color, 0.6 * alpha);
    }
    px = nx; py = ny;
  }
  return c.get();
}

// 雾：3 条 1px 折线 + 2 处起伏
export function drawFog(g, { x = 0, y = 0, w = 120, count = 3, seed = 5, color = C.fog, alpha = 0.14 } = {}) {
  const c = makeCount();
  const rng = hash(seed);
  for (let i = 0; i < count; i++) {
    const yy = y + i * 3;
    const off = (rng() - 0.5) * w * 0.15;
    LINE(g, c, x + off, yy, x + w + off, yy, color, alpha);
    RECT(g, c, x + w * (0.3 + rng() * 0.4), yy - 1, w * 0.12, 1, color, alpha * 1.3);
  }
  RECT(g, c, x + w * 0.45, y + count * 3, w * 0.18, 1, color, alpha * 0.8);
  RECT(g, c, x + w * 0.1, y + count * 3 + 1, w * 0.1, 1, color, alpha * 0.6);
  return c.get();
}

// 烛：柱 3 宽 + 焰 + 光晕
export function drawCandle(g, { x = 0, y = 0, h = 10, lit = true, alpha = 1, color = C.parchment } = {}) {
  const c = makeCount();
  RECT(g, c, x - 1, y - h, 3, h, color, alpha);
  RECT(g, c, x, y - h - 1, 1, 1, C.stoneLight, alpha);
  RECT(g, c, x - 2, y - 1, 5, 1, C.brassDark, alpha);
  if (lit) {
    RECT(g, c, x, y - h - 4, 1, 3, C.arcane, alpha);
    RECT(g, c, x, y - h - 5, 1, 1, C.arcaneLight, alpha);
    RING(g, c, x, y - h - 3, 4, C.arcane, 0.18 * alpha, 10);
  }
  return c.get();
}
