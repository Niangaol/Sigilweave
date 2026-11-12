// 开场与幕间 journey 的镜头绘制：硬边色块、整数坐标；g 的清空由调用方负责。
// 粒子（星点/浮尘）由调用方预建传入，每帧不新建对象。
import { C, pxRect, pxLine, pxDiamond, pxFrame } from './Palette.js';
import {
  clamp01, easeOutCubic, easeInOutCubic, makeRng, drawSeal, drawShatter, thinLine, RUNE_MARKS,
} from './cinematic-art.js';

export { clamp01, easeOutCubic, easeInOutCubic };

export function buildStars(seed, count, w, h) {
  const rng = makeRng(seed);
  return Array.from({ length: count }, () => ({
    x: Math.floor(rng() * w),
    y: Math.floor(rng() * h * 0.7),
    size: rng() > 0.85 ? 2 : 1,
    phase: rng() * Math.PI * 2,
  }));
}

// 主角剪影：刻阵者。身体/头/衣摆 + 魂火一点，journey 与 altar 共用。
export function heroSilhouette(g, x, y, a = 1) {
  const ix = Math.round(x), iy = Math.round(y);
  pxRect(g, ix - 3, iy - 14, 6, 10, C.ink, a);
  pxDiamond(g, ix, iy - 17, 3, C.ink, a, true);
  pxRect(g, ix - 4, iy - 6, 8, 4, C.stoneDark, 0.8 * a);
  pxRect(g, ix - 1, iy - 16, 2, 1, C.brassLight, 0.9 * a);
}

// 镜头 1：星陨。夜空星点 + 陨星划痕，镜头下摇（地平线从 0.92h 降到 0.62h），墓园剪影渐显。
function drawSkyfall(g, { w, h, t, p, stars }) {
  pxRect(g, 0, 0, w, h, C.void, 1);
  for (let si = 0; si < stars.length; si += 3) { const s = stars[si];
    const tw = 0.3 + 0.4 * (0.5 + 0.5 * Math.sin(t * 0.002 + s.phase));
    pxRect(g, s.x, s.y, s.size, s.size, C.parchment, tw);
  }
  for (let i = 0; i < 2; i++) {
    const mp = clamp01(p * 1.2 - i * 0.35);
    if (mp <= 0 || mp >= 1) continue;
    const x = Math.round(w * (0.75 - mp * 0.45) + i * 60);
    const y = Math.round(20 + mp * h * 0.4 + i * 24);
    pxLine(g, x, y, x + 16, y + 26, C.runeCold, (1 - mp) * 0.8, 1);
    pxRect(g, x, y, 2, 2, C.white, (1 - mp) * 0.9);
  }
  const horizon = Math.round(h * (0.92 - 0.3 * easeInOutCubic(p)));
  const a = clamp01((p - 0.35) / 0.4);
  if (a <= 0) return;
  pxRect(g, 0, horizon, w, h - horizon, C.ink, 0.95 * a);
  for (const [x, gh] of [[60, 26], [120, 18], [210, 30], [300, 22], [380, 26], [440, 16]]) {
    pxRect(g, x, horizon - gh, 14, gh, C.stoneDark, 0.95 * a);
    pxRect(g, x, horizon - gh, 14, 2, C.stoneLight, 0.5 * a);
  }
  for (const [cx, top] of [[150, horizon - 80], [330, horizon - 92]]) {
    for (let i = 0; i < 6; i++) {
      const sw = Math.round(60 * (0.4 + i * 0.1));
      pxRect(g, cx - sw / 2, top + i * 6, sw, 6, C.stoneDark, 0.9 * a);
    }
  }
}

// 七契圣物：墓碑/沉钟/王座/书架/天平/铁砧/破晓王座。
// 开场「钉入」与结局「解除」共用同一组形状，保持视觉同源；尺寸比三契版收窄，
// 好让 480 宽的画布上七座小舞台等距排开而不互相压边。
function drawContractRelic(g, cx, baseY, i, a, accent) {
  if (i === 0) {
    // 墓碑
    pxRect(g, cx - 9, baseY - 30, 18, 30, C.stoneDark, a);
    pxRect(g, cx - 9, baseY - 30, 18, 2, C.stoneLight, 0.6 * a);
    pxRect(g, cx - 4, baseY - 24, 1, 12, C.ink, 0.7 * a);
    pxRect(g, cx - 3, baseY - 20, 4, 1, C.ink, 0.6 * a);
    pxRect(g, cx - 11, baseY - 2, 22, 2, C.stone, 0.5 * a);
  } else if (i === 1) {
    // 沉钟
    pxRect(g, cx, baseY - 74, 1, 32, C.brassDark, 0.7 * a);
    pxRect(g, cx - 10, baseY - 42, 21, 4, C.brass, 0.9 * a);
    pxRect(g, cx - 7, baseY - 38, 15, 5, C.brassDark, 0.95 * a);
    pxRect(g, cx - 3, baseY - 33, 7, 3, C.brassDark, 0.9 * a);
    pxRect(g, cx, baseY - 30, 2, 3, C.brassLight, 0.8 * a);
  } else if (i === 2) {
    // 王座
    pxRect(g, cx - 22, baseY - 6, 45, 6, C.shardStone, 0.9 * a);
    pxRect(g, cx - 15, baseY - 12, 31, 6, C.stoneDark, 0.9 * a);
    pxRect(g, cx - 9, baseY - 40, 18, 28, C.stoneDark, 0.95 * a);
    pxRect(g, cx - 6, baseY - 36, 12, 22, C.starTileLit, 0.7 * a);
    pxDiamond(g, cx, baseY - 26, 4, accent, 0.6 * a, true);
  } else if (i === 3) {
    // 书架（天权 · 沉钟书库）
    const bw = 34, bh = 46;
    pxRect(g, cx - bw / 2, baseY - bh, bw, bh, 0x141a2c, 0.95 * a);
    pxRect(g, cx - bw / 2, baseY - bh, 2, bh, C.brassDark, 0.9 * a);
    pxRect(g, cx + bw / 2 - 2, baseY - bh, 2, bh, C.brassDark, 0.9 * a);
    pxRect(g, cx - bw / 2 - 2, baseY - bh - 3, bw + 4, 3, 0x141a2c, 1 * a);
    for (let r = 0; r < 3; r++) {
      const ry = baseY - bh + 6 + r * 13;
      pxRect(g, cx - bw / 2 + 2, ry + 9, bw - 4, 1, C.brassDark, 0.5 * a);
      for (let k = 0; k < 4; k++) {
        const kx = cx - bw / 2 + 3 + k * 8;
        pxRect(g, kx, ry, 5, 9, k % 2 ? 0x3f5a3a : 0x2f4560, 0.85 * a);
        pxRect(g, kx, ry, 1, 9, C.parchment, 0.15 * a);
      }
    }
  } else if (i === 4) {
    // 天平（玉衡 · 衡律法庭）
    pxRect(g, cx - 1, baseY - 38, 3, 38, 0x9aa1ad, 0.9 * a);
    pxRect(g, cx - 18, baseY - 42, 37, 2, 0x9aa1ad, 0.95 * a);
    for (const dir of [-1, 1]) {
      pxRect(g, cx + dir * 17, baseY - 40, 1, 7, 0x8f95a1, 0.75 * a);
      pxRect(g, cx + dir * 17 - 6, baseY - 33, 13, 2, 0x9aa1ad, 0.95 * a);
      pxRect(g, cx + dir * 17 - 6, baseY - 31, 13, 1, C.bloodDark, 0.6 * a);
    }
    pxRect(g, cx - 2, baseY - 45, 5, 3, C.blood, 0.7 * a);
    pxRect(g, cx - 7, baseY - 3, 15, 3, 0x2a2e36, 0.9 * a);
  } else if (i === 5) {
    // 铁砧（开阳 · 熔星锻炉）
    pxRect(g, cx - 20, baseY - 22, 41, 6, 0x3a3230, 0.95 * a);
    pxRect(g, cx - 20, baseY - 22, 41, 1, 0x6b5a52, 0.8 * a);
    pxRect(g, cx - 27, baseY - 20, 8, 3, 0x3a3230, 0.95 * a);
    pxRect(g, cx - 8, baseY - 16, 15, 5, 0x2a2422, 0.9 * a);
    pxRect(g, cx - 12, baseY - 11, 25, 11, 0x2a2422, 0.95 * a);
    pxRect(g, cx - 15, baseY - 2, 31, 2, C.void, 0.6 * a);
    pxRect(g, cx + 6, baseY - 27, 1, 2, C.arcane, 0.8 * a);
    pxRect(g, cx + 11, baseY - 31, 1, 1, C.tan, 0.7 * a);
  } else {
    // 破晓之座（摇光：断裂王座 + 顶上一枚晨星）
    pxRect(g, cx - 22, baseY - 8, 45, 8, 0x2b2447, 0.95 * a);
    pxRect(g, cx - 22, baseY - 8, 45, 1, C.brassLight, 0.6 * a);
    pxRect(g, cx - 15, baseY - 44, 30, 36, 0x1d1733, 0.95 * a);
    pxRect(g, cx - 15, baseY - 44, 2, 36, C.brassLight, 0.45 * a);
    pxRect(g, cx + 2, baseY - 44, 13, 10, C.void, 0.95 * a);
    pxRect(g, cx + 2, baseY - 34, 7, 5, C.void, 0.95 * a);
    pxRect(g, cx + 16, baseY - 42, 4, 3, 0x1d1733, 0.9 * a);
    pxRect(g, cx + 22, baseY - 48, 3, 3, 0x1d1733, 0.65 * a);
    pxRect(g, cx - 22, baseY - 20, 7, 12, 0x2b2447, 0.95 * a);
    pxRect(g, cx + 15, baseY - 20, 7, 12, 0x2b2447, 0.95 * a);
    pxRect(g, cx - 12, baseY - 18, 24, 4, 0x2b2447, 0.95 * a);
    pxDiamond(g, cx, baseY - 30, 4, accent, 0.7 * a, false);
    pxDiamond(g, cx, baseY - 30, 2, C.white, 0.9 * a, true);
  }
}

// 契约印：双环 + 4 枚 RUNE_MARKS 小符文 + 中心菱形。
// 旧版 spokes:8 会在环外叠 8 颗端点钻石，实机读作黄铜齿轮；契约印不该有齿。
const CONTRACT_TOP = [30, 74, 40, 49, 45, 27, 48];
function contractSeal(g, cx, cy, r, t, accent, alpha) {
  if (alpha <= 0.02) return;
  drawSeal(g, { cx, cy, r, t, accent, alpha, spokes: 0, runes: false, core: true });
  const rot = t * 0.00022;
  for (let k = 0; k < 4; k++) {
    const a = rot + Math.PI / 4 + (k / 4) * Math.PI * 2;
    const gx = Math.round(cx + Math.cos(a) * r * 0.62) - 2;
    const gy = Math.round(cy + Math.sin(a) * r * 0.62) - 2;
    const glyph = RUNE_MARKS[k];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        if (glyph[row * 3][col * 3] === '#') pxRect(g, gx + col, gy + row, 1, 1, C.brassLight, 0.5 * alpha);
      }
    }
  }
}

// 七契的等距排布：480 宽下每档 62px，竖屏同宽同档距，保证构图语言不变。
function contractCenter(w, i) {
  const span = Math.min(70, Math.round(w * 0.13));
  return Math.round(w / 2 + (i - 3) * span);
}
// ---------- 开场 / 结局的静态三层布景（T18 / T19）----------
// 与 journey 同一套分层策略：back/mid/fore 只在镜头切换时各画一次，动态件每帧只画自己。
// 坐标全整数、无渐变、无 Math.random；所有中间色由 mix(C.a, C.b, t) 从调色板派生。
import {
  fill, pointedArch, archWindow, column, beam, planks, steps, cracks, moss, rubble,
  starfield, chain, candle, silhouette, disc, ring, ellipseRing,
} from './diorama-kit.js';

const mix = (a, b, t) => {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const gg = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (gg << 8) | bl;
};

const T = {
  sky0: mix(C.void, C.starTileDark, 0.45),
  sky1: mix(C.starTileDark, C.starTile, 0.55),
  sky2: mix(C.starTile, C.starTileLit, 0.6),
  sky3: mix(C.starTileLit, C.shardStone, 0.4),
  sky4: mix(C.shardStone, C.runeDim, 0.22),
  wall: mix(C.nightDeep, C.stoneDark, 0.5),
  wallLit: mix(C.stone, C.stoneLight, 0.45),
  dark: mix(C.void, C.ink, 0.65),
  floor: mix(C.ink, C.stoneDark, 0.4),
  floorLine: mix(C.stoneDark, C.groove, 0.45),
  metal: mix(C.mute, C.bone, 0.25),
  gold: mix(C.brass, C.brassLight, 0.5),
  ash: mix(C.mute, C.stone, 0.35),
  grass: mix(C.rot, C.mossTileLit, 0.45),
  dawn0: mix(C.void, C.mauve, 0.4),
  dawn1: mix(C.mauve, C.brassDark, 0.45),
  dawn2: mix(C.brassDark, C.brass, 0.5),
  dawn3: mix(C.brass, C.parchment, 0.4),
};

const CELL = 30;
const GAP = 4;
const GRID = CELL * 4 + GAP * 3;

// 开场 / 结局共用的构图锚点：静态三层与动态件都从这里取坐标，保证对得上。
export function storyLayout(w, h) {
  const tall = h > 400;
  return {
    w, h, tall, u: tall ? 1.35 : 1,
    horizon: Math.round(h * (tall ? 0.56 : 0.62)),
    ground: Math.round(h * (tall ? 0.78 : 0.84)),
    baseY: Math.round(h * (tall ? 0.66 : 0.68)),
    altarY: Math.round(h * (tall ? 0.40 : 0.50)),
    sealY: Math.round(h * (tall ? 0.42 : 0.46)),
    titleY: Math.round(h * (tall ? 0.40 : 0.44)),
    cx: Math.round(w / 2),
    moonX: Math.round(w * 0.78),
    moonY: Math.round(h * 0.14),
    B: 64,
    accent: C.brass,
  };
}

function skyFill(g, L, stops) {
  const { w, h, B } = L;
  for (let i = 0; i < stops.length; i++) {
    const y0 = Math.round(h * stops[i][0]);
    const y1 = i + 1 < stops.length ? Math.round(h * stops[i + 1][0]) : L.horizon;
    if (y1 > y0) fill(g, -B, y0, w + B * 2, y1 - y0, stops[i][1]);
  }
}

function groundSlabs(g, L, color, line, rows, topY) {
  const { w, h, B, horizon } = L;
  const top = Math.round(topY ?? horizon);
  fill(g, -B, top, w + B * 2, h - top + B, color);
  const n = rows || 6;
  for (let i = 1; i < n; i++) {
    const y = Math.round(top + (h - top) * (i / n));
    pxRect(g, -B, y, w + B * 2, 1, line, 0.22);
  }
  for (let i = -6; i <= 6; i++) {
    thinLine(g, Math.round(L.cx + i * 30), top, Math.round(L.cx + i * 92), h + B, line, 0.15);
  }
}

function gravestone(g, x, baseY, kind, s, color) {
  const u = s || 1;
  const col = color || C.stoneDark;
  const ix = Math.round(x);
  const ib = Math.round(baseY);
  if (kind === 0) {
    pxRect(g, ix - Math.round(5 * u), ib - Math.round(18 * u), Math.round(10 * u), Math.round(18 * u), col, 1);
    pxRect(g, ix - Math.round(6 * u), ib - Math.round(22 * u), Math.round(12 * u), Math.round(5 * u), col, 1);
    pxRect(g, ix - Math.round(6 * u), ib - Math.round(22 * u), Math.round(12 * u), 1, C.stoneLight, 0.5);
  } else if (kind === 1) {
    pxRect(g, ix - Math.round(1 * u), ib - Math.round(24 * u), Math.round(3 * u), Math.round(24 * u), col, 1);
    pxRect(g, ix - Math.round(6 * u), ib - Math.round(19 * u), Math.round(13 * u), Math.round(3 * u), col, 1);
    pxRect(g, ix - Math.round(6 * u), ib - Math.round(19 * u), Math.round(13 * u), 1, C.stoneLight, 0.35);
  } else {
    pxRect(g, ix - Math.round(6 * u), ib - Math.round(14 * u), Math.round(12 * u), Math.round(14 * u), col, 1);
    pxRect(g, ix - Math.round(6 * u), ib - Math.round(14 * u), Math.round(6 * u), Math.round(3 * u), col, 0.9);
    pxRect(g, ix - Math.round(4 * u), ib - Math.round(10 * u), 1, Math.round(6 * u), C.void, 0.5);
  }
  pxRect(g, ix - Math.round(6 * u), ib - 2, Math.round(12 * u), 2, C.stone, 0.4);
}

function deadTree(g, x, baseY, th, color, alpha, seed) {
  const rng = makeRng(seed);
  const ix = Math.round(x);
  const ib = Math.round(baseY);
  const ih = Math.round(th);
  pxRect(g, ix - 2, ib - ih, 4, ih, color, alpha);
  pxRect(g, ix - 3, ib - Math.round(ih * 0.55), 2, Math.round(ih * 0.3), color, alpha * 0.9);
  for (let i = 0; i < 5; i++) {
    const by = ib - Math.round(ih * (0.5 + i * 0.11));
    const dir = i % 2 ? 1 : -1;
    const bx = ix + dir * Math.round(3 + rng() * 4);
    const by2 = by - Math.round(4 + rng() * 8);
    thinLine(g, ix, by, bx, by2, color, alpha * 0.85);
    thinLine(g, bx, by2, bx + dir * Math.round(3 + rng() * 5), by2 - Math.round(2 + rng() * 4), color, alpha * 0.7);
  }
}

function tower(g, cx, baseY, tw, th, color, alpha) {
  const ix = Math.round(cx);
  const ib = Math.round(baseY);
  const iw = Math.round(tw);
  const ih = Math.round(th);
  pxRect(g, ix - iw / 2, ib - ih, iw, ih, color, alpha);
  pxRect(g, ix - iw / 2, ib - ih, iw, 2, C.stoneLight, 0.25 * alpha);
  const merlons = Math.max(2, Math.round(iw / 8));
  for (let i = 0; i < merlons; i++) {
    pxRect(g, ix - iw / 2 + Math.round((i * iw) / merlons), ib - ih - 5, Math.max(3, Math.round(iw / merlons) - 2), 5, color, alpha);
  }
  pxRect(g, ix - 2, ib - ih + Math.round(ih * 0.22), 4, Math.round(ih * 0.16), C.void, 0.55 * alpha);
}

function brazier(g, x, baseY, s, alpha) {
  const u = s || 1;
  const ix = Math.round(x);
  const ib = Math.round(baseY);
  pxRect(g, ix - Math.round(6 * u), ib - Math.round(10 * u), Math.round(12 * u), Math.round(4 * u), C.stoneDark, alpha);
  pxRect(g, ix - Math.round(6 * u), ib - Math.round(10 * u), Math.round(12 * u), 1, C.brassDark, 0.8 * alpha);
  pxRect(g, ix - Math.round(1 * u), ib - Math.round(6 * u), Math.round(2 * u), Math.round(6 * u), C.stoneDark, alpha);
  pxRect(g, ix - Math.round(3 * u), ib - Math.round(12 * u), Math.round(6 * u), 2, C.ash, 0.8 * alpha);
}

function candelabrum(g, x, baseY, ch, alpha) {
  const ix = Math.round(x);
  const ib = Math.round(baseY);
  const ih = Math.round(ch);
  pxRect(g, ix - 1, ib - ih, 3, ih, C.brassDark, alpha);
  pxRect(g, ix - Math.round(ih * 0.22), ib - ih, Math.round(ih * 0.44), 2, C.brassDark, alpha);
  for (const dx of [-Math.round(ih * 0.22), 0, Math.round(ih * 0.22)]) {
    pxRect(g, ix + dx - 1, ib - ih - 5, 2, 5, C.parchment, alpha);
  }
  pxRect(g, ix - 5, ib - 3, 11, 3, C.stoneDark, alpha);
}

function wax(g, x, baseY, ch, waxColor, flameColor, holderColor, alpha) {
  candle(g, { x, baseY, h: ch, wax: waxColor, flame: flameColor, holder: holderColor, alpha });
}

function obelisk(g, x, baseY, oh, alpha) {
  const ix = Math.round(x);
  const ib = Math.round(baseY);
  const ih = Math.round(oh);
  silhouette(g, [
    { x: ix - 5, y: ib }, { x: ix - 3, y: ib - ih }, { x: ix, y: ib - ih - 6 },
    { x: ix + 3, y: ib - ih }, { x: ix + 5, y: ib },
  ], C.stoneDark, alpha);
  pxRect(g, ix - 5, ib - 2, 11, 2, C.stone, 0.4 * alpha);
  thinLine(g, ix, ib - ih + 6, ix, ib - 8, C.stoneLight, 0.3 * alpha);
}

function stele(g, cx, baseY, sw, sh, alpha) {
  const ix = Math.round(cx);
  const ib = Math.round(baseY);
  const iw = Math.round(sw);
  const ih = Math.round(sh);
  pxRect(g, ix - iw / 2, ib - ih, iw, ih, C.stoneDark, alpha);
  pxRect(g, ix - iw / 2 - 3, ib - ih - 5, iw + 6, 5, C.stone, alpha);
  pxRect(g, ix - iw / 2 - 3, ib - ih - 5, iw + 6, 1, C.stoneLight, 0.45 * alpha);
  pxRect(g, ix - iw / 2 - 2, ib - 2, iw + 4, 3, C.stone, 0.8 * alpha);
  for (let i = 0; i < 4; i++) {
    const ly = ib - ih + 8 + i * Math.round(ih * 0.16);
    pxRect(g, ix - iw / 2 + 5, ly, iw - 10, 1, C.groove, 0.35 * alpha);
  }
}

function sevenStars(g, L, alpha, litRatio) {
  const nodes = [[0.10, 0.16], [0.22, 0.11], [0.34, 0.08], [0.45, 0.07], [0.42, 0.20], [0.57, 0.24], [0.63, 0.13]];
  const links = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]];
  const pts = nodes.map(([fx, fy]) => [Math.round(L.w * fx), Math.round(L.h * fy)]);
  const lr = litRatio === undefined ? 1 : litRatio;
  const linkCount = Math.round(links.length * lr);
  for (let i = 0; i < linkCount; i++) {
    const a = pts[links[i][0]], b = pts[links[i][1]];
    thinLine(g, a[0], a[1], b[0], b[1], C.runeCold, 0.35 * alpha);
  }
  for (let i = 0; i < pts.length; i++) {
    const on = i < Math.round(pts.length * lr);
    pxRect(g, pts[i][0], pts[i][1], on ? 2 : 1, on ? 2 : 1, on ? C.white : C.bone, (on ? 0.95 : 0.5) * alpha);
  }
}

function archWall(g, L, wallColor, archColor) {
  const { w, h, B } = L;
  fill(g, -B, 0, w + B * 2, L.horizon + 2, wallColor);
  for (const fx of [0.08, 0.32, 0.68, 0.92]) {
    column(g, {
      cx: Math.round(w * fx), topY: Math.round(h * 0.05), bottomY: L.horizon,
      w: Math.round(14 * L.u), shaft: wallColor, light: T.wallLit, dark: C.void,
      capH: Math.round(5 * L.u), baseH: Math.round(5 * L.u), alpha: 1, flutes: 2,
    });
  }
  for (const fx of [0.20, 0.50, 0.80]) {
    const cx = Math.round(w * fx);
    const aw = Math.round(40 * L.u);
    const ah = Math.round(h * 0.30);
    const by = L.horizon - Math.round(h * 0.02);
    pointedArch(g, { cx, baseY: by, w: aw, h: ah, t: 0, color: archColor, fillColor: T.dark, fillAlpha: 1 });
    pointedArch(g, { cx, baseY: by, w: aw, h: ah, t: 1, color: archColor, alpha: 0.85 });
  }
  pxRect(g, -B, Math.round(h * 0.05), w + B * 2, 3, T.floorLine, 0.7);
}

function altarBox(L) {
  return {
    ox: Math.round(L.w / 2 - GRID / 2),
    oy: Math.round(L.altarY - GRID / 2),
    cell: CELL, gap: GAP, size: GRID,
  };
}

// ---------- 开场静态三层 ----------

function skyfallBack(g, L) {
  skyFill(g, L, [[0, T.sky0], [0.12, T.sky1], [0.24, T.sky2], [0.36, T.sky3], [0.48, T.sky4]]);
  starfield(g, {
    x: -L.B, y: 0, w: L.w + L.B * 2, h: Math.round(L.h * 0.56), seed: 71,
    count: L.tall ? 76 : 52, color: C.bone, bright: C.white, accent: C.runeCold, alpha: 0.9,
  });
  thinLine(g, Math.round(L.w * 0.78), Math.round(L.h * 0.06), Math.round(L.w * 0.44), Math.round(L.h * 0.26), C.runeDim, 0.4);
  thinLine(g, Math.round(L.w * 0.30), Math.round(L.h * 0.04), Math.round(L.w * 0.16), Math.round(L.h * 0.18), C.runeDim, 0.3);
  silhouette(g, [
    { x: -L.B, y: L.horizon },
    { x: -L.B, y: Math.round(L.horizon - L.h * 0.05) },
    { x: Math.round(L.w * 0.18), y: Math.round(L.horizon - L.h * 0.08) },
    { x: Math.round(L.w * 0.34), y: Math.round(L.horizon - L.h * 0.04) },
    { x: Math.round(L.w * 0.55), y: Math.round(L.horizon - L.h * 0.09) },
    { x: Math.round(L.w * 0.74), y: Math.round(L.horizon - L.h * 0.05) },
    { x: Math.round(L.w + L.B), y: Math.round(L.horizon - L.h * 0.07) },
    { x: Math.round(L.w + L.B), y: L.horizon },
  ], T.dark, 1);
}

function skyfallMid(g, L) {
  // 中景地面：地平线到 ground，前景层只从 ground 往下压边
  fill(g, -L.B, L.horizon, L.w + L.B * 2, L.ground - L.horizon, T.floor);
  const { w, h, horizon } = L;
  const wallY = Math.round(horizon - h * 0.03);
  fill(g, -L.B, wallY, w + L.B * 2, Math.round(h * 0.04), T.dark);
  for (let i = 0; i < 18; i++) {
    const bx = Math.round(-L.B + (i * (w + L.B * 2)) / 18);
    pxRect(g, bx, wallY - 4, 10, 4, T.dark, 1);
  }
  tower(g, Math.round(w * 0.24), horizon, Math.round(26 * L.u), Math.round(h * 0.24), T.dark, 1);
  tower(g, Math.round(w * 0.74), horizon, Math.round(22 * L.u), Math.round(h * 0.19), T.dark, 1);
  for (const fx of [0.14, 0.50, 0.86]) {
    archWindow(g, {
      cx: Math.round(w * fx), baseY: horizon - Math.round(h * 0.02), w: Math.round(16 * L.u), h: Math.round(h * 0.10),
      frame: C.ink, glass: C.runeDim, glass2: C.runeCold, mullions: 1, alpha: 0.8,
    });
  }
  for (let i = 0; i < 6; i++) {
    gravestone(g, Math.round(w * (0.06 + i * 0.17)), horizon + Math.round(h * 0.01), i % 3, L.u * 0.8, T.dark);
  }
}

function skyfallFore(g, L) {
  groundSlabs(g, L, T.floor, T.floorLine, 6, L.ground);
  silhouette(g, [
    { x: -L.B, y: L.h },
    { x: -L.B, y: Math.round(L.h * 0.88) },
    { x: Math.round(L.w * 0.16), y: Math.round(L.h * 0.84) },
    { x: Math.round(L.w * 0.36), y: Math.round(L.h * 0.90) },
    { x: Math.round(L.w * 0.62), y: Math.round(L.h * 0.86) },
    { x: Math.round(L.w * 0.84), y: Math.round(L.h * 0.91) },
    { x: Math.round(L.w + L.B), y: Math.round(L.h * 0.87) },
    { x: Math.round(L.w + L.B), y: L.h },
  ], T.dark, 1);
  gravestone(g, Math.round(L.w * 0.22), Math.round(L.h * 0.90), 2, L.u, C.stoneDark);
  gravestone(g, Math.round(L.w * 0.70), Math.round(L.h * 0.93), 0, L.u, C.stoneDark);
  for (let i = 0; i < 8; i++) {
    const gx = Math.round(L.w * (0.04 + i * 0.13));
    const gy = Math.round(L.h * (0.94 + (i % 3) * 0.015));
    thinLine(g, gx, gy, gx - 3, gy - Math.round(6 * L.u), T.grass, 0.7);
    thinLine(g, gx + 2, gy, gx + 5, gy - Math.round(5 * L.u), T.grass, 0.55);
  }
  pxRect(g, -L.B, Math.round(L.h * 0.87), L.w + L.B * 2, 3, C.fog, 0.06);
}

function contractsBack(g, L) {
  archWall(g, L, T.wall, T.floorLine);
  for (let i = 0; i < 7; i++) {
    const cx = contractCenter(L.w, i);
    const by = L.baseY - Math.round(L.h * 0.02);
    pointedArch(g, { cx, baseY: by, w: Math.round(24 * L.u), h: Math.round(L.h * 0.22), t: 0, color: T.floorLine, fillColor: T.dark, fillAlpha: 1 });
    pointedArch(g, { cx, baseY: by, w: Math.round(24 * L.u), h: Math.round(L.h * 0.22), t: 1, color: T.floorLine, alpha: 0.7 });
    chain(g, { x: cx, y: Math.round(L.h * 0.05), h: Math.round(L.h * 0.16), color: C.brassDark, alpha: 0.7, linkH: 4 });
  }
  ring(g, L.cx, L.sealY, Math.round(64 * L.u), C.brassDark, 0.16, 30);
  ring(g, L.cx, L.sealY, Math.round(44 * L.u), C.brassDark, 0.12, 24);
}

function contractsMid(g, L) {
  // 中景地面：地平线到 ground，前景层只从 ground 往下压边
  fill(g, -L.B, L.horizon, L.w + L.B * 2, L.ground - L.horizon, T.floor);
  const { w, h } = L;
  fill(g, -L.B, L.baseY - Math.round(h * 0.02), w + L.B * 2, Math.round(h * 0.05), T.floorLine, 0.35);
  for (let i = 0; i < 7; i++) {
    const cx = contractCenter(w, i);
    const pw = Math.round(26 * L.u);
    const ph = Math.round(h * 0.10);
    pxRect(g, cx - pw / 2, L.baseY - ph, pw, ph, C.stoneDark, 1);
    pxRect(g, cx - pw / 2, L.baseY - ph, pw, 2, C.stoneLight, 0.5);
    pxRect(g, cx - pw / 2 - 3, L.baseY - 4, pw + 6, 4, C.stone, 0.85);
    ring(g, cx, L.baseY - ph - 2, Math.round(7 * L.u), C.brassDark, 0.55, 12);
    pxRect(g, cx - 1, L.baseY - ph - 2, 2, 2, C.brassDark, 0.8);
  }
  brazier(g, Math.round(w * 0.06), L.baseY, L.u, 0.9);
  brazier(g, Math.round(w * 0.94), L.baseY, L.u, 0.9);
}

function contractsFore(g, L) {
  groundSlabs(g, L, T.floor, T.floorLine, 5, L.ground);
  pxRect(g, -L.B, L.baseY, L.w + L.B * 2, 2, T.floorLine, 0.8);
  for (const fx of [0.03, 0.97]) {
    pxRect(g, Math.round(L.w * fx) - 2, L.baseY - Math.round(L.h * 0.10), 4, Math.round(L.h * 0.10), C.stoneDark, 1);
    pxRect(g, Math.round(L.w * fx) - 4, L.baseY - Math.round(L.h * 0.10) - 3, 8, 3, C.brassDark, 0.8);
  }
  rubble(g, { x: Math.round(L.w * 0.10), y: Math.round(L.h * 0.92), w: Math.round(L.w * 0.22), h: 8, seed: 61, color: C.stoneDark, color2: C.stone, count: 12, alpha: 0.7 });
  rubble(g, { x: Math.round(L.w * 0.70), y: Math.round(L.h * 0.93), w: Math.round(L.w * 0.20), h: 8, seed: 62, color: C.stoneDark, color2: C.stone, count: 12, alpha: 0.7 });
}

function graveyardBack(g, L) {
  skyFill(g, L, [[0, T.sky0], [0.16, T.sky1], [0.32, T.sky2], [0.46, T.sky3]]);
  starfield(g, {
    x: -L.B, y: 0, w: L.w + L.B * 2, h: Math.round(L.h * 0.5), seed: 73,
    count: L.tall ? 60 : 42, color: C.bone, bright: C.white, accent: C.runeCold, alpha: 0.8,
  });
  disc(g, L.moonX, L.moonY, Math.round(13 * L.u), C.parchment, 0.75);
  disc(g, L.moonX - 3, L.moonY - 2, Math.round(11 * L.u), T.sky2, 1);
  ring(g, L.moonX, L.moonY, Math.round(18 * L.u), C.parchment, 0.16, 24);
  fill(g, -L.B, L.horizon - Math.round(L.h * 0.03), L.w + L.B * 2, Math.round(L.h * 0.03), T.dark);
  pointedArch(g, { cx: Math.round(L.w * 0.52), baseY: L.horizon, w: Math.round(34 * L.u), h: Math.round(L.h * 0.16), t: 0, color: T.dark, fillColor: C.void, fillAlpha: 1 });
  pointedArch(g, { cx: Math.round(L.w * 0.52), baseY: L.horizon, w: Math.round(34 * L.u), h: Math.round(L.h * 0.16), t: 1, color: T.dark, alpha: 0.9 });
  deadTree(g, Math.round(L.w * 0.14), L.horizon, L.h * 0.20, T.dark, 1, 81);
  deadTree(g, Math.round(L.w * 0.86), L.horizon, L.h * 0.17, T.dark, 1, 82);
}

function graveyardMid(g, L) {
  // 中景地面：地平线到 ground，前景层只从 ground 往下压边
  fill(g, -L.B, L.horizon, L.w + L.B * 2, L.ground - L.horizon, T.floor);
  const { w, h, horizon } = L;
  // 甬道：从墓门向观众铺开，两侧收边，避免中景地面读成一块空板
  const pathCx = Math.round(w * 0.52);
  silhouette(g, [
    { x: pathCx - Math.round(14 * L.u), y: horizon + 2 },
    { x: pathCx + Math.round(14 * L.u), y: horizon + 2 },
    { x: pathCx + Math.round(64 * L.u), y: L.ground },
    { x: pathCx - Math.round(64 * L.u), y: L.ground },
  ], C.stoneDark, 0.55);
  for (let i = 0; i < 4; i++) {
    const t = (i + 1) / 5;
    const py = Math.round(horizon + 2 + (L.ground - horizon - 2) * t);
    const half = Math.round((14 + 50 * t) * L.u);
    pxRect(g, pathCx - half, py, half * 2, 1, C.stone, 0.28);
  }
  for (const sgn of [-1, 1]) {
    thinLine(g, pathCx + sgn * Math.round(14 * L.u), horizon + 2, pathCx + sgn * Math.round(64 * L.u), L.ground, C.stoneLight, 0.2);
  }
  // 两株柏树剪影，给三排碑一个垂直参照
  for (const [tx, th] of [[0.06, 0.20], [0.95, 0.17]]) {
    const px = Math.round(w * tx), ph = Math.round(h * th);
    silhouette(g, [
      { x: px - Math.round(9 * L.u), y: horizon + Math.round(4 * L.u) },
      { x: px - Math.round(3 * L.u), y: horizon - ph },
      { x: px + Math.round(3 * L.u), y: horizon - ph },
      { x: px + Math.round(9 * L.u), y: horizon + Math.round(4 * L.u) },
    ], C.stoneDark, 0.9);
    pxRect(g, px - 1, horizon - ph + 3, 1, ph - 3, C.stone, 0.16);
  }
  pxRect(g, -L.B, horizon + 2, L.w + L.B * 2, Math.round(10 * L.u), C.fog, 0.05);
  pxRect(g, -L.B, L.ground - Math.round(16 * L.u), L.w + L.B * 2, Math.round(14 * L.u), C.fog, 0.05);
  // 中央石券墓门：外券石框 + 门内黑 + 两侧壁柱，别让拱门读成一块黑三角
  const ax = Math.round(w * 0.52);
  const aw = Math.round(46 * L.u), ah = Math.round(h * 0.22);
  pointedArch(g, { cx: ax, baseY: horizon, w: aw, h: ah, t: 3, color: T.wallLit, alpha: 1 });
  pointedArch(g, { cx: ax, baseY: horizon, w: aw - 10, h: ah - 8, t: 0, color: T.dark, fillColor: C.void, fillAlpha: 1 });
  for (const sgn of [-1, 1]) {
    column(g, {
      cx: ax + sgn * Math.round((aw / 2 + 9)), topY: horizon - ah, bottomY: horizon,
      w: Math.round(7 * L.u), shaft: T.wall, light: T.wallLit, dark: T.dark, capH: 4, baseH: 4, flutes: 2,
    });
  }
  steps(g, { cx: ax, y: horizon + 2, w: Math.round(aw + 26 * L.u), count: 2, rise: Math.round(4 * L.u), color: C.stoneDark, light: C.stoneLight, alpha: 1 });
  // 两座方尖碑
  for (const [bx, bh] of [[0.17, 0.16], [0.84, 0.14]]) {
    const ox = Math.round(w * bx), oh = Math.round(h * bh), ow = Math.round(8 * L.u);
    silhouette(g, [{ x: ox - ow, y: horizon }, { x: ox - ow + 1, y: horizon - oh + 6 }, { x: ox, y: horizon - oh }, { x: ox + ow - 1, y: horizon - oh + 6 }, { x: ox + ow, y: horizon }], C.stoneDark, 1);
    pxRect(g, ox - ow, horizon - Math.round(oh * 0.5), 1, Math.round(oh * 0.5), C.stoneLight, 0.35);
    pxRect(g, ox - 2, horizon - Math.round(oh * 0.55), 4, 1, C.stoneLight, 0.5);
  }
  // 三排碑：越近越大越亮，排间错位避免列对齐
  const rowS = [0.72, 1.0, 1.32];
  const rowC = [C.stoneDark, C.stoneDark, C.stone];
  for (let r = 0; r < 3; r++) {
    const by = Math.round(horizon + (h - horizon) * (0.10 + r * 0.23));
    const s = L.u * rowS[r];
    for (let i = 0; i < 5; i++) {
      const gx = Math.round(w * (0.10 + i * 0.20)) + (r % 2 ? 11 : -6);
      gravestone(g, gx, by, (i + r) % 3, s, rowC[r]);
      pxRect(g, gx - Math.round(6 * s), by - 2, Math.round(12 * s), 2, C.void, 0.35);
      if (r === 2) pxRect(g, gx - Math.round(6 * s), by - Math.round(20 * s), Math.round(12 * s), 1, C.stoneLight, 0.4);
    }
  }
  // 断成两段的矮铁栏：只在甬道两侧，别让整条横栏抢掉墓门的中心地位
  const fenceBase = L.ground - 1, fenceTop = fenceBase - Math.round(h * 0.075);
  for (const [x0, x1] of [[0.02, 0.40], [0.64, 0.98]]) {
    const px0 = Math.round(w * x0), px1 = Math.round(w * x1);
    const n = Math.max(2, Math.round((px1 - px0) / Math.round(34 * L.u)));
    for (let i = 0; i <= n; i++) {
      const px = Math.round(px0 + ((px1 - px0) * i) / n);
      pxRect(g, px, fenceTop, 2, fenceBase - fenceTop, T.metal, 0.32);
      pxRect(g, px - 1, fenceTop, 4, 2, T.metal, 0.42);
    }
    pxRect(g, px0, fenceTop, px1 - px0, 1, T.metal, 0.36);
    pxRect(g, px0, fenceBase - Math.round(h * 0.028), px1 - px0, 1, T.metal, 0.24);
  }
  wax(g, Math.round(w * 0.44), L.ground - 1, Math.round(14 * L.u), C.parchment, C.brassLight, C.stoneDark, 0.9);
  wax(g, Math.round(w * 0.60), L.ground - 1, Math.round(14 * L.u), C.parchment, C.brassLight, C.stoneDark, 0.9);
  moss(g, { x: Math.round(w * 0.08), y: Math.round(h * 0.80), w: Math.round(w * 0.24), h: 10, seed: 84, color: C.rot, color2: C.mossTileLit, count: 26, alpha: 0.5 });
  moss(g, { x: Math.round(w * 0.62), y: Math.round(h * 0.82), w: Math.round(w * 0.28), h: 10, seed: 85, color: C.rot, color2: C.mossTileLit, count: 26, alpha: 0.5 });
}

function graveyardFore(g, L) {
  groundSlabs(g, L, T.floor, T.floorLine, 6, L.ground);
  for (let i = 0; i < 5; i++) {
    const gx = Math.round(L.w * (0.06 + i * 0.22));
    for (let k = 0; k < 3; k++) {
      const gy = Math.round(L.h * (0.93 + (k % 2) * 0.02));
      thinLine(g, gx + k * 3, gy, gx + k * 3 - 4, gy - Math.round(8 * L.u), T.grass, 0.7);
    }
  }
  gravestone(g, Math.round(L.w * 0.30), Math.round(L.h * 0.97), 1, L.u * 1.4, C.stoneDark);
  gravestone(g, Math.round(L.w * 0.74), Math.round(L.h * 0.99), 0, L.u * 1.5, C.stoneDark);
  pxRect(g, -L.B, Math.round(L.h * 0.88), L.w + L.B * 2, 3, C.fog, 0.07);
  rubble(g, { x: Math.round(L.w * 0.44), y: Math.round(L.h * 0.95), w: Math.round(L.w * 0.24), h: 8, seed: 86, color: C.stoneDark, color2: C.stone, count: 14, alpha: 0.75 });
}

function altarBack(g, L) {
  archWall(g, L, T.wall, T.floorLine);
  ring(g, L.cx, Math.round(L.h * 0.26), Math.round(42 * L.u), C.brassDark, 0.14, 28);
  ring(g, L.cx, Math.round(L.h * 0.26), Math.round(28 * L.u), C.brassDark, 0.1, 20);
  for (const fx of [0.26, 0.74]) {
    chain(g, { x: Math.round(L.w * fx), y: Math.round(L.h * 0.05), h: Math.round(L.h * 0.12), color: C.brassDark, alpha: 0.75, linkH: 4 });
    pxRect(g, Math.round(L.w * fx) - 4, Math.round(L.h * 0.05) + Math.round(L.h * 0.12), 9, 4, C.brassDark, 0.8);
  }
}

function altarMid(g, L) {
  // 中景地面：地平线到 ground，前景层只从 ground 往下压边
  fill(g, -L.B, L.horizon, L.w + L.B * 2, L.ground - L.horizon, T.floor);
  const box = altarBox(L);
  const pad = Math.round(10 * L.u);
  pxRect(g, box.ox - pad, box.oy - pad, box.size + pad * 2, box.size + pad * 2, C.stoneDark, 1);
  pxRect(g, box.ox - pad, box.oy - pad, box.size + pad * 2, 2, C.stoneLight, 0.5);
  pxFrame(g, box.ox - pad, box.oy - pad, box.size + pad * 2, box.size + pad * 2, C.brassDark, 1, 0.7);
  for (let i = 0; i < 16; i++) {
    const gx = box.ox + (i % 4) * (box.cell + box.gap);
    const gy = box.oy + Math.floor(i / 4) * (box.cell + box.gap);
    pxRect(g, gx, gy, box.cell, box.cell, C.graveTile, 1);
    pxFrame(g, gx, gy, box.cell, box.cell, C.groove, 1, 0.3);
    pxRect(g, gx + 2, gy + 2, box.cell - 4, 1, C.stoneDark, 0.5);
  }
  steps(g, { cx: L.cx, y: box.oy + box.size + pad, w: Math.round(box.size * 1.3), count: 3, rise: Math.round(4 * L.u), color: C.stoneDark, light: C.stoneLight, alpha: 0.95 });
  wax(g, Math.round(L.w * 0.22), Math.round(L.h * 0.80), Math.round(16 * L.u), C.parchment, C.brassLight, C.brassDark, 1);
  wax(g, Math.round(L.w * 0.78), Math.round(L.h * 0.80), Math.round(16 * L.u), C.parchment, C.brassLight, C.brassDark, 1);
  candelabrum(g, Math.round(L.w * 0.08), Math.round(L.h * 0.86), Math.round(30 * L.u), 0.9);
  candelabrum(g, Math.round(L.w * 0.92), Math.round(L.h * 0.86), Math.round(30 * L.u), 0.9);
}

function altarFore(g, L) {
  groundSlabs(g, L, T.floor, T.floorLine, 6, L.ground);
  for (const fx of [0.30, 0.70]) {
    pxRect(g, Math.round(L.w * fx) - Math.round(14 * L.u), Math.round(L.h * 0.94), Math.round(28 * L.u), Math.round(8 * L.u), C.stoneDark, 0.95);
    pxRect(g, Math.round(L.w * fx) - Math.round(14 * L.u), Math.round(L.h * 0.94), Math.round(28 * L.u), 1, C.stoneLight, 0.4);
  }
  pxRect(g, -L.B, Math.round(L.h * 0.90), L.w + L.B * 2, 3, C.fog, 0.07);
  rubble(g, { x: Math.round(L.w * 0.16), y: Math.round(L.h * 0.96), w: Math.round(L.w * 0.18), h: 8, seed: 91, color: C.stoneDark, color2: C.stone, count: 10, alpha: 0.7 });
}

function awakenBack(g, L) {
  skyFill(g, L, [[0, T.sky0], [0.14, T.sky1], [0.28, T.sky2], [0.42, T.sky3]]);
  starfield(g, {
    x: -L.B, y: 0, w: L.w + L.B * 2, h: Math.round(L.h * 0.5), seed: 93,
    count: L.tall ? 64 : 44, color: C.bone, bright: C.white, accent: C.runeCold, alpha: 0.85,
  });
  ring(g, L.cx, L.sealY, Math.round(96 * L.u), C.brassDark, 0.16, 34);
  ring(g, L.cx, L.sealY, Math.round(66 * L.u), C.brassDark, 0.12, 26);
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2;
    const rx = Math.round(L.cx + Math.cos(ang) * 96 * L.u);
    const ry = Math.round(L.sealY + Math.sin(ang) * 96 * L.u);
    pxRect(g, rx - 1, ry - 1, 3, 3, C.brassDark, 0.45);
  }
  for (const fx of [0.10, 0.90]) {
    column(g, {
      cx: Math.round(L.w * fx), topY: Math.round(L.h * 0.02), bottomY: L.horizon,
      w: Math.round(16 * L.u), shaft: T.wall, light: T.wallLit, dark: C.void,
      capH: Math.round(6 * L.u), baseH: Math.round(6 * L.u), alpha: 1, flutes: 3,
    });
  }
}

function awakenMid(g, L) {
  // 中景地面：地平线到 ground，前景层只从 ground 往下压边
  fill(g, -L.B, L.horizon, L.w + L.B * 2, L.ground - L.horizon, T.floor);
  // 祭坛：三级台阶 + 台体 + 出檐顶面 + 2×2 刻格 + 四角烛
  // 旧版是 disc(74u) 加两圈环，实机读作紫色小丘，读不出「祭坛」。
  const ay = Math.round(L.h * 0.72);
  const topH = Math.round(16 * L.u);
  const bodyH = Math.round(14 * L.u);
  const aw = Math.round(Math.min(L.w * 0.44, 190 * L.u));
  const ax0 = L.cx - Math.round(aw / 2);
  pxRect(g, ax0, ay, aw, bodyH, C.stoneDark, 1);
  pxRect(g, ax0, ay + bodyH - 2, aw, 2, C.void, 0.55);
  for (const fx of [0.3, 0.7]) pxRect(g, ax0 + Math.round(aw * fx), ay + 2, 1, bodyH - 4, C.groove, 0.5);
  pxRect(g, ax0 - 6, ay - topH, aw + 12, topH, C.stone, 1);
  pxRect(g, ax0 - 6, ay - topH, aw + 12, 2, C.stoneLight, 0.65);
  pxRect(g, ax0 - 6, ay - 1, aw + 12, 1, C.void, 0.45);
  const cell = Math.round(aw * 0.19);
  const gx0 = L.cx - cell - 2;
  const gy0 = ay - topH + 3;
  const cellH = Math.max(2, Math.round((topH - 5) / 2));
  for (let cr = 0; cr < 2; cr++) {
    for (let cc = 0; cc < 2; cc++) {
      const cxx = gx0 + cc * (cell + 4);
      const cyy = gy0 + cr * cellH;
      pxFrame(g, cxx, cyy, cell, cellH, C.groove, 1, 0.55);
      pxRect(g, cxx + 1, cyy + 1, cell - 2, 1, C.stoneDark, 0.4);
    }
  }
  steps(g, { cx: L.cx, y: ay + bodyH, w: Math.round(aw * 1.5), count: 3, rise: Math.round(5 * L.u), color: C.stoneDark, light: C.stoneLight, alpha: 0.95 });
  for (const [cx2, cy2] of [[-0.38, -1], [0.38, -1], [-0.44, 4], [0.44, 4]]) {
    wax(g, L.cx + Math.round(aw * cx2), ay - topH + cy2, Math.round(13 * L.u), C.parchment, C.brassLight, C.stoneDark, 0.95);
  }
  for (const fx of [0.16, 0.84]) obelisk(g, Math.round(L.w * fx), Math.round(L.h * 0.80), Math.round(52 * L.u), 0.95);
  for (const fx of [0.30, 0.70]) {
    chain(g, { x: Math.round(L.w * fx), y: Math.round(L.h * 0.06), h: Math.round(L.h * 0.18), color: C.brassDark, alpha: 0.7, linkH: 4 });
  }
  brazier(g, Math.round(L.w * 0.40), Math.round(L.h * 0.82), L.u, 0.9);
  brazier(g, Math.round(L.w * 0.60), Math.round(L.h * 0.82), L.u, 0.9);
}

function awakenFore(g, L) {
  groundSlabs(g, L, T.floor, T.floorLine, 6, L.ground);
  for (let i = 0; i < 4; i++) {
    const gx = Math.round(L.w * (0.08 + i * 0.28));
    thinLine(g, gx, Math.round(L.h * 0.96), gx - 4, Math.round(L.h * 0.90), T.grass, 0.6);
  }
  rubble(g, { x: Math.round(L.w * 0.02), y: Math.round(L.h * 0.95), w: Math.round(L.w * 0.20), h: 8, seed: 95, color: C.stoneDark, color2: C.stone, count: 12, alpha: 0.7 });
  rubble(g, { x: Math.round(L.w * 0.78), y: Math.round(L.h * 0.96), w: Math.round(L.w * 0.20), h: 8, seed: 96, color: C.stoneDark, color2: C.stone, count: 12, alpha: 0.7 });
  wax(g, Math.round(L.w * 0.12), Math.round(L.h * 0.99), Math.round(14 * L.u), C.parchment, C.brassLight, C.stoneDark, 0.95);
  wax(g, Math.round(L.w * 0.88), Math.round(L.h * 0.99), Math.round(14 * L.u), C.parchment, C.brassLight, C.stoneDark, 0.95);
}

function titleBack(g, L) {
  skyFill(g, L, [[0, T.sky0], [0.12, T.sky1], [0.26, T.sky2], [0.40, T.sky3]]);
  starfield(g, {
    x: -L.B, y: 0, w: L.w + L.B * 2, h: Math.round(L.h * 0.5), seed: 97,
    count: L.tall ? 68 : 46, color: C.bone, bright: C.white, accent: C.runeCold, alpha: 0.85,
  });
  sevenStars(g, L, 0.9, 1);
  tower(g, Math.round(L.w * 0.10), L.horizon, Math.round(22 * L.u), Math.round(L.h * 0.16), T.dark, 1);
  tower(g, Math.round(L.w * 0.90), L.horizon, Math.round(22 * L.u), Math.round(L.h * 0.16), T.dark, 1);
}

function titleMid(g, L) {
  // 中景地面：地平线到 ground，前景层只从 ground 往下压边
  fill(g, -L.B, L.horizon, L.w + L.B * 2, L.ground - L.horizon, T.floor);
  stele(g, L.cx, Math.round(L.h * 0.80), Math.round(112 * L.u), Math.round(96 * L.u), 1);
  ring(g, L.cx, Math.round(L.h * 0.80) - Math.round(48 * L.u), Math.round(20 * L.u), C.brassDark, 0.7, 18);
  pxDiamond(g, L.cx, Math.round(L.h * 0.80) - Math.round(48 * L.u), 5, C.brassLight, 0.8, true);
  for (const fx of [0.18, 0.82]) {
    column(g, {
      cx: Math.round(L.w * fx), topY: Math.round(L.h * 0.06), bottomY: Math.round(L.h * 0.82),
      w: Math.round(14 * L.u), shaft: T.wall, light: T.wallLit, dark: C.void,
      capH: Math.round(5 * L.u), baseH: Math.round(5 * L.u), alpha: 1, flutes: 2,
    });
    chain(g, { x: Math.round(L.w * fx), y: Math.round(L.h * 0.06), h: Math.round(L.h * 0.12), color: C.brassDark, alpha: 0.7, linkH: 4 });
  }
}

function titleFore(g, L) {
  groundSlabs(g, L, T.floor, T.floorLine, 5, L.ground);
  steps(g, { cx: L.cx, y: Math.round(L.h * 0.82), w: Math.round(140 * L.u), count: 3, rise: Math.round(5 * L.u), color: C.stoneDark, light: C.stoneLight, alpha: 0.95 });
  wax(g, Math.round(L.w * 0.34), Math.round(L.h * 0.90), Math.round(16 * L.u), C.parchment, C.brassLight, C.stoneDark, 0.95);
  wax(g, Math.round(L.w * 0.66), Math.round(L.h * 0.90), Math.round(16 * L.u), C.parchment, C.brassLight, C.stoneDark, 0.95);
  rubble(g, { x: Math.round(L.w * 0.04), y: Math.round(L.h * 0.95), w: Math.round(L.w * 0.22), h: 8, seed: 98, color: C.stoneDark, color2: C.stone, count: 14, alpha: 0.75 });
  pxRect(g, -L.B, Math.round(L.h * 0.96), L.w + L.B * 2, Math.round(L.h * 0.04) + L.B, T.dark, 0.55);
}

export const OPENING_STATIC = {
  skyfall: { back: skyfallBack, mid: skyfallMid, fore: skyfallFore },
  contracts: { back: contractsBack, mid: contractsMid, fore: contractsFore },
  graveyard: { back: graveyardBack, mid: graveyardMid, fore: graveyardFore },
  altar: { back: altarBack, mid: altarMid, fore: altarFore },
  awaken: { back: awakenBack, mid: awakenMid, fore: awakenFore },
  title: { back: titleBack, mid: titleMid, fore: titleFore },
};

// ---------- 结局静态三层 ----------

function releaseBack(g, L) {
  skyFill(g, L, [[0, T.sky0], [0.14, T.sky1], [0.30, T.sky2], [0.44, T.sky3]]);
  starfield(g, {
    x: -L.B, y: 0, w: L.w + L.B * 2, h: Math.round(L.h * 0.52), seed: 101,
    count: L.tall ? 62 : 44, color: C.bone, bright: C.white, accent: C.runeCold, alpha: 0.75,
  });
  ring(g, L.cx, L.sealY, Math.round(78 * L.u), C.brassDark, 0.14, 30);
  ring(g, L.cx, L.sealY, Math.round(52 * L.u), C.brassDark, 0.1, 22);
  silhouette(g, [
    { x: -L.B, y: L.horizon }, { x: -L.B, y: Math.round(L.horizon - L.h * 0.04) },
    { x: Math.round(L.w * 0.22), y: Math.round(L.horizon - L.h * 0.06) },
    { x: Math.round(L.w * 0.48), y: Math.round(L.horizon - L.h * 0.03) },
    { x: Math.round(L.w * 0.70), y: Math.round(L.horizon - L.h * 0.07) },
    { x: Math.round(L.w + L.B), y: Math.round(L.horizon - L.h * 0.05) },
    { x: Math.round(L.w + L.B), y: L.horizon },
  ], T.dark, 1);
}

function releaseMid(g, L) {
  // 中景地面：地平线到 ground，前景层只从 ground 往下压边
  fill(g, -L.B, L.horizon, L.w + L.B * 2, L.ground - L.horizon, T.floor);
  const { w, h } = L;
  fill(g, -L.B, L.baseY - Math.round(h * 0.02), w + L.B * 2, Math.round(h * 0.05), T.floorLine, 0.3);
  for (let i = 0; i < 7; i++) {
    const cx = contractCenter(w, i);
    const pw = Math.round(26 * L.u);
    const ph = Math.round(h * 0.10);
    pxRect(g, cx - pw / 2, L.baseY - ph, pw, ph, C.stoneDark, 1);
    pxRect(g, cx - pw / 2, L.baseY - ph, pw, 2, C.stoneLight, 0.45);
    pxRect(g, cx - pw / 2 - 3, L.baseY - 4, pw + 6, 4, C.stone, 0.8);
    ring(g, cx, L.baseY - ph - 2, Math.round(7 * L.u), C.brassDark, 0.5, 12);
    pointedArch(g, { cx, baseY: L.baseY - Math.round(h * 0.02), w: Math.round(22 * L.u), h: Math.round(h * 0.20), t: 0, color: T.floorLine, fillColor: T.dark, fillAlpha: 1 });
    pointedArch(g, { cx, baseY: L.baseY - Math.round(h * 0.02), w: Math.round(22 * L.u), h: Math.round(h * 0.20), t: 1, color: T.floorLine, alpha: 0.6 });
  }
  brazier(g, Math.round(w * 0.06), L.baseY, L.u, 0.85);
  brazier(g, Math.round(w * 0.94), L.baseY, L.u, 0.85);
}

function releaseFore(g, L) {
  groundSlabs(g, L, T.floor, T.floorLine, 5, L.ground);
  pxRect(g, -L.B, L.baseY, L.w + L.B * 2, 2, T.floorLine, 0.8);
  rubble(g, { x: Math.round(L.w * 0.08), y: Math.round(L.h * 0.93), w: Math.round(L.w * 0.26), h: 10, seed: 103, color: C.stoneDark, color2: C.stone, count: 16, alpha: 0.7 });
  rubble(g, { x: Math.round(L.w * 0.64), y: Math.round(L.h * 0.94), w: Math.round(L.w * 0.28), h: 10, seed: 104, color: C.stoneDark, color2: C.stone, count: 16, alpha: 0.7 });
  pxRect(g, -L.B, Math.round(L.h * 0.96), L.w + L.B * 2, Math.round(L.h * 0.04) + L.B, T.dark, 0.5);
}

function quietBack(g, L) {
  archWall(g, L, T.wall, T.floorLine);
  ring(g, L.cx, Math.round(L.h * 0.24), Math.round(46 * L.u), C.brassDark, 0.12, 28);
  ring(g, L.cx, Math.round(L.h * 0.24), Math.round(30 * L.u), C.brassDark, 0.08, 20);
}

function quietMid(g, L) {
  // 中景地面：地平线到 ground，前景层只从 ground 往下压边
  fill(g, -L.B, L.horizon, L.w + L.B * 2, L.ground - L.horizon, T.floor);
  const box = altarBox(L);
  const pad = Math.round(10 * L.u);
  pxRect(g, box.ox - pad, box.oy - pad, box.size + pad * 2, box.size + pad * 2, C.stoneDark, 1);
  pxRect(g, box.ox - pad, box.oy - pad, box.size + pad * 2, 2, C.stoneLight, 0.4);
  pxFrame(g, box.ox - pad, box.oy - pad, box.size + pad * 2, box.size + pad * 2, C.brassDark, 1, 0.6);
  for (let i = 0; i < 16; i++) {
    const gx = box.ox + (i % 4) * (box.cell + box.gap);
    const gy = box.oy + Math.floor(i / 4) * (box.cell + box.gap);
    pxRect(g, gx, gy, box.cell, box.cell, C.graveTileDark, 1);
    pxFrame(g, gx, gy, box.cell, box.cell, C.groove, 1, 0.22);
  }
  steps(g, { cx: L.cx, y: box.oy + box.size + pad, w: Math.round(box.size * 1.3), count: 3, rise: Math.round(4 * L.u), color: C.stoneDark, light: C.stoneLight, alpha: 0.95 });
  wax(g, Math.round(L.w * 0.22), Math.round(L.h * 0.80), Math.round(14 * L.u), C.bone, C.mute, C.brassDark, 0.7);
  wax(g, Math.round(L.w * 0.78), Math.round(L.h * 0.80), Math.round(14 * L.u), C.bone, C.mute, C.brassDark, 0.7);
  candelabrum(g, Math.round(L.w * 0.08), Math.round(L.h * 0.86), Math.round(28 * L.u), 0.7);
  candelabrum(g, Math.round(L.w * 0.92), Math.round(L.h * 0.86), Math.round(28 * L.u), 0.7);
}

function quietFore(g, L) {
  groundSlabs(g, L, T.floor, T.floorLine, 6, L.ground);
  for (const fx of [0.30, 0.70]) {
    pxRect(g, Math.round(L.w * fx) - Math.round(14 * L.u), Math.round(L.h * 0.94), Math.round(28 * L.u), Math.round(8 * L.u), C.stoneDark, 0.95);
    pxRect(g, Math.round(L.w * fx) - Math.round(14 * L.u), Math.round(L.h * 0.94), Math.round(28 * L.u), 1, C.stoneLight, 0.35);
  }
  pxRect(g, -L.B, Math.round(L.h * 0.90), L.w + L.B * 2, 3, C.fog, 0.06);
  rubble(g, { x: Math.round(L.w * 0.62), y: Math.round(L.h * 0.96), w: Math.round(L.w * 0.22), h: 8, seed: 105, color: C.stoneDark, color2: C.stone, count: 12, alpha: 0.65 });
}

function dawnBack(g, L) {
  const { w, h } = L;
  const hz = L.horizon;
  const stops = [
    [0.00, 0.10, mix(T.dawn0, C.void, 0.50)],
    [0.10, 0.22, T.dawn0],
    [0.22, 0.31, mix(T.dawn0, T.dawn1, 0.60)],
    [0.31, 0.345, mix(T.dawn0, T.dawn1, 0.85)],
    [0.345, 0.38, T.dawn1],
    [0.38, 0.43, mix(T.dawn1, T.dawn2, 0.50)],
    [0.43, 0.455, mix(T.dawn1, T.dawn2, 0.80)],
    [0.455, 0.48, T.dawn2],
    [0.48, 0.52, mix(T.dawn2, T.dawn3, 0.45)],
    [0.52, 1.00, mix(T.dawn2, T.dawn3, 0.78)],
  ];
  for (const [a, b, col] of stops) {
    const y0 = Math.round(h * a), y1 = b >= 1 ? hz : Math.round(h * b);
    if (y1 > y0) fill(g, -L.B, y0, w + L.B * 2, y1 - y0, col, 1);
  }
  pxRect(g, -L.B, hz - 3, w + L.B * 2, 3, T.dawn3, 0.5);
  starfield(g, {
    x: -L.B, y: 0, w: L.w + L.B * 2, h: Math.round(h * 0.30), seed: 107,
    count: L.tall ? 40 : 26, color: C.bone, bright: C.white, accent: C.runeCold, alpha: 0.5,
  });
  const sx = Math.round(w * 0.62);
  disc(g, sx, hz, Math.round(26 * L.u), mix(T.dawn3, C.brass, 0.4), 1);
  disc(g, sx, hz, Math.round(18 * L.u), C.brassLight, 1);
  disc(g, sx, hz, Math.round(10 * L.u), C.parchment, 1);
  for (let i = -2; i <= 2; i++) {
    if (i === 0) continue;
    thinLine(g, sx + i * Math.round(6 * L.u), hz - Math.round(8 * L.u), sx + i * Math.round(44 * L.u), Math.max(0, hz - Math.round(h * (0.20 + Math.abs(i) * 0.035))), C.brassLight, 0.09);
  }
  silhouette(g, [
    { x: -L.B, y: hz }, { x: -L.B, y: hz - Math.round(h * 0.030) },
    { x: Math.round(w * 0.18), y: hz - Math.round(h * 0.018) },
    { x: Math.round(w * 0.36), y: hz - Math.round(h * 0.040) },
    { x: Math.round(w * 0.70), y: hz - Math.round(h * 0.016) },
    { x: Math.round(w * 0.88), y: hz - Math.round(h * 0.046) },
    { x: w + L.B, y: hz - Math.round(h * 0.026) }, { x: w + L.B, y: hz },
  ], mix(T.dawn1, C.void, 0.35), 1);
  silhouette(g, [
    { x: -L.B, y: hz }, { x: -L.B, y: hz - Math.round(h * 0.016) },
    { x: Math.round(w * 0.12), y: hz - Math.round(h * 0.008) },
    { x: Math.round(w * 0.32), y: hz - Math.round(h * 0.026) },
    { x: Math.round(w * 0.56), y: hz - Math.round(h * 0.006) },
    { x: Math.round(w * 0.80), y: hz - Math.round(h * 0.028) },
    { x: w + L.B, y: hz - Math.round(h * 0.010) }, { x: w + L.B, y: hz },
  ], T.dark, 1);
  deadTree(g, Math.round(w * 0.88), hz, h * 0.13, T.dark, 1, 108);
}

function dawnMid(g, L) {
  const { w, h, u } = L;
  const hz = L.horizon, gy = L.ground;
  fill(g, -L.B, hz, L.w + L.B * 2, gy - hz + 2, mix(T.floor, 0x6a4a3a, 0.30));
  const cx = Math.round(w * 0.5);
  for (let r = 0; r < 9; r++) {
    const t0 = Math.pow(r / 9, 1.3), t1 = Math.pow((r + 1) / 9, 1.3);
    const y0 = hz + Math.round((gy - hz) * t0), y1 = hz + Math.round((gy - hz) * t1);
    const half0 = Math.round((4 + 15 * t0) * u), half1 = Math.round((4 + 15 * t1) * u);
    pxRect(g, cx - half0, y0, half0 * 2, Math.max(1, y1 - y0), mix(T.floor, C.stone, 0.18 + (r % 2) * 0.03), 0.9);
    pxRect(g, cx - half0, y0, 1, Math.max(1, y1 - y0), C.stone, 0.20);
    pxRect(g, cx + half1, y0, 1, Math.max(1, y1 - y0), C.stone, 0.20);
    pxRect(g, cx - half0, y1 - 1, half0 * 2, 1, C.stone, 0.20);
  }
  for (let r = 0; r < 3; r++) {
    const by = hz + Math.round((gy - hz) * (0.16 + r * 0.20));
    const s = u * (0.62 + r * 0.20);
    for (let i = 0; i < 5; i++) {
      const gx = Math.round(w * (0.08 + i * 0.21));
      if (Math.abs(gx - cx) < 28 * u) continue;
      gravestone(g, gx, by, (i + r + 1) % 3, s, mix(C.stoneDark, C.stone, 0.45));
    }
  }
  // 中景废拱门：双柱 + 尖拱圈，立在路左侧
  const ax = Math.round(w * 0.185), ab = gy - Math.round(6 * u);
  const ph = Math.round(74 * u), aw = Math.round(46 * u);
  pxRect(g, ax - Math.round(26 * u), ab - ph, Math.round(9 * u), ph, C.stoneDark, 1);
  pxRect(g, ax + Math.round(17 * u), ab - ph, Math.round(9 * u), ph, C.stoneDark, 1);
  pxRect(g, ax - Math.round(26 * u), ab - ph, Math.round(9 * u), 2, C.stone, 0.45);
  pxRect(g, ax + Math.round(17 * u), ab - ph, Math.round(9 * u), 2, C.stone, 0.45);
  pointedArch(g, { cx: ax, baseY: ab - Math.round(ph * 0.62), w: aw, h: Math.round(ph * 0.52), t: 4, color: C.stoneDark, fillColor: C.void, fillAlpha: 0.55 });
  rubble(g, { x: ax - Math.round(32 * u), y: ab - Math.round(7 * u), w: Math.round(70 * u), h: Math.round(9 * u), seed: 109, color: C.stoneDark, color2: C.stone, count: 9, alpha: 0.9 });
  for (const ox of [Math.round(w * 0.40), Math.round(w * 0.60)]) {
    pxRect(g, ox - Math.round(3 * u), gy - Math.round(30 * u), Math.round(6 * u), Math.round(30 * u), C.stoneDark, 1);
    pxRect(g, ox - Math.round(3 * u), gy - Math.round(30 * u), Math.round(6 * u), 2, C.stone, 0.5);
    pxRect(g, ox - Math.round(3 * u), gy - Math.round(24 * u), Math.round(6 * u), 1, C.stone, 0.28);
  }
  moss(g, { x: Math.round(w * 0.02), y: gy - Math.round(6 * u), w: Math.round(w * 0.24), h: Math.round(8 * u), seed: 109, color: C.rot, color2: C.mossTileLit, count: 18, alpha: 0.45 });
  moss(g, { x: Math.round(w * 0.70), y: gy - Math.round(6 * u), w: Math.round(w * 0.28), h: Math.round(8 * u), seed: 110, color: C.rot, color2: C.mossTileLit, count: 18, alpha: 0.45 });
  // 中景地面：横向石层与台阶缝，避免整块空板
  for (let r = 0; r < 4; r++) {
    const ry = hz + Math.round((gy - hz) * (0.26 + r * 0.19));
    pxRect(g, -L.B, ry, w + L.B * 2, Math.max(1, Math.round(2 * u)), C.stone, 0.10 + r * 0.02);
    pxRect(g, -L.B, ry + Math.max(1, Math.round(2 * u)), w + L.B * 2, 1, C.void, 0.22);
  }
  for (let i = 0; i < 7; i++) {
    const vx = Math.round(w * (0.04 + i * 0.16));
    thinLine(g, vx, hz + Math.round(6 * u), Math.round(cx + (vx - cx) * 1.9), gy, C.void, 0.16);
  }
  pxRect(g, -L.B, hz + Math.round(9 * u), w + L.B * 2, Math.round(4 * u), C.fog, 0.08);
  pxRect(g, -L.B, gy - Math.round(15 * u), w + L.B * 2, Math.round(4 * u), C.fog, 0.06);
}

function dawnFore(g, L) {
  groundSlabs(g, L, mix(T.floor, C.void, 0.25), T.floorLine, 6, L.ground);
  gravestone(g, Math.round(L.w * 0.16), Math.round(L.h * (L.tall ? 0.955 : 0.99)), 1, L.u * 1.5, C.stoneDark);
  gravestone(g, Math.round(L.w * 0.84), Math.round(L.h * (L.tall ? 0.975 : 1.0)), 2, L.u * 1.6, C.stoneDark);
  for (let i = 0; i < 6; i++) {
    const gx = Math.round(L.w * (0.06 + i * 0.17));
    for (let k = 0; k < 3; k++) {
      const gy = Math.round(L.h * (0.94 + (k % 2) * 0.015));
      thinLine(g, gx + k * 3, gy, gx + k * 3 - 4, gy - Math.round(8 * L.u), T.grass, 0.6);
    }
  }
  rubble(g, { x: Math.round(L.w * 0.30), y: Math.round(L.h * 0.96), w: Math.round(L.w * 0.40), h: Math.round(L.h * 0.03), seed: 111, color: C.stoneDark, color2: C.stone, count: 9, alpha: 0.8 });
  pxRect(g, -L.B, Math.round(L.h * 0.90), L.w + L.B * 2, 2, C.fog, 0.06);
}
function creditsBack(g, L) {
  skyFill(g, L, [[0, T.sky0], [0.12, T.sky1], [0.26, T.sky2], [0.40, T.sky3]]);
  starfield(g, {
    x: -L.B, y: 0, w: L.w + L.B * 2, h: Math.round(L.h * 0.6), seed: 111,
    count: L.tall ? 80 : 56, color: C.bone, bright: C.white, accent: C.runeCold, alpha: 0.9,
  });
  sevenStars(g, L, 0.7, 1);
  ring(g, L.cx, Math.round(L.h * 0.45), Math.round(100 * L.u), C.brassDark, 0.12, 34);
  ring(g, L.cx, Math.round(L.h * 0.45), Math.round(70 * L.u), C.brassDark, 0.08, 26);
}

function creditsMid(g, L) {
  // 中景地面：地平线到 ground，前景层只从 ground 往下压边
  fill(g, -L.B, L.horizon, L.w + L.B * 2, L.ground - L.horizon, T.floor);
  stele(g, L.cx, Math.round(L.h * 0.80), Math.round(96 * L.u), Math.round(78 * L.u), 0.85);
  for (const fx of [0.14, 0.86]) {
    column(g, {
      cx: Math.round(L.w * fx), topY: Math.round(L.h * 0.08), bottomY: Math.round(L.h * 0.84),
      w: Math.round(14 * L.u), shaft: T.wall, light: T.wallLit, dark: C.void,
      capH: Math.round(5 * L.u), baseH: Math.round(5 * L.u), alpha: 1, flutes: 2,
    });
  }
  chain(g, { x: Math.round(L.w * 0.14), y: Math.round(L.h * 0.08), h: Math.round(L.h * 0.14), color: C.brassDark, alpha: 0.65, linkH: 4 });
  chain(g, { x: Math.round(L.w * 0.86), y: Math.round(L.h * 0.08), h: Math.round(L.h * 0.14), color: C.brassDark, alpha: 0.65, linkH: 4 });
}

function creditsFore(g, L) {
  pxRect(g, -L.B, Math.round(L.h * 0.86), L.w + L.B * 2, Math.round(L.h * 0.14) + L.B, C.ink, 0.9);
  pxRect(g, -L.B, Math.round(L.h * 0.86), L.w + L.B * 2, 1, T.floorLine, 0.5);
  for (let i = 0; i < 5; i++) {
    pxRect(g, Math.round(L.w * (0.04 + i * 0.23)), Math.round(L.h * 0.88), Math.round(L.w * 0.16), 1, T.floorLine, 0.25);
  }
  rubble(g, { x: Math.round(L.w * 0.06), y: Math.round(L.h * 0.92), w: Math.round(L.w * 0.24), h: 8, seed: 113, color: C.stoneDark, color2: C.stone, count: 12, alpha: 0.55 });
  wax(g, Math.round(L.w * 0.40), Math.round(L.h * 0.90), Math.round(12 * L.u), C.parchment, C.brassLight, C.stoneDark, 0.7);
  wax(g, Math.round(L.w * 0.60), Math.round(L.h * 0.90), Math.round(12 * L.u), C.parchment, C.brassLight, C.stoneDark, 0.7);
}

export const ENDING_STATIC = {
  release: { back: releaseBack, mid: releaseMid, fore: releaseFore },
  quiet: { back: quietBack, mid: quietMid, fore: quietFore },
  dawn: { back: dawnBack, mid: dawnMid, fore: dawnFore },
  credits: { back: creditsBack, mid: creditsMid, fore: creditsFore },
};

// ---------- 开场动态件（每帧只画这些）----------

function dynSkyfall(g, { w, h, t, p }) {
  const L = storyLayout(w, h);
  for (let i = 0; i < 3; i++) {
    const mp = clamp01(p * 1.25 - i * 0.28);
    if (mp <= 0 || mp >= 1) continue;
    const x = Math.round(w * (0.86 - mp * 0.52) + i * 34);
    const y = Math.round(h * (0.04 + mp * 0.42) + i * 12);
    const tx = x + Math.round(22 * L.u);
    const ty = y + Math.round(34 * L.u);
    thinLine(g, x, y, tx, ty, C.runeCold, (1 - mp) * 0.75);
    pxRect(g, x - 1, y - 1, 3, 3, C.white, (1 - mp) * 0.9);
    pxRect(g, tx, ty, 2, 2, C.runeCold, (1 - mp) * 0.4);
  }
  for (let i = 0; i < 12; i++) {
    const dx = Math.round(((i * 47 + t * 0.012) % (w + 60)) - 30);
    const dy = Math.round(h * 0.08 + ((i * 29 + t * 0.02) % Math.round(h * 0.78)));
    pxRect(g, dx, dy, 1, 2, C.bone, 0.22);
  }
  const flash = clamp01((p - 0.72) / 0.12) * clamp01((0.92 - p) / 0.1);
  if (flash > 0) {
    pxDiamond(g, Math.round(w * 0.36), Math.round(h * 0.72), 4, C.white, flash * 0.7, true);
    ring(g, Math.round(w * 0.36), Math.round(h * 0.72), 10, C.runeCold, flash * 0.4, 16);
  }
}

function dynContracts(g, { w, h, t, p, accent }) {
  const L = storyLayout(w, h);
  for (let i = 0; i < 7; i++) {
    const cx = contractCenter(w, i);
    const lit = clamp01(p * 6.6 - i * 0.85);
    const a = 0.35 + 0.65 * lit;
    drawContractRelic(g, cx, L.baseY, i, a, accent);
    if (lit > 0) {
      const r = Math.round(18 * L.u);
      const topY = L.baseY - CONTRACT_TOP[i];
      const cy = topY - 10 - r;
      thinLine(g, cx, cy + r, cx, topY, C.brassDark, 0.4 * lit);
      contractSeal(g, cx, cy, r, t, accent, lit * 0.85);
      const spark = clamp01((lit - 0.85) / 0.15) * (1 - clamp01((p - 0.96) / 0.04));
      if (spark > 0) {
        pxRect(g, cx - r - 6, cy - 4, 2, 2, C.brassLight, spark);
        pxRect(g, cx + r + 4, cy - 8, 1, 1, C.brassLight, spark);
      }
    }
  }
  for (let i = 0; i < 8; i++) {
    const dx = Math.round((i * 61 + t * 0.01) % w);
    const dy = Math.round(h * 0.30 + ((i * 37 + t * 0.014) % Math.round(h * 0.4)));
    pxRect(g, dx, dy, 1, 1, C.brassLight, 0.16);
  }
}

function dynGraveyard(g, { w, h, t, p, accent }) {
  const L = storyLayout(w, h);
  const z = 1 + 0.28 * easeInOutCubic(p);
  const cx = w / 2;
  const X = (x) => Math.round(cx + (x - cx) * z);
  const glow = clamp01((p - 0.4) / 0.4);
  if (glow > 0) {
    drawSeal(g, {
      cx: X(Math.round(w * 0.50)), cy: Math.round(h * 0.80) - Math.round(22 * z), r: Math.round(14 * z),
      t, accent, alpha: glow * 0.7, spokes: 6,
    });
  }
  for (const [x, i] of [[Math.round(w * 0.20), 0], [Math.round(w * 0.80), 1]]) {
    const flick = Math.round(Math.sin(t * 0.012 + i * 1.7) * 1.2);
    pxRect(g, X(x) - 1, Math.round(h * 0.88), 3, Math.round(14 * L.u), C.parchment, 0.75);
    pxRect(g, X(x) + flick, Math.round(h * 0.88) - 5, 1, 5, accent, 0.9);
  }
  for (let i = 0; i < 3; i++) {
    const ox = Math.round(((t * (0.010 + i * 0.004) + i * 91) % (w + 200)) - 200);
    pxRect(g, ox, Math.round(h * 0.86) + i * 7, 220, 3, C.fog, 0.05 + i * 0.02);
  }
  for (let i = 0; i < 3; i++) {
    const gx = X(Math.round(w * (0.18 + i * 0.32)));
    gravestone(g, gx, Math.round(h * (0.94 + i * 0.02)), i % 3, L.u * (1.2 + i * 0.2) * (1 + (z - 1) * 0.6), C.stoneDark);
  }
}

function dynAltar(g, { w, h, t, p, accent }) {
  const L = storyLayout(w, h);
  const box = altarBox(L);
  const litCount = Math.floor(clamp01((p - 0.25) / 0.65) * 16);
  const centerOf = (i) => [
    box.ox + (i % 4) * (box.cell + box.gap) + Math.round(box.cell / 2),
    box.oy + Math.floor(i / 4) * (box.cell + box.gap) + Math.round(box.cell / 2),
  ];
  for (let i = 0; i < 16; i++) {
    if (i >= litCount) continue;
    const gx = box.ox + (i % 4) * (box.cell + box.gap);
    const gy = box.oy + Math.floor(i / 4) * (box.cell + box.gap);
    pxRect(g, gx, gy, box.cell, box.cell, C.graveTileLit, 0.95);
    pxFrame(g, gx, gy, box.cell, box.cell, C.groove, 1, 0.8);
    pxDiamond(g, gx + Math.round(box.cell / 2), gy + Math.round(box.cell / 2), 3, accent, 0.8, true);
  }
  for (let i = 1; i < litCount; i++) {
    const [x1, y1] = centerOf(i - 1);
    const [x2, y2] = centerOf(i);
    thinLine(g, x1, y1, x2, y2, accent, 0.45);
  }
  for (const [fx, i] of [[0.22, 0], [0.78, 1]]) {
    const flick = Math.round(Math.sin(t * 0.014 + i * 2.1) * 1.2);
    pxRect(g, Math.round(w * fx) + flick, Math.round(h * 0.80) - Math.round(20 * L.u), 1, 5, accent, 0.9);
  }
  const wp = easeOutCubic(clamp01(p / 0.3));
  const hx = Math.round(w / 2);
  const hy = Math.round(box.oy + box.size + Math.round(40 * L.u) - wp * Math.round(34 * L.u));
  heroSilhouette(g, hx, hy, 1);
  if (p > 0.3) pxDiamond(g, hx, hy - 22, 2, accent, clamp01((p - 0.3) / 0.3) * 0.8, true);
}

function dynAwaken(g, { w, h, t, p, accent }) {
  const L = storyLayout(w, h);
  const r = Math.round(80 * L.u + 40 * L.u * easeOutCubic(p));
  drawSeal(g, { cx: L.cx, cy: Math.round(h * 0.46), r, t, accent, alpha: 0.20 + 0.12 * p, spokes: 12 });
  const pr = clamp01((p - 0.15) / 0.6);
  if (pr > 0) {
    pxRect(g, L.cx - Math.round(10 * L.u), Math.round(h * 0.10), Math.round(20 * L.u), Math.round(h * 0.72), accent, 0.06 * pr);
    pxRect(g, L.cx - Math.round(3 * L.u), Math.round(h * 0.12), Math.round(6 * L.u), Math.round(h * 0.68), C.parchment, 0.08 * pr);
  }
  heroSilhouette(g, L.cx, Math.round(h * 0.72), 1);
  for (let i = 0; i < 10; i++) {
    const dx = L.cx + Math.round(Math.sin(t * 0.001 + i) * 40);
    const dy = Math.round(h * 0.30 + ((i * 41 + t * 0.016) % Math.round(h * 0.44)));
    pxRect(g, dx, dy, 1, 1, C.arcaneLight, 0.3);
  }
}

function dynTitle(g, { w, h, t, p, accent }) {
  const L = storyLayout(w, h);
  const r = Math.max(24, Math.round(210 * L.u - 186 * L.u * easeInOutCubic(clamp01(p * 1.15))));
  const a = p < 0.85 ? 0.85 : 0.85 * (1 - (p - 0.85) / 0.15);
  drawSeal(g, { cx: L.cx, cy: Math.round(h * 0.46), r, t, accent, alpha: a });
  const sweep = clamp01((p - 0.1) / 0.6);
  if (sweep > 0) {
    const sy = Math.round(h * 0.80) - Math.round(96 * L.u) + Math.round(96 * L.u * sweep);
    pxRect(g, L.cx - Math.round(56 * L.u), sy, Math.round(112 * L.u), 1, C.brassLight, 0.25 * (1 - sweep * 0.4));
  }
  for (const [fx, i] of [[0.34, 0], [0.66, 1]]) {
    const flick = Math.round(Math.sin(t * 0.013 + i * 2.3) * 1.2);
    pxRect(g, Math.round(w * fx) + flick, Math.round(h * 0.90) - Math.round(22 * L.u), 1, 5, accent, 0.85);
  }
  for (let i = 0; i < 10; i++) {
    const dx = Math.round((i * 53 + t * 0.008) % w);
    const dy = Math.round(h * 0.18 + ((i * 31 + t * 0.012) % Math.round(h * 0.5)));
    pxRect(g, dx, dy, 1, 1, C.bone, 0.2);
  }
}

export const OPENING_STAGES = {
  skyfall: dynSkyfall,
  contracts: dynContracts,
  graveyard: dynGraveyard,
  altar: dynAltar,
  awaken: dynAwaken,
  title: dynTitle,
};

// ---------- 结局动态件 ----------

function dynRelease(g, { w, h, t, p, accent }) {
  const L = storyLayout(w, h);
  for (let i = 0; i < 7; i++) {
    const cx = contractCenter(w, i);
    const breakAt = 0.08 + i * 0.115;
    const bp = clamp01((p - breakAt) / 0.3);
    const a = 1 - 0.68 * clamp01((p - breakAt) / 0.55);
    drawContractRelic(g, cx, L.baseY, i, a, accent);
    const r = Math.round(18 * L.u);
    const topY = L.baseY - CONTRACT_TOP[i];
    const cy = topY - 10 - r;
    if (bp <= 0) {
      thinLine(g, cx, cy + r, cx, topY, C.brassDark, 0.4);
      contractSeal(g, cx, cy, r, t, accent, 0.85);
    } else {
      drawShatter(g, { cx, cy, r, p: bp, accent, seed: 0x51c7 + i * 131 });
      for (let k = 0; k < 3; k++) {
        const uy = clamp01(bp * 1.4 - k * 0.2);
        pxRect(g, cx + (k - 1) * 6, Math.round(cy - uy * Math.round(48 * L.u)), 1, 2, C.arcaneLight, (1 - uy) * 0.7);
      }
    }
  }
  for (let i = 0; i < 10; i++) {
    const dx = (i * 53 + 17) % w;
    const dy = Math.round(h * 0.22 + ((i * 29 + t * 0.01) % Math.round(h * 0.58)));
    pxRect(g, dx, dy, 1, 1, C.mute, 0.22 * (1 - p * 0.5));
  }
}

function dynQuiet(g, { w, h, t, p, accent }) {
  const L = storyLayout(w, h);
  const box = altarBox(L);
  const litCount = 16 - Math.floor(clamp01((p - 0.1) / 0.6) * 16);
  const centerOf = (i) => [
    box.ox + (i % 4) * (box.cell + box.gap) + Math.round(box.cell / 2),
    box.oy + Math.floor(i / 4) * (box.cell + box.gap) + Math.round(box.cell / 2),
  ];
  for (let i = 0; i < litCount; i++) {
    const gx = box.ox + (i % 4) * (box.cell + box.gap);
    const gy = box.oy + Math.floor(i / 4) * (box.cell + box.gap);
    pxRect(g, gx, gy, box.cell, box.cell, C.graveTileLit, 0.9);
    pxFrame(g, gx, gy, box.cell, box.cell, C.groove, 1, 0.7);
    pxDiamond(g, gx + Math.round(box.cell / 2), gy + Math.round(box.cell / 2), 3, accent, 0.7, true);
  }
  for (let i = 1; i < litCount; i++) {
    const [x1, y1] = centerOf(i - 1);
    const [x2, y2] = centerOf(i);
    thinLine(g, x1, y1, x2, y2, accent, 0.4);
  }
  const hx = Math.round(w / 2);
  const hy = Math.round(box.oy + box.size + Math.round(40 * L.u));
  heroSilhouette(g, hx, hy, 1);
  if (p <= 0.85) {
    const flick = 0.4 + 0.6 * Math.abs(Math.sin(t * 0.02));
    const die = p > 0.7 ? 1 - (p - 0.7) / 0.15 : 1;
    pxDiamond(g, hx, hy - 22, 2, accent, clamp01(flick * die) * 0.9, true);
  }
  for (let i = 0; i < 10; i++) {
    const x = (i * 53 + 17) % w;
    const y = Math.round(h * 0.3 + ((i * 29 + t * 0.008) % Math.max(20, Math.round(h * 0.5))));
    pxRect(g, x, y, 1, 1, C.mute, 0.25 * (1 - p * 0.6));
  }
}

function dynDawn(g, { w, h, t, p, accent, stars }) {
  const L = storyLayout(w, h);
  const starA = 1 - clamp01(p / 0.45);
  if (starA > 0 && stars) {
    for (let si = 0; si < stars.length; si += 3) { const s = stars[si];
      const tw = 0.3 + 0.4 * (0.5 + 0.5 * Math.sin(t * 0.002 + s.phase));
      pxRect(g, s.x, s.y, s.size, s.size, C.parchment, tw * starA);
    }
  }
  const rise = easeOutCubic(p);
  const sx = Math.round(w * 0.62);
  const sy = Math.round(L.horizon - 2 - rise * Math.round(16 * L.u));
  if (rise > 0) {
    disc(g, sx, sy, Math.round(24 * L.u), mix(T.dawn3, C.brass, 0.4), 0.55 * rise);
    disc(g, sx, sy, Math.round(16 * L.u), C.brassLight, 0.8 * rise);
    disc(g, sx, sy, Math.round(9 * L.u), C.parchment, rise);
    for (let i = -2; i <= 2; i++) {
      if (i === 0) continue;
      thinLine(g, sx + i * Math.round(7 * L.u), sy - Math.round(8 * L.u), sx + i * Math.round(50 * L.u), sy - Math.round(h * (0.16 + Math.abs(i) * 0.03)), C.brassLight, 0.10 * rise);
    }
    // 晨光落在石路上：三道短横光，不做整圈光池
    const py = Math.round(h * 0.93);
    for (let i = 0; i < 3; i++) {
      const lw = Math.round(w * (0.10 + i * 0.05) * rise);
      pxRect(g, Math.round(w * 0.5) - lw, py - i * Math.round(5 * L.u), lw * 2, 1, C.brassLight, (0.22 - i * 0.05) * rise);
    }
  }
  for (let i = 0; i < 8; i++) {
    const dx = Math.round((i * 67 + t * 0.01) % w);
    const dy = Math.round(h * (0.68 + (i % 3) * 0.05));
    pxRect(g, dx, dy, 1, 1, C.brassLight, 0.20 * rise);
  }
}
function dynCredits(g, { w, h, t, p, accent, stars }) {
  const L = storyLayout(w, h);
  if (stars) {
    for (let si = 0; si < stars.length; si += 3) { const s = stars[si];
      const tw = 0.2 + 0.3 * (0.5 + 0.5 * Math.sin(t * 0.002 + s.phase));
      pxRect(g, s.x, s.y, s.size, s.size, C.parchment, tw);
    }
  }
  drawSeal(g, {
    cx: L.cx, cy: Math.round(h * 0.45), r: Math.round(64 * L.u), t, accent,
    alpha: 0.14, spokes: 6, runes: false, core: false,
  });
  for (let i = 0; i < 8; i++) {
    const dx = Math.round((i * 59 + t * 0.006) % w);
    const dy = Math.round(h * 0.12 + ((i * 43 + t * 0.01) % Math.round(h * 0.5)));
    pxRect(g, dx, dy, 1, 1, C.bone, 0.18);
  }
}

export const ENDING_STAGES = {
  release: dynRelease,
  quiet: dynQuiet,
  dawn: dynDawn,
  credits: dynCredits,
};

// journey 六幕的静态三层 + 逐帧动态件已拆到独立文件（T17）；
// 这里保持对外导出面不变：JOURNEY_STAGES[stage](g, ctx) 仍然只画动态。
export { JOURNEY_STATIC, JOURNEY_STAGES, journeyLayout, journeyPan } from './journey-static.js';
