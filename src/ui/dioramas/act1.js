// 第 I 幕「荒废墓园」——三层静态布景。
// 构图（横屏 480×270，地平线 150，碑座 186 起）：
//   远景 0–150：天幕三段 + 残月 + 云带 + 墓园矮墙(带垛口) + 尖拱门洞 + 枯树线
//   中景 90–184：七/九块错落墓碑 + 断裂石棺 + 大枯树 + 铁栅栏
//   近景 150–186：错缝石板路 + 主裂缝 + 枯草 + 低雾
// 材质线全部依附实体：碑面凿痕、砖缝、苔（贴石基）、锈（贴栅栏）。
import {
  fill, courses, pointedArch, column, disc, ring, cracks, moss, silhouette,
} from '../diorama-kit.js';
import { C } from '../Palette.js';

// 归一化锚点：全部落在碑座上沿之上（y ≤ 0.68），否则会被铭文带盖住。
export const anchors = {
  seal: { x: 0.5, y: 0.40, r: 0.16 },
  gate: { x: 0.271, y: 0.42, r: 0.12 },
  nail: { x: 0.5, y: 0.6815, r: 0.02 },
  lord: { x: 0.5583, y: 0.5556, r: 0.05 },
  light: { x: 0.2208, y: 0.1704, r: 0.03 },
};

const rnd = (n) => Math.round(n);
const groundOf = (L) => Math.min(rnd(L.anchors.nail.y), L.h - (L.tall ? 104 : 84));

// 碑顶：圆 / 尖 / 十字，返回碑体上沿 y
function tombTop(g, x, baseY, w, h, kind, u) {
  const topY = baseY - h;
  if (kind === 'round') {
    // 圆顶用 4 段阶梯近似（像素风不需要逐行）
    const r = w / 2;
    const rows = 4;
    for (let i = 0; i < rows; i++) {
      const dy = rnd((r / rows) * i);
      const half = Math.round(r * Math.cos((i / rows) * (Math.PI / 2.2)));
      fill(g, x + rnd(w / 2) - half, topY - r + dy, half * 2, Math.max(1, rnd(r / rows)), C.stone, 0.95);
    }
  } else if (kind === 'point') {
    const steps = Math.max(3, rnd(w * 0.3));
    for (let i = 0; i < steps; i++) {
      const half = Math.max(1, Math.round((w / 2) * (1 - i / steps)));
      fill(g, x + rnd(w / 2) - half, topY - rnd(i * (w / 2 / steps)), half * 2, Math.max(1, rnd(w / 2 / steps)), C.stone, 0.95);
    }
  } else {
    const cx = x + rnd(w / 2);
    fill(g, cx - 1, topY - rnd(9 * u), 3, rnd(9 * u), C.stone, 0.95);
    fill(g, cx - rnd(4 * u), topY - rnd(7 * u), rnd(9 * u), 2, C.stone, 0.95);
  }
  return topY;
}

// 一根枯树：锥形主干 + 三级分叉（主枝→副枝→枝梢），剪影式
function deadTree(g, x, baseY, h, color, alpha, spread = 1) {
  const line = (x1, y1, x2, y2, w = 1) => {
    if (w <= 1) silhouette(g, [{ x: rnd(x1), y: rnd(y1) }, { x: rnd(x2), y: rnd(y2) }], color, alpha);
    else fill(g, rnd(x1), rnd(Math.min(y1, y2)), w, rnd(Math.abs(y2 - y1)), color, alpha);
  };
  // 主干：底部 3px，向上收到 1px
  const third = h / 3;
  fill(g, x - 1, baseY - third * 3, 3, rnd(third), color, alpha);
  fill(g, x, baseY - third * 2, 2, rnd(third), color, alpha);
  fill(g, x, baseY - third, 1, rnd(third), color, alpha);
  // 主枝（左右交替，带副枝）
  const limbs = [
    [-0.52, -0.78, 0.22, 1], [-0.7, -0.9, -0.3, 1], [-0.82, -0.97, 0.16, 1],
    [-0.4, -0.62, -0.34, 1], [-0.92, -1.0, 0.1, 1],
  ];
  for (const [ty, ey, ex, depth] of limbs) {
    const sx = x + 1, sy = baseY - h * Math.abs(ty);
    const tx = x + ex * h * 0.22 * spread, tyy = baseY - h * Math.abs(ey);
    line(sx, sy, tx, tyy);
    if (depth) {
      const mx = (sx + tx) / 2, my = (sy + tyy) / 2;
      line(mx, my, mx + (tx - sx) * 0.5, my - h * 0.09);
      line(mx, my, mx - (tx - sx) * 0.7, my - h * 0.05);
    }
  }
  fill(g, x - 4, baseY - 3, 9, 3, color, alpha);
}

export function back(g, L) {
  const { w, horizon, accent } = L;
  const u = L.tall ? 1.22 : 1;
  const light = L.anchors.light;

  // 天幕：越靠地平线越亮（月光雾），三段硬边 + 一条雾带
  fill(g, 0, 0, w, rnd(horizon * 0.34), C.nightDeep, 1);
  fill(g, 0, rnd(horizon * 0.34), w, rnd(horizon * 0.28), C.ink, 1);
  fill(g, 0, rnd(horizon * 0.62), w, horizon - rnd(horizon * 0.62), C.ink, 1);
  fill(g, 0, rnd(horizon * 0.74), w, horizon - rnd(horizon * 0.74), C.stoneDark, 0.28);
  fill(g, 0, rnd(horizon * 0.86), w, horizon - rnd(horizon * 0.86), C.stoneDark, 0.22);

  // 星点 11 颗（1px，固定坐标）
  const stars = [[0.05, 0.10], [0.16, 0.07], [0.31, 0.14], [0.42, 0.05], [0.55, 0.17], [0.63, 0.09], [0.74, 0.13], [0.84, 0.06], [0.91, 0.18], [0.36, 0.23], [0.68, 0.21]];
  stars.forEach(([sx, sy], i) => fill(g, rnd(w * sx), rnd(horizon * sy), 1, 1, accent, i % 3 === 0 ? 0.5 : 0.24));

  // 残月（accent）+ 月晕
  disc(g, light.x, light.y, rnd(13 * u), accent, 0.92);
  ring(g, light.x, light.y, rnd(19 * u), accent, 0.13, 28);
  disc(g, light.x + rnd(5 * u), light.y - rnd(3 * u), rnd(11 * u), C.nightDeep, 0.94);

  // 两条薄云
  for (const [cy, cw, ca] of [[0.3, 0.52, 0.10], [0.4, 0.74, 0.07]]) {
    fill(g, rnd(w * 0.1), rnd(horizon * cy), rnd(w * cw), 2, C.stoneLight, ca);
    fill(g, rnd(w * 0.32), rnd(horizon * cy) + 3, rnd(w * cw * 0.45), 1, C.stoneLight, ca * 0.7);
  }

  // 墓园矮墙（带 5 个垛口）
  const wallTop = horizon - rnd(20 * u);
  courses(g, { x: 0, y: wallTop, w, h: horizon - wallTop, rowH: rnd(6 * u), color: C.stoneDark, alpha: 0.42, light: C.stoneLight, lightAlpha: 0.16 });
  fill(g, 0, wallTop, w, 1, C.stoneLight, 0.4);
  for (let i = 0; i < 5; i++) {
    fill(g, rnd(w * (0.03 + i * 0.2)), wallTop - rnd(4 * u), rnd(14 * u), rnd(4 * u), C.stoneDark, 0.65);
  }
  fill(g, 0, horizon - 1, w, 1, C.void, 0.9);
  // 地平雾：把墙脚与地面晕在一起
  fill(g, 0, horizon - rnd(5 * u), w, rnd(4 * u), C.fog, 0.07);
  fill(g, 0, horizon - rnd(2 * u), w, 2, C.fog, 0.1);

  // 尖拱门洞：0.16W 宽、0.48H 高，双圈拱券 + 门内铁门竖条 + 一盏铜灯
  const gate = L.anchors.gate;
  const gw = rnd(w * 0.16);
  const gh = rnd(horizon * 0.62);
  pointedArch(g, {
    cx: gate.x, baseY: horizon, w: gw, h: gh, t: 2,
    color: C.stoneLight, alpha: 0.45, fillColor: C.void, fillAlpha: 0.95, segs: 14,
  });
  for (const [dw, da] of [[gw + 8, 0.28], [gw + 16, 0.16]]) {
    pointedArch(g, { cx: gate.x, baseY: horizon, w: dw, h: rnd(gh * (dw / gw)), t: 1, color: C.stoneLight, alpha: da, segs: 14 });
  }
  const gx = gate.x;
  for (let i = -2; i <= 2; i++) {
    fill(g, gx + i * rnd(gw * 0.16), horizon - rnd(gh * 0.34), 1, rnd(gh * 0.34), C.inkDark, 0.85);
  }
  fill(g, gx - rnd(gw * 0.34), horizon - rnd(gh * 0.36), rnd(gw * 0.68), 1, C.inkDark, 0.85);
  disc(g, gx, horizon - rnd(gh * 0.56), rnd(3 * u), accent, 0.5);
  disc(g, gx, horizon - rnd(gh * 0.56), rnd(7 * u), accent, 0.13);
  fill(g, gx - rnd(9 * u), horizon - rnd(gh * 0.56), rnd(18 * u), 1, accent, 0.1);
  fill(g, gx - rnd(gw / 2) - rnd(4 * u), horizon - rnd(gh * 0.46), 1, rnd(gh * 0.46), C.stoneLight, 0.25);
  fill(g, gx + rnd(gw / 2) + rnd(3 * u), horizon - rnd(gh * 0.46), 1, rnd(gh * 0.46), C.stoneLight, 0.25);
  column(g, { cx: gx - rnd(gw / 2) - rnd(5 * u), topY: horizon - rnd(gh * 0.5), bottomY: horizon, w: rnd(4 * u), shaft: C.stoneDark, light: C.stone, capH: rnd(3 * u) });
  column(g, { cx: gx + rnd(gw / 2) + rnd(4 * u), topY: horizon - rnd(gh * 0.5), bottomY: horizon, w: rnd(4 * u), shaft: C.stoneDark, light: C.stone, capH: rnd(3 * u) });

  // 墙后远景枯树线 6 丛（比墙更暗，压在雾里）
  for (let i = 0; i < 6; i++) {
    const tx = rnd(w * (0.02 + i * 0.16));
    if (Math.abs(tx - gx) < gw * 0.9) continue;
    deadTree(g, tx, horizon - 1, rnd((12 + ((i * 11) % 16)) * u), C.void, 0.8);
  }

  // 墙后废墟剪影：三根断柱 + 一段残拱，给右半屏补天际线
  const ruinBase = horizon - rnd(24 * u);
  [[0.9, 16], [0.95, 11], [0.985, 14]].forEach(([rx, rh], i) => {
    const x = rnd(w * rx);
    fill(g, x, ruinBase - rnd(rh * u), rnd(3 * u), rnd(rh * u), C.void, 0.75);
    fill(g, x - 1, ruinBase - rnd(rh * u), rnd(5 * u), 1, C.void, 0.75);
    if (i === 1) fill(g, x, ruinBase - rnd(rh * u), rnd(10 * u), 1, C.void, 0.6);
  });
  cracks(g, { x: rnd(w * 0.9), y: ruinBase, len: Math.max(6, rnd(16 * u)), seed: 31, color: C.void, alpha: 0.35, branches: 0, drift: 0.2 });

}

export function mid(g, L) {
  const { w, horizon } = L;
  const u = L.tall ? 1.5 : 1;

  // 地面平面在中景层最底：先铺地面与石缝，再让碑/棺/栅栏站上去
  const ground = groundOf(L);
  fill(g, 0, horizon, w, L.h - horizon, C.ink, 1);
  fill(g, 0, horizon, rnd(w * 0.06), L.h - horizon, C.void, 0.28);
  fill(g, w - rnd(w * 0.06), horizon, rnd(w * 0.06), L.h - horizon, C.void, 0.28);
  const bands = Math.min(6, Math.max(3, Math.round((L.h - horizon) / 14)));
  const rowH = Math.max(4, Math.round((L.h - horizon) / bands));
  for (let r = 0; r < bands; r++) {
    const y = horizon + r * rowH;
    fill(g, 0, y, w, rowH, C.stoneDark, Math.max(0.08, 0.3 - r * 0.06));
    fill(g, 0, y, w, 1, C.groove, 0.42);
    fill(g, 0, y + 1, w, 1, C.ink, 0.5);
    const off = r % 2 === 0 ? 0 : rnd(w / 14);
    for (let c = -1; c < 7; c++) fill(g, off + c * rnd(w / 6), y, 1, rowH, C.groove, 0.3);
  }
  for (let i = 0; i < 9; i++) {
    const gx2 = rnd(w * (0.04 + i * 0.11));
    fill(g, gx2, horizon + rowH + rnd(2), 1, rnd(3), C.sage, 0.22);
  }
  fill(g, 0, horizon, w, 1, C.mossTileLit, 0.22);
  fill(g, rnd(w * 0.18), horizon + rowH, rnd(w * 0.3), rowH - 2, C.stoneLight, 0.1);
  cracks(g, { x: rnd(w * 0.46), y: horizon + 1, len: Math.min(56, Math.max(10, rnd((L.h - horizon) * 0.6))), seed: 17, color: C.inkDark, alpha: 0.9, branches: 1, drift: 0.4 });
  fill(g, 0, horizon, w, 1, C.sage, 0.1);


  // 主体：倾斜的大十字碑 + 基座 + 石瓮，撑住画面左中
  const hx = rnd(w * 0.6);
  const hy = ground - rnd(2 * u);
  const hh = rnd(78 * u);
  fill(g, hx - rnd(7 * u), hy - rnd(4 * u), rnd(14 * u), rnd(4 * u), C.stoneDark, 1);
  fill(g, hx - rnd(9 * u), hy, rnd(18 * u), rnd(2 * u), C.void, 0.7);
  fill(g, hx - rnd(2 * u), hy + rnd(1 * u), rnd(26 * u), rnd(3 * u), C.void, 0.45);
  // 十字碑身（右倾 1px）
  const scx = hx + 1;
  fill(g, scx - rnd(4 * u), hy - hh, rnd(8 * u), hh, C.stoneLight, 1);
  fill(g, scx + rnd(2 * u), hy - hh, rnd(2 * u), hh, C.stoneDark, 0.55);
  fill(g, scx - rnd(13 * u), hy - rnd(hh * 0.72), rnd(26 * u), rnd(7 * u), C.stoneLight, 1);
  fill(g, scx - rnd(13 * u), hy - rnd(hh * 0.72), rnd(26 * u), 1, C.stone, 0.8);
  fill(g, scx - rnd(13 * u), hy - rnd(hh * 0.72) + rnd(6 * u), rnd(26 * u), 1, C.stoneDark, 0.6);
  // 碑面凿痕与缺口
  for (let k = 0; k < 3; k++) fill(g, scx - rnd(2 * u), hy - rnd(hh * 0.6) + k * rnd(5 * u), rnd(6 * u), 1, C.groove, 0.5);
  fill(g, scx + rnd(1 * u), hy - rnd(hh * 0.86), 2, 2, C.void, 0.85);
  // 石瓮（顶部）
  fill(g, scx - rnd(4 * u), hy - hh - rnd(6 * u), rnd(8 * u), rnd(4 * u), C.stone, 1);
  fill(g, scx - rnd(3 * u), hy - hh - rnd(2 * u), rnd(6 * u), rnd(2 * u), C.stoneDark, 1);
  // 停在上面的乌鸦剪影（活物给静场一点不安）
  fill(g, scx + rnd(6 * u), hy - rnd(hh * 0.72) - rnd(6 * u), 3, 2, C.void, 1);
  fill(g, scx + rnd(9 * u), hy - rnd(hh * 0.72) - rnd(5 * u), 1, 1, C.void, 1);

  // 构图框架：左缘一株高树，与右侧主树一起把中央空场框住
  deadTree(g, rnd(w * 0.03), ground - rnd(1 * u), rnd(150 * u), C.void, 0.9, 1.1);

  // 大枯树：右侧最高剪影，树冠铺开
  const treeX = rnd(w * 0.655);
  deadTree(g, treeX, ground - rnd(2 * u), rnd(160 * u), C.void, 1, 1.25);
  fill(g, treeX - rnd(8 * u), ground - rnd(4 * u), rnd(18 * u), rnd(4 * u), C.void, 1);
  fill(g, treeX - rnd(5 * u), ground - rnd(9 * u), 2, rnd(6 * u), C.void, 1);

  // 墓碑 9 块：2 高 / 3 中 / 4 矮，碑顶三型与倾角错开
  // 碑群按纵深分三排：远排小、贴地平线；中排居中；近排大、压到碑座边
  const far = horizon + rnd(8 * u);
  const midRow = horizon + rnd(20 * u);
  const near = ground;
  const stones = [
    { x: rnd(w * 0.045), w: rnd(30 * u), h: rnd(74 * u), top: 'round', a: 1, base: near },
    { x: rnd(w * 0.115), w: rnd(22 * u), h: rnd(48 * u), top: 'point', a: 0.95, base: midRow },
    { x: rnd(w * 0.18), w: rnd(14 * u), h: rnd(26 * u), top: 'round', a: 0.8, base: far },
    { x: rnd(w * 0.375), w: rnd(18 * u), h: rnd(52 * u), top: 'cross', a: 1, base: near },
    { x: rnd(w * 0.44), w: rnd(15 * u), h: rnd(34 * u), top: 'point', a: 0.9, base: midRow },
    { x: rnd(w * 0.5), w: rnd(12 * u), h: rnd(22 * u), top: 'round', a: 0.75, base: far },
    { x: rnd(w * 0.715), w: rnd(24 * u), h: rnd(58 * u), top: 'round', a: 1, base: near },
    { x: rnd(w * 0.775), w: rnd(16 * u), h: rnd(32 * u), top: 'point', a: 0.86, base: midRow },
    { x: rnd(w * 0.83), w: rnd(12 * u), h: rnd(20 * u), top: 'cross', a: 0.7, base: far },
  ];
  stones.forEach((s, i) => {
    const x = s.x + (i === 1 || i === 7 ? 1 : 0);
    const baseY = s.base;
    const topY = tombTop(g, x, baseY, s.w, s.h, s.top, u);
    // 碑体：左侧受光（stoneLight）、右侧背光（stone），中缝压一档
    fill(g, x, topY, s.w, s.h, C.stone, s.a);
    fill(g, x + 1, topY + (s.top === 'cross' ? rnd(10 * u) : 0), Math.max(2, rnd(s.w * 0.45)), s.h - rnd(2 * u), C.stoneLight, 0.5 * s.a);
    fill(g, x + Math.max(2, rnd(s.w * 0.52)), topY, Math.max(2, rnd(s.w * 0.44)), s.h, C.stoneDark, 0.4);
    fill(g, x + s.w - 2, topY, 1, s.h, C.stoneDark, 0.9);
    // 月光投影：碑体向右下拖一条斜影（三行矩形，比多边形便宜）
    const sl = rnd(s.h * 0.45);
    fill(g, x, baseY, s.w + rnd(sl * 0.4), 1, C.void, 0.3);
    fill(g, x + rnd(sl * 0.35), baseY + 1, rnd(sl * 0.55), 1, C.void, 0.2);
    fill(g, x + rnd(sl * 0.75), baseY + 2, rnd(sl * 0.4), 1, C.void, 0.12);
    // 接触阴影 + 碑顶受光
    fill(g, x - 3, baseY + 1, s.w + 6, 2, C.void, 0.55);
    fill(g, x + 1, topY + (s.top === 'cross' ? rnd(9 * u) : 0), Math.max(2, s.w - 3), 1, C.stoneLight, 0.7 * s.a);
    // 碑座两级
    fill(g, x - 2, baseY - 2, s.w + 4, 2, C.stoneDark, s.a);
    fill(g, x - 4, baseY, s.w + 8, 2, C.stoneDark, 0.65);
    // 凿痕 2–3 条 + 1 处缺口
    for (let k = 0; k < 2 + (i % 2); k++) {
      fill(g, x + 2, topY + rnd(s.h * (0.32 + k * 0.2)), Math.max(3, s.w - 6), 1, C.groove, 0.55);
    }
    fill(g, x + s.w - 5, topY + rnd(s.h * 0.58), 2, 2, C.void, 0.9);
    if (i % 2 === 0) moss(g, { x: x - 2, y: baseY - 4, w: s.w + 5, h: 4, seed: 21 + i, color: C.mossTileLit, count: 5, alpha: 0.6 });
  });

  // 断裂石棺：左下，盖板错位 4px，缝里长苔
  const sx = rnd(w * 0.02);
  const sy = ground - rnd(16 * u);
  fill(g, sx - 2, sy + rnd(14 * u), rnd(42 * u), 3, C.stoneDark, 0.7);
  fill(g, sx, sy, rnd(34 * u), rnd(14 * u), C.stoneDark, 0.95);
  fill(g, sx + 1, sy + 1, rnd(32 * u), 1, C.stoneLight, 0.35);
  fill(g, sx + rnd(3 * u), sy - 2, rnd(22 * u), rnd(5 * u), C.stone, 0.95);
  fill(g, sx + rnd(28 * u), sy - 1, rnd(10 * u), rnd(4 * u), C.stone, 0.85);
  fill(g, sx + rnd(25 * u), sy, 1, 3, C.void, 0.9);
  moss(g, { x: sx + rnd(24 * u), y: sy + 1, w: rnd(10 * u), h: 3, seed: 5, color: C.mossTileLit, count: 4, alpha: 0.6 });

  // 右侧铁栅栏：9 根带尖头的竖条 + 2 横梁 + 4 点锈
  const fx = rnd(w * 0.855);
  const fy = ground - rnd(32 * u);
  const fw = w - fx - rnd(3 * u);
  const gap = Math.max(3, Math.floor(fw / 9));
  for (let i = 0; i < 9; i++) {
    const bx = fx + i * gap;
    fill(g, bx, fy, 1, rnd(32 * u), C.inkDark, 0.95);
    silhouette(g, [{ x: bx, y: fy }, { x: bx + 1, y: fy }, { x: bx + 1, y: fy - rnd(3 * u) }], C.inkDark, 0.95);
    fill(g, bx, fy, 1, 2, C.stoneLight, 0.4);
  }
  fill(g, fx, fy + rnd(9 * u), gap * 8 + 1, 1, C.inkDark, 0.95);
  fill(g, fx, fy + rnd(23 * u), gap * 8 + 1, 1, C.inkDark, 0.95);
  [[2, 9], [3, 12], [5, 17], [7, 26]].forEach(([i, dy]) => fill(g, fx + i * gap, fy + rnd(dy * u), 1, 1, C.brassDark, 0.85));
}

export function fore(g, L) {
  const { w, horizon } = L;
  const u = L.tall ? 1.5 : 1;
  const ground = groundOf(L);

  // 近景只放压边物件：草、低雾、残碑。地面与裂缝在远景层，避免盖住中景碑体。
  // 枯草 4 簇（5 根 1px 斜线）+ 低雾 2 条
  [0.1, 0.3, 0.56, 0.9].forEach((tx, i) => {
    const x = rnd(w * tx);
    for (let k = -2; k <= 2; k++) {
      const hh = rnd((6 + Math.abs(k)) * u);
      fill(g, x + k * 2, ground - hh, 1, hh, C.sage, 0.34 + (i % 2) * 0.1);
    }
  });
  fill(g, 0, ground - 1, w, 1, C.fog, 0.14);
  fill(g, rnd(w * 0.18), ground - 3, rnd(w * 0.52), 1, C.fog, 0.09);

  // 压边：右下角斜倒的残碑（只露上沿，其余被碑座盖住）
  const bx = w - rnd(30 * u);
  fill(g, bx, ground - rnd(8 * u), rnd(28 * u), rnd(8 * u), C.void, 0.95);
  fill(g, bx, ground - rnd(8 * u), rnd(28 * u), 1, C.stoneLight, 0.35);
}
