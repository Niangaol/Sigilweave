// journey 六幕：三层静态布景（create 时预绘制一次）与逐帧动态件。
// 静态层只画「不动的东西」；钟摆/翻页/火星/晨光带等留给 JOURNEY_STAGES 每帧绘制。
// 全部硬边整数坐标、固定种子；禁用 Math.random、渐变与模糊。
import { C, pxRect, pxDiamond, pxFrame, pxLine } from './Palette.js';
import { clamp01, easeInOutCubic, makeRng, thinLine } from './cinematic-art.js';
import {
  fill, courses, ashlar, pointedArch, archWindow, column, beam, planks, steps, cracks, moss,
  rubble, water, starfield, chain, silhouette, roundArch, candle, disc, ring, ellipseRing,
} from './diorama-kit.js';

const R = Math.round;
// 两色插值：派生明暗层次用，避免在文件里散落十六进制字面量。
function mix(a, b, t) {
  const q = t < 0 ? 0 : t > 1 ? 1 : t;
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (R(ar + (br - ar) * q) << 16) | (R(ag + (bg - ag) * q) << 8) | R(ab + (bb - ab) * q);
}

// 三层视差位移：远景几乎不动，近景滑得最多（保证长镜头横移的方向感）。
export const JOURNEY_PARALLAX = { back: 12, mid: 30, fore: 52 };
export function journeyPan(p) {
  const q = clamp01(p);
  return {
    back: R(q * JOURNEY_PARALLAX.back),
    mid: R(q * JOURNEY_PARALLAX.mid),
    fore: R(q * JOURNEY_PARALLAX.fore),
  };
}

// 主角剪影（与 story-art 的 heroSilhouette 同形；此处本地实现避免循环依赖）。
function hero(g, x, y, a = 1) {
  const ix = R(x), iy = R(y);
  pxRect(g, ix - 3, iy - 14, 6, 10, C.ink, a);
  pxDiamond(g, ix, iy - 17, 3, C.ink, a, true);
  pxRect(g, ix - 4, iy - 6, 8, 4, C.stoneDark, 0.8 * a);
  pxRect(g, ix - 1, iy - 16, 2, 1, C.brassLight, 0.9 * a);
}

// ---------- 布局：静态层与动态件共用同一套锚点 ----------
export function journeyLayout(stage, w, h) {
  const tall = h > 400;
  const u = tall ? 1.35 : 1;
  const horizon = R(h * (tall ? 0.54 : 0.58));
  const ground = R(h * (tall ? 0.72 : 0.80));
  const cx = R(w / 2);
  const L = {
    stage, w, h, tall, u, horizon, ground, cx,
    B: 64, accent: 0x7cc9a8,
    walkY: R(h * (tall ? 0.83 : 0.88)),
    eyeY: R(h * 0.42),
  };
  if (stage === 'swamp') {
    L.bellX = R(w * 0.47);
    L.bellY = R(h * (tall ? 0.26 : 0.27));
    L.roseX = R(w * 0.70);
    L.roseY = R(h * (tall ? 0.37 : 0.38));
    L.roseR = R(19 * (tall ? 1.35 : 1));
    L.lancet1X = R(w * 0.17);
    L.lancet2X = R(w * 0.36);
    L.winBaseY = horizon - R(4 * u);
    L.walkY = R(h * (tall ? 0.83 : 0.88));
  } else if (stage === 'star') {
    L.throneX = R(w * 0.56);
    L.ringX = R(w * 0.50);
    L.ringY = R(h * (tall ? 0.24 : 0.30));
    L.ringR = R(46 * (tall ? 1.25 : 1));
    L.craterX = R(w * 0.80);
    L.craterY = R(h * (tall ? 0.70 : 0.76));
    L.walkY = R(h * (tall ? 0.82 : 0.86));
  } else if (stage === 'library') {
    L.bellX = R(w * 0.62);
    L.bellY = R(h * (tall ? 0.20 : 0.17));
    L.deskX = R(w * 0.72);
    L.deskY = R(h * (tall ? 0.73 : 0.78));
    L.chandX = R(w * 0.40);
    L.chandY = R(h * (tall ? 0.24 : 0.20));
    L.walkY = R(h * (tall ? 0.81 : 0.85));
  } else if (stage === 'court') {
    L.balX = R(w * 0.56);
    L.balY = R(h * (tall ? 0.40 : 0.44));
    L.balH = R(28 * u);
    L.railY = R(h * (tall ? 0.68 : 0.70));
    L.railH = R(18 * u);
    L.steleXs = [R(w * 0.25), R(w * 0.50), R(w * 0.75)];
    L.walkY = R(h * (tall ? 0.84 : 0.87));
  } else if (stage === 'forge') {
    L.forgeX = R(w * 0.42);
    L.forgeY = R(h * (tall ? 0.56 : 0.58));
    L.forgeW = R(w * 0.17);
    L.forgeH = R(h * (tall ? 0.30 : 0.28));
    L.anvilX = R(w * 0.56);
    L.anvilY = R(h * (tall ? 0.64 : 0.66));
    L.hamX = R(w * 0.47);
    L.hamY = R(h * (tall ? 0.22 : 0.20));
    L.tankX = R(w * 0.74);
    L.tankY = R(h * (tall ? 0.70 : 0.73));
    L.walkY = R(h * (tall ? 0.84 : 0.88));
  } else {
    L.throneX = R(w * 0.56);
    L.throneY = ground;
    L.beamY = [R(h * (tall ? 0.14 : 0.12)), R(h * (tall ? 0.19 : 0.16)), R(h * (tall ? 0.24 : 0.20))];
    L.dip = [
      [R(w * 0.10), R(h * (tall ? 0.13 : 0.15))], [R(w * 0.22), R(h * (tall ? 0.09 : 0.11))],
      [R(w * 0.34), R(h * (tall ? 0.07 : 0.09))], [R(w * 0.45), R(h * (tall ? 0.06 : 0.08))],
      [R(w * 0.42), R(h * (tall ? 0.17 : 0.19))], [R(w * 0.57), R(h * (tall ? 0.21 : 0.23))],
      [R(w * 0.63), R(h * (tall ? 0.11 : 0.13))],
    ];
    L.walkY = R(h * (tall ? 0.83 : 0.87));
  }
  return L;
}

// ---------- 通用小件 ----------
function deadTree(g, x, baseY, th, color, alpha, seed = 1) {
  const rng = makeRng(seed);
  pxRect(g, R(x) - 1, R(baseY - th), 3, R(th), color, alpha);
  for (let i = 0; i < 5; i++) {
    const yy = R(baseY - th + th * (0.1 + i * 0.16));
    const dir = i % 2 ? 1 : -1;
    pxLine(g, R(x), yy, R(x + dir * (5 + rng() * 9)), yy - R(3 + rng() * 7), color, alpha * 0.9, 1);
  }
  pxLine(g, R(x), R(baseY - th + 4), R(x - 5), R(baseY - th - 5), color, alpha * 0.8, 1);
}

function tower(g, cx2, baseY, w, h, color, alpha) {
  for (let i = 0; i < 6; i++) {
    const sw = R(w * (1 - i * 0.13));
    pxRect(g, cx2 - sw / 2, baseY - h + i * R(h / 6), sw, R(h / 6), color, alpha);
    pxRect(g, cx2 - sw / 2, baseY - h + i * R(h / 6), 1, R(h / 6), C.stoneLight, 0.18 * alpha);
  }
  // 垛口 + 尖顶
  for (let i = 0; i < 3; i++) pxRect(g, cx2 - R(w * 0.32) + i * R(w * 0.26), baseY - h - 4, R(w * 0.12), 4, color, alpha);
  silhouette(g, [{ x: cx2 - 2, y: baseY - h - 14 }, { x: cx2 + 2, y: baseY - h - 14 }, { x: cx2, y: baseY - h - 2 }], color, alpha);
}

function grave(g, x, baseY, kind, s, color, alpha) {
  const w = R(12 * s), hh = R(22 * s);
  if (kind === 0) {
    pxRect(g, R(x - w / 2), R(baseY - hh), w, hh, color, alpha);
    pxRect(g, R(x - w / 2), R(baseY - hh), w, 1, C.stoneLight, 0.5 * alpha);
    pxRect(g, R(x - w / 2 - 2), R(baseY - 2), w + 4, 2, C.stoneDark, alpha);
    pxRect(g, R(x - 2), R(baseY - hh + 4), 4, 1, C.ink, 0.5 * alpha);
  } else if (kind === 1) {
    pxRect(g, R(x - 1), R(baseY - hh - 4), 3, hh + 4, color, alpha);
    pxRect(g, R(x - 6), R(baseY - hh + 4), 13, 3, color, alpha);
    pxRect(g, R(x - w / 2 - 2), R(baseY - 2), w + 4, 2, C.stoneDark, alpha);
  } else {
    pxRect(g, R(x - 3), R(baseY - hh), 7, hh, color, alpha);
    pxRect(g, R(x - 5), R(baseY - 8), 11, 3, color, alpha);
    pxRect(g, R(x - 6), R(baseY - 3), 13, 3, C.stoneDark, alpha);
    pxRect(g, R(x - 1), R(baseY - hh + 6), 1, 8, C.ink, 0.45 * alpha);
  }
}

function bookWall(g, x, y, w, h, rows, seed, alpha = 1) {
  fill(g, x, y, w, h, 0x121726, alpha);
  pxRect(g, R(x), R(y), 1, R(h), C.brassDark, 0.7 * alpha);
  pxRect(g, R(x + w) - 1, R(y), 1, R(h), C.brassDark, 0.7 * alpha);
  const rng = makeRng(seed);
  const rowH = h / rows;
  for (let r = 0; r < rows; r++) {
    const sy = y + r * rowH;
    const bot = sy + rowH - 3;
    pxRect(g, R(x + 2), R(bot), R(w - 4), 2, C.brassDark, 0.55 * alpha);
    pxRect(g, R(x + 2), R(sy + 1), R(w - 4), 1, C.void, 0.5 * alpha);
    let bx = x + 3;
    while (bx < x + w - 4) {
      const bw = 2 + Math.floor(rng() * 2);
      if (rng() > 0.20) {
        const bh = R(4 + rng() * Math.min(rowH - 8, rowH * 0.55));
        const col = rng() > 0.72 ? C.brassDark : rng() > 0.5 ? 0x3f5a3a : rng() > 0.4 ? 0x2f4560 : 0x543c3c;
        pxRect(g, R(bx), R(bot - bh), bw, bh, col, 0.9 * alpha);
        if (rng() > 0.86) pxRect(g, R(bx), R(bot - bh), 1, bh, C.parchment, 0.18 * alpha);
      } else {
        pxRect(g, R(bx), R(bot - 6), bw, 6, C.void, 0.55 * alpha);
      }
      bx += bw + 3;
    }
  }
}

function fog(g, L, p, color, alpha, baseY) {
  const rise = clamp01(p / 0.45);
  for (let i = 0; i < 3; i++) {
    const y = R(baseY + i * (L.tall ? 10 : 6) + Math.sin(p * 5 + i) * 2);
    const ww = R(L.w * (0.5 + 0.16 * i) * (0.65 + 0.35 * rise));
    fill(g, L.cx - ww / 2 + i * 12 - R(p * 10), y, ww, 3 + i * 2, color, alpha * (0.5 - i * 0.1) * (0.4 + 0.6 * rise));
  }
}

// ---------- 静态布景 ----------
function swampBack(g, L) {
  const { w, h, B, horizon } = L;
  fill(g, -B, 0, w + B * 2, horizon, C.void);
  fill(g, -B, 0, w + B * 2, R(h * 0.30), C.nightDeep);
  fill(g, -B, R(h * 0.30), w + B * 2, R(h * 0.14), C.night);
  pxRect(g, -B, R(h * 0.42), w + B * 2, 2, C.stoneDark, 0.35);
  starfield(g, { x: -B, y: 0, w: w + B * 2, h: R(h * 0.42), seed: 21, count: L.tall ? 56 : 38, color: C.parchment, bright: C.white, accent: C.teal, alpha: 0.55 });
  disc(g, R(w * 0.86), R(h * 0.10), R(9 * L.u), C.parchment, 0.75);
  ring(g, R(w * 0.86), R(h * 0.10), R(13 * L.u), C.parchment, 0.20, 24);
  // 教堂墙：石砌 + 尖窗 + 圆彩窗 + 光柱
  ashlar(g, { x: -B, y: R(h * 0.30), w: w + B * 2, h: R(h * 0.30), rowH: L.tall ? 16 : 11, color: C.stoneDark, alpha: 1, face: C.stone, dark: C.void, seed: 4, density: 0.35 });
  for (let i = 0; i < 5; i++) pxRect(g, -B + i * R((w + B * 2) / 5), R(h * 0.30) - 4, R((w + B * 2) / 5), 4, C.stoneDark, 1);
  // 两个尖窗 + 圆窗
  for (const [wx, gc1, gc2] of [[L.lancet1X, C.glassBlue, C.teal], [L.lancet2X, C.glassRed, C.glassBlue]]) {
    const ww = R(20 * L.u), wh = R(h * 0.17);
    pxRect(g, wx - ww / 2 - 4, L.winBaseY - wh - 4, ww + 8, wh + 8, C.stone, 1);
    archWindow(g, { cx: wx, baseY: L.winBaseY, w: ww, h: wh, frame: C.stoneLight, glass: gc1, glass2: gc2, mullions: 1, alpha: 1 });
    pxRect(g, wx - ww / 2 - 6, L.winBaseY - 1, ww + 12, 3, C.stoneLight, 0.9);
    pxRect(g, wx - ww / 2 - 6, L.winBaseY + 2, ww + 12, 1, C.void, 0.6);
  }
  disc(g, L.roseX, L.roseY, L.roseR, C.ink, 1);
  const rc = L.roseR;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const px2 = R(L.roseX + Math.cos(a) * rc * 0.55), py2 = R(L.roseY + Math.sin(a) * rc * 0.55);
    pxDiamond(g, px2, py2, R(rc * 0.34), i % 2 ? C.glassRed : C.glassBlue, 0.85, true);
  }
  disc(g, L.roseX, L.roseY, R(rc * 0.22), C.teal, 0.9);
  ring(g, L.roseX, L.roseY, rc + 2, C.stoneLight, 0.8, 28);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    pxRect(g, R(L.roseX + Math.cos(a) * (rc + 2)), R(L.roseY + Math.sin(a) * (rc + 2)), 1, 1, C.stoneLight, 0.5);
  }
  // 光柱
  for (const [sx, ex] of [[L.lancet1X, L.lancet1X - 54], [L.lancet2X, L.lancet2X - 30], [L.roseX, L.roseX - 96]]) {
    silhouette(g, [{ x: sx - 8, y: L.winBaseY - R(h * 0.18) }, { x: sx + 8, y: L.winBaseY - R(h * 0.18) }, { x: ex + 26, y: horizon }, { x: ex - 10, y: horizon }], C.swampGlint, 0.07);
  }
  // 墙根苔与水面
  moss(g, { x: -B, y: horizon - R(h * 0.06), w: w + B * 2, h: R(h * 0.06), seed: 8, color: C.mossTileLit, color2: C.rot, count: L.tall ? 70 : 46, alpha: 0.5 });
  water(g, { x: -B, y: horizon, w: w + B * 2, h: h - horizon + B, base: C.swampWater, glint: C.swampGlint, seed: 9, alpha: 1, rows: L.tall ? 7 : 4, ripples: 8 });
  pxRect(g, -B, horizon, w + B * 2, 1, C.swampGlint, 0.35);
  // 沼水三层色带：近岸深、中段亮、远岸返绿（硬边分带，不用渐变）
  const wTop = horizon, wH = h - horizon + B;
  // 岸线泥带：水与墙根之间的一条烂泥，让水面有「岸」
  fill(g, -B, wTop - R(h * 0.018), w + B * 2, R(h * 0.022), C.rot, 0.32);
  pxRect(g, -B, wTop - R(h * 0.018), w + B * 2, 1, C.mossTileLit, 0.55);
  fill(g, -B, wTop, w + B * 2, R(wH * 0.24), C.swampWater, 0.92);
  fill(g, -B, wTop + R(wH * 0.24), w + B * 2, R(wH * 0.30), C.swampWater, 0.66);
  fill(g, -B, wTop + R(wH * 0.54), w + B * 2, R(wH * 0.46), C.ink, 0.34);
  pxRect(g, -B, wTop + R(wH * 0.26), w + B * 2, 1, C.swampGlint, 0.16);
  pxRect(g, -B, wTop + R(wH * 0.54), w + B * 2, 1, C.swampGlint, 0.10);
  // 五道窗影倒影：跟着实体（尖窗/彩窗）往下拉长，alpha 逐段衰减
  const refl = [
    [L.lancet1X, R(11 * L.u), C.glassBlue], [L.lancet2X, R(11 * L.u), C.glassRed],
    [L.roseX, R(15 * L.u), C.teal], [L.roseX - R(9 * L.u), R(6 * L.u), C.glassBlue],
    [L.lancet1X + R(5 * L.u), R(5 * L.u), C.glassRed],
  ];
  for (const [rx2, rw2, col] of refl) {
    for (let i = 0; i < 5; i++) pxRect(g, rx2 - R(rw2 / 2), wTop + 2 + i * R(wH * 0.055), R(rw2 - i * 1.4), 2, col, 0.20 - i * 0.028);
  }
  // 三圈静涟漪 + 浮萍，给水面建立尺度
  ellipseRing(g, R(w * 0.30), wTop + R(wH * 0.30), R(26 * L.u), R(4 * L.u), C.swampGlint, 0.16, 20);
  ellipseRing(g, R(w * 0.66), wTop + R(wH * 0.48), R(34 * L.u), R(5 * L.u), C.swampGlint, 0.13, 22);
  ellipseRing(g, R(w * 0.50), wTop + R(wH * 0.72), R(46 * L.u), R(6 * L.u), C.swampGlint, 0.09, 24);
  for (let i = 0; i < 9; i++) {
    const lx = R(w * (0.06 + (i * 0.107) % 0.90)), ly = wTop + R(wH * (0.14 + (i % 5) * 0.15));
    pxRect(g, lx, ly, R(5 + (i % 3) * 2), 2, C.mossTileLit, 0.55);
    pxRect(g, lx + 1, ly, R(2 + (i % 2) * 2), 1, C.rot, 0.6);
  }
  // 横向涟漪：长短交错，近处更宽，读出水面而不是草地
  for (let i = 0; i < 22; i++) {
    const ry = wTop + R(wH * (0.05 + (i % 9) * 0.10));
    const rx = R(w * (((i * 0.37) % 0.86) + 0.05));
    const rw = R((10 + (i % 4) * 12) * L.u);
    pxRect(g, rx, ry, rw, 1, C.swampGlint, 0.18 + (i % 3) * 0.05);
    if (i % 3 === 0) pxRect(g, rx + R(4 * L.u), ry + 2, R(rw * 0.55), 1, C.swampGlint, 0.10);
  }
}

function swampMid(g, L) {
  const { w, h } = L;
  const beamY = L.bellY - R(6 * L.u);
  // 钟架横梁与两根残柱
  beam(g, { x: R(L.bellX - 76), y: beamY, w: 152, h: R(5 * L.u), color: 0x4a3826, light: 0x6a5236 });
  for (const bx of [L.bellX - 70, L.bellX + 66]) {
    pxRect(g, bx - 3, beamY, 7, L.horizon - beamY, 0x3b2e20, 0.95);
    pxRect(g, bx - 3, beamY, 1, L.horizon - beamY, 0x6a5236, 0.4);
    pxRect(g, bx - 6, L.horizon - 4, 13, 4, 0x2a2117, 1);
  }
  beam(g, { x: R(w * 0.06), y: R(h * 0.36), w: R(w * 0.20), h: 4, color: 0x3b2e20, light: 0x6a5236, alpha: 0.9 });
  // 半沉长椅三排
  for (let i = 0; i < 3; i++) {
    const px2 = R(w * (0.16 + i * 0.24)) - R(L.tall ? 0 : 0);
    const py2 = L.horizon + R(10 * L.u) + i * R(11 * L.u);
    const bw = R(58 * L.u);
    planks(g, { x: px2, y: py2, w: bw, h: 4, color: 0x3a3120, dark: 0x1c1710, light: 0x6a5236, alpha: 0.95, rowH: 4, seed: 5 + i });
    pxRect(g, px2 + 4, py2 + 4, 3, R(9 * L.u), 0x2a2117, 0.95);
    pxRect(g, px2 + bw - 8, py2 + 4, 3, R(7 * L.u), 0x2a2117, 0.95);
    if (i !== 1) pxRect(g, px2 + bw * 0.55, py2 + 4, 3, R(8 * L.u), 0x2a2117, 0.85);
    pxRect(g, px2 + R(bw * 0.28), py2, R(bw * 0.3), 1, C.stoneDark, 0.8);
    pxRect(g, px2 - 2, py2 + R(4 * L.u), bw + 4, R(4 * L.u), C.swampWater, 0.55);
    pxRect(g, px2 - 2, py2 + R(4 * L.u), bw + 4, 1, C.swampGlint, 0.16);
  }
  // 左石阶两级
  steps(g, { cx: R(w * 0.10), y: L.horizon - 6, w: R(52 * L.u), count: 2, rise: R(5 * L.u), color: C.stoneDark, light: C.stoneLight, alpha: 1 });
  // 右侧倒下的柱鼓与半淹墓碑
  for (let i = 0; i < 3; i++) {
    pxRect(g, R(w * 0.84) + i * 3, L.horizon + R(14 + i * 6), R(30 - i * 6), R(8 * L.u), C.stoneDark, 1);
    pxRect(g, R(w * 0.84) + i * 3, L.horizon + R(14 + i * 6), R(30 - i * 6), 1, C.stoneLight, 0.35);
  }
  grave(g, R(w * 0.90), L.horizon + 6, 0, 1.1, C.stoneDark, 0.95);
  grave(g, R(w * 0.95), L.horizon + 16, 2, 0.9, C.stoneDark, 0.9);
  // 钟架上的苔与藤
  moss(g, { x: L.bellX - 70, y: beamY, w: 140, h: 8, seed: 12, color: C.mossTileLit, color2: C.rot, count: 26, alpha: 0.65 });
  for (let i = 0; i < 3; i++) {
    const vx = R(L.bellX - 40 + i * 34);
    pxRect(g, vx, beamY + 4, 1, R(14 + i * 6), C.rot, 0.55);
    pxRect(g, vx, beamY + R(18 + i * 6), 3, 1, C.rot, 0.45);
  }
}

function swampFore(g, L) {
  const { w, h } = L;
  const top = R(h * (L.tall ? 0.90 : 0.90));
  fill(g, -L.B, top, w + L.B * 2, h - top + L.B, C.ink, 0.55);
  pxRect(g, -L.B, top, w + L.B * 2, 1, C.swampGlint, 0.18);
  // 左侧压边断柱
  pxRect(g, R(w * 0.02) - L.B * 0, R(h * 0.58), R(26 * L.u), h, C.stoneDark, 1);
  pxRect(g, R(w * 0.02), R(h * 0.58), R(26 * L.u), 1, C.stoneLight, 0.4);
  pxRect(g, R(w * 0.02) + 6, R(h * 0.58), 1, h, C.void, 0.5);
  moss(g, { x: R(w * 0.02), y: R(h * 0.72), w: R(26 * L.u), h: R(h * 0.2), seed: 31, color: C.mossTileLit, color2: C.rot, count: 22, alpha: 0.6 });
  // 芦苇 5 根 + 水草
  for (let i = 0; i < 5; i++) {
    const rx = R(w * (0.80 + i * 0.038)), rh2 = R(h * (0.10 + (i % 3) * 0.025));
    pxRect(g, rx, h - rh2 - R(h * 0.04), 1, rh2, 0x4a5a34, 0.9);
    pxRect(g, rx - 2, h - rh2 - R(h * 0.05), 5, 2, 0x6b5b30, 0.9);
  }
  for (let i = 0; i < 4; i++) {
    const gx = R(w * (0.10 + i * 0.055));
    pxRect(g, gx, h - R(h * 0.07), 1, R(h * 0.07), 0x39482a, 0.8);
    pxRect(g, gx - 2, h - R(h * 0.07), 5, 1, 0x39482a, 0.7);
  }
  // 浮萍与漂浮残木
  for (let i = 0; i < 6; i++) {
    const lx = R(w * (0.12 + i * 0.14)), ly = R(h * (0.86 + (i % 2) * 0.03));
    pxRect(g, lx, ly, 4, 2, C.rot, 0.55);
    pxRect(g, lx + 1, ly, 2, 1, C.mossTileLit, 0.7);
  }
  pxRect(g, R(w * 0.36), R(h * 0.92), R(50 * L.u), 3, 0x2a2117, 0.95);
  pxRect(g, R(w * 0.36), R(h * 0.92), R(50 * L.u), 1, 0x4a3826, 0.6);
  for (let i = 0; i < 3; i++) pxRect(g, R(w * (0.40 + i * 0.10)), R(h * 0.92) - 2, 2, 2, 0x4a3826, 0.8);
}

function starBack(g, L) {
  const { w, h, B } = L;
  fill(g, -B, 0, w + B * 2, h, C.void);
  // 夜空分带：硬边色阶，越靠地平线越亮
  fill(g, -B, 0, w + B * 2, R(h * 0.10), C.void);
  fill(g, -B, R(h * 0.10), w + B * 2, R(h * 0.10), C.starTileDark);
  fill(g, -B, R(h * 0.20), w + B * 2, R(h * 0.10), C.starTile);
  fill(g, -B, R(h * 0.30), w + B * 2, R(h * 0.10), 0x141a30);
  fill(g, -B, R(h * 0.40), w + B * 2, R(h * 0.08), 0x1b2440);
  fill(g, -B, R(h * 0.48), w + B * 2, R(h * 0.06), 0x243052);
  fill(g, -B, R(h * 0.54), w + B * 2, R(h * 0.06), 0x2d3a60);
  starfield(g, { x: -B, y: 0, w: w + B * 2, h: R(h * 0.62), seed: 33, count: L.tall ? 70 : 48, color: C.bone, bright: C.white, accent: C.runeCold, alpha: 0.9 });
  // 星纹环（大环 + 内环 + 外圈微光；刻度在动态层旋转）
  ring(g, L.ringX, L.ringY, L.ringR, C.runeDim, 0.30, 32);
  ring(g, L.ringX, L.ringY, R(L.ringR * 0.62), C.runeDim, 0.20, 24);
  ring(g, L.ringX, L.ringY, L.ringR + 4, C.runeCold, 0.10, 36);
  // 远处的王庭断墙（旧版 tower() 的深色塔身在实机读作两团巨型枯树冠）
  for (const [fx, fw, fh, seed] of [[0.055, 0.15, 0.21, 11], [0.945, 0.12, 0.15, 12]]) {
    const x0 = R(w * (fx - fw / 2)), x1 = R(w * (fx + fw / 2));
    const wy = L.horizon - R(h * fh);
    const wallC = mix(C.starTileDark, C.shardStone, 0.34);
    pxRect(g, x0, wy, x1 - x0, L.horizon - wy, wallC, 1);
    pxRect(g, x0, wy, x1 - x0, 2, mix(C.shardStone, C.bone, 0.25), 0.5);
    pxRect(g, x1 - 2, wy, 2, L.horizon - wy, C.void, 0.5);
    // 断口：墙顶高低错落的碎垛
    const nSeg = 4;
    for (let i = 0; i < nSeg; i++) {
      const sx2 = x0 + R(((x1 - x0) * i) / nSeg);
      const sw2 = R((x1 - x0) / nSeg);
      const sh2 = R(h * (0.012 + (((i * 37 + seed) % 5) * 0.010)));
      pxRect(g, sx2, wy - sh2, sw2, sh2, wallC, 1);
      pxRect(g, sx2, wy - sh2, sw2, 1, mix(C.shardStone, C.bone, 0.2), 0.4);
    }
    // 箭窗
    for (let i = 0; i < 2; i++) pxRect(g, x0 + R((x1 - x0) * (0.28 + i * 0.36)), wy + R(h * 0.05), R(3 * L.u), R(h * 0.05), C.void, 0.8);
  }
  // 王庭立柱：细柱 + 断口 + 柱头残石（浅石色，读作建筑而不是黑块）
  for (const [fx, ch, cw] of [[0.13, 0.34, 12], [0.87, 0.26, 11]]) {
    const cx4 = R(w * fx), cw4 = R(cw * L.u);
    const cy4 = L.horizon - R(h * ch);
    const colC = mix(C.starTileLit, C.shardStone, 0.5);
    pxRect(g, cx4 - R(cw4 * 0.5), cy4, cw4, L.horizon - cy4, colC, 1);
    pxRect(g, cx4 - R(cw4 * 0.5), cy4, 2, L.horizon - cy4, mix(C.shardStone, C.bone, 0.3), 0.55);
    pxRect(g, cx4 + R(cw4 * 0.5) - 2, cy4, 2, L.horizon - cy4, C.void, 0.55);
    // 柱头残石 + 断口
    pxRect(g, cx4 - R(cw4 * 0.5) - 3, cy4 - R(5 * L.u), cw4 + 6, R(5 * L.u), colC, 1);
    pxRect(g, cx4 - R(cw4 * 0.5) - 3, cy4 - R(5 * L.u), cw4 + 6, 1, mix(C.shardStone, C.bone, 0.3), 0.55);
    pxRect(g, cx4 - R(cw4 * 0.5) + 1, cy4 - R(5 * L.u) - R(6 * L.u), R(cw4 * 0.55), R(6 * L.u), colC, 1);
    // 柱身凹槽
    for (let k = 0; k < 3; k++) pxRect(g, cx4 - R(cw4 * 0.5) + 2 + k * R(cw4 / 3.2), cy4 + R(4 * L.u), 1, L.horizon - cy4 - R(8 * L.u), C.void, 0.3);
  }
  // 断裂栏板：三段贴地平线，垛口断续、缺口压中段（旧版七根等距黑竖条读作栅栏）
  const pH = R(15 * L.u);
  const parC = mix(C.starTileDark, C.shardStone, 0.38);
  for (const [fx0, fx1] of [[0.02, 0.27], [0.38, 0.62], [0.73, 0.98]]) {
    const x0 = R(w * fx0), x1 = R(w * fx1);
    const py = L.horizon - pH;
    pxRect(g, x0, py, x1 - x0, pH, parC, 1);
    pxRect(g, x0, py, x1 - x0, 2, mix(C.shardStone, C.bone, 0.25), 0.5);
    pxRect(g, x0, py + pH - 1, x1 - x0, 1, C.void, 0.6);
    const n = Math.max(3, R((x1 - x0) / R(22 * L.u)));
    for (let i = 0; i < n; i++) {
      if (i % 2 === 1) continue;
      const mx = x0 + R(((x1 - x0) * (i + 0.18)) / n);
      const mw = R(10 * L.u);
      pxRect(g, mx, py - R(6 * L.u), mw, R(6 * L.u), parC, 1);
      pxRect(g, mx, py - R(6 * L.u), mw, 1, mix(C.shardStone, C.bone, 0.2), 0.4);
    }
    // 缺口
    pxRect(g, R((x0 + x1) / 2) - R(6 * L.u), py, R(12 * L.u), pH, C.void, 0.92);
  }
  // 旧陨星划痕与漂浮碎晶
  for (const [x1, y1, x2, y2] of [[R(w * 0.72), R(h * 0.05), R(w * 0.40), R(h * 0.26)], [R(w * 0.30), R(h * 0.03), R(w * 0.12), R(h * 0.16)]]) {
    pxLine(g, x1, y1, x2, y2, C.runeDim, 0.45, 1);
    pxRect(g, x1, y1, 2, 2, C.runeCold, 0.5);
  }
  for (let i = 0; i < 4; i++) {
    const fx = R(w * (0.16 + i * 0.22)), fy = R(h * (0.12 + (i % 2) * 0.08));
    pxDiamond(g, fx, fy, 2, C.shardStone, 0.9, true);
    pxDiamond(g, fx, fy, 1, C.runeCold, 0.7, true);
  }
  pxRect(g, -B, L.horizon, w + B * 2, R(h * 0.20), C.starTileLit, 0.5);
}

function starMid(g, L) {
  const { w, h } = L;
  // 碎石板地面
  fill(g, -L.B, L.ground, w + L.B * 2, h - L.ground + L.B, C.starTileDark, 1);
  pxRect(g, -L.B, L.ground, w + L.B * 2, 1, C.shardStone, 0.5);
  for (let i = 0; i < 4; i++) {
    const sy = L.ground + R((h - L.ground) * ((i + 0.7) / 5));
    pxRect(g, -L.B, sy, w + L.B * 2, 1, C.shardStone, 0.22);
  }
  for (let i = -5; i <= 5; i++) thinLine(g, R(w * 0.5 + i * 40), L.ground, R(w * 0.5 + i * 110), h - R((h - L.ground) * 0.2), C.shardStone, 0.10);
  // 陨坑
  ellipseRing(g, L.craterX, L.craterY, R(52 * L.u), R(13 * L.u), C.starTileDark, 0.9, 26);
  ellipseRing(g, L.craterX, L.craterY, R(36 * L.u), R(9 * L.u), C.void, 0.9, 24);
  ellipseRing(g, L.craterX, L.craterY - 1, R(20 * L.u), R(5 * L.u), 0x0a0c1c, 0.95, 20);
  rubble(g, { x: L.craterX - R(60 * L.u), y: L.craterY - R(10 * L.u), w: R(120 * L.u), h: R(16 * L.u), seed: 6, color: C.shardStone, color2: C.stoneDark, count: 14, alpha: 1 });
  for (let i = 0; i < 3; i++) {
    thinLine(g, L.craterX + R(40 * L.u), L.craterY, L.craterX + R((70 + i * 20) * L.u), L.craterY + R(16 * L.u), C.starTileDark, 0.9);
  }
  // 王座：三级台基（踏面受光/踢面压暗、每级砸缺角）→ 座面 → 断齿高背 → 扶手（右扶手断桩）
  const tx = L.throneX;
  const treadC = mix(C.shardStone, C.bone, 0.22);
  const riserC = mix(C.starTileLit, C.shardStone, 0.42);
  const bodyC = mix(C.starTileLit, C.shardStone, 0.52);
  const stepWs = [R(150 * L.u), R(124 * L.u), R(100 * L.u)];
  const stepH = R(7 * L.u);
  let ty3 = L.ground - R(2 * L.u);
  for (let i = 0; i < 3; i++) {
    const sw = stepWs[i], sx0 = tx - R(sw * 0.5);
    ty3 -= stepH;
    pxRect(g, sx0, ty3, sw, stepH, riserC, 1);
    pxRect(g, sx0, ty3, sw, 2, treadC, 0.85);
    pxRect(g, sx0, ty3 + stepH - 1, sw, 1, C.void, 0.55);
    const nw = R(16 * L.u);
    pxRect(g, sx0 + R(sw * (0.10 + i * 0.26)), ty3, nw, stepH, C.void, 0.8);
  }
  const base = ty3;
  // 座下阴影
  pxRect(g, tx - R(34 * L.u), base, R(68 * L.u), R(5 * L.u), C.void, 0.75);
  // 高背 + 断齿（三处尖角，中间最高，两侧错落）
  const backW = R(48 * L.u), backH = R(64 * L.u);
  const backTop = base - backH;
  pxRect(g, tx - R(backW * 0.5), backTop, backW, backH, bodyC, 1);
  pxRect(g, tx - R(backW * 0.5), backTop, 2, backH, treadC, 0.5);
  pxRect(g, tx + R(backW * 0.5) - 2, backTop, 2, backH, C.void, 0.6);
  pxRect(g, tx - R(8 * L.u), backTop - R(11 * L.u), R(16 * L.u), R(11 * L.u), bodyC, 1);
  pxRect(g, tx - R(8 * L.u), backTop - R(11 * L.u), R(16 * L.u), 1, treadC, 0.5);
  pxRect(g, tx - R(21 * L.u), backTop - R(6 * L.u), R(9 * L.u), R(6 * L.u), bodyC, 1);
  pxRect(g, tx - R(21 * L.u), backTop - R(6 * L.u), R(9 * L.u), 1, treadC, 0.4);
  pxRect(g, tx + R(11 * L.u), backTop - R(4 * L.u), R(8 * L.u), R(4 * L.u), bodyC, 1);
  // 靠背竖棂（三条暗缝）+ 中央受光条
  for (let i = 0; i < 3; i++) pxRect(g, tx - R(backW * 0.34) + i * R(backW * 0.24), backTop + R(8 * L.u), 1, backH - R(12 * L.u), C.void, 0.32);
  pxRect(g, tx - 1, backTop + R(6 * L.u), 2, backH - R(10 * L.u), treadC, 0.18);
  // 星纹背板
  pxDiamond(g, tx, base - R(30 * L.u), R(12 * L.u), C.runeCold, 0.26, false);
  pxDiamond(g, tx, base - R(30 * L.u), R(7 * L.u), C.runeCold, 0.42, false);
  pxDiamond(g, tx, base - R(30 * L.u), R(2 * L.u), C.runeCold, 0.9, true);
  // 座面（受光）
  const seatH2 = R(10 * L.u), seatY = base - R(30 * L.u);
  pxRect(g, tx - R(36 * L.u), seatY, R(72 * L.u), seatH2, mix(C.stoneDark, C.shardStone, 0.5), 1);
  pxRect(g, tx - R(36 * L.u), seatY, R(72 * L.u), 2, treadC, 0.85);
  pxRect(g, tx - R(36 * L.u), seatY + seatH2 - 1, R(72 * L.u), 1, C.void, 0.5);
  // 座垫（暗红绒面，压出座面与靠背的分界）
  pxRect(g, tx - R(30 * L.u), seatY - R(3 * L.u), R(60 * L.u), R(3 * L.u), mix(C.bloodDark, C.starTileLit, 0.35), 1);
  pxRect(g, tx - R(30 * L.u), seatY - R(3 * L.u), R(60 * L.u), 1, mix(C.blood, C.starTileLit, 0.4), 0.55);
  // 扶手：左完整、右断桩
  pxRect(g, tx - R(45 * L.u), seatY - R(22 * L.u), R(7 * L.u), R(32 * L.u), bodyC, 1);
  pxRect(g, tx - R(45 * L.u), seatY - R(22 * L.u), R(7 * L.u), 2, treadC, 0.7);
  pxRect(g, tx - R(45 * L.u), seatY + R(6 * L.u), R(7 * L.u), R(4 * L.u), C.void, 0.5);
  pxRect(g, tx + R(38 * L.u), seatY - R(8 * L.u), R(7 * L.u), R(18 * L.u), bodyC, 1);
  pxRect(g, tx + R(38 * L.u), seatY - R(8 * L.u), R(7 * L.u), 1, C.void, 0.6);
  // 三组悬浮碎星（每组 3 枚，尺寸错落）
  for (const [gx3, gy3] of [[0.31, 0.42], [0.70, 0.31], [0.50, 0.21]]) {
    for (let k = 0; k < 3; k++) {
      const sxp = R(w * gx3) + R((k - 1) * 12 * L.u);
      const syp = R(h * gy3) + R((((k * 7) % 3) - 1) * 8 * L.u);
      const sz = (k % 2 === 0 ? 3 : 2) * L.u;
      pxDiamond(g, sxp, syp, R(sz), C.shardStone, 0.9, true);
      pxDiamond(g, sxp, syp, Math.max(1, R(sz * 0.45)), C.runeCold, 0.7, true);
    }
  }
  // 地面碎星晶体 5 枚
  for (let i = 0; i < 5; i++) {
    const sx = R(w * (0.18 + i * 0.16)), sy = L.ground + R((i % 3) * 5) - 2;
    pxDiamond(g, sx, sy - R(9 * L.u), R(4 * L.u), C.shardStone, 0.95, true);
    pxDiamond(g, sx, sy - R(9 * L.u), R(2 * L.u), C.runeCold, 0.7, true);
  }
  // 散落石板
  for (let i = 0; i < 4; i++) {
    const sx = R(w * (0.30 + i * 0.16)), sy = L.ground + R(10 + (i % 2) * 8);
    pxRect(g, sx, sy, R(18 * L.u), 3, C.stoneDark, 0.9);
    pxRect(g, sx, sy, R(18 * L.u), 1, C.shardStone, 0.4);
  }
}

function starFore(g, L) {
  const { w, h } = L;
  const top = R(h * (L.tall ? 0.86 : 0.88));
  fill(g, -L.B, top, w + L.B * 2, h - top + L.B, 0x0a0c1c, 1);
  pxRect(g, -L.B, top, w + L.B * 2, 1, C.shardStone, 0.3);
  // 近景断栏板：两段贴地，压顶石 + 垛口 + 缺口（旧版左下一条 34u 黑柱读作巨型枯树）
  const pTop = Math.min(top - R(12 * L.u), L.ground - R(4 * L.u));
  const parC = mix(C.starTileDark, C.shardStone, 0.42);
  const capC = mix(C.shardStone, C.bone, 0.28);
  for (const [fx0, fx1] of [[0, 0.29], [0.71, 1]]) {
    const x0 = R(w * fx0), x1 = R(w * fx1);
    const pw = x1 - x0;
    pxRect(g, x0, pTop, pw, top - pTop, parC, 1);
    // 压顶石
    pxRect(g, x0 - 2, pTop, pw + 4, R(4 * L.u), capC, 1);
    pxRect(g, x0 - 2, pTop + R(4 * L.u) - 1, pw + 4, 1, C.void, 0.5);
    // 垛口：断续短石垛
    const n = Math.max(2, R(pw / R(30 * L.u)));
    for (let i = 0; i < n; i++) {
      if (i % 2 === 1) continue;
      const mx = x0 + R((pw * (i + 0.16)) / n);
      pxRect(g, mx, pTop - R(7 * L.u), R(12 * L.u), R(7 * L.u), parC, 1);
      pxRect(g, mx, pTop - R(7 * L.u), R(12 * L.u), 1, capC, 0.55);
    }
    // 栏板缝 + 砸缺的一角
    for (let i = 1; i < 3; i++) pxRect(g, x0 + R((pw * i) / 3), pTop + R(4 * L.u), 1, top - pTop - R(4 * L.u), C.void, 0.5);
    pxRect(g, x0 + R(pw * 0.62), pTop + R(4 * L.u), R(14 * L.u), R(6 * L.u), C.void, 0.75);
  }
  // 右下碎晶 + 碎石
  for (let i = 0; i < 4; i++) {
    const sx = R(w * (0.74 + i * 0.06));
    pxDiamond(g, sx, h - R(10 + i * 4), R(5 * L.u), C.shardStone, 0.95, true);
    pxDiamond(g, sx, h - R(10 + i * 4), R(2 * L.u), C.runeCold, 0.5, true);
  }
  rubble(g, { x: R(w * 0.68), y: R(h * 0.88), w: R(w * 0.30), h: R(h * 0.10), seed: 14, color: C.shardStone, color2: C.stoneDark, count: 16, alpha: 0.95 });
}

function libraryBack(g, L) {
  const { w, h, B } = L;
  fill(g, -B, 0, w + B * 2, h, C.nightDeep);
  // 两壁书架墙
  bookWall(g, -B, R(h * 0.16), R(w * 0.22) + B, R(h * 0.60), L.tall ? 5 : 4, 41);
  bookWall(g, R(w * 0.78), R(h * 0.16), R(w * 0.22) + B, R(h * 0.60), L.tall ? 5 : 4, 42);
  // 后墙与拱肋
  fill(g, R(w * 0.22), R(h * 0.16), R(w * 0.56), R(h * 0.60), 0x181c2a, 1);
  for (let i = 0; i < 3; i++) {
    const ax = R(w * (0.33 + i * 0.17));
    pointedArch(g, { cx: ax, baseY: R(h * 0.72), w: R(36 * L.u), h: R(h * 0.34), t: 0, color: C.stoneDark, fillColor: 0x10141f, fillAlpha: 1 });
    pointedArch(g, { cx: ax, baseY: R(h * 0.72), w: R(36 * L.u), h: R(h * 0.34), t: 1, color: C.stoneDark, alpha: 0.8 });
    pxRect(g, ax - R(8 * L.u), R(h * 0.58), R(16 * L.u), R(h * 0.14), 0x1a2438, 0.9);
    pxRect(g, ax - 1, R(h * 0.58), 2, R(h * 0.14), C.brassDark, 0.6);
  }
  // 拱顶肋线
  for (let i = 0; i < 3; i++) {
    thinLine(g, R(w * 0.27), R(h * 0.16) + i * 5, R(w * 0.50), R(h * 0.06) + i * 3, C.stoneDark, 0.8);
    thinLine(g, R(w * 0.50), R(h * 0.06) + i * 3, R(w * 0.73), R(h * 0.16) + i * 5, C.stoneDark, 0.8);
  }
  pxRect(g, -B, R(h * 0.16), w + B * 2, 3, C.brassDark, 0.6);
  // 后墙高窗：冷光
  archWindow(g, { cx: R(w * 0.50), baseY: R(h * 0.30), w: R(26 * L.u), h: R(h * 0.20), frame: C.ink, glass: C.runeDim, glass2: C.runeCold, mullions: 2, alpha: 0.8 });
  // 地板与走道
  const floorY = R(h * 0.76);
  fill(g, -B, floorY, w + B * 2, h - floorY + B, 0x141824, 1);
  for (let i = 0; i < 5; i++) {
    const sy = floorY + R((h - floorY) * ((i + 0.6) / 5.6));
    pxRect(g, -B, sy, w + B * 2, 1, C.stoneDark, 0.35);
  }
  for (let i = -6; i <= 6; i++) thinLine(g, R(w * 0.5 + i * 34), floorY, R(w * 0.5 + i * 96), h, C.stoneDark, 0.22);
  // 走道地毯
  pxRect(g, R(w * 0.40), floorY + 4, R(w * 0.22), h - floorY - 4 + B, 0x4a1f26, 0.35);
  pxRect(g, R(w * 0.40), floorY + 4, R(w * 0.22), 1, C.brassDark, 0.5);
}

function libraryMid(g, L) {
  const { w, h } = L;
  const beamY = L.bellY - 8;
  // 中央铜钟横梁与钟绳
  beam(g, { x: R(w * 0.44), y: beamY, w: R(w * 0.36), h: R(5 * L.u), color: 0x3a2f22, light: 0x6a5236 });
  pxRect(g, R(w * 0.44), beamY, R(6 * L.u), R(h * 0.10), C.stoneDark, 0.9);
  pxRect(g, R(w * 0.80) - R(6 * L.u), beamY, R(6 * L.u), R(h * 0.10), C.stoneDark, 0.9);
  // 阅读台（台面 + 摊开书 + 烛）
  const dx = L.deskX, dy = L.deskY;
  pxRect(g, dx - R(26 * L.u), dy, R(52 * L.u), R(5 * L.u), 0x3a2f22, 0.95);
  pxRect(g, dx - R(26 * L.u), dy, R(52 * L.u), 1, 0x6a5236, 0.7);
  for (const lx of [dx - R(20 * L.u), dx + R(18 * L.u)]) pxRect(g, lx, dy + R(5 * L.u), R(4 * L.u), R(h * 0.16), 0x2a2117, 0.95);
  pxRect(g, dx - R(15 * L.u), dy - R(5 * L.u), R(30 * L.u), R(5 * L.u), C.parchment, 0.85);
  pxRect(g, dx - R(15 * L.u), dy - R(5 * L.u), R(14 * L.u), R(5 * L.u), C.bone, 0.95);
  pxRect(g, dx + R(1 * L.u), dy - R(5 * L.u), R(14 * L.u), R(5 * L.u), C.bone, 0.95);
  pxRect(g, dx, dy - R(5 * L.u), 1, R(5 * L.u), C.brassDark, 0.8);
  candle(g, { x: dx + R(22 * L.u), baseY: dy, h: R(9 * L.u), wax: C.parchment, flame: C.brassLight, holder: C.brassDark });
  // 书梯
  const lx0 = R(w * 0.24);
  for (const off of [-7, 7]) pxRect(g, lx0 + off, R(h * 0.34), R(3 * L.u), R(h * 0.46), 0x3a2f22, 0.95);
  for (let i = 0; i < 6; i++) pxRect(g, lx0 - 7, R(h * 0.36) + i * R(h * 0.075), R(17 * L.u), 2, 0x6a5236, 0.9);
  // 书堆
  for (const [sx, sy, n] of [[R(w * 0.34), R(h * 0.70), 4], [R(w * 0.14), R(h * 0.72), 3], [R(w * 0.62), R(h * 0.71), 5]]) {
    for (let i = 0; i < n; i++) {
      const bw = R((10 + (i % 3) * 3) * L.u);
      pxRect(g, sx - bw / 2 + (i % 2), sy - i * 3, bw, 3, i % 2 ? 0x543c3c : 0x2f4560, 0.95);
      pxRect(g, sx - bw / 2 + (i % 2), sy - i * 3, bw, 1, C.parchment, 0.3);
    }
  }
  // 吊灯铁环 + 四烛
  const chx = L.chandX, chy = L.chandY;
  chain(g, { x: chx, y: 0, h: chy - R(10 * L.u), color: C.stoneDark, alpha: 0.9, linkH: 4 });
  ring(g, chx, chy, R(12 * L.u), C.brassDark, 0.95, 16);
  ring(g, chx, chy, R(9 * L.u), C.brass, 0.35, 14);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const cx2 = R(chx + Math.cos(a) * 12 * L.u), cy2 = R(chy + Math.sin(a) * 6 * L.u);
    pxRect(g, cx2, cy2 - R(6 * L.u), 2, R(6 * L.u), C.parchment, 0.85);
    pxRect(g, cx2 - 1, cy2, 4, 1, C.brassDark, 0.9);
  }
  // 凳子与散卷
  pxRect(g, R(w * 0.52), L.deskY + R(18 * L.u), R(10 * L.u), R(4 * L.u), 0x3a2f22, 0.95);
  pxRect(g, R(w * 0.52) + 2, L.deskY + R(22 * L.u), 2, R(8 * L.u), 0x2a2117, 0.95);
  pxRect(g, R(w * 0.58), R(h * 0.79), R(16 * L.u), 2, C.parchment, 0.55);
  pxRect(g, R(w * 0.30), R(h * 0.80), R(13 * L.u), 2, C.parchment, 0.45);
}

function libraryFore(g, L) {
  const { w, h } = L;
  const top = R(h * (L.tall ? 0.90 : 0.92));
  fill(g, -L.B, top, w + L.B * 2, h - top + L.B, 0x0d1018, 1);
  pxRect(g, -L.B, top, w + L.B * 2, 1, C.brassDark, 0.4);
  // 左下前景书架一角
  pxRect(g, 0, R(h * 0.68), R(54 * L.u), h, 0x121726, 1);
  pxFrame(g, 0, R(h * 0.68), R(54 * L.u), R(h * 0.30), C.brassDark, 2, 0.8);
  for (let i = 0; i < 6; i++) {
    pxRect(g, R(8 * L.u), R(h * 0.72) + i * R(h * 0.045), R(5 * L.u), R(h * 0.035), i % 2 ? 0x543c3c : 0x2f4560, 0.9);
    pxRect(g, R(15 * L.u), R(h * 0.73) + i * R(h * 0.045), R(4 * L.u), R(h * 0.030), i % 3 ? 0x3f5a3a : 0x6c6c54, 0.85);
    pxRect(g, R(21 * L.u), R(h * 0.72) + i * R(h * 0.045), R(6 * L.u), R(h * 0.036), i % 2 ? 0x2f4560 : 0x543c3c, 0.85);
  }
  // 散页与书堆
  for (let i = 0; i < 5; i++) {
    const px2 = R(w * (0.42 + i * 0.11)), py2 = R(h * (0.88 + (i % 2) * 0.03));
    pxRect(g, px2, py2, R(7 * L.u), 1, C.parchment, 0.55);
    pxRect(g, px2 + 2, py2 + 1, R(5 * L.u), 1, C.bone, 0.35);
  }
  for (let i = 0; i < 3; i++) {
    const bx = R(w * (0.86)), by = R(h * 0.90) - i * 4;
    pxRect(g, bx - i * 2, by, R(28 * L.u), 4, i % 2 ? 0x2f4560 : 0x543c3c, 0.95);
    pxRect(g, bx - i * 2, by, R(28 * L.u), 1, C.parchment, 0.35);
  }
  // 前景链
  chain(g, { x: R(w * 0.94), y: 0, h: R(h * 0.30), color: C.stoneDark, alpha: 0.5, linkH: 5 });
}

function courtBack(g, L) {
  const { w, h, B } = L;
  fill(g, -B, 0, w + B * 2, h, C.void);
  // 天顶一线冷光，把柱廊压在下半幅
  fill(g, -B, 0, w + B * 2, R(h * 0.14), C.ink);
  pxRect(g, -B, R(h * 0.14), w + B * 2, 2, C.stoneDark, 0.9);
  // 天顶藻井：三道横梁 + 梁间暗格，把上缘从空黑变成室内
  for (let i = 0; i < 3; i++) {
    const cy = R(h * (0.02 + i * 0.042));
    pxRect(g, -B, cy, w + B * 2, 2, C.stoneDark, 1);
    pxRect(g, -B, cy, w + B * 2, 1, C.stoneLight, 0.22);
    for (let k = 0; k < 8; k++) pxRect(g, R(w * (0.06 + k * 0.12)), cy + 3, R(6 * L.u), R(3 * L.u), C.groove, 0.55);
  }
  const rowH2 = L.tall ? 20 : 12;
  ashlar(g, { x: -B, y: R(h * 0.14), w: w + B * 2, h: R(h * 0.62), rowH: rowH2, color: C.stoneDark, alpha: 1, face: C.stone, dark: C.void, seed: 17, density: 0.3 });
  // 每三层压暗一层：打散整面墙的单一色块，远看有砌筑层次
  const wallRows = Math.floor(R(h * 0.62) / rowH2);
  for (let r = 0; r < wallRows; r++) {
    if (r % 3 !== 0) continue;
    pxRect(g, -B, R(h * 0.14) + r * rowH2, w + B * 2, rowH2, C.void, 0.13);
  }
  // 柱廊四根：柱础落在地平线上，柱头托檐
  for (const cxp of [R(w * 0.08), R(w * 0.37), R(w * 0.63), R(w * 0.92)]) {
    column(g, { cx: cxp, topY: R(h * 0.15), bottomY: R(h * 0.76), w: R(15 * L.u), shaft: C.stoneDark, light: C.stoneLight, dark: C.groove, capH: R(6 * L.u), baseH: R(6 * L.u), alpha: 1, flutes: 3 });
    pxRect(g, cxp - R(12 * L.u), R(h * 0.13), R(24 * L.u), R(4 * L.u), C.stone, 0.95);
    pxRect(g, cxp - R(12 * L.u), R(h * 0.13), R(24 * L.u), 1, C.stoneLight, 0.55);
  }
  // 高窗冷光两扇，光柱落到碑上
  for (const ax of [R(w * 0.25), R(w * 0.75)]) {
    archWindow(g, { cx: ax, baseY: R(h * 0.22), w: R(22 * L.u), h: R(h * 0.15), frame: C.stoneLight, glass: C.runeDim, glass2: C.glassBlue, mullions: 1, alpha: 0.9 });
    silhouette(g, [{ x: ax - 7, y: R(h * 0.22) }, { x: ax + 7, y: R(h * 0.22) }, { x: ax + 22, y: R(h * 0.66) }, { x: ax - 24, y: R(h * 0.66) }], C.runeCold, 0.045);
  }
  // 三块判词碑：碑首出檐 + 两级碑座 + 五行铭文，宽到能读成「碑」而不是「柱」
  for (let si = 0; si < L.steleXs.length; si++) {
    const sx = L.steleXs[si];
    const sw = R(34 * L.u), sTop = R(h * 0.33), sBot = L.horizon - R(7 * L.u);
    // 碑面比墙亮一档：夜里也能一眼认出「一块刻了字的石头」
    const face = mix(C.stone, C.bone, 0.24);
    pxRect(g, sx - sw / 2, sTop, sw, sBot - sTop, face, 1);
    pxRect(g, sx - sw / 2, sTop, 1, sBot - sTop, C.bone, 0.32);
    pxRect(g, sx + sw / 2 - 1, sTop, 1, sBot - sTop, C.void, 0.5);
    // 碑首：山花尖顶 + 两侧上挑的出檐
    silhouette(g, [{ x: sx - sw / 2, y: sTop }, { x: sx, y: sTop - R(7 * L.u) }, { x: sx + sw / 2, y: sTop }], face, 1);
    pxRect(g, sx - 1, sTop - R(7 * L.u), 1, R(7 * L.u), C.bone, 0.28);
    silhouette(g, [{ x: sx - sw / 2 - R(5 * L.u), y: sTop }, { x: sx - sw / 2 - R(5 * L.u), y: sTop - R(3 * L.u) }, { x: sx + sw / 2 + R(5 * L.u), y: sTop - R(3 * L.u) }, { x: sx + sw / 2 + R(5 * L.u), y: sTop }], C.stoneDark, 1);
    pxRect(g, sx - sw / 2 - R(5 * L.u), sTop - R(3 * L.u), sw + R(10 * L.u), 1, C.bone, 0.4);
    // 碑座两级
    pxRect(g, sx - sw / 2 - R(4 * L.u), sBot, sw + R(8 * L.u), R(4 * L.u), C.stoneDark, 1);
    pxRect(g, sx - sw / 2 - R(4 * L.u), sBot, sw + R(8 * L.u), 1, C.stoneLight, 0.35);
    pxRect(g, sx - sw / 2 - R(7 * L.u), sBot + R(4 * L.u), sw + R(14 * L.u), R(3 * L.u), C.stoneDark, 1);
    // 五行铭文：长短错落，末行被裂缝吃掉
    for (let li = 0; li < 5; li++) {
      const ly = sTop + R(7 * L.u) + li * R(11 * L.u);
      const lw = sw - R(10 * L.u) - (li % 3) * R(4 * L.u);
      pxRect(g, sx - lw / 2, ly, lw, 1, C.void, 0.78);
      if (li % 2 === 0) pxRect(g, sx - lw / 2 + R(3 * L.u), ly + 2, R(4 * L.u), 1, C.brassDark, 0.85);
    }
    cracks(g, { x: sx + R(7 * L.u), y: sTop + R(6 * L.u), len: R(h * 0.09), seed: 20 + si * 5, color: C.void, alpha: 0.55, branches: 0, drift: 3 });
  }
  // 天平浮雕：梁、吊索、双盘都画全，别只剩一根竖线
  const sx2 = R(w * 0.5), sy2 = R(h * 0.24), bw2 = R(46 * L.u);
  pxRect(g, sx2 - 2, sy2, 4, R(h * 0.16), C.ink, 0.26);
  pxRect(g, sx2 - bw2, sy2, bw2 * 2, 3, C.ink, 0.26);
  for (const dir of [-1, 1]) {
    const px2 = sx2 + dir * bw2;
    pxRect(g, px2 - 1, sy2 + 3, 1, R(12 * L.u), C.ink, 0.26);
    pxRect(g, px2 - R(10 * L.u), sy2 + R(12 * L.u), R(20 * L.u), 2, C.ink, 0.26);
    pxRect(g, px2 - R(10 * L.u), sy2 + R(12 * L.u), 1, R(4 * L.u), C.ink, 0.22);
    pxRect(g, px2 + R(10 * L.u) - 1, sy2 + R(12 * L.u), 1, R(4 * L.u), C.ink, 0.22);
  }
  pxDiamond(g, sx2, sy2 - R(3 * L.u), R(4 * L.u), C.brassDark, 0.4, true);
  // 两侧垂幡：给柱廊加软性垂直线
  for (const [bx2, bh2] of [[R(w * 0.15), 0.2], [R(w * 0.85), 0.16]]) {
    const bwid = R(12 * L.u), bh = R(h * bh2);
    pxRect(g, bx2 - bwid / 2, R(h * 0.15), bwid, bh, C.bloodDark, 0.55);
    pxRect(g, bx2 - bwid / 2, R(h * 0.15), 1, bh, C.brassDark, 0.6);
    pxRect(g, bx2 + bwid / 2 - 1, R(h * 0.15), 1, bh, C.void, 0.5);
    pxDiamond(g, bx2, R(h * 0.15) + R(bh * 0.42), R(4 * L.u), C.brassLight, 0.7, true);
    silhouette(g, [{ x: bx2 - bwid / 2, y: R(h * 0.15) + bh }, { x: bx2, y: R(h * 0.15) + bh + R(5 * L.u) }, { x: bx2 + bwid / 2, y: R(h * 0.15) + bh }], C.bloodDark, 0.55);
  }
}

function courtMid(g, L) {
  const { w, h } = L;
  const fy = L.horizon;
  // 地面比墙更冷一档：墙与地不能同色，否则整幅糊成一块
  fill(g, -L.B, fy, w + L.B * 2, h - fy + L.B, mix(C.stoneDark, C.ink, 0.45), 1);
  pxRect(g, -L.B, fy, w + L.B * 2, 1, C.stoneLight, 0.4);
  // 石板铺地：逐排加高、明暗交替，缝随透视向外张开
  for (let r = 0; r < 6; r++) {
    const y0 = fy + R((h - fy) * Math.pow(r / 6, 1.35));
    const y1 = fy + R((h - fy) * Math.pow((r + 1) / 6, 1.35));
    const tone = r % 2 === 0 ? mix(C.stoneDark, C.stone, 0.10) : mix(C.stoneDark, C.ink, 0.22);
    pxRect(g, -L.B, y0, w + L.B * 2, y1 - y0, tone, 1);
    pxRect(g, -L.B, y0, w + L.B * 2, 1, C.void, 0.5);
    if (r === 0) pxRect(g, -L.B, y0 + 1, w + L.B * 2, 1, C.stoneLight, 0.18);
  }
  for (let i = 0; i < 9; i++) {
    const xb = R(w * (-0.06 + i * 0.14));
    const xt = R(w * 0.5 + (xb - w * 0.5) * 0.42);
    thinLine(g, xt, fy, xb, h + L.B, C.void, 0.3);
  }
  // 中央天平：三级台座 + 立杆 + 顶饰（横梁与双盘交给动态层，随判决倾斜）
  const bx3 = L.balX, by3 = L.balY;
  const poleTop = by3 - L.balH + R(2 * L.u);
  L.balTop = poleTop;
  steps(g, { cx: bx3, y: R(h * 0.66), w: R(58 * L.u), count: 3, rise: R(4 * L.u), color: C.stoneDark, light: C.stoneLight, alpha: 1 });
  pxRect(g, bx3 - 2, poleTop, 5, R(h * 0.66) - poleTop, C.brassDark, 1);
  pxRect(g, bx3 - 2, poleTop, 1, R(h * 0.66) - poleTop, C.brass, 0.9);
  pxRect(g, bx3 - R(4 * L.u), poleTop - R(2 * L.u), R(8 * L.u), R(3 * L.u), C.brassDark, 0.95);
  pxDiamond(g, bx3, poleTop - R(5 * L.u), R(5 * L.u), C.brassLight, 0.9, true);
  // 两侧判席：两排矮石凳，给空荡的地面加家具
  for (const [sx4, sy4] of [[R(w * 0.30), R(h * 0.79)], [R(w * 0.70), R(h * 0.79)], [R(w * 0.30), R(h * 0.86)], [R(w * 0.70), R(h * 0.86)]]) {
    pxRect(g, sx4 - R(26 * L.u), sy4, R(52 * L.u), R(4 * L.u), C.stoneDark, 1);
    pxRect(g, sx4 - R(26 * L.u), sy4, R(52 * L.u), 1, C.stoneLight, 0.35);
    pxRect(g, sx4 - R(22 * L.u), sy4 + R(4 * L.u), R(5 * L.u), R(5 * L.u), C.stoneDark, 1);
    pxRect(g, sx4 + R(17 * L.u), sy4 + R(4 * L.u), R(5 * L.u), R(5 * L.u), C.stoneDark, 1);
  }
  // 判官高台（左）：三级台阶 + 高背椅 + 案台 + 摊开的判词
  const dx = R(w * 0.19), dy = R(h * 0.7);
  steps(g, { cx: dx, y: dy, w: R(76 * L.u), count: 3, rise: R(5 * L.u), color: C.stoneDark, light: C.stoneLight, alpha: 1 });
  pxRect(g, dx - R(30 * L.u), dy - R(22 * L.u), R(60 * L.u), R(22 * L.u), C.stone, 1);
  pxRect(g, dx - R(30 * L.u), dy - R(22 * L.u), R(60 * L.u), 1, C.stoneLight, 0.5);
  pxRect(g, dx - R(30 * L.u), dy - R(22 * L.u), 1, R(22 * L.u), C.stoneLight, 0.3);
  // 椅背：五根竖棂 + 顶横档
  pxRect(g, dx - R(26 * L.u), dy - R(50 * L.u), R(52 * L.u), R(28 * L.u), C.ink, 0.7);
  for (let i = 0; i < 5; i++) pxRect(g, dx - R(22 * L.u) + i * R(11 * L.u), dy - R(48 * L.u), R(3 * L.u), R(24 * L.u), C.stoneDark, 0.95);
  pxRect(g, dx - R(26 * L.u), dy - R(50 * L.u), R(52 * L.u), R(3 * L.u), C.stoneDark, 1);
  pxRect(g, dx - R(26 * L.u), dy - R(50 * L.u), R(52 * L.u), 1, C.brassDark, 0.7);
  // 案台 + 摊开的判词 + 火漆
  pxRect(g, dx - R(24 * L.u), dy - R(30 * L.u), R(48 * L.u), R(5 * L.u), C.brassDark, 0.95);
  pxRect(g, dx - R(24 * L.u), dy - R(30 * L.u), R(48 * L.u), 1, C.brass, 0.7);
  pxRect(g, dx - R(14 * L.u), dy - R(33 * L.u), R(28 * L.u), R(3 * L.u), C.parchment, 0.9);
  pxRect(g, dx - R(12 * L.u), dy - R(32 * L.u), R(24 * L.u), 1, C.bone, 0.5);
  pxRect(g, dx + R(10 * L.u), dy - R(33 * L.u), 3, 3, C.blood, 0.9);
  // 地面散落的判词卷与火漆
  for (const [sx3, sy3] of [[R(w * 0.66), R(h * 0.8)], [R(w * 0.4), R(h * 0.83)], [R(w * 0.78), R(h * 0.88)]]) {
    pxRect(g, sx3, sy3, R(24 * L.u), 3, C.parchment, 0.8);
    pxRect(g, sx3 + R(2 * L.u), sy3 + 1, R(18 * L.u), 1, C.bone, 0.5);
    pxRect(g, sx3 + R(21 * L.u), sy3, 3, 3, C.blood, 0.9);
  }
  // 火盆两只：冷焰
  for (const bx of [R(w * 0.31), R(w * 0.69)]) {
    pxRect(g, bx - 3, R(h * 0.66), 7, R(h * 0.09), C.stoneDark, 1);
    pxRect(g, bx - 8, R(h * 0.65), 17, 3, C.brassDark, 0.95);
    pxRect(g, bx - 8, R(h * 0.65), 17, 1, C.brassLight, 0.5);
    silhouette(g, [{ x: bx - 5, y: R(h * 0.65) }, { x: bx, y: R(h * 0.6) }, { x: bx + 5, y: R(h * 0.65) }], C.coldFlame, 0.8);
    pxRect(g, bx - 1, R(h * 0.62), 2, R(h * 0.03), C.coldFlameCore, 0.9);
  }
}

function courtFore(g, L) {
  const { w, h } = L;
  // 近景地面压边
  fill(g, -L.B, R(h * 0.9), w + L.B * 2, h, C.ink, 0.92);
  pxRect(g, -L.B, R(h * 0.9), w + L.B * 2, 1, C.stoneLight, 0.28);
  // 断成两段的石栏：中间留空，别横切整幅
  for (const [x0, x1] of [[0, 0.34], [0.66, 1]]) {
    const px0 = R(w * x0), px1 = R(w * x1), ry = R(h * 0.9);
    pxRect(g, px0, ry - R(16 * L.u), px1 - px0, R(3 * L.u), C.stoneDark, 1);
    pxRect(g, px0, ry - R(16 * L.u), px1 - px0, 1, C.stoneLight, 0.4);
    const n = 4;
    for (let i = 0; i <= n; i++) {
      const bx = R(px0 + ((px1 - px0) * i) / n);
      pxRect(g, bx - R(2 * L.u), ry - R(16 * L.u), R(5 * L.u), R(16 * L.u), C.stoneDark, 1);
      pxRect(g, bx - R(2 * L.u), ry - R(16 * L.u), 1, R(16 * L.u), C.stoneLight, 0.3);
    }
  }
  // 栏杆上摊开的两卷判词
  for (const [sx, sy] of [[R(w * 0.24), R(h * 0.9) - R(19 * L.u)], [R(w * 0.72), R(h * 0.9) - R(19 * L.u)]]) {
    pxRect(g, sx, sy, R(26 * L.u), 4, C.parchment, 0.9);
    pxRect(g, sx + R(2 * L.u), sy + 1, R(22 * L.u), 1, C.bone, 0.6);
    pxRect(g, sx + R(22 * L.u), sy, 3, 4, C.blood, 0.95);
  }
  rubble(g, { x: R(w * 0.8), y: R(h * 0.95), w: R(w * 0.18), h: R(h * 0.05), seed: 23, color: C.stoneDark, color2: C.groove, count: 10, alpha: 0.8 });
}


function forgeBack(g, L) {
  const { w, h, B, u } = L;
  fill(g, -B, 0, w + B * 2, h, 0x1a0f0c);
  const wallTop = R(h * 0.03), wallBot = R(h * 0.78);
  const rows = L.tall ? 13 : 9;
  const rowH = R((wallBot - wallTop) / rows);
  // 砖墙（错缝 + 每四行压暗）
  courses(g, { x: -B, y: wallTop, w: w + B * 2, h: wallBot - wallTop, rowH, color: 0x3a231a, alpha: 1, light: 0x6b4a38, lightAlpha: 0.26 });
  for (let r = 0; r < rows; r += 4) pxRect(g, -B, wallTop + r * rowH, w + B * 2, rowH, C.void, 0.12);
  const rng2 = makeRng(77);
  for (let r = 0; r < rows; r++) {
    if (r % 3 === 2) continue;
    for (let c2 = -2; c2 < 9; c2++) {
      if (rng2() > 0.55) continue;
      const bx = -B + c2 * R((w + B * 2) / 9) + (r % 2) * 24;
      const by = wallTop + r * rowH;
      pxRect(g, bx + 1, by + 1, R((w + B * 2) / 9) - 2, rowH - 2, C.void, 0.13);
      if (rng2() > 0.8) pxRect(g, bx + 2, by + 2, R((w + B * 2) / 9) - 4, 1, 0x6b4a38, 0.3);
    }
  }
  // 木构架：两根立柱把炉膛夹在中间
  for (const px of [R(w * 0.235), R(w * 0.625)]) {
    pxRect(g, px - R(4 * u), wallTop, R(8 * u), wallBot - wallTop, 0x241512, 1);
    pxRect(g, px - R(4 * u), wallTop, 1, wallBot - wallTop, 0x6b4a38, 0.35);
    for (let k = 0; k < 4; k++) pxRect(g, px - R(5 * u), wallTop + R((wallBot - wallTop) * (0.12 + k * 0.24)), R(10 * u), R(3 * u), 0x2a2422, 0.9);
  }
  pxRect(g, -B, wallTop, w + B * 2, R(5 * u), 0x241512, 1);
  pxRect(g, -B, wallTop + R(5 * u), w + B * 2, 1, 0x4a3826, 0.5);
  // 烟道罩
  const fx = L.forgeX, fy = L.forgeY, fw = L.forgeW, fh = L.forgeH;
  const hoodW = fw + R(18 * u), hoodTop = fy - fh - R(56 * u), hoodBot = fy - fh - R(16 * u);
  silhouette(g, [{ x: fx - hoodW / 2, y: hoodBot }, { x: fx + hoodW / 2, y: hoodBot }, { x: fx + fw / 2, y: hoodTop }, { x: fx - fw / 2, y: hoodTop }], 0x1a0f0c, 1);
  pxRect(g, fx - hoodW / 2, hoodBot, hoodW, 2, 0x4a3826, 0.55);
  for (let k = 0; k < 3; k++) {
    const hy = hoodTop + R((hoodBot - hoodTop) * (0.22 + k * 0.26));
    const hw = R(fw + (hoodW - fw) * (1 - (hy - hoodTop) / (hoodBot - hoodTop)));
    pxRect(g, fx - hw / 2, hy, hw, 1, 0x2a2422, 0.8);
  }
  for (let k = 0; k < 4; k++) pxRect(g, fx - R(fw * 0.3) + k * R(fw * 0.2), hoodTop, 2, hoodBot - hoodTop, C.void, 0.18);
  // 炉膛拱口
  roundArch(g, { cx: fx, baseY: fy, w: fw, h: fh, t: 4, color: 0x8a5a3a, alpha: 0.9, fillColor: 0x120806, fillAlpha: 1 });
  roundArch(g, { cx: fx, baseY: fy, w: fw - R(10 * u), h: fh - R(6 * u), t: 1, color: 0xc47a4a, alpha: 0.55 });
  roundArch(g, { cx: fx, baseY: fy, w: fw + R(18 * u), h: fh + R(16 * u), t: 2, color: C.arcane, alpha: 0.18 });
  roundArch(g, { cx: fx, baseY: fy, w: fw + R(36 * u), h: fh + R(32 * u), t: 1, color: C.arcane, alpha: 0.09 });
  // 炉栅 + 炉台 + 煤渣
  const iw = R(fw * 0.66), ix = fx - iw / 2;
  for (let k = 0; k < 3; k++) pxRect(g, ix, fy - R(fh * (0.16 + k * 0.14)), iw, 2, 0x1a1513, 0.95);
  pxRect(g, fx - fw / 2 - R(6 * u), fy, fw + R(12 * u), R(5 * u), 0x3a3230, 1);
  pxRect(g, fx - fw / 2 - R(6 * u), fy, fw + R(12 * u), 1, 0x6a5a52, 0.7);
  for (let k = 0; k < 7; k++) pxRect(g, fx - R(fw * 0.45) + k * R(fw * 0.14), fy + R(5 * u) + (k % 2) * 2, R(4 * u), 2, 0x241a16, 1);
  // 工具墙：木板 + 单根挂杆 + 大锤 / 铁钳 / 手锯 / 马蹄铁
  const twX = R(w * 0.715), twW = R(w * 0.26), twY = R(h * 0.13), twH = R(h * 0.25);
  pxRect(g, twX, twY, twW, twH, 0x2a1a14, 1);
  pxRect(g, twX, twY, twW, 2, 0x6a5236, 0.95);
  pxRect(g, twX, twY + twH - 2, twW, 2, 0x4a3826, 0.9);
  for (let k = 0; k < 3; k++) pxRect(g, twX + R(twW * (0.02 + k * 0.47)), twY, 2, twH, 0x3a2a1e, 1);
  const railY = twY + R(twH * 0.16);
  pxRect(g, twX + 2, railY, twW - 4, 2, 0x8a7a68, 0.55);
  // 大锤
  const h1x = twX + R(twW * 0.13);
  pxRect(g, h1x - 1, railY, 3, R(34 * u), 0x5a4426, 1);
  pxRect(g, h1x - R(9 * u), railY + R(30 * u), R(19 * u), R(8 * u), 0x3a3230, 1);
  pxRect(g, h1x - R(9 * u), railY + R(30 * u), R(19 * u), 1, 0xa89880, 0.85);
  pxRect(g, h1x - R(9 * u), railY + R(37 * u), R(19 * u), 1, C.void, 0.5);
  // 铁钳（两根长杆收拢）
  const t1x = twX + R(twW * 0.32);
  pxLine(g, t1x - R(4 * u), railY, t1x + R(2 * u), railY + R(38 * u), 0x8a7a68, 0.95, 2);
  pxLine(g, t1x + R(4 * u), railY, t1x + R(2 * u), railY + R(38 * u), 0x8a7a68, 0.95, 2);
  pxRect(g, t1x + R(1 * u), railY + R(38 * u), R(5 * u), 2, 0x3a3230, 1);
  // 手锯
  const s1x = twX + R(twW * 0.50);
  pxRect(g, s1x, railY + R(6 * u), R(30 * u), 2, 0x8a7a68, 0.85);
  pxLine(g, s1x, railY + R(6 * u), s1x + R(26 * u), railY + R(20 * u), 0x5a4426, 0.9, 2);
  pxRect(g, s1x + R(26 * u), railY + R(18 * u), R(8 * u), R(4 * u), 0x3a2a1e, 1);
  // 三只马蹄铁
  for (let k = 0; k < 3; k++) {
    const sx = twX + R(twW * 0.70) + k * R(11 * u), sy = railY + R(8 * u) + (k % 2) * R(5 * u);
    pxRect(g, sx, sy, 2, R(10 * u), 0x8a7a68, 0.9);
    pxRect(g, sx + R(8 * u), sy, 2, R(10 * u), 0x8a7a68, 0.9);
    pxRect(g, sx, sy + R(10 * u), R(10 * u), 2, 0x8a7a68, 0.9);
  }
  // 靠墙的三根铁条
  for (let k = 0; k < 3; k++) pxLine(g, R(w * (0.75 + k * 0.03)), R(h * 0.46), R(w * (0.79 + k * 0.03)), R(h * 0.74), 0x4a4442, 0.85, 2);
  // 风箱（左侧）：木箱 + 皮囊楔 + 铁箍 + 喷嘴 + 拉杆
  const bx = R(w * 0.045), bw = R(w * 0.10), by = R(h * 0.45), bh = R(h * 0.13);
  pxRect(g, bx, by, bw, bh, 0x3a2f22, 1);
  pxRect(g, bx, by, bw, 1, 0x6a5236, 0.9);
  pxRect(g, bx, by + bh - 1, bw, 1, 0x1a1513, 0.9);
  silhouette(g, [{ x: bx + bw, y: by + R(2 * u) }, { x: bx + bw + R(22 * u), y: by - R(6 * u) }, { x: bx + bw + R(26 * u), y: by + R(10 * u) }, { x: bx + bw, y: by + bh - R(2 * u) }], 0x4a3a2a, 1);
  for (let k = 0; k < 3; k++) pxLine(g, bx + bw + R(2 * u), by + R(2 * u) + k * R(3 * u), bx + bw + R(22 * u), by - R(5 * u) + k * R(6 * u), 0x2a2422, 0.5, 1);
  pxRect(g, bx + R(bw * 0.30), by, 2, bh, 0x2a2422, 0.95);
  pxRect(g, bx + R(bw * 0.68), by, 2, bh, 0x2a2422, 0.95);
  pxRect(g, bx + bw + R(22 * u), by + R(2 * u), R(14 * u), R(3 * u), 0x2a2422, 1);
  pxLine(g, bx + R(bw * 0.5), by, bx - R(6 * u), by - R(30 * u), 0x5a4426, 1, 2);
  pxRect(g, bx - R(10 * u), by - R(34 * u), R(8 * u), R(4 * u), 0x2a2422, 1);
  // 吊灯：锥形灯罩 + 铁环 + 冷光
  const lx = R(w * 0.50), ly = R(h * 0.12);
  chain(g, { x: lx, y: 0, h: ly - R(6 * u), color: 0x4a4442, alpha: 0.85, linkH: 5 });
  silhouette(g, [{ x: lx - R(9 * u), y: ly }, { x: lx + R(9 * u), y: ly }, { x: lx + R(5 * u), y: ly - R(7 * u) }, { x: lx - R(5 * u), y: ly - R(7 * u) }], 0x3a3230, 1);
  pxRect(g, lx - R(8 * u), ly, R(16 * u), 2, 0x2a2422, 1);
  pxRect(g, lx - R(5 * u), ly + 2, R(10 * u), 2, C.arcane, 0.6);
  pxRect(g, lx - R(3 * u), ly + 4, R(6 * u), 1, C.arcaneLight, 0.6);
  // 烟熏痕
  for (let k = 0; k < 3; k++) pxRect(g, fx - R(14 * u) + k * R(12 * u), hoodTop - R(10 * u) + (k % 2) * 3, R(6 * u), R(9 * u), C.void, 0.22);
}

function forgeMid(g, L) {
  const { w, h, u } = L;
  const hz = L.horizon, gy = L.ground;
  // 地面：炉灰与煤渣（暖灰，与砖墙同族）
  fill(g, -L.B, hz, w + L.B * 2, gy - hz + 2, mix(0x2a211d, C.ink, 0.30));
  for (let r = 0; r < 5; r++) {
    const y0 = hz + R((gy - hz) * Math.pow(r / 5, 1.3));
    const y1 = hz + R((gy - hz) * Math.pow((r + 1) / 5, 1.3));
    pxRect(g, -L.B, y0, w + L.B * 2, y1 - y0, r % 2 ? mix(0x2a211d, C.void, 0.35) : mix(0x3a2f22, C.ink, 0.35), 1);
    pxRect(g, -L.B, y0, w + L.B * 2, 1, C.void, 0.45);
  }
  for (let i = 0; i < 7; i++) {
    const xb = R(w * (-0.06 + i * 0.16));
    const xt = R(w * 0.5 + (xb - w * 0.5) * 0.45);
    thinLine(g, xt, hz, xb, gy, C.void, 0.25);
  }
  // 炉前煤渣与灰堆（把地面从"空板"变成使用过的地面）
  for (const [fx2, fy2, fw2] of [[0.34, 0.66, 0.16], [0.50, 0.72, 0.10], [0.20, 0.74, 0.08]]) {
    pxRect(g, R(w * fx2), R(h * fy2), R(w * fw2), R(3 * u), 0x151010, 0.55);
    pxRect(g, R(w * fx2) + 3, R(h * fy2) + 2, R(w * fw2 * 0.5), 1, 0x2a2422, 0.7);
  }
  // 铁砧：木墩 + 砧座 + 砧腰 + 砧面 + 右角喙 + 钳住的剑胚
  const ax = L.anvilX, ay = L.anvilY;
  pxRect(g, ax - R(34 * u), ay + R(14 * u), R(68 * u), R(4 * u), C.void, 0.4);
  pxRect(g, ax - R(18 * u), ay, R(36 * u), R(15 * u), 0x3a2a1c, 1);
  pxRect(g, ax - R(18 * u), ay, R(36 * u), 2, 0x6a5236, 0.9);
  pxRect(g, ax - R(18 * u), ay + R(15 * u), R(36 * u), 1, C.void, 0.6);
  for (let k = 0; k < 3; k++) pxRect(g, ax - R(15 * u), ay + R(4 * u) + k * R(4 * u), R(30 * u), 1, 0x1a1513, 0.5);
  pxRect(g, ax - R(13 * u), ay - R(7 * u), R(26 * u), R(7 * u), 0x2a2422, 1);
  pxRect(g, ax - R(7 * u), ay - R(12 * u), R(14 * u), R(5 * u), 0x2a2422, 1);
  pxRect(g, ax - R(24 * u), ay - R(19 * u), R(48 * u), R(7 * u), 0x5a5048, 1);
  silhouette(g, [{ x: ax + R(24 * u), y: ay - R(19 * u) }, { x: ax + R(35 * u), y: ay - R(17 * u) }, { x: ax + R(24 * u), y: ay - R(12 * u) }], 0x4a403a, 1);
  pxRect(g, ax - R(24 * u), ay - R(19 * u), R(48 * u), 1, 0xa89880, 1);
  pxRect(g, ax - R(24 * u), ay - R(19 * u), 1, R(6 * u), 0x8a7a68, 0.7);
  pxRect(g, ax - R(24 * u), ay - R(13 * u), R(48 * u), 1, C.void, 0.55);
  pxRect(g, ax - R(24 * u), ay - R(12 * u), R(48 * u), 1, 0x8a5a3a, 0.45);
  // 剑胚（三段热色，窄一些）+ 铁钳夹住
  for (let i = 0; i < 3; i++) pxRect(g, ax - R(18 * u) + i * R(10 * u), ay - R(22 * u), R(10 * u), R(3 * u), i === 2 ? C.arcaneLight : i === 1 ? C.arcane : 0xff8a4d, 0.95);
  pxLine(g, ax - R(20 * u), ay - R(23 * u), ax - R(32 * u), ay - R(28 * u), 0x8a7a68, 0.9, 2);
  pxLine(g, ax - R(20 * u), ay - R(20 * u), ax - R(32 * u), ay - R(28 * u), 0x8a7a68, 0.9, 2);
  // 吊链 + 铁钩 + 熔埚（悬在砧上方）
  const chx = R(w * 0.665);
  chain(g, { x: chx, y: 0, h: R(h * 0.40), color: 0x4a4442, alpha: 0.9, linkH: 5 });
  const cy = R(h * 0.40);
  pxRect(g, chx - 1, cy, 4, R(6 * u), 0x4a4442, 1);
  silhouette(g, [{ x: chx - R(11 * u), y: cy + R(6 * u) }, { x: chx + R(13 * u), y: cy + R(6 * u) }, { x: chx + R(9 * u), y: cy + R(17 * u) }, { x: chx - R(7 * u), y: cy + R(17 * u) }], 0x241f1d, 1);
  pxRect(g, chx - R(9 * u), cy + R(6 * u), R(20 * u), 1, 0x8a5a3a, 0.75);
  pxRect(g, chx - R(7 * u), cy + R(7 * u), R(16 * u), 2, C.arcaneLight, 0.85);
  pxRect(g, chx - R(7 * u), cy + R(17 * u), R(16 * u), 1, 0x6a5a52, 0.5);
  // 工作台（左侧）
  const wx = R(w * 0.05), ww = R(w * 0.16), wy = R(h * 0.66);
  pxRect(g, wx - R(2 * u), wy + R(5 * u), ww + R(4 * u), R(3 * u), C.void, 0.35);
  pxRect(g, wx, wy, ww, R(5 * u), 0x4a3826, 1);
  pxRect(g, wx, wy, ww, 1, 0x8a6a46, 0.9);
  pxRect(g, wx, wy + R(5 * u), ww, R(2 * u), 0x1a1513, 1);
  for (const lx of [wx + R(2 * u), wx + ww - R(5 * u)]) pxRect(g, lx, wy + R(6 * u), R(3 * u), R(h * 0.09), 0x3a2a1c, 1);
  pxRect(g, wx + R(2 * u), wy + R(h * 0.12), ww - R(4 * u), R(2 * u), 0x3a2a1c, 1);
  // 台上：铁钳（交叉）+ 小锤 + 三块铁锭
  pxLine(g, wx + R(5 * u), wy - R(2 * u), wx + R(21 * u), wy - R(9 * u), 0x8a7a68, 0.95, 2);
  pxLine(g, wx + R(6 * u), wy - R(9 * u), wx + R(21 * u), wy - R(2 * u), 0x8a7a68, 0.95, 2);
  pxRect(g, wx + R(28 * u), wy - R(3 * u), R(10 * u), 2, 0x5a4426, 1);
  pxRect(g, wx + R(36 * u), wy - R(7 * u), R(8 * u), R(5 * u), 0x4a403a, 1);
  for (let k = 0; k < 3; k++) pxRect(g, wx + R(48 * u) + k * R(6 * u), wy - R(2 * u) - k * 2, R(10 * u), 2, 0x4a4442, 1);
  // 煤堆 + 铁锹
  const cx = R(w * 0.29), cyy = gy - R(1 * u);
  pxRect(g, cx - R(18 * u), cyy - R(6 * u), R(36 * u), R(6 * u), 0x151010, 1);
  pxRect(g, cx - R(13 * u), cyy - R(11 * u), R(26 * u), R(5 * u), 0x1c1512, 1);
  pxRect(g, cx - R(7 * u), cyy - R(14 * u), R(14 * u), R(4 * u), 0x241a16, 1);
  for (let k = 0; k < 6; k++) pxRect(g, cx - R(15 * u) + k * R(5 * u), cyy - R(6 * u) - (k % 2) * 2, 3, 2, 0x2a2422, 0.9);
  pxLine(g, cx + R(6 * u), cyy - R(12 * u), cx + R(19 * u), cyy - R(30 * u), 0x5a4426, 1, 2);
  pxRect(g, cx + R(3 * u), cyy - R(13 * u), R(6 * u), R(7 * u), 0x3a3230, 1);
  // 淬火桶（右侧）：桶身 + 竖板缝 + 两道铁箍 + 水面 + 斜靠铁钳
  const tx = L.tankX, ty = L.tankY;
  pxRect(g, tx - R(17 * u), ty, R(34 * u), R(19 * u), 0x3a2a1c, 1);
  pxRect(g, tx - R(17 * u), ty, R(34 * u), 2, 0x6a5236, 0.9);
  for (let k = 0; k < 4; k++) pxRect(g, tx - R(17 * u) + R(6 * u) + k * R(7 * u), ty + 2, 1, R(17 * u), 0x241a12, 0.8);
  pxRect(g, tx - R(17 * u), ty + R(5 * u), R(34 * u), 2, 0x2a2422, 1);
  pxRect(g, tx - R(17 * u), ty + R(14 * u), R(34 * u), 2, 0x2a2422, 1);
  pxRect(g, tx - R(15 * u), ty + 1, R(30 * u), R(3 * u), 0x2f4a44, 1);
  pxRect(g, tx - R(15 * u), ty + 1, R(30 * u), 1, C.teal, 0.45);
  pxLine(g, tx - R(13 * u), ty - R(2 * u), tx - R(22 * u), ty + R(13 * u), 0x8a7a68, 0.9, 2);
  // 两只木桶（最右）
  for (let k = 0; k < 2; k++) {
    const ox = R(w * (0.90 + k * 0.055)), oy = R(h * (0.71 - k * 0.035));
    pxRect(g, ox, oy, R(14 * u), R(15 * u), 0x3a2a1c, 1);
    pxRect(g, ox, oy + R(4 * u), R(14 * u), 1, 0x241a12, 1);
    pxRect(g, ox, oy + R(10 * u), R(14 * u), 1, 0x241a12, 1);
  }
}

function forgeFore(g, L) {
  const { w, h, u } = L;
  fill(g, -L.B, R(h * 0.90), w + L.B * 2, h, 0x0f0b0a, 1);
  pxRect(g, -L.B, R(h * 0.90), w + L.B * 2, 1, 0x3a2a1c, 0.7);
  // 左下：砂轮架（整轮压在暗带上方）
  const gx = R(w * 0.10), gy = R(h * 0.985);
  disc(g, gx, gy - R(14 * u), R(24 * u), 0x2a2422, 1);
  disc(g, gx, gy - R(14 * u), R(15 * u), 0x3a3230, 1);
  pxRect(g, gx - R(4 * u), gy - R(16 * u), R(8 * u), R(4 * u), 0x1a1513, 1);
  pxRect(g, gx - R(19 * u), gy - R(14 * u), R(5 * u), R(16 * u), 0x3a2a1c, 1);
  pxRect(g, gx + R(14 * u), gy - R(14 * u), R(5 * u), R(16 * u), 0x3a2a1c, 1);
  pxRect(g, gx - R(21 * u), gy - 2, R(42 * u), R(5 * u), 0x241a16, 1);
  pxRect(g, gx - R(21 * u), gy - 2, R(42 * u), 1, 0x4a3a2a, 0.6);
  // 右下：铁锭堆
  for (let k = 0; k < 3; k++) pxRect(g, R(w * 0.76) + k * R(6 * u), R(h * 0.93) - k * R(4 * u), R(22 * u), R(4 * u), 0x4a403a, 1);
  pxRect(g, R(w * 0.76), R(h * 0.93), R(22 * u), 1, 0xa89880, 0.7);
  for (let k = 0; k < 2; k++) pxLine(g, R(w * (0.94 + k * 0.015)), R(h * 0.99), R(w * (0.90 + k * 0.015)), R(h * 0.87), 0x4a4442, 0.85, 2);
  // 落地的锤子（0.42w）
  pxRect(g, R(w * 0.38), R(h * 0.965), R(18 * u), 2, 0x5a4426, 1);
  pxRect(g, R(w * 0.38) + R(16 * u), R(h * 0.952), R(10 * u), R(6 * u), 0x3a3230, 1);
  // 铁屑、煤块、火星痕
  for (let i = 0; i < 12; i++) {
    const sx = R(w * (0.06 + (i * 0.073) % 0.86)), sy = R(h * (0.92 + (i % 4) * 0.018));
    pxRect(g, sx, sy, 2 + (i % 3), 1, i % 3 ? 0x4a403a : 0x8a7a68, 0.9);
  }
  for (let i = 0; i < 5; i++) pxRect(g, R(w * (0.18 + i * 0.16)), R(h * 0.955), 4, 3, 0x1c1512, 1);
  for (let i = 0; i < 6; i++) pxRect(g, R(w * (0.16 + i * 0.12)), R(h * (0.935 + (i % 2) * 0.015)), 1, 1, C.arcaneLight, 0.8);
}
function sunriseBack(g, L) {
  const { w, h, B, u } = L;
  const hz = L.horizon;
  const sx = R(w * 0.5), sy = hz;
  // 天空：五道硬边色带，从靛蓝推到地平线的暖玫瑰
  fill(g, -B, 0, w + B * 2, h, 0x120e22);
  const sky = [[0.00, 0.18, 0x161029], [0.18, 0.34, 0x241a38], [0.34, 0.46, 0x3a2340], [0.46, 0.55, 0x5e3144], [0.55, 0.60, 0x8a4a44]];
  for (const [a, b, col] of sky) fill(g, -B, R(h * a), w + B * 2, R(h * b) - R(h * a), col, 1);
  starfield(g, { x: -B, y: 0, w: w + B * 2, h: R(h * 0.40), seed: 61, count: L.tall ? 44 : 28, color: C.bone, bright: C.white, accent: C.brassLight, alpha: 0.7 });
  // 晨光：从日轮向斜上方发散的细射线（硬边 1px，不用整幅色块）
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue;
    const ex = sx + i * R(52 * u), ey = Math.max(0, sy - R(h * (0.30 + Math.abs(i) * 0.03)));
    thinLine(g, sx + i * R(8 * u), sy - R(6 * u), ex, ey, 0xf0c48a, 0.10);
  }
  // 远山两层：远层偏紫，近层压暗，山脊错开
  silhouette(g, [{ x: -B, y: hz }, { x: R(w * 0.10), y: R(h * 0.47) }, { x: R(w * 0.22), y: R(h * 0.52) }, { x: R(w * 0.34), y: R(h * 0.44) }, { x: R(w * 0.48), y: R(h * 0.51) }, { x: R(w * 0.62), y: R(h * 0.45) }, { x: R(w * 0.76), y: R(h * 0.52) }, { x: R(w * 0.90), y: R(h * 0.46) }, { x: w + B, y: hz }, { x: w + B, y: hz + R(10 * u) }, { x: -B, y: hz + R(10 * u) }], 0x4a2a44, 0.85);
  silhouette(g, [{ x: -B, y: hz + R(4 * u) }, { x: R(w * 0.08), y: R(h * 0.55) }, { x: R(w * 0.20), y: R(h * 0.585) }, { x: R(w * 0.31), y: R(h * 0.54) }, { x: R(w * 0.44), y: R(h * 0.59) }, { x: R(w * 0.58), y: R(h * 0.55) }, { x: R(w * 0.72), y: R(h * 0.59) }, { x: R(w * 0.86), y: R(h * 0.545) }, { x: w + B, y: hz + R(4 * u) }, { x: w + B, y: hz + R(14 * u) }, { x: -B, y: hz + R(14 * u) }], 0x2a1a30, 1);
  // 低日：压在山脊之上，三层同心硬边半圆 + 地平线亮线
  disc(g, sx, sy, R(36 * u), 0x8a4a44, 1);
  disc(g, sx, sy, R(26 * u), 0xc47a4a, 1);
  disc(g, sx, sy, R(16 * u), 0xf0c48a, 1);
  disc(g, sx, sy, R(9 * u), 0xffe6b0, 1);
  pxRect(g, sx - R(16 * u), sy - 2, R(32 * u), 2, C.white, 0.55);
  // 北斗七星（点；连线在动态层逐颗点亮）
  for (const [dx, dy] of L.dip) {
    pxDiamond(g, dx, dy, 3, C.brassLight, 0.9, false);
    pxDiamond(g, dx, dy, 1, C.white, 0.95, true);
  }
  // 两侧断柱：柱身 + 参差断口 + 柱头残块
  for (const [cx2, tw, ty, jag] of [[R(w * 0.095), R(15 * u), R(h * 0.26), 1], [R(w * 0.905), R(13 * u), R(h * 0.33), -1]]) {
    column(g, { cx: cx2, topY: ty, bottomY: R(h * 0.80), w: tw, shaft: 0x2b2447, light: 0x5a4a72, dark: C.void, capH: 4, baseH: 5, alpha: 1, flutes: 3 });
    for (let k = 0; k < 3; k++) pxRect(g, cx2 - tw / 2 + k * R(tw / 3), ty - R((k % 2) * 5 * u), R(tw / 3), R(6 * u), 0x2b2447, 1);
    pxRect(g, cx2 - tw / 2 + (jag > 0 ? 0 : R(tw * 0.5)), ty - R(9 * u), R(tw * 0.5), R(5 * u), 0x1d1733, 1);
    // 残旗：从柱身斜垂的两道布片
    silhouette(g, [{ x: cx2 + jag * R(tw * 0.4), y: ty + R(10 * u) }, { x: cx2 + jag * R(tw * 0.4) + jag * R(26 * u), y: ty + R(18 * u) }, { x: cx2 + jag * R(tw * 0.4) + jag * R(20 * u), y: ty + R(34 * u) }, { x: cx2 + jag * R(tw * 0.4), y: ty + R(30 * u) }], C.bloodDark, 0.55);
    pxRect(g, cx2 + jag * R(tw * 0.4), ty + R(10 * u), jag * R(26 * u), 1, 0x8a5a46, 0.5);
  }
  // 地平线亮线与地面底
  fill(g, -B, hz, w + B * 2, h - hz + B, 0x2a2038, 1);
  pxRect(g, -B, hz, w + B * 2, 1, 0xf0c48a, 0.55);
  pxRect(g, -B, hz + 1, w + B * 2, 1, 0xc47a4a, 0.35);
}

function sunriseMid(g, L) {
  const { w, h, u } = L;
  const hz = L.horizon, gy = L.ground;
  // 广场地面：从地平线铺到前景，暖灰紫
  fill(g, -L.B, hz + 2, w + L.B * 2, gy - hz + L.B, mix(0x241c30, 0x54304a, 0.45));
  for (let r = 0; r < 5; r++) {
    const y0 = hz + R((gy - hz) * Math.pow(r / 5, 1.3));
    const y1 = hz + R((gy - hz) * Math.pow((r + 1) / 5, 1.3));
    pxRect(g, -L.B, y0, w + L.B * 2, y1 - y0, r % 2 ? mix(0x241c30, C.void, 0.30) : mix(0x3a2a4a, 0x54304a, 0.35), 1);
    pxRect(g, -L.B, y0, w + L.B * 2, 1, C.void, 0.35);
  }
  // 日轮在广场上投出的三道同心光池（硬边椭圆环）
  const sx = R(w * 0.5);
  ellipseRing(g, sx, gy - R(6 * u), R(150 * u), R(16 * u), 0xf0c48a, 0.10);
  ellipseRing(g, sx, gy - R(6 * u), R(104 * u), R(11 * u), 0xf0c48a, 0.13);
  ellipseRing(g, sx, gy - R(6 * u), R(58 * u), R(6 * u), 0xf0c48a, 0.16);
  // 王座台阶（三级，宽度递减）
  steps(g, { cx: L.throneX, y: gy - R(4 * u), w: R(96 * u), count: 3, rise: R(5 * u), color: 0x2b2447, light: 0x5a4a72, alpha: 1 });
  // 断王座：座体 + 三截断背 + 左扶手 + 右断桩 + 座面塌陷
  const tx = L.throneX, base = gy - R(19 * u);
  pxRect(g, tx - R(32 * u), base - R(30 * u), R(64 * u), R(30 * u), 0x1d1733, 1);
  pxRect(g, tx - R(32 * u), base - R(30 * u), 2, R(30 * u), 0x8a7a9a, 0.35);
  pxRect(g, tx - R(32 * u), base - R(30 * u), R(64 * u), 2, 0x6a5a82, 0.8);
  // 座面
  pxRect(g, tx - R(38 * u), base - R(12 * u), R(76 * u), R(8 * u), 0x2b2447, 1);
  pxRect(g, tx - R(38 * u), base - R(12 * u), R(76 * u), 1, 0x8a7a9a, 0.6);
  pxRect(g, tx - R(14 * u), base - R(11 * u), R(30 * u), R(3 * u), C.void, 0.45);
  // 三截断背：左截尖刺、中截塌落、右截悬空
  pxRect(g, tx - R(34 * u), base - R(52 * u), R(10 * u), R(22 * u), 0x1d1733, 1);
  pxRect(g, tx - R(30 * u), base - R(58 * u), R(4 * u), R(8 * u), 0x1d1733, 0.95);
  pxRect(g, tx - R(22 * u), base - R(48 * u), R(6 * u), R(8 * u), 0x1d1733, 0.9);
  pxRect(g, tx + R(2 * u), base - R(46 * u), R(10 * u), R(14 * u), 0x1d1733, 0.95);
  pxRect(g, tx + R(14 * u), base - R(54 * u), R(5 * u), R(12 * u), 0x1d1733, 0.9);
  pxRect(g, tx + R(20 * u), base - R(40 * u), R(12 * u), R(8 * u), 0x1d1733, 0.85);
  // 左扶手完整、右扶手只剩断桩
  pxRect(g, tx - R(38 * u), base - R(28 * u), R(8 * u), R(16 * u), 0x2b2447, 1);
  pxRect(g, tx - R(38 * u), base - R(28 * u), R(8 * u), 2, 0x8a7a9a, 0.6);
  pxRect(g, tx + R(32 * u), base - R(20 * u), R(9 * u), R(8 * u), 0x2b2447, 1);
  pxRect(g, tx + R(33 * u), base - R(20 * u), R(7 * u), 1, 0x8a7a9a, 0.55);
  // 座体裂缝与枯藤
  cracks(g, { x: tx - R(16 * u), y: base - R(26 * u), len: R(12 * u), seed: 71, color: C.void, alpha: 0.8, branches: 0, drift: 4 });
  cracks(g, { x: tx + R(6 * u), y: base - R(24 * u), len: R(10 * u), seed: 72, color: C.void, alpha: 0.75, branches: 0, drift: 3 });
  for (let i = 0; i < 3; i++) {
    pxRect(g, tx - R(28 * u) + i * R(22 * u), base - R(28 * u), 1, R(14 * u), C.rot, 0.5);
    pxRect(g, tx - R(30 * u) + i * R(22 * u), base - R(16 * u), R(6 * u), 1, C.rot, 0.4);
  }
  // 阶前断剑：剑身插地 + 横护手 + 断口
  const swX = tx - R(52 * u);
  pxRect(g, swX - R(2 * u), gy - R(40 * u), R(4 * u), R(30 * u), 0x6a5a82, 1);
  pxRect(g, swX - R(2 * u), gy - R(40 * u), 1, R(30 * u), 0xb0a0c0, 0.7);
  pxRect(g, swX - R(9 * u), gy - R(41 * u), R(18 * u), R(3 * u), 0x8a7a9a, 1);
  pxRect(g, swX - R(2 * u), gy - R(46 * u), R(4 * u), R(6 * u), 0x5a4a72, 1);
  pxRect(g, swX - R(3 * u), gy - R(46 * u), R(6 * u), 1, 0x8a7a9a, 0.8);
  // 台阶上的弃冠
  const crX = tx - R(40 * u), crY = gy - R(8 * u);
  pxRect(g, crX - R(7 * u), crY, R(14 * u), R(4 * u), C.brassDark, 1);
  pxRect(g, crX - R(7 * u), crY, R(14 * u), 1, C.brassLight, 0.9);
  for (let k = 0; k < 3; k++) pxRect(g, crX - R(6 * u) + k * R(5 * u), crY - R(3 * u), R(3 * u), R(3 * u), C.brass, 1);
  // 散落碎石与两方残碑
  rubble(g, { x: tx - R(90 * u), y: gy - R(4 * u), w: R(180 * u), h: R(12 * u), seed: 74, color: 0x3a3150, color2: 0x6a5a82, count: 14, alpha: 0.95 });
  for (const [sx2, sy2] of [[R(w * 0.22), R(h * 0.72)], [R(w * 0.80), R(h * 0.71)]]) {
    pxRect(g, sx2 - R(9 * u), sy2 - R(26 * u), R(18 * u), R(26 * u), 0x3a3150, 1);
    pxRect(g, sx2 - R(9 * u), sy2 - R(26 * u), R(18 * u), 2, 0x8a7a9a, 0.6);
    pxRect(g, sx2 - R(4 * u), sy2 - R(21 * u), R(8 * u), 1, C.ink, 0.5);
    pxRect(g, sx2 - R(5 * u), sy2 - R(17 * u), R(10 * u), 1, C.ink, 0.4);
  }
}

function sunriseFore(g, L) {
  const { w, h, u } = L;
  const top = R(h * (L.tall ? 0.88 : 0.90));
  fill(g, -L.B, top, w + L.B * 2, h - top + L.B, 0x1a1424, 1);
  pxRect(g, -L.B, top, w + L.B * 2, 1, C.brassLight, 0.18);
  // 左下：倒卧的柱段（柱身横躺 + 柱头残块 + 断口碎石）
  const cx0 = R(w * 0.02), cy0 = R(h * 0.93);
  pxRect(g, cx0, cy0 - R(14 * u), R(96 * u), R(14 * u), 0x2b2447, 1);
  pxRect(g, cx0, cy0 - R(14 * u), R(96 * u), 1, 0x8a7a9a, 0.4);
  for (let k = 0; k < 5; k++) pxRect(g, cx0 + R(10 * u) + k * R(16 * u), cy0 - R(13 * u), 1, R(12 * u), 0x1d1733, 0.6);
  pxRect(g, cx0 + R(96 * u), cy0 - R(18 * u), R(14 * u), R(18 * u), 0x2b2447, 1);
  pxRect(g, cx0 + R(96 * u), cy0 - R(18 * u), R(14 * u), 2, 0x8a7a9a, 0.5);
  rubble(g, { x: cx0 + R(108 * u), y: cy0 - R(6 * u), w: R(70 * u), h: R(10 * u), seed: 75, color: 0x2b2447, color2: 0x5a4a72, count: 7, alpha: 0.9 });
  // 右侧：半截断柱 + 残旗
  pxRect(g, R(w * 0.90), R(h * 0.74), R(20 * u), h - R(h * 0.74), 0x2b2447, 1);
  pxRect(g, R(w * 0.90), R(h * 0.74), R(20 * u), 2, 0x8a7a9a, 0.45);
  pxRect(g, R(w * 0.90) + R(6 * u), R(h * 0.74) - R(6 * u), R(8 * u), R(6 * u), 0x1d1733, 1);
  silhouette(g, [{ x: R(w * 0.90), y: R(h * 0.76) }, { x: R(w * 0.90) + R(18 * u), y: R(h * 0.78) }, { x: R(w * 0.90) + R(12 * u), y: R(h * 0.86) }, { x: R(w * 0.90), y: R(h * 0.84) }], C.bloodDark, 0.5);
  // 草簇（晨光下偏暖）
  for (let i = 0; i < 5; i++) {
    const gx = R(w * (0.26 + i * 0.14)), gy = R(h * (0.945 + (i % 2) * 0.015));
    for (let k = 0; k < 3; k++) pxRect(g, gx + k * 2, gy - R(h * 0.035) - k * 2, 1, R(h * 0.035) + k * 2, 0x6a7a46, 0.75);
  }
}
function bellAt(g, px, py, ang, u, warm) {
  const rope = R(14 * u);
  const bx = R(px + Math.sin(ang) * rope);
  const by = R(py + Math.cos(ang) * rope);
  pxRect(g, px - 1, py, 3, R(4 * u), C.brassDark, 0.9);
  pxLine(g, px, py, bx, by, C.brassDark, 0.75, 1);
  const hw = R(12 * u), hh = R(20 * u);
  silhouette(g, [
    { x: bx - R(5 * u), y: by - hh }, { x: bx + R(5 * u), y: by - hh },
    { x: bx + R(8 * u), y: by - R(hh * 0.45) }, { x: bx + hw, y: by - 2 },
    { x: bx - hw, y: by - 2 }, { x: bx - R(8 * u), y: by - R(hh * 0.45) },
  ], warm || C.brass, 0.96);
  pxRect(g, bx - R(hw * 0.8), by - R(hh * 0.62), R(hw * 1.6), 1, C.brassLight, 0.5);
  pxRect(g, bx - hw, by - 2, hw * 2, 1, C.brassDark, 0.95);
  pxRect(g, bx - 1, by - 2, 2, R(9 * u), C.brassDark, 0.95);
  pxRect(g, bx - 3, by + R(7 * u), 6, 2, C.brassDark, 0.9);
}

function bookPage(g, x, y, a, tilt) {
  pxRect(g, R(x), R(y), 7, 1, C.parchment, 0.75 * a);
  pxRect(g, R(x) + 1, R(y) + 1, 5, 1, C.bone, 0.45 * a);
  if (tilt > 0) pxRect(g, R(x) + 6, R(y) - 1, 1, 1, C.brassDark, 0.5 * a);
  if (tilt < 0) pxRect(g, R(x), R(y) - 1, 1, 1, C.brassDark, 0.5 * a);
}

function dynSwamp(g, ctx) {
  const { w, h, t, p } = ctx;
  const L = journeyLayout('swamp', w, h);
  const P = journeyPan(p);
  // 一、吊钟：钟摆一个来回，钟口亮边
  const sway = Math.sin(clamp01((p - 0.10) / 0.48) * Math.PI * 2) * 0.30 * clamp01((p - 0.06) / 0.10);
  bellAt(g, L.bellX - P.mid, L.bellY, sway, L.u);
  // 二、钟声三圈波纹扩散到水面
  const rp = clamp01((p - 0.44) / 0.36);
  for (let i = 0; i < 3; i++) {
    const q = clamp01(rp * 1.5 - i * 0.22);
    if (q <= 0.001 || q >= 1) continue;
    const rr = R(L.w * 0.05 + q * L.w * 0.45);
    ellipseRing(g, L.roseX - P.back, L.horizon + R(6 * L.u), rr, R(rr * 0.18), C.swampGlint, 0.38 * (1 - q), 26);
  }
  // 三、彩窗点亮 → 光柱显形 → 亮着留存
  const lit = clamp01((p - 0.42) / 0.20);
  if (lit > 0) {
    disc(g, L.roseX - P.back, L.roseY, L.roseR, C.teal, 0.30 * lit);
    disc(g, L.roseX - P.back, L.roseY, R(L.roseR * 0.45), C.white, 0.55 * lit);
    pxRect(g, L.roseX - P.back - 1, L.roseY - L.roseR - 2, 2, 2, C.white, 0.7 * lit);
    for (let i = 0; i < 3; i++) {
      const sx = R(L.w * (0.17 + i * 0.26)) - P.back;
      fill(g, sx - 10, L.winBaseY, 20, L.horizon - L.winBaseY, C.swampGlint, 0.05 * lit);
    }
  }
  // 四、倒影抖动后稳住
  const shake = (1 - clamp01((p - 0.58) / 0.30)) * (1 + Math.abs(Math.sin(t * 0.02)));
  for (let i = 0; i < 5; i++) {
    const rx = R(L.roseX - P.back - 30 + i * 15 + shake * ((i % 2) ? 2 : -2));
    const ry = L.horizon + R(8 + i * 5 * L.u);
    pxRect(g, rx, ry, 3, R(2 + (i % 3)), i % 2 ? C.swampGlint : C.teal, 0.30 - i * 0.035);
  }
  // 五、雾起 → 漫 → 定
  fog(g, L, p, C.fog, 0.42, L.horizon - R(8 * L.u));
  // 六、主角前行 + 水面倒影
  const hx = R(w * 0.18 + p * w * 0.30);
  hero(g, hx, L.walkY, 1);
  pxRect(g, hx - 4, L.walkY + 2, 8, 10, C.ink, 0.16);
  // 七、浮尘
  for (let i = 0; i < 5; i++) {
    pxRect(g, R(L.w * (0.12 + i * 0.18) + Math.sin(t * 0.002 + i) * 6), R(L.horizon - 10 - i * 3), 1, 1, C.swampGlint, 0.4);
  }
}

function dynStar(g, ctx) {
  const { w, h, t, p } = ctx;
  const L = journeyLayout('star', w, h);
  const P = journeyPan(p);
  const cx2 = L.ringX - P.back, cy2 = L.ringY;
  // 一、星纹环旋转 4°（外 24 刻度 + 内 12 刻度 + 三菱形）
  const rot = clamp01(p / 0.40) * 0.07;
  for (let bandI = 0; bandI < 2; bandI++) {
    const rr = bandI ? R(L.ringR * 0.62) : L.ringR;
    const n = bandI ? 12 : 24;
    for (let i = 0; i < n; i++) {
      const a = rot * (bandI ? -1.4 : 1) + (i / n) * Math.PI * 2;
      pxRect(g, R(cx2 + Math.cos(a) * rr), R(cy2 + Math.sin(a) * rr), 1, 1, i % 4 ? C.runeDim : C.runeCold, bandI ? 0.45 : 0.7);
    }
  }
  for (let i = 0; i < 3; i++) {
    const a = rot + (i / 3) * Math.PI * 2;
    pxDiamond(g, R(cx2 + Math.cos(a) * L.ringR * 0.82), R(cy2 + Math.sin(a) * L.ringR * 0.82), 3, C.runeCold, 0.6, false);
  }
  // 二、陨星划过
  const mp = clamp01((p - 0.20) / 0.30);
  if (mp > 0 && mp < 1) {
    const hx = R(L.w * 0.88 - mp * L.w * 0.40), hy = R(h * 0.06 + mp * h * 0.34);
    for (let i = 1; i <= 4; i++) pxRect(g, hx + i * 4, hy - i * 3, 3, 1, C.runeCold, 0.45 - i * 0.09);
    pxRect(g, hx, hy, 2, 2, C.white, 0.95);
    pxRect(g, hx - 1, hy + 1, 1, 1, C.runeCold, 0.7);
  }
  // 三、陨坑亮一次后暗下
  const flash = Math.sin(clamp01((p - 0.50) / 0.36) * Math.PI);
  if (flash > 0) {
    ellipseRing(g, L.craterX - P.mid, L.craterY, R(52 * L.u), R(13 * L.u), C.runeCold, 0.5 * flash, 26);
    ellipseRing(g, L.craterX - P.mid, L.craterY, R(30 * L.u), R(7 * L.u), C.white, 0.4 * flash, 20);
    for (let i = 0; i < 4; i++) pxRect(g, L.craterX - P.mid - 20 + i * 13, L.craterY - 3, 2, 1, C.runeCold, 0.5 * flash);
  }
  // 四、碎晶微光
  for (let i = 0; i < 5; i++) {
    pxRect(g, R(L.w * (0.18 + i * 0.16)) - P.mid, L.ground + R((i % 3) * 5) - R(10 * L.u), 1, 1, C.runeCold, 0.35 + 0.25 * Math.sin(t * 0.004 + i * 1.7));
  }
  // 五、主角
  const hx = R(w * 0.20 + p * w * 0.26);
  hero(g, hx, L.walkY, 1);
  pxRect(g, hx - 3, L.walkY + 2, 6, 4, C.ink, 0.18);
  // 六、星尘
  for (let i = 0; i < 6; i++) {
    pxRect(g, R(L.w * (0.08 + i * 0.15) + Math.sin(t * 0.0015 + i * 2) * 4), R(h * (0.08 + (i % 3) * 0.08)), 1, 1, C.runeCold, 0.45);
  }
}

function dynLibrary(g, ctx) {
  const { w, h, t, p } = ctx;
  const L = journeyLayout('library', w, h);
  const P = journeyPan(p);
  // 一、书页翻飞 3 页
  const fly = clamp01((p - 0.10) / 0.50);
  for (let i = 0; i < 8; i++) {
    const sp = 0.6 + (i % 3) * 0.25;
    const px2 = ((i * 67 + t * 0.03 * sp + p * 40) % (w + 40)) - 20;
    const py2 = R(h * 0.16 + (i % 5) * h * 0.09) + R(Math.sin(t * 0.002 + i * 1.3) * 5);
    bookPage(g, px2, py2, i < 3 ? 0.55 + 0.45 * fly : 0.4, i % 2 ? 1 : -1);
    if (i < 3) bookPage(g, px2 + (i % 2 ? 2 : -2), py2 + 2, 0.3, 0);
  }
  // 二、铜钟自鸣一次
  const swing = Math.sin(clamp01((p - 0.44) / 0.22) * Math.PI * 2) * 0.18 * clamp01((p - 0.40) / 0.08);
  bellAt(g, L.bellX - P.mid, L.bellY, swing, L.u * 0.8, C.brassLight);
  const ringP = clamp01((p - 0.46) / 0.22);
  if (ringP > 0 && ringP < 1) {
    for (let i = 0; i < 2; i++) {
      const q = clamp01(ringP * 1.3 - i * 0.25);
      if (q <= 0 || q >= 1) continue;
      ellipseRing(g, L.bellX - P.mid, L.bellY + R(10 * L.u), R(10 + q * 60), R(3 + q * 10), C.brassLight, 0.35 * (1 - q), 20);
    }
  }
  // 三、三页落回阅读台
  const land = clamp01((p - 0.62) / 0.26);
  if (land > 0) {
    for (let i = 0; i < 3; i++) {
      const t0 = clamp01(land * 1.6 - i * 0.2);
      bookPage(g, L.deskX - P.mid - 8 + i * 8, R(L.deskY - 6 - (1 - t0) * 26), 0.9, i % 2 ? 1 : -1);
    }
  }
  // 四、吊灯四烛火苗
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const fx = R(L.chandX - P.mid + Math.cos(a) * 12 * L.u), fy = R(L.chandY + Math.sin(a) * 6 * L.u) - R(6 * L.u);
    const fl = 1 + Math.round(Math.sin(t * 0.01 + i * 2) * 1);
    pxRect(g, fx, fy - fl, 2, 2 + fl, C.arcaneLight, 0.9);
    pxRect(g, fx, fy, 2, 1, C.arcane, 0.95);
  }
  // 五、光柱浮尘
  for (let i = 0; i < 6; i++) {
    pxRect(g, R(L.w * (0.42 + (i % 3) * 0.06) + Math.sin(t * 0.002 + i) * 5), R(h * (0.22 + i * 0.07)), 1, 1, C.bone, 0.5);
  }
  // 六、主角
  hero(g, R(w * 0.20 + p * w * 0.28), L.walkY, 1);
}

function dynCourt(g, ctx) {
  const { w, h, t, p } = ctx;
  const L = journeyLayout('court', w, h);
  const P = journeyPan(p);
  const bx = L.balX - P.mid, by = L.balY, half = R(30 * L.u);
  // 一、天平倾斜到一侧
  const tilt = 0.22 * clamp01((p - 0.12) / 0.30);
  const dy = R(Math.sin(tilt) * half);
  const ly = by - L.balH + R(2 * L.u);
  pxRect(g, bx - 2, ly, 4, 3, C.brass, 0.95);
  pxLine(g, bx - half, ly - dy, bx + half, ly + dy, C.brass, 0.95, 2);
  pxLine(g, bx - half, ly - dy - 1, bx + half, ly + dy - 1, C.brassLight, 0.55, 1);
  for (const s of [-1, 1]) {
    const ex = bx + s * half, ey = ly + s * dy;
    const pl = R(15 * L.u);
    chain(g, { x: ex, y: ey, h: pl, color: C.brassDark, alpha: 0.85, linkH: 3 });
    pxRect(g, ex - R(8 * L.u), ey + pl, R(16 * L.u), R(3 * L.u), C.brass, 0.9);
    pxRect(g, ex - R(8 * L.u), ey + pl, R(16 * L.u), 1, C.white, 0.35);
    pxRect(g, ex - R(8 * L.u), ey + pl + R(3 * L.u), 1, R(4 * L.u), C.brassDark, 0.8);
    pxRect(g, ex + R(8 * L.u) - 1, ey + pl + R(3 * L.u), 1, R(4 * L.u), C.brassDark, 0.8);
    pxRect(g, ex - R(8 * L.u), ey + pl + R(7 * L.u), R(16 * L.u), 1, C.brassDark, 0.7);
  }
  // 二、判词卷从右盘滚落到栏杆
  const fp = clamp01((p - 0.55) / 0.30);
  if (fp > 0) {
    const sx = bx + half * (1 - fp) + R(w * 0.30) * fp;
    const sy = ly + dy + R(22 * L.u) + (L.railY - ly - dy - R(22 * L.u)) * fp * fp;
    const roll = R(Math.sin(fp * 12) * 2);
    pxRect(g, sx, sy + roll, R(16 * L.u), R(3 * L.u), C.parchment, 0.95);
    pxRect(g, sx + R(2 * L.u), sy + roll + 1, R(12 * L.u), 1, C.bone, 0.6);
    pxRect(g, sx + R(13 * L.u), sy + roll, 2, R(3 * L.u), C.blood, 0.9);
    if (fp > 0.75) {
      const dustA = 1 - clamp01((fp - 0.75) / 0.25);
      for (let i = 0; i < 4; i++) pxRect(g, sx - 4 + i * 4, L.railY - 4 - (i % 2) * 3, 2, 1, C.fog, 0.4 * dustA);
    }
  }
  // 三、栏杆落定微震
  const settle = clamp01((p - 0.80) / 0.10);
  if (settle > 0 && settle < 1) {
    const off = Math.round(Math.sin(t * 0.08));
    pxRect(g, 0, L.railY - 1 + off, w, 1, C.white, 0.25 * (1 - settle));
  }
  // 四、判词碑刻字逐块亮起
  for (let i = 0; i < 3; i++) {
    const lit = clamp01((p - 0.62 - i * 0.08) / 0.14);
    if (lit <= 0) continue;
    for (let r = 0; r < 3; r++) pxRect(g, L.steleXs[i] - P.back - R(6 * L.u), R(h * 0.41) + r * R(h * 0.05), R(12 * L.u), 1, C.arcaneLight, 0.55 * lit);
  }
  // 五、火盆火光
  for (const fx of [R(w * 0.08), R(w * 0.90)]) {
    const fl = 2 + Math.round(Math.sin(t * 0.01 + fx) * 1);
    pxRect(g, fx - 3, R(h * 0.63) - fl, 7, fl + 2, C.arcane, 0.55);
    pxRect(g, fx - 2, R(h * 0.63) - fl - 2, 5, 2, C.arcaneLight, 0.7);
  }
  // 六、主角
  hero(g, R(w * 0.16 + p * w * 0.24), L.walkY, 1);
}

function dynForge(g, ctx) {
  const { w, h, t, p } = ctx;
  const L = journeyLayout('forge', w, h);
  const P = journeyPan(p);
  const fx = L.forgeX - P.back, fy = L.forgeY, fw = L.forgeW, fh = L.forgeH;
  // 一、炉火：三簇并排的阶梯火舌 + 底部窄亮核（硬边，不用渐变）
  const ramp = clamp01(p / 0.40);
  const flick = Math.round(Math.sin(t * 0.012) * 2);
  const tongues = [[-0.26, 0.58, 0x6b2a14, 1.0], [-0.05, 0.90, 0xb04a1c, 0.95], [0.17, 0.70, 0xff8a4d, 0.9]];
  for (let i = 0; i < tongues.length; i++) {
    const off = tongues[i][0], hf = tongues[i][1], col = tongues[i][2], a = tongues[i][3];
    const ww = R(fw * 0.32);
    const hh = R(fh * hf * (0.42 + 0.58 * ramp)) + (i === 1 ? flick : 0);
    const bx = R(fx + off * fw - ww / 2);
    pxRect(g, bx, fy - hh, ww, hh, col, a);
    pxRect(g, bx + R(ww * 0.26), fy - hh - R(hh * 0.14), R(ww * 0.48), R(hh * 0.14), col, a);
    pxRect(g, bx + R(ww * 0.40), fy - hh - R(hh * 0.22), R(ww * 0.20), R(hh * 0.08), col, a * 0.9);
  }
  const coreH = R(fh * 0.30 * (0.5 + 0.5 * ramp));
  pxRect(g, fx - R(fw * 0.11), fy - coreH, R(fw * 0.22), coreH, 0xffd98a, 0.92);
  pxRect(g, fx - R(fw * 0.05), fy - coreH - R(coreH * 0.22), R(fw * 0.10), R(coreH * 0.22), 0xffd98a, 0.85);
  // 炉膛底的余烬带
  pxRect(g, fx - R(fw * 0.30), fy - R(4 * L.u), R(fw * 0.60), R(4 * L.u), C.arcane, 0.5 * (0.4 + 0.6 * ramp));
  // 二、铁锤砸落一次（震屏 1px）
  const strike = clamp01((p - 0.28) / 0.24);
  const hitting = p > 0.50 && p < 0.62;
  const shake = hitting ? (Math.round(Math.sin(t * 0.4)) || 1) : 0;
  const ang = -0.95 + 1.55 * (strike * strike * (3 - 2 * strike));
  const hlen = R(30 * L.u);
  const hpx = L.hamX - P.mid + shake, hpy = L.hamY;
  const hx = R(hpx + Math.sin(ang) * hlen), hy = R(hpy + Math.cos(ang) * hlen);
  pxLine(g, hpx, hpy, hx, hy, 0x4a3826, 1, 2);
  pxRect(g, hx - R(6 * L.u), hy - R(3 * L.u), R(12 * L.u), R(6 * L.u), 0x2a2422, 1);
  pxRect(g, hx - R(6 * L.u), hy - R(3 * L.u), R(12 * L.u), 1, 0x7a6a5c, 0.7);
  // 三、火星升腾后落地熄灭
  const sp = clamp01((p - 0.52) / 0.36);
  if (sp > 0) {
    const rng = makeRng(0x51);
    for (let i = 0; i < 10; i++) {
      const dx = (rng() - 0.5) * 2, up = 6 + rng() * 26, drop = 26 + rng() * 24;
      const ex = R(L.anvilX - P.mid + dx * sp * 34);
      const ey = R(L.anvilY - 12 - up * sp + drop * sp * sp);
      const a = 1 - sp * 0.9;
      if (ey < h) pxRect(g, ex, ey, 1, 1, i % 3 ? C.arcane : C.arcaneLight, a);
      if (sp > 0.7 && i < 5) pxRect(g, ex, L.walkY - 2 + (i % 2), 2, 1, 0x6b2a14, 0.6);
    }
  }
  // 四、淬火槽蒸汽
  const steam = clamp01((p - 0.68) / 0.30);
  if (steam > 0) {
    for (let i = 0; i < 3; i++) {
      pxRect(g, L.tankX - P.mid - R(5 * L.u) + i * 3, R(L.tankY - 4 - steam * (10 + i * 6)), R(10 - i * 2), 2, C.fog, 0.18 * steam);
    }
  }
  // 五、拱口煤烟
  for (let i = 0; i < 4; i++) {
    pxRect(g, fx - 6 + i * 4, R(fy - fh - 10 - ((t * 0.02 + i * 17) % 40)), 5, 2, 0x3a3230, 0.20);
  }
  // 六、主角
  hero(g, R(w * 0.18 + p * w * 0.26), L.walkY, 1);
}

function dynSunrise(g, ctx) {
  const { w, h, t, p } = ctx;
  const L = journeyLayout('sunrise', w, h);
  const P = journeyPan(p);
  // 一、晨光射线随进度拉长（从日轮发散，不用整幅色块）
  const grow = clamp01(p / 0.55);
  const sx = R(w * 0.5), sy = L.horizon;
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue;
    const len = R(h * (0.10 + 0.26 * grow) * (1 - Math.abs(i) * 0.12));
    const ex = sx + i * R(56 * L.u), ey = Math.max(0, sy - len - Math.abs(i) * R(6 * L.u));
    thinLine(g, sx + i * R(8 * L.u), sy - R(4 * L.u), ex, ey, C.brassLight, 0.10 + 0.10 * grow);
  }
  pxRect(g, -L.B, sy - 1, w + L.B * 2, 1, C.white, 0.10 + 0.22 * grow);
  // 二、北斗连线逐星点亮
  const links = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]];
  for (let i = 0; i < links.length; i++) {
    const lit = clamp01((p - 0.30 - i * 0.06) / 0.12);
    if (lit <= 0) continue;
    const a = L.dip[links[i][0]], b = L.dip[links[i][1]];
    pxLine(g, a[0] - P.back, a[1], a[0] - P.back + (b[0] - a[0]) * lit, a[1] + (b[1] - a[1]) * lit, C.brassLight, 0.5);
  }
  const on = clamp01((p - 0.26) / 0.30);
  if (on > 0) {
    for (const d of L.dip) {
      pxRect(g, d[0] - P.back - 2, d[1] - 2, 5, 1, C.white, 0.18 * on);
      pxRect(g, d[0] - P.back, d[1] - 2, 1, 5, C.white, 0.18 * on);
    }
  }
  // 三、光池铺满地面
  const pool = clamp01((p - 0.45) / 0.45);
  if (pool > 0) {
    for (let i = 0; i < 3; i++) ellipseRing(g, R(w * 0.5), R(h * (0.95 - i * 0.02)), R((60 + i * 54) * L.u), R((8 + i * 6) * L.u), C.brassLight, 0.22 * pool, 24);
    fill(g, -L.B, L.throneY + R(10 * L.u), w + L.B * 2, R(h * 0.16), C.brassLight, 0.06 * pool);
    for (let i = 0; i < 5; i++) pxRect(g, R(w * (0.14 + i * 0.18)), R(h * (0.90 + (i % 2) * 0.03)), 2, 1, C.white, 0.4 * pool);
  }
  // 四、光带内浮尘（只在光带内）
  for (let i = 0; i < 8; i++) {
    pxRect(g, R(w * (0.10 + i * 0.11) + Math.sin(t * 0.002 + i) * 4) - P.back, L.horizon - R(h * (0.03 + (i % 4) * 0.02)), 1, 1, C.brassLight, 0.45);
  }
  // 五、主角剪影与王座轮廓高光
  const hx = R(w * 0.22 + p * w * 0.26);
  hero(g, hx, L.walkY, 1);
  pxRect(g, L.throneX - P.mid - R(26 * L.u), L.throneY - R(66 * L.u), 2, R(50 * L.u), C.brassLight, 0.25);
  pxRect(g, hx + 4, L.walkY - R(13 * L.u), 1, R(9 * L.u), C.brassLight, 0.5);
}

// ---------- 导出：静态三层 + 每帧动态 ----------
export const JOURNEY_STATIC = {
  swamp: { back: swampBack, mid: swampMid, fore: swampFore },
  star: { back: starBack, mid: starMid, fore: starFore },
  library: { back: libraryBack, mid: libraryMid, fore: libraryFore },
  court: { back: courtBack, mid: courtMid, fore: courtFore },
  forge: { back: forgeBack, mid: forgeMid, fore: forgeFore },
  sunrise: { back: sunriseBack, mid: sunriseMid, fore: sunriseFore },
};

export const JOURNEY_STAGES = {
  swamp: dynSwamp,
  star: dynStar,
  library: dynLibrary,
  court: dynCourt,
  forge: dynForge,
  sunrise: dynSunrise,
};
