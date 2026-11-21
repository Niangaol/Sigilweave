// 灵宠墨宝 · 新手引导覆盖层（Scene）
// 独立常驻覆盖场景：只监听 guide:show / guide:hide 事件，用 Palette.js 画像素风气泡。
// 不修改战斗逻辑、不改 phase；点击气泡才推进台词，用 DOM 命中测试避免吞掉底层 Phaser 输入。
import Phaser from 'phaser';
import { C, HEX, addText, pxRect, pxFrame, pxPoly, pxDiamond, applyPixelZoom, uiLayerOffset, isPortrait, getRenderScale } from '../ui/Palette.js';
import { GUIDE_EVENT, GUIDE_HIDE_EVENT, GUIDE_ACTIVE_EVENT, GUIDE_DONE_EVENT, guideEnabled, resolveLines } from '../logic/guide.js';

const PET_TEX = 'guide_pet';       // BootScene 里注册的纹理 key
const PET_W = 32, PET_H = 34;      // 素材逻辑尺寸
const DEPTH = 6000;                // 盖住问答(3000)/编辑(3500)/HUD(1000)

export default class GuideScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GuideScene', active: false, visible: false });
  }

  init() {
    this.active = false;
    this.lines = [];
    this.index = 0;
    this.card = null;
    this.ctx = {};
    this.rect = null;
    this.queue = [];
  }

  create() {
    applyPixelZoom(this);
    const offset = uiLayerOffset(this);
    this.root = this.add.container(offset.x, offset.y).setScrollFactor(0).setDepth(DEPTH);
    this.g = this.add.graphics();
    this.root.add(this.g);
    this.texts = [];
    this.pet = null;

    this.showHandler = (payload) => this.show(payload);
    // 被动关闭也广播 done，避免战斗闸门一直挂着（如切场景时 hideGuide）。
    this.hideHandler = () => {
      const had = this.active;
      this.queue.length = 0;
      this.hide();
      if (had) this.game.events.emit(GUIDE_DONE_EVENT);
    };
    this.game.events.on(GUIDE_EVENT, this.showHandler);
    this.game.events.on(GUIDE_HIDE_EVENT, this.hideHandler);

    // DOM 点击命中（与 EncounterPanel 同款：绕开镜头滚动/容器命中的问题）
    this.pointerHandler = (ev) => this.onPointer(ev);
    window.addEventListener('pointerdown', this.pointerHandler);

    this.scene.bringToTop();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(GUIDE_EVENT, this.showHandler);
      this.game.events.off(GUIDE_HIDE_EVENT, this.hideHandler);
      window.removeEventListener('pointerdown', this.pointerHandler);
    });
  }

  show(payload = {}) {
    if (!guideEnabled()) return;
    const card = payload.card;
    if (!card) return;
    const lines = resolveLines(card, { act: payload.act, stage: payload.stage });
    if (!lines.length) return;
    // 正在播放则入队；否则直接播。保证 G05→G06 这类连续引导依次出现。
    if (this.active) {
      this.queue.push({ ...payload, lines });
      return;
    }
    this.startCard({ ...payload, lines });
  }

  startCard(item) {
    this.card = item.card;
    this.ctx = item;
    this.lines = item.lines;
    this.index = 0;
    const wasActive = this.active;
    this.active = true;
    this.scene.setVisible(true);
    this.scene.bringToTop();
    this.render();
    // 从「无引导」进入讲解：广播 active，战斗据此立起冻结闸门。
    if (!wasActive) this.game.events.emit(GUIDE_ACTIVE_EVENT, { id: item.card?.id });
  }

  hide() {
    if (!this.active) return;
    this.active = false;
    this.clearTexts();
    this.g.clear();
    if (this.pet) { this.pet.destroy(); this.pet = null; }
    this.rect = null;
    this.scene.setVisible(false);
  }

  next() {
    if (!this.active) return;
    this.index += 1;
    if (this.index >= this.lines.length) {
      this.hide();
      // 队列里还有下一条就接着播；全部读完才广播 done，战斗据此解冻。
      if (this.queue.length) this.startCard(this.queue.shift());
      else this.game.events.emit(GUIDE_DONE_EVENT);
    } else {
      this.render();
    }
  }

  clearTexts() {
    for (const t of this.texts) t.destroy();
    this.texts = [];
  }

  // 气泡几何：横屏贴底部地图上方，竖屏贴地图视口下缘（≤270），不进触控台
  layout() {
    const portrait = isPortrait();
    const bw = portrait ? 436 : 400;
    const bh = 62;
    const bx = portrait ? 22 : 48;
    const by = portrait ? 196 : 186;
    return { bx, by, bw, bh, portrait };
  }

  toCanvas(ev) {
    if (typeof ev?.clientX !== 'number' || typeof ev?.clientY !== 'number') return null;
    const rect = this.game.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      px: (ev.clientX - rect.left) / rect.width * 480,
      py: (ev.clientY - rect.top) / rect.height * (isPortrait() ? 760 : 270),
    };
  }

  onPointer(ev) {
    if (!this.active || !this.rect) return;
    const p = this.toCanvas(ev);
    if (!p) return;
    const r = this.rect;
    if (p.px >= r.x && p.px <= r.x + r.w && p.py >= r.y && p.py <= r.y + r.h) {
      ev.stopPropagation?.();
      this.next();
    }
  }

  render() {
    this.clearTexts();
    this.g.clear();
    if (this.pet) { this.pet.destroy(); this.pet = null; }

    const { bx, by, bw, bh, portrait } = this.layout();
    const g = this.g;

    pxRect(g, 0, portrait ? 176 : 176, 480, portrait ? 88 : 94, C.void, 0.42);
    this.drawHighlight(g);

    const petX = portrait ? 6 : 8;
    const petY = portrait ? 206 : 198;
    if (this.textures.exists(PET_TEX)) {
      const tex = this.textures.get(PET_TEX);
      if (tex?.setFilter) tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
      this.pet = this.add.image(petX, petY, PET_TEX).setOrigin(0, 0)
        .setScale(getRenderScale()).setScrollFactor(0).setDepth(DEPTH + 1);
      this.root.add(this.pet);
    } else {
      this.drawPetFallback(g, petX, petY);
    }

    // 气泡：深色底 + 双层黄铜硬边 + 像素三角尾巴（点对象数组）
    pxRect(g, bx, by, bw, bh, C.nightDeep, 0.98);
    pxFrame(g, bx, by, bw, bh, C.brass, 1, 1);
    pxFrame(g, bx + 2, by + 2, bw - 4, bh - 4, C.brassDark, 1, 0.65);
    pxPoly(g, [{ x: bx + 12, y: by + bh }, { x: bx + 20, y: by + bh }, { x: bx + 12, y: by + bh + 7 }], C.brassDark, 1, true);
    pxPoly(g, [{ x: bx + 13, y: by + bh }, { x: bx + 19, y: by + bh }, { x: bx + 13, y: by + bh + 5 }], C.nightDeep, 1, true);
    for (const [rx, ry] of [[bx + 2, by + 2], [bx + bw - 4, by + 2], [bx + 2, by + bh - 4], [bx + bw - 4, by + bh - 4]]) {
      pxRect(g, rx, ry, 2, 2, C.brassLight, 0.9);
    }

    pxRect(g, bx + 8, by + 6, 46, 12, C.brassDark, 1);
    this.addLine(bx + 11, by + 7, '墨宝', 8, HEX.brassLight);

    const line = this.lines[this.index] ?? '';
    this.addLine(bx + 10, by + 24, line, 9, HEX.parchment, { wordWrap: { width: bw - 20 }, lineSpacing: 3 });

    const total = this.lines.length;
    const hint = total > 1
      ? `（${this.index + 1}/${total}）点击 / 空格继续 ▸`
      : '点击 / 空格继续 ▸';
    this.addLine(bx + bw - 8, by + bh - 13, hint, 7, HEX.mute, { align: 'right' });

    this.rect = { x: bx, y: by, w: bw, h: bh + 8 };
  }

  addLine(x, y, text, size, color, extra = {}) {
    const t = addText(this, x, y, text, size, color, extra).setScrollFactor(0);
    if (extra.align === 'right') t.setOrigin(1, 0);
    this.root.add(t);
    this.texts.push(t);
    return t;
  }

  drawHighlight(g) {
    const key = this.ctx?.highlight;
    if (!key) return;
    const RECTS = {
      compass: [356, 150, 116, 112], grid: [12, 34, 226, 214],
      header: [10, 4, 460, 30], reward: [244, 30, 226, 60],
      steps: [244, 92, 226, 16], stats: [12, 250, 226, 16],
      oaths: [244, 110, 226, 30], hand: [244, 144, 226, 34],
      runes: [244, 180, 226, 62], depart: [244, 244, 226, 22],
      exitEdit: [244, 216, 226, 18], eventPoint: [200, 100, 80, 70],
      touchControls: [6, 274, 210, 210], 敌人: [180, 90, 120, 90],
    };
    const r = RECTS[key];
    if (!r) return;
    pxFrame(g, r[0] - 2, r[1] - 2, r[2] + 4, r[3] + 4, C.arcaneLight, 1, 0.9);
    pxFrame(g, r[0] - 4, r[1] - 4, r[2] + 8, r[3] + 8, C.teal, 1, 0.55);
    pxDiamond(g, r[0] - 4, r[1] - 4, 2, C.teal, 1, true);
    pxDiamond(g, r[0] + r[2] + 4, r[1] + r[3] + 4, 2, C.teal, 1, true);
  }

  drawPetFallback(g, x, y) {
    const s = 2;
    const px = (dx, dy, w, h, col) => pxRect(g, x + dx * s, y + dy * s, w * s, h * s, col);
    px(6, 2, 4, 2, C.outline); px(5, 4, 6, 6, C.night);
    px(6, 4, 2, 2, C.teal); px(10, 4, 2, 2, C.teal);
    px(8, 6, 1, 1, C.arcane);
    px(6, 10, 6, 5, C.night);
    px(12, 9, 2, 2, C.night); px(13, 7, 2, 3, C.night);
  }
}
