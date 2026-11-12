// 第 III 幕「星陨王庭」——三层静态布景。
// 构图（横屏 480×270，地平线 124，碑座 186 起）：
//   远景 0–124：坍顶大厅。屋架塌了两片，破洞露出星野（三档星点 + 星纹环 + 流星划痕 + 斜插的断梁）；
//                三根巨柱（62/176/412）托着中央断开的檐口，断口正对星野；边墙收住左右，墙脚撒远处星尘。
//   中景 124–186：星纹地砖（三层同心椭圆 + 十字刻纹 + 放射缝）、王座（断角高背 + 星纹靠背 + 三级台阶）、
//                陨坑（三层压扁椭圆 + 嵌着三枚发光碎星 + 放射陨痕 + 坑沿碎石）、
//                倾倒立柱（左中三段鼓石）、悬浮碎星 5 块（三排纵深、远小近大）、近处断柱鼓石。
//   近景 150–186：左右下角压边晶簇 + 冷光雾带 + 地面散落碎星。
// 明度阶梯：星野 void < 后墙 starTileLit < 石构件 shardStone；幕色只出现在星野、光柱、受光棱与地面光池。
// 材质线全部依附实体：砖缝贴墙、凿痕贴王座石面、冷霜贴柱础与鼓石、晶体切面贴碎星、陨痕贴坑沿。
import {
  fill, bricks, column, ellipseRing, starfield, silhouette, cracks, moss, rubble,
} from '../diorama-kit.js';
import { C } from '../Palette.js';

// 归一化锚点：seal/gate 沿用占位文件的数值，一个都不动（事件层共用的契约点）。
// light 落在星野破洞正中，既是本幕唯一光源，也是光柱、星纹环与王座受光面的落点。
export const anchors = {
  seal: { x: 0.5, y: 0.42, r: 0.16 },
  gate: { x: 0.5, y: 0.58, r: 0.12 },
  light: { x: 0.5, y: 0.2296, r: 0.05 },
};

const R = Math.round;

// 后墙顶边：坍成 V 形破洞的轮廓（归一化 x, y），像素坐标在 back() 里展开。
const WALL_TOP = [
  [0.000, 0.352], [0.055, 0.386], [0.095, 0.424], [0.130, 0.452], [0.165, 0.496],
  [0.200, 0.538], [0.235, 0.572], [0.270, 0.616], [0.305, 0.656], [0.340, 0.688],
  [0.375, 0.718], [0.410, 0.742], [0.445, 0.760], [0.480, 0.780], [0.515, 0.790],
  [0.550, 0.780], [0.585, 0.752], [0.620, 0.716], [0.655, 0.680], [0.690, 0.640],
  [0.725, 0.596], [0.760, 0.550], [0.795, 0.504], [0.830, 0.460], [0.865, 0.424],
  [0.900, 0.404], [0.935, 0.384], [0.970, 0.366], [1.000, 0.352],
];

// 顶边在某处的归一化高度（线性插值；断齿与挂石都用它贴住墙沿）
function topAt(fx) {
  for (let i = 1; i < WALL_TOP.length; i++) {
    const [x1, y1] = WALL_TOP[i];
    if (fx <= x1) {
      const [x0, y0] = WALL_TOP[i - 1];
      const t = x1 === x0 ? 0 : (fx - x0) / (x1 - x0);
      return y0 + (y1 - y0) * t;
    }
  }
  return WALL_TOP[WALL_TOP.length - 1][1];
}

// 某高度处墙体的左右边界（破口处为空），砌石横缝要按它截断。
function wallSpan(fy) {
  const cross = (i0, i1) => {
    const [x0, y0] = WALL_TOP[i0], [x1, y1] = WALL_TOP[i1];
    const lo = Math.min(y0, y1), hi = Math.max(y0, y1);
    if (fy < lo || fy > hi || y1 === y0) return null;
    return x0 + (x1 - x0) * ((fy - y0) / (y1 - y0));
  };
  let left = null, right = null;
  for (let i = 1; i <= 14; i++) { const x = cross(i - 1, i); if (x !== null) left = x; }
  for (let i = 15; i < WALL_TOP.length; i++) { const x = cross(i - 1, i); if (x !== null) right = x; }
  return { left, right };
}

// 压扁椭圆：逐行整数矩形，硬边、无抗锯齿；地面圆纹/光池/陨坑底共用。
function flatEllipse(g, cx, cy, rx, ry, color, alpha = 1) {
  const CX = R(cx), CY = R(cy);
  const RX = Math.max(1, R(rx)), RY = Math.max(1, R(ry));
  for (let dy = -RY; dy <= RY; dy++) {
    const k = 1 - (dy * dy) / (RY * RY);
    const half = R(RX * Math.sqrt(Math.max(0, k)));
    if (half <= 0) continue;
    fill(g, CX - half, CY + dy, half * 2, 1, color, alpha);
  }
}

// 1px 硬边线段：坐标先取整，避免 Phaser 对小数坐标做亚像素抗锯齿。
function seg(g, x1, y1, x2, y2, color, alpha = 1) {
  g.lineStyle(1, color, alpha);
  g.lineBetween(R(x1), R(y1), R(x2), R(y2));
}

// 四角菱形（星纹交点、地面刻印、小碎星）
function diamond(g, cx, cy, r, color, alpha = 1) {
  const x = R(cx), y = R(cy), s = Math.max(1, R(r));
  silhouette(g, [
    { x, y: y - s }, { x: x + s, y }, { x, y: y + s }, { x: x - s, y },
  ], color, alpha);
}

// 星纹环的辐条刻度：固定角度表，只取整一次
function tick(g, cx, cy, r, index, count, color, alpha, len) {
  const a = (Math.PI * 2 * index) / count;
  seg(g, cx + Math.cos(a) * r, cy + Math.sin(a) * r,
    cx + Math.cos(a) * (r + len), cy + Math.sin(a) * (r + len), color, alpha);
}

// 悬浮碎星：六边晶体 + 左上受光切面 + 内核冷光。r 是半高，整块 2r 高。
function crystal(g, cx, cy, r, accent) {
  const x = R(cx), y = R(cy), s = Math.max(2, R(r));
  silhouette(g, [
    { x, y: y - s },
    { x: x + R(s * 0.6), y: y - R(s * 0.35) },
    { x: x + R(s * 0.85), y: y + R(s * 0.4) },
    { x, y: y + s },
    { x: x - R(s * 0.85), y: y + R(s * 0.4) },
    { x: x - R(s * 0.6), y: y - R(s * 0.35) },
  ], C.shardStone, 0.95);
  // 切面：左上棱受幕色，右上棱只给一档冷亮，右下保持石色（光源只有破洞一处）
  seg(g, x, y - s + 1, x - R(s * 0.55), y - R(s * 0.25), accent, 0.6);
  seg(g, x, y - s + 1, x + R(s * 0.5), y - R(s * 0.25), C.coldFlame, 0.34);
  seg(g, x - R(s * 0.5), y - R(s * 0.1), x + R(s * 0.45), y + R(s * 0.2), C.void, 0.55);
  // 内核与底部反光
  fill(g, x - 1, y - 1, 2, 2, C.coldFlameCore, 0.92);
  fill(g, x - 2, y, 5, 1, accent, 0.3);
}

// 近景压边晶簇：一枚主晶体 + 一枚伴生小晶体，左侧贴一道亮棱。下半截会被碑座切掉。
function shardOne(g, cx, baseY, h, w, accent) {
  const x = R(cx), b = R(baseY);
  const H = Math.max(9, R(h)), W = Math.max(4, R(w));
  const apex = { x: x - R(W * 0.2), y: b - H };
  const left = { x: x - W, y: b };
  const right = { x: x + W, y: b };
  const lmid = { x: x - R(W * 0.72), y: b - R(H * 0.3) };
  const shoulder = { x: x + R(W * 0.55), y: b - R(H * 0.56) };
  const rmid = { x: x + W, y: b - R(H * 0.14) };
  const foot = { x: x + R(W * 0.06), y: b };
  silhouette(g, [left, lmid, apex, shoulder, rmid, right], C.void, 0.98);
  // 受光面（左片）与背光面（右片）之间夹一条亮棱，晶体才不是「山」
  silhouette(g, [left, lmid, apex, foot], C.shardStone, 1);
  silhouette(g, [foot, apex, shoulder, rmid, right], C.starTile, 0.98);
  silhouette(g, [left, apex, { x: x - R(W * 0.58), y: b - R(H * 0.34) }], C.stoneLight, 0.4);
  seg(g, apex.x, apex.y, foot.x, foot.y, accent, 0.55);
  seg(g, apex.x, apex.y, shoulder.x, shoulder.y, C.coldFlame, 0.3);
  fill(g, apex.x - 1, apex.y - 1, 2, 2, C.coldFlameCore, 0.75);
  fill(g, x + R(W * 0.75), b - R(H * 0.75), 2, 2, C.shardStone, 0.95);
  fill(g, x + R(W * 0.75), b - R(H * 0.75), 1, 1, accent, 0.5);
}

function facetShard(g, cx, baseY, h, w, accent) {
  shardOne(g, cx, baseY, h, w, accent);
  shardOne(g, cx + R(w * 1.05), baseY + 2, R(h * 0.52), R(w * 0.6), accent);
}

export function back(g, L) {
  const { w, horizon: hz, accent } = L;
  const light = L.anchors.light;
  const u = L.tall ? 1.25 : 1;

  // 1) 天幕与星野：先铺满深空，星点会被后面的墙体压掉一部分，正好形成「破洞」。
  fill(g, 0, 0, w, hz, C.void, 1);
  starfield(g, {
    x: 8, y: 4, w: w - 16, h: R(hz * 0.72), seed: 47, count: 78,
    color: C.bone, bright: C.white, accent, alpha: 1,
  });
  // 破洞里再补一小簇密集星点，把视线锁在正中（固定坐标，不用随机）
  for (let i = 0; i < 16; i++) {
    const x = R(w * 0.40) + ((i * 29) % 100) - 20;
    const y = 10 + ((i * 17) % 46);
    fill(g, x, y, i % 4 === 0 ? 2 : 1, 1, i % 3 === 0 ? C.white : C.bone, i % 2 === 0 ? 0.9 : 0.55);
  }
  // 四枚定位亮星：十字芒，给破洞一个能一眼抓住的重心
  for (const [fx, fy] of [[0.20, 0.24], [0.76, 0.18], [0.62, 0.43], [0.31, 0.52]]) {
    const x = R(w * fx), y = R(hz * fy);
    fill(g, x - 3, y, 7, 1, accent, 0.24);
    fill(g, x, y - 3, 1, 7, accent, 0.24);
    fill(g, x, y, 1, 1, C.coldFlameCore, 1);
    fill(g, x - 1, y - 1, 3, 3, accent, 0.14);
  }
  // 两条流星划痕：斜向、带 2×2 亮头，只出现在破洞里（不落到墙上）
  for (const [ax, ay, bx, by] of [[0.63, 0.08, 0.72, 0.30], [0.29, 0.07, 0.22, 0.26]]) {
    seg(g, w * ax, hz * ay, w * bx, hz * by, accent, 0.22);
    fill(g, R(w * bx) - 1, R(hz * by) - 1, 2, 2, C.coldFlame, 0.8);
  }
  // 三块还在坠落的碎星（悬在破洞里，越靠上越小）
  crystal(g, R(w * 0.455), R(hz * 0.30), 2, accent);
  crystal(g, R(w * 0.545), R(hz * 0.52), 3, accent);
  crystal(g, R(w * 0.505), R(hz * 0.16), 2, accent);

  // 2) 后墙：顶边坍成 V 形断口；墙体比天幕亮一档，剪影才立得住。
  const wallTop = WALL_TOP.map(([fx, fy]) => ({ x: R(w * fx), y: R(hz * fy) }));
  silhouette(g, [{ x: 0, y: hz }, ...wallTop, { x: w, y: hz }], C.starTileLit, 1);
  // 断口受光：外沿一档冷亮、内侧 2px 暗边、再往下一档幕色余晖
  g.lineStyle(1, C.stoneLight, 0.5);
  g.strokePoints(wallTop, false);
  g.lineStyle(1, C.coldFlame, 0.3);
  g.strokePoints(wallTop.map(p => ({ x: p.x, y: p.y - 1 })), false);
  g.lineStyle(1, C.void, 0.4);
  g.strokePoints(wallTop.map(p => ({ x: p.x, y: p.y + 2 })), false);
  // 断口上翘的碎砖齿：贴住墙沿往天空里戳，破口不会像一条平滑抛物線
  for (const [fx, len] of [[0.295, 6], [0.325, 9], [0.355, 4], [0.455, 7], [0.615, 5], [0.645, 8]]) {
    const x = R(w * fx), y = R(hz * topAt(fx));
    fill(g, x, y - len, 3, len, C.starTileLit, 1);
    fill(g, x, y - len, 3, 1, C.stoneLight, 0.45);
  }
  // 砌石：只铺在断口谷底以下，避免砖缝跑到天上
  const brickTop = R(hz * 0.78);
  bricks(g, {
    x: 0, y: brickTop, w, h: hz - brickTop,
    rowH: L.tall ? 10 : 7, segW: L.tall ? 26 : 22,
    color: C.starTileLit, alpha: 1, face: C.starTile, faceAlpha: 0.5,
    dark: C.void, seed: 37, density: 0.5, shade: 0.22,
  });
  // 砌石线：横缝按墙高截断（破口处留空），竖缝从破口边缘垂到墙脚——材质线必须贴住墙
  for (const fy of [0.44, 0.50, 0.57, 0.64, 0.71, 0.78, 0.86, 0.94]) {
    const y = R(hz * fy);
    const { left, right } = wallSpan(fy);
    if (left === null) {
      fill(g, 0, y, w, 1, C.void, 0.2);
    } else {
      if (R(w * left) > 2) fill(g, 0, y, R(w * left), 1, C.void, 0.24);
      if (R(w * right) < w - 2) fill(g, R(w * right), y, w - R(w * right), 1, C.void, 0.24);
    }
  }
  for (let i = 1; i < 13; i++) {
    const fx = i / 13;
    const y0 = R(hz * topAt(fx)) + 3;
    if (y0 < hz - 3) fill(g, R(w * fx), y0, 1, hz - y0, C.void, 0.13);
  }
  // 墙身束带：一条压在墙面上的石带，把大块墙面横着断开（材质贴墙，不悬空）
  {
    const fyBand = 0.70;
    const yBand = R(hz * fyBand);
    const bandH = Math.max(2, R(3 * u));
    const sp = wallSpan(fyBand);
    const spans = sp.left === null
      ? [[0, w]]
      : [[0, R(w * sp.left)], [R(w * sp.right), w - R(w * sp.right)]];
    for (const [x0, len] of spans) {
      if (len < 6) continue;
      fill(g, x0, yBand, len, bandH, C.shardStone, 1);
      fill(g, x0, yBand, len, 1, C.stoneLight, 0.5);
      fill(g, x0, yBand + bandH - 1, len, 1, C.void, 0.6);
      // 带上的分块缝，同样贴住石带
      for (let k = 1; k < 5; k++) {
        const jx = x0 + R((len * k) / 5);
        if (jx - x0 > 3 && x0 + len - jx > 3) fill(g, jx, yBand, 1, bandH, C.stoneDark, 0.7);
      }
    }
  }
  // 墙脚压暗 + 两处陨痕（顺着墙面往下走，依附石面）
  fill(g, 0, hz - 3, w, 3, C.void, 0.5);
  for (const path of [
    [[0.24, 0.66], [0.255, 0.74], [0.245, 0.82], [0.27, 0.9], [0.262, 0.99]],
    [[0.70, 0.62], [0.685, 0.72], [0.70, 0.8], [0.688, 0.9], [0.695, 0.98]],
  ]) {
    const pts = path.map(([fx, fy]) => ({ x: R(w * fx), y: R(hz * fy) }));
    for (let i = 1; i < pts.length; i++) seg(g, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, C.void, 0.45);
  }
  // 墙脚碎石 5 点
  for (let i = 0; i < 5; i++) fill(g, R(w * (0.08 + i * 0.19)), hz - 4 - (i % 3), 2 + (i % 2), 1, C.starTileDark, 0.9);

  // 3) 两侧边墙：把破洞框成「室内」，砖缝横向错开
  const sideW = R(w * 0.055);
  fill(g, 0, 0, sideW, hz, C.starTileDark, 0.97);
  fill(g, w - sideW, 0, sideW, hz, C.starTileDark, 0.97);
  fill(g, sideW - 1, 0, 1, hz, C.stoneDark, 0.85);
  fill(g, w - sideW, 0, 1, hz, C.stoneDark, 0.85);
  for (let i = 0; i < 4; i++) {
    fill(g, 0, R(hz * (0.18 + i * 0.2)), sideW, 1, C.void, 0.4);
    fill(g, w - sideW, R(hz * (0.24 + i * 0.2)), sideW, 1, C.void, 0.4);
  }
  // 边墙内侧的一点幕色反光（贴墙内侧，不整片染色）
  fill(g, sideW, R(hz * 0.34), 1, R(hz * 0.52), accent, 0.1);
  fill(g, w - sideW - 1, R(hz * 0.34), 1, R(hz * 0.52), accent, 0.1);

  // 4) 上缘残檐：两片塌下来的屋顶压在左右上角，破洞夹在中间
  const slabs = [
    [[0, 0], [0.20, 0], [0.185, 0.14], [0.15, 0.30], [0.095, 0.26], [0, 0.34]],
    [[1, 0], [0.80, 0], [0.815, 0.14], [0.85, 0.30], [0.905, 0.26], [1, 0.34]],
  ];
  for (const slab of slabs) {
    const pts = slab.map(([fx, fy]) => ({ x: R(w * fx), y: R(hz * fy) }));
    silhouette(g, pts, C.nightDeep, 1);
    // 上沿受星光的一档亮边 + 下沿暗边
    g.lineStyle(1, C.stoneDark, 0.85);
    g.strokePoints(pts.slice(0, 4), false);
    g.lineStyle(1, C.void, 0.8);
    g.strokePoints(pts.slice(2), false);
    // 檐底瓦缝/石肋：三条短缝，贴住残檐
    for (let i = 0; i < 3; i++) {
      const y = pts[2].y + i * R(hz * 0.035);
      seg(g, pts[3].x - 4, y, pts[3].x + R(w * 0.11), y + R(hz * 0.02), C.stoneDark, 0.4);
    }
    // 内侧椽条：从断面向外发散，说明这是「屋顶的内面」
    for (let i = 0; i < 3; i++) {
      const tx = i === 0 ? 0.02 : 0.06 + i * 0.05;
      seg(g, pts[2].x, pts[2].y, R(w * (pts[2].x > w / 2 ? 1 - tx : tx)), 0, C.stoneDark, 0.5);
    }
    // 断面：内端一小块受光石口
    fill(g, pts[2].x - 2, pts[2].y - 1, 4, 5, C.starTile, 1);
    fill(g, pts[2].x - 2, pts[2].y - 1, 4, 1, C.stoneLight, 0.5);
  }
  // 斜插进破洞的塌落屋架大梁：一道明确的斜线，远看就知道是「塌了的屋顶」
  const rafter = [
    [0.035, 0.02], [0.115, 0.055], [0.245, 0.255], [0.225, 0.335], [0.105, 0.135], [0.02, 0.10],
  ].map(([fx, fy]) => ({ x: R(w * fx), y: R(hz * fy) }));
  silhouette(g, rafter, C.nightDeep, 1);
  g.lineStyle(1, C.stoneDark, 0.7);
  g.strokePoints(rafter.slice(1, 4), false);
  // 断口（朝破洞的一端）有一小块新鲜亮面
  fill(g, rafter[2].x - 2, rafter[2].y - 2, 4, 4, C.starTile, 1);
  fill(g, rafter[2].x - 2, rafter[2].y - 2, 4, 1, C.stoneLight, 0.45);
  // 梁上挂着的两块残石
  fill(g, rafter[2].x - 8, rafter[2].y + 4, 3, 6, C.starTileLit, 1);
  fill(g, rafter[2].x - 8, rafter[2].y + 4, 3, 1, C.stoneLight, 0.4);
  fill(g, rafter[2].x - 16, rafter[2].y + 2, 2, 4, C.starTileLit, 1);

  // 5) 破洞光柱：三束硬边竖光，只落在中轴附近
  const shaftTop = R(hz * 0.42) + Math.max(8, R(12 * u));
  fill(g, R(w * 0.435), shaftTop, R(w * 0.075), hz - shaftTop, accent, 0.045);
  fill(g, R(w * 0.487), shaftTop, R(w * 0.045), hz - shaftTop, accent, 0.06);
  fill(g, R(w * 0.60), shaftTop, R(w * 0.05), hz - shaftTop, accent, 0.032);
  // 光柱里往下飘的星尘
  for (let i = 0; i < 12; i++) {
    fill(g, R(w * 0.46) + ((i * 13) % 40), shaftTop + 4 + ((i * 19) % (hz - shaftTop - 8)), 1, i % 4 === 0 ? 2 : 1, accent, 0.35);
  }

  // 6) 星纹环：破洞正中的定位环，光源点就是锚点 light
  const ringR = R(26 * u);
  ellipseRing(g, light.x, light.y, ringR, ringR, accent, 0.5, 28);
  ellipseRing(g, light.x, light.y, R(ringR * 0.62), R(ringR * 0.62), accent, 0.26, 24);
  for (let i = 0; i < 12; i++) tick(g, light.x, light.y, ringR, i, 12, C.coldFlame, 0.55, R(4 * u));
  // 八向放射（斜向四条短光），强化「星纹」而不是普通圆环
  for (let i = 0; i < 4; i++) {
    const a = (Math.PI * 2 * i) / 4 + Math.PI / 4;
    seg(g, light.x + Math.cos(a) * (ringR + 2), light.y + Math.sin(a) * (ringR + 2),
      light.x + Math.cos(a) * (ringR + R(9 * u)), light.y + Math.sin(a) * (ringR + R(9 * u)), accent, 0.3);
  }
  for (let i = 0; i < 3; i++) {
    const a = (Math.PI * 2 * i) / 3 - Math.PI / 2;
    diamond(g, light.x + Math.cos(a) * R(ringR * 0.7), light.y + Math.sin(a) * R(ringR * 0.7), 3, accent, 0.5);
  }
  diamond(g, light.x, light.y, R(4 * u), C.coldFlameCore, 0.5);
  fill(g, light.x - 1, light.y - 1, 2, 2, C.coldFlameCore, 0.95);
  // 环下三条幕色细芒（破洞光源的指向感，只用 1px 线）
  for (let i = 0; i < 3; i++) {
    fill(g, light.x - R(20 * u) + i * R(14 * u), light.y + R(38 * u), R(8 * u), 1, accent, 0.25);
  }

  // 7) 断裂檐口：左右两段，中央 206–286 是塌掉的断口，端头做阶梯断齿
  const cornY = R(hz * 0.42);
  const cornH = Math.max(10, R(14 * u));
  const leftEnd = R(w * 0.43);
  const rightStart = R(w * 0.595);
  const rows = 3;
  const rowH = Math.max(3, R(cornH / rows));
  for (let i = 0; i < rows; i++) {
    const y = cornY + i * rowH;
    const hh = i === rows - 1 ? Math.max(2, cornH - i * rowH) : rowH;
    fill(g, 0, y, leftEnd - (rows - 1 - i) * R(5 * u), hh, C.shardStone, 1);
    fill(g, rightStart + (rows - 1 - i) * R(5 * u), y, w - rightStart - (rows - 1 - i) * R(5 * u), hh, C.shardStone, 1);
  }
  // 檐口上沿受光、下沿压暗（构件要有上下两面）
  fill(g, 0, cornY, leftEnd - R(10 * u), 1, C.stoneLight, 0.6);
  fill(g, rightStart + R(10 * u), cornY, w - rightStart - R(10 * u), 1, C.stoneLight, 0.6);
  fill(g, 0, cornY + cornH - 1, leftEnd, 1, C.void, 0.65);
  fill(g, rightStart, cornY + cornH - 1, w - rightStart, 1, C.void, 0.65);
  // 檐下齿饰（dents），只贴左右两段
  for (let i = 0; i < 7; i++) {
    fill(g, R(leftEnd * (0.10 + i * 0.115)), cornY + cornH - 4, 3, 3, C.starTileDark, 0.85);
    fill(g, rightStart + R((w - rightStart) * (0.10 + i * 0.115)), cornY + cornH - 4, 3, 3, C.starTileDark, 0.85);
  }
  // 石缝：竖向 4 条 + 断口两侧的断面亮口
  for (let i = 0; i < 4; i++) {
    fill(g, R(leftEnd * (0.16 + i * 0.22)), cornY + 1, 1, cornH - 2, C.stoneDark, 0.6);
    fill(g, rightStart + R((w - rightStart) * (0.16 + i * 0.22)), cornY + 1, 1, cornH - 2, C.stoneDark, 0.6);
  }
  fill(g, leftEnd - R(3 * u), cornY, R(3 * u), cornH, C.stoneLight, 0.35);
  fill(g, rightStart, cornY, R(3 * u), cornH, C.stoneLight, 0.3);
  // 断口下悬着的一块残石
  fill(g, leftEnd - R(13 * u), cornY + cornH, R(13 * u), R(7 * u), C.shardStone, 1);
  fill(g, leftEnd - R(13 * u), cornY + cornH, R(13 * u), 1, C.stoneLight, 0.4);
  fill(g, leftEnd - R(13 * u), cornY + cornH + R(7 * u) - 1, R(13 * u), 1, C.void, 0.55);

  // 8) 三根巨柱：柱身压在墙上、柱头托檐口，柱础结冷霜
  const colTop = cornY + cornH;
  const colW = Math.max(16, R(22 * u));
  for (const [fx, seed] of [[0.13, 3], [0.367, 5], [0.858, 7]]) {
    const cx = R(w * fx);
    // 柱后一圈暗边，把柱身从墙上剥出来
    fill(g, cx - R(colW * 0.9), colTop - 2, R(colW * 1.8), hz - colTop + 2, C.void, 0.35);
    column(g, {
      cx, topY: colTop, bottomY: hz, w: colW,
      shaft: C.shardStone, light: C.stoneLight, dark: C.void,
      capH: Math.max(4, R(5 * u)), baseH: Math.max(5, R(7 * u)), flutes: 4,
    });
    // 柱头压顶石
    fill(g, cx - R(colW * 0.78), colTop, R(colW * 1.56), Math.max(4, R(5 * u)), C.starTileDark, 1);
    fill(g, cx - R(colW * 0.78), colTop, R(colW * 1.56), 1, C.stoneLight, 0.5);
    // 朝光一侧的 1px 幕色受光棱（光源在 240 附近）
    const inner = cx < light.x ? cx + R(colW / 2) - 1 : cx - R(colW / 2);
    fill(g, inner, colTop + 2, 1, hz - colTop - 2, accent, 0.14);
    // 柱础：加宽一层 + 接触阴影，避免柱子「浮」在地平线上
    fill(g, cx - R(colW * 0.95), hz - 3, R(colW * 1.9), 3, C.starTileDark, 0.95);
    fill(g, cx - R(colW * 0.95), hz - 3, R(colW * 1.9), 1, C.stoneDark, 0.7);
    // 柱础冷霜（贴石基，不是全屏撒点）
    moss(g, {
      x: cx - R(colW * 0.7), y: hz - Math.max(7, R(9 * u)),
      w: R(colW * 1.4), h: Math.max(4, R(6 * u)),
      seed, color: C.runeDim, count: 7, alpha: 0.45,
    });
  }

  // 9) 远处星尘：中轴光柱与墙脚之间，越远越淡
  for (let i = 0; i < 18; i++) {
    const x = R(w * (0.08 + ((i * 53) % 84) / 100));
    const y = hz - R(6 + ((i * 37) % 34) * u);
    const s = i % 5 === 0 ? 2 : 1;
    fill(g, x, y, s, 1, i % 3 === 0 ? accent : C.runeDim, i % 4 === 0 ? 0.5 : 0.26);
  }
}

export function mid(g, L) {
  const { w, horizon: hz, accent } = L;
  const u = L.tall ? 1.5 : 1;
  const uw = L.tall ? 1.2 : 1;
  const ground = L.h - (L.tall ? 104 : 84);
  const fh = ground - hz;
  const at = (f) => hz + R(fh * f);
  const throneX = R(w * 0.5208);

  // 1) 地面：先铺整片，再压石缝与星纹——地面只属于中景
  fill(g, 0, hz, w, L.h - hz, C.starTileDark, 1);
  fill(g, 0, hz, w, 1, C.runeDim, 0.2);
  // 地砖排：越靠近平视线的排越薄、越近的排越厚（固定公式，非随机）；
  // 行高逐排放大，横屏约 5 排、竖屏约 10 排，靠 alpha 与行高一起做纵深。
  const rowH0 = Math.max(7, R(11 * u));
  let bandY = hz, bandI = 0;
  while (bandY < ground - 2 && bandI < 14) {
    const rh = Math.max(4, R(rowH0 * (1 + bandI * 0.2)));
    const rowH = Math.min(rh, ground - bandY);
    const y = bandY;
    // 远排更暗、近排更亮：没有渐变，用逐排 alpha 递减做纵深
    fill(g, 0, y, w, rowH, C.starTile, Math.max(0.05, 0.26 - bandI * 0.02));
    // 近排石缝更黑更粗：同样的 1px，靠 alpha 拉开与远排的差别
    fill(g, 0, y, w, 1, C.groove, Math.min(0.46, 0.3 + bandI * 0.03));
    fill(g, 0, y + 1, w, 1, C.ink, Math.min(0.72, 0.44 + bandI * 0.04));
    const off = bandI % 2 === 0 ? 0 : R(w / 10);
    for (let c = -1; c < 6; c++) fill(g, off + c * R(w / 5), y, 1, rowH, C.groove, Math.min(0.34, 0.2 + bandI * 0.03));
    bandY += rh;
    bandI++;
  }
  // 地砖十字刻纹 12 处（贴砖心，不悬空）
  for (let i = 0; i < 12; i++) {
    const tx = R(w * (0.06 + (i % 6) * 0.165));
    const ty = hz + R(fh * (0.18 + Math.floor(i / 6) * 0.42));
    fill(g, tx - 3, ty, 7, 1, C.runeDim, 0.22);
    fill(g, tx, ty - 3, 1, 7, C.runeDim, 0.22);
    fill(g, tx, ty, 1, 1, C.stone, 0.55);
  }
  // 地面椭圆的压扁比必须恒定（0.11），否则竖屏会被拉成一圈「蜘蛛网」
  const flat = 0.11;
  const rug = (cx, cy, rx, a) => flatEllipse(g, cx, cy, R(rx), Math.max(2, R(rx * flat)), accent, a);
  // 破洞投下的光毯：只落在中轴（幕色只出现在光里）
  rug(throneX, at(0.62), w * 0.20, 0.03);
  rug(throneX, at(0.74), w * 0.15, 0.032);
  // 破洞的光柱落到王座：逐段变宽，光从破洞斜下来、在王座脚下摊开
  const beamBot = at(0.86);
  const beamSegs = 5;
  for (let i = 0; i < beamSegs; i++) {
    const y0 = hz + R(((beamBot - hz) * i) / beamSegs);
    const hSeg = R((beamBot - hz) / beamSegs) + 1;
    const halfW = R((11 + i * 2.4) * uw);
    fill(g, throneX - halfW, y0, halfW * 2, hSeg, accent, i < 2 ? 0.045 : 0.032);
    fill(g, throneX - R(halfW * 0.45), y0, R(halfW * 0.9), hSeg, accent, 0.028);
  }
  for (const ey of [0.3, 0.5, 0.7]) rug(throneX, at(ey), 22 * uw, 0.05);

  // 2) 星纹嵌地：三层同心椭圆 + 八向放射缝 + 四向菱形 + 中心星
  const ix = R(w * 0.5), iy = at(0.60);
  const ringSizes = [0.40, 0.30, 0.20].map((f) => [R(w * f), Math.max(4, R(w * f * flat))]);
  for (const [rx, ry] of ringSizes) {
    ellipseRing(g, ix, iy, rx, ry, C.stoneDark, 0.9, 30);
    ellipseRing(g, ix, iy, Math.max(6, rx - 2), Math.max(3, ry - 1), C.runeDim, 0.2, 30);
  }
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * 2 * i) / 8;
    seg(g, ix + Math.cos(a) * 18, iy + Math.sin(a) * 6,
      ix + Math.cos(a) * ringSizes[0][0], iy + Math.sin(a) * ringSizes[0][1], C.runeDim, 0.22);
  }
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    diamond(g, ix + dx * ringSizes[1][0], iy + dy * ringSizes[1][1], 3, C.runeDim, 0.4);
  }
  diamond(g, ix, iy, R(9 * u), C.runeDim, 0.45);
  diamond(g, ix, iy, R(5 * u), C.starTileLit, 0.9);
  fill(g, ix - 2, iy - 2, 4, 4, accent, 0.28);

  // 3) 王座：三级台阶 → 座面 → 断角高背 → 星纹靠背
  const baseY = at(0.86);
  const sh = Math.max(5, R(6 * u));
  const seatW = R(34 * uw);
  const seatH = Math.max(9, R(13 * u));
  const seatY = baseY - 3 * sh - seatH;
  const seatX = throneX - R(seatW / 2);
  const backW = R(40 * uw);
  const bx0 = throneX - R(backW / 2);
  const backH = R(44 * u);
  const backTop = seatY - backH;
  // 背光：靠背后面一圈极淡的幕色晕，把剪影从墙上剥出来
  fill(g, bx0 - 7, backTop - 6, backW + 14, backH + 10, accent, 0.05);
  // 靠背：左上高、右上断掉一角（整块加两级台阶，像素风不做斜切）
  fill(g, bx0, backTop, R(22 * uw), seatY - backTop, C.starTile, 1);
  fill(g, bx0, backTop + R(9 * u), R(31 * uw), seatY - backTop - R(9 * u), C.starTile, 1);
  fill(g, bx0, backTop + R(18 * u), backW, seatY - backTop - R(18 * u), C.starTile, 1);
  // 内嵌靠背板 + 受光棱
  fill(g, bx0 + R(6 * uw), backTop + R(16 * u), R(26 * uw), seatY - backTop - R(26 * u), C.starTileLit, 0.95);
  fill(g, bx0, backTop, 1, seatY - backTop, C.coldFlame, 0.55);
  fill(g, bx0, backTop, R(22 * uw), 1, C.stoneLight, 0.5);
  fill(g, bx0 + R(31 * uw), backTop + R(9 * u), 1, R(9 * u), C.stoneLight, 0.3);
  // 靠背凿痕 3 条（贴石面）
  for (let k = 0; k < 3; k++) fill(g, bx0 + R(7 * uw), backTop + R(20 * u) + k * R(5 * u), R(20 * uw), 1, C.groove, 0.35);
  // 断口缺口 + 一条斜凿裂
  fill(g, bx0 + R(31 * uw), backTop + R(9 * u), 2, 5, C.void, 0.85);
  seg(g, bx0 + R(31 * uw), backTop + R(13 * u), bx0 + R(36 * uw), backTop + R(22 * u), C.void, 0.6);
  // 靠背星纹
  const emY = backTop + R(26 * u);
  diamond(g, throneX, emY, R(7 * uw), C.runeDim, 0.6);
  diamond(g, throneX, emY, R(4 * uw), C.starTileLit, 0.9);
  diamond(g, throneX, emY, 2, accent, 0.5);
  fill(g, throneX - 1, emY - 1, 2, 2, C.coldFlameCore, 0.9);
  for (const [dx, dy] of [[0, -10], [10, 0], [0, 10], [-10, 0]]) {
    fill(g, throneX + dx, emY + dy, 1, 1, C.runeDim, 0.55);
  }
  // 座面（正面压暗 + 上沿受光，座面才不是一块平板）
  fill(g, seatX, seatY, seatW, seatH, C.starTileLit, 1);
  fill(g, seatX, seatY, seatW, 1, C.stoneLight, 0.75);
  fill(g, seatX, seatY + seatH - 3, seatW, 3, C.starTileDark, 0.95);
  fill(g, seatX, seatY + 3, 1, seatH - 5, C.stoneDark, 0.6);
  for (let k = 0; k < 2; k++) fill(g, seatX + R(4 * uw), seatY + R(5 * u) + k * R(3 * u), seatW - R(8 * uw), 1, C.groove, 0.42);
  // 扶手：左侧完整、右侧塌半截；扶手段比座面宽出一截，剪影更像「座」
  fill(g, seatX - R(9 * uw), seatY - R(4 * u), R(13 * uw), R(5 * u), C.starTile, 1);
  fill(g, seatX - R(9 * uw), seatY - R(4 * u), R(13 * uw), 1, C.stoneLight, 0.5);
  fill(g, seatX - R(7 * uw), seatY + R(1 * u), 3, seatH, C.starTileDark, 1);
  fill(g, seatX + seatW - R(4 * uw), seatY - R(4 * u), R(12 * uw), R(5 * u), C.starTile, 1);
  fill(g, seatX + seatW - R(4 * uw), seatY - R(4 * u), R(12 * uw), 1, C.stoneLight, 0.45);
  fill(g, seatX + seatW - R(5 * uw), seatY + R(1 * u), 3, R(6 * u), C.starTileDark, 1);
  // 三级台阶：后窄前宽、踏面受光、踢面压暗
  for (let i = 0; i < 3; i++) {
    const sw = R((42 + i * 14) * uw);
    const y = seatY + seatH + i * sh;
    fill(g, throneX - R(sw / 2), y, sw, sh, i % 2 === 0 ? C.shardStone : C.stoneDark, 1);
    fill(g, throneX - R(sw / 2), y, sw, 1, C.stoneLight, 0.5);
    fill(g, throneX - R(sw / 2), y + sh - 1, sw, 1, C.void, 0.55);
  }
  // 台阶缺口（一块被砸掉）
  fill(g, throneX + R(12 * uw), baseY - R(10 * u), 3, 2, C.void, 0.8);
  // 王座压地阴影 + 阶前碎石
  fill(g, throneX - R(38 * uw), baseY, R(76 * uw), 3, C.void, 0.42);
  fill(g, throneX - R(46 * uw), baseY + 1, R(9 * uw), 2, C.starTileDark, 0.75);
  fill(g, throneX + R(37 * uw), baseY + 1, R(8 * uw), 2, C.starTileDark, 0.75);
  // 阶座冷霜（贴基座）
  moss(g, {
    x: throneX - R(34 * uw), y: baseY - 3, w: R(68 * uw), h: 4,
    seed: 91, color: C.runeDim, count: 8, alpha: 0.42,
  });

  // 4) 陨坑：右侧地面。三层压扁椭圆 + 发光碎星 + 放射陨痕 + 坑沿碎石
  const cx = R(w * 0.775);
  const cy = at(0.72);
  const crx = R(46 * uw);
  const cry = Math.max(7, R(14 * u));
  flatEllipse(g, cx, cy + 2, crx + 7, cry + 3, C.void, 0.38);
  ellipseRing(g, cx, cy, crx + 4, cry + 3, C.stone, 0.85, 30);
  ellipseRing(g, cx, cy - 1, crx + 3, cry + 2, C.stoneLight, 0.4, 30);
  flatEllipse(g, cx, cy, crx, cry, C.starTileDark, 0.97);
  flatEllipse(g, cx, cy, R(crx * 0.72), R(cry * 0.72), C.starTile, 1);
  ellipseRing(g, cx, cy, R(crx * 0.55), R(cry * 0.55), C.runeDim, 0.45, 26);
  flatEllipse(g, cx, cy + 1, R(crx * 0.3), Math.max(3, R(cry * 0.34)), accent, 0.2);
  // 坑底碎星：三枚嵌在土里，只露上半（被坑沿压住一半）
  crystal(g, cx - R(14 * uw), cy + 1, 4, accent);
  crystal(g, cx + R(4 * uw), cy - 3, 3, accent);
  crystal(g, cx + R(17 * uw), cy + 3, 5, accent);
  // 坑沿碎石 + 向外辐射的陨痕
  rubble(g, { x: cx - crx - 8, y: cy - 4, w: 26, h: 10, seed: 61, color: C.starTileLit, color2: C.shardStone, count: 12, alpha: 0.8 });
  rubble(g, { x: cx + crx - 16, y: cy - 2, w: 26, h: 12, seed: 67, color: C.starTile, color2: C.shardStone, count: 12, alpha: 0.8 });
  cracks(g, { x: cx - R(crx * 0.6), y: cy + cry - 2, len: 20, seed: 71, color: C.void, alpha: 0.7, branches: 1, drift: 3 });
  cracks(g, { x: cx + R(crx * 0.5), y: cy + cry, len: 14, seed: 73, color: C.void, alpha: 0.65, branches: 1, drift: 3 });
  // 坑沿受光的一段（朝破洞的一侧）
  ellipseRing(g, cx - 1, cy - 2, R(crx * 0.62), R(cry * 0.62), C.stoneLight, 0.28, 22);

  // 5) 倾倒立柱：左中横躺的三段鼓石 + 断口 + 倒下的柱头
  const toX = R(w * 0.045);
  const toY = at(0.80);
  const drumW = R(38 * uw);
  const drumH = Math.max(14, R(19 * u));
  // 接触阴影：贴地压扁椭圆，柱子才落在地面上
  flatEllipse(g, toX + R(62 * uw), toY, R(76 * uw), Math.max(3, R(5 * u)), C.void, 0.42);
  for (let i = 0; i < 3; i++) {
    const dx = toX + i * R(drumW * 0.92);
    const dy = toY - i * R(2 * u);
    fill(g, dx, dy - drumH, drumW, drumH, i === 1 ? C.starTile : C.shardStone, 0.98);
    // 圆柱的体积感：上三分之一受光、下三分之一压暗
    fill(g, dx, dy - drumH, drumW, Math.max(2, R(drumH * 0.22)), C.stoneLight, 0.34);
    fill(g, dx, dy - Math.max(3, R(drumH * 0.3)), drumW, Math.max(3, R(drumH * 0.3)), C.void, 0.4);
    fill(g, dx, dy - drumH, 2, drumH, C.stoneDark, 0.75);
    fill(g, dx + drumW - 2, dy - drumH, 2, drumH, C.void, 0.65);
    fill(g, dx, dy - 1, drumW, 1, C.void, 0.6);
    // 鼓石接缝 + 石面凿痕 2 条
    fill(g, dx + drumW - 1, dy - drumH, 1, drumH, C.void, 0.65);
    fill(g, dx + drumW, dy - drumH + 2, 1, drumH - 4, C.stoneLight, 0.3);
    for (let k = 1; k <= 2; k++) fill(g, dx + 3, dy - drumH + R((drumH * k) / 3), drumW - 8, 1, C.stoneDark, 0.45);
  }
  // 柱端面：一块完整的圆盘，横躺的圆柱才读得出来
  const endY = toY - R(drumH / 2);
  const endRx = R(7 * uw);
  flatEllipse(g, toX, endY, endRx, Math.max(4, R(drumH / 2)), C.stoneLight, 0.92);
  ellipseRing(g, toX, endY, endRx, Math.max(4, R(drumH / 2)), C.stoneDark, 0.9, 16);
  ellipseRing(g, toX, endY, R(endRx * 0.62), Math.max(3, R(drumH / 2) - 4), C.stoneDark, 0.6, 14);
  flatEllipse(g, toX, endY, R(endRx * 0.45), Math.max(2, R(drumH / 2) - 5), C.void, 0.5);
  fill(g, toX - endRx, endY - 1, 2, 2, C.coldFlame, 0.45);
  fill(g, toX - 2, toY, R(120 * uw), 3, C.void, 0.4);
  // 倒下的柱头（一块方石 + 凿痕 + 断边）
  fill(g, toX + R(112 * uw), toY - R(23 * u), R(22 * uw), R(12 * u), C.shardStone, 1);
  fill(g, toX + R(112 * uw), toY - R(23 * u), R(22 * uw), 1, C.stoneLight, 0.45);
  fill(g, toX + R(112 * uw), toY - R(12 * u), R(22 * uw), 1, C.void, 0.5);
  for (let k = 0; k < 2; k++) fill(g, toX + R(115 * uw), toY - R(20 * u) + k * R(3 * u), R(16 * uw), 1, C.groove, 0.42);
  // 断口冷霜 + 碎块
  moss(g, { x: toX, y: toY - 5, w: R(44 * uw), h: 4, seed: 97, color: C.runeDim, count: 6, alpha: 0.4 });
  fill(g, toX + R(60 * uw), toY + 2, 5, 3, C.starTileDark, 0.9);

  // 6) 近处断柱鼓石（右缘，压到碑座边）：远/中/近三排基座 y 各不同
  const ndX = R(w * 0.9);
  const ndY = at(0.97);
  const ndW = R(48 * uw);
  const ndH = Math.max(18, R(27 * u));
  fill(g, ndX, ndY - ndH, ndW, ndH, C.starTile, 1);
  fill(g, ndX, ndY - ndH, ndW, 1, C.stoneLight, 0.5);
  fill(g, ndX, ndY - ndH, 2, ndH, C.stoneDark, 0.65);
  fill(g, ndX + ndW - 2, ndY - ndH, 2, ndH, C.void, 0.6);
  fill(g, ndX, ndY - 2, ndW, 2, C.void, 0.55);
  // 断口：顶面缺三块，左侧受光棱（光源在左）
  fill(g, ndX + R(4 * uw), ndY - ndH - 2, R(12 * uw), 2, C.starTileDark, 0.95);
  fill(g, ndX + R(20 * uw), ndY - ndH - 4, R(10 * uw), 4, C.starTileDark, 0.95);
  fill(g, ndX + R(34 * uw), ndY - ndH - 1, R(8 * uw), 1, C.void, 0.7);
  fill(g, ndX, ndY - ndH + 1, 1, ndH - 4, accent, 0.16);
  for (let k = 0; k < 2; k++) fill(g, ndX + R(13 * uw) + k * R(13 * uw), ndY - ndH + 3, 1, ndH - 7, C.void, 0.55);
  // 石面凿痕（贴石面）
  for (let k = 0; k < 2; k++) fill(g, ndX + R(6 * uw), ndY - R(16 * u) + k * R(5 * u), R(26 * uw), 1, C.stoneDark, 0.55);
  moss(g, { x: ndX, y: ndY - 4, w: ndW, h: 4, seed: 99, color: C.runeDim, count: 6, alpha: 0.42 });

  // 7) 远处断柱残块（贴地平线的第三排）
  const fdX = R(w * 0.06);
  fill(g, fdX, hz + 1, R(26 * uw), Math.max(6, R(8 * u)), C.starTileDark, 0.96);
  fill(g, fdX, hz + 1, R(26 * uw), 1, C.stoneDark, 0.7);
  fill(g, fdX + R(9 * uw), hz + 3, 1, Math.max(4, R(6 * u)), C.void, 0.6);
  fill(g, fdX - 3, hz + 5, 4, 2, C.starTile, 0.9);

  // 8) 悬浮碎星：三排纵深（远排贴地平线、中排居中、近排大且压到台阶边）
  const shards = [
    { x: 0.34, y: hz - R(24 * u), r: 4 },
    { x: 0.62, y: hz + R(8 * u), r: 5 },
    { x: 0.44, y: hz + R(22 * u), r: 6 },
    { x: 0.735, y: at(0.42), r: 8 },
    { x: 0.90, y: at(0.74), r: 10 },
  ];
  for (const s of shards) crystal(g, R(w * s.x), s.y, R(s.r * u), accent);

  // 9) 光柱落地：王座前的地面光池（幕色只在光里）
  flatEllipse(g, throneX, at(0.9), R(w * 0.11), Math.max(4, R(7 * u)), accent, 0.09);
  flatEllipse(g, throneX, at(0.9), R(w * 0.06), Math.max(3, R(5 * u)), accent, 0.07);
  flatEllipse(g, throneX, baseY + 2, R(30 * uw), Math.max(3, R(4 * u)), accent, 0.08);
  // 光池里才有的浮尘
  for (let i = 0; i < 8; i++) {
    fill(g, throneX - R(26 * u) + i * R(7 * u), at(0.74) - (i % 3) * R(4 * u), 1, 1, accent, 0.32);
  }

  // 9b) 两处小陨击痕：坑形 + 放射裂 + 溅起的晶屑
  for (const [sx, fy, seed] of [[0.205, 0.90, 41], [0.665, 0.99, 43]]) {
    const mx = R(w * sx), my = at(fy);
    flatEllipse(g, mx, my, R(13 * uw), Math.max(3, R(4 * u)), C.starTileDark, 0.95);
    ellipseRing(g, mx, my, R(13 * uw), Math.max(3, R(4 * u)), C.stoneDark, 0.8, 16);
    fill(g, mx - 2, my - 1, 4, 2, accent, 0.3);
    rubble(g, { x: mx - 16, y: my - 3, w: 32, h: 6, seed, color: C.starTile, color2: C.shardStone, count: 7, alpha: 0.7 });
    cracks(g, { x: mx, y: my + 2, len: 12, seed, color: C.void, alpha: 0.5, branches: 1, drift: 3 });
  }

  // 10) 零散碎石：王座左侧、坑沿外围、倒柱旁边
  rubble(g, { x: throneX - R(74 * uw), y: at(0.9), w: 40, h: 8, seed: 83, color: C.starTile, color2: C.shardStone, count: 12, alpha: 0.75 });
  rubble(g, { x: toX + R(96 * uw), y: toY + 1, w: 34, h: 7, seed: 87, color: C.starTileDark, color2: C.shardStone, count: 9, alpha: 0.65 });

  // 11) 碑座前的近处地面：几块翘起的断砖 + 两条塌陷缝，避免近景地面是一条空白带
  for (const [fx, fw, fy, shh] of [
    [0.055, 0.14, 0.87, 5], [0.275, 0.10, 0.93, 4], [0.625, 0.13, 0.89, 5],
    [0.845, 0.11, 0.94, 4], [0.70, 0.08, 0.97, 3],
  ]) {
    const sx = R(w * fx), sy = at(fy), sW = R(w * fw);
    fill(g, sx, sy, sW, shh, C.starTile, 0.85);
    fill(g, sx, sy, sW, 1, C.stoneLight, 0.45);
    fill(g, sx, sy + shh - 1, sW, 1, C.void, 0.6);
    fill(g, sx, sy, 1, shh, C.void, 0.45);
    fill(g, sx + sW - 1, sy, 1, shh, C.void, 0.45);
  }
  cracks(g, { x: R(w * 0.115), y: at(0.84), len: 16, seed: 89, color: C.void, alpha: 0.55, branches: 1, drift: 4 });
  cracks(g, { x: R(w * 0.60), y: at(0.86), len: 14, seed: 91, color: C.void, alpha: 0.5, branches: 1, drift: 3 });
}

export function fore(g, L) {
  const { w } = L;
  const accent = L.accent;
  const u = L.tall ? 1.5 : 1;
  const ground = L.h - (L.tall ? 104 : 84);

  // 近景只放压边物件：左右下角的碎星晶簇 + 冷光雾。地面在中景，这里绝不整片铺地。
  facetShard(g, R(w * 0.042), ground + 8, R(54 * u), R(19 * u), accent);
  facetShard(g, R(w * 0.098), ground + 5, R(36 * u), R(13 * u), accent);
  facetShard(g, R(w * 0.135), ground + 9, R(21 * u), R(8 * u), C.runeDim);
  facetShard(g, R(w * 0.058), ground + 11, R(14 * u), R(6 * u), C.runeDim);
  facetShard(g, R(w * 0.928), ground + 6, R(48 * u), R(17 * u), accent);
  facetShard(g, R(w * 0.972), ground + 9, R(30 * u), R(11 * u), C.runeDim);
  facetShard(g, R(w * 0.885), ground + 11, R(16 * u), R(6 * u), C.runeDim);

  // 冷光雾：三条通栏低透明带 + 两缕漂浮，只压画面下缘，把晶簇的脚埋进雾里
  fill(g, 0, ground - 11, w, 3, accent, 0.09);
  fill(g, 0, ground - 8, w, 2, C.stoneLight, 0.09);
  fill(g, 0, ground - 6, w, 3, accent, 0.06);
  // 雾不是一条直线：上缘用长短不一的碎块打散
  for (const [px, pw, dy, a] of [
    [0.06, 0.18, 13, 0.05], [0.27, 0.12, 14, 0.04], [0.46, 0.2, 13, 0.045],
    [0.68, 0.14, 15, 0.04], [0.84, 0.14, 13, 0.05],
  ]) {
    fill(g, R(w * px), ground - dy, R(w * pw), 2, accent, a);
  }
  for (const [px, pw, dy, a] of [[0.2, 0.28, 9, 0.07], [0.56, 0.24, 7, 0.06], [0.74, 0.2, 10, 0.05]]) {
    fill(g, R(w * px), ground - dy, R(w * pw), 2, C.mute, a);
  }
  // 用几段暗斑压住雾的上沿，避免出现一条水平硬边
  for (const [px, pw, dy] of [[0.10, 0.22, 14], [0.42, 0.2, 15], [0.70, 0.24, 14]]) {
    fill(g, R(w * px), ground - dy - 1, R(w * pw), 2, C.void, 0.22);
  }

  // 地面散落的碎星 4 枚（压边但不挡王座）
  for (const [fx, r] of [[0.30, 3], [0.36, 2], [0.68, 3], [0.62, 2]]) {
    diamond(g, R(w * fx), ground - 3, R(r * u), C.shardStone, 0.95);
    fill(g, R(w * fx), ground - 4, 1, 1, accent, 0.5);
  }
}
