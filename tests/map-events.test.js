import { describe, it, expect } from 'vitest';
import {
  getEventPoints,
  findTriggeredPoint,
  POINT_RADIUS,
  EDGE_MARGIN,
  MIN_SPACING,
  MIN_SPAWN_DISTANCE,
  MIN_WORLD_SIZE,
} from '../src/data/map-events.js';
import { WORLD_SIZES } from '../src/logic/constants.js';
import { minorBossIdsOfStage, encounterIdsOfStage } from '../src/logic/acts.js';

// 五幕七场：场 1-3 各 1 NPC + 4 小 Boss，场 4-7（合并幕）各 1 NPC + 2 小 Boss。
const STAGES = [1, 2, 3, 4, 5, 6, 7];
const POINT_COUNT = { 1: 5, 2: 5, 3: 5, 4: 3, 5: 3, 6: 3, 7: 3 };
const TOTAL_POINTS = 27;
const RADIUS = 34; // 事件点半径（与 POINT_RADIUS 常量同步）

const EXPECTED = {
  1: { npc: '艾琳', miniboss: '守墓傀儡' },
  2: { npc: '瑟维安', miniboss: '腐沼巨尸' },
  3: { npc: '莉芙拉', miniboss: '裂瞳主教' },
  4: { npc: '梅薇', miniboss: '缄默书吏' },
  5: { npc: '奥菲', miniboss: '铁面陪审' },
  6: { npc: '铎恩', miniboss: '淬火傀儡' },
  7: { npc: '黎恩', miniboss: '残星骑士' },
};

const squared = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;
const quadrantOf = (p, w, h) => (p.x < w / 2 ? 'L' : 'R') + (p.y < h / 2 ? 'T' : 'B');

// 布置约束全量校验：边缘 / 两两间距 / 出生距离（阈值一律取模块导出的常量）
const expectLayoutValid = (points, w, h) => {
  for (const p of points) {
    expect(p.x).toBeGreaterThanOrEqual(EDGE_MARGIN);
    expect(p.x).toBeLessThanOrEqual(w - EDGE_MARGIN);
    expect(p.y).toBeGreaterThanOrEqual(EDGE_MARGIN);
    expect(p.y).toBeLessThanOrEqual(h - EDGE_MARGIN);
    // 距地图中心（出生区）严格大于 MIN_SPAWN_DISTANCE
    expect(squared(p.x, p.y, w / 2, h / 2)).toBeGreaterThan(MIN_SPAWN_DISTANCE * MIN_SPAWN_DISTANCE);
  }
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const p = points[i];
      const q = points[j];
      expect(squared(p.x, p.y, q.x, q.y)).toBeGreaterThanOrEqual(MIN_SPACING * MIN_SPACING);
    }
  }
};

describe('常量阈值（五幕七场放大后的硬约束）', () => {
  it('POINT_RADIUS 34 / EDGE_MARGIN 80 / MIN_SPACING 400 / MIN_SPAWN_DISTANCE 240 / MIN_WORLD_SIZE 1600', () => {
    expect([POINT_RADIUS, EDGE_MARGIN, MIN_SPACING, MIN_SPAWN_DISTANCE, MIN_WORLD_SIZE]).toEqual([
      34, 80, 400, 240, 1600,
    ]);
  });
});

describe('getEventPoints · 点数与结构', () => {
  it('每场点数：1-3 场五点、4-7 场三点，全图共 27 点', () => {
    let total = 0;
    for (const stage of STAGES) {
      const points = getEventPoints(stage, WORLD_SIZES[stage]);
      expect(points).toHaveLength(POINT_COUNT[stage]);
      total += points.length;
    }
    expect(total).toBe(TOTAL_POINTS);
  });

  for (const stage of STAGES) {
    it(stage + ' 场：1 NPC + ' + (POINT_COUNT[stage] - 1) + ' 小 Boss，id/类型/名字/半径/提示齐全', () => {
      const points = getEventPoints(stage, WORLD_SIZES[stage]);
      const expectedIds = ['npc-' + stage, ...minorBossIdsOfStage(stage)];
      expect(points.map((p) => p.id)).toEqual(expectedIds);
      expect(points.map((p) => p.type)).toEqual(['npc', ...expectedIds.slice(1).map(() => 'miniboss')]);
      expect(points.filter((p) => p.type === 'npc')).toHaveLength(1);
      expect(points.every((p) => p.radius === RADIUS)).toBe(true);
      expect(points[0].name).toBe(EXPECTED[stage].npc);
      for (const p of points.slice(1)) expect(p.name).toBe(EXPECTED[stage].miniboss);
      for (const p of points) {
        expect(typeof p.hint).toBe('string');
        expect(p.hint.length).toBeGreaterThan(0);
      }
      // 5 个点 5 条不同提示（4 个点 4 条），避免 UI 上重复的探索文案
      expect(new Set(points.map((p) => p.hint)).size).toBe(points.length);
      for (const p of points) {
        expect(Number.isInteger(p.x)).toBe(true);
        expect(Number.isInteger(p.y)).toBe(true);
      }
    });
  }
});

describe('getEventPoints · id 与 acts.js 完全对齐', () => {
  for (const stage of STAGES) {
    it(stage + ' 场：事件点 id 集合 = encounterIdsOfStage 去掉大 Boss', () => {
      const points = getEventPoints(stage, WORLD_SIZES[stage]);
      const ids = points.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toEqual(encounterIdsOfStage(stage).filter((id) => !id.startsWith('boss-')));
      for (const id of ids) expect(encounterIdsOfStage(stage)).toContain(id);
      expect(ids).not.toContain('boss-' + stage);
    });
  }
});

describe('getEventPoints · 布置约束', () => {
  // 真实场尺寸 + 合法最小世界 1600×1600（最坏情况）+ 非整尺寸合法世界
  const worlds = [
    ['本场默认世界', (stage) => WORLD_SIZES[stage]],
    ['最小合法世界 ' + MIN_WORLD_SIZE + '×' + MIN_WORLD_SIZE + '（最坏情况）', () => ({ w: 1600, h: 1600 })],
    ['非整尺寸 1733×1611', () => ({ w: 1733, h: 1611 })],
  ];
  for (const [label, pick] of worlds) {
    for (const stage of STAGES) {
      it(stage + ' 场 @ ' + label + '：边缘≥80 / 互相≥400 / 距中心>240', () => {
        const world = pick(stage);
        expectLayoutValid(getEventPoints(stage, world), world.w, world.h);
      });
    }
  }

  it('场 1-3 五点铺开：至少覆盖 4 个象限，且单个象限不超过 2 点', () => {
    for (const stage of [1, 2, 3]) {
      const world = WORLD_SIZES[stage];
      const quadrants = getEventPoints(stage, world).map((p) => quadrantOf(p, world.w, world.h));
      expect(new Set(quadrants).size).toBeGreaterThanOrEqual(4);
      expect(Math.max(...[...quadrants.reduce((m, q) => m.set(q, (m.get(q) || 0) + 1), new Map()).values()])).toBeLessThanOrEqual(2);
    }
  });

  it('场 4-7 三点仍分居三个不同象限', () => {
    for (const stage of [4, 5, 6, 7]) {
      const world = WORLD_SIZES[stage];
      const quadrants = getEventPoints(stage, world).map((p) => quadrantOf(p, world.w, world.h));
      expect(new Set(quadrants).size).toBe(3);
    }
  });
});

describe('getEventPoints · 七场坐标互不相同', () => {
  it('各场默认世界下 27 个点坐标两两不同', () => {
    const all = STAGES.flatMap((stage) => getEventPoints(stage, WORLD_SIZES[stage]));
    expect(all).toHaveLength(TOTAL_POINTS);
    expect(new Set(all.map((p) => p.x + ',' + p.y)).size).toBe(TOTAL_POINTS);
  });
});

describe('getEventPoints · 确定性', () => {
  for (const stage of STAGES) {
    it(stage + ' 场同 world 两次调用结果完全一致（深相等）', () => {
      expect(getEventPoints(stage, WORLD_SIZES[stage])).toEqual(getEventPoints(stage, WORLD_SIZES[stage]));
    });
  }
  it('不同 world 尺寸会得到不同像素坐标（锚点比例随世界缩放）', () => {
    expect(getEventPoints(1, { w: 1600, h: 1600 })).not.toEqual(getEventPoints(1, { w: 2400, h: 1800 }));
  });
});

describe('getEventPoints · 非法输入返回空数组且不抛错', () => {
  it('非法 stage：非 1-7 整数或类型不符', () => {
    for (const stage of [0, 8, -1, 1.5, '1', null, undefined, NaN, {}, []]) {
      expect(() => getEventPoints(stage, WORLD_SIZES[1])).not.toThrow();
      expect(getEventPoints(stage, WORLD_SIZES[1])).toEqual([]);
    }
  });
  it('非法 world：非对象 / 宽高缺失 / 宽高 < MIN_WORLD_SIZE / 非有限数值', () => {
    const badWorlds = [
      null, undefined, 42, 'world', [], {},
      { w: 1599, h: 1600 }, { w: 1600, h: 1599 }, { w: 1600 }, { h: 1600 },
      { w: '1600', h: 1600 }, { w: NaN, h: 1600 }, { w: Infinity, h: 1600 },
      { w: 1000, h: 900 }, { w: 800, h: 800 },
    ];
    for (const world of badWorlds) {
      expect(() => getEventPoints(1, world)).not.toThrow();
      expect(getEventPoints(1, world)).toEqual([]);
    }
  });
  it('world 同时接受 {width,height} 别名（阈值同样是 1600）', () => {
    expect(getEventPoints(1, { width: 1680, height: 1620 })).toHaveLength(5);
    expect(getEventPoints(1, { width: 1599, height: 1620 })).toEqual([]);
  });
});

describe('findTriggeredPoint（行为保持不变）', () => {
  it('点中心与 radius 边界（≤ 含边界）命中，radius 外不命中', () => {
    const points = getEventPoints(1, WORLD_SIZES[1]);
    for (const point of points) {
      expect(findTriggeredPoint(points, point.x, point.y)).toBe(point);
      expect(findTriggeredPoint(points, point.x + RADIUS, point.y)).toBe(point);
      expect(findTriggeredPoint(points, point.x - RADIUS, point.y)).toBe(point);
      expect(findTriggeredPoint(points, point.x, point.y + RADIUS)).toBe(point);
      expect(findTriggeredPoint(points, point.x + RADIUS + 0.5, point.y)).toBeNull();
      expect(findTriggeredPoint(points, point.x, point.y + RADIUS + 0.5)).toBeNull();
    }
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
    for (const stage of STAGES) {
      const world = WORLD_SIZES[stage];
      const points = getEventPoints(stage, world);
      expect(findTriggeredPoint(points, world.w / 2, world.h / 2)).toBeNull();
    }
  });
  it('非法输入返回 null 且不抛错', () => {
    for (const points of [null, undefined, 'points', 42, {}, []]) {
      expect(() => findTriggeredPoint(points, 0, 0)).not.toThrow();
      expect(findTriggeredPoint(points, 0, 0)).toBeNull();
    }
    const points = [{ id: 'p', x: 500, y: 400, radius: RADIUS }];
    const badCoords = [[NaN, 400], [500, NaN], [Infinity, 400], [500, -Infinity], [undefined, 400], [500, null], ['500', 400]];
    for (const [x, y] of badCoords) {
      expect(() => findTriggeredPoint(points, x, y)).not.toThrow();
      expect(findTriggeredPoint(points, x, y)).toBeNull();
    }
  });
  it('跳过数组中的畸形点而不抛错', () => {
    const points = [null, { x: NaN, y: 0, radius: RADIUS }, 'x', { x: 500, y: 400, radius: RADIUS }];
    expect(findTriggeredPoint(points, 500, 400).x).toBe(500);
  });
  it('缺少 radius 的点按半径 0 处理（仅精确重合命中）', () => {
    const points = [{ id: 'p', x: 500, y: 400 }];
    expect(findTriggeredPoint(points, 500, 400).id).toBe('p');
    expect(findTriggeredPoint(points, 520, 400)).toBeNull();
  });
});
