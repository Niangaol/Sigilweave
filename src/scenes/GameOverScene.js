// 死亡结算：羊皮纸面板 + 本局数据 + R/Enter 重开，Esc 回标题
import Phaser from 'phaser';
import { C, HEX, addText, pxRect, pxFrame, pxLine, pxDiamond, fmtTime, applyPixelZoom, FONT_DISPLAY } from '../ui/Palette.js';

const SAMPLE = {
  elapsedMs: 0, act: 1, kills: 0, shards: 0, triggers: 0, combos: 0,
  blocked: 0, dissipations: 0, peakRate: 0, cells: 6,
};

export default class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOverScene');
  }

  init(data) {
    this.data = Object.assign({}, SAMPLE, data || {});
    this.started = false;
  }

  create() {
    applyPixelZoom(this);
    this.cameras.main.fadeIn(240, 0, 0, 0);
    this.drawBackdrop();
    this.drawPanel();
    this.writeStats();
    this.writePrompts();

    this.input.keyboard.on('keydown-ENTER', this.restart, this);
    this.input.keyboard.on('keydown-R', this.restart, this);
    this.input.keyboard.on('keydown-ESC', this.toTitle, this);
    this.input.on('pointerdown', this.restart, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard.off('keydown-ENTER', this.restart, this);
      this.input.keyboard.off('keydown-R', this.restart, this);
      this.input.keyboard.off('keydown-ESC', this.toTitle, this);
      this.input.off('pointerdown', this.restart, this);
    });
  }

  restart() {
    if (this.started) return;
    this.started = true;
    this.scene.start('BattleScene');
  }

  toTitle() {
    if (this.started) return;
    this.started = true;
    this.scene.start('TitleScene');
  }

  drawBackdrop() {
    const g = this.add.graphics().setDepth(0);
    pxRect(g, 0, 0, 480, 270, C.nightDeep, 1);
    // 远景的暗色法阵轮廓，呼应战斗画面
    pxDiamond(g, 240, 136, 108, C.stoneDark, 0.35, false);
    pxDiamond(g, 240, 136, 84, C.groove, 0.18, false);
    pxDiamond(g, 240, 136, 58, C.stoneDark, 0.25, false);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      pxLine(g, 240 + Math.cos(a) * 30, 136 + Math.sin(a) * 24,
        240 + Math.cos(a) * 96, 136 + Math.sin(a) * 76, C.groove, 0.12, 1);
    }
    // 两侧残烛
    for (const [x, y] of [[40, 210], [440, 210]]) {
      pxRect(g, x - 1, y - 9, 3, 9, C.parchment, 1);
      pxRect(g, x - 3, y, 7, 2, C.brassDark, 1);
      pxRect(g, x, y - 13, 1, 4, C.arcane, 0.8);
      pxRect(g, x - 1, y - 11, 3, 3, C.arcane, 0.3);
    }
    // 底部地面
    pxRect(g, 0, 240, 480, 30, C.night, 0.8);
    pxRect(g, 0, 240, 480, 1, C.stoneDark, 1);
  }

  drawPanel() {
    const g = this.add.graphics().setDepth(2);
    // 投影与羊皮纸面板
    pxRect(g, 68, 36, 352, 206, C.void, 0.6);
    pxRect(g, 64, 32, 352, 206, C.parchment, 1);
    pxRect(g, 64, 32, 352, 4, 0xd9bf8a, 1);
    pxRect(g, 64, 234, 352, 4, 0xc4a875, 1);
    // 黄铜双边框 + 角钉
    pxFrame(g, 64, 32, 352, 206, C.brass, 3, 1);
    pxFrame(g, 69, 37, 342, 196, C.brassDark, 1, 0.9);
    pxFrame(g, 63, 31, 354, 208, C.outline, 1, 1);
    for (const [x, y] of [[64, 32], [412, 32], [64, 234], [412, 234]]) {
      pxRect(g, x, y, 4, 4, C.brass, 1);
      pxRect(g, x + 1, y + 1, 2, 2, C.brassLight, 1);
    }
    // 羊皮纸纤维（固定种子，硬边点）
    let seed = 0x7a3c;
    const rng = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 160; i++) {
      const x = 72 + Math.floor(rng() * 336);
      const y = 40 + Math.floor(rng() * 190);
      pxRect(g, x, y, 1, 1, rng() > 0.5 ? C.brassDark : 0x8a6d3b, 0.12 + rng() * 0.08);
    }
    pxLine(g, 88, 100, 392, 100, C.brassDark, 0.55, 1);
    pxLine(g, 88, 190, 392, 190, C.brassDark, 0.35, 1);

    addText(this, 240, 48, this.data.victory ? '契约终结' : (this.data.trainingComplete ? '演武完成' : '魂火熄灭'), 22, HEX.inkDark, {
      noStroke: true,
      stroke: '#f0d9a8', strokeThickness: 1, letterSpacing: 4,
    }).setOrigin(0.5, 0).setDepth(3);
    addText(this, 240, 80, this.data.victory ? '三位契约主已消灭 · 通关' : (this.data.trainingComplete ? '构筑演武结束' : ('第 ' + this.data.act + ' 幕 · 挑战中断')), 8, HEX.ink, {
      noStroke: true,
      letterSpacing: 1,
    }).setOrigin(0.5, 0).setDepth(3);
  }

  writeStats() {
    const d = this.data;
    const rows = [
      ['存活时间', fmtTime(d.elapsedMs), '击杀数', String(d.kills)],
      ['符文碎片', String(d.shards), '脉流触发', String(d.triggers)],
      ['联组成立', String(d.combos), '冷却受阻', String(d.blocked)],
      ['峰值脉频', (d.peakRate || 0).toFixed(1) + '/s', '解锁符位', String(d.cells) + ' 格'],
    ];
    rows.forEach((row, i) => {
      const y = 112 + i * 19;
      addText(this, 92, y, row[0], 9, HEX.ink, { noStroke: true }).setDepth(3);
      addText(this, 222, y, row[1], 10, HEX.inkDark, { noStroke: true }).setOrigin(1, 0).setDepth(3);
      addText(this, 248, y, row[2], 9, HEX.ink, { noStroke: true }).setDepth(3);
      addText(this, 392, y, row[3], 10, HEX.inkDark, { noStroke: true }).setOrigin(1, 0).setDepth(3);
    });
    // 羊皮纸属浅底：深色字再加深色描边会糊成一团，这里关掉描边
    addText(this, 240, 194, this.data.victory ? ('破局 ' + Object.values(this.data.bossResolutions ?? {}).filter(r => r.method === 'quiz').length + ' 次 ／ 战斗击败 ' + Object.values(this.data.bossResolutions ?? {}).filter(r => r.method === 'combat').length + ' 次') : '法阵的刻线还温着——下一局，把缺的那一角补上。', 8, HEX.ink, { noStroke: true })
      .setOrigin(0.5, 0).setDepth(3);
  }

  writePrompts() {
    this.prompt = addText(this, 240, 210, 'Enter / R　再战　　·　　Esc　返回标题', 9, HEX.inkDark, { noStroke: true })
      .setOrigin(0.5, 0).setDepth(3);
    // 品牌行放到面板外的深色底上，避免和再战提示挤在面板底缘
    addText(this, 240, 244, '共 振 法 阵 · 契 约 破 局', 7, HEX.brass, {
      letterSpacing: 1,
    }).setOrigin(0.5, 0).setDepth(3);
  }

  update(time) {
    if (this.prompt) this.prompt.setAlpha(Math.floor(time / 460) % 2 === 0 ? 1 : 0.45);
  }
}
