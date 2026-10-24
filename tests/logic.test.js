import { describe, it, expect } from 'vitest';
import { EventQueue } from '../src/logic/queue.js';
import { Rng } from '../src/logic/rng.js';
import { createGrid, rebuildDerived, positionType, baseCooldown, neighborsOf, manhattan, exitTargets, toId } from '../src/logic/grid.js';
import { SigilEngine } from '../src/logic/engine.js';
import { buildComboCatalog, computeWindowMs, ComboTracker, concreteInstances, COMBO_SHAPES } from '../src/logic/combo.js';
import { regionOf, regionCenter, resolveTarget } from '../src/logic/sector.js';

function makeGrid(unlocked, baseIntervalMs = 2000) {
  const g = createGrid();
  for (const id of unlocked) g.cells[id].unlocked = true;
  rebuildDerived(g, baseIntervalMs);
  return g;
}

describe('事件队列', () => {
  it('按 (time, seq) 稳定排序', () => {
    const q = new EventQueue();
    q.push(5, 'a', { i: 1 });
    q.push(1, 'b', { i: 2 });
    q.push(5, 'c', { i: 3 });
    q.push(3, 'd', { i: 4 });
    const order = [];
    while (!q.isEmpty) order.push(q.pop().payload.i);
    expect(order).toEqual([2, 4, 1, 3]);
  });
  it('相同时间保持入队顺序', () => {
    const q = new EventQueue();
    for (let i = 0; i < 20; i++) q.push(10, 'x', { i });
    const seq = [];
    while (!q.isEmpty) seq.push(q.pop().payload.i);
    expect(seq).toEqual([...Array(20).keys()]);
  });
});

describe('种子随机', () => {
  it('同种子序列一致，不同种子不同', () => {
    const a = new Rng('sigil');
    const b = new Rng('sigil');
    const c = new Rng('other');
    const sa = [...Array(10)].map(() => a.nextUint32());
    const sb = [...Array(10)].map(() => b.nextUint32());
    const sc = [...Array(10)].map(() => c.nextUint32());
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
  });
});

describe('法阵拓扑', () => {
  it('位置类型：角 4 个、边 8 个、中心 4 个', () => {
    const types = [...Array(16).keys()].map(positionType);
    expect(types.filter((t) => t === 'corner').length).toBe(4);
    expect(types.filter((t) => t === 'edge').length).toBe(8);
    expect(types.filter((t) => t === 'center').length).toBe(4);
  });
  it('位置化冷却 角0.8 边1.1 中心2.2 秒', () => {
    expect(baseCooldown(toId(0, 0))).toBe(800);
    expect(baseCooldown(toId(0, 1))).toBe(1100);
    expect(baseCooldown(toId(1, 1))).toBe(2200);
  });
  it('邻格数 角2 边3 中心4', () => {
    expect(neighborsOf(toId(0, 0)).length).toBe(2);
    expect(neighborsOf(toId(0, 1)).length).toBe(3);
    expect(neighborsOf(toId(2, 2)).length).toBe(4);
  });
});

describe('共鸣石', () => {
  it('只影响正交四邻，不影响自身', () => {
    const g = makeGrid([...Array(16).keys()]);
    g.cells[toId(1, 1)].slot = { kind: 'auxiliary', defId: 'resonance_stone' };
    rebuildDerived(g, 2000);
    expect(g.cells[toId(1, 1)].resonanceStacks).toBe(0);
    expect(g.cells[toId(0, 1)].resonanceStacks).toBe(1);
    expect(g.cells[toId(1, 0)].resonanceStacks).toBe(1);
    expect(g.cells[toId(1, 2)].resonanceStacks).toBe(1);
    expect(g.cells[toId(2, 1)].resonanceStacks).toBe(1);
  });
  it('乘算叠加 0.75^n 且不触底', () => {
    const g = makeGrid([...Array(16).keys()]);
    g.cells[toId(0, 2)].slot = { kind: 'auxiliary', defId: 'resonance_stone' };
    g.cells[toId(2, 2)].slot = { kind: 'auxiliary', defId: 'resonance_stone' };
    g.cells[toId(1, 1)].slot = { kind: 'auxiliary', defId: 'resonance_stone' };
    rebuildDerived(g, 2000);
    // (1,2) 受 (0,2)(1,1)(2,2)? (2,2)->(1,2) 是正交邻，算 3 层
    expect(g.cells[toId(1, 2)].resonanceStacks).toBe(3);
    expect(g.cells[toId(1, 2)].effIntervalMs).toBeCloseTo(2000 * Math.pow(0.75, 3), 6);
  });
  it('间隔与冷却都被硬下限夹住', () => {
    const g = makeGrid([...Array(16).keys()]);
    for (const id of [toId(0, 2), toId(2, 2), toId(1, 1), toId(1, 3), toId(0, 0)]) {
      g.cells[id].slot = { kind: 'auxiliary', defId: 'resonance_stone' };
    }
    rebuildDerived(g, 800);
    expect(g.cells[toId(1, 2)].effIntervalMs).toBe(500);
    expect(g.cells[toId(1, 2)].effCooldownMs).toBeGreaterThanOrEqual(600);
  });
});

describe('脉流引擎', () => {
  it('同一 seed 不同帧率推进结果完全一致', () => {
    const run = (step) => {
      const g = makeGrid([...Array(16).keys()]);
      const e = new SigilEngine({ seed: 'abc', grid: g, startCells: [toId(1, 1)] });
      e.start();
      for (let t = 0; t <= 60000; t += step) e.advanceTo(t);
      e.advanceTo(60000);
      return e.summary(60000).hash;
    };
    const h16 = run(16);
    const h33 = run(33);
    const hbig = run(60000);
    expect(h16).toBe(h33);
    expect(h16).toBe(hbig);
  });

  it('禁止立即回到上一格', () => {
    const g = makeGrid([...Array(16).keys()]);
    const e = new SigilEngine({ seed: 7, grid: g, startCells: [toId(1, 1)] });
    const seq = [];
    e.onEvent = (type, d) => { if (type === 'signal:trigger') seq.push(d.cellId); };
    e.start();
    e.advanceTo(120000);
    for (let i = 2; i < seq.length; i++) {
      expect(seq[i]).not.toBe(seq[i - 2]);
    }
  });

  it('旅行时间等于出发格间隔，起飞后不因后续增益追溯改时', () => {
    const g = makeGrid([toId(0, 0), toId(0, 1), toId(1, 0), toId(1, 1)]);
    // 只留一条链：(1,1) -> (1,0) -> (0,0) ... 简化：只测首跳
    for (const id of [toId(0, 0), toId(0, 1), toId(1, 0), toId(1, 1)]) {
      g.cells[id].exits = new Set(['up', 'down', 'left', 'right']);
    }
    const e = new SigilEngine({ seed: 3, grid: g, startCells: [toId(1, 1)] });
    const times = [];
    e.onEvent = (type, d) => { if (type === 'signal:trigger') times.push(d.t); };
    e.start();
    e.advanceTo(20000);
    expect(times.length).toBeGreaterThan(2);
    // 起点在 t=0 触发，之后每次移动至少一个间隔（2000ms）
    for (let i = 1; i < times.length; i++) {
      expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(1999);
    }
  });

  it('基础间隔 2 秒时位置化冷却不生效（实测结论）', () => {
    // 禁止立即回退后最短合法回路是 3 跳；3 x 2000ms = 6000ms 仍超过中心位 2200ms 冷却
    const g = makeGrid([...Array(16).keys()], 2000);
    const e = new SigilEngine({ seed: 11, grid: g, startCells: [toId(1, 1)] });
    e.start();
    e.advanceTo(180000);
    expect(e.stats.triggers).toBeGreaterThan(0);
    expect(e.stats.blocked).toBe(0);
  });

  it('间隔压到 0.5 秒后冷却才开始吞跳', () => {
    const g = makeGrid([...Array(16).keys()], 500);
    const e = new SigilEngine({ seed: 11, grid: g, startCells: [toId(1, 1)] });
    e.start();
    e.advanceTo(180000);
    expect(e.stats.blocked).toBeGreaterThan(0);
  });

  it('探索保底会在久未踩新格后强制传送', () => {
    const g = makeGrid([...Array(16).keys()]);
    const e = new SigilEngine({ seed: 5, grid: g, startCells: [toId(0, 0)] });
    e.start();
    e.advanceTo(300000);
    expect(e.stats.fallbacks).toBeGreaterThan(0);
  });

  it('无出口时消散并在间隔后重生，不产生零时间死循环', () => {
    const g = makeGrid([toId(0, 0), toId(0, 1)]);
    g.cells[toId(0, 0)].exits = new Set();
    g.cells[toId(0, 1)].exits = new Set();
    const e = new SigilEngine({ seed: 9, grid: g, startCells: [toId(0, 0)] });
    e.start();
    expect(() => e.advanceTo(30000)).not.toThrow();
    expect(e.stats.dissipations).toBeGreaterThan(0);
  });
});

describe('联组', () => {
  it('形状实例去重且都在界内', () => {
    const duo = concreteInstances(COMBO_SHAPES.duo);
    const keys = new Set(duo.map((d) => d.order.join('-')));
    expect(keys.size).toBe(duo.length);
    for (const d of duo) for (const id of d.order) expect(id).toBeGreaterThanOrEqual(0);
    // 4x4 相邻有序对：横向 4*3*2 + 纵向 4*3*2 = 48
    expect(duo.length).toBe(48);
  });

  it('窗口 = 各边旅行时间之和 × 1.4', () => {
    const g = makeGrid([...Array(16).keys()], 2000);
    const win = computeWindowMs([toId(0, 0), toId(0, 1), toId(0, 2)], g);
    expect(win).toBeCloseTo((2000 + 2000) * 1.4, 6);
  });

  it('同一脉流连续踩中即成立，中途插入组外格则断链', () => {
    const g = makeGrid([...Array(16).keys()], 2000);
    const catalog = buildComboCatalog(['duo']);
    const t = new ComboTracker(catalog);
    const first = t.instances[0];
    const [a, b] = first.order;
    const outside = [...Array(16).keys()].find((id) => !first.order.includes(id));
    // 正常
    let fired = t.onTrigger(1, a, 1000, g);
    expect(fired.length).toBe(0);
    fired = t.onTrigger(1, b, 2000, g);
    expect(fired.length).toBeGreaterThan(0);
    // 组外插入
    const t2 = new ComboTracker(catalog);
    t2.onTrigger(2, a, 1000, g);
    t2.onTrigger(2, outside, 1500, g);
    const after = t2.onTrigger(2, b, 2000, g);
    // 原本那一对必须被断链；若另有别的相邻对恰好成立，不算这次联组
    const samePair = after.filter((f) => f.order.join('-') === first.order.join('-'));
    expect(samePair.length).toBe(0);
  });

  it('超窗不成立，截止时刻含等号', () => {
    const g = makeGrid([...Array(16).keys()], 2000);
    const catalog = buildComboCatalog(['duo']);
    const t = new ComboTracker(catalog);
    const first = t.instances[0];
    const [a, b] = first.order;
    const win = computeWindowMs(first.order, g);
    t.onTrigger(3, a, 0, g);
    expect(t.onTrigger(3, b, win, g).length).toBeGreaterThan(0); // 恰好到点有效
    const t2 = new ComboTracker(catalog);
    t2.onTrigger(4, a, 0, g);
    expect(t2.onTrigger(4, b, win + 1, g).length).toBe(0);
  });

  it('不同脉流不能拼接进度', () => {
    const g = makeGrid([...Array(16).keys()], 2000);
    const t = new ComboTracker(buildComboCatalog(['duo']));
    const first = t.instances[0];
    const [a, b] = first.order;
    t.onTrigger(1, a, 0, g);
    const fired = t.onTrigger(2, b, 100, g);
    expect(fired.length).toBe(0);
  });
});

describe('方位索敌（覆盖全图，不再只看屏幕内）', () => {
  it('任何坐标都必落进一个区域，屏幕外的敌人也有归属', () => {
    const px = 0, py = 0;
    // 屏幕半宽 240、半高 135：内 2×2 是屏幕，外圈是屏幕外
    // 屏幕左上象限（列 1、行 1）
    expect(regionOf(-100, -100, px, py)).toBe(5);
    expect(regionOf(100, 100, px, py)).toBe(10);
    // 屏外：右侧 500px、屏幕下半（列 3、行 2）
    expect(regionOf(500, 100, px, py)).toBe(11);
    // 屏外：左上远角
    expect(regionOf(-900, -700, px, py)).toBe(0);
    // 屏外：右下远角
    expect(regionOf(900, 700, px, py)).toBe(15);
    // 旧版在这里会返回 null（敌人不在任何区域），现在必须仍在盘面内
    for (const [x, y] of [[-121, 0], [0, -136], [240, 0], [0, 135], [-5000, 5000]]) {
      const id = regionOf(x, y, px, py);
      expect(id).toBeGreaterThanOrEqual(0);
      expect(id).toBeLessThan(16);
    }
  });
  it('外区参考点朝对应方向，供空区补射使用', () => {
    const px = 0, py = 0;
    expect(regionCenter(0, px, py).x).toBeLessThan(-240);
    expect(regionCenter(0, px, py).y).toBeLessThan(-135);
    expect(regionCenter(15, px, py).x).toBeGreaterThan(240);
    expect(regionCenter(15, px, py).y).toBeGreaterThan(135);
  });
  it('屏幕外的敌人是本区的首要目标，不需要等本区空掉', () => {
    const px = 0, py = 0;
    const enemies = [
      { id: 1, alive: true, x: 600, y: 40 },    // 屏外右侧
      { id: 2, alive: true, x: 120, y: 40 },    // 屏内右侧
    ];
    const far = resolveTarget(regionOf(600, 40, px, py), { x: px, y: py }, enemies);
    expect(far.target.id).toBe(1);
    expect(far.assisted).toBeUndefined();
    const near = resolveTarget(regionOf(120, 40, px, py), { x: px, y: py }, enemies);
    expect(near.target.id).toBe(2);
    // 同区多个敌人取最近
    const crowded = resolveTarget(regionOf(600, 40, px, py), { x: px, y: py }, [
      { id: 3, alive: true, x: 400, y: 40 },
      { id: 4, alive: true, x: 1200, y: 40 },
    ]);
    expect(crowded.target.id).toBe(3);
  });
  it('空区就近补射并标记 assisted，全空时朝区域参考点空射', () => {
    const px = 0, py = 0;
    const assisted = resolveTarget(10, { x: px, y: py }, [
      { id: 1, alive: true, x: -100, y: -100 },
    ]);
    expect(assisted.empty).toBe(false);
    expect(assisted.assisted).toBe(true);
    expect(assisted.target.id).toBe(1);
    const empty = resolveTarget(10, { x: px, y: py }, []);
    expect(empty.empty).toBe(true);
    expect(empty.target).toBeNull();
    expect(empty.aim).toEqual(regionCenter(10, px, py));
  });
});
