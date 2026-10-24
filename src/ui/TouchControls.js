// 触屏控件：虚拟方向键 + 暂停按钮（手机兼容）。
// 用 DOM touch 事件直接处理（多点触控可靠，Phaser zone 在手指滑出区域时不可靠）；
// 图形画进 uiRoot（scrollFactor=0），战斗场景每帧读 axis，与键盘输入取或。
import {
  C, HEX, addText, pxRect, pxFrame, pxPoly,
  isPortrait, isTouchUI, CONSOLE_TOP, BASE_W, BASE_H, CANVAS_H_PORTRAIT,
} from './Palette.js';

const C_brassText = () => HEX.brassLight;

// 方向键箭头：硬边三角形，像素风
function arrow(g, r, dir, color, alpha) {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const s = Math.min(r.w, r.h) * 0.26;
  const pts = dir === 'up'
    ? [{ x: cx, y: cy - s }, { x: cx + s, y: cy + s * 0.7 }, { x: cx - s, y: cy + s * 0.7 }]
    : dir === 'down'
      ? [{ x: cx, y: cy + s }, { x: cx + s, y: cy - s * 0.7 }, { x: cx - s, y: cy - s * 0.7 }]
      : dir === 'left'
        ? [{ x: cx - s, y: cy }, { x: cx + s * 0.7, y: cy + s }, { x: cx + s * 0.7, y: cy - s }]
        : [{ x: cx + s, y: cy }, { x: cx - s * 0.7, y: cy + s }, { x: cx - s * 0.7, y: cy - s }];
  pxPoly(g, pts, color, alpha);
}

// 暂停图标：两根竖条
function pauseIcon(g, r, color, alpha) {
  const bw = Math.max(4, Math.round(r.w * 0.14));
  const bh = Math.round(r.h * 0.42);
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  pxRect(g, Math.round(cx - bw - 3), Math.round(cy - bh / 2), bw, bh, color, alpha);
  pxRect(g, Math.round(cx + 3), Math.round(cy - bh / 2), bw, bh, color, alpha);
}

export default class TouchControls {
  constructor(scene, { onPause } = {}) {
    this.scene = scene;
    this.onPause = onPause;
    this.axis = { x: 0, y: 0 };
    this.active = new Map();   // touchId -> 'up'|'down'|'left'|'right'
    this.pressed = new Set();
    this.rects = this.layout();

    this.g = scene.add.graphics().setDepth(530).setScrollFactor(0);
    // 屏幕固定元素必须挂 uiRoot（场景根上会被镜头位移甩出屏幕）
    scene.uiRoot?.add(this.g);
    scene.uiRoot?.bringToTop(this.g);

    this.bindDom();
    // 竖屏暂停按钮下方加「菜单」小字，手机上一眼认得
    this.pauseLabel = null;
    if (isPortrait()) {
      const p = this.rects.pause;
      this.pauseLabel = addText(scene, p.x + p.w / 2, p.y + p.h + 6, '菜单', 9, C_brassText())
        .setOrigin(0.5, 0).setScrollFactor(0).setDepth(531);
      scene.uiRoot?.add(this.pauseLabel);
      scene.uiRoot?.bringToTop(this.pauseLabel);
    }
    this.draw();
  }

  layout() {
    if (isPortrait()) {
      // 竖屏：触控台（CONSOLE_TOP 以下），左方向键 + 右侧大暂停按钮
      return {
        up: { x: 78, y: CONSOLE_TOP + 226, w: 64, h: 64 },
        left: { x: 14, y: CONSOLE_TOP + 290, w: 64, h: 64 },
        right: { x: 142, y: CONSOLE_TOP + 290, w: 64, h: 64 },
        down: { x: 78, y: CONSOLE_TOP + 354, w: 64, h: 64 },
        pause: { x: 330, y: CONSOLE_TOP + 262, w: 116, h: 116 },
      };
    }
    // 横屏手机：左下角半透明小键位（罗盘在右下，不重叠）
    return {
      up: { x: 58, y: 142, w: 40, h: 40 },
      left: { x: 14, y: 182, w: 40, h: 40 },
      right: { x: 102, y: 182, w: 40, h: 40 },
      down: { x: 58, y: 222, w: 40, h: 40 },
      pause: { x: 166, y: 196, w: 52, h: 52 },
    };
  }

  bindDom() {
    const canvas = this.scene.game.canvas;
    this.handlers = {
      touchstart: (e) => this.onTouch(e, 'start'),
      touchmove: (e) => this.onTouch(e, 'move'),
      touchend: (e) => this.onTouch(e, 'end'),
      touchcancel: (e) => this.onTouch(e, 'end'),
    };
    for (const [type, fn] of Object.entries(this.handlers)) {
      canvas.addEventListener(type, fn, { passive: true });
    }
  }

  // DOM 坐标 -> 逻辑坐标（竖屏画布是 480×760，横屏 480×270）
  toLogical(t) {
    const rect = this.scene.game.canvas.getBoundingClientRect();
    const lh = isPortrait() ? CANVAS_H_PORTRAIT : BASE_H;
    return {
      x: (t.clientX - rect.left) / rect.width * BASE_W,
      y: (t.clientY - rect.top) / rect.height * lh,
    };
  }

  hit(px, py) {
    for (const [dir, r] of Object.entries(this.rects)) {
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return dir;
    }
    return null;
  }

  onTouch(e, phase) {
    for (const t of e.changedTouches) {
      const id = t.identifier;
      const { x, y } = this.toLogical(t);
      if (phase === 'end') {
        if (this.pauseTouch === id) { this.pauseTouch = null; this.pressed.delete('pause'); }
        this.active.delete(id);
        continue;
      }
      const dir = this.hit(x, y);
      if (dir === 'pause') {
        if (phase === 'start') { this.pressed.add('pause'); this.pauseTouch = id; this.onPause?.(); }
        continue;
      }
      if (dir) this.active.set(id, dir);
      // 滑出区域时保持原方向（粘手），松手才停——手机上更好用
    }
    this.recompute();
    this.draw();
  }

  recompute() {
    let x = 0, y = 0;
    for (const dir of this.active.values()) {
      if (dir === 'left') x -= 1;
      if (dir === 'right') x += 1;
      if (dir === 'up') y -= 1;
      if (dir === 'down') y += 1;
    }
    this.axis.x = Math.max(-1, Math.min(1, x));
    this.axis.y = Math.max(-1, Math.min(1, y));
  }

  draw() {
    const g = this.g;
    g.clear();
    const portrait = isPortrait();
    const baseFill = portrait ? C.nightDeep : C.void;
    const baseAlpha = portrait ? 0.72 : 0.5;
    for (const [dir, r] of Object.entries(this.rects)) {
      if (dir === 'pause') continue;
      const down = this.pressed.has(dir) || [...this.active.values()].includes(dir);
      pxRect(g, r.x, r.y, r.w, r.h, down ? C.stone : baseFill, down ? 0.8 : baseAlpha);
      pxFrame(g, r.x, r.y, r.w, r.h, down ? C.brassLight : C.brassDark, 1, down ? 0.95 : 0.75);
      arrow(g, r, dir, down ? C.white : C.parchment, down ? 0.95 : 0.7);
    }
    const p = this.rects.pause;
    const pauseDown = this.pressed.has('pause');
    pxRect(g, p.x, p.y, p.w, p.h, pauseDown ? C.stone : baseFill, pauseDown ? 0.85 : baseAlpha);
    pxFrame(g, p.x, p.y, p.w, p.h, pauseDown ? C.brassLight : C.brass, 1, 0.9);
    pauseIcon(g, p, pauseDown ? C.white : C.parchment, 0.92);
  }

  destroy() {
    const canvas = this.scene.game.canvas;
    for (const [type, fn] of Object.entries(this.handlers ?? {})) canvas.removeEventListener(type, fn);
    this.g.destroy(true);
    this.labelG?.destroy(true);
    this.pauseLabel?.destroy(true);
  }
}
