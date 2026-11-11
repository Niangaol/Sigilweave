// 过场演出的程序化像素美术：只画硬边色块，不用图片、不用渐变、不用滤镜。
// 所有函数都是「清空由调用方负责」的纯绘制：CutsceneScene 每帧决定阶段，这里决定画什么。
import { C, pxRect, pxLine, pxDiamond, drawGlyph } from './Palette.js';

export const clamp01 = v => Math.max(0, Math.min(1, Number(v) || 0));
export const easeOutCubic = t => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInOutCubic = t => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

// 长线走 1px 矢量线：一帧几十条，比 Bresenham 逐像素 fillRect 便宜两个数量级。
// 短装饰线仍用 pxLine 保留像素楼梯。
export function thinLine(g, x1, y1, x2, y2, color, alpha = 1) {
  g.lineStyle(1, color, alpha);
  g.lineBetween(Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2));
}

// 椭圆环用 48 段折线一次描边，替代逐个像素点环。
export function strokeRing(g, cx, cy, r, color, alpha, segments = 48) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    points.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.86 });
  }
  g.lineStyle(1, color, alpha);
  g.strokePoints(points, true);
}

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
    pxRect(g, 0, y, w, 1, C.stoneDark, 0.28 * A);
  }
  for (let i = -6; i <= 6; i++) {
    thinLine(g, w / 2 + i * 30, horizon, w / 2 + i * 96, h, C.stoneDark, 0.16 * A);
  }

  if (act === 2) drawSwampChurch(g, w, h, horizon, t, A, accent);
  else if (act === 3) drawStarCourt(g, w, h, horizon, t, A, accent);
  else if (act === 4) drawLibraryHall(g, w, h, horizon, t, A, accent);
  else if (act === 5) drawCourtHall(g, w, h, horizon, t, A, accent);
  else if (act === 6) drawForgeHall(g, w, h, horizon, t, A, accent);
  else if (act === 7) drawDawnSeat(g, w, h, horizon, t, A, accent);
  else drawGraveyard(g, w, h, horizon, t, A, accent);

  // 烛台：七幕共用，火苗按固定相位抖动；每幕换一组 x 坐标，避开对应剪影的主体
  const candleXs = act === 2 ? [62, 118, 362, 418]
    : act === 3 ? [56, 128, 352, 424]
      : act === 4 ? [70, 132, 348, 410]
        : act === 5 ? [58, 120, 360, 422]
          : act === 6 ? [64, 140, 340, 416]
            : act === 7 ? [50, 122, 358, 430]
              : [44, 116, 364, 436];
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

// 四幕「天权 · 沉钟书库」：两排高书架夹出走廊，中央铜钟轻摆，书页在光里翻飞
function drawLibraryHall(g, w, h, horizon, t, A, accent) {
  // 书架：左右各一排，书脊用成簇的宽块（不逐本画，单帧预算优先）
  for (const [bx, bw2] of [[6, 126], [348, 126]]) {
    const top = horizon - 152;
    pxRect(g, bx, top, bw2, 152, 0x121728, 0.95 * A);
    pxRect(g, bx, top, bw2, 2, C.brassDark, 0.9 * A);
    pxRect(g, bx, horizon - 4, bw2, 4, C.brassDark, 0.7 * A);
    // 书脊成簇：每层 8 簇宽块（逐本画会吃掉单帧预算，这里只保留「排布感」）
    for (let r = 0; r < 4; r++) {
      const ry = top + 12 + r * 32;
      pxRect(g, bx + 4, ry, bw2 - 8, 1, C.brassDark, 0.5 * A);
      for (let k = 0; k < 8; k++) {
        const cw = 5 + ((r * 3 + k * 5) % 3) * 2;
        const kh = 12 + ((k * 5 + r * 3) % 9);
        const kx = bx + 6 + k * 14;
        if (kx + cw > bx + bw2 - 6) break;
        const col = k % 3 === 0 ? 0x3f5a3a : k % 3 === 1 ? 0x5a3a4a : 0x2f4560;
        pxRect(g, kx, ry - kh, cw, kh, col, 0.85 * A);
        pxRect(g, kx, ry - kh, 1, kh, C.parchment, 0.12 * A);
      }
    }
  }
  // 中央铜钟：吊链 + 钟体，摆动幅度很小（书库是「静止的钟」）
  const bx2 = w / 2, by = horizon - 104;
  const swing = Math.sin(t * 0.0012) * 3;
  pxRect(g, bx2, 8, 1, by - 14, C.brassDark, 0.7 * A);
  pxRect(g, bx2 + swing - 2, by - 14, 5, 5, C.brassDark, 0.95 * A);
  pxRect(g, bx2 + swing - 13, by - 9, 27, 5, C.brass, 0.9 * A);
  pxRect(g, bx2 + swing - 16, by - 4, 33, 5, C.brassDark, 0.95 * A);
  pxRect(g, bx2 + swing - 16, by - 4, 33, 1, C.brassLight, 0.45 * A);
  pxRect(g, bx2 + swing - 10, by + 1, 21, 4, C.brassDark, 0.95 * A);
  pxRect(g, bx2 + swing - 1, by + 5, 3, 5, C.brassLight, 0.85 * A);
  // 翻飞书页：固定相位漂移，纯整数采样
  for (let i = 0; i < 9; i++) {
    const px2 = 60 + ((i * 53 + t * 0.02) % (w - 120));
    const py = horizon - 40 - ((i * 29 + t * 0.012) % 96);
    pxRect(g, Math.round(px2), Math.round(py), 5, 4, C.parchment, 0.55 * A);
    pxRect(g, Math.round(px2), Math.round(py) + 3, 5, 1, 0x8a7a5a, 0.6 * A);
    pxRect(g, Math.round(px2) - 5, Math.round(py) + 1, 3, 1, C.parchment, 0.2 * A);
  }
  // 地面反光：书架侧漏出来的暖光
  for (let i = 0; i < 4; i++) {
    pxRect(g, 20 + i * 18, horizon + 18 + i * 16, 96, 2, C.brass, 0.05 * A);
  }
}

// 五幕「玉衡 · 衡律法庭」：大理石列柱 + 中央天平 + 三块判词石碑，冷银灰配暗红
function drawCourtHall(g, w, h, horizon, t, A, accent) {
  // 列柱：四根等距，柱身两条明暗，柱头柱础各一圈
  for (const cx2 of [40, 148, 332, 440]) {
    const top = horizon - 158;
    pxRect(g, cx2 - 13, top, 26, 158, 0x3a3f48, 0.95 * A);
    pxRect(g, cx2 - 11, top + 6, 3, 146, 0x9aa1ad, 0.5 * A);
    pxRect(g, cx2 + 8, top + 6, 3, 146, 0x14161b, 0.7 * A);
    pxRect(g, cx2 - 16, top, 32, 6, 0x4a505c, 0.95 * A);
    pxRect(g, cx2 - 16, top, 32, 1, 0xb8bec9, 0.7 * A);
    pxRect(g, cx2 - 16, horizon - 6, 32, 6, 0x4a505c, 0.95 * A);
  }
  // 天平：立柱 + 微微倾斜的横梁 + 两侧吊绳托盘
  const sx = w / 2, sy = horizon - 92;
  const tilt = Math.round(Math.sin(t * 0.0018) * 4);
  pxRect(g, sx - 4, sy + 8, 9, 84, 0x9aa1ad, 0.9 * A);
  pxRect(g, sx - 4, sy + 8, 9, 2, 0xb8bec9, 0.8 * A);
  pxRect(g, sx - 46, sy + tilt, 93, 3, 0x9aa1ad, 0.95 * A);
  for (const dir of [-1, 1]) {
    const ex = sx + dir * 44;
    const ey = sy + tilt - dir * 0;
    pxRect(g, ex, ey + 2, 1, 12, 0x8f95a1, 0.75 * A);
    pxRect(g, ex - 12, ey + 14, 25, 3, 0x9aa1ad, 0.95 * A);
    pxRect(g, ex - 12, ey + 17, 25, 2, C.bloodDark, 0.6 * A);
  }
  pxRect(g, sx - 3, sy - 6, 7, 7, C.blood, 0.7 * A);
  pxDiamond(g, sx, sy + 2, 3, accent, 0.8 * A, true);
  // 判词石碑：三块，碑面暗红短行
  for (const [bx3, bw3, bh3] of [[86, 22, 40], [236, 18, 32], [402, 20, 36]]) {
    const top = horizon - bh3;
    pxRect(g, bx3, top, bw3, bh3, 0x3a3f48, 0.95 * A);
    pxRect(g, bx3, top, 1, bh3, 0x9aa1ad, 0.6 * A);
    pxRect(g, bx3 + bw3 - 1, top, 1, bh3, 0x14161b, 0.7 * A);
    pxRect(g, bx3 - 2, horizon - 3, bw3 + 4, 3, 0x2a2e36, 0.95 * A);
    for (let r = 0; r < 3; r++) pxRect(g, bx3 + 3, top + 7 + r * 6, bw3 - 6 - (r % 2) * 4, 1, C.blood, 0.65 * A);
  }
  // 地砖缝：法度感来自等距直角线
  for (let i = 1; i <= 3; i++) pxRect(g, 0, horizon + i * 18, w, 1, 0x9aa1ad, 0.1 * A);
}

// 六幕「开阳 · 熔星锻炉」：炉膛在左、铁砧在中，吊链垂落，火星上升
function drawForgeHall(g, w, h, horizon, t, A, accent) {
  // 炉膛：石拱 + 三段阶梯火芯
  const fx = 96, fy = horizon - 96, fw2 = 96, fh2 = 96;
  pxRect(g, fx - fw2 / 2 - 8, fy - 6, fw2 + 16, fh2 + 6, 0x1c1512, 0.95 * A);
  pxRect(g, fx - fw2 / 2 - 8, fy - 6, fw2 + 16, 3, 0x4a3a30, 0.9 * A);
  pxRect(g, fx - fw2 / 2, fy + 14, fw2, fh2 - 14, 0x0b0705, 0.95 * A);
  const flick = Math.sin(t * 0.006) * 2;
  pxRect(g, fx - fw2 / 2 + 5, fy + 20 + flick, fw2 - 10, fh2 - 26, 0x8a2f10, 0.9 * A);
  pxRect(g, fx - fw2 / 2 + 12, fy + 28 + flick, fw2 - 24, fh2 - 42, C.arcane, 0.9 * A);
  pxRect(g, fx - 10, fy + 36 + flick, 20, 26, C.arcaneLight, 0.85 * A);
  pxRect(g, fx - 3, fy + 44 + flick, 7, 12, C.white, 0.9 * A);
  // 铁砧：正前方，砧面 + 砧角
  const ax = w / 2 + 24, ay = horizon - 10;
  pxRect(g, ax - 22, ay - 12, 45, 12, 0x2a2422, 0.95 * A);
  pxRect(g, ax - 22, ay - 24, 45, 8, 0x3a3230, 0.95 * A);
  pxRect(g, ax - 22, ay - 24, 45, 2, 0x6b5a52, 0.8 * A);
  pxRect(g, ax - 30, ay - 21, 9, 5, 0x3a3230, 0.95 * A);
  pxRect(g, ax - 30, ay - 21, 9, 1, 0x6b5a52, 0.5 * A);
  pxRect(g, ax - 8, ay - 16, 15, 5, 0x2a2422, 0.9 * A);
  pxRect(g, ax + 34, ay - 30, 3, 3, C.arcane, 0.7 * A);
  // 吊链：三根从顶部垂到砧上方，交替链环
  for (const [lx, len2] of [[196, 74], [318, 92], [420, 58]]) {
    for (let i = 0; i < len2; i += 5) {
      pxRect(g, lx - (i % 10 === 0 ? 0 : 2), 8 + i, i % 10 === 0 ? 5 : 3, 3, 0x6b5a52, 0.8 * A);
    }
    pxRect(g, lx - 6, 8 + len2, 13, 3, 0x4a3a30, 0.9 * A);
  }
  // 火星：从炉口向上飘，相位固定
  for (let i = 0; i < 14; i++) {
    const px3 = fx + Math.sin(t * 0.003 + i) * (30 + i * 2);
    const py3 = fy + 30 - ((i * 37 + t * 0.05) % 130);
    pxRect(g, Math.round(px3), Math.round(py3), i % 4 === 0 ? 2 : 1, i % 4 === 0 ? 2 : 1,
      i % 3 === 0 ? C.arcaneLight : C.arcane, 0.35 + (i % 3) * 0.2 * A);
  }
  // 地面余烬
  for (let i = 0; i < 6; i++) {
    pxRect(g, 40 + i * 74, horizon + 22 + (i % 3) * 12, 22, 1, C.arcane, 0.08 * A);
  }
}

// 七幕「摇光 · 破晓之座」：断裂王座居中，黎明地平线在下，七颗星连成勺形
function drawDawnSeat(g, w, h, horizon, t, A, accent) {
  // 黎明：地平线上方堆三层硬边金带（不做平滑渐变）
  for (let i = 0; i < 3; i++) {
    const bh = 4 + i * 5;
    pxRect(g, 0, horizon - bh, w, bh, i === 0 ? C.brassLight : C.brass, (0.06 + i * 0.035) * A);
  }
  pxRect(g, 0, horizon, w, 2, C.brassLight, 0.5 * A);
  // 断裂王座：座面 + 断掉的椅背 + 扶手
  const tx = w / 2, ty = horizon;
  pxRect(g, tx - 40, ty - 16, 81, 16, 0x2b2447, 0.95 * A);
  pxRect(g, tx - 40, ty - 16, 81, 2, C.brassLight, 0.6 * A);
  pxRect(g, tx - 28, ty - 78, 34, 62, 0x1d1733, 0.95 * A);
  pxRect(g, tx - 28, ty - 78, 2, 62, C.brassLight, 0.45 * A);
  pxRect(g, tx + 6, ty - 78, 22, 16, C.void, 0.9 * A);      // 右上角整块断口
  pxRect(g, tx + 6, ty - 62, 12, 9, C.void, 0.9 * A);
  pxRect(g, tx - 28, ty - 78, 34, 2, C.brassLight, 0.5 * A);
  pxRect(g, tx + 26, ty - 74, 6, 4, 0x1d1733, 0.85 * A);    // 飞散的碎块
  pxRect(g, tx + 36, ty - 84, 4, 4, 0x1d1733, 0.6 * A);
  pxRect(g, tx - 40, ty - 30, 8, 14, 0x2b2447, 0.95 * A);
  pxRect(g, tx + 33, ty - 26, 8, 10, 0x2b2447, 0.95 * A);
  pxDiamond(g, tx - 11, ty - 48, 7, accent, 0.65 * A, false);
  pxDiamond(g, tx - 11, ty - 48, 3, C.white, 0.85 * A, true);
  // 七颗星连成勺形：勺柄向右上挑，全部按 w/h 相对坐标
  const stars7 = [
    [0.1, 0.28], [0.22, 0.2], [0.34, 0.15], [0.45, 0.13],
    [0.42, 0.29], [0.57, 0.33], [0.63, 0.2],
  ].map(([u, v2]) => ({ x: Math.round(u * w), y: Math.round(v2 * horizon) }));
  const links7 = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]];
  for (const [a, b] of links7) {
    thinLine(g, stars7[a].x, stars7[a].y, stars7[b].x, stars7[b].y, C.brassDark, 0.55 * A);
  }
  stars7.forEach((p, i) => {
    const tw = 0.45 + 0.4 * (0.5 + 0.5 * Math.sin(t * 0.002 + i * 1.3));
    pxDiamond(g, p.x, p.y, i === 6 ? 4 : 3, accent, tw * A, true);
    pxRect(g, p.x, p.y - 5, 1, 2, C.white, 0.7 * tw * A);
  });
  // 晨光里的浮尘
  for (let i = 0; i < 10; i++) {
    const px4 = ((i * 71 + t * 0.02) % w);
    const py4 = horizon - 40 - ((i * 31 + t * 0.01) % 110);
    pxRect(g, Math.round(px4), Math.round(py4), 1, 1, C.brassLight, 0.3 * A);
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
      strokeRing(g, cx, cy, r, C.brass, 0.55 * A);
      strokeRing(g, cx, cy, Math.round(r * 0.72), accent, 0.4 * A);
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
    strokeRing(g, cx, cy, 58, accent, 0.25 * (1 - p) * A);
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
  strokeRing(g, cx, cy, r, accent, 0.26 * alpha);
  strokeRing(g, cx, cy, r * 0.76, C.brassDark, 0.34 * alpha);
  strokeRing(g, cx, cy, r * 0.42, accent, 0.15 * alpha);
  for (let i = 0; i < spokes; i++) {
    const a = rot + (i / spokes) * Math.PI * 2;
    const x1 = cx + Math.cos(a) * r * 0.46;
    const y1 = cy + Math.sin(a) * r * 0.46 * 0.86;
    const x2 = cx + Math.cos(a) * r * 0.94;
    const y2 = cy + Math.sin(a) * r * 0.94 * 0.86;
    thinLine(g, x1, y1, x2, y2, C.brass, 0.3 * alpha);
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
    thinLine(g, x1, y1, x2, y2, accent, (1 - p) * 0.55 * alpha);
  }
}

// 符环碎裂：12 段弧片沿放射方向飞散并淡出。p∈(0,1) 才绘制；
// 未开始/已散尽由调用方决定画整环还是不画。同种子同进度严格确定。
export function drawShatter(g, { cx, cy, r, p, accent, seed = 1 }) {
  const q = clamp01(p);
  if (q <= 0 || q >= 1) return;
  const rng = makeRng(seed);
  const n = 12;
  const alpha = (1 - q) * 0.8;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2 + rng() * 0.24;
    const d = r + q * (60 + rng() * 80);
    const pts = [];
    for (let k = 0; k <= 2; k++) {
      const a = a0 + (k / 2) * (Math.PI * 2 / n) * 0.7;
      pts.push({ x: Math.round(cx + Math.cos(a) * d), y: Math.round(cy + Math.sin(a) * d * 0.86) });
    }
    g.lineStyle(1, accent, alpha);
    g.strokePoints(pts, false);
    const midA = a0 + (Math.PI * 2 / n) * 0.35;
    pxDiamond(g, Math.round(cx + Math.cos(midA) * d), Math.round(cy + Math.sin(midA) * d * 0.86),
      i % 3 === 0 ? 2 : 1, accent, alpha * 0.9, true);
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

// 幕色闪洪：冲击时刻的一帧全屏硬边色闪（2-3 帧内由调用方衰减）。
export function drawFlood(g, { w, h, color, alpha }) {
  if (alpha <= 0) return;
  pxRect(g, 0, 0, w, h, color, clamp01(alpha));
}

// 甩镜 streak：cover 阶段横向扫过的速度线，p∈(0,1) 才画，首尾不留残影。
export function drawWhipStreaks(g, { w, h, p, dir = 1, color }) {
  const q = clamp01(p);
  if (q <= 0 || q >= 1) return;
  for (let i = 0; i < 10; i++) {
    const y = Math.round(((i + 0.5) / 10) * h);
    const len = 60 + (i % 4) * 24;
    const x = Math.round(dir > 0 ? q * (w + len) - len : (1 - q) * (w + len) - len);
    pxRect(g, x, y, len, 1, color, 0.35 * (1 - q));
    pxRect(g, x + (dir > 0 ? -14 : len), y + 2, 14, 1, color, 0.2 * (1 - q));
  }
}

// 阶梯收边/张开：三层矩形框向中心合拢（p=1 满覆盖），死亡收拢/揭开反向播放。
export function drawIris(g, { w, h, p, color }) {
  const q = clamp01(p);
  if (q <= 0) return;
  for (let i = 0; i < 3; i++) {
    const t = clamp01(q * 1.3 - i * 0.15);
    if (t <= 0) continue;
    const tw = Math.round(t * w / 2), th = Math.round(t * h / 2);
    const a = 0.85 - i * 0.25;
    pxRect(g, 0, 0, tw, h, color, a);
    pxRect(g, w - tw, 0, tw, h, color, a);
    pxRect(g, 0, 0, w, th, color, a * 0.9);
    pxRect(g, 0, h - th, w, th, color, a * 0.9);
  }
}

// 错位切片：≤6 条横向切片按 90ms 时间量子跳变（种子确定），死亡/反噬的 glitch 感。
export function drawGlitchSlices(g, { w, h, t, seed = 1, color }) {
  const rng = makeRng(seed + Math.floor(t / 90));
  for (let i = 0; i < 6; i++) {
    const y = Math.floor(rng() * h);
    const hh = 2 + Math.floor(rng() * 4);
    const sw = Math.round(w * (0.3 + rng() * 0.4));
    const x = Math.floor(rng() * Math.max(1, w - sw));
    const ox = Math.round((rng() - 0.5) * 28);
    pxRect(g, x + ox, y, sw, hh, color, 0.1 + rng() * 0.15);
  }
}

// 巨号幕数字：衬线竖条拼成约 120px 高，垫在标题卡背后做超大排版。
// 1-3 幕是纯竖条 I/II/III（6/12/18 条指令，既有输出锁死不变）；
// 4-7 幕走 V + I 的组合，V 由两段阶梯竖条拼出，全部整数坐标、无随机。
export function drawNumeral(g, { cx, cy, act, accent, alpha }) {
  if (alpha <= 0) return;
  const H = 120, bw = 10, serif = 26, gap = 22;
  const num = Number(act);
  if (Number.isInteger(num) && num >= 1 && num <= 3) {
    const totalW = num * serif + (num - 1) * gap;
    const x0 = Math.round(cx - totalW / 2), y0 = Math.round(cy - H / 2);
    for (let i = 0; i < num; i++) {
      const x = x0 + i * (serif + gap);
      pxRect(g, x, y0, serif, 6, accent, alpha);
      pxRect(g, x + Math.round((serif - bw) / 2), y0, bw, H, accent, alpha);
      pxRect(g, x, y0 + H - 6, serif, 6, accent, alpha);
    }
    return;
  }
  // IV / V / VI / VII：先 V 再补 I
  const glyphs = num === 4 ? ['V', 'I']
    : num === 5 ? ['V']
      : num === 6 ? ['V', 'I']
        : ['V', 'I', 'I'];
  const totalW = glyphs.length * serif + (glyphs.length - 1) * gap;
  const x0 = Math.round(cx - totalW / 2), y0 = Math.round(cy - H / 2);
  glyphs.forEach((kind, i) => {
    const x = x0 + i * (serif + gap);
    if (kind === 'I') {
      pxRect(g, x, y0, serif, 6, accent, alpha);
      pxRect(g, x + Math.round((serif - bw) / 2), y0, bw, H, accent, alpha);
      pxRect(g, x, y0 + H - 6, serif, 6, accent, alpha);
      return;
    }
    const steps = 6, dy = Math.round(H / steps), dx = 2, tw = 3;
    for (let k = 0; k < steps; k++) {
      const yy = y0 + k * dy;
      pxRect(g, x + k * dx, yy, tw, dy + 1, accent, alpha);
      pxRect(g, x + serif - tw - k * dx, yy, tw, dy + 1, accent, alpha);
    }
    pxRect(g, x - 1, y0, 6, 6, accent, alpha);
    pxRect(g, x + serif - 5, y0, 6, 6, accent, alpha);
  });
}

export const RUNE_MARKS = [
  ['...##...', '..####..', '.##..##.', '##.##.##', '##.##.##', '.##..##.', '..####..', '...##...'],
  ['#..#..#.', '.######.', '##.##.##', '..####..', '##.##.##', '.######.', '#..#..#.', '........'],
  ['....#...', '...###..', '..#####.', '#######.', '#######.', '..#####.', '...###..', '....#...'],
  ['##....##', '.##..##.', '..####..', '########', '########', '..####..', '.##..##.', '##....##'],
];