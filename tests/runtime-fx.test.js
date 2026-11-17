// 运行时接线单测：Projectile 与 EffectsLayer 在没有真实 Phaser 的场景里也要能跑。
// 目的不是替代浏览器验收，而是锁住「16 法术都接上了、新特效类型不会抛错、连斩字幕与护盾跟随真的在动」。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SIGILS } from '../src/data/roster.js';
import Projectile from '../src/entities/Projectile.js';
import EffectsLayer from '../src/ui/EffectsLayer.js';
import { FX_DEF_IDS } from '../src/ui/spell-fx.js';

// ---------- 假 Graphics：只记录绘制调用，不画 ----------
function fakeGraphics() {
  const calls = [];
  const g = {
    calls,
    fillStyle: (c, a) => { calls.push(['fillStyle', c, a]); return g; },
    fillRect: (x, y, w, h) => { calls.push(['fillRect', x, y, w, h]); return g; },
    fillPoints: (pts, close) => { calls.push(['fillPoints', pts, close]); return g; },
    lineStyle: (w, c, a) => { calls.push(['lineStyle', w, c, a]); return g; },
    strokePoints: (pts, close) => { calls.push(['strokePoints', pts, close]); return g; },
    clear: () => { calls.push(['clear']); return g; },
    setDepth: () => g, setScrollFactor: () => g, setVisible: () => g, destroy: () => {},
  };
  return g;
}

// ---------- 假 Text：链式 API 足够 EffectsLayer 用 ----------
function fakeText(x, y, str) {
  const t = {
    text: str, x, y, visible: true, alpha: 1, color: null, scale: 1,
    setOrigin: () => t, setDepth: () => t, setVisible: (v) => { t.visible = v; return t; },
    setScrollFactor: () => t, setAlpha: (a) => { t.alpha = a; return t; },
    setScale: (s) => { t.scale = s; return t; }, setResolution: () => t,
    setColor: (c) => { t.color = c; return t; },
    setText: (s) => { t.text = s; return t; }, destroy: () => { t.destroyed = true; },
  };
  return t;
}

function fakeScene({ player = { x: 100, y: 80 }, worldView = { x: 0, y: 0 } } = {}) {
  const graphics = [];
  const texts = [];
  const scene = {
    player,
    time: { now: 0 },
    graphics, texts,
    add: {
      graphics: () => { const g = fakeGraphics(); graphics.push(g); return g; },
      text: (x, y, str) => { const t = fakeText(x, y, str); texts.push(t); return t; },
      sprite: () => null,
      container: () => fakeText(0, 0, ''),
    },
    cameras: { main: { worldView } },
  };
  return scene;
}

const totalCalls = (g) => g.calls.filter((c) => c[0] !== 'clear').length;
// 「绘制」只算真正落几何的调用：fillStyle/lineStyle 只改状态，不产生像素。
const GEO_OPS = new Set(['fillRect', 'fillPoints', 'strokePoints']);
const drawOps = (g) => g.calls.filter((c) => GEO_OPS.has(c[0])).length;

describe('Projectile 的每法术外观', () => {
  it.each(FX_DEF_IDS)('%s 能构造、飞行、抵达且真的画了东西', (defId) => {
    const scene = fakeScene();
    const def = { id: defId, color: SIGILS[defId].color, speed: SIGILS[defId].speed };
    const p = new Projectile(scene, 60, 60, 140, 100, def, null);
    expect(p.fx.id).toBe(defId);
    expect(p.trailMax).toBeGreaterThanOrEqual(1);
    let arrived = false;
    for (let i = 0; i < 400 && !arrived; i++) arrived = p.update(16);
    expect(arrived).toBe(true);
    expect(totalCalls(p.g)).toBeGreaterThan(0);
    // 拖尾长度必须被 descriptor 截断，不能无限增长
    expect(p.trail.length).toBeLessThanOrEqual(p.trailMax);
  });

  it('未知 defId 回退旧菱形且不抛错', () => {
    const scene = fakeScene();
    const p = new Projectile(scene, 60, 60, 100, 60, { id: 'not_a_spell', color: 0xffffff, speed: 400 }, null);
    expect(p.fx.id).toBe('fallback');
    expect(() => p.update(16)).not.toThrow();
    expect(totalCalls(p.g)).toBeGreaterThan(0);
  });
});

describe('EffectsLayer 的新特效类型', () => {
  it('16 个法术的起手/命中/护盾/连接线都能画出来', () => {
    const scene = fakeScene();
    const fx = new EffectsLayer(scene);
    for (const defId of FX_DEF_IDS) {
      fx.spellCast(defId, 60, 60, -0.4);
      fx.spellImpact(defId, 160, 70, 40, -0.4);
      fx.spellWard(defId, 40);
      fx.spellLink(defId, { x: 60, y: 60 }, { x: 140, y: 90 }, 0);
    }
    expect(fx.items).toHaveLength(FX_DEF_IDS.length * 4);
    for (let i = 0; i < 40; i++) fx.update(16);
    expect(totalCalls(fx.g)).toBeGreaterThan(0);
    // 所有条目最终都会过期，不残留内存
    for (let i = 0; i < 80; i++) fx.update(16);
    expect(fx.items).toHaveLength(0);
  });

  it('护盾环跟着玩家走，不在施法点留残影', () => {
    const scene = fakeScene({ player: { x: 100, y: 80 } });
    const fx = new EffectsLayer(scene);
    fx.spellWard('aegis_ring', 55);
    fx.update(16);
    const first = fx.g.calls.filter((c) => c[0] === 'fillPoints');
    expect(first.length).toBeGreaterThan(0);
    const box = (calls) => {
      const xs = []; const ys = [];
      for (const c of calls) for (const p of c[1]) { xs.push(p.x); ys.push(p.y); }
      return { minX: Math.min(...xs), minY: Math.min(...ys) };
    };
    const a = box(first);
    scene.player.x = 180; scene.player.y = 140;
    fx.g.calls.length = 0;
    fx.update(16);
    const b = box(fx.g.calls.filter((c) => c[0] === 'fillPoints'));
    expect(Math.abs(b.minX - a.minX)).toBeGreaterThan(30);
    expect(Math.abs(b.minY - a.minY)).toBeGreaterThan(25);
  });

  it('连斩字幕出现、变色、并在 1.5 秒后消失', () => {
    const scene = fakeScene();
    const fx = new EffectsLayer(scene);
    const label = fx.streakLabel;
    expect(label.visible).toBe(false);

    fx.killStreak(3);
    fx.update(16);
    expect(label.visible).toBe(true);
    expect(label.text).toBe('连斩 ×3');

    fx.killStreak(25);
    fx.update(16);
    expect(label.text).toBe('连斩 ×25');
    expect(label.scale).toBeGreaterThan(1);
    expect(label.color).toBeTruthy();

    // 超过 1.5 秒没有新击杀 → 自动隐藏
    for (let i = 0; i < 120; i++) fx.update(16);
    expect(label.visible).toBe(false);
  });

  it('击杀爆点存在且会过期，不会无限堆积', () => {
    const scene = fakeScene();
    const fx = new EffectsLayer(scene);
    for (let i = 0; i < 30; i++) fx.killBurst(100 + i, 80);
    expect(fx.items).toHaveLength(30);
    for (let i = 0; i < 40; i++) fx.update(16);
    expect(fx.items).toHaveLength(0);
  });
});

// ---------- 破盾特效 ----------
describe('EffectsLayer 的破盾特效', () => {
  it('shieldBreak 真的画、单帧绘制 ≤14 条、400ms 内散尽', () => {
    const scene = fakeScene();
    const fx = new EffectsLayer(scene);
    const before = fx.items.length;
    expect(() => fx.shieldBreak(120, 90)).not.toThrow();
    expect(fx.items.length).toBe(before + 1);

    const item = fx.items[fx.items.length - 1];
    expect(item.kind).toBe('shieldBreak');
    expect(item.dur).toBeLessThanOrEqual(420);        // spec §7：≤420ms
    expect(item.shards.length).toBeGreaterThanOrEqual(4);
    expect(item.shards.length).toBeLessThanOrEqual(8);

    // 逐帧统计：每帧只画这一个条目，几何绘制条目数即该特效预算
    let maxPerFrame = 0;
    let minPerFrame = Infinity;
    for (let i = 0; i < 30; i++) {
      fx.g.calls.length = 0;
      fx.update(16);
      const n = drawOps(fx.g);
      if (n > 0) { maxPerFrame = Math.max(maxPerFrame, n); minPerFrame = Math.min(minPerFrame, n); }
    }
    expect(maxPerFrame).toBeGreaterThanOrEqual(8);    // 不是空特效
    expect(maxPerFrame).toBeLessThanOrEqual(14);      // 绘制预算上限
    expect(minPerFrame).toBeGreaterThanOrEqual(8);    // spec §7：8~12 次绘制
    // 30 帧 = 480ms > 400ms，条目必须全部散尽，不留内存
    expect(fx.items).toHaveLength(0);
  });

  it('同位置重播方向一致（确定性，不用 Math.random）', () => {
    const a = new EffectsLayer(fakeScene());
    const b = new EffectsLayer(fakeScene());
    a.shieldBreak(200, 100);
    b.shieldBreak(200, 100);
    expect(a.items[0].shards).toEqual(b.items[0].shards);
    expect(a.items[0].shards[0].vx).toBeCloseTo(b.items[0].shards[0].vx, 10);
  });
});

// ---------- 近战弧线 / 召唤登场 ----------
describe('EffectsLayer 的近战与召唤特效', () => {
  it('slash 画 2px 硬边弧线 + 尖端白点，260ms 内散尽', () => {
    const scene = fakeScene();
    const fx = new EffectsLayer(scene);
    expect(() => fx.slash(120, 90, -Math.PI / 4, 30, Math.PI / 2, 0xa83b39)).not.toThrow();
    const item = fx.items[fx.items.length - 1];
    expect(item.kind).toBe('slash');
    expect(item.dur).toBe(260);
    expect(item.range).toBe(30);
    expect(item.arc).toBeCloseTo(Math.PI / 2, 6);

    fx.g.calls.length = 0;
    fx.update(16);
    const rects = fx.g.calls.filter((c) => c[0] === 'fillRect');
    expect(rects.length).toBeGreaterThanOrEqual(7);     // 至少 6 段弧 + 1 个尖端
    expect(rects.length).toBeLessThanOrEqual(20);       // 绘制预算
    // 弧上每个点都是 2×2 硬边块（尖端白点也是 2×2）
    for (const r of rects) { expect(r[3]).toBe(2); expect(r[4]).toBe(2); }
    for (let i = 0; i < 20; i++) fx.update(16);
    expect(fx.items).toHaveLength(0);                   // 320ms > 260ms
  });

  it('slash 缺省参数也有合法弧线（不 NaN、不画到屏幕外）', () => {
    const scene = fakeScene();
    const fx = new EffectsLayer(scene);
    fx.slash(100, 80);
    const item = fx.items[fx.items.length - 1];
    expect(item.angle).toBe(0);
    expect(item.range).toBeGreaterThan(0);
    expect(item.arc).toBeGreaterThan(0);
    fx.g.calls.length = 0;
    fx.update(16);
    const rects = fx.g.calls.filter((c) => c[0] === 'fillRect');
    for (const r of rects) {
      expect(Number.isFinite(r[1])).toBe(true);
      expect(Number.isFinite(r[2])).toBe(true);
    }
  });

  it('summonPulse：炮台菱形环 / 符文裂开的菱形都画、400ms 内散尽', () => {
    const scene = fakeScene();
    const fx = new EffectsLayer(scene);
    fx.summonPulse(60, 60, 'turret', 0xffb44d);
    fx.summonPulse(200, 90, 'rune', 0xa83b39);
    const [turret, rune] = fx.items.slice(-2);
    expect(turret.rune).toBe(false);
    expect(rune.rune).toBe(true);
    expect(turret.dur).toBe(400);
    expect(rune.dur).toBe(400);

    fx.g.calls.length = 0;
    fx.update(16);
    expect(drawOps(fx.g)).toBeGreaterThanOrEqual(4);   // 两枚都在画
    // 符文分支：横向裂纹用 fillRect，炮台分支：菱形环用 fillPoints
    expect(fx.g.calls.some((c) => c[0] === 'fillRect')).toBe(true);
    expect(fx.g.calls.some((c) => c[0] === 'fillPoints')).toBe(true);
    for (let i = 0; i < 30; i++) fx.update(16);
    expect(fx.items).toHaveLength(0);                   // 480ms > 400ms
  });

  it('近战/召唤特效不用 Math.random（像素语言确定性）', () => {
    const rnd = vi.spyOn(Math, 'random');
    const fx = new EffectsLayer(fakeScene());
    fx.slash(100, 80, 0.5, 26, Math.PI / 3, 0xa83b39);
    fx.summonPulse(100, 80, 'rune', 0xa83b39);
    for (let i = 0; i < 30; i++) fx.update(16);
    expect(rnd).not.toHaveBeenCalled();
    rnd.mockRestore();
  });
});

// ---------- 护盾音效：无声环境静默降级 + 节流 ----------
function makeFakeAudio() {
  const state = { started: 0, freqs: [], gains: [] };
  class FakeParam {
    constructor(rec) { this.value = 1; this.rec = rec; }
    setValueAtTime(v) { this.value = v; if (this.rec) this.rec.push(v); }
    exponentialRampToValueAtTime(v) { this.value = v; }
  }
  class FakeNode {
    constructor(freqs, gains) {
      this.gain = new FakeParam(gains);
      this.frequency = new FakeParam(freqs);
    }
    connect() {} disconnect() {}
    start() { state.started++; }
    stop() {}
  }
  class FakeCtx {
    constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
    createOscillator() { return new FakeNode(state.freqs, null); }
    createGain() { return new FakeNode(null, state.gains); }
    resume() { return Promise.resolve(); }
  }
  return { state, FakeCtx };
}

describe('Sfx 护盾音效', () => {
  beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); delete globalThis.window; });

  it('shieldHit 160Hz/gain≤0.02/45ms 节流、shieldBreak 两声下坠且总长 ≤180ms', async () => {
    const { state, FakeCtx } = makeFakeAudio();
    globalThis.window = { AudioContext: FakeCtx };
    const { sfx } = await import('../src/audio/Sfx.js');
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);

    sfx.shieldHit();
    expect(state.started).toBe(1);
    expect(state.freqs[0]).toBe(160);            // spec §7：160Hz
    expect(state.gains[0]).toBeLessThanOrEqual(0.02);
    sfx.shieldHit();                 // 同一毫秒第二下被节流吃掉
    now.mockReturnValue(1044);
    sfx.shieldHit();                 // 44ms：仍在节流窗口内
    expect(state.started).toBe(1);
    now.mockReturnValue(1045);
    sfx.shieldHit();                 // 满 45ms：放行
    expect(state.started).toBe(2);

    sfx.shieldBreak();
    expect(state.started).toBe(3);   // 第一声立即
    vi.advanceTimersByTime(55);
    expect(state.started).toBe(4);   // 第二声 55ms 后（两声都是下坠）
    expect(state.freqs.slice(-2)).toEqual([420, 170]);
    expect(Math.max(...state.gains)).toBeLessThanOrEqual(0.03);
    vi.advanceTimersByTime(200);
    expect(state.started).toBe(4);   // 没有第三声，总长 ≤180ms
  });

  it('没有 AudioContext 时 shieldHit/shieldBreak 静默降级，不抛错', async () => {
    globalThis.window = {};
    const { sfx } = await import('../src/audio/Sfx.js');
    expect(() => {
      sfx.shieldHit();
      sfx.shieldHit();
      sfx.shieldBreak();
      vi.advanceTimersByTime(300);
    }).not.toThrow();
  });
});

// ---------- 敌方抬手 / 近战 / 召唤音效 ----------
describe('Sfx 敌方技能音效', () => {
  beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); delete globalThis.window; });

  it('enemyCast / meleeSwing 低声压、45ms 节流', async () => {
    const { state, FakeCtx } = makeFakeAudio();
    globalThis.window = { AudioContext: FakeCtx };
    const { sfx } = await import('../src/audio/Sfx.js');
    const now = vi.spyOn(performance, 'now').mockReturnValue(2000);

    sfx.enemyCast();
    expect(state.started).toBe(1);
    expect(state.freqs[0]).toBe(180);
    expect(Math.max(...state.gains)).toBeLessThanOrEqual(0.02);
    sfx.enemyCast();                          // 同一毫秒：节流吃掉
    now.mockReturnValue(2044);
    sfx.enemyCast();                          // 44ms：仍被节流
    expect(state.started).toBe(1);
    now.mockReturnValue(2045);
    sfx.enemyCast();                          // 满 45ms：放行
    expect(state.started).toBe(2);

    sfx.meleeSwing();
    expect(state.started).toBe(3);
    expect(state.freqs.at(-1)).toBe(520);     // 高频起手、向 150Hz 扫
    expect(Math.max(...state.gains)).toBeLessThanOrEqual(0.02);
    sfx.meleeSwing();                         // 与 enemyCast 各自独立节流
    expect(state.started).toBe(3);
  });

  it('summon 是两段上行、总长 ≤130ms、单声 gain ≤0.02', async () => {
    const { state, FakeCtx } = makeFakeAudio();
    globalThis.window = { AudioContext: FakeCtx };
    const { sfx } = await import('../src/audio/Sfx.js');
    vi.spyOn(performance, 'now').mockReturnValue(3000);

    sfx.summon();
    expect(state.started).toBe(1);
    expect(state.freqs[0]).toBe(340);
    vi.advanceTimersByTime(55);               // 未到 60ms：第二声还没来
    expect(state.started).toBe(1);
    vi.advanceTimersByTime(10);
    expect(state.started).toBe(2);            // 第二声 510Hz
    expect(state.freqs[1]).toBe(510);
    expect(Math.max(...state.gains)).toBeLessThanOrEqual(0.02);
    vi.advanceTimersByTime(300);
    expect(state.started).toBe(2);            // 没有第三声
  });

  it('没有 AudioContext 时三个新音效都静默降级', async () => {
    globalThis.window = {};
    const { sfx } = await import('../src/audio/Sfx.js');
    expect(() => {
      sfx.enemyCast();
      sfx.meleeSwing();
      sfx.summon();
      vi.advanceTimersByTime(300);
    }).not.toThrow();
  });
});
