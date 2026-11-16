import { describe, it, expect } from 'vitest';
import { defaultMeta, settleRun } from '../src/logic/meta.js';

const receipt = (stage, method, tier = 'major', bossId = 'boss-' + stage) => ({ stage, bossId, method, tier, reward: 12 });
const run = (extra = {}) => ({ chapter: 1, stage: 1, kills: 0, victory: false, quick: false, bossResolutions: {}, miniBossResolutions: {}, ...extra });

describe('对局结算', () => {
  it('公式：幕数×8 + 击杀/40 + 小/大 Boss + 问答 + 通关 60', () => {
    const s = settleRun(defaultMeta(), run({
      chapter: 3, kills: 150,
      bossResolutions: { 1: receipt(1, 'combat'), 2: receipt(2, 'quiz'), 3: receipt(3, 'combat') },
      miniBossResolutions: { 'miniboss-1a': receipt(1, 'combat', 'mini', 'miniboss-1a') },
    }));
    expect(s.base).toBe(51); expect(s.multiplier).toBe(0.6); expect(s.gained).toBe(31);
  });
  it('通关按全额且额外 +60（幕数夹到 5）', () => {
    const s = settleRun(defaultMeta(), run({ chapter: 5, stage: 7, kills: 100, victory: true }));
    expect(s.base).toBe(5 * 8 + 2 + 60); expect(s.multiplier).toBe(1); expect(s.gained).toBe(s.base);
  });
  it('quick 再打五折', () => {
    const s = settleRun(defaultMeta(), run({ quick: true, kills: 100 }));
    expect(s.gained).toBe(Math.round((8 + 2) * 0.6 * 0.5));
  });
  it('演武 / 压测 / 中途退出不发放', () => {
    for (const extra of [{ trainingComplete: true }, { dnf: true }, { stress: true }]) {
      const s = settleRun(defaultMeta(), run(extra));
      expect(s.gained).toBe(0); expect(s.newMilestones).toEqual([]);
    }
  });
  it('首杀发放一次性残响并去重', () => {
    const first = settleRun(defaultMeta(), run({ bossResolutions: { 1: receipt(1, 'combat') } }));
    expect(first.newMilestones.map(m => m.id)).toEqual(['boss-1']);
    expect(first.save.resonance).toBe(first.gained + 25);
    const again = settleRun(first.save, run({ bossResolutions: { 1: receipt(1, 'combat') } }));
    expect(again.newMilestones).toEqual([]);
    expect(again.save.resonance).toBe(first.save.resonance + again.gained);
  });
  it('问答破局累计到 5 次点亮特殊成就，且只发一次', () => {
    let s = defaultMeta();
    for (let i = 0; i < 5; i++) s = settleRun(s, run({ bossResolutions: { [(i % 7) + 1]: receipt((i % 7) + 1, 'quiz') } })).save;
    expect(s.counters.quizWins).toBe(5);
    expect(s.milestones).toContain('quiz-5');
    const after = settleRun(s, run({ bossResolutions: { 1: receipt(1, 'quiz') } }));
    expect(after.newMilestones.map(m => m.id)).not.toContain('quiz-5');
  });
  it('单局击杀 300 与五幕通关点亮特殊成就', () => {
    const s = settleRun(defaultMeta(), run({ kills: 300, victory: true, chapter: 5, stage: 7 }));
    expect(s.save.milestones).toEqual(expect.arrayContaining(['kills-300', 'clear-1', 'clear-2', 'clear-3', 'clear-4', 'clear-5']));
    expect(s.save.counters.bestKills).toBe(300); expect(s.save.counters.wins).toBe(1);
  });
  it('counters 只进不退，runs/wins 递增', () => {
    const s = settleRun(defaultMeta(), run({ chapter: 2, kills: 5 }));
    expect(s.save.counters.runs).toBe(1); expect(s.save.counters.bestAct).toBe(2);
    expect(s.save.counters.bestKills).toBe(5);
    const back = settleRun(s.save, run({ chapter: 1, kills: 1 }));
    expect(back.save.counters.bestAct).toBe(2); expect(back.save.counters.bestKills).toBe(5);
  });
  it('第四幕中途阵亡只记到幕 3 的通关里程碑', () => {
    const out = settleRun(null, {
      chapter: 4, stage: 5, kills: 90, victory: false,
      bossResolutions: { 4: { stage: 4, bossId: 'boss-4', tier: 'major', method: 'quiz' } },
      miniBossResolutions: {},
    });
    const ids = out.newMilestones.map((m) => m.id);
    expect(ids).toContain('boss-4');
    expect(ids).toContain('clear-3');
    expect(ids).not.toContain('clear-4');
    expect(out.save.counters.bestAct).toBe(4);
  });
  it('通关记 clear-1..5 与全部大 Boss 里程碑', () => {
    const resolutions = {};
    for (let s = 1; s <= 7; s++) resolutions[s] = { stage: s, bossId: 'boss-' + s, tier: 'major', method: 'combat' };
    const out = settleRun(null, { chapter: 5, stage: 7, kills: 300, victory: true, bossResolutions: resolutions, miniBossResolutions: {} });
    const ids = out.newMilestones.map((m) => m.id);
    for (const n of [1, 2, 3, 4, 5]) expect(ids).toContain('clear-' + n);
    for (let s = 1; s <= 7; s++) expect(ids).toContain('boss-' + s);
    expect(ids).toContain('kills-300');
    expect(out.save.resonance).toBe(out.gained + 7 * 25 + 5 * 30 + 40);
  });
  it('大 Boss 里程碑读 receipt.stage，旧数据回退 receipt.act', () => {
    const fresh = settleRun(defaultMeta(), run({ chapter: 2, bossResolutions: { 2: receipt(2, 'combat') } }));
    expect(fresh.newMilestones.map((m) => m.id)).toContain('boss-2');
    expect(fresh.newMilestones.map((m) => m.id)).not.toContain('boss-1');
    const legacy = settleRun(defaultMeta(), run({ chapter: 2, bossResolutions: { 2: { act: 2, bossId: 'boss-2', tier: 'major', method: 'combat' } } }));
    expect(legacy.newMilestones.map((m) => m.id)).toContain('boss-2');
  });
  it('旧数据只给 act 时仍按幕结算并夹到 1..5', () => {
    const seven = settleRun(defaultMeta(), { act: 7, kills: 0, victory: false });
    expect(seven.save.counters.bestAct).toBe(5);
    expect(seven.newMilestones.map((m) => m.id)).toEqual(['clear-1', 'clear-2', 'clear-3', 'clear-4']);
    const two = settleRun(defaultMeta(), { act: 2, kills: 0, victory: false });
    expect(two.save.counters.bestAct).toBe(2);
    expect(two.newMilestones.map((m) => m.id)).toEqual(['clear-1']);
  });
  it('不改入参', () => {
    const base = defaultMeta();
    const snapshot = JSON.stringify(base);
    settleRun(base, run({ chapter: 3, kills: 200, victory: true }));
    expect(JSON.stringify(base)).toBe(snapshot);
  });
});
