// 第 V 幕「衡律法庭」——三层静态布景。
// 构图（横屏 480×270，地平线 135，碑座上沿 186）：
//   远景 0–135：藻井 + 齿状檐口 + 律纹饰带 + 中轴法典碑 + 左右尖拱高窗（右窗是唯一光源）
//                + 四根大理石柱（投影落左墙）+ 一束从窗口斜下的硬边光柱
//                + 竖屏独有的玫瑰窗（高墙留白处，撑住「法庭＝大礼拜堂」的尺度）
//   中景 135–186：大理石地面（透视石缝 / 镶边线 / 石纹 / 右窗光池与反光）→ 三级审判台与法官高背座
//                → 右侧铜天平（横梁右倾、双链双盘、右盘压着两卷判词）→ 左排三块判词碑（远/中/近三排，近排最大）
//                → 卷宗堆 / 案上卷宗 / 法槌 / 两座未点的烛台；竖屏另铺地面圆徽与两根落地烛架
//   近景 168–186：通栏石栏杆 9 根 + 侧光雾
// 材质线全部依附实体：石缝贴地面、柱身凹槽贴柱、砌缝贴墙、蜡印贴判词碑、纸边贴卷宗、铜锈贴天平。
import {
  fill, column, pointedArch, chain, disc, ring, ellipseRing,
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
    fillColor: lit ? accent : C.glassBlue, fillAlpha: lit ? 0.5 : 0.42, segs: 16,
  });
  if (lit) {
    pointedArch(g, { cx, baseY: sill, w: w - R(4 * ux), h: h - R(3 * ux), t: 0, fillColor: accent, fillAlpha: 0.22, segs: 16 });
    fill(g, cx - R(w * 0.2), sill - R(h * 0.72), R(w * 0.4), R(h * 0.34), C.white, 0.12);
  } else {
    // 暗窗的玻璃反光（1px 斜线，说明是玻璃不是洞）
    line(g, cx - R(w * 0.28), sill - R(h * 0.42), cx + R(w * 0.06), sill - R(h * 0.12), C.mute, 0.28);
  }
  // 竖棂两只 + 横档
  const mH = R(h * 0.56);
  for (let i = 1; i <= 2; i++) {
    fill(g, R(cx - w / 2 + (w * i) / 3), sill - mH, 1, mH, C.stoneDark, lit ? 0.9 : 0.75);
  }
  fill(g, cx - R(w * 0.34), sill - R(h * 0.26), R(w * 0.68), 1, C.stoneDark, lit ? 0.8 : 0.65);
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
  fill(g, 0, 0, w, ceilH, C.ink, 1);
  fill(g, 0, 0, w, 1, C.stoneDark, 0.9);
  for (let i = 0; i <= 8; i++) fill(g, R((w * i) / 8), 0, 1, ceilH, C.stoneDark, 0.5);
  fill(g, 0, R(ceilH * 0.5), w, 1, C.stoneDark, 0.4);
  fill(g, 0, ceilH - 1, w, 1, C.void, 0.9);

  // 檐口 + 齿饰：法庭的石头门楣，一眼区别于墓园矮墙
  fill(g, 0, ceilH, w, corniceH, C.stoneDark, 1);
  fill(g, 0, ceilH, w, 1, C.stoneLight, 0.55);
  fill(g, 0, ceilH + R(corniceH * 0.45), w, 1, C.void, 0.45);
  const dentW = R(6 * ux);
  const dentGap = R(10 * ux);
  for (let x = R(4 * ux); x < w - dentW; x += dentW + dentGap) {
    fill(g, x, ceilH + corniceH - R(4 * ux), dentW, R(4 * ux), C.stone, 0.9);
  }

  // 律纹饰带：横竖短笔 + 菱形，反复出现成「法度」的花边
  fill(g, 0, wallY, w, friezeH, C.ink, 0.6);
  fill(g, 0, wallY, w, 1, C.void, 0.55);
  fill(g, 0, wallY + friezeH - 1, w, 1, C.stone, 0.45);
  const markStep = R(24 * ux);
  for (let x = R(12 * ux); x < w; x += markStep) {
    fill(g, x, wallY + 1, 1, friezeH - 2, C.groove, 0.4);
    fill(g, x - R(3 * ux), wallY + R(friezeH * 0.55), R(7 * ux), 1, C.groove, 0.32);
    const dx = x + R(markStep / 2);
    poly(g, [
      { x: dx, y: wallY + 1 }, { x: dx + 2, y: wallY + R(friezeH / 2) },
      { x: dx, y: wallY + friezeH - 2 }, { x: dx - 2, y: wallY + R(friezeH / 2) },
    ], C.stone, 0.4);
  }

  // 后墙：交错砌缝的大理石砌体（横缝压暗、上沿受光、竖缝错缝）
  const wallH = horizon - wallY;
  const rowH = Math.max(6, R(12 * ux));
  fill(g, 0, wallY, w, wallH, C.stoneDark, 1);
  for (let y = wallY + rowH; y < horizon - 1; y += rowH) {
    fill(g, 0, y, w, 1, C.void, 0.5);
    fill(g, 0, y + 1, w, 1, C.stone, 0.14);
  }
  const jointStep = R(76 * ux);
  let rowIdx = 0;
  for (let y = wallY; y < horizon - 2; y += rowH, rowIdx++) {
    const off = (rowIdx % 2) * R(38 * ux);
    for (let x = off + R(18 * ux); x < w; x += jointStep) {
      fill(g, x, y, 1, Math.min(rowH, horizon - y), C.void, 0.34);
    }
  }

  // 墙裙：与地面交界压一道亮顶暗身的基座，托住所有中景物件
  fill(g, 0, horizon - wainH, w, wainH, C.stone, 0.9);
  fill(g, 0, horizon - wainH, w, 1, C.stoneLight, 0.85);
  fill(g, 0, horizon - wainH + 1, w, 1, C.void, 0.35);
  for (let x = 0; x < w; x += R(30 * ux)) fill(g, x, horizon - wainH + 2, 1, wainH - 2, C.void, 0.38);
  fill(g, 0, horizon - 1, w, 1, C.void, 0.9);

  // 右窗洒在墙上的光（硬边梯形，只抬受光侧，不整片染色）
  poly(g, [
    { x: R(w * 0.5), y: wallY }, { x: R(w * 0.93), y: wallY },
    { x: R(w * 0.93), y: horizon }, { x: R(w * 0.46), y: horizon },
  ], accent, 0.03);
  poly(g, [
    { x: R(w * 0.62), y: wallY }, { x: R(w * 0.86), y: wallY },
    { x: R(w * 0.87), y: horizon }, { x: R(w * 0.56), y: horizon },
  ], accent, 0.035);

  // —— 中轴法典碑：整座法庭的「法」 ——
  lawTablet(g, R(w / 2), tabletBase, winTop, R(60 * ux), ux);

  // —— 左右尖拱高窗（右窗是唯一光源） ——
  gothicWindow(g, dcx, winSill, winW, winH, ux, false, accent);
  gothicWindow(g, lcx, winSill, winW, winH, ux, true, accent);
  // 受光高窗的亮核：玻璃再压两层，成为全画最亮的地方
  fill(g, lcx - R(winW * 0.3), winSill - R(winH * 0.8), R(winW * 0.6), R(winH * 0.5), accent, 0.2);
  fill(g, lcx - R(winW * 0.14), winSill - R(winH * 0.7), R(winW * 0.28), R(winH * 0.3), C.white, 0.14);
  // 阶梯光晕：硬边两层，模拟窗光外溢
  fill(g, lcx - R(winW * 0.5) - R(9 * ux), winTop - R(6 * ux), winW + R(18 * ux), winH + R(12 * ux), accent, 0.05);
  fill(g, lcx - R(winW * 0.5) - R(4 * ux), winTop - R(3 * ux), winW + R(8 * ux), winH + R(6 * ux), accent, 0.035);

  // 竖屏专属：高墙中段补一扇玫瑰窗
  if (L.tall) {
    const room = winTop - (wallY + friezeH);
    roseWindow(g, R(w / 2), R((wallY + friezeH + winTop) / 2), Math.min(R(w * 0.11), R(room / 2) - 8), accent);
  }

  // —— 四根大理石柱（凹槽贴柱身，投影落左墙） ——
  const cw = R(14 * ux);
  for (const p of [0.06, 0.2, 0.8, 0.94]) {
    const cx = R(w * p);
    fill(g, cx - R(cw / 2) - R(7 * ux), wallY, R(4 * ux), horizon - wallY, C.void, 0.22);
    fill(g, cx - R(cw / 2) - R(3 * ux), wallY, R(3 * ux), horizon - wallY, C.void, 0.18);
    column(g, {
      cx, topY: wallY, bottomY: horizon, w: cw, shaft: C.stone, light: C.stoneLight,
      dark: C.void, capH: R(5 * ux), baseH: R(5 * ux), flutes: 3,
    });
    // 柱头冠板 + 柱础
    fill(g, cx - R(cw / 2) - 3, wallY - R(2 * ux), cw + 6, R(2 * ux), C.stoneLight, 0.6);
    fill(g, cx - R(cw / 2) - 3, wallY, cw + 6, 1, C.void, 0.4);
    fill(g, cx - R(cw / 2) - 3, horizon - R(5 * ux), cw + 6, R(5 * ux), C.stoneDark, 0.95);
    fill(g, cx - R(cw / 2) - 3, horizon - R(5 * ux), cw + 6, 1, C.stone, 0.5);
    // 迎光柱：右侧两根的左边沿吃幕色
    if (p > 0.7) fill(g, cx - R(cw / 2), wallY + R(5 * ux), 1, horizon - wallY - R(10 * ux), accent, 0.2);
  }

  // —— 右窗斜光：硬边光柱 + 光里的浮尘 ——
  const bx0 = lcx - R(winW / 2);
  const bx1 = lcx + R(winW / 2);
  poly(g, [
    { x: bx0, y: winSill }, { x: bx1, y: winSill },
    { x: bx1 - R(8 * ux), y: horizon }, { x: bx0 - R(56 * ux), y: horizon },
  ], accent, 0.06);
  poly(g, [
    { x: bx0 + 4, y: winSill + 3 }, { x: bx1 - 4, y: winSill + 3 },
    { x: bx1 - R(22 * ux), y: horizon }, { x: bx0 - R(40 * ux), y: horizon },
  ], accent, 0.04);
  for (const [dx, dy] of [[-6, 14], [7, 26], [-20, 38], [4, 50], [-11, 60]]) {
    fill(g, lcx + dx, winSill + dy, 1, 1, accent, 0.24);
  }
  fill(g, 0, horizon - 1, w, 1, C.void, 0.9);
}

// 法典碑：矩形石块 + 出檐碑首 + 上楣带天平浮雕 + 五行铭文（与尖拱窗刻意不同形）
function lawTablet(g, cx, baseY, topY, sw, ux) {
  const half = R(sw / 2);
  const bodyTop = topY + R(6 * ux);
  const bodyH = baseY - R(8 * ux) - bodyTop;
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

// ---------- 中景 ----------
export function mid(g, L) {
  const { w } = L;
  const v = vOf(L);
  const ux = xOf(L);
  const base = baseOf(L);
  const ground = groundOf(L);

  marbleFloor(g, L, base);

  // 三块判词碑：远排小、中排居中、近排最大（基座 y 各自不同、碑首造型各异）
  const tx = [0.135, 0.235, 0.315];
  const tws = [42, 34, 26];
  const ths = [74, 48, 28];
  for (let i = 0; i < 3; i++) {
    const bw = R(tws[i] * ux);
    const bh = R(ths[i] * v);
    const by = ground - (i === 0 ? 0 : i === 1 ? R(13 * v) : R(26 * v));
    stele(g, R(w * tx[i]), by, bw, bh, ux, i);
  }

  judgeBench(g, L, ground, v, ux);
  scales(g, R(w * 0.6875), ground, v, ux, L.accent);

  // 卷宗堆：靠栏杆放着，是最近的一排「纸」
  recordStack(g, R(w * 0.83), base - R(18 * v), v, ux);

  // 竖屏才有的近地面：石徽 + 两根落地烛架，把大块空地面收住
  if (L.tall) {
    floorMedallion(g, R(w / 2), base - R(58 * v), v);
    floorLamp(g, R(w * 0.08), base - R(6 * v), v);
    floorLamp(g, R(w * 0.91), base - R(6 * v), v);
  }
}

// ---------- 近景 ----------
export function fore(g, L) {
  const { w, accent } = L;
  const base = baseOf(L);
  const v = vOf(L);
  const raH = R(18 * v);
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

  // 通栏石栏杆：上扶手 + 下横梁 + 9 根车削栏柱
  fill(g, 0, topY, w, R(3 * v), C.ink, 0.95);
  fill(g, 0, topY, w, 1, C.stone, 0.6);
  fill(g, 0, topY + R(3 * v) - 1, w, 1, C.void, 0.9);
  const botY = base - R(5 * v);
  fill(g, 0, botY, w, R(2 * v), C.ink, 0.95);
  fill(g, 0, botY, w, 1, C.stoneDark, 0.45);
  for (let i = 0; i < 9; i++) {
    const x = R(w * (0.055 + i * 0.111));
    const sy = topY + R(3 * v);
    fill(g, x, sy, R(3 * v), botY - sy, C.void, 0.95);
    fill(g, x - 1, sy + R(3 * v), R(5 * v), R(3 * v), C.void, 1);
    fill(g, x, sy, 1, botY - sy, C.stone, 0.32);
    if (i % 3 === 1) fill(g, x - 1, topY - R(3 * v), R(5 * v), R(3 * v), C.brassDark, 0.85);
  }
  fill(g, 0, base - R(2 * v), w, R(2 * v), C.void, 0.9);
  // 幕色只描受光的一段扶手（右窗外的那一截）
  fill(g, R(w * 0.62), topY, R(w * 0.38), 1, accent, 0.18);
  fill(g, R(w * 0.66), topY, R(w * 0.1), 1, accent, 0.24);
}

// ---------- 中景构件 ----------

// 大理石地面：透视横缝 + 消失点纵缝 + 镶边线 + 石纹 + 右侧光池与反光
function marbleFloor(g, L, base) {
  const { w, horizon, accent } = L;
  const dy = base - horizon;
  fill(g, 0, horizon, w, L.h - horizon, C.ink, 1);

  // 横向石缝：越近越疏
  const ys = [horizon];
  for (let i = 1; i <= 6; i++) ys.push(horizon + R(dy * Math.pow(i / 6, 1.4)));
  for (let i = 0; i < 6; i++) {
    const y = ys[i];
    const hh = ys[i + 1] - y;
    fill(g, 0, y, w, hh, C.stoneDark, 0.45);
    fill(g, 0, y, w, 1, C.stone, 0.48);
    fill(g, 0, y + 1, w, 1, C.void, 0.45);
  }
  // 纵缝：从消失点放射（只留中间几条，避免角落成扇形噪声）
  for (let i = -4; i <= 4; i++) {
    if (!i) continue;
    line(g, R(w / 2) + i * 8, horizon, R(w / 2) + i * 78, base + R(dy * 0.4), C.groove, 0.14);
  }
  // 镶边线：铺地的石作线脚（成排细线，比随机裂纹更像「建筑」）
  for (const f of [0.2, 0.4, 0.6, 0.8]) {
    const y = horizon + R(dy * f);
    fill(g, 0, y, w, 1, C.groove, 0.2);
    fill(g, 0, y + 1, w, 1, C.void, 0.3);
  }
  // 石纹：贴地走的折线，只落在空地上
  line(g, R(w * 0.04), horizon + 6, R(w * 0.1), horizon + R(dy * 0.34), C.mute, 0.22);
  line(g, R(w * 0.1), horizon + R(dy * 0.34), R(w * 0.07), horizon + R(dy * 0.6), C.mute, 0.16);
  line(g, R(w * 0.64), horizon + 4, R(w * 0.7), horizon + R(dy * 0.3), C.mute, 0.2);
  line(g, R(w * 0.86), horizon + 8, R(w * 0.82), horizon + R(dy * 0.45), C.mute, 0.18);

  // 右半地面整体受光（平涂，不是渐变）
  poly(g, [
    { x: R(w * 0.44), y: horizon + 1 }, { x: w, y: horizon + 1 },
    { x: w, y: base }, { x: R(w * 0.24), y: base },
  ], C.stone, 0.1);
  // 窗光池：与远景光柱接上，向近处放大
  poly(g, [
    { x: R(w * 0.545), y: horizon + 2 }, { x: R(w * 0.702), y: horizon + 2 },
    { x: R(w * 0.75), y: base }, { x: R(w * 0.49), y: base },
  ], accent, 0.075);
  poly(g, [
    { x: R(w * 0.585), y: horizon + 3 }, { x: R(w * 0.665), y: horizon + 3 },
    { x: R(w * 0.69), y: base }, { x: R(w * 0.57), y: base },
  ], accent, 0.055);
  // 抛光地面的窗影反光：一排横向短光
  for (const [f, x0, len, a] of [[0.09, 0.62, 26, 0.16], [0.2, 0.6, 40, 0.12], [0.35, 0.63, 52, 0.09], [0.52, 0.58, 34, 0.06]]) {
    fill(g, R(w * x0), horizon + R(dy * f), R(len), 1, accent, a);
  }
  // 地面与墙裙交界的接触暗带
  fill(g, 0, horizon, w, 2, C.void, 0.45);
}

// 地面石徽（竖屏）：同心椭圆石环 + 放射短划 + 中心天平，像法庭地心的一块「法印」
function floorMedallion(g, cx, cy, v) {
  const rx = R(132 * v * 0.72);
  const ry = R(24 * v * 0.92);
  ellipseRing(g, cx, cy, rx, ry, C.groove, 0.32, 40);
  ellipseRing(g, cx, cy, R(rx * 0.86), R(ry * 0.86), C.stoneLight, 0.24, 40);
  ellipseRing(g, cx, cy, R(rx * 0.62), R(ry * 0.62), C.groove, 0.26, 36);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const c = Math.cos(a);
    const s = Math.sin(a);
    line(g, cx + c * rx * 0.86, cy + s * ry * 0.86, cx + c * rx, cy + s * ry, C.groove, 0.28);
  }
  balanceGlyph(g, cx, cy, R(rx * 0.1), C.groove, 0.42);
  fill(g, cx - R(rx * 0.18), cy + R(ry * 0.9), R(rx * 0.36), 1, C.void, 0.22);
}

// 落地烛架（竖屏）：石座 + 铜柱 + 三支未点的细烛
function floorLamp(g, x, baseY, v) {
  const hh = R(22 * v);
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

// 一块判词碑：两级碑座 + 凹面碑身 + 三款碑首（尖顶 / 平檐 / 斜面）+ 铭条 + 蜡印
function stele(g, x, baseY, w, h, ux, kind) {
  const top = baseY - h;
  // 落影 + 两级碑座
  fill(g, x - 4, baseY + 1, w + 8, 2, C.void, 0.5);
  fill(g, x - 5, baseY - 3, w + 10, 3, C.stoneDark, 1);
  fill(g, x - 5, baseY - 3, w + 10, 1, C.stone, 0.6);
  fill(g, x - 7, baseY, w + 14, 2, C.stoneDark, 0.85);
  // 碑身：近排最亮，往后逐排压暗（空气透视）
  fill(g, x, top, w, h, C.stone, 1);
  if (kind > 0) fill(g, x, top, w, h, C.stoneDark, kind === 1 ? 0.16 : 0.3);
  fill(g, x, top, 1, h, C.stoneDark, 0.5);
  fill(g, x + w - 1, top, 1, h, C.stoneLight, kind === 0 ? 0.55 : 0.28);
  fill(g, x, top, w, 1, C.stoneLight, kind === 0 ? 0.5 : 0.3);
  // 凹面：内缩 4px 的浅凹，读作「凿出来的碑面」而不是柜门
  const ix = x + 5;
  const iy = top + R(h * 0.14);
  const iw = w - 10;
  const ih = h - R(h * 0.26);
  fill(g, ix, iy, iw, ih, C.stoneDark, 0.22);
  fill(g, ix, iy, iw, 1, C.void, 0.4);
  fill(g, ix, iy, 1, ih, C.void, 0.35);
  fill(g, ix, iy + ih - 1, iw, 1, C.stoneLight, 0.2);
  fill(g, ix + iw - 1, iy, 1, ih, C.stoneLight, 0.18);
  // 铭条：两三行短栏，不顶到边
  const rows = w >= 30 ? 3 : 2;
  for (let r = 0; r < rows; r++) {
    const yy = iy + R(ih * (0.26 + r * 0.24));
    for (let c = 0; c < 3; c++) {
      const bw = R((iw - 6) / 3);
      fill(g, ix + 3 + c * bw, yy, bw - 3, 1, C.ink, 0.8);
      fill(g, ix + 3 + c * bw, yy + 1, bw - 3, 1, C.white, 0.12);
    }
  }
  // 碑首：三款轮廓（近排尖顶+宝顶 / 中排平檐 / 远排斜顶）
  if (kind === 0) {
    poly(g, [
      { x: x - 2, y: top + 1 }, { x: x + R(w * 0.5), y: top - 9 }, { x: x + w + 2, y: top + 1 },
    ], C.stone, 1);
    fill(g, x - 2, top, w + 4, 1, C.stoneLight, 0.6);
    fill(g, x + R(w / 2) - 1, top - 11, 2, 3, C.stoneLight, 0.85);
    fill(g, x - 2, top - 2, 3, 3, C.stoneDark, 0.8);
    fill(g, x + w - 1, top - 2, 3, 3, C.stoneDark, 0.8);
  } else if (kind === 1) {
    fill(g, x - 2, top - 2, w + 4, 2, C.stone, 1);
    fill(g, x - 2, top - 2, w + 4, 1, C.stoneLight, 0.6);
    fill(g, x + R(w * 0.12), top - 5, R(w * 0.76), 3, C.stone, 1);
    fill(g, x + R(w * 0.12), top - 5, R(w * 0.76), 1, C.stoneLight, 0.45);
    fill(g, x + R(w * 0.34), top - 7, R(w * 0.32), 2, C.stoneDark, 0.95);
  } else {
    poly(g, [
      { x: x - 2, y: top + 1 }, { x: x + R(w * 0.16), y: top - 5 },
      { x: x + R(w * 0.84), y: top - 5 }, { x: x + w + 2, y: top + 1 },
    ], C.stone, 1);
    fill(g, x + R(w * 0.16), top - 5, R(w * 0.68), 1, C.stoneLight, 0.5);
  }
  // 蜡印：判词已落款的证据（只在中排那块）
  if (kind === 1) {
    const sx = x + R(w / 2) - 3;
    const sy = iy + R(ih * 0.7);
    fill(g, sx, sy - 4, 1, 4, C.blood, 0.6);
    fill(g, sx, sy, 7, 7, C.bloodDark, 0.95);
    fill(g, sx + 1, sy + 1, 5, 5, C.blood, 1);
    fill(g, sx + 2, sy + 2, 2, 2, C.bloodDark, 0.9);
    fill(g, sx + 3, sy + 6, 1, 2, C.blood, 0.7);
  }
  fill(g, x - 5, baseY - 4, w + 10, 1, C.void, 0.3);
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

  // 法官高背座（先铺一圈暗边，把剪影从墙上剥出来）
  fill(g, cx - R(chairW / 2) - 1, chairTop - 2, chairW + 2, R(30 * v) + 2, C.void, 0.5);
  fill(g, cx - R(chairW / 2), chairTop, chairW, R(30 * v), C.stone, 0.9);
  fill(g, cx - R(chairW / 2), chairTop, 2, R(30 * v), C.stoneLight, 0.5);
  fill(g, cx + R(chairW / 2) - 2, chairTop, 2, R(30 * v), C.void, 0.35);
  fill(g, cx - R(chairW * 0.4), chairTop - R(4 * v), R(chairW * 0.8), R(4 * v), C.stoneLight, 0.7);
  fill(g, cx - R(chairW * 0.26), chairTop - R(7 * v), R(chairW * 0.52), R(3 * v), C.stoneLight, 0.85);
  fill(g, cx - 1, chairTop - R(11 * v), 2, R(4 * v), C.brassDark, 0.95);
  // 靠背：两根竖棂 + 一枚铜钉，读作「审判席」而不是一只箱子
  for (const dx of [-0.22, 0.22]) {
    fill(g, cx + R(chairW * dx), chairTop + R(6 * v), 1, R(11 * v), C.stoneDark, 0.6);
  }
  fill(g, cx - R(chairW * 0.3), chairTop + R(6 * v), 1, R(11 * v), C.stoneDark, 0.45);
  fill(g, cx + R(chairW * 0.14), chairTop + R(8 * v), R(5 * ux), R(3 * v), C.brassDark, 0.9);
  fill(g, cx + R(chairW * 0.14), chairTop + R(8 * v), R(5 * ux), 1, C.brass, 0.6);
  fill(g, cx + R(chairW / 2) - 1, chairTop, 1, R(30 * v), accent, 0.18);

  // 桌板与桌沿
  fill(g, cx - R(deskW / 2), deskTop, deskW, deskH, C.stone, 1);
  fill(g, cx - R(deskW / 2), deskTop, deskW, 1, C.stoneLight, 0.85);
  fill(g, cx + R(deskW * 0.12), deskTop, R(deskW * 0.3), 1, accent, 0.22);
  fill(g, cx - R(deskW / 2), deskTop + deskH - 1, deskW, 1, C.void, 0.5);
  fill(g, cx - R(deskW / 2) + 4, deskTop + deskH, deskW - 8, R(17 * v), C.stoneDark, 1);
  fill(g, cx - R(deskW / 2) + 4, deskTop + deskH, deskW - 8, 1, C.stone, 0.45);
  const pw = R(26 * ux);
  const gap = R(4 * ux);
  for (let i = 0; i < 3; i++) {
    const px = cx - R((pw * 3 + gap * 2) / 2) + i * (pw + gap);
    const py = deskTop + deskH + R(3 * v);
    const ph = R(11 * v);
    fill(g, px, py, pw, ph, C.ink, 0.6);
    fill(g, px, py, pw, 1, C.stoneLight, 0.25);
    fill(g, px + 3, py + R(4 * v), pw - 6, 1, C.groove, 0.45);
    fill(g, px + 3, py + R(7 * v), pw - 10, 1, C.groove, 0.3);
    if (i === 1) balanceGlyph(g, px + R(pw / 2), py + R(6 * v), R(4 * ux), C.groove, 0.55);
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

// 铜天平：石座 + 柱 + 梁（右低）+ 双链 + 双盘（右盘盛两卷判词）
function scales(g, cx, ground, v, ux, accent) {
  const u = 88; // 立杆高度：横屏时横梁正好压在高窗亮部，成为背光剪影
  fill(g, cx - R(26 * ux), ground - R(4 * v), R(52 * ux), R(4 * v), C.stoneDark, 1);
  fill(g, cx - R(22 * ux), ground - R(8 * v), R(44 * ux), R(4 * v), C.stone, 0.95);
  fill(g, cx - R(17 * ux), ground - R(12 * v), R(34 * ux), R(4 * v), C.stoneDark, 1);
  fill(g, cx - R(13 * ux), ground - R(16 * v), R(26 * ux), R(4 * v), C.stone, 1);
  fill(g, cx - R(13 * ux), ground - R(16 * v), R(26 * ux), 1, C.stoneLight, 0.6);
  // 地面投影（光从右来，影子朝左）
  poly(g, [
    { x: cx - R(26 * ux), y: ground + 1 }, { x: cx + R(26 * ux), y: ground + 1 },
    { x: cx + R(20 * ux), y: ground + 4 }, { x: cx - R(48 * ux), y: ground + 4 },
  ], C.void, 0.35);
  const pedTop = ground - R(16 * v);

  // 柱础 + 球节
  fill(g, cx - R(6 * ux), pedTop - R(3 * v), R(12 * ux), R(3 * v), C.brassDark, 1);
  disc(g, cx, pedTop - R(22 * v), Math.max(2, R(4 * ux)), C.brass, 1);
  fill(g, cx - R(4 * ux), pedTop - R(23 * v), R(8 * ux), 1, C.brassLight, 0.6);

  const beamY = pedTop - R(u * v);
  // 柱身：左缘受光，右缘入暗
  fill(g, cx - R(2 * ux), beamY, R(4 * ux), pedTop - beamY, C.brassDark, 1);
  fill(g, cx - R(2 * ux), beamY, 1, pedTop - beamY, C.brassLight, 0.6);
  fill(g, cx + R(2 * ux) - 1, beamY, 1, pedTop - beamY, C.void, 0.45);
  // 柱头
  fill(g, cx - R(7 * ux), beamY - R(3 * v), R(14 * ux), R(4 * v), C.brass, 1);
  fill(g, cx - R(7 * ux), beamY - R(3 * v), R(14 * ux), 1, C.brassLight, 0.8);
  fill(g, cx - R(7 * ux), beamY + R(1 * v), R(14 * ux), 1, C.brassDark, 1);

  // 横梁：三段各落 1px，右端更低——「天平略倾」
  const half = R(48 * ux);
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

  // 吊链：每侧双链，并列两条 1px 链节拼成 2px 粗的链
  const chainL = R(18 * v);
  const panTopL = beamY + R(3 * v) + chainL;
  const panTopR = beamY + 6 + R(3 * v) + chainL;
  const pcL = cx - half + R(9 * ux);
  const pcR = cx + half - R(9 * ux);
  for (const [ax, ay] of [
    [pcL - R(7 * ux), beamY + R(3 * v)], [pcL + R(7 * ux), beamY + R(3 * v)],
    [pcR - R(7 * ux), beamY + 6 + R(3 * v)], [pcR + R(7 * ux), beamY + 6 + R(3 * v)],
  ]) {
    chain(g, { x: ax, y: ay, h: chainL, color: C.brass, alpha: 0.85, linkH: 4 });
    chain(g, { x: ax + 1, y: ay, h: chainL, color: C.brassLight, alpha: 0.6, linkH: 4 });
  }

  // 右盘的两卷判词（重的一侧因此在下面）
  scrollRoll(g, pcR - R(7 * ux), panTopR - 5, R(13 * ux), 4, true);
  scrollRoll(g, pcR - R(6 * ux), panTopR - 9, R(11 * ux), 4, false);
  pan(g, pcL, panTopL, ux, v, accent);
  pan(g, pcR, panTopR, ux, v, accent);
}

// 一只秤盘：盘口 + 盘壁 + 盘底 + 两只吊环
function pan(g, cx, topY, ux, v, accent) {
  const w = R(20 * ux);
  fill(g, cx - R(7 * ux), topY - R(2 * v), 2, R(2 * v), C.brassDark, 1);
  fill(g, cx + R(7 * ux) - 2, topY - R(2 * v), 2, R(2 * v), C.brassDark, 1);
  fill(g, cx - R(w / 2), topY, w, 2, C.brass, 1);
  fill(g, cx - R(w / 2), topY, w, 1, C.brassLight, 0.85);
  fill(g, cx - R(w * 0.4), topY + 2, R(w * 0.8), 2, C.brass, 0.9);
  fill(g, cx - R(w * 0.25), topY + 4, R(w * 0.5), 1, C.brassDark, 1);
  fill(g, cx - R(w / 2), topY, w, 1, accent, 0.25);
}

// 卷宗：纸卷 + 纸边 + 蜡红系绳
function scrollRoll(g, x, y, w, h, ribbon) {
  fill(g, x, y, w, h, C.parchment, 0.9);
  fill(g, x, y, w, 1, C.white, 0.45);
  fill(g, x, y + h - 1, w, 1, C.khaki, 0.85);
  fill(g, x, y, 2, h, C.bone, 0.9);
  fill(g, x + w - 2, y, 2, h, C.khaki, 0.9);
  if (ribbon) fill(g, x + R(w * 0.55), y, 2, h, C.bloodDark, 0.9);
}

// 卷宗堆：三本档案册（皮封面 + 纸口 + 束带）+ 顶上一卷，堆在栏杆后
function recordStack(g, x, baseY, v, ux) {
  fill(g, x - R(3 * ux), baseY + 1, R(42 * ux), 2, C.void, 0.45);
  const layers = [[0, 0, 36, 6], [3, 6, 30, 6], [-2, 12, 25, 6]];
  for (const [dx, dy, rw, rh] of layers) {
    const bx = x + R(dx * ux);
    const by = baseY - R((dy + rh) * v);
    const bw = R(rw * ux);
    fill(g, bx - 1, by - 1, bw + 2, R(rh * v) + 1, C.void, 0.6);
    fill(g, bx, by, bw, R(rh * v), C.ink, 1);
    fill(g, bx, by, bw, 1, C.mauve, 0.9);
    fill(g, bx + 1, by + R(rh * v) - 1, bw - 2, 1, C.parchment, 0.65);
    fill(g, bx + R(rw * 0.24), by, 2, R(rh * v), C.brassDark, 0.9);
    fill(g, bx + R(rw * 0.24) - 1, by + 2, 4, 2, C.bloodDark, 0.75);
  }
  scrollRoll(g, x + R(2 * ux), baseY - R(22 * v), R(24 * ux), R(4 * v), true);
}

// 三臂烛台（未点燃）：冷庭只由高窗照明，烛台是「等待开庭」的静物
function candelabrum(g, x, baseY, v) {
  const hh = R(8 * v);
  fill(g, x - R(4 * v), baseY - R(2 * v), R(9 * v), R(2 * v), C.brassDark, 1);
  fill(g, x - 1, baseY - hh, 2, hh - R(2 * v), C.brassDark, 1);
  fill(g, x - 1, baseY - hh, 1, hh - R(2 * v), C.brass, 0.75);
  fill(g, x - R(5 * v), baseY - hh, R(11 * v), 1, C.brass, 0.9);
  for (const dx of [-5, 0, 5]) {
    const cx = x + R(dx * v);
    fill(g, cx - 1, baseY - hh - R(3 * v), 3, R(2 * v), C.brassDark, 1);
    fill(g, cx, baseY - hh - R(8 * v), 2, R(5 * v), C.parchment, 0.8);
    fill(g, cx, baseY - hh - R(8 * v), 1, R(5 * v), C.white, 0.28);
    fill(g, cx, baseY - hh - R(10 * v), 1, R(2 * v), C.void, 0.95);
  }
  fill(g, x - 1, baseY - hh - R(4 * v), 1, R(2 * v), C.parchment, 0.5);
}

// 法槌：铜头 + 木柄，摊在案上
function gavel(g, x, y) {
  fill(g, x, y + 3, 13, 2, C.brassDark, 1);
  fill(g, x, y + 3, 13, 1, C.brass, 0.7);
  fill(g, x + 9, y, 10, 6, C.brass, 1);
  fill(g, x + 9, y, 10, 1, C.brassLight, 0.85);
  fill(g, x + 9, y + 5, 10, 1, C.brassDark, 1);
  fill(g, x + 13, y + 1, 1, 4, C.brassDark, 0.8);
}
