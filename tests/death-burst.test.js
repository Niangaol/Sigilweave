import { describe, it, expect } from 'vitest';
import { resolveDeathBursts, DEATH_BURST, applyDamage } from '../src/logic/effects.js';

const enemy = (id, x, y, hp = 10, maxHp = hp) => ({ id, x, y, hp, maxHp, alive: hp > 0, armor: 0 });

describe('割草版尸爆', () => {
  it('对半径内的活敌人造成最大生命 50% 的伤害', () => {
    const e = enemy(1, 10, 0, 10, 10);
    const r = resolveDeathBursts({ enemies: [e], seeds: [{ id: 99, x: 0, y: 0 }] });
    expect(r.hits).toBe(1);
    expect(e.hp).toBe(5);
    expect(r.killed).toBe(0);
  });

  it('半径外不受影响，死亡/非有限坐标安全跳过', () => {
    const far = enemy(1, DEATH_BURST.radius + 5, 0, 10, 10);
    const dead = enemy(2, 5, 0, 0, 10);
    const r = resolveDeathBursts({ enemies: [far, dead], seeds: [{ id: 99, x: 0, y: 0 }] });
    expect(r.hits).toBe(0);
    expect(far.hp).toBe(10);
  });

  it('被炸死的敌人会继续引爆，形成连锁清场', () => {
    const b = enemy(1, 25, 0, 5, 10);   // 距离爆点 25，第一轮被打死
    const c = enemy(2, 50, 0, 5, 10);   // 距离 b 25，原本不在爆点半径内，靠 b 的爆炸带走
    const r = resolveDeathBursts({ enemies: [b, c], seeds: [{ id: 99, x: 0, y: 0 }] });
    expect(b.alive).toBe(false);
    expect(c.alive).toBe(false);
    expect(r.killed).toBe(2);
    expect(r.positions).toHaveLength(2);
  });

  it('同一只敌人只爆一次（重复 seed 不会叠伤害）', () => {
    const e = enemy(1, 10, 0, 100, 100);
    const a = enemy(0, 0, 0, 0, 10);
    const r = resolveDeathBursts({ enemies: [e], seeds: [{ id: a.id, x: 0, y: 0 }, { id: a.id, x: 0, y: 0 }] });
    expect(r.hits).toBe(1);
    expect(e.hp).toBe(50);
  });

  it('maxHits 上限防止一次结算无限连锁', () => {
    const list = [];
    for (let i = 0; i < 40; i++) list.push(enemy(i + 1, i * 2, 0, 1, 1));
    const r = resolveDeathBursts({ enemies: list, seeds: [{ id: 999, x: 0, y: 0 }], maxHits: 5 });
    expect(r.hits).toBeLessThanOrEqual(5);
    expect(r.killed).toBeLessThanOrEqual(5);
  });

  it.each([
    {}, { enemies: null, seeds: [] }, { enemies: [], seeds: [] },
    { enemies: [enemy(1, 0, 0)], seeds: [null, {}, { x: NaN, y: 1 }] },
    { enemies: [enemy(1, 0, 0)], seeds: [{ id: 9, x: 0, y: 0 }], damageRatio: 0 },
    { enemies: [enemy(1, 0, 0)], seeds: [{ id: 9, x: 0, y: 0 }], radius: -5 },
  ])('非法/空输入安全返回 %j', (args) => {
    const r = resolveDeathBursts(args);
    expect(r.hits).toBe(0);
    expect(r.killed).toBe(0);
    expect(r.positions).toEqual([]);
  });

  it('applyDamage 的护甲仍然生效（尸爆不吃特殊通道）', () => {
    const armored = { ...enemy(1, 0, 0, 10, 10), armor: 0.5 };
    resolveDeathBursts({ enemies: [armored], seeds: [{ id: 9, x: 0, y: 0 }] });
    expect(armored.hp).toBeCloseTo(7.5, 5);
  });
});
