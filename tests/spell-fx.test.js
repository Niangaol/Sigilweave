import { describe, it, expect } from 'vitest';
import { SIGIL_DEFS } from '../src/data/cards.js';
import {
  FX_DEF_IDS,
  SPELL_FX,
  FALLBACK_FX,
  fxFor,
  drawProjectileFx,
  drawTrailFx,
  drawCastFx,
  drawImpactFx,
  drawWardFx,
  drawLinkFx,
} from '../src/ui/spell-fx.js';

// —— 需求单上的 16 个 defId（顺序也是 FX_DEF_IDS 的契约顺序）——
const EXPECTED = [
  'frost_arrow',
  'arcane_bolt',
  'flame_burst',
  'judgment_hammer',
  'thorn_vine',
  'starfall',
  'holy_ward',
  'mana_siphon',
  'chain_lightning',
  'pierce_lance',
  'echo_sigil',
  'ember_fan',
  'quake_maw',
  'soul_lance',
  'aegis_ring',
  'meteor_judgment',
];

// 性能预算（需求硬上限）：projectile 40 / trail 30 / cast 30 / impact 80 / ward 80 / link 30
const CAPS = { projectile: 40, trail: 30, cast: 30, impact: 80, ward: 80, link: 30 };

const DRAWERS = {
  projectile: drawProjectileFx,
  trail: drawTrailFx,
  cast: drawCastFx,
  impact: drawImpactFx,
  ward: drawWardFx,
  link: drawLinkFx,
};

// 假 Graphics：记录每一次样式与绘制调用，用来数预算、验 alpha、验坐标、验确定性。
function fakeG() {
  const log = [];
  const g = {
    log,
    fillStyle(color, alpha) { log.push(['fillStyle', color, alpha]); },
    fillRect(x, y, w, h) { log.push(['fillRect', x, y, w, h]); },
    fillPoints(points, close) { log.push(['fillPoints', points.map((p) => [p.x, p.y]), !!close]); },
    lineStyle(width, color, alpha) { log.push(['lineStyle', width, color, alpha]); },
    strokePoints(points, close) { log.push(['strokePoints', points.map((p) => [p.x, p.y]), !!close]); },
    clear() { log.push(['clear']); },
    // 出现下面这些调用说明模块越界拿了 scene / 做了渐变或纹理
    setDepth() { throw new Error('spell-fx 不得调用 setDepth（离开 scene）'); },
    createLinearGradient() { throw new Error('spell-fx 不得使用渐变'); },
    generateTexture() { throw new Error('spell-fx 不得生成纹理'); },
  };
  return g;
}

const TRAIL = [
  { x: 96, y: 66 },
  { x: 102, y: 70 },
  { x: 108, y: 73 },
  { x: 114, y: 76 },
];

function ctxFor(kind) {
  switch (kind) {
    case 'projectile':
      return { x: 120, y: 78, angle: 0.6, k: 0.35, clock: 1234, trail: TRAIL.map((p) => ({ ...p })) };
    case 'trail':
      return { x: 120, y: 78, angle: 0.6, k: 0.35, clock: 1234, trail: TRAIL.map((p) => ({ ...p })) };
    case 'cast':
      return { x: 200, y: 120, angle: -0.4, k: 0.5, clock: 900 };
    case 'impact':
      return { x: 180, y: 90, k: 0.5, clock: 1500, radius: 46 };
    case 'ward':
      return { x: 160, y: 100, k: 0.25, clock: 700, radius: 40 };
    default:
      return { from: { x: 60, y: 80 }, to: { x: 190, y: 120 }, k: 0.3, clock: 600, index: 1 };
  }
}

const drawCount = (log) => log.reduce((n, c) => n + (c[0] === 'clear' ? 0 : 1), 0);

// 把一段调用序列缩成「几何签名」：丢掉颜色与 alpha，只留形状/位置/尺寸
function geometrySig(log) {
  return JSON.stringify(log.map((c) => {
    if (c[0] === 'fillStyle' || c[0] === 'lineStyle') return [c[0]];
    if (c[0] === 'fillRect') return ['r', c[1], c[2], c[3], c[4]];
    return [c[0]];
  }));
}

function assertNumbers(g, defId, kind) {
  for (const call of g.log) {
    const [op] = call;
    if (op === 'fillStyle' || op === 'lineStyle') {
      const alpha = call[op === 'fillStyle' ? 2 : 3];
      expect(Number.isFinite(alpha), defId + '.' + kind + ' alpha 必须是有限数').toBe(true);
      expect(alpha, defId + '.' + kind + ' alpha 越界: ' + alpha).toBeGreaterThanOrEqual(0);
      expect(alpha, defId + '.' + kind + ' alpha 越界: ' + alpha).toBeLessThanOrEqual(1);
    } else if (op === 'fillRect') {
      for (let i = 1; i <= 4; i++) {
        expect(Number.isFinite(call[i]), defId + '.' + kind + ' fillRect 分量非有限: ' + call[i]).toBe(true);
      }
      expect(call[3]).toBeGreaterThan(0);
      expect(call[4]).toBeGreaterThan(0);
    } else if (op === 'fillPoints' || op === 'strokePoints') {
      const pts = call[1];
      expect(pts.length).toBeGreaterThanOrEqual(3);
      for (const p of pts) {
        expect(Number.isFinite(p[0]) && Number.isFinite(p[1]), defId + '.' + kind + ' 顶点非有限').toBe(true);
        expect(Number.isInteger(p[0]) && Number.isInteger(p[1]), defId + '.' + kind + ' 顶点必须是整数像素').toBe(true);
      }
    }
  }
}

describe('导出契约', () => {
  it('FX_DEF_IDS 是需求单上的 16 个 defId，顺序稳定且无重复', () => {
    expect(FX_DEF_IDS).toEqual(EXPECTED);
    expect(new Set(FX_DEF_IDS).size).toBe(16);
  });

  it('与 cards.js 的 SIGIL_DEFS 一一对应（不增不漏）', () => {
    expect(Object.keys(SIGIL_DEFS).sort()).toEqual([...FX_DEF_IDS].sort());
  });

  it('SPELL_FX 正好 16 条，键与 FX_DEF_IDS 一致', () => {
    expect(Object.keys(SPELL_FX).sort()).toEqual([...FX_DEF_IDS].sort());
  });

  it('未知 defId 返回兜底 descriptor，已知道的都返回自己的', () => {
    expect(fxFor('not_a_spell')).toBe(FALLBACK_FX);
    expect(fxFor(undefined)).toBe(FALLBACK_FX);
    expect(fxFor(null)).toBe(FALLBACK_FX);
    expect(fxFor(42)).toBe(FALLBACK_FX);
    for (const id of FX_DEF_IDS) expect(fxFor(id)).toBe(SPELL_FX[id]);
  });
});

describe('descriptor 合法性', () => {
  it('每条都有 id / silhouette / trail / colors / opBudget', () => {
    for (const id of FX_DEF_IDS) {
      const d = SPELL_FX[id];
      expect(d.id).toBe(id);
      expect(typeof d.silhouette).toBe('string');
      expect(d.silhouette.length).toBeGreaterThan(0);
      expect(typeof d.trail.style).toBe('string');
      expect(d.trail.style.length).toBeGreaterThan(0);
      expect(Number.isInteger(d.trail.max)).toBe(true);
      expect(d.trail.max).toBeGreaterThanOrEqual(1);
      expect(d.trail.max).toBeLessThanOrEqual(12);
      expect(Number.isFinite(d.opBudget)).toBe(true);
      expect(d.opBudget).toBeGreaterThan(0);
    }
  });

  it('16 个 silhouette 互不相同（撞型即不合格）', () => {
    const s = FX_DEF_IDS.map((id) => SPELL_FX[id].silhouette);
    expect(new Set(s).size).toBe(16);
  });

  it('colors 的 edge/body/core/accent 都是 0..0xffffff 的整数', () => {
    for (const id of FX_DEF_IDS) {
      const { edge, body, core, accent } = SPELL_FX[id].colors;
      for (const [name, v] of Object.entries({ edge, body, core, accent })) {
        expect(Number.isInteger(v), id + '.colors.' + name + ' 必须是整数').toBe(true);
        expect(v, id + '.colors.' + name + ' 越界').toBeGreaterThanOrEqual(0);
        expect(v, id + '.colors.' + name + ' 越界').toBeLessThanOrEqual(0xffffff);
      }
      // 三层结构：描边必须比本体暗（否则没有硬边轮廓）
      expect(edge, id + ' 的 edge 应比 body 暗').not.toBe(body);
    }
  });

  it('16 组 body 两两不同（肉眼可区分）', () => {
    const bodies = FX_DEF_IDS.map((id) => SPELL_FX[id].colors.body);
    expect(new Set(bodies).size).toBe(16);
  });
});

describe('六个绘制函数：不抛错 / 预算 / alpha / 坐标', () => {
  it('16 个法术 × 6 个函数全部可绘制，调用数在预算内', () => {
    const offenders = [];
    for (const id of FX_DEF_IDS) {
      const desc = SPELL_FX[id];
      for (const [kind, fn] of Object.entries(DRAWERS)) {
        const g = fakeG();
        const ctx = ctxFor(kind);
        expect(() => fn(g, id, ctx), kind + ' ' + id + ' 抛错了').not.toThrow();
        const n = drawCount(g.log);
        expect(n, kind + ' ' + id + ' 一次都没画').toBeGreaterThan(0);
        if (n > CAPS[kind]) offenders.push(id + '.' + kind + '=' + n + '>cap' + CAPS[kind]);
        if (n > desc.opBudget) offenders.push(id + '.' + kind + '=' + n + '>opBudget' + desc.opBudget);
        assertNumbers(g, id, kind);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('需求硬上限逐项复核：40/30/30/80/80/30', () => {
    for (const [kind, fn] of Object.entries(DRAWERS)) {
      for (const id of FX_DEF_IDS) {
        const g = fakeG();
        fn(g, id, ctxFor(kind));
        expect(drawCount(g.log), kind + ' ' + id).toBeLessThanOrEqual(CAPS[kind]);
      }
    }
  });

  it('生命周期两端（k=0 / k=1）都不炸', () => {
    for (const id of FX_DEF_IDS) {
      for (const [kind, fn] of Object.entries(DRAWERS)) {
        for (const k of [0, 1]) {
          const g = fakeG();
          const ctx = { ...ctxFor(kind), k };
          expect(() => fn(g, id, ctx), kind + ' ' + id + ' k=' + k).not.toThrow();
          assertNumbers(g, id, kind);
        }
      }
    }
  });

  it('字段缺失 / 空 trail 也不炸（接线早期最容易踩）', () => {
    for (const id of FX_DEF_IDS) {
      for (const [kind, fn] of Object.entries(DRAWERS)) {
        expect(() => fn(fakeG(), id, {}), kind + ' ' + id + ' 空 ctx').not.toThrow();
        expect(() => fn(fakeG(), id, undefined), kind + ' ' + id + ' undefined').not.toThrow();
        expect(() => fn(fakeG(), id, { x: NaN, y: NaN, k: NaN, radius: NaN, trail: [{}, { x: 3 }] }), kind + ' ' + id + ' 脏 ctx').not.toThrow();
      }
      // 空 trail 只要求不炸，不要求有绘制
      expect(() => drawTrailFx(fakeG(), id, { x: 10, y: 10, k: 0.2, clock: 5, trail: [] })).not.toThrow();
    }
  });

  it('未知 defId 走兜底，六个函数都不炸且有绘制', () => {
    for (const [kind, fn] of Object.entries(DRAWERS)) {
      const g = fakeG();
      expect(() => fn(g, 'mystery_spell', ctxFor(kind))).not.toThrow();
      expect(drawCount(g.log), '兜底 ' + kind).toBeGreaterThan(0);
      const fallbackAlpha = g.log.filter((c) => c[0] === 'fillStyle').map((c) => c[2]);
      for (const a of fallbackAlpha) expect(a).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('确定性与无副作用', () => {
  it('同一个 ctx 调两次，调用序列深相等（无 Math.random）', () => {
    for (const id of FX_DEF_IDS) {
      for (const [kind, fn] of Object.entries(DRAWERS)) {
        const ctx = ctxFor(kind);
        const g1 = fakeG();
        const g2 = fakeG();
        fn(g1, id, ctx);
        fn(g2, id, ctx);
        expect(g2.log, kind + ' ' + id + ' 两次结果不一致').toEqual(g1.log);
      }
    }
  });

  it('绘制不修改传入的 ctx（Lead 可以放心复用）', () => {
    for (const id of FX_DEF_IDS) {
      for (const [kind, fn] of Object.entries(DRAWERS)) {
        const ctx = ctxFor(kind);
        const snapshot = JSON.parse(JSON.stringify(ctx));
        fn(fakeG(), id, ctx);
        expect(ctx, kind + ' ' + id + ' 改了 ctx').toEqual(snapshot);
      }
    }
  });

  it('clock 变化只改相位，不改结构（同一法术两次 clock 的调用数一致）', () => {
    for (const id of FX_DEF_IDS) {
      for (const [kind, fn] of Object.entries(DRAWERS)) {
        const a = fakeG();
        const b = fakeG();
        fn(a, id, { ...ctxFor(kind), clock: 0 });
        fn(b, id, { ...ctxFor(kind), clock: 5000 });
        expect(drawCount(b.log), kind + ' ' + id).toBe(drawCount(a.log));
      }
    }
  });
});

describe('16 套特效确实不同型', () => {
  it('飞行体几何签名两两不同（不是只换颜色）', () => {
    const sigs = FX_DEF_IDS.map((id) => {
      const g = fakeG();
      drawProjectileFx(g, id, ctxFor('projectile'));
      return geometrySig(g.log);
    });
    expect(new Set(sigs).size).toBe(16);
  });

  it('命中图案几何签名两两不同', () => {
    const sigs = FX_DEF_IDS.map((id) => {
      const g = fakeG();
      drawImpactFx(g, id, ctxFor('impact'));
      return geometrySig(g.log);
    });
    expect(new Set(sigs).size).toBe(16);
  });

  it('拖尾样式至少覆盖 8 种不同做法', () => {
    const styles = new Set(FX_DEF_IDS.map((id) => SPELL_FX[id].trail.style));
    expect(styles.size).toBeGreaterThanOrEqual(8);
  });
});

// 大半径可读性回归：Lead 实机发现过「半径 80 的点阵牙床散成散点」，
// 这里把「命中图案必须是连续多边形」钉成测试，防止以后退回点阵。
describe('大半径命中图案不散点', () => {
  const polys = (g) => g.log.filter((c) => c[0] === 'fillPoints');
  const maxVerts = (g) => Math.max(0, ...polys(g).map((c) => c[1].length));

  it('quake_maw：半径 80 的锯齿牙是连续多边形，牙数随半径加密', () => {
    const at = (radius) => {
      const g = fakeG();
      drawImpactFx(g, 'quake_maw', { x: 110, y: 60, k: 0.8, clock: 900, radius });
      expect(polys(g).length, '半径 ' + radius + ' 的裂缝/牙床多边形数').toBeGreaterThanOrEqual(6);
      return maxVerts(g);
    };
    const small = at(20);
    const big = at(80);
    // 半径 20 → 7 颗牙（约 15 顶点）；半径 80 → 26 颗牙（50+ 顶点）
    expect(small).toBeGreaterThanOrEqual(9);
    expect(big).toBeGreaterThan(small);
    expect(big).toBeGreaterThanOrEqual(40);
  });

  it('pierce_lance：半径 46 的贯穿光束是连续多边形，跨度覆盖 3R', () => {
    const g = fakeG();
    drawImpactFx(g, 'pierce_lance', { x: 120, y: 80, k: 0.5, clock: 700, radius: 46, angle: 0.4 });
    const solid = polys(g);
    expect(solid.length).toBeGreaterThanOrEqual(3); // 描边 / 本体 / 亮芯
    const spans = solid.map((c) => {
      const xs = c[1].map((p) => p[0]);
      const ys = c[1].map((p) => p[1]);
      return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    });
    expect(Math.max(...spans)).toBeGreaterThan(46 * 2.5);
  });

  it('8 个区域/贯穿类法术在最大半径下都有连续多边形（不是纯点阵）', () => {
    const area = ['frost_arrow', 'flame_burst', 'thorn_vine', 'starfall', 'holy_ward', 'echo_sigil', 'quake_maw', 'meteor_judgment'];
    for (const id of area) {
      const g = fakeG();
      drawImpactFx(g, id, { x: 120, y: 90, k: 0.7, clock: 800, radius: 95, angle: 0.3 });
      expect(polys(g).length, id + ' 在半径 95 下缺少连续多边形').toBeGreaterThan(0);
      expect(maxVerts(g), id + ' 在半径 95 下多边形顶点过少').toBeGreaterThanOrEqual(4);
    }
  });
});
