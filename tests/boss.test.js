import { describe, it, expect } from 'vitest';
import { createBossModel, stepBoss, resolveBossOnce, bossPattern } from '../src/logic/boss.js';

const fireOnce = (act, position = { x: 0, y: 0 }, target = { x: 100, y: 0 }) => {
  const boss = createBossModel(act);
  stepBoss(boss, 1200, position, target);   // 进入预警
  return { boss, shots: stepBoss(boss, 600, position, target) };
};

describe('Boss预警与实际攻击', () => {
  it('先等待再600ms预警，瞄准快照不跟随玩家移动', () => {
    const boss = createBossModel(1), p = { x: 0, y: 0 }, target = { x: 100, y: 0 };
    expect(stepBoss(boss, 1200, p, target)).toEqual([]);
    expect(boss.windupLeft).toBe(600); expect(boss.aim).toEqual(target);
    expect(stepBoss(boss, 599, p, { x: 0, y: 100 })).toEqual([]);
    const shots = stepBoss(boss, 1, p, { x: 0, y: 100 });
    expect(shots).toHaveLength(5); expect(shots[2].vx).toBeGreaterThan(0); expect(shots[2].vy).toBe(0);
    expect(boss.shots).toBe(1); expect(shots.every(s => s.damage > 0)).toBe(true);
  });

  it('后续攻击也需要下一轮预警', () => {
    const { boss } = fireOnce(3);
    expect(stepBoss(boss, 100, { x: 1, y: 1 }, { x: 1, y: 1 })).toEqual([]);
    expect(boss.shots).toBe(1);
  });

  it.each([
    [1, 5], [2, 8], [3, 7],
  ])('第 %i 幕使用自己的弹幕模板（%i 发）', (act, count) => {
    const { shots } = fireOnce(act);
    expect(shots).toHaveLength(count);
    expect(shots.every(s => s.damage > 0 && s.lifeMs > 0)).toBe(true);
  });

  it('三幕弹幕形态确实不同：一扇形、二环形、三更快', () => {
    const one = fireOnce(1).shots;
    const two = fireOnce(2).shots;
    const three = fireOnce(3).shots;
    // 环形应覆盖多个方向（正负都有），扇形集中在正前方一侧
    expect(two.some(s => s.vx < 0)).toBe(true);
    expect(two.some(s => s.vx > 0)).toBe(true);
    expect(one.every(s => s.vx >= 0)).toBe(true);       // 扇形整体朝目标方向
    expect(one.some(s => s.vy < 0) && one.some(s => s.vy > 0)).toBe(true); // 上下扩散
    // 三幕速度更快，二幕更慢
    const speed = (shots) => Math.hypot(shots[0].vx, shots[0].vy);
    expect(speed(three)).toBeGreaterThan(speed(one));
    expect(speed(two)).toBeLessThan(speed(one));
    expect(bossPattern(2).ring).toBe(true);
    expect(bossPattern(1).ring).toBeUndefined();
  });

  it.each([NaN, -1, Infinity])('非法步长%j不产生伤害弹丸', dt => {
    const boss = createBossModel(); const before = structuredClone(boss);
    expect(stepBoss(boss, dt, {x:0,y:0}, {x:1,y:1})).toEqual([]); expect(boss).toEqual(before);
  });
  it.each([0,4,'1',1.5])('非法幕数%j拒绝', act => expect(() => createBossModel(act)).toThrow(RangeError));
  it('未知幕的模板回退到第一幕', () => expect(bossPattern(9)).toBe(bossPattern(1)));
});

describe('统一Boss击败收据', () => {
  it.each(['quiz','combat'])('不同路径%s获得相同基础奖励12且仅一次', method => {
    const run = { act: 1 };
    const first = resolveBossOnce(run,1,'boss-1',method);
    expect(first.ok).toBe(true); expect(first.reward).toBe(12); expect(first.receipt.method).toBe(method);
    expect(resolveBossOnce(run,1,'boss-1',method === 'quiz' ? 'combat' : 'quiz')).toEqual({ok:false,reward:0});
    first.receipt.reward = 999; expect(run.bossResolutions[1].reward).toBe(12);
  });
  it('每幕单独记账，无法重复或提前领取下一幕奖励', () => {
    const run = {act:1}; resolveBossOnce(run,1,'boss-1','quiz');
    expect(resolveBossOnce(run,2,'boss-2','quiz').ok).toBe(false);
    run.act=2; expect(resolveBossOnce(run,2,'boss-2','combat').ok).toBe(true);
    expect(Object.keys(run.bossResolutions)).toEqual(['1','2']);
  });
  it.each([null, 'run', [], {act:1,bossResolutions:[]}])('非法会话%j不抛错', run => {
    expect(() => resolveBossOnce(run,1,'boss-1','quiz')).not.toThrow();
    expect(resolveBossOnce(run,1,'boss-1','quiz').ok).toBe(false);
  });
  it('未知通关方式不发奖励', () => expect(resolveBossOnce({act:1},1,'boss-1','skip')).toEqual({ok:false,reward:0}));
});
