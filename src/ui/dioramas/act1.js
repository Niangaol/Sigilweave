// 第 I 幕「荒废墓园」——三层静态布景。
// 构图（横屏 480×270，地平线 150，碑座 186 起）：
//   远景 0–150：天幕三段 + 残月 + 云带 + 墓园矮墙(带垛口) + 尖拱门洞 + 枯树线
//   中景 90–184：七/九块错落墓碑 + 断裂石棺 + 大枯树 + 铁栅栏
//   近景 150–186：错缝石板路 + 主裂缝 + 枯草 + 低雾
// 材质线全部依附实体：碑面凿痕、砖缝、苔（贴石基）、锈（贴栅栏）。
import {
  fill, courses, pointedArch, column, disc, ring, cracks, moss, silhouette, candle, rubble,
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
// twigs=1 只画主副枝、不画枝梢：远景框架树省指令，近景主树才用满两级
function deadTree(g, x, baseY, h, color, alpha, spread = 1, twigs = 2) {
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
      if (twigs > 1) line(mx, my, mx - (tx - sx) * 0.7, my - h * 0.05);
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

  // —— 高空亮星：2×2 星核 + 四向星芒，星等分档，横向铺开 ——
  // 1px 的星点在 480 宽的画布上只是一点灰，天幕要读得出来得有实实在在的亮块
  const brightStars = [[0.075, 0.155], [0.205, 0.075], [0.455, 0.115], [0.655, 0.055], [0.885, 0.085], [0.415, 0.345]];
  for (const [bsx, bsy] of brightStars) {
    const px = rnd(w * bsx), py = rnd(horizon * bsy);
    fill(g, px, py, 2, 2, C.bone, 0.85);
    fill(g, px - 1, py, 1, 2, C.bone, 0.26);
    fill(g, px + 2, py, 1, 2, C.bone, 0.26);
    fill(g, px, py - 1, 2, 1, C.bone, 0.26);
    fill(g, px, py + 2, 2, 1, C.bone, 0.26);
  }

  // 残月（accent）+ 月晕
  disc(g, light.x, light.y, rnd(13 * u), accent, 0.92);
  ring(g, light.x, light.y, rnd(19 * u), accent, 0.13, 28);
  disc(g, light.x + rnd(5 * u), light.y - rnd(3 * u), rnd(11 * u), C.nightDeep, 0.94);

  // 残月冷晕：给暗紫天幕补一档冷色，月亮周围才不是一块平色
  // 用同心环而不是实心盘：实心盘会在月周留下一圈硬边，读起来像贴着个月亮的气泡
  ring(g, light.x, light.y, rnd(26 * u), C.glassBlue, 0.1, 30);
  ring(g, light.x, light.y, rnd(33 * u), C.runeCold, 0.055, 34);
  ring(g, light.x, light.y, rnd(44 * u), C.glassBlue, 0.04, 38);
  ring(g, light.x, light.y, rnd(56 * u), C.runeCold, 0.025, 42);

  // —— 月照云堤：三团紧凑的积云，把上空三分之一的空暗天幕填出体积 ——
  // 不用通栏长条：长条的中间段左右邻格同值，软渲染里几乎不产生边缘，读起来像天花板；
  // 改成 5–6 个高低错落的"云球"拼一朵云（像素云只有硬边），底边压平、顶沿擦银棱
  const clouds = [
    { x: 0.30, y: 0.195, w: 0.235, a: 0.105, rim: 0.2 },
    { x: 0.575, y: 0.40, w: 0.205, a: 0.09, rim: 0.17 },
    { x: 0.045, y: 0.545, w: 0.175, a: 0.075, rim: 0.15 },
  ];
  clouds.forEach((b, bi) => {
    const bx = rnd(w * b.x), by = rnd(horizon * b.y), bw = rnd(w * b.w);
    const H = (n) => Math.max(2, rnd(n * u));
    // [x 偏移比例, 宽比例, 高比例]：中间最高、两端矮，云头才是一个隆起的包
    const lobes = [[0, 0.30, 0.34], [0.2, 0.34, 0.62], [0.42, 0.34, 1], [0.62, 0.28, 0.66], [0.82, 0.18, 0.38]];
    lobes.forEach((lo, li) => {
      const lx = bx + rnd(bw * lo[0]), lw = Math.max(3, rnd(bw * lo[1])), lh = H(13 * lo[2]);
      fill(g, lx, by - lh, lw, lh, C.bone, b.a * (li === 2 ? 1 : 0.92));
      // 每个云球的顶沿各擦一道银棱（月光在前上方），左侧那道最亮
      if (lo[2] > 0.34) fill(g, lx + 1, by - lh, Math.max(2, lw - 2), 1, C.bone, b.rim * (li === 2 ? 1 : 0.8));
    });
    // 底边压平 + 一道背光暗边 + 一条向下拖的雾丝，云脚不悬空
    fill(g, bx, by, rnd(bw * 1.05), H(2), C.bone, b.a * 0.8);
    fill(g, bx, by + H(2) - 1, rnd(bw * 1.05), 1, C.void, 0.2 + bi * 0.02);
    fill(g, bx + rnd(bw * 0.22), by + H(2), rnd(bw * 0.34), 1, C.bone, b.a * 0.5);
  });

  // —— 荒冢丘陵：矮墙背后连续低起伏的土丘，把天与地接起来（最远一层）——
  // 顶边只留 1px 冷受光棱：先画一条上移 2px 的冷色剪影当前景光，再让实心山体压掉下面
  const hillStep = 8;
  const crestPts = [];
  for (let x = 0; x <= w; x += hillStep) {
    const t = x / w;
    const rise = 25 * u + 11 * u * Math.sin(t * 6.2832 * 1.15 + 0.8) + 5 * u * Math.sin(t * 6.2832 * 3.3 + 2.4);
    crestPts.push({ x, y: rnd(horizon - Math.max(8 * u, rise)) });
  }
  silhouette(g, [...crestPts.map((p) => ({ x: p.x, y: p.y - 2 })), { x: w, y: horizon }, { x: 0, y: horizon }], C.glassBlue, 0.14);
  silhouette(g, [{ x: 0, y: horizon }, ...crestPts, { x: w, y: horizon }], C.void, 0.9);
  // 山体顶部 7px 的受光坡带：丘陵不是一块平剪影——坡顶被月光照亮，坡脚仍埋在暗里
  // alpha 0.5 是这一层能读出来的下限：再淡就只是天空里的一条脏线
  silhouette(g, [...crestPts, ...crestPts.slice().reverse().map((p) => ({ x: p.x, y: p.y + rnd(7 * u) }))], C.stoneDark, 0.5);
  // 坡顶再压一层更窄的枯草（sage），让受光坡有土色而不是一块灰
  silhouette(g, [...crestPts, ...crestPts.slice().reverse().map((p) => ({ x: p.x, y: p.y + Math.max(2, rnd(3 * u)) }))], C.sage, 0.14);
  g.lineStyle(1, C.glassBlue, 0.34);
  g.strokePoints(crestPts, false);
  g.lineStyle(1, C.bone, 0.12);
  g.strokePoints(crestPts.map((p) => ({ x: p.x, y: p.y - 1 })), false);

  // —— 远处枯林带：一排 2–4px 宽的枯树剪影站在丘陵顶线上，间距忽密忽疏 ——
  const forest = [0.02, 0.055, 0.083, 0.13, 0.158, 0.215, 0.26, 0.315, 0.345, 0.41, 0.465, 0.52, 0.575, 0.63, 0.715, 0.79, 0.87, 0.94];
  forest.forEach((fx, i) => {
    const tx = rnd(w * fx);
    const ci = Math.max(0, Math.min(crestPts.length - 1, rnd(tx / hillStep)));
    const cy = crestPts[ci].y;
    const th = rnd((7 + ((i * 13) % 9)) * u);
    const tw = 2 + (i % 2);
    fill(g, tx, cy - th, tw, th, C.void, 0.9);
    fill(g, tx - rnd(2 * u), cy - rnd(th * 0.62), tw, 1, C.void, 0.72);
    fill(g, tx + tw, cy - rnd(th * 0.42), tw, 1, C.void, 0.72);
  });

  // —— 家族墓室（骨龛墙）：比礼拜堂更远的第二层次，横向石椁 + 一排小拱龛 + 檐口 ——
  const ox = rnd(w * 0.455);
  const ow = rnd(w * 0.29);
  const oTop = horizon - rnd(48 * u);
  const oBase = horizon - rnd(4 * u);
  // 远建筑在月光雾里是一块中调石色，不是一块死黑：只有比天空更淡，才能读出它是"远"
  fill(g, ox, oTop, ow, oBase - oTop, C.stoneDark, 0.6);
  const wallTop = horizon - rnd(20 * u);
  fill(g, ox, oTop, rnd(3 * u), oBase - oTop, C.stoneLight, 0.2);
  fill(g, ox + ow - rnd(3 * u), oTop, rnd(3 * u), oBase - oTop, C.void, 0.3);
  fill(g, ox - rnd(2 * u), oTop - rnd(2 * u), rnd(5 * u), oBase - oTop, C.stoneDark, 0.8);
  fill(g, ox + ow - rnd(2 * u), oTop - rnd(2 * u), rnd(5 * u), oBase - oTop, C.void, 0.35);
  // 檐口：比墙身宽出一圈，顶上一道月光棱
  fill(g, ox - rnd(3 * u), oTop - rnd(3 * u), ow + rnd(6 * u), rnd(3 * u), C.stoneDark, 0.95);
  fill(g, ox - rnd(3 * u), oTop - rnd(3 * u), ow + rnd(6 * u), 1, C.bone, 0.28);
  fill(g, ox - rnd(2 * u), oTop + rnd(4 * u), ow + rnd(4 * u), 1, C.void, 0.6);
  // 一排骨龛：暗龛口 + 两像素亮框 + 龛底台，龛口是这片墙上唯一有节奏的东西，必须读得出来
  // 龛位整体上提到矮墙顶之上（wallTop 以下全被墙吃掉，压在下面等于白画）
  const oDoor = ox + rnd(ow / 2);
  const nichBase = oBase - rnd(24 * u);
  for (let i = 0; i < 6; i++) {
    const ncx = ox + rnd(ow * (0.1 + i * 0.148));
    if (Math.abs(ncx - oDoor) < rnd(ow * 0.11)) continue;
    fill(g, ncx - rnd(4 * u), nichBase - rnd(9 * u), rnd(8 * u), rnd(9 * u), C.void, 0.8);
    pointedArch(g, { cx: ncx, baseY: nichBase, w: rnd(8 * u), h: rnd(12 * u), t: 2, color: C.stoneLight, alpha: 0.5, segs: 5 });
    fill(g, ncx - rnd(3 * u), nichBase - 1, rnd(6 * u), 2, C.stoneLight, 0.34);
  }
  // 中央山墙 + 铁十字：墓室的叙事焦点，也是一眼能认出的"这是墓"
  fill(g, oDoor - rnd(10 * u), oTop - rnd(7 * u), rnd(20 * u), rnd(7 * u), C.stoneDark, 0.75);
  fill(g, oDoor - rnd(10 * u), oTop - rnd(7 * u), rnd(20 * u), 1, C.bone, 0.2);
  fill(g, oDoor - 1, oTop - rnd(16 * u), 2, rnd(9 * u), C.void, 0.95);
  fill(g, oDoor - rnd(5 * u), oTop - rnd(13 * u), rnd(10 * u), 2, C.void, 0.95);
  pointedArch(g, { cx: oDoor, baseY: wallTop + rnd(2 * u), w: rnd(14 * u), h: rnd(22 * u), t: 2, color: C.stoneLight, alpha: 0.5, fillColor: C.void, fillAlpha: 0.95, segs: 8 });

  // 墓园矮墙（带 5 个垛口）
  courses(g, { x: 0, y: wallTop, w, h: horizon - wallTop, rowH: rnd(6 * u), color: C.stoneDark, alpha: 0.42, light: C.stoneLight, lightAlpha: 0.16 });
  fill(g, 0, wallTop, w, 1, C.stoneLight, 0.4);
  fill(g, 0, wallTop + 1, w, 1, C.glassBlue, 0.12);
  for (let i = 0; i < 5; i++) {
    fill(g, rnd(w * (0.03 + i * 0.2)), wallTop - rnd(4 * u), rnd(14 * u), rnd(4 * u), C.stoneDark, 0.65);
  }
  // 围墙上的盲拱（封死的祭龛）：一排石券轮廓，把平板墙切成有节奏的立面
  for (let i = 0; i < 5; i++) {
    const acx = rnd(w * (0.1 + i * 0.2));
    if (Math.abs(acx - L.anchors.gate.x) < rnd(w * 0.11)) continue;
    pointedArch(g, { cx: acx, baseY: horizon, w: rnd(24 * u), h: rnd(15 * u), t: 1, color: C.stoneLight, alpha: 0.16, segs: 8 });
    pointedArch(g, { cx: acx, baseY: horizon, w: rnd(18 * u), h: rnd(11 * u), t: 1, color: C.void, alpha: 0.26, segs: 8 });
    fill(g, acx - rnd(2 * u), horizon - rnd(15 * u), rnd(4 * u), 1, C.stoneLight, 0.12);
  }
  fill(g, 0, horizon - 1, w, 1, C.void, 0.9);
  // 地平雾：把墙脚与地面晕在一起
  fill(g, 0, horizon - rnd(5 * u), w, rnd(4 * u), C.fog, 0.07);
  fill(g, 0, horizon - rnd(2 * u), w, 2, C.fog, 0.1);
  fill(g, rnd(w * 0.08), horizon - rnd(8 * u), rnd(w * 0.5), 1, C.runeCold, 0.05);
  fill(g, rnd(w * 0.44), horizon - rnd(11 * u), rnd(w * 0.42), 1, C.runeCold, 0.04);

  // 尖拱门洞：0.16W 宽、0.48H 高，双圈拱券 + 门内铁门竖条 + 一盏铜灯
  const gate = L.anchors.gate;
  const gw = rnd(w * 0.16);
  // 门洞高度同时受"地平线高度"和"门宽"约束：竖屏地平线翻倍，若只按 horizon 缩放，
  // 门会长成一根 77×210 的尖针，外面两圈拱券还会再放大成一顶占满上半个画面的尖帐篷
  const gh = rnd(Math.min(horizon * 0.62, gw * 1.25));
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

  // 残破礼拜堂：左上天幕里的高剪影（钟塔 + 侧殿 + 两扇尖窗），这一幕的第二地标
  const chx = rnd(w * 0.115);
  const tw = rnd(11 * u);
  const tTop = rnd(wallTop - 42 * u);
  const nx = chx + rnd(tw * 0.7);
  const nw = rnd(w * 0.095);
  // 侧殿与四级收分屋面
  fill(g, nx, wallTop - rnd(18 * u), nw, rnd(18 * u) + 1, C.stoneDark, 0.95);
  for (let i = 0; i < 4; i++) {
    const k = 1 - i * 0.22;
    fill(g, nx - rnd(2 * u), wallTop - rnd(18 * u) - i * rnd(3 * u), rnd(nw * k) + rnd(4 * u), rnd(3 * u), C.stoneDark, 0.95);
  }
  // 塔身 + 雉堞 + 左棱受光
  fill(g, chx, tTop, tw, wallTop - tTop + 1, C.stoneDark, 0.96);
  for (let i = 0; i < 3; i++) fill(g, chx + i * rnd(tw / 3), tTop - rnd(4 * u), Math.max(1, rnd(tw / 4)), rnd(4 * u), C.stoneDark, 0.96);
  fill(g, chx - 2, tTop - rnd(2 * u), 3, rnd(3 * u), C.stoneDark, 0.8);
  for (let i = 0; i < 4; i++) fill(g, chx, tTop + rnd(6 * u) + i * rnd(7 * u), tw, 1, C.inkDark, 0.55);
  fill(g, chx, tTop, 1, wallTop - tTop + 1, C.stoneLight, 0.4);
  // 两扇尖窗：下窗黑、上窗透冷月光
  pointedArch(g, { cx: chx + rnd(tw / 2), baseY: tTop + rnd(9 * u), w: rnd(5 * u), h: rnd(8 * u), t: 1, color: C.stoneLight, alpha: 0.22, fillColor: C.void, fillAlpha: 0.9, segs: 7 });
  pointedArch(g, { cx: chx + rnd(tw / 2), baseY: wallTop - rnd(8 * u), w: rnd(6 * u), h: rnd(11 * u), t: 1, color: C.stoneLight, alpha: 0.3, fillColor: C.glassBlue, fillAlpha: 0.45, segs: 7 });

  // 月下的云带三条（压在礼拜堂与月盘之间，给夜空一点体积）
  for (const [cy, cx0, cw2, ca] of [[0.13, 0.02, 0.36, 0.07], [0.19, 0.42, 0.44, 0.05], [0.26, 0.12, 0.6, 0.04]]) {
    fill(g, rnd(w * cx0), rnd(horizon * cy), rnd(w * cw2), rnd(3 * u), C.stoneLight, ca);
    fill(g, rnd(w * cx0) + rnd(w * 0.06), rnd(horizon * cy) + rnd(3 * u), rnd(w * cw2 * 0.6), 1, C.stoneLight, ca * 0.8);
  }

  // 五只盘旋的乌鸦：翼展 5px 的 V 形，位置固定（绕着礼拜堂塔尖打旋，不随机）
  // 位置贴着第二团云的上缘走：纯黑剪影压在骨白的云顶上才读得出来，
  // 放到 y≈0.1 的天顶只剩五个看不见的黑点（天顶是全画面最暗的地方）
  const crows = [[0.605, 0.285, 1], [0.655, 0.335, -1], [0.705, 0.30, 1], [0.745, 0.36, -1], [0.775, 0.315, 1]];
  for (const [bx, by, up] of crows) {
    const cx = rnd(w * bx), cy = rnd(horizon * by);
    fill(g, cx, cy, 1, 1, C.void, 0.85);
    fill(g, cx - 1, cy, 1, 1, C.void, 0.8);
    fill(g, cx + 1, cy, 1, 1, C.void, 0.8);
    fill(g, cx - 2, cy + up, 1, 1, C.void, 0.7);
    fill(g, cx + 2, cy + up, 1, 1, C.void, 0.7);
  }

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
    // 竖屏石缝少画两道：地面更高，多画只会让地面发糊；
    // 竖屏每道只画半截：通高竖线在 70px 高的带里会读成墙板拼缝，打断后才像石块接缝
    for (let c = -1; c < (L.tall ? 4 : 7); c++) {
      const sx = off + c * rnd(w / 6);
      if (L.tall) fill(g, sx, y + rnd(rowH * 0.34), 1, Math.max(6, rnd(rowH * 0.5)), C.groove, 0.3);
      else fill(g, sx, y, 1, rowH, C.groove, 0.3);
    }
  }
  for (let i = 0; i < (L.tall ? 6 : 9); i++) {
    const gx2 = rnd(w * (0.04 + i * 0.11));
    fill(g, gx2, horizon + rowH + rnd(2), 1, rnd(3), C.sage, 0.22);
  }
  fill(g, 0, horizon, w, 1, C.mossTileLit, 0.22);
  fill(g, rnd(w * 0.18), horizon + rowH, rnd(w * 0.3), rowH - 2, C.stoneLight, 0.1);
  cracks(g, { x: rnd(w * 0.46), y: horizon + 1, len: Math.min(L.tall ? 34 : 52, Math.max(10, rnd((L.h - horizon) * 0.6))), seed: 17, color: C.inkDark, alpha: 0.9, branches: 1, drift: 0.4 });
  fill(g, 0, horizon, w, 1, C.sage, 0.1);
  // 泥斑四处：地面不是一张均匀的灰毯，土色块让远近两层地面在 10px 尺度上有起伏
  [[0.14, 0.42, 0.22, 0.5], [0.46, 0.68, 0.16, 0.34], [0.62, 0.5, 0.2, 0.42], [0.82, 0.74, 0.14, 0.3]].forEach(([px, py, pw, pa]) => {
    fill(g, rnd(w * px), horizon + rnd((L.h - horizon) * 0.55) + rnd((L.h - horizon) * py * 0.3), rnd(w * pw), rnd(Math.max(4, (L.h - horizon) * 0.05)), C.stoneDark, pa * 0.6);
  });

  // 塌陷墓穴：碑群之间唯一一处"开口"——暗坑 + 掀翻的盖板 + 坑边土堆（预算从中景旧件里腾出来的）
  const pitX = rnd(w * 0.255), pitY = ground - rnd(5 * u);
  fill(g, pitX, pitY, rnd(30 * u), rnd(6 * u), C.void, 0.85);
  fill(g, pitX, pitY, rnd(30 * u), 1, C.stoneLight, 0.28);
  fill(g, pitX - 1, pitY + rnd(6 * u), rnd(32 * u), 1, C.inkDark, 0.9);
  fill(g, pitX + rnd(21 * u), pitY - rnd(4 * u), rnd(14 * u), rnd(3 * u), C.stone, 0.95);
  fill(g, pitX + rnd(23 * u), pitY - rnd(6 * u), rnd(9 * u), rnd(2 * u), C.stoneLight, 0.55);
  fill(g, pitX - rnd(5 * u), pitY - rnd(2 * u), rnd(9 * u), rnd(3 * u), C.stoneDark, 0.95);
  rubble(g, { x: pitX - rnd(3 * u), y: pitY - rnd(3 * u), w: rnd(36 * u), h: rnd(4 * u), seed: 53, color: C.stoneDark, color2: C.stone, count: 5, alpha: 0.8 });


  // 主体：倾斜的大十字碑 + 基座 + 石瓮，撑住画面左中
  const hx = rnd(w * 0.6);
  const hy = ground - rnd(2 * u);
  const hh = rnd(78 * u);
  fill(g, hx - rnd(7 * u), hy - rnd(4 * u), rnd(14 * u), rnd(4 * u), C.stoneDark, 1);
  fill(g, hx - rnd(9 * u), hy, rnd(18 * u), rnd(2 * u), C.void, 0.7);
  fill(g, hx - rnd(2 * u), hy + rnd(1 * u), rnd(26 * u), rnd(3 * u), C.void, 0.45);
  // 十字碑身（右倾 1px）
  const scx = hx + 1;
  fill(g, scx - rnd(4 * u), hy - hh, rnd(8 * u), hh, C.ink, 1);
  fill(g, scx - rnd(4 * u), hy - hh, 1, hh, C.stoneLight, 0.55);
  fill(g, scx + rnd(2 * u), hy - hh, 1, hh, C.void, 0.9);
  fill(g, scx - rnd(13 * u), hy - rnd(hh * 0.72), rnd(26 * u), rnd(7 * u), C.ink, 1);
  fill(g, scx - rnd(13 * u), hy - rnd(hh * 0.72), rnd(26 * u), 1, C.stoneLight, 0.6);
  fill(g, scx - rnd(13 * u), hy - rnd(hh * 0.72) + rnd(6 * u), rnd(26 * u), 1, C.void, 0.9);
  // 碑面凿痕与缺口
  for (let k = 0; k < 3; k++) fill(g, scx - rnd(2 * u), hy - rnd(hh * 0.6) + k * rnd(5 * u), rnd(6 * u), 1, C.groove, 0.5);
  fill(g, scx + rnd(1 * u), hy - rnd(hh * 0.86), 2, 2, C.void, 0.85);
  // 石瓮（顶部）
  fill(g, scx - rnd(4 * u), hy - hh - rnd(6 * u), rnd(8 * u), rnd(4 * u), C.stone, 1);
  fill(g, scx - rnd(3 * u), hy - hh - rnd(2 * u), rnd(6 * u), rnd(2 * u), C.stoneDark, 1);
  // 十字碑的东向投影：与碑群同一光源，影长按碑体高度给
  fill(g, hx - rnd(14 * u), hy + rnd(3 * u), rnd(30 * u), 1, C.void, 0.28);
  fill(g, hx + rnd(6 * u), hy + rnd(4 * u), rnd(18 * u), 1, C.void, 0.16);
  // 停在上面的乌鸦剪影（活物给静场一点不安）
  fill(g, scx + rnd(6 * u), hy - rnd(hh * 0.72) - rnd(6 * u), 3, 2, C.void, 1);
  fill(g, scx + rnd(9 * u), hy - rnd(hh * 0.72) - rnd(5 * u), 1, 1, C.void, 1);

  // 构图框架：左缘一株高树，与右侧主树一起把中央空场框住
  deadTree(g, rnd(w * 0.03), ground - rnd(1 * u), rnd(150 * u), C.void, 0.9, 1.1, 1);

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
  let nearMark = 0; // 近排三块碑的碑额浮雕按出现顺序轮换，不用数组下标（近排下标是 0/3/6，全同余）
  stones.forEach((s, i) => {
    const x = s.x + (i === 1 || i === 7 ? 1 : 0);
    const baseY = s.base;
    const topY = tombTop(g, x, baseY, s.w, s.h, s.top, u);
    // 碑体：排得越近越亮（近排 stoneLight / 中排 stone / 远排 stoneDark），靠明度做空气透视
    const body = s.base === near ? C.stoneLight : (s.base === midRow ? C.stone : C.stoneDark);
    fill(g, x, topY, s.w, s.h, body, s.a);
    fill(g, x + 1, topY + (s.top === 'cross' ? rnd(10 * u) : 0), Math.max(2, rnd(s.w * 0.45)), s.h - rnd(2 * u), C.stoneLight, 0.5 * s.a);
    fill(g, x + Math.max(2, rnd(s.w * 0.52)), topY, Math.max(2, rnd(s.w * 0.44)), s.h, C.stoneDark, 0.4);
    fill(g, x + s.w - 2, topY, 1, s.h, C.stoneDark, 0.9);
    // 月光投影：月在西侧（light 锚点），碑影一律向东（右）倒；越远的碑影越短，方向不许各走各的
    const depth = s.base === near ? 1 : (s.base === midRow ? 0.58 : 0.34);
    const sl = rnd(s.h * 0.45 * depth);
    fill(g, x, baseY, s.w + rnd(sl * 0.4), 1, C.void, 0.3);
    fill(g, x + rnd(sl * 0.35), baseY + 1, rnd(sl * 0.55), 1, C.void, 0.2);
    fill(g, x + rnd(sl * 0.75), baseY + 2, rnd(sl * 0.4), 1, C.void, 0.12);
    // 接触阴影 + 碑顶受光
    fill(g, x - 3, baseY + 1, s.w + 6, 2, C.void, 0.55);
    fill(g, x + 1, topY + (s.top === 'cross' ? rnd(9 * u) : 0), Math.max(2, s.w - 3), 1, C.stoneLight, 0.7 * s.a);
    // 碑座两级
    fill(g, x - 2, baseY - 2, s.w + 4, 2, C.stoneDark, s.a);
    fill(g, x - 4, baseY, s.w + 8, 2, C.stoneDark, 0.65);
    // 阴刻框：内凹面板 + 上沿受光，碑面不再是一块平色
    const iw = Math.max(3, s.w - 6), ix = x + 3;
    const iy = topY + (s.top === 'cross' ? rnd(12 * u) : rnd(5 * u));
    const ih = Math.max(3, rnd(s.h * (s.top === 'cross' ? 0.42 : 0.5)));
    fill(g, ix, iy, iw, ih, C.inkDark, 0.3 * s.a);
    fill(g, ix, iy, iw, 1, C.stoneLight, 0.28 * s.a);
    fill(g, ix, iy + ih - 1, iw, 1, C.stoneDark, 0.5 * s.a);
    // 冷月光只擦左棱一列，与右侧暖色烛光形成冷暖对比
    fill(g, x, topY, 1, s.h, C.runeCold, 0.1 * s.a);
    // 凿痕 2–3 条 + 1 处缺口
    for (let k = 0; k < 2 + (i % 2); k++) {
      fill(g, x + 2, topY + rnd(s.h * (0.32 + k * 0.2)), Math.max(3, s.w - 6), 1, C.groove, 0.55);
    }
    fill(g, x + s.w - 5, topY + rnd(s.h * 0.58), 2, 2, C.void, 0.9);
    if (i % 2 === 0) moss(g, { x: x - 2, y: baseY - 4, w: s.w + 5, h: 4, seed: 21 + i, color: C.mossTileLit, count: 4, alpha: 0.6 });
    // 近排三块碑的"可读"细节：墓志刻线 + 圆盘浮雕 + 顶部小尖饰 + 碑脚碎石与枯草
    if (s.base === near) {
      const capRise = s.top === 'cross' ? rnd(9 * u) : rnd(s.w / 2);
      // 顶部压顶石：碑头不再收在一条水平线上（原来是一根 1×4 的针，1x 下读作天线）
      const capX = x + rnd(s.w * 0.28);
      fill(g, capX, topY - capRise - Math.max(1, rnd(2 * u)), Math.max(5, rnd(s.w * 0.52)), Math.max(1, rnd(3 * u)), C.stone, 0.95);
      fill(g, capX, topY - capRise - Math.max(1, rnd(2 * u)), Math.max(5, rnd(s.w * 0.52)), 1, C.stoneLight, 0.4);
      // 三行墓志：碑面刻线，长度错落（1px，只在近排，远了读不出来也不必画）
      const lx = ix + 2, lw = Math.max(4, iw - 4);
      for (let k = 0; k < 3; k++) {
        fill(g, lx, iy + rnd(ih * 0.24) + k * Math.max(3, rnd(4 * u)), Math.max(4, rnd(lw * (0.86 - k * 0.14))), 1, C.bone, 0.42);
      }
      // 碑额浮雕按碑轮换：十字 / 斜刻菱形 / 小圆盘。三块碑共用同一个圆环会被读成
      // 「同一排展板上的圆窗」——碑的辨识恰恰来自它们不一样。
      const mx = x + rnd(s.w / 2), myy = iy + rnd(ih * 0.26);
      const mark = nearMark++ % 3;
      if (mark === 0) {
        fill(g, mx, myy - 2, 1, 5, C.bone, 0.5);
        fill(g, mx - 2, myy, 5, 1, C.bone, 0.5);
      } else if (mark === 1) {
        // 斜刻菱形：四边各 3 点，1x 下读作一颗刻进石面的菱形记号
        for (let k = 0; k <= 2; k++) {
          for (const sx of [-1, 1]) {
            for (const sy of [-1, 1]) fill(g, mx + sx * k, myy + sy * (2 - k), 1, 1, C.bone, 0.45);
          }
        }
      } else {
        ring(g, mx, myy, Math.max(2, rnd(2 * u)), C.bone, 0.34, 10);
      }
      // 碑脚碎石 + 枯草：碑与地之间不再是一条直缝
      rubble(g, { x: x - 3, y: baseY - 2, w: s.w + 7, h: 4, seed: 41 + i, color: C.stoneDark, color2: C.stone, count: 6, alpha: 0.85 });
      for (let k = -1; k <= 1; k++) {
        const ghh = Math.max(2, rnd((4 + Math.abs(k)) * u));
        fill(g, x + rnd(s.w * 0.55) + k * 3, baseY - ghh, 1, ghh, C.sage, 0.4);
      }
    }
  });

  // 碑间薄雾三条：横向 1–2px 亮带，只贴地面（雾贴地，不铺进碑体上方）
  for (const [my, mw, ma] of [[ground - rnd(11 * u), 0.34, 0.05], [ground - rnd(7 * u), 0.46, 0.07], [ground - rnd(3 * u), 0.28, 0.09]]) {
    fill(g, rnd(w * 0.21), my, rnd(w * mw), 2, C.fog, ma);
    fill(g, rnd(w * 0.27), my + 2, rnd(w * mw * 0.6), 1, C.fog, ma * 0.8);
  }

  // 大十字碑脚边的两支祭烛（暖色是整屏唯一的暖光源，也是辨识锚点）
  candle(g, { x: hx - rnd(17 * u), baseY: hy, h: rnd(9 * u), wax: C.bone, flame: C.arcaneLight, holder: C.brassDark });
  candle(g, { x: hx + rnd(15 * u), baseY: hy, h: rnd(7 * u), wax: C.bone, flame: C.arcane, holder: C.brassDark });
  disc(g, hx - rnd(17 * u), hy - rnd(11 * u), rnd(7 * u), C.arcane, 0.06);
  disc(g, hx + rnd(15 * u), hy - rnd(9 * u), rnd(6 * u), C.arcane, 0.05);

  // 远排再补四块矮碑（只露碑头），让碑群密度真正读得出来
  [[0.255, 10], [0.335, 9], [0.585, 11], [0.66, 8]].forEach(([rx, rw], i) => {
    const bx = rnd(w * rx), bwid = rnd(rw * u), bh = rnd((10 + (i % 2) * 4) * u);
    const by = far + rnd(2 * u);
    fill(g, bx, by - bh, bwid, bh, C.stoneDark, 0.85);
    fill(g, bx, by - bh, bwid, 1, C.stone, 0.5);
    fill(g, bx, by, bwid + 3, 1, C.void, 0.4);
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
  // 栅栏最左柱挂一盏铜灯：小而暖的点，与月亮的冷光对峙
  const lx = fx - rnd(5 * u), ly = fy + rnd(6 * u);
  fill(g, lx, ly - rnd(7 * u), 1, rnd(7 * u), C.brassDark, 0.9);
  fill(g, lx - 2, ly, rnd(5 * u), rnd(3 * u), C.brass, 0.95);
  fill(g, lx - 1, ly + rnd(3 * u), rnd(3 * u), 1, C.brassLight, 0.7);
  disc(g, lx, ly + rnd(1 * u), rnd(4 * u), C.arcane, 0.16);
  disc(g, lx, ly + rnd(1 * u), 1, C.arcaneLight, 0.8);
}

// 硬边枯枝：横向 1px 台阶拼，读起来是像素风的树枝，不是多边形
function limb(g, x0, y0, x1, y1, thick, color, alpha) {
  const steps = Math.max(2, Math.abs(rnd(x1 - x0)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    fill(g, rnd(x0 + (x1 - x0) * t), rnd(y0 + (y1 - y0) * t), 1, Math.max(1, rnd(thick * (1 - t * 0.7))), color, alpha);
  }
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

  // 上方垂下的枯枝：把空天幕切成「从墓园树后看过去」的框
  const topY = rnd(horizon * 0.06);
  limb(g, -6, rnd(topY + 12 * u), rnd(w * 0.2), topY, 4, C.void, 0.95);
  limb(g, -4, rnd(topY + 20 * u), rnd(w * 0.12), rnd(topY + 10 * u), 2, C.void, 0.9);
  limb(g, rnd(w * 0.16), topY + 1, rnd(w * 0.26), rnd(horizon * 0.2), 2, C.void, 0.9);
  limb(g, rnd(w * 0.07), rnd(topY + 8 * u), rnd(w * 0.1), rnd(horizon * 0.28), 1, C.void, 0.85);
  limb(g, rnd(w * 0.23), rnd(topY + 5 * u), rnd(w * 0.3), rnd(horizon * 0.22), 1, C.void, 0.8);
  limb(g, w + 6, rnd(horizon * 0.2), rnd(w * 0.84), rnd(horizon * 0.09), 2, C.void, 0.9);
  limb(g, rnd(w * 0.9), rnd(horizon * 0.11), rnd(w * 0.95), rnd(horizon * 0.24), 1, C.void, 0.8);
  // 两根垂丝（枯藤）
  fill(g, rnd(w * 0.12), rnd(horizon * 0.16), 1, rnd(horizon * 0.12), C.void, 0.7);
  fill(g, rnd(w * 0.88), rnd(horizon * 0.14), 1, rnd(horizon * 0.09), C.void, 0.7);

  // 压边：右下角斜倒的残碑（只露上沿，其余被碑座盖住）
  const bx = w - rnd(30 * u);
  fill(g, bx, ground - rnd(8 * u), rnd(28 * u), rnd(8 * u), C.void, 0.95);
  fill(g, bx, ground - rnd(8 * u), rnd(28 * u), 1, C.stoneLight, 0.35);

  // —— 近景一层：碑座前沿到画面下缘之间是一片空地（竖屏 138px，横屏露在碑座之上），
  // 只放站在地上的东西（草、倒掉的碑、碎石、贴地雾），地面本身归中景，这里一笔都不铺 ——
  const nearY = L.h - (L.tall ? 104 : 84);
  const NY = (n) => nearY - rnd(n * u);
  // 枯草三簇：近景的草比中景粗一档，叶子 2px 宽，读得出"就在镜头前"
  [0.09, 0.63, 0.87].forEach((tx, i) => {
    const x = rnd(w * tx), base = nearY - rnd(3 * u);
    for (let k = -3; k <= 3; k++) {
      const hh = rnd((7 + Math.abs(k) * 2) * u);
      fill(g, x + k * 2, base - hh, (Math.abs(k) % 2 === 0 ? 2 : 1), hh, C.sage, 0.4 - Math.abs(k) * 0.04);
    }
  });
  // 倒伏的石十字：碑身横躺 + 断掉的上臂斜插，是这一幕"这里真的荒了"的直接证据
  const fx = rnd(w * 0.3), fy = nearY - rnd(9 * u);
  fill(g, fx + rnd(2 * u), fy + rnd(3 * u), rnd(34 * u), rnd(3 * u), C.void, 0.55);
  fill(g, fx, fy, rnd(30 * u), rnd(4 * u), C.stone, 0.95);
  fill(g, fx, fy, rnd(30 * u), 1, C.stoneLight, 0.4);
  fill(g, fx + rnd(11 * u), fy - rnd(8 * u), rnd(4 * u), rnd(8 * u), C.stone, 0.95);
  fill(g, fx + rnd(11 * u), fy - rnd(8 * u), rnd(2 * u), rnd(5 * u), C.stoneLight, 0.24);
  fill(g, fx + rnd(26 * u), fy - rnd(2 * u), rnd(5 * u), rnd(2 * u), C.stoneDark, 1);
  // 斜插的残碑：四段错位叠出倾角（不能旋转，只能错位）
  const lx = rnd(w * 0.52), ly = nearY - rnd(2 * u);
  for (let k = 0; k < 4; k++) fill(g, lx + k, ly - rnd((24 - k * 6) * u), rnd(8 * u), rnd(7 * u), C.void, 0.92);
  fill(g, lx, ly - rnd(24 * u), rnd(3 * u), rnd(22 * u), C.stoneLight, 0.18);
  fill(g, lx + 1, ly - rnd(24 * u), rnd(8 * u), 1, C.stoneLight, 0.3);
  // 碎石与两条贴地雾：把近景与中景的地面接上，不留一条硬边
  rubble(g, { x: rnd(w * 0.42), y: NY(4), w: rnd(26 * u), h: rnd(4 * u), seed: 71, color: C.stoneDark, color2: C.stone, count: 5, alpha: 0.85 });
  fill(g, 0, NY(30), rnd(w * 0.54), 2, C.fog, 0.06);
  fill(g, rnd(w * 0.3), NY(16), rnd(w * 0.46), 1, C.fog, 0.05);
}
