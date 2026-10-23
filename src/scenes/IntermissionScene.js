// 幕间工作台独立于战斗：只编辑草稿，出发时一次提交；右下罗盘布局仅用于战斗。
import Phaser from 'phaser';
import { C, HEX, addText, pxRect, pxFrame } from '../ui/Palette.js';
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
    this.paint();
    window.__SIGILWEAVE_WORKSHOP__ = this;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (window.__SIGILWEAVE_WORKSHOP__ === this) window.__SIGILWEAVE_WORKSHOP__ = null;
    });
  }
  text(x, y, value, size = 8, color = HEX.parchment, extra = {}) {
    const t = addText(this, x, y, value, size, color, extra); this.view.add(t); return t;
  }
  button(x, y, w, h, label, action, color = HEX.parchment) {
    const g = this.add.graphics(); this.view.add(g);
    pxRect(g, x, y, w, h, C.stoneDark); pxFrame(g, x, y, w, h, C.brassDark);
    this.text(x + w / 2, y + h / 2, label, 8, color).setOrigin(0.5);
    const zone = this.add.zone(x, y, w, h).setOrigin(0).setInteractive({ useHandCursor: true }); this.view.add(zone);
    zone.on('pointerdown', () => { if (!this.departed) action(); });
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
  paint() {
    this.view.removeAll(true);
    const w = this.workshop;
    const g = this.add.graphics(); this.view.add(g);
    pxRect(g, 0, 0, 480, 270, C.void);
    pxFrame(g, 6, 6, 468, 258, C.brassDark);
    this.text(14, 10, '幕间构筑  /  第 ' + w.draft.act + ' 幕准备', 12, HEX.brassLight);
    this.text(466, 12, '碎片 ' + w.shards, 10, HEX.teal).setOrigin(1, 0);
    const offer = w.offer;
    if (offer) {
      offer.cards.forEach((card, i) => {
        const x = 14 + i * 152;
        this.button(x, 28, 144, 22, names[card.defId].name + '  领取', () => this.choose(i), card.kind === 'auxiliary' ? HEX.teal : HEX.arcaneLight);
        this.text(x + 3, 52, hints[card.defId] ?? '', 7, HEX.mute);
      });
    } else this.text(16, 34, '三轮奖励已领取。选右侧手牌，再点左侧符位放置。', 8, HEX.teal);
    this.text(14, 66, '奖励剩余 ' + w.roundsRemaining + ' 轮  /  已解封 ' + w.draft.unlocked.length + ' 格', 8, HEX.mute);
    const grid = createGrid();
    applyDraft(grid, w.draft, { phase: 'intermission' });
    for (let id = 0; id < 16; id++) {
      const x = 14 + (id % 4) * 54, y = 76 + Math.floor(id / 4) * 29;
      const unlocked = w.draft.unlocked.includes(id), slot = w.draft.slots[id];
      const selected = id === this.focusCell || id === this.auxPending;
      pxRect(g, x, y, 51, 26, unlocked ? C.stone : C.night);
      pxFrame(g, x, y, 51, 26, selected ? C.arcane : C.stoneLight);
      this.text(x + 2, y + 2, unlocked ? (slot ? names[slot.defId]?.name : '空符位') : '封印', 8, slot?.kind === 'auxiliary' ? HEX.teal : HEX.parchment);
      const runeCount = (w.draft.runes[id] ?? []).filter(Boolean).length;
      const target = w.draft.auxTargets[id];
      this.text(x + 2, y + 14, (id + 1) + '  铭 ' + runeCount + ' 出' + this.currentExits(id).length + (target !== undefined ? (' →' + (target + 1)) : ''), 7, HEX.mute);
      const zone = this.add.zone(x, y, 51, 26).setOrigin(0).setInteractive({ useHandCursor: true }); this.view.add(zone);
      zone.on('pointerdown', () => { if (!this.departed) this.clickCell(id); });
    }
    const cell = grid.cells[this.focusCell];
    if (this.exitMode) {
      // 出口编辑面板：临时覆盖左下统计区，不改动法阵本身
      pxRect(g, 10, 196, 224, 70, C.ink, 0.96); pxFrame(g, 10, 196, 224, 70, C.brass);
      this.text(16, 198, '出口编辑 · ' + (this.focusCell + 1) + ' 号（' + (w.draft.slots[this.focusCell] ? names[w.draft.slots[this.focusCell].defId] : '空符位') + '）', 8, HEX.brassLight);
      const cur = this.currentExits(this.focusCell);
      const dirs = [['up', '上'], ['down', '下'], ['left', '左'], ['right', '右']];
      dirs.forEach(([d, label], i) => {
        const x = 16 + (i % 2) * 102, y = 214 + Math.floor(i / 2) * 20;
        this.button(x, y, 102, 18, label + ' ' + (cur.includes(d) ? '开' : '关'), () => this.toggleExit(d), cur.includes(d) ? HEX.teal : HEX.mute);
      });
      this.button(16, 254, 204, 12, '完成出口编辑', () => { this.exitMode = false; this.paint(); }, HEX.brassLight);
      this.text(244, 244, w.note ?? this.note, 7, HEX.arcaneLight, { wordWrap: { width: 216 } });
      const ex = this.currentExits(this.focusCell);
      const label = { up: '上', down: '下', left: '左', right: '右' };
      this.text(228, 196, ex.map(d => label[d]).join('') || '无', 8, HEX.teal).setOrigin(1, 0);
      return;
    }
    this.text(16, 196, '输出 ' + Object.entries(w.draft.slots).filter(([id, s]) => s?.kind === 'sigil' && !w.draft.runes[id]?.includes('relay')).length
      + ' / 辅助 ' + Object.values(w.draft.slots).filter(s => s?.kind === 'auxiliary').length
      + ' / 空位 ' + w.draft.unlocked.filter(id => !w.draft.slots[id]).length, 8, HEX.teal);
    this.text(16, 208, '选中 ' + (this.focusCell + 1) + ' 号  间隔 ' + (cell.effIntervalMs / 1000).toFixed(2) + 's / 冷却 ' + (cell.effCooldownMs / 1000).toFixed(2) + 's', 8, HEX.mute);
    this.text(16, 220, '上幕：触发 ' + (this.report.triggers ?? 0) + '  受阻 ' + (this.report.blocked ?? 0) + '  击杀 ' + (this.report.kills ?? 0), 8, HEX.mute);
    this.text(16, 233, '誓约', 8, HEX.brass);
    OATH_LIST.forEach(([id, label], i) => {
      this.button(44 + i * 52, 231, 48, 14, label, () => this.setOath(w.draft.oath === id ? null : id), w.draft.oath === id ? HEX.teal : HEX.mute);
    });
    this.text(16, 249, w.draft.oath ? ('当前：' + OATH_DEFS[w.draft.oath].name) : '未立誓（全局生效，最多一个）', 7, HEX.mute);
    // 右列：手牌与操作
    this.text(244, 66, '手牌：点选后装入符位', 8, HEX.brass);
    this.button(390, 64, 70, 13, '出口编辑', () => { this.exitMode = true; this.auxPending = null; this.paint(); }, HEX.brassLight);
    let row = 0;
    for (const [key, count] of Object.entries(w.hand)) {
      if (!count || row >= 5) continue;
      const defId = key.split(':')[1];
      const y = 78 + row * 16;
      this.button(244, y, 216, 14, names[defId]?.name + ' ×' + count + '   ' + (hints[defId] ?? ''), () => {
        this.selectedCard = this.selectedCard === key ? null : key;
        this.auxPending = null;
        this.note = this.selectedCard ? (hints[defId] + '；点击符位安装') : '已取消选择'; this.paint();
      }, this.selectedCard === key ? HEX.teal : HEX.parchment);
      row++;
    }
    if (!row) this.text(244, 80, '暂时没有手牌，请先领取上方奖励。', 8, HEX.mute);
    if (this.auxPending !== null) this.text(244, 160, '等待目标：点击 ' + (this.auxPending + 1) + ' 号相邻输出符印', 8, HEX.blood);
    else if (w.draft.auxTargets && Object.keys(w.draft.auxTargets).length) this.text(244, 160, '指向：' + Object.entries(w.draft.auxTargets).map(([a, b]) => (a + 1) + '→' + (b + 1)).join(' '), 7, HEX.mute);
    this.button(244, 172, 105, 16, '主卡返回手牌', () => { this.auxPending = null; this.act(removeCard(w, this.focusCell)); });
    this.button(355, 172, 105, 16, '取消手牌选择', () => { this.selectedCard = null; this.auxPending = null; this.paint(); });
    this.button(244, 192, 105, 15, '熔炉 8碎', () => this.addRune('forge'));
    this.button(355, 192, 105, 15, '中继 8碎', () => this.addRune('relay'));
    this.button(244, 209, 105, 15, '断流 8碎', () => this.addRune('sever'));
    this.button(355, 209, 105, 15, '静默 8碎', () => this.addRune('silence'));
    for (let i = 0; i < 2; i++) {
      const rune = w.draft.runes[this.focusCell]?.[i];
      this.button(244 + i * 111, 226, 105, 15, rune ? ('拆 ' + names[rune].name) : ('铭文槽 ' + (i + 1) + ' 空'), () => this.act(removeRune(w, this.focusCell, i)), rune ? HEX.brassLight : HEX.mute);
    }
    this.text(244, 244, this.note, 7, HEX.arcaneLight, { wordWrap: { width: 216 }, lineSpacing: 0 });
    this.button(244, 254, 216, 14, '确认构筑 · 出发', () => this.depart(), canDepart(w).ok ? HEX.teal : HEX.mute);
  }
}
