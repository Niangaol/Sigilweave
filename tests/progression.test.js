import { describe, it, expect } from 'vitest';
import { expNeeded, createProgression, grantExp, levelStats, MAJOR_BOSS_LEVEL, shouldTriggerMajorBoss, CHARACTER_BUFFS, COMPASS_BUFFS, rollBuff } from '../src/logic/progression.js';
import { Rng } from '../src/logic/rng.js';

const character = () => ({ maxHp: 100, hp: 60, speed: 100, pickupRadius: 40, iframeBonus: 0, shieldCap: 30 });
const compass = () => ({ damageMul: 1, intervalMul: 1, cooldownMul: 1, hitBonus: 0, comboWindowMul: 1, expMul: 1 });

describe('经验与等级', () => {
  it('使用约定公式，单级需求前快后慢', () => {
    expect(expNeeded(1)).toBe(10);
    expect(expNeeded(5)).toBe(42);
    expect(expNeeded(10)).toBe(89);
    expect(expNeeded(2)).toBeLessThan(expNeeded(5));
    expect(expNeeded(5)).toBeLessThan(expNeeded(10));
    for (let level = 1; level <= 30; level++) expect(expNeeded(level)).toBe(Math.round(6 * level ** 1.15) + 4);
  });
  it('创建状态互相独立', () => {
    const a = createProgression(); const b = createProgression();
    expect(a).toEqual({ level: 1, exp: 0 }); a.exp = 3; expect(b.exp).toBe(0);
  });
  it('未升级保留经验，恰好达到门槛升级', () => {
    const state = createProgression();
    expect(grantExp(state, 9)).toEqual({ ok: true, levelsGained: 0 });
    expect(state).toEqual({ level: 1, exp: 9 });
    expect(grantExp(state, 1)).toEqual({ ok: true, levelsGained: 1 });
    expect(state).toEqual({ level: 2, exp: 0 });
  });
  it('经验倍率乘算后向上取整', () => {
    const state = createProgression();
    expect(grantExp(state, 2.1, 1.15)).toEqual({ ok: true, levelsGained: 0 });
    expect(state.exp).toBe(3);
  });
  it('一次跨越多个等级并保留余量', () => {
    const state = createProgression();
    const amount = [1, 2, 3, 4].reduce((sum, level) => sum + expNeeded(level), 0) + 3;
    expect(grantExp(state, amount)).toEqual({ ok: true, levelsGained: 4 });
    expect(state).toEqual({ level: 5, exp: 3 });
  });
  it('零经验或零倍率有效，但不额外发放经验', () => {
    const state = createProgression();
    expect(grantExp(state, 0).ok).toBe(true); expect(grantExp(state, 20, 0).ok).toBe(true);
    expect(state).toEqual(createProgression());
  });
  for (const bad of [-1, NaN, Infinity, -Infinity, '4', null, undefined, {}, Symbol('x')]) {
    it('拒绝非法经验 ' + String(bad), () => {
      const state = createProgression();
      expect(grantExp(state, bad)).toEqual({ ok: false }); expect(state).toEqual(createProgression());
    });
    if (bad !== undefined) it('拒绝非法倍率 ' + String(bad), () => {
      const state = createProgression();
      expect(grantExp(state, 3, bad)).toEqual({ ok: false }); expect(state).toEqual(createProgression());
    });
  }
  it('拒绝溢出经验且不修改状态', () => {
    const state = createProgression(); expect(grantExp(state, Number.MAX_VALUE, 2).ok).toBe(false);
    expect(state).toEqual(createProgression());
  });
  it.each([null, {}, { level: 0, exp: 0 }, { level: 1.5, exp: 0 }, { level: 1, exp: NaN }, { level: 1, exp: -1 }])('拒绝非法状态 %s', (state) => {
    expect(grantExp(state, 1)).toEqual({ ok: false });
  });
  it('不可写状态不留下半次升级', () => {
    const state = createProgression(); Object.defineProperty(state, 'exp', { writable: false });
    expect(grantExp(state, 50)).toEqual({ ok: false }); expect(state).toEqual(createProgression());
  });
});

describe('等级属性与 Boss 门槛', () => {
  it('L 按当前等级代入公式，移速到 LV15 封顶', () => {
    expect(levelStats(1)).toEqual({ hpMul: 1.16, damageMul: 1.08, speedMul: 1.02 });
    expect(levelStats(5)).toEqual({ hpMul: 1.8, damageMul: 1.4, speedMul: 1.1 });
    expect(levelStats(15).speedMul).toBe(1.3); expect(levelStats(100).speedMul).toBe(1.3);
  });
  it.each([0, -1, NaN, Infinity, 1.2, '3', null, undefined, {}, Symbol('level')])('非法等级 %s 回退 LV1', (value) => {
    expect(levelStats(value)).toEqual(levelStats(1)); expect(expNeeded(value)).toBe(expNeeded(1));
  });
  it('三幕阈值精确到达或超过即触发，场景自行防止重复', () => {
    expect(MAJOR_BOSS_LEVEL).toEqual({ 1: 5, 2: 8, 3: 11 });
    for (const [act, threshold] of [[1, 5], [2, 8], [3, 11]]) {
      expect(shouldTriggerMajorBoss(act, threshold - 1)).toBe(false);
      expect(shouldTriggerMajorBoss(act, threshold)).toBe(true);
      expect(shouldTriggerMajorBoss(act, threshold + 1)).toBe(true);
    }
  });
  it.each([0, 4, '1', null, '__proto__', 'constructor', Symbol('act')])('拒绝非法幕 %s', (act) => {
    expect(shouldTriggerMajorBoss(act, 50)).toBe(false);
  });
  it.each([0, -1, NaN, Infinity, '10', 5.5])('非法等级不触发 %s', (level) => {
    expect(shouldTriggerMajorBoss(1, level)).toBe(false);
  });
});

describe('五种人物本体增益', () => {
  it('具有五个唯一 ID 与中文名/描述', () => {
    expect(CHARACTER_BUFFS.map((b) => b.id)).toEqual(['life', 'swift', 'magnet', 'tough', 'aegis']);
    for (const b of CHARACTER_BUFFS) { expect(b.name).toBeTruthy(); expect(b.desc).toBeTruthy(); }
  });
  const expected = { life: { maxHp: 120, hp: 80 }, swift: { speed: 108 }, magnet: { pickupRadius: 52 }, tough: { iframeBonus: 0.15 }, aegis: { shieldCap: 40 } };
  for (const buff of CHARACTER_BUFFS) {
    it(buff.id + ' 只修改约定人物属性并返回描述', () => {
      const target = character(); expect(buff.apply(target)).toBe(buff.desc);
      expect(target).toEqual({ ...character(), ...expected[buff.id] });
    });
  }
  it('生命增益满血时同步提高上限并治疗，不超过新上限', () => {
    const target = character(); target.hp = 100; CHARACTER_BUFFS[0].apply(target);
    expect(target.hp).toBe(120); expect(target.maxHp).toBe(120);
    target.hp = 999; CHARACTER_BUFFS[0].apply(target); expect(target.hp).toBe(target.maxHp);
  });
  it('人物增益可重复叠加', () => {
    const target = character();
    for (const b of CHARACTER_BUFFS) { b.apply(target); b.apply(target); }
    expect(target.maxHp).toBe(140); expect(target.hp).toBe(100); expect(target.speed).toBeCloseTo(116.64);
    expect(target.pickupRadius).toBe(64); expect(target.iframeBonus).toBeCloseTo(0.3); expect(target.shieldCap).toBe(50);
  });
});

describe('六种罗盘本体增益', () => {
  const cases = [ ['might', 'damageMul', 1.12, 1.6], ['haste', 'intervalMul', 0.92, 0.55], ['chill', 'cooldownMul', 0.9, 0.55], ['wide', 'hitBonus', 6, 18], ['chain', 'comboWindowMul', 1.25, 2], ['greed', 'expMul', 1.15, 1.6] ];
  it('具有六个唯一 ID', () => { expect(COMPASS_BUFFS.map((b) => b.id)).toEqual(cases.map((c) => c[0])); });
  for (const [id, field, first, cap] of cases) {
    it(id + ' 首次精确生效且不修改其他字段', () => {
      const target = compass(); const buff = COMPASS_BUFFS.find((b) => b.id === id);
      expect(buff.apply(target)).toBe(buff.desc); expect(target).toEqual({ ...compass(), [field]: first });
    });
    it(id + ' 重复叠加后封顶', () => {
      const target = compass(); const buff = COMPASS_BUFFS.find((b) => b.id === id);
      for (let i = 0; i < 100; i++) buff.apply(target);
      expect(target[field]).toBe(cap);
      buff.apply(target); expect(target[field]).toBe(cap);
    });
  }
  it('无字段目标使用约定默认倍率', () => {
    const target = {}; for (const b of COMPASS_BUFFS) b.apply(target);
    expect(target).toEqual({ damageMul: 1.12, intervalMul: 0.92, cooldownMul: 0.9, hitBonus: 6, comboWindowMul: 1.25, expMul: 1.15 });
  });
});

describe('确定性增益抽取', () => {
  it('相同 rng 序列返回相同结果且不修改池', () => {
    const a = new Rng('buff-test'); const b = new Rng('buff-test'); const before = [...COMPASS_BUFFS];
    const left = Array.from({ length: 30 }, () => rollBuff(COMPASS_BUFFS, () => a.next()).id);
    const right = Array.from({ length: 30 }, () => rollBuff(COMPASS_BUFFS, () => b.next()).id);
    expect(left).toEqual(right); expect(COMPASS_BUFFS).toEqual(before);
  });
  it('区间左右边界选取首尾元素且只调用一次 rng', () => {
    let calls = 0; expect(rollBuff(CHARACTER_BUFFS, () => { calls++; return 0; })).toBe(CHARACTER_BUFFS[0]);
    expect(calls).toBe(1); expect(rollBuff(CHARACTER_BUFFS, () => 0.999999)).toBe(CHARACTER_BUFFS.at(-1));
  });
  it.each([-1, 1, Infinity, NaN, '0', null])('非法 rng 结果 %s 返回 null', (value) => {
    expect(rollBuff(COMPASS_BUFFS, () => value)).toBeNull();
  });
  it('空池或非法参数返回 null', () => {
    expect(rollBuff([], () => 0)).toBeNull(); expect(rollBuff(null, () => 0)).toBeNull(); expect(rollBuff(COMPASS_BUFFS, null)).toBeNull();
  });
});
