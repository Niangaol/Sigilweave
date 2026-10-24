import { describe, it, expect } from 'vitest';
import { emptyDraft, validateDraft, missingAuxTargets, auxTargetCandidates, explainBuildErrors } from '../src/logic/build.js';

// 用户 2026-10-24 报的 bug：编辑界面改法术会报「aux need target」，
// 原因是换卡会连带把别的指向型辅助的目标清掉，而界面只甩内部错误码。
function fixture() {
  return {
    ...emptyDraft(2),
    unlocked: [1, 4, 5, 6, 9, 10],
    slots: {
      4: { kind: 'auxiliary', defId: 'resonance_stone' },
      5: { kind: 'auxiliary', defId: 'hourglass' },
      6: { kind: 'sigil', defId: 'arcane_bolt' },
    },
    auxTargets: { 5: 6 },
  };
}

describe('指向型辅助的目标体检', () => {
  it('目标齐全时不报问题', () => {
    expect(missingAuxTargets(fixture())).toEqual([]);
  });
  it('目标被清掉后能定位到具体格号', () => {
    const d = fixture();
    delete d.auxTargets[5];
    expect(missingAuxTargets(d)).toEqual([5]);
    expect(validateDraft(d).map(e => e.code)).toContain('aux_needs_target');
  });
  it('目标指向非相邻格 / 辅助格 / 空格都算失效', () => {
    for (const target of [1, 4, 9, 15]) {
      const d = fixture();
      d.auxTargets[5] = target;
      expect(missingAuxTargets(d)).toEqual([5]);
    }
  });
  it('非指向型辅助不参与检查', () => {
    const d = fixture();
    delete d.auxTargets[5];
    d.slots[5] = { kind: 'auxiliary', defId: 'resonance_stone' };
    expect(missingAuxTargets(d)).toEqual([]);
  });
  it('输入畸形不抛错', () => {
    for (const bad of [null, undefined, {}, { slots: [] }, { slots: { 5: null } }]) {
      expect(() => missingAuxTargets(bad)).not.toThrow();
      expect(missingAuxTargets(bad)).toEqual([]);
    }
  });
});

describe('可绑定的目标候选', () => {
  it('只给出相邻、已解封、装着符印的格', () => {
    const d = fixture();
    // 5 号的正交邻居是 1/4/6/9，其中只有 6 是输出符印
    expect(auxTargetCandidates(d, 5)).toEqual([6]);
  });
  it('锚点格相邻没有符印时返回空数组（界面据此提示收回而不是进绑定模式）', () => {
    const d = fixture();
    delete d.slots[6];
    expect(auxTargetCandidates(d, 5)).toEqual([]);
  });
  it('非法格号返回空数组', () => {
    expect(auxTargetCandidates(fixture(), 99)).toEqual([]);
    expect(auxTargetCandidates(fixture(), 'x')).toEqual([]);
  });
});

describe('校验错误翻成人话', () => {
  it('缺目标时带上格号与卡名，不再暴露内部编码', () => {
    const d = fixture();
    delete d.auxTargets[5];
    const text = explainBuildErrors(validateDraft(d), d);
    expect(text).toContain('6号位');
    expect(text).not.toContain('aux_needs_target');
    expect(text).toContain('作用目标');
  });
  it('未知编码仍回退成原码，不会变成空字符串', () => {
    expect(explainBuildErrors([{ code: 'made_up' }], fixture())).toBe('made_up');
  });
  it('空输入返回空串', () => {
    expect(explainBuildErrors([], fixture())).toBe('');
    expect(explainBuildErrors(null, fixture())).toBe('');
  });
});
describe('幕间工作台：别把内部错误码甩给玩家', () => {
  it('换掉辅助指向的符印后，出发提示是中文且指明要重绑目标', async () => {
    const { createWorkshop, placeCard, canDepart, chooseReward } = await import('../src/logic/workshop.js');
    const draft = {
      ...emptyDraft(2),
      unlocked: [1, 4, 5, 6, 9, 10],
      slots: {
        5: { kind: 'auxiliary', defId: 'hourglass' },
        6: { kind: 'sigil', defId: 'arcane_bolt' },
        9: { kind: 'sigil', defId: 'frost_arrow' },
        10: { kind: 'sigil', defId: 'flame_burst' },
      },
      auxTargets: { 5: 6 },
      runes: {}, exits: {}, oath: null,
    };
    const state = createWorkshop({ draft, seed: 'aux' });
    state.hand['auxiliary:resonance_stone'] = 2;
    while (state.offer) chooseReward(state, state.offer.id, 0);
    expect(canDepart(state).ok).toBe(true);
    // 把 6 号（辅助的指向目标）换成辅助卡：目标被连带清掉
    const placed = placeCard(state, 6, 'auxiliary:resonance_stone');
    expect(placed.ok).toBe(true);
    expect(state.draft.auxTargets[5]).toBeUndefined();
    const ready = canDepart(state);
    expect(ready.ok).toBe(false);
    expect(ready.message).not.toContain('aux_needs_target');
    expect(ready.message).toContain('作用目标');
  });
});
