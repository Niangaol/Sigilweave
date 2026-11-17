import { describe, it, expect } from 'vitest';
import Player from '../src/entities/Player.js';
import { KIT_STYLES, kitStyle } from '../src/ui/kit-style.js';
import { C } from '../src/ui/Palette.js';

// 记录每一次 pxRect 的颜色与位置，用来断言职业配件真的画出来了。
function fakeGraphics() {
  return {
    rects: [],
    color: null,
    alpha: 1,
    fillStyle(color, alpha = 1) { this.color = color; this.alpha = alpha; },
    fillRect(x, y, w, h) { this.rects.push({ x, y, w, h, color: this.color, alpha: this.alpha }); },
    clear() { this.rects.length = 0; },
    setDepth() { return this; },
    setAlpha() { return this; },
    destroy() {},
  };
}

function fakeScene(kitId) {
  const g = fakeGraphics();
  return {
    g,
    run: kitId === undefined ? {} : { kitId },
    engine: { now: 0 },
    add: { graphics: () => g },
    textures: { exists: () => false },
    addHostileShot() {},
  };
}

function makePlayer(kitId) {
  const scene = fakeScene(kitId);
  const p = new Player(scene, 100, 100);
  p.draw(0);
  return { p, scene, g: scene.g };
}

const colorsOf = (g, color) => g.rects.filter((r) => r.color === color);

describe('三职业人物小配件', () => {
  it('三套职业都画出自己的披风色与主色', () => {
    for (const [kitId, style] of Object.entries(KIT_STYLES)) {
      const { g } = makePlayer(kitId);
      expect(colorsOf(g, style.cape).length).toBeGreaterThan(0);
      expect(colorsOf(g, style.accent).length).toBeGreaterThan(0);
      // 基线人物（无职业）不应有披风块（背向侧 2×6），法杖尖端回落到默认青色
      const baseline = makePlayer(undefined).g;
      expect(baseline.rects.some((r) => r.w === 2 && r.h === 4 && r.x === 95)).toBe(false);
      const tip = baseline.rects.find((r) => r.x === 106 && r.y === 85 && r.w === 1 && r.h === 1);
      expect(tip?.color).toBe(C.teal);
    }
  });

  it('法杖尖端按职业换色', () => {
    for (const [kitId, style] of Object.entries(KIT_STYLES)) {
      const { p, g } = makePlayer(kitId);
      p.facing = 1;
      p.moving = false;
      p.draw(0);
      const tip = g.rects.find((r) => r.x === 106 && r.y === 85 && r.w === 1 && r.h === 1);
      expect(tip?.color).toBe(style.accentLight);
    }
  });

  it('披风始终拖在背向侧：朝右在左、朝左在右', () => {
    for (const [kitId, style] of Object.entries(KIT_STYLES)) {
      const { p, g } = makePlayer(kitId);
      p.moving = false;
      p.facing = 1;
      p.draw(0);
      const back = g.rects.find((r) => r.w === 2 && r.h === 4 && r.x === 95);
      expect(back.x).toBe(95);
      expect(back.color).toBe(style.cape);
      p.facing = -1;
      p.draw(0);
      const front = g.rects.find((r) => r.w === 2 && r.h === 4 && r.x === 103);
      expect(front.x).toBe(103);
      expect(front.color).toBe(style.cape);
    }
  });

  it('未知 kit 返回 null 样式，人物保持原样', () => {
    expect(kitStyle('nope')).toBeNull();
    expect(kitStyle(undefined)).toBeNull();
    const { p, g } = makePlayer('nope');
    expect(p.kitStyle).toBeNull();
    expect(g.rects.length).toBeGreaterThan(10); // 程序化人物照常绘制
  });
});
