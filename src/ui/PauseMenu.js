// 暂停菜单：Esc 打开，失焦自动打开；纯键盘操作
import { C, HEX, addText, pxRect, pxFrame, pxDiamond } from './Palette.js';

export default class PauseMenu {
  constructor(scene) {
    this.scene = scene;
    this.visible = false;
    this.mode = 'menu';
    this.g = scene.add.graphics().setDepth(2000).setVisible(false).setScrollFactor(0);
    this.title = addText(scene, 240, 62, '暂　停', 16, HEX.parchment, {
      stroke: '#0d0a17', strokeThickness: 2,
    }).setOrigin(0.5, 0.5).setDepth(2001).setVisible(false).setScrollFactor(0);
    this.note = addText(scene, 240, 88, '战场与脉流已冻结', 8, HEX.mute)
      .setOrigin(0.5, 0.5).setDepth(2001).setVisible(false).setScrollFactor(0);
    this.lines = [
      addText(scene, 240, 108, 'Esc　　继续战斗', 9, HEX.parchment).setOrigin(0.5, 0.5).setDepth(2001).setVisible(false),
      addText(scene, 240, 124, 'R　　　重开本局', 9, HEX.parchment).setOrigin(0.5, 0.5).setDepth(2001).setVisible(false),
      addText(scene, 240, 140, 'T　　　返回标题', 9, HEX.parchment).setOrigin(0.5, 0.5).setDepth(2001).setVisible(false),
      addText(scene, 240, 156, 'E　　　编辑法阵', 9, HEX.teal).setOrigin(0.5, 0.5).setDepth(2001).setVisible(false),
    ];
    this.footer = addText(scene, 240, 250, '按住空格可随时观察法阵细目', 7, HEX.brass)
      .setOrigin(0.5, 0.5).setDepth(2001).setVisible(false);
    // 实时诊断：联组次数、断链原因分布、冷却受阻次数
    this.diag = addText(scene, 240, 190, '', 7, HEX.mute, { wordWrap: { width: 230 } })
      .setOrigin(0.5, 0.5).setDepth(2001).setVisible(false);
    for (const item of [...this.lines, this.footer, this.diag]) item.setScrollFactor(0);
    this.draw();
  }

  draw() {
    const g = this.g;
    g.clear();
    // 全屏压暗：纯色半透明，不是毛玻璃
    pxRect(g, 0, 0, 480, 270, C.void, 0.55);
    // 石质面板
    pxRect(g, 112, 44, 256, 226, C.ink, 0.98);
    pxFrame(g, 112, 44, 256, 226, C.brassDark, 2, 1);
    pxFrame(g, 116, 48, 248, 218, C.brass, 0.5, 1);
    pxRect(g, 120, 80, 240, 1, C.brassDark, 0.8);
    pxRect(g, 120, 236, 240, 1, C.brassDark, 0.5);
    for (const [x, y] of [[112, 44], [364, 44], [112, 266], [364, 266]]) {
      pxRect(g, x, y, 3, 3, C.brass, 0.9);
      pxRect(g, x + 1, y + 1, 1, 1, C.brassLight, 1);
    }
    pxDiamond(g, 240, 54, 3, C.brass, 0.8, false);
    pxDiamond(g, 240, 260, 2, C.brass, 0.6, false);
  }

  show(mode = 'menu', info = null) {
    this.visible = true;
    this.mode = mode;
    const notes = {
      menu: '战场与脉流已冻结',
      blur: '窗口失焦，已自动暂停',
      focus: '窗口已恢复，按 Esc 继续',
      debug: '调试暂停画面',
    };
    this.note.setText(notes[mode] || notes.menu);
    this.g.setVisible(true);
    this.title.setVisible(true);
    this.note.setVisible(true);
    this.footer.setVisible(true);
    if (info) {
      const b = info.breaks ?? {};
      this.diag.setText('联组 ' + (info.combos ?? 0) + '　断链：冷却 ' + (b.cooldown ?? 0)
        + ' · 改道 ' + (b.fallback ?? 0) + ' · 消散 ' + (b.dissipate ?? 0)
        + '　受阻 ' + (info.blocked ?? 0));
      this.diag.setVisible(true);
    } else {
      this.diag.setVisible(false);
    }
    for (const line of this.lines) line.setVisible(true);
  }

  hide() {
    this.visible = false;
    this.g.setVisible(false);
    this.title.setVisible(false);
    this.note.setVisible(false);
    this.footer.setVisible(false);
    this.diag.setVisible(false);
    for (const line of this.lines) line.setVisible(false);
  }
}
