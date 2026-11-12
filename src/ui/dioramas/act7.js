import { fill, ashlar, disc, ring, ellipseRing, cracks, moss, rubble, silhouette } from '../diorama-kit.js';
import { C } from '../Palette.js';

// 第 VII 幕「破晓之座」——三层静态像素布景。
// 构图分带（横屏 480×270）：地平线 y=119；碑座面板 y=186 起，游戏里被铭文牌盖住，别当成空白。
//   远景 0–119：五段硬边天幕 → 地平线上三条渐宽的晨光横带 → 从王座断口斜射的光柱 → 日出光晕 → 云海与云团 → 北斗七星 + 连线 → 两侧断柱天际线
//   中景 119–186：石铺地面（横缝 + 错缝竖缝 + 碎块）→ 光池长条 → 七根钉柱(远排) → 左右两排断裂石柱(中排) → 两座倒伏方尖碑(近排) → 残烛 → 断裂王座 → 悬浮光尘
//   近景 168–186：逆光雾 + 左右两段石阶压边 + 角落遮挡剪影 + 阶下低雾
// 材质线全部依附实体：砖缝贴地、凿痕贴座面与台座踢面、苔贴台座与柱础、锈贴铜箍、蜡痕贴台阶。
// 光源只有幕色 accent 一处：受光边一律 1px accent/bone，绝不整片染色。

// 归一化锚点。seal / gate 是文件里原有的两个（数值一个都没动），
// 下面三个给事件层落点用：light=日出位置，lord=王座座面，nail=台座脚下石板。
export const anchors = {
  seal: { x: 0.5, y: 0.42, r: 0.16 },
  gate: { x: 0.5, y: 0.58, r: 0.12 },
  light: { x: 0.5, y: 0.42, r: 0.03 },
  lord: { x: 0.5, y: 0.5778, r: 0.05 },
  nail: { x: 0.5, y: 0.6889, r: 0.02 },
};

const rnd = (n) => Math.round(n);
const uOf = (L) => (L.tall ? 1.5 : 1); // 物件尺度：竖屏放大，免得小得看不清
const skyU = (L) => (L.tall ? 1.22 : 1); // 天幕细节尺度：放大但没有物件那么狠，保持「远」
const groundOf = (L) => Math.min(rnd(L.anchors.nail.y), L.h - (L.tall ? 104 : 84));
const plinthTop = (L) => L.h - (L.tall ? 104 : 84);

// 1px 折线：一次 strokePoints，点全部取整（测试要求整数坐标）
function line(g, pts, color, alpha = 1) {
  g.lineStyle(1, color, alpha);
  g.strokePoints(pts.map((p) => ({ x: rnd(p.x), y: rnd(p.y) })), false);
}

// 硬边椭圆：逐行矩形铺出来（像素风不用抗锯齿弧线，也不产生上万条指令）
function ellipse(g, cx, cy, rx, ry, color, alpha = 1) {
  for (let dy = -ry; dy <= ry; dy++) {
    const half = rnd(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry))));
    if (half > 0) fill(g, cx - half, cy + dy, half * 2, 1, color, alpha);
  }
}

// 云：横条底台 + 两个圆丘，顶缘吃一道晨色（受光面只有顶 → 不整片染色）
function cloud(g, x, y, w, h, color, alpha, lit, litAlpha) {
  const b1x = x + rnd(w * 0.1);
  const b1w = rnd(w * 0.54);
  const b1h = rnd(h * 0.6) + 1;
  const b2x = x + rnd(w * 0.56);
  const b2w = rnd(w * 0.34);
  const b2h = rnd(h * 0.34) + 1;
  fill(g, x, y, w, h, color, alpha);
  fill(g, b1x, y - b1h, b1w, b1h, color, alpha);
  fill(g, b2x, y - b2h, b2w, b2h, color, alpha);
  if (lit) {
    // 只有云顶那道弧线吃晨光：贴在圆丘顶上，不悬空
    fill(g, b1x, y - b1h, b1w, 1, lit, litAlpha);
    fill(g, b2x, y - b2h, b2w, 1, lit, litAlpha);
    fill(g, x, y, w, 1, lit, rnd(litAlpha * 0.35 * 100) / 100);
  }
}

// 断裂石柱：柱身 + 参差断口 + 鼓石接缝 + 柱础 + 苔（苔只贴柱础）
function brokenColumn(g, { cx, base, w, h, u, seed, accent }) {
  const half = rnd(w / 2);
  const top = base - h;
  const x = cx - half;
  const litRight = cx < 240; // 光在画面中轴 → 朝中轴那一侧才是受光面
  // 柱础两级：下宽上窄，柱子是踩在础上的
  const bw = rnd(w * 0.86);
  const b0 = base - rnd(9 * u);
  fill(g, cx - bw, base - rnd(5 * u), bw * 2, rnd(5 * u), C.stoneDark, 0.9);
  fill(g, cx - bw, base - rnd(5 * u), bw * 2, 1, C.stone, 0.55);
  fill(g, cx - rnd(bw * 0.8), b0, rnd(bw * 1.6), rnd(4 * u), C.stoneDark, 0.85);
  fill(g, cx - rnd(bw * 0.8), b0, rnd(bw * 1.6), 1, C.stoneLight, 0.45);
  const bh = b0 - top;
  // 柱身：暗块 + 3px 受光面 + 1px 最亮棱 + 背光侧 2px 暗边（圆柱才立得住）
  fill(g, x, top, w, bh, C.void, 1);
  fill(g, litRight ? x + w - 4 : x + 1, top, 3, bh, C.stone, 0.42);
  fill(g, litRight ? x + w - 1 : x, top, 1, bh, C.stoneLight, 0.6);
  fill(g, litRight ? x : x + w - 2, top, 2, bh, C.ink, 0.7);
  // 鼓石接缝：每 9u 一道，绕着柱身走
  for (let dy = bh - rnd(9 * u); dy > rnd(4 * u); dy -= rnd(9 * u)) {
    fill(g, x, top + dy, w, 1, C.groove, 0.38);
    fill(g, x, top + dy + 1, w, 1, C.void, 0.5);
  }
  // 断口：三截参差的碎口，顶缘吃一线晨光
  for (const [fx, fw, fh] of [[-0.05, 0.5, 5], [0.34, 0.34, 9], [0.68, 0.3, 4]]) {
    fill(g, x + rnd(w * fx), top - rnd(fh * u), rnd(w * fw), rnd(fh * u), C.void, 1);
  }
  fill(g, x + rnd(w * 0.3), top - rnd(9 * u), rnd(w * 0.36), 1, accent, 0.32);
  fill(g, x, top - rnd(5 * u), rnd(w * 0.32), 1, accent, 0.22);
  // 断口落石 + 柱础苔（苔只贴础，不贴柱身）
  fill(g, cx + rnd(w * 0.9), base - rnd(3 * u), rnd(4 * u), rnd(3 * u), C.void, 1);
  fill(g, cx + rnd(w * 0.9), base - rnd(3 * u), rnd(4 * u), 1, C.stoneDark, 0.6);
  moss(g, { x: cx - bw, y: base - rnd(6 * u), w: bw * 2, h: rnd(5 * u), seed, color: C.mossTileLit, count: 6, alpha: 0.55 });
}

// 倒伏方尖碑：横躺的锥形碑身 + 尖端 + 一致的投影（光在中央 → 影子朝外扩）+ 断口
function fallenObelisk(g, { x, baseY, len, h, dir, u }) {
  // 影子：从碑身底缘向远离光源的一侧摊开
  silhouette(g, [
    { x: x + rnd(len * 0.1), y: baseY - 3 },
    { x: x + len, y: baseY - 3 },
    { x: x + len + dir * rnd(len * 0.28), y: baseY + 2 },
    { x: x - dir * rnd(len * 0.18), y: baseY + 2 },
  ], C.void, 0.35);
  // 碑身两段（下宽上窄 → 锥形），再补尖端
  fill(g, x, baseY - 8, len, 8, C.void, 1);
  fill(g, x + rnd(len * 0.08), baseY - 8 - rnd(h * 0.42), rnd(len * 0.78), rnd(h * 0.42), C.void, 1);
  silhouette(g, [
    { x: x + len - rnd(len * 0.2), y: baseY - 8 - rnd(h * 0.42) },
    { x: x + len, y: baseY - 6 },
    { x: x + len - rnd(len * 0.2), y: baseY - 6 },
  ], C.void, 1);
  // 上棱受光（1px）+ 碑面凿痕两道
  fill(g, x + rnd(len * 0.08), baseY - 8 - rnd(h * 0.42), rnd(len * 0.78), 1, C.stoneDark, 0.55);
  fill(g, x + rnd(len * 0.1), baseY - 5, rnd(len * 0.72), 1, C.groove, 0.3);
  fill(g, x + rnd(len * 0.14), baseY - 2, rnd(len * 0.6), 1, C.void, 0.6);
  // 碑座残块
  fill(g, x - rnd(5 * u), baseY - 5, rnd(7 * u), 5, C.void, 1);
  fill(g, x - rnd(5 * u), baseY - 5, rnd(7 * u), 1, C.stoneDark, 0.6);
}

// 断裂王座：整块黑石剪影，只有上缘吃 1px 晨光。
// dy = 距台座底面的高度（横屏基准：台座底 186、座面 146、断口 96–118、顶 60）
function throne(g, L, cx, base) {
  const u = uOf(L);
  const accent = L.accent;
  const X = (dx) => cx + rnd(dx * u);
  const Y = (dy) => base - rnd(dy * u);

  // 台座三级石阶：每级 1px 受光棱 + 踢面凿痕 + 侧面暗部
  const tiers = [[128, 0, 8], [108, 8, 15], [92, 15, 22]];
  for (const [tw, dy0, dy1] of tiers) {
    const w2 = rnd(tw * u);
    const x = X(-tw / 2);
    const y = Y(dy1);
    const hh = Y(dy0) - y;
    // 台座跟王座一起压成暗部，只留受光棱与凿痕（凿痕贴踢面）
    if (dy0 === 0) {
      ashlar(g, { x, y, w: w2, h: hh, rowH: Math.max(3, rnd(4 * u)), color: C.void, alpha: 0.94, face: C.stoneDark, dark: C.ink, seed: 71, density: 0.7 });
    } else {
      fill(g, x, y, w2, hh, C.void, 0.94);
      fill(g, x, y, w2, hh, C.stoneDark, 0.16);
    }
    fill(g, x, y, w2, 1, accent, 0.3); // 踏面前棱受光
    fill(g, x, y, 1, hh, C.stone, 0.35);
    fill(g, x + w2 - 1, y, 1, hh, C.void, 0.6);
    // 踢面凿痕：两道短横线，贴石头
    fill(g, x + rnd(w2 * 0.12), y + rnd(hh * 0.45), rnd(w2 * 0.3), 1, C.groove, 0.3);
    fill(g, x + rnd(w2 * 0.6), y + rnd(hh * 0.6), rnd(w2 * 0.24), 1, C.groove, 0.26);
  }
  const daisTop = Y(22);

  // 座面：一整块黑石，顶面一线天光、正面三道凿痕、中缝一道裂
  const seatW = rnd(72 * u);
  const seatH = Y(22) - Y(40);
  const sLeft = X(-36);
  fill(g, sLeft, Y(40), seatW, seatH, C.void, 1);
  fill(g, sLeft, Y(40), seatW, 3, C.stoneDark, 0.28); // 座面那条窄窄的水平面
  fill(g, sLeft, Y(40), seatW, 1, C.stone, 0.35);
  for (let k = 1; k <= 3; k++) fill(g, sLeft + rnd(seatW * 0.1), Y(40) + rnd((seatH * k) / 4), rnd(seatW * 0.78), 1, C.groove, 0.3);
  fill(g, cx, Y(40) + 3, 1, seatH - 4, C.void, 0.85); // 座面中缝
  // 座面塌陷：中段缺一块，断口内壁吃一点天光
  fill(g, cx - rnd(12 * u), Y(40), rnd(24 * u), rnd(6 * u), C.void, 1);
  fill(g, cx - rnd(12 * u), Y(40), 1, rnd(6 * u), C.stoneDark, 0.45);
  fill(g, cx + rnd(11 * u), Y(40), 1, rnd(6 * u), C.stoneDark, 0.4);
  fill(g, sLeft - rnd(4 * u), daisTop, seatW + rnd(8 * u), 2, C.void, 0.5); // 座下阴影

  // 靠背下半段（还连着座面）：顶端参差，断口下面就是空的
  const bw = rnd(56 * u);
  const bx = cx - rnd(bw / 2);
  fill(g, bx, Y(68), bw, Y(40) - Y(68), C.void, 1);
  fill(g, bx, Y(70), rnd(bw * 0.34), Y(68) - Y(70), C.void, 1);
  fill(g, bx + rnd(bw * 0.4), Y(69), rnd(bw * 0.22), Y(68) - Y(69), C.void, 1);
  fill(g, bx + rnd(bw * 0.78), Y(68.5), rnd(bw * 0.2), Y(68) - Y(68.5), C.void, 1);
  fill(g, bx + 1, Y(66), bw - 2, Y(42) - Y(66), C.stoneDark, 0.3);
  for (let k = 1; k <= 2; k++) fill(g, bx + rnd(bw * 0.12), Y(40) - rnd((Y(40) - Y(68)) * (k / 3)), rnd(bw * 0.7), 1, C.groove, 0.26);
  fill(g, bx, Y(68), 1, Y(40) - Y(68), accent, 0.2); // 受光棱

  // 靠背上半段：断口上方只剩几颗残齿——右肩最高、往左一级级被削掉（左上是缺角）
  const TEETH = [
    [X(-30), X(2), 90, 116], // 主残块：左侧整块被削
    [X(0), X(20), 90, 127], // 右肩最高的一颗
    [X(-14), X(2), 116, 122], // 中间一颗齿
    [X(-26), X(-12), 100, 106], // 左边只剩一颗矮齿
  ];
  for (const [x0, x1, dy0, dy1] of TEETH) {
    const tw = x1 - x0;
    const th = Y(dy0) - Y(dy1);
    fill(g, x0, Y(dy1), tw, th, C.void, 1);
    fill(g, x0, Y(dy1), tw, 1, accent, 0.34); // 断面吃光
    fill(g, x0, Y(dy1) + 1, tw, 1, C.stoneDark, 0.3);
    fill(g, x0 + tw - 1, Y(dy1), 1, th, C.ink, 0.8); // 右侧背光
    fill(g, x0, Y(dy1) + rnd(th * 0.55), 1, Math.max(1, rnd(th * 0.4)), accent, 0.16); // 断茬内侧的反射
  }
  fill(g, X(4), Y(127), rnd(bw * 0.34), 1, C.bone, 0.55); // 最高那颗的顶棱最亮
  fill(g, X(-18), Y(110), rnd(bw * 0.3), 1, C.outline, 0.8); // 石面上的旧裂
  fill(g, X(-4), Y(100), rnd(bw * 0.42), 1, C.outline, 0.7);

  // 右扶手还在：横臂 + 立柱；左扶手只剩一截断臂
  const armW = rnd(28 * u);
  fill(g, X(28), Y(58), armW, rnd(6 * u), C.void, 1);
  fill(g, X(28), Y(58), armW, 1, accent, 0.32);
  fill(g, X(48), Y(52), rnd(6 * u), Y(22) - Y(52), C.void, 1);
  fill(g, X(48), Y(52), 1, Y(22) - Y(52), C.stoneDark, 0.45);
  fill(g, X(-56), Y(54), armW, rnd(6 * u), C.void, 1);
  fill(g, X(-56), Y(54), armW, 1, accent, 0.26);
  fill(g, X(-30), Y(56), rnd(4 * u), rnd(4 * u), C.void, 1); // 断口残端

  // 铜箍两道 + 锈点（锈只长在铜件上）
  fill(g, bx + rnd(bw * 0.14), Y(54), rnd(bw * 0.72), 1, C.brassDark, 0.55);
  fill(g, bx + rnd(bw * 0.14), Y(46), rnd(bw * 0.72), 1, C.brassDark, 0.45);
  for (const [fx, fdy] of [[0.22, 55], [0.58, 52], [0.4, 47], [0.7, 45]]) {
    fill(g, bx + rnd(bw * fx), Y(fdy), 2, 1, C.brassDark, 0.9);
  }

  // 枯藤三束：缠左肩、绕过右立柱、爬上台阶座
  line(g, [{ x: bx - 2, y: Y(62) }, { x: bx + 9, y: Y(56) }, { x: bx + 5, y: Y(48) }, { x: bx + 13, y: Y(42) }], C.khaki, 0.8);
  line(g, [{ x: cx + 6, y: Y(34) }, { x: cx + 18, y: Y(30) }, { x: cx + 30, y: Y(26) }, { x: cx + 36, y: Y(22) }], C.khaki, 0.7);
  line(g, [{ x: sLeft - 3, y: Y(20) }, { x: sLeft + 6, y: Y(17) }, { x: sLeft + 14, y: Y(20) }], C.khaki, 0.65);
  fill(g, bx + 6, Y(58), 2, 1, C.sage, 0.7);
  fill(g, bx + 10, Y(52), 1, 2, C.sage, 0.6);
  fill(g, cx + 22, Y(36), 2, 1, C.sage, 0.6);

  // 座面裂缝：只裂在石头上
  cracks(g, { x: sLeft + rnd(seatW * 0.24), y: Y(38), len: rnd(9 * u), seed: 63, color: C.void, alpha: 0.85, branches: 1, drift: 0.5 });
  cracks(g, { x: sLeft + rnd(seatW * 0.7), y: Y(37), len: rnd(8 * u), seed: 67, color: C.void, alpha: 0.8, branches: 0, drift: 0.4 });

  // 台座苔：贴石根的湿苔，只长在台阶下缘
  moss(g, { x: cx - rnd(58 * u), y: base - rnd(6 * u), w: rnd(26 * u), h: rnd(6 * u), seed: 41, color: C.mossTileLit, count: 9, alpha: 0.55 });
  moss(g, { x: cx + rnd(30 * u), y: base - rnd(7 * u), w: rnd(28 * u), h: rnd(7 * u), seed: 43, color: C.mossTileLit, count: 10, alpha: 0.5 });

  // 台座脚下的椅脚残根
  fill(g, X(-70), base - rnd(4 * u), rnd(10 * u), rnd(4 * u), C.void, 1);
  fill(g, X(62), base - rnd(4 * u), rnd(10 * u), rnd(4 * u), C.void, 1);
}

// ============================ 远景 ============================
export function back(g, L) {
  const { w, horizon: hz } = L;
  const su = skyU(L);
  const accent = L.accent;
  const light = L.anchors.light;

  // 天幕：五段硬边色带，顶部深紫、越贴地平线越亮
  const cols = [C.void, C.ink, C.nightDeep, C.nightSoft, C.stoneDark];
  const cuts = [0, 0.34, 0.56, 0.75, 0.89, 1];
  for (let i = 0; i < cols.length; i++) {
    const y0 = rnd(hz * cuts[i]);
    const y1 = rnd(hz * cuts[i + 1]);
    fill(g, 0, y0, w, y1 - y0, cols[i], 1);
  }

  // 晨光横带：三条渐宽的硬边暖色带紧贴地平线（破晓的全部亮度都压在这几条带子里）
  const bands = [
    [40, 30, accent, 0.09],
    [30, 21, accent, 0.15],
    [21, 13, accent, 0.24],
    [13, 5, C.parchment, 0.42],
    [5, 0, C.arcaneLight, 0.72],
  ];
  for (const [d0, d1, col, alpha] of bands) {
    const y0 = hz - rnd(d0 * su);
    const y1 = hz - rnd(d1 * su);
    fill(g, 0, y0, w, y1 - y0, col, alpha);
  }
  // 断口透光：王座背后正对断口压一块更亮的暖光，只有从断口与肩缝里看得见
  const gcx = rnd(w / 2);
  fill(g, gcx - rnd(44 * su), hz - rnd(23 * su), rnd(88 * su), rnd(23 * su), accent, 0.18);
  fill(g, gcx - rnd(28 * su), hz - rnd(23 * su), rnd(56 * su), rnd(23 * su), accent, 0.3);
  fill(g, gcx - rnd(15 * su), hz - rnd(20 * su), rnd(30 * su), rnd(20 * su), C.parchment, 0.24);
  fill(g, 0, hz - 3, w, 1, accent, 0.2);
  fill(g, 0, hz - 2, w, 1, accent, 0.34);
  fill(g, 0, hz - 1, w, 1, accent, 0.7);

  // 破晓光柱：从王座断口斜射出来的硬边梯形（光穿过断口，所以起点在断口高度）
  const gapY = rnd(hz - 3 * su);
  const shaftTop = Math.max(0, gapY - rnd(112 * su)); // 竖屏不让光柱一路贯到天顶
  silhouette(g, [{ x: 232, y: gapY }, { x: 244, y: gapY }, { x: 180, y: shaftTop }, { x: 140, y: shaftTop }], accent, 0.07);
  silhouette(g, [{ x: 236, y: gapY }, { x: 248, y: gapY }, { x: 330, y: shaftTop }, { x: 300, y: shaftTop }], accent, 0.055);
  silhouette(g, [{ x: 234, y: gapY }, { x: 246, y: gapY }, { x: 250, y: shaftTop }, { x: 230, y: shaftTop }], accent, 0.085);

  // 日出光晕：四层同心硬边圆 + 一圈极淡的晕环
  disc(g, light.x, light.y, rnd(26 * su), accent, 0.07);
  disc(g, light.x, light.y, rnd(16 * su), accent, 0.12);
  disc(g, light.x, light.y, rnd(9 * su), accent, 0.2);
  disc(g, light.x, light.y, rnd(4 * su), accent, 0.75);
  ring(g, light.x, light.y, rnd(32 * su), accent, 0.1, 30);

  // 云海：漂在晨光上方的暗云（有缺口，暖带才透得出来）
  const seaY = hz - rnd(13 * su);
  for (let i = 0; i < 4; i++) {
    const bx = rnd(w * (0.03 + i * 0.25));
    const cw = rnd(w * (0.15 + (i % 2) * 0.05));
    const ch = rnd(6 * su);
    fill(g, bx, seaY, cw, ch, C.night, 0.95);
    fill(g, bx + rnd(cw * 0.18), seaY - 1, rnd(cw * 0.52), 1, C.night, 0.95);
    fill(g, bx + rnd(cw * 0.1), seaY - 1, rnd(cw * 0.4), 1, accent, 0.3);
    fill(g, bx, seaY, rnd(cw * 0.34), 1, accent, 0.18);
  }

  // 天中云团：四朵，远小近大，受光顶边吃晨色
  const banks = [
    [0.06, 0.42, 0.26, 6, 0.55],
    [0.4, 0.3, 0.2, 5, 0.45],
    [0.7, 0.38, 0.3, 7, 0.5],
    [0.52, 0.56, 0.2, 4, 0.35],
  ];
  for (const [fx, fy, fw, fh, fa] of banks) {
    cloud(g, rnd(w * fx), rnd(hz * fy), rnd(w * fw), rnd(fh * su), C.nightSoft, fa, accent, 0.18);
  }

  // 北斗七星：斗身四星（勺底）+ 斗柄三星，星点大小有主次
  const STARS = [
    [0.615, 0.115, 2],
    [0.668, 0.15, 2],
    [0.715, 0.192, 3],
    [0.762, 0.176, 3],
    [0.822, 0.148, 3],
    [0.85, 0.215, 2],
    [0.79, 0.245, 4],
  ];
  const px = STARS.map(([fx, fy]) => ({ x: rnd(w * fx), y: rnd(L.h * fy) }));
  // 连线用 1px 暗金：先连线，星压在线上
  line(g, [px[0], px[1], px[2], px[3]], accent, 0.28);
  line(g, [px[3], px[4], px[5], px[6], px[3]], accent, 0.22);
  STARS.forEach(([, , r], i) => {
    const s = px[i];
    if (r === 4) {
      disc(g, s.x, s.y, rnd(6 * su), accent, 0.08);
      disc(g, s.x, s.y, rnd(4 * su), accent, 0.14);
    }
    disc(g, s.x, s.y, r, accent, 0.95);
    if (r >= 3) {
      fill(g, s.x, s.y - r - 2, 1, r * 2 + 5, accent, 0.45); // 十字星芒
      fill(g, s.x - r - 2, s.y, r * 2 + 5, 1, accent, 0.45);
    }
  });

  // 两端只在最边缘留半根断柱（不进场中央，免得跟钉柱叠成一片栅栏）
  fill(g, 0, hz - rnd(21 * su), rnd(9 * su), rnd(21 * su), C.void, 0.9);
  fill(g, 0, hz - rnd(21 * su), rnd(5 * su), rnd(4 * su), C.void, 0.9);
  fill(g, rnd(9 * su), hz - rnd(9 * su), rnd(5 * su), rnd(9 * su), C.void, 0.9);
  fill(g, w - rnd(7 * su), hz - rnd(14 * su), rnd(7 * su), rnd(14 * su), C.void, 0.9);
  fill(g, w - rnd(7 * su), hz - rnd(14 * su), 1, rnd(14 * su), accent, 0.16);
}

// ============================ 中景 ============================
export function mid(g, L) {
  const { w, h, horizon: hz, accent } = L;
  const u = uOf(L);
  const ground = groundOf(L);
  const cx = rnd(w / 2);

  // —— 地面先铺在中景层最底：先有平面，物件才站得住 ——
  fill(g, 0, hz, w, h - hz, C.ink, 1);
  const rows = [];
  let ry = hz;
  let rh = Math.max(5, rnd(6 * u));
  while (ry < h) {
    rows.push({ y: ry, h: Math.min(rh, h - ry) });
    ry += rh;
    rh = Math.max(5, Math.min(rnd(26 * u), rnd(rh + 4 * u))); // 越近石层越高：透视的收缩感
  }
  rows.forEach((r, i) => {
    // 光从地平线来：靠地平线的石层最亮，越往画面下方越暗（硬边分层，不做渐变）
    const lit = Math.max(0.26, 0.56 - i * 0.055);
    fill(g, 0, r.y, w, r.h, i % 2 === 0 ? C.stoneDark : C.stone, lit);
    // 横缝：贴地面；缝下留 1px 暗边，砖才有厚度
    fill(g, 0, r.y, w, 1, C.groove, 0.34);
    fill(g, 0, r.y + 1, w, 1, C.void, 0.45);
    // 错缝竖缝：奇偶行错开半砖，缝长跟着砖高
    for (let k = 0; k < 4; k++) {
      const jx = rnd(((k + (i % 2) * 0.5) * w) / 4 + ((i * 13 + k * 7) % 9) - 4);
      if (r.h > 3) {
        fill(g, jx, r.y + 1, 1, r.h - 1, C.groove, 0.3);
        fill(g, jx + 1, r.y + 2, 1, Math.max(1, r.h - 3), C.void, 0.4);
      }
    }
  });
  // 地平线脚下的暖反光：紧贴地平线的一两行石板被晨光照得最亮
  fill(g, 0, hz + 1, w, 2, accent, 0.16);
  fill(g, 0, hz + 3, w, 1, accent, 0.1);

  // 五条收向地平线中央的长缝：一点透视，把地面拉出纵深
  const vy = hz + rnd(2 * u);
  for (let k = -2; k <= 2; k++) {
    line(g, [{ x: cx + k * rnd(34 * u), y: vy }, { x: cx + k * rnd(118 * u), y: h }], C.groove, 0.12);
  }

  // 光池：accent 低 alpha 的长条，落在台阶踏面与地面凹处
  ellipse(g, cx, ground - rnd(14 * u), rnd(120 * u), rnd(16 * u), accent, 0.14);
  ellipse(g, cx, ground - rnd(13 * u), rnd(60 * u), rnd(8 * u), accent, 0.12);
  ellipseRing(g, cx, ground - rnd(14 * u), rnd(96 * u), rnd(13 * u), accent, 0.26, 26);
  for (const [yy, aa, hh] of [[ground - rnd(20 * u), 0.14, 1], [ground - rnd(14 * u), 0.18, 2], [ground - rnd(8 * u), 0.22, 2], [ground - rnd(2 * u), 0.26, 2]]) {
    fill(g, 0, yy, w, hh, accent, aa);
  }
  fill(g, 0, ground - rnd(22 * u), rnd(w * 0.42), 2, accent, 0.1);
  fill(g, rnd(w * 0.58), ground - rnd(19 * u), rnd(w * 0.42), 2, accent, 0.1);

  // 远排：七根钉柱，贴地平线一字排开，只做界桩（细、暗、帽子有一点晨光）
  const NAILS = [[0.06, 10], [0.12, 17], [0.18, 12], [0.24, 19], [0.76, 19], [0.82, 12], [0.88, 17]];
  for (const [fx, ph] of NAILS) {
    const px = rnd(w * fx);
    const base = hz + rnd(10 * u);
    const hh = rnd(ph * u);
    fill(g, px, base - hh, 2, hh, C.void, 1);
    fill(g, px + 1, base - hh, 1, hh, C.stoneLight, 0.28);
    fill(g, px - 1, base - hh - 1, 4, 2, C.void, 1);
    fill(g, px - 1, base - hh - 1, 4, 1, accent, 0.3);
    fill(g, px - 1, base - 1, 4, 1, C.void, 1);
  }

  // 中排：左右各三根断裂石柱，基座高度不同 → 一眼看出纵深
  const nearBase = ground - rnd(2 * u); // 近排站在碑座边上
  const farBase = hz + rnd((ground - hz) * 0.78); // 远排贴着地平线
  const cols = [
    { cx: 54, base: nearBase, w: rnd(22 * u), h: rnd(70 * u) },
    { cx: 122, base: farBase, w: rnd(15 * u), h: rnd(42 * u) },
    { cx: 426, base: nearBase, w: rnd(22 * u), h: rnd(70 * u) },
    { cx: 358, base: farBase, w: rnd(15 * u), h: rnd(42 * u) },
  ];
  cols.forEach((c, i) => brokenColumn(g, { ...c, u, seed: 17 + i * 7, accent }));

  // 近排：两座倒伏方尖碑，躺在碑座边上，影子方向一致（都朝远离中央光源的一侧）
  fallenObelisk(g, { x: 96, baseY: ground - rnd(2 * u), len: rnd(56 * u), h: rnd(16 * u), dir: -1, u });
  fallenObelisk(g, { x: rnd(w * 0.63), baseY: ground - rnd(9 * u), len: rnd(50 * u), h: rnd(14 * u), dir: 1, u });
  rubble(g, { x: rnd(w * 0.16), y: ground - rnd(6 * u), w: rnd(60 * u), h: rnd(5 * u), seed: 37, color: C.stoneDark, color2: C.void, count: 10, alpha: 0.75 });
  rubble(g, { x: rnd(w * 0.64), y: ground - rnd(13 * u), w: rnd(52 * u), h: rnd(5 * u), seed: 43, color: C.stoneDark, color2: C.void, count: 8, alpha: 0.7 });

  // 残烛：火早熄了，只剩蜡身、蜡痕与小石台（贴着地面/台阶，不悬空）
  const candle = (x, base, hgt, seed) => {
    fill(g, x - rnd(6 * u), base - rnd(4 * u), rnd(12 * u), rnd(4 * u), C.stoneDark, 0.85);
    fill(g, x - rnd(6 * u), base - rnd(4 * u), rnd(12 * u), 1, C.stone, 0.45);
    fill(g, x - 1, base - rnd(4 * u) - hgt, rnd(3 * u), hgt, C.bone, 0.9);
    fill(g, x - 1, base - rnd(4 * u) - hgt, 1, hgt, C.white, 0.5);
    fill(g, x, base - rnd(4 * u) - hgt - 2, 1, 2, C.void, 1); // 焦掉的烛芯
    fill(g, x + rnd(2 * u), base - rnd(4 * u) - rnd(hgt * 0.5), 1, rnd(hgt * 0.5), C.bone, 0.6); // 蜡泪
    fill(g, x + rnd(1 * u), base - rnd(1 * u), rnd(6 * u), 1, C.bone, 0.45); // 地上的蜡痕
    if (seed % 2) fill(g, x - rnd(4 * u), base - rnd(2 * u), rnd(4 * u), 1, C.bone, 0.35);
  };
  candle(148, ground - rnd(4 * u), rnd(9 * u), 1);
  candle(330, ground - rnd(11 * u), rnd(7 * u), 2);
  candle(rnd(w * 0.44), ground - rnd(21 * u), rnd(8 * u), 3);

  // —— 主体：断裂王座 ——
  // 断口透光：横屏断口在地平线以上，天幕已经透了光；竖屏断口落到地平线以下，
  // 背后是地面，就在地面上补一块亮斑，让"光从断口穿过来"两种比例都成立
  const gapTop = Math.max(hz, ground - rnd(90 * u));
  const gapBot = ground - rnd(68 * u);
  if (gapBot - gapTop > 2) {
    // 往地上散开成梯形（不是方形灯箱：硬边但不能是四平八稳的矩形）
    silhouette(g, [
      { x: cx - rnd(28 * u), y: gapTop },
      { x: cx + rnd(28 * u), y: gapTop },
      { x: cx + rnd(46 * u), y: gapBot },
      { x: cx - rnd(46 * u), y: gapBot },
    ], accent, 0.15);
    silhouette(g, [
      { x: cx - rnd(16 * u), y: gapTop + rnd(2 * u) },
      { x: cx + rnd(16 * u), y: gapTop + rnd(2 * u) },
      { x: cx + rnd(30 * u), y: gapBot },
      { x: cx - rnd(30 * u), y: gapBot },
    ], C.parchment, 0.16);
    // 落点最亮的一小条
    fill(g, cx - rnd(20 * u), gapBot - rnd(3 * u), rnd(40 * u), rnd(3 * u), C.arcaneLight, 0.3);
  }
  // 先画王座，再把通向它的三级石阶压在台座下沿：台阶在前、王座在后，纵深才成立
  throne(g, L, cx, ground);
  for (let i = 0; i < 3; i++) {
    const sw = rnd((156 + i * 24) * u);
    const sy = ground - rnd(12 * u) + i * rnd(4 * u);
    const sh = rnd(4 * u);
    const sx = cx - rnd(sw / 2);
    fill(g, sx, sy, sw, sh, C.void, 0.96);
    fill(g, sx, sy, sw, 1, C.stoneDark, 0.9); // 踏面
    fill(g, sx, sy, sw, 1, accent, 0.4 - i * 0.1); // 踏面前沿的逆光
    fill(g, sx + rnd(sw * 0.06), sy + 2, rnd(sw * 0.3), 1, C.groove, 0.3); // 踢面凿痕
    fill(g, sx + rnd(sw * 0.62), sy + 1, 1, Math.max(1, sh - 1), C.void, 0.8); // 阶沿缺口
  }

  // 悬浮尘埃：只飘在地平线上空（光柱里的亮尘）
  const DUST = [
    [0.42, 0.24, 1], [0.47, 0.19, 1], [0.52, 0.28, 2], [0.57, 0.22, 1],
    [0.44, 0.34, 1], [0.5, 0.38, 1], [0.55, 0.31, 2], [0.39, 0.41, 1],
    [0.61, 0.39, 1], [0.46, 0.43, 1], [0.53, 0.42, 1], [0.58, 0.36, 2],
    [0.43, 0.52, 1], [0.49, 0.56, 1], [0.55, 0.48, 1], [0.51, 0.62, 1],
  ];
  DUST.forEach(([fx, fy, dw], i) => {
    // 地平线以上的亮尘一律走幕色，落到地面的才掺几粒骨白
    const bone = fy > 0.44 && i % 2 === 0;
    fill(g, rnd(w * fx), rnd(h * fy), dw, 1, bone ? C.bone : accent, i % 2 ? 0.3 : 0.5);
  });
}

// ============================ 近景 ============================
export function fore(g, L) {
  const { w, accent } = L;
  const u = uOf(L);
  const pt = plinthTop(L);

  // 逆光雾：先垫在台阶后面（只有 1–2px 硬边，不做渐变）
  fill(g, 0, pt - rnd(30 * u), w, 2, C.fog, 0.05);
  fill(g, 0, pt - rnd(24 * u), w, 1, C.fog, 0.08);
  fill(g, rnd(w * 0.06), pt - rnd(18 * u), rnd(w * 0.36), 1, C.fog, 0.11);
  fill(g, rnd(w * 0.54), pt - rnd(20 * u), rnd(w * 0.38), 1, C.fog, 0.09);

  // 左右两段石阶压边：越靠上越窄，中间留出王座与光池（压边，不是铺地）
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const th = Math.max(3, rnd((7 - i) * u));
      const tw = rnd(152 - i * 17);
      const x = side < 0 ? -rnd(8 * u) : w - tw + rnd(8 * u);
      const y = pt - th * (i + 1);
      fill(g, x, y, tw, th, C.void, 0.96);
      fill(g, x, y, tw, 2, C.stoneDark, 0.95); // 踏面
      fill(g, x, y, tw, 2, C.stoneDark, 0.9); // 踏面
      fill(g, x, y, tw, 1, accent, 0.44 - i * 0.1); // 踏面前沿的逆光
      fill(g, x, y + th - 1, tw, 1, C.void, 1); // 踢面阴影
      fill(g, x + rnd(tw * (0.18 + i * 0.12)), y, rnd(10 * u), 2, C.void, 1); // 阶沿缺口
      fill(g, x + rnd(tw * 0.62), y + 1, rnd(8 * u), 1, C.sage, 0.3); // 苔贴阶沿
    }
  }

  // 阶下低雾：把近景和碑座晕在一起
  fill(g, 0, pt - rnd(6 * u), w, 1, C.fog, 0.1);
  fill(g, 0, pt - rnd(3 * u), w, 2, C.fog, 0.12);

  // 两侧角落的遮挡剪影：像站在更高一级台阶上往下看
  silhouette(g, [{ x: -rnd(6 * u), y: pt }, { x: -rnd(6 * u), y: pt - rnd(26 * u) }, { x: 18, y: pt - rnd(22 * u) }, { x: rnd(46 * u), y: pt - rnd(9 * u) }, { x: rnd(46 * u), y: pt }], C.void, 0.9);
  silhouette(g, [{ x: w + rnd(6 * u), y: pt }, { x: w + rnd(6 * u), y: pt - rnd(24 * u) }, { x: w - 22, y: pt - rnd(20 * u) }, { x: w - rnd(50 * u), y: pt - rnd(8 * u) }, { x: w - rnd(50 * u), y: pt }], C.void, 0.9);

  // 阶缝里的枯草四簇（每簇五根，长短不一）
  [0.08, 0.22, 0.78, 0.92].forEach((fx, i) => {
    const x = rnd(w * fx);
    for (let k = -2; k <= 2; k++) {
      const gh = rnd((5 + Math.abs(k) * 2) * u);
      fill(g, x + k * 2, pt - rnd(9 * u) - gh + 1, 1, gh, C.sage, 0.26 + (i % 2) * 0.08);
    }
  });
}
