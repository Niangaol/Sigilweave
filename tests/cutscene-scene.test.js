import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

// 沙箱里跑不了真实浏览器，这里用最小 Phaser 替身把过场场景的换场/冻结/揭开/跳过
// 四段状态机跑起来：它不能证明像素好看，但能证明流程不会软锁、不会双重换场。
vi.mock('phaser', () => {
  class Scene {
    constructor(config = {}) {
      this.config = config;
      this.events = new EventEmitter();
    }
  }
  return { default: { Scene, Scenes: { Events: { CREATE: 'create', SHUTDOWN: 'shutdown' } } } };
});

vi.mock('../src/ui/Palette.js', async (importOriginal) => {
  const actual = await importOriginal();
  const fakeText = () => {
    const t = {
      setOrigin: () => t, setAlpha: () => t, setY: () => t, setDepth: () => t,
      setVisible: () => t, setText: () => t, destroy: () => {},
    };
    return t;
  };
  return { ...actual, addText: () => fakeText() };
});

vi.mock('../src/audio/Sfx.js', () => ({
  sfx: { cineIn: () => {}, cineSwap: () => {}, cineReveal: () => {}, tick: () => {} },
}));

import CutsceneScene from '../src/scenes/CutsceneScene.js';

function makeGraphics() {
  const g = {
    depth: 0,
    clear() { return g; },
    fillStyle() { return g; },
    fillRect() { return g; },
    lineStyle() { return g; },
    strokePoints() { return g; },
    fillPoints() { return g; },
    setDepth(d) { g.depth = d; return g; },
  };
  return g;
}

function makeContainer() {
  const c = {
    children: [],
    alpha: 1,
    y: 0,
    add(obj) { c.children.push(obj); return c; },
    setDepth() { return c; },
    setAlpha(value) { c.alpha = value; return c; },
    setY(value) { c.y = value; return c; },
  };
  return c;
}

function makeHarness(data) {
  const state = {
    active: new Set(['BattleScene']),
    paused: new Set(),
    calls: [],
  };
  const target = { key: 'IntermissionScene', events: new EventEmitter() };
  const manager = {
    key: 'CutsceneScene',
    isActive(key) { return state.active.has(key); },
    isPaused(key) { return state.paused.has(key); },
    pause(key) { state.paused.add(key); state.calls.push(['pause', key]); },
    resume(key) { state.paused.delete(key); state.calls.push(['resume', key]); },
    stop(key) { const k = key ?? 'CutsceneScene'; state.active.delete(k); state.calls.push(['stop', k]); },
    launch(key, payload) { state.active.add(key); state.calls.push(['launch', key, payload]); },
    bringToTop() { state.calls.push(['bringToTop']); },
    get(key) { return key === 'IntermissionScene' ? target : { key, events: new EventEmitter() }; },
  };

  const overlay = new CutsceneScene();
  overlay.scene = manager;
  overlay.cameras = { main: { setZoom() {}, centerOn() {} } };
  overlay.add = {
    graphics: () => makeGraphics(),
    container: () => makeContainer(),
    text: () => ({ setOrigin: () => ({ setDepth: () => ({}) }) }),
  };
  const timers = [];
  overlay.time = { delayedCall(ms, cb) { timers.push({ ms, cb }); return { remove() {} }; } };
  overlay.input = {
    keyboard: { on() {}, off() {} },
    on() {}, off() {},
  };
  overlay.events = new EventEmitter();
  overlay.init({
    kind: 'act', act: 1, from: 'BattleScene', to: 'IntermissionScene',
    payload: { run: { act: 1 }, __cine: true },
    ...data,
  });
  overlay.create();
  return { overlay, manager, target, state, timers };
}

function advance(overlay, ms, step = 16) {
  let left = ms;
  while (left > 0) {
    const dt = Math.min(step, left);
    overlay.update(0, dt);
    left -= dt;
    if (overlay.finished) break;
  }
}

function runZeroTimers(timers) {
  for (const t of [...timers]) {
    if (t.ms <= 0) {
      timers.splice(timers.indexOf(t), 1);
      t.cb();
    }
  }
}

beforeEach(() => {
  globalThis.window = { location: { search: '' }, __SIGILWEAVE_CUTSCENE__: null };
});

describe('CutsceneScene 换场状态机', () => {
  it('盖满前不动旧场景；盖满后才停旧场景、启动新场景', () => {
    const { overlay, state } = makeHarness();
    advance(overlay, overlay.timeline.coverMs - 17);
    expect(state.calls.some(c => c[0] === 'launch')).toBe(false);
    expect(state.calls.some(c => c[0] === 'stop' && c[1] === 'BattleScene')).toBe(false);

    advance(overlay, 32);
    expect(state.calls).toContainEqual(['stop', 'BattleScene']);
    expect(state.calls.some(c => c[0] === 'launch' && c[1] === 'IntermissionScene')).toBe(true);
    // 启动目标时带着 run 与 __cine，目标场景据此跳过自身淡入
    const launch = state.calls.find(c => c[0] === 'launch');
    expect(launch[2]).toMatchObject({ __cine: true });
  });

  it('目标 create 后先冻结；揭开前不 resume；揭开始才放行', () => {
    const { overlay, target, manager, timers } = makeHarness();
    advance(overlay, overlay.timeline.coverMs + 20);
    target.events.emit('create', target);
    runZeroTimers(timers);
    expect(manager.isPaused('IntermissionScene')).toBe(true);

    advance(overlay, overlay.timeline.revealAt - overlay.elapsed - 20);
    expect(manager.isPaused('IntermissionScene')).toBe(true);
    expect(overlay.resumed).toBe(false);

    advance(overlay, 40);
    expect(overlay.resumed).toBe(true);
    expect(manager.isPaused('IntermissionScene')).toBe(false);
  });

  it('目标没 create 完就把计时钉在揭开点，绝不露出空场景', () => {
    const { overlay, manager } = makeHarness();
    advance(overlay, 3000);
    expect(overlay.elapsed).toBeLessThanOrEqual(overlay.timeline.revealAt);
    expect(overlay.finished).toBe(false);
    expect(manager.isPaused('IntermissionScene')).toBe(false);
  });

  it('正常播完会自己停掉覆盖层，但不会停目标场景', () => {
    const { overlay, target, state, timers } = makeHarness();
    advance(overlay, overlay.timeline.coverMs + 20);
    target.events.emit('create', target);
    runZeroTimers(timers);
    advance(overlay, 3000);
    expect(overlay.finished).toBe(true);
    expect(state.calls).toContainEqual(['stop', 'CutsceneScene']);
    expect(state.active.has('IntermissionScene')).toBe(true);
    expect(state.calls.some(c => c[0] === 'stop' && c[1] === 'IntermissionScene')).toBe(false);
  });

  it('跳过：宽限期内无效，宽限期后先换场并钉到揭开点，第二次跳过直接结束', () => {
    const { overlay, target, manager, timers } = makeHarness();
    advance(overlay, 60);
    overlay.onSkipInput({ type: 'keydown' });
    expect(overlay.elapsed).toBe(60);
    expect(overlay.swapped).toBe(false);

    advance(overlay, 160);
    overlay.onSkipInput({ type: 'keydown' });
    expect(overlay.skipped).toBe(true);
    expect(overlay.elapsed).toBe(overlay.timeline.revealAt);

    // 跳过发生在目标 create 之前：不能提前 resume，否则随后冻结会把它永久暂停
    advance(overlay, 32);
    expect(overlay.resumed).toBe(false);
    target.events.emit('create', target);
    runZeroTimers(timers);
    expect(manager.isPaused('IntermissionScene')).toBe(true);
    advance(overlay, 32);
    expect(manager.isPaused('IntermissionScene')).toBe(false);

    overlay.onSkipInput({ type: 'keydown' });
    expect(overlay.finished).toBe(true);
  });

  it('按键重复与已完成状态不会触发第二次跳过', () => {
    const { overlay } = makeHarness();
    advance(overlay, 200);
    overlay.onSkipInput({ type: 'keydown', repeat: true });
    expect(overlay.skipped).toBe(false);
    overlay.onSkipInput({ type: 'keydown' });
    expect(overlay.skipped).toBe(true);
    const elapsed = overlay.elapsed;
    overlay.onSkipInput({ type: 'keydown' });
    expect(overlay.elapsed).toBe(elapsed);
  });

  it('每类过场都能走完，目标场景在结束时仍处于活动状态', () => {
    for (const kind of ['boot', 'sigil', 'act', 'clear', 'death', 'victory', 'retry', 'return']) {
      const { overlay, target, state, timers } = makeHarness({
        kind, act: kind === 'act' || kind === 'clear' ? 2 : 1,
        report: { elapsedMs: 123000, kills: 9, triggers: 20, combos: 2 },
      });
      advance(overlay, overlay.timeline.coverMs + 20);
      target.events.emit('create', target);
      runZeroTimers(timers);
      advance(overlay, 3000);
      expect(overlay.finished, kind).toBe(true);
      expect(state.active.has('IntermissionScene'), kind).toBe(true);
      if (kind === 'boot') expect(overlay.cardData, kind).toBeNull();
      else expect(overlay.cardData?.title ?? '', kind).toBeTruthy();
    }
  });

  it('竖屏与横屏都按画布实际高度计算标题卡中心', () => {
    // 这个用例只验证计算不抛错；具体像素落在 canvas 内由浏览器截图负责
    const { overlay } = makeHarness();
    expect(overlay.W).toBe(480);
    expect([270, 760]).toContain(overlay.H);
    expect(overlay.cy).toBeGreaterThan(0);
    expect(overlay.cy).toBeLessThan(overlay.H);
  });
});
