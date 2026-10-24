import { describe, it, expect } from 'vitest';
import { ZONE, cellZone, outerSides, insetEdges, decoratePlan } from '../src/ui/board-decor.js';

const square = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 12 }, { x: 0, y: 12 }];

describe('方阵区位分类', () => {
  it('四角 / 八边 / 四心，正好覆盖 16 格', () => {
    const zones = [];
    for (let id = 0; id < 16; id++) zones.push(cellZone(id));
    expect(zones.filter(z => z === ZONE.CORNER)).toHaveLength(4);
    expect(zones.filter(z => z === ZONE.EDGE)).toHaveLength(8);
    expect(zones.filter(z => z === ZONE.CENTER)).toHaveLength(4);
    expect(zones.filter(Boolean)).toHaveLength(16);
  });
  it('角落是四个真实角，中心是中间 2×2', () => {
    expect([0, 3, 12, 15].every(id => cellZone(id) === ZONE.CORNER)).toBe(true);
    expect([5, 6, 9, 10].every(id => cellZone(id) === ZONE.CENTER)).toBe(true);
    expect([1, 2, 4, 7, 8, 11, 13, 14].every(id => cellZone(id) === ZONE.EDGE)).toBe(true);
  });
  it('非法 id 返回 null 而不是猜一个默认区', () => {
    for (const bad of [-1, 16, 1.5, NaN, '5', null, undefined]) expect(cellZone(bad)).toBeNull();
  });
  it('外侧边方向正确', () => {
    expect(outerSides(0)).toMatchObject({ top: true, left: true, bottom: false, right: false });
    expect(outerSides(15)).toMatchObject({ bottom: true, right: true, top: false, left: false });
    expect(outerSides(1)).toMatchObject({ top: true, left: false, right: false, bottom: false });
    expect(outerSides(9).any).toBe(false);
  });
});

describe('装饰计划', () => {
  it('角落：两条外边各压两层（护角更厚）+ 一颗铆钉 + 略暗石面', () => {
    const plan = decoratePlan(0, square);
    expect(plan.zone).toBe(ZONE.CORNER);
    // 两条外侧边 × 内外两线
    expect(plan.lines).toHaveLength(4);
    expect(plan.dots).toHaveLength(1);
    expect(plan.dots[0].size).toBe(2);
    expect(plan.wash).toMatchObject({ color: 'nightDeep' });
  });
  it('边上：单条外边 + 两端小钉，不改石面', () => {
    const plan = decoratePlan(1, square);
    expect(plan.zone).toBe(ZONE.EDGE);
    expect(plan.lines).toHaveLength(1);
    expect(plan.dots).toHaveLength(2);
    expect(plan.wash).toBeNull();
  });
  it('中心：用内嵌符文方框而不是外边，配淡染与两侧刻点', () => {
    const plan = decoratePlan(5, square);
    expect(plan.zone).toBe(ZONE.CENTER);
    // 内框四条边，颜色是符文色而不是黄铜
    expect(plan.lines).toHaveLength(4);
    expect(plan.lines.every(l => l.color === 'arcane')).toBe(true);
    expect(plan.dots).toHaveLength(2);
    expect(plan.wash).toMatchObject({ color: 'arcane' });
  });
  it('三种区位的刻线颜色/数量互不相同，肉眼可分', () => {
    const corner = decoratePlan(0, square);
    const edge = decoratePlan(1, square);
    const center = decoratePlan(5, square);
    expect(corner.lines.length).toBeGreaterThan(edge.lines.length);
    expect(center.lines.every(l => l.color === 'arcane')).toBe(true);
    expect(edge.lines.every(l => l.color === 'brass')).toBe(true);
    expect(corner.wash.alpha).toBeGreaterThan(edge.wash?.alpha ?? 0);
  });
  it('刻线收在格内，不越出四边形', () => {
    for (let id = 0; id < 16; id++) {
      const plan = decoratePlan(id, square);
      for (const line of plan.lines) {
        for (const p of [line.a, line.b]) {
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.x).toBeLessThanOrEqual(30);
          expect(p.y).toBeGreaterThanOrEqual(0);
          expect(p.y).toBeLessThanOrEqual(12);
        }
      }
    }
  });
  it('护角的刻线在各边相交处让位，不会拼成整圈框', () => {
    const plan = decoratePlan(0, square, { inset: 1, arm: 4 });
    const top = plan.lines.find(l => l.a.y === l.b.y);
    expect(top.a.x).toBeGreaterThan(0); // 起点已被让开
  });
  it('inset 越大刻线越靠内，幕间大盘可复用', () => {
    const small = decoratePlan(1, square, { inset: 1 });
    const big = decoratePlan(1, square, { inset: 3 });
    expect(big.lines[0].a.y).toBeGreaterThan(small.lines[0].a.y);
  });
  it('四边形非法时返回 null', () => {
    expect(decoratePlan(0, null)).toBeNull();
    expect(decoratePlan(0, [{ x: 0, y: 0 }])).toBeNull();
  });
});
