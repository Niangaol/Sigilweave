import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

vi.mock('phaser', () => {
  class Scene { constructor(config = {}) { this.config = config; this.events = new EventEmitter(); } }
  return { default: { Scene, Scenes: { Events: { CREATE: 'create', SHUTDOWN: 'shutdown' } } } };
});

vi.mock('../src/ui/Palette.js', async (importOriginal) => {
  const actual = await importOriginal();
  const fakeText = (text = '') => {
    const t = {
      text, alpha: 1, x: 0, y: 0,
      setOrigin: () => t, setAlpha: (v) => { t.alpha = v; return t; }, setDepth: () => t,
      setText: (s) => { t.text = s; return t; },
      setPosition: (x, y) => { t.x = x; t.y = y; return t; },
      destroy: () => {},
    };
    return t;
  };
  return { ...actual, addText: (scene, x, y, text) => fakeText(text) };
});

const music = vi.hoisted(() => ({ startMusic: vi.fn(), stopMusic: vi.fn(), musicCue: vi.fn() }));
vi.mock('../src/audio/CineMusic.js', () => music);
vi.mock('../src/audio/Sfx.js', () => ({ sfx: { tick: () => {} } }));
const transition = vi.hoisted(() => ({ playCutscene: vi.fn(() => true), cutscenesDisabled: vi.fn(() => false) }));
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

function makeHarness(data) {
  const calls = [];
  const state = { cutsceneActive: false };
  const scene = new StoryScene();
  scene.scene = {
    stop: () => calls.push(['stop']),
    isActive: (key) => key === 'CutsceneScene' && state.cutsceneActive,
  };
  scene.cameras = { main: { setZoom() {}, centerOn() {} } };
  scene.add = { graphics: () => makeGraphics() };
  scene.input = { keyboard: { on() {}, off() {} }, on() {}, off() {} };
  scene.events = new EventEmitter();
  scene.init(data);
  scene.create();
  return { scene, calls, state };
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
  transition.cutscenesDisabled.mockReturnValue(false);
  globalThis.window = { location: { search: '' }, __SIGILWEAVE_STORY__: null, __SIGILWEAVE_ENDING__: null };
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
    transition.cutscenesDisabled.mockReturnValue(true);
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

describe('StoryScene 结局模式', () => {
  const STATS = { victory: true, kills: 312, elapsedMs: 510000, __cine: true };

  it('create 不立即起配乐（避开覆盖层 stopMusic 竞态），第一次 update 才 startMusic(ending)', () => {
    const { scene } = makeHarness({ mode: 'ending', stats: STATS });
    expect(music.startMusic).not.toHaveBeenCalled();
    advance(scene, 100);
    expect(music.startMusic).toHaveBeenCalledTimes(1);
    expect(music.startMusic).toHaveBeenCalledWith('ending');
    expect(window.__SIGILWEAVE_ENDING__.totalMs).toBe(32000);
    expect(window.__SIGILWEAVE_STORY__).toBe(null);
  });

  it('镜头按结局时间轴推进，cue 正确', () => {
    const { scene } = makeHarness({ mode: 'ending', stats: STATS });
    advance(scene, 100);
    expect(window.__SIGILWEAVE_ENDING__.shot).toBe('release');
    advance(scene, 7000);
    expect(window.__SIGILWEAVE_ENDING__.shot).toBe('quiet');
    expect(music.musicCue).toHaveBeenCalledWith('hush');
    advance(scene, 7000);
    expect(window.__SIGILWEAVE_ENDING__.shot).toBe('dawn');
    advance(scene, 8000);
    expect(window.__SIGILWEAVE_ENDING__.shot).toBe('credits');
    expect(music.musicCue).toHaveBeenCalledWith('finale');
  });

  it('播完 32 秒自动交接 GameOverScene，stats 原样透传', () => {
    const { scene } = makeHarness({ mode: 'ending', stats: STATS });
    advance(scene, 33000);
    expect(scene.finished).toBe(true);
    expect(scene.skipped).toBe(false);
    expect(transition.playCutscene).toHaveBeenCalledTimes(1);
    const arg = transition.playCutscene.mock.calls[0][1];
    expect(arg.kind).toBe('boot');
    expect(arg.to).toBe('GameOverScene');
    expect(arg.payload).toBe(STATS);
  });

  it('宽限期后跳过直达同一交接；repeat 不算', () => {
    const { scene } = makeHarness({ mode: 'ending', stats: STATS });
    advance(scene, 100);
    scene.onSkip({ type: 'keydown' });
    expect(scene.finished).toBe(false);
    advance(scene, 100);
    scene.onSkip({ type: 'keydown', repeat: true });
    expect(scene.finished).toBe(false);
    scene.onSkip({ type: 'keydown' });
    expect(scene.finished).toBe(true);
    expect(scene.skipped).toBe(true);
    expect(transition.playCutscene.mock.calls[0][1].payload).toBe(STATS);
    expect(music.stopMusic).toHaveBeenCalled();
  });

  it('过场被禁用（playCutscene 返回 false）时自己停掉，不软锁', () => {
    transition.playCutscene.mockReturnValue(false);
    transition.cutscenesDisabled.mockReturnValue(true);
    const { scene, calls } = makeHarness({ mode: 'ending', stats: STATS });
    advance(scene, 33000);
    expect(calls).toContainEqual(['stop']);
  });

  it('交接被收尾中的过场吞掉时不自停，覆盖层停下后自动重试（真实浏览器死锁回归）', () => {
    const { scene, calls, state } = makeHarness({ mode: 'ending', stats: STATS });
    // 胜利过场 reveal 收尾仍 active：playCutscene 返回 false 但不是被禁用
    state.cutsceneActive = true;
    transition.playCutscene.mockReturnValue(false);
    advance(scene, 33000);
    expect(scene.finished).toBe(true);
    expect(calls).not.toContainEqual(['stop']);
    expect(transition.playCutscene).toHaveBeenCalledTimes(1);
    // 覆盖层停下后，下一帧自动重试同一交接
    state.cutsceneActive = false;
    transition.playCutscene.mockReturnValue(true);
    scene.update(0, 16);
    expect(transition.playCutscene).toHaveBeenCalledTimes(2);
    expect(transition.playCutscene.mock.calls[1][1].payload).toBe(STATS);
    expect(calls).not.toContainEqual(['stop']);
  });

  it('SHUTDOWN 停配乐并发布 done 到结局键', () => {
    const { scene } = makeHarness({ mode: 'ending', stats: STATS });
    scene.events.emit('shutdown');
    expect(music.stopMusic).toHaveBeenCalled();
    expect(window.__SIGILWEAVE_ENDING__.phase).toBe('done');
  });

  it('dawn 镜显示「契约终结」标题，其余镜头隐藏', () => {
    const { scene } = makeHarness({ mode: 'ending', stats: STATS });
    expect(scene.titleText.text).toBe('契约终结');
    advance(scene, 1000);
    expect(scene.titleText.alpha).toBe(0);
    advance(scene, 16000);
    expect(scene.shotIndex).toBe(2);
    expect(scene.titleText.alpha).toBeGreaterThan(0);
    advance(scene, 8000);
    expect(scene.titleText.alpha).toBe(0);
  });

  it('名单镜三行滚动：进入时带外透明，中段进入中心带，y 持续上移', () => {
    const { scene } = makeHarness({ mode: 'ending', stats: STATS });
    advance(scene, 22100);
    expect(scene.shotIndex).toBe(3);
    expect(scene.creditLines).toHaveLength(3);
    expect(scene.creditLines.map(t => t.text)).toEqual([
      '共 振 法 阵', '设计 · 程序 · 像素美术 · 程序化音乐', '感谢每一位刻阵者',
    ]);
    for (const t of scene.creditLines) expect(t.alpha).toBe(0);
    advance(scene, 4000);
    const yMid = scene.creditLines[0].y;
    expect(scene.creditLines[0].alpha).toBeGreaterThan(0);
    advance(scene, 2000);
    expect(scene.creditLines[0].y).toBeLessThan(yMid);
  });
});