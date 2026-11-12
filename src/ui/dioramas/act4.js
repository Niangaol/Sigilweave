// 第 IV 幕「沉钟书库」——三层静态布景。
// 构图（横屏 480×270，地平线 132，碑座 186 起）：
//   远景 0–132：石墙错缝 + 尖拱壁龛 + 高窗（全幕唯一光源）+ 两排高书架（外排高远、内排近大，
//                远近三档明度，柜体不贴画布边）+ 吊烛台
//   中景 132–186：石板地面与石缝 + 中央暗血织毯（近宽远窄、磨损缺口）+ 铜钟吊在钟架横梁下
//                （整体抬到地平线以上，落地影只落在石板上）+ 书梯 + 翻飞书页 + 地板书堆三排
//                 + 摊开书的阅读台 + 台角残烛
//   近景 186 起：左右石立柱 + 顶部半拱拱腹围成的画框（从拱下看进去）+ 内侧前景书架 + 飘落纸页 + 烛光雾
// 材质线全部依附实体：书脊烫线、隔板木纹、铜钟铸缝与铜锈、纸页边、石缝；浮尘只落在窗光柱里。
import {
  fill, pointedArch, ellipseRing, chain, candle, beam, silhouette, cracks, disc,
} from '../diorama-kit.js';
import { C } from '../Palette.js';

// 归一化锚点：seal = 钟顶吊点，gate = 钟口；两者都落在碑座上沿之上。
export const anchors = {
  seal: { x: 0.5, y: 0.42, r: 0.16 },
  gate: { x: 0.5, y: 0.58, r: 0.12 },
};

const R = Math.round;
// 固定种子序列：禁用 Math.random，同参两次绘制必须逐条指令一致。
function seq(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const tallU = (L) => (L.tall ? 1.6 : 1);   // 中景道具
const backV = (L) => (L.tall ? 1.9 : 1);   // 远景竖向节奏
const backH = (L) => (L.tall ? 1.35 : 1);  // 远景书脊宽
const groundOf = (L) => L.h - (L.tall ? 104 : 84); // 碑座上沿 = 最近一排物件的基座
const MOVES = [C.bloodDark, C.mossTileLit, C.runeDim]; // 书脊三色：暗红 / 苔绿 / 冷蓝

// 书架单元：柜体 + 逐层隔板 + 成簇书脊（三色错落，缺书处留黑洞）。
// tier 是纵深档位：0 远排（背板沉、书脊发灰）/ 1 中排 / 2 近排（受光棱与铜隔板更亮），
// 三档明度差让四座书架读成「由远及近」的排，而不是一堵墙。
// cap 控制单个书架的书脊总数，避免竖屏高书架把预算吃光。
function shelfUnit(g, { x, y, w, h, rowH, seed, bookW, bookH, cap = 60, alpha = 1, tier = 1 }) {
  const bodyA = [0.94, 0.9, 0.86][tier];
  const backC = tier === 0 ? C.void : C.stoneDark;
  const backA = [0.45, 0.35, 0.55][tier];
  const bookA = [0.72, 0.95, 1][tier];
  const litA = [0.18, 0.3, 0.5][tier];
  fill(g, x, y, w, h, C.void, bodyA * alpha);
  fill(g, x + 4, y, w - 8, h, backC, backA * alpha); // 柜内背板：远排更沉，近排稍亮
  fill(g, x, y, 4, h, C.stoneDark, 0.98 * alpha);
  fill(g, x + 4, y, 1, h, C.stoneLight, litA * alpha);
  fill(g, x + w - 4, y, 4, h, C.stoneDark, 0.98 * alpha);
  fill(g, x + w - 5, y, 1, h, C.stoneLight, litA * 0.75 * alpha);

  const levels = Math.max(2, Math.floor(h / rowH));
  const rnd = seq(seed);
  let total = 0;
  let lastCol = -1; // 相邻两本不同色，书脊才成簇而不是整片同色
  for (let i = 0; i < levels && total < cap; i++) {
    const boardY = y + (i + 1) * rowH - 2;
    if (boardY > y + h - 1) break;
    const maxH = Math.max(3, rowH - 4);
    let bx = x + 6;
    while (bx < x + w - 8 && total < cap) {
      const cluster = 2 + Math.floor(rnd() * 4);
      for (let b = 0; b < cluster && bx < x + w - 8 && total < cap; b++) {
        const bw = Math.max(2, R(bookW * (0.75 + rnd() * 0.6)));
        const bh = Math.max(3, Math.min(maxH, R(bookH * (0.5 + rnd() * 0.7))));
        let ci = Math.floor(rnd() * 3);
        if (ci === lastCol) ci = (ci + 1 + Math.floor(rnd() * 2)) % 3;
        lastCol = ci;
        const col = MOVES[ci];
        const bw2 = Math.min(bw, x + w - 6 - bx);
        fill(g, bx, boardY - bh, bw2, bh, col, bookA * alpha);
        fill(g, bx, boardY - bh, bw2, 1, C.stoneLight, 0.34 * alpha);      // 书脊顶受光
        if (rnd() > 0.7) fill(g, bx, boardY - bh + 2, 1, Math.max(1, bh - 4), C.tan, 0.35 * alpha); // 书脊烫线
        if (rnd() > 0.9) fill(g, bx, boardY - bh + 3, bw2, 1, C.parchment, 0.3 * alpha);             // 纸口标签
        bx += bw + 1;
        total += 1;
      }
      bx += 2 + Math.floor(rnd() * 4); // 簇间缺书，露出柜体黑洞
    }
    // 隔板最后画：书脊压在板下沿，板面 + 上棱受光 + 木纹 + 板下 1px 阴影
    fill(g, x, boardY, w, 2, tier === 0 ? C.ink : C.brassDark, 0.95 * alpha);
    fill(g, x, boardY, w, 1, C.tan, [0.18, 0.34, 0.44][tier] * alpha);
    fill(g, x, boardY + 2, w, 1, C.void, 0.5 * alpha);
    if (i % 2 === 0) fill(g, x + 6, boardY + 1, R(w * 0.5), 1, C.ink, 0.5 * alpha);
    fill(g, x, y + i * rowH, w, 1, C.ink, 0.6 * alpha);
  }
  // 柜顶檐口与铁角
  fill(g, x - 2, y - 3, w + 4, 3, C.stoneDark, 0.98 * alpha);
  fill(g, x - 2, y - 3, w + 4, 1, C.tan, 0.22 * alpha);
  fill(g, x + 1, y - 2, 2, 2, C.brassDark, 0.9 * alpha);
  fill(g, x + w - 3, y - 2, 2, 2, C.brassDark, 0.9 * alpha);
}

// 飘页：四边不齐的硬边纸片 + 折角 + 两行字，tilt 控制倾斜方向。
function looseLeaf(g, { x, y, w, h, tilt = 1, alpha = 1, shadow = false }) {
  const dx = Math.max(2, R(w * 0.35));
  const pts = tilt >= 0
    ? [{ x, y: y + R(h * 0.2) }, { x: x + w, y }, { x: x + w, y: y + R(h * 0.8) }, { x, y: y + h }]
    : [{ x, y }, { x: x + w, y: y + R(h * 0.22) }, { x: x + w, y: y + h }, { x, y: y + R(h * 0.8) }];
  if (shadow) silhouette(g, pts.map(p => ({ x: p.x + 2, y: p.y + 2 })), C.void, 0.4 * alpha);
  silhouette(g, pts, C.parchment, alpha);
  silhouette(g, [
    { x: x + w - dx, y: y + R(h * 0.08) },
    { x: x + w, y: y + R(h * 0.08) },
    { x: x + w, y: y + R(h * 0.34) },
  ], C.bone, 0.9 * alpha);
  fill(g, x + 2, y + R(h * 0.46), Math.max(1, w - 4), 1, C.groove, 0.55 * alpha);
  fill(g, x + 2, y + R(h * 0.66), Math.max(1, w - 6), 1, C.groove, 0.4 * alpha);
}

// 地板书堆：书本平叠，封面 2px 边 + 书页口，层与层之间压 1px 暗缝。
function bookStack(g, { x, baseY, count, u, seed, alpha = 1 }) {
  const rnd = seq(seed);
  let y = baseY;
  for (let i = 0; i < count; i++) {
    const bw = Math.max(10, R((15 + rnd() * 10) * u));
    const bh = Math.max(2, R(4 * u));
    const bx = x + R((rnd() - 0.5) * 6 * u);
    const col = [C.bloodDark, C.mossTileLit, C.runeDim, C.brassDark][i % 4];
    fill(g, bx, y - bh, bw, bh, col, alpha);
    fill(g, bx, y - bh, bw, 1, C.stoneLight, 0.34);
    fill(g, bx + bw - 2, y - bh + 1, 2, Math.max(1, bh - 2), C.parchment, 0.55); // 书页口
    fill(g, bx, y - 1, bw, 1, C.ink, 0.6);
    y -= bh;
  }
  // 落地阴影
  fill(g, x - 3, baseY, Math.max(10, R(26 * u)), 1, C.void, 0.55);
  fill(g, x + 3, baseY + 1, Math.max(8, R(18 * u)), 1, C.void, 0.3);
}

// 阅读台：木桌 + 摊开的书（两页斜面、中缝、三行字）。
function readingDesk(g, cx, baseY, u, accent) {
  const topW = R(56 * u);
  const topH = Math.max(3, R(5 * u));
  const topY = baseY - R(24 * u);
  const legH = baseY - (topY + topH);
  const legW = Math.max(3, R(4 * u));
  for (const lx of [cx - R(topW / 2) + R(4 * u), cx + R(topW / 2) - R(4 * u) - legW]) {
    fill(g, lx, topY + topH, legW, legH, C.brassDark, 1);
    fill(g, lx, topY + topH, 1, legH, C.tan, 0.3);
    fill(g, lx - 1, baseY - 2, legW + 2, 2, C.ink, 0.85);
  }
  fill(g, cx - R(topW / 2) + R(6 * u), baseY - R(7 * u), topW - R(12 * u), 2, C.ink, 0.8);
  fill(g, cx - R(topW / 2), topY, topW, topH, C.brassDark, 1);
  fill(g, cx - R(topW / 2), topY, topW, 1, C.tan, 0.5);
  fill(g, cx - R(topW / 2), topY + topH - 1, topW, 1, C.ink, 0.7);

  const bookW = R(44 * u);
  const bookH = R(13 * u);
  const bx = cx - R(bookW / 2);
  const by = topY - bookH;
  silhouette(g, [
    { x: bx, y: by + R(bookH * 0.58) },
    { x: cx - 1, y: by + R(bookH * 0.9) },
    { x: cx - 1, y: by + R(bookH * 0.22) },
    { x: bx, y: by },
  ], C.parchment, 0.97);
  silhouette(g, [
    { x: cx + 1, y: by + R(bookH * 0.9) },
    { x: bx + bookW, y: by + R(bookH * 0.58) },
    { x: bx + bookW, y: by },
    { x: cx + 1, y: by + R(bookH * 0.22) },
  ], C.parchment, 0.97);
  fill(g, cx - 1, by + R(bookH * 0.2), 2, R(bookH * 0.72), C.brassDark, 0.95);
  for (let i = 0; i < 3; i++) {
    fill(g, bx + R(bookW * 0.12), by + R(bookH * (0.34 + i * 0.15)), R(bookW * 0.28), 1, C.stoneDark, 0.5);
    fill(g, bx + R(bookW * 0.6), by + R(bookH * (0.34 + i * 0.15)), R(bookW * 0.28), 1, C.stoneDark, 0.5);
  }
  fill(g, bx, by, 1, R(bookH * 0.55), C.bone, 0.6);
  fill(g, bx + bookW - 1, by, 1, R(bookH * 0.55), C.bone, 0.6);
  // 桌上残烛：阅读台自己的一点光源（幕色 accent），让「有人刚离开」有落点
  const cdx = cx + R(topW * 0.36);
  fill(g, cdx - 2, topY - 2, 5, 2, C.brassDark, 1);
  candle(g, {
    x: cdx, baseY: topY - 2, h: Math.max(4, R(6 * u)),
    wax: C.bone, flame: accent, holder: C.brassDark, alpha: 0.92,
  });
  fill(g, cx - R(topW / 2) - 1, baseY, topW + 2, 1, C.void, 0.55); // 桌脚阴影
}

// 短吊链：每节 2×3，隔节换横向 3×1 环——别用 1px 长直线（1x 下会被读成拉丝）
function shortChain(g, x, yTop, yBot, color, alpha) {
  let y = R(yTop), i = 0;
  const yEnd = R(yBot);
  for (; y < yEnd; y += 3) {
    const hh = Math.max(1, Math.min(3, yEnd - y));
    if (i % 2 === 0) fill(g, x, y, 2, hh, color, alpha);
    else fill(g, x - 1, y, 3, 1, color, alpha);
    i += 1;
  }
}

export function back(g, L) {
  const { w, horizon, accent } = L;
  const bv = backV(L);
  const bh = backH(L);
  const cx = R(w / 2);

  // 石墙：底色 + 错缝砌块（只留横向灰缝，竖缝交给壁龛与书架去断）
  fill(g, 0, 0, w, horizon, C.void, 1);
  fill(g, 0, 0, w, horizon, C.nightDeep, 1);
  fill(g, 0, 0, w, R(horizon * 0.14), C.void, 0.55);
  const courseH = Math.max(8, R(12 * bv));
  for (let y = 0; y < horizon; y += courseH) {
    fill(g, 0, y, w, 1, C.stoneDark, 0.35);
    fill(g, 0, y + 1, w, 1, C.ink, 0.45);
    const off = (y / courseH) % 2 === 0 ? 0 : R(w / 12);
    for (let k = 0; k < 5; k++) fill(g, off + k * R(w / 6), y, 1, courseH, C.stoneDark, 0.22);
  }

  // 中央尖拱壁龛：把高窗嵌进穹顶，两侧墙自然退到书架后
  const nicheW = R(w * 0.40);
  const nicheBase = horizon;
  const nicheH = R(horizon * 0.94);
  pointedArch(g, {
    cx, baseY: nicheBase, w: nicheW, h: nicheH, t: 2,
    color: C.stoneDark, alpha: 0.85, fillColor: C.void, fillAlpha: 0.5, segs: 16,
  });
  pointedArch(g, {
    cx, baseY: nicheBase, w: nicheW - 10, h: nicheH - 8, t: 1,
    color: C.stoneLight, alpha: 0.18, segs: 16,
  });

  // 两排高书架：外排（高、小书、发灰）/ 内排（近、大书、受光），左右各一，中央让给壁龛。
  // 柜体统一内缩 pad：书架顶到画布边缘会被读成「墙」，留一条墙缝才读得出是书架。
  const pad = Math.max(4, R(6 * bv));
  const farY = R(horizon * 0.18);
  const farW = R(w * 0.30);
  shelfUnit(g, {
    x: pad, y: farY, w: farW, h: horizon - farY, rowH: R(22 * bv), seed: 101,
    bookW: R(2 * bh), bookH: R(9 * bv), cap: L.tall ? 96 : 60, tier: 0,
  });
  shelfUnit(g, {
    x: w - farW - pad, y: farY, w: farW, h: horizon - farY, rowH: R(22 * bv), seed: 202,
    bookW: R(2 * bh), bookH: R(9 * bv), cap: L.tall ? 96 : 60, tier: 0,
  });
  const nearY = R(horizon * 0.46);
  const nearW = R(w * 0.19);
  shelfUnit(g, {
    x: pad + 2, y: nearY, w: nearW, h: horizon - nearY, rowH: R(20 * bv), seed: 303,
    bookW: R(3 * bh), bookH: R(14 * bv), cap: 40, tier: 2,
  });
  shelfUnit(g, {
    x: w - nearW - pad - 2, y: nearY, w: nearW, h: horizon - nearY, rowH: R(20 * bv), seed: 404,
    bookW: R(3 * bh), bookH: R(14 * bv), cap: 40, tier: 2,
  });

  // 壁龛两侧的竖向石边框（书架画完再补，壁龛才不会被吃掉）
  for (const jx of [R(w / 2 - nicheW / 2), R(w / 2 + nicheW / 2) - 2]) {
    fill(g, jx, 0, 2, horizon, C.stoneDark, 0.5);
    fill(g, jx + (jx < cx ? 2 : 0), 0, 1, horizon, C.stoneLight, 0.14);
  }

  // 高窗：尖拱 + 冷蓝玻璃 + 竖棂 + 幕色月晕（全幕唯一主光源）
  const winW = R(76 * (L.tall ? 1.3 : 1));
  const winBase = R(horizon * 0.70);
  const winH = R(horizon * 0.62);
  const winTop = winBase - winH;
  pointedArch(g, { cx, baseY: winBase + 2, w: winW + 24, h: winH + 12, t: 1, color: accent, alpha: 0.12, segs: 16 });
  pointedArch(g, {
    cx, baseY: winBase, w: winW + 12, h: winH + 6, t: 2, color: C.stoneDark, alpha: 0.9,
    fillColor: C.void, fillAlpha: 0.85, segs: 16,
  });
  pointedArch(g, { cx, baseY: winBase, w: winW + 6, h: winH + 2, t: 1, color: C.groove, alpha: 0.3, segs: 16 });
  pointedArch(g, { cx, baseY: winBase - 1, w: winW, h: winH - 2, t: 0, fillColor: C.runeDim, fillAlpha: 0.62, segs: 16 });
  // 铅条竖格：冷蓝玻璃分 5 条，隔行加一档幕色，像铅条拼花而不是一块蓝布
  for (let i = 0; i < 5; i++) {
    const pw = R((winW - 4) / 5);
    const px = cx - R((winW - 4) / 2) + i * pw;
    fill(g, px, winBase - winH + 4, pw - 1, winH - 8, accent, i % 2 === 0 ? 0.12 : 0.05);
  }
  disc(g, cx, winTop + R(winH * 0.34), R(winW * 0.3), accent, 0.14);
  disc(g, cx, winTop + R(winH * 0.34), R(winW * 0.2), C.parchment, 0.12);
  // 竖棂与横档：只画到拱肩以下，避免爬出拱尖
  const mullH = R(winH * 0.52);
  for (const off of [-1, 1]) {
    fill(g, cx + off * R(winW / 4), winBase - mullH, 2, mullH, C.ink, 0.9);      // 竖棂 2px，玻璃才读得出窗格
    fill(g, cx + off * R(winW / 4), winBase - mullH, 1, mullH, C.stoneLight, 0.12);
  }
  fill(g, cx - R(winW / 2 - 3), winBase - mullH, winW - 6, 2, C.ink, 0.9);        // 横档
  fill(g, cx - R(winW / 2 - 3), winBase - mullH, winW - 6, 1, C.stoneLight, 0.22);
  const mullH2 = R(winH * 0.74);
  fill(g, cx - R(winW / 2 - 5), winBase - mullH2, winW - 10, 1, C.ink, 0.55);      // 拱肩处细横档
  ellipseRing(g, cx, winTop + R(winH * 0.34), R(winW * 0.14), R(winW * 0.14), C.brassDark, 0.55);
  // 窗台
  fill(g, cx - R(winW / 2) - 8, winBase, winW + 16, 4, C.stoneDark, 0.95);
  fill(g, cx - R(winW / 2) - 8, winBase, winW + 16, 1, C.tan, 0.3);
  fill(g, cx - R(winW / 2) - 6, winBase + 4, winW + 12, 1, C.void, 0.6);

  // 窗光柱：三档宽度，只落在钟与地板上，绝不做整屏染色
  for (const [sw, sa] of [[64, 0.07], [44, 0.06], [24, 0.05]]) {
    fill(g, cx - R(sw / 2), winBase + 4, R(sw), horizon - winBase - 4, accent, sa);
  }

  // 吊烛台两盏：铁链 + 铁环 + 三烛，火苗同用幕色（全幕只有这一处光源色）
  for (const sx of [R(w * 0.33), R(w * 0.67)]) {
    const ringY = R(horizon * 0.40);
    chain(g, {
      x: sx, y: 2, h: ringY - 2, color: C.stoneLight, alpha: 0.4,
      linkH: Math.max(4, R(6 * bv)),
    });
    const rx = R(14 * (L.tall ? 1.2 : 1));
    const ry = Math.max(2, R(3 * (L.tall ? 1.2 : 1)));
    ellipseRing(g, sx, ringY, rx, ry, C.inkDark, 0.95);
    ellipseRing(g, sx, ringY - 1, rx, ry, C.stoneLight, 0.3);
    fill(g, sx - 1, ringY - 4, 3, 3, C.brassDark, 0.9);
    for (const dx of [-7, 0, 7]) {
      const cxx = sx + R(dx * (L.tall ? 1.25 : 1));
      candle(g, {
        x: cxx, baseY: ringY - 1, h: R(10 * (L.tall ? 1.3 : 1)),
        wax: C.bone, flame: accent, holder: C.brassDark, alpha: 0.98,
      });
      disc(g, cxx + 1, ringY - R(12 * (L.tall ? 1.3 : 1)), R(4 * (L.tall ? 1.2 : 1)), accent, 0.1);
    }
  }
}

// 书梯：双轨斜靠左侧书架，踏板与轨面受光边给木色。
function bookLadder(g, L, ground) {
  const u = tallU(L);
  const topY = L.horizon - R(70 * (L.tall ? 1.5 : 1));
  const footX = R(L.w * 0.155);
  const topX = R(L.w * 0.225);
  const spread = Math.max(8, R(14 * u));
  const railH = ground - topY;
  const n = Math.max(8, Math.min(48, R(railH / 6)));
  const segH = Math.max(2, R(railH / n) + 1);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const y = R(ground + (topY - ground) * t);
    const x = R(footX + (topX - footX) * t);
    fill(g, x, y, 2, segH, C.tan, 0.55);
    fill(g, x + 1, y, 1, segH, C.brassDark, 0.95);
    fill(g, x + spread, y, 2, segH, C.brassDark, 0.95);
    fill(g, x + spread, y, 1, segH, C.stoneDark, 0.6);
  }
  const rungN = Math.max(5, Math.min(13, R(railH / 18)));
  for (let i = 1; i < rungN; i++) {
    const t = i / rungN;
    const y = R(ground + (topY - ground) * t);
    const x = R(footX + (topX - footX) * t);
    fill(g, x, y, spread + 2, 2, C.brassDark, 1);
    fill(g, x, y, spread + 2, 1, C.tan, 0.45);
  }
  // 挂钩与落地阴影
  fill(g, topX - 1, topY - 2, spread + 4, 2, C.stoneLight, 0.5);
  fill(g, footX - 3, ground, spread + 10, 1, C.void, 0.5);
  fill(g, footX + 1, ground + 1, spread + 4, 1, C.void, 0.28);
}

/**
 * 中景：地面先铺底，再让所有物件站上去。地面只画在中景层，近景绝不铺地。
 */
export function mid(g, L) {
  const { w, horizon, accent } = L;
  const u = tallU(L);
  const ground = groundOf(L);
  const floorH = ground - horizon; // 地板只铺到碑座上沿，碑座区留空给铭文
  const cx = R(w / 2);
  const farY = horizon + R(floorH * 0.24);
  const midY = horizon + R(floorH * 0.55);

  // 地面：石色底 + 逐行错缝石板 + 板缝受光棱
  fill(g, 0, horizon, w, floorH, C.stoneDark, 0.92);
  fill(g, 0, horizon, w, R(floorH * 0.3), C.stone, 0.22);
  fill(g, 0, horizon, R(w * 0.07), floorH, C.void, 0.4);
  fill(g, w - R(w * 0.07), horizon, R(w * 0.07), floorH, C.void, 0.4);
  const bands = Math.min(L.tall ? 9 : 5, Math.max(3, R(floorH / (14 * (L.tall ? 1.6 : 1)))));
  const rowH = Math.max(4, R(floorH / bands));
  const tileW = R(w / 8);
  for (let r = 0; r < bands; r++) {
    const y = horizon + r * rowH;
    for (let c = -1; c < 9; c++) {
      const tx = c * tileW + (r % 2 === 0 ? 0 : R(tileW / 2));
      if ((r + c) % 2 === 0) fill(g, tx, y, tileW, rowH, C.stone, 0.1); // 棋盘微差，读作石板
      fill(g, tx, y, 1, rowH, C.groove, 0.16);                          // 纵缝
    }
    fill(g, 0, y, w, 1, C.ink, 0.7);
    fill(g, 0, y + 1, w, 1, C.stoneLight, 0.1);
  }
  // 透视线：从地平线中轴散向碑座，强化纵深
  for (let k = -3; k <= 3; k++) {
    if (k === 0) continue;
    const x0 = cx + k * R(w * 0.03);
    const x1 = cx + k * R(w * 0.10);
    silhouette(g, [
      { x: x0, y: horizon }, { x: x0 + 1, y: horizon },
      { x: x1 + 1, y: ground }, { x: x1, y: ground },
    ], C.groove, 0.1);
  }
  // 中央走道：一整块平铺的透视梯形毯（一次多边形 fill，不再逐排收分成台阶）。
  // 起点退到地平线下方 14px 之后：钟的落地影必须落在石板上，毯不能盖住影子。
  const rugTop = horizon + Math.max(14, R(18 * u));
  const rugH = Math.max(8, ground - rugTop);
  // 毯宽：横屏 0.055→0.072、0.15→0.185；竖屏 480 宽的 15% 只有 72px，1x 下毯细得像个柱础
  const rugWTop = Math.max(14, R(w * 0.072));
  const rugWBot = Math.max(22, R(w * 0.185));
  const rugHalf = (t) => R((rugWTop + (rugWBot - rugWTop) * t) / 2);
  const rugPts = [
    { x: cx - R(rugWTop / 2), y: rugTop },
    { x: cx + R(rugWTop / 2), y: rugTop },
    { x: cx + R(rugWBot / 2), y: ground },
    { x: cx - R(rugWBot / 2), y: ground },
  ];
  // 毯下先垫一层暗底：地板石板缝会从半透明毯面透出来，读成一级级台阶
  silhouette(g, rugPts, C.void, 0.68);
  silhouette(g, rugPts, C.bloodDark, 0.42);
  // 横向织纹只留极淡的 1px（纬线），间隔 10–14px，跟着梯形收分
  const weftStep = Math.max(10, R(12 * u));
  for (let yy = rugTop + weftStep; yy < ground - 2; yy += weftStep) {
    const t = (yy - rugTop) / rugH;
    const ww = Math.max(6, rugHalf(t) * 2 - 2);
    fill(g, cx - R(ww / 2), yy, ww, 1, C.blood, 0.1);
  }
  // 左右各 1px 边线，按段跟随斜边（不用整块深色缝）
  const edgeStep = Math.max(6, R(8 * u));
  for (let yy = rugTop; yy < ground; yy += edgeStep) {
    const t = Math.min(1, (yy - rugTop) / rugH);
    const half = rugHalf(t);
    const hh = Math.min(edgeStep, ground - yy);
    fill(g, cx - half, yy, 1, hh, C.blood, 0.3);
    fill(g, cx + half - 1, yy, 1, hh, C.blood, 0.3);
  }
  // 磨损缺口：两处贴边剪掉（2×2 / 3×2），露出石板才像用旧的毯
  for (const [nt, nside, nw] of [[0.34, -1, 3], [0.7, 1, 2]]) {
    const ny = rugTop + R(rugH * nt);
    const half = rugHalf(nt);
    fill(g, nside < 0 ? cx - half : cx + half - nw, ny, nw, 2, C.stoneDark, 0.92);
  }
  // 近端流苏：3–4 根，长短略参差
  for (let i = 0; i < 4; i++) {
    const tx = cx + R(rugWBot * [-0.34, -0.11, 0.13, 0.35][i]);
    fill(g, tx, ground - 1, i % 2 === 0 ? 1 : 2, i % 3 === 0 ? 2 : 1, C.blood, 0.3);
  }
  // 地面靠碑座一侧收边：压暗两行 + 一道石沿受光，读作「地板到此为止」
  fill(g, 0, ground - 2, w, 2, C.void, 0.45);
  fill(g, 0, ground - 1, w, 1, C.stoneLight, 0.2);

  // 石板主裂缝（贴地，不浮空）
  cracks(g, {
    x: R(w * 0.63), y: horizon + 3,
    len: Math.min(40, Math.max(10, R(floorH * 0.55))), seed: 47,
    color: C.ink, alpha: 0.9, branches: 1, drift: 4,
  });
  cracks(g, {
    x: R(w * 0.19), y: horizon + R(floorH * 0.5),
    len: Math.min(26, Math.max(8, R(floorH * 0.3))), seed: 91,
    color: C.ink, alpha: 0.75, branches: 1, drift: 3,
  });

  // 窗光落地：钟下一圈硬边光池（唯一亮区）
  const poolY = ground - R(8 * u);
  ellipseRing(g, cx, poolY, R(52 * u), R(8 * u), accent, 0.2);
  ellipseRing(g, cx, poolY, R(38 * u), R(5 * u), accent, 0.16);
  fill(g, cx - R(44 * u), poolY - R(3 * u), R(88 * u), R(6 * u), accent, 0.06);

  // 书堆三排：远排小（贴地平线）、中排居中、近排大（压到碑座边）
  bookStack(g, { x: R(w * 0.80), baseY: farY, count: 3, u, seed: 71 });
  bookStack(g, { x: R(w * 0.575), baseY: midY, count: 4, u, seed: 72 });
  bookStack(g, { x: R(w * 0.30), baseY: ground, count: 6, u, seed: 73 });

  // 阅读台（摊开书）
  readingDesk(g, R(w * 0.735), ground, u, accent);

  // 书梯
  bookLadder(g, L, ground);

  if (L.tall) {
    // 竖屏地板更宽，补两堆书与一摞散页撑住近排
    bookStack(g, { x: R(w * 0.18), baseY: ground - R(44 * u), count: 3, u, seed: 74 });
    bookStack(g, { x: R(w * 0.86), baseY: midY + R(30 * u), count: 4, u, seed: 75 });
    looseLeaf(g, {
      x: R(w * 0.24), y: ground - R(70 * u), w: R(9 * u), h: R(11 * u), tilt: 1, alpha: 0.8,
    });
  }

  // 地面小物：残烛、倒伏书、贴地散页，撑住近排空地
  candle(g, {
    x: R(w * 0.205), baseY: ground - 1, h: Math.max(6, R(9 * u)),
    wax: C.bone, flame: accent, holder: C.brassDark, alpha: 0.9,
  });
  fill(g, R(w * 0.205) - 4, ground - 1, 11, 1, C.void, 0.35);
  bookStack(g, { x: R(w * 0.905), baseY: ground - 1, count: 2, u, seed: 77 });
  looseLeaf(g, {
    x: R(w * 0.245), y: ground - Math.max(3, R(5 * u)),
    w: Math.max(6, R(8 * u)), h: Math.max(3, R(5 * u)), tilt: -1, alpha: 0.85,
  });

  // 中央铜钟：吊在钟架横梁下，整体抬到地平线以上（钟口离地 6px），
  // 落地影只落在石板上——钟口不再压着织毯，才不会被读成一顶「金色帐篷」。
  const seal = L.anchors.seal;
  const bellBot = horizon - 6;
  const bellH = Math.max(34, R(45 * u));            // 本幕唯一主物，再放大 10–15%
  const bellTop = bellBot - bellH;
  const mouthW = Math.max(22, R(bellH * 0.92));
  const topW = Math.max(8, R(bellH * 0.26));
  const lipH = Math.max(2, Math.min(4, R(3 * u)));
  const lipW = mouthW + 2;
  // 横梁只比钟口宽出「两侧各 24–30u」：短梁才像钟架，通栏长杆会被读成一根拉丝
  const beamW = mouthW + 2 * Math.max(24, R(28 * u));
  const beamX = cx - R(beamW / 2);
  const beamH = Math.max(3, R(4 * u));
  const beamY = bellTop - Math.max(10, R(12 * u));

  // 钟架横梁：梁身深铜，只有下沿 1px 亮金；两端牛腿石托 + 到顶吊链
  fill(g, beamX, beamY, beamW, beamH, C.brassDark, 0.9);
  fill(g, beamX, beamY, beamW, 1, C.ink, 0.75);                             // 梁顶背光
  fill(g, beamX, beamY + beamH - 1, beamW, 1, C.brass, 0.5);                // 下沿受光
  for (const cside of [-1, 1]) {
    const cbw = Math.max(8, R(9 * u));
    const cbx = cside < 0 ? beamX : beamX + beamW - cbw;
    const cbh = Math.max(4, R(5 * u));
    fill(g, cbx, beamY + beamH, cbw, cbh, C.stoneDark, 0.95);              // 牛腿石托
    fill(g, cbx, beamY + beamH, cbw, 1, C.stoneLight, 0.32);               // 托面受光
    fill(g, cbx, beamY + beamH + cbh - 1, cbw, 1, C.void, 0.5);            // 托底暗缝
  }
  for (const bxx of [seal.x - R(beamW * 0.3), seal.x + R(beamW * 0.3)]) {
    fill(g, bxx - 1, beamY - 1, 3, beamH + 2, C.brassDark, 0.95);           // 铁箍
    fill(g, bxx - 1, beamY, 1, beamH, C.tan, 0.3);
    shortChain(g, bxx, 0, Math.max(2, beamY - 1), C.stoneLight, 0.3);       // 到顶吊链
  }

  // 钟轭横条 + 吊环 + 2–3 节短链（每节 2×3 交替方向，不是 1px 长直线）
  const yokeW = Math.max(8, R(mouthW * 0.36));
  const yokeH = Math.max(2, R(2 * u));
  const yokeY = bellTop - yokeH;
  fill(g, seal.x - R(yokeW / 2), yokeY, yokeW, yokeH, C.brassDark, 1);   // 钟轭（木/铜横木）
  fill(g, seal.x - R(yokeW / 2), yokeY, yokeW, 1, C.tan, 0.45);
  fill(g, seal.x - R(yokeW / 2), yokeY + yokeH - 1, yokeW, 1, C.ink, 0.7);
  const ringY = yokeY - Math.max(2, R(2 * u));
  ellipseRing(g, seal.x, ringY, Math.max(2, R(2.6 * u)), 1, C.brassDark, 0.95);
  shortChain(g, seal.x, beamY + beamH, ringY - 1, C.brassDark, 0.95);

  // 钟体：深铜剪影。主体 C.brassDark 一档到底，只在左棱留 C.brass 一道、
  // 内侧 1px C.brassLight 高光；轮廓是「肩收—腰直—口沿外撇」的钟形，不是梯形或金块。
  const nBand = Math.max(10, Math.min(16, R(bellH / 2.4)));
  for (let i = 0; i < nBand; i++) {
    const t0 = i / nBand;
    const t1 = (i + 1) / nBand;
    const y = bellTop + R(bellH * t0);
    const hh = Math.max(1, bellTop + R(bellH * t1) - y);
    const f = t1 < 0.18 ? 0.04 + 0.11 * (t1 / 0.18) : 0.16 + 0.84 * Math.pow((t1 - 0.18) / 0.82, 2.6);
    const ww = Math.max(6, R(topW + (mouthW - topW) * f));
    const wx = seal.x - R(ww / 2);
    fill(g, wx, y, ww, hh, C.brassDark, 1);                                    // 深铜主体
    fill(g, wx + R(ww * 0.6), y, Math.max(1, R(ww * 0.4)), hh, C.ink, 0.45);   // 右侧转暗
    fill(g, wx, y, 1, hh, C.brass, 0.9);                                       // 左棱：唯一的亮金
    fill(g, wx + 1, y, 1, hh, C.brassLight, 0.42);                             // 内侧 1px 高光
    fill(g, wx + 2, y, 1, hh, C.brass, 0.22);                                  // 高光外一档过渡
    fill(g, wx, y, ww, hh, C.ink, 0.1);                                        // 整体压一档：沉铜不金
    if (i === 2 || i === nBand - 3) fill(g, wx + 1, y, Math.max(1, ww - 2), 1, C.ink, 0.5); // 铸缝
    if (i === R(nBand * 0.58)) fill(g, wx + 1, y, Math.max(1, R(ww * 0.5)), 1, C.brassLight, 0.24);
  }

  // 钟口内壁：逐行收在钟身轮廓之内（宽度随钟身收分），不是一块伸出钟外的黑影
  const mouthTop = bellBot - lipH - Math.max(5, R(7 * u));
  for (let yy = mouthTop; yy < bellBot - lipH; yy++) {
    const tt = (yy - bellTop) / bellH;
    const ff = tt < 0.18 ? 0.04 + 0.11 * (tt / 0.18) : 0.16 + 0.84 * Math.pow((tt - 0.18) / 0.82, 2.6);
    const bw = topW + (mouthW - topW) * ff;
    const cw = Math.max(3, R(bw * 0.7));
    fill(g, seal.x - R(cw / 2), yy, cw, 1, C.void, 0.95);
  }
  // 唇边只比钟身宽 2px；[bellBot-lipH, bellBot) 这一段把暗腔封死——是钟口，不是底座
  fill(g, seal.x - R(lipW / 2), bellBot - lipH, lipW, lipH, C.brassDark, 1);
  fill(g, seal.x - R(lipW / 2), bellBot - lipH, 1, lipH, C.brass, 0.45); // 只留左 1px 受光，别把唇边画成托板
  fill(g, seal.x - R(lipW / 2), bellBot - 1, lipW, 1, C.ink, 0.75);

  // 钟舌：钟内 1px 吊索 + 2×4 锤，从钟口的暗腔里露出来
  const clapH = Math.max(3, R(4 * u));
  const clapBot = bellBot - lipH;
  fill(g, seal.x, mouthTop, 1, Math.max(2, clapBot - clapH - mouthTop), C.brassDark, 0.95);
  fill(g, seal.x - 1, clapBot - clapH, 2, clapH, C.brassDark, 1);
  fill(g, seal.x - 1, clapBot - clapH, 2, 1, C.brass, 0.4);

  // 落地影：压在地平线下的石板上（织毯从 horizon+14 才起步，影子绝不落在红毯上）
  fill(g, seal.x - R(lipW * 0.6), horizon + 1, R(lipW * 1.2), 3, C.void, 0.45);
  fill(g, seal.x - R(lipW * 0.35), horizon + 4, R(lipW * 0.7), 2, C.void, 0.4);

  // 铜锈只贴铜件（钟身与唇边），不落地
  for (const [ox, oy, ow, oh, cc, aa] of [
    [-0.3, 0.42, 2, 2, C.rot, 0.45],
    [0.24, 0.6, 1, 2, C.rot, 0.4],
    [-0.12, 0.78, 2, 1, C.sage, 0.3],
    [0.3, 0.3, 1, 1, C.sage, 0.28],
  ]) {
    fill(g, seal.x + R(mouthW * ox), bellTop + R(bellH * oy), ow, oh, cc, aa);
  }

  // 翻飞书页 5 张（静态固定坐标，深浅错落）
  const leaves = [
    [0.60, 0.58, 7, 9, 1],
    [0.66, 0.78, 6, 8, -1],
    [0.72, 0.44, 8, 10, 1],
    [0.55, 0.86, 6, 8, -1],
    [0.69, 0.62, 5, 7, 1],
  ];
  for (const [fx, fy, fw, fh, tilt] of leaves) {
    looseLeaf(g, {
      x: R(w * fx), y: R(horizon * fy),
      w: Math.max(4, R(fw * u)), h: Math.max(3, R(fh * u)), tilt, alpha: 0.97, shadow: true,
    });
  }
  // 地上散页与碎书（近地平线的杂物，别让地面空着）
  for (const [px, py, pw, ph] of [[0.24, 1.02, 9, 4], [0.42, 1.08, 7, 3], [0.78, 1.12, 8, 3], [0.87, 0.98, 6, 3]]) {
    const y = horizon + R(floorH * (py - 0.4));
    if (y > ground - 2) continue;
    looseLeaf(g, { x: R(w * px), y, w: R(pw * u), h: Math.max(3, R(ph * u)), tilt: 1, alpha: 0.7 });
  }

  // 浮尘只落在窗光柱里
  const dust = [
    [0.47, 0.30], [0.53, 0.36], [0.45, 0.46], [0.56, 0.52], [0.49, 0.60],
    [0.58, 0.68], [0.44, 0.74], [0.52, 0.82], [0.47, 0.92], [0.55, 0.98],
  ];
  for (const [dx, dy] of dust) fill(g, R(w * dx), R(horizon + (ground - horizon) * (dy - 0.2)), 1, 1, accent, 0.32);
}

// 前景压边：外侧一根通高石立柱 + 内侧半截书架 + 顶部阶梯拱腹，
// 三件合起来是「从拱下过道看进去」的画框（内缩一截，别把画布边当墙）。
function foreShelf(g, L, side, yTop) {
  const { w, horizon, accent } = L;
  const u = tallU(L);
  const jambW = Math.max(14, R(16 * u));
  const shelfW = Math.max(20, R(30 * u));
  const towerW = jambW + shelfW;
  const h = L.h - yTop;
  const jambX = side > 0 ? 0 : w - jambW;
  const shelfX = side > 0 ? jambW : w - towerW;

  // 石立柱：通高剪影，朝内一侧 3px 暗面 + 1px 受光棱 + 石缝 + 三只铁栓眼
  fill(g, jambX, yTop, jambW, h, C.void, 0.95);
  fill(g, jambX, yTop, jambW - 3, h, C.stoneDark, 0.42);                  // 柱身是暗石，不是黑洞
  fill(g, jambX, yTop, jambW, 2, C.stoneDark, 0.95);                      // 柱头
  fill(g, side > 0 ? jambW - 3 : jambX, yTop, 3, h, C.stoneDark, 0.7);    // 内侧暗面
  fill(g, side > 0 ? jambW - 1 : jambX, yTop, 1, h, C.stoneLight, 0.5);   // 受光棱
  for (let jy = yTop + R(h * 0.22); jy < L.h; jy += Math.max(18, R(30 * u))) {
    fill(g, jambX + 1, jy, jambW - 2, 1, C.void, 0.55);                   // 砌石缝
  }
  for (const ty of [yTop + R(h * 0.16), yTop + R(h * 0.5), yTop + R(h * 0.84)]) {
    const bx = jambX + R(jambW * 0.42);
    fill(g, bx, ty, 2, 2, C.brassDark, 0.85);
    fill(g, bx, ty, 2, 1, C.brass, 0.25);
  }

  // 内侧书架：书脊三色错落，层板下压 1px 阴影（近景，最亮的一档）
  const bookL = shelfX + 2;
  const bookR = shelfX + shelfW - 3;
  const rnd = seq(side > 0 ? 53 : 59);
  const spacing = Math.max(28, R(52 * u));
  let by = yTop + spacing - 3;
  let guard = 0;
  while (by < L.h - 2 && guard < 10) {
    const maxBH = spacing - 8;
    let bx = bookL;
    while (bx < bookR) {
      const bw = Math.max(3, R(6 * u * (0.7 + rnd() * 0.6)));
      const bh = Math.max(6, R(maxBH * (0.45 + rnd() * 0.5)));
      const col = MOVES[Math.floor(rnd() * 3)];
      const bw2 = Math.min(bw, bookR - bx);
      if (bw2 <= 0) break;
      fill(g, bx, by - bh, bw2, bh, col, 0.98);
      fill(g, bx, by - bh, bw2, 1, C.stoneLight, 0.34);
      fill(g, bx, by - bh, 1, bh, C.void, 0.35);   // 书缝投影
      bx += bw + 1;
    }
    fill(g, shelfX, by, shelfW, 3, C.brassDark, 0.98);
    fill(g, shelfX, by, shelfW, 1, C.tan, 0.24);
    fill(g, shelfX, by + 3, shelfW, 1, C.void, 0.6);
    by += spacing;
    guard += 1;
  }

  // 顶部阶梯拱腹：从立柱向场内逐级收薄，每级下沿 1px 石色受光——读作拱，不读作天花板
  const archW = R(Math.min(52 * u, 68));
  const stepW = Math.max(4, R(archW / 4));
  for (let i = 0; i < 4; i++) {
    const ah = Math.min(44, Math.max(4, R((4 - i) * 9 * u)));
    const ax = side > 0 ? jambW + i * stepW : w - jambW - (i + 1) * stepW;
    fill(g, ax, 0, stepW, ah, C.stoneDark, 0.95);
    fill(g, ax, 0, stepW, Math.max(1, R(ah * 0.3)), C.void, 0.5);       // 拱腹上部压暗
    fill(g, ax, ah - 1, stepW, 1, C.stoneLight, 0.26);                  // 拱腹下沿受光
    fill(g, ax, ah - 2, stepW, 1, C.stone, 0.5);
    // 朝场内的立面被中央高窗扫到一档幕色（光源只有窗，别整片染色）
    fill(g, side > 0 ? ax + stepW - 1 : ax, 0, 1, ah, accent, 0.14);
    fill(g, side > 0 ? ax + stepW - 2 : ax + 1, 0, 1, ah, C.void, 0.45);
  }

  // 柱脚与地平线处的暗带，让前景压在画面里而不是浮着
  fill(g, jambX, horizon, towerW, Math.max(3, R(6 * u)), C.void, 0.35);
  fill(g, jambX, L.h - Math.max(4, R(6 * u)), towerW, Math.max(4, R(6 * u)), C.void, 0.5);
}

export function fore(g, L) {
  const { w, horizon, accent } = L;
  const u = tallU(L);
  const ground = groundOf(L);
  const yTop = R(horizon * 0.18);

  foreShelf(g, L, 1, yTop);
  foreShelf(g, L, -1, yTop);

  // 飘落纸页（前景更大，压住中景边缘）
  looseLeaf(g, { x: R(w * 0.34), y: R(horizon * 0.78), w: Math.max(8, R(10 * u)), h: Math.max(10, R(13 * u)), tilt: 1, alpha: 0.98, shadow: true });
  looseLeaf(g, { x: R(w * 0.62), y: R(horizon * 0.52), w: Math.max(7, R(9 * u)), h: Math.max(9, R(12 * u)), tilt: -1, alpha: 0.98, shadow: true });
  looseLeaf(g, { x: R(w * 0.70), y: R(horizon * 0.96), w: Math.max(8, R(11 * u)), h: Math.max(10, R(14 * u)), tilt: 1, alpha: 0.95, shadow: true });

  // 烛光雾：贴地面的几条低雾 + 钟下的幕色光雾（只上光源，不整片染色）
  fill(g, 0, ground - R(16 * u), w, Math.max(2, R(3 * u)), C.fog, 0.05);
  fill(g, R(w * 0.18), ground - R(9 * u), R(w * 0.62), Math.max(1, R(2 * u)), C.fog, 0.06);
  fill(g, R(w * 0.30), ground - R(3 * u), R(w * 0.44), 2, C.fog, 0.05);
  fill(g, R(w * 0.38), ground - R(34 * u), R(w * 0.24), Math.max(6, R(30 * u)), accent, 0.035);
  fill(g, R(w * 0.44), ground - R(22 * u), R(w * 0.12), Math.max(5, R(18 * u)), accent, 0.04);
}
