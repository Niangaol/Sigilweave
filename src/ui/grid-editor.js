// 暂停改阵法阵编辑器：开放/关闭、草稿与手牌、指针悬停、动态盘面、点击放置。
// 从 BattleScene 迁出（2026-11-19 架构重构波 2）。字段仍挂在场景上（editOpen/editDraft/…），
// 本类只是方法集合，场景方法保留同名一行委托，测试与外部引用零改动。
import { C, HEX, addText, pxRect, pxFrame, pxLine, pxDiamond, getRenderScale } from './Palette.js';
import {
  kitPanel, kitBoard, kitBoardMotion, kitHeader, kitSteps, kitCell, kitHandRow, kitDetail, kitAction, clipText,
} from './editor-ui.js';
import { CARD_HINTS } from '../data/card-hints.js';
import { SIGIL_DEFS, AUX_DEFS, RUNE_DEFS } from '../logic/effects.js';
import { CARD_POOL, cardKeyOf, cardOf } from '../logic/workshop.js';
import { slotComboEligible, variantOf } from '../data/variants.js';
import { ACTS, ORTHO_DIRS } from '../logic/constants.js';
import { applyDraft, validateDraft, explainBuildErrors, AUX_TARGETED, missingAuxTargets, auxTargetCandidates, draftFromGrid } from '../logic/build.js';
import { buildComboCatalog } from '../logic/combo.js';
import { neighborsOf, rebuildDerived } from '../logic/grid.js';
import { resonanceMultiplier, reactionAt } from '../logic/resonance.js';
import { FACTIONS, factionOf } from '../data/factions.js';
import { cardVisual } from '../data/roster.js';
import { evolutionOf } from '../data/evolutions.js';

// 卡片显示名：符印带变体后缀（寒霜箭·谐），进化再挂一层路线名（寒霜箭·谐·冰河箭）。
export function cardDisplayName(card) {
  if (!card) return '';
  if (card.kind === 'auxiliary') return AUX_DEFS[card.defId]?.name ?? card.defId;
  const base = variantOf(card.defId, card.variant).name;
  const route = card.evo ? evolutionOf(card.defId, card.evo) : null;
  return route ? base + '·' + route.name : base;
}

export default class GridEditor {
  constructor(scene) {
    this.scene = scene;
  }

  open() {
    if (this.scene.editOpen) return;
    this.scene.editOpen = true;
    this.scene.editSelected = null;
    this.scene.editAuxPending = null;
    this.scene.editFocus = null;
    this.scene.editNote = '1 点右侧手牌 → 2 点左侧空符位 → 3 点完成；点已放置的卡可收回。';
    this.scene.pauseMenu.hide();
    this.scene.editHandPage = 0;
    this.scene.editDraft = draftFromGrid(this.scene.grid, { act: this.scene.chapter });
    this.scene.editHand = { ...this.scene.run.hand };
    this.scene.editUI = this.scene.add.container(0, 0).setDepth(3500).setScrollFactor(0);
    this.scene.uiRoot?.add(this.scene.editUI);
    this.scene.editPointer = (pointer) => {
      // 指针给的是游戏像素（= 逻辑坐标 × 倍率），命中区是逻辑坐标，必须先折算
      const scale = getRenderScale();
      const lx = pointer.x / scale, ly = pointer.y / scale;
      const hit = this.scene.editRects?.find(r => lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h);
      if (hit) hit.action();
    };
    this.scene.input.on('pointerdown', this.scene.editPointer);
    // 悬停高亮独立成层（与幕间同一套交互语言）：移上去亮框 + 手型光标
    // 屏幕固定元素必须挂 uiRoot（场景根上的 scrollFactor-0 会被镜头位移甩出屏幕）
    this.scene.editHoverG = this.scene.add.graphics().setDepth(5001).setScrollFactor(0);
    this.scene.uiRoot?.add(this.scene.editHoverG);
    // 法阵盘动态层：在静态 UI 之上、悬停层之下，约 30fps 重绘
    this.scene.editAnimG = this.scene.add.graphics().setDepth(5000).setScrollFactor(0);
    this.scene.uiRoot?.add(this.scene.editAnimG);
    this.scene.editAnimAcc = 0;
    this.scene.editAnimFrames = 0;
    this.scene.editHoverMove = (pointer) => {
      if (!this.scene.editOpen) return;
      const scale = getRenderScale();
      const lx = pointer.x / scale, ly = pointer.y / scale;
      const hit = this.scene.editRects?.find(r => lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h);
      const hg = this.scene.editHoverG;
      hg.clear();
      if (hit) {
        pxRect(hg, hit.x, hit.y, hit.w, hit.h, C.stone, 0.35);
        pxFrame(hg, hit.x, hit.y, hit.w, hit.h, C.brassLight, 1, 0.85);
        this.scene.game.canvas.style.cursor = 'pointer';
      } else if (this.scene.game.canvas.style.cursor !== '') {
        this.scene.game.canvas.style.cursor = '';
      }
    };
    this.scene.input.on('pointermove', this.scene.editHoverMove);
    this.scene.drawGridEdit();
  }

  names() { return { ...SIGIL_DEFS, ...AUX_DEFS, ...RUNE_DEFS }; }

  // 暂停改阵期间约 30fps 重绘动态层；编辑关闭时根本不进这里
  tick(time, delta) {
    if (!this.scene.editAnimG || !this.scene.editDraft) return;
    this.scene.editAnimAcc = (this.scene.editAnimAcc ?? 0) + delta;
    if (this.scene.editAnimAcc < 33) return;
    this.scene.editAnimAcc = 0;
    this.scene.editAnimFrames = (this.scene.editAnimFrames ?? 0) + 1;
    const draft = this.scene.editDraft;
    kitBoardMotion(this.scene.editAnimG, {
      panel: { x: 10, y: 42, w: 224, h: 210 },
      cells: { x0: 14, y0: 56, cw: 51, ch: 26, gapX: 3, gapY: 3 },
      t: time,
      focusId: this.scene.editFocus,
      selecting: !!this.scene.editSelected,
      unlocked: draft.unlocked ?? [],
      slots: Object.entries(draft.slots ?? {}).map(([id, slot]) => ({ id: +id, slot })),
    });
  }

  hint(defId) { return CARD_HINTS[defId] ?? ''; }

  draw() {
    if (this.scene.editUI) { this.scene.editUI.destroy(true); this.scene.editUI = null; }
    this.scene.editHoverG?.clear();
    const ui = this.scene.add.container(0, 0).setDepth(3500).setScrollFactor(0);
    this.scene.uiRoot?.add(ui);
    // 容器内按插入序渲染：editUI 每次重建都会压住悬停层，必须重新带到最顶
    this.scene.uiRoot?.bringToTop(this.scene.editAnimG);
    this.scene.uiRoot?.bringToTop(this.scene.editHoverG);
    this.scene.editUI = ui;
    this.scene.editRects = [];
    this.scene.editAnimG?.clear();
    const g = this.scene.add.graphics();
    ui.add(g);
    const text = (x, y, s, size = 8, color = HEX.parchment, extra = {}) => {
      const t = addText(this, x, y, s, size, color, extra);
      ui.add(t);
      return t;
    };
    const names = this.scene.editNames();
    const draft = this.scene.editDraft;
    // 编辑中的共鸣要按「尚未提交的草稿」算，不能读已应用的盘面
    const draftGrid = {
      ...this.scene.grid,
      cells: this.scene.grid.cells.map((c, i) => ({ ...c, slot: draft.slots?.[i] ?? null })),
    };

    // 背景：与幕间同一套双层外框 + 硬边竖纹
    pxRect(g, 0, 0, 480, 270, C.void);
    for (let x = 0; x < 480; x += 24) pxRect(g, x, 0, 12, 270, C.ink, 0.22);
    pxFrame(g, 6, 6, 468, 258, C.brassDark, 2, 1);
    pxFrame(g, 9, 9, 462, 252, C.brass, 1, 0.18);

    kitHeader(g, text, {
      x: 10, y: 10, w: 460,
      title: '法阵编辑',
      subtitle: '暂停中 · 冷却保留',
      rightLabel: '碎片', rightValue: this.scene.shardCount, rightColor: HEX.teal,
    });

    const unlocked = draft.unlocked ?? [];
    const emptyCount = unlocked.filter(id => !draft.slots?.[id]).length;
    kitSteps(g, text, 10, 27, 460, {
      active: this.scene.editAuxPending !== null ? 2 : this.scene.editSelected ? 1 : 0,
      right: unlocked.length + ' 格 · ' + emptyCount + ' 空位',
      rightColor: HEX.brass,
    });

    // 左：4×4 法阵
    kitPanel(g, 10, 42, 224, 210);
    kitBoard(g, {
      panel: { x: 10, y: 42, w: 224, h: 210 },
      cells: { x0: 14, y0: 56, cw: 51, ch: 26, gapX: 3, gapY: 3 },
    });
    // 小标题两侧的刻线与菱形，让「符位 · 4×4」像一块铭牌
    pxDiamond(g, 13, 49, 2, C.brass, 0.8, true);
    pxLine(g, 78, 49, 222, 49, C.brassDark, 0.5, 1);
    pxDiamond(g, 225, 49, 2, C.brass, 0.7, false);
    text(18, 45, '符位 · 4×4', 7, HEX.brass);
    const auxNeighbors = this.scene.editAuxPending !== null
      ? new Set(neighborsOf(this.scene.editAuxPending, ORTHO_DIRS).map(n => n.id))
      : null;
    for (let id = 0; id < 16; id++) {
      const rect = { x: 14 + (id % 4) * 54, y: 56 + Math.floor(id / 4) * 29, w: 51, h: 26 };
      const slot = draft.slots?.[id];
      kitCell(g, text, id, rect, {
        unlocked: unlocked.includes(id),
        slot,
        focus: this.scene.editFocus,
        auxSrc: this.scene.editAuxPending === id ? id : null,
        auxValid: !!auxNeighbors?.has(id) && slot?.kind === 'sigil',
        resonant: slot?.kind === 'sigil' && resonanceMultiplier(draftGrid, id) > 1,
        selecting: !!this.scene.editSelected,
        target: draft.auxTargets?.[id],
        runes: (draft.runes?.[id] ?? []).filter(Boolean).length,
        exits: (draft.exits?.[id] ?? ['up', 'down', 'left', 'right']).length,
        exitList: draft.exits?.[id] ?? ['up', 'down', 'left', 'right'],
      });
      this.scene.editRects.push({ ...rect, action: () => this.scene.editCellClick(id) });
    }

    // 左下：待放置卡 / 当前符位详情 / 操作指引三选一
    const selCard = cardOf(this.scene.editSelected);
    const selDef = selCard?.defId ?? null;
    const selLabel = selCard ? cardDisplayName(selCard) : '';
    if (selCard) {
      const visual = cardVisual(selCard);
      kitDetail(g, text, { x: 10, y: 174, w: 224, h: 74 }, {
        title: '待放置 · 点左侧空符位', accent: C.brassLight, icon: visual.glyph,
        lines: [
          { text: selLabel + ' ×' + (this.scene.editHand[this.scene.editSelected] ?? 0), color: HEX.arcaneLight, size: 8 },
          { text: this.scene.editHint(selDef), color: HEX.mute, size: 7, max: 28 },
          { text: '放置后点「完成」才会生效', color: HEX.teal, size: 7 },
        ],
      });
    } else if (this.scene.editFocus !== null) {
      const id = this.scene.editFocus;
      const slot = draft.slots?.[id];
      const cell = this.scene.grid.cells[id];
      const visual = slot ? cardVisual(slot) : null;
      const runeText = (draft.runes?.[id] ?? []).filter(Boolean).map(r => names[r]?.name ?? r).join(' / ') || '无';
      const exitText = (draft.exits?.[id] ?? ['up', 'down', 'left', 'right'])
        .map(d => ({ up: '上', down: '下', left: '左', right: '右' })[d]).join('') || '无';
      const tgt = draft.auxTargets?.[id];
      const faction = slot?.kind === 'sigil' ? factionOf(slot.defId) : null;
      const resonance = faction ? resonanceMultiplier(draftGrid, id) : 1;
      const reaction = faction ? reactionAt(draftGrid, id) : null;
      kitDetail(g, text, { x: 10, y: 174, w: 224, h: 74 }, {
        title: '符位详情 · ' + (id + 1) + ' 号',
        accent: slot?.kind === 'auxiliary' ? C.teal : C.arcane,
        icon: visual?.glyph ?? null,
        lines: [
          { text: slot ? cardDisplayName(slot) : (unlocked.includes(id) ? '空符位' : '未解封'), color: HEX.parchment, size: 8 },
          { text: '间隔 ' + (cell.effIntervalMs / 1000).toFixed(2) + 's / 冷却 ' + (cell.effCooldownMs / 1000).toFixed(2) + 's', color: HEX.mute, size: 7 },
          ...(faction ? [{ text: '派系 ' + FACTIONS[faction].name + ' · 共鸣 +' + Math.round((resonance - 1) * 100) + '%' + (reaction ? ' · 反应' + reaction.name : ''), color: resonance > 1 || reaction ? HEX.teal : HEX.mute, size: 7, max: 30 }] : []),
          { text: '铭文 ' + runeText + ' · 出口 ' + exitText + (tgt !== undefined ? ' · 目标 ' + (tgt + 1) + '号' : ''), color: HEX.mute, size: 7, max: 28 },
        ],
      });
    } else {
      kitDetail(g, text, { x: 10, y: 174, w: 224, h: 74 }, {
        title: '操作指引',
        lines: [
          { text: '① 点右侧手牌选一张', color: HEX.arcaneLight, size: 8 },
          { text: '② 点左侧空符位放下', color: HEX.arcaneLight, size: 8 },
          { text: '③ 点已放置的卡可收回', color: HEX.arcaneLight, size: 8 },
        ],
      });
    }

    // 右：手牌
    const hand = Object.entries(this.scene.editHand).filter(([, count]) => count > 0);
    const lastPage = Math.max(0, Math.ceil(hand.length / 5) - 1);
    this.scene.editHandPage = Math.min(this.scene.editHandPage, lastPage);
    kitPanel(g, 240, 42, 230, 120);
    text(245, 45, this.scene.editSelected ? '已选 · 点空符位放置' : '手牌 · 点选一张', 7, this.scene.editSelected ? HEX.teal : HEX.brass);
    text(465, 45, hand.reduce((a, [, c]) => a + c, 0) + ' 张', 7, HEX.mute).setOrigin(1, 0);
    let row = 0;
    for (const [key, count] of hand.slice(this.scene.editHandPage * 5, this.scene.editHandPage * 5 + 5)) {
      const handCard = cardOf(key);
      const defId = handCard?.defId;
      const rect = { x: 244, y: 57 + row * 17, w: 216, h: 15 };
      const isSel = this.scene.editSelected === key;
      kitHandRow(g, text, rect, {
        defId, kind: handCard?.kind, count, label: cardDisplayName(handCard),
        hint: this.scene.editHint(defId),
        selected: isSel,
      });
      this.scene.editRects.push({ ...rect, action: () => {
        this.scene.editSelected = isSel ? null : key;
        this.scene.editAuxPending = null;
        this.scene.editNote = this.scene.editSelected
          ? '已选 ' + cardDisplayName(handCard) + '：点左侧空符位放置'
          : '已取消选择';
        this.scene.drawGridEdit();
      } });
      row++;
    }
    if (!row) text(248, 62, '暂时没有手牌，先打完一波再说。', 7, HEX.mute);
    if (lastPage > 0) {
      const p = { x: 244, y: 144, w: 216, h: 14 };
      pxRect(g, p.x, p.y, p.w, p.h, C.nightDeep, 0.9);
      pxFrame(g, p.x, p.y, p.w, p.h, C.stoneLight, 1, 0.7);
      text(352, p.y + 3, '◀ ' + (this.scene.editHandPage + 1) + ' / ' + (lastPage + 1) + ' ▶', 7, HEX.teal).setOrigin(0.5, 0);
      this.scene.editRects.push({ x: p.x, y: p.y, w: p.w / 2, h: p.h, action: () => {
        this.scene.editHandPage = (this.scene.editHandPage - 1 + lastPage + 1) % (lastPage + 1); this.scene.drawGridEdit();
      } });
      this.scene.editRects.push({ x: p.x + p.w / 2, y: p.y, w: p.w / 2, h: p.h, action: () => {
        this.scene.editHandPage = (this.scene.editHandPage + 1) % (lastPage + 1); this.scene.drawGridEdit();
      } });
    }

    // 右下：卡片详情 / 操作提示
    kitDetail(g, text, { x: 240, y: 166, w: 230, h: 52 }, {
      title: this.scene.editSelected ? '待放置卡' : '操作提示',
      accent: this.scene.editSelected ? C.brassLight : C.stoneLight,
      lines: this.scene.editSelected
        ? [
            { text: (names[selDef]?.name ?? selDef) + ' ×' + (this.scene.editHand[this.scene.editSelected] ?? 0), color: HEX.arcaneLight, size: 8 },
            { text: this.scene.editHint(selDef), color: HEX.mute, size: 7, max: 30 },
            { text: '点空符位放下；点已放的卡替换', color: HEX.teal, size: 7 },
          ]
        : [
            { text: '先点手牌，再点符位。', color: HEX.arcaneLight, size: 8 },
            { text: '辅助卡放下后还要点相邻输出格。', color: HEX.mute, size: 7, max: 30 },
            { text: '改阵不会重置冷却。', color: HEX.mute, size: 7 },
          ],
    });

    // 校验状态 + 完成按钮 + 底部提示
    const errors = validateDraft(this.scene.editDraft);
    const errText = errors.length ? explainBuildErrors(errors, this.scene.editDraft) : '校验通过 · 可完成';
    text(244, 222, clipText(errText, 32), 7, errors.length ? HEX.blood : HEX.teal);
    const doneRect = { x: 240, y: 234, w: 230, h: 18 };
    kitAction(g, text, doneRect, '完成 · 返回暂停', { primary: errors.length === 0 });
    this.scene.editRects.push({ ...doneRect, done: true, action: () => this.scene.closeGridEdit() });
    text(10, 256, clipText(this.scene.editNote || 'E / Esc 关闭 · 改阵在点完成后生效', 44), 7, HEX.arcaneLight);
  }

  cellClick(id) {
    this.scene.editFocus = id;
    const draft = this.scene.editDraft;
    const names = this.scene.editNames();
    const selKey = this.scene.editSelected;
    if (!draft.unlocked?.includes(id)) {
      this.scene.editNote = (id + 1) + ' 号尚未解封，不能放置';
      this.scene.drawGridEdit();
      return;
    }
    // 选牌优先于绑定：等待目标期间如果玩家选了一张牌，他要能先改牌面（比如把符印补回去），
    // 否则「目标失效 → 进入绑定模式 → 却放不了牌」会把局面卡死。
    if (selKey) {
      const card = cardOf(selKey);
      if (!card) { this.scene.editNote = '这张卡的数据不合法，已取消选择'; this.scene.editSelected = null; this.scene.drawGridEdit(); return; }
      const kind = card.kind, defId = card.defId;
      const old = draft.slots?.[id];
      // 收回原卡到手的副本
      if (old) { const k = cardKeyOf(old); this.scene.editHand[k] = (this.scene.editHand[k] ?? 0) + 1; }
      this.scene.editHand[selKey]--;
      if (this.scene.editHand[selKey] <= 0) delete this.scene.editHand[selKey];
      draft.slots ??= {};
      // 这张法术若已进化，新放置的格子直接带上进化路线
      const evolved = card.kind === 'sigil' ? this.scene.run.evolutions?.[card.defId] : null;
      draft.slots[id] = evolved ? { ...card, evo: evolved } : card;
      // 指向该格的辅助目标随之失效
      for (const [src, tgt] of Object.entries(draft.auxTargets ?? {})) if (src === String(id) || (tgt === id && kind !== 'sigil')) delete draft.auxTargets[src];
      this.scene.editSelected = null;
      this.scene.editNote = '已放置 ' + cardDisplayName(card);
      if (kind === 'auxiliary' && AUX_TARGETED.has(defId) && auxTargetCandidates(this.scene.editDraft, id).length) {
        this.scene.editAuxPending = id;
        this.scene.editNote = '点相邻输出格绑定目标';
      } else if (kind === 'auxiliary' && AUX_TARGETED.has(defId)) {
        this.scene.editNote = (id + 1) + ' 号「' + (names[defId]?.name ?? defId) + '」相邻没有符印可指向，请收回或换个位置';
        this.scene.syncAuxPending();
      } else {
        this.scene.syncAuxPending();
      }
      this.scene.drawGridEdit(); return;
    }
    // 绑定模式：辅助等待目标。这里必须当场校验，
    // 否则随便点一格也会被记成目标，等到点「完成」才报 aux_target_invalid。
    if (this.scene.editAuxPending !== null) {
      const src = this.scene.editAuxPending;
      // 再点一次自己 = 取消绑定，避免「相邻根本没有符印」时被挂在绑定模式里出不来
      if (id === src) {
        this.scene.editAuxPending = null;
        this.scene.editNote = '已取消绑定。这张辅助没目标就不能完成，建议收回或换个位置。';
        this.scene.drawGridEdit(); return;
      }
      const adjacent = neighborsOf(src, ORTHO_DIRS).some(n => n.id === id);
      const slot = draft.slots?.[id];
      if (!adjacent || slot?.kind !== 'sigil') {
        this.scene.editNote = (src + 1) + ' 号的作用目标必须是「相邻且装着符印」的格子';
        this.scene.drawGridEdit(); return;
      }
      draft.auxTargets ??= {};
      draft.auxTargets[src] = id;
      this.scene.editAuxPending = null;
      this.scene.editNote = '目标已绑定：' + (id + 1) + ' 号符印';
      this.scene.drawGridEdit(); return;
    }
    // 无选择：收回该格卡牌
    const old = draft.slots?.[id];
    if (!old) { this.scene.editNote = (id + 1) + ' 号是空格'; this.scene.drawGridEdit(); return; }
    const k = cardKeyOf(old);
    this.scene.editHand[k] = (this.scene.editHand[k] ?? 0) + 1;
    delete draft.slots[id];
    for (const [src, tgt] of Object.entries(draft.auxTargets ?? {})) if (tgt === id || src === String(id)) delete draft.auxTargets[src];
    this.scene.editNote = '已收回 ' + cardDisplayName(old);
    this.scene.syncAuxPending();
    this.scene.drawGridEdit();
  }

  // 改卡/收卡会连带把别的指向型辅助的目标弄失效（例如把它作用的那格符印换掉）。
  // 这种情况不能等玩家点「完成」才报错——直接切进那一格的绑定模式，把人带过去。
  syncAuxPending() {
    const missing = missingAuxTargets(this.scene.editDraft);
    const names = this.scene.editNames();
    if (!missing.length) { this.scene.editAuxPending = null; return false; }
    // 优先保留玩家原本在绑的那一格
    const id = missing.includes(this.scene.editAuxPending) ? this.scene.editAuxPending : missing[0];
    const slot = this.scene.editDraft.slots?.[id];
    this.scene.editSelected = null;
    const cardName = names[slot?.defId]?.name ?? slot?.defId ?? '辅助';
    if (!auxTargetCandidates(this.scene.editDraft, id).length) {
      // 没有可指向的邻居：进绑定模式等于把玩家挂死，只提示并保留目标失效状态
      this.scene.editAuxPending = null;
      this.scene.editNote = (id + 1) + ' 号「' + cardName + '」没有可指向的相邻符印，请收回或换个位置';
      return true;
    }
    this.scene.editAuxPending = id;
    this.scene.editNote = (id + 1) + ' 号「' + cardName + '」的目标失效了：点一个相邻符印重新绑定';
    return true;
  }

  close() {
    const errors = validateDraft(this.scene.editDraft);
    if (errors.length) {
      // 指向型辅助缺目标是最常见的一种：与其甩错误码，不如把玩家送到那一格去绑
      if (!this.scene.syncAuxPending()) this.scene.editNote = '未通过校验：' + explainBuildErrors(errors, this.scene.editDraft);
      this.scene.drawGridEdit();
      return;
    }
    const preserve = { cells: this.scene.grid.cells.map(c => ({ id: c.id, cooldownUntil: c.cooldownUntil })) };
    const result = applyDraft(this.scene.grid, this.scene.editDraft, { phase: 'intermission', preserveFrom: preserve });
    if (!result.ok) { this.scene.editNote = '校验失败'; this.scene.drawGridEdit(); return; }
    this.scene.run.draft = result.snapshot;
    this.scene.run.hand = { ...this.scene.editHand };
    // 罗盘乘算在改阵后重放
    rebuildDerived(this.scene.grid, ACTS[this.scene.chapter - 1].baseIntervalMs * this.scene.run.compassBuffs.intervalMul, { cooldownMul: this.scene.run.compassBuffs.cooldownMul });
    this.scene.engine.setCombos(buildComboCatalog(['duo', 'line3', 'elbow3', 'ring4']).filter(inst => inst.order.every(id => this.scene.grid.cells[id].unlocked && this.scene.grid.cells[id].slot?.kind === 'sigil'
      && slotComboEligible(this.scene.grid.cells[id].slot) && !this.scene.grid.cells[id].mutedOutput)));
    this.scene.editOpen = false;
    if (this.scene.editPointer) { this.scene.input.off('pointerdown', this.scene.editPointer); this.scene.editPointer = null; }
    if (this.scene.editHoverMove) { this.scene.input.off('pointermove', this.scene.editHoverMove); this.scene.editHoverMove = null; }
    this.scene.editHoverG?.destroy(true); this.scene.editHoverG = null;
    this.scene.editAnimG?.destroy(true); this.scene.editAnimG = null;
    this.scene.editAnimAcc = 0;
    this.scene.game.canvas.style.cursor = '';
    this.scene.editUI?.destroy(true); this.scene.editUI = null;
    this.scene.openPause('menu');
  }
}
