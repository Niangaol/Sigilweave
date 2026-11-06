// 过场演出的程序化像素美术：只画硬边色块，不用图片、不用渐变、不用滤镜。
// 所有函数都是「清空由调用方负责」的纯绘制：CutsceneScene 每帧决定阶段，这里决定画什么。
import { C, pxRect, pxLine, pxRing, pxDiamond, drawGlyph } from './Palette.js';

export const clamp01 = v => Math.max(0, Math.min(1, Number(v) || 0));
export const easeOutCubic = t => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInOutCubic = t => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

export function makeRng(seed) {
  let s = (seed >>> 0) || 2;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// 固定种子的浮尘：每帧只更新位置，不新建对象，避免过场里制造 GC 抖动。
export function buildDust(seed, count, w, h) {
  const rng = makeRng(seed);
  return Array.from({ length: count }, (_, i) => ({
    x: rng() * w,
    y: rng() * h,
    speed: 4 + rng() * 15,
    phase: rng() * Math.PI * 2,
    size: rng() > 0.84 ? 2 : 1,
    tone: i % 5,
  }));
}

// 盖场/揭场：底色不是纯黑，而是「祭坛的暗紫 + 当幕主题色」，
// 这样换场过程中画面始终有材质，不会出现一帧全黑。
export function drawVeil(g, { w, h, cover, tint, kind }) {
  const a = easeInOutCubic(cover);
  g.clear();
  if (a <= 0) return;
  pxRect(g, 0, 0, w, h, C.nightDeep, a);
  pxRect(g, 0, 0, w, h, tint, 0.18 * a);
  // 竖向硬边墙带：像素祭坛的墙面感
  for (let x = 0; x < w; x += 48) pxRect(g, x, 0, 24, h, C.ink, 0.12 * a);
  // 顶部与底部压暗，让标题卡落在中间时更有纵深
  pxRect(g, 0, 0, w, Math.round(h * 0.1), C.void, 0.45 * a);
  pxRect(g, 0, h - Math.round(h * 0.1), w, Math.round(h * 0.1), C.void, 0.45 * a);
  if (kind === 'death') {
    pxRect(g, 0, 0, w, h, C.bloodDark, 0.34 * a);
    pxRect(g, 0, 0, w, 26, C.blood, 0.16 * a);
    pxRect(g, 0, h - 26, w, 26, C.blood, 0.16 * a);
  }
  if (kind === 'victory') pxRect(g, 0, 0, w, h, C.brass, 0.06 * a);
}

// 三幕剪影舞台。act 决定墓园/教堂/王庭；kind 追加「契约解除 / 熄灭 / 终结」的专属事件。
export function drawStage(g, { w, h, kind, act, veil, t, accent }) {
  const stageA = clamp01((veil - 0.42) / 0.58);
  g.clear();
  if (stageA <= 0.01) return;
  const horizon = Math.round(h * 0.62);
  const A = stageA;

  // 地面与透视缝
  pxRect(g, 0, horizon, w, h - horizon, C.ink, 0.94 * A);
  pxRect(g, 0, horizon, w, 2, C.groove, 0.55 * A);
  for (let i = 1; i <= 5; i++) {
    const y = Math.round(horizon + (h - horizon) * (i / 6));
    pxLine(g, 0, y, w, y, C.stoneDark, 0.28 * A, 1);
  }
  for (let i = -6; i <= 6; i++) {
    pxLine(g, w / 2 + i * 30, horizon, w / 2 + i * 96, h, C.stoneDark, 0.16 * A, 1);
  }

  if (act === 2) drawSwampChurch(g, w, h, horizon, t, A, accent);
  else if (act === 3) drawStarCourt(g, w, h, horizon, t, A, accent);
  else drawGraveyard(g, w, h, horizon, t, A, accent);

  // 烛台：三幕共用，火苗按固定相位抖动
  const candleXs = act === 2 ? [62, 118, 362, 418] : act === 3 ? [56, 128, 352, 424] : [44, 116, 364, 436];
  candleXs.forEach((x, i) => {
    const baseY = horizon + 26 + (i % 2) * 8;
    pxRect(g, x - 1, baseY - 14, 3, 14, C.parchment, 0.75 * A);
    pxRect(g, x - 3, baseY, 7, 2, C.brassDark, 0.9 * A);
    const flick = Math.sin(t * 0.012 + i * 1.7) * 1.2;
    pxRect(g, x + Math.round(flick), baseY - 18, 1, 4, accent, 0.9 * A);
    pxRect(g, x - 1 + Math.round(flick), baseY - 16, 3, 3, accent, 0.35 * A);
    pxRect(g, x + Math.round(flick), baseY - 19, 1, 1, C.white, A);
  });

  // 雾带：横向慢移，只画低透明度硬边带
  for (let i = 0; i < 3; i++) {
    const ow = Math.round(w * 0.55);
    const ox = Math.round(((t * (0.012 + i * 0.004) + i * 97) % (w + ow)) - ow);
    pxRect(g, ox, horizon - 14 + i * 7, ow, 3, C.fog, (0.05 + i * 0.018) * A);
  }

  drawKindEvent(g, { w, h, kind, act, t, horizon, A, accent });
}

function drawGraveyard(g, w, h, horizon, t, A, accent) {
  // 残破尖拱
  for (const [cx, bw, top] of [[74, 74, horizon - 96], [240, 96, horizon - 118], [404, 76, horizon - 90]]) {
    for (let i = 0; i < 7; i++) {
      const sw = Math.round(bw * (0.42 + i * 0.09));
      const y = top + i * 6;
      pxRect(g, cx - sw / 2, y, sw, 6, C.stoneDark, 0.9 * A);
      pxRect(g, cx - sw / 2, y, 1, 6, C.groove, 0.35 * A);
    }
    pxRect(g, cx - 1, top + 30, 2, horizon - top - 30, C.stoneDark, 0.9 * A);
  }
  // 墓碑：错落高度，碑面一条亮边
  const graves = [[48, 30], [104, 22], [146, 16], [330, 24], [376, 32], [430, 18]];
  for (const [x, gh] of graves) {
    pxRect(g, x, horizon - gh, 16, gh, C.stoneDark, 0.95 * A);
    pxRect(g, x, horizon - gh, 16, 2, C.stoneLight, 0.55 * A);
    pxRect(g, x + 3, horizon - gh + 6, 1, gh - 9, C.groove, 0.25 * A);
    pxLine(g, x + 9, horizon - gh + 5, x + 12, horizon - 3, C.ink, 0.7 * A, 1);
    pxRect(g, x - 2, horizon - 2, 20, 2, C.stone, 0.6 * A);
  }
  // 右侧枯树
  const tx = 452, ty = horizon - 4;
  pxRect(g, tx, ty - 54, 3, 54, C.stoneDark, 0.9 * A);
  pxLine(g, tx + 2, ty - 40, tx - 20, ty - 62, C.stoneDark, 0.8 * A, 1);
  pxLine(g, tx + 2, ty - 30, tx + 26, ty - 58, C.stoneDark, 0.8 * A, 1);
  pxLine(g, tx - 12, ty - 54, tx - 22, ty - 70, C.stoneDark, 0.6 * A, 1);
  pxLine(g, tx + 14, ty - 46, tx + 24, ty - 66, C.stoneDark, 0.6 * A, 1);
  // 苔点
  for (let i = 0; i < 14; i++) {
    const x = (i * 37 + 11) % w;
    pxRect(g, x, horizon + 6 + (i % 5) * 9, 2, 1, C.sage, 0.18 * A);
  }
  // 远处鬼火
  pxRect(g, 168, horizon - 12, 1, 1, accent, 0.5 * A);
  pxRect(g, 300, horizon - 18, 1, 1, accent, 0.4 * A);
}

function drawSwampChurch(g, w, h, horizon, t, A, accent) {
  // 两扇尖窗 + 彩窗格
  for (const cx of [92, 388]) {
    const bw = 72, top = horizon - 122;
    for (let i = 0; i < 8; i++) {
      const sw = Math.round(bw * (0.35 + i * 0.08));
      pxRect(g, cx - sw / 2, top + i * 6, sw, 6, C.stoneDark, 0.95 * A);
    }
    pxRect(g, cx - bw / 2, top + 34, bw, horizon - top - 34, C.mauve, 0.32 * A);
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 3; c++) {
        const col = (r + c) % 2 === 0 ? C.glassRed : C.glassBlue;
        pxRect(g, cx - 22 + c * 15, top + 40 + r * 12, 11, 9, col, 0.55 * A);
      }
    }
    pxRect(g, cx - 1, top + 26, 2, horizon - top - 26, C.stoneDark, 0.9 * A);
    pxRect(g, cx - bw / 2 - 2, horizon - 3, bw + 4, 3, C.stoneDark, 0.9 * A);
  }
  // 吊钟：轻微摆动
  const bx = 240, by = horizon - 118;
  const swing = Math.sin(t * 0.0016) * 4;
  pxLine(g, bx, 34, bx + swing, by - 12, C.brassDark, 0.75 * A, 1);
  pxRect(g, bx + swing - 2, by - 12, 5, 4, C.brassDark, 0.95 * A);
  pxRect(g, bx + swing - 12, by - 8, 25, 4, C.brass, 0.9 * A);
  pxRect(g, bx + swing - 8, by - 4, 17, 5, C.brassDark, 0.95 * A);
  pxRect(g, bx + swing - 4, by + 2, 9, 3, C.brassDark, 0.95 * A);
  pxRect(g, bx + swing, by + 5, 2, 4, C.brassLight, 0.8 * A);
  // 沼水反光
  for (let i = 0; i < 5; i++) {
    const y = horizon + 14 + i * 15;
    const ox = Math.round((t * (0.02 + i * 0.006)) % (w + 120)) - 120;
    pxRect(g, ox, y, 84, 1, C.swampGlint, 0.16 * A);
    pxRect(g, ox + 130, y + 4, 52, 1, C.swampGlint, 0.1 * A);
  }
  // 苔痕
  for (let i = 0; i < 12; i++) pxRect(g, (i * 41 + 7) % w, horizon + 9 + (i % 4) * 11, 3, 1, C.mossTileLit, 0.3 * A);
  // 鬼火
  for (let i = 0; i < 3; i++) {
    const x = 150 + i * 90, y = horizon - 30 - i * 12 + Math.sin(t * 0.003 + i) * 4;
    pxRect(g, Math.round(x), Math.round(y), 2, 2, accent, 0.5 * A);
    pxRect(g, Math.round(x) + 1, Math.round(y) - 1, 1, 1, C.wispCore, 0.8 * A);
  }
}

function drawStarCourt(g, w, h, horizon, t, A, accent) {
  // 王座：台阶 + 高背 + 菱形徽记
  pxRect(g, 154, horizon - 10, 172, 10, C.shardStone, 0.9 * A);
  pxRect(g, 172, horizon - 20, 136, 10, C.stoneDark, 0.9 * A);
  pxRect(g, 190, horizon - 30, 100, 10, C.shardStone, 0.9 * A);
  pxRect(g, 212, horizon - 86, 56, 56, C.stoneDark, 0.95 * A);
  pxRect(g, 218, horizon - 80, 44, 48, C.starTileLit, 0.7 * A);
  pxDiamond(g, 240, horizon - 58, 14, accent, 0.5 * A, false);
  pxDiamond(g, 240, horizon - 58, 6, accent, 0.7 * A, true);
  pxRect(g, 216, horizon - 32, 48, 2, C.brassDark, 0.8 * A);
  // 两侧立柱
  for (const x of [40, 424]) {
    pxRect(g, x, horizon - 150, 16, 150, C.starTileDark, 0.95 * A);
    pxRect(g, x + 3, horizon - 150, 2, 150, C.runeDim, 0.35 * A);
    pxRect(g, x - 3, horizon - 154, 22, 5, C.shardStone, 0.9 * A);
  }
  // 星点
  for (let i = 0; i < 34; i++) {
    const x = (i * 73 + 29) % w;
    const y = 18 + ((i * 47) % Math.max(20, horizon - 60));
    const tw = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * 0.002 + i * 1.3));
    pxRect(g, x, y, i % 7 === 0 ? 2 : 1, i % 7 === 0 ? 2 : 1, C.parchment, tw * A);
  }
  // 漂浮碎星
  for (let i = 0; i < 5; i++) {
    const x = 110 + i * 66 + Math.sin(t * 0.0012 + i) * 7;
    const y = horizon - 126 + Math.sin(t * 0.0018 + i * 1.9) * 6;
    pxDiamond(g, Math.round(x), Math.round(y), 3 + (i % 2), accent, 0.55 * A, i % 2 === 0);
  }
  // 陨星划痕
  for (let i = 0; i < 2; i++) {
    const p = ((t * 0.00012 + i * 0.5) % 1);
    const x = Math.round(w * p);
    const y = 20 + i * 26 + Math.round(p * 14);
    pxLine(g, x, y, x + 12, y + 22, C.runeCold, 0.28 * A, 1);
  }
}

function drawKindEvent(g, { w, h, kind, act, t, horizon, A, accent }) {
  if (kind === 'death') {
    // 血色收边 + 灰烬下落
    for (let i = 0; i < 5; i++) {
      const step = i * 2;
      pxRect(g, 0, 0, w, 6 + step, C.bloodDark, (0.1 - i * 0.015) * A);
      pxRect(g, 0, h - 6 - step, w, 6 + step, C.bloodDark, (0.1 - i * 0.015) * A);
    }
    for (let i = 0; i < 18; i++) {
      const x = (i * 61 + 13) % w;
      const y = ((i * 37 + t * 0.02) % h);
      pxRect(g, x, Math.round(y), 1, 2, C.ash ?? C.mute, 0.28 * A);
    }
    return;
  }
  if (kind === 'victory') {
    // 从底部升起的金色黎明色带
    const rise = clamp01((t - 500) / 900);
    for (let i = 0; i < 6; i++) {
      const bh = Math.round((h * 0.42) * easeOutCubic(rise) * ((6 - i) / 6));
      pxRect(g, 0, h - bh, w, bh, C.brass, (0.03 + i * 0.012) * A);
    }
    // 三道契约环
    const centers = [[w / 2 - 108, horizon - 96, 30], [w / 2, horizon - 132, 40], [w / 2 + 108, horizon - 96, 30]];
    centers.forEach(([cx, cy, r], i) => {
      const rot = t * 0.0004 * (i % 2 === 0 ? 1 : -1) + i;
      pxRing(g, cx, cy, r, C.brass, 0.55 * A, 2);
      pxRing(g, cx, cy, Math.round(r * 0.72), accent, 0.4 * A, 2);
      for (let k = 0; k < 6; k++) {
        const a = rot + k * Math.PI / 3;
        pxDiamond(g, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.9, 2, C.brassLight, 0.8 * A, true);
      }
    });
    return;
  }
  if (kind === 'clear') {
    // 契约封印碎裂：碎片沿放射方向飞散
    const p = clamp01((t - 900) / 700);
    const cx = w / 2, cy = horizon - 88;
    pxRing(g, cx, cy, 58, accent, 0.25 * (1 - p) * A, 2);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.3;
      const d = 18 + p * 180;
      const x = cx + Math.cos(a) * d;
      const y = cy + Math.sin(a) * d * 0.7;
      pxDiamond(g, Math.round(x), Math.round(y), i % 3 === 0 ? 3 : 2, accent, (1 - p) * 0.75 * A, i % 2 === 0);
    }
  }
}

// 中央符环（标题卡背后的主视觉）。reveal 阶段由调用方传 alpha 淡出。
export function drawSeal(g, { cx, cy, r, t, accent, alpha, runes = true, spokes = 12, core = true }) {
  if (alpha <= 0.01) return;
  const rot = t * 0.00036;
  pxRing(g, cx, cy, r, accent, 0.26 * alpha, 3);
  pxRing(g, cx, cy, Math.round(r * 0.76), C.brassDark, 0.34 * alpha, 3);
  pxRing(g, cx, cy, Math.round(r * 0.42), accent, 0.15 * alpha, 3);
  for (let i = 0; i < spokes; i++) {
    const a = rot + (i / spokes) * Math.PI * 2;
    const x1 = cx + Math.cos(a) * r * 0.46;
    const y1 = cy + Math.sin(a) * r * 0.46 * 0.86;
    const x2 = cx + Math.cos(a) * r * 0.94;
    const y2 = cy + Math.sin(a) * r * 0.94 * 0.86;
    pxLine(g, x1, y1, x2, y2, C.brass, 0.3 * alpha, 1);
    pxDiamond(g, Math.round(x2), Math.round(y2), i % 3 === 0 ? 3 : 2, accent, 0.55 * alpha, true);
  }
  if (core) {
    pxDiamond(g, cx, cy, Math.round(r * 0.11), C.brass, 0.55 * alpha, false);
    pxDiamond(g, cx, cy, Math.round(r * 0.05), accent, 0.85 * alpha, true);
  }
  if (runes) {
    const glyphs = RUNE_MARKS;
    for (let i = 0; i < 8; i++) {
      const a = -rot * 0.8 + (i / 8) * Math.PI * 2;
      const gx = Math.round(cx + Math.cos(a) * (r * 0.64) - 4);
      const gy = Math.round(cy + Math.sin(a) * (r * 0.64) * 0.86 - 4);
      drawGlyph(g, gx, gy, glyphs[i % glyphs.length], accent, { alpha: 0.5 * alpha });
    }
  }
}

// 揭开时的符号雨：向外飞散的短线，让「揭开」不只是透明度变化。
export function drawSparkBurst(g, { cx, cy, t, startT, accent, alpha }) {
  const p = clamp01((t - startT) / 520);
  if (p <= 0 || p >= 1) return;
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + 0.15;
    const d = 30 + p * 260;
    const x1 = cx + Math.cos(a) * d;
    const y1 = cy + Math.sin(a) * d * 0.8;
    const x2 = cx + Math.cos(a) * (d + 18);
    const y2 = cy + Math.sin(a) * (d + 18) * 0.8;
    pxLine(g, x1, y1, x2, y2, accent, (1 - p) * 0.55 * alpha, 1);
  }
}

export function drawDust(g, dust, { h, t, accent, alpha }) {
  for (const d of dust) {
    const y = ((d.y - t * d.speed * 0.0009) % h + h) % h;
    const x = d.x + Math.sin(t * 0.001 + d.phase) * 4;
    const color = d.tone === 0 ? C.brass : d.tone === 1 ? accent : C.parchment;
    pxRect(g, x, y, d.size, d.size, color, alpha * (d.size === 2 ? 0.5 : 0.22));
  }
}

const RUNE_MARKS = [
  ['...##...', '..####..', '.##..##.', '##.##.##', '##.##.##', '.##..##.', '..####..', '...##...'],
  ['#..#..#.', '.######.', '##.##.##', '..####..', '##.##.##', '.######.', '#..#..#.', '........'],
  ['....#...', '...###..', '..#####.', '#######.', '#######.', '..#####.', '...###..', '....#...'],
  ['##....##', '.##..##.', '..####..', '########', '########', '..####..', '.##..##.', '##....##'],
];
