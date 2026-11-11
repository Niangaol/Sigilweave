import { describe, it, expect } from 'vitest';
import ExpMote, { EXP_MOTE } from '../src/entities/ExpMote.js';
import EffectsLayer from '../src/ui/EffectsLayer.js';

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

function fakeScene() {
  const graphics = [];
  const scene = {
    time: { now: 0 },
    graphics,
    add: {
      graphics: () => { const g = fakeGraphics(); graphics.push(g); return g; },
      text: (x, y, str) => {
        const t = {
          text: str, x, y, visible: true, alpha: 1, color: null, scale: 1,
          setOrigin: () => t, setDepth: () => t, setVisible: (v) => { t.visible = v; return t; },
          setScrollFactor: () => t, setAlpha: (a) => { t.alpha = a; return t; },
          setScale: (s) => { t.scale = s; return t; }, setResolution: () => t,
          setColor: (c) => { t.color = c; return t; },
          setText: (s) => { t.text = s; return t; }, destroy: () => { t.destroyed = true; },
        };
        return t;
      },
    },
    cameras: { main: { worldView: { x: 0, y: 0, width: 480, height: 270 } } },
  };
  return scene;
}

const player = (x = 240, y = 135) => ({ x, y, alive: true });

describe('经验粒子', () => {
  it('先向外炸散，再追踪玩家，进入拾取半径后被吸收', () => {
    const mote = new ExpMote(fakeScene(), 240, 135, 1, 1);
    const x0 = mote.x, y0 = mote.y;
    mote.update(100, player(240, 135));
    expect(mote.homing).toBe(false);
    expect(Math.hypot(mote.x - x0, mote.y - y0)).toBeGreaterThan(1);
    mote.update(200, player(240, 135));
    expect(mote.homing).toBe(true);
    // 追踪：从任意距离都会靠近玩家
    const far = new ExpMote(fakeScene(), 600, 500, 1, 1);
    const d0 = Math.hypot(far.x - 240, far.y - 135);
    for (let i = 0; i < 10; i++) far.update(100, player(240, 135));
    expect(Math.hypot(far.x - 240, far.y - 135)).toBeLessThan(d0);
    // 近距离开拾取
    const near = new ExpMote(fakeScene(), 245, 135, 1, 1);
    let picked = false;
    for (let i = 0; i < 40 && !picked; i++) picked = near.update(50, player(240, 135));
    expect(picked).toBe(true);
    expect(near.alive).toBe(false);
  });

  it('同一出生位置的两颗粒子轨迹一致（确定性，不用 Math.random）', () => {
    const a = new ExpMote(fakeScene(), 300, 200, 1, 1);
    const b = new ExpMote(fakeScene(), 300, 200, 1, 1);
    for (let i = 0; i < 12; i++) { a.update(16, player()); b.update(16, player()); }
    expect(a.x).toBeCloseTo(b.x, 6);
    expect(a.y).toBeCloseTo(b.y, 6);
    expect(a.vx).toBeCloseTo(b.vx, 6);
    expect(a.vy).toBeCloseTo(b.vy, 6);
  });

  it('保留价值与倍率；非法值有安全兜底', () => {
    const mote = new ExpMote(fakeScene(), 0, 0, 3, 2);
    expect(mote.value).toBe(3);
    expect(mote.mul).toBe(2);
    const bad = new ExpMote(fakeScene(), 0, 0, NaN, -1);
    expect(bad.value).toBe(1);
    expect(bad.mul).toBe(1);
    expect(() => bad.update(16, null)).not.toThrow();
  });

  it('池化复用会重置阶段、速度与可见性', () => {
    const mote = new ExpMote(fakeScene(), 10, 10, 1, 1);
    for (let i = 0; i < 30; i++) mote.update(50, player(240, 135));
    const t = mote.t;
    mote.revive(100, 100, 2, 1.5);
    expect(mote.t).toBe(0);
    expect(mote.homing).toBe(false);
    expect(mote.value).toBe(2);
    expect(mote.mul).toBe(1.5);
    expect(mote.alive).toBe(true);
    expect(t).toBeGreaterThan(0);
  });

  it('绘制全部是整数像素，不抛错', () => {
    const scene = fakeScene();
    const mote = new ExpMote(scene, 123.4, 56.7, 1, 1);
    mote.update(33, player(240, 135));
    const g = scene.graphics[0];
    for (const c of g.calls) {
      if (c[0] === 'fillRect') expect(c.slice(1).every(Number.isInteger)).toBe(true);
      if (c[0] === 'fillPoints') {
        for (const p of c[1]) {
          expect(Number.isInteger(p.x)).toBe(true);
          expect(Number.isInteger(p.y)).toBe(true);
        }
      }
    }
    expect(EXP_MOTE.pickRadius).toBeGreaterThan(0);
  });
});

describe('死亡爆散与经验吸收特效', () => {
  it('普通 10 块碎片、精英 16 块，且都能按时过期', () => {
    const scene = fakeScene();
    const fx = new EffectsLayer(scene);
    fx.deathScatter(100, 80, 0xe4dcc4, { elite: false });
    fx.deathScatter(140, 80, 0xc9a227, { elite: true });
    expect(fx.items[0].shards).toHaveLength(12);
    expect(fx.items[1].shards).toHaveLength(18);
    const g = scene.graphics[0];
    for (let i = 0; i < 10; i++) fx.update(16);
    expect(g.calls.filter((c) => c[0] !== 'clear').length).toBeGreaterThan(0);
    for (let i = 0; i < 80; i++) fx.update(16);
    expect(fx.items).toHaveLength(0);
  });

  it('碎片顶点整数、数量受控；同参数两次播放一致', () => {
    const run = () => {
      const scene = fakeScene();
      const fx = new EffectsLayer(scene);
      fx.deathScatter(200, 120, 0xe4dcc4, { elite: true });
      fx.update(48);
      return scene.graphics[0].calls;
    };
    const a = run();
    const b = run();
    expect(a).toEqual(b);
    const rects = a.filter((c) => c[0] === 'fillRect');
    expect(rects.length).toBeLessThanOrEqual(120);
    for (const c of rects) expect(c.slice(1).every(Number.isInteger)).toBe(true);
  });

  it('经验吸收小环很快消失，不堆积', () => {
    const fx = new EffectsLayer(fakeScene());
    for (let i = 0; i < 20; i++) fx.expPop(100 + i, 80);
    expect(fx.items).toHaveLength(20);
    for (let i = 0; i < 15; i++) fx.update(16);
    expect(fx.items).toHaveLength(0);
  });
});
