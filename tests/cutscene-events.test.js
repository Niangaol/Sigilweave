import { describe, expect, it } from 'vitest';
import { boot, sigil, retry, returnTo as ret, SHORT_EVENTS, getShortEvent } from '../src/ui/cine-beats/short.js';
import { act, clear, death, victory, BATTLE_EVENTS, getBattleEvent } from '../src/ui/cine-beats/battle.js';

function rec() {
  const ops = [];
  return {
    ops,
    fillStyle(c, a = 1) { this._c = c; this._a = a; return this; },
    lineStyle(w, c, a = 1) { this._c = c; this._a = a; return this; },
    fillRect(x, y, w, h) { ops.push(['r', x, y, w, h, this._c, this._a]); },
    lineBetween(x1, y1, x2, y2) { ops.push(['l', x1, y1, x2, y2, this._c, this._a]); },
    strokePoints() { ops.push(['p']); },
    fillPoints() { ops.push(['p']); },
  };
}
function makeScene() {
  const stageG = rec(), sealG = rec(), dustG = rec(), fxG = rec();
  return { scene: { stageG, sealG, dustG, fxG }, all: [stageG, sealG, dustG, fxG] };
}
const mkCtx = (holdP, over = {}) => ({
  w: 480, h: 270, holdP, phase: 'hold', seed: 7,
  accent: 0xc9a227, tint: 0x332b4a, act: 1,
  anchors: { seal: { x: 240, y: 108, r: 43 }, nail: { x: 240, y: 184, r: 5 } },
  ...over,
});

const KINDS = { boot, sigil, retry, return: ret };

describe('四类短过场三拍事件', () => {
  it('四类都注册在 SHORT_EVENTS 里，beats 区间单调', () => {
    Object.keys(KINDS).forEach((k) => {
      expect(SHORT_EVENTS[k]).toBe(KINDS[k]);
      expect(getShortEvent(k)).toBe(KINDS[k]);
      const { prepare, action, result } = KINDS[k].beats;
      const [a, b] = prepare, [c, d] = action, [e, f] = result;
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(b);
      expect(b).toBeLessThanOrEqual(c);
      expect(c).toBeLessThan(d);
      expect(d).toBeLessThanOrEqual(e);
      expect(e).toBeLessThan(f);
      expect(f).toBeLessThanOrEqual(1);
    });
  });

  it.each(Object.keys(KINDS))('%s：holdP 每档 30–520 指令', (k) => {
    for (const p of [0, 0.2, 0.4, 0.6, 0.8, 0.9, 1]) {
      const { scene, all } = makeScene();
      KINDS[k].draw(scene, mkCtx(p));
      const n = all.reduce((s, g) => s + g.ops.length, 0);
      expect(n, k + ' @' + p).toBeGreaterThanOrEqual(30);
      expect(n, k + ' @' + p).toBeLessThanOrEqual(520);
    }
  });

  it.each(Object.keys(KINDS))('%s：同参两次绘制序列完全一致', (k) => {
    const a = makeScene();
    KINDS[k].draw(a.scene, mkCtx(0.66));
    const b = makeScene();
    KINDS[k].draw(b.scene, mkCtx(0.66));
    expect(a.all.map(g => g.ops)).toEqual(b.all.map(g => g.ops));
  });

  it.each(Object.keys(KINDS))('%s：结果拍残留非空且稳定，准备拍为空', (k) => {
    const ev = KINDS[k];
    const [e] = ev.beats.result;
    expect(ev.residueAt(0)).toEqual([]);
    expect(ev.residueAt(0.1)).toEqual([]);
    expect(ev.residueAt(e)).not.toEqual([]);
    expect(ev.residueAt(1)).toEqual(ev.residueAt(0.9));
    expect(ev.residueAt(0.9)).toEqual(ev.residueAt(Math.min(1, e + 0.05)));
  });

  it.each(Object.keys(KINDS))('%s：只碰四个活动图层', (k) => {
    const { scene } = makeScene();
    let touched = new Set();
    for (const key of Object.keys(scene)) {
      const g = scene[key];
      const wrap = new Proxy(g, {
        get(t, p) {
          if (p === 'ops') return t.ops;
          const v = t[p];
          if (typeof v !== 'function') return v;
          return (...args) => { touched.add(key); return v.apply(t, args); };
        },
      });
      scene[key] = wrap;
    }
    KINDS[k].draw(scene, mkCtx(0.5));
    touched.forEach((key) => expect(['stageG', 'sealG', 'dustG', 'fxG']).toContain(key));
  });
});

const BATTLE = { act, clear, death, victory };

describe('四类战斗过场三拍事件', () => {
  it('四类都注册在 BATTLE_EVENTS 里，beats 区间单调', () => {
    Object.keys(BATTLE).forEach((k) => {
      expect(BATTLE_EVENTS[k]).toBe(BATTLE[k]);
      expect(getBattleEvent(k)).toBe(BATTLE[k]);
      const [a, b] = BATTLE[k].beats.prepare;
      const [c, d] = BATTLE[k].beats.action;
      const [e, f] = BATTLE[k].beats.result;
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(b);
      expect(b).toBeLessThanOrEqual(c);
      expect(c).toBeLessThan(d);
      expect(d).toBeLessThanOrEqual(e);
      expect(e).toBeLessThan(f);
      expect(f).toBeLessThanOrEqual(1);
    });
  });

  it.each(Object.keys(BATTLE))('%s：holdP 每档 30–520 指令（八类一致）', (k) => {
    for (const p of [0, 0.2, 0.4, 0.6, 0.8, 0.9, 1]) {
      const { scene, all } = makeScene();
      BATTLE[k].draw(scene, mkCtx(p));
      const n = all.reduce((s, g) => s + g.ops.length, 0);
      expect(n, k + ' @' + p).toBeGreaterThanOrEqual(30);
      expect(n, k + ' @' + p).toBeLessThanOrEqual(520);
    }
  });

  it.each(Object.keys(BATTLE))('%s：同参两次绘制序列完全一致', (k) => {
    const a = makeScene(); BATTLE[k].draw(a.scene, mkCtx(0.72));
    const b = makeScene(); BATTLE[k].draw(b.scene, mkCtx(0.72));
    expect(a.all.map(g => g.ops)).toEqual(b.all.map(g => g.ops));
  });

  it.each(Object.keys(BATTLE))('%s：结果拍残留稳定，准备拍为空', (k) => {
    const ev = BATTLE[k];
    const [e] = ev.beats.result;
    expect(ev.residueAt(0)).toEqual([]);
    expect(ev.residueAt(e)).not.toEqual([]);
    expect(ev.residueAt(1)).toEqual(ev.residueAt(0.95));
    expect(ev.residueAt(0.95)).toEqual(ev.residueAt(Math.min(1, e + 0.02)));
  });

  it('act 的死亡/清除类不画大符环（≤90 段）', () => {
    const { scene, all } = makeScene();
    clear.draw(scene, mkCtx(0.9));
    expect(all[1].ops.length).toBeLessThanOrEqual(90);
    const d = makeScene();
    death.draw(d.scene, mkCtx(0.9));
    expect(d.all[1].ops.length).toBeLessThanOrEqual(90);
  });
});
