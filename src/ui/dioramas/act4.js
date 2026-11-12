// 第 IV 幕「沉钟书库」——三层静态布景。
// 构图（横屏 480×270，地平线 132，碑座 186 起）：
//   远景 0–132：石墙错缝 + 尖拱壁龛 + 高窗（全幕唯一光源）+ 两排高书架（外排高远、内排近大）+ 吊烛台
//   中景 132–186：石板地面与石缝 + 中央走道 + 铜钟吊在木梁下（钟顶 seal、钟口 gate）+ 书梯
//                 + 翻飞书页 + 地板书堆三排 + 摊开书的阅读台
//   近景 186 起：左右前景书架压边 + 飘落纸页 + 烛光雾
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
// cap 控制单个书架的书脊总数，避免竖屏高书架把预算吃光。
function shelfUnit(g, { x, y, w, h, rowH, seed, bookW, bookH, cap = 60, alpha = 1 }) {
  fill(g, x, y, w, h, C.void, 0.9 * alpha);
  fill(g, x + 4, y, w - 8, h, C.stoneDark, 0.35 * alpha); // 柜内背板稍亮，书脊才跳得出来
  fill(g, x, y, 4, h, C.stoneDark, 0.98 * alpha);
  fill(g, x + 4, y, 1, h, C.stoneLight, 0.3 * alpha);
  fill(g, x + w - 4, y, 4, h, C.stoneDark, 0.98 * alpha);
  fill(g, x + w - 5, y, 1, h, C.stoneLight, 0.22 * alpha);

  const levels = Math.max(2, Math.floor(h / rowH));
  const rnd = seq(seed);
  let total = 0;
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
        const col = MOVES[Math.floor(rnd() * 3)];
        const bw2 = Math.min(bw, x + w - 6 - bx);
        fill(g, bx, boardY - bh, bw2, bh, col, 0.95 * alpha);
        fill(g, bx, boardY - bh, bw2, 1, C.stoneLight, 0.34 * alpha);      // 书脊顶受光
        if (rnd() > 0.7) fill(g, bx, boardY - bh + 2, 1, Math.max(1, bh - 4), C.tan, 0.35 * alpha); // 书脊烫线
        if (rnd() > 0.9) fill(g, bx, boardY - bh + 3, bw2, 1, C.parchment, 0.3 * alpha);             // 纸口标签
        bx += bw + 1;
        total += 1;
      }
      bx += 2 + Math.floor(rnd() * 4); // 簇间缺书，露出柜体黑洞
    }
    // 隔板最后画：书脊压在板下沿，板面 + 上棱受光 + 木纹
    fill(g, x, boardY, w, 2, C.brassDark, 0.95 * alpha);
    fill(g, x, boardY, w, 1, C.tan, 0.34 * alpha);
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
function looseLeaf(g, { x, y, w, h, tilt = 1, alpha = 1 }) {
  const dx = Math.max(2, R(w * 0.35));
  const pts = tilt >= 0
    ? [{ x, y: y + R(h * 0.2) }, { x: x + w, y }, { x: x + w, y: y + R(h * 0.8) }, { x, y: y + h }]
    : [{ x, y }, { x: x + w, y: y + R(h * 0.22) }, { x: x + w, y: y + h }, { x, y: y + R(h * 0.8) }];
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
function readingDesk(g, cx, baseY, u) {
  const topW = R(56 * u);
  const topH = Math.max(3, R(5 * u));
  const topY = baseY - R(24 * u);
  const legH = baseY - (topY + topH);
  const legW = Math.max(3, R(4 * u));
  for (const lx of [cx - R(topW / 2) + R(4 * u), cx + R(topW / 2) - R(4 * u) - legW]) {
    fill(g, lx, topY + topH, legW, legH, C.brassDark, 1);
    fill(g, lx, topY + topH, 1, legH, C.tan, 0.3);
    fill(g, lx - 1, baseY - 2, legW + 2, 2, C.inkDark, 0.85);
  }
  fill(g, cx - R(topW / 2) + R(6 * u), baseY - R(7 * u), topW - R(12 * u), 2, C.inkDark, 0.8);
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
  fill(g, cx - R(topW / 2) - 1, baseY, topW + 2, 1, C.void, 0.55); // 桌脚阴影
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

  // 两排高书架：外排（高、小书）/ 内排（近、大书），左右各一，中央让给壁龛
  const farY = R(horizon * 0.18);
  const farW = R(w * 0.30);
  shelfUnit(g, {
    x: 0, y: farY, w: farW, h: horizon - farY, rowH: R(22 * bv), seed: 101,
    bookW: R(2 * bh), bookH: R(9 * bv), cap: L.tall ? 96 : 60,
  });
  shelfUnit(g, {
    x: w - farW, y: farY, w: farW, h: horizon - farY, rowH: R(22 * bv), seed: 202,
    bookW: R(2 * bh), bookH: R(9 * bv), cap: L.tall ? 96 : 60,
  });
  const nearY = R(horizon * 0.46);
  const nearW = R(w * 0.19);
  shelfUnit(g, {
    x: 0, y: nearY, w: nearW, h: horizon - nearY, rowH: R(20 * bv), seed: 303,
    bookW: R(3 * bh), bookH: R(14 * bv), cap: 40,
  });
  shelfUnit(g, {
    x: w - nearW, y: nearY, w: nearW, h: horizon - nearY, rowH: R(20 * bv), seed: 404,
    bookW: R(3 * bh), bookH: R(14 * bv), cap: 40,
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
  // 中央走道：逐行收分的织毯（硬边透视，边缘 1px 一档），铜线滚边 + 稀疏织纹 + 流苏
  const stepY = Math.max(3, R(floorH / (L.tall ? 26 : 14)));
  for (let yy = horizon + 1; yy < ground; yy += stepY) {
    const t = (yy - horizon) / floorH;
    const ww = R(w * (0.085 + 0.075 * t));
    const x = cx - R(ww / 2);
    const hh = Math.min(stepY, ground - yy);
    fill(g, x, yy, ww, hh, C.bloodDark, 0.5);
    fill(g, x, yy, 1, hh, C.brassDark, 0.6);       // 铜线滚边
    fill(g, x + ww - 1, yy, 1, hh, C.brassDark, 0.6);
    const k = Math.floor((yy - horizon) / stepY);
    if (k % 3 === 0) fill(g, x + 2, yy + 1, ww - 4, 1, C.blood, 0.18);   // 稀疏织纹
    if (k % 4 === 0) fill(g, x + R(ww / 2), yy + 1, 1, 1, C.brass, 0.25); // 毯心铜点
  }
  const endW = R(w * 0.16);
  for (let fx = cx - R(endW / 2); fx < cx + R(endW / 2); fx += 3) {
    fill(g, fx, ground - 1, 1, 2, C.brassDark, 0.4);                      // 流苏
  }
  // 地面靠碑座一侧收边：压暗两行 + 一道石沿受光，读作「地板到此为止」
  fill(g, 0, ground - 2, w, 2, C.void, 0.45);
  fill(g, 0, ground - 1, w, 1, C.stoneLight, 0.2);

  // 石板主裂缝（贴地，不浮空）
  cracks(g, {
    x: R(w * 0.63), y: horizon + 3,
    len: Math.min(40, Math.max(10, R(floorH * 0.55))), seed: 47,
    color: C.inkDark, alpha: 0.9, branches: 1, drift: 4,
  });
  cracks(g, {
    x: R(w * 0.19), y: horizon + R(floorH * 0.5),
    len: Math.min(26, Math.max(8, R(floorH * 0.3))), seed: 91,
    color: C.inkDark, alpha: 0.75, branches: 1, drift: 3,
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
  readingDesk(g, R(w * 0.735), ground, u);

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

  // 中央铜钟：吊在木梁下，钟顶贴 seal 锚点，钟口落在 gate 锚点
  const seal = L.anchors.seal;
  const gate = L.anchors.gate;
  const beamY = seal.y - R(13 * u);
  beam(g, {
    x: R(w * 0.29), y: beamY, w: R(w * 0.42), h: Math.max(4, R(7 * u)),
    color: C.ink, light: C.brassDark, alpha: 0.98,
  });
  fill(g, R(w * 0.29), beamY, R(w * 0.42), 1, C.tan, 0.45);          // 梁面受光
  fill(g, R(w * 0.29), beamY + Math.max(4, R(7 * u)) - 1, R(w * 0.42), 1, C.void, 0.7);
  for (const bxx of [R(w * 0.31), R(w * 0.69)]) {
    fill(g, bxx - 2, beamY - 3, 6, 4, C.stoneDark, 1);                // 梁托
    fill(g, bxx - 2, beamY - 3, 6, 1, C.tan, 0.35);
    chain(g, {
      x: bxx, y: R(horizon * 0.06), h: beamY - R(horizon * 0.06),
      color: C.stoneLight, alpha: 0.35, linkH: Math.max(4, R(6 * u)),
    });
  }
  // 铁箍两道（贴梁，木梁才像被吊住的）
  for (const sx of [R(w * 0.36), R(w * 0.64)]) {
    fill(g, sx, beamY, 3, Math.max(4, R(7 * u)), C.brassDark, 0.95);
    fill(g, sx, beamY, 1, Math.max(4, R(7 * u)), C.tan, 0.3);
  }

  const bellBot = gate.y;
  const bs = Math.min(1.7, (bellBot - seal.y) / 44); // 上限 1.7：竖屏靠加长吊链，不把钟拉宽
  const bellH = R(44 * bs);
  const bellTop = bellBot - bellH;
  const mouthW = R(38 * bs);
  const topW = R(18 * bs);

  // 钟后一层极淡的幕色背光：让「高窗透下来」这件事在钟身上成立
  fill(g, seal.x - R(mouthW * 0.85), bellTop - Math.max(4, R(6 * u)), R(mouthW * 1.7),
    bellH + Math.max(6, R(10 * u)), accent, 0.045);

  // 吊环 + 铁链（从梁底到钟顶，一行一行看得见）
  chain(g, {
    x: seal.x, y: beamY + Math.max(4, R(7 * u)), h: Math.max(3, bellTop - beamY - Math.max(4, R(7 * u))),
    color: C.stoneLight, alpha: 0.55, linkH: Math.max(3, R(4 * bs)),
  });
  ellipseRing(g, seal.x, bellTop - R(3 * bs), R(5 * bs), Math.max(2, R(2 * bs)), C.brassDark, 0.9);
  fill(g, seal.x - Math.max(2, R(topW * 0.3)), bellTop - R(2 * bs), Math.max(4, R(topW * 0.6)), Math.max(2, R(3 * bs)), C.brassDark, 1);

  // 钟体：13 段凹弧收分（吊钟轮廓），左侧受光 / 右缘背光，铸缝与铜锈贴钟身
  const nBand = 15;
  for (let i = 0; i < nBand; i++) {
    const t0 = i / nBand;
    const t1 = (i + 1) / nBand;
    const y = bellTop + R(bellH * t0);
    const hh = Math.max(1, bellTop + R(bellH * t1) - y);
    // 凹弧轮廓：钟肩收窄 → 钟腰最细 → 近口沿急剧外撇
    let ww = R(topW + (mouthW - topW) * (0.06 + 0.94 * Math.pow(Math.max(0, t1 - 0.16) / 0.84, 2.6)));
    if (t1 < 0.1) ww = R(ww * 0.8);
    const wx = seal.x - R(ww / 2);
    fill(g, wx, y, ww, hh, C.brassDark, 1);                            // 青铜底
    fill(g, wx, y, Math.max(1, R(ww * 0.22)), hh, C.brass, 0.5);       // 左侧受光面
    fill(g, wx, y, 1, hh, C.brassLight, 0.45);                         // 高光边
    fill(g, seal.x + R(ww / 2) - Math.max(1, R(ww * 0.16)), y, Math.max(1, R(ww * 0.16)), hh, C.ink, 0.55); // 右缘背光
    if (i === 3 || i === 9) fill(g, wx, y, ww, 1, C.brassLight, 0.5);   // 钟腰凸带
    if (i === 6) fill(g, wx, y, ww, 1, C.ink, 0.5);                     // 铸缝
    if (i === 8) fill(g, wx + 1, y, Math.max(1, R(ww * 0.45)), 1, accent, 0.32); // 幕色冷光
  }
  // 钟口唇边（加宽两档 + 幕色口沿）
  const lipW = R(mouthW * 1.12);
  const lipX = seal.x - R(lipW / 2);
  const lipH = Math.max(3, Math.min(6, R(5 * bs)));
  fill(g, lipX, bellBot - lipH, lipW, lipH, C.brass, 0.8);
  fill(g, lipX, bellBot - lipH, lipW, 1, C.brassLight, 0.75);
  fill(g, lipX + 2, bellBot - lipH + 1, lipW - 4, Math.max(1, lipH - 2), C.ink, 0.45); // 钟口内腔
  fill(g, lipX, bellBot - 1, lipW, 1, C.ink, 0.9);
  for (const dx of [-10, 0, 10]) fill(g, seal.x + R(dx * bs), bellBot - R(5 * bs) + 1, 1, 1, C.brassLight, 0.7);
  fill(g, lipX, bellBot, lipW, 1, C.void, 0.85);
  fill(g, lipX + 1, bellBot - 2, lipW - 2, 1, accent, 0.45);
  // 钟舌与钟绳：绳一直垂到地面，成为中轴
  fill(g, seal.x - Math.max(1, R(2 * bs)), bellBot - R(3 * bs), Math.max(2, R(4 * bs)), R(9 * bs), C.inkDark, 0.95);
  disc(g, seal.x, bellBot + R(7 * bs), Math.max(2, R(3 * bs)), C.brassDark, 0.95);
  fill(g, seal.x - R(22 * u), ground - 2, R(44 * u), 2, C.void, 0.4);
  fill(g, seal.x - 1, bellBot + R(9 * bs), 2, Math.max(4, ground - bellBot - R(9 * bs)), C.parchment, 0.55);
  fill(g, seal.x - 3, bellBot + R(20 * bs), 7, 2, C.brassDark, 0.75);  // 绳结
  fill(g, seal.x - 2, ground - 3, 5, 2, C.brassDark, 0.65);
  // 铜锈只贴铜件
  fill(g, seal.x - R(lipW * 0.3), bellBot - R(9 * bs), 2, 1, C.rot, 0.5);
  fill(g, seal.x + R(lipW * 0.18), bellBot - R(14 * bs), 1, 2, C.rot, 0.4);
  fill(g, seal.x + R(lipW * 0.28), bellBot - R(5 * bs), 2, 1, C.sage, 0.35);
  fill(g, seal.x - R(lipW * 0.2), bellBot - R(18 * bs), 1, 1, C.sage, 0.3);

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
      w: Math.max(4, R(fw * u)), h: Math.max(3, R(fh * u)), tilt, alpha: 0.97,
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

// 前景书架压边：只占左右两壁，书脊更大更近，绝不铺地。
function foreShelf(g, L, side, yTop) {
  const { w, horizon } = L;
  const u = tallU(L);
  const towerW = R(42 * u);
  const x0 = side > 0 ? 0 : w - towerW;
  const h = L.h - yTop;
  fill(g, x0, yTop, towerW, h, C.void, 0.97);
  const innerX = side > 0 ? x0 + towerW - 2 : x0;
  fill(g, innerX, yTop, 2, h, C.stoneDark, 0.95);
  fill(g, side > 0 ? innerX + 2 : innerX - 1, yTop, 1, h, C.stoneLight, 0.2);
  const rnd = seq(side > 0 ? 53 : 59);
  const spacing = Math.max(28, R(52 * u));
  let by = yTop + spacing - 3;
  let guard = 0;
  while (by < L.h - 2 && guard < 10) {
    const maxBH = spacing - 8;
    let bx = x0 + 2;
    const limit = x0 + towerW - 4;
    while (bx < limit) {
      const bw = Math.max(3, R(6 * u * (0.7 + rnd() * 0.6)));
      const bh = Math.max(6, R(maxBH * (0.45 + rnd() * 0.5)));
      const col = MOVES[Math.floor(rnd() * 3)];
      const bw2 = Math.min(bw, limit - bx);
      fill(g, bx, by - bh, bw2, bh, col, 0.98);
      fill(g, bx, by - bh, bw2, 1, C.stoneLight, 0.34);
      bx += bw + 1;
    }
    fill(g, x0, by, towerW, 3, C.brassDark, 0.98);
    fill(g, x0, by, towerW, 1, C.tan, 0.24);
    by += spacing;
    guard += 1;
  }
  fill(g, x0, horizon, towerW, Math.max(3, R(6 * u)), C.void, 0.35);
  fill(g, x0, L.h - Math.max(4, R(6 * u)), towerW, Math.max(4, R(6 * u)), C.void, 0.5);
}

export function fore(g, L) {
  const { w, horizon, accent } = L;
  const u = tallU(L);
  const ground = groundOf(L);
  const yTop = R(horizon * 0.18);

  foreShelf(g, L, 1, yTop);
  foreShelf(g, L, -1, yTop);

  // 飘落纸页（前景更大，压住中景边缘）
  looseLeaf(g, { x: R(w * 0.34), y: R(horizon * 0.78), w: Math.max(8, R(10 * u)), h: Math.max(10, R(13 * u)), tilt: 1, alpha: 0.98 });
  looseLeaf(g, { x: R(w * 0.62), y: R(horizon * 0.52), w: Math.max(7, R(9 * u)), h: Math.max(9, R(12 * u)), tilt: -1, alpha: 0.98 });
  looseLeaf(g, { x: R(w * 0.70), y: R(horizon * 0.96), w: Math.max(8, R(11 * u)), h: Math.max(10, R(14 * u)), tilt: 1, alpha: 0.95 });

  // 烛光雾：贴地面的几条低雾 + 钟下的幕色光雾（只上光源，不整片染色）
  fill(g, 0, ground - R(16 * u), w, Math.max(2, R(3 * u)), C.fog, 0.05);
  fill(g, R(w * 0.18), ground - R(9 * u), R(w * 0.62), Math.max(1, R(2 * u)), C.fog, 0.06);
  fill(g, R(w * 0.30), ground - R(3 * u), R(w * 0.44), 2, C.fog, 0.05);
  fill(g, R(w * 0.38), ground - R(34 * u), R(w * 0.24), Math.max(6, R(30 * u)), accent, 0.035);
  fill(g, R(w * 0.44), ground - R(22 * u), R(w * 0.12), Math.max(5, R(18 * u)), accent, 0.04);
}
