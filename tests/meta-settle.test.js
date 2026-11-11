import { describe, it, expect } from 'vitest';
import { defaultMeta, settleRun } from '../src/logic/meta.js';

const receipt = (act, method, tier = 'major', bossId = 'boss-' + act) => ({ act, bossId, method, tier, reward: 12 });
const run = (extra = {}) => ({ act: 1, kills: 0, victory: false, quick: false, bossResolutions: {}, miniBossResolutions: {}, ...extra });

describe('对局结算', () => {
  it('公式：幕数×8 + 击杀/40 + 小/大 Boss + 问答 + 通关 60', () => {
    const s = settleRun(defaultMeta(), run({
      act: 3, kills: 150,
      bossResolutions: { 1: receipt(1, 'combat'), 2: receipt(2, 'quiz'), 3: receipt(3, 'combat') },
      miniBossResolutions: { 'miniboss-1a': receipt(1, 'combat', 'mini', 'miniboss-1a') },
    }));
    expect(s.base).toBe(51); expect(s.multiplier).toBe(0.6); expect(s.gained).toBe(31);
  });
  it('通关按全额且额外 +60', () => {
    const s = settleRun(defaultMeta(), run({ act: 7, kills: 100, victory: true }));
    expect(s.base).toBe(7 * 8 + 2 + 60); expect(s.multiplier).toBe(1); expect(s.gained).toBe(s.base);
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
  it('单局击杀 300 与七幕通关点亮特殊成就', () => {
    const s = settleRun(defaultMeta(), run({ kills: 300, victory: true, act: 7 }));
    expect(s.save.milestones).toEqual(expect.arrayContaining(['kills-300', 'clear']));
    expect(s.save.counters.bestKills).toBe(300); expect(s.save.counters.wins).toBe(1);
  });
  it('counters 只进不退，runs/wins 递增', () => {
    const s = settleRun(defaultMeta(), run({ act: 2, kills: 5 }));
    expect(s.save.counters.runs).toBe(1); expect(s.save.counters.bestAct).toBe(2);
    expect(s.save.counters.bestKills).toBe(5);
    const back = settleRun(s.save, run({ act: 1, kills: 1 }));
    expect(back.save.counters.bestAct).toBe(2); expect(back.save.counters.bestKills).toBe(5);
  });
  it('不改入参', () => {
    const base = defaultMeta();
    const snapshot = JSON.stringify(base);
    settleRun(base, run({ act: 3, kills: 200, victory: true }));
    expect(JSON.stringify(base)).toBe(snapshot);
  });
});
