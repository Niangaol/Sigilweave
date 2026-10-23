// 4×4 法阵盘面：斜置压缩台面、封印/解封格、冷却角标、起点标记与暂停细目
// 方位映射由 src/logic/sector.js 决定；这里只负责让玩家看懂盘面。
import { C, HEX, addText, pxRect, pxFrame, pxLine, pxPoly, pxPolyLine, pxDiamond, pxRing } from './Palette.js';
import { toRC } from '../logic/grid.js';
import { cardVisual, sectorLabel } from '../data/roster.js';

// 用户修订：地图为主画面，法术罗盘固定右下角，保留紧凑斜置盘面。
export const BOARD = {
  // 右下角固定小窗：整屏地图是主画面，法阵只作为罗盘常驻
  panel: { x: 326, y: 174, w: 152, h: 86 },
  left: 346,
  top: 200,
  cellW: 29,
  cellH: 11,
  stepX: 31,
  stepY: 12,
  shear: 5,
  hullBottom: 247,
  wallBottom: 251,
};

export function cellQuad(id) {
  const { r, c } = toRC(id);
  const x0 = BOARD.left + c * BOARD.stepX - r * BOARD.shear;
  const y0 = BOARD.top + r * BOARD.stepY;
  return [
    { x: x0 + BOARD.shear, y: y0 },
    { x: x0 + BOARD.shear + BOARD.cellW, y: y0 },
    { x: x0 + BOARD.cellW, y: y0 + BOARD.cellH },
    { x: x0, y: y0 + BOARD.cellH },
  ];
}

export function cellCenter(id) {
  const { r, c } = toRC(id);
  return {
    x: BOARD.left + c * BOARD.stepX - r * BOARD.shear + BOARD.shear / 2 + BOARD.cellW / 2,
    y: BOARD.top + r * BOARD.stepY + BOARD.cellH / 2,
  };
}

export function hullPoints() {
  return [
    { x: BOARD.left + BOARD.shear, y: BOARD.top },
    { x: BOARD.left + 3 * BOARD.stepX + BOARD.shear + BOARD.cellW, y: BOARD.top },
    { x: BOARD.left + 3 * BOARD.stepX - 3 * BOARD.shear + BOARD.cellW, y: BOARD.hullBottom },
    { x: BOARD.left - 3 * BOARD.shear, y: BOARD.hullBottom },
  ];
}

export default class SigilBoard {
  constructor(scene, grid) {
    this.scene = scene;
    this.grid = grid;
    this.baseG = scene.add.graphics().setDepth(500);
    this.dynG = scene.add.graphics().setDepth(510);
    this.flashes = new Map(); // cellId -> { kind, start, dur }
    this.startCell = null;
    this.detailVisible = false;
    this.detailTitle = addText(scene, 8, 196, '最闲六格', 8, HEX.brassLight).setDepth(520).setVisible(false);
    this.detailNote = addText(scene, 62, 196, '2.0s/跳', 7, HEX.mute).setDepth(520).setVisible(false);
    this.detailLines = [];
    for (let i = 0; i < 6; i++) {
      const t = addText(scene, 8, 208 + i * 9, '', 8, HEX.parchment).setDepth(521).setVisible(false);
      this.detailLines.push(t);
    }
    this.drawBase();
  }

  drawBase() {
    const g = this.baseG;
    g.clear();

    // 小窗底板：让罗盘在满屏地图上依然读得清
    const p = BOARD.panel;
    pxRect(g, p.x, p.y, p.w, p.h, C.void, 0.86);
    pxFrame(g, p.x, p.y, p.w, p.h, C.brassDark, 1);
    pxFrame(g, p.x + 1, p.y + 1, p.w - 2, p.h - 2, C.stoneDark, 1);

    const hull = hullPoints();

    // 台面投影：整体下移 4px 的硬边黑影
    pxPoly(g, hull.map((p) => ({ x: p.x + 2, y: p.y + 5 })), C.void, 0.45);

    // 左右侧壁：斜面厚度，这是 2.5D 的第一根支柱
    const tl = hull[0], tr = hull[1], br = hull[2], bl = hull[3];
    pxPoly(g, [
      { x: tl.x - 4, y: tl.y }, { x: bl.x - 4, y: bl.y },
      { x: bl.x, y: bl.y }, { x: tl.x, y: tl.y },
    ], C.nightDeep, 1);
    pxPoly(g, [
      { x: tr.x, y: tr.y }, { x: br.x, y: br.y },
      { x: br.x + 4, y: br.y }, { x: tr.x + 4, y: tr.y },
    ], C.nightDeep, 1);
    // 左右壁上的凿痕
    pxLine(g, tl.x - 2, tl.y + 6, bl.x - 2, bl.y - 4, C.stoneDark, 1, 1);
    pxLine(g, tr.x + 2, tr.y + 6, br.x + 2, br.y - 4, C.stoneDark, 1, 1);

    // 正面石壁：底部厚度
    pxRect(g, bl.x, BOARD.hullBottom, br.x - bl.x, BOARD.wallBottom - BOARD.hullBottom, C.stoneDark, 1);
    pxRect(g, bl.x, BOARD.hullBottom, br.x - bl.x, 1, C.stone, 1);
    for (let x = bl.x + 8; x < br.x; x += 28) {
      pxRect(g, x, BOARD.hullBottom + 1, 1, 5, C.nightDeep, 0.8);
    }
    pxRect(g, bl.x, BOARD.wallBottom - 1, br.x - bl.x, 1, C.brassDark, 0.7);

    // 台面底色
    pxPoly(g, hull, C.stoneDark, 1);

    // 顶部石沿与黄铜蚀刻
    pxPoly(g, [
      { x: tl.x, y: tl.y }, { x: tr.x, y: tr.y },
      { x: tr.x, y: tl.y - 4 }, { x: tl.x, y: tl.y - 4 },
    ], C.nightDeep, 1);
    pxLine(g, tl.x, tl.y, tr.x, tr.y, C.brass, 0.55, 1);
    pxLine(g, tl.x + 2, tl.y - 3, tr.x - 2, tr.y - 3, C.groove, 0.35, 1);
    // 铆钉
    for (let x = tl.x + 10; x < tr.x - 4; x += 36) {
      pxRect(g, Math.round(x), Math.round(tl.y - 4), 2, 2, C.brassDark, 1);
      pxRect(g, Math.round(x), Math.round(tl.y - 4), 1, 1, C.brassLight, 0.7);
    }
    // 盘面标题
    addText(this.scene, 402, 180, '法术罗盘', 8, HEX.brass).setOrigin(0.5, 0).setDepth(515);

    // 16 格
    for (let id = 0; id < 16; id++) {
      const cell = this.grid.cells[id];
      const quad = cellQuad(id);
      const { r, c } = toRC(id);
      const x0 = BOARD.left + c * BOARD.stepX - r * BOARD.shear;
      const y0 = BOARD.top + r * BOARD.stepY;

      if (cell.unlocked) {
        // 解封格：被烛光照亮的紫灰石板
        pxPoly(g, quad, C.stone, 1);
        // 顶部受光、底部背光，模拟凹槽（不是渐变，只有两条硬边）
        pxLine(g, quad[0].x, quad[0].y, quad[1].x, quad[1].y, C.groove, 0.85, 1);
        pxLine(g, quad[3].x, quad[3].y, quad[2].x, quad[2].y, C.stoneDark, 1, 1);
        pxPolyLine(g, quad, C.nightDeep, 1, 1, true);
        // 黄铜角钉
        pxRect(g, Math.round(x0 + BOARD.shear + 2), y0 + 2, 1, 1, C.brassLight, 0.9);
        pxRect(g, Math.round(x0 + BOARD.cellW - 3), y0 + BOARD.cellH - 3, 1, 1, C.brass, 0.7);

        // 符印图案：8×8 像素，刻在格子中央
        const sigil = cardVisual(cell.slot);
        const cx = Math.round(cellCenter(id).x);
        const cy = Math.round(cellCenter(id).y);
        const gx = cx - 4;
        const gy = cy - 4;
        if (cell.slot) {
          g.fillStyle(C.void, 0.75);
          g.fillRect(gx - 1, gy - 1, 10, 10);
        }
        g.fillStyle(sigil.color, 1);
        for (let rr = 0; rr < 8; rr++) {
          const row = sigil.glyph[rr] || '';
          for (let cc = 0; cc < 8; cc++) {
            if (row[cc] === '#') g.fillRect(gx + cc, gy + rr, 1, 1);
          }
        }

        // 右上角 4×4 方位小图：点亮本格对应的扇区，教玩家「格=方位」
        const mx = Math.round(x0 + BOARD.shear + BOARD.cellW - 11);
        const my = y0 + 3;
        for (let sr = 0; sr < 4; sr++) {
          for (let sc = 0; sc < 4; sc++) {
            const lit = sr === r && sc === c;
            pxRect(g, mx + sc * 2, my + sr * 2, 1, 1, lit ? C.arcane : C.groove, lit ? 1 : 0.35);
          }
        }
      } else {
        // 封印格：更暗，中心压一枚封纹
        pxPoly(g, quad, C.night, 1);
        pxPolyLine(g, quad, C.stoneDark, 0.9, 1, true);
        const cx = Math.round(cellCenter(id).x);
        const cy = Math.round(cellCenter(id).y);
        pxRect(g, cx - 3, cy, 7, 1, C.stoneDark, 0.9);
        pxRect(g, cx, cy - 3, 1, 7, C.stoneDark, 0.9);
        pxDiamond(g, cx, cy, 3, C.stoneDark, 0.75, false);
      }
    }

    // 台面外缘的黄铜蚀刻
    pxPolyLine(g, hull, C.brassDark, 0.85, 1, true);
  }

  flash(cellId, kind, dur) {
    this.flashes.set(cellId, { kind, start: this.scene.time.now, dur });
  }

  flashTrigger(cellId) { this.flash(cellId, 'trigger', 170); }
  flashBlocked(cellId) { this.flash(cellId, 'blocked', 380); }
  flashDissipate(cellId) { this.flash(cellId, 'dissipate', 320); }
  flashCombo(cellId) { this.flash(cellId, 'combo', 420); }

  setStart(cellId) {
    this.startCell = cellId;
  }

  setDetailVisible(v) {
    this.detailVisible = !!v;
    this.detailTitle.setVisible(this.detailVisible);
    this.detailNote.setVisible(this.detailVisible);
    for (const line of this.detailLines) line.setVisible(this.detailVisible);
  }

  // 每帧刷新：触发闪光、冷却角标、冷却进度、起点标记、暂停细目
  updateDynamic(engine, now, paused) {
    const g = this.dynG;
    g.clear();
    const t = this.scene.time.now;

    for (let id = 0; id < 16; id++) {
      const cell = this.grid.cells[id];
      if (!cell.unlocked) continue;
      const quad = cellQuad(id);
      const { r, c } = toRC(id);
      const x0 = BOARD.left + c * BOARD.stepX - r * BOARD.shear;
      const y0 = BOARD.top + r * BOARD.stepY;
      const cx = Math.round(cellCenter(id).x);
      const cy = Math.round(cellCenter(id).y);

      // 触发/联组/消散/受阻的格内闪光
      const flash = this.flashes.get(id);
      if (flash) {
        const k = (t - flash.start) / flash.dur;
        if (k >= 1) {
          this.flashes.delete(id);
        } else {
          const a = 1 - k;
          if (flash.kind === 'trigger') {
            pxPoly(g, quad, C.arcane, 0.38 * a);
            pxLine(g, quad[0].x, quad[0].y, quad[1].x, quad[1].y, C.arcaneLight, a, 1);
          } else if (flash.kind === 'combo') {
            pxPoly(g, quad, C.arcane, 0.5 * a);
            pxPolyLine(g, quad, C.white, a, 1, true);
          } else if (flash.kind === 'dissipate') {
            pxPoly(g, quad, C.groove, 0.28 * a);
          } else if (flash.kind === 'blocked') {
            // 冷却角标：黄铜色小沙漏，闪烁三下
            const blink = Math.floor(k * 6) % 2 === 0;
            if (blink) {
              const bx = Math.round(x0 + BOARD.shear + BOARD.cellW - 12);
              const by = y0 + 2;
              pxFrame(g, bx, by, 8, 8, C.brass, 1, 1);
              pxRect(g, bx + 2, by + 2, 4, 1, C.brassLight, 1);
              pxRect(g, bx + 3, by + 3, 2, 1, C.brassLight, 1);
              pxRect(g, bx + 2, by + 5, 4, 1, C.brassLight, 1);
              pxRect(g, bx + 3, by + 4, 2, 1, C.brassLight, 1);
              pxPolyLine(g, quad, C.brass, 0.9 * a, 1, true);
            }
          }
        }
      }

      // 冷却进度：底部一条黄铜刻线，剩余越多越长
      const remain = cell.cooldownUntil - now;
      if (remain > 0) {
        const ratio = Math.max(0, Math.min(1, remain / Math.max(1, cell.effCooldownMs)));
        const barWidth = BOARD.cellW - 6;
        pxRect(g, Math.round(x0 + 3), y0 + BOARD.cellH - 2, barWidth, 1, C.nightDeep, 0.85);
        pxRect(g, Math.round(x0 + 3), y0 + BOARD.cellH - 2, Math.max(1, Math.round(barWidth * ratio)), 1, C.brass, 0.95);
      }

      // 起点标记：菱形 + 向下小箭头，只在当前起点格
      if (id === this.startCell) {
        const pulse = Math.floor(t / 260) % 2;
        const alpha = pulse ? 1 : 0.55;
        pxDiamond(g, cx, y0 - 5, 3, C.arcane, alpha, true);
        pxRect(g, cx - 1, y0 - 1, 2, 1, C.arcane, alpha);
        pxRect(g, cx, y0, 1, 1, C.arcane, alpha);
      }

      // 暂停时给解封格加一圈很淡的黄铜描边，强调「可以观察」
      if (paused) {
        pxPolyLine(g, quad, C.brass, 0.22, 1, true);
      }
    }

    if (this.detailVisible) this.drawDetail(engine, now);
  }

  drawDetail(engine, now) {
    const g = this.dynG;
    // 羊皮纸质感的小面板（法阵区左侧空位）
    pxRect(g, 5, 194, 110, 71, C.ink, 0.94);
    pxFrame(g, 5, 194, 110, 71, C.brassDark, 1, 1);
    pxFrame(g, 7, 196, 106, 67, C.brass, 0.35, 1);
    pxRect(g, 9, 205, 102, 1, C.brassDark, 0.6);
    pxRect(g, 9, 257, 102, 1, C.brassDark, 0.35);

    const unlocked = this.grid.unlockedIds().sort((a, b) => engine.stats.perCellTriggers[a] - engine.stats.perCellTriggers[b] || a - b);
    for (let i = 0; i < this.detailLines.length; i++) {
      const line = this.detailLines[i];
      if (i >= unlocked.length) {
        line.setText('');
        continue;
      }
      const id = unlocked[i];
      const cell = this.grid.cells[id];
      const def = cardVisual(cell.slot);
      const tag = id === this.startCell ? '起' : '';
      line.setText(sectorLabel(id) + ' ' + def.short + (tag ? ' ' + tag : ''));
      // 冷却条：满了是黄铜，就绪是暗槽
      const bx = 74;
      const by = 208 + i * 9;
      pxRect(g, bx, by + 1, 34, 3, C.nightDeep, 1);
      pxFrame(g, bx, by + 1, 34, 3, C.brassDark, 1, 0.7);
      const remain = Math.max(0, cell.cooldownUntil - now);
      const ratio = remain > 0 ? Math.max(0.05, remain / Math.max(1, cell.effCooldownMs)) : 0;
      if (ratio > 0) {
        pxRect(g, bx + 1, by + 2, Math.round(31 * ratio), 1, C.brass, 0.9);
      } else {
        pxRect(g, bx + 1, by + 2, 32, 1, C.teal, 0.25);
      }
    }
  }
}
