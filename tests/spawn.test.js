import { describe, it, expect } from 'vitest';
import { pickSpawnPoint, separateEnemies } from '../src/logic/spawn.js';

const world = { w: 1920, h: 1440 };
const player = { x: 960, y: 720 };
// 固定序列伪随机，保证可复现
const seq = (values) => { let i = 0; return () => values[i++ % values.length]; };

describe('刷怪落点', () => {
  it('永远落在离玩家 nearDist..farDist 之间且不出界', () => {
    for (let k = 0; k < 50; k++) {
      const p = pickSpawnPoint({ rng: seq([(k * 0.137) % 1, (k * 0.379) % 1]), player, world, enemies: [] });
      expect(p.x).toBeGreaterThanOrEqual(28);
      expect(p.x).toBeLessThanOrEqual(world.w - 28);
      expect(p.y).toBeGreaterThanOrEqual(48);
      expect(p.y).toBeLessThanOrEqual(world.h - 28);
      const d = Math.hypot(p.x - player.x, p.y - player.y);
      expect(d).toBeGreaterThanOrEqual(140);
      expect(d).toBeLessThanOrEqual(560);
    }
  });
  it('避开已有敌人：与最近敌人的间距不低于 minGap', () => {
    const enemies = [{ x: 1190, y: 720 }, { x: 730, y: 720 }];
    // 前两次采样故意落在敌人身上，第三次才合格
    const rng = seq([0, 0.5, 0, 0.5, 0.25, 0.5]);
    const p = pickSpawnPoint({ rng, player, world, enemies, minGap: 36 });
    for (const e of enemies) expect(Math.hypot(p.x - e.x, p.y - e.y)).toBeGreaterThanOrEqual(36);
  });
  it('世界被敌人挤满时也要给出最不拥挤的候选点', () => {
    const ring = [];
    for (let a = 0; a < 12; a++) {
      ring.push({ x: player.x + Math.cos(a) * 320, y: player.y + Math.sin(a) * 320 });
    }
    const p = pickSpawnPoint({ rng: seq([0.11, 0.5]), player, world, enemies: ring, minGap: 999 });
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
    expect(p.gap).toBeGreaterThan(0);
  });
  it('同 seed 命中同一落点序列', () => {
    const run = () => {
      const rng = seq([0.62, 0.41, 0.18, 0.93]);
      return [0, 1, 2].map(() => pickSpawnPoint({ rng, player, world, enemies: [] }));
    };
    expect(run()).toEqual(run());
  });
});

describe('拥挤分离', () => {
  it('重叠的杂兵被推到 gap 间距', () => {
    const list = [
      { id: 1, alive: true, x: 100, y: 100 },
      { id: 2, alive: true, x: 104, y: 100 },
    ];
    expect(separateEnemies(list, { gap: 22 })).toBe(1);
    expect(Math.abs(list[1].x - list[0].x)).toBeCloseTo(22, 5);
  });
  it('不动 Boss，也不动已在玩家身边即将接触的一对', () => {
    const boss = { id: 9, alive: true, isBoss: true, x: 100, y: 100 };
    const mob = { id: 1, alive: true, x: 104, y: 100 };
    expect(separateEnemies([boss, mob], { gap: 22 })).toBe(0);
    expect(boss.x).toBe(100);
    const p = { x: 110, y: 100 };
    const a = { id: 2, alive: true, x: 104, y: 100 };
    const b = { id: 3, alive: true, x: 108, y: 100 };
    expect(separateEnemies([a, b], { gap: 22, player: p, contactDist: 30 })).toBe(0);
  });
  it('完全重合也能分开且结果确定', () => {
    const make = () => [
      { id: 1, alive: true, x: 500, y: 500 },
      { id: 2, alive: true, x: 500, y: 500 },
    ];
    const a = make(); const b = make();
    separateEnemies(a, { gap: 22 }); separateEnemies(b, { gap: 22 });
    expect(Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y)).toBeCloseTo(22, 5);
    expect(a).toEqual(b);
  });
});
