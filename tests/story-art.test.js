import { describe, expect, it } from 'vitest';
import * as storyArt from '../src/ui/story-art.js';
import { OPENING_STAGES, JOURNEY_STAGES, buildStars } from '../src/ui/story-art.js';
import { createRaster } from '../scripts/lib/raster.mjs';

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
// ── 静态三层布景：预算 / 确定性 / 覆盖率 ───────────────────────────────
// 分层的意义是「预绘制一次」：单带 ≤1300、单幕合计 ≤3200；同一参数两次逐条一致。
const BANDS = ['back', 'mid', 'fore'];

function drawStatic(set, stage, L) {
  const counts = {};
  const sum = BANDS.reduce((acc, band) => {
    const g = makeCounting();
    set[stage][band](g, L);
    counts[band] = g.count;
    return acc + g.count;
  }, 0);
  return { counts, sum };
}

// 渲染三层叠图，统计「明显不是底色」的像素比例（ink ratio）。
// 取出现最多的颜色当底色：纯夜空若占满画幅不算墨量，只有真正画了东西的像素才算。
function inkRatio(set, stage, L) {
  const r = createRaster(L.w, L.h, 0x000000);
  for (const band of BANDS) set[stage][band](r.g, L);
  const hist = new Map();
  for (let i = 0; i < L.w * L.h; i++) {
    const o = i * 4;
    const key = (r.buffer[o] << 16) | (r.buffer[o + 1] << 8) | r.buffer[o + 2];
    hist.set(key, (hist.get(key) || 0) + 1);
  }
  let mode = 0;
  for (const n of hist.values()) mode = Math.max(mode, n);
  return 1 - mode / (L.w * L.h);
}

describe('JOURNEY_STATIC 六幕三层', () => {
  const stages = ['swamp', 'star', 'library', 'court', 'forge', 'sunrise'];
  it('六幕都有 back/mid/fore 三个绘制函数', () => {
    expect(typeof storyArt.JOURNEY_STATIC).toBe('object');
    expect(typeof storyArt.journeyLayout).toBe('function');
    for (const stage of stages) {
      const s = storyArt.JOURNEY_STATIC[stage];
      expect(s, stage).toBeTruthy();
      for (const band of BANDS) expect(typeof s[band], stage + '.' + band).toBe('function');
    }
  });
  for (const stage of stages) {
    it(stage + ' 单带 ≤1300、合计 ≤3200、同参确定、覆盖 ≥0.5', () => {
      for (const h of [270, 760]) {
        const L = storyArt.journeyLayout(stage, 480, h);
        const a = drawStatic(storyArt.JOURNEY_STATIC, stage, L);
        const b = drawStatic(storyArt.JOURNEY_STATIC, stage, L);
        for (const band of BANDS) {
          expect(a.counts[band], band).toBeGreaterThan(20);
          expect(a.counts[band], band).toBeLessThanOrEqual(1300);
        }
        expect(a.sum).toBeLessThanOrEqual(3200);
        expect(a.counts).toEqual(b.counts);
        expect(inkRatio(storyArt.JOURNEY_STATIC, stage, L)).toBeGreaterThanOrEqual(0.5);
      }
    });
  }
});

describe('OPENING_STATIC 六镜三层', () => {
  const shots = ['skyfall', 'contracts', 'graveyard', 'altar', 'awaken', 'title'];
  it('六镜都有 back/mid/fore 三个绘制函数', () => {
    expect(typeof storyArt.OPENING_STATIC).toBe('object');
    for (const shot of shots) {
      for (const band of BANDS) expect(typeof storyArt.OPENING_STATIC[shot][band], shot + '.' + band).toBe('function');
    }
  });
  for (const shot of shots) {
    it(shot + ' 单带 ≤1300、合计 ≤3200、同参确定、覆盖 ≥0.5', () => {
      for (const h of [270, 760]) {
        const L = storyArt.storyLayout(480, h);
        const a = drawStatic(storyArt.OPENING_STATIC, shot, L);
        const b = drawStatic(storyArt.OPENING_STATIC, shot, L);
        for (const band of BANDS) {
          expect(a.counts[band], band).toBeGreaterThan(20);
          expect(a.counts[band], band).toBeLessThanOrEqual(1300);
        }
        expect(a.sum).toBeLessThanOrEqual(3200);
        expect(a.counts).toEqual(b.counts);
        expect(inkRatio(storyArt.OPENING_STATIC, shot, L)).toBeGreaterThanOrEqual(0.5);
      }
    });
  }
});

describe('ENDING_STATIC 四镜三层', () => {
  const shots = ['release', 'quiet', 'dawn', 'credits'];
  it('四镜都有 back/mid/fore 三个绘制函数', () => {
    expect(typeof storyArt.ENDING_STATIC).toBe('object');
    for (const shot of shots) {
      for (const band of BANDS) expect(typeof storyArt.ENDING_STATIC[shot][band], shot + '.' + band).toBe('function');
    }
  });
  for (const shot of shots) {
    it(shot + ' 单带 ≤1300、合计 ≤3200、同参确定、覆盖 ≥0.5', () => {
      for (const h of [270, 760]) {
        const L = storyArt.storyLayout(480, h);
        const a = drawStatic(storyArt.ENDING_STATIC, shot, L);
        const b = drawStatic(storyArt.ENDING_STATIC, shot, L);
        for (const band of BANDS) {
          expect(a.counts[band], band).toBeGreaterThan(20);
          expect(a.counts[band], band).toBeLessThanOrEqual(1300);
        }
        expect(a.sum).toBeLessThanOrEqual(3200);
        expect(a.counts).toEqual(b.counts);
        expect(inkRatio(storyArt.ENDING_STATIC, shot, L)).toBeGreaterThanOrEqual(0.5);
      }
    });
  }
});
// ── 三处目检返工的构图要点：软渲染抽样，锁住「东西真的画出来了」 ─────────
// 起因：契约印被读成齿轮、觉醒符环铺满屏、星陨王庭的王座读成紫方块。
// 这些是构图问题，预算测试看不出来，只能用像素抽样兜底。
describe('三处返工的构图要点', () => {
  const W = 480;
  const lum = (r, x, y) => {
    const o = (y * W + x) * 4;
    return r.buffer[o] + r.buffer[o + 1] + r.buffer[o + 2];
  };

  it('star 中景王座有实体（高背 + 座面 + 三级台基）', () => {
    for (const h of [270, 760]) {
      const L = storyArt.journeyLayout('star', W, h);
      const r = createRaster(W, h, 0x000000);
      storyArt.JOURNEY_STATIC.star.mid(r.g, L);
      const u = L.u;
      const y0 = Math.max(0, L.ground - Math.round(76 * u));
      let lit = 0;
      for (let y = y0; y < Math.min(h, L.ground); y++) {
        for (let x = L.throneX - Math.round(46 * u); x <= L.throneX + Math.round(46 * u); x++) {
          if (lum(r, x, y) > 24) lit++;
        }
      }
      expect(lit, 'h=' + h).toBeGreaterThan(300);
    }
  });

  it('contracts 动态层在七契顶端之上画出黄铜契约印', () => {
    const L = storyArt.storyLayout(W, 270);
    const r = createRaster(W, 270, 0x000000);
    OPENING_STAGES.contracts(r.g, CTX(0.5, 270));
    let brass = 0;
    for (let y = L.baseY - 110; y < L.baseY - 30; y++) {
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4;
        if (r.buffer[o] > 110 && r.buffer[o + 1] > 70 && r.buffer[o + 2] < 110) brass++;
      }
    }
    expect(brass).toBeGreaterThan(40);
  });

  it('awaken 中景祭坛有受光顶面与刻格（不是紫色小丘）', () => {
    for (const h of [270, 760]) {
      const L = storyArt.storyLayout(W, h);
      const r = createRaster(W, h, 0x000000);
      storyArt.OPENING_STATIC.awaken.mid(r.g, L);
      const ay = Math.round(h * 0.72);
      let lit = 0;
      for (let y = ay - Math.round(16 * L.u); y < ay; y++) {
        for (let x = L.cx - 90; x <= L.cx + 90; x++) {
          if (lum(r, x, y) > 60) lit++;
        }
      }
      expect(lit, 'h=' + h).toBeGreaterThan(80);
    }
  });
});
