// 开场与幕间 journey 的镜头绘制：硬边色块、整数坐标；g 的清空由调用方负责。
// 粒子（星点/浮尘）由调用方预建传入，每帧不新建对象。
import { C, pxRect, pxLine, pxDiamond, pxFrame } from './Palette.js';
import {
  clamp01, easeOutCubic, easeInOutCubic, makeRng, drawSeal, thinLine,
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
  for (const s of stars) {
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

// 镜头 2：三契钉入。墓碑/沉钟/王座三个小舞台依次亮起契约符环。
function drawContracts(g, { w, h, t, p, accent }) {
  pxRect(g, 0, 0, w, h, C.nightDeep, 1);
  const baseY = Math.round(h * 0.68);
  pxRect(g, 0, baseY, w, h - baseY, C.ink, 0.95);
  pxRect(g, 0, baseY, w, 2, C.groove, 0.5);
  const centers = [Math.round(w / 2 - 150), Math.round(w / 2), Math.round(w / 2 + 150)];
  centers.forEach((cx, i) => {
    const lit = clamp01(p * 3.2 - i * 0.9);
    const a = 0.35 + 0.65 * lit;
    if (i === 0) {
      // 墓碑
      pxRect(g, cx - 10, baseY - 34, 20, 34, C.stoneDark, a);
      pxRect(g, cx - 10, baseY - 34, 20, 2, C.stoneLight, 0.6 * a);
      pxLine(g, cx - 4, baseY - 26, cx + 3, baseY - 8, C.ink, 0.7 * a, 1);
    } else if (i === 1) {
      // 沉钟
      pxLine(g, cx, baseY - 96, cx, baseY - 44, C.brassDark, 0.7 * a, 1);
      pxRect(g, cx - 12, baseY - 44, 25, 4, C.brass, 0.9 * a);
      pxRect(g, cx - 8, baseY - 40, 17, 5, C.brassDark, 0.95 * a);
      pxRect(g, cx - 4, baseY - 34, 9, 3, C.brassDark, 0.9 * a);
      pxRect(g, cx, baseY - 31, 2, 4, C.brassLight, 0.8 * a);
    } else {
      // 王座
      pxRect(g, cx - 30, baseY - 8, 60, 8, C.shardStone, 0.9 * a);
      pxRect(g, cx - 20, baseY - 16, 40, 8, C.stoneDark, 0.9 * a);
      pxRect(g, cx - 12, baseY - 52, 24, 36, C.stoneDark, 0.95 * a);
      pxRect(g, cx - 8, baseY - 48, 16, 30, C.starTileLit, 0.7 * a);
      pxDiamond(g, cx, baseY - 34, 5, accent, 0.6 * a, true);
    }
    if (lit > 0) {
      drawSeal(g, { cx, cy: baseY - 80, r: 28, t, accent, alpha: lit * 0.8, spokes: 8, runes: false });
      pxDiamond(g, cx, baseY - 80, 3, accent, lit * 0.9, true);
    }
  });
}

// 镜头 3：墓园推镜。墓碑群向中央主碑缓慢放大（坐标绕中心缩放，保持整数），碑面符环微光渐亮。
function drawGraveyardPush(g, { w, h, t, p, accent }) {
  pxRect(g, 0, 0, w, h, C.nightDeep, 1);
  const horizon = Math.round(h * 0.62);
  const z = 1 + 0.35 * easeInOutCubic(p);
  const cx = w / 2;
  const X = x => Math.round(cx + (x - cx) * z);
  pxRect(g, 0, horizon, w, h - horizon, C.ink, 0.95);
  pxRect(g, 0, horizon, w, 2, C.groove, 0.5);
  for (let i = 1; i <= 4; i++) {
    const y = Math.round(horizon + (h - horizon) * (i / 5));
    pxRect(g, 0, y, w, 1, C.stoneDark, 0.28);
  }
  const graves = [[70, 26], [130, 18], [240, 40], [350, 22], [410, 28]];
  for (const [x, gh] of graves) {
    const gw = Math.max(2, Math.round(16 * z));
    const ghh = Math.round(gh * z);
    pxRect(g, X(x) - Math.round(gw / 2), horizon - ghh, gw, ghh, C.stoneDark, 0.95);
    pxRect(g, X(x) - Math.round(gw / 2), horizon - ghh, gw, 2, C.stoneLight, 0.55);
  }
  const glow = clamp01((p - 0.45) / 0.4);
  if (glow > 0) {
    drawSeal(g, {
      cx: X(240), cy: horizon - Math.round(20 * z), r: Math.round(14 * z),
      t, accent, alpha: glow * 0.7, spokes: 6,
    });
  }
  // 烛火两盏
  for (const [x, i] of [[96, 0], [384, 1]]) {
    const flick = Math.round(Math.sin(t * 0.012 + i * 1.7) * 1.2);
    pxRect(g, X(x) - 1, horizon + 12, 3, 14, C.parchment, 0.75);
    pxRect(g, X(x) + flick, horizon + 8, 1, 4, accent, 0.9);
  }
  // 雾带横移
  for (let i = 0; i < 2; i++) {
    const ox = Math.round(((t * (0.012 + i * 0.004) + i * 97) % (w + 200)) - 200);
    pxRect(g, ox, horizon - 12 + i * 7, 220, 3, C.fog, 0.05 + i * 0.02);
  }
}

// 镜头 4：祭坛俯视。4×4 刻格逐格点亮，脉流沿格线流动，主角剪影走近立定。
function drawAltar(g, { w, h, t, p, accent }) {
  pxRect(g, 0, 0, w, h, C.nightDeep, 1);
  const cell = 30, gap = 4, size = cell * 4 + gap * 3;
  const ox = Math.round(w / 2 - size / 2), oy = Math.round(h / 2 - size / 2);
  pxRect(g, ox - 10, oy - 10, size + 20, size + 20, C.stoneDark, 0.95);
  pxFrame(g, ox - 10, oy - 10, size + 20, size + 20, C.brassDark, 1, 0.7);
  const litCount = Math.floor(clamp01((p - 0.25) / 0.65) * 16);
  const centerOf = i => [
    ox + (i % 4) * (cell + gap) + Math.round(cell / 2),
    oy + Math.floor(i / 4) * (cell + gap) + Math.round(cell / 2),
  ];
  for (let i = 0; i < 16; i++) {
    const gx = ox + (i % 4) * (cell + gap);
    const gy = oy + Math.floor(i / 4) * (cell + gap);
    const lit = i < litCount;
    pxRect(g, gx, gy, cell, cell, lit ? C.graveTileLit : C.graveTile, 0.95);
    pxFrame(g, gx, gy, cell, cell, C.groove, 1, lit ? 0.8 : 0.3);
    if (lit) pxDiamond(g, gx + Math.round(cell / 2), gy + Math.round(cell / 2), 3, accent, 0.8, true);
  }
  for (let i = 1; i < litCount; i++) {
    const [x1, y1] = centerOf(i - 1);
    const [x2, y2] = centerOf(i);
    thinLine(g, x1, y1, x2, y2, accent, 0.45);
  }
  const wp = easeOutCubic(clamp01(p / 0.3));
  const hx = Math.round(w / 2);
  const hy = Math.round(oy + size + 40 - wp * 34);
  heroSilhouette(g, hx, hy, 1);
  // 立定后魂火微光
  if (p > 0.3) pxDiamond(g, hx, hy - 22, 2, accent, clamp01((p - 0.3) / 0.3) * 0.8, true);
}

// 镜头 5：符环觉醒。符环扩张旋转，核心耀亮（浮尘由场景层统一画）。
function drawAwaken(g, { w, h, t, p, accent }) {
  pxRect(g, 0, 0, w, h, C.nightDeep, 1);
  const r = Math.round(120 + 90 * easeOutCubic(p));
  drawSeal(g, {
    cx: Math.round(w / 2), cy: Math.round(h * 0.46), r, t, accent,
    alpha: 0.5 + 0.4 * p, spokes: 12,
  });
}

// 镜头 6：标题收拢。符环收成一点，文字由 StoryScene 淡入。
function drawTitleSeal(g, { w, h, t, p, accent }) {
  pxRect(g, 0, 0, w, h, C.nightDeep, 1);
  const r = Math.max(24, Math.round(210 - 186 * easeInOutCubic(clamp01(p * 1.15))));
  const a = p < 0.85 ? 0.85 : 0.85 * (1 - (p - 0.85) / 0.15);
  drawSeal(g, { cx: Math.round(w / 2), cy: Math.round(h * 0.46), r, t, accent, alpha: a });
}

export const OPENING_STAGES = {
  skyfall: drawSkyfall,
  contracts: drawContracts,
  graveyard: drawGraveyardPush,
  altar: drawAltar,
  awaken: drawAwaken,
  title: drawTitleSeal,
};