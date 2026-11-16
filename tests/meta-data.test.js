import { describe, it, expect } from 'vitest';
import { MILESTONES, MILESTONE_IDS, PASSIVE_IDS, PASSIVE_LINES, LEVEL_COSTS, CAP_UNLOCKS, DEFAULT_LEVEL_CAP, SETTLE, META_VERSION, META_UI } from '../src/data/meta.js';
import { CHAPTERS, stagesOf, minorBossIdsOfStage } from '../src/logic/acts.js';

const byKind = (kind) => MILESTONES.filter((m) => m.kind === kind);

describe('局外成长常量', () => {
  it('正好 34 个里程碑，id 不重复', () => {
    expect(MILESTONES).toHaveLength(34);
    expect(new Set(MILESTONES.map((m) => m.id)).size).toBe(34);
    expect(MILESTONE_IDS).toHaveLength(34);
    expect(MILESTONE_IDS).toContain('clear-5');
  });
  it('7 大 + 20 小 + 5 幕通关 + 2 特殊', () => {
    expect([byKind('major').length, byKind('minor').length, byKind('chapter').length, byKind('special').length]).toEqual([7, 20, 5, 2]);
    expect(byKind('special').map((m) => m.id)).toEqual(['quiz-5', 'kills-300']);
  });
  it('大 Boss 奖励 25，小 Boss 8，幕通关 30，特殊 60/40', () => {
    for (const m of byKind('major')) expect(m.reward).toBe(25);
    for (const m of byKind('minor')) expect(m.reward).toBe(8);
    for (const m of byKind('chapter')) expect(m.reward).toBe(30);
    expect(byKind('special').map((m) => m.reward).sort((a, b) => a - b)).toEqual([40, 60]);
  });
  it('等级上限解锁只挂在大 Boss 3/5/7', () => {
    expect(CAP_UNLOCKS).toEqual({ 'boss-3': 3, 'boss-5': 4, 'boss-7': 5 });
    expect(MILESTONES.filter((m) => m.unlockCap).map((m) => m.id)).toEqual(['boss-3', 'boss-5', 'boss-7']);
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
  it('大 Boss 与场号对齐，小 Boss 由幕-场表生成且对齐遭遇表', () => {
    expect(byKind('major').map((m) => m.id)).toEqual(['boss-1', 'boss-2', 'boss-3', 'boss-4', 'boss-5', 'boss-6', 'boss-7']);
    expect(byKind('major').map((m) => m.bossId)).toEqual(['boss-1', 'boss-2', 'boss-3', 'boss-4', 'boss-5', 'boss-6', 'boss-7']);

    const expectedMinor = CHAPTERS.flatMap((c) => stagesOf(c.chapter).flatMap((stage) => minorBossIdsOfStage(stage)));
    expect(expectedMinor).toHaveLength(20);
    expect(byKind('minor').map((m) => m.id)).toEqual(expectedMinor);
    expect(byKind('minor').map((m) => m.bossId)).toEqual(expectedMinor);
    expect(expectedMinor).toContain('miniboss-1d');
    expect(expectedMinor).toContain('miniboss-7b');
    expect(expectedMinor.filter((id) => /^miniboss-[1-3][a-d]$/.test(id))).toHaveLength(12);
    expect(expectedMinor.filter((id) => /^miniboss-[4-7][a-b]$/.test(id))).toHaveLength(8);
    expect(META_UI.resonanceUnit).toBe('残响');
  });
  it('幕通关里程碑是 clear-1..clear-5，中文标签标明场/幕', () => {
    expect(byKind('chapter').map((m) => m.id)).toEqual(['clear-1', 'clear-2', 'clear-3', 'clear-4', 'clear-5']);
    expect(byKind('chapter').map((m) => m.label)).toEqual(['通关 · 第 1 幕', '通关 · 第 2 幕', '通关 · 第 3 幕', '通关 · 第 4 幕', '通关 · 第 5 幕']);
    expect(byKind('major')[0].label).toBe('契约主 · 第 1 场');
    expect(byKind('major')[6].label).toBe('契约主 · 第 7 场');
    expect(byKind('minor')[0].label).toBe('小契约 · 第 1 场甲');
    expect(byKind('minor')[3].label).toBe('小契约 · 第 1 场丁');
  });
});
