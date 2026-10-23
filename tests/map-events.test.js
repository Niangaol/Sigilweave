import { describe, it, expect } from 'vitest';
import { getEventPoints, findTriggeredPoint } from '../src/data/map-events.js';
import { WORLD_SIZES } from '../src/logic/constants.js';

const EDGE = 80;      // 距边缘最小值
const SPACING = 400;  // 点间距最小值
const SPAWN = 240;    // 距中心（出生区）最小值（严格大于）
const RADIUS = 28;    // 事件点半径

const EXPECTED = {
  1: { npc: '艾琳', miniboss: '守墓傀儡' },
  2: { npc: '瑟维安', miniboss: '腐沼巨尸' },
  3: { npc: '莉芙拉', miniboss: '裂瞳主教' },
};
const ACTS = [1, 2, 3];

const squared = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;
const quadrantOf = (p, w, h) => (p.x < w / 2 ? 'L' : 'R') + (p.y < h / 2 ? 'T' : 'B');

// 布置约束全量校验：边缘 / 间距 / 出生距离 / 三象限
const expectLayoutValid = (points, w, h) => {
  expect(points).toHaveLength(3);
  for (const p of points) {
    expect(p.x).toBeGreaterThanOrEqual(EDGE);
    expect(p.x).toBeLessThanOrEqual(w - EDGE);
    expect(p.y).toBeGreaterThanOrEqual(EDGE);
    expect(p.y).toBeLessThanOrEqual(h - EDGE);
    expect(squared(p.x, p.y, w / 2, h / 2)).toBeGreaterThan(SPAWN * SPAWN);
  }
  const [a, b, c] = points;
  for (const [p, q] of [[a, b], [a, c], [b, c]]) {
    expect(squared(p.x, p.y, q.x, q.y)).toBeGreaterThanOrEqual(SPACING * SPACING);
  }
  expect(new Set(points.map((p) => quadrantOf(p, w, h))).size).toBe(3);
};

describe('getEventPoints · 结构与命名', () => {
  for (const act of ACTS) {
    it(act + ' 幕：恰好 1 个 NPC + 2 个小 Boss，id/类型/名字/半径/提示齐全', () => {
      const points = getEventPoints(act, WORLD_SIZES[act]);
      expect(points).toHaveLength(3);
      expect(points.map((p) => p.id)).toEqual(['npc-' + act, 'miniboss-' + act + '-a', 'miniboss-' + act + '-b']);
      expect(points.map((p) => p.type)).toEqual(['npc', 'miniboss', 'miniboss']);
      expect(points.filter((p) => p.type === 'npc')).toHaveLength(1);
      expect(points.every((p) => p.radius === RADIUS)).toBe(true);
      expect(points[0].name).toBe(EXPECTED[act].npc);
      expect(points[1].name).toBe(EXPECTED[act].miniboss);
      expect(points[2].name).toBe(EXPECTED[act].miniboss);
      for (const p of points) {
        expect(typeof p.hint).toBe('string');
        expect(p.hint.length).toBeGreaterThan(0);
      }
      expect(new Set(points.map((p) => p.hint)).size).toBe(3);
    });
  }
});

describe('getEventPoints · 布置约束', () => {
  // 真实世界尺寸 + 合法最小世界（最坏情况）+ 任意非整尺寸，全部都要满足约束
  const worlds = [
    ['幕默认世界', (act) => WORLD_SIZES[act]],
    ['最小合法世界 800×800（最坏情况）', () => ({ w: 800, h: 800 })],
    ['非整尺寸 1234×876', () => ({ w: 1234, h: 876 })],
  ];
  for (const [label, pick] of worlds) {
    for (const act of ACTS) {
      it(act + ' 幕 @ ' + label + '：边缘≥80 / 互相≥400 / 距中心>240 / 三象限', () => {
        const world = pick(act);
        expectLayoutValid(getEventPoints(act, world), world.w, world.h);
      });
    }
  }
});

describe('getEventPoints · 三幕坐标互不相同', () => {
  it('各幕默认世界下 9 个点坐标两两不同', () => {
    const all = ACTS.flatMap((act) => getEventPoints(act, WORLD_SIZES[act]));
    expect(all).toHaveLength(9);
    expect(new Set(all.map((p) => p.x + ',' + p.y)).size).toBe(9);
  });
  it('同一 800×800 世界下 9 个点坐标仍两两不同（锚点比例互不相同）', () => {
    const all = ACTS.flatMap((act) => getEventPoints(act, { w: 800, h: 800 }));
    expect(new Set(all.map((p) => p.x + ',' + p.y)).size).toBe(9);
  });
});

describe('getEventPoints · 确定性', () => {
  for (const act of ACTS) {
    it(act + ' 幕同 world 两次调用结果完全一致（深相等）', () => {
      expect(getEventPoints(act, WORLD_SIZES[act])).toEqual(getEventPoints(act, WORLD_SIZES[act]));
    });
  }
  it('不同 world 尺寸会得到不同像素坐标（锚点比例随世界缩放）', () => {
    expect(getEventPoints(1, { w: 800, h: 800 })).not.toEqual(getEventPoints(1, { w: 1600, h: 1600 }));
  });
});

describe('getEventPoints · 非法输入返回空数组且不抛错', () => {
  it('非法 act：非 1/2/3 整数或类型不符', () => {
    for (const act of [0, 4, -1, 1.5, '1', null, undefined, NaN, {}, []]) {
      expect(() => getEventPoints(act, WORLD_SIZES[1])).not.toThrow();
      expect(getEventPoints(act, WORLD_SIZES[1])).toEqual([]);
    }
  });
  it('非法 world：非对象 / 宽高缺失 / 宽高 < 800 / 非有限数值', () => {
    const badWorlds = [
      null, undefined, 42, 'world', [], {},
      { w: 799, h: 800 }, { w: 800, h: 799 }, { w: 800 }, { h: 800 },
      { w: '1920', h: 1440 }, { w: NaN, h: 800 }, { w: Infinity, h: 800 },
    ];
    for (const world of badWorlds) {
      expect(() => getEventPoints(1, world)).not.toThrow();
      expect(getEventPoints(1, world)).toEqual([]);
    }
  });
  it('world 同时接受 {width,height} 别名', () => {
    expect(getEventPoints(1, { width: 1000, height: 900 })).toHaveLength(3);
    expect(getEventPoints(1, { width: 799, height: 900 })).toEqual([]);
  });
});

describe('findTriggeredPoint', () => {
  it('点中心与 radius 边界（≤ 含边界）命中，radius 外不命中', () => {
    const points = getEventPoints(1, WORLD_SIZES[1]);
    const npc = points[0];
    expect(findTriggeredPoint(points, npc.x, npc.y)).toBe(npc);
    expect(findTriggeredPoint(points, npc.x + RADIUS, npc.y)).toBe(npc);
    expect(findTriggeredPoint(points, npc.x - RADIUS, npc.y)).toBe(npc);
    expect(findTriggeredPoint(points, npc.x, npc.y + RADIUS)).toBe(npc);
    expect(findTriggeredPoint(points, npc.x + RADIUS + 0.5, npc.y)).toBeNull();
    expect(findTriggeredPoint(points, npc.x, npc.y + RADIUS + 0.5)).toBeNull();
  });
  it('按数组序返回第一个命中点', () => {
    const points = [
      { id: 'first', x: 100, y: 100, radius: 50 },
      { id: 'second', x: 130, y: 100, radius: 50 },
    ];
    // (140,100) 距 first 40、距 second 10，两点都命中，返回数组序第一的 first
    expect(findTriggeredPoint(points, 140, 100).id).toBe('first');
    // 只有 second 命中时返回 second
    expect(findTriggeredPoint(points, 175, 100).id).toBe('second');
  });
  it('世界中心（出生区）不会触发任何事件点', () => {
    for (const act of ACTS) {
      const world = WORLD_SIZES[act];
      const points = getEventPoints(act, world);
      expect(findTriggeredPoint(points, world.w / 2, world.h / 2)).toBeNull();
    }
  });
  it('非法输入返回 null 且不抛错', () => {
    for (const points of [null, undefined, 'points', 42, {}, []]) {
      expect(() => findTriggeredPoint(points, 0, 0)).not.toThrow();
      expect(findTriggeredPoint(points, 0, 0)).toBeNull();
    }
    const points = [{ id: 'p', x: 500, y: 400, radius: 28 }];
    const badCoords = [[NaN, 400], [500, NaN], [Infinity, 400], [500, -Infinity], [undefined, 400], [500, null], ['500', 400]];
    for (const [x, y] of badCoords) {
      expect(() => findTriggeredPoint(points, x, y)).not.toThrow();
      expect(findTriggeredPoint(points, x, y)).toBeNull();
    }
  });
  it('跳过数组中的畸形点而不抛错', () => {
    const points = [null, { x: NaN, y: 0, radius: 28 }, 'x', { x: 500, y: 400, radius: 28 }];
    expect(findTriggeredPoint(points, 500, 400).x).toBe(500);
  });
  it('缺少 radius 的点按半径 0 处理（仅精确重合命中）', () => {
    const points = [{ id: 'p', x: 500, y: 400 }];
    expect(findTriggeredPoint(points, 500, 400).id).toBe('p');
    expect(findTriggeredPoint(points, 520, 400)).toBeNull();
  });
});
