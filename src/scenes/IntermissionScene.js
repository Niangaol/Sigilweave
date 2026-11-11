// 幕间工作台独立于战斗：只编辑草稿，出发时一次提交；右下罗盘布局仅用于战斗。
import Phaser from 'phaser';
import { C, HEX, addText, pxRect, pxFrame, pxDiamond, drawGlyph, applyPixelZoom, isPortrait, CANVAS_H_PORTRAIT } from '../ui/Palette.js';
import { cardVisual, RUNE_GLYPHS } from '../data/roster.js';
import { createGrid } from '../logic/grid.js';
import { applyDraft, draftFromGrid, unlockToTarget, AUX_TARGETED, missingAuxTargets, auxTargetCandidates } from '../logic/build.js';
import { SIGIL_DEFS, AUX_DEFS, RUNE_DEFS, OATH_DEFS } from '../logic/effects.js';
import { neighborsOf } from '../logic/grid.js';
import { createWorkshop, chooseReward, placeCard, removeCard, installRune, removeRune, canDepart } from '../logic/workshop.js';
import { ACTS, ORTHO_DIRS } from '../logic/constants.js';
import { playCutscene } from '../ui/transition.js';
import { kitPanel, kitBoard, kitBoardMotion, kitHeader, kitSteps, kitCell, kitHandRow, clipText } from '../ui/editor-ui.js';
import { CARD_HINTS } from '../data/card-hints.js';

const names = { ...SIGIL_DEFS, ...AUX_DEFS, ...RUNE_DEFS };
const hints = CARD_HINTS;
const OATH_LIST = [['lone_star', '孤星'], ['watcher', '守夜'], ['martyr', '殉道']];

export default class IntermissionScene extends Phaser.Scene {
  constructor() { super('IntermissionScene'); }
  init(data) { this.run = data.run; this.report = data.report ?? {}; this.__cine = !!data.__cine; }
  create() {
    applyPixelZoom(this);
    const preview = createGrid();
    const result = applyDraft(preview, this.run.draft, { phase: 'intermission' });
    if (!result.ok) throw new Error('幕间收到无效构筑');
    unlockToTarget(preview, ACTS[this.run.act - 1].unlocked);
    this.workshop = createWorkshop({ draft: draftFromGrid(preview, { act: this.run.act }), shards: this.run.shards, seed: this.run.seed + ':' + this.run.act });
    if (this.run.hand) this.workshop.hand = { ...this.workshop.hand, ...this.run.hand };
    if (this.run.runeCosts) this.workshop.runeCosts = structuredClone(this.run.runeCosts);
    this.focusCell = this.workshop.draft.unlocked[0];
    this.selectedCard = null;
    this.auxPending = null;
    this.exitMode = false;
    this.departed = false;
    this.note = '三轮奖励选完后出发；法阵必须保留至少两张非中继输出。';
    this.input.keyboard.resetKeys();
    this.view = this.add.container(0, 0);
    // 悬停高亮独立成层：移鼠标只清这一层，不重建整页文字
    this.hoverG = this.add.graphics().setDepth(5);
    // 法阵盘动态层：静态 view 之上、悬停层之下，约 30fps 重绘
    this.animG = this.add.graphics().setDepth(4);
    this.animAcc = 0;
    this.animFrames = 0;
    this.paint();
    window.__SIGILWEAVE_WORKSHOP__ = this;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.animG?.destroy(); this.animG = null;
      if (window.__SIGILWEAVE_WORKSHOP__ === this) window.__SIGILWEAVE_WORKSHOP__ = null;
    });
  }
  text(x, y, value, size = 8, color = HEX.parchment, extra = {}) {
    const t = addText(this, x, y, value, size, color, extra); this.view.add(t); return t;
  }
  // —— 视觉构件 ——
  // 分区面板：底 + 双层黄铜边框 + 四角铆钉，统一所有区块的仪式感
  panel(g, x, y, w, h, opts = {}) { kitPanel(g, x, y, w, h, opts); }

  // 悬停高亮画在独立图层：只清这一层，不必重建整页文字
  hoverRect(x, y, w, h, color = C.brassLight) {
    const g = this.hoverG;
    if (!g) return;
    g.clear();
    pxRect(g, x, y, w, h, color, 0.1);
    pxFrame(g, x, y, w, h, color, 1, 0.8);
  }

  clearHover() { this.hoverG?.clear(); }

  zone(x, y, w, h, action, color = C.brassLight) {
    const z = this.add.zone(x, y, w, h).setOrigin(0).setInteractive({ useHandCursor: true });
    this.view.add(z);
    z.on('pointerover', () => this.hoverRect(x, y, w, h, color));
    z.on('pointerout', () => this.clearHover());
    z.on('pointerdown', () => { if (!this.departed) action(); });
    return z;
  }

  glyphOf(defId, kind) {
    if (RUNE_GLYPHS[defId]) return RUNE_GLYPHS[defId];
    return cardVisual({ kind: kind ?? (SIGIL_DEFS[defId] ? 'sigil' : 'auxiliary'), defId })?.glyph ?? null;
  }

  button(x, y, w, h, label, action, color = HEX.parchment, opts = {}) {
    const g = this.add.graphics(); this.view.add(g);
    pxRect(g, x, y, w, h, opts.fill ?? C.stoneDark, opts.alpha ?? 1);
    pxFrame(g, x, y, w, h, opts.frame ?? C.brassDark);
    pxRect(g, x + 1, y + 1, w - 2, 1, C.brass, 0.25);
    this.text(x + w / 2, y + h / 2, label, opts.size ?? 8, color).setOrigin(0.5);
    return this.zone(x, y, w, h, action);
  }

  // 带图标的按钮：左侧 8×8 字模 + 竖分隔线，文字左对齐
  iconButton(x, y, w, h, defId, label, action, color = HEX.parchment, kind = null) {
    const g = this.add.graphics(); this.view.add(g);
    pxRect(g, x, y, w, h, C.stoneDark, 1);
    pxFrame(g, x, y, w, h, C.brassDark);
    const glyph = this.glyphOf(defId, kind);
    if (glyph) drawGlyph(g, x + 4, y + Math.floor((h - 8) / 2), glyph, C.arcaneLight, { alpha: 0.95 });
    pxRect(g, x + 15, y + 2, 1, h - 4, C.brassDark, 0.6);
    this.text(x + 20, y + Math.floor((h - 8) / 2) + 1, label, 8, color);
    return this.zone(x, y, w, h, action);
  }

  // 手牌行：与战斗内暂停改阵共用同一组件
  handRow(x, y, w, h, o) {
    const g = this.add.graphics(); this.view.add(g);
    kitHandRow(g, (X, Y, s, size, color) => this.text(X, Y, s, size, color), { x, y, w, h }, o);
    return this.zone(x, y, w, h, o.action, C.arcaneLight);
  }

  // 布局：横屏维持原坐标（workshop-smoke 依赖），竖屏重排为大触控版式
  layout() {
    if (!isPortrait()) {
      return {
        canvasH: 270,
        cell: (id) => ({ x: 14 + (id % 4) * 54, y: 76 + Math.floor(id / 4) * 29, w: 51, h: 26 }),
        gridPanel: { x: 10, y: 72, w: 224, h: 124 },
        rewardPanel: { x: 10, y: 26, w: 460, h: 34 },
        rewardCard: (i) => ({ x: 14 + i * 152, y: 28, w: 144, h: 22 }),
        rewardHintY: 50,
        infoY: 63,
        statsPanel: { x: 10, y: 196, w: 224, h: 62 },
        statsY: [200, 211, 220],
        // 详情行下移后给誓约留出的空间：226 标签 / 230 按钮 / 240 当前誓约（状态行走 246）
        oathLabelY: 228,
        oathBtn: (i) => ({ x: 52 + i * 58, y: 232, w: 54, h: 12 }),
        oathCurrentY: 0,
        handPanel: { x: 240, y: 72, w: 230, h: 190 },
        handRow: (row) => ({ x: 244, y: 88 + row * 16, w: 216, h: 14 }),
        runeBtn: (i) => ({ x: (i % 2 ? 355 : 244), y: 192 + Math.floor(i / 2) * 17, w: 105, h: 15 }),
        runeSlot: (i) => ({ x: 244 + i * 111, y: 226, w: 105, h: 15 }),
        noteY: 246,
        depart: { x: 244, y: 250, w: 216, h: 12 },
        exitPanel: { x: 10, y: 196, w: 224, h: 70 },
        exitTitleY: 199,
        exitBtn: (i) => ({ x: 16 + (i % 2) * 102, y: 214 + Math.floor(i / 2) * 20, w: 102, h: 18 }),
        exitDone: { x: 16, y: 254, w: 204, h: 12 },
        exitNoteY: 240,
        exitLabelY: 199,
      };
    }
    return {
      canvasH: CANVAS_H_PORTRAIT,
      cell: (id) => ({ x: 22 + (id % 4) * 112, y: 138 + Math.floor(id / 4) * 60, w: 104, h: 54 }),
      gridPanel: { x: 10, y: 124, w: 460, h: 268 },
      rewardPanel: { x: 10, y: 32, w: 460, h: 76 },
      rewardCard: (i) => ({ x: 14 + i * 152, y: 42, w: 144, h: 46 }),
      rewardHintY: 92,
      infoY: 116,
      statsPanel: { x: 10, y: 400, w: 460, h: 46 },
      statsY: [404, 416, 428],
      oathLabelY: 456,
      oathBtn: (i) => ({ x: 60 + i * 104, y: 450, w: 96, h: 24 }),
      oathCurrentY: 478,
      handPanel: { x: 10, y: 484, w: 460, h: 116 },
      handRow: (row) => ({ x: 16 + (row % 2) * 228, y: 506 + Math.floor(row / 2) * 30, w: 216, h: 26 }),
      runeBtn: (i) => ({ x: 16 + i * 116, y: 608, w: 108, h: 30 }),
      runeSlot: (i) => ({ x: 16 + i * 232, y: 646, w: 220, h: 26 }),
      noteY: 680,
      depart: { x: 140, y: 704, w: 200, h: 40 },
      exitPanel: { x: 10, y: 400, w: 460, h: 180 },
      exitTitleY: 406,
      exitBtn: (i) => ({ x: 20 + (i % 2) * 220, y: 440 + Math.floor(i / 2) * 52, w: 200, h: 44 }),
      exitDone: { x: 16, y: 600, w: 448, h: 40 },
      exitNoteY: 406,
      exitLabelY: 406,
    };
  }

  paint() {
    this.view.removeAll(true);
    this.clearHover();
    const w = this.workshop;
    const g = this.add.graphics(); this.view.add(g);
    const L = this.layout();

    // 背景：硬边竖纹 + 四角硬边压暗 + 双层外框（全程无平滑渐变）
    pxRect(g, 0, 0, 480, L.canvasH, C.void);
    for (let x = 0; x < 480; x += 24) pxRect(g, x, 0, 12, L.canvasH, C.ink, 0.22);
    for (let i = 0; i < 3; i++) {
      const a = 0.1 - i * 0.03;
      pxRect(g, 0, i * 8, 480, 8, C.void, a);
      pxRect(g, 0, L.canvasH - (i + 1) * 8, 480, 8, C.void, a);
      pxRect(g, i * 8, 0, 8, L.canvasH, C.void, a);
      pxRect(g, 480 - (i + 1) * 8, 0, 8, L.canvasH, C.void, a);
    }
    pxFrame(g, 6, 6, 468, L.canvasH - 12, C.brassDark);
    pxFrame(g, 8, 8, 464, L.canvasH - 16, C.brass, 1, 0.18);

    // 标题栏：与战斗内暂停改阵共用同一组件，只换标题/副标题
    kitHeader(g, (x, y, s, size, color) => this.text(x, y, s, size, color), {
      x: 10, y: 10, w: 460,
      title: '幕间构筑',
      subtitle: '第 ' + w.draft.act + ' 幕准备 · 奖励 ' + w.roundsRemaining + ' 轮 · 已解封 ' + w.draft.unlocked.length + '/16',
      rightLabel: '碎片', rightValue: w.shards, rightColor: HEX.teal,
    });

    // 奖励区
    this.panel(g, L.rewardPanel.x, L.rewardPanel.y, L.rewardPanel.w, L.rewardPanel.h, { fill: C.ink, alpha: 0.88 });
    const offer = w.offer;
    if (offer) {
      offer.cards.forEach((card, i) => {
        const r = L.rewardCard(i);
        this.iconButton(r.x, r.y, r.w, r.h, card.defId,
          names[card.defId].name + '  领取', () => this.choose(i),
          card.kind === 'auxiliary' ? HEX.teal : HEX.arcaneLight, card.kind);
        this.text(r.x + 3, L.rewardHintY, hints[card.defId] ?? '', 7, HEX.mute);
      });
    } else {
      this.text(20, 42, '三轮奖励已领取 · 选右侧手牌，再点左侧符位放置', 8, HEX.teal);
    }

    // 引导条：三步流程 + 右端奖励/解封信息；两处编辑器同一位置、同一组件
    kitSteps(g, (x, y, s, size, color) => this.text(x, y, s, size, color), 14, L.infoY - 3, 440, {
      active: this.auxPending !== null ? 2 : this.selectedCard ? 1 : 0,
    });

    // 法阵区
    this.panel(g, L.gridPanel.x, L.gridPanel.y, L.gridPanel.w, L.gridPanel.h, { fill: C.nightDeep, alpha: 0.82 });
    // 法阵盘装饰：板框 / 四向罗盘钉 / 格间导线 / 侧边符刻（横竖屏共用，按格子几何自动伸缩）
    const c0 = L.cell(0), c1 = L.cell(1), c4 = L.cell(4);
    kitBoard(g, {
      panel: L.gridPanel,
      cells: { x0: c0.x, y0: c0.y, cw: c0.w, ch: c0.h, gapX: c1.x - c0.x - c0.w, gapY: c4.y - c0.y - c0.h },
    });
    const grid = createGrid();
    applyDraft(grid, w.draft, { phase: 'intermission' });
    const auxNeighbors = this.auxPending !== null
      ? new Set(neighborsOf(this.auxPending, ORTHO_DIRS).map(n => n.id))
      : null;
    for (let id = 0; id < 16; id++) {
      const cellRect = L.cell(id);
      const unlocked = w.draft.unlocked.includes(id);
      const slot = w.draft.slots[id];
      kitCell(g, (x, y, s, size, color) => this.text(x, y, s, size, color), id, cellRect, {
        unlocked,
        slot,
        focus: this.focusCell,
        auxSrc: this.auxPending === id ? id : null,
        auxValid: !!auxNeighbors?.has(id) && slot?.kind === 'sigil',
        selecting: !!this.selectedCard,
        target: w.draft.auxTargets[id],
        runes: (w.draft.runes[id] ?? []).filter(Boolean).length,
        exits: this.currentExits(id).length,
        exitList: this.currentExits(id),
        glyphScale: isPortrait() ? 2 : 1,
        nameSize: isPortrait() ? 10 : 8,
        subSize: isPortrait() ? 8 : 7,
      });
      this.zone(cellRect.x, cellRect.y, cellRect.w, cellRect.h, () => this.clickCell(id), C.arcaneLight);
    }

    const cell = grid.cells[this.focusCell];
    if (this.exitMode) {
      // 出口编辑面板：临时覆盖统计区，不改动法阵本身
      this.panel(g, L.exitPanel.x, L.exitPanel.y, L.exitPanel.w, L.exitPanel.h, { fill: C.ink, alpha: 0.97, frame: C.brass });
      this.text(16, L.exitTitleY, '出口编辑 · ' + (this.focusCell + 1) + ' 号（' + (w.draft.slots[this.focusCell] ? names[w.draft.slots[this.focusCell].defId] : '空符位') + '）', 8, HEX.brassLight);
      const cur = this.currentExits(this.focusCell);
      const dirs = [['up', '上'], ['down', '下'], ['left', '左'], ['right', '右']];
      dirs.forEach(([d, label], i) => {
        const r = L.exitBtn(i);
        this.button(r.x, r.y, r.w, r.h, label + ' ' + (cur.includes(d) ? '开' : '关'), () => this.toggleExit(d),
          cur.includes(d) ? HEX.teal : HEX.mute, { fill: cur.includes(d) ? C.stone : C.nightDeep });
      });
      const d = L.exitDone;
      this.button(d.x, d.y, d.w, d.h, '完成出口编辑', () => { this.exitMode = false; this.paint(); }, HEX.brassLight);
      this.text(244, L.exitNoteY, w.note ?? this.note, 7, HEX.arcaneLight, { wordWrap: { width: 216 } });
      const ex = this.currentExits(this.focusCell);
      const label = { up: '上', down: '下', left: '左', right: '右' };
      this.text(228, L.exitLabelY, ex.map(dd => label[dd]).join('') || '无', 8, HEX.teal).setOrigin(1, 0);
      return;
    }

    // 统计区
    this.panel(g, L.statsPanel.x, L.statsPanel.y, L.statsPanel.w, L.statsPanel.h, { fill: C.ink, alpha: 0.9 });
    const outputs = Object.entries(w.draft.slots).filter(([id, s]) => s?.kind === 'sigil' && !w.draft.runes[id]?.includes('relay')).length;
    const auxes = Object.values(w.draft.slots).filter(s => s?.kind === 'auxiliary').length;
    const empties = w.draft.unlocked.filter(id => !w.draft.slots[id]).length;
    this.text(16, L.statsY[0], '输出 ' + outputs + ' / 辅助 ' + auxes + ' / 空位 ' + empties, 8, HEX.teal);
    this.text(232, L.statsY[0], '上幕 触发 ' + (this.report.triggers ?? 0) + ' · 击杀 ' + (this.report.kills ?? 0), 7, HEX.mute).setOrigin(1, 0);
    const focusSlot = w.draft.slots[this.focusCell];
    const focusName = focusSlot ? (names[focusSlot.defId]?.name ?? focusSlot.defId) : '空符位';
    this.text(16, L.statsY[1], (this.focusCell + 1) + ' 号 · ' + focusName + '　间隔 ' + (cell.effIntervalMs / 1000).toFixed(2) + 's / 冷却 ' + (cell.effCooldownMs / 1000).toFixed(2) + 's', 8, HEX.parchment);
    const runeText = (w.draft.runes[this.focusCell] ?? []).filter(Boolean).map(r => names[r]?.name ?? r).join(' / ') || '无';
    const exitText = this.currentExits(this.focusCell).map(d => ({ up: '上', down: '下', left: '左', right: '右' })[d]).join('') || '无';
    const focusTarget = w.draft.auxTargets[this.focusCell];
    this.text(16, L.statsY[2], '铭文 ' + runeText + ' · 出口 ' + exitText + (focusTarget !== undefined ? ' · 目标 ' + (focusTarget + 1) + '号' : ''), 7, HEX.mute);

    // 誓约
    this.text(16, L.oathLabelY, '誓约', 8, HEX.brass);
    OATH_LIST.forEach(([id, label], i) => {
      const r = L.oathBtn(i);
      this.button(r.x, r.y, r.w, r.h, label, () => this.setOath(w.draft.oath === id ? null : id),
        w.draft.oath === id ? HEX.teal : HEX.mute, { fill: w.draft.oath === id ? C.stone : C.nightDeep });
    });
    if (L.oathCurrentY > 0) this.text(16, L.oathCurrentY, w.draft.oath ? ('当前：' + OATH_DEFS[w.draft.oath].name) : '未立誓（全局生效，最多一个）', 7, HEX.mute);

    // 手牌与操作
    const handTypes = Object.values(w.hand).filter(Boolean).length;
    const handTotal = Object.values(w.hand).reduce((a, b) => a + b, 0);
    this.panel(g, L.handPanel.x, L.handPanel.y, L.handPanel.w, L.handPanel.h, { fill: C.ink, alpha: 0.9 });
    const selDefId = this.selectedCard ? this.selectedCard.split(':')[1] : null;
    const selName = selDefId ? (names[selDefId]?.name ?? selDefId) : null;
    this.text(L.handPanel.x + 4, L.handPanel.y + 4,
      selName ? clipText('已选 ' + selName + ' · 点左侧空符位放置', 17) : ('手牌 ' + handTypes + ' 种 / ' + handTotal + ' 张'),
      8, selName ? HEX.teal : HEX.brass);
    // 出口编辑入口：横屏压在面板右上角（原位），竖屏放标题行右侧
    if (isPortrait()) {
      this.button(386, L.handPanel.y + 2, 78, 16, '出口编辑', () => { this.exitMode = true; this.auxPending = null; this.paint(); }, HEX.brassLight, { fill: C.nightDeep });
    } else {
      this.button(390, 74, 70, 12, '出口编辑', () => { this.exitMode = true; this.auxPending = null; this.paint(); }, HEX.brassLight, { fill: C.nightDeep });
    }
    let row = 0;
    const maxRows = isPortrait() ? 6 : 5;
    for (const [key, count] of Object.entries(w.hand)) {
      if (!count || row >= maxRows) continue;
      const defId = key.split(':')[1];
      const r = L.handRow(row);
      this.handRow(r.x, r.y, r.w, r.h, {
        defId,
        kind: key.split(':')[0],
        count,
        hint: hints[defId] ?? '',
        selected: this.selectedCard === key,
        action: () => {
          this.selectedCard = this.selectedCard === key ? null : key;
          this.auxPending = null;
          this.note = this.selectedCard ? (hints[defId] + '；点击左侧空符位安装') : '已取消选择';
          this.paint();
        },
      });
      row++;
    }
    if (!row) this.text(20, L.handPanel.y + 24, '暂时没有手牌，请先领取上方奖励。', 8, HEX.mute);
    // 底部只留一行状态：待绑定 > 当前指向 > 最近一次操作提示
    const status = this.auxPending !== null
      ? { text: '等待目标 · 点 ' + (this.auxPending + 1) + ' 号相邻输出符印', color: HEX.blood, size: 7 }
      : (w.draft.auxTargets && Object.keys(w.draft.auxTargets).length && !this.note)
        ? { text: '指向：' + Object.entries(w.draft.auxTargets).map(([a, b]) => (a + 1) + '→' + (b + 1)).join(' '), color: HEX.mute, size: 7 }
        : { text: this.note, color: HEX.arcaneLight, size: 7 };

    // 铭文购买与槽位
    const runeIds = ['forge', 'relay', 'sever', 'silence'];
    runeIds.forEach((rid, i) => {
      const r = L.runeBtn(i);
      const cost = (w.runeCosts && w.runeCosts[rid]) ? w.runeCosts[rid] : 8;
      this.iconButton(r.x, r.y, r.w, r.h, rid, RUNE_DEFS[rid].name + ' ' + cost + '碎', () => this.addRune(rid), HEX.parchment);
    });
    for (let i = 0; i < 2; i++) {
      const rune = w.draft.runes[this.focusCell] ? w.draft.runes[this.focusCell][i] : null;
      const r = L.runeSlot(i);
      this.button(r.x, r.y, r.w, r.h, rune ? ('拆 ' + names[rune].name) : ('铭文槽 ' + (i + 1) + ' 空'),
        () => this.act(removeRune(w, this.focusCell, i)), rune ? HEX.brassLight : HEX.mute,
        { fill: rune ? C.stoneDark : C.nightDeep });
    }
    this.text(16, L.noteY, isPortrait() ? status.text : this.clipText(status.text), status.size, status.color,
      { wordWrap: { width: isPortrait() ? 440 : 216 } });
    const ready = canDepart(w);
    const dp = L.depart;
    this.button(dp.x, dp.y, dp.w, dp.h, '确认构筑 · 出发', () => this.depart(), ready.ok ? HEX.teal : HEX.mute,
      { fill: ready.ok ? C.stoneDark : C.nightDeep, frame: ready.ok ? C.teal : C.brassDark, size: isPortrait() ? 11 : 9 });
  }

  // 幕间法阵盘的动态层：约 30fps，出发后停止并清空
  update(time, delta) {
    if (!this.animG) return;
    if (this.departed) { this.animG.clear(); return; }
    if (!this.workshop) return;
    this.animAcc = (this.animAcc ?? 0) + delta;
    if (this.animAcc < 33) return;
    this.animAcc = 0;
    this.animFrames = (this.animFrames ?? 0) + 1;
    const L = this.layout();
    const c0 = L.cell(0), c1 = L.cell(1), c4 = L.cell(4);
    kitBoardMotion(this.animG, {
      panel: L.gridPanel,
      cells: { x0: c0.x, y0: c0.y, cw: c0.w, ch: c0.h, gapX: c1.x - c0.x - c0.w, gapY: c4.y - c0.y - c0.h },
      t: time,
      focusId: this.focusCell,
      selecting: !!this.selectedCard,
      unlocked: this.workshop.draft.unlocked,
      slots: Object.entries(this.workshop.draft.slots ?? {}).map(([id, slot]) => ({ id: +id, slot })),
    });
  }

  act(result) { this.note = result.message; this.paint(); }

  // 横屏状态栏只有一行空间：超长就截断，宁可少说也别糊在誓约按钮上
  clipText(value, max = 27) {
    const text = String(value ?? '');
    return text.length <= max ? text : text.slice(0, max - 1) + '…';
  }

  // 找出目标失效的指向型辅助并进入绑定模式；没有就返回 false。
  syncAuxPending() {
    const missing = missingAuxTargets(this.workshop.draft);
    if (!missing.length) return false;
    const id = missing[0];
    const card = this.workshop.draft.slots?.[id];
    this.selectedCard = null;
    // names 里存的是 { name } 对象，这里必须取 .name，否则提示里会出现 [object Object]
    const cardName = names[card?.defId]?.name ?? card?.defId ?? '辅助';
    if (!auxTargetCandidates(this.workshop.draft, id).length) {
      // 没有可指向的邻居：进绑定模式会把玩家挂死，只提示
      this.auxPending = null;
      this.note = (id + 1) + ' 号「' + cardName + '」没有可指向的相邻符印，请收回或换个位置';
      return true;
    }
    this.auxPending = id;
    this.note = (id + 1) + ' 号「' + cardName + '」的目标失效了：点一个相邻输出符印重新绑定';
    return true;
  }

  choose(index) {
    const offer = this.workshop.offer;
    if (!offer) return;
    this.act(chooseReward(this.workshop, offer.id, index));
  }

  clickCell(id) {
    if (!this.workshop.draft.unlocked.includes(id)) { this.note = '该格尚未解封'; this.paint(); return; }
    this.focusCell = id;
    // 选牌优先于绑定：等待目标期间玩家也要能先改牌面（例如把被换掉的符印补回去），
    // 否则「目标失效 → 等绑定 → 却放不了牌」会把局面卡死。
    if (this.selectedCard) {
      const defId = this.selectedCard.split(':')[1];
      const result = placeCard(this.workshop, id, this.selectedCard);
      this.note = result.message;
      if (result.ok) {
        this.selectedCard = null;
        if (AUX_TARGETED.has(defId)) {
          if (auxTargetCandidates(this.workshop.draft, id).length) {
            this.auxPending = id;
            this.note = '请点击相邻输出符印，指定这张辅助的作用目标';
          } else {
            this.auxPending = null;
            this.note = (id + 1) + ' 号「' + (names[defId]?.name ?? defId) + '」相邻没有符印可指向，请收回或换个位置';
          }
        } else {
          // 换卡会连带清掉「原本指向这一格」的辅助目标：立刻把玩家带到那一格去重绑
          this.syncAuxPending();
        }
      }
      this.paint();
      return;
    }
    // 有指向型辅助等待目标时，点击相邻输出符印完成绑定。
    if (this.auxPending !== null) {
      // 再点一次自己 = 取消绑定，避免「相邻没有符印」时被挂在绑定模式里出不来
      if (id === this.auxPending) {
        this.auxPending = null;
        this.note = '已取消绑定。这张辅助没目标就不能出发，建议收回或换个位置。';
        this.paint(); return;
      }
      const isNeighbor = neighborsOf(this.auxPending, ORTHO_DIRS).some(n => n.id === id);
      const isOutput = this.workshop.draft.slots[id]?.kind === 'sigil';
      if (isNeighbor && isOutput) {
        this.workshop.draft.auxTargets[this.auxPending] = id;
        this.note = '已绑定作用目标：' + (id + 1) + ' 号符位';
        this.auxPending = null; this.paint(); return;
      }
      this.note = '请选择相邻且装有符印的格子作为目标';
      this.paint(); return;
    }
    this.paint();
  }

  depart() {
    if (this.departed) return;
    const ready = canDepart(this.workshop);
    if (!ready.ok) {
      // 缺作用目标是最常见的卡点：直接把界面切到那一格的绑定模式，而不是只弹一句错误
      if (this.syncAuxPending()) { this.note = '还没法出发 — ' + this.note; this.paint(); return; }
      this.act(ready); return;
    }
    const grid = createGrid();
    const result = applyDraft(grid, this.workshop.draft, { phase: 'intermission' });
    if (!result.ok) { this.act({ message: '构筑未通过校验，请检查目标与插槽' }); return; }
    this.departed = true;
    this.animG?.clear();
    this.run.draft = result.snapshot;
    this.run.shards = this.workshop.shards;
    this.run.hand = { ...this.workshop.hand };
    this.run.runeCosts = structuredClone(this.workshop.runeCosts);
    // 幕间 → 下一幕：journey 单镜头演出（5.8s），再落到新地图
    playCutscene(this, {
      kind: 'journey', act: this.run.act, to: 'BattleScene',
      payload: { run: this.run, __cine: true },
    });
  }

  addRune(id) {
    if (this.workshop.draft.auxTargets && this.auxPending !== null) { this.auxPending = null; }
    const runes = this.workshop.draft.runes[this.focusCell] ?? [null, null];
    const index = [0, 1].find(i => !runes[i]);
    this.act(index === undefined ? { ok: false, message: '该格两个铭文槽已满' } : installRune(this.workshop, this.focusCell, id, index));
  }

  currentExits(id) {
    const list = this.workshop.draft.exits?.[id];
    return Array.isArray(list) ? [...list] : ['up', 'down', 'left', 'right'];
  }

  toggleExit(dir) {
    const id = this.focusCell;
    const cur = this.currentExits(id);
    const has = cur.includes(dir);
    const order = ['up', 'down', 'left', 'right'];
    const next = (has ? cur.filter(d => d !== dir) : [...cur, dir]).sort((a, b) => order.indexOf(a) - order.indexOf(b));
    if (!next.length && !(this.workshop.draft.runes[id] ?? []).includes('sever')) {
      this.note = '至少保留一个出口，或先给本格安装断流铭文';
      this.paint(); return;
    }
    this.workshop.draft.exits[id] = next;
    const names = { up: '上', down: '下', left: '左', right: '右' };
    this.note = '出口已更新：' + (next.map(d => names[d]).join('') || '无（断流）');
    this.paint();
  }

  setOath(id) {
    this.workshop.draft.oath = id;
    this.note = id ? ('已立誓：' + OATH_DEFS[id].name) : '已解除誓约';
    this.paint();
  }
}
