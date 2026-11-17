import { describe, it, expect } from 'vitest';
import { applyDamage, resolveDeathBursts } from '../src/logic/effects.js';

// 统一构造最小敌人：不依赖 Phaser，字段与 BattleScene/Enemy 实际传入的一致。
function makeEnemy(over = {}) {
  return { id: 1, x: 0, y: 0, alive: true, hp: 100, maxHp: 100, armor: 0, ...over };
}

describe('护盾结算 applyDamage：盾 → 甲 → 血', () => {
  it('部分吸收：hp 不变、返回 0、盾减少、lastBlocked 记录吸收量', () => {
    const e = makeEnemy({ shield: 30 });
    expect(applyDamage(e, 10)).toBe(0);
    expect(e.hp).toBe(100);
    expect(e.shield).toBe(20);
    expect(e.lastBlocked).toBe(10);
    expect(e.lastHitAmount).toBe(0);
    expect(e.shieldBrokenPending).toBeUndefined();
    expect(e.alive).toBe(true);
  });

  it('溢出：盾清零、pending=true、hp 扣剩余伤害（armor=0）', () => {
    const e = makeEnemy({ shield: 5, hp: 50 });
    expect(applyDamage(e, 20)).toBe(15);
    expect(e.shield).toBe(0);
    expect(e.shieldBrokenPending).toBe(true);
    expect(e.lastBlocked).toBe(5);
    expect(e.hp).toBe(35);
  });

  it('伤害恰好被盾吃满时也算破盾，但不扣血', () => {
    const e = makeEnemy({ shield: 10 });
    expect(applyDamage(e, 10)).toBe(0);
    expect(e.shield).toBe(0);
    expect(e.shieldBrokenPending).toBe(true);
    expect(e.lastBlocked).toBe(10);
    expect(e.hp).toBe(100);
    expect(e.alive).toBe(true);
  });

  it('盾 + 甲叠加：先盾后甲，扣血 = 剩余 × (1 - armor)', () => {
    const e = makeEnemy({ shield: 10, armor: 0.5 });
    // 盾先吃掉 10，剩 20；护甲减半 → 实际扣血 10。
    // 若顺序反了（先甲后盾），30×0.5=15 再被盾吃 10，只会扣 5。
    expect(applyDamage(e, 30)).toBeCloseTo(10, 6);
    expect(e.hp).toBeCloseTo(90, 6);
    expect(e.lastBlocked).toBe(10);
    expect(e.shield).toBe(0);
    expect(e.shieldBrokenPending).toBe(true);
  });

  it('返回值只统计扣血伤害：被盾吸收的部分不计入', () => {
    const e = makeEnemy({ shield: 10 });
    expect(applyDamage(e, 30)).toBe(20);
    expect(e.hp).toBe(80);
    expect(e.lastBlocked).toBe(10);
  });

  it('盾吸收到 0 但剩余伤害被 hp 上限截断时，仍只返回实际扣血', () => {
    const e = makeEnemy({ shield: 5, hp: 3, armor: 0 });
    expect(applyDamage(e, 100)).toBe(3);
    expect(e.hp).toBe(0);
    expect(e.alive).toBe(false);
    expect(e.lastBlocked).toBe(5);
  });
});

describe('缺省 / 非法盾完全走旧路径', () => {
  it('没有 shield 字段时按旧逻辑结算，lastBlocked 为 0', () => {
    const e = makeEnemy({ armor: 0.25 });
    expect(applyDamage(e, 12)).toBeCloseTo(9, 6);
    expect(e.hp).toBeCloseTo(91, 6);
    expect(e.lastBlocked).toBe(0);
    expect(e.shieldBrokenPending).toBeUndefined();
  });

  it.each([
    ['0', 0],
    ['负数', -5],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
    ['null', null],
    ['undefined', undefined],
    ['字符串', '12'],
  ])('shield 为 %s 时按旧逻辑扣血且无破盾副作用', (_label, shield) => {
    const e = makeEnemy({ shield, armor: 0.5 });
    expect(applyDamage(e, 10)).toBeCloseTo(5, 6);
    expect(e.hp).toBeCloseTo(95, 6);
    expect(e.lastBlocked).toBe(0);
    expect(e.shieldBrokenPending).toBeUndefined();
  });

  it('amount 为 0 时不消耗盾、不破盾', () => {
    const e = makeEnemy({ shield: 10 });
    expect(applyDamage(e, 0)).toBe(0);
    expect(e.shield).toBe(10);
    expect(e.shieldBrokenPending).toBeUndefined();
    expect(e.lastBlocked).toBe(0);
    expect(e.hp).toBe(100);
  });

  it('alive / hp / amount 非法时返回 0 且不改状态（含盾）', () => {
    const dead = makeEnemy({ alive: false, shield: 10 });
    expect(applyDamage(dead, 5)).toBe(0);
    expect(dead.shield).toBe(10);
    expect(dead.shieldBrokenPending).toBeUndefined();
    expect(dead.hp).toBe(100);

    const badHp = makeEnemy({ hp: NaN, shield: 10 });
    expect(applyDamage(badHp, 5)).toBe(0);
    expect(badHp.shield).toBe(10);
    expect(badHp.shieldBrokenPending).toBeUndefined();

    for (const amount of [-1, NaN, Infinity, -Infinity, '5', null, undefined]) {
      const e = makeEnemy({ shield: 10 });
      expect(applyDamage(e, amount)).toBe(0);
      expect(e.shield).toBe(10);
      expect(e.shieldBrokenPending).toBeUndefined();
      expect(e.hp).toBe(100);
    }
  });
});

describe('死后与尸爆', () => {
  it('死亡后再次受击返回 0，不再消耗盾', () => {
    const e = makeEnemy({ shield: 10, hp: 10 });
    expect(applyDamage(e, 20)).toBe(10);
    expect(e.alive).toBe(false);
    expect(e.shield).toBe(0);
    expect(e.shieldBrokenPending).toBe(true);

    expect(applyDamage(e, 20)).toBe(0);
    expect(e.shield).toBe(0);
    expect(e.hp).toBe(0);
  });

  it('尸爆吃盾：盾内伤害完全不扣血，只掉盾', () => {
    const e = makeEnemy({ id: 1, x: 0, y: 0, hp: 100, maxHp: 100, shield: 60 });
    const r = resolveDeathBursts({ enemies: [e], seeds: [{ id: 99, x: 0, y: 0 }] });
    expect(r.hits).toBe(1);
    expect(r.killed).toBe(0);
    expect(e.shield).toBe(10);
    expect(e.hp).toBe(100);
    expect(e.lastBlocked).toBe(50);
    expect(e.alive).toBe(true);
  });

  it('尸爆超出盾量时，剩余伤害继续扣血并破盾', () => {
    const e = makeEnemy({ id: 1, x: 0, y: 0, hp: 100, maxHp: 100, shield: 20 });
    const r = resolveDeathBursts({ enemies: [e], seeds: [{ id: 99, x: 0, y: 0 }] });
    expect(r.hits).toBe(1);
    expect(r.killed).toBe(0);
    expect(e.shield).toBe(0);
    expect(e.shieldBrokenPending).toBe(true);
    expect(e.hp).toBe(70);
  });
});
