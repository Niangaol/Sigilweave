// 第 II 幕「腐沼教堂」——三层静态布景。
// 构图（横屏 480×270，地平线 127，碑座 186 起）：
//   远景 0–127：肋骨拱顶（含一根断肋）+ 后墙砌体 + 圆彩窗(336,54) + 两扇尖窗
//                + 中央尖拱壁龛 + 墙面水渍 + 破墙缺口的尖塔剪影
//   中景 127–186：淹水的烂地板（木板 + 沼水 + 浮板）+ 三排长椅（近排翻倒在水中）
//                + 两根断柱 + 倒下的柱鼓 + 圣坛残骸与蜡烛 + 铁链吊钟 + 苔堆 + 水面倒影
//   近景 127–186：左侧断柱压边 + 右侧倒梁 + 芦苇 + 低雾 + 水面波光与涟漪
// 材质线全部依附实体：砖缝贴后墙、水渍贴窗下墙面、苔贴基座、锈贴铁件、水光贴水面。
import {
  fill, bricks, pointedArch, archWindow, column, beam, planks, chain, candle,
  disc, ring, ellipseRing, moss, rubble, water, silhouette, cracks,
} from '../diorama-kit.js';
import { C } from '../Palette.js';

// 归一化锚点：全部落在碑座上沿之上（横屏 y ≤ 0.689）。
// seal / gate 是占位文件里已有的数值，保持不变；nail / lord / light 对齐设计稿 §4 的锚点表。
export const anchors = {
  seal: { x: 0.5, y: 0.42, r: 0.16 },
  gate: { x: 0.5, y: 0.58, r: 0.12 },
  nail: { x: 0.5, y: 0.6815, r: 0.02 },
  lord: { x: 0.5, y: 0.563, r: 0.05 },
  light: { x: 0.7, y: 0.2, r: 0.03 },
};

const rnd = (n) => Math.round(n);
const groundOf = (L) => Math.min(rnd(L.anchors.nail.y), L.h - (L.tall ? 104 : 84));

// 私有固定种子（LCG）：不用 Math.random，同参两次绘制逐条一致。
function seeded(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

// 1px 折线（拱肋/梁线用）：坐标先取整再交给 strokePoints，保证硬边。
function polyline(g, pts, color, alpha = 1, t = 1) {
  g.lineStyle(t, color, alpha);
  g.strokePoints(pts.map(p => ({ x: rnd(p.x), y: rnd(p.y) })), false);
}

// 圆彩窗：石框 + 铅条 + 8 瓣红蓝玻璃，花芯给幕色（本幕唯一光源）。
function roseWindow(g, cx, cy, r, accent) {
  const rr = Math.max(6, rnd(r));
  ring(g, cx, cy, rr + 2, C.ruinStone, 0.9, 30);
  disc(g, cx, cy, rr, C.inkDark, 0.95);
  disc(g, cx, cy, rr - 1, C.glassBlue, 0.85);
  // 8 瓣玫瑰花窗：红蓝交替的方形玻璃块
  const petal = Math.max(2, rnd(rr * 0.26));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const px = rnd(cx + Math.cos(a) * (rr - petal));
    const py = rnd(cy + Math.sin(a) * (rr - petal));
    fill(g, px - rnd(petal / 2), py - rnd(petal / 2), petal, petal, i % 2 === 0 ? C.glassRed : C.glassBlue, 0.9);
  }
  // 铅条十字 + 花芯（幕色）
  fill(g, cx - rr + 1, cy, 2 * rr - 1, 1, C.inkDark, 0.9);
  fill(g, cx, cy - rr + 1, 1, 2 * rr - 1, C.inkDark, 0.9);
  disc(g, cx, cy, Math.max(2, rnd(rr * 0.24)), accent, 0.55);
  disc(g, cx, cy, Math.max(1, rnd(rr * 0.10)), C.white, 0.8);
  ring(g, cx, cy, rr + 5, accent, 0.16, 26);
  // 窗外溢光两笔（贴窗框左右）
  fill(g, cx - rr - 8, cy - 1, 6, 1, accent, 0.3);
  fill(g, cx + rr + 3, cy - 1, 6, 1, accent, 0.26);
}

// 3×4 玻璃格 + 1px 铅条：彩窗的像素格
function paneGrid(g, cx, baseY, ww, wh, colA, colB) {
  const x0 = rnd(cx - ww / 2) + 4;
  const x1 = rnd(cx + ww / 2) - 4;
  const y0 = rnd(baseY - wh) + 5;
  const y1 = rnd(baseY) - 4;
  const cols = 3, rows = 4;
  const cw = Math.max(2, Math.floor((x1 - x0) / cols));
  const rh = Math.max(2, Math.floor((y1 - y0) / rows));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      fill(g, x0 + c * cw, y0 + r * rh, cw - 1, rh - 1, (r + c) % 2 === 0 ? colA : colB, 0.8);
    }
  }
  for (let r = 1; r < rows; r++) fill(g, x0 - 1, y0 + r * rh - 1, cw * cols + 1, 1, C.inkDark, 0.85);
  for (let c = 1; c < cols; c++) fill(g, x0 + c * cw - 1, y0 - 1, 1, rh * rows + 1, C.inkDark, 0.85);
}

// 断柱：柱身 + 参差断口 + 基座苔（材质依附在石面上）
function brokenColumn(g, cx, bottomY, h, w, u) {
  const topY = bottomY - h;
  column(g, { cx, topY, bottomY, w, shaft: C.ruinStone, light: C.stoneLight, dark: C.stoneDark, capH: 1, baseH: Math.max(3, rnd(4 * u)), flutes: 2, alpha: 0.95 });
  // 断口：三块高低不齐的碎石，把整齐的柱顶打碎
  fill(g, cx - rnd(w / 2), topY - Math.max(2, rnd(3 * u)), rnd(w * 0.45), Math.max(2, rnd(3 * u)), C.ruinStone, 1);
  fill(g, cx + rnd(w * 0.06), topY - Math.max(3, rnd(6 * u)), rnd(w * 0.3), Math.max(3, rnd(6 * u)), C.ruinStone, 1);
  fill(g, cx - rnd(w * 0.2), topY - Math.max(1, rnd(2 * u)), rnd(w * 0.3), Math.max(1, rnd(2 * u)), C.stoneDark, 0.9);
  // 柱身凹槽与凿痕（贴柱面）
  for (let i = 0; i < 2; i++) fill(g, cx - rnd(w * 0.16) + i * rnd(w * 0.34), topY + rnd(h * 0.2), 1, rnd(h * 0.7), C.stoneDark, 0.55);
  // 落水处的接触阴影（把柱子「按」进水里，而不是浮在水上）
  fill(g, cx - rnd(w / 2) - 3, bottomY - Math.max(1, rnd(2 * u)), w + 6, Math.max(2, rnd(2 * u)), C.ink, 0.45);
  // 水线 + 基座苔
  fill(g, cx - rnd(w / 2) - 1, bottomY - Math.max(2, rnd(3 * u)), w + 2, Math.max(2, rnd(2 * u)), C.mossTileLit, 0.45);
  moss(g, { x: cx - rnd(w / 2) - 2, y: bottomY - Math.max(4, rnd(5 * u)), w: w + 4, h: Math.max(4, rnd(5 * u)), seed: 51 + cx % 7, color: C.mossTileLit, count: 7, alpha: 0.6 });
}

// 长椅：view='side' 立着，view='down' 翻倒泡在水里（座面朝天、四条腿翘起）
function pew(g, x, baseY, w, u, view) {
  const seatH = Math.max(2, rnd(3 * u));
  const legH = Math.max(3, rnd(4 * u));
  const backH = Math.max(4, rnd(7 * u));
  if (view === 'down') {
    const y = baseY - legH * 2;
    // 四条腿先画（翘向观众），椅身再压上来，才有前后关系
    for (let i = 0; i < 4; i++) {
      const lx = x + 2 + rnd((w - 6) * (i / 3));
      fill(g, lx, y - legH, Math.max(1, rnd(2 * u)), legH + 1, C.mauve, 1);
      fill(g, lx, y - legH, 1, 1, C.khaki, 0.6);
      fill(g, lx + 1, y - legH, 1, legH, C.void, 0.35);
    }
    // 靠背与座面横躺在水里（两段错位，像被掀翻）
    fill(g, x, y + seatH, w, seatH + 1, C.mauve, 1);
    fill(g, x + rnd(w * 0.14), y + seatH * 2 + 1, rnd(w * 0.86), seatH, C.mauve, 0.95);
    fill(g, x, y + seatH, w, 1, C.khaki, 0.65);
    fill(g, x + rnd(w * 0.14), y + seatH * 2 + 1, rnd(w * 0.86), 1, C.khaki, 0.45);
    fill(g, x, y + seatH * 2, w, 1, C.void, 0.45);
    // 压在水里的暗边 + 苔
    fill(g, x - 1, baseY - 2, w + 2, 2, C.void, 0.45);
    moss(g, { x, y: y + seatH, w, h: Math.max(2, rnd(3 * u)), seed: 91 + x % 5, color: C.mossTileLit, count: 5, alpha: 0.5 });
    return;
  }
  const seatY = baseY - legH - seatH;
  const backY = seatY - backH;
  // 靠背板
  fill(g, x, backY, w, backH, C.mauve, 1);
  fill(g, x, backY, w, 1, C.khaki, 0.7);
  fill(g, x, backY + 1, w, 1, C.khaki, 0.25);
  for (let i = 0; i < 2; i++) fill(g, x + 1, backY + rnd(backH * (0.35 + i * 0.35)), w - 2, 1, C.void, 0.35);
  // 座面（比靠背宽 2px，前沿受光；座下压暗，长椅才坐得稳）
  fill(g, x - 1, seatY, w + 2, seatH, C.mauve, 1);
  fill(g, x - 1, seatY, w + 2, 1, C.khaki, 0.8);
  fill(g, x - 1, seatY + seatH - 1, w + 2, 1, C.void, 0.5);
  fill(g, x, seatY + seatH, w, 1, C.void, 0.6);
  // 两条腿 + 泡水线
  fill(g, x + 1, baseY - legH, Math.max(1, rnd(2 * u)), legH, C.void, 0.9);
  fill(g, x + w - 3, baseY - legH, Math.max(1, rnd(2 * u)), legH, C.void, 0.9);
  fill(g, x - 2, baseY - Math.max(2, rnd(3 * u)), w + 4, 1, C.mossTileLit, 0.5);
}

// 水面倒影：物件正下方一列竖向碎纹（断成 2–3 截，越远越淡）
function reflect(g, x, baseY, w, depth, color, alpha, seed) {
  const rng = seeded(seed);
  const n = Math.max(3, Math.round(w / 7));
  for (let i = 0; i < n; i++) {
    const off = rnd(((i + 0.5) * w) / n + (rng() - 0.5) * 3);
    const len = 2 + rnd(rng() * Math.min(2, Math.max(1, depth * 0.06)));
    fill(g, x + off, baseY + 1, rng() > 0.62 ? 2 : 1, len, color, alpha * (0.55 + rng() * 0.45));
    if (rng() > 0.4) fill(g, x + off + rnd((rng() - 0.5) * 3), baseY + 2 + len, 1, 2, color, alpha * 0.4);
  }
}

// 芦苇：细茎 + 两片侧叶 + 穗，立在浅水里
function reeds(g, x, baseY, u, n) {
  for (let i = 0; i < n; i++) {
    const rx = x + i * Math.max(2, rnd(3 * u));
    const hh = Math.max(10, rnd((16 + (i % 3) * 5) * u));
    fill(g, rx, baseY - hh, 1, hh, C.rot, 0.75);
    fill(g, rx + 1, baseY - hh + Math.max(2, rnd(4 * u)), Math.max(2, rnd(3 * u)), 1, C.sage, 0.55);
    fill(g, rx - Math.max(1, rnd(2 * u)), baseY - rnd(hh * 0.6), 1, Math.max(2, rnd(3 * u)), C.mossTileLit, 0.5);
    fill(g, rx, baseY - hh - Math.max(2, rnd(3 * u)), 1, Math.max(2, rnd(3 * u)), C.khaki, 0.7);
  }
}

export function back(g, L) {
  const { w, horizon, accent } = L;
  const u = L.tall ? 1.5 : 1;
  const H = horizon;
  const vaultY = rnd(H * 0.30);      // 拱顶与后墙的分界
  const light = L.anchors.light;

  // 1. 教堂内部剖面底色：拱顶近黑、后墙暗绿，两段硬边（天空与墙体不能糊成一片）
  fill(g, 0, 0, w, H, C.void, 1);
  fill(g, 0, vaultY, w, H - vaultY, C.mossTileDark, 0.96);
  fill(g, 0, 0, w, rnd(vaultY * 0.55), C.void, 0.75);

  // 2. 后墙砌体（砖缝贴墙，越靠水线越密）
  bricks(g, {
    x: 0, y: vaultY + rnd(2 * u), w, h: H - vaultY - rnd(2 * u),
    rowH: Math.max(6, rnd(7 * u)), segW: Math.max(14, rnd(18 * u)),
    color: C.mossTileDark, alpha: 0.9, face: C.ruinStone, faceAlpha: 0.3,
    dark: C.void, seed: 41, density: 0.3,
  });
  // 砌完压一层暗绿薄纱：把 kit 每隔一行的亮灰缝统一压暗，
  // 否则墙面会出现一条条横贯全屏的亮带，像贴了条纹壁纸。
  fill(g, 0, vaultY + 1, w, H - vaultY - 1, C.mossTileDark, 0.42);
  // 水线附近三档压暗（硬边分层，不用渐变）
  fill(g, 0, H - Math.max(8, rnd(H * 0.10)), w, Math.max(8, rnd(H * 0.10)), C.void, 0.28);
  fill(g, 0, H - Math.max(3, rnd(H * 0.05)), w, Math.max(3, rnd(H * 0.05)), C.void, 0.42);
  // 两扇尖窗之间的墙面受光一块（只亮 1 档，贴窗）
  fill(g, rnd(w * 0.06), vaultY + rnd(H * 0.2), rnd(w * 0.24), rnd(H * 0.36), C.ruinStone, 0.13);
  fill(g, 0, vaultY, w, 1, C.stoneLight, 0.3);

  // 2b. 两根壁柱（贴后墙）：把墙分成三开间，窗与壁龛才有所属
  for (const xf of [0.305, 0.655]) {
    const px = rnd(w * xf);
    fill(g, px - 3, vaultY, 7, H - vaultY, C.stoneDark, 0.55);
    fill(g, px - 3, vaultY, 1, H - vaultY, C.stoneLight, 0.18);
    fill(g, px + 3, vaultY, 1, H - vaultY, C.void, 0.45);
    fill(g, px - 4, vaultY + Math.max(2, rnd(H * 0.10)), 9, 1, C.stoneLight, 0.16);
  }

  // 3. 肋骨拱顶：先铺一层「拱腹」面（比穹顶亮 1 档，肋才不是浮在空中的线），
  //    再叠三道尖拱肋 + 两根斜肋 + 一根塌掉的断肋。
  pointedArch(g, { cx: rnd(w / 2), baseY: vaultY, w: rnd(w * 0.98), h: rnd(vaultY * 0.94), t: 2, color: C.ruinStone, alpha: 0.5, fillColor: C.nightDeep, fillAlpha: 0.55, segs: 16 });
  pointedArch(g, { cx: rnd(w / 2), baseY: vaultY, w: rnd(w * 0.62), h: rnd(vaultY * 0.74), t: 1, color: C.stoneLight, alpha: 0.22, segs: 14 });
  pointedArch(g, { cx: rnd(w / 2), baseY: vaultY, w: rnd(w * 0.30), h: rnd(vaultY * 0.52), t: 1, color: C.ruinStone, alpha: 0.55, segs: 12 });
  // 拱肋列：先画一列窄尖拱肋（高宽比不够的宽拱只会变成圆穹）
  const ribW = Math.max(26, rnd(w * 0.115));
  const ribH = Math.max(18, rnd(vaultY * 0.84));
  for (const cxr of [0.10, 0.285, 0.47, 0.655, 0.84]) {
    const cr = rnd(w * cxr);
    pointedArch(g, { cx: cr, baseY: vaultY, w: ribW, h: ribH, t: 1, color: C.ruinStone, alpha: 0.85, segs: 12 });
    // 拱脚托座 + 墙顶线脚：肋明确「坐在墙上」
    fill(g, cr - rnd(ribW / 2) - 2, vaultY - Math.max(3, rnd(4 * u)), 4, Math.max(3, rnd(4 * u)), C.stoneDark, 0.9);
    fill(g, cr + rnd(ribW / 2) - 1, vaultY - Math.max(3, rnd(4 * u)), 4, Math.max(3, rnd(4 * u)), C.stoneDark, 0.9);
    fill(g, cr - rnd(ribW / 2) - 2, vaultY - Math.max(3, rnd(4 * u)), 4, 1, C.stoneLight, 0.3);
  }
  // 两条宽斜肋（从拱脚收向拱顶）——拱顶的主结构线
  const apex = { x: rnd(w / 2), y: Math.max(2, vaultY - rnd(vaultY * 0.9)) };
  polyline(g, [{ x: rnd(w * 0.02), y: vaultY }, apex], C.ruinStone, 0.9);
  polyline(g, [{ x: rnd(w * 0.98), y: vaultY }, apex], C.ruinStone, 0.9);
  // 横向拱肋 + 塌掉的断肋（断口留 10px 空隙）
  fill(g, 0, Math.max(2, rnd(vaultY * 0.34)), w, 1, C.stoneDark, 0.5);
  polyline(g, [{ x: rnd(w * 0.60), y: Math.max(2, rnd(vaultY * 0.30)) }, { x: rnd(w * 0.71), y: Math.max(2, rnd(vaultY * 0.14)) }], C.stoneLight, 0.45);
  polyline(g, [{ x: rnd(w * 0.745), y: Math.max(2, rnd(vaultY * 0.24)) }, { x: rnd(w * 0.93), y: Math.max(2, rnd(vaultY * 0.38)) }], C.stoneLight, 0.3);

  // 檐口：一条横贯全幅的石线，把两侧的拱肋都「按」在墙顶，不再像漂浮的弧
  fill(g, 0, vaultY - Math.max(2, rnd(3 * u)), w, Math.max(2, rnd(3 * u)), C.ruinStone, 0.7);
  fill(g, 0, vaultY - Math.max(2, rnd(3 * u)), w, 1, C.stoneLight, 0.3);
  fill(g, 0, vaultY, w, 1, C.void, 0.55);

  // 4. 水平线脚 + 左墙垛（剖面里被切开的墙体）
  const bandY = vaultY + rnd((H - vaultY) * 0.46);
  fill(g, 0, bandY, w, Math.max(1, rnd(2 * u)), C.ruinStone, 0.4);
  fill(g, 0, bandY, w, 1, C.stoneLight, 0.28);
  column(g, { cx: rnd(w * 0.042), topY: vaultY, bottomY: H, w: Math.max(6, rnd(8 * u)), shaft: C.ruinStone, light: C.stoneLight, dark: C.stoneDark, capH: Math.max(2, rnd(3 * u)), baseH: Math.max(2, rnd(3 * u)), flutes: 2, alpha: 0.9 });

  // 5. 后殿（中央）：半圆壁龛 + 石券框 + 龛内三条竖向扶壁 + 顶部小尖塔，
  //    两侧再各立一根外扶壁。半圆顶 + 一串竖向构件才是「建筑剖面」，
  //    之前用大跨度尖拱，拱线接近直线，整块读成了帐篷。
  const apseW = Math.max(48, rnd(w * 0.21));
  const ncx = rnd(w / 2);
  apse(g, ncx, H, apseW, Math.max(28, rnd(H * 0.62)), u);
  // 龛前台座（中景地面从这里接过去）
  const nHalf = rnd(apseW / 2);
  fill(g, ncx - nHalf - 6, H - Math.max(2, rnd(3 * u)), apseW + 12, Math.max(2, rnd(3 * u)), C.ruinStone, 1);
  fill(g, ncx - nHalf - 6, H - Math.max(2, rnd(3 * u)), apseW + 12, 1, C.stoneLight, 0.5);
  fill(g, ncx - nHalf - 6, H, apseW + 12, 1, C.void, 0.75);

  // 6. 两扇尖窗（红蓝玻璃 3×4 + 铅条），窗台石压住砖缝
  const winBase = H - rnd(H * 0.16);
  const winH = Math.max(20, rnd(H * 0.34));
  const winW = Math.max(14, rnd(w * 0.046));
  for (const [fx, colA, colB] of [[0.115, C.glassBlue, C.glassRed], [0.245, C.glassRed, C.glassBlue]]) {
    const cx = rnd(w * fx);
    archWindow(g, { cx, baseY: winBase, w: winW, h: winH, glass: colB, glass2: colA, mullions: 1, frame: C.inkDark });
    paneGrid(g, cx, winBase, winW, winH, colA, colB);
    fill(g, cx - rnd(winW / 2) - 3, winBase, winW + 6, Math.max(2, rnd(2 * u)), C.ruinStone, 0.85);
    fill(g, cx - rnd(winW / 2) - 3, winBase, winW + 6, 1, C.stoneLight, 0.5);
    // 窗在墙上的投影：让窗「陷」进墙体，而不是浮在砖上
    fill(g, cx - rnd(winW / 2) - 4, winBase + Math.max(2, rnd(3 * u)), winW + 8, Math.max(2, rnd(3 * u)), C.void, 0.3);
  }

  // 7. 圆彩窗（本幕唯一光源）+ 两道下泄光柱
  const rr = Math.max(10, rnd(H * 0.11));
  roseWindow(g, light.x, light.y, rr, accent);
  // 三条窄光带（像穿过窗棂的窗光）：越靠下越淡，落到水面就收住
  const shaftBottom = H + Math.max(2, rnd(2 * u));
  for (const [k0, k1, al] of [[-1.5, -1.05, 0.085], [-0.8, -0.45, 0.065], [-0.25, 0.05, 0.05]]) {
    silhouette(g, [
      { x: light.x + rnd(rr * k0), y: light.y + rnd(rr * 0.5) },
      { x: light.x + rnd(rr * k1), y: light.y + rnd(rr * 0.5) },
      { x: light.x + rnd(rr * (k1 - 5.5)), y: shaftBottom },
      { x: light.x + rnd(rr * (k0 - 5.5)), y: shaftBottom },
    ], accent, al);
  }

  // 8. 墙面水渍：从窗台与彩窗下沿往下渗（贴墙，不是撒点）
  cracks(g, { x: rnd(w * 0.115) - 2, y: winBase + 3, len: Math.max(8, rnd(H * 0.16)), seed: 61, color: C.mossTileDark, alpha: 0.75, branches: 0, drift: 0.2 });
  cracks(g, { x: rnd(w * 0.245), y: winBase + 3, len: Math.max(6, rnd(H * 0.12)), seed: 67, color: C.inkDark, alpha: 0.6, branches: 0, drift: 0.16 });
  cracks(g, { x: light.x + rnd(rr * 0.5), y: light.y + rr + 4, len: Math.max(12, rnd(H * 0.22)), seed: 71, color: C.mossTileDark, alpha: 0.7, branches: 0, drift: 0.14 });
  // 大面积湿痕（窗下与墙脚各一片）
  fill(g, rnd(w * 0.08), winBase + rnd(H * 0.08), rnd(w * 0.15), Math.max(4, H - winBase - rnd(H * 0.08)), C.mossTileDark, 0.22);
  fill(g, light.x + rnd(rr * 0.3), light.y + rr, rnd(rr * 1.5), Math.max(4, H - light.y - rr), C.inkDark, 0.16);

  // 9. 墙脚水线（沼泽水面漫到后墙）
  fill(g, 0, H - Math.max(3, rnd(4 * u)), w, Math.max(3, rnd(4 * u)), C.inkDark, 0.6);
  fill(g, 0, H - 1, w, 1, C.void, 0.9);

  // 10. 右侧墙体垮塌：缺口里透出雾与远处尖塔（本幕的天际线剪影）
  const gapX = rnd(w * 0.845);
  silhouette(g, [
    { x: gapX, y: H },
    { x: gapX + rnd(w * 0.012), y: H - rnd(H * 0.26) },
    { x: gapX + rnd(w * 0.030), y: H - rnd(H * 0.46) },
    { x: gapX + rnd(w * 0.065), y: H - rnd(H * 0.58) },
    { x: w, y: H - rnd(H * 0.66) },
    { x: w, y: H },
  ], C.ink, 0.92);
  fill(g, gapX + 2, H - rnd(H * 0.30), w - gapX - 2, rnd(H * 0.30), C.fog, 0.15);
  fill(g, gapX + Math.max(8, rnd(w * 0.03)), H - rnd(H * 0.14), w - gapX - Math.max(8, rnd(w * 0.03)), rnd(H * 0.14), C.fog, 0.1);
  // 缺口内壁：塌落的砖层 + 内侧一条受光棱（黑影才读成「墙的断口」，而不是披风）
  for (let i = 0; i < 4; i++) {
    fill(g, gapX + Math.max(2, rnd(w * 0.01)), H - rnd(H * (0.16 + i * 0.11)), Math.max(10, rnd(w * 0.07)), 1, C.inkDark, 0.55);
  }
  polyline(g, [
    { x: gapX, y: H - 1 },
    { x: gapX + rnd(w * 0.012), y: H - rnd(H * 0.26) },
    { x: gapX + rnd(w * 0.030), y: H - rnd(H * 0.46) },
    { x: gapX + rnd(w * 0.065), y: H - rnd(H * 0.58) },
    { x: w, y: H - rnd(H * 0.66) },
  ], C.stoneLight, 0.24, 1);
  // 缺口上缘塌落的砖级（阶梯状，不是一条斜线）
  fill(g, gapX - Math.max(6, rnd(w * 0.02)), H - rnd(H * 0.30), Math.max(6, rnd(w * 0.02)), Math.max(3, rnd(H * 0.06)), C.ruinStone, 0.8);
  const spx = rnd(w * 0.925);
  const spH = rnd(H * 0.56);
  const spHalf = Math.max(8, rnd(w * 0.032));
  silhouette(g, [
    { x: spx - spHalf, y: H },
    { x: spx - rnd(spHalf * 0.55), y: H - rnd(spH * 0.48) },
    { x: spx - rnd(spHalf * 0.18), y: H - rnd(spH * 0.80) },
    { x: spx, y: H - spH },
    { x: spx + rnd(spHalf * 0.18), y: H - rnd(spH * 0.80) },
    { x: spx + rnd(spHalf * 0.55), y: H - rnd(spH * 0.48) },
    { x: spx + spHalf, y: H },
  ], C.void, 0.96);
  fill(g, spx - 1, H - spH - Math.max(4, rnd(H * 0.06)), 2, Math.max(4, rnd(H * 0.06)), C.void, 0.92);
  fill(g, spx - Math.max(3, rnd(H * 0.03)), H - spH - Math.max(3, rnd(H * 0.045)), Math.max(6, rnd(H * 0.06)), 2, C.void, 0.92);
  // 塌口边缘的碎砖
  rubble(g, { x: gapX - Math.max(6, rnd(w * 0.02)), y: H - rnd(H * 0.30), w: Math.max(14, rnd(w * 0.05)), h: Math.max(6, rnd(H * 0.10)), seed: 83, color: C.ruinStone, color2: C.void, count: 9, alpha: 0.85 });

  // 11. 拱顶垂下的苔丝（贴拱肋/墙缝）
  for (const [hx, hl] of [[0.205, 0.18], [0.395, 0.24], [0.795, 0.2]]) {
    const len = Math.max(8, rnd(H * hl));
    const vx = rnd(w * hx);
    fill(g, vx, vaultY, 1, len, C.rot, 0.7);
    fill(g, vx + 1, vaultY, 1, rnd(len * 0.7), C.mossTileDark, 0.8);
    // 挂下来的几片叶
    for (let i = 0; i < 3; i++) fill(g, vx + 1 + (i % 2), vaultY + rnd(len * (0.3 + i * 0.22)), Math.max(2, rnd(3 * u)), 1, C.rot, 0.6);
  }
}

export function mid(g, L) {
  const { w, horizon, accent } = L;
  const u = L.tall ? 1.5 : 1;
  const ground = groundOf(L);
  const span = Math.max(12, ground - horizon);
  const waterBottom = L.h - (L.tall ? 104 : 84);   // 一路铺到碑座上沿，碑座下不留空
  const waterline = horizon + 1;   // 水面几乎齐地平线：木地板只从水里透出来
  const nail = L.anchors.nail;
  const light = L.anchors.light;

  // 1. 地面（中景层先铺）：烂木地板沉在水下，木板是底板不是贴图
  fill(g, 0, horizon, w, L.h - horizon, C.ink, 1);
  planks(g, { x: 0, y: horizon, w, h: waterBottom - horizon, color: C.mauve, dark: C.void, light: C.khaki, alpha: 0.9, rowH: Math.max(5, rnd(7 * u)), seed: 23 });
  // 烂穿的板缝：三处塌陷的黑洞（贴地面）
  for (const [bx, by, bw, bh] of [[0.07, 0.18, 0.15, 0.16], [0.50, 0.42, 0.13, 0.12], [0.76, 0.24, 0.14, 0.14]]) {
    fill(g, rnd(w * bx), horizon + rnd(span * by), rnd(w * bw), Math.max(2, rnd(span * bh)), C.void, 0.55);
  }

  // 2. 沼水：水面压住地板；反光与涟漪贴在水面上
  fill(g, 0, waterline, w, waterBottom - waterline, C.swampWater, 0.92);
  water(g, {
    x: 0, y: waterline, w, h: waterBottom - waterline,
    base: C.swampWater, glint: C.swampGlint, seed: 31,
    alpha: 0.4, rows: L.tall ? 7 : 5, ripples: L.tall ? 20 : 12,
  });
  fill(g, 0, waterline, w, 1, C.swampGlint, 0.3);
  fill(g, 0, waterline + 1, w, 1, C.sage, 0.22);
  fill(g, 0, waterline + 2, w, 1, C.swampWater, 0.9);
  fill(g, 0, waterBottom - 1, w, 1, C.void, 0.5);
  // 水面亮线：4 条 1px 长反光 + 几个亮点——让人一眼看出这是水面而不是泥地
  for (const [gx, gy, gw, ga] of [[0.03, 0.14, 0.34, 0.42], [0.46, 0.30, 0.30, 0.36], [0.18, 0.62, 0.22, 0.3], [0.66, 0.80, 0.26, 0.26]]) {
    fill(g, rnd(w * gx), horizon + rnd(span * gy), rnd(w * gw), 1, C.swampGlint, ga);
    fill(g, rnd(w * gx) + 2, horizon + rnd(span * gy) + 1, Math.max(3, rnd(w * gw * 0.4)), 1, C.mossTileLit, 0.45);
  }
  for (const [dx, dy] of [[0.12, 0.30], [0.38, 0.52], [0.55, 0.24], [0.72, 0.68], [0.88, 0.44], [0.26, 0.86]]) {
    fill(g, rnd(w * dx), horizon + rnd(span * dy), 2, 1, C.swampGlint, 0.5);
  }
  // 水面纵深：近处压暗（三段硬边，不做渐变），物件才沉得住
  fill(g, 0, horizon + rnd(span * 0.30), w, rnd(span * 0.28), C.ink, 0.12);
  fill(g, 0, horizon + rnd(span * 0.58), w, rnd(span * 0.42), C.ink, 0.18);
  fill(g, 0, waterBottom - Math.max(6, rnd(10 * u)), w, Math.max(6, rnd(10 * u)), C.ink, 0.22);
  // 水面倒影：后殿圆券与扶壁的竖影、两扇彩窗的色影、圆彩窗的幕色光
  const aW = Math.max(48, rnd(w * 0.21)), aHalf = rnd(aW / 2);
  for (let i = 0; i < 7; i++) {
    fill(g, rnd(w / 2) - aHalf + 6 + rnd((aW - 12) * (i / 6)), waterline + 2, 1, Math.max(3, rnd(span * 0.40)), C.ruinStone, 0.14);
  }
  fill(g, rnd(w * 0.115) - 3, waterline + 3, 7, Math.max(3, rnd(span * 0.28)), C.glassRed, 0.1);
  fill(g, rnd(w * 0.245) - 3, waterline + 3, 7, Math.max(3, rnd(span * 0.32)), C.glassBlue, 0.1);
  fill(g, light.x - 14, waterline + 2, 26, 3, accent, 0.1);
  fill(g, light.x - 20, waterline + 8, 34, 2, accent, 0.08);
  fill(g, light.x - 26, waterline + 14, 40, 1, accent, 0.06);

  // 3. 浮在水面的残板 4 块（每块带倒影）
  for (const [fx, fy, fw] of [[0.29, 0.30, 22], [0.55, 0.58, 30], [0.855, 0.36, 18], [0.16, 0.66, 26]]) {
    const bx = rnd(w * fx), by = horizon + rnd(span * fy);
    silhouette(g, [{ x: bx, y: by }, { x: bx + fw, y: by - 2 }, { x: bx + fw + 2, y: by + 2 }, { x: bx + 1, y: by + 3 }], C.mauve, 0.95);
    fill(g, bx + 1, by, fw, 1, C.khaki, 0.3);
    reflect(g, bx + 1, by + 3, fw, span * 0.4, C.inkDark, 0.3, 90 + fw);
  }

  // 4. 两根断柱 + 倒下的柱鼓（三排纵深里的「中排/近排」）
  brokenColumn(g, rnd(w * 0.355), ground + rnd(4 * u), Math.max(40, rnd(horizon * 0.55)), Math.max(10, rnd(13 * u)), u);
  brokenColumn(g, rnd(w * 0.672), ground + rnd(4 * u), Math.max(50, rnd(horizon * 0.70)), Math.max(11, rnd(15 * u)), u);
  const drumX = rnd(w * 0.60), drumY = ground - rnd(6 * u);
  silhouette(g, [
    { x: drumX - rnd(14 * u), y: drumY + rnd(4 * u) },
    { x: drumX - rnd(12 * u), y: drumY - rnd(5 * u) },
    { x: drumX + rnd(12 * u), y: drumY - rnd(6 * u) },
    { x: drumX + rnd(14 * u), y: drumY + rnd(3 * u) },
  ], C.ruinStone, 0.95);
  fill(g, drumX - rnd(12 * u), drumY - rnd(5 * u), rnd(24 * u), 1, C.stoneLight, 0.5);
  for (let i = 0; i < 3; i++) fill(g, drumX - rnd(9 * u) + i * rnd(7 * u), drumY - rnd(4 * u), 1, Math.max(3, rnd(6 * u)), C.stoneDark, 0.5);
  moss(g, { x: drumX - rnd(12 * u), y: drumY - rnd(4 * u), w: rnd(22 * u), h: Math.max(3, rnd(5 * u)), seed: 57, color: C.mossTileLit, count: 6, alpha: 0.55 });

  // 5. 圣坛残骸（左）：两级台基 + 石台（台面受光、右侧面压暗）+ 台上两盏烛。
  //    先铺台基再立石台，物件「站」在地面上；蜡烛立在台面上，不悬空。
  const ax = rnd(w * 0.16);
  const tw = Math.max(38, rnd(48 * u));
  const tableH = Math.max(10, rnd(14 * u));
  const tableTop = ground - tableH;
  // 两级台基（泡在水里，下沿压一条水线）
  fill(g, ax - rnd(tw * 0.62), ground - Math.max(4, rnd(5 * u)), rnd(tw * 1.24), Math.max(4, rnd(5 * u)), C.ruinStone, 1);
  fill(g, ax - rnd(tw * 0.62), ground - Math.max(4, rnd(5 * u)), rnd(tw * 1.24), 1, C.stoneLight, 0.5);
  fill(g, ax - rnd(tw * 0.7), ground - 1, rnd(tw * 1.4), 3, C.ink, 0.45);
  fill(g, ax - rnd(tw * 0.52), ground, rnd(tw * 1.04), 2, C.void, 0.7);
  fill(g, ax - rnd(tw * 0.7), ground - Math.max(2, rnd(3 * u)), rnd(tw * 1.4), 1, C.mossTileLit, 0.45);
  // 台上立着的石十字（教堂的辨识物，微微歪，压在蜡烛后面）
  const crossX = ax + rnd(tw * 0.02);
  const crossH = Math.max(16, rnd(20 * u));
  fill(g, crossX - 1, tableTop - crossH, 3, crossH, C.ruinStone, 1);
  fill(g, crossX - Math.max(4, rnd(6 * u)), tableTop - Math.max(11, rnd(14 * u)), Math.max(9, rnd(12 * u)), 3, C.ruinStone, 1);
  fill(g, crossX - 1, tableTop - crossH, 1, crossH, C.void, 0.55);
  fill(g, crossX + 2, tableTop - crossH, 1, crossH, C.stoneLight, 0.35);
  fill(g, crossX - Math.max(4, rnd(6 * u)), tableTop - Math.max(11, rnd(14 * u)), Math.max(9, rnd(12 * u)), 1, C.stoneLight, 0.3);
  // 石台：台身 + 台面（亮 1 档）+ 右侧面暗部
  fill(g, ax - rnd(tw / 2), tableTop, tw, tableH, C.ruinStone, 1);
  fill(g, ax - rnd(tw / 2), tableTop + rnd(tableH * 0.55), tw, tableH - rnd(tableH * 0.55), C.ink, 0.22);
  fill(g, ax - rnd(tw / 2) - 2, tableTop - Math.max(2, rnd(3 * u)), tw + 4, Math.max(2, rnd(3 * u)), C.stoneLight, 0.75);
  fill(g, ax - rnd(tw * 0.36), tableTop - Math.max(2, rnd(3 * u)), rnd(tw * 0.72), 1, C.white, 0.22);
  // 台身三条竖缝 + 右上一块崩角（别让台面读成一块水泥）
  for (let i = 0; i < 3; i++) fill(g, ax - rnd(tw * 0.32) + i * rnd(tw * 0.24), tableTop + 1, 1, tableH - 1, C.void, 0.35);
  silhouette(g, [
    { x: ax + rnd(tw * 0.30), y: tableTop },
    { x: ax + rnd(tw * 0.5), y: tableTop },
    { x: ax + rnd(tw * 0.42), y: tableTop + Math.max(3, rnd(5 * u)) },
    { x: ax + rnd(tw * 0.30), y: tableTop + Math.max(2, rnd(3 * u)) },
  ], C.ink, 0.6);
  fill(g, ax - rnd(tw / 2), tableTop, 1, tableH, C.stoneLight, 0.3);
  fill(g, ax + rnd(tw * 0.26), tableTop + 1, rnd(tw * 0.24), tableH - 1, C.void, 0.35);
  // 台身凿痕（贴石面）+ 台脚苔
  for (let i = 0; i < 3; i++) fill(g, ax - rnd(tw * 0.4) + i * rnd(tw * 0.3), tableTop + Math.max(3, rnd(tableH * 0.5)), Math.max(3, rnd(5 * u)), 1, C.groove, 0.6);
  moss(g, { x: ax - rnd(tw / 2), y: tableTop + tableH - Math.max(3, rnd(4 * u)), w: tw, h: Math.max(3, rnd(4 * u)), seed: 43, color: C.mossTileLit, count: 8, alpha: 0.6 });
  // 掀翻的石板：斜靠在台左，断面朝观众
  silhouette(g, [
    { x: ax - rnd(tw * 0.92), y: ground - Math.max(3, rnd(4 * u)) },
    { x: ax - rnd(tw * 0.74), y: tableTop - Math.max(6, rnd(10 * u)) },
    { x: ax - rnd(tw * 0.46), y: tableTop - Math.max(5, rnd(8 * u)) },
    { x: ax - rnd(tw * 0.62), y: ground - Math.max(1, rnd(2 * u)) },
  ], C.ruinStone, 1);
  fill(g, ax - rnd(tw * 0.74), tableTop - Math.max(6, rnd(10 * u)), rnd(tw * 0.28), 1, C.stoneLight, 0.6);
  // 两盏烛：烛身铜座、火苗 2×3 幕色、外圈一层光晕
  for (const [ccx, cch] of [[ax - rnd(tw * 0.24), Math.max(8, rnd(12 * u))], [ax + rnd(tw * 0.14), Math.max(6, rnd(9 * u))]]) {
    const fy = tableTop - Math.max(1, rnd(2 * u)) - cch;   // 烛头
    candle(g, { x: ccx, baseY: tableTop - Math.max(1, rnd(2 * u)), h: cch, wax: C.parchment, flame: accent, holder: C.brassDark });
    // 火苗 2×3 暖色 + 白芯 + 一圈幕色光晕（暖色只给这点火，不染整片）
    fill(g, ccx, fy - Math.max(3, rnd(4 * u)), 2, Math.max(3, rnd(3 * u)), C.parchment, 0.95);
    fill(g, ccx + 1, fy - Math.max(5, rnd(6 * u)), 1, 2, C.white, 0.85);
    disc(g, ccx + 1, fy - Math.max(3, rnd(4 * u)), Math.max(2, rnd(3 * u)), accent, 0.2);
  }
  // 台下的碎瓦 + 水面倒影
  rubble(g, { x: ax - rnd(tw * 0.7), y: ground - Math.max(4, rnd(6 * u)), w: rnd(tw * 1.2), h: Math.max(4, rnd(5 * u)), seed: 45, color: C.stoneDark, color2: C.ruinStone, count: 9, alpha: 0.9 });
  reflect(g, ax - rnd(tw / 2), ground, tw, span * 0.5, C.inkDark, 0.4, 33);

  // 6. 长椅三排：远排小且贴地平线、中排居中、近排大且翻倒在水里
  const farBase = horizon + rnd(span * 0.20);
  const midBase = horizon + rnd(span * 0.52);
  const nearBase = ground;
  const rows = [
    { base: farBase, w: Math.max(14, rnd(18 * u)), xs: [0.05, 0.20, 0.70, 0.85], view: 'side' },
    { base: midBase, w: Math.max(18, rnd(24 * u)), xs: [0.04, 0.22, 0.72, 0.875], view: 'side' },
    { base: nearBase, w: Math.max(26, rnd(34 * u)), xs: [0.30, 0.79], view: 'down' },
  ];
  for (const row of rows) {
    for (const fx of row.xs) {
      const x = rnd(w * fx);
      const ww = Math.max(12, row.w - rnd((fx % 0.3) * 12));
      // 先落一层接触阴影，长椅才坐在水面上
      fill(g, x - 2, row.base - Math.max(1, rnd(2 * u)), ww + 4, Math.max(2, rnd(2 * u)), C.ink, 0.42);
      pew(g, x, row.base, ww, u, row.view);
      // 每排长椅在水里拖一列倒影（第三排：近排）
      if (row.view === 'side') {
        reflect(g, x, row.base, ww, span * 0.6, C.inkDark, 0.5, 120 + rnd(fx * 1000));
        reflect(g, x + 1, row.base, ww, span * 0.3, C.mauve, 0.22, 160 + rnd(fx * 1000));
        // 垂直翻转的倒影：越往下越淡的暗色横条，水面才有「镜面」感
        fill(g, x, row.base + 2, ww, 1, C.inkDark, 0.16);
        fill(g, x + 1, row.base + 5, ww - 2, 1, C.inkDark, 0.11);
        fill(g, x + 3, row.base + 9, ww - 6, 1, C.inkDark, 0.07);
      }
    }
  }

  // 7. 铁链吊钟：横梁 → 双铁链 → 铜钟（钟口压在钉子锚点附近）
  const beamY = rnd(horizon * 0.30);
  const beamX = rnd(w * 0.36), beamW = rnd(w * 0.28), beamH = Math.max(4, rnd(5 * u));
  beam(g, { x: beamX, y: beamY, w: beamW, h: beamH, color: C.ink, light: C.stoneLight, alpha: 1, bolts: false });
  // 梁两端的斜撑（木/石托），说明它承在墙上而不是悬空
  for (const bx of [beamX, beamX + beamW]) {
    const dir = bx === beamX ? -1 : 1;
    silhouette(g, [
      { x: bx, y: beamY + beamH },
      { x: bx + dir * Math.max(6, rnd(10 * u)), y: beamY + beamH },
      { x: bx, y: beamY + beamH + Math.max(5, rnd(8 * u)) },
    ], C.ink, 0.95);
    fill(g, bx, beamY, 2, 2, C.brassDark, 0.7);
  }
  for (let i = 0; i < 3; i++) fill(g, rnd(w * 0.385) + i * rnd(w * 0.09), beamY + 1, 2, 1, C.brassDark, 0.8);
  const bellH = Math.max(24, rnd(30 * u));
  const mouthY = nail.y - Math.max(3, rnd(5 * u));
  const topY = mouthY - bellH;
  const topW = Math.max(12, rnd(16 * u));
  const botW = Math.max(22, rnd(32 * u));
  const chainTop = beamY + Math.max(3, rnd(4 * u));
  // 双铁链（锈点贴链节）
  for (const dx of [-Math.max(4, rnd(6 * u)), Math.max(4, rnd(6 * u))]) {
    chain(g, { x: nail.x + dx, y: chainTop, h: Math.max(6, topY - Math.max(4, rnd(4 * u)) - chainTop), color: C.ruinStone, alpha: 1, linkH: Math.max(3, rnd(4 * u)) });
  }
  // 钟架（钟头横担）：钟挂在这根短梁上，才不会像飘着的铜块
  fill(g, nail.x - rnd(topW * 0.72), topY - Math.max(4, rnd(5 * u)), rnd(topW * 1.44), Math.max(3, rnd(4 * u)), C.ink, 1);
  fill(g, nail.x - rnd(topW * 0.72), topY - Math.max(4, rnd(5 * u)), rnd(topW * 1.44), 1, C.stoneLight, 0.35);
  fill(g, nail.x - 1, topY - Math.max(6, rnd(9 * u)), 2, Math.max(4, rnd(6 * u)), C.inkDark, 1);
  // 钟体：上窄下阔、钟腰收一下、钟口外翻（轮廓要像钟，不能像方块）
  silhouette(g, [
    { x: nail.x - rnd(topW / 2), y: topY },
    { x: nail.x + rnd(topW / 2), y: topY },
    { x: nail.x + rnd(topW / 2) + Math.max(1, rnd(2 * u)), y: topY + rnd(bellH * 0.28) },
    { x: nail.x + rnd(botW * 0.34), y: topY + rnd(bellH * 0.54) },
    { x: nail.x + rnd(botW * 0.45), y: topY + rnd(bellH * 0.80) },
    { x: nail.x + rnd(botW / 2), y: mouthY },
    { x: nail.x - rnd(botW / 2), y: mouthY },
    { x: nail.x - rnd(botW * 0.45), y: topY + rnd(bellH * 0.80) },
    { x: nail.x - rnd(botW * 0.34), y: topY + rnd(bellH * 0.54) },
    { x: nail.x - rnd(topW / 2) - Math.max(1, rnd(2 * u)), y: topY + rnd(bellH * 0.28) },
  ], C.brassDark, 1);
  // 受光面（左侧一档亮铜）+ 右侧背光压暗
  fill(g, nail.x - rnd(botW * 0.30), topY + rnd(bellH * 0.24), Math.max(2, rnd(botW * 0.12)), Math.max(3, rnd(bellH * 0.26)), C.brass, 0.9);
  fill(g, nail.x - rnd(botW * 0.36), topY + rnd(bellH * 0.48), Math.max(2, rnd(botW * 0.17)), Math.max(3, rnd(bellH * 0.32)), C.brass, 0.9);
  fill(g, nail.x + rnd(botW * 0.14), topY + rnd(bellH * 0.26), Math.max(2, rnd(botW * 0.26)), Math.max(4, rnd(bellH * 0.56)), C.void, 0.32);
  // 钟腰铁箍 + 钟口 2px 亮边 + 钟口内壁暗部（口要「开」）
  fill(g, nail.x - rnd(topW / 2) - Math.max(2, rnd(2 * u)), topY + rnd(bellH * 0.30), topW + Math.max(4, rnd(4 * u)), 1, C.brass, 0.75);
  fill(g, nail.x - rnd(botW / 2), mouthY - Math.max(2, rnd(3 * u)), botW, Math.max(2, rnd(3 * u)), C.brassLight, 0.95);
  fill(g, nail.x - rnd(botW * 0.40), mouthY - Math.max(1, rnd(2 * u)), rnd(botW * 0.80), Math.max(1, rnd(2 * u)), C.void, 0.75);
  // 幕色在铜面上的反射（只落在受光侧）+ 锈斑
  fill(g, nail.x - rnd(botW * 0.30), topY + rnd(bellH * 0.44), Math.max(1, rnd(2 * u)), Math.max(2, rnd(bellH * 0.20)), accent, 0.4);
  for (let i = 0; i < 2; i++) fill(g, nail.x + rnd(botW * 0.18) + i * 3, topY + rnd(bellH * (0.5 + i * 0.18)), 2, 1, C.brassDark, 0.9);
  // 钟舌 3×10：从钟口里伸出来，泡进水里
  fill(g, nail.x - Math.max(1, rnd(2 * u)), mouthY - Math.max(3, rnd(4 * u)), Math.max(2, rnd(3 * u)), Math.max(8, rnd(10 * u)), C.inkDark, 1);
  disc(g, nail.x, mouthY + Math.max(4, rnd(6 * u)), Math.max(2, rnd(3 * u)) + 1, C.inkDark, 1);
  // 钟口在水面压出的暗影
  fill(g, nail.x - rnd(botW / 2) - 2, mouthY + Math.max(3, rnd(4 * u)), botW + 4, 2, C.ink, 0.3);
  // 钟在水里的铜色倒影
  reflect(g, nail.x - rnd(botW / 2), mouthY + Math.max(3, rnd(4 * u)), botW, span * 0.7, C.brassDark, 0.35, 77);
  reflect(g, nail.x - rnd(botW / 2), mouthY + Math.max(2, rnd(2 * u)), botW, span * 0.4, C.inkDark, 0.28, 79);

  // 8. 芦苇：贴水线长在断柱与长椅之间（中景的第二排植被）
  reeds(g, rnd(w * 0.115), horizon + rnd(span * 0.72), u, 4);
  reeds(g, rnd(w * 0.905), horizon + rnd(span * 0.62), u, 3);

  // 8.5 竖屏补一排近景（横屏没有这段水面；不补，竖屏下半屏会空成一片绿地）
  if (L.tall) {
    const nb = waterBottom - Math.max(12, rnd(16 * u));   // 近排基座：压到碑座边
    const nu = 2.1;
    // 近排长椅：同类物件的第三排，最大、翻倒、半沉在水里
    const nx = rnd(w * 0.07), nw = Math.max(44, rnd(50 * u));
    pew(g, nx, nb, nw, nu, 'down');
    fill(g, nx - 5, nb - 2, nw + 12, 3, C.ink, 0.42);
    reflect(g, nx, nb, nw, span * 0.4, C.inkDark, 0.26, 311);
    // 第四排：小一号的半沉长椅，垫在近排与长椅排之间（纵深不能只有两档）
    const m1 = nb - Math.max(38, rnd((nb - ground) * 0.42));
    pew(g, rnd(w * 0.26), m1, Math.max(26, rnd(30 * u)), 1.5, 'down');
    fill(g, rnd(w * 0.26) - 3, m1 - 2, Math.max(26, rnd(30 * u)) + 6, 2, C.ink, 0.38);
    pew(g, rnd(w * 0.74), m1 - Math.max(6, rnd(9 * u)), Math.max(22, rnd(26 * u)), 1.3, 'down');
    fill(g, rnd(w * 0.74) - 3, m1 - Math.max(8, rnd(11 * u)), Math.max(22, rnd(26 * u)) + 6, 2, C.ink, 0.36);
    // 半淹的洗礼石盆（本幕专属）：石沿 + 盆里的沼水 + 盆柱 + 八角底座
    const fx = rnd(w * 0.60);
    const fw = Math.max(34, rnd(38 * u));
    const fTop = nb - Math.max(30, rnd(34 * u));
    const fBot = nb - Math.max(12, rnd(14 * u));
    fill(g, fx - Math.max(5, rnd(6 * u)), fBot, Math.max(9, rnd(11 * u)), nb - fBot, C.ruinStone, 1);
    fill(g, fx - Math.max(10, rnd(12 * u)), nb - 3, Math.max(20, rnd(24 * u)), 3, C.stoneDark, 1);
    fill(g, fx - Math.max(10, rnd(12 * u)), nb - 3, Math.max(20, rnd(24 * u)), 1, C.stoneLight, 0.4);
    fill(g, fx - Math.max(5, rnd(6 * u)), fBot, 2, Math.max(4, rnd(6 * u)), C.stoneLight, 0.3);
    silhouette(g, [
      { x: fx - rnd(fw / 2), y: fTop },
      { x: fx + rnd(fw / 2), y: fTop },
      { x: fx + rnd(fw / 2) - 6, y: fBot },
      { x: fx - rnd(fw / 2) + 6, y: fBot },
    ], C.ruinStone, 1);
    fill(g, fx - rnd(fw / 2) - 2, fTop - 3, fw + 4, 3, C.stoneDark, 1);
    fill(g, fx - rnd(fw / 2) - 2, fTop - 3, fw + 4, 1, C.stoneLight, 0.55);
    fill(g, fx - rnd(fw / 2) + 2, fTop - 2, fw - 4, 2, C.swampWater, 0.95);
    fill(g, fx - rnd(fw / 2) + 4, fTop - 2, Math.max(6, rnd(fw * 0.3)), 1, C.swampGlint, 0.5);
    for (let i = 0; i < 2; i++) fill(g, fx - rnd(fw * 0.3) + i * rnd(fw * 0.4), fTop + 1, 1, Math.max(4, rnd(8 * u)), C.stoneDark, 0.6);
    fill(g, fx - rnd(fw / 2) + 3, fBot - 2, Math.max(8, rnd(fw * 0.4)), 2, C.mossTileLit, 0.45);
    fill(g, fx - rnd(fw / 2) - 3, nb - 2, fw + 6, 3, C.ink, 0.4);
    // 倒在浅水里的柱鼓（半沉，顶棱受光）
    const dx2 = rnd(w * 0.33), dy2 = nb - Math.max(7, rnd(9 * u));
    const dw2 = Math.max(28, rnd(32 * u)), dh2 = Math.max(9, rnd(11 * u));
    fill(g, dx2, dy2, dw2, dh2, C.ruinStone, 1);
    fill(g, dx2, dy2, dw2, 1, C.stoneLight, 0.5);
    fill(g, dx2, dy2 + 2, dw2, 1, C.void, 0.35);
    fill(g, dx2 + Math.max(4, rnd(6 * u)), dy2 + 1, 1, dh2 - 2, C.stoneDark, 0.5);
    fill(g, dx2 - 3, dy2 + dh2, dw2 + 6, 2, C.ink, 0.4);
    // 近排水草与浮萍，把下半屏的水面切碎
    reeds(g, rnd(w * 0.855), nb - Math.max(2, rnd(3 * u)), nu, 4);
    reeds(g, rnd(w * 0.44), nb - Math.max(6, rnd(8 * u)), 1.4, 3);
    moss(g, { x: rnd(w * 0.14), y: nb - Math.max(6, rnd(8 * u)), w: Math.max(20, rnd(w * 0.14)), h: Math.max(4, rnd(6 * u)), seed: 71, color: C.mossTileLit, count: 7, alpha: 0.4 });
    moss(g, { x: rnd(w * 0.70), y: nb - Math.max(14, rnd(18 * u)), w: Math.max(18, rnd(w * 0.1)), h: Math.max(4, rnd(5 * u)), seed: 73, color: C.mossTileLit, count: 6, alpha: 0.35 });
    for (const [qx, qy, qw, qa] of [[0.05, 0.86, 0.2, 0.24], [0.52, 0.9, 0.26, 0.3], [0.78, 0.84, 0.14, 0.2]]) {
      fill(g, rnd(w * qx), waterBottom - Math.max(6, rnd((waterBottom - ground) * (1 - qy))), Math.max(6, rnd(w * qw)), 1, C.swampGlint, qa);
    }
  }

  // 9. 水面碎光：彩窗的色片 + 长椅缝隙里的幕色反光
  for (const [gx, gy, gc, gw, ga] of [
    [0.30, 0.74, C.glassRed, 6, 0.28], [0.34, 0.86, C.glassBlue, 5, 0.24],
    [0.62, 0.80, C.glassRed, 4, 0.2], [0.47, 0.62, C.swampGlint, 9, 0.3],
    [0.22, 0.52, C.swampGlint, 7, 0.26], [0.74, 0.66, C.swampGlint, 8, 0.24],
  ]) {
    fill(g, rnd(w * gx), horizon + rnd(span * gy), gw, 1, gc, ga);
  }
  // 浮萍/苔絮贴在水线上
  moss(g, { x: rnd(w * 0.04), y: waterline + 1, w: rnd(w * 0.9), h: Math.max(3, rnd(4 * u)), seed: 53, color: C.mossTileLit, count: 12, alpha: 0.4 });
  // 地平线上的低雾（把中景与后墙压在一起）
  fill(g, 0, horizon - 1, w, Math.max(2, rnd(3 * u)), C.fog, 0.07);
}

export function fore(g, L) {
  const { w, horizon, accent } = L;
  const u = L.tall ? 1.5 : 1;
  const ground = groundOf(L);
  const base = L.h - (L.tall ? 104 : 84);   // 碑座上沿

  // 1. 左侧断柱压边：从画面外升起的黑柱，断面朝上，只给 1px 受光棱
  const lx = -Math.max(4, rnd(6 * u));
  const lw = Math.max(26, rnd(34 * u));
  const ltop = horizon - Math.max(10, rnd(horizon * 0.16));
  // 竖屏那 138px 的水面不能让黑柱一路糊到碑座：柱身断在水里，露出断口与水面亮边
  const colBase = L.tall ? ground + Math.max(30, rnd((base - ground) * 0.5)) : base;
  silhouette(g, [
    { x: lx, y: colBase },
    { x: lx + rnd(lw * 0.2), y: ltop + Math.max(4, rnd(6 * u)) },
    { x: lx + rnd(lw * 0.62), y: ltop },
    { x: lx + lw, y: ltop + Math.max(6, rnd(10 * u)) },
    { x: lx + lw, y: colBase },
  ], C.void, 1);
  fill(g, lx + rnd(lw * 0.18), ltop + Math.max(4, rnd(6 * u)), 1, colBase - ltop, C.stoneLight, 0.32);
  fill(g, lx + rnd(lw * 0.2), ltop + Math.max(4, rnd(6 * u)), rnd(lw * 0.42), 1, C.stoneLight, 0.5);
  // 柱头：外挑一圈，断面再崩掉两角
  fill(g, lx + rnd(lw * 0.06), ltop + Math.max(8, rnd(12 * u)), rnd(lw * 0.9), Math.max(2, rnd(3 * u)), C.void, 0.9);
  fill(g, lx + rnd(lw * 0.06), ltop + Math.max(8, rnd(12 * u)), rnd(lw * 0.9), 1, C.stoneLight, 0.3);
  fill(g, lx + rnd(lw * 0.7), ltop + Math.max(2, rnd(4 * u)), rnd(lw * 0.3), Math.max(3, rnd(5 * u)), C.void, 1);
  // 柱脚：一圈外挑的基座，柱子才落地
  fill(g, lx, colBase - Math.max(6, rnd(9 * u)), lw + Math.max(3, rnd(6 * u)), Math.max(6, rnd(9 * u)), C.void, 1);
  fill(g, lx, colBase - Math.max(6, rnd(9 * u)), lw, 1, C.stoneLight, 0.3);
  fill(g, lx, colBase - Math.max(6, rnd(9 * u)), lw + Math.max(3, rnd(6 * u)), 1, C.ink, 1);
  // 柱脚没入水里的一圈亮边 + 落水阴影
  if (L.tall) {
    fill(g, lx + 2, colBase, lw, 2, C.ink, 0.5);
    fill(g, lx + 2, colBase, lw - 4, 1, C.swampGlint, 0.3);
  }
  fill(g, lx + 2, colBase - 1, lw - 2, 1, C.swampGlint, 0.25);
  moss(g, { x: lx + 2, y: ltop + Math.max(5, rnd(8 * u)), w: lw - 4, h: Math.max(4, rnd(7 * u)), seed: 111, color: C.mossTileLit, count: 8, alpha: 0.55 });

  // 2. 右侧倒梁压边：斜插进水里的木梁 + 两颗锈螺栓
  silhouette(g, [
    { x: w - Math.max(20, rnd(46 * u)), y: base },
    { x: w, y: base - Math.max(14, rnd(26 * u)) },
    { x: w, y: base - Math.max(8, rnd(16 * u)) },
    { x: w - Math.max(16, rnd(38 * u)), y: base + Math.max(4, rnd(6 * u)) },
  ], C.void, 0.96);
  fill(g, w - Math.max(18, rnd(42 * u)), y0(base, u), Math.max(14, rnd(34 * u)), 1, C.stoneLight, 0.34);
  fill(g, w - Math.max(14, rnd(30 * u)), y0(base, u) + Math.max(2, rnd(3 * u)), Math.max(8, rnd(18 * u)), 1, C.khaki, 0.18);
  fill(g, w - Math.max(10, rnd(20 * u)), base - Math.max(6, rnd(10 * u)), 2, 1, C.brassDark, 0.8);
  fill(g, w - Math.max(16, rnd(30 * u)), base - Math.max(2, rnd(4 * u)), 2, 1, C.brassDark, 0.7);

  // 3. 芦苇 5 根（右半屏，高 12–24）：前景的竖向节奏
  reeds(g, rnd(w * 0.79), ground - Math.max(4, rnd(6 * u)), u, 5);
  reeds(g, rnd(w * 0.905), ground - Math.max(2, rnd(3 * u)), u, 3);

  // 4. 低雾 3 条（贴水面，压住中景下缘）
  fill(g, 0, ground - Math.max(6, rnd(8 * u)), w, Math.max(2, rnd(3 * u)), C.fog, 0.09);
  fill(g, rnd(w * 0.04), ground - Math.max(2, rnd(3 * u)), rnd(w * 0.92), Math.max(2, rnd(2 * u)), C.fog, 0.12);
  fill(g, 0, ground, w, Math.max(2, rnd(3 * u)), C.fog, 0.07);

  // 5. 水面波光：幕色的细横条（光源在水里的碎影）
  for (const [gx, gy, gw, ga] of [
    [0.06, 0.52, 0.16, 0.16], [0.28, 0.40, 0.10, 0.10], [0.52, 0.66, 0.20, 0.2],
    [0.70, 0.30, 0.12, 0.12], [0.36, 0.86, 0.08, 0.08], [0.82, 0.58, 0.14, 0.14],
  ]) {
    fill(g, rnd(w * gx), horizon + rnd((ground - horizon) * gy), Math.max(4, rnd(w * gw)), 1, accent, ga);
  }
  // 3 圈涟漪（椭圆环）
  ellipseRing(g, rnd(w * 0.22), horizon + rnd((ground - horizon) * 0.72), Math.max(6, rnd(12 * u)), Math.max(2, rnd(3 * u)), accent, 0.14, 16);
  ellipseRing(g, rnd(w * 0.64), horizon + rnd((ground - horizon) * 0.44), Math.max(5, rnd(9 * u)), Math.max(2, rnd(2 * u)), accent, 0.11, 14);
  ellipseRing(g, rnd(w * 0.44), horizon + rnd((ground - horizon) * 0.84), Math.max(6, rnd(11 * u)), Math.max(2, rnd(2 * u)), C.sage, 0.1, 14);
}

// 半圆后殿壁龛：龛内暗底 + 石券框 + 三条竖向扶壁 + 顶部小尖塔 + 两侧外扶壁。
// 半圆拱而不是大跨度尖拱——拱线必须能一眼读出「圆」，才不会像帐篷。
function apse(g, cx, baseY, ww, hh, u) {
  const half = Math.max(12, rnd(ww / 2));
  const springY = baseY - Math.max(10, rnd(hh * 0.42));
  const rad = Math.max(6, Math.min(half, springY - 4));
  const arc = [];
  for (let i = 0; i <= 12; i++) {
    const th = Math.PI * (i / 12);
    arc.push({ x: rnd(cx - half * Math.cos(th)), y: rnd(springY - rad * Math.sin(th)) });
  }
  // 龛内暗底：直墙段 + 半圆顶，一整块挖进去的凹龛
  silhouette(g, [
    { x: cx - half, y: baseY }, { x: cx - half, y: springY },
    ...arc,
    { x: cx + half, y: baseY },
  ], C.ink, 0.97);
  // 龛内横向石缝（贴龛壁，给暗块一点砌体感）
  for (let yy = springY + 6; yy < baseY - 1; yy += 7) fill(g, cx - half + 1, yy, half * 2 - 2, 1, C.void, 0.5);
  // 石券框：拱券 2px + 两侧直段，左缘受光 1 档
  polyline(g, arc, C.ruinStone, 0.95, 2);
  fill(g, cx - half, springY, 2, baseY - springY, C.ruinStone, 0.95);
  fill(g, cx + half - 2, springY, 2, baseY - springY, C.ruinStone, 0.95);
  fill(g, cx - half, springY, 1, baseY - springY, C.stoneLight, 0.45);
  for (let i = 1; i < 12; i++) if (arc[i].x < cx && arc[i].x > cx - half) fill(g, arc[i].x, arc[i].y, 1, 1, C.stoneLight, 0.4);
  // 龛内三条竖向扶壁（等分撑住拱券）
  for (const k of [-1, 0, 1]) {
    const bx = cx + rnd(k * half * 0.5);
    const ribTop = springY - Math.max(6, rnd(rad * 0.55));
    fill(g, bx - 1, ribTop, 2, baseY - ribTop, C.ruinStone, 0.9);
    fill(g, bx, ribTop, 1, baseY - ribTop, C.void, 0.55);
    fill(g, bx - 1, ribTop, 1, baseY - ribTop, C.stoneLight, 0.22);
  }
  // 龛顶小尖塔（顶到拱顶），底座压住券顶
  const pinH = Math.max(9, rnd(14 * u));
  const apexY = springY - rad;
  fill(g, cx - Math.max(4, rnd(5 * u)), apexY - 2, Math.max(8, rnd(10 * u)), 3, C.ruinStone, 1);
  silhouette(g, [
    { x: cx - Math.max(3, rnd(5 * u)), y: apexY - 2 },
    { x: cx, y: apexY - pinH },
    { x: cx + Math.max(3, rnd(5 * u)), y: apexY - 2 },
  ], C.ruinStone, 1);
  fill(g, cx, apexY - pinH - Math.max(3, rnd(4 * u)), 1, Math.max(3, rnd(5 * u)), C.void, 0.8);
  // 两侧外扶壁（贴着后殿，各带一个小尖顶）
  for (const dir of [-1, 1]) {
    const bw = Math.max(7, rnd(9 * u));
    const bx = cx + dir * (half + Math.max(4, rnd(6 * u)));
    const bTop = baseY - Math.max(24, rnd(hh * 0.95));
    const x0 = dir < 0 ? bx - bw : bx;
    fill(g, x0, bTop, bw, baseY - bTop, C.ruinStone, 1);
    fill(g, x0, bTop, bw, 1, C.stoneLight, 0.45);
    fill(g, dir < 0 ? x0 : x0 + bw - 1, bTop, 1, baseY - bTop, C.stoneLight, 0.28);
    fill(g, dir < 0 ? x0 : x0 + bw - 1, bTop, 1, baseY - bTop, C.void, 0.4);
    // 扶壁上的退阶（两段收分）+ 小尖顶
    fill(g, x0, bTop + Math.max(6, rnd(9 * u)), bw, 1, C.void, 0.5);
    silhouette(g, [
      { x: x0 - 1, y: bTop + 1 },
      { x: x0 + rnd(bw / 2), y: bTop - Math.max(5, rnd(8 * u)) },
      { x: x0 + bw, y: bTop + 1 },
    ], C.ruinStone, 1);
  }
}

// 右侧倒梁的受光棱 y（梁顶斜边取中点附近）
function y0(base, u) {
  return base - Math.max(10, rnd(22 * u));
}
