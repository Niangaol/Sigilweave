// 问答覆盖层：纯视觉（graphics+text）。交互由场景级 pointerdown 命中测试处理，
// 避免 Phaser 容器/scrollFactor/镜头滚动下的输入命中怪癖。
// 按钮有完整鼠标状态：普通 / 悬停 / 按下 / 已选中 / 禁用，指针移到可点上会变手型。
import { C, HEX, addText, pxRect, pxFrame, pxDiamond } from './Palette.js';

export default class EncounterPanel {
  constructor(scene, onSelect, onConfirm, onContinue) {
    this.scene = scene; this.onSelect = onSelect; this.onConfirm = onConfirm; this.onContinue = onContinue;
    this.view = scene.add.container(0, 0).setDepth(3000).setVisible(false).setScrollFactor(0);
    this.rects = [];   // 画布坐标命中区（每次 show 重建）
    this.current = null;
    // 悬停/按下画在独立图层：只在键位变化时重画，不动整页文字
    this.hoverG = scene.add.graphics().setDepth(3001).setVisible(false).setScrollFactor(0);
    this.hoverKey = null;
    this.moveHandler = (ev) => this.onPointerMove(ev);
    window.addEventListener('pointermove', this.moveHandler);
  }

  text(x, y, message, size = 9, color = HEX.parchment, extra = {}) {
    const text = addText(this.scene, x, y, message, size, color, extra); this.view.add(text); return text;
  }

  // DOM 事件 -> 画布逻辑坐标；Phaser Pointer 没有 clientX，返回 null 让调用方跳过
  toCanvas(ev) {
    if (typeof ev?.clientX !== 'number' || typeof ev?.clientY !== 'number') return null;
    const rect = this.scene.game.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      px: (ev.clientX - rect.left) / rect.width * 480,
      py: (ev.clientY - rect.top) / rect.height * 270,
    };
  }

  setCursor(style) {
    const canvas = this.scene.game.canvas;
    if (canvas && canvas.style.cursor !== style) canvas.style.cursor = style;
  }

  rectAt(px, py) {
    return this.rects.find(r => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) ?? null;
  }

  // 确认按钮在未选答案时是禁用态：仍可点击（给出提示），但视觉明确表示不可用
  isDisabled(r) {
    return r?.kind === 'confirm' && this.current?.phase === 'question' && !this.current?.selectedChoiceId;
  }

  keyOf(r) { return r ? (r.kind + ':' + (r.id ?? '')) : null; }

  onPointerMove(ev) {
    if (!this.view.visible) { this.setCursor(''); this.clearOverlay(); return; }
    const pos = this.toCanvas(ev);
    if (!pos) return;
    const r = this.rectAt(pos.px, pos.py);
    const key = this.keyOf(r);
    if (key !== this.hoverKey) {
      this.hoverKey = key;
      this.drawOverlay(r);
    }
    this.setCursor(r ? (this.isDisabled(r) ? 'not-allowed' : 'pointer') : '');
  }

  drawOverlay(r) {
    const g = this.hoverG;
    g.clear();
    if (!r) return;
    const disabled = this.isDisabled(r);
    pxRect(g, r.x, r.y, r.w, r.h, disabled ? C.stoneLight : C.stone, disabled ? 0.14 : 0.38);
    pxFrame(g, r.x, r.y, r.w, r.h, disabled ? C.stoneLight : C.brassLight, 1, 0.85);
  }

  // 按下瞬间的高亮：确认/继续会立刻翻页，选中会重绘，这层主要是给“点了没反应”的分支反馈
  pressAt(px, py) {
    const r = this.rectAt(px, py);
    if (!r) return;
    const g = this.hoverG;
    g.clear();
    const disabled = this.isDisabled(r);
    pxRect(g, r.x + 1, r.y + 1, r.w - 2, r.h - 2, disabled ? C.stoneLight : C.teal, disabled ? 0.18 : 0.22);
    pxFrame(g, r.x, r.y, r.w, r.h, disabled ? C.stoneLight : C.teal, 2, 0.9);
  }

  clearOverlay() {
    this.hoverG.clear();
    this.hoverKey = null;
  }

  // state: normal / selected / disabled
  drawButton(x, y, w, h, message, rect, opts = {}) {
    const state = opts.state ?? 'normal';
    const g = this.scene.add.graphics(); this.view.add(g);
    if (state === 'selected') {
      pxRect(g, x, y, w, h, C.stone);
      pxFrame(g, x, y, w, h, C.teal);
      pxRect(g, x + 1, y + 1, w - 2, 1, C.teal, 0.35);
    } else if (state === 'disabled') {
      pxRect(g, x, y, w, h, C.nightDeep);
      pxFrame(g, x, y, w, h, C.stoneLight, 1, 0.55);
    } else {
      pxRect(g, x, y, w, h, C.nightDeep);
      pxFrame(g, x, y, w, h, C.brassDark);
    }
    if (state === 'selected') {
      pxDiamond(g, x + 10, y + h / 2, 3, C.teal, 1, true);
    }
    const color = state === 'selected' ? HEX.white : state === 'disabled' ? HEX.mute : HEX.parchment;
    this.text(x + (state === 'selected' ? 18 : 8), y + h / 2, message, 9, color).setOrigin(0, 0.5);
    if (rect) this.rects.push({ ...rect, x, y, w, h, disabled: state === 'disabled' });
  }

  show(active, note = '') {
    this.current = active; this.rects = []; this.view.removeAll(true); this.view.setVisible(true);
    this.clearOverlay(); this.setCursor('');
    const g = this.scene.add.graphics(); this.view.add(g);
    pxRect(g, 0, 0, 480, 270, C.void, 0.76);
    pxRect(g, 18, 22, 444, 234, C.ink); pxFrame(g, 18, 22, 444, 234, C.brass, 1, 1);
    pxFrame(g, 21, 25, 438, 228, C.brassDark, 1, 0.4);
    pxDiamond(g, 40, 43, 8, active.type === 'boss' ? C.blood : C.teal, 1, false);
    this.text(58, 32, active.name + ' · ' + active.title, 12, HEX.brassLight, { wordWrap: { width: 388 } });
    if (active.phase === 'question') {
      this.text(30, 55, active.type === 'boss' ? '答对：直接消灭Boss＋奖励  /  答错：进入Boss战' : '答对：碎片＋治疗  /  答错：短时迟滞诅咒', 8, HEX.mute);
      this.text(30, 74, '线索：' + active.clues.map(c => c.text).join(' '), 9, HEX.teal, { wordWrap: { width: 416 }, lineSpacing: 2 });
      this.text(30, 119, active.question, 10, HEX.parchment, { wordWrap: { width: 416 } });
      active.choices.forEach((choice, i) => this.drawButton(30, 146 + i * 23, 420, 20,
        (i + 1) + '. ' + choice.label, { kind: 'choice', id: choice.id },
        { state: choice.id === active.selectedChoiceId ? 'selected' : 'normal' }));
      this.text(30, 232, note || '先选答案，再确认；读题不限时，战斗已冻结。', 8, HEX.mute, { wordWrap: { width: 292 } });
      this.drawButton(342, 228, 108, 20, '确认作答', { kind: 'confirm' },
        { state: active.selectedChoiceId ? 'normal' : 'disabled' });
    } else {
      const result = active.result;
      this.text(32, 78, result.correct ? '破局成功' : '破局失败', 18, result.correct ? HEX.teal : HEX.blood);
      this.text(32, 111, result.text, 11, HEX.parchment, { wordWrap: { width: 412 }, lineSpacing: 4 });
      this.text(32, 155, '解析：' + result.explanation, 9, HEX.mute, { wordWrap: { width: 412 }, lineSpacing: 3 });
      this.drawButton(288, 225, 162, 22, result.action === 'bossBattle' ? '准备战斗' : '继续前进', { kind: 'continue' }, { state: 'normal' });
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

  hide() {
    this.current = null; this.rects = []; this.view.removeAll(true); this.view.setVisible(false);
    this.clearOverlay(); this.setCursor('');
  }

  destroy() {
    window.removeEventListener('pointermove', this.moveHandler);
    this.hoverG.destroy(true);
    this.view.destroy(true);
  }
}
