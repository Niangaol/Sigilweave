// tests/boot-story.test.js
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

vi.mock('phaser', () => {
  class Scene { constructor(config = {}) { this.config = config; this.events = new EventEmitter(); } }
  return { default: { Scene, Scenes: { Events: { CREATE: 'create', SHUTDOWN: 'shutdown' } } } };
});
vi.mock('../src/ui/Palette.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, applyPixelZoom: () => {} };
});

import BootScene from '../src/scenes/BootScene.js';

function makeBoot(search) {
  globalThis.window = { location: { search } };
  const calls = [];
  const scene = new BootScene();
  scene.scene = {
    key: 'BootScene',
    start: (key) => calls.push(['start', key]),
    launch: (key, data) => calls.push(['launch', key, data]),
    isActive: () => false,
    get: () => undefined,
  };
  scene.cameras = { main: { setBackgroundColor() {} } };
  scene.textures = { exists: () => false };
  scene.anims = { exists: () => false, create() {} };
  scene.create();
  return calls;
}

describe('BootScene 开场接线', () => {
  it('正常路径进 StoryScene 播开场', () => {
    const calls = makeBoot('');
    expect(calls).toContainEqual(['start', 'StoryScene']);
  });

  it('?cine=0 不播开场，保持原 boot 过场入口（无覆盖层时直达标题）', () => {
    const calls = makeBoot('?cine=0');
    expect(calls.some(c => c[1] === 'StoryScene')).toBe(false);
    expect(calls).toContainEqual(['start', 'TitleScene']);
  });

  it('?stress=1 同样不播开场', () => {
    const calls = makeBoot('?stress=1');
    expect(calls.some(c => c[1] === 'StoryScene')).toBe(false);
  });

  it('?scene=battle 调试直达不播开场', () => {
    const calls = makeBoot('?scene=battle');
    expect(calls.some(c => c[1] === 'StoryScene')).toBe(false);
  });
});