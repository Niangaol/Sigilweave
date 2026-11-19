import { describe, it, expect } from 'vitest';
import { pickSpawnPoint, pickWavePoints, separateEnemies } from '../src/logic/spawn.js';

const world = { w: 1920, h: 1440 };
const player = { x: 960, y: 720 };
// 固定序列伪随机，保证可复现
const seq = (values) => { let i = 0; return () => values[i++ % values.length]; };
// 两个角的最短夹角：扇区中心可以是任意方向（编队要往「玩家反方向」刷），
// 直接 atan2 会在 ±π 处跳变，必须按圆周距离比。
const angDiff = (a, b) => {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
};

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

// ---------- C2：编队扇区（spec §5.2：编队朝「玩家反方向 ±0.6rad」刷） ----------
describe('刷怪落点·编队扇区', () => {
  // 扇区只许改角度公式，不许多抽一次 rng：同 seed 的刷怪节奏一旦多抽一次，
  // 下面这条「同 seed 同一落点序列」的复现性对拍就废了。
  // 所以测的是「带扇区与不带扇区时 rng 调用次数相同」这个行为不变量，
  // 而不是钉死某个次数——pickSpawnPoint 会重试，重试几次取决于点合不合格，
  // 写死次数会把实现锁死（brief 里 toBe(3) 的写法已按此修正）。
  it('带扇区与不带扇区时 rng 调用次数相同', () => {
    const values = [0.9, 0.2, 0.35, 0.8, 0.15, 0.65];
    const measure = (sector) => {
      let calls = 0;
      let i = 0;
      const rng = () => { calls++; return values[i++ % values.length]; };
      const point = pickSpawnPoint({
        rng, player, world, enemies: [],
        ...(sector ? { sectorAngle: Math.PI, sectorSpread: 1.2 } : {}),
      });
      return { calls, point };
    };
    const plain = measure(false);
    const sector = measure(true);
    expect(sector.calls).toBe(plain.calls);
    expect(sector.calls).toBeGreaterThan(0);
    // 扇区必须真的改变角度，否则这条测试会变成空操作
    expect(sector.point).not.toEqual(plain.point);
  });

  it('给扇区时落点落在扇区内（sectorSpread 是全宽，半宽 = spread/2）', () => {
    const sectorAngle = 0;
    const sectorSpread = 1.2;
    for (const v of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99, 0.33, 0.66]) {
      const p = pickSpawnPoint({ rng: () => v, player, world, enemies: [], sectorAngle, sectorSpread });
      expect(angDiff(Math.atan2(p.y - player.y, p.x - player.x), sectorAngle))
        .toBeLessThanOrEqual(sectorSpread / 2 + 1e-9);
    }
  });

  it('扇区中心即玩家反方向时，落点整体在玩家身后', () => {
    const p = pickSpawnPoint({ rng: seq([0.9, 0.2]), player, world, enemies: [], sectorAngle: Math.PI, sectorSpread: 1.2 });
    expect(p.x).toBeLessThan(player.x);
    expect(angDiff(Math.atan2(p.y - player.y, p.x - player.x), Math.PI)).toBeLessThanOrEqual(0.6 + 1e-9);
  });

  it('扇区参数非法时回退全向随机，与不传参数的落点逐点相同', () => {
    const base = pickSpawnPoint({ rng: () => 0.9, player, world, enemies: [] });
    expect(pickSpawnPoint({ rng: () => 0.9, player, world, enemies: [], sectorAngle: NaN, sectorSpread: 1.2 })).toEqual(base);
    expect(pickSpawnPoint({ rng: () => 0.9, player, world, enemies: [], sectorAngle: 0, sectorSpread: Infinity })).toEqual(base);
    expect(pickSpawnPoint({ rng: () => 0.9, player, world, enemies: [], sectorAngle: 'x', sectorSpread: 1.2 })).toEqual(base);
    expect(pickSpawnPoint({ rng: () => 0.9, player, world, enemies: [], sectorAngle: 0 })).toEqual(base);
  });

  it('pickWavePoints 透传扇区：整波落点都在同一扇区内', () => {
    const sectorAngle = Math.PI * 0.5;
    const sectorSpread = 0.6;
    const pts = pickWavePoints({
      rng: seq([0.1, 0.2, 0.5, 0.8, 0.9, 0.3]), player, world, enemies: [], count: 3,
      sectorAngle, sectorSpread, minDist: 275, maxDist: 380, minGap: 30, nearDist: 250, farDist: 430,
    });
    expect(pts).toHaveLength(3);
    for (const p of pts) {
      expect(angDiff(Math.atan2(p.y - player.y, p.x - player.x), sectorAngle))
        .toBeLessThanOrEqual(sectorSpread / 2 + 1e-9);
    }
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
