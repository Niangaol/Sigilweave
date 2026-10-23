// 问答覆盖层：没有自己的战斗计时器，只通过按钮回调状态机。
import { C, HEX, addText, pxRect, pxFrame, pxDiamond } from './Palette.js';

export default class EncounterPanel {
  constructor(scene, onSelect, onConfirm, onContinue) {
    this.scene = scene; this.onSelect = onSelect; this.onConfirm = onConfirm; this.onContinue = onContinue;
    this.view = scene.add.container(0, 0).setDepth(3000).setVisible(false);
    this.current = null;
  }
  text(x, y, message, size = 9, color = HEX.parchment, extra = {}) {
    const text = addText(this.scene, x, y, message, size, color, extra); this.view.add(text); return text;
  }
  button(x, y, w, h, message, callback, selected = false) {
    const g = this.scene.add.graphics(); this.view.add(g);
    pxRect(g, x, y, w, h, selected ? C.stone : C.nightDeep); pxFrame(g, x, y, w, h, selected ? C.teal : C.brassDark);
    this.text(x + 8, y + h / 2, message, 9).setOrigin(0, 0.5);
    const zone = this.scene.add.zone(x, y, w, h).setOrigin(0).setInteractive({ useHandCursor: true }); this.view.add(zone);
    zone.on('pointerdown', callback);
  }
  show(active, note = '') {
    this.current = active; this.view.removeAll(true); this.view.setVisible(true);
    const g = this.scene.add.graphics(); this.view.add(g);
    pxRect(g, 0, 0, 480, 270, C.void, 0.76);
    // 覆盖层阻止点击穿透，右下罗盘仍保留于背景而不是重新切成分屏。
    const blocker = this.scene.add.zone(0, 0, 480, 270).setOrigin(0).setInteractive(); this.view.add(blocker);
    pxRect(g, 18, 22, 444, 234, C.ink); pxFrame(g, 18, 22, 444, 234, C.brass, 1);
    pxDiamond(g, 40, 43, 8, active.type === 'boss' ? C.blood : C.teal, 1, false);
    this.text(58, 32, active.name + ' · ' + active.title, 12, HEX.brassLight, { wordWrap: { width: 388 } });
    if (active.phase === 'question') {
      this.text(30, 55, active.type === 'boss' ? '答对：直接消灭Boss＋奖励  /  答错：进入Boss战' : '答对：碎片＋治疗  /  答错：短时迟滞诅咒', 8, HEX.mute);
      this.text(30, 74, '线索：' + active.clues.map(c => c.text).join(' '), 9, HEX.teal, { wordWrap: { width: 416 }, lineSpacing: 2 });
      this.text(30, 119, active.question, 10, HEX.parchment, { wordWrap: { width: 416 } });
      active.choices.forEach((choice, i) => this.button(30, 146 + i * 23, 420, 20,
        (i + 1) + '. ' + choice.label, () => this.onSelect(choice.id), choice.id === active.selectedChoiceId));
      this.text(30, 232, note || '先选答案，再确认；读题不限时，战斗已冻结。', 8, HEX.mute, { wordWrap: { width: 292 } });
      this.button(342, 228, 108, 20, '确认作答', () => this.onConfirm(), !!active.selectedChoiceId);
    } else {
      const result = active.result;
      this.text(32, 78, result.correct ? '破局成功' : '破局失败', 18, result.correct ? HEX.teal : HEX.blood);
      this.text(32, 111, result.text, 11, HEX.parchment, { wordWrap: { width: 412 }, lineSpacing: 4 });
      this.text(32, 155, '解析：' + result.explanation, 9, HEX.mute, { wordWrap: { width: 412 }, lineSpacing: 3 });
      this.button(288, 225, 162, 22, result.action === 'bossBattle' ? '准备战斗' : '继续前进', () => this.onContinue(), true);
    }
  }
  hide() { this.current = null; this.view.removeAll(true); this.view.setVisible(false); }
  destroy() { this.view.destroy(true); }
}
