// 第 VI 幕「熔星锻炉」——三层静态布景。
// 构图（横屏 480×270，地平线 135，碑座 186 起）：
//   远景 0–135：错缝砖炉墙 + 拱背热光 + 圆拱炉膛（煤床 + 三层火焰多边形 + 白热芯 + 火星）
//                + 梯形砖烟道（顶部收口）+ 煤烟 + 悬挂铁链与吊钩（含吊着的坩埚）
//                + 挂具墙 + 皮褶风箱与送风管
//   中景 135–186：先铺炉前石地面（暖棕底色 / 石板带 / 错缝 / 炉前暖光池），再让铁砧（加热工件
//                 + 倚靠的铁锤）、淬火水槽（水面反光 + 蒸汽）、模具架、三排煤堆、倚砧的剑胚、
//                 铁屑与火星站上去
//   近景 135–186：左右粗吊链（竖环 / 横环交替）+ 吊钩压边 + 左下煤堆压角 + 贴地火光雾
// 材质线全部依附实体：砖缝贴炉墙与烟道、锈贴铁链 / 铁砧 / 风箱箍、煤烟贴炉口上沿、
// 水光贴淬火水面、铁屑贴石地面；热色只落在炉膛、砧上工件与剑胚（硬边分层，不做渐变）。
import {
  fill, bricks, ashlar, roundArch, beam, cracks, rubble, water, chain, silhouette,
} from '../diorama-kit.js';
import { C } from '../Palette.js';

// 归一化锚点：seal / gate 是导演层既有契约（原值不动）；light=炉芯、lord=铁砧、
// nail=砧前地面。全部落在碑座上沿之上（y ≤ 0.68），否则会被铭文带盖住。
export const anchors = {
  seal: { x: 0.5, y: 0.42, r: 0.16 },
  gate: { x: 0.5, y: 0.58, r: 0.12 },
  light: { x: 0.4292, y: 0.4444, r: 0.03 },
  lord: { x: 0.5375, y: 0.5185, r: 0.05 },
  nail: { x: 0.5375, y: 0.6815, r: 0.02 },
};

const rnd = (n) => Math.round(n);
const groundOf = (L) => Math.min(rnd(L.anchors.nail.y), L.h - (L.tall ? 104 : 84));

// 火舌：每束是一条带尖的剪影多边形，三层同构缩叠（幕色 → arcane → 亮芯）。
// 只做硬边分层，不做渐变；层与层之间留出底色让火舌读得出前后。
function flame(g, cx, baseY, w, h, accent) {
  const tongues = [[0, 1, 0.44], [-0.3, 0.72, 0.3], [0.3, 0.62, 0.28], [-0.47, 0.4, 0.17], [0.47, 0.34, 0.15]];
  const layers = [[accent, 1, 1], [C.arcane, 0.96, 0.56], [C.arcaneLight, 1, 0.26]];
  for (const [color, la, lf] of layers) {
    for (const [ox, oh, ow] of tongues) {
      const tw = Math.max(2, rnd(w * ow * lf));
      const th = Math.max(4, rnd(h * oh * lf));
      const tx = rnd(cx + w * ox);
      silhouette(g, [
        { x: tx - rnd(tw * 0.5), y: baseY },
        { x: tx - rnd(tw * 0.34), y: baseY - rnd(th * 0.52) },
        { x: tx - rnd(tw * 0.14), y: baseY - rnd(th * 0.86) },
        { x: tx, y: baseY - th },
        { x: tx + rnd(tw * 0.2), y: baseY - rnd(th * 0.76) },
        { x: tx + rnd(tw * 0.38), y: baseY - rnd(th * 0.44) },
        { x: tx + rnd(tw * 0.5), y: baseY },
      ], color, la);
    }
  }
}

// 拱背热光：沿炉口拱券外侧描几段亮弧——只照受光面，不整片染色
function archGlow(g, cx, baseY, w, h, color, alpha, segs) {
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const a = Math.PI * (i / segs);
    pts.push({ x: rnd(cx - Math.cos(a) * w / 2), y: rnd(baseY - Math.sin(a) * h) });
  }
  g.lineStyle(1, color, alpha);
  g.strokePoints(pts, false);
}

// 梯形砖烟道：逐层收窄，一层一条横缝 + 错开的竖砖缝 + 两侧斜边明暗；顶部一道收口压边
function hood(g, cx, w0, w1, base, rows, u) {
  const bh = base / rows;
  for (let i = 0; i < rows; i++) {
    const t = rows > 1 ? i / (rows - 1) : 0;
    const bw = rnd(w0 + (w1 - w0) * t);
    const y = rnd(i * bh);
    const hh = Math.max(2, rnd(bh) + 1);
    const bx = cx - rnd(bw / 2);
    fill(g, bx, y, bw, hh, C.mauve, 0.92);
    fill(g, bx, y, bw, 1, C.void, 0.34);
    if (i % 2 === 0) fill(g, bx, y + 1, bw, 1, C.tan, 0.07);
    fill(g, bx, y, 1, hh, C.tan, 0.2);
    fill(g, bx + bw - 1, y, 1, hh, C.ink, 0.85);
    const n = Math.max(3, rnd(bw / (22 * u)));
    for (let k = 1; k < n; k++) fill(g, bx + rnd((bw * k) / n), y, 1, hh, C.void, 0.32);
  }
  fill(g, cx - rnd(w1 / 2) + rnd(6 * u), 0, rnd(w1) - rnd(12 * u), rnd(4 * u), C.void, 0.5);
}

// 吊钩：钩颈 + 横臂 + 上翘钩尖，锈点贴在钩颈上
function hook(g, x, y, u, rust) {
  const hw = rnd(8 * u);
  fill(g, x, y, 2, rnd(5 * u), C.outline, 1);
  fill(g, x, y + rnd(5 * u), hw, 2, C.outline, 1);
  fill(g, x + hw - 3, y + rnd(2 * u), 2, rnd(4 * u), C.outline, 1);
  fill(g, x + 1, y + rnd(5 * u), hw - 2, 1, C.stoneLight, 0.35);
  if (rust) fill(g, x, y + 1, 2, 1, C.brassDark, 0.8);
}

// 铁砧：黑铁本体 + 只有受光面提亮（台面顶沿/朝火一侧）+ 朝炉口的牛角 + 细腰 + 宽底座；
// 砧面压一块加热到发亮的工件。铁件的形靠剪影读，亮面只给 1–2 档。
function anvil(g, cx, baseY, u, accent) {
  const faceW = rnd(36 * u);
  const faceH = rnd(9 * u);
  const faceY = baseY - rnd(32 * u);
  const left = cx - rnd(faceW / 2);
  const waistY = faceY + faceH;
  const underY = baseY - rnd(8 * u);
  const waistH = Math.max(6, underY - waistY);
  const waistW = rnd(13 * u);
  const baseW = rnd(24 * u);
  const baseH = Math.max(5, baseY - underY);

  // 接触阴影：砧脚落地的一圈暗
  fill(g, cx - rnd(26 * u), baseY + 1, rnd(52 * u), rnd(3 * u), C.void, 0.55);
  fill(g, cx - rnd(18 * u), baseY - 1, rnd(36 * u), 1, C.void, 0.8);

  // 墨线外轮廓：整具砧先放大 2px 描一圈暗边，暗铁才不会陷进暗地面（剪影优先）
  fill(g, left - 2, faceY - 2, faceW + 4, faceH + 4, C.ink, 1);
  fill(g, cx - rnd(waistW / 2) - 2, waistY, waistW + 4, waistH + 2, C.ink, 1);
  fill(g, cx - rnd(baseW / 2) - 2, underY - 2, baseW + 4, baseH + 2, C.ink, 1);
  fill(g, left - rnd(18 * u), faceY, rnd(19 * u), rnd(8 * u), C.ink, 1);
  fill(g, left + faceW, faceY, rnd(9 * u), rnd(8 * u), C.ink, 1);

  // 砧脚：比方墩窄得多、只占最后 8 行——砧的「三条横线」比例靠它收口
  fill(g, cx - rnd(12 * u), underY, rnd(24 * u), rnd(8 * u), C.ink, 1);
  fill(g, cx - rnd(12 * u), underY, rnd(24 * u), rnd(8 * u), C.stoneDark, 0.55);
  fill(g, cx - rnd(12 * u), underY, rnd(24 * u), 1, C.fog, 0.3);
  fill(g, cx - rnd(12 * u), underY, 1, rnd(8 * u), C.tan, 0.3);
  fill(g, cx + rnd(10 * u), underY, rnd(2 * u), rnd(8 * u), C.void, 0.85);

  // 砧肩：台面正下方的斜肩，把台面和细腰接起来（砧形的关键转折）
  fill(g, cx - rnd(10 * u), waistY, rnd(20 * u), rnd(4 * u), C.ink, 1);
  fill(g, cx - rnd(10 * u), waistY, rnd(20 * u), rnd(4 * u), C.stoneDark, 0.55);
  fill(g, cx - rnd(10 * u), waistY, rnd(20 * u), 1, C.fog, 0.3);
  fill(g, cx + rnd(8 * u), waistY, rnd(2 * u), rnd(4 * u), C.void, 0.85);

  // 细腰：比方墩窄得多，左棱吃炉火，右棱全暗
  const nk = Math.max(6, rnd(waistH * 0.42));                 // 腰最细的一段高度
  fill(g, cx - rnd(8 * u), waistY, rnd(16 * u), waistH, C.ink, 1);
  fill(g, cx - rnd(8 * u), waistY, rnd(16 * u), waistH, C.stoneDark, 0.55);
  // 中间再收一刀（凹腰）：右亮左暗，砧的「收腰」靠这两笔读
  fill(g, cx - rnd(8 * u), waistY, rnd(3 * u), waistH, C.void, 0.9);
  fill(g, cx + rnd(5 * u), waistY, rnd(3 * u), waistH, C.void, 0.9);
  fill(g, cx - rnd(5 * u), waistY + nk, rnd(11 * u), Math.max(2, waistH - nk), C.stoneDark, 0.55);
  fill(g, cx - rnd(5 * u), waistY + nk, 1, Math.max(2, waistH - nk), C.tan, 0.35);
  fill(g, cx - rnd(8 * u), waistY, 1, waistH, C.tan, 0.3);

  // 台面：铁本体吃火光（暖灰），顶沿 4px 最亮，朝火一侧受光
  fill(g, left, faceY, faceW, faceH, C.ink, 1);
  fill(g, left, faceY, faceW, faceH, C.stoneDark, 0.55);
  fill(g, left, faceY, faceW, rnd(2 * u), C.fog, 0.55);
  fill(g, left, faceY, faceW, 1, C.tan, 0.42);
  fill(g, left, faceY + faceH - rnd(3 * u), faceW, rnd(3 * u), C.void, 0.5);
  fill(g, left, faceY, 1, faceH, C.tan, 0.3);
  fill(g, left + 1, faceY + 1, 1, Math.max(1, faceH - 2), C.stoneLight, 0.28);
  fill(g, left + faceW - rnd(2 * u), faceY, rnd(2 * u), faceH, C.void, 0.9);

  // 侧面两条磨亮的铁光（材质贴铁面）
  for (const k of [0.2, 0.56]) {
    fill(g, left + rnd(faceW * k), faceY + rnd(4 * u), rnd(7 * u), 1, C.tan, 0.32);
  }

  // 砧尾（heel）：右端台面下挂一个钝方尾，和牛角一起框出台面长度
  fill(g, left + faceW, faceY + rnd(1 * u), rnd(5 * u), rnd(6 * u), C.ink, 1);
  fill(g, left + faceW, faceY + rnd(1 * u), rnd(5 * u), rnd(6 * u), C.stoneDark, 0.55);
  fill(g, left + faceW, faceY + rnd(1 * u), rnd(5 * u), 1, C.fog, 0.5);
  fill(g, left + faceW + rnd(3 * u), faceY + rnd(1 * u), rnd(2 * u), rnd(6 * u), C.ink, 0.9);

  // 牛角（horn）：台面左端朝炉口三级收尖，顶沿一条受火光
  // 牛角：上沿与台面齐平、下沿一级级上扬，收成一只朝炉口的尖喙（不是往下掉的台阶）
  fill(g, left - rnd(5 * u), faceY + 1, rnd(5 * u), faceH, C.ink, 1);
  fill(g, left - rnd(10 * u), faceY + 1, rnd(5 * u), Math.max(3, faceH - 2), C.ink, 1);
  fill(g, left - rnd(15 * u), faceY + 1, rnd(5 * u), Math.max(2, faceH - 4), C.ink, 1);
  fill(g, left - rnd(20 * u), faceY + 1, rnd(5 * u), Math.max(2, faceH - 6), C.ink, 1);
  fill(g, left - rnd(20 * u), faceY + 1, rnd(20 * u), faceH, C.stoneDark, 0.55);
  fill(g, left - rnd(20 * u), faceY + 1, rnd(20 * u), 1, C.fog, 0.62);
  // 砧面上的两个孔：方孔（hardy）+ 圆孔，铁砧的身份细节
  fill(g, left + rnd(7 * u), faceY + 2, 3, 2, C.void, 0.9);
  fill(g, left + rnd(24 * u), faceY + 2, 2, 2, C.void, 0.8);

  // 锈斑贴铁面
  for (const [rx, ry] of [[0.3, 0.62], [0.66, 0.3], [0.46, 0.8]]) {
    fill(g, left + rnd(faceW * rx), faceY + rnd(faceH * ry), 3, 1, C.brassDark, 0.6);
  }

  // 砧上工件：四层热色硬边（幕色 → arcane → arcaneLight → 白芯）+ 上方两档热光
  const wy = faceY - rnd(4 * u);
  fill(g, cx - rnd(15 * u), wy, rnd(30 * u), rnd(5 * u), accent, 1);
  fill(g, cx - rnd(12 * u), wy + 1, rnd(24 * u), rnd(3 * u), C.arcane, 1);
  fill(g, cx - rnd(7 * u), wy + 1, rnd(14 * u), rnd(2 * u), C.arcaneLight, 1);
  fill(g, cx - rnd(3 * u), wy + 1, rnd(6 * u), 1, C.white, 0.95);
  fill(g, cx - rnd(20 * u), wy - rnd(7 * u), rnd(40 * u), rnd(7 * u), accent, 0.07);
  fill(g, cx - rnd(13 * u), wy - rnd(3 * u), rnd(26 * u), rnd(3 * u), accent, 0.12);
}

// 铁锤：斜靠在砧座右侧——头落在石板上、柄朝右上斜起；柄用 7 段硬边阶梯代替逐像素线
function hammer(g, x, baseY, u) {
  const headW = rnd(13 * u);
  const headH = rnd(7 * u);
  const hy = baseY - headH;
  const step = rnd(3 * u);
  for (let i = 0; i < 7; i++) {
    fill(g, x + rnd(9 * u) + i * step, hy - (i + 1) * step, step + 1, rnd(3 * u), i % 2 ? C.mauve : C.tan, 0.95);
  }
  fill(g, x, hy, headW, headH, C.outline, 1);
  fill(g, x, hy, headW, rnd(2 * u), C.stoneLight, 0.5);
  fill(g, x, hy + headH - 1, headW, 1, C.ink, 0.95);
  fill(g, x - rnd(3 * u), hy + rnd(2 * u), rnd(3 * u), Math.max(1, headH - rnd(3 * u)), C.tan, 0.35);
  fill(g, x + headW - rnd(3 * u), hy + rnd(1 * u), rnd(3 * u), Math.max(1, headH - rnd(2 * u)), C.brassDark, 0.6);
}

// 半成品剑胚：斜靠在砧座右侧的三段硬边，根段尚凉、剑尖最亮（热色跟着离开炉膛的距离走）
function blade(g, x, baseY, u, accent) {
  const seg = rnd(8 * u);
  for (let i = 0; i < 3; i++) {
    const bx = x + i * seg;
    const by = baseY - rnd(3 * u) - i * rnd(5 * u);
    fill(g, bx, by - rnd(3 * u), seg + 1, rnd(3 * u), i === 0 ? C.bloodDark : accent, 0.95);
    fill(g, bx, by - rnd(3 * u), seg + 1, 1, i === 2 ? C.arcaneLight : C.arcane, 0.85);
  }
}

// 淬火水槽：木槽（暗木，靠水面反光辨认）+ 两道铁箍 + 水面幕色反光 + 三缕蒸汽
function trough(g, x, w, baseY, u, accent) {
  const h = rnd(14 * u);
  const topY = baseY - h;
  // 槽腿
  fill(g, x + rnd(w * 0.12), baseY, rnd(4 * u), rnd(4 * u), C.outline, 1);
  fill(g, x + rnd(w * 0.78), baseY, rnd(4 * u), rnd(4 * u), C.outline, 1);
  fill(g, x - rnd(2 * u), baseY, w + rnd(4 * u), rnd(2 * u), C.void, 0.5);
  // 槽体：暗木 + 铁口沿（口沿只在朝火的那半边受光）
  fill(g, x, topY, w, h, C.stoneDark, 1);
  fill(g, x, topY, w, h, C.mauve, 0.45);
  fill(g, x, topY, rnd(w * 0.55), rnd(2 * u), C.stoneLight, 0.45);
  fill(g, x, topY + rnd(2 * u), w, 1, C.void, 0.85);
  fill(g, x, baseY - rnd(2 * u), w, rnd(2 * u), C.ink, 0.9);
  // 水面：反光条走幕色（材质依附水面，不整片染色）
  water(g, {
    x: x + 1, y: topY + rnd(3 * u), w: w - 2, h: Math.max(4, h - rnd(5 * u)),
    base: C.ink, glint: accent, seed: 653, alpha: 1, rows: 4, ripples: 8,
  });
  // 水面反光：三道幕色横光贴着水面（不落到槽壁上）
  for (let i = 0; i < 3; i++) {
    fill(g, x + rnd(w * 0.08) + i * rnd(w * 0.24), topY + rnd(2 * u) + i * rnd(2 * u), rnd(w * 0.16), 1, accent, 0.32);
  }
  fill(g, x + rnd(w * 0.18), topY + rnd(3 * u), rnd(w * 0.3), 1, C.arcaneLight, 0.7);
  // 半沉在水里的工件：露出水面的热色横条 + 水面上一块最亮的水花
  const qx = x + rnd(w * 0.58);
  fill(g, qx, topY + rnd(2 * u), rnd(11 * u), rnd(3 * u), accent, 0.95);
  fill(g, qx, topY + rnd(2 * u), rnd(11 * u), 1, C.arcaneLight, 0.9);
  fill(g, qx + rnd(2 * u), topY + rnd(4 * u), rnd(8 * u), 1, C.white, 0.55);
  // 两道铁箍 + 箍上锈点
  for (const k of [0.14, 0.86]) {
    const bx = x + rnd(w * k);
    fill(g, bx, topY, rnd(3 * u), h, C.outline, 1);
    fill(g, bx, topY, 1, h, C.tan, 0.3);
    fill(g, bx, topY + rnd(h * 0.5), rnd(3 * u), 1, C.brassDark, 0.8);
  }
  // 蒸汽：三缕，从水面上抬起（雾贴水面）
  for (const [sx, sh] of [[0.24, 14], [0.5, 22], [0.74, 11]]) {
    fill(g, x + rnd(w * sx), topY - rnd(sh * u), rnd(4 * u), rnd(sh * u), C.fog, 0.16);
    fill(g, x + rnd(w * sx) + rnd(2 * u), topY - rnd((sh + 6) * u), rnd(3 * u), rnd(6 * u), C.fog, 0.12);
  }
  // 刚淬上去那缕蒸汽最浓，正对热件（雾贴水面，越靠水面越实）
  fill(g, qx + rnd(3 * u), topY - rnd(26 * u), rnd(5 * u), rnd(26 * u), C.fog, 0.2);
  fill(g, qx + rnd(6 * u), topY - rnd(34 * u), rnd(4 * u), rnd(9 * u), C.fog, 0.13);
}

// 模具架：两根木柱 + 两层横板 + 五个铸铁模具（其中一个浇口还红着）
function moldRack(g, x, w, baseY, u, accent) {
  const topY = baseY - rnd(34 * u);
  const span = baseY - topY;
  fill(g, x - rnd(3 * u), baseY, w + rnd(6 * u), rnd(2 * u), C.void, 0.45);
  const postW = rnd(4 * u);
  for (const px of [x, x + w - postW]) {
    fill(g, px, topY, postW, span, C.outline, 1);
    fill(g, px, topY, 1, span, C.tan, 0.35);
    fill(g, px + postW - 1, topY, 1, span, C.ink, 0.9);
  }
  for (const k of [0, 1]) {
    const sy = topY + rnd(span * (k ? 0.52 : 0.02)) + rnd(5 * u);
    beam(g, { x: x - rnd(3 * u), y: sy, w: w + rnd(6 * u), h: rnd(4 * u), color: C.outline, light: C.tan, alpha: 0.95, bolts: false });
  }
  const molds = [[0.05, 0, 1], [0.42, 0, 0], [0.72, 0, 0], [0.16, 1, 0], [0.56, 1, 0]];
  for (const [mx, row, hot] of molds) {
    const bx = x + rnd(w * mx);
    const by = topY + rnd(span * (row ? 0.52 : 0.02)) + rnd(5 * u) - rnd(9 * u);
    const bw = rnd(11 * u);
    const bh = rnd(7 * u);
    fill(g, bx, by, bw, bh, C.outline, 1);
    fill(g, bx, by, bw, 1, C.stoneLight, 0.35);
    if (hot) {
      fill(g, bx + 2, by + 2, bw - 3, 2, accent, 0.9);
      fill(g, bx + 3, by + 2, bw - 5, 1, C.arcaneLight, 0.9);
    } else {
      fill(g, bx + 2, by + 2, bw - 4, 1, C.brassDark, 0.42);
    }
  }
}

// 煤堆：三角剪影 + 背光面 + 碎煤 + 顶上余烬（三排纵深靠 baseY 与尺寸拉开）
function coalPile(g, x, baseY, w, h, seed, u, accent) {
  silhouette(g, [
    { x, y: baseY },
    { x: x + rnd(w * 0.2), y: baseY - rnd(h * 0.72) },
    { x: x + rnd(w * 0.5), y: baseY - h },
    { x: x + rnd(w * 0.8), y: baseY - rnd(h * 0.6) },
    { x: x + w, y: baseY },
  ], C.void, 1);
  fill(g, x + rnd(w * 0.08), baseY - rnd(h * 0.5), rnd(w * 0.5), rnd(h * 0.5), C.ink, 1);
  fill(g, x + rnd(w * 0.6), baseY - rnd(h * 0.42), rnd(w * 0.34), rnd(h * 0.42), C.outline, 0.85);
  rubble(g, { x, y: baseY - h, w, h, seed, color: C.ink, color2: C.stoneDark, count: rnd(11 * u), alpha: 0.9 });
  rubble(g, { x: x + rnd(w * 0.1), y: baseY - rnd(h * 0.4), w: rnd(w * 0.8), h: rnd(h * 0.4), seed: seed + 7, color: C.void, color2: C.ink, count: rnd(7 * u), alpha: 0.9 });
  for (const [fx, fy, fs] of [[0.4, 0.3, 1], [0.55, 0.5, 2], [0.72, 0.42, 1]]) {
    fill(g, x + rnd(w * fx), baseY - rnd(h * fy), fs, 1, accent, 0.85);
  }
}

// 粗吊链：竖环（外框 + 环孔）与横环交替咬合，越往下越暗；锈点贴在环上（近景压边用）
function heavyChain(g, x, y, h, link) {
  let i = 0;
  for (let yy = y; yy < y + h - 3; yy += link, i++) {
    const dim = Math.max(0.5, 1 - i / 90);
    if (i % 2 === 0) {
      fill(g, x, yy, 5, link, C.outline, 1);
      fill(g, x + 1, yy + 2, 3, Math.max(1, link - 4), C.void, 1);
      fill(g, x, yy, 1, link, C.stoneLight, 0.42 * dim);
      fill(g, x + 4, yy, 1, link, C.ink, 0.85);
    } else {
      const hy = yy + rnd(link * 0.3);
      fill(g, x - 1, hy, 7, 4, C.outline, 1);
      fill(g, x + 1, hy + 1, 3, 2, C.void, 1);
      fill(g, x - 1, hy, 7, 1, C.stoneLight, 0.32 * dim);
    }
    if (i % 5 === 3) fill(g, x + 1, yy + 2, 2, 1, C.brassDark, 0.85);
  }
}

export function back(g, L) {
  const { w, horizon, accent } = L;
  const H = horizon;
  const s = Math.min(H / 135, 2.1);          // 竖向比例：竖屏地平线更高，炉体跟着长高
  const u = L.tall ? 1.5 : 1;
  const cx = L.anchors.light.x;              // 炉口正对光源锚点
  const mw = rnd(92 * Math.min(s, 1.7));     // 炉口宽（0.34W–0.50W 区段）
  const mh = rnd(H * 0.62);                  // 炉口高（0.30H–0.58H 区段）
  const mouthTop = H - mh;

  // 砖砌炉墙：错缝砖，越靠上越暗（离炉火远），贴地处留一圈暖反光
  bricks(g, {
    x: 0, y: 0, w, h: H, rowH: L.tall ? 18 : 11, segW: L.tall ? 30 : 24,
    color: C.mauve, alpha: 0.5, face: C.tan, faceAlpha: 0.3, dark: C.void,
    seed: 611, density: L.tall ? 0.34 : 0.5, shade: 0.5,
  });
  fill(g, 0, 0, w, rnd(H * 0.34), C.void, 0.34);
  fill(g, 0, 0, w, rnd(H * 0.14), C.void, 0.3);
  fill(g, 0, H - rnd(H * 0.1), w, rnd(H * 0.1), C.tan, 0.07);

  // 两处缺砖：砖掉落后的凹口（口沿留受光砖边）
  for (const [hx, hy] of [[0.06, 0.55], [0.72, 0.14]]) {
    const x0 = rnd(w * hx);
    const y0 = rnd(H * hy);
    const hw2 = rnd(19 * u);
    const hh2 = rnd(13 * u);
    fill(g, x0, y0, hw2, hh2, C.void, 0.92);
    // 凹口里残留两截断砖 + 下沿一道受光砖边，才读成墙上的洞，不是浮着的黑方块
    fill(g, x0 + rnd(2 * u), y0 + rnd(2 * u), rnd(5 * u), rnd(3 * u), C.mauve, 0.85);
    fill(g, x0 + rnd(9 * u), y0 + rnd(6 * u), rnd(4 * u), rnd(3 * u), C.mauve, 0.8);
    fill(g, x0, y0 - 1, hw2, 1, C.mauve, 0.7);
    fill(g, x0 + 1, y0 + hh2 - 1, hw2 - 2, 1, C.tan, 0.34);
    fill(g, x0 + 1, y0 + hh2, hw2 - 2, 1, C.void, 0.6);
  }

  // 炉膛外框：乱石砌的炉罩，比砖墙更粗更暗，顶沿一条受光
  const sw = mw + rnd(30 * u);
  const sx = cx - rnd(sw / 2);
  ashlar(g, {
    x: sx, y: mouthTop - rnd(10 * u), w: sw, h: H - (mouthTop - rnd(10 * u)),
    rowH: Math.max(6, rnd(11 * u * Math.min(s, 1.6))), color: C.mauve, alpha: 0.78,
    face: C.tan, dark: C.void, seed: 613, density: 0.7,
  });
  fill(g, sx, mouthTop - rnd(10 * u), sw, 1, C.tan, 0.26);
  fill(g, sx, mouthTop - rnd(10 * u) + 1, sw, 1, C.void, 0.4);

  // 砖砌烟道：从炉口上沿直上画面顶端，逐层收窄，顶上压一道收口
  hood(g, cx, rnd(mw * 1.12), rnd(mw * 0.74), mouthTop + rnd(4 * u), L.tall ? 8 : 6, u);
  // 烟道底部的火光反照（只两档）
  fill(g, sx + 2, mouthTop - rnd(16 * u), sw - 4, rnd(14 * u), accent, 0.05);
  fill(g, sx + rnd(8 * u), mouthTop - rnd(8 * u), sw - rnd(16 * u), rnd(7 * u), accent, 0.06);

  // 拱背热光：贴炉口拱券外侧的三道亮弧（离火越远越淡）
  archGlow(g, cx, H, mw + rnd(14 * u), mh + rnd(10 * u), accent, 0.2, 12);
  archGlow(g, cx, H, mw + rnd(32 * u), mh + rnd(22 * u), accent, 0.11, 12);
  archGlow(g, cx, H, mw + rnd(52 * u), mh + rnd(34 * u), accent, 0.06, 12);

  // 炉膛口：圆拱（与第一幕的尖拱门洞区分），内层受热砖红 + 火床 + 三层火舌
  roundArch(g, { cx, baseY: H, w: mw, h: mh, t: 2, color: C.stoneLight, alpha: 0.5, fillColor: C.void, fillAlpha: 1 });
  roundArch(g, { cx, baseY: H, w: mw - rnd(12 * u), h: mh - rnd(14 * u), t: 0, color: C.bloodDark, alpha: 0.8, fillColor: C.bloodDark, fillAlpha: 0.42 });
  fill(g, cx - rnd(mw * 0.4), H - rnd(mh * 0.12), rnd(mw * 0.8), rnd(mh * 0.12), C.bloodDark, 0.5);
  flame(g, cx, H - rnd(mh * 0.07), rnd(mw * 0.74), rnd(mh * 0.72), accent);

  // 火床：炉膛底部的煤块，幕色煤 + 亮芯两档，火焰从煤床上抬起
  for (const [ox, bw, bh2] of [[-34, 9, 3], [-24, 7, 3], [-13, 11, 4], [-2, 9, 3], [9, 12, 4], [21, 8, 3], [31, 10, 3], [-29, 6, 2], [15, 6, 2], [36, 5, 2]]) {
    fill(g, cx + ox, H - rnd(4 * u) - bh2, bw, bh2, accent, 0.95);
  }
  for (const [ox, bw, bh2] of [[-12, 7, 2], [1, 6, 2], [10, 7, 3], [24, 5, 2]]) {
    fill(g, cx + ox, H - rnd(5 * u) - bh2, bw, bh2, C.arcaneLight, 0.95);
  }
  fill(g, cx - rnd(3 * u), H - rnd(6 * u), rnd(5 * u), rnd(3 * u), C.white, 0.9);

  // 煤烟：从炉口上沿往上爬的五条，宽度与方向都固定（无随机）
  for (let i = 0; i < 5; i++) {
    const bx = rnd(cx - mw * 0.36 + i * mw * 0.18);
    const bh = rnd((22 + ((i * 13) % 20)) * Math.min(s, 1.7));
    fill(g, bx, mouthTop - bh, 3, bh, C.void, 0.34);
    fill(g, bx + 1, mouthTop - bh - rnd(5 * u), 2, rnd(5 * u), C.void, 0.22);
    fill(g, bx - 2, mouthTop - rnd(bh * 0.6), 2, rnd(bh * 0.5), C.void, 0.18);
  }

  // 火星：从炉膛里往上升的固定点（1–2px，只用幕色与亮芯两档）
  const sparks = [[0.18, 0.08], [0.34, 0.22], [0.5, 0.4], [0.64, 0.12], [0.78, 0.3], [0.26, 0.52], [0.88, 0.46], [0.44, 0.62], [0.7, 0.56], [0.12, 0.36]];
  sparks.forEach(([fx, fy], i) => {
    const px = rnd(cx + (fx - 0.5) * mw * 1.1);
    const py = rnd(H - mh * (0.08 + fy * 0.9));
    const big = i % 3 === 0;
    fill(g, px, py, big ? 2 : 1, big ? 2 : 1, i % 2 ? C.arcaneLight : accent, big ? 0.9 : 0.6);
  });

  // 悬挂铁链与吊钩：三条远近不同的链（远排更暗更小），中链末端挂一只坩埚
  chain(g, { x: rnd(w * 0.63), y: 0, h: rnd(H * 0.34), color: C.stoneDark, alpha: 0.55, linkH: Math.max(4, rnd(5 * u)) });
  hook(g, rnd(w * 0.63) - 1, rnd(H * 0.34), u, true);
  chain(g, { x: rnd(w * 0.9), y: 0, h: rnd(H * 0.24), color: C.stoneDark, alpha: 0.45, linkH: Math.max(4, rnd(5 * u)) });
  const crx = rnd(w * 0.825);
  const cry = rnd(H * 0.42);
  chain(g, { x: crx, y: 0, h: cry, color: C.stoneDark, alpha: 0.62, linkH: Math.max(4, rnd(5 * u)) });
  for (const d of [-1, 1]) {
    fill(g, crx + (d < 0 ? -rnd(8 * u) : 0), cry - rnd(2 * u), rnd(2 * u), rnd(8 * u), C.stoneLight, 0.42);
  }
  fill(g, crx - rnd(9 * u), cry + rnd(4 * u), rnd(18 * u), rnd(3 * u), C.outline, 1);
  fill(g, crx - rnd(7 * u), cry + rnd(7 * u), rnd(14 * u), 1, accent, 0.85);
  fill(g, crx - rnd(4 * u), cry + rnd(7 * u), rnd(8 * u), 1, C.arcaneLight, 0.85);
  silhouette(g, [
    { x: crx - rnd(9 * u), y: cry + rnd(7 * u) },
    { x: crx + rnd(9 * u), y: cry + rnd(7 * u) },
    { x: crx + rnd(6 * u), y: cry + rnd(19 * u) },
    { x: crx - rnd(6 * u), y: cry + rnd(19 * u) },
  ], C.outline, 1);
  fill(g, crx - rnd(2 * u), cry + rnd(20 * u), rnd(4 * u), 1, accent, 0.6);

  // 挂具墙：一根铁横杆 + 三把吊着的钳与锤（远看就是铁匠铺的记号）
  const rackY = rnd(H * 0.3);
  beam(g, { x: rnd(w * 0.05), y: rackY, w: rnd(w * 0.2), h: rnd(4 * u), color: C.outline, light: C.stoneLight, alpha: 0.9, bolts: false });
  for (const [tx, tl] of [[0.075, 0.075], [0.135, 0.1], [0.195, 0.055]]) {
    const bx = rnd(w * tx);
    const by = rnd(H * (0.3 + tl));
    fill(g, bx, rackY + rnd(4 * u), 1, by - rackY, C.outline, 0.85);
    fill(g, bx - rnd(3 * u), by, rnd(6 * u), rnd(3 * u), C.outline, 0.9);
    fill(g, bx - rnd(3 * u), by, 1, rnd(3 * u), C.stoneLight, 0.3);
  }

  // 风箱：暗皮褶箱体（左宽右尖）+ 上夹板 + 三道褶线 + 两道铁箍 + 摇杆；送风管插进炉罩左脚
  const bw2 = rnd(62 * u);
  const bh3 = rnd(26 * u);
  const bx2 = rnd(w * 0.1);
  const by2 = horizon + rnd(2 * u) - bh3;   // 后排道具踩在地平线上，才不会被 mid 的地面盖掉
  // 箱体：左端高、右端收成薄口的楔形（风箱的形就靠这个斜面读，不能画成中脊屋顶）
  const tipH = rnd(bh3 * 0.5);                                   // 右端薄口的高度
  silhouette(g, [
    { x: bx2, y: by2 + bh3 },
    { x: bx2, y: by2 },
    { x: bx2 + bw2, y: by2 + tipH },
    { x: bx2 + bw2, y: by2 + tipH + rnd(bh3 * 0.14) },
  ], C.mauve, 1);
  // 斜顶受光的一条窄面（贴着斜面走，不整片提亮）
  silhouette(g, [
    { x: bx2 + rnd(2 * u), y: by2 + 1 },
    { x: bx2 + bw2, y: by2 + tipH },
    { x: bx2 + bw2, y: by2 + tipH + rnd(2 * u) },
    { x: bx2 + rnd(2 * u), y: by2 + rnd(3 * u) },
  ], C.tan, 0.18);
  // 左端立板：一块厚木板封住风口这头，受光面在左侧
  fill(g, bx2, by2, rnd(5 * u), bh3, C.mauve, 1);
  fill(g, bx2, by2, 1, bh3, C.tan, 0.42);
  fill(g, bx2 + rnd(4 * u), by2, 1, bh3, C.ink, 0.7);
  // 箱体下半截压暗面，箱形才立得住（明暗贴箱侧，不整片染色）
  fill(g, bx2 + rnd(4 * u), by2 + rnd(bh3 * 0.66), rnd(bw2 * 0.8), rnd(bh3 * 0.26), C.ink, 0.5);
  // 皮褶：五道顺着斜顶往下贯的暗缝，越靠右越短（贴着箱体走，褶子才是风箱的材质线）
  for (let k = 0; k < 5; k++) {
    const f = 0.12 + k * 0.16;
    const px = bx2 + rnd(bw2 * f);
    const topY = by2 + rnd(tipH + (bh3 - tipH) * (1 - f)) + rnd(1 * u);
    fill(g, px, topY, 1, by2 + bh3 - topY, C.ink, 0.8);
    fill(g, px + 1, topY + rnd(2 * u), 1, Math.max(2, by2 + bh3 - topY - rnd(3 * u)), C.tan, 0.13);
  }
  // 两道铁箍 + 箍口锈点
  for (const k of [0.22, 0.6]) {
    const bxx = bx2 + rnd(bw2 * k);
    fill(g, bxx, by2 + rnd(bh3 * 0.26), rnd(2 * u), rnd(bh3 * 0.62), C.outline, 0.95);
    fill(g, bxx, by2 + rnd(bh3 * 0.26), 1, rnd(bh3 * 0.62), C.stoneLight, 0.2);
    fill(g, bxx, by2 + rnd(bh3 * 0.72), rnd(2 * u), 1, C.brassDark, 0.5);   // 箍口一点锈
  }
  fill(g, bx2, by2 + bh3 - 1, rnd(bw2 * 0.86), 1, C.ink, 0.95);
  fill(g, bx2, by2 + bh3, rnd(bw2 * 0.86), 1, C.void, 0.6);
  fill(g, bx2 + rnd(bw2 * 0.3), by2 + rnd(bh3 * 0.7), rnd(3 * u), 1, C.brassDark, 0.7);
  // 摇杆：从箱顶斜向右上，末端一个铁握把
  for (let i = 0; i < 5; i++) {
    fill(g, bx2 + rnd(bw2 * 0.22) + i * rnd(4 * u), by2 - rnd(2 * u) - i * rnd(4 * u), rnd(2 * u), rnd(5 * u), C.outline, 1);
    fill(g, bx2 + rnd(bw2 * 0.22) + i * rnd(4 * u), by2 - rnd(2 * u) - i * rnd(4 * u), rnd(2 * u), 1, C.tan, 0.3);
  }
  fill(g, bx2 + rnd(bw2 * 0.22) + rnd(18 * u), by2 - rnd(24 * u), rnd(5 * u), rnd(3 * u), C.outline, 1);
  // 送风管：从风箱尖口收成三段锥形插进炉罩左脚，两道铁箍
  const pipeY = by2 + tipH + rnd(2 * u);
  const pipeX = bx2 + bw2 - rnd(2 * u);
  const pipeEnd = sx + rnd(8 * u);
  const pipeW = Math.max(8, pipeEnd - pipeX);
  fill(g, pipeX, pipeY, pipeW, rnd(5 * u), C.outline, 1);
  fill(g, pipeX, pipeY, pipeW, 1, C.stoneLight, 0.22);
  fill(g, pipeX, pipeY + rnd(6 * u) - 1, pipeW, 1, C.ink, 0.95);
  // 锥口：管口三级放粗，读得出是往炉子里吹
  for (let i = 0; i < 3; i++) {
    fill(g, pipeEnd - rnd(4 * u) + i * rnd(5 * u), pipeY - i * rnd(1 * u), rnd(5 * u), rnd(6 * u) + i * rnd(2 * u), C.outline, 1);
  }
  for (const k of [0.3, 0.7]) {
    fill(g, pipeX + rnd(pipeW * k), pipeY - 1, 2, rnd(8 * u), C.outline, 0.9);
    fill(g, pipeX + rnd(pipeW * k), pipeY - 1, 1, rnd(6 * u), C.stoneLight, 0.18);
  }

  // 两端压暗，把注意力收到炉口
  fill(g, 0, 0, rnd(w * 0.03), H, C.void, 0.3);
  fill(g, w - rnd(w * 0.03), 0, rnd(w * 0.03), H, C.void, 0.26);
}

export function mid(g, L) {
  const { w, horizon } = L;
  const accent = L.accent;
  const u = L.tall ? 1.5 : 1;
  const ground = groundOf(L);
  const cx = L.anchors.light.x;
  const anvilCx = L.anchors.lord.x;
  const depth = Math.max(8, ground - horizon);
  const floorH = Math.max(24, ground - horizon);   // 地面平面只铺到碑座前沿，碑座前那截留给暗（竖屏才不会被读成又一段砖墙）

  // 地面平面在中景层最底：先铺地面与石缝，再让铁砧 / 水槽 / 模具架 / 煤堆站上去
  fill(g, 0, horizon, w, floorH, C.ink, 1);
  fill(g, 0, horizon, w, floorH, C.mauve, 0.3);             // 炉前石面整体偏暖
  fill(g, 0, horizon, w, 2, C.void, 0.55);                  // 墙脚接触阴影（别让地面从地平线亮起来）
  const bh = Math.max(8, rnd(floorH / (L.tall ? 18 : 13)));
  const bands = Math.ceil(floorH / bh);
  for (let i = 0; i < bands; i++) {
    const y = horizon + i * bh;
    const hh = Math.min(bh, horizon + floorH - y);
    if (hh <= 0) continue;
    fill(g, 0, y, w, hh, C.stoneDark, Math.min(0.3, 0.1 + i * 0.022));
    if (hh > 2) {
      fill(g, 0, y, w, 1, C.mauve, 0.3);                    // 石板受光缝
      fill(g, 0, y + hh - 1, w, 1, C.void, 0.45);
    }
    const step = L.tall ? 96 : 84;
    const off = (i % 3) * rnd(step * 0.31);
    for (let sx = off; sx < w; sx += step) fill(g, sx, y + 1, 1, Math.max(1, hh - 2), C.void, 0.35);
  }

  // 炉口下的炉台：一条受光石台，把炉膛与地面接起来（只有炉口这一段受火光）
  fill(g, cx - 60, horizon + rnd(1 * u), 120, rnd(4 * u), C.outline, 1);
  fill(g, cx - 60, horizon + rnd(1 * u), 120, 1, C.tan, 0.45);
  fill(g, cx - 60, horizon + rnd(5 * u), 120, 1, C.void, 0.5);
  fill(g, cx - 52, horizon + rnd(6 * u), 104, 1, accent, 0.22);

  // 炉前暖光池：光源只有炉膛一处，靠四档低透明度硬边带往观者脚下铺
  for (const [pw, py, ph, pa] of [[0.52, 0.02, 0.32, 0.2], [0.42, 0.3, 0.4, 0.16], [0.3, 0.56, 0.48, 0.11], [0.17, 0.78, 0.4, 0.06]]) {
    fill(g, cx - rnd(w * pw / 2), horizon + rnd(depth * py), rnd(w * pw), Math.max(2, rnd(depth * ph)), accent, pa);
  }

  // 铁屑与火星亮点：12 条 1px 横屑 + 6 个亮点，全部贴在地面上（不飘）
  for (let i = 0; i < 12; i++) {
    const fx = 0.05 + ((i * 0.079) % 0.9);
    const fy = 0.12 + ((i * 0.37) % 0.8);
    fill(g, rnd(w * fx), horizon + rnd(depth * fy), 2 + (i % 3), 1, i % 3 === 0 ? C.brassDark : C.stoneLight, 0.45);
  }
  for (let i = 0; i < 6; i++) {
    const fx = 0.12 + ((i * 0.17) % 0.76);
    fill(g, rnd(w * fx), horizon + rnd(depth * (0.08 + 0.13 * i)), 2, 1, i % 2 ? accent : C.arcane, 0.5);
  }

  // 炉灰：贴着炉口下方的地面往外撒（材质依附：煤渣贴地面）
  rubble(g, {
    x: cx - rnd(w * 0.15), y: horizon + rnd(depth * 0.06), w: rnd(w * 0.3), h: rnd(depth * 0.55),
    seed: 631, color: C.void, color2: C.stoneDark, count: 18, alpha: 0.6,
  });
  // 石面裂缝：从炉口脚下往左裂开，只走在中景地面上
  cracks(g, {
    x: rnd(w * 0.24), y: horizon + rnd(depth * 0.3), len: Math.max(6, rnd(depth * 0.6)),
    seed: 641, color: C.void, alpha: 0.45, branches: 1, drift: 4,
  });

  // 煤堆三排：远排小且贴墙、中排居中、近排大且压到碑座边
  coalPile(g, rnd(w * 0.03), horizon + rnd(depth * 0.3), rnd(44 * u), rnd(15 * u), 661, u, accent);
  coalPile(g, rnd(w * 0.15), horizon + rnd(depth * 0.64), rnd(52 * u), rnd(20 * u), 663, u, accent);
  coalPile(g, rnd(w * 0.655), ground - rnd(2 * u), rnd(46 * u), rnd(17 * u), 665, u, accent);

  // 剑胚：斜靠在砧座右侧（铁匠刚打完、还没入水的半成品）
  blade(g, anvilCx + rnd(26 * u), ground - rnd(1 * u), u, accent);

  // 模具架（靠右墙）与淬火水槽（炉口右下，水面反幕色）
  moldRack(g, rnd(w * 0.75), rnd(w * 0.19), ground - rnd(10 * u), u, accent);
  trough(g, rnd(w * 0.225), rnd(w * 0.14), ground - rnd(4 * u), u, accent);

  // 砧前一块受光的地面：炉光砸在砧脚周围，暗铁才有亮地衬着（剪影优先）
  fill(g, anvilCx - rnd(47 * u), ground - rnd(31 * u), rnd(94 * u), rnd(31 * u), accent, 0.1);
  fill(g, anvilCx - rnd(36 * u), ground - rnd(21 * u), rnd(72 * u), rnd(21 * u), accent, 0.12);
  fill(g, anvilCx - rnd(25 * u), ground - rnd(11 * u), rnd(50 * u), rnd(11 * u), accent, 0.14);

  // 铁砧落在契约主锚点上，砧面压着发亮的工件，右侧斜靠着铁锤
  anvil(g, anvilCx, ground, u, accent);
  hammer(g, anvilCx + rnd(22 * u), ground - rnd(2 * u), u);

  // 砧边飞起的火星：三层高度各两点，越远越小
  for (const [dx, dy, sz] of [[-26, -30, 1], [22, -38, 2], [-14, -46, 1], [30, -52, 1], [4, -58, 2], [-4, -64, 1]]) {
    fill(g, anvilCx + rnd(dx * u), ground + rnd(dy * u), sz, sz, sz > 1 ? C.arcaneLight : accent, 0.7);
  }

  // 碑座前沿以外不铺地板：压成一片暗，近景的雾与锁链才有地方站
  fill(g, 0, horizon + floorH, w, L.h - horizon - floorH, C.ink, 1);
  fill(g, 0, horizon + floorH, w, L.h - horizon - floorH, C.void, 0.55);
}

export function fore(g, L) {
  const { w, horizon, accent } = L;
  const u = L.tall ? 1.5 : 1;
  const ground = groundOf(L);
  const link = Math.max(6, rnd(9 * Math.min(u, 1.1)));

  // 近景只放压边物件：左右两条粗吊链从画框顶垂下，竖环与横环交替咬合，链端各挂一只铁钩
  heavyChain(g, rnd(w * 0.05), 0, ground - rnd(34 * u), link);
  hook(g, rnd(w * 0.05) - 1, ground - rnd(38 * u), 1.5 * u, true);
  heavyChain(g, rnd(w * 0.945), 0, ground - rnd(6 * u), link);
  hook(g, rnd(w * 0.945) - 2, ground - rnd(10 * u), 1.7 * u, true);

  // 左下煤堆压住碑座角，堆顶留余烬
  coalPile(g, 0, ground + rnd(2 * u), rnd(w * 0.2), rnd(18 * u), 677, u, accent);

  // 火光雾：贴地暖雾（整幅铺的雾带一律 h≤2，绝不整片铺地） + 一层冷雾把中景压下去
  fill(g, 0, ground - rnd(26 * u), w, 2, accent, 0.05);
  fill(g, 0, ground - rnd(16 * u), w, 2, accent, 0.08);
  fill(g, 0, ground - rnd(7 * u), w, 1, accent, 0.12);
  fill(g, 0, horizon + rnd((ground - horizon) * 0.4), w, 2, C.fog, 0.05);
}
