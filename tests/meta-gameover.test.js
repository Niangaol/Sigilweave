import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('phaser', () => {
  class Scene { constructor(config = {}) { this.config = config; this.events = { once: () => {}, on: () => {} }; } }
  return { default: { Scene, Scenes: { Events: { SHUTDOWN: 'shutdown' } } } };
});

const fakeText = (text = '') => {
  const t = { text, setOrigin: () => t, setDepth: () => t, setAlpha: () => t, setText: (s) => { t.text = s; return t; } };
  return t;
};

// 结算画面不持有文字对象，只能从 Palette.addText 的入参里记录文案来做断言
const captured = vi.hoisted(() => ({ texts: [] }));

vi.mock('../src/ui/Palette.js', () => ({
  C: {}, HEX: {}, FONT: '', FONT_DISPLAY: '',
  addText: (scene, x, y, text) => { captured.texts.push(text); return fakeText(text); },
  pxRect: () => {}, pxFrame: () => {}, pxLine: () => {}, pxDiamond: () => {},
  applyPixelZoom: () => {}, fmtTime: (ms) => String(ms),
}));
vi.mock('../src/ui/transition.js', () => ({ playCutscene: vi.fn() }));

import GameOverScene from '../src/scenes/GameOverScene.js';
import { playCutscene } from '../src/ui/transition.js';
import { loadMeta, resetMeta } from '../src/logic/meta.js';
import { STORAGE_KEY } from '../src/logic/meta.js';

const receipt = (act, method, tier = 'major') => ({ act, bossId: 'boss-' + act, method, tier, reward: 12 });

const initScene = (data) => {
  const scene = new GameOverScene();
  scene.init(data);
  return scene;
};

describe('结算画面接局外成长', () => {
  beforeEach(() => {
    resetMeta();
    captured.texts.length = 0;
    vi.clearAllMocks();
    delete globalThis.window;
  });

  it('死亡结算：按幕数与击杀发残响并写档', () => {
    const scene = initScene({ act: 1, kills: 0, victory: false, elapsedMs: 1000 });
    expect(scene.settle.gained).toBe(5);
    expect(scene.metaTotals.resonance).toBe(5);
    expect(loadMeta().resonance).toBe(5);
  });

  it('首杀额外发里程碑残响，并回报新契约', () => {
    const scene = initScene({ act: 1, kills: 0, victory: false, bossResolutions: { 1: receipt(1, 'combat') } });
    expect(scene.settle.gained).toBe(8);
    expect(scene.settle.newMilestones.map((m) => m.id)).toEqual(['boss-1']);
    expect(scene.metaTotals.resonance).toBe(33);
  });

  it('通关按幕结算（chapter 5 / stage 7）并加 60', () => {
    const scene = initScene({ chapter: 5, stage: 7, kills: 100, victory: true });
    expect(scene.settle.base).toBe(5 * 8 + 2 + 60);
    expect(scene.settle.gained).toBe(102);
    expect(scene.settle.newMilestones.map((m) => m.id)).toEqual(['clear-1', 'clear-2', 'clear-3', 'clear-4', 'clear-5']);
    expect(scene.settle.newMilestones.map((m) => m.label)).toContain('通关 · 第 5 幕');
  });

  it('演武不结算，读档也不变', () => {
    const scene = initScene({ act: 1, kills: 50, trainingComplete: true });
    expect(scene.settle.gained).toBe(0);
    expect(loadMeta().resonance).toBe(0);
  });

  it('?scene=gameover 排版调试页不写档不发残响', () => {
    globalThis.window = { location: { search: '?scene=gameover' } };
    const scene = initScene({ act: 1, kills: 40, victory: false });
    expect(scene.settle.gained).toBe(0);
    expect(loadMeta().resonance).toBe(0);
    expect(globalThis.window.__SIGILWEAVE_META__.lastSettle.gained).toBe(0);
  });

  it('死亡副标题读 chapter（不显示 undefined），回标题转场也按幕', () => {
    const scene = initScene({ chapter: 4, stage: 5, kills: 0, victory: false, elapsedMs: 1000 });
    scene.add = { graphics: () => ({ setDepth: () => ({}) }) };
    scene.drawPanel();
    expect(captured.texts).toContain('第 4 幕 · 挑战中断');
    scene.toTitle();
    expect(playCutscene).toHaveBeenCalledWith(scene, expect.objectContaining({ act: 4 }));
  });

  it('旧数据只有 act 时死亡副标题与转场沿用 act', () => {
    const scene = initScene({ act: 2, kills: 0, victory: false, elapsedMs: 1000 });
    scene.add = { graphics: () => ({ setDepth: () => ({}) }) };
    scene.drawPanel();
    expect(captured.texts).toContain('第 2 幕 · 挑战中断');
    scene.toTitle();
    expect(playCutscene).toHaveBeenCalledWith(scene, expect.objectContaining({ act: 2 }));
  });

  it('正常结算会同时刷新 window.__SIGILWEAVE_META__ 的 save 与 lastSettle', () => {
    globalThis.window = { location: { search: '' } };
    initScene({ act: 2, kills: 40, victory: false });
    expect(globalThis.window.__SIGILWEAVE_META__.save.resonance).toBe(loadMeta().resonance);
    expect(globalThis.window.__SIGILWEAVE_META__.lastSettle.gained).toBeGreaterThan(0);
    expect(STORAGE_KEY).toBe('sigilweave:meta:v1');
  });
});
