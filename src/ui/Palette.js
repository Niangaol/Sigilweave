// 共振法阵 · 统一色板与像素绘制工具
// 色值取自设计稿 14.2「被遗忘的炼金祭坛」。全部使用硬边色块，禁止平滑渐变与模糊。
export const C = {
  void: 0x0d0a17,
  night: 0x241c3a,
  nightDeep: 0x1a142b,
  nightSoft: 0x1f1933,
  stone: 0x3b3157,
  stoneDark: 0x2a2342,
  stoneLight: 0x4a4166,
  groove: 0x6b5b8e,
  brass: 0xc9a227,
  brassDark: 0x7a6118,
  brassLight: 0xe0c35a,
  parchment: 0xf0d9a8,
  arcane: 0xffb44d,
  arcaneLight: 0xffd79a,
  teal: 0x5ed0c8,
  blood: 0xa83b39,
  bloodDark: 0x6d2524,
  bone: 0xe4dcc4,
  rot: 0x5d7a46,
  white: 0xfff6e0,
  ink: 0x171226,
  mute: 0x8a7aa8,

  // —— 三幕大地图主题色（Background 世界化专用）——
  // 一幕「荒废墓园」：灰紫石板 + 雾
  graveTile: 0x2c2745,
  graveTileLit: 0x383157,
  graveTileDark: 0x221d38,
  fog: 0xbfb8d9,
  // 二幕「腐沼教堂」：绿苔 + 沼水 + 彩窗 + 鬼火
  mossTile: 0x25321e,
  mossTileLit: 0x334528,
  mossTileDark: 0x1b2616,
  swampWater: 0x2f4f45,
  swampGlint: 0x7cc9a8,
  glassRed: 0x8e2f3c,
  glassBlue: 0x2f5a8e,
  ruinStone: 0x474c40,
  wisp: 0x8fe89a,
  wispCore: 0xdcffd4,
  // 三幕「星陨王庭」：蓝黑星纹 + 冷色符文
  starTile: 0x151833,
  starTileLit: 0x1d2347,
  starTileDark: 0x0f1226,
  runeCold: 0x7fd7ff,
  runeDim: 0x44639c,
  shardStone: 0x39406a,
  coldFlame: 0x9fe8ff,
  coldFlameCore: 0xeafcff,
};

// 文本用十六进制字符串
export const HEX = {
  void: '#0d0a17',
  night: '#241c3a',
  stone: '#3b3157',
  groove: '#6b5b8e',
  brass: '#c9a227',
  brassDark: '#7a6118',
  brassLight: '#e0c35a',
  parchment: '#f0d9a8',
  arcane: '#ffb44d',
  arcaneLight: '#ffd79a',
  teal: '#5ed0c8',
  blood: '#a83b39',
  bone: '#e4dcc4',
  rot: '#5d7a46',
  white: '#fff6e0',
  mute: '#b3a6cc',
  ink: '#241c3a',
  inkDark: '#171226',
};

// 正文字体：小字号中文要清晰，优先各平台自带的黑体类字体（离线可用，不引外部字体文件）。
// 旧版用 SimSun 衬线在 9px 下发丝笔画必糊，用户两次反馈\u201c一大半文字不清晰\u201d后更换。
export const FONT = '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", "Source Han Sans SC", "SimHei", sans-serif';
// 展示字体：仅用于大标题（>=24px），保留西幻衬线味；大字下衬线笔画足够粗，不会糊。
export const FONT_DISPLAY = '"SimSun", "Songti SC", "STSong", "Noto Serif SC", serif';

// 渲染倍率：逻辑坐标永远是 480×270，但画布按屏幕尺寸选择整数倍率（1 逻辑像素 = RENDER_SCALE 设备像素）。
// 旧版固定 480×270 再交给浏览器拉伸，玩家屏幕越大糊得越厉害；现在渲染分辨率跟着窗口走，文字纹理也按同一倍率生成。
let RENDER_SCALE = 2;
export function getRenderScale() { return RENDER_SCALE; }
// 允许分数倍率：桌面仍传整数（1080p→4），手机放不下 480 宽时传 0.5~3 的分数值，
// 由 main.js 乘设备像素比出图，避免浏览器拉伸糊屏。
export function setRenderScale(scale) {
  const v = Number(scale);
  RENDER_SCALE = Number.isFinite(v) && v > 0 ? Math.max(0.5, Math.min(8, v)) : 1;
  return RENDER_SCALE;
}
export const BASE_W = 480;
export const BASE_H = 270;

// ---------- 竖屏布局：地图 + 触控台 ----------
// 竖屏时画布加高到 760（上 270 仍是地图视口，下 490 是放大的罗盘与触控台）；
// 横屏维持 480×270，桌面行为完全不变。
export const CONSOLE_TOP = 270;
export const CONSOLE_H = 490;
export const CANVAS_H_PORTRAIT = CONSOLE_TOP + CONSOLE_H;
let PORTRAIT = false;
export function isPortrait() { return PORTRAIT; }
export function setPortrait(v) { PORTRAIT = !!v; return PORTRAIT; }
// 触屏设备（手机/平板）才画虚拟按键；桌面鼠标用户永远看不到
let TOUCH_UI = false;
export function isTouchUI() { return TOUCH_UI; }
export function setTouchUI(v) { TOUCH_UI = !!v; return TOUCH_UI; }

// 摄像机 zoom = 倍率：可见世界区域恒为 480×270，只是每个逻辑像素占更多设备像素。
// zoom 是以摄像机中心展开的，静态场景必须把视野对齐到逻辑画布，否则画面会跑到屏幕外。
export function applyPixelZoom(scene) {
  const cam = scene.cameras.main;
  cam.setZoom(RENDER_SCALE);
  cam.centerOn(BASE_W / 2, BASE_H / 2);
  return cam;
}

// UI 容器补偿量：zoom 在屏幕中心放大，scrollFactor=0 的对象会整体偏移，
// 把容器放到这个位置，逻辑坐标 p 就恒定落在屏幕 p×倍率处。
export function uiLayerOffset(scene) {
  const halfW = scene.scale.width / 2;
  const halfH = scene.scale.height / 2;
  return { x: halfW - halfW / RENDER_SCALE, y: halfH - halfH / RENDER_SCALE };
}

// Phaser 文本样式工厂：resolution 2 让中文在 2 倍画布下仍然锐利（resolution 1 会糊）。
// 默认加一圈深色描边：小字落在动态地图/光效上时靠描边保证对比度，可用 noStroke 关闭。
export function textStyle(size = 9, color = HEX.parchment, extra = {}) {
  const style = {
    fontFamily: extra.fontFamily ?? FONT,
    fontSize: size + 'px',
    color,
    // 纹理分辨率跟渲染倍率一致，否则大屏放大后文字又变回模糊的位图
    resolution: RENDER_SCALE,
    padding: { x: 0, y: 1 },
  };
  if (!extra.noStroke) {
    style.stroke = extra.stroke ?? HEX.inkDark;
    style.strokeThickness = extra.strokeThickness ?? (size >= 24 ? 3 : size >= 12 ? 2 : 1.2);
  }
  return { ...style, ...extra };
}

export function addText(scene, x, y, str, size = 9, color = HEX.parchment, extra = {}) {
  const t = scene.add.text(Math.round(x), Math.round(y), str, textStyle(size, color, extra));
  t.setResolution(RENDER_SCALE);
  return t;
}

// ---------- 硬边像素绘制 ----------

// 8×8 像素字模：'#' 为亮像素，其余忽略。统一入口，避免每个界面各写一套循环。
export function drawGlyph(g, x, y, glyph, color, opts = {}) {
  if (!Array.isArray(glyph) || !glyph.length) return;
  const scale = opts.scale ?? 1;
  const alpha = opts.alpha ?? 1;
  const w = glyph[0].length;
  const h = glyph.length;
  g.fillStyle(color, alpha);
  for (let row = 0; row < h; row++) {
    const line = glyph[row];
    for (let col = 0; col < w; col++) {
      if (line[col] !== '#') continue;
      g.fillRect(x + col * scale, y + row * scale, scale, scale);
    }
  }
}

export function pxRect(g, x, y, w, h, color, alpha = 1) {
  if (w <= 0 || h <= 0) return;
  g.fillStyle(color, alpha);
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function pxFrame(g, x, y, w, h, color, t = 1, alpha = 1) {
  const X = Math.round(x), Y = Math.round(y), W = Math.round(w), H = Math.round(h);
  pxRect(g, X, Y, W, t, color, alpha);
  pxRect(g, X, Y + H - t, W, t, color, alpha);
  pxRect(g, X, Y, t, H, color, alpha);
  pxRect(g, X + W - t, Y, t, H, color, alpha);
}

export function pxPoly(g, points, color, alpha = 1, close = true) {
  g.fillStyle(color, alpha);
  g.fillPoints(points, close);
}

export function pxPolyLine(g, points, color, alpha = 1, width = 1, close = true) {
  g.lineStyle(width, color, alpha);
  g.strokePoints(points, close);
}

// Bresenham 像素直线：逐像素画点，保证斜线也是硬边像素
export function pxLine(g, x1, y1, x2, y2, color, alpha = 1, t = 1) {
  let X1 = Math.round(x1), Y1 = Math.round(y1);
  const X2 = Math.round(x2), Y2 = Math.round(y2);
  const dx = Math.abs(X2 - X1), sx = X1 < X2 ? 1 : -1;
  const dy = -Math.abs(Y2 - Y1), sy = Y1 < Y2 ? 1 : -1;
  let err = dx + dy;
  g.fillStyle(color, alpha);
  for (let guard = 0; guard < 1200; guard++) {
    g.fillRect(X1, Y1, t, t);
    if (X1 === X2 && Y1 === Y2) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; X1 += sx; }
    if (e2 <= dx) { err += dx; Y1 += sy; }
  }
}

export function pxDiamond(g, cx, cy, r, color, alpha = 1, fill = true) {
  const pts = [
    { x: Math.round(cx), y: Math.round(cy - r) },
    { x: Math.round(cx + r), y: Math.round(cy) },
    { x: Math.round(cx), y: Math.round(cy + r) },
    { x: Math.round(cx - r), y: Math.round(cy) },
  ];
  if (fill) pxPoly(g, pts, color, alpha);
  else pxPolyLine(g, pts, color, alpha, 1);
}

export function pxRing(g, cx, cy, r, color, alpha = 1, step = 2) {
  // 硬边菱形环（像素风近似圆环），step 控制点的疏密
  g.fillStyle(color, alpha);
  for (let i = -r; i <= r; i += step) {
    const j = r - Math.abs(i);
    g.fillRect(Math.round(cx + i), Math.round(cy - j), 1, 1);
    g.fillRect(Math.round(cx + i), Math.round(cy + j), 1, 1);
  }
  for (let i = -r + step; i < r; i += step) {
    const j = r - Math.abs(i);
    g.fillRect(Math.round(cx - j), Math.round(cy + i), 1, 1);
    g.fillRect(Math.round(cx + j), Math.round(cy + i), 1, 1);
  }
}

export function pxHeart(g, x, y, color, alpha = 1) {
  const rows = [
    '.XX.XX.',
    'XXXXXXX',
    'XXXXXXX',
    '.XXXXX.',
    '..XXX..',
    '...X...',
  ];
  g.fillStyle(color, alpha);
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      if (rows[r][c] === 'X') g.fillRect(x + c, y + r, 1, 1);
    }
  }
}

export function pxShard(g, x, y, color, alpha = 1) {
  const rows = [
    '..X..',
    '.XXX.',
    'XXXXX',
    '.XXX.',
    '..X..',
  ];
  g.fillStyle(color, alpha);
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      if (rows[r][c] === 'X') g.fillRect(x + c, y + r, 1, 1);
    }
  }
}

export function fmtTime(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60).toString().padStart(2, '0');
  const s = (total % 60).toString().padStart(2, '0');
  return m + ':' + s;
}
