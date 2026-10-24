// 暂停菜单：Esc 打开，失焦自动打开；每一项都可鼠标点击（键盘快捷键保留为等效操作）。
import { C, HEX, addText, pxRect, pxFrame, pxDiamond, getRenderScale } from './Palette.js';
import { isSoundEnabled } from '../audio/Sfx.js';

// 每一行菜单项：显示用的键位提示 + 对应的动作，命中区由 y 与固定宽高推出。
const ROW_W = 220;
const ROW_H = 16;

// 纯函数：指针落在哪一行。抽出来是为了能在 Node 里单测，不必构造 Phaser 场景。
export function hitRowAt(rowDefs, x, y) {
  if (!Array.isArray(rowDefs)) return -1;
  for (let i = 0; i < rowDefs.length; i++) {
    const r = rowDefs[i];
    if (x >= r.x && x <= r.x + r.w && Math.abs(y - r.y) <= r.h / 2) return i;
  }
  return -1;
}

export default class PauseMenu {
  constructor(scene, actions = {}) {
    this.scene = scene;
    this.actions = actions;
    this.rows = [];
    this.hover = -1;
    this.pointerMove = null;
    this.pointerDown = null;
    this.visible = false;
    this.mode = 'menu';
    this.g = scene.add.graphics().setDepth(2000).setVisible(false).setScrollFactor(0);
    this.title = addText(scene, 240, 62, '暂　停', 16, HEX.parchment, {
      stroke: '#0d0a17', strokeThickness: 2,
    }).setOrigin(0.5, 0.5).setDepth(2001).setVisible(false).setScrollFactor(0);
    this.note = addText(scene, 240, 88, '战场与脉流已冻结', 8, HEX.mute)
      .setOrigin(0.5, 0.5).setDepth(2001).setVisible(false).setScrollFactor(0);
    // 五个菜单项：点一下即可，键位提示保留（键盘是等效操作，不再是唯一入口）。
    // 音盛行给手机用——手机上没有 M 键，静音必须能点。
    const rows = [
      { y: 104, action: 'resume', label: 'Esc　　继续战斗', color: HEX.parchment },
      { y: 120, action: 'restart', label: 'R　　　重开本局', color: HEX.parchment },
      { y: 136, action: 'title', label: 'T　　　返回标题', color: HEX.parchment },
      { y: 152, action: 'edit', label: 'E　　　编辑法阵', color: HEX.teal },
      { y: 168, action: 'mute', label: '', color: HEX.mute },
    ];
    this.rowDefs = rows.map((r) => ({ ...r, x: 240 - ROW_W / 2, w: ROW_W, h: ROW_H }));
    this.lines = rows.map((r) => addText(scene, 240, r.y, r.label, 9, r.color)
      .setOrigin(0.5, 0.5).setDepth(2001).setVisible(false));
    this.muteLine = this.lines[this.rowDefs.findIndex((r) => r.action === 'mute')];
    this.footer = addText(scene, 240, 250, '点击选项，或按对应按键 · 按住空格观察法阵细目', 7, HEX.brass)
      .setOrigin(0.5, 0.5).setDepth(2001).setVisible(false);
    // 实时诊断：联组次数、断链原因分布、冷却受阻次数
    this.diag = addText(scene, 240, 190, '', 7, HEX.mute, { wordWrap: { width: 230 } })
      .setOrigin(0.5, 0.5).setDepth(2001).setVisible(false);
    for (const item of [...this.lines, this.footer, this.diag]) item.setScrollFactor(0);
    this.draw();
  }

  // 命中：指针换回逻辑坐标后与行矩形比较；-1 表示没点在菜单项上
  hitRow(x, y) {
    return hitRowAt(this.rowDefs, x, y);
  }

  installInput() {
    if (this.pointerDown) return;
    const logical = (pointer) => ({ x: pointer.x / getRenderScale(), y: pointer.y / getRenderScale() });
    this.pointerMove = (pointer) => {
      const { x, y } = logical(pointer);
      const idx = this.hitRow(x, y);
      if (idx !== this.hover) { this.hover = idx; this.draw(); }
    };
    this.pointerDown = (pointer) => {
      const { x, y } = logical(pointer);
      const idx = this.hitRow(x, y);
      if (idx < 0) return;
      const action = this.actions[this.rowDefs[idx].action];
      if (typeof action === 'function') action();
    };
    this.scene.input.on('pointermove', this.pointerMove);
    this.scene.input.on('pointerdown', this.pointerDown);
  }

  removeInput() {
    if (this.pointerMove) this.scene.input.off('pointermove', this.pointerMove);
    if (this.pointerDown) this.scene.input.off('pointerdown', this.pointerDown);
    this.pointerMove = null;
    this.pointerDown = null;
    this.hover = -1;
  }

  draw() {
    const g = this.g;
    g.clear();
    // 全屏压暗：纯色半透明，不是毛玻璃
    pxRect(g, 0, 0, 480, 270, C.void, 0.55);
    // 石质面板
    pxRect(g, 112, 44, 256, 226, C.ink, 0.98);
    pxFrame(g, 111, 43, 258, 228, C.outline, 1, 1);
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
    // 悬停高亮：鼠标移到哪一项，哪一项亮起来，明确“这里能点”
    if (this.visible && this.hover >= 0 && this.rowDefs[this.hover]) {
      const r = this.rowDefs[this.hover];
      pxRect(g, r.x, r.y - r.h / 2, r.w, r.h, C.stone, 0.55);
      pxFrame(g, r.x, r.y - r.h / 2, r.w, r.h, C.brass, 1, 1);
    }
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
    // 音盛行标签随实时状态刷新
    if (this.muteLine) {
      const on = isSoundEnabled();
      this.muteLine.setText('M　　音效 ' + (on ? '开' : '关'));
      this.muteLine.setColor(on ? HEX.parchment : HEX.mute);
    }
    this.installInput();
    this.draw();
  }

  hide() {
    this.removeInput();
    this.visible = false;
    this.g.setVisible(false);
    this.title.setVisible(false);
    this.note.setVisible(false);
    this.footer.setVisible(false);
    this.diag.setVisible(false);
    for (const line of this.lines) line.setVisible(false);
  }
}
