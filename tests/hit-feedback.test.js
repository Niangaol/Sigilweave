import { describe, it, expect } from 'vitest';
import Enemy from '../src/entities/Enemy.js';
import EffectsLayer from '../src/ui/EffectsLayer.js';

// ---------- 假 Graphics / Scene：只为让 Enemy 与 EffectsLayer 在没有 Phaser 的环境里跑 ----------
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

function fakeScene() {
  const graphics = [];
  const texts = [];
  const scene = {
    battleBounds: { left: 0, right: 4000, top: 0, bottom: 3000 },
    player: { x: 240, y: 135 },
    engine: { now: 0 },
    grid: { cells: [] },
    textures: { exists: () => false },
    anims: { exists: () => false },
    time: { now: 0 },
    graphics,
    texts,
    add: {
      graphics: () => { const g = fakeGraphics(); graphics.push(g); return g; },
      text: (x, y, str) => { const t = fakeText(x, y, str); texts.push(t); return t; },
      sprite: () => null,
      container: () => fakeText(0, 0, ''),
    },
    cameras: { main: { worldView: { x: 0, y: 0, width: 480, height: 270 } } },
  };
  return scene;
}

const makeEnemy = (hp = 100) => new Enemy(fakeScene(), { id: 'skeleton', radius: 6, color: 0xe4dcc4 }, 240, 135, { x: 240, y: 135 }, hp, 10, 8, 1);

describe('小怪受击细节动画', () => {
  it('受击后按命中方向后坐，220ms 内回到原位', () => {
    const e = makeEnemy();
    e.hitReact(1, 0, 40, 1000);
    const early = e.hitOffset(1000);
    expect(early.x).toBeGreaterThan(0);
    expect(early.flash).toBeGreaterThan(0.9);
    const mid = e.hitOffset(1100);
    expect(Math.abs(mid.x)).toBeLessThanOrEqual(Math.abs(early.x));
    const late = e.hitOffset(1220);
    expect(late.x).toBe(0);
    expect(late.y).toBe(0);
    expect(late.flash).toBe(0);
    expect(late.hitT).toBe(0);
  });

  it('从左边打就往左弹，逻辑坐标不变（只偏移绘制）', () => {
    const e = makeEnemy();
    const x0 = e.x; const y0 = e.y;
    e.hitReact(-1, 0, 20, 500);
    expect(e.hitOffset(500).x).toBeLessThan(0);
    expect(e.x).toBe(x0);
    expect(e.y).toBe(y0);
  });

  it('伤害占比越大，后坐力越大（上限 1）', () => {
    const light = makeEnemy(1000);
    light.hitReact(1, 0, 10, 0);
    const heavy = makeEnemy(100);
    heavy.hitReact(1, 0, 90, 0);
    expect(heavy.hitPower).toBeGreaterThan(light.hitPower);
    expect(heavy.hitPower).toBeLessThanOrEqual(1);
    expect(light.hitPower).toBeGreaterThanOrEqual(0.3);
    expect(Math.abs(heavy.hitOffset(0).x)).toBeGreaterThanOrEqual(Math.abs(light.hitOffset(0).x));
  });

  it('闪白是渐变，不是一刀切的黑白开关', () => {
    const e = makeEnemy();
    e.hitReact(1, 0, 20, 0);
    const f0 = e.hitOffset(0).flash;
    const f40 = e.hitOffset(40).flash;
    const f100 = e.hitOffset(100).flash;
    expect(f0).toBe(1);
    expect(f40).toBeGreaterThan(0);
    expect(f40).toBeLessThan(f0);
    expect(f100).toBeGreaterThan(0);
    expect(f100).toBeLessThan(f40);
    expect(e.hitOffset(130).flash).toBe(0);
  });

  it('血条延迟条：受伤后先留白条，约 220ms 后再快速回落', () => {
    const e = makeEnemy(100);
    e.hp = 60;                     // 模拟 applyDamage 直接扣血
    e.update(16, 1000);
    expect(e.hpChip).toBe(100);    // 白条停受伤前
    expect(e.hitChipAt).toBeGreaterThanOrEqual(1200);
    let now = 1000;
    for (let i = 0; i < 30; i++) { now += 16; e.update(16, now); } // ~480ms
    expect(e.hpChip).toBeLessThan(100);
    expect(e.hpChip).toBeGreaterThanOrEqual(60);
    for (let i = 0; i < 200; i++) { now += 16; e.update(16, now); }
    expect(e.hpChip).toBe(60);
  });

  it('takeDamage 同样驱动延迟条与受击时间', () => {
    const e = makeEnemy(100);
    e.takeDamage(25, 700);
    expect(e.hp).toBe(75);
    expect(e.hitAt).toBe(700);
    e.update(16, 700);
    expect(e.hpChip).toBe(100);
    expect(e.alive).toBe(true);
    e.takeDamage(100, 720);
    expect(e.alive).toBe(false);
  });

  it('程序化回退也有视觉外框，供索敌判断进屏', () => {
    const e = makeEnemy();
    expect(e.sprite).toBeNull();
    const ext = e.viewExtent;
    expect(ext).toBeTruthy();
    expect(ext.top).toBeLessThan(0);
    expect(ext.bottom).toBeGreaterThan(0);
  });

  it('draw 连续调用不抛错（左右抖动/闪白/血条一起画）', () => {
    const e = makeEnemy(50);
    e.hitReact(0, 1, 25, 0);
    expect(() => { for (let i = 0; i < 20; i++) e.draw(i * 16); }).not.toThrow();
  });
});

describe('命中火花 / 伤害数字 / 待机环', () => {
  it('三类新特效都能入队、画出内容并按时过期', () => {
    const scene = fakeScene();
    const fx = new EffectsLayer(scene);
    fx.hitSpark(100, 80, 1, 0, 0xffb44d, 0.9);
    fx.damageNumber(100, 60, 37, '#fff6e0', true);
    fx.hold(100, 80, 0x5ed0c8);
    expect(fx.items).toHaveLength(2);          // 飘字不进 items，直接进 texts
    expect(fx.texts).toHaveLength(1);
    expect(fx.texts[0].obj.text).toBe('37');
    for (let i = 0; i < 10; i++) fx.update(16);
    const calls = fx.g.calls.filter((c) => c[0] !== 'clear');
    expect(calls.length).toBeGreaterThan(0);
    for (let i = 0; i < 60; i++) fx.update(16);
    expect(fx.items).toHaveLength(0);
    expect(fx.texts).toHaveLength(0);
    expect(fx.texts[0]).toBeUndefined();
  });

  it('伤害数字忽略 0 / 非法数值，不会堆积空文本', () => {
    const fx = new EffectsLayer(fakeScene());
    for (const bad of [0, -5, NaN, undefined, null]) fx.damageNumber(10, 10, bad);
    expect(fx.texts).toHaveLength(0);
    fx.damageNumber(10, 10, 12.6);
    expect(fx.texts[0].obj.text).toBe('13');
  });

  it('命中火花的绘制顶点全是整数（像素风硬边）', () => {
    const scene = fakeScene();
    const fx = new EffectsLayer(scene);
    fx.hitSpark(120, 90, -1, 0.2, 0xffb44d, 0.7);
    fx.update(16);
    for (const c of fx.g.calls) {
      if (c[0] === 'fillRect') {
        expect(c.slice(1).every((v) => Number.isInteger(v))).toBe(true);
      }
    }
  });
});
