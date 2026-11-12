// 第 V 幕「衡律法庭」——三层静态布景。
// 构图（横屏 480×270，地平线 135，碑座上沿 186）：
//   远景 0–135：藻井 + 齿状檐口 + 律纹饰带 + 中轴法典碑 + 左右尖拱高窗（右窗是唯一光源）
//                + 四根三档明度的大理石柱（柱础/柱头/立面投影/凹槽）+ 两束高窗光柱（叠加矩形做体积）
//                + 光柱里的浮尘 + 竖屏独有的玫瑰窗
//   中景 135–186：大理石地面（远暗近亮三档明度 / 透视石缝 / 缝下阴影 / 右窗光池）→ 远排石栏杆
//                → 左排三块判词碑（远/中/近三排，近排最大，中排歪斜带蜡印）+ 倒伏的判词碑与掉落的法槌头
//                → 三级审判台与法官高背座 → 右侧铜天平（双链双盘带弧底，背后一圈冷白背光）
//                → 卷宗堆 / 案上卷宗与法槌 / 两座未点的烛台；竖屏另铺地面圆徽与两根落地烛架
//   近景 168–186：通栏石栏杆 9 根 + 侧光雾
// 材质线全部依附实体：石缝贴地面、凹槽贴柱身、砌缝贴墙、蜡印贴判词碑、纸边贴卷宗、铜锈贴天平。
import {
  fill, pointedArch, chain, disc, ring, ellipseRing,
} from '../diorama-kit.js';
import { C } from '../Palette.js';

// 归一化锚点：seal/gate 是原有契约（不改），nail/lord/light 对齐 §4 锚点表；
// nail 落在碑座上沿之上，否则会被铭文带盖住。
export const anchors = {
  seal: { x: 0.5, y: 0.42, r: 0.16 },
  gate: { x: 0.5, y: 0.58, r: 0.12 },
  nail: { x: 0.5, y: 0.6815, r: 0.02 },
  lord: { x: 0.5, y: 0.563, r: 0.05 },
  light: { x: 0.6875, y: 0.3111, r: 0.03 },
};

const R = Math.round;
const vOf = (L) => (L.tall ? 1.45 : 1);   // 只有高度跟着竖屏长
const xOf = (L) => (L.tall ? 1.08 : 1);   // 宽度几乎不变，否则 480 宽会被挤爆
const baseOf = (L) => L.h - (L.tall ? 104 : 84);
const groundOf = (L) => Math.min(R(L.anchors.nail.y), baseOf(L));

// 1px 线：走 lineBetween，长缝不必逐像素 fillRect
function line(g, x1, y1, x2, y2, color, alpha = 1) {
  g.lineStyle(1, color, alpha);
  g.lineBetween(R(x1), R(y1), R(x2), R(y2));
}

// 多边形填充：坐标先取整，保证「同参两次绘制完全一致」
function poly(g, pts, color, alpha = 1) {
  g.fillStyle(color, alpha);
  g.fillPoints(pts.map(p => ({ x: R(p.x), y: R(p.y) })), true);
}

// 天平浮雕（法典碑 / 台前嵌板共用）：梁 + 立杆 + 双盘，最省笔的「衡」字画法
function balanceGlyph(g, cx, cy, s, color, alpha) {
  fill(g, cx - s, cy, s * 2 + 1, 1, color, alpha);
  fill(g, cx, cy - R(s * 0.5), 1, R(s * 0.5) + 1, color, alpha);
  fill(g, cx - s, cy + 1, 1, 3, color, alpha);
  fill(g, cx + s, cy + 1, 1, 3, color, alpha);
  fill(g, cx - s - 2, cy + 3, 5, 1, color, alpha);
  fill(g, cx + s - 2, cy + 3, 5, 1, color, alpha);
  fill(g, cx - 2, cy + 3, 5, 1, color, alpha);
}

// 尖拱高窗：石券（外围一圈实心石框）+ 拱形玻璃 + 竖棂横档 + 拱顶石雕。
// 不走 kit 的 archWindow：那里玻璃是矩形，会从尖拱顶部方方地溢出来。
function gothicWindow(g, cx, sill, w, h, ux, lit, accent) {
  pointedArch(g, {
    cx, baseY: sill + R(6 * ux), w: w + R(16 * ux), h: h + R(6 * ux), t: 2,
    color: C.stoneLight, alpha: 0.45, fillColor: C.stone, fillAlpha: 0.95, segs: 16,
  });
  pointedArch(g, {
    cx, baseY: sill + R(3 * ux), w: w + R(6 * ux), h: h + R(3 * ux), t: 0,
    fillColor: C.stoneDark, fillAlpha: 1, segs: 16,
  });
  pointedArch(g, {
    cx, baseY: sill, w, h, t: 0,
    fillColor: C.glassBlue, fillAlpha: lit ? 0.72 : 0.42, segs: 16,
  });
  if (lit) {
    // 光只落在窗的下半部：上暗下亮、硬边分档。整块染浅色 + 尖顶 = 「帐篷」
    fill(g, cx - R(w * 0.46), sill - R(h * 0.46), R(w * 0.92), R(h * 0.46), accent, 0.1);
    fill(g, cx - R(w * 0.34), sill - R(h * 0.28), R(w * 0.68), R(h * 0.28), accent, 0.13);
    fill(g, cx - R(w * 0.2), sill - R(h * 0.14), R(w * 0.4), R(h * 0.14), C.white, 0.13);
    // 拱头逐行压暗：尖拱越往上越窄，压暗的宽度也跟着收（顶上一块浅灰就是帐篷尖）
    for (let k = 1; k <= 4; k++) {
      const fw = R(w * (0.16 + k * 0.13));
      const fy = sill - R(h * (0.99 - k * 0.055));
      fill(g, cx - R(fw / 2), fy, fw, Math.max(1, R(h * 0.06)), C.void, 0.3);
    }
  } else {
    // 暗窗的玻璃反光（1px 斜线，说明是玻璃不是洞）
    line(g, cx - R(w * 0.28), sill - R(h * 0.42), cx + R(w * 0.06), sill - R(h * 0.12), C.mute, 0.3);
    line(g, cx - R(w * 0.2), sill - R(h * 0.2), cx + R(w * 0.02), sill - R(h * 0.04), C.mute, 0.2);
  }
  // 竖棂两只 + 横档
  const mH = R(h * 0.56);
  for (let i = 1; i <= 2; i++) {
    fill(g, R(cx - w / 2 + (w * i) / 3), sill - mH, 1, mH, C.stoneDark, lit ? 0.9 : 0.75);
  }
  // 横向窗棂 3 条：窗里没有横棂，玻璃就只是一片浅色团块
  for (const f of [0.2, 0.36, 0.52, 0.68]) {
    const yy = sill - R(h * f);
    const ww = Math.max(4, f < 0.5 ? w - 3 : R((w - 3) * (1 - (f - 0.5) * 1.1)));
    fill(g, cx - R(ww / 2), yy, ww, 1, C.stoneDark, lit ? 0.85 : 0.7);
    if (lit) fill(g, cx - R(ww / 2), yy + 1, ww, 1, C.white, 0.1);
  }
  // 拱顶石雕：两根 1px 斜棂交于拱尖
  line(g, cx, sill - h + 2, cx - R(w * 0.16), sill - R(h * 0.6), C.stoneDark, lit ? 0.75 : 0.6);
  line(g, cx, sill - h + 2, cx + R(w * 0.16), sill - R(h * 0.6), C.stoneDark, lit ? 0.75 : 0.6);
  // 窗台两级（压住石券底边）
  fill(g, cx - R(w / 2) - R(9 * ux), sill, w + R(18 * ux), R(3 * ux), C.stoneLight, 0.85);
  fill(g, cx - R(w / 2) - R(12 * ux), sill + R(3 * ux), w + R(24 * ux), R(3 * ux), C.stone, 0.95);
  fill(g, cx - R(w / 2) - R(12 * ux), sill + R(3 * ux), w + R(24 * ux), 1, C.stoneLight, 0.5);
}

// 玫瑰窗（只给竖屏的高墙留白用）：石环 + 放射石棂 + 八枚小圆窗 + 透光花心
function roseWindow(g, cx, cy, r, accent) {
  disc(g, cx, cy, r + 4, C.stoneDark, 1);
  ring(g, cx, cy, r + 4, C.stoneLight, 0.5, 32);
  disc(g, cx, cy, r, C.void, 1);
  disc(g, cx, cy, r - 3, C.glassBlue, 0.45);
  ring(g, cx, cy, r, C.stone, 0.7, 32);
  disc(g, cx, cy, R(r * 0.56), C.void, 1);
  ring(g, cx, cy, R(r * 0.56), C.stone, 0.85, 24);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    line(g, cx + Math.cos(a) * R(r * 0.12), cy + Math.sin(a) * R(r * 0.12),
      cx + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2), C.stone, 0.9);
    const mx = cx + Math.cos(a) * R(r * 0.78);
    const my = cy + Math.sin(a) * R(r * 0.78);
    disc(g, mx, my, Math.max(2, R(r * 0.12)), C.glassBlue, 0.55);
    ring(g, mx, my, Math.max(2, R(r * 0.12)), C.stoneLight, 0.55, 10);
  }
  ring(g, cx, cy, R(r * 0.16), accent, 0.55, 12);
  disc(g, cx, cy, Math.max(1, R(r * 0.09)), C.white, 0.18);
}

// 大理石柱：三档明度（受光棱 / 柱身 / 阴影面）+ 三条凹槽 + 三级柱头 + 三级柱础 + 立面投影
function courtColumn(g, cx, topY, bottomY, cw, ux, accent, lit) {
  const h = bottomY - topY;
  const half = R(cw / 2);
  // 立面投影：光从右窗来，影子落左墙（两层硬边，越贴柱越深）
  fill(g, cx - half - R(11 * ux), topY + R(2 * ux), R(6 * ux), h, C.void, 0.62);
  fill(g, cx - half - R(5 * ux), topY + R(2 * ux), R(4 * ux), h, C.void, 0.48);
  // 柱身剪影：整根压成 stoneDark（不再用 stone），只留 1px 受光棱 + 1px 次亮棱。
  // 四根柱成了一排黑柱，把整面墙切段——画面才有骨架，而不是一片淡紫
  fill(g, cx - half, topY, cw, h, C.stoneDark, 1);
  fill(g, cx - half, topY, 1, h, C.stoneLight, 0.62);
  fill(g, cx - half + 1, topY, 1, h, C.stone, 0.32);
  fill(g, cx + half - R(4 * ux), topY, R(4 * ux), h, C.void, 0.7);
  // 凹槽：贴柱身走的 1px 竖线（槽口压暗、槽右侧提亮）
  for (let i = 1; i <= 3; i++) {
    const fx = cx - half + R((cw * i) / 4);
    fill(g, fx, topY + R(6 * ux), 1, h - R(12 * ux), C.void, 0.85);
    fill(g, fx + 1, topY + R(6 * ux), 1, h - R(12 * ux), C.stone, 0.34);
  }
  // 柱头三级：冠板 / 钟形 / 颈线
  fill(g, cx - half - R(5 * ux), topY - R(5 * ux), cw + R(10 * ux), R(5 * ux), C.stoneLight, 0.9);
  fill(g, cx - half - R(5 * ux), topY - R(5 * ux), cw + R(10 * ux), 1, C.white, 0.3);
  fill(g, cx - half - R(5 * ux), topY - 1, cw + R(10 * ux), 1, C.stoneDark, 0.9);
  fill(g, cx - half - R(2 * ux), topY, cw + R(4 * ux), R(2 * ux), C.stoneDark, 0.8);
  // 柱础三级：台座 / 圆盘 / 收口（暗体 + 1px 受光棱，柱脚再压一道接地影）
  fill(g, cx - half - R(6 * ux), bottomY - R(6 * ux), cw + R(12 * ux), R(6 * ux), C.void, 1);
  fill(g, cx - half - R(6 * ux), bottomY - R(6 * ux), cw + R(12 * ux), 1, C.stone, 0.55);
  fill(g, cx - half - R(6 * ux), bottomY - R(5 * ux), cw + R(12 * ux), 1, C.void, 0.6);
  fill(g, cx - half - R(8 * ux), bottomY - R(2 * ux), cw + R(16 * ux), R(2 * ux), C.void, 1);
  fill(g, cx - half - R(8 * ux), bottomY - R(2 * ux), cw + R(16 * ux), 1, C.stoneLight, 0.45);
  fill(g, cx - half - R(12 * ux), bottomY, cw + R(24 * ux), 2, C.void, 0.85);
  // 迎光柱：左边沿吃一档幕色（只给受光面，不整根染色）
  if (lit) fill(g, cx - half, topY + R(8 * ux), 1, h - R(16 * ux), accent, 0.22);
}

// ---------- 远景 ----------
export function back(g, L) {
  const { w, horizon, accent } = L;
  const ux = xOf(L);
  const ceilH = R(horizon * 0.14);
  const corniceH = R(horizon * 0.07);
  const friezeH = R(horizon * 0.055);
  const wallY = ceilH + corniceH;
  const winSill = horizon - R(horizon * 0.1);
  const winW = R(34 * (L.tall ? 1.35 : 1));
  const winH = Math.min(R(horizon * 0.62), R(winW * 2.05)); // 限高宽比，尖拱别拉成一根针
  const winTop = winSill - winH;
  const wainH = R(horizon * 0.1);
  const tabletBase = horizon - wainH;
  const lcx = R(w * 0.6875);
  const dcx = R(w * 0.3125);

  // 藻井：暗顶 + 井格竖线
  fill(g, 0, 0, w, ceilH, C.void, 1);
  fill(g, 0, 0, w, 1, C.stoneDark, 0.8);
  for (let i = 0; i <= 8; i++) fill(g, R((w * i) / 8), 0, 1, ceilH, C.ink, 1);
  fill(g, 0, R(ceilH * 0.5), w, 1, C.stoneDark, 0.35);
  fill(g, 0, ceilH - 1, w, 1, C.void, 0.9);

  // 檐口 + 齿饰：法庭的石头门楣，一眼区别于墓园矮墙
  fill(g, 0, ceilH, w, corniceH, C.stoneDark, 1);
  fill(g, 0, ceilH, w, 1, C.stoneLight, 0.6);
  fill(g, 0, ceilH + R(corniceH * 0.45), w, 1, C.void, 0.5);
  const dentW = R(6 * ux);
  const dentGap = R(10 * ux);
  for (let x = R(4 * ux); x < w - dentW; x += dentW + dentGap) {
    fill(g, x, ceilH + corniceH - R(4 * ux), dentW, R(4 * ux), C.stone, 0.85);
    fill(g, x, ceilH + corniceH - R(4 * ux), dentW, 1, C.stoneLight, 0.4);
  }

  // 律纹饰带：横竖短笔 + 菱形，反复出现成「法度」的花边
  fill(g, 0, wallY, w, friezeH, C.ink, 0.85);
  fill(g, 0, wallY, w, 1, C.void, 0.6);
  fill(g, 0, wallY + friezeH - 1, w, 1, C.stone, 0.4);
  const markStep = R(24 * ux);
  for (let x = R(12 * ux); x < w; x += markStep) {
    fill(g, x, wallY + 1, 1, friezeH - 2, C.groove, 0.4);
    fill(g, x - R(3 * ux), wallY + R(friezeH * 0.55), R(7 * ux), 1, C.groove, 0.32);
    const dx = x + R(markStep / 2);
    poly(g, [
      { x: dx, y: wallY + 1 }, { x: dx + 2, y: wallY + R(friezeH / 2) },
      { x: dx, y: wallY + friezeH - 2 }, { x: dx - 2, y: wallY + R(friezeH / 2) },
    ], C.stone, 0.35);
  }

  // 后墙：整面先压到 nightDeep，再用砌缝与受光面把 - 石块 - 一块块抬出来
  const wallH = horizon - wallY;
  const rowH = Math.max(6, R(12 * ux));
  fill(g, 0, wallY, w, wallH, C.ink, 1);
  fill(g, 0, wallY, w, 1, C.void, 0.7);
  for (let y = wallY + rowH; y < horizon - 1; y += rowH) {
    fill(g, 0, y, w, 1, C.void, 0.62);          // 横缝
    fill(g, 0, y - R(rowH * 0.55), w, Math.max(1, R(rowH * 0.5)), C.stoneDark, 0.72); // 石面受光带
    fill(g, 0, y - 1, w, 1, C.stone, 0.14);     // 缝上亮唇
  }
  const jointStep = R(76 * ux);
  let rowIdx = 0;
  for (let y = wallY; y < horizon - 2; y += rowH, rowIdx++) {
    const off = (rowIdx % 2) * R(38 * ux);
    for (let x = off + R(18 * ux); x < w; x += jointStep) {
      fill(g, x, y, 1, Math.min(rowH, horizon - y), C.void, 0.5);
      fill(g, x + 1, y, 1, Math.min(rowH, horizon - y), C.stone, 0.12);
    }
  }
  // 深廊：柱与柱之间整段压成实色 void（不叠半透明紫灰），墙才真的暗下去；
  // 中段只压一半，给法典碑留一块「亮石从黑墙里浮出来」的底
  for (const [p0, p1, a] of [[0, 0.045, 0.95], [0.045, 0.215, 0.9], [0.215, 0.29, 0.55], [0.29, 0.5, 0.5], [0.5, 0.62, 0.3], [0.62, 0.815, 0.12], [0.815, 0.955, 0.9], [0.955, 1, 0.95]]) {
    fill(g, R(w * p0), wallY, R(w * (p1 - p0)) + 1, wallH, C.void, a);
  }
  // 暗部：檐下的投光死角 + 左半厅的深影 + 右半厅的受光（平涂硬边，不做渐变）
  fill(g, 0, wallY, w, R(wallH * 0.16), C.void, 0.55);
  poly(g, [
    { x: 0, y: wallY }, { x: R(w * 0.22), y: wallY },
    { x: R(w * 0.12), y: horizon }, { x: 0, y: horizon },
  ], C.void, 0.3);
  poly(g, [
    { x: R(w * 0.2), y: wallY }, { x: R(w * 0.34), y: wallY },
    { x: R(w * 0.28), y: horizon }, { x: R(w * 0.18), y: horizon },
  ], C.void, 0.16);
  poly(g, [
    { x: R(w * 0.52), y: wallY }, { x: w, y: wallY },
    { x: w, y: horizon }, { x: R(w * 0.46), y: horizon },
  ], C.stone, 0.16);
  poly(g, [
    { x: R(w * 0.66), y: wallY }, { x: w, y: wallY },
    { x: w, y: horizon }, { x: R(w * 0.6), y: horizon },
  ], C.stone, 0.12);

  // 墙裙：压成一条黑基座，顶上只留 1px 受光棱——墙与地的分界靠它，不靠色差
  fill(g, 0, horizon - wainH, w, wainH, C.void, 1);
  fill(g, 0, horizon - wainH, w, R(wainH * 0.45), C.stoneDark, 0.75);
  fill(g, 0, horizon - wainH, w, 1, C.stoneLight, 0.7);
  fill(g, 0, horizon - wainH + 1, w, 1, C.stone, 0.35);
  for (let x = 0; x < w; x += R(30 * ux)) fill(g, x, horizon - wainH + 2, 1, wainH - 2, C.void, 0.8);
  fill(g, 0, horizon - 1, w, 1, C.void, 0.9);

  // 右窗洒在墙上的光（硬边梯形，只抬受光侧，不整片染色）
  poly(g, [
    { x: R(w * 0.5), y: wallY }, { x: R(w * 0.93), y: wallY },
    { x: R(w * 0.93), y: horizon }, { x: R(w * 0.46), y: horizon },
  ], accent, 0.035);
  poly(g, [
    { x: R(w * 0.62), y: wallY }, { x: R(w * 0.86), y: wallY },
    { x: R(w * 0.87), y: horizon }, { x: R(w * 0.56), y: horizon },
  ], accent, 0.04);

  // —— 中轴法典碑：整座法庭的「法」 ——
  lawTablet(g, R(w / 2), tabletBase, winTop, R(60 * ux), ux);

  // —— 左右尖拱高窗（右窗是唯一光源） ——
  gothicWindow(g, dcx, winSill, winW, winH, ux, false, accent);
  gothicWindow(g, lcx, winSill, winW, winH, ux, true, accent);
  // 受光高窗的亮核：玻璃再压两层，成为全画最亮的地方
  fill(g, lcx - R(winW * 0.3), winSill - R(winH * 0.8), R(winW * 0.6), R(winH * 0.5), accent, 0.2);
  fill(g, lcx - R(winW * 0.14), winSill - R(winH * 0.7), R(winW * 0.28), R(winH * 0.3), C.white, 0.24);
  // 阶梯光晕：硬边两层，模拟窗光外溢
  fill(g, lcx - R(winW * 0.5) - R(9 * ux), winTop - R(6 * ux), winW + R(18 * ux), winH + R(12 * ux), accent, 0.05);
  fill(g, lcx - R(winW * 0.5) - R(4 * ux), winTop - R(3 * ux), winW + R(8 * ux), winH + R(6 * ux), accent, 0.035);

  // 竖屏专属：高墙中段补一扇玫瑰窗
  if (L.tall) {
    const room = winTop - (wallY + friezeH);
    roseWindow(g, R(w / 2), R((wallY + friezeH + winTop) / 2), Math.min(R(w * 0.11), R(room / 2) - 8), accent);
  }

  // —— 四根大理石柱：三档明度 + 柱础柱头 + 立面投影 ——
  const cw = R(14 * ux);
  for (const p of [0.06, 0.2, 0.8, 0.94]) {
    courtColumn(g, R(w * p), wallY, horizon, cw, ux, accent, p > 0.7);
  }

  // —— 高窗光柱：梯形底 + 叠加半透明矩形叠出体积（硬边，不做模糊） ——
  const bx0 = lcx - R(winW / 2);
  const bx1 = lcx + R(winW / 2);
  // 光柱边缘按 3px 一格的阶梯往外散（直边梯形会读成帐篷），内部三层递减叠加、越靠下越散
  const shaftH = horizon - winSill;
  const steps = Math.max(3, Math.round(shaftH / 3));
  const span0 = bx1 - bx0;
  for (let k = 0; k < steps; k++) {
    const y = winSill + R((shaftH * k) / steps);
    const sl = Math.max(1, winSill + R((shaftH * (k + 1)) / steps) - y);
    const spread = R(k * 3.6 * ux);
    fill(g, bx0 - spread, y, span0 + spread * 2, sl, accent, 0.04);
    fill(g, bx0 - R(spread * 0.55), y, span0 + R(spread * 1.1), sl, accent, 0.07);
    fill(g, bx0 + R(3 * ux), y, Math.max(4, span0 - R(6 * ux)), sl, accent, 0.1);
  }
  // 左（背光）窗：只漏一点冷灰的环境光，不抢右窗
  const ax0 = dcx - R(winW / 2);
  const ax1 = dcx + R(winW / 2);
  poly(g, [
    { x: ax0, y: winSill }, { x: ax1, y: winSill },
    { x: ax1 + R(26 * ux), y: horizon }, { x: ax0 + R(10 * ux), y: horizon },
  ], C.fog, 0.04);
  fill(g, ax0 + R(4 * ux), winSill, (ax1 - ax0) - R(8 * ux), horizon - winSill, C.fog, 0.03);
  // 光柱里的浮尘：贴着光走，固定坐标
  for (const [dx, dy, a] of [[-6, 14, 0.26], [7, 26, 0.22], [-20, 38, 0.2], [4, 50, 0.18], [-11, 60, 0.16], [-30, 20, 0.14], [12, 42, 0.16], [-2, 8, 0.3]]) {
    fill(g, lcx + dx, winSill + dy, 1, 1, accent, a);
  }
  fill(g, 0, horizon - 1, w, 1, C.void, 0.9);
}

// ---------- 中景 ----------
export function mid(g, L) {
  const { w } = L;
  const v = vOf(L);
  const ux = xOf(L);
  const base = baseOf(L);
  const ground = groundOf(L);

  marbleFloor(g, L, base);
  farRail(g, L);
  columnShadows(g, L);

  // 三块判词碑：近排最大且歪立（圆首）/ 中排正立完整（收尖）/ 远排崩口（只有近排六成高）
  const tx = [0.135, 0.235, 0.315];
  const tws = [46, 34, 26];
  const ths = [64, 46, 34];
  // 断掉的上半截碑躺在地上，法槌头落在它断口旁——「这里审判过」。
  // 先画、且贴着左端：放在碑列前面会叠到近排碑面上，被读成碑上的黄把手
  fallenStele(g, R(w * 0.035), ground - R(8 * v), R(30 * ux), R(7 * v), ux, v);
  for (let i = 0; i < 3; i++) {
    const bw = R(tws[i] * ux);
    const bh = R(ths[i] * v);
    const by = ground - (i === 0 ? 0 : i === 1 ? R(13 * v) : R(26 * v));
    stele(g, R(w * tx[i]), by, bw, bh, ux, v, i);
  }

  judgeBench(g, L, ground, v, ux);
  scales(g, R(w * 0.6875), ground, v, ux, L.accent);

  // 卷宗堆：靠栏杆放着，是最近的一排「纸」
  recordStack(g, R(w * 0.79), base - R(18 * v), v, ux);

  // 竖屏才有的近地面：石徽 + 两根落地烛架，把大块空地面收住
  if (L.tall) {
    floorMedallion(g, R(w / 2), base - R(58 * v), v);
    floorLamp(g, R(w * 0.08), base - R(20 * v), v);   // 站在近景栏杆之后：太靠下会被栏杆压住，只剩三根蜡烛在飘
    floorLamp(g, R(w * 0.94), base - R(20 * v), v);
  }
}

// ---------- 近景 ----------
export function fore(g, L) {
  const { w, accent } = L;
  const base = baseOf(L);
  const v = vOf(L);
  const raH = R(12 * v);
  const topY = base - raH;

  // 侧光雾：右窗方向的低雾，硬边薄片，压在中景上沿
  poly(g, [
    { x: R(w * 0.1), y: topY - R(10 * v) }, { x: w, y: topY - R(16 * v) },
    { x: w, y: topY - R(6 * v) }, { x: R(w * 0.06), y: topY - R(1 * v) },
  ], C.fog, 0.055);
  poly(g, [
    { x: R(w * 0.34), y: topY - R(27 * v) }, { x: w, y: topY - R(33 * v) },
    { x: w, y: topY - R(25 * v) }, { x: R(w * 0.3), y: topY - R(19 * v) },
  ], C.fog, 0.035);
  poly(g, [
    { x: R(w * 0.56), y: topY - R(14 * v) }, { x: w, y: topY - R(17 * v) },
    { x: w, y: topY - R(11 * v) }, { x: R(w * 0.52), y: topY - R(8 * v) },
  ], accent, 0.035);

  // 通栏石栏杆：上扶手 + 下横梁 + 9 根车削栏柱（前景压边，越近越黑）
  fill(g, 0, topY, w, R(4 * v), C.void, 1);
  fill(g, 0, topY, w, 1, C.stoneLight, 0.45);
  fill(g, 0, topY + 1, w, 1, C.stone, 0.5);
  fill(g, 0, topY + R(4 * v) - 1, w, 1, C.void, 1);
  const botY = base;
  fill(g, 0, botY - R(3 * v), w, R(3 * v), C.void, 1);
  fill(g, 0, botY - R(3 * v), w, 1, C.stoneDark, 0.55);
  for (let i = 0; i < 9; i++) {
    const x = R(w * (0.055 + i * 0.111));
    const sy = topY + R(4 * v);
    fill(g, x, sy, R(3 * v), botY - sy, C.void, 1);
    fill(g, x - R(2 * v), sy + R(4 * v), R(7 * v), R(3 * v), C.void, 1);
    fill(g, x, sy, 1, botY - sy, C.stone, 0.36);
    fill(g, x + R(3 * v) - 1, sy, 1, botY - sy, C.stoneDark, 0.7);
    if (i % 3 === 1) fill(g, x - R(2 * v), topY - R(3 * v), R(7 * v), R(3 * v), C.brassDark, 0.9);
  }
  fill(g, 0, base - R(2 * v), w, R(2 * v), C.void, 1);
  // 幕色只描受光的一段扶手（右窗外的那一截）
  fill(g, R(w * 0.62), topY + 1, R(w * 0.38), 1, accent, 0.18);
  fill(g, R(w * 0.66), topY + 1, R(w * 0.1), 1, accent, 0.26);
}

// ---------- 中景构件 ----------

// 大理石地面：三档明度（远暗近亮）+ 透视石缝 + 缝下阴影 + 右窗光池
function marbleFloor(g, L, base) {
  const { w, horizon, accent } = L;
  const dy = base - horizon;
  fill(g, 0, horizon, w, L.h - horizon, C.ink, 1);

  // 横向石缝：越近越疏；每排按「远/中/近」三档明度上色（竖屏地板长，排数要跟着加）
  const rows = L.tall ? 11 : 7;
  const ys = [horizon];
  for (let i = 1; i <= rows; i++) ys.push(horizon + R(dy * Math.pow(i / rows, 1.45)));
  for (let i = 0; i < rows; i++) {
    const y = ys[i];
    const y2 = ys[i + 1];
    const hh = y2 - y;
    if (hh <= 0) continue;
    // 明度分档按「看得见的深度」切：远景栏杆到碑座之间只有 39px，近排必须提前开始
    const tier = i < 2 ? 0 : i < 4 ? 1 : 2;
    // 三档明度彻底拉开：远排 ink（退进黑里）/ 中排 stone / 近排 stoneLight + 冷光
    fill(g, 0, y, w, hh, tier === 0 ? C.ink : tier === 1 ? C.stone : C.stoneLight, 1);
    if (tier === 0) fill(g, 0, y, w, hh, C.void, 0.55);
    if (tier === 1) fill(g, 0, y, w, hh, C.stoneLight, 0.34);
    if (tier === 2) {
      fill(g, 0, y, w, hh, C.groove, 0.16);                                  // 近排抬一档
      fill(g, 0, y + R(hh * 0.62), w, hh - R(hh * 0.62), C.stone, 0.35);     // 后缘回落，石板有厚度
    }
    // 每块石板略作明暗差（固定错位取模，不用随机）：整片地面才不是一块平色块
    const tile = R(w / 6);
    for (let tI = 0; tI < 6; tI++) {
      const m = (tI * 2 + i * 2 + (i >> 1)) % 3;
      if (m === 0) continue;
      fill(g, tI * tile, y, tile, hh, m === 1 ? C.void : C.stone, tier === 0 ? 0.12 : 0.08);
    }
  }
  // 石缝必须整排铺完之后再画——否则每条缝都被下一排的填色盖掉，地面就成了一块平板
  for (let i = 1; i <= rows; i++) {
    const y = ys[i];
    if (y >= base) break;
    const near = i >= 5;
    fill(g, 0, y, w, 1, C.void, near ? 0.92 : 0.8);                            // 1px 深缝
    fill(g, 0, y - 1, w, 1, near ? C.groove : C.stoneLight, near ? 0.4 : 0.45); // 缝上沿受光
    fill(g, 0, y + 1, w, 1, C.void, 0.22);                                     // 缝下阴影
  }
  // 纵缝：从灭点放射的透视缝，越近越粗（2–3px）；缝里压暗，右侧留一条石面亮唇
  const vpx = R(w / 2);
  const vpy = horizon + 1;
  for (let i = -3; i <= 3; i++) {
    if (!i) continue;
    const fx = vpx + i * 9;
    const nx = vpx + i * 104;
    const tw = Math.abs(i) % 2 ? 3 : 2;
    poly(g, [
      { x: fx, y: vpy }, { x: fx + 1, y: vpy },
      { x: nx + tw, y: base }, { x: nx, y: base },
    ], C.void, L.tall ? 0.5 : 0.8);
    line(g, fx + 1, vpy, nx + tw, base, C.stone, L.tall ? 0.16 : 0.22);
  }
  // 每排错开的短竖缝：一排排的石板接缝，不做成放射噪声
  for (let i = 0; i < rows; i += 2) {
    const y = Math.max(ys[i], horizon + 1);
    const hh = Math.min(ys[i + 1] - y - 1, base - y - 1);
    if (hh <= 1) continue;
    const step = R(w / 7);
    for (let x = R(step * (i % 4 ? 0.5 : 1)); x < w; x += step) {
      fill(g, x, y, 1, hh, C.void, 0.55);
    }
  }
  // 左半厅不在窗光里：整片压一层 void——右窗成了唯一光源，明暗对比都从这里来
  poly(g, [
    { x: 0, y: horizon + 1 }, { x: R(w * 0.4), y: horizon + 1 },
    { x: R(w * 0.28), y: base }, { x: 0, y: base },
  ], C.void, 0.3);
  poly(g, [
    { x: 0, y: horizon + 1 }, { x: R(w * 0.2), y: horizon + 1 },
    { x: R(w * 0.14), y: base }, { x: 0, y: base },
  ], C.void, 0.2);
  // 右半地面整体受光（平涂，不是渐变）
  poly(g, [
    { x: R(w * 0.44), y: horizon + 1 }, { x: w, y: horizon + 1 },
    { x: w, y: base }, { x: R(w * 0.24), y: base },
  ], C.stone, 0.1);
  // 冷光池：高窗光柱落地，三层由外到内叠到 0.16（冷白是全场唯一强光）
  poly(g, [
    { x: R(w * 0.5), y: horizon + 2 }, { x: R(w * 0.75), y: horizon + 2 },
    { x: R(w * 0.81), y: base }, { x: R(w * 0.45), y: base },
  ], accent, 0.06);
  poly(g, [
    { x: R(w * 0.56), y: horizon + 2 }, { x: R(w * 0.7), y: horizon + 2 },
    { x: R(w * 0.75), y: base }, { x: R(w * 0.52), y: base },
  ], accent, 0.1);
  poly(g, [
    { x: R(w * 0.595), y: horizon + 2 }, { x: R(w * 0.672), y: horizon + 2 },
    { x: R(w * 0.705), y: base }, { x: R(w * 0.565), y: base },
  ], accent, 0.16);
  // 抛光地面的窗影反光：一排横向短光（贴着光池走）
  for (const [f, x0, len, a] of [[0.09, 0.62, 26, 0.3], [0.2, 0.6, 40, 0.24], [0.35, 0.63, 52, 0.18], [0.52, 0.58, 34, 0.12]]) {
    fill(g, R(w * x0), horizon + R(dy * f), R(len), 1, accent, a);
  }
  // 竖屏：地面太深，铺一圈石嵌边（判决厅的地面分界），把大片空地板切成「庭内/庭外」
  if (L.tall) {
    const ix = R(w * 0.1);
    const ix2 = R(w * 0.9);
    const iy = horizon + R(dy * 0.3);
    const iy2 = base - R(dy * 0.13);
    line(g, ix, iy, ix2, iy, C.groove, 0.26);
    line(g, ix, iy2, ix2, iy2, C.groove, 0.32);
    line(g, ix, iy, ix, iy2, C.groove, 0.22);
    line(g, ix2, iy, ix2, iy2, C.groove, 0.22);
    line(g, ix, iy + 2, ix2, iy + 2, C.stoneLight, 0.1);
    for (const cxx of [ix, ix2]) {
      fill(g, cxx - 2, iy - 2, 5, 2, C.groove, 0.34);
      fill(g, cxx - 2, iy2, 5, 2, C.groove, 0.34);
    }
  }
  // 踢脚线：1px 受光 + 2px 深影，墙与地必须在这里断开
  fill(g, 0, horizon - 1, w, 1, C.stoneLight, 0.75);
  fill(g, 0, horizon, w, 2, C.void, 0.95);
  fill(g, 0, horizon + 2, w, 1, C.void, 0.6);
  fill(g, 0, horizon + 3, w, 1, C.stoneDark, 0.9);
}

// 远排石栏杆：整排小栏柱，压在地平线上，给中景一个「远」的层次
function farRail(g, L) {
  const { w, horizon } = L;
  const y = horizon + R(L.h * 0.012);
  const rh = Math.max(6, R(L.h * 0.026));
  fill(g, 0, y + rh, w, 3, C.void, 0.7);
  fill(g, 0, y, w, 2, C.void, 1);
  fill(g, 0, y, w, 1, C.stone, 0.75);
  fill(g, 0, y + rh - 1, w, 1, C.void, 0.6);
  const step = R(w / 11);
  for (let x = R(step * 0.5); x < w; x += step) {
    fill(g, x, y + 2, 1, rh - 3, C.void, 0.7);
    fill(g, x - 2, y + R(rh * 0.45), 5, 1, C.stone, 0.3);
  }
}

// 柱脚在地面投下的斜影（光从右窗来，影子朝左前方）
function columnShadows(g, L) {
  const { w, horizon } = L;
  const ux = xOf(L);
  const len = R(L.h * 0.05);
  for (const p of [0.06, 0.2, 0.8, 0.94]) {
    const cx = R(w * p);
    poly(g, [
      { x: cx - R(8 * ux), y: horizon + 1 }, { x: cx + R(8 * ux), y: horizon + 1 },
      { x: cx - R(18 * ux), y: horizon + 2 + len }, { x: cx - R(38 * ux), y: horizon + 2 + len },
    ], C.void, 0.5);
    poly(g, [
      { x: cx - R(8 * ux), y: horizon + 1 }, { x: cx + R(2 * ux), y: horizon + 1 },
      { x: cx - R(28 * ux), y: horizon + 1 + R(len * 0.6) }, { x: cx - R(42 * ux), y: horizon + 1 + R(len * 0.6) },
    ], C.void, 0.34);
  }
}

// 法典碑：矩形石块 + 出檐碑首 + 上楣带天平浮雕 + 五行铭文（与尖拱窗刻意不同形）
function lawTablet(g, cx, baseY, topY, sw, ux) {
  const half = R(sw / 2);
  const bodyTop = topY + R(6 * ux);
  const bodyH = baseY - R(8 * ux) - bodyTop;
  // 投在墙上的影（光从右窗来，影子在左）：把碑从暗墙上剥出来
  fill(g, cx - half - R(7 * ux), bodyTop, R(9 * ux), bodyH, C.void, 0.7);
  fill(g, cx - half - R(15 * ux), bodyTop + R(6 * ux), R(8 * ux), bodyH - R(6 * ux), C.void, 0.45);
  // 碑首：出檐一级（亮）→ 檐下阴影一级 → 平顶
  fill(g, cx - half - R(3 * ux), topY, sw + R(6 * ux), R(3 * ux), C.stone, 1);
  fill(g, cx - half - R(3 * ux), topY, sw + R(6 * ux), 1, C.stoneLight, 0.75);
  fill(g, cx - half - R(5 * ux), topY + R(3 * ux), sw + R(10 * ux), R(2 * ux), C.stoneDark, 0.95);
  fill(g, cx - half - R(5 * ux), topY + R(5 * ux), sw + R(10 * ux), 1, C.stoneLight, 0.18);
  // 碑身：左缘压暗、右缘受光
  fill(g, cx - half, bodyTop, sw, bodyH, C.stone, 1);
  fill(g, cx - half, bodyTop, 1, bodyH, C.stoneDark, 0.45);
  fill(g, cx + half - 1, bodyTop, 1, bodyH, C.stoneLight, 0.5);
  // 上楣带 + 法徽（凹槽框住的天平）
  fill(g, cx - half, bodyTop, sw, 1, C.stoneLight, 0.6);
  fill(g, cx - R(sw * 0.3), bodyTop + R(bodyH * 0.02), R(sw * 0.6), 1, C.void, 0.3);
  fill(g, cx - R(sw * 0.32), bodyTop + R(bodyH * 0.19), R(sw * 0.64), 1, C.stoneDark, 0.55);
  // 法徽用阴刻：暗线 + 底线受光，远看才读得出「刻进去的天平」
  balanceGlyph(g, cx, bodyTop + R(bodyH * 0.1) + 1, R(sw * 0.2), C.white, 0.2);
  balanceGlyph(g, cx, bodyTop + R(bodyH * 0.1), R(sw * 0.2), C.ink, 0.8);
  // 铭文：五行，行宽错落（像碑上一条条刻下去的判词）
  for (let r = 0; r < 5; r++) {
    const yy = bodyTop + R(bodyH * (0.28 + r * 0.115));
    const inset = R(sw * (0.13 + (r % 2) * 0.06));
    fill(g, cx - half + inset, yy, sw - inset * 2, 1, C.ink, 0.85);
    fill(g, cx - half + inset, yy + 1, sw - inset * 2, 1, C.white, 0.15);
  }
  // 缺口与裂纹（贴石面）
  fill(g, cx + half - R(sw * 0.18), bodyTop + R(bodyH * 0.66), 2, 2, C.void, 0.8);
  line(g, cx - R(sw * 0.3), bodyTop + 4, cx - R(sw * 0.28), bodyTop + R(bodyH * 0.2), C.void, 0.4);
  // 碑座：两级石台坐在墙裙上
  fill(g, cx - half - R(3 * ux), baseY - R(9 * ux), sw + R(6 * ux), R(5 * ux), C.stoneDark, 1);
  fill(g, cx - half - R(5 * ux), baseY - R(4 * ux), sw + R(10 * ux), R(4 * ux), C.stone, 1);
  fill(g, cx - half - R(5 * ux), baseY - R(4 * ux), sw + R(10 * ux), 1, C.stoneLight, 0.7);
}

// 一块判词碑：碑身与碑首同宽，顶端逐行收窄（圆首 / 收尖 / 崩口），碑脚沉进地面
// kind 0 = 近排（最大、整体歪 2–3px、圆首）/ 1 = 中排（正立完整、收尖）/ 2 = 远排（上缘崩口、只有近排六成高）
function stele(g, x, baseY, w, h, ux, v, kind) {
  const tilt = kind === 0 ? Math.max(2, R(2.6 * ux)) : 0;   // 只有近排歪：碑顶比碑脚错开 2–3px
  const sink = Math.max(2, R(2 * v));                       // 碑脚沉进地面 2–3px，不悬空
  const bottom = baseY + sink;
  const top = bottom - h;
  const crownH = kind === 0 ? 6 : kind === 1 ? 8 : 0;                        // 碑首 = 碑身顶端逐行收窄的那几行，不是盖板
  const bodyTop = top + crownH;
  const bodyH = bottom - bodyTop;
  const dim = kind === 0 ? 0.34 : kind === 1 ? 0.46 : 0.52; // 空气透视：越远越暗
  // 该高度处的横向错位：碑脚不动，越往上越偏（只有近排用得上）
  const sk = (y) => (tilt ? Math.max(0, Math.min(tilt, R((tilt * (bottom - y)) / Math.max(1, h)))) : 0);
  const bt = x + sk(bodyTop);                               // 碑身顶部左边
  const lean = [
    { x: bt, y: bodyTop }, { x: bt + w, y: bodyTop },
    { x: x + w, y: bottom }, { x, y: bottom },
  ];
  // 落地影：先在地上压一道，碑才不是贴上去的（光从右窗来，影子往左偏）
  fill(g, x - Math.max(1, R(7 * ux)), baseY + 1, w + Math.max(3, R(14 * ux)), Math.max(2, R(3 * v)), C.void, 0.8);

  // 碑身：rect 打底保证实心，歪的那块再用同色梯形把顶端推出 2–3px
  fill(g, x, bodyTop, w, bodyH, C.stone, 1);
  if (tilt) poly(g, lean, C.stone, 1);
  // 整碑压暗一档：碑在亮地板上是「暗块」，轮廓靠 1px 棱线读，不靠本体明度
  fill(g, x, bodyTop, w, bodyH, C.stoneDark, dim);
  if (tilt) poly(g, lean, C.stoneDark, dim);
  // 左右各 1px 竖棱拉出厚度：左棱压到近实黑，右棱接窗光
  line(g, bt, bodyTop, x, bottom, C.void, 0.9);
  line(g, bt + w - 1, bodyTop, x + w - 1, bottom, C.stoneLight, 0.95);

  // 碑面：内缩的浅凹（只比碑身暗一点点 + 上沿一道薄影）——四边描线会读成柜门
  const pad = Math.max(4, R(5 * ux));
  const iy = bodyTop + Math.max(3, R(bodyH * 0.15));
  const ih = Math.max(6, bodyH - Math.max(6, R(bodyH * 0.3)));
  const iw = Math.max(6, w - pad * 2);
  const ix = x + pad + sk(iy + R(ih / 2));
  fill(g, ix, iy, iw, ih, C.stoneDark, 0.34);
  fill(g, ix, iy, iw, 1, C.void, 0.45);
  fill(g, ix, iy + ih - 1, iw, 1, C.stone, 0.22);
  // 碑额：6×6 的小星纹（菱形 + 心点）——横条加短竖在 1x 下就是「拉手」
  let inkTop = iy + 3;
  if (kind < 2) {
    const ex = ix + R(iw / 2);
    const ey = iy + 4;
    poly(g, [{ x: ex - 2, y: ey + 2 }, { x: ex, y: ey }, { x: ex + 2, y: ey + 2 }, { x: ex, y: ey + 5 }], C.ink, 0.9);
    fill(g, ex, ey + 2, 1, 1, C.white, 0.3);
    inkTop = iy + 9;
  }
  // 碑文：3–5 行 1px 阴刻，每行断成 2–3 段（长短错落）——通栏等距横线会读成抽屉缝
  const textRows = kind === 0 ? 5 : kind === 1 ? 4 : 3;
  const rowStepY = Math.max(5, R(ih / (textRows + 1.1)));
  const chunkPat = [[0.86, 0.1], [0.52, 0.34], [0.72, 0.2], [0.44, 0.42], [0.62, 0.26]];
  for (let r = 0; r < textRows; r++) {
    const yy = inkTop + 1 + r * rowStepY;
    if (yy + 1 > iy + ih - 2) break;
    const pat = chunkPat[(r + kind) % 5];
    const indent = r === 0 ? R(iw * 0.18) : R(iw * 0.08);
    const avail = iw - indent - R(iw * 0.1);
    const w1 = Math.max(3, R(avail * pat[0]));
    fill(g, ix + indent, yy, w1, 1, C.ink, 0.9);
    if (r < textRows - 1 || kind !== 2) {
      const w2 = Math.max(2, R(avail * pat[1]));
      const gap = Math.max(2, R(iw * 0.06));
      if (indent + w1 + gap + w2 < iw - 1) fill(g, ix + indent + w1 + gap, yy, w2, 1, C.ink, 0.9);
    }
    fill(g, ix + indent, yy + 1, w1, 1, C.stone, 0.22);   // 刻线口下沿的返光
  }
  // 碑首：与碑身同宽、逐行收窄，直接从碑身顶上长出来（没有外檐、盖板、顶钮）
  if (kind === 0) {
    const arc = [0.94, 0.86, 0.74, 0.6, 0.44, 0.24];
    for (let k = 0; k < arc.length; k++) {
      const cw2 = Math.max(2, R(w * arc[k]));
      const cxx = x + sk(bodyTop - k) + R((w - cw2) / 2);
      const cy = bodyTop - 1 - k;
      fill(g, cxx, cy, cw2, 1, C.stone, 1);
      fill(g, cxx, cy, cw2, 1, C.stoneDark, dim);
      fill(g, cxx + cw2 - 1, cy, 1, 1, C.stoneLight, 0.7);
    }
  } else if (kind === 1) {
    // 尖首：四行逐行收窄到 3px（三行收不尖，1x 下和圆首分不开）
    const tip = [0.74, 0.5, 0.26, 0.08];
    for (let k = 0; k < tip.length; k++) {
      const cw2 = Math.max(2, R(w * tip[k]));
      const cxx = x + R((w - cw2) / 2);
      const cy = bodyTop - 2 - k * 2;
      fill(g, cxx, cy, cw2, 2, C.stone, 1);
      fill(g, cxx, cy, cw2, 2, C.stoneDark, dim);
      fill(g, cxx + cw2 - 1, cy, 1, 2, C.stoneLight, 0.6);
    }
  } else {
    // 断碑：碑首不是造型，是崩掉的——顶上只剩几枚高低不齐的残齿，缺口露出黑墙
    const teeth = [[0.04, 0.2, 5], [0.3, 0.22, 3], [0.58, 0.2, 6], [0.82, 0.14, 3]];
    for (const [fx, fw, fh] of teeth) {
      const tx = x + Math.max(0, R(w * fx));
      const tw = Math.max(2, R(w * fw));
      const th = Math.max(2, R(fh * v));
      fill(g, tx, bodyTop - th, tw, th, C.stone, 1);
      fill(g, tx, bodyTop - th, tw, th, C.stoneDark, dim + 0.08);
      fill(g, tx, bodyTop - th, tw, 1, C.stoneLight, 0.45);
    }
    line(g, x + R(w * 0.62), bodyTop, x + R(w * 0.5), bodyTop + R(bodyH * 0.35), C.void, 0.5);
  }
  // 蜡印：不放在碑面正中（正中红点读作把手），压在碑脚右下角
  if (kind === 1) {
    const sx = x + w - Math.max(4, R(6 * ux));
    const sy = bottom - Math.max(4, R(6 * v));
    disc(g, sx, sy, 2, C.bloodDark, 0.95);
    disc(g, sx, sy, 1, C.blood, 1);
    fill(g, sx - 1, sy - 4, 1, 2, C.bloodDark, 0.85);   // 蜡泪
  }
  // 碑脚：地面线上补 1px 受光；碑底已经沉进地面，不再另做台座
  fill(g, x - Math.max(1, R(2 * ux)), bottom - 1, w + Math.max(2, R(4 * ux)), 1, C.stoneLight, 0.3);
}

// 倒伏的判词碑：横躺在地、断口朝右，法槌头还压在断口上——「这里审判过」
function fallenStele(g, x, baseY, w, h, ux, v) {
  const top = baseY - h;
  const bw = w - R(10 * ux);
  // 落尘 + 贴地暗影（碑躺在地上，影子比碑还重）
  fill(g, x - R(7 * ux), baseY + 1, w + R(16 * ux), 3, C.void, 0.7);
  fill(g, x + R(2 * ux), baseY, bw, 1, C.void, 0.5);
  // 碑身横躺：顶面受光（比地面亮一档），侧面压到 void
  fill(g, x, top, bw, h, C.stone, 1);
  fill(g, x, top, bw, 2, C.stoneLight, 0.55);
  fill(g, x, top + R(h * 0.6), bw, h - R(h * 0.6), C.void, 0.6);
  fill(g, x, top, 1, h, C.void, 0.55);
  // 侧面的阴刻（躺倒的碑，刻字也躺倒：一排竖短笔）
  for (let r = 0; r < 4; r++) {
    const cxx = x + R(4 * ux) + r * R(bw * 0.15);
    for (let k = 0; k < 2; k++) fill(g, cxx, top + 3 + k * 3, 4, 1, C.ink, 0.8);
  }
  // 断口：右侧三步锯齿 + 掉落的碎块
  const bx = x + bw;
  for (let i = 0; i < 3; i++) {
    fill(g, bx, top + i * R(h / 3), R((3 - i) * 3 * ux), R(h / 3), C.stone, 1);
  }
  fill(g, bx, top, 1, h, C.stoneLight, 0.35);
  fill(g, bx + R(3 * ux), baseY - R(2 * v), R(6 * ux), R(2 * v), C.stoneDark, 1);
  fill(g, bx + R(2 * ux), baseY - R(4 * v), R(3 * ux), R(2 * v), C.stone, 0.9);
  // 法槌头压在断口上（判决已经落下了）
  const gx = x + R(1 * ux);
  const gy = baseY - R(9 * v);
  fill(g, gx - 1, gy - 1, R(13 * ux) + 2, R(9 * v) + 2, C.void, 0.45);
  fill(g, gx, gy, R(12 * ux), R(9 * v), C.brass, 1);
  fill(g, gx, gy, R(12 * ux), R(2 * v), C.brassLight, 0.7);              // 槌头顶面
  fill(g, gx + R(2 * ux), gy + R(2 * v), 1, R(5 * v), C.brassLight, 0.35); // 槌头棱线
  fill(g, gx, gy + R(9 * v) - 1, R(12 * ux), 1, C.brassDark, 1);
  fill(g, gx, gy + R(4 * v), R(12 * ux), 1, C.brassDark, 0.55);           // 铜箍
  fill(g, gx + R(12 * ux), gy + R(3 * v), R(10 * ux), R(2 * v), C.brassDark, 1);
  fill(g, gx + R(12 * ux), gy + R(3 * v), R(10 * ux), 1, C.brass, 0.9);   // 柄受光
  fill(g, gx + R(20 * ux), gy + R(2 * v), R(3 * ux), R(4 * v), C.brassDark, 1);
  fill(g, gx + R(20 * ux), gy + R(2 * v), R(3 * ux), 1, C.brassLight, 0.6);
  // 倒下的碑首（斜靠在地上，露出檐口）
  poly(g, [
    { x: x - R(12 * ux), y: baseY }, { x: x - R(4 * ux), y: baseY - R(7 * v) },
    { x: x + R(4 * ux), y: baseY - R(3 * v) }, { x: x + R(2 * ux), y: baseY },
  ], C.stoneDark, 1);
  fill(g, x - R(12 * ux), baseY - 1, R(14 * ux), 1, C.void, 0.4);
}

// 审判台：高背座 + 桌板 + 三块律纹嵌板 + 三级台阶 + 案上物件 + 两侧铜栏
function judgeBench(g, L, ground, v, ux) {
  const cx = R(L.w / 2);
  const accent = L.accent;
  const deskW = R(112 * ux);
  const deskTop = ground - R(36 * v);
  const deskH = R(5 * v);
  const chairW = R(44 * ux);
  const chairTop = deskTop - R(22 * v);

  // 法官高背座（先铺一圈暗边 + 投影，把剪影从墙上剥出来）
  fill(g, cx - R(chairW / 2) - R(3 * ux), chairTop - R(3 * v), chairW + R(6 * ux), R(31 * v) + R(3 * v), C.void, 0.55);
  fill(g, cx - R(chairW / 2), chairTop, chairW, R(30 * v), C.stone, 0.95);
  fill(g, cx - R(chairW / 2), chairTop, chairW, R(30 * v), C.void, 0.3);
  fill(g, cx - R(chairW / 2), chairTop, R(2 * ux), R(30 * v), C.stoneLight, 0.55);
  fill(g, cx + R(chairW / 2) - R(2 * ux), chairTop, R(2 * ux), R(30 * v), C.void, 0.4);
  fill(g, cx - R(chairW / 2), chairTop, chairW, 1, C.stoneLight, 0.4);
  fill(g, cx - R(chairW * 0.4), chairTop - R(4 * v), R(chairW * 0.8), R(4 * v), C.stoneLight, 0.7);
  fill(g, cx - R(chairW * 0.26), chairTop - R(7 * v), R(chairW * 0.52), R(3 * v), C.stoneLight, 0.85);
  fill(g, cx - 1, chairTop - R(11 * v), 2, R(4 * v), C.brassDark, 0.95);
  // 靠背：两根竖棂 + 一枚铜钉（读作「审判席」而不是一只箱子）
  for (const dx of [-0.22, 0.22]) {
    fill(g, cx + R(chairW * dx), chairTop + R(6 * v), 1, R(11 * v), C.stoneDark, 0.6);
  }
  fill(g, cx - R(chairW * 0.3), chairTop + R(6 * v), 1, R(11 * v), C.stoneDark, 0.45);
  fill(g, cx + R(chairW * 0.14), chairTop + R(8 * v), R(5 * ux), R(3 * v), C.brassDark, 0.9);
  fill(g, cx + R(chairW * 0.14), chairTop + R(8 * v), R(5 * ux), 1, C.brass, 0.6);
  fill(g, cx + R(chairW / 2) - 1, chairTop, 1, R(30 * v), accent, 0.18);

  // 桌板与桌沿
  fill(g, cx - R(deskW / 2), deskTop, deskW, deskH, C.stone, 1);
  fill(g, cx - R(deskW / 2), deskTop + 1, deskW, deskH - 1, C.void, 0.3);
  fill(g, cx - R(deskW / 2), deskTop, deskW, 1, C.stoneLight, 0.85);
  fill(g, cx + R(deskW * 0.12), deskTop, R(deskW * 0.3), 1, accent, 0.22);
  fill(g, cx - R(deskW / 2), deskTop + deskH - 1, deskW, 1, C.void, 0.5);
  fill(g, cx - R(deskW / 2) + 4, deskTop + deskH, deskW - 8, R(17 * v), C.ink, 1);
  fill(g, cx - R(deskW / 2) + 4, deskTop + deskH, deskW - 8, 1, C.stone, 0.6);
  fill(g, cx - R(deskW / 2) + 4, deskTop + deskH, 1, R(17 * v), C.stoneDark, 0.8);
  const pw = R(26 * ux);
  const gap = R(4 * ux);
  for (let i = 0; i < 3; i++) {
    const px = cx - R((pw * 3 + gap * 2) / 2) + i * (pw + gap);
    const py = deskTop + deskH + R(3 * v);
    const ph = R(11 * v);
    fill(g, px, py, pw, ph, C.stoneDark, 0.95);
    fill(g, px, py, pw, 1, C.stoneLight, 0.4);
    fill(g, px, py + ph - 1, pw, 1, C.void, 0.55);
    // 台正面是三块凹嵌板：只有正中一块刻天平徽——三块都刻徽/加横条都会读成三只抽屉
    if (i === 1) {
      balanceGlyph(g, px + R(pw / 2), py + R(6 * v), R(3.6 * ux), C.groove, 0.55);
    } else {
      fill(g, px + R(pw * 0.3), py + R(5 * v), R(pw * 0.4), 1, C.stone, 0.22);
      fill(g, px + R(pw * 0.36), py + R(7 * v), R(pw * 0.28), 1, C.stone, 0.16);
    }
  }

  // 三级台阶
  const steps = [
    [deskW - 8, deskTop + deskH + R(17 * v), R(4 * v)],
    [deskW + 8, deskTop + deskH + R(17 * v) + R(4 * v), R(5 * v)],
    [deskW + 24, deskTop + deskH + R(17 * v) + R(9 * v), R(6 * v)],
  ];
  for (const [sw, sy, sh] of steps) {
    fill(g, cx - R(sw / 2), sy, sw, sh, C.stoneDark, 1);
    fill(g, cx - R(sw / 2), sy, sw, 1, C.stone, 0.55);
    fill(g, cx - R(sw / 2), sy + sh - 1, sw, 1, C.void, 0.4);
  }
  // 台阶在抛光地面上的暗影：把台子「压」在地上
  fill(g, cx - R(deskW / 2) - 6, deskTop + deskH + R(38 * v), deskW + 44, 2, C.void, 0.3);

  // 案上：卷宗 + 法槌 + 两座未点的烛台（冷庭只有高窗一处光）
  scrollRoll(g, cx - R(26 * ux), deskTop - 6, R(18 * ux), 6, false);
  gavel(g, cx + R(18 * ux), deskTop - 7);
  candelabrum(g, cx - R(48 * ux), deskTop, v);
  candelabrum(g, cx + R(52 * ux), deskTop, v);
  // 案面被烛火烘出两小块暖光（冷庭里唯一的暖，面积要小）
  for (const dx of [-48, 52]) {
    fill(g, cx + R((dx - 9) * ux), deskTop + 1, R(18 * ux), 2, C.arcane, 0.14);
    fill(g, cx + R((dx - 5) * ux), deskTop + 1, R(10 * ux), 1, C.arcaneLight, 0.18);
  }

  // 两侧铜栏（审判台的「栏杆」，与近景石栏区分材质）
  for (const side of [-1, 1]) {
    const bx = cx + side * R(deskW / 2 + 8);
    fill(g, bx - R(11 * ux), deskTop - R(2 * v), R(22 * ux), R(2 * v), C.brassDark, 1);
    fill(g, bx - R(11 * ux), deskTop - R(2 * v), R(22 * ux), 1, C.brass, 0.7);
    for (let k = -1; k <= 1; k++) {
      fill(g, bx + k * R(8 * ux), deskTop, R(2 * ux), R(8 * v), C.brassDark, 1);
    }
    fill(g, bx - R(11 * ux), deskTop + R(8 * v), R(22 * ux), R(2 * v), C.brassDark, 0.85);
  }
}

// 铜天平：背光 + 石座雕饰 + 球节柱 + 横梁（右低）+ 双链 + 双盘（右盘盛两卷判词）
function scales(g, cx, ground, v, ux, accent) {
  const u = 100; // 立杆高度：横屏时横梁压在高窗亮部，成为背光剪影
  const pedTop = ground - R(17 * v);
  const beamY = pedTop - R(u * v);
  const half = R(56 * ux);

  // 背光：梁后一圈冷白硬边光（越外越淡，靠叠层做「外溢」）
  const glow = [[96, 64, 0.03], [74, 50, 0.042], [52, 36, 0.05]];
  for (const [gw, gh, ga] of glow) {
    poly(g, [
      { x: cx, y: beamY + R(28 * v) - R(gh * v * 0.5) },
      { x: cx + R(gw * ux), y: beamY + R(28 * v) },
      { x: cx, y: beamY + R(28 * v) + R(gh * v * 0.5) },
      { x: cx - R(gw * ux), y: beamY + R(28 * v) },
    ], accent, ga);
  }

  // 基石三级 + 雕饰（柱脚压在地面上，先落影）
  poly(g, [
    { x: cx - R(30 * ux), y: ground + 1 }, { x: cx + R(30 * ux), y: ground + 1 },
    { x: cx + R(24 * ux), y: ground + 4 }, { x: cx - R(52 * ux), y: ground + 4 },
  ], C.void, 0.35);
  fill(g, cx - R(32 * ux), ground - R(3 * v), R(64 * ux), R(3 * v), C.void, 1);
  fill(g, cx - R(28 * ux), ground - R(9 * v), R(56 * ux), R(6 * v), C.stone, 1);
  fill(g, cx - R(28 * ux), ground - R(9 * v), R(56 * ux), 1, C.stoneLight, 0.95);
  fill(g, cx - R(28 * ux), ground - R(9 * v), 1, R(6 * v), C.void, 0.5);
  fill(g, cx - R(22 * ux), ground - R(13 * v), R(44 * ux), R(4 * v), C.stoneDark, 1);
  fill(g, cx - R(22 * ux), ground - R(13 * v), R(44 * ux), 1, C.stone, 0.75);
  fill(g, cx - R(16 * ux), ground - R(17 * v), R(32 * ux), R(4 * v), C.stone, 1);
  fill(g, cx - R(16 * ux), ground - R(17 * v), R(32 * ux), 1, C.stoneLight, 0.6);
  fill(g, cx - R(16 * ux), ground - R(17 * v), 1, R(4 * v), C.void, 0.45);
  for (let i = 0; i < 3; i++) fill(g, cx - R(10 * ux) + i * R(9 * ux), ground - R(8 * v), 1, R(4 * v), C.void, 0.45);
  balanceGlyph(g, cx, ground - R(6 * v), R(4 * ux), C.groove, 0.6);

  // 柱身：左侧受光棱，右侧入暗
  fill(g, cx - R(3 * ux), beamY, R(6 * ux), pedTop - beamY, C.brassDark, 1);
  fill(g, cx - R(3 * ux), beamY, R(2 * ux), pedTop - beamY, C.brass, 0.9);
  fill(g, cx - R(3 * ux), beamY, 1, pedTop - beamY, C.brassLight, 0.7);
  fill(g, cx + R(2 * ux), beamY, 1, pedTop - beamY, C.void, 0.45);
  // 箍环：每 18px 一道铜箍，柱身才有金属的「段」
  for (let yy = beamY + R(18 * v); yy < pedTop - R(8 * v); yy += R(18 * v)) {
    fill(g, cx - R(4 * ux), yy, R(8 * ux), R(2 * v), C.brassDark, 1);
    fill(g, cx - R(4 * ux), yy, R(8 * ux), 1, C.brassLight, 0.55);
  }
  // 柱头 + 球节（天平支点）
  fill(g, cx - R(8 * ux), beamY - R(4 * v), R(16 * ux), R(4 * v), C.brass, 1);
  fill(g, cx - R(8 * ux), beamY - R(4 * v), R(16 * ux), 1, C.brassLight, 0.85);
  fill(g, cx - R(8 * ux), beamY + R(1 * v), R(16 * ux), 1, C.brassDark, 1);
  disc(g, cx, beamY + R(6 * v), Math.max(3, R(4 * ux)), C.brass, 1);
  ring(g, cx, beamY + R(6 * v), Math.max(3, R(4 * ux)), C.brassLight, 0.65, 12);

  // 横梁：三段各落 1px，右端更低——「天平略倾」
  const segW = R((2 * half) / 3);
  for (let i = 0; i < 3; i++) {
    const x = cx - half + i * segW;
    const y = beamY + i * 3;
    fill(g, x, y, segW, R(3 * v), C.brass, 1);
    fill(g, x, y, segW, 1, C.brassLight, 0.85);
    fill(g, x, y + R(3 * v) - 1, segW, 1, C.brassDark, 1);
    fill(g, x, y, segW, 1, accent, 0.32);
  }
  fill(g, cx - half - 2, beamY - 1, 4, R(5 * v), C.brassDark, 1);
  fill(g, cx + half - 2, beamY + 5, 4, R(5 * v), C.brassDark, 1);

  // 吊链：每侧双链（1px 链节拼成 2px 粗），末端再接盘环
  const chainL = R(20 * v);
  const panTopL = beamY + R(3 * v) + chainL;
  const panTopR = beamY + 6 + R(3 * v) + chainL;
  const pcL = cx - half + R(10 * ux);
  const pcR = cx + half - R(10 * ux);
  for (const [ax, ay] of [
    [pcL - R(8 * ux), beamY + R(3 * v)], [pcL + R(8 * ux), beamY + R(3 * v)],
    [pcR - R(8 * ux), beamY + 6 + R(3 * v)], [pcR + R(8 * ux), beamY + 6 + R(3 * v)],
  ]) {
    chain(g, { x: ax, y: ay, h: chainL, color: C.brassDark, alpha: 0.9, linkH: 4 });
    chain(g, { x: ax + 1, y: ay, h: chainL, color: C.brass, alpha: 0.95, linkH: 4 });
    chain(g, { x: ax + 2, y: ay, h: chainL, color: C.brassLight, alpha: 0.5, linkH: 4 });
  }

  // 右盘的两卷判词（重的一侧因此在下面）
  scrollRoll(g, pcR - R(8 * ux), panTopR - 5, R(14 * ux), 4, true);
  scrollRoll(g, pcR - R(6 * ux), panTopR - 9, R(11 * ux), 4, false);
  pan(g, pcL, panTopL, ux, v, accent);
  pan(g, pcR, panTopR, ux, v, accent);
}

// 一只秤盘：吊环 + 盘口 + 逐级收窄的弧底 + 盘底受光
function pan(g, cx, topY, ux, v, accent) {
  const w = R(26 * ux); // 盘口宽（辨识标记：26×2 的亮盘口）
  fill(g, cx - R(8 * ux), topY - R(2 * v), 2, R(2 * v), C.brassDark, 1);
  fill(g, cx + R(8 * ux) - 2, topY - R(2 * v), 2, R(2 * v), C.brassDark, 1);
  fill(g, cx - R(w / 2), topY, w, 2, C.brass, 1);
  fill(g, cx - R(w / 2), topY, w, 1, C.brassLight, 0.9);
  fill(g, cx - R(w * 0.44), topY + 2, R(w * 0.88), 2, C.brass, 0.95);
  fill(g, cx - R(w * 0.3), topY + 4, R(w * 0.6), 2, C.brass, 0.9);
  fill(g, cx - R(w * 0.16), topY + 6, R(w * 0.32), 1, C.brassDark, 1);
  fill(g, cx - R(w * 0.1), topY + 6, R(w * 0.2), 1, C.brassLight, 0.55);
  fill(g, cx - R(w * 0.4), topY + 2, R(w * 0.14), 1, C.brassLight, 0.5);
  fill(g, cx - R(w / 2), topY, w, 1, accent, 0.25);
}

// 卷宗：纸卷 + 纸边 + 蜡红系绳
function scrollRoll(g, x, y, w, h, ribbon) {
  fill(g, x, y, w, h, C.parchment, 0.78);
  fill(g, x, y, w, 1, C.white, 0.3);
  fill(g, x, y + h - 1, w, 1, C.khaki, 0.85);
  fill(g, x, y, 2, h, C.bone, 0.9);
  fill(g, x + w - 2, y, 2, h, C.khaki, 0.9);
  if (ribbon) fill(g, x + R(w * 0.55), y, 2, h, C.bloodDark, 0.9);
}

// 卷宗堆：三本档案册（皮封面 + 纸口 + 束带）+ 顶上一卷，堆在栏杆后
function recordStack(g, x, baseY, v, ux) {
  fill(g, x - R(4 * ux), baseY, R(44 * ux), 3, C.void, 0.6);
  const layers = [[0, 0, 36, 6], [2, 6, 30, 6], [-1, 12, 25, 6]];
  for (const [dx, dy, rw, rh] of layers) {
    const bx = x + R(dx * ux);
    const by = baseY - R((dy + rh) * v);
    const bw = R(rw * ux);
    fill(g, bx - 1, by - 1, bw + 2, R(rh * v) + 1, C.void, 0.6);
    fill(g, bx, by, bw, R(rh * v), C.ink, 1);
    fill(g, bx, by, bw, 1, C.mauve, 0.9);
    fill(g, bx + 1, by + R(rh * v) - 1, bw - 2, 1, C.parchment, 0.42);
    fill(g, bx + R(rw * 0.24), by, 2, R(rh * v), C.brassDark, 0.7);
    fill(g, bx + R(rw * 0.24) - 1, by + 2, 4, 2, C.bloodDark, 0.75);
  }
  scrollRoll(g, x + R(2 * ux), baseY - R(22 * v), R(24 * ux), R(4 * v), true);
}

// 三臂烛台（未点燃）：冷庭只由高窗照明，烛台是「等待开庭」的静物
function candelabrum(g, x, baseY, v) {
  const hh = R(8 * v);
  // 暖光晕：冷庭里只有这一圈暖（两层硬边，不做模糊）
  fill(g, x - R(10 * v), baseY - hh - R(16 * v), R(21 * v), R(10 * v), C.arcane, 0.05);
  fill(g, x - R(6 * v), baseY - hh - R(13 * v), R(13 * v), R(7 * v), C.arcane, 0.08);
  fill(g, x - R(4 * v), baseY - R(2 * v), R(9 * v), R(2 * v), C.brassDark, 1);
  fill(g, x - 1, baseY - hh, 2, hh - R(2 * v), C.brassDark, 1);
  fill(g, x - 1, baseY - hh, 1, hh - R(2 * v), C.brass, 0.75);
  fill(g, x - R(5 * v), baseY - hh, R(11 * v), 1, C.brass, 0.9);
  for (const dx of [-5, 0, 5]) {
    const cx = x + R(dx * v);
    fill(g, cx - 1, baseY - hh - R(3 * v), 3, R(2 * v), C.brassDark, 1);
    fill(g, cx, baseY - hh - R(8 * v), 2, R(5 * v), C.parchment, 0.8);
    fill(g, cx, baseY - hh - R(8 * v), 1, R(5 * v), C.white, 0.28);
    fill(g, cx, baseY - hh - R(11 * v), 1, R(3 * v), C.arcane, 0.95);
    fill(g, cx - 1, baseY - hh - R(13 * v), 3, 1, C.arcaneLight, 0.3);
  }
  fill(g, x - 1, baseY - hh - R(4 * v), 1, R(2 * v), C.parchment, 0.5);
}

// 法槌：铜头 + 木柄，摊在案上
function gavel(g, x, y) {
  // 法槌是案上第三处暖点：铜头外一圈暖光晕
  fill(g, x + 2, y - 3, 20, 12, C.arcane, 0.05);
  fill(g, x + 6, y - 1, 13, 8, C.arcane, 0.06);
  fill(g, x, y + 3, 12, 2, C.brassDark, 1);
  fill(g, x, y + 3, 12, 1, C.brass, 0.55);
  fill(g, x + 8, y, 9, 6, C.brassDark, 1);
  fill(g, x + 8, y, 9, 1, C.brass, 0.85);
  fill(g, x + 8, y, 4, 5, C.brassLight, 0.35);
  fill(g, x + 8, y + 5, 9, 1, C.void, 0.8);
  fill(g, x + 12, y + 1, 1, 4, C.void, 0.55);
}

// 地面石徽（竖屏）：同心椭圆石环 + 放射短划 + 中心天平，像法庭地心的一块「法印」
function floorMedallion(g, cx, cy, v) {
  const rx = R(132 * v * 0.72);
  const ry = R(24 * v * 0.92);
  ellipseRing(g, cx, cy, rx, ry, C.groove, 0.45, 40);
  ellipseRing(g, cx, cy, R(rx * 0.86), R(ry * 0.86), C.stoneLight, 0.32, 40);
  ellipseRing(g, cx, cy, R(rx * 0.62), R(ry * 0.62), C.groove, 0.36, 36);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const c = Math.cos(a);
    const s = Math.sin(a);
    line(g, cx + c * rx * 0.86, cy + s * ry * 0.86, cx + c * rx, cy + s * ry, C.groove, 0.4);
  }
  balanceGlyph(g, cx, cy, R(rx * 0.1), C.groove, 0.6);
  fill(g, cx - R(rx * 0.18), cy + R(ry * 0.9), R(rx * 0.36), 1, C.void, 0.22);
}

// 落地烛架（竖屏）：石座 + 铜柱 + 三支未点的细烛
function floorLamp(g, x, baseY, v) {
  const hh = R(22 * v);
  fill(g, x - R(9 * v), baseY, R(19 * v), 2, C.void, 0.55);        // 接地影
  fill(g, x - R(8 * v), baseY - 2, R(17 * v), 2, C.stoneDark, 1);  // 头重脚轻的烛架得有个实底
  fill(g, x - R(7 * v), baseY - R(2 * v), R(15 * v), R(2 * v), C.stoneDark, 1);
  fill(g, x - R(4 * v), baseY - R(5 * v), R(9 * v), R(3 * v), C.stone, 1);
  fill(g, x - R(4 * v), baseY - R(5 * v), R(9 * v), 1, C.stoneLight, 0.55);
  fill(g, x - 1, baseY - hh, 2, hh - R(5 * v), C.brassDark, 1);
  fill(g, x - 1, baseY - hh, 1, hh - R(5 * v), C.brass, 0.7);
  fill(g, x - R(8 * v), baseY - hh, R(17 * v), 1, C.brass, 0.9);
  for (const dx of [-8, 0, 8]) {
    const cx = x + R(dx * v);
    fill(g, cx - 1, baseY - hh - R(4 * v), 3, R(2 * v), C.brassDark, 1);
    fill(g, cx, baseY - hh - R(10 * v), 2, R(6 * v), C.parchment, 0.7);
    fill(g, cx, baseY - hh - R(10 * v), 1, R(6 * v), C.white, 0.22);
    fill(g, cx, baseY - hh - R(13 * v), 1, R(3 * v), C.void, 1);
  }
}
