// 升级三选一：时停抽卡、进化候选、选中发牌（进手牌 + 登记技能）。
// 从 BattleScene 迁出（2026-11-19 架构重构波 2）。字段仍挂在场景上（pendingPicks/levelupUI/…），
// 本类只是方法集合，场景方法保留同名一行委托；applyEvolution 与 grantSkill 仍由场景执行。
import { C, HEX, addText, pxRect, pxFrame, getRenderScale } from './Palette.js';
import { cardKeyOf, cardOf, CARD_POOL } from '../logic/workshop.js';
import { cardsForAct } from '../logic/spell-gating.js';
import { SIGIL_DEFS, AUX_DEFS } from '../logic/effects.js';
import { variantOf, rollVariant } from '../data/variants.js';
import { EVOLUTIONS } from '../data/evolutions.js';
import { fireGuide } from '../logic/guide.js';
import { sfx } from '../audio/Sfx.js';

export default class LevelupPanel {
  constructor(scene) {
    this.scene = scene;
  }

  queue(count) {
    this.scene.pendingPicks = (this.scene.pendingPicks ?? 0) + count;
    if (this.scene.phase === 'play') this.scene.openLevelupPick();
  }

  open() {
    if (!this.scene.pendingPicks) return;
    this.scene.phase = 'levelup'; this.scene.paused = true; this.scene.engine.paused = true;
    this.scene.input.keyboard.resetKeys();
    // 新手引导 G02：第一次升级三选一（弹窗本身即讲解场景）
    fireGuide(this, this.scene.run, 'G02');
    // 升级三选一也走按幕解锁：前两幕不会刷出陨星裁决/地裂之颚这类演出级法术。
    const pool = cardsForAct(CARD_POOL, this.scene.chapter);
    const picks = [];
    // 进化优先：盘面/手牌里已有、还没升级的法术，有 45% 概率占一个候选位。
    const evoPick = this.scene.rollEvolutionPick();
    if (evoPick) {
      picks.push(evoPick);
      // 新手引导 G15：第一次见到进化牌时讲清「不占格、整条强化、连携相邻」。
      fireGuide(this, this.scene.run, 'G15', { highlight: 'hand' });
    }
    while (picks.length < 3 && pool.length) {
      const base = pool.splice(Math.floor(this.scene.combatRng.next() * pool.length), 1)[0];
      picks.push(base.kind === 'sigil' ? { kind: 'sigil', defId: base.defId, variant: rollVariant(this.scene.combatRng, base.defId) } : base);
    }
    const names = { ...SIGIL_DEFS, ...AUX_DEFS };
    const cardLabel = card => card.kind === 'evolution'
      ? '进化 · ' + card.route.name
      : card.kind === 'auxiliary'
        ? (names[card.defId]?.name ?? card.defId) : variantOf(card.defId, card.variant).name;
    const cardSub = card => card.kind === 'evolution' ? (names[card.defId]?.name ?? card.defId) + ' 全部强化'
      : card.kind === 'auxiliary' ? '辅助'
        : card.variant === 'harmon' ? '符印 · 谐' : card.variant === 'sharp' ? '符印 · 锐' : '符印 · 标';
    this.scene.levelupUI = this.scene.add.container(0, 0).setDepth(2600).setScrollFactor(0);
    this.scene.uiRoot?.add(this.scene.levelupUI);
    const g = this.scene.add.graphics();
    pxRect(g, 60, 70, 360, 130, C.ink, 0.97); pxFrame(g, 60, 70, 360, 130, C.brass, 1, 1);
    this.scene.levelupUI.add(g);
    this.scene.levelupUI.add(addText(this, 240, 80, '升 级 ！ 选 择 一 张 法 术 （ 入 手 牌 ）', 10, HEX.brassLight).setOrigin(0.5, 0));
    picks.forEach((card, i) => {
      const x = 78 + i * 118;
      const bg = this.scene.add.graphics();
      pxRect(bg, x, 102, 108, 66, C.stoneDark); pxFrame(bg, x, 102, 108, 66, this.scene.combatRng.next() < 0.5 ? C.brass : C.teal, 1, 1);
      this.scene.levelupUI.add(bg);
      this.scene.levelupUI.add(addText(this, x + 54, 108, cardLabel(card), 9,
        card.kind === 'evolution' ? HEX.brassLight : card.kind === 'auxiliary' ? HEX.teal : HEX.parchment).setOrigin(0.5, 0));
      this.scene.levelupUI.add(addText(this, x + 54, 126, cardSub(card), 7, card.variant === 'harmon' ? HEX.teal : HEX.mute).setOrigin(0.5, 0));
      this.scene.levelupUI.add(addText(this, x + 54, 156, '点击或按 ' + (i + 1), 7, HEX.brass).setOrigin(0.5, 0));
    });
    this.scene.levelupRects = picks.map((card, i) => ({ card, x: 78 + i * 118, y: 102, w: 108, h: 66 }));
    this.scene.levelupHandler = (pointer) => {
      const scale = getRenderScale();
      const lx = pointer.x / scale, ly = pointer.y / scale;
      for (const r of this.scene.levelupRects ?? []) {
        if (lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h) { this.scene.pickLevelupCard(r.card); return; }
      }
    };
    this.scene.levelupKeys = ['ONE', 'TWO', 'THREE'].map((code, i) => {
      const key = this.scene.input.keyboard.on('keydown-' + code, () => this.scene.pickLevelupCard(this.scene.levelupRects[i]?.card));
      return key;
    });
    this.scene.input.on('pointerdown', this.scene.levelupHandler);
    this.scene.levelupUI.add(addText(this, 240, 182, '点击卡片或按 1/2/3 选择；卡片进手牌，暂停菜单→编辑法阵 可放置', 7, HEX.mute).setOrigin(0.5, 0));
  }

  // 进化候选：只从「已拥有且未升级」的法术里挑一条路线，避免三选一里出现用不上的进化。
  rollEvolutionPick() {
    if (this.scene.combatRng.next() > 0.45) return null;
    const owned = new Set();
    for (const cell of this.scene.grid.cells) if (cell.slot?.kind === 'sigil') owned.add(cell.slot.defId);
    for (const key of Object.keys(this.scene.run.hand ?? {})) {
      const card = cardOf(key);
      if (card?.kind === 'sigil') owned.add(card.defId);
    }
    const options = [];
    for (const defId of owned) {
      if (this.scene.run.evolutions?.[defId]) continue;
      for (const route of EVOLUTIONS[defId] ?? []) options.push({ kind: 'evolution', defId, evo: route.id, route });
    }
    if (!options.length) return null;
    return options[Math.floor(this.scene.combatRng.next() * options.length)];
  }

  pick(card) {
    if (this.scene.phase !== 'levelup' || !card) return;
    const evolved = card.kind === 'evolution';
    if (evolved) this.scene.applyEvolution(card);
    else {
      const key = cardKeyOf(card);
      this.scene.run.hand[key] = (this.scene.run.hand[key] ?? 0) + 1;
      // 三选一里玩家选中的这张卡就是本场技能：选攻击就是攻击技能，选防御（圣光壁垒/圣环）就是护盾技能。
      // 辅助卡与进化卡没有主动法术（进化作用于已有法术），grantSkill 内部会安全忽略，不占技能格。
      this.scene.grantSkill(card.defId);
    }
    if (this.scene.levelupHandler) { this.scene.input.off('pointerdown', this.scene.levelupHandler); this.scene.levelupHandler = null; }
    for (const key of ['ONE', 'TWO', 'THREE']) this.scene.input.keyboard?.off('keydown-' + key);
    this.scene.levelupUI?.destroy(true); this.scene.levelupUI = null;
    this.scene.levelupRects = null;
    this.scene.pendingPicks--;
    sfx.correct();
    this.scene.effects.text(240, 150, evolved
      ? '已进化 ' + (SIGIL_DEFS[card.defId]?.name ?? card.defId) + ' → ' + card.route.name
      : '已入手 ' + (card.kind === 'auxiliary'
        ? (AUX_DEFS[card.defId]?.name ?? card.defId) : variantOf(card.defId, card.variant).name), evolved ? HEX.brassLight : HEX.teal, true);
    if (this.scene.pendingPicks > 0) this.scene.openLevelupPick();
    else { this.scene.phase = 'play'; this.scene.paused = false; this.scene.engine.paused = false; }
  }
}
