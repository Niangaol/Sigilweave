// 法阵编辑器共享视觉层：幕间「构筑台」与战斗内「暂停改阵」共用同一套
// 面板 / 标题栏 / 4×4 符位 / 手牌行 / 步骤引导 / 详情 / 主按钮。
// 只画像素，不引用 Phaser；文字通过调用方传入的 text(x,y,str,size,color,extra) 落地，
// 这样两个 Scene 各自的容器（view / editUI）都能复用同一份界面语言，不会再各画一套。
import { C, HEX, pxRect, pxFrame, pxLine, pxPoly, pxDiamond, drawGlyph } from './Palette.js';
import { cardVisual } from '../data/roster.js';
import { decoratePlan } from './board-decor.js';

export function clipText(value, max = 24) {
  const s = String(value ?? '');
  return s.length <= max ? s : s.slice(0, Math.max(1, max - 1)) + '…';
}

// 分区面板：不透明底 + 双层黄铜边框 + 外描边 + 四角铆钉
export function kitPanel(g, x, y, w, h, opts = {}) {
  pxRect(g, x, y, w, h, opts.fill ?? C.ink, opts.alpha ?? 1);
  pxFrame(g, x, y, w, h, opts.frame ?? C.brassDark);
  pxFrame(g, x + 2, y + 2, w - 4, h - 4, C.brass, 1, 0.2);
  pxFrame(g, x - 1, y - 1, w + 2, h + 2, C.outline, 1, 1);
  for (const [sx, sy] of [[x, y], [x + w - 3, y], [x, y + h - 3], [x + w - 3, y + h - 3]]) {
    pxRect(g, sx, sy, 3, 3, C.brass, 0.9);
    pxRect(g, sx + 1, sy + 1, 1, 1, C.brassLight, 1);
  }
}

// 顶栏：菱形纹章 + 标题 + 副标题 + 右侧资源徽章
export function kitHeader(g, text, opts) {
  const { x, y, w, title, subtitle, rightLabel, rightValue, rightColor = HEX.teal } = opts;
  pxRect(g, x, y, w, 14, C.ink, 0.97);
  pxRect(g, x, y + 13, w, 1, C.brassDark, 0.9);
  pxDiamond(g, x + 6, y + 7, 3, C.brass, 0.95, false);
  text(x + 13, y + 2, title, 11, HEX.brassLight);
  if (subtitle) text(x + 13 + title.length * 11 + 8, y + 4, subtitle, 8, HEX.mute);
  if (rightLabel) {
    const bw = 78;
    const bx = x + w - bw - 4;
    pxRect(g, bx, y + 1, bw, 12, C.nightDeep, 1);
    pxFrame(g, bx, y + 1, bw, 12, C.brassDark);
    pxDiamond(g, bx + 7, y + 7, 3, rightColor, 0.95, true);
    text(bx + 13, y + 3, rightLabel, 8, HEX.mute);
    text(bx + bw - 5, y + 3, String(rightValue), 9, rightColor).setOrigin?.(1, 0);
  }
}

// 三步引导条：选牌 → 放位 → 绑定/收回；右侧可带一句当前状态
export function kitSteps(g, text, x, y, w, opts = {}) {
  const labels = opts.labels ?? ['选牌', '放位', '绑定/收回'];
  const active = Number.isInteger(opts.active) ? opts.active : 0;
  const chipW = 58;
  const gap = 4;
  labels.forEach((label, i) => {
    const cx = x + i * (chipW + gap);
    const on = i === active;
    const done = i < active;
    pxRect(g, cx, y, chipW, 11, on ? C.stoneDark : C.nightDeep, 0.95);
    pxFrame(g, cx, y, chipW, 11, on ? C.brassLight : done ? C.teal : C.stoneLight, 1, on ? 1 : 0.7);
    if (on) pxRect(g, cx + 1, y + 1, chipW - 2, 1, C.brassLight, 0.9);
    const color = on ? HEX.brassLight : done ? HEX.teal : HEX.mute;
    text(cx + 4, y + 2, (i + 1) + ' ' + label, 7, color);
    if (i < labels.length - 1) {
      pxLine(g, cx + chipW + 1, y + 5, cx + chipW + 3, y + 5, C.brassDark, 0.7, 1);
    }
  });
  if (opts.right) {
    text(x + w - 2, y + 2, clipText(opts.right, 30), 7, opts.rightColor ?? HEX.mute).setOrigin?.(1, 0);
  }
}


// 法阵盘装饰层：板框、四向罗盘钉、格间导线、侧边符刻与底部回路。
// 只画在 4×4 符位周围的空隙里，不占格子内部的可读面积。
export function kitBoard(g, opts = {}) {
  const panel = opts.panel ?? { x: 10, y: 42, w: 224, h: 210 };
  const cells = opts.cells ?? { x0: 14, y0: 56, cw: 51, ch: 26, gapX: 3, gapY: 3, cols: 4, rows: 4 };
  const { x: px, y: py, w: pw, h: ph } = panel;
  const { x0, y0, cw, ch, gapX = 3, gapY = 3, cols = 4, rows = 4 } = cells;
  const bw = cols * cw + (cols - 1) * gapX;
  const bh = rows * ch + (rows - 1) * gapY;
  const bx = x0 - 2, by = y0 - 2, bwid = bw + 4, bhei = bh + 4;

  // 面板左右内壁的符刻：像刻在木板上的刻度，不进入格子
  for (let yy = py + 8; yy < py + ph - 8; yy += 5) {
    pxRect(g, px + 3, yy, 1, 2, C.brass, 0.22);
    pxRect(g, px + pw - 4, yy, 1, 2, C.brass, 0.22);
  }
  // 底边刻度 + 三颗回路节点
  for (let xx = px + 8; xx < px + pw - 8; xx += 5) pxRect(g, xx, py + ph - 4, 1, 2, C.brass, 0.18);
  for (const f of [0.25, 0.5, 0.75]) pxDiamond(g, px + pw * f, py + ph - 3, 2, C.brass, 0.32, false);

  // 法阵板双层外框
  pxRect(g, bx, by, bwid, bhei, C.void, 0.55);
  pxFrame(g, bx, by, bwid, bhei, C.brassDark, 1, 0.95);
  pxFrame(g, bx + 1, by + 1, bwid - 2, bhei - 2, C.brass, 1, 0.18);

  // 四角 45° 饰角：向外张开的短刻线
  const corners = [
    [bx + 2, by + 2, 1, 1], [bx + bwid - 3, by + 2, -1, 1],
    [bx + 2, by + bhei - 3, 1, -1], [bx + bwid - 3, by + bhei - 3, -1, -1],
  ];
  for (const [sx, sy, dx, dy] of corners) {
    pxLine(g, sx, sy, sx + dx * 5, sy + dy * 5, C.brass, 0.55, 1);
    pxLine(g, sx + dx * 5, sy, sx, sy + dy * 5, C.brass, 0.22, 1);
    pxRect(g, sx - (dx < 0 ? 1 : 0), sy - (dy < 0 ? 1 : 0), 2, 2, C.brassLight, 0.55);
  }

  // 四向罗盘钉：板框四边中点，朝外一颗小菱形 + 一道短刻
  const mx = bx + Math.floor(bwid / 2), my = by + Math.floor(bhei / 2);
  for (const [cx, cy, dx, dy] of [[mx, by, 0, -1], [mx, by + bhei - 1, 0, 1], [bx, my, -1, 0], [bx + bwid - 1, my, 1, 0]]) {
    pxDiamond(g, cx, cy, 2, C.brassLight, 0.85, false);
    if (dx) pxRect(g, cx + dx * 2, cy - 1, 2, 3, C.brass, 0.4);
    else pxRect(g, cx - 1, cy + dy * 2, 3, 2, C.brass, 0.4);
  }

  // 格间导线：横竖各三条，交点一颗小菱形，读作“共振回路”
  for (let c = 1; c < cols; c++) {
    const lx = Math.round(x0 + c * cw + (c - 1) * gapX + gapX / 2);
    pxLine(g, lx, by + 2, lx, by + bhei - 2, C.brass, 0.1, 1);
  }
  for (let r = 1; r < rows; r++) {
    const ly = Math.round(y0 + r * ch + (r - 1) * gapY + gapY / 2);
    pxLine(g, bx + 2, ly, bx + bwid - 2, ly, C.brass, 0.1, 1);
  }
  for (let r = 1; r < rows; r++) {
    for (let c = 1; c < cols; c++) {
      const ix = Math.round(x0 + c * (cw + gapX) - gapX / 2);
      const iy = Math.round(y0 + r * (ch + gapY) - gapY / 2);
      pxDiamond(g, ix, iy, 1, C.brass, 0.35, false);
    }
  }

  // 板框上沿的短刻：与左右符刻、底部回路组成一圈装饰边
  for (let xx = bx + 6; xx < bx + bwid - 6; xx += 4) {
    pxRect(g, xx, by - 1, 1, 1, C.brass, 0.28);
    if ((xx - bx) % 12 === 6) pxRect(g, xx + 1, by - 2, 1, 1, C.brass, 0.2);
  }

  // 板框左右外轨：一条连续黄铜线 + 小方钉，像法阵盘的金属包边
  pxLine(g, bx - 1, by + 4, bx - 1, by + bhei - 4, C.brass, 0.5, 1);
  pxLine(g, bx + bwid, by + 4, bx + bwid, by + bhei - 4, C.brass, 0.5, 1);
  for (let yy = by + 8; yy < by + bhei - 8; yy += 14) {
    pxRect(g, bx - 1, yy, 2, 2, C.brassLight, 0.5);
    pxRect(g, bx + bwid - 1, yy, 2, 2, C.brassLight, 0.5);
  }

  // 底边回路线：压在格子和详情面板之间
  pxLine(g, px + 8, py + ph - 5, px + pw - 8, py + ph - 5, C.brassDark, 0.35, 1);
}


// 法阵盘动态层：只画流光/脉冲/环绕火花，不参与布局与命中。
// 由 Scene 以约 30fps 调用；t 为毫秒时间，所有轨迹都可由 t 确定性重算。
export function kitBoardMotion(g, opts = {}) {
  g.clear();
  const panel = opts.panel ?? { x: 10, y: 42, w: 224, h: 210 };
  const cells = opts.cells ?? { x0: 14, y0: 56, cw: 51, ch: 26, gapX: 3, gapY: 3, cols: 4, rows: 4 };
  const { x: px, y: py, w: pw, h: ph } = panel;
  const { x0, y0, cw, ch, gapX = 3, gapY = 3, cols = 4, rows = 4 } = cells;
  const t = Number.isFinite(opts.t) ? opts.t : 0;
  const bwid = cols * cw + (cols - 1) * gapX;
  const bhei = rows * ch + (rows - 1) * gapY;
  const bx = x0 - 2, by = y0 - 2;
  const cellRect = (id) => ({ x: x0 + (id % cols) * (cw + gapX), y: y0 + Math.floor(id / cols) * (ch + gapY), w: cw, h: ch });

  // 1) 板框跑光：黄铜主光顺时针，青色副光逆时针
  const P = 2 * (bwid + bhei);
  const perim = (d) => {
    let p = ((d % P) + P) % P;
    if (p < bwid) return { x: bx + p, y: by };
    p -= bwid;
    if (p < bhei) return { x: bx + bwid, y: by + p };
    p -= bhei;
    if (p < bwid) return { x: bx + bwid - p, y: by + bhei };
    p -= bwid;
    return { x: bx, y: by + bhei - p };
  };
  const comet = (offset, color, alpha, trail) => {
    for (let i = trail; i >= 0; i--) {
      const p = perim(offset - i * 1.7);
      const a = alpha * (1 - i / (trail + 1));
      pxRect(g, Math.round(p.x), Math.round(p.y), 2, 2, color, a);
    }
    const head = perim(offset);
    pxRect(g, Math.round(head.x) - 1, Math.round(head.y) - 1, 4, 4, color, alpha * 0.18);
    pxRect(g, Math.round(head.x), Math.round(head.y), 2, 2, color, Math.min(1, alpha + 0.1));
    pxRect(g, Math.round(head.x) - 1, Math.round(head.y), 1, 1, C.parchment, alpha * 0.7);
  };
  const phase = (t % 3600) / 3600;
  comet(phase * P, C.brassLight, 0.95, 10);
  comet((phase + 0.55) * P, C.teal, 0.35, 6);

  // 2) 格间导线脉冲：六条导线各有一颗光点按不同速度流动
  for (let c = 1; c < cols; c++) {
    const lx = Math.round(x0 + c * cw + (c - 1) * gapX + gapX / 2);
    const q = (t / 1500 + c * 0.31) % 1;
    const yy = Math.round(by + 2 + q * (bhei - 4));
    pxRect(g, lx, yy, 1, 3, C.teal, 0.65);
    pxRect(g, lx, yy - 3, 1, 1, C.teal, 0.3);
  }
  for (let r = 1; r < rows; r++) {
    const ly = Math.round(y0 + r * ch + (r - 1) * gapY + gapY / 2);
    const q = (t / 1900 + r * 0.43) % 1;
    const xx = Math.round(bx + 2 + q * (bwid - 4));
    pxRect(g, xx, ly, 3, 1, C.teal, 0.65);
    pxRect(g, xx - 3, ly, 1, 1, C.teal, 0.3);
  }

  // 2.5) 左右金属外轨上的垂直跑光：一金一青，反向
  const railQ = (t / 2400) % 1;
  const railY = Math.round(by + 2 + railQ * (bhei - 12));
  pxRect(g, bx - 1, railY, 1, 8, C.brassLight, 0.55);
  pxRect(g, bx - 1, railY + 1, 1, 1, C.parchment, 0.7);
  const railQ2 = (t / 2900 + 0.5) % 1;
  const railY2 = Math.round(by + 2 + railQ2 * (bhei - 12));
  pxRect(g, bx + bwid, railY2, 1, 8, C.teal, 0.5);

  // 3) 四向罗盘钉轮流扫描：N → E → S → W
  const mx = bx + Math.floor(bwid / 2), my = by + Math.floor(bhei / 2);
  const scan = Math.floor(t / 480) % 4;
  const marks = [[mx, by], [bx + bwid - 1, my], [mx, by + bhei - 1], [bx, my]];
  marks.forEach(([cx, cy], i) => {
    if (i !== scan) return;
    const a = 0.5 + 0.4 * (0.5 + 0.5 * Math.sin(t / 170));
    pxDiamond(g, cx, cy, 3, C.brassLight, a, false);
    pxRect(g, cx, cy, 1, 1, C.parchment, a);
  });

  // 4) 四角符钉呼吸
  const corners = [[bx + 2, by + 2], [bx + bwid - 2, by + 2], [bx + 2, by + bhei - 2], [bx + bwid - 2, by + bhei - 2]];
  corners.forEach(([cx, cy], i) => {
    const a = 0.12 + 0.28 * (0.5 + 0.5 * Math.sin(t / 520 + i * Math.PI / 2));
    pxDiamond(g, cx, cy, 2, i % 2 ? C.teal : C.brassLight, a, false);
  });

  // 5) 已放置法术：一颗同色小星绕图标菱形环缓慢巡游
  for (const item of opts.slots ?? []) {
    if (!item?.slot?.defId || !Number.isFinite(item.id)) continue;
    const cell = cellRect(item.id);
    const gs = cell.w >= 70 ? 2 : 1;
    const cx = cell.x + 4 + 4 * gs;
    const cy = cell.y + 5 + 4 * gs;
    const rad = 5 + 3 * (gs - 1);
    const visual = cardVisual(item.slot);
    const color = visual.color ?? C.arcaneLight;
    const ang = t / 900 + item.id * 0.85;
    const sx = Math.round(cx + Math.cos(ang) * rad);
    const sy = Math.round(cy + Math.sin(ang) * rad);
    pxRect(g, sx, sy, 1, 1, color, 0.9);
    const ang2 = ang - 0.55;
    pxRect(g, Math.round(cx + Math.cos(ang2) * (rad - 1)), Math.round(cy + Math.sin(ang2) * (rad - 1)), 1, 1, color, 0.35);
    // 对角再补一颗反向星点，并让图标外环轻轻呼吸
    const ang3 = ang + Math.PI;
    pxRect(g, Math.round(cx + Math.cos(ang3) * rad), Math.round(cy + Math.sin(ang3) * rad), 1, 1, color, 0.55);
    pxDiamond(g, cx, cy, rad, color, 0.1 + 0.12 * (0.5 + 0.5 * Math.sin(t / 700 + item.id)), false);
  }

  // 6) 聚焦格：内框呼吸 + 四角星点
  if (Number.isInteger(opts.focusId)) {
    const cell = cellRect(opts.focusId);
    const a = 0.12 + 0.16 * (0.5 + 0.5 * Math.sin(t / 300));
    pxFrame(g, cell.x + 2, cell.y + 2, cell.w - 4, cell.h - 4, C.teal, 1, a);
    for (const [sx, sy] of [[cell.x + 3, cell.y + 3], [cell.x + cell.w - 4, cell.y + 3], [cell.x + 3, cell.y + cell.h - 4], [cell.x + cell.w - 4, cell.y + cell.h - 4]]) {
      pxRect(g, sx, sy, 1, 1, C.teal, a + 0.25);
    }
  }

  // 7) 选牌时：空符位边缘有一颗黄铜小点巡边，提示“这里可放”
  if (opts.selecting && Array.isArray(opts.unlocked)) {
    const occupied = new Set((opts.slots ?? []).map(s => s.id));
    for (const id of opts.unlocked) {
      if (occupied.has(id)) continue;
      const cell = cellRect(id);
      const per = 2 * (cell.w + cell.h);
      const d = ((t / 1100 + id * 0.17) % 1) * per;
      let p;
      if (d < cell.w) p = { x: cell.x + d, y: cell.y };
      else if (d < cell.w + cell.h) p = { x: cell.x + cell.w, y: cell.y + d - cell.w };
      else if (d < cell.w * 2 + cell.h) p = { x: cell.x + cell.w - (d - cell.w - cell.h), y: cell.y + cell.h };
      else p = { x: cell.x, y: cell.y + cell.h - (d - cell.w * 2 - cell.h) };
      pxRect(g, Math.round(p.x), Math.round(p.y), 2, 2, C.brassLight, 0.7);
    }
  }

  // 7.5) 盘心两颗小星缓慢环绕：动态只占 1px，但视线会跟着走
  const ccx = bx + bwid / 2, ccy = by + bhei / 2;
  for (let i = 0; i < 2; i++) {
    const a = t / 3200 + i * Math.PI;
    const rr = 19 + i * 3;
    pxRect(g, Math.round(ccx + Math.cos(a) * rr), Math.round(ccy + Math.sin(a) * rr), 1, 1, i ? C.teal : C.brassLight, 0.45);
  }

  // 8) 面板左右轨道上的浮尘，给静止界面一点空气感
  for (let i = 0; i < 4; i++) {
    const side = i % 2;
    const x = side ? px + pw - 4 : px + 3;
    const q = (t / 2600 + i * 0.27) % 1;
    const y = py + ph - 8 - q * (ph - 16);
    pxRect(g, x, Math.round(y), 1, 1, C.brassLight, 0.22 * (1 - q));
  }
}

// 4×4 符位：状态条 + 区位装饰 + 图标 + 名称 + 明细 + 铭文点 + 目标箭头 + 出口刻痕
export function kitCell(g, text, id, r, o = {}) {
  const { x, y, w, h } = r;
  const unlocked = !!o.unlocked;
  const slot = o.slot ?? null;
  const focus = o.focus === id;
  const auxSrc = o.auxSrc === id;
  const auxValid = !!o.auxValid;
  const selecting = !!o.selecting;
  const canPlace = unlocked && !slot && selecting;
  const canReplace = unlocked && !!slot && selecting && !auxSrc;
  const runes = Number.isFinite(o.runes) ? o.runes : 0;
  const exits = Number.isFinite(o.exits) ? o.exits : 4;
  const target = o.target;
  const glyphScale = o.glyphScale ?? 1;
  const nameSize = o.nameSize ?? 8;
  const subSize = o.subSize ?? 7;
  const subY = y + h - (subSize + 3);
  const nameX = 4 + 8 * glyphScale + 3;

  pxRect(g, x, y, w, h, !unlocked ? C.nightDeep : canPlace ? C.stoneDark : slot ? C.stone : C.night);
  if (unlocked) {
    pxRect(g, x + 1, y + 1, w - 2, 1, C.groove, 0.3);
    pxRect(g, x + 1, y + h - 2, w - 2, 1, C.nightDeep, 0.45);
  }
  // 左侧状态条：输出金 / 辅助青 / 空位暗紫 / 未解封石色
  const stripe = !unlocked ? C.stoneDark : slot ? (slot.kind === 'auxiliary' ? C.teal : C.arcane) : C.groove;
  pxRect(g, x + 1, y + 2, 2, h - 4, stripe, unlocked ? 0.9 : 0.4);
  if (canPlace) pxRect(g, x, y, w, h, C.brassLight, 0.08);
  if (auxValid) pxRect(g, x, y, w, h, C.teal, 0.12);
  // 每格四角一颗小铜钉 + 2px 护角：不抢字，只让 4×4 更像一块嵌板
  if (unlocked) {
    for (const [sx, sy, dx, dy] of [
      [x + 2, y + 2, 1, 1], [x + w - 3, y + 2, -1, 1],
      [x + 2, y + h - 3, 1, -1], [x + w - 3, y + h - 3, -1, -1],
    ]) {
      pxRect(g, sx, sy, 1, 1, C.brass, 0.35);
      pxLine(g, sx + dx, sy + dy, sx + dx * 2, sy + dy, C.brass, 0.22, 1);
      pxLine(g, sx + dx, sy + dy, sx + dx, sy + dy * 2, C.brass, 0.22, 1);
    }
  }

  const plan = decoratePlan(id, [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }],
    { inset: 1, arm: 8, centerInset: 1 });
  if (plan) {
    const dim = unlocked ? 1 : 0.7;
    if (plan.wash) pxPoly(g, plan.wash.quad, C[plan.wash.color], plan.wash.alpha * dim);
    for (const line of plan.lines) pxLine(g, line.a.x, line.a.y, line.b.x, line.b.y, C[line.color], line.alpha * dim, line.width ?? 1);
    for (const dot of plan.dots) {
      const size = dot.size ?? 1;
      pxRect(g, Math.round(dot.x), Math.round(dot.y), size, size, C[dot.color], dot.alpha * dim);
    }
  }

  const frame = auxSrc ? C.arcane : auxValid ? C.teal : focus ? C.teal : canPlace ? C.brassLight : C.stoneLight;
  pxFrame(g, x, y, w, h, frame, auxSrc || focus || canPlace || auxValid ? 2 : 1);

  // 出口刻痕：四条边中点亮一小段，出口被关掉就消失，读配置不用只看「出N」
  const exitList = Array.isArray(o.exitList) ? o.exitList : null;
  if (unlocked && exitList) {
    const nx = x + Math.floor(w / 2) - 1;
    const ny = y + Math.floor(h / 2) - 1;
    if (exitList.includes('up')) pxRect(g, nx, y, 3, 1, C.brassLight, 0.95);
    if (exitList.includes('down')) pxRect(g, nx, y + h - 1, 3, 1, C.brassLight, 0.95);
    if (exitList.includes('left')) pxRect(g, x, ny, 1, 3, C.brassLight, 0.95);
    if (exitList.includes('right')) pxRect(g, x + w - 1, ny, 1, 3, C.brassLight, 0.95);
  }
  // 四角格加金属护角：板框四角看起来被铜片包住
  if (id === 0 || id === 3 || id === 12 || id === 15) {
    const col = unlocked ? C.brass : C.brassDark;
    if (id === 0) {
      pxRect(g, x, y, 7, 2, col, 0.8); pxRect(g, x, y, 2, 7, col, 0.8);
      pxRect(g, x + 1, y + 1, 1, 1, C.brassLight, 0.95);
    } else if (id === 3) {
      pxRect(g, x + w - 7, y, 7, 2, col, 0.8); pxRect(g, x + w - 2, y, 2, 7, col, 0.8);
      pxRect(g, x + w - 2, y + 1, 1, 1, C.brassLight, 0.95);
    } else if (id === 12) {
      pxRect(g, x, y + h - 2, 7, 2, col, 0.8); pxRect(g, x, y + h - 7, 2, 7, col, 0.8);
      pxRect(g, x + 1, y + h - 2, 1, 1, C.brassLight, 0.95);
    } else {
      pxRect(g, x + w - 7, y + h - 2, 7, 2, col, 0.8); pxRect(g, x + w - 2, y + h - 7, 2, 7, col, 0.8);
      pxRect(g, x + w - 2, y + h - 2, 1, 1, C.brassLight, 0.95);
    }
  }

  // 选中 / 待绑定 / 合法目标：四角亮起短护角
  if (focus || auxSrc || auxValid) {
    const col = auxSrc ? C.arcaneLight : auxValid ? C.teal : C.brassLight;
    for (const [cx, cy, dx, dy] of [[x + 2, y + 2, 1, 1], [x + w - 3, y + 2, -1, 1], [x + 2, y + h - 3, 1, -1], [x + w - 3, y + h - 3, -1, -1]]) {
      pxLine(g, cx, cy, cx + dx * 4, cy, col, 0.9, 1);
      pxLine(g, cx, cy, cx, cy + dy * 4, col, 0.9, 1);
    }
  }

  if (!unlocked) {
    // 封印格加两道交叉蚀刻，读作“被锁住的回路”
    pxLine(g, x + 2, y + h - 2, x + w - 2, y + 2, C.brassDark, 0.16, 1);
    pxLine(g, x + 2, y + 2, x + w - 2, y + h - 2, C.brassDark, 0.08, 1);
    for (const [sx, sy] of [[x + 2, y + 2], [x + w - 3, y + 2], [x + 2, y + h - 3], [x + w - 3, y + h - 3]]) {
      pxRect(g, sx, sy, 1, 1, C.brass, 0.35);
    }
    pxDiamond(g, x + 8, y + 9, 3, C.stoneDark, 0.9, false);
    text(x + nameX, y + 2, '封印', nameSize, HEX.mute);
    text(x + 4, subY, (id + 1) + ' 号 · 未解封', subSize, HEX.mute);
    return;
  }
  if (slot) {
    const visual = cardVisual(slot);
    if (visual.glyph) {
      // 法术图标外面再套一圈同色细菱形，读作「已嵌进符位」
      const gr = 5 + 3 * (glyphScale - 1);
      pxDiamond(g, x + 4 + 4 * glyphScale, y + 5 + 4 * glyphScale, gr, visual.color ?? C.arcaneLight, 0.28, false);
      drawGlyph(g, x + 4, y + 5, visual.glyph, visual.color ?? C.arcaneLight, { scale: glyphScale, alpha: 0.95 });
    }
    text(x + nameX, y + 3, clipText(visual.name ?? '?', 6), nameSize, slot.kind === 'auxiliary' ? HEX.teal : HEX.parchment);
    // 名称与状态之间一条细刻线，把每格分成「徽记 / 铭文」两层
    pxLine(g, x + 3, subY - 1, x + w - 3, subY - 1, C.brassDark, 0.28, 1);
    // 铭文槽：两个小菱形，装了铭文填黄铜、空槽只留暗框
    for (let i = 0; i < 2; i++) {
      const sx = x + w - 9 + i * 4;
      pxDiamond(g, sx, y + 4, 2, i < runes ? C.brass : C.brassDark, i < runes ? 0.95 : 0.35, i < runes);
    }
    if (target !== undefined) pxDiamond(g, x + w - 5, y + h - 6, 2, C.teal, 0.95, true);
    const sub = auxSrc ? '待选目标'
      : canReplace ? '点此替换'
        : (id + 1) + '号 铭' + runes + ' 出' + exits + (target !== undefined ? ' →' + (target + 1) : '');
    text(x + 4, subY, clipText(sub, 14), subSize, auxSrc ? HEX.arcaneLight : canReplace ? HEX.brassLight : HEX.mute);
    return;
  }
  pxDiamond(g, x + 8, y + 9, 6, C.groove, 0.3, false);
  pxDiamond(g, x + 8, y + 9, 3, C.stoneDark, 0.9, false);
  text(x + nameX, y + 2, '空符位', nameSize, HEX.mute);
  const sub = canPlace ? '可放置 · 点此' : auxValid ? '可绑定 · 点此' : (id + 1) + '号 · 从手牌放入';
  text(x + 4, subY, sub, subSize, canPlace ? HEX.brassLight : auxValid ? HEX.teal : HEX.mute);
}

// 手牌行：选中左亮条 + 图标 + 名称×数量 + 右对齐效果说明
export function kitHandRow(g, text, r, o = {}) {
  const { x, y, w, h } = r;
  const sel = !!o.selected;
  pxRect(g, x, y, w, h, sel ? C.nightSoft : C.night, 0.96);
  pxFrame(g, x, y, w, h, sel ? C.teal : C.stoneLight, 1, sel ? 1 : 0.7);
  if (sel) pxRect(g, x + 1, y + 1, 2, h - 2, C.teal, 1);
  const visual = cardVisual({ kind: o.kind ?? 'sigil', defId: o.defId });
  if (visual.glyph) drawGlyph(g, x + 5, y + Math.max(2, Math.floor((h - 8) / 2)), visual.glyph, sel ? C.arcaneLight : C.parchment, { alpha: 0.95 });
  text(x + 16, y + 2, clipText((visual.name ?? o.defId) + ' ×' + (o.count ?? 1), 11), 8, sel ? HEX.arcaneLight : HEX.parchment);
  if (o.hint) {
    text(x + w - 4, y + 4, clipText(o.hint, o.hintMax ?? 14), 7, sel ? HEX.arcaneLight : HEX.mute).setOrigin?.(1, 0);
  }
}

// 详情面板：标题 + 可选图标 + 多行说明（调用方自行控制行数与长度）
export function kitDetail(g, text, r, o = {}) {
  const { x, y, w, h } = r;
  pxRect(g, x, y, w, h, C.nightDeep, 0.96);
  pxFrame(g, x, y, w, h, o.accent ?? C.stoneLight, 1, 0.9);
  pxDiamond(g, x + 5, y + 6, 2, o.accent ?? C.brass, 0.95, false);
  text(x + 10, y + 2, o.title ?? '详情', 7, HEX.brass);
  let ty = y + 13;
  if (o.icon) {
    drawGlyph(g, x + 4, ty + 1, o.icon, o.accent ?? C.arcaneLight, { alpha: 0.95 });
    ty += 1;
  }
  const left = x + (o.icon ? 15 : 5);
  for (const line of o.lines ?? []) {
    if (ty > y + h - 7) break;
    text(left, ty, clipText(line.text ?? '', line.max ?? 26), line.size ?? 7, line.color ?? HEX.mute);
    ty += (line.size ?? 7) + 3;
  }
}

// 主按钮：默认暗底黄铜框，primary 用青框亮底；disabled 只降透明度
export function kitAction(g, text, r, label, o = {}) {
  const { x, y, w, h } = r;
  const primary = !!o.primary;
  const disabled = !!o.disabled;
  pxRect(g, x, y, w, h, primary ? C.stoneDark : C.nightDeep, disabled ? 0.6 : 1);
  pxFrame(g, x, y, w, h, primary ? C.teal : C.brassDark, 1, disabled ? 0.5 : 1);
  if (primary) pxRect(g, x + 1, y + 1, w - 2, 1, C.teal, 0.5);
  text(x + w / 2, y + Math.max(2, Math.floor((h - 9) / 2)), label, o.size ?? 8, disabled ? HEX.mute : primary ? HEX.teal : HEX.parchment).setOrigin?.(0.5, 0);
}
