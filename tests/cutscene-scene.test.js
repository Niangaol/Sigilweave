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

const music = vi.hoisted(() => ({ startMusic: vi.fn(), stopMusic: vi.fn(), musicCue: vi.fn() }));
vi.mock('../src/audio/CineMusic.js', () => music);

import CutsceneScene from '../src/scenes/CutsceneScene.js';

function makeGraphics() {
  const g = {
    depth: 0,
    clear() { return g; },
    fillStyle() { return g; },
    fillRect() { return g; },
    lineStyle() { return g; },
    lineBetween() { return g; },
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
  const targetKey = data?.to ?? 'IntermissionScene';
  const target = { key: targetKey, events: new EventEmitter() };
  const manager = {
    key: 'CutsceneScene',
    // 与真实 Phaser 对齐：isActive 只对 RUNNING 场景为 true，PAUSED 场景返回 false
    isActive(key) { return state.active.has(key) && !state.paused.has(key); },
    isPaused(key) { return state.paused.has(key); },
    pause(key) { state.paused.add(key); state.calls.push(['pause', key]); },
    resume(key) { state.paused.delete(key); state.calls.push(['resume', key]); },
    stop(key) { const k = key ?? 'CutsceneScene'; state.active.delete(k); state.calls.push(['stop', k]); },
    launch(key, payload) { state.active.add(key); state.calls.push(['launch', key, payload]); },
    bringToTop() { state.calls.push(['bringToTop']); },
    get(key) { return key === targetKey ? target : { key, events: new EventEmitter() }; },
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

  it('源场景被冻结（PAUSED）后，盖满换场时仍会被停止', () => {
    const { overlay, manager, state } = makeHarness();
    // create 时源场景已被冻结：真实 Phaser 里 isActive 对 PAUSED 场景返回 false，
    // 若换场只看 isActive，被冻结的源场景会泄漏并继续渲染，盖住目标场景
    expect(manager.isPaused('BattleScene')).toBe(true);
    advance(overlay, overlay.timeline.coverMs + 20);
    expect(state.calls).toContainEqual(['stop', 'BattleScene']);
    expect(state.active.has('BattleScene')).toBe(false);
  });

  it('目标 create 后先冻结；揭开前不 resume；揭开始才放行', () => {
    vi.useFakeTimers();
    try {
      const { overlay, target, manager, timers } = makeHarness();
      manager.manager = manager;
      advance(overlay, overlay.timeline.coverMs + 20);
      target.events.emit('create', target);
      runZeroTimers(timers);
      expect(manager.isPaused('IntermissionScene')).toBe(true);

      advance(overlay, overlay.timeline.revealAt - overlay.elapsed - 20);
      expect(manager.isPaused('IntermissionScene')).toBe(true);
      expect(overlay.resumed).toBe(false);

      advance(overlay, 40);
      expect(overlay.resumed).toBe(true);
      // isActive 对 PAUSED 为 false，resumeTarget 的直接 resume 不会发；
      // 与真实浏览器一致，由 ensureTargetRunning 看门狗异步补 resume 后才真正放行
      vi.advanceTimersByTime(500);
      expect(manager.isPaused('IntermissionScene')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
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
    // 跳过时已经进入揭开阶段：freezeTarget 不应再补暂停，否则 resume 可能被排队顺序吃掉
    expect(manager.isPaused('IntermissionScene')).toBe(false);
    advance(overlay, 32);
    expect(manager.isPaused('IntermissionScene')).toBe(false);
    expect(overlay.resumed).toBe(true);

    overlay.onSkipInput({ type: 'keydown' });
    expect(overlay.finished).toBe(true);
  });

  it('跳过时 pause 排队晚到，看门狗会把目标重新拉回运行', () => {
    vi.useFakeTimers();
    try {
      const { overlay, target, state, timers } = makeHarness();
      const mgr = overlay.scene;
      const deferred = new Set();
      mgr.pause = (key) => { deferred.add(key); };
      mgr.isPaused = (key) => state.paused.has(key);
      mgr.resume = (key) => { state.paused.delete(key); };
      mgr.manager = mgr;

      // 正常停留阶段：目标 create 后把 pause 排进队列（尚未落地）
      advance(overlay, overlay.timeline.coverMs + 20);
      target.events.emit('create', target);
      runZeroTimers(timers);
      expect(deferred.has('IntermissionScene')).toBe(true);

      // 跳过：进入揭开，resume 此时看不到已生效的 pause
      overlay.onSkipInput({ type: 'keydown' });
      advance(overlay, 16);

      // 模拟 pause 在 resume 之后才落地
      state.paused.add('IntermissionScene');
      vi.advanceTimersByTime(500);
      expect(state.paused.has('IntermissionScene')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
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

describe('journey 幕间演出', () => {
  it('不压标题卡，创建角标/字幕并起配乐', () => {
    const { overlay } = makeHarness({ kind: 'journey', act: 2, from: 'IntermissionScene', to: 'BattleScene' });
    expect(overlay.cardData).toBeNull();
    expect(overlay.journey.label).toBe('第贰幕 · 腐沼教堂');
    expect(music.startMusic).toHaveBeenCalledWith('journey');
  });

  it('演出期间目标战斗在底下冻结，揭开才放行，全程不软锁', () => {
    vi.useFakeTimers();
    try {
      const { overlay, target, manager, timers } = makeHarness({ kind: 'journey', act: 2, from: 'IntermissionScene', to: 'BattleScene' });
      manager.manager = manager;
      advance(overlay, overlay.timeline.coverMs + 20);
      target.events.emit('create', target);
      runZeroTimers(timers);
      expect(manager.isPaused('BattleScene')).toBe(true);
      advance(overlay, 3000);
      expect(manager.isPaused('BattleScene')).toBe(true);
      expect(overlay.finished).toBe(false);
      advance(overlay, 3000);
      expect(overlay.finished).toBe(true);
      // 放行由看门狗异步补 resume（isActive 对 PAUSED 为 false），flush 后再断言
      vi.advanceTimersByTime(500);
      expect(manager.isPaused('BattleScene')).toBe(false);
      expect(music.stopMusic).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('跳过 journey：先换场钉到揭开点，第二次直接结束', () => {
    const { overlay, target, manager, timers } = makeHarness({ kind: 'journey', act: 3, from: 'IntermissionScene', to: 'BattleScene' });
    advance(overlay, 200);
    overlay.onSkipInput({ type: 'keydown' });
    expect(overlay.skipped).toBe(true);
    expect(overlay.elapsed).toBe(overlay.timeline.revealAt);
    advance(overlay, 32);
    target.events.emit('create', target);
    runZeroTimers(timers);
    advance(overlay, 32);
    expect(overlay.resumed).toBe(true);
    overlay.onSkipInput({ type: 'keydown' });
    expect(overlay.finished).toBe(true);
    expect(manager.isPaused('BattleScene')).toBe(false);
  });
});
