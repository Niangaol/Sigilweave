import { describe, it, expect } from 'vitest';
import { createGrid, exitTargets } from '../src/logic/grid.js';
import { applyDraft, validateDraft, emptyDraft, draftFromGrid, snapshotBuild, unlockToTarget } from '../src/logic/build.js';

function fixture() {
  return { ...emptyDraft(2), unlocked: [1, 4, 5, 6, 9, 10],
    slots: { 4: { kind: 'auxiliary', defId: 'resonance_stone' },
      5: { kind: 'auxiliary', defId: 'hourglass' }, 6: { kind: 'sigil', defId: 'arcane_bolt' } },
    auxTargets: { 5: 6 }, runes: { 6: [null, 'forge'] }, exits: { 6: ['left', 'down'] }, oath: 'martyr' };
}
const codes = draft => validateDraft(draft).map(e => e.code);

describe('构筑输入边界', () => {
  it('合法草稿通过', () => expect(validateDraft(fixture())).toEqual([]));
  it.each([null, undefined, [], 'draft', 1])('非草稿对象 %j 返回错误而非抛出', draft => {
    expect(() => validateDraft(draft)).not.toThrow();
    expect(validateDraft(draft).length).toBeGreaterThan(0);
  });
  it.each([0, 4, -1, 1.5, '2', null])('非法幕数 %j', act => {
    expect(codes({ ...fixture(), act })).toContain('invalid_act');
  });
  it.each([-1, 16, 1.5, '6', null])('非法格号 %j', id => {
    expect(codes({ ...fixture(), unlocked: [id] })).toContain('invalid_cell');
  });
  it('重复格子拒绝', () => expect(codes({ ...fixture(), unlocked: [5, 5] })).toContain('duplicate_cell'));
  it('第一幕提交不能绕过六格限制', () => {
    expect(codes({ ...emptyDraft(1), unlocked: [0, 1, 2, 3, 4, 5, 6] })).toContain('too_many_unlocked');
  });
  it.each(['slots', 'runes', 'exits', 'auxTargets'])('非法 %s 类型不抛错', key => {
    const draft = { ...fixture(), [key]: [] };
    expect(() => validateDraft(draft)).not.toThrow();
    expect(codes(draft)).toContain('invalid_draft');
  });
  it('前导零别名格号拒绝', () => {
    const d = fixture(); d.slots['06'] = { kind: 'sigil', defId: 'arcane_bolt' };
    expect(codes(d)).toContain('invalid_cell');
  });
  it('封印格不能装卡或铭文', () => {
    const d = fixture(); d.slots[15] = { kind: 'sigil', defId: 'arcane_bolt' }; d.runes[15] = ['forge'];
    expect(codes(d).filter(c => c === 'locked_cell')).toHaveLength(2);
  });
  it.each(['toString', 'constructor', '__proto__', 'missing'])('继承属性不能当符印 ID %s', defId => {
    const d = fixture(); d.slots[6].defId = defId;
    expect(codes(d)).toContain('unknown_def');
  });
  it('不允许同主槽携带第二套辅助配置', () => {
    const d = fixture(); d.slots[6].auxiliaryId = 'hourglass';
    expect(codes(d)).toContain('slot_conflict');
  });
  it('辅助必须有目标', () => {
    const d = fixture(); d.auxTargets = {};
    expect(codes(d)).toContain('aux_needs_target');
  });
  it.each([1, 5, 15, '6'])('非法辅助目标 %j', target => {
    const d = fixture(); d.auxTargets[5] = target;
    expect(codes(d)).toContain('aux_target_invalid');
  });
  it('相邻目标也必须是输出符印而不是辅助或空格', () => {
    const d = fixture(); d.auxTargets[5] = 4;
    expect(codes(d)).toContain('aux_target_invalid');
    d.auxTargets[5] = 9;
    expect(codes(d)).toContain('aux_target_invalid');
  });
  it('不存在的辅助格不能遗留目标', () => {
    const d = fixture(); d.auxTargets[6] = 5;
    expect(codes(d)).toContain('aux_target_invalid');
  });
  it('铭文数量、重复与未知名称都校验', () => {
    const d = fixture(); d.runes[6] = ['forge', 'forge', 'toString'];
    expect(codes(d)).toEqual(expect.arrayContaining(['rune_slot_full', 'duplicate_rune', 'unknown_def']));
  });
  it.each([null, 'forge', {}])('铭文必须是数组 %j', value => {
    const d = fixture(); d.runes[6] = value;
    expect(codes(d)).toContain('invalid_draft');
  });
  it.each([[], ['teleport'], ['left', 'left'], null])('非法出口集合 %j', value => {
    const d = fixture(); d.exits[6] = value;
    expect(codes(d)).toContain('invalid_exits');
  });
  it('断流格允许空出口', () => {
    const d = fixture(); d.runes[6] = ['sever']; d.exits[6] = [];
    expect(validateDraft(d)).toEqual([]);
  });
  it('未知誓约拒绝', () => expect(codes({ ...fixture(), oath: 'constructor' })).toContain('oath_unknown'));
});

describe('构筑提交与回读', () => {
  it('保留辅助目标、出口、铭文槽位和誓约，JSON 回读可重交', () => {
    const grid = createGrid();
    const first = applyDraft(grid, fixture());
    expect(first.ok).toBe(true);
    expect(grid.cells[5].auxTarget).toBe(6);
    expect(grid.cells[6].runes).toEqual([null, 'forge']);
    expect(grid.cells[6].exits).toEqual(new Set(['left', 'down']));
    expect(exitTargets(grid, 6)).toEqual([5, 10]);
    const restored = createGrid();
    const second = applyDraft(restored, JSON.parse(JSON.stringify(first.snapshot)));
    expect(second.ok).toBe(true);
    expect(second.snapshot).toEqual(first.snapshot);
    expect(restored.oath).toBe('martyr');
    expect(restored.cells[5].effIntervalMs).toBe(1275);
  });
  it('快照深冻结，后续草稿修改不影响现有法阵', () => {
    const grid = createGrid(); const draft = fixture();
    const result = applyDraft(grid, draft);
    expect(Object.isFrozen(result.snapshot)).toBe(true);
    expect(Object.isFrozen(result.snapshot.slots[6])).toBe(true);
    draft.slots[6].defId = 'starfall'; draft.runes[6][1] = 'sever'; draft.exits[6].push('up');
    expect(grid.cells[6].slot.defId).toBe('arcane_bolt');
    expect(result.snapshot.runes[6]).toEqual([null, 'forge']);
    expect(result.snapshot.exits[6]).toEqual(['left', 'down']);
    const edit = draftFromGrid(grid); edit.slots[6].defId = 'starfall';
    expect(grid.cells[6].slot.defId).toBe('arcane_bolt');
  });
  it.each([
    { ...emptyDraft(1), unlocked: [16], slots: { 16: { kind: 'sigil', defId: 'arcane_bolt' } } },
    { ...emptyDraft(4), unlocked: [5] },
    { ...emptyDraft(1), unlocked: [0, 1, 2, 3, 4, 5, 6] },
  ])('失败提交保持旧配置与冷却完整', bad => {
    const grid = createGrid(); applyDraft(grid, fixture()); grid.cells[6].cooldownUntil = 4321;
    const before = JSON.stringify(grid.cells, (_, value) => value instanceof Set ? [...value] : value);
    expect(() => applyDraft(grid, bad)).not.toThrow();
    expect(applyDraft(grid, bad).ok).toBe(false);
    expect(JSON.stringify(grid.cells, (_, value) => value instanceof Set ? [...value] : value)).toBe(before);
    expect(grid.oath).toBe('martyr');
  });
  it('战斗阶段提交拒绝且不改法阵', () => {
    const grid = createGrid();
    expect(applyDraft(grid, fixture(), { phase: 'battle' })).toEqual({ ok: false, errors: [{ code: 'wrong_phase' }] });
    expect(grid.unlockedIds()).toEqual([]);
  });
  it('新提交清除上次目标、出口、断流与运行时冷却', () => {
    const grid = createGrid(); const d = fixture(); d.runes[6] = ['sever'];
    applyDraft(grid, d); grid.cells[6].cooldownUntil = 9000;
    applyDraft(grid, { ...emptyDraft(2), unlocked: [5, 6], slots: { 6: { kind: 'sigil', defId: 'arcane_bolt' } } });
    expect(grid.cells[5].auxTarget).toBe(null);
    expect(grid.cells[6].seversPropagation).toBe(false);
    expect(grid.cells[6].cooldownUntil).toBe(0);
    expect([...grid.cells[6].exits]).toEqual(['up', 'down', 'left', 'right']);
    expect(snapshotBuild(grid).oath).toBe(null);
  });
  it('可显式将快照誓约置空', () => {
    const grid = createGrid(); applyDraft(grid, fixture());
    expect(snapshotBuild(grid, { oath: null }).oath).toBe(null);
  });
});

describe('解封边界', () => {
  it('确定性扩至6、12、16格，目标降低时不重新封格', () => {
    const a = createGrid(), b = createGrid();
    for (const n of [6, 12, 16]) {
      expect(unlockToTarget(a, n)).toHaveLength(n);
      expect(unlockToTarget(b, n)).toEqual(a.unlockedIds());
    }
    expect(unlockToTarget(a, 6)).toHaveLength(16);
  });
  it.each([-1, 17, 1.5, NaN, Infinity, '6'])('非法解封目标 %j 不修改旧状态', target => {
    const grid = createGrid(); unlockToTarget(grid, 6);
    const before = grid.unlockedIds();
    expect(() => unlockToTarget(grid, target)).toThrow(RangeError);
    expect(grid.unlockedIds()).toEqual(before);
  });
});
