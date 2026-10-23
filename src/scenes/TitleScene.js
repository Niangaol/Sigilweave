// 标题页：像素祭坛、旋转符环、操作说明；Enter/空格/点击开始
import Phaser from 'phaser';
import { C, HEX, addText, pxRect, pxFrame, pxLine, pxDiamond } from '../ui/Palette.js';

export default class TitleScene extends Phaser.Scene {
  constructor() {
    super('TitleScene');
  }

  create() {
    // 调试直达：?scene=battle / ?scene=gameover
    const params = new URLSearchParams(window.location.search);
    const jump = params.get('scene');
    if (jump === 'battle') {
      this.scene.start('BattleScene');
      return;
    }
    if (jump === 'gameover') {
      this.scene.start('GameOverScene', {
        elapsedMs: 143000, act: 1, hp: 0, kills: 27, shards: 19,
        triggers: 61, combos: 3, blocked: 4, reroutes: 1, dissipations: 2,
        peakRate: 0.8, cells: 6,
      });
      return;
    }

    this.started = false;
    this.lastRingStep = -1;
    this.ringStep = 0;
    this.cameras.main.fadeIn(220, 0, 0, 0);

    this.drawBackdrop();
    this.embers = this.buildEmbers();
    this.emberG = this.add.graphics().setDepth(1);
    this.ringG = this.add.graphics().setDepth(2);

    // 标题：像素衬线体 + 硬阴影
    addText(this, 240, 30, '共振法阵', 34, HEX.parchment, {
      stroke: '#0d0a17',
      strokeThickness: 3,
      letterSpacing: 5,
      shadow: { offsetX: 2, offsetY: 2, color: '#0d0a17', blur: 0, fill: true },
    }).setOrigin(0.5, 0).setDepth(10);
    addText(this, 240, 74, 'R E S O N A N C E   S I G I L', 8, HEX.brass, {
      letterSpacing: 2,
    }).setOrigin(0.5, 0).setDepth(10);

    // 标题下的黄铜横线
    const rule = this.add.graphics().setDepth(9);
    pxRect(rule, 74, 94, 332, 1, C.brassDark, 0.9);
    pxRect(rule, 74, 95, 332, 1, C.ink, 0.6);
    pxDiamond(rule, 240, 94, 3, C.brass, 0.9, true);
    pxDiamond(rule, 74, 94, 2, C.brass, 0.7, true);
    pxDiamond(rule, 406, 94, 2, C.brass, 0.7, true);

    this.prompt = addText(this, 240, 201, '按 Enter / 空格 开始', 10, HEX.arcaneLight)
      .setOrigin(0.5, 0).setDepth(10);
    addText(this, 240, 220, 'WASD / 方向键 走位　·　按住空格 暂停观察　·　Esc 暂停菜单', 8, HEX.mute)
      .setOrigin(0.5, 0).setDepth(10);
    addText(this, 240, 248, '沿途问答 · 幕间构筑 · 识破契约，或迎战首领', 7, HEX.brassDark)
      .setOrigin(0.5, 0).setDepth(10);

    // 输入：三种方式都能开始
    this.input.keyboard.on('keydown-ENTER', this.begin, this);
    this.input.keyboard.on('keydown-SPACE', this.begin, this);
    this.input.on('pointerdown', this.begin, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard.off('keydown-ENTER', this.begin, this);
      this.input.keyboard.off('keydown-SPACE', this.begin, this);
      this.input.off('pointerdown', this.begin, this);
    });

    this.drawRing(0);
  }

  begin() {
    if (this.started) return;
    this.started = true;
    this.cameras.main.fadeOut(180, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('BattleScene'));
  }

  buildEmbers() {
    const rng = (() => {
      let s = 0x2f61;
      return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
      };
    })();
    const list = [];
    for (let i = 0; i < 26; i++) {
      list.push({
        x: 20 + rng() * 440,
        y: rng() * 270,
        speed: 3 + rng() * 7,
        size: rng() > 0.82 ? 2 : 1,
        phase: rng() * Math.PI * 2,
      });
    }
    return list;
  }

  drawBackdrop() {
    const g = this.add.graphics().setDepth(0);
    pxRect(g, 0, 0, 480, 270, C.nightDeep, 1);
    // 三层硬边地面色带
    pxRect(g, 0, 196, 480, 34, C.nightSoft, 1);
    pxRect(g, 0, 230, 480, 40, C.night, 1);
    pxRect(g, 0, 196, 480, 1, C.stoneDark, 1);
    pxRect(g, 0, 230, 480, 1, C.stoneDark, 0.8);

    // 远景三座尖拱
    this.drawArch(g, 240, 170, 96, 196, C.nightSoft, C.stoneDark);
    this.drawArch(g, 86, 96, 120, 196, C.nightDeep, C.stoneDark);
    this.drawArch(g, 394, 96, 120, 196, C.nightDeep, C.stoneDark);

    // 月亮：阶梯状像素圆盘
    const mx = 402, my = 42;
    for (let r = 16; r >= 1; r -= 4) {
      pxRect(g, mx - r, my - Math.round(r * 0.72), r * 2, Math.round(r * 1.44), C.parchment, r > 8 ? 0.1 : 0.16);
    }
    pxRect(g, mx - 12, my - 8, 24, 16, C.parchment, 0.07);

    // 两侧石柱
    for (const x of [0, 456]) {
      pxRect(g, x, 96, 24, 140, C.stoneDark, 1);
      pxRect(g, x + 3, 96, 1, 140, C.groove, 0.25);
      pxRect(g, x + 9, 96, 1, 140, C.nightDeep, 0.9);
      pxRect(g, x + 18, 96, 6, 140, C.nightDeep, 0.8);
      pxRect(g, x - 2, 90, 28, 6, C.stone, 1);
      pxRect(g, x - 2, 230, 28, 6, C.stone, 1);
    }

    // 地面刻线：向中心汇聚的符阵暗示
    pxLine(g, 40, 268, 206, 214, C.groove, 0.18, 1);
    pxLine(g, 440, 268, 274, 214, C.groove, 0.18, 1);
    pxLine(g, 90, 268, 214, 228, C.groove, 0.12, 1);
    pxLine(g, 390, 268, 266, 228, C.groove, 0.12, 1);
    for (let x = 30; x < 460; x += 38) {
      pxRect(g, x, 244 + (x % 3), 2, 1, C.groove, 0.3);
    }

    // 烛台
    for (const [x, y] of [[52, 210], [428, 210]]) {
      pxRect(g, x - 1, y - 10, 3, 10, C.parchment, 1);
      pxRect(g, x - 3, y, 7, 2, C.brassDark, 1);
      pxRect(g, x - 4, y + 2, 9, 1, C.nightDeep, 0.8);
      pxRect(g, x, y - 14, 1, 4, C.arcane, 0.9);
      pxRect(g, x - 1, y - 12, 3, 3, C.arcane, 0.35);
      pxRect(g, x, y - 15, 1, 1, C.arcaneLight, 1);
    }
  }

  drawArch(g, cx, baseW, topY, bottomY, fill, edge) {
    const layers = 8;
    for (let i = 0; i < layers; i++) {
      const w = Math.round(baseW * (0.4 + (i / layers) * 0.6));
      const y = topY + i * 5;
      if (y > bottomY) break;
      pxRect(g, cx - w / 2, y, w, 5, fill, 1);
      pxRect(g, cx - w / 2, y, 1, 5, edge, 0.8);
      pxRect(g, cx + w / 2 - 1, y, 1, 5, edge, 0.8);
    }
    pxRect(g, cx - Math.round(baseW * 0.2), topY + 28, Math.round(baseW * 0.4), bottomY - topY - 28, C.ink, 0.85);
    pxRect(g, cx - 1, topY + 28, 2, bottomY - topY - 28, edge, 0.8);
    pxRect(g, cx - Math.round(baseW * 0.2) + 4, topY + 34, 1, bottomY - topY - 40, C.groove, 0.25);
    pxRect(g, cx + Math.round(baseW * 0.2) - 5, topY + 34, 1, bottomY - topY - 40, C.groove, 0.25);
  }

  drawRing(step) {
    const g = this.ringG;
    g.clear();
    const cx = 240;
    const cy = 140;
    const rot = step * ((Math.PI * 2) / 96);
    const rot2 = -step * ((Math.PI * 2) / 128);

    const poly = (rad, phase, count = 16) => {
      const out = [];
      for (let i = 0; i < count; i++) {
        const a = phase + (i / count) * Math.PI * 2;
        out.push({ x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad * 0.86 });
      }
      return out;
    };

    const drawPoly = (pts, color, alpha, width = 1) => {
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const q = pts[(i + 1) % pts.length];
        pxLine(g, p.x, p.y, q.x, q.y, color, alpha, width);
      }
    };

    drawPoly(poly(54, rot), C.groove, 0.5);
    drawPoly(poly(48, rot), C.brass, 0.28);
    drawPoly(poly(38, rot2), C.groove, 0.32);
    drawPoly(poly(30, rot2), C.brassDark, 0.35);

    // 八根辐条与菱形端点
    for (let i = 0; i < 8; i++) {
      const a = rot * 2 + (i / 8) * Math.PI * 2;
      const x1 = cx + Math.cos(a) * 18;
      const y1 = cy + Math.sin(a) * 18 * 0.86;
      const x2 = cx + Math.cos(a) * 50;
      const y2 = cy + Math.sin(a) * 50 * 0.86;
      pxLine(g, x1, y1, x2, y2, C.brass, 0.4, 1);
      pxDiamond(g, x2, y2, 3, C.arcane, 0.55, true);
      pxDiamond(g, x2, y2, 1, C.arcaneLight, 0.9, true);
    }

    // 中心符印：两层菱形与四点
    pxDiamond(g, cx, cy, 9, C.brass, 0.6, false);
    pxDiamond(g, cx, cy, 5, C.arcane, 0.35, false);
    pxDiamond(g, cx, cy, 2, C.arcaneLight, 0.8, true);
    for (let i = 0; i < 4; i++) {
      const a = rot * 3 + (i / 4) * Math.PI * 2;
      pxRect(g, Math.round(cx + Math.cos(a) * 22), Math.round(cy + Math.sin(a) * 22 * 0.86), 1, 1, C.parchment, 0.5);
    }
  }

  update(time) {
    const step = Math.floor(time / 90);
    if (step !== this.lastRingStep) {
      this.lastRingStep = step;
      this.drawRing(step);
    }

    // 火星：匀速上升，超出画面就回到下方
    const g = this.emberG;
    g.clear();
    for (const e of this.embers) {
      const y = ((e.y - time * e.speed * 0.001) % 270 + 270) % 270;
      const x = Math.round(e.x + Math.sin(time * 0.001 + e.phase) * 3);
      pxRect(g, x, Math.round(y), e.size, e.size, C.arcane, 0.18 + (e.size === 2 ? 0.16 : 0.08));
    }
    if (this.prompt) {
      this.prompt.setAlpha(Math.floor(time / 480) % 2 === 0 ? 1 : 0.4);
    }
  }
}
