import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

vi.mock('phaser', () => {
  class Scene { constructor(config = {}) { this.config = config; this.events = new EventEmitter(); } }
  return { default: { Scene, Scenes: { Events: { CREATE: 'create', SHUTDOWN: 'shutdown' } } } };
});

vi.mock('../src/ui/Palette.js', async (importOriginal) => {
  const actual = await importOriginal();
  const fakeText = () => {
    const t = {
      text: '', alpha: 1,
      setOrigin: () => t, setAlpha: (v) => { t.alpha = v; return t; }, setDepth: () => t,
      setText: (s) => { t.text = s; return t; }, destroy: () => {},
    };
    return t;
  };
  return { ...actual, addText: () => fakeText() };
});

const music = vi.hoisted(() => ({ startMusic: vi.fn(), stopMusic: vi.fn(), musicCue: vi.fn() }));
vi.mock('../src/audio/CineMusic.js', () => music);
vi.mock('../src/audio/Sfx.js', () => ({ sfx: { tick: () => {} } }));
const transition = vi.hoisted(() => ({ playCutscene: vi.fn(() => true) }));
vi.mock('../src/ui/transition.js', () => transition);

import StoryScene from '../src/scenes/StoryScene.js';
import { buildOpeningTimeline } from '../src/data/story.js';

function makeGraphics() {
  const g = {
    clear: () => g, fillStyle: () => g, fillRect: () => g, lineStyle: () => g,
    lineBetween: () => g, strokePoints: () => g, fillPoints: () => g, setDepth: () => g,
  };
  return g;
}

function makeHarness() {
  const calls = [];
  const scene = new StoryScene();
  scene.scene = { stop: () => calls.push(['stop']), };
  scene.cameras = { main: { setZoom() {}, centerOn() {} } };
  scene.add = { graphics: () => makeGraphics() };
  scene.input = { keyboard: { on() {}, off() {} }, on() {}, off() {} };
  scene.events = new EventEmitter();
  scene.init();
  scene.create();
  return { scene, calls };
}

function advance(scene, ms, step = 16) {
  let left = ms;
  while (left > 0 && !scene.finished) {
    const dt = Math.min(step, left);
    scene.update(0, dt);
    left -= dt;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  transition.playCutscene.mockReturnValue(true);
  globalThis.window = { location: { search: '' }, __SIGILWEAVE_STORY__: null };
});

describe('StoryScene 开场状态机', () => {
  it('create 起配乐并发布状态；镜头按时间轴推进', () => {
    const { scene } = makeHarness();
    expect(music.startMusic).toHaveBeenCalledWith('opening');
    expect(window.__SIGILWEAVE_STORY__.totalMs).toBe(36000);
    advance(scene, 100);
    expect(window.__SIGILWEAVE_STORY__.shot).toBe('skyfall');
    advance(scene, 6000);
    expect(window.__SIGILWEAVE_STORY__.shot).toBe('contracts');
    expect(music.musicCue).toHaveBeenCalledWith('chime');
    advance(scene, 12000);
    expect(window.__SIGILWEAVE_STORY__.shot).toBe('altar');
  });

  it('宽限期内跳过无效，宽限期后跳过直达 boot 交接', () => {
    const { scene } = makeHarness();
    advance(scene, 100);
    scene.onSkip({ type: 'keydown' });
    expect(scene.finished).toBe(false);
    advance(scene, 100);
    scene.onSkip({ type: 'keydown' });
    expect(scene.finished).toBe(true);
    expect(scene.skipped).toBe(true);
    expect(transition.playCutscene).toHaveBeenCalledWith(scene, {
      kind: 'boot', to: 'TitleScene', payload: { __cine: true },
    });
    expect(music.stopMusic).toHaveBeenCalled();
  });

  it('按键 repeat 不触发跳过；finish 幂等', () => {
    const { scene } = makeHarness();
    advance(scene, 300);
    scene.onSkip({ type: 'keydown', repeat: true });
    expect(scene.finished).toBe(false);
    scene.onSkip({ type: 'keydown' });
    scene.onSkip({ type: 'keydown' });
    expect(transition.playCutscene).toHaveBeenCalledTimes(1);
  });

  it('播完 36 秒自动交接标题', () => {
    const { scene } = makeHarness();
    advance(scene, 37000);
    expect(scene.finished).toBe(true);
    expect(scene.skipped).toBe(false);
    expect(transition.playCutscene).toHaveBeenCalledTimes(1);
  });

  it('过场被禁用（playCutscene 返回 false）时自己停掉，不软锁', () => {
    transition.playCutscene.mockReturnValue(false);
    const { scene, calls } = makeHarness();
    advance(scene, 37000);
    expect(calls).toContainEqual(['stop']);
  });

  it('SHUTDOWN 停配乐并发布 done', () => {
    const { scene } = makeHarness();
    scene.events.emit('shutdown');
    expect(music.stopMusic).toHaveBeenCalled();
    expect(window.__SIGILWEAVE_STORY__.phase).toBe('done');
  });

  it('最后一镜标题文字淡入，其余镜头隐藏', () => {
    const { scene } = makeHarness();
    advance(scene, 1000);
    expect(scene.titleText.alpha).toBe(0);
    advance(scene, 33000);
    expect(scene.shotIndex).toBe(5);
    expect(scene.titleText.alpha).toBeGreaterThan(0);
  });
});