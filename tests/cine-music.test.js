import { describe, expect, it, vi, beforeEach } from 'vitest';

const sound = { on: true };
vi.mock('../src/audio/Sfx.js', () => ({ isSoundEnabled: () => sound.on }));

function makeFakeAudio() {
  const state = { nodes: [], started: 0, stopped: 0, disconnected: 0 };
  class FakeParam {
    constructor() { this.value = 1; }
    setValueAtTime(v) { this.value = v; }
    exponentialRampToValueAtTime(v) { this.value = v; }
    cancelScheduledValues() {}
  }
  class FakeNode {
    constructor(kind) { this.kind = kind; this.gain = new FakeParam(); this.frequency = new FakeParam(); state.nodes.push(this); }
    connect() {}
    disconnect() { state.disconnected++; }
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
  sound.on = true;
});

async function load() {
  const { state, FakeCtx } = makeFakeAudio();
  globalThis.window = { AudioContext: FakeCtx };
  const mod = await import('../src/audio/CineMusic.js');
  return { mod, state };
}

describe('CineMusic 程序化配乐', () => {
  it('start 建低音铺底，stop 全部停掉', async () => {
    const { mod, state } = await load();
    mod.startMusic('opening');
    expect(state.started).toBeGreaterThanOrEqual(3);
    mod.stopMusic();
    expect(state.stopped).toBeGreaterThanOrEqual(3);
  });

  it('音效关闭时 start/cue 完全静默', async () => {
    const { mod, state } = await load();
    sound.on = false;
    mod.startMusic('opening');
    mod.musicCue('bell');
    expect(state.started).toBe(0);
  });

  it('cue 在铺底之上追加乐音，未知 cue 忽略', async () => {
    const { mod, state } = await load();
    mod.startMusic('opening');
    const base = state.started;
    mod.musicCue('arp');
    expect(state.started).toBeGreaterThan(base);
    const n = state.started;
    mod.musicCue('不存在');
    expect(state.started).toBe(n);
    mod.stopMusic();
  });

  it('重复 start 先清旧铺底，不叠两层', async () => {
    const { mod, state } = await load();
    mod.startMusic('opening');
    mod.startMusic('journey');
    expect(state.stopped).toBeGreaterThanOrEqual(3);
    mod.stopMusic();
  });

  it('没有 AudioContext 时静默降级，不抛异常', async () => {
    vi.resetModules();
    globalThis.window = {};
    const mod = await import('../src/audio/CineMusic.js');
    expect(() => { mod.startMusic(); mod.musicCue('bell'); mod.stopMusic(); }).not.toThrow();
  });

  it('未 start 直接 cue / stop 不抛异常', async () => {
    const { mod } = await load();
    expect(() => { mod.musicCue('bell'); mod.stopMusic(); }).not.toThrow();
  });

  it('ending 模式用 65.4Hz 低音与 0.6 渐入，区别于 opening/journey', async () => {
    const { mod, state } = await load();
    mod.startMusic('ending');
    const oscs = state.nodes.filter(n => n.kind === 'osc');
    expect(oscs.length).toBeGreaterThanOrEqual(3);
    expect(oscs[0].frequency.value).toBeCloseTo(65.4);
    expect(state.nodes[0].gain.value).toBeCloseTo(0.6);
    mod.stopMusic();
  });

  it('hush cue 在铺底之上追加两声音符', async () => {
    const { mod, state } = await load();
    mod.startMusic('ending');
    const base = state.started;
    mod.musicCue('hush');
    expect(state.started).toBe(base + 2);
    mod.stopMusic();
  });
});