// 问答覆盖层：纯视觉（graphics+text）。交互由场景级 pointerdown 命中测试处理，
// 避免 Phaser 容器/scrollFactor/镜头滚动下的输入命中怪癖。
import { C, HEX, addText, pxRect, pxFrame, pxDiamond } from './Palette.js';

export default class EncounterPanel {
  constructor(scene, onSelect, onConfirm, onContinue) {
    this.scene = scene; this.onSelect = onSelect; this.onConfirm = onConfirm; this.onContinue = onContinue;
    this.view = scene.add.container(0, 0).setDepth(3000).setVisible(false).setScrollFactor(0);
    this.rects = [];   // 画布坐标命中区（每次 show 重建）
    this.current = null;
  }
  text(x, y, message, size = 9, color = HEX.parchment, extra = {}) {
    const text = addText(this.scene, x, y, message, size, color, extra); this.view.add(text); return text;
  }
  // 只画视觉并记录命中区；真正的点击由场景 pointerdown 统一分发
  drawButton(x, y, w, h, message, rect, color = HEX.parchment, selected = false) {
    const g = this.scene.add.graphics(); this.view.add(g);
    pxRect(g, x, y, w, h, selected ? C.stone : C.nightDeep); pxFrame(g, x, y, w, h, selected ? C.teal : C.brassDark);
    this.text(x + 8, y + h / 2, message, 9).setOrigin(0, 0.5);
    if (rect) this.rects.push({ ...rect, x, y, w, h });
  }
  show(active, note = '') {
    this.current = active; this.rects = []; this.view.removeAll(true); this.view.setVisible(true);
    const g = this.scene.add.graphics(); this.view.add(g);
    pxRect(g, 0, 0, 480, 270, C.void, 0.76);
    pxRect(g, 18, 22, 444, 234, C.ink); pxFrame(g, 18, 22, 444, 234, C.brass, 1, 1);
    pxDiamond(g, 40, 43, 8, active.type === 'boss' ? C.blood : C.teal, 1, false);
    this.text(58, 32, active.name + ' · ' + active.title, 12, HEX.brassLight, { wordWrap: { width: 388 } });
    if (active.phase === 'question') {
      this.text(30, 55, active.type === 'boss' ? '答对：直接消灭Boss＋奖励  /  答错：进入Boss战' : '答对：碎片＋治疗  /  答错：短时迟滞诅咒', 8, HEX.mute);
      this.text(30, 74, '线索：' + active.clues.map(c => c.text).join(' '), 9, HEX.teal, { wordWrap: { width: 416 }, lineSpacing: 2 });
      this.text(30, 119, active.question, 10, HEX.parchment, { wordWrap: { width: 416 } });
      active.choices.forEach((choice, i) => this.drawButton(30, 146 + i * 23, 420, 20,
        (i + 1) + '. ' + choice.label, { kind: 'choice', id: choice.id }, choice.id === active.selectedChoiceId));
      this.text(30, 232, note || '先选答案，再确认；读题不限时，战斗已冻结。', 8, HEX.mute, { wordWrap: { width: 292 } });
      this.drawButton(342, 228, 108, 20, '确认作答', { kind: 'confirm' }, !!active.selectedChoiceId);
    } else {
      const result = active.result;
      this.text(32, 78, result.correct ? '破局成功' : '破局失败', 18, result.correct ? HEX.teal : HEX.blood);
      this.text(32, 111, result.text, 11, HEX.parchment, { wordWrap: { width: 412 }, lineSpacing: 4 });
      this.text(32, 155, '解析：' + result.explanation, 9, HEX.mute, { wordWrap: { width: 412 }, lineSpacing: 3 });
      this.drawButton(288, 225, 162, 22, result.action === 'bossBattle' ? '准备战斗' : '继续前进', { kind: 'continue' }, true);
    }
  }
  // 画布坐标命中测试：返回命中的回调动作或 null
  hitTest(px, py) {
    for (const r of this.rects) {
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) {
        if (r.kind === 'choice') return () => this.onSelect(r.id);
        if (r.kind === 'confirm') return () => this.onConfirm();
        return () => this.onContinue();
      }
    }
    return null;
  }
  hide() { this.current = null; this.rects = []; this.view.removeAll(true); this.view.setVisible(false); }
  destroy() { this.view.destroy(true); }
}
