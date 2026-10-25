import { describe, it, expect } from 'vitest';
import { resolveVolley, volleyLimit, VOLLEY_LIMITS, regionOf } from '../src/logic/sector.js';
import { SECTOR_SCREEN_HALF_W, SECTOR_SCREEN_HALF_H } from '../src/logic/constants.js';

const player = { x: 240, y: 135 };
const enemy = (id, x, y, alive = true) => ({ id, x, y, alive, hp: 10, maxHp: 10 });
// 左上近区（r=1,c=1 → 60 号格）内的点：x 在 [240-120, 240)，y 在 [135-67, 135)
const inSector = (id, d, alive = true) => enemy(id, player.x - d, player.y - 1, alive);

describe('割草齐射：一格一次打多个', () => {
  it('只取本区域内的敌人，按距离升序，最多 maxTargets 个', () => {
    const enemies = [inSector(1, 80), inSector(2, 20), inSector(3, 50), enemy(4, 400, 400)];
    const v = resolveVolley(5, player, enemies, { maxTargets: 3 });
    expect(v.targets.map((e) => e.id)).toEqual([2, 3, 1]);
    expect(v.aims).toHaveLength(3);
    expect(v.empty).toBe(false);
    for (const t of v.targets) expect(regionOf(t.x, t.y, player.x, player.y)).toBe(5);
  });

  it('maxTargets 被夹在 1..8，非法值退默认 3', () => {
    const enemies = Array.from({ length: 6 }, (_, i) => inSector(i + 1, 10 + i * 5));
    expect(resolveVolley(5, player, enemies, { maxTargets: 2 }).targets).toHaveLength(2);
    expect(resolveVolley(5, player, enemies, { maxTargets: 99 }).targets).toHaveLength(6);
    expect(resolveVolley(5, player, enemies, { maxTargets: Number.NaN }).targets).toHaveLength(3);
    expect(resolveVolley(5, player, enemies, { maxTargets: 0 }).targets).toHaveLength(1);
  });

  it('跳过死亡敌人，不把死怪算进齐射数量', () => {
    const enemies = [inSector(1, 10, false), inSector(2, 20), inSector(3, 30)];
    expect(resolveVolley(5, player, enemies).targets.map((e) => e.id)).toEqual([2, 3]);
  });

  it('距离相同时按 id 升序，结果确定', () => {
    const enemies = [inSector(9, 40), inSector(4, 40), inSector(7, 40)];
    expect(resolveVolley(5, player, enemies).targets.map((e) => e.id)).toEqual([4, 7, 9]);
  });

  it('区域里没有敌人时回退成补射（不会因为齐射丢掉空区指向）', () => {
    const v = resolveVolley(5, player, [], { maxTargets: 3 });
    expect(v.targets).toHaveLength(0);
    expect(v.empty).toBe(true);
    expect(Number.isFinite(v.aims[0].x)).toBe(true);
    // 补射目标：区域空但有怪时，仍会挑「离区域参考点最近」的一只
    const far = enemy(1, player.x - SECTOR_SCREEN_HALF_W - 200, player.y - SECTOR_SCREEN_HALF_H - 200);
    const assisted = resolveVolley(5, player, [far]);
    expect(assisted.targets).toHaveLength(1);
    expect(assisted.assisted).toBe(true);
  });

  it('各结算类型的齐射上限就是设计值', () => {
    expect(VOLLEY_LIMITS).toEqual({ single: 3, fan3: 2, chain: 2, pierce: 2, echo: 1, ward: 0, area: 1 });
    expect(volleyLimit('single')).toBe(3);
    expect(volleyLimit('area')).toBe(1);
    expect(volleyLimit('nonsense')).toBe(1);
    expect(volleyLimit(undefined)).toBe(1);
  });

  it('空敌人列表/非法坐标安全返回', () => {
    expect(resolveVolley(5, player, []).targets).toEqual([]);
    const broken = [null, { alive: true, x: Number.NaN, y: 0 }, { alive: false, x: 1, y: 1 }];
    expect(() => resolveVolley(5, player, broken)).not.toThrow();
    expect(resolveVolley(5, player, broken).targets).toHaveLength(0);
  });
});
