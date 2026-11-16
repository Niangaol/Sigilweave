import { describe, it, expect } from 'vitest';
import {
  STAGE_REFERENCE_SECONDS,
  chapterDurationMs,
  stageSpellCard,
  stageAdvanceDecision,
} from '../src/scenes/battle-pure.js';
import { CHAPTERS } from '../src/logic/acts.js';

describe('chapterDurationMs', () => {
  it('按场参考时长求和：单场幕就是本场时长', () => {
    expect(STAGE_REFERENCE_SECONDS).toHaveLength(7);
    expect(chapterDurationMs(1)).toBe(210000);
    expect(chapterDurationMs(2)).toBe(220000);
    expect(chapterDurationMs(3)).toBe(230000);
  });

  it('合并幕 = 两场之和', () => {
    expect(chapterDurationMs(4)).toBe(400000);
    expect(chapterDurationMs(5)).toBe(450000);
  });

  it('非法幕号抛 RangeError', () => {
    for (const bad of [0, 6, 1.5, '4', null, undefined]) {
      expect(() => chapterDurationMs(bad)).toThrow(RangeError);
    }
  });

  it('每一幕都不少于 3 分 30 秒，符合“单幕约五分钟”的密度目标', () => {
    for (const c of CHAPTERS) expect(chapterDurationMs(c.chapter)).toBeGreaterThanOrEqual(210000);
  });
});

describe('stageSpellCard', () => {
  it('七场各发一张，顺序固定', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(stageSpellCard)).toEqual([
      'frost_arrow', 'holy_ward', 'starfall', 'chain_lightning',
      'pierce_lance', 'meteor_judgment', 'quake_maw',
    ]);
  });

  it('非法场号返回 null', () => {
    expect(stageSpellCard(0)).toBeNull();
    expect(stageSpellCard(8)).toBeNull();
  });
});

describe('stageAdvanceDecision', () => {
  it('大 Boss 未清空时原地不动', () => {
    expect(stageAdvanceDecision({ stage: 4, majorCleared: false })).toBe('none');
    expect(stageAdvanceDecision({ stage: 7, majorCleared: false })).toBe('none');
  });

  it('合并幕前半场清空 → 换场', () => {
    expect(stageAdvanceDecision({ stage: 4, majorCleared: true })).toBe('swap');
    expect(stageAdvanceDecision({ stage: 6, majorCleared: true })).toBe('swap');
  });

  it('单场幕 / 合并幕末场清空 → 通幕', () => {
    expect(stageAdvanceDecision({ stage: 1, majorCleared: true })).toBe('clear');
    expect(stageAdvanceDecision({ stage: 3, majorCleared: true })).toBe('clear');
    expect(stageAdvanceDecision({ stage: 5, majorCleared: true })).toBe('clear');
  });

  it('最后一场清空 → 胜利', () => {
    expect(stageAdvanceDecision({ stage: 7, majorCleared: true })).toBe('victory');
  });

  it('非法场号抛 RangeError', () => {
    expect(() => stageAdvanceDecision({ stage: 0, majorCleared: true })).toThrow(RangeError);
  });
});
