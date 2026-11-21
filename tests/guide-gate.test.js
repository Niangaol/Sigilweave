import { describe, expect, it, beforeEach } from 'vitest';
import {
  GUIDE_ACTIVE_EVENT,
  GUIDE_DONE_EVENT,
  guideEnabled,
  getCard,
  openingGuideIdForStage,
  shouldHoldForOpeningGuide,
  getStuckHint,
} from '../src/logic/guide.js';

describe('开场引导闸门：讲解期间冻结战斗', () => {
  beforeEach(() => {
    // 每个测试用独立 run，避免 guideSeen 互相污染
  });

  it('生命周期事件常量已定义，供战斗场景当作暂停键接线', () => {
    expect(GUIDE_ACTIVE_EVENT).toBe('guide:active');
    expect(GUIDE_DONE_EVENT).toBe('guide:done');
  });

  it('每幕开场引导卡片都存在且能解析出台词', () => {
    for (const id of [openingGuideIdForStage(1), openingGuideIdForStage(2), openingGuideIdForStage(3), openingGuideIdForStage(4)]) {
      const card = getCard(id);
      expect(card, id).toBeTruthy();
      expect(card.lines?.length || card.steps?.length || card.linesByAct || card.linesByStage, id).toBeTruthy();
    }
  });

  it('开场讲解卡片 id 按幕映射正确', () => {
    expect(openingGuideIdForStage(1)).toBe('G01');
    expect(openingGuideIdForStage(2)).toBe('G07');
    expect(openingGuideIdForStage(3)).toBe('G09');
    expect(openingGuideIdForStage(4)).toBe('G12');
    expect(openingGuideIdForStage(7)).toBe('G12');
  });

  it('首次进入首场：立闸门（冻结战斗）', () => {
    const run = { guideSeen: {} };
    expect(shouldHoldForOpeningGuide(run, 1)).toBe(true);
  });

  it('首次进入第二/三幕：同样立闸门', () => {
    const run = { guideSeen: {} };
    expect(shouldHoldForOpeningGuide(run, 2)).toBe(true);
    expect(shouldHoldForOpeningGuide(run, 3)).toBe(true);
  });

  it('已看过开场讲解：不再立闸门（读档/重玩照常开打）', () => {
    const run = { guideSeen: { G01: true } };
    expect(shouldHoldForOpeningGuide(run, 1)).toBe(false);
    // 别的 id 看过也不影响本场判定
    expect(shouldHoldForOpeningGuide({ guideSeen: { G02: true } }, 1)).toBe(true);
  });

  it('?guide=0 关闭引导时永不立闸门', () => {
    const run = { guideSeen: {} };
    const params = new URLSearchParams('guide=0');
    expect(guideEnabled(params)).toBe(false);
    expect(shouldHoldForOpeningGuide(run, 1, params)).toBe(false);
    expect(shouldHoldForOpeningGuide(run, 3, params)).toBe(false);
  });

  it('shouldHold 不修改 run（纯判定，去重由 fireGuide 负责）', () => {
    const run = { guideSeen: {} };
    shouldHoldForOpeningGuide(run, 1);
    expect(run.guideSeen).toEqual({});
  });

});
