import { describe, expect, it } from 'vitest';
import { createWorkshop, chooseReward, placeCard, removeCard, installRune, removeRune, canDepart, CARD_POOL } from '../src/logic/workshop.js';
import { emptyDraft, validateDraft, applyDraft, snapshotBuild } from '../src/logic/build.js';
import { createGrid } from '../src/logic/grid.js';

function draft() {
  const d = emptyDraft(1);
  d.unlocked = [5, 6, 9, 10];
  d.slots[5] = { kind: 'sigil', defId: 'arcane_bolt' };
  d.slots[6] = { kind: 'sigil', defId: 'frost_arrow' };
  return d;
}
const make = (options = {}) => createWorkshop({ draft: draft(), ...options });
const cardKey = card => card.kind + ':' + card.defId;
const total = state => Object.values(state.hand).reduce((sum, n) => sum + n, 0)
  + Object.values(state.draft.slots).filter(Boolean).length;
function finish(state) {
  while (state.offer) expect(chooseReward(state, state.offer.id, 0).ok).toBe(true);
}
function rejectedUnchanged(state, action) {
  const before = structuredClone(state);
  const reply = action();
  expect(reply.ok).toBe(false);
  expect(reply.message).toMatch(/[一-鿿]/);
  expect(state).toEqual(before);
}

describe('幕间三轮奖励', () => {
  it('固定 seed 可复现、每轮三张不同、首轮全输出、令牌逐轮唯一', () => {
    const a = make({ seed: 'replay' });
    const b = make({ seed: 'replay' });
    const ids = new Set();
    for (let round = 0; round < 3; round++) {
      expect(a).toEqual(b);
      expect(a.roundsRemaining).toBe(3 - round);
      expect(a.offer.cards).toHaveLength(3);
      expect(new Set(a.offer.cards.map(cardKey)).size).toBe(3);
      for (const card of a.offer.cards) expect(CARD_POOL).toContainEqual(card);
      if (round === 0) expect(a.offer.cards.every(c => c.kind === 'sigil')).toBe(true);
      ids.add(a.offer.id);
      expect(chooseReward(a, a.offer.id, round).ok).toBe(true);
      expect(chooseReward(b, b.offer.id, round).ok).toBe(true);
    }
    expect(ids.size).toBe(3);
    expect(a.roundsRemaining).toBe(0);
    expect(a.offer).toBeNull();
    expect(total(a)).toBe(5);
  });
  it('旧令牌重放不重复发牌，非法选项不消耗轮次', () => {
    const s = make();
    const first = s.offer.id;
    for (const index of [-1, 3, 1.5, '0', null, NaN]) {
      rejectedUnchanged(s, () => chooseReward(s, first, index));
    }
    rejectedUnchanged(s, () => chooseReward(s, '过期', 0));
    expect(chooseReward(s, first, 0).ok).toBe(true);
    rejectedUnchanged(s, () => chooseReward(s, first, 0));
    const last = s.offer.id;
    finish(s);
    rejectedUnchanged(s, () => chooseReward(s, last, 0));
  });
  it('多个种子覆盖后续辅助池，互不影响', () => {
    const seen = new Set();
    // 卡池扩到 22 张后，30 个种子已不足以覆盖全部；放宽到 80 个种子，断言不变
    for (let i = 0; i < 80; i++) {
      const s = make({ seed: i });
      chooseReward(s, s.offer.id, 0);
      for (const card of s.offer.cards) seen.add(cardKey(card));
    }
    expect([...seen].sort()).toEqual(CARD_POOL.map(cardKey).sort());
  });
});

describe('主槽与手牌交易', () => {
  it('辅助奖励可以直接装入空格，无需辅助目标，提交合法', () => {
    let s;
    let index;
    for (let seed = 0; seed < 30; seed++) {
      s = make({ seed });
      chooseReward(s, s.offer.id, 0);
      index = s.offer.cards.findIndex(card => card.kind === 'auxiliary');
      if (index >= 0) break;
    }
    expect(index).toBeGreaterThanOrEqual(0);
    const key = cardKey(s.offer.cards[index]);
    expect(chooseReward(s, s.offer.id, index).ok).toBe(true);
    expect(placeCard(s, 9, key).ok).toBe(true);
    expect(s.hand[key]).toBe(0);
    expect(s.draft.auxTargets).toEqual({});
    expect(validateDraft(s.draft)).toEqual([]);
    expect(applyDraft(createGrid(), s.draft).ok).toBe(true);
  });
  it('反复拆装、换位、替换后手牌加装牌守恒，不产生未知主槽字段', () => {
    const s = make();
    finish(s);
    const count = total(s);
    for (let i = 0; i < 25; i++) {
      expect(removeCard(s, 5).ok).toBe(true);
      expect(placeCard(s, 6, 'sigil:arcane_bolt').ok).toBe(true);
      expect(placeCard(s, 5, 'sigil:frost_arrow').ok).toBe(true);
      expect(removeCard(s, 6).ok).toBe(true);
      expect(placeCard(s, 5, 'sigil:arcane_bolt').ok).toBe(true);
      expect(placeCard(s, 6, 'sigil:frost_arrow').ok).toBe(true);
      expect(total(s)).toBe(count);
      expect(Object.values(s.hand).every(n => Number.isInteger(n) && n >= 0)).toBe(true);
    }
    for (const slot of Object.values(s.draft.slots)) expect(Object.keys(slot).sort()).toEqual(['defId', 'kind']);
    expect(validateDraft(s.draft)).toEqual([]);
    expect(applyDraft(createGrid(), s.draft).ok).toBe(true);
  });
  it('空手牌、重复拆卸不会复制卡牌', () => {
    const s = make();
    rejectedUnchanged(s, () => placeCard(s, 9, 'sigil:arcane_bolt'));
    expect(removeCard(s, 5).ok).toBe(true);
    rejectedUnchanged(s, () => removeCard(s, 5));
    expect(placeCard(s, 9, 'sigil:arcane_bolt').ok).toBe(true);
    rejectedUnchanged(s, () => placeCard(s, 10, 'sigil:arcane_bolt'));
    expect(total(s)).toBe(2);
  });
  it.each(['remove', 'replace'])('拆走输出清除所有关联辅助目标：%s', action => {
    const d = draft();
    d.slots[6] = { kind: 'auxiliary', defId: 'hourglass' };
    d.slots[9] = { kind: 'auxiliary', defId: 'wide_runes' };
    d.auxTargets = { 6: 5, 9: 5 };
    const s = make({ draft: d });
    if (action === 'remove') expect(removeCard(s, 5).ok).toBe(true);
    else {
      const card = s.offer.cards[0];
      chooseReward(s, s.offer.id, 0);
      expect(placeCard(s, 5, cardKey(card)).ok).toBe(true);
    }
    expect(s.draft.auxTargets).toEqual({});
  });
  it('拆走辅助只清除自身目标，保留其他有效关联', () => {
    const d = draft();
    d.slots[9] = { kind: 'auxiliary', defId: 'hourglass' };
    d.slots[10] = { kind: 'auxiliary', defId: 'wide_runes' };
    d.auxTargets = { 9: 5, 10: 6 };
    const s = make({ draft: d });
    expect(removeCard(s, 9).ok).toBe(true);
    expect(s.draft.auxTargets).toEqual({ 10: 6 });
    expect(s.hand['auxiliary:hourglass']).toBe(1);
  });
  it.each(['bad', 'aux:slow_field', 'sigil:slow_field', 'auxiliary:arcane_bolt', 'sigil:__proto__', 'sigil:constructor', 'sigil:arcane_bolt:extra', null, {}])('非法卡名不抛错且不改变状态：%j', key => {
    const s = make();
    rejectedUnchanged(s, () => placeCard(s, 5, key));
  });
});

describe('铭文支付与退款', () => {
  it('实际支付8，拆卸返4，重复拆卸拒绝，双槽位置不串位', () => {
    const s = make({ shards: 24 });
    expect(installRune(s, 5, 'forge', 1).ok).toBe(true);
    expect(s.draft.runes[5]).toEqual([null, 'forge']);
    expect(s.runeCosts[5]).toEqual([null, 8]);
    expect(installRune(s, 5, 'relay', 0).ok).toBe(true);
    expect(s.shards).toBe(8);
    rejectedUnchanged(s, () => installRune(s, 5, 'forge', 0));
    expect(removeRune(s, 5, 1).ok).toBe(true);
    expect(s.shards).toBe(12);
    expect(s.runeCosts[5]).toEqual([8, null]);
    rejectedUnchanged(s, () => removeRune(s, 5, 1));
    expect(removeRune(s, 5, 0).ok).toBe(true);
    expect(s.shards).toBe(16);
  });
  it('同格同名拒绝，余额不足拒绝，余额始终非负', () => {
    const s = make({ shards: 8 });
    expect(installRune(s, 5, 'forge', 0).ok).toBe(true);
    rejectedUnchanged(s, () => installRune(s, 5, 'forge', 1));
    rejectedUnchanged(s, () => installRune(s, 6, 'relay', 0));
    expect(s.shards).toBe(0);
    for (let i = 0; i < 10; i++) {
      removeRune(s, 5, 0);
      installRune(s, 5, 'forge', 0);
      expect(s.shards).toBeGreaterThanOrEqual(0);
    }
    expect(s.shards).toBe(4);
  });
  it('来源未知旧铭文退款0；重新安装后才有真实支付成本', () => {
    const d = draft();
    d.runes[5] = ['forge', 'sever'];
    const s = make({ draft: d, shards: 8 });
    expect(s.runeCosts[5]).toEqual([0, 0]);
    expect(removeRune(s, 5, 0).ok).toBe(true);
    expect(removeRune(s, 5, 1).ok).toBe(true);
    expect(s.shards).toBe(8);
    rejectedUnchanged(s, () => removeRune(s, 5, 0));
    expect(installRune(s, 5, 'relay', 0).ok).toBe(true);
    expect(removeRune(s, 5, 0).ok).toBe(true);
    expect(s.shards).toBe(4);
  });
  it.each(['bad', '__proto__', 'constructor', null, {}])('非法铭文不抛错且原子拒绝：%j', rune => {
    const s = make({ shards: 20 });
    rejectedUnchanged(s, () => installRune(s, 5, rune, 0));
  });
  it.each(['forge', 'relay', 'sever', 'silence'])('四种铭文均可按实际支付安装与退款：%s', rune => {
    const s = make({ shards: 18 });
    expect(installRune(s, 5, rune, 0).ok).toBe(true);
    expect(s.shards).toBe(10);
    expect(s.runeCosts[5][0]).toBe(8);
    expect(removeRune(s, 5, 0).ok).toBe(true);
    expect(s.shards).toBe(14);
  });
  it.each([-1, 2, '0', null, NaN])('非法铭文槽原子拒绝：%j', slot => {
    const s = make({ shards: 20 });
    rejectedUnchanged(s, () => installRune(s, 5, 'forge', slot));
    rejectedUnchanged(s, () => removeRune(s, 5, slot));
  });
});

describe('边界、快照与出发', () => {
  it.each([-1, 16, 1.5, '5', null, undefined, NaN, {}, 0])('非法或未解封格号不抛错：%j', id => {
    const s = make({ shards: 20 });
    for (const action of [() => placeCard(s, id, 'sigil:arcane_bolt'), () => removeCard(s, id),
      () => installRune(s, id, 'forge', 0), () => removeRune(s, id, 0)]) rejectedUnchanged(s, action);
  });
  it('不串改冻结输入快照、其他工作台以及提交后的快照', () => {
    const grid = createGrid();
    expect(applyDraft(grid, draft()).ok).toBe(true);
    const snapshot = snapshotBuild(grid);
    const original = structuredClone(snapshot);
    const a = make({ draft: snapshot, shards: 8 });
    const b = make({ draft: snapshot });
    removeCard(a, 5);
    expect(installRune(a, 6, 'forge', 0).ok).toBe(true);
    expect(snapshot).toEqual(original);
    expect(b.draft).toEqual(original);
    const committed = applyDraft(grid, a.draft);
    expect(committed.ok).toBe(true);
    const saved = structuredClone(committed.snapshot);
    removeCard(a, 6);
    expect(committed.snapshot).toEqual(saved);
    expect(grid.cells[6].slot.defId).toBe('frost_arrow');
  });
  it('输入普通草稿后续改变不影响工作台，映射与数组均深拷贝', () => {
    const d = draft();
    d.runes[5] = [null, 'relay'];
    d.exits[5] = ['N'];
    const s = make({ draft: d });
    const before = structuredClone(s.draft);
    d.slots[5].defId = 'starfall';
    d.runes[5][0] = 'forge';
    d.unlocked.push(1);
    d.exits[5].push('E');
    expect(s.draft).toEqual(before);
  });
  it('三轮选完、至少两输出且构筑合法才能出发', () => {
    const s = make();
    expect(canDepart(s).ok).toBe(false);
    finish(s);
    expect(canDepart(s).ok).toBe(true);
    removeCard(s, 5);
    expect(canDepart(s).message).toContain('两张');
    placeCard(s, 5, 'sigil:arcane_bolt');
    s.draft.slots[5].unknown = true;
    const before = structuredClone(s);
    expect(canDepart(s).ok).toBe(false);
    expect(s).toEqual(before);
  });
  it('两张符印都安装中继时拒绝出发且不改变状态', () => {
    const s = make({ shards: 16 });
    finish(s);
    expect(installRune(s, 5, 'relay', 0).ok).toBe(true);
    expect(installRune(s, 6, 'relay', 1).ok).toBe(true);
    rejectedUnchanged(s, () => canDepart(s));
    expect(canDepart(s).message).toContain('未安装中继');
  });
  it('至少两张非中继输出才可出发，熔炉不影响计数', () => {
    const s = make({ shards: 16 });
    finish(s);
    expect(installRune(s, 5, 'relay', 0).ok).toBe(true);
    rejectedUnchanged(s, () => canDepart(s));
    expect(removeRune(s, 5, 0).ok).toBe(true);
    expect(installRune(s, 6, 'forge', 1).ok).toBe(true);
    expect(canDepart(s).ok).toBe(true);
  });
  it.each([-1, NaN, Infinity, 1.5, '8'])('非法初始碎片不会成为负数或非整数：%j', shards => {
    expect(make({ shards }).shards).toBe(0);
  });
});
