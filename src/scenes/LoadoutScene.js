// 开局法术套装选择：三张像素卡并排，按键 1/2/3 或点击卡片选择，Enter/按钮进入战斗。
import Phaser from 'phaser';
import { C, HEX, addText, pxRect, pxFrame, pxDiamond } from '../ui/Palette.js';
import { STARTING_KITS, createRun } from '../logic/run.js';
import { SIGIL_DEFS } from '../logic/effects.js';
import { sectorLabel } from '../data/roster.js';

const CARD = Object.freeze({ left: 12, gap: 12, width: 144, top: 48, height: 164 });
const ACCENT = Object.freeze({ bolt: C.brassLight, flame: C.arcane, ward: C.parchment });

export default class LoadoutScene extends Phaser.Scene {
  constructor() {
    super('LoadoutScene');
  }

  create() {
    // 种子从 URL ?seed= 取；没有就随机一局，进入战斗后整套 run 共用这个种子。
    const params = new URLSearchParams(window.location.search);
    this.seed = params.get('seed') || ('sigil-' + Math.random().toString(36).slice(2, 10));
    this.kitId = STARTING_KITS[0].id;
    this.started = false;
    this.view = this.add.container(0, 0);
    this.cameras.main.fadeIn(180, 0, 0, 0);
    window.__SIGILWEAVE_LOADOUT__ = { kitId: this.kitId, started: false };

    this.keyHandlers = [
      ['keydown-ONE', () => this.select(0)],
      ['keydown-TWO', () => this.select(1)],
      ['keydown-THREE', () => this.select(2)],
      ['keydown-ENTER', () => this.startBattle()],
    ];
    for (const [event, handler] of this.keyHandlers) this.input.keyboard.on(event, handler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const [event, handler] of this.keyHandlers) this.input.keyboard.off(event, handler);
    });

    this.paint();
  }

  text(x, y, value, size = 8, color = HEX.parchment, extra = {}) {
    const t = addText(this, x, y, value, size, color, extra);
    // 480×270 画布下 2 倍文本纹理会被半尺寸采样出锯齿；若以后画布放大则沿用全局分辨率。
    if (this.sys.game.canvas.width <= 480) t.setResolution(1);
    this.view.add(t);
    return t;
  }

  cardX(index) {
    return CARD.left + index * (CARD.width + CARD.gap);
  }

  select(index) {
    if (this.started) return;
    const kit = STARTING_KITS[index];
    if (!kit || kit.id === this.kitId) return;
    this.kitId = kit.id;
    window.__SIGILWEAVE_LOADOUT__.kitId = kit.id;
    this.paint();
  }

  startBattle() {
    if (this.started) return;
    this.started = true;
    window.__SIGILWEAVE_LOADOUT__ = { kitId: this.kitId, started: true };
    this.paint();
    const run = createRun(this.seed, this.kitId);
    this.cameras.main.fadeOut(140, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('BattleScene', { run });
    });
  }

  paint() {
    this.view.removeAll(true);
    const g = this.add.graphics();
    this.view.add(g);
    this.drawBackdrop(g);
    this.drawHeader(g);
    STARTING_KITS.forEach((kit, index) => this.drawCard(g, kit, index));
    this.text(240, 216, '1 / 2 / 3 选择　·　Enter 或点击按钮出战', 7, HEX.mute).setOrigin(0.5, 0);
    this.drawStartButton(g);
  }

  drawBackdrop(g) {
    pxRect(g, 0, 0, 480, 270, C.void);
    pxRect(g, 0, 0, 480, 208, C.nightDeep);
    pxRect(g, 0, 208, 480, 62, C.night);
    pxRect(g, 0, 208, 480, 1, C.stoneDark);
    // 地面刻线：只画硬边像素，不用渐变与模糊
    for (let x = 18; x < 462; x += 42) pxRect(g, x, 250 + (x % 5), 16, 1, C.groove, 0.18);
    for (let i = 0; i < 5; i++) pxRect(g, 46 + i * 97, 262, 9, 1, C.groove, 0.12);
    // 两侧窄石柱
    for (const x of [0, 472]) {
      pxRect(g, x, 0, 8, 270, C.nightDeep);
      pxRect(g, x === 0 ? 7 : 472, 0, 1, 270, C.stoneDark, 0.8);
    }
    pxFrame(g, 6, 6, 468, 258, C.brassDark, 1);
    pxFrame(g, 8, 8, 464, 254, C.stoneDark, 0.35);
    pxDiamond(g, 240, 6, 2, C.brass, 0.7, true);
    pxDiamond(g, 240, 264, 2, C.brass, 0.7, true);
  }

  drawHeader(g) {
    this.text(240, 9, '选择初始法术套装', 16, HEX.brassLight, {
      stroke: '#0d0a17', strokeThickness: 2, letterSpacing: 2,
    }).setOrigin(0.5, 0);
    this.text(240, 31, '开局定下四张主槽；本局第一幕固定解封 6 格，其余构筑留到幕间。', 8, HEX.mute)
      .setOrigin(0.5, 0);
    pxRect(g, 96, 42, 288, 1, C.brassDark, 0.8);
    pxDiamond(g, 240, 42, 2, C.brass, 0.8, true);
  }

  drawCard(g, kit, index) {
    const x = this.cardX(index);
    const y = CARD.top;
    const w = CARD.width;
    const h = CARD.height;
    const selected = kit.id === this.kitId;
    const accent = ACCENT[kit.id] ?? C.brass;

    pxRect(g, x, y, w, h, selected ? C.night : C.nightDeep, 1);
    pxRect(g, x, y, w, h, selected ? C.arcane : C.stoneLight, selected ? 0.1 : 0.04);
    pxFrame(g, x, y, w, h, selected ? C.arcane : C.stoneLight, selected ? 2 : 1, 1);
    pxFrame(g, x + 3, y + 3, w - 6, h - 6, selected ? C.brassDark : C.stoneDark, 1, selected ? 0.9 : 0.6);
    pxRect(g, x + 2, y + 2, w - 4, 2, accent, selected ? 1 : 0.55);

    // 序号与套装名
    pxDiamond(g, x + 11, y + 12, 3, selected ? C.arcaneLight : C.brass, selected ? 1 : 0.7, true);
    this.text(x + 17, y + 8, String(index + 1), 7, selected ? HEX.arcaneLight : HEX.mute);
    this.text(x + w / 2, y + 5, kit.name, 14, selected ? HEX.arcaneLight : HEX.parchment, { letterSpacing: 4 })
      .setOrigin(0.5, 0);

    // 一句话风格
    this.text(x + w / 2, y + 25, kit.tagline, 7, selected ? HEX.parchment : HEX.mute, {
      wordWrap: { width: w - 20 }, align: 'center', lineSpacing: 2,
    }).setOrigin(0.5, 0);
    pxRect(g, x + 12, y + 50, w - 24, 1, C.brassDark, 0.8);

    // 四张主槽：法术名 + 所在方位
    let row = 0;
    for (const [cellId, slot] of Object.entries(kit.slots)) {
      const rowY = y + 56 + row * 24;
      pxDiamond(g, x + 14, rowY + 5, 2, accent, selected ? 0.95 : 0.5, true);
      this.text(x + 21, rowY, SIGIL_DEFS[slot.defId]?.name ?? slot.defId, 9, selected ? HEX.white : HEX.parchment);
      this.text(x + w - 11, rowY + 2, sectorLabel(Number(cellId)), 7, selected ? HEX.brassLight : HEX.mute)
        .setOrigin(1, 0);
      row++;
    }

    // 底部状态条：选中卡高亮并给出出战提示
    pxRect(g, x + 3, y + h - 18, w - 6, 15, selected ? C.nightSoft : C.ink, selected ? 0.95 : 0.8);
    this.text(x + w / 2, y + h - 15, selected ? '已选 · 按 Enter 出战' : '点击卡片或按 ' + (index + 1) + ' 选择',
      7, selected ? HEX.arcaneLight : HEX.mute).setOrigin(0.5, 0);

    const zone = this.add.zone(x, y, w, h).setOrigin(0).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', () => this.select(index));
    this.view.add(zone);
  }

  drawStartButton(g) {
    const x = 176;
    const y = 232;
    const w = 128;
    const h = 22;
    pxRect(g, x, y, w, h, this.started ? C.night : C.stoneDark, 1);
    pxFrame(g, x, y, w, h, this.started ? C.stoneLight : C.brass, 1);
    pxFrame(g, x + 2, y + 2, w - 4, h - 4, C.brassDark, 1, 0.7);
    pxDiamond(g, x + 8, y + h / 2, 2, C.arcaneLight, 0.8, true);
    pxDiamond(g, x + w - 8, y + h / 2, 2, C.arcaneLight, 0.8, true);
    this.text(x + w / 2, y + 7, '进入战斗', 9, HEX.brassLight).setOrigin(0.5, 0);
    const zone = this.add.zone(x, y, w, h).setOrigin(0).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', () => this.startBattle());
    this.view.add(zone);
  }
}
