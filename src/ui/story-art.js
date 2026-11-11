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

// 七契的等距排布：480 宽下每档 62px，竖屏同宽同档距，保证构图语言不变。
function contractCenter(w, i) {
  const span = Math.min(70, Math.round(w * 0.13));
  return Math.round(w / 2 + (i - 3) * span);
}

// 镜头 2：七契钉入。七座小舞台由左至右依次亮起契约符环。
function drawContracts(g, { w, h, t, p, accent }) {
  pxRect(g, 0, 0, w, h, C.nightDeep, 1);
  const baseY = Math.round(h * 0.68);
  pxRect(g, 0, baseY, w, h - baseY, C.ink, 0.95);
  pxRect(g, 0, baseY, w, 2, C.groove, 0.5);
  for (let i = 0; i < 7; i++) {
    const cx = contractCenter(w, i);
    const lit = clamp01(p * 6.6 - i * 0.85);
    const a = 0.35 + 0.65 * lit;
    drawContractRelic(g, cx, baseY, i, a, accent);
    if (lit > 0) {
      drawSeal(g, { cx, cy: baseY - 62, r: 18, t, accent, alpha: lit * 0.8, spokes: 8, runes: false });
      pxDiamond(g, cx, baseY - 62, 3, accent, lit * 0.9, true);
    }
  }
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

// 幕间 journey · 四幕：沉钟书库。整面书架墙缓缓退去，铜钟垂在中景轻摆，书页逆光翻飞。
function drawJourneyLibrary(g, { w, h, t, p, accent, stars }) {
  pxRect(g, 0, 0, w, h, 0x0e1220, 1);
  const horizon = Math.round(h * 0.6);
  const pan = Math.round(p * 150);
  // 顶部暖光带：书库唯一的光源在顶上
  pxRect(g, 0, 0, w, 6, C.brassDark, 0.5);
  // 远层书架墙：连续铺满整面墙（视差慢），只留书脊的色块节奏，不逐本画
  for (let i = -1; i < 8; i++) {
    const bx = Math.round(i * 74 - (pan * 0.25) % 74);
    const bh2 = 96 + ((i + 4) % 3) * 14;
    pxRect(g, bx, horizon - bh2, 66, bh2, 0x0b0f1b, 0.85);
    pxRect(g, bx, horizon - bh2, 2, bh2, 0x3a2f14, 0.7);
    for (let r = 0; r < 3; r++) {
      const ry = horizon - bh2 + 10 + r * Math.round((bh2 - 16) / 3);
      pxRect(g, bx + 4, ry + 14, 58, 1, C.brassDark, 0.3);
      for (let k = 0; k < 4; k++) {
        pxRect(g, bx + 5 + k * 15, ry, 12 + ((k + r) % 3) * 2, 14, k % 2 ? 0x263a52 : 0x2c3f2c, 0.55);
      }
    }
  }
  // 近层书架：两排，落地并带基座与投影（书架必须「立」在地平线上，不能悬空）
  const shelf = (sx, sy, sw2, sh2) => {
    pxRect(g, sx, sy, sw2, sh2, 0x141a2c, 0.97);
    pxRect(g, sx, sy, 2, sh2, C.brassDark, 0.9);
    pxRect(g, sx + sw2 - 2, sy, 2, sh2, C.brassDark, 0.9);
    pxRect(g, sx - 3, sy - 3, sw2 + 6, 4, 0x141a2c, 1);
    pxRect(g, sx - 3, sy - 3, sw2 + 6, 1, C.brassDark, 0.8);
    pxRect(g, sx - 3, horizon - 4, sw2 + 6, 4, C.brassDark, 0.75);
    for (let r = 0; r < 3; r++) {
      const ry = sy + 9 + r * Math.round((sh2 - 14) / 3);
      pxRect(g, sx + 3, ry + 13, sw2 - 6, 1, C.brassDark, 0.5);
      for (let k = 0; k < 5; k++) {
        const bw2 = 7 + ((r + k) % 3);
        pxRect(g, sx + 5 + k * 11, ry + 13 - 13, bw2, 13, k % 2 ? 0x3f5a3a : 0x2f4560, 0.9);
      }
    }
    // 落地投影：贴地平线的一条暗带，给书架「重量」
    pxRect(g, sx - 6, horizon - 1, sw2 + 12, 3, C.void, 0.45);
    pxRect(g, sx - 10, horizon + 2, sw2 + 20, 1, C.brass, 0.1);
  };
  shelf(-pan, horizon - 150, 60, 150);
  shelf(78 - Math.round(pan * 0.75), horizon - 128, 52, 128);
  shelf(w - 118 - Math.round(pan * 0.4), horizon - 140, 56, 140);
  pxRect(g, 0, horizon, w, h - horizon, C.ink, 0.95);
  pxRect(g, 0, horizon, w, 2, C.brassDark, 0.4);
  // 吊钟：轻摆
  const bx = Math.round(w * 0.62), by = horizon - 96;
  const swing = Math.round(Math.sin(t * 0.0016) * 5);
  pxRect(g, bx, 6, 1, by - 12, C.brassDark, 0.7);
  pxRect(g, bx + swing - 2, by - 12, 5, 5, C.brassDark, 0.95);
  pxRect(g, bx + swing - 12, by - 7, 25, 5, C.brass, 0.9);
  pxRect(g, bx + swing - 15, by - 2, 31, 4, C.brassDark, 0.95);
  pxRect(g, bx + swing - 9, by + 2, 19, 4, C.brassDark, 0.95);
  pxRect(g, bx + swing, by + 6, 2, 4, C.brassLight, 0.8);
  // 翻飞书页
  for (let i = 0; i < 8; i++) {
    const px2 = Math.round(((i * 67 + t * 0.03 + p * 30) % (w + 40)) - 20);
    const py = Math.round(horizon - 26 - ((i * 31 + t * 0.012) % 104));
    pxRect(g, px2, py, 5, 4, C.parchment, 0.6);
    pxRect(g, px2, py + 3, 5, 1, 0x8a7a5a, 0.65);
    pxRect(g, px2 - 5, py + 1, 3, 1, C.parchment, 0.22);
  }
  const hx = Math.round(110 + p * 140);
  const hy = horizon + 26 + Math.round(Math.sin(t * 0.008) * 1.5);
  heroSilhouette(g, hx, hy, 1);
  // 地面：木地板缝 + 书架漏下的暖光
  for (let i = 1; i <= 3; i++) pxRect(g, 0, horizon + i * Math.round((h - horizon) / 4), w, 1, C.brassDark, 0.12);
  for (let i = 0; i < 3; i++) {
    const ox = Math.round(((t * (0.014 + i * 0.004) + i * 150) % (w + 220)) - 220);
    pxRect(g, ox, horizon + 12 + i * 14, 120, 2, C.brass, 0.07);
  }
  if (stars) for (const s2 of stars.slice(0, 8)) pxRect(g, s2.x, Math.round(s2.y * 0.2), 1, 1, C.parchment, 0.25);
}

// 幕间 journey · 五幕：衡律法庭。大理石列柱向后退去，天平在中景称量，判词石碑擦身而过。
function drawJourneyCourt(g, { w, h, t, p, accent, stars }) {
  pxRect(g, 0, 0, w, h, 0x1a1c22, 1);
  const horizon = Math.round(h * 0.62);
  const pan = Math.round(p * 170);
  // 冷光高窗：细长斜切光柱（不是整块灰板），光落在柱间
  for (let i = 0; i < 4; i++) {
    const ox = 30 + i * 118 - Math.round(pan * 0.18);
    for (let k = 0; k < 3; k++) {
      pxRect(g, ox + k * 14, 0, 9, Math.round(h * (0.34 - k * 0.06)), 0x9aa1ad, 0.05 + k * 0.015);
    }
  }
  pxRect(g, 0, horizon, w, h - horizon, C.ink, 0.95);
  // 后墙护壁：横向石缝 + 竖向壁柱，先把墙面填满
  for (let i = 1; i <= 4; i++) pxRect(g, 0, Math.round(horizon * i / 5), w, 1, 0x9aa1ad, 0.06);
  for (let i = -1; i < 7; i++) {
    const px2 = Math.round(i * 82 - (pan * 0.3) % 82);
    pxRect(g, px2, horizon - 132, 3, 132, 0x22262d, 0.9);
    pxRect(g, px2, horizon - 132, 1, 132, 0x9aa1ad, 0.18);
  }
  // 列柱（远处慢、近处快），带柱头柱础与柱身凹槽
  const col = (cx, cw, chh, k2) => {
    pxRect(g, cx - cw, horizon - chh, cw * 2, chh, 0x3a3f48, 0.97 * k2);
    pxRect(g, cx - cw + 1, horizon - chh + 4, 2, Math.max(1, chh - 8), 0x9aa1ad, 0.45 * k2);
    pxRect(g, cx + cw - 3, horizon - chh + 4, 2, Math.max(1, chh - 8), 0x14161b, 0.6 * k2);
    for (let f = -cw + 5; f < cw - 4; f += 5) pxRect(g, cx + f, horizon - chh + 8, 1, Math.max(1, chh - 16), 0x2a2e36, 0.6 * k2);
    pxRect(g, cx - cw - 5, horizon - chh, cw * 2 + 10, 5, 0x4a505c, 0.97 * k2);
    pxRect(g, cx - cw - 5, horizon - chh, cw * 2 + 10, 1, 0xb8bec9, 0.7 * k2);
    pxRect(g, cx - cw - 5, horizon - 6, cw * 2 + 10, 6, 0x4a505c, 0.97 * k2);
    pxRect(g, cx - cw - 8, horizon - 1, cw * 2 + 16, 2, C.void, 0.4);
  };
  col(52 - pan, 12, 150, 0.85);
  col(196 - Math.round(pan * 0.8), 13, 162, 0.95);
  col(w - 26 - Math.round(pan * 0.5), 12, 148, 0.85);
  col(w + 108 - Math.round(pan * 0.5), 13, 160, 0.95);
  // 天平：横梁随 t 轻倾，两只托盘要有重量感
  const sx = Math.round(w * 0.56);
  const tilt = Math.round(Math.sin(t * 0.0018) * 4);
  pxRect(g, sx - 4, horizon - 66, 9, 96, 0x9aa1ad, 0.92);
  pxRect(g, sx - 4, horizon - 66, 9, 2, 0xb8bec9, 0.85);
  pxRect(g, sx - 8, horizon + 28, 17, 4, 0x4a505c, 0.95);
  pxRect(g, sx - 48, horizon - 70 + tilt, 97, 3, 0x9aa1ad, 0.95);
  for (const dir of [-1, 1]) {
    const ex = sx + dir * 46;
    const ey = horizon - 67 + (dir < 0 ? tilt : -tilt);
    pxRect(g, ex, ey, 1, 14, 0x8f95a1, 0.7);
    pxRect(g, ex - 13, ey + 14, 27, 3, 0x9aa1ad, 0.97);
    pxRect(g, ex - 13, ey + 17, 27, 3, 0x14161b, 0.85);
    pxRect(g, ex - 13, ey + 17, 27, 1, C.bloodDark, 0.55);
  }
  pxDiamond(g, sx, horizon - 78, 5, accent, 0.75, true);
  pxRect(g, sx - 1, horizon - 86, 3, 8, accent, 0.5);
  // 判词石碑：三块，左右近景擦身而过
  for (const [bx, bw2, bh2, k] of [[24, 22, 42, 1], [150, 16, 30, 0.7], [w - 34, 20, 36, 0.6]]) {
    const sx2 = Math.round(bx - pan * k);
    if (sx2 < -46 || sx2 > w + 46) continue;
    pxRect(g, sx2, horizon - bh2, bw2, bh2, 0x3a3f48, 0.97);
    pxRect(g, sx2, horizon - bh2, 1, bh2, 0x9aa1ad, 0.6);
    pxRect(g, sx2 + bw2 - 1, horizon - bh2, 1, bh2, 0x14161b, 0.7);
    pxRect(g, sx2 - 2, horizon - 3, bw2 + 4, 3, 0x2a2e36, 0.97);
    for (let r = 0; r < 3; r++) pxRect(g, sx2 + 3, horizon - bh2 + 8 + r * 7, Math.max(2, bw2 - 6 - (r % 2) * 4), 1, C.blood, 0.65);
  }
  // 地面：石砖缝 + 天平落影
  for (let i = 1; i <= 3; i++) pxRect(g, 0, horizon + i * Math.round((h - horizon) / 4), w, 1, 0x9aa1ad, 0.09);
  pxRect(g, sx - 30, horizon + 30, 60, 2, C.void, 0.4);
  const hx = Math.round(120 + p * 130);
  const hy = horizon + 30 + Math.round(Math.sin(t * 0.008) * 1.5);
  heroSilhouette(g, hx, hy, 1);
  for (let i = 0; i < 2; i++) {
    const ox = Math.round(((t * (0.012 + i * 0.004) + i * 140) % (w + 200)) - 200);
    pxRect(g, ox, horizon - 12 + i * 8, 220, 3, C.fog, 0.05 + i * 0.02);
  }
}

// 幕间 journey · 六幕：熔星锻炉。炉墙在后，炉膛燃着，铁砧在中，吊链与火星向上飘。
function drawJourneyForge(g, { w, h, t, p, accent, stars }) {
  pxRect(g, 0, 0, w, h, 0x151010, 1);
  const horizon = Math.round(h * 0.63);
  const pan = Math.round(p * 140);
  // 炉光把上半部暖开：三层硬边色带（不做渐变）
  pxRect(g, 0, 0, w, Math.round(h * 0.5), 0x5a2410, 0.14);
  pxRect(g, 0, Math.round(h * 0.3), w, Math.round(h * 0.2), 0x8a2f10, 0.06);
  // 后墙：砖缝 + 烟囱
  for (let i = 1; i <= 5; i++) pxRect(g, 0, Math.round(horizon * i / 6), w, 1, 0x4a3a30, 0.2);
  for (let i = -1; i < 8; i++) {
    const bx2 = Math.round(i * 66 - (pan * 0.2) % 66);
    pxRect(g, bx2, horizon - 150, 2, 150, 0x241b17, 0.8);
  }
  pxRect(g, 0, horizon, w, h - horizon, C.ink, 0.95);
  pxRect(g, 0, horizon, w, 2, 0xa8491c, 0.35);
  // 主炉膛（左侧，随镜头左移）
  const fx = Math.round(96 - pan * 0.7);
  const fy = horizon - 104;
  pxRect(g, fx - 52, fy - 8, 104, 112, 0x1c1512, 0.97);
  pxRect(g, fx - 52, fy - 8, 104, 3, 0x4a3a30, 0.9);
  pxRect(g, fx - 42, fy + 12, 84, 92, 0x0b0705, 0.97);
  const flick = Math.round(Math.sin(t * 0.006) * 2);
  pxRect(g, fx - 36, fy + 18 + flick, 72, 82, 0x8a2f10, 0.92);
  pxRect(g, fx - 26, fy + 26 + flick, 52, 66, C.arcane, 0.92);
  pxRect(g, fx - 13, fy + 36 + flick, 26, 46, C.arcaneLight, 0.88);
  pxRect(g, fx - 4, fy + 46 + flick, 9, 24, C.white, 0.9);
  // 副炉膛（右侧，小而暗，让整面墙都像在烧）
  const gx = Math.round(w - 54 - pan * 0.35);
  pxRect(g, gx - 34, horizon - 76, 68, 76, 0x1c1512, 0.9);
  pxRect(g, gx - 26, horizon - 62, 52, 62, 0x0b0705, 0.92);
  pxRect(g, gx - 20, horizon - 56 + flick, 40, 56, 0x8a2f10, 0.8);
  pxRect(g, gx - 12, horizon - 46 + flick, 24, 46, C.arcane, 0.7);
  pxRect(g, gx - 5, horizon - 34 + flick, 11, 34, C.arcaneLight, 0.7);
  // 铁砧（中景，砧面 + 砧角 + 墩身）
  const ax = Math.round(w * 0.54 - pan * 0.25), ay = horizon + 30;
  pxRect(g, ax - 30, ay - 16, 61, 16, 0x3a3230, 0.97);
  pxRect(g, ax - 30, ay - 34, 61, 12, 0x55504c, 0.97);
  pxRect(g, ax - 30, ay - 34, 61, 2, 0x9a8f84, 0.9);
  pxRect(g, ax - 30, ay - 34, 61, 1, C.arcaneLight, 0.35);
  pxRect(g, ax - 42, ay - 30, 13, 7, 0x55504c, 0.97);
  pxRect(g, ax - 42, ay - 30, 13, 1, 0x9a8f84, 0.6);
  pxRect(g, ax - 10, ay - 22, 21, 7, 0x3a3230, 0.92);
  pxRect(g, ax - 34, ay - 1, 69, 2, C.void, 0.5);
  // 吊链：链环交替，末端挂料
  for (const [lx, len2] of [[w * 0.28, 70], [w * 0.74, 92], [w * 0.92, 54]]) {
    const lx2 = Math.round(lx - pan * 0.4);
    for (let i = 0; i < len2; i += 7) pxRect(g, lx2 - (i % 14 === 0 ? 0 : 2), i + 4, i % 14 === 0 ? 7 : 4, 6, 0x6b5a52, 0.85);
    pxRect(g, lx2 - 8, len2 + 4, 17, 3, 0x4a3a30, 0.9);
    pxRect(g, lx2 - 4, len2 + 7, 9, 5, 0x2a2422, 0.9);
  }
  // 火星上升
  for (let i = 0; i < 12; i++) {
    const px2 = Math.round(fx + Math.sin(t * 0.003 + i) * (26 + i * 2));
    const py = Math.round(fy + 30 - ((i * 41 + t * 0.05) % 120));
    pxRect(g, px2, py, i % 4 === 0 ? 2 : 1, i % 4 === 0 ? 2 : 1, i % 3 === 0 ? C.arcaneLight : C.arcane, 0.45 + (i % 3) * 0.15);
  }
  const hx = Math.round(120 + p * 130);
  const hy = horizon + 30 + Math.round(Math.sin(t * 0.008) * 1.5);
  heroSilhouette(g, hx, hy, 1);
  pxRect(g, hx + 3, hy - 14, 1, 8, C.arcane, 0.45);
  // 地面：铁板缝 + 炉火倒影
  for (let i = 1; i <= 3; i++) pxRect(g, 0, horizon + i * Math.round((h - horizon) / 4), w, 1, 0x4a3a30, 0.16);
  for (let i = 0; i < 5; i++) pxRect(g, 30 + i * 96, horizon + 18 + (i % 3) * 12, 34, 2, C.arcane, 0.1);
}

// 幕间 journey · 七幕：破晓之座。七颗星连成勺形，黎明从地平线漫上来，断裂王座在晨光里显影。
function drawJourneySunrise(g, { w, h, t, p, accent, stars }) {
  pxRect(g, 0, 0, w, h, 0x120e22, 1);
  const starA = 1 - clamp01(p / 0.7) * 0.6;
  if (stars) {
    for (const s2 of stars) {
      const tw = 0.3 + 0.4 * (0.5 + 0.5 * Math.sin(t * 0.002 + s2.phase));
      pxRect(g, s2.x, s2.y, s2.size, s2.size, C.parchment, tw * starA);
    }
  }
  const horizon = Math.round(h * (0.74 - 0.14 * easeInOutCubic(p)));
  const rise = easeOutCubic(p);
  // 天空下沿的黎明辉光：贴近地平线的几条硬边薄带，越往上越淡
  for (let i = 0; i < 5; i++) {
    const bh = 2 + i * 4;
    pxRect(g, 0, horizon - bh, w, 2 + i, i === 0 ? C.brassLight : C.brass, (0.2 - i * 0.035) * (0.4 + rise * 0.6));
  }
  // 低日：只露出上半的菱形，贴着地平线往上升
  const sunR = Math.round(11 + rise * 12);
  pxDiamond(g, Math.round(w * 0.27), horizon - Math.round(rise * 6), sunR, C.brassLight, 0.5 * rise + 0.12, true);
  pxDiamond(g, Math.round(w * 0.27), horizon - Math.round(rise * 6), Math.round(sunR * 0.55), C.parchment, 0.55 * rise + 0.12, true);
  // 七颗星连成勺形：节点按进度逐个点亮
  const nodes = [
    [0.1, 0.16], [0.22, 0.11], [0.34, 0.08], [0.45, 0.07],
    [0.42, 0.2], [0.57, 0.24], [0.63, 0.13],
  ].map(([u, v]) => ({ x: Math.round(u * w), y: Math.round(v * h) }));
  const links = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]];
  const lit = clamp01(p / 0.5);
  if (lit > 0) {
    for (const [a, b] of links) {
      thinLine(g, nodes[a].x, nodes[a].y, nodes[b].x, nodes[b].y, C.brassDark, 0.5 * lit);
    }
  }
  nodes.forEach((nd, i) => {
    const k = clamp01(p * 9 - i * 1.1);
    if (k <= 0) return;
    pxDiamond(g, nd.x, nd.y, i === 6 ? 4 : 3, accent, k * 0.9, true);
    pxRect(g, nd.x, nd.y - 6, 1, 2, C.white, 0.7 * k);
  });
  // 地面：暗紫前景 + 地平线金边
  pxRect(g, 0, horizon, w, h - horizon, C.ink, 0.96);
  pxRect(g, 0, horizon, w, 2, C.brassLight, 0.5 * (0.4 + rise * 0.6));
  for (let i = 1; i <= 3; i++) pxRect(g, 0, horizon + i * Math.round((h - horizon) / 4), w, 1, 0x2b2447, 0.5);
  // 地平线上的断柱残影：填住两侧的空
  for (const [bx2, bh2] of [[26, 26], [68, 15], [w - 58, 22], [w - 24, 12]]) {
    pxRect(g, bx2, horizon - bh2, 13, bh2, 0x1d1733, 0.95);
    pxRect(g, bx2, horizon - bh2, 13, 1, C.brass, 0.35);
    pxRect(g, bx2, horizon - bh2, 1, bh2, C.brassLight, 0.18);
  }
  // 断裂王座：随进度显影，断面做成阶梯
  const tx = Math.round(w * 0.56);
  const ty = horizon;
  const ta = clamp01((p - 0.2) / 0.5);
  if (ta > 0) {
    pxRect(g, tx - 44, ty - 16, 89, 16, 0x2b2447, 0.97 * ta);
    pxRect(g, tx - 44, ty - 16, 89, 2, C.brassLight, 0.55 * ta);
    pxRect(g, tx - 30, ty - 68, 40, 52, 0x1d1733, 0.97 * ta);
    pxRect(g, tx - 30, ty - 68, 2, 52, C.brassLight, 0.45 * ta);
    // 右上角的断裂阶梯
    pxRect(g, tx + 10, ty - 68, 22, 12, C.void, 0.95 * ta);
    pxRect(g, tx + 10, ty - 56, 14, 9, C.void, 0.95 * ta);
    pxRect(g, tx + 10, ty - 47, 7, 6, C.void, 0.95 * ta);
    pxRect(g, tx - 30, ty - 68, 40, 2, C.brassLight, 0.45 * ta);
    pxRect(g, tx + 34, ty - 66, 6, 4, 0x1d1733, 0.85 * ta);
    pxRect(g, tx + 44, ty - 76, 4, 4, 0x1d1733, 0.6 * ta);
    pxRect(g, tx - 44, ty - 30, 8, 14, 0x2b2447, 0.97 * ta);
    pxRect(g, tx + 36, ty - 26, 8, 10, 0x2b2447, 0.97 * ta);
    pxDiamond(g, tx - 10, ty - 46, 5, accent, 0.7 * ta, true);
    pxRect(g, tx - 10, ty - 52, 1, 4, C.white, 0.6 * ta);
    pxRect(g, tx - 48, ty - 1, 97, 2, C.void, 0.5 * ta);
  }
  const hx = Math.round(110 + p * 150);
  const hy = horizon + 28 + Math.round(Math.sin(t * 0.008) * 1.5);
  heroSilhouette(g, hx, hy, 1);
  for (let i = 0; i < 8; i++) {
    const px2 = Math.round((i * 73 + t * 0.02) % w);
    const py = Math.round(horizon - 30 - ((i * 33 + t * 0.01) % 90));
    pxRect(g, px2, py, 1, 1, C.brassLight, 0.3);
  }
}

export const JOURNEY_STAGES = {
  swamp: drawJourneySwamp,
  star: drawJourneyStar,
  library: drawJourneyLibrary,
  court: drawJourneyCourt,
  forge: drawJourneyForge,
  sunrise: drawJourneySunrise,
};

// 结局镜头 1：七契尽解。与开场「七契钉入」同一组圣物，符环依次碎裂，圣物逐次暗成墨色。
function drawRelease(g, { w, h, t, p, accent }) {
  pxRect(g, 0, 0, w, h, C.nightDeep, 1);
  const baseY = Math.round(h * 0.68);
  pxRect(g, 0, baseY, w, h - baseY, C.ink, 0.95);
  pxRect(g, 0, baseY, w, 2, C.groove, 0.5);
  for (let i = 0; i < 7; i++) {
    const cx = contractCenter(w, i);
    const breakAt = 0.08 + i * 0.115;
    const bp = clamp01((p - breakAt) / 0.3);
    const a = 1 - 0.68 * clamp01((p - breakAt) / 0.55);
    drawContractRelic(g, cx, baseY, i, a, accent);
    const cy = baseY - 62;
    if (bp <= 0) {
      drawSeal(g, { cx, cy, r: 18, t, accent, alpha: 0.8, spokes: 8, runes: false });
      pxDiamond(g, cx, cy, 3, accent, 0.9, true);
    } else {
      drawShatter(g, { cx, cy, r: 18, p: bp, accent, seed: 0x51c7 + i * 131 });
    }
  }
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