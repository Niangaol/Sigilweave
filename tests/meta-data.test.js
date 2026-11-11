import { describe, it, expect } from 'vitest';
import { MILESTONES, PASSIVE_IDS, PASSIVE_LINES, LEVEL_COSTS, CAP_UNLOCKS, DEFAULT_LEVEL_CAP, SETTLE, META_VERSION, META_UI } from '../src/data/meta.js';

describe('局外成长常量', () => {
  it('正好 24 个里程碑，id 不重复', () => {
    expect(MILESTONES).toHaveLength(24);
    expect(new Set(MILESTONES.map(m => m.id)).size).toBe(24);
  });
  it('7 大 + 14 小 + 3 特殊', () => {
    const count = (k) => MILESTONES.filter(m => m.kind === k).length;
    expect([count('major'), count('minor'), count('special')]).toEqual([7, 14, 3]);
  });
  it('大 Boss 奖励 25，小 Boss 8，特殊按 40/60/80', () => {
    for (const m of MILESTONES.filter(m => m.kind === 'major')) expect(m.reward).toBe(25);
    for (const m of MILESTONES.filter(m => m.kind === 'minor')) expect(m.reward).toBe(8);
    expect(MILESTONES.filter(m => m.kind === 'special').map(m => m.reward).sort((a, b) => a - b)).toEqual([40, 60, 80]);
  });
  it('等级上限解锁只挂在大 Boss 3/5/7', () => {
    expect(CAP_UNLOCKS).toEqual({ 'boss-3': 3, 'boss-5': 4, 'boss-7': 5 });
    expect(MILESTONES.filter(m => m.unlockCap).map(m => m.id)).toEqual(['boss-3', 'boss-5', 'boss-7']);
  });
  it('11 条被动、五级消耗递增', () => {
    expect(PASSIVE_IDS).toHaveLength(11);
    expect(PASSIVE_LINES.character.length + PASSIVE_LINES.compass.length).toBe(11);
    expect(LEVEL_COSTS).toEqual([10, 24, 48, 80, 120]);
    expect(DEFAULT_LEVEL_CAP).toBe(2);
    expect(META_VERSION).toBe(1);
  });
  it('结算权重与设计文档一致', () => {
    expect(SETTLE).toEqual({ actWeight: 8, killStep: 40, killPoint: 1, miniBoss: 2, majorBoss: 6, quiz: 4, victory: 60, deathRate: 0.6, quickRate: 0.5 });
  });
  it('小 Boss 与灵感 id 对齐遭遇表', () => {
    const minor = MILESTONES.filter(m => m.kind === 'minor').map(m => m.id);
    expect(minor).toEqual(['miniboss-1a', 'miniboss-1b', 'miniboss-2a', 'miniboss-2b', 'miniboss-3a', 'miniboss-3b', 'miniboss-4a', 'miniboss-4b', 'miniboss-5a', 'miniboss-5b', 'miniboss-6a', 'miniboss-6b', 'miniboss-7a', 'miniboss-7b']);
    expect(MILESTONES.filter(m => m.kind === 'major').map(m => m.id)).toEqual(['boss-1', 'boss-2', 'boss-3', 'boss-4', 'boss-5', 'boss-6', 'boss-7']);
    expect(META_UI.resonanceUnit).toBe('残响');
  });
});
