import { describe, it, expect } from 'vitest';
import { CHARACTER_BUFFS, COMPASS_BUFFS, rollBuff } from '../src/logic/progression.js';

const character = () => ({ maxHp: 100, hp: 60, speed: 100, pickupRadius: 40, iframeBonus: 0, shieldCap: 30 });
const compass = () => ({ damageMul: 1, intervalMul: 1, cooldownMul: 1, hitBonus: 0, comboWindowMul: 1, expMul: 1 });
const byId = (pool, id) => pool.find(b => b.id === id);

describe('被动局外等级', () => {
  it('等级 0 与旧行为完全一致', () => {
    const t = character();
    byId(CHARACTER_BUFFS, 'life').apply(t, 0);
    expect(t).toEqual({ maxHp: 120, hp: 80, speed: 100, pickupRadius: 40, iframeBonus: 0, shieldCap: 30 });
  });
  it('等级 5 让丰沛生命多给 10 上限与 10 回复', () => {
    const t = character();
    byId(CHARACTER_BUFFS, 'life').apply(t, 5);
    expect(t.maxHp).toBe(130); expect(t.hp).toBe(90);
  });
  it('等级 5 让强能刻度封在 1.6', () => {
    const c = compass();
    byId(COMPASS_BUFFS, 'might').apply(c, 5);
    expect(c.damageMul).toBeCloseTo(1.195, 5);
    for (let i = 0; i < 20; i++) byId(COMPASS_BUFFS, 'might').apply(c, 5);
    expect(c.damageMul).toBe(1.6);
  });
  it('疾转与冷凝不跌破 0.55', () => {
    const c = compass();
    for (let i = 0; i < 30; i++) { byId(COMPASS_BUFFS, 'haste').apply(c, 5); byId(COMPASS_BUFFS, 'chill').apply(c, 5); }
    expect(c.intervalMul).toBe(0.55); expect(c.cooldownMul).toBe(0.55);
  });
  it('等级参数非法时按 0，不产生 NaN', () => {
    for (const bad of [-3, 1.5, NaN, '2', null]) {
      const t = character();
      byId(CHARACTER_BUFFS, 'swift').apply(t, bad);
      expect(t.speed).toBeCloseTo(108, 6);
    }
  });
  it('rollBuff 与等级无关，抽取结果不变', () => {
    const a = rollBuff(COMPASS_BUFFS, () => 0.42); const b = rollBuff(COMPASS_BUFFS, () => 0.42);
    expect(a.id).toBe(b.id);
  });
});
