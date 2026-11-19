import { describe, it, expect } from 'vitest';
import Hud from '../src/ui/Hud.js';
import { C } from '../src/ui/Palette.js';
function fixture() {
  const g = new Proxy({}, { get: (target, key) => target[key] ?? (() => g) });
  const scene = { time: { now: 0 }, add: { graphics: () => g, text: (x, y, text) => {
    const t = { x, y, text, setDepth() { return this; }, setOrigin() { return this; }, setResolution() { return this; }, setScrollFactor(n) { this.scrollFactorX = n; this.scrollFactorY = n; return this; }, setText(s) { this.text = s; return this; } };
    return t;
  } } };
  return new Hud(scene);
}
describe('等级经验HUD', () => {
  it('显示当前等级的经验阈值并动态更新', () => {
    const hud = fixture();
    const base = { hp: 100, maxHp: 100, shards: 0, rate: 0, elapsedMs: 0, act: 1 };
    hud.update({ ...base, lv: 1, exp: 3, expNeed: 10 });
    expect(hud.lvText.text).toBe('LV 1');
    expect(hud.expText.text).toBe('EXP 3/10');
    hud.update({ ...base, lv: 2, exp: 1, expNeed: 17 });
    expect(hud.lvText.text).toBe('LV 2');
    expect(hud.expText.text).toBe('EXP 1/17');
  });
  it('幕/场标签按幕显示星名、按场显示场地名，同幕换场也要刷新', () => {
    const hud = fixture();
    const base = { hp: 100, maxHp: 100, shards: 0, rate: 0, elapsedMs: 0 };
    hud.update({ ...base, chapter: 3, stage: 3 });
    expect(hud.actText.text).toBe('第三幕 · 天玑');
    // 幕 4 含场 4/5：缓存键若只存文案（或只按幕），场 4→5 会漏刷新
    hud.update({ ...base, chapter: 4, stage: 4 });
    expect(hud.actText.text).toBe('第四幕 · 沉钟书库');
    hud.update({ ...base, chapter: 4, stage: 5 });
    expect(hud.actText.text).toBe('第四幕 · 衡律法庭');
    hud.update({ ...base, chapter: 5, stage: 7 });
    expect(hud.actText.text).toBe('第五幕 · 破晓之座');
    // 旧数据只有 act 时按第一幕第一场兜底，不显示 undefined
    hud.update({ ...base, act: 1 });
    expect(hud.actText.text).toBe('第一幕 · 天枢');
  });
  it('所有顶栏文字固定于视口', () => {
    const hud = fixture();
    for (const key of ['hpText', 'shardText', 'freqText', 'actText', 'timeText', 'lvText', 'expText']) {
      expect(hud[key].scrollFactorX).toBe(0);
      expect(hud[key].scrollFactorY).toBe(0);
    }
  });
});

describe('顶栏为画框让出 8px', () => {
  it('两行文字都落在 y>=12，不会被画框压住', () => {
    const hud = fixture();
    expect(hud.hpText.y).toBe(13);
    expect(hud.timeText.y).toBe(13);
    expect(hud.lvText.y).toBe(29);
    expect(hud.expText.y).toBe(29);
  });
  it('顶栏底板覆盖到 y=42，画框不再压住任何字', () => {
    const rects = [];
    const g = {
      fillStyle: () => g, lineStyle: () => g, strokePoints: () => g, fillPoints: () => g,
      setDepth: () => g, setScrollFactor: () => g, clear: () => g,
      fillRect: (x, y, w, h) => { rects.push([x, y, w, h]); return g; },
    };
    const scene = {
      time: { now: 0 },
      add: {
        graphics: () => g,
        text: (x, y, s) => {
          const t = { x, y, text: s, setDepth() { return t; }, setOrigin() { return t; }, setResolution() { return t; }, setScrollFactor() { return t; }, setText(v) { t.text = v; return t; } };
          return t;
        },
      },
    };
    new Hud(scene);
    expect(rects.some(([x, y, w, h]) => x === 0 && y === 0 && w === 480 && h === 42)).toBe(true);
  });
});

describe('画框存在时顶栏不往框身里画', () => {
  function recording() {
    const made = [];
    const recorder = () => {
      const rects = [];
      const g = {
        rects,
        fillStyle: () => g, lineStyle: () => g, strokePoints: () => g, fillPoints: () => g,
        setDepth: () => g, setScrollFactor: () => g, clear: () => g,
        fillRect: (x, y, w, h) => { rects.push([x, y, w, h]); return g; },
      };
      made.push(g);
      return g;
    };
    const scene = {
      time: { now: 0 },
      add: {
        graphics: recorder,
        text: (x, y, t) => {
          const o = { x, y, text: t, setDepth() { return o; }, setOrigin() { return o; }, setResolution() { return o; }, setScrollFactor() { return o; }, setText(v) { o.text = v; return o; } };
          return o;
        },
      },
    };
    const hud = new Hud(scene);
    // Hud 先建 bg 再建 dyn：dyn 是第二个 graphics
    return { hud, stat: made[0].rects, dyn: made[1].rects };
  }

  it('顶栏（含低血警告）不往框身里画可见像素，全部落在内开口 x8..471', () => {
    const { hud, dyn, stat } = recording();
    hud.update({ hp: 10, maxHp: 100, shards: 0, rate: 0, elapsedMs: 0, chapter: 1, stage: 1 });
    // 画框占掉 x0..7 / x472..479：顶栏动态层任何图元都不许落进去
    expect(dyn.length).toBeGreaterThan(0);
    for (const [x, , w] of dyn) {
      expect(x).toBeGreaterThanOrEqual(8);
      expect(x + w).toBeLessThanOrEqual(472);
    }
    for (const [x, , w] of stat) {
      if (w <= 3) {
        expect(x).toBeGreaterThanOrEqual(8);
        expect(x + w).toBeLessThanOrEqual(472);
      }
    }
  });
});

describe('冲刺冷却环（右键闪避，A4）', () => {
  // 记录型夹具：除坐标外还记 fillStyle 的颜色/透明度，才能把「冷却遮罩」与「环框」分开断言。
  // 扇形遮罩走 fillPoints（pxPoly），统一折算成 x/y/w/h 的包围盒，断言口径与 fillRect 一致。
  function recording() {
    const layers = [];
    const recorder = () => {
      const rects = [];
      let color = null;
      let alpha = 1;
      // 点必须是 {x, y} 对象——Phaser 的 fillPoints 读 point.x / point.y，
      // 传数组不报错也不画。旧夹具按 p[0]/p[1] 折算，于是把「传数组」这个 bug 一起测绿了，
      // 实机上冲刺环只剩一个空框（2026-11-18 实机截图发现）。这里直接拒绝数组。
      const box = (pts) => {
        for (const p of pts) {
          if (!p || typeof p !== 'object' || Array.isArray(p) || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
            throw new Error('fillPoints 的点必须是 {x, y} 有限数对象，收到：' + JSON.stringify(p));
          }
        }
        const xs = pts.map((p) => p.x);
        const ys = pts.map((p) => p.y);
        return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs) + 1, h: Math.max(...ys) - Math.min(...ys) + 1 };
      };
      const g = {
        rects,
        fillStyle(c, a = 1) { color = c; alpha = a; return g; },
        lineStyle: () => g, strokePoints: () => g,
        fillPoints: (pts) => { rects.push({ ...box(pts), color, alpha }); return g; },
        setDepth: () => g, setScrollFactor: () => g, clear() { rects.length = 0; return g; },
        fillRect: (x, y, w, h) => { rects.push({ x, y, w, h, color, alpha }); return g; },
      };
      layers.push(g);
      return g;
    };
    const scene = {
      time: { now: 0 },
      add: {
        graphics: recorder,
        text: (x, y, t) => {
          const o = { x, y, text: t, setDepth() { return o; }, setOrigin() { return o; }, setResolution() { return o; }, setScrollFactor() { return o; }, setText(v) { o.text = v; return o; } };
          return o;
        },
      },
    };
    return { hud: new Hud(scene), layers };
  }
  const RING = { left: 148, top: 216, size: 24 };
  const inRing = (r) => r.x >= RING.left && r.x + r.w <= RING.left + RING.size
    && r.y >= RING.top && r.y + r.h <= RING.top + RING.size;

  it('冷却中在环内压暗遮罩，就绪后不压', () => {
    const { hud, layers } = recording();
    const base = { hp: 100, maxHp: 100, shards: 0, rate: 0, elapsedMs: 0 };
    const ringRects = () => layers.flatMap((l) => l.rects).filter(inRing);
    const mask = () => ringRects().filter((r) => r.color === C.void && r.alpha === 0.72);
    hud.update({ ...base, dashReadyAt: 600, now: 0 });        // 剩 600ms / 总共 1200ms
    expect(mask().length).toBeGreaterThan(0);
    hud.update({ ...base, dashReadyAt: 0, now: 0 });          // 就绪：遮罩撤掉
    expect(mask()).toHaveLength(0);
    expect(ringRects().length).toBeGreaterThan(0);           // 环框与就绪标记照画
  });

  it('就绪时环里真的画了箭头（不是只画一个空框）', () => {
    const { hud, layers } = recording();
    hud.update({ hp: 100, maxHp: 100, shards: 0, rate: 0, elapsedMs: 0, dashReadyAt: 0, now: 0 });
    // 箭头是多边形（fillPoints），不是矩形；颜色为 teal。
    const arrow = layers.flatMap((l) => l.rects)
      .filter((r) => inRing(r) && r.color === C.teal);
    expect(arrow.length).toBeGreaterThan(0);
    // 箭头至少 3px 宽：只有框没有内容时这条会挂
    expect(Math.max(...arrow.map((r) => r.w))).toBeGreaterThanOrEqual(3);
  });

  it('环不侵占右侧技能栏，也不越出画布底部', () => {
    const { hud, layers } = recording();
    hud.update({ hp: 100, maxHp: 100, shards: 0, rate: 0, elapsedMs: 0, dashReadyAt: 600, now: 0 });
    // 只看技能栏左侧那一竖条：环整块必须落在 148..178 之间，一个像素都不许越过 178
    const band = layers.flatMap((l) => l.rects).filter((r) => r.y >= 210 && r.y <= 240 && r.x < 178);
    expect(band.length).toBeGreaterThan(0);
    for (const r of band) {
      expect(r.x).toBeGreaterThanOrEqual(RING.left);
      expect(r.x + r.w).toBeLessThanOrEqual(178);
      expect(r.y + r.h).toBeLessThanOrEqual(270);
    }
  });
});
