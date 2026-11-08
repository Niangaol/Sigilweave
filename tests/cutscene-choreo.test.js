import { describe, expect, it } from 'vitest';
import * as choreoMod from '../src/ui/cutscene-choreo.js';
import { buildTimeline, phaseAt, buildCard } from '../src/data/cinematics.js';
import { buildDust, easeInOutCubic, clamp01 } from '../src/ui/cinematic-art.js';

// 计数 stub：任何方法调用都计一条绘制指令，非有限坐标直接抛错
function makeCounting() {
  const state = { n: 0 };
  const g = new Proxy({}, {
    get(t, k) {
      if (k === 'count') return state.n;
      if (k === 'clear') return () => { state.n = 0; return g; };
      return (...args) => {
        state.n++;
        for (const a of args) {
          if (typeof a === 'number' && !Number.isFinite(a)) throw new Error('非有限坐标: ' + String(a));
        }
        return g;
      };
    },
  });
  return g;
}

const fakeText = () => ({ setAlpha() { return this; }, setY() { return this; }, setOrigin() { return this; } });

function makeScene(kind, act) {
  const card = {
    setAlpha() { return this; }, setY() { return this; },
    titleText: fakeText(),
    titleChars: [fakeText(), fakeText(), fakeText(), fakeText()],
    statValues: [fakeText(), fakeText(), fakeText(), fakeText()],
  };
  return {
    W: 480, H: 270, cx: 240, cy: 135,
    stageG: makeCounting(), sealG: makeCounting(), dustG: makeCounting(), fxG: makeCounting(),
    dust: buildDust(7, 44, 480, 270),
    card, cardData: buildCard(kind, act, { elapsedMs: 123000, kills: 9, triggers: 20, combos: 2 }),
    options: { kind, act },
  };
}

function ctxAt(elapsed, tl) {
  const phase = phaseAt(elapsed, tl);
  const cover = phase.phase === 'cover' ? phase.p : phase.phase === 'hold' ? 1 : phase.phase === 'reveal' ? 1 - phase.p : 0;
  return { phase, veil: easeInOutCubic(cover), accent: 0xc9a227, tint: 0x241c3a, elapsed, tl };
}

const KINDS = ['boot', 'sigil', 'act', 'clear', 'death', 'victory', 'retry', 'return'];

describe('createChoreo 覆盖', () => {
  it('journey 返回 null（走场景自有分支），其余每类都有编舞', () => {
    expect(typeof choreoMod.createChoreo).toBe('function');
    expect(choreoMod.createChoreo('journey', 2)).toBe(null);
    for (const kind of KINDS) {
      const c = choreoMod.createChoreo(kind, 2);
      expect(typeof c?.draw, kind).toBe('function');
    }
  });
});

describe('编舞绘制预算与确定性', () => {
  for (const kind of KINDS) {
    it(kind + ' 全阶段最坏帧 ≤700 指令且确定', () => {
      const tl = buildTimeline(kind);
      const act = kind === 'act' || kind === 'clear' ? 3 : 1;
      const points = [0, tl.coverMs * 0.5, tl.coverMs, tl.coverMs + tl.holdMs * 0.3,
        tl.coverMs + tl.holdMs * 0.6, tl.revealAt, tl.revealAt + tl.revealMs * 0.5, tl.totalMs - 1];
      for (const elapsed of points) {
        const s1 = makeScene(kind, act);
        const s2 = makeScene(kind, act);
        const c1 = choreoMod.createChoreo(kind, act);
        const c2 = choreoMod.createChoreo(kind, act);
        const ctx = ctxAt(elapsed, tl);
        c1.draw(s1, ctx);
        c2.draw(s2, ctx);
        const n1 = s1.stageG.count + s1.sealG.count + s1.dustG.count + s1.fxG.count;
        const n2 = s2.stageG.count + s2.sealG.count + s2.dustG.count + s2.fxG.count;
        expect(n1, kind + '@' + elapsed).toBeGreaterThan(0);
        expect(n1, kind + '@' + elapsed).toBeLessThanOrEqual(700);
        expect(n1, kind + '@' + elapsed).toBe(n2);
      }
    });
  }
});