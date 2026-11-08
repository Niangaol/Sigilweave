// 开场与幕间 journey 的镜头绘制：硬边色块、整数坐标；g 的清空由调用方负责。
// 粒子（星点/浮尘）由调用方预建传入，每帧不新建对象。
import { C, pxRect, pxLine, pxDiamond, pxFrame } from './Palette.js';
import {
  clamp01, easeOutCubic, easeInOutCubic, makeRng, drawSeal, drawShatter, thinLine,
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

// 三契圣物：墓碑/沉钟/王座。开场「钉入」与结局「解除」共用同一组形状，保持视觉同源。
function drawContractRelic(g, cx, baseY, i, a, accent) {
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
    drawContractRelic(g, cx, baseY, i, a, accent);
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

// 幕间 journey · 二幕：横移长镜头。墓碑群滚动离场，沼水反光渐起，教堂彩窗逐格亮灯，主角剪影前行。
function drawJourneySwamp(g, { w, h, t, p, accent }) {
  pxRect(g, 0, 0, w, h, C.nightDeep, 1);
  const horizon = Math.round(h * 0.6);
  const pan = Math.round(p * 160);
  pxRect(g, 0, horizon, w, h - horizon, C.ink, 0.95);
  pxRect(g, 0, horizon, w, 2, C.groove, 0.4);
  // 沼水反光
  for (let i = 0; i < 4; i++) {
    const y = horizon + 12 + i * 14;
    const ox = Math.round((t * (0.02 + i * 0.005)) % (w + 120)) - 120;
    pxRect(g, ox, y, 84, 1, C.swampGlint, 0.16);
    pxRect(g, ox + 130, y + 4, 52, 1, C.swampGlint, 0.1);
  }
  // 左侧墓碑群离场
  for (const [x, gh] of [[30, 26], [80, 18], [140, 30], [200, 22]]) {
    const sx = x - pan;
    if (sx < -30) continue;
    pxRect(g, sx, horizon - gh, 14, gh, C.stoneDark, 0.95);
    pxRect(g, sx, horizon - gh, 14, 2, C.stoneLight, 0.5);
  }
  // 右侧教堂尖窗（视差慢移），彩窗逐格亮灯
  const cx = Math.round(400 - pan * 0.3);
  const bw = 72, top = horizon - 110;
  for (let i = 0; i < 7; i++) {
    const sw = Math.round(bw * (0.35 + i * 0.09));
    pxRect(g, cx - Math.round(sw / 2), top + i * 6, sw, 6, C.stoneDark, 0.95);
  }
  const litRows = Math.floor(clamp01((p - 0.35) / 0.5) * 5);
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 3; c++) {
      const lit = r < litRows;
      pxRect(g, cx - 22 + c * 15, top + 38 + r * 12, 11, 9,
        lit ? ((r + c) % 2 === 0 ? C.glassRed : C.glassBlue) : C.stoneDark, lit ? 0.8 : 0.6);
    }
  }
  // 吊钟轻摆
  const swing = Math.round(Math.sin(t * 0.0016) * 4);
  pxLine(g, cx - 90, 30, cx - 90 + swing, horizon - 100, C.brassDark, 0.7, 1);
  pxRect(g, cx - 90 + swing - 10, horizon - 100, 21, 4, C.brass, 0.85);
  pxRect(g, cx - 90 + swing - 7, horizon - 96, 15, 5, C.brassDark, 0.9);
  // 主角剪影前行（步行上下颠簸）
  const hx = Math.round(110 + p * 130);
  const hy = horizon + 26 + Math.round(Math.sin(t * 0.008) * 1.5);
  heroSilhouette(g, hx, hy, 1);
  // 雾带
  for (let i = 0; i < 2; i++) {
    const ox = Math.round(((t * (0.014 + i * 0.005) + i * 130) % (w + 200)) - 200);
    pxRect(g, ox, horizon - 10 + i * 8, 220, 3, C.fog, 0.06 + i * 0.02);
  }
  // 鬼火两点
  for (let i = 0; i < 2; i++) {
    const x = Math.round(260 + i * 60 + Math.sin(t * 0.003 + i) * 4);
    const y = Math.round(horizon - 24 - i * 10 + Math.sin(t * 0.004 + i) * 3);
    pxRect(g, x, y, 2, 2, accent, 0.5);
    pxRect(g, x + 1, y - 1, 1, 1, C.wispCore, 0.8);
  }
}

// 幕间 journey · 三幕：教堂彩窗在身后暗灭，镜头上摇，星纹垂落，王庭立柱与王座浮现。
function drawJourneyStar(g, { w, h, t, p, accent, stars }) {
  pxRect(g, 0, 0, w, h, C.starTileDark, 1);
  // 身后教堂彩窗暗灭（左侧小窗）
  const dim = 1 - clamp01(p / 0.4);
  if (dim > 0) {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 2; c++) {
        pxRect(g, 40 + c * 15, Math.round(h * 0.4) + r * 12, 11, 9,
          (r + c) % 2 === 0 ? C.glassRed : C.glassBlue, 0.55 * dim);
      }
    }
  }
  // 镜头上摇：地平线下移
  const horizon = Math.round(h * (0.55 + 0.2 * easeInOutCubic(p)));
  // 星点垂落
  for (const s of stars) {
    const y = Math.round((s.y + p * 36) % Math.max(20, horizon - 30));
    const tw = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * 0.002 + s.phase));
    pxRect(g, s.x, y, s.size, s.size, C.parchment, tw);
  }
  pxRect(g, 0, horizon, w, h - horizon, C.ink, 0.95);
  const a = clamp01((p - 0.3) / 0.5);
  if (a > 0) {
    // 两侧立柱
    for (const x of [100, 364]) {
      pxRect(g, x, horizon - 140, 16, 140, C.starTileDark, 0.95 * a);
      pxRect(g, x + 3, horizon - 140, 2, 140, C.runeDim, 0.35 * a);
      pxRect(g, x - 3, horizon - 144, 22, 5, C.shardStone, 0.9 * a);
    }
    // 王座
    pxRect(g, 190, horizon - 10, 100, 10, C.shardStone, 0.9 * a);
    pxRect(g, 204, horizon - 20, 72, 10, C.stoneDark, 0.9 * a);
    pxRect(g, 222, horizon - 70, 36, 50, C.stoneDark, 0.95 * a);
    pxRect(g, 227, horizon - 64, 26, 42, C.starTileLit, 0.7 * a);
    pxDiamond(g, 240, horizon - 44, 8, accent, 0.6 * a, true);
  }
  // 浮空碎星升起
  for (let i = 0; i < 5; i++) {
    const x = Math.round(140 + i * 50 + Math.sin(t * 0.0012 + i) * 7);
    const y = Math.round(horizon - 110 - p * 20 + Math.sin(t * 0.0018 + i * 1.9) * 6);
    pxDiamond(g, x, y, 3 + (i % 2), accent, 0.55 * a, i % 2 === 0);
  }
}

export const JOURNEY_STAGES = {
  swamp: drawJourneySwamp,
  star: drawJourneyStar,
};

// 结局镜头 1：三契尽解。与开场「三契钉入」同一组圣物，符环依次碎裂，圣物逐次暗成墨色。
function drawRelease(g, { w, h, t, p, accent }) {
  pxRect(g, 0, 0, w, h, C.nightDeep, 1);
  const baseY = Math.round(h * 0.68);
  pxRect(g, 0, baseY, w, h - baseY, C.ink, 0.95);
  pxRect(g, 0, baseY, w, 2, C.groove, 0.5);
  const centers = [Math.round(w / 2 - 150), Math.round(w / 2), Math.round(w / 2 + 150)];
  centers.forEach((cx, i) => {
    const breakAt = 0.12 + i * 0.26;
    const bp = clamp01((p - breakAt) / 0.3);
    const a = 1 - 0.68 * clamp01((p - breakAt) / 0.55);
    drawContractRelic(g, cx, baseY, i, a, accent);
    const cy = baseY - 80;
    if (bp <= 0) {
      drawSeal(g, { cx, cy, r: 28, t, accent, alpha: 0.8, spokes: 8, runes: false });
      pxDiamond(g, cx, cy, 3, accent, 0.9, true);
    } else {
      drawShatter(g, { cx, cy, r: 28, p: bp, accent, seed: 0x51c7 + i * 131 });
    }
  });
}

// 结局镜头 2：安静。祭坛刻格逆向逐格熄灭，脉流断绝，刻阵者立定，魂火 gutter 后熄灭。
function drawQuiet(g, { w, h, t, p, accent }) {
  pxRect(g, 0, 0, w, h, C.nightDeep, 1);
  const cell = 30, gap = 4, size = cell * 4 + gap * 3;
  // 竖屏字幕在 0.62H：祭坛整体上移，主角剪影别压住字幕
  const ox = Math.round(w / 2 - size / 2), oy = Math.round(h * (h > 400 ? 0.4 : 0.5) - size / 2);
  pxRect(g, ox - 10, oy - 10, size + 20, size + 20, C.stoneDark, 0.95);
  pxFrame(g, ox - 10, oy - 10, size + 20, size + 20, C.brassDark, 1, 0.7);
  const litCount = 16 - Math.floor(clamp01((p - 0.1) / 0.6) * 16);
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
  const hx = Math.round(w / 2), hy = Math.round(oy + size + 40);
  heroSilhouette(g, hx, hy, 1);
  if (p <= 0.85) {
    const flick = 0.4 + 0.6 * Math.abs(Math.sin(t * 0.02));
    const die = p > 0.7 ? 1 - (p - 0.7) / 0.15 : 1;
    pxDiamond(g, hx, hy - 22, 2, accent, clamp01(flick * die) * 0.9, true);
  }
  // 灰烬落定，逐渐稀下去
  for (let i = 0; i < 10; i++) {
    const x = (i * 53 + 17) % w;
    const y = Math.round(h * 0.3 + ((i * 29 + t * 0.008) % Math.max(20, Math.round(h * 0.5))));
    pxRect(g, x, y, 1, 1, C.mute, 0.25 * (1 - p * 0.6));
  }
}

// 结局镜头 3：黎明。星点淡出、陨星停息，硬边黄铜色带叠层升起，低日浮出地平线。
function drawDawn(g, { w, h, t, p, accent, stars }) {
  pxRect(g, 0, 0, w, h, C.void, 1);
  const starA = 1 - clamp01(p / 0.45);
  if (starA > 0) {
    for (const s of stars) {
      const tw = 0.3 + 0.4 * (0.5 + 0.5 * Math.sin(t * 0.002 + s.phase));
      pxRect(g, s.x, s.y, s.size, s.size, C.parchment, tw * starA);
    }
  }
  if (p < 0.25) {
    const mp = p / 0.25;
    const x = Math.round(w * (0.7 - mp * 0.3));
    const y = Math.round(30 + mp * h * 0.3);
    pxLine(g, x, y, x + 14, y + 22, C.runeCold, (1 - mp) * 0.6, 1);
  }
  // 竖屏字幕在 0.62H：地平线压低，低日与碑群别压住字幕
  const horizon = Math.round(h * (h > 400 ? 0.74 : 0.66));
  const rise = easeOutCubic(p);
  for (let i = 0; i < 7; i++) {
    const bh = Math.round(h * 0.5 * rise * ((7 - i) / 7));
    if (bh > 0) pxRect(g, 0, h - bh, w, bh, i < 2 ? C.brass : C.brassDark, 0.05 + i * 0.02);
  }
  const sunX = Math.round(w / 2);
  const sunY = Math.round(horizon - 10 - rise * 26);
  if (rise > 0) {
    pxDiamond(g, sunX, sunY, Math.round(10 + rise * 14), C.brassLight, 0.5 * rise, true);
    pxDiamond(g, sunX, sunY, Math.round(5 + rise * 7), C.parchment, 0.6 * rise, true);
  }
  pxRect(g, 0, horizon, w, h - horizon, C.ink, 0.9);
  pxRect(g, 0, horizon, w, 2, C.brass, 0.35 * rise);
  // 无人记得的碑，碑顶被晨光照亮
  for (const [x, gh] of [[80, 22], [160, 16], [330, 26], [420, 18]]) {
    pxRect(g, x, horizon - gh, 14, gh, C.stoneDark, 0.95);
    pxRect(g, x, horizon - gh, 14, 2, C.brassLight, 0.5 * rise);
  }
}

// 结局镜头 4：名单背景。夜空星点 + 一圈暗符环缓转；名单文字由 StoryScene 用 Text 滚动。
function drawCreditsBackdrop(g, { w, h, t, p, accent, stars }) {
  pxRect(g, 0, 0, w, h, C.void, 1);
  for (const s of stars) {
    const tw = 0.2 + 0.3 * (0.5 + 0.5 * Math.sin(t * 0.002 + s.phase));
    pxRect(g, s.x, s.y, s.size, s.size, C.parchment, tw);
  }
  drawSeal(g, {
    cx: Math.round(w / 2), cy: Math.round(h * 0.45), r: 100, t, accent,
    alpha: 0.14, spokes: 8, runes: false, core: false,
  });
  const baseY = Math.round(h * 0.86);
  pxRect(g, 0, baseY, w, h - baseY, C.ink, 0.9);
  pxRect(g, 0, baseY, w, 1, C.groove, 0.4);
}

export const ENDING_STAGES = {
  release: drawRelease,
  quiet: drawQuiet,
  dawn: drawDawn,
  credits: drawCreditsBackdrop,
};