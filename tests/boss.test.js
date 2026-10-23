import { describe, it, expect } from 'vitest';
import { createBossModel, stepBoss, resolveBossOnce } from '../src/logic/boss.js';

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
  const boss = createBossModel(3), p = { x: 1, y: 1 };
  stepBoss(boss, 1200, p, p); expect(stepBoss(boss, 600, p, p)).toHaveLength(5);
  expect(stepBoss(boss, 100, p, p)).toEqual([]); expect(boss.shots).toBe(1);
 });
 it.each([NaN, -1, Infinity])('非法步长%j不产生伤害弹丸', dt => {
  const boss = createBossModel(); const before = structuredClone(boss);
  expect(stepBoss(boss, dt, {x:0,y:0}, {x:1,y:1})).toEqual([]); expect(boss).toEqual(before);
 });
 it.each([0,4,'1',1.5])('非法幕数%j拒绝', act => expect(() => createBossModel(act)).toThrow(RangeError));
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
