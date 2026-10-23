// 战场背景：整屏铺满的地图底，全部程序化像素绘制，无外部图片、无平滑渐变
import { C, pxRect, pxLine } from './Palette.js';

const HUD_H = 20;
const BATTLE_BOTTOM = 270;

// 固定种子的噪点，保证每次打开画面一致
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export default class Background {
  constructor(scene) {
    this.scene = scene;
    this.staticG = scene.add.graphics().setDepth(-100);
    this.flickerG = scene.add.graphics().setDepth(-90);
    this.candles = [
      { x: 46, y: 246, phase: 0 },
      { x: 108, y: 246, phase: 1 },
      { x: 206, y: 60, phase: 2 },
      { x: 300, y: 60, phase: 0 },
    ];
    this.lastFlickerStep = -1;
    this.drawStatic();
  }

  // 哥特拱窗：用逐层收窄的矩形叠出尖拱，硬边像素
  drawArch(g, cx, baseW, topY, bottomY) {
    const layers = 9;
    const stepH = 4;
    for (let i = 0; i < layers; i++) {
      const w = Math.round(baseW * (0.38 + (i / layers) * 0.62));
      const y = topY + i * stepH;
      if (y > bottomY) break;
      pxRect(g, cx - w / 2, y, w, stepH, C.nightSoft, 1);
      pxRect(g, cx - w / 2, y, 1, stepH, C.stoneDark, 0.9);
      pxRect(g, cx + w / 2 - 1, y, 1, stepH, C.stoneDark, 0.9);
    }
    const innerW = Math.round(baseW * 0.42);
    pxRect(g, cx - innerW / 2, topY + 28, innerW, bottomY - topY - 28, C.nightDeep, 1);
    pxRect(g, cx - 1, topY + 28, 2, bottomY - topY - 28, C.stoneDark, 1);
    pxRect(g, cx - innerW / 2 + 2, topY + 32, 1, bottomY - topY - 34, C.groove, 0.22);
    pxRect(g, cx + innerW / 2 - 3, topY + 32, 1, bottomY - topY - 34, C.groove, 0.22);
  }

  drawStatic() {
    const g = this.staticG;
    g.clear();

    // 整屏地图：三档硬边色带，远暗近亮
    pxRect(g, 0, 0, 480, 92, C.nightDeep, 1);
    pxRect(g, 0, 92, 480, 86, C.nightSoft, 1);
    pxRect(g, 0, 178, 480, 92, 0x221b36, 1);

    // 远景拱窗
    this.drawArch(g, 240, 132, HUD_H, 150);
    this.drawArch(g, 96, 92, HUD_H + 12, 132);
    this.drawArch(g, 384, 92, HUD_H + 12, 132);

    // 侧柱：撑住整屏
    for (const x of [10, 456]) {
      pxRect(g, x, HUD_H, 14, BATTLE_BOTTOM - HUD_H, C.stoneDark, 1);
      pxRect(g, x + 2, HUD_H, 1, BATTLE_BOTTOM - HUD_H, C.nightDeep, 1);
      pxRect(g, x + 5, HUD_H, 1, BATTLE_BOTTOM - HUD_H, C.groove, 0.26);
      pxRect(g, x + 11, HUD_H, 1, BATTLE_BOTTOM - HUD_H, C.nightDeep, 1);
      pxRect(g, x - 2, HUD_H, 18, 3, C.stone, 1);
      pxRect(g, x - 2, 258, 18, 4, C.stone, 1);
      pxRect(g, x - 2, 261, 18, 1, C.groove, 0.3);
    }

    // 地面碎石与刻痕：固定种子
    const rng = makeRng(0x5b1a);
    for (let i = 0; i < 190; i++) {
      const x = Math.floor(rng() * 480);
      const y = 26 + Math.floor(rng() * (BATTLE_BOTTOM - 30));
      if (x > 220 && x < 262 && y > 96 && y < 150) continue; // 给玩家留出干净区域
      if (x > 328 && y > 168) continue; // 右下角留给法阵小窗
      const w = rng() > 0.75 ? 2 : 1;
      const color = rng() > 0.5 ? C.stoneDark : C.groove;
      pxRect(g, x, y, w, 1, color, 0.32 + rng() * 0.3);
    }

    // 地裂
    pxLine(g, 22, 214, 70, 200, C.nightDeep, 0.8, 1);
    pxLine(g, 70, 200, 92, 206, C.nightDeep, 0.8, 1);
    pxLine(g, 286, 236, 330, 222, C.nightDeep, 0.8, 1);
    pxLine(g, 160, 120, 196, 112, C.nightDeep, 0.7, 1);

    // 地图上的几处烛台座（火焰在 flickerG 里逐帧画）
    for (const c of this.candles) {
      pxRect(g, c.x - 2, c.y, 5, 2, C.stoneDark, 1);
      pxRect(g, c.x, c.y - 6, 1, 6, C.parchment, 1);
      pxRect(g, c.x - 1, c.y + 1, 3, 2, C.brassDark, 1);
      pxRect(g, c.x - 3, c.y + 2, 7, 1, C.nightDeep, 0.9);
    }
  }

  update(time) {
    const step = Math.floor(time / 130);
    if (step === this.lastFlickerStep) return;
    this.lastFlickerStep = step;
    const g = this.flickerG;
    g.clear();
    for (let i = 0; i < this.candles.length; i++) {
      const c = this.candles[i];
      const f = (step + c.phase) % 3;
      const h = 2 + (f === 0 ? 1 : 0);
      const x = c.x;
      const y = c.y - 7;
      pxRect(g, x, y - h, 1, h + 1, C.arcane, 0.9);
      pxRect(g, x - 1, y - 1, 3, 2, C.arcane, 0.7);
      pxRect(g, x, y - h - 1, 1, 1, C.arcaneLight, 1);
      pxRect(g, x - 2, y + 1, 5, 1, C.arcane, 0.08);
    }
  }
}
