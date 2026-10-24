// 幕间工作台独立于战斗：只编辑草稿，出发时一次提交；右下罗盘布局仅用于战斗。
import Phaser from 'phaser';
import { C, HEX, addText, pxRect, pxFrame, pxLine, pxPoly, pxDiamond, drawGlyph, applyPixelZoom } from '../ui/Palette.js';
import { decoratePlan } from '../ui/board-decor.js';
import { cardVisual, RUNE_GLYPHS } from '../data/roster.js';
import { createGrid } from '../logic/grid.js';
import { applyDraft, draftFromGrid, unlockToTarget, AUX_TARGETED } from '../logic/build.js';
import { SIGIL_DEFS, AUX_DEFS, RUNE_DEFS, OATH_DEFS } from '../logic/effects.js';
import { neighborsOf } from '../logic/grid.js';
import { createWorkshop, chooseReward, placeCard, removeCard, installRune, removeRune, canDepart } from '../logic/workshop.js';
import { ACTS, ORTHO_DIRS } from '../logic/constants.js';

const names = { ...SIGIL_DEFS, ...AUX_DEFS, ...RUNE_DEFS };
const hints = {
  arcane_bolt: '单体 12 伤害', frost_arrow: '10 伤害／减速 40%', flame_burst: '邻近最多 3 目标，各 9 伤害',
  holy_ward: '贴身伤害 6／护盾 +14', mana_siphon: '8 伤害／回复 2 生命', judgment_hammer: '18 伤害／破甲 +50%',
  thorn_vine: '区域 5 伤害／定身 1.2 秒', starfall: '半径 70 区域 22 伤害／内圈 -30%',
  chain_lightning: '12 伤害／向附近再跳 2 次（逐跳 -30%）', pierce_lance: '沿直线贯穿 15 伤害',
  echo_sigil: '本格与对侧扇区各打 11 伤害', ember_fan: '邻近 3 目标 10 伤害／减速 25%',
  quake_maw: '半径 80 区域 14 伤害／定身 0.6 秒', soul_lance: '15 伤害／回复 3 生命',
  aegis_ring: '贴身 8 伤害／护盾 +20（上限 60）', meteor_judgment: '半径 95 区域 26 伤害／内圈 -40%',
  resonance_stone: '正交邻格间隔与冷却 -25%', slow_field: '近身 90 范围敌人减速 40%',
  shard_resonance: '大幅扩大碎片吸取范围', sacrifice: '指向邻格：每次触发扣 8 护盾换双倍伤害',
  hourglass: '指向邻格：冷却 -30%', wide_runes: '指向邻格：增加全部八向出口',
  forge: '本格伤害 +50%', relay: '本格不出手，出发间隔 -40%', sever: '本格断流，保留配置出口',
  silence: '触发时压制正交邻格冷却',
};
const OATH_LIST = [['lone_star', '孤星'], ['watcher', '守夜'], ['martyr', '殉道']];

export default class IntermissionScene extends Phaser.Scene {
  constructor() { super('IntermissionScene'); }
  init(data) { this.run = data.run; this.report = data.report ?? {}; }
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
    this.paint();
    window.__SIGILWEAVE_WORKSHOP__ = this;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (window.__SIGILWEAVE_WORKSHOP__ === this) window.__SIGILWEAVE_WORKSHOP__ = null;
    });
  }
  text(x, y, value, size = 8, color = HEX.parchment, extra = {}) {
    const t = addText(this, x, y, value, size, color, extra); this.view.add(t); return t;
  }
  // —— 视觉构件 ——
  // 分区面板：底 + 双层黄铜边框 + 四角铆钉，统一所有区块的仪式感
  panel(g, x, y, w, h, opts = {}) {
    pxRect(g, x, y, w, h, opts.fill ?? C.ink, opts.alpha ?? 0.9);
    pxFrame(g, x, y, w, h, opts.frame ?? C.brassDark);
    pxFrame(g, x + 2, y + 2, w - 4, h - 4, C.brass, 1, 0.2);
    for (const [sx, sy] of [[x, y], [x + w - 3, y], [x, y + h - 3], [x + w - 3, y + h - 3]]) {
      pxRect(g, sx, sy, 3, 3, C.brass, 0.9);
      pxRect(g, sx + 1, sy + 1, 1, 1, C.brassLight, 1);
    }
  }

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

  // 手牌行：图标 + 名称 + 右对齐效果说明，选中时整行符文高亮
  handRow(x, y, w, h, defId, label, hint, selected, action) {
    const g = this.add.graphics(); this.view.add(g);
    pxRect(g, x, y, w, h, selected ? C.nightSoft : C.night, 0.95);
    pxFrame(g, x, y, w, h, selected ? C.arcane : C.stoneLight);
    const glyph = this.glyphOf(defId);
    if (glyph) drawGlyph(g, x + 3, y + 3, glyph, selected ? C.arcaneLight : C.parchment, { alpha: 0.95 });
    this.text(x + 14, y + 4, label, 8, selected ? HEX.arcaneLight : HEX.parchment);
    if (hint) this.text(x + w - 4, y + 4, hint, 7, HEX.mute).setOrigin(1, 0);
    return this.zone(x, y, w, h, action, C.arcaneLight);
  }

  paint() {
    this.view.removeAll(true);
    this.clearHover();
    const w = this.workshop;
    const g = this.add.graphics(); this.view.add(g);

    // 背景：硬边竖纹 + 四角硬边压暗（全程不使用平滑渐变）
    pxRect(g, 0, 0, 480, 270, C.void);
    for (let x = 0; x < 480; x += 24) pxRect(g, x, 0, 12, 270, C.ink, 0.22);
    for (let i = 0; i < 3; i++) {
      const a = 0.1 - i * 0.03;
      pxRect(g, 0, i * 8, 480, 8, C.void, a);
      pxRect(g, 0, 270 - (i + 1) * 8, 480, 8, C.void, a);
      pxRect(g, i * 8, 0, 8, 270, C.void, a);
      pxRect(g, 480 - (i + 1) * 8, 0, 8, 270, C.void, a);
    }
    pxFrame(g, 6, 6, 468, 258, C.brassDark);
    pxFrame(g, 8, 8, 464, 254, C.brass, 1, 0.18);

    // 标题栏：菱形纹章 + 幕数 + 碎片计数
    pxRect(g, 10, 10, 460, 14, C.ink, 0.95);
    pxRect(g, 10, 23, 460, 1, C.brassDark, 0.9);
    pxDiamond(g, 14, 17, 3, C.brass, 0.95, false);
    this.text(21, 11, '幕间构筑', 12, HEX.brassLight);
    this.text(97, 13, '第 ' + w.draft.act + ' 幕准备', 8, HEX.mute);
    pxRect(g, 396, 11, 70, 12, C.nightDeep, 1);
    pxFrame(g, 396, 11, 70, 12, C.brassDark);
    pxDiamond(g, 403, 17, 3, C.teal, 0.95, true);
    this.text(409, 13, '碎片', 8, HEX.mute);
    this.text(462, 13, String(w.shards), 9, HEX.teal).setOrigin(1, 0);

    // 奖励区
    this.panel(g, 10, 26, 460, 34, { fill: C.ink, alpha: 0.88 });
    const offer = w.offer;
    if (offer) {
      offer.cards.forEach((card, i) => {
        const x = 14 + i * 152;
        this.iconButton(x, 28, 144, 22, card.defId,
          names[card.defId].name + '  领取', () => this.choose(i),
          card.kind === 'auxiliary' ? HEX.teal : HEX.arcaneLight, card.kind);
        this.text(x + 3, 50, hints[card.defId] ?? '', 7, HEX.mute);
      });
    } else {
      this.text(20, 36, '三轮奖励已领取 · 选右侧手牌，再点左侧符位放置', 8, HEX.teal);
    }

    // 信息行
    pxRect(g, 14, 62, 222, 1, C.brassDark, 0.45);
    pxDiamond(g, 16, 66, 2, C.brass, 0.8, false);
    this.text(22, 63, '奖励剩余 ' + w.roundsRemaining + ' 轮', 8, HEX.brass);
    pxDiamond(g, 104, 66, 2, C.brass, 0.8, false);
    this.text(110, 63, '已解封 ' + w.draft.unlocked.length + ' / 16 格', 8, HEX.mute);

    // 法阵区
    this.panel(g, 10, 72, 224, 124, { fill: C.nightDeep, alpha: 0.82 });
    const grid = createGrid();
    applyDraft(grid, w.draft, { phase: 'intermission' });
    for (let id = 0; id < 16; id++) {
      const x = 14 + (id % 4) * 54, y = 76 + Math.floor(id / 4) * 29;
      const unlocked = w.draft.unlocked.includes(id), slot = w.draft.slots[id];
      const selected = id === this.focusCell || id === this.auxPending;
      pxRect(g, x, y, 51, 26, unlocked ? C.stone : C.night);
      if (unlocked) {
        pxRect(g, x + 1, y + 1, 49, 1, C.groove, 0.3);
        pxRect(g, x + 1, y + 24, 49, 1, C.nightDeep, 0.45);
      }
      pxFrame(g, x, y, 51, 26, selected ? C.arcane : C.stoneLight, selected ? 2 : 1);
      // 角落 / 边上 / 中心三种区位装饰，与战斗罗盘同一份规则，只是刻度更大
      const plan = decoratePlan(id, [{ x, y }, { x: x + 51, y }, { x: x + 51, y: y + 26 }, { x, y: y + 26 }], { inset: 1, arm: 8, centerInset: 1 });
      if (plan) {
        const dim = unlocked ? 1 : 0.7;
        if (plan.wash) pxPoly(g, plan.wash.quad, C[plan.wash.color], plan.wash.alpha * dim);
        for (const line of plan.lines) pxLine(g, line.a.x, line.a.y, line.b.x, line.b.y, C[line.color], line.alpha * dim, line.width ?? 1);
        for (const dot of plan.dots) {
          const size = dot.size ?? 1;
          pxRect(g, Math.round(dot.x), Math.round(dot.y), size, size, C[dot.color], dot.alpha * dim);
        }
      }
      if (!unlocked) {
        pxDiamond(g, x + 25, y + 12, 3, C.stoneDark, 0.9, false);
        this.text(x + 3, y + 2, '封印', 8, HEX.mute);
      } else if (slot) {
        const visual = cardVisual(slot);
        if (visual.glyph) drawGlyph(g, x + 3, y + 3, visual.glyph, visual.color ?? C.arcaneLight, { alpha: 0.95 });
        this.text(x + 13, y + 2, names[slot.defId]?.name ?? '?', 8, slot.kind === 'auxiliary' ? HEX.teal : HEX.parchment);
      } else {
        this.text(x + 3, y + 2, '空符位', 8, HEX.mute);
      }
      const runeCount = (w.draft.runes[id] ?? []).filter(Boolean).length;
      const target = w.draft.auxTargets[id];
      this.text(x + 3, y + 15, (id + 1) + ' · 铭' + runeCount + ' 出' + this.currentExits(id).length + (target !== undefined ? (' →' + (target + 1)) : ''), 7, HEX.mute);
      this.zone(x, y, 51, 26, () => this.clickCell(id), C.arcaneLight);
    }

    const cell = grid.cells[this.focusCell];
    if (this.exitMode) {
      // 出口编辑面板：临时覆盖左下统计区，不改动法阵本身
      this.panel(g, 10, 196, 224, 70, { fill: C.ink, alpha: 0.97, frame: C.brass });
      this.text(16, 199, '出口编辑 · ' + (this.focusCell + 1) + ' 号（' + (w.draft.slots[this.focusCell] ? names[w.draft.slots[this.focusCell].defId] : '空符位') + '）', 8, HEX.brassLight);
      const cur = this.currentExits(this.focusCell);
      const dirs = [['up', '上'], ['down', '下'], ['left', '左'], ['right', '右']];
      dirs.forEach(([d, label], i) => {
        const x = 16 + (i % 2) * 102, y = 214 + Math.floor(i / 2) * 20;
        this.button(x, y, 102, 18, label + ' ' + (cur.includes(d) ? '开' : '关'), () => this.toggleExit(d),
          cur.includes(d) ? HEX.teal : HEX.mute, { fill: cur.includes(d) ? C.stone : C.nightDeep });
      });
      this.button(16, 254, 204, 12, '完成出口编辑', () => { this.exitMode = false; this.paint(); }, HEX.brassLight);
      this.text(244, 240, w.note ?? this.note, 7, HEX.arcaneLight, { wordWrap: { width: 216 } });
      const ex = this.currentExits(this.focusCell);
      const label = { up: '上', down: '下', left: '左', right: '右' };
      this.text(228, 199, ex.map(d => label[d]).join('') || '无', 8, HEX.teal).setOrigin(1, 0);
      return;
    }

    // 统计区
    this.panel(g, 10, 196, 224, 62, { fill: C.ink, alpha: 0.9 });
    const outputs = Object.entries(w.draft.slots).filter(([id, s]) => s?.kind === 'sigil' && !w.draft.runes[id]?.includes('relay')).length;
    const auxes = Object.values(w.draft.slots).filter(s => s?.kind === 'auxiliary').length;
    const empties = w.draft.unlocked.filter(id => !w.draft.slots[id]).length;
    this.text(16, 200, '输出 ' + outputs + ' / 辅助 ' + auxes + ' / 空位 ' + empties, 8, HEX.teal);
    this.text(16, 212, '选中 ' + (this.focusCell + 1) + ' 号  间隔 ' + (cell.effIntervalMs / 1000).toFixed(2) + 's / 冷却 ' + (cell.effCooldownMs / 1000).toFixed(2) + 's', 8, HEX.mute);
    this.text(16, 222, '上幕：触发 ' + (this.report.triggers ?? 0) + '  受阻 ' + (this.report.blocked ?? 0) + '  击杀 ' + (this.report.kills ?? 0), 8, HEX.mute);
    this.text(16, 233, '誓约', 8, HEX.brass);
    OATH_LIST.forEach(([id, label], i) => {
      this.button(44 + i * 52, 231, 48, 14, label, () => this.setOath(w.draft.oath === id ? null : id),
        w.draft.oath === id ? HEX.teal : HEX.mute, { fill: w.draft.oath === id ? C.stone : C.nightDeep });
    });
    this.text(16, 249, w.draft.oath ? ('当前：' + OATH_DEFS[w.draft.oath].name) : '未立誓（全局生效，最多一个）', 7, HEX.mute);

    // 右列：手牌与铭文（先算手牌统计，下面标题与列表都要用）
    const handTypes = Object.values(w.hand).filter(Boolean).length;
    const handTotal = Object.values(w.hand).reduce((a, b) => a + b, 0);
    this.panel(g, 240, 72, 230, 190, { fill: C.ink, alpha: 0.9 });
    pxRect(g, 242, 64, 74, 11, C.ink, 0.95);
    pxFrame(g, 242, 64, 74, 11, C.brassDark);
    this.text(246, 66, '手牌 ' + handTypes + ' 种', 8, HEX.brass);
    this.button(390, 64, 70, 13, '出口编辑', () => { this.exitMode = true; this.auxPending = null; this.paint(); }, HEX.brassLight, { fill: C.nightDeep });
    // 手牌列表区：固定内框，张数少时也读作“列表容器”而不是一片空白
    pxRect(g, 244, 78, 216, 86, C.night, 0.55);
    pxFrame(g, 244, 78, 216, 86, C.stoneLight, 1, 0.45);
    let row = 0;
    for (const [key, count] of Object.entries(w.hand)) {
      if (!count || row >= 5) continue;
      const defId = key.split(':')[1];
      const y = 82 + row * 16;
      this.handRow(244, y, 216, 14, defId, names[defId]?.name + ' ×' + count, hints[defId] ?? '',
        this.selectedCard === key, () => {
          this.selectedCard = this.selectedCard === key ? null : key;
          this.auxPending = null;
          this.note = this.selectedCard ? (hints[defId] + '；点击符位安装') : '已取消选择';
          this.paint();
        });
      row++;
    }
    if (!row) this.text(248, 88, '暂时没有手牌，请先领取上方奖励。', 8, HEX.mute);
    if (this.auxPending !== null) this.text(244, 166, '等待目标：点击 ' + (this.auxPending + 1) + ' 号相邻输出符印', 8, HEX.blood);
    else if (w.draft.auxTargets && Object.keys(w.draft.auxTargets).length) this.text(244, 166, '指向：' + Object.entries(w.draft.auxTargets).map(([a, b]) => (a + 1) + '→' + (b + 1)).join(' '), 7, HEX.mute);
    this.button(244, 172, 105, 16, '主卡返回手牌', () => { this.auxPending = null; this.act(removeCard(w, this.focusCell)); });
    this.button(355, 172, 105, 16, '取消手牌选择', () => { this.selectedCard = null; this.auxPending = null; this.paint(); });
    this.iconButton(244, 192, 105, 15, 'forge', '熔炉 8碎', () => this.addRune('forge'), HEX.parchment);
    this.iconButton(355, 192, 105, 15, 'relay', '中继 8碎', () => this.addRune('relay'), HEX.parchment);
    this.iconButton(244, 209, 105, 15, 'sever', '断流 8碎', () => this.addRune('sever'), HEX.parchment);
    this.iconButton(355, 209, 105, 15, 'silence', '静默 8碎', () => this.addRune('silence'), HEX.parchment);
    for (let i = 0; i < 2; i++) {
      const rune = w.draft.runes[this.focusCell]?.[i];
      this.button(244 + i * 111, 224, 105, 15, rune ? ('拆 ' + names[rune].name) : ('铭文槽 ' + (i + 1) + ' 空'),
        () => this.act(removeRune(w, this.focusCell, i)), rune ? HEX.brassLight : HEX.mute,
        { fill: rune ? C.stoneDark : C.nightDeep });
    }
    this.text(244, 240, this.note, 7, HEX.arcaneLight, { wordWrap: { width: 216 }, lineSpacing: 0 });
    const ready = canDepart(w);
    this.button(244, 250, 216, 12, '确认构筑 · 出发', () => this.depart(), ready.ok ? HEX.teal : HEX.mute,
      { fill: ready.ok ? C.stoneDark : C.nightDeep, frame: ready.ok ? C.teal : C.brassDark, size: 9 });
  }

  act(result) { this.note = result.message; this.paint(); }
  choose(index) {
    const offer = this.workshop.offer;
    if (!offer) return;
    this.act(chooseReward(this.workshop, offer.id, index));
  }
  clickCell(id) {
    if (!this.workshop.draft.unlocked.includes(id)) { this.note = '该格尚未解封'; this.paint(); return; }
    // 有指向型辅助等待目标时，点击相邻输出符印完成绑定。
    if (this.auxPending !== null) {
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
    this.focusCell = id;
    if (this.selectedCard) {
      const defId = this.selectedCard.split(':')[1];
      const result = placeCard(this.workshop, id, this.selectedCard);
      this.note = result.message;
      if (result.ok) {
        this.selectedCard = null;
        if (AUX_TARGETED.has(defId)) {
          this.auxPending = id;
          this.note = '请点击相邻输出符印，指定这张辅助的作用目标';
        }
      }
    }
    this.paint();
  }
  depart() {
    if (this.departed) return;
    const ready = canDepart(this.workshop);
    if (!ready.ok) { this.act(ready); return; }
    const grid = createGrid();
    const result = applyDraft(grid, this.workshop.draft, { phase: 'intermission' });
    if (!result.ok) { this.act({ message: '构筑未通过校验，请检查目标与插槽' }); return; }
    this.departed = true;
    this.run.draft = result.snapshot;
    this.run.shards = this.workshop.shards;
    this.run.hand = { ...this.workshop.hand };
    this.run.runeCosts = structuredClone(this.workshop.runeCosts);
    this.scene.start('BattleScene', { run: this.run });
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
