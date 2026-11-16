import { describe, it, expect } from 'vitest';
import {
  STAGE_COUNT,
  CHAPTERS,
  chapterOf,
  stagesOf,
  firstStageOf,
  lastStageOf,
  nextStage,
  isValidStage,
  isValidChapter,
  minorBossIdsOfStage,
  majorBossIdOfStage,
  encounterIdsOfStage,
  encounterIdsOfChapter,
  chapterMajorsCleared,
} from '../src/logic/acts.js';

describe('幕与场的映射表', () => {
  it('五幕七场，合并幕各占两场', () => {
    expect(STAGE_COUNT).toBe(7);
    expect(CHAPTERS).toHaveLength(5);
    expect([1, 2, 3, 4, 5, 6, 7].map(chapterOf)).toEqual([1, 2, 3, 4, 4, 5, 5]);
    expect([1, 2, 3, 4, 5].map(stagesOf)).toEqual([[1], [2], [3], [4, 5], [6, 7]]);
    expect([1, 2, 3, 4, 5].map(firstStageOf)).toEqual([1, 2, 3, 4, 6]);
    expect([1, 2, 3, 4, 5].map(lastStageOf)).toEqual([1, 2, 3, 5, 7]);
  });

  it('场号可以从 1 走到 7，再往后就没有了', () => {
    expect([1, 2, 3, 4, 5, 6].map(nextStage)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(nextStage(7)).toBe(null);
    for (let s = 1; s <= 7; s++) expect(isValidStage(s)).toBe(true);
    expect(isValidStage(0)).toBe(false);
    expect(isValidStage(8)).toBe(false);
    for (let c = 1; c <= 5; c++) expect(isValidChapter(c)).toBe(true);
    expect(isValidChapter(6)).toBe(false);
  });

  it('前三场各四个小 Boss，后四场各两个', () => {
    expect([1, 2, 3].map((s) => minorBossIdsOfStage(s).length)).toEqual([4, 4, 4]);
    expect([4, 5, 6, 7].map((s) => minorBossIdsOfStage(s).length)).toEqual([2, 2, 2, 2]);
    expect(minorBossIdsOfStage(1)).toEqual(['miniboss-1a', 'miniboss-1b', 'miniboss-1c', 'miniboss-1d']);
    expect(minorBossIdsOfStage(7)).toEqual(['miniboss-7a', 'miniboss-7b']);
  });

  it('每场一位大 Boss，局面共七位契约主', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(majorBossIdOfStage)).toEqual(['boss-1', 'boss-2', 'boss-3', 'boss-4', 'boss-5', 'boss-6', 'boss-7']);
  });

  it('每场的遭遇清单 = 1 NPC + 小 Boss + 1 大 Boss', () => {
    expect(encounterIdsOfStage(1)).toHaveLength(6);
    expect(encounterIdsOfStage(4)).toHaveLength(4);
    expect(encounterIdsOfStage(7)).toHaveLength(4);
    expect(encounterIdsOfChapter(4)).toHaveLength(8);
    expect(encounterIdsOfChapter(1)).toHaveLength(6);
  });

  it('通幕判定看本幕所有大 Boss 是否都已结算', () => {
    const empty = { bossResolutions: {} };
    expect(chapterMajorsCleared(empty, 1)).toBe(false);
    const half = { bossResolutions: { 4: { stage: 4, bossId: 'boss-4', tier: 'major' } } };
    expect(chapterMajorsCleared(half, 4)).toBe(false);
    const full = { bossResolutions: { 4: { stage: 4, bossId: 'boss-4', tier: 'major' }, 5: { stage: 5, bossId: 'boss-5', tier: 'major' } } };
    expect(chapterMajorsCleared(full, 4)).toBe(true);
    expect(chapterMajorsCleared({ bossResolutions: { 5: { tier: 'mini' } } }, 4)).toBe(false);
  });
});
