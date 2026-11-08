import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// 过场新增音效：落地砸击 cineSlam / 符环碎裂 cineShatter。
// 与 CineMusic 同纪律：无 AudioContext / 关闭音效时静默降级，绝不抛出。
function makeFakeAudio() {
  const state = { started: 0 };
  class FakeParam {
    constructor() { this.value = 1; }
    setValueAtTime(v) { this.value = v; }
    exponentialRampToValueAtTime(v) { this.value = v; }
  }
  class FakeNode {
    constructor() { this.gain = new FakeParam(); this.frequency = new FakeParam(); }
    connect() {} disconnect() {}
    start() { state.started++; }
    stop() {}
  }
  class FakeCtx {
    constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
    createOscillator() { return new FakeNode(); }
    createGain() { return new FakeNode(); }
    resume() { return Promise.resolve(); }
  }
  return { state, FakeCtx };
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

async function load(withAudio = true) {
  const { state, FakeCtx } = makeFakeAudio();
  globalThis.window = withAudio ? { AudioContext: FakeCtx } : {};
  const mod = await import('../src/audio/Sfx.js');
  return { mod, state };
}

describe('过场冲击音效', () => {
  it('cineSlam 立即一记低音 + 延迟尾音', async () => {
    const { mod, state } = await load();
    mod.sfx.cineSlam();
    expect(state.started).toBe(1);
    vi.advanceTimersByTime(200);
    expect(state.started).toBe(2);
  });

  it('cineShatter 立即碎裂高音 + 延迟低频尾音', async () => {
    const { mod, state } = await load();
    mod.sfx.cineShatter();
    expect(state.started).toBe(1);
    vi.advanceTimersByTime(300);
    expect(state.started).toBe(2);
  });

  it('音效关闭时完全静默', async () => {
    const { mod, state } = await load();
    mod.setSoundEnabled(false);
    mod.sfx.cineSlam();
    mod.sfx.cineShatter();
    vi.advanceTimersByTime(500);
    expect(state.started).toBe(0);
  });

  it('没有 AudioContext 时静默降级，不抛异常', async () => {
    const { mod } = await load(false);
    expect(() => {
      mod.sfx.cineSlam();
      mod.sfx.cineShatter();
      vi.advanceTimersByTime(500);
    }).not.toThrow();
  });
});