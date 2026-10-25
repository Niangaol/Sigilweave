// 运行时接线单测：Projectile 与 EffectsLayer 在没有真实 Phaser 的场景里也要能跑。
// 目的不是替代浏览器验收，而是锁住「16 法术都接上了、新特效类型不会抛错、连斩字幕与护盾跟随真的在动」。
import { describe, it, expect } from 'vitest';
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
