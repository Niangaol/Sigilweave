import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const sound = { on: true };
vi.mock('../src/audio/Sfx.js', () => ({ isSoundEnabled: () => sound.on }));

function makeFakeAudio() {
  const state = { nodes: [], started: 0, stopped: 0 };
  class FakeParam {
    constructor() { this.value = 1; }
    setValueAtTime(v) { this.value = v; }
    exponentialRampToValueAtTime(v) { this.value = v; }
    cancelScheduledValues() {}
  }
  class FakeNode {
    constructor(kind) { this.kind = kind; this.gain = new FakeParam(); this.frequency = new FakeParam(); state.nodes.push(this); }
    connect() {}
    disconnect() {}
    start() { state.started++; }
    stop() { state.stopped++; }
  }
  class FakeCtx {
    constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
    createOscillator() { return new FakeNode('osc'); }
    createGain() { return new FakeNode('gain'); }
    resume() { return Promise.resolve(); }
  }
  return { state, FakeCtx };
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  sound.on = true;
});

afterEach(() => {
  vi.useRealTimers();
});

async function load() {
  const { state, FakeCtx } = makeFakeAudio();
  globalThis.window = { AudioContext: FakeCtx };
  const mod = await import('../src/audio/BattleMusic.js');
  return { mod, state };
}

describe('BattleMusic 热血战斗 BGM', () => {
  it('start 排出鼓点/贝斯/主旋，stop 全部收尾', async () => {
    const { mod, state } = await load();
    mod.startBattleMusic();
    expect(mod.isBattleMusicPlaying()).toBe(true);
    expect(state.started).toBeGreaterThanOrEqual(3);
    mod.stopBattleMusic();
    expect(state.stopped).toBeGreaterThanOrEqual(3);
    expect(mod.isBattleMusicPlaying()).toBe(false);
  });

  it('重复 start 不叠加（playing 时直接返回）', async () => {
    const { mod, state } = await load();
    mod.startBattleMusic();
    const first = state.started;
    mod.startBattleMusic();
    // 没有推进时钟，第二次 start 被 playing 拦下，不会再排音符
    expect(state.started).toBe(first);
    mod.stopBattleMusic();
  });

  it('静音时不排新音符，取消静音后恢复', async () => {
    const { mod, state } = await load();
    sound.on = false;
    mod.startBattleMusic();
    expect(state.started).toBe(0); // tick 里因静音直接返回
    sound.on = true;
    vi.advanceTimersByTime(40);    // 下一个调度心跳
    expect(state.started).toBeGreaterThan(0);
    mod.stopBattleMusic();
  });

  it('stop 后可再次 start（生命周期可循环）', async () => {
    const { mod } = await load();
    mod.startBattleMusic();
    mod.stopBattleMusic();
    mod.startBattleMusic();
    expect(mod.isBattleMusicPlaying()).toBe(true);
    mod.stopBattleMusic();
  });

  it('没有 AudioContext 时静默降级，不抛异常', async () => {
    vi.resetModules();
    globalThis.window = {};
    const mod = await import('../src/audio/BattleMusic.js');
    expect(() => { mod.startBattleMusic(); mod.stopBattleMusic(); }).not.toThrow();
    expect(mod.isBattleMusicPlaying()).toBe(false);
  });

  it('未 start 直接 stop 不抛异常', async () => {
    const { mod } = await load();
    expect(() => mod.stopBattleMusic()).not.toThrow();
  });

  it('BPM 152 的推进：一个 40ms 心跳内排满 lookahead 窗口', async () => {
    const { mod, state } = await load();
    mod.startBattleMusic();
    // 首帧 tick 用 currentTime=0、lookahead=0.15s、步距≈0.0987s，至少排 2 步
    expect(state.started).toBeGreaterThanOrEqual(2);
    mod.stopBattleMusic();
  });
});
