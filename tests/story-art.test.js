import { describe, expect, it } from 'vitest';
import * as storyArt from '../src/ui/story-art.js';
import { OPENING_STAGES, JOURNEY_STAGES, buildStars } from '../src/ui/story-art.js';

// 计数 stub：任何方法调用都计一条绘制指令（与 spell-fx 预算测试同思路）
function makeCounting() {
  const state = { n: 0 };
  const g = new Proxy({}, {
    get(t, k) {
      if (k === 'count') return state.n;
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

const CTX = (p, h = 270) => ({
  w: 480, h, t: Math.round(p * 6000), p, accent: 0xc9a227,
  stars: buildStars(0x9e37, 46, 480, h),
});

describe('story-art 绘制预算与确定性', () => {
  it('buildStars 固定种子确定性，坐标整数且在画布内', () => {
    const a = buildStars(0x9e37, 46, 480, 270);
    const b = buildStars(0x9e37, 46, 480, 270);
    expect(a).toEqual(b);
    expect(a).toHaveLength(46);
    for (const s of a) {
      expect(Number.isInteger(s.x)).toBe(true);
      expect(Number.isInteger(s.y)).toBe(true);
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThan(480);
      expect(s.y).toBeGreaterThanOrEqual(0);
    }
  });

  for (const stage of ['skyfall', 'contracts', 'graveyard', 'altar', 'awaken', 'title']) {
    it(stage + ' 每帧 ≤700 条指令，横竖屏确定性', () => {
      for (const h of [270, 760]) {
        for (const p of [0, 0.25, 0.5, 0.75, 1]) {
          const g1 = makeCounting();
          const g2 = makeCounting();
          OPENING_STAGES[stage](g1, CTX(p, h));
          OPENING_STAGES[stage](g2, CTX(p, h));
          expect(g1.count).toBeLessThanOrEqual(700);
          expect(g1.count).toBeGreaterThan(0);
          expect(g1.count).toBe(g2.count);
        }
      }
    });
  }
});

describe('OPENING_STAGES 完整性', () => {
  it('六个镜头舞台全部注册且为函数', () => {
    for (const id of ['skyfall', 'contracts', 'graveyard', 'altar', 'awaken', 'title']) {
      expect(typeof OPENING_STAGES[id], id).toBe('function');
    }
  });
});

describe('journey 舞台绘制预算', () => {
  for (const stage of ['swamp', 'star', 'library', 'court', 'forge', 'sunrise']) {
    it(stage + ' 每帧 ≤700 条指令，横竖屏确定性', () => {
      for (const h of [270, 760]) {
        for (const p of [0, 0.25, 0.5, 0.75, 1]) {
          const g1 = makeCounting();
          const g2 = makeCounting();
          const ctx = { w: 480, h, t: Math.round(p * 5200), p, accent: 0x7cc9a8, stars: buildStars(7, 46, 480, h) };
          JOURNEY_STAGES[stage](g1, ctx);
          JOURNEY_STAGES[stage](g2, ctx);
          expect(g1.count).toBeLessThanOrEqual(700);
          expect(g1.count).toBeGreaterThan(0);
          expect(g1.count).toBe(g2.count);
        }
      }
    });
  }
});

describe('ENDING_STAGES 完整性', () => {
  it('四个结局舞台全部注册且为函数', () => {
    expect(typeof storyArt.ENDING_STAGES).toBe('object');
    for (const id of ['release', 'quiet', 'dawn', 'credits']) {
      expect(typeof storyArt.ENDING_STAGES[id], id).toBe('function');
    }
  });
});

describe('结局舞台绘制预算与确定性', () => {
  for (const stage of ['release', 'quiet', 'dawn', 'credits']) {
    it(stage + ' 每帧 ≤700 条指令，横竖屏确定性', () => {
      for (const h of [270, 760]) {
        for (const p of [0, 0.25, 0.5, 0.75, 1]) {
          const g1 = makeCounting();
          const g2 = makeCounting();
          const ctx = CTX(p, h);
          storyArt.ENDING_STAGES[stage](g1, ctx);
          storyArt.ENDING_STAGES[stage](g2, ctx);
          expect(g1.count).toBeLessThanOrEqual(700);
          expect(g1.count).toBeGreaterThan(0);
          expect(g1.count).toBe(g2.count);
        }
      }
    });
  }
});