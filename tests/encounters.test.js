import { describe, it, expect } from 'vitest';
import { ENCOUNTERS, getEncounterForAct } from '../src/data/encounters.js';
import { createEncounterState, openEncounter, selectChoice, confirmChoice, finishEncounter } from '../src/logic/encounters.js';

const clone = (value) => structuredClone(value);
const answer = (state, definition, correct = true) => {
  expect(openEncounter(state, definition).ok).toBe(true);
  const choice = correct ? definition.correctChoiceId : definition.choices.find((c) => c.id !== definition.correctChoiceId).id;
  expect(selectChoice(state, choice).ok).toBe(true);
  return confirmChoice(state);
};
const unchangedFailure = (state, fn) => {
  const before = clone(state);
  const response = fn();
  expect(response.ok).toBe(false);
  expect(response.message).toMatch(/[一-鿿]/);
  expect(state).toEqual(before);
  return response;
};

describe('遭遇定义', () => {
  it('包含三幕各一个 NPC 和一个 Boss，名字和题目均不重复', () => {
    expect(Object.keys(ENCOUNTERS).sort()).toEqual(['boss-1', 'boss-2', 'boss-3', 'npc-1', 'npc-2', 'npc-3']);
    expect(new Set(Object.values(ENCOUNTERS).map((d) => d.name)).size).toBe(6);
    expect(new Set(Object.values(ENCOUNTERS).map((d) => d.question)).size).toBe(6);
  });
  for (const definition of Object.values(ENCOUNTERS)) {
    it(definition.id + ' 具有完整的公开线索和唯一答案', () => {
      expect(definition.clues.length).toBeGreaterThan(0);
      expect(definition.clues.every((c) => c.id && c.text)).toBe(true);
      expect(definition.choices).toHaveLength(3);
      expect(new Set(definition.choices.map((c) => c.id)).size).toBe(3);
      expect(definition.choices.filter((c) => c.id === definition.correctChoiceId)).toHaveLength(1);
      expect(getEncounterForAct(Number(definition.id.at(-1)), definition.type)).toBe(definition);
      expect(openEncounter(createEncounterState(), definition).ok).toBe(true);
      if (definition.type === 'npc') {
        expect(definition).not.toHaveProperty('bossId');
        expect(definition.reward).toEqual({ shards: 8, heal: 15 });
        expect(definition.penalty).toEqual({ slowMs: 8000 });
      } else {
        expect(definition.bossId).toBe(definition.id);
        expect(definition.reward).toEqual({ shards: 4 });
        expect(definition.penalty).toEqual({});
        expect(definition.successText).toContain('无需战斗');
      }
    });
  }
  it.each([null, undefined, NaN, Infinity, 0, -1, 4, 1.5, '1', {}, Symbol('act')])('拒绝非法幕号 %s', (act) => {
    expect(getEncounterForAct(act, 'npc')).toBeNull();
  });
  it.each(['constructor', '__proto__', 'boss-1', null, {}, Symbol('kind')])('拒绝非法种类 %s', (kind) => {
    expect(getEncounterForAct(1, kind)).toBeNull();
  });
});

describe('遭遇生命周期', () => {
  it('创建独立状态并保留 runId', () => {
    expect(createEncounterState()).toEqual({ runId: 'run', active: null, completed: {}, history: [] });
    expect(createEncounterState('test').runId).toBe('test');
    const a = createEncounterState(); const b = createEncounterState();
    a.completed['npc-1'] = true;
    expect(b.completed).toEqual({});
  });
  it('固定种子选项顺序可复现、实际打乱且不修改定义', () => {
    const original = clone(ENCOUNTERS['npc-1']);
    const orders = new Set();
    for (let seed = 0; seed < 20; seed++) {
      const a = createEncounterState('a'); const b = createEncounterState('b');
      openEncounter(a, ENCOUNTERS['npc-1'], { seed });
      openEncounter(b, ENCOUNTERS['npc-1'], { seed });
      expect(a.active.choices).toEqual(b.active.choices);
      orders.add(a.active.choices.map((c) => c.id).join(','));
    }
    expect(orders.size).toBeGreaterThan(1);
    expect(ENCOUNTERS['npc-1']).toEqual(original);
  });
  it('开启时深拷贝全部嵌套定义', () => {
    const d = clone(ENCOUNTERS['npc-1']); const state = createEncounterState();
    openEncounter(state, d);
    d.clues[0].text = '改动'; d.choices[0].label = '改动'; d.reward.shards = 999; d.penalty.slowMs = 0;
    expect(state.active.clues[0].text).not.toBe('改动');
    expect(state.active.choices.every((c) => c.label !== '改动')).toBe(true);
    expect(state.active.reward.shards).toBe(8); expect(state.active.penalty.slowMs).toBe(8000);
    expect(state.active).toMatchObject({ phase: 'question', selectedChoiceId: null, result: null });
  });
  for (const d of Object.values(ENCOUNTERS)) {
    for (const correct of [true, false]) {
      it(d.id + (correct ? ' 答对' : ' 答错') + ' 按选项 ID 结算而不是位置', () => {
        const state = createEncounterState(); const response = answer(state, d, correct);
        expect(response.ok).toBe(true);
        expect(response.result).toEqual({
          encounterId: d.id, type: d.type, bossId: d.bossId ?? null, correct,
          action: d.type === 'npc' ? 'resume' : correct ? 'bossDefeated' : 'bossBattle',
          reward: correct ? d.reward : {}, penalty: correct ? {} : d.penalty,
          text: correct ? d.successText : d.failureText, explanation: d.explanation,
        });
        expect(state.active.phase).toBe('result');
        expect(state.history).toEqual([]); expect(state.completed).toEqual({});
        const finish = finishEncounter(state);
        expect(finish.ok).toBe(true); expect(finish.result).toEqual(response.result);
        expect(state.active).toBeNull(); expect(state.completed[d.id]).toBe(true);
        expect(state.history).toEqual([response.result]);
      });
    }
  }
  it('只按 ID 判对，答案移动到任何位置均可正确结算', () => {
    for (let seed = 0; seed < 30; seed++) {
      const s = createEncounterState(); const d = ENCOUNTERS['boss-1'];
      openEncounter(s, d, { seed }); selectChoice(s, d.correctChoiceId);
      expect(confirmChoice(s).result.action).toBe('bossDefeated');
    }
  });
  it('未选择不能确认，未确认不能结束；选择可以在确认前更改', () => {
    const s = createEncounterState(); openEncounter(s, ENCOUNTERS['npc-1']);
    unchangedFailure(s, () => confirmChoice(s)); unchangedFailure(s, () => finishEncounter(s));
    selectChoice(s, 'pine'); selectChoice(s, 'silver');
    expect(confirmChoice(s).result.correct).toBe(true);
  });
  it('active 互斥、confirm/finish 幂等、completed 不可重开', () => {
    const s = createEncounterState(); openEncounter(s, ENCOUNTERS['npc-1']);
    unchangedFailure(s, () => openEncounter(s, ENCOUNTERS['boss-1']));
    selectChoice(s, 'silver'); confirmChoice(s);
    unchangedFailure(s, () => confirmChoice(s)); unchangedFailure(s, () => selectChoice(s, 'pine'));
    unchangedFailure(s, () => openEncounter(s, ENCOUNTERS['boss-1']));
    finishEncounter(s);
    unchangedFailure(s, () => finishEncounter(s)); unchangedFailure(s, () => confirmChoice(s));
    unchangedFailure(s, () => openEncounter(s, ENCOUNTERS['npc-1']));
    expect(openEncounter(s, ENCOUNTERS['boss-1']).ok).toBe(true);
    expect(s.history).toHaveLength(1);
  });
  it('confirm 返回值、active.result、finish 返回值、history 与定义互不共引用', () => {
    const d = clone(ENCOUNTERS['npc-1']); const s = createEncounterState();
    const confirmation = answer(s, d);
    confirmation.result.reward.shards = 900;
    expect(s.active.result.reward.shards).toBe(8);
    const activeResult = s.active.result; const finish = finishEncounter(s);
    activeResult.reward.shards = 700; finish.result.reward.shards = 600;
    expect(s.history[0].reward.shards).toBe(8); expect(d.reward.shards).toBe(8);
  });
  it('错误惩罚同样隔离，返回值改动不污染历史或定义', () => {
    const d = clone(ENCOUNTERS['npc-1']); const s = createEncounterState();
    const response = answer(s, d, false); response.result.penalty.slowMs = 1;
    const finish = finishEncounter(s); finish.result.penalty.slowMs = 2;
    expect(s.history[0].penalty.slowMs).toBe(8000); expect(d.penalty.slowMs).toBe(8000);
  });
  it('原型链上的 completed 标识不阻止开启，完成后写自己的标识', () => {
    const s = createEncounterState(); s.completed = Object.create({ 'npc-1': true });
    expect(openEncounter(s, ENCOUNTERS['npc-1']).ok).toBe(true);
    selectChoice(s, 'silver'); confirmChoice(s); expect(finishEncounter(s).ok).toBe(true);
    expect(Object.hasOwn(s.completed, 'npc-1')).toBe(true);
  });
});

describe('非法输入不抛出且不部分修改状态', () => {
  it.each([null, undefined, 1, 'npc', [], {}, { active: null }, Object.freeze(createEncounterState())])('拒绝非法状态 %s', (state) => {
    for (const fn of [() => openEncounter(state, ENCOUNTERS['npc-1']), () => selectChoice(state, 'silver'), () => confirmChoice(state), () => finishEncounter(state)]) {
      expect(fn).not.toThrow(); expect(fn().ok).toBe(false);
    }
  });
  it.each([null, undefined, 0, {}, [], Symbol('id'), '__proto__', 'constructor', 'toString', 'missing'])('拒绝非法选项 %s', (choiceId) => {
    const s = createEncounterState(); openEncounter(s, ENCOUNTERS['npc-1']);
    unchangedFailure(s, () => selectChoice(s, choiceId));
  });
  const invalidDefinitions = [
    ['空定义', () => null], ['未知类型', (d) => { d.type = 'other'; }],
    ['原型 ID', (d) => { d.id = '__proto__'; }], ['空 ID', (d) => { d.id = ''; }],
    ['重复选项', (d) => { d.choices[1].id = d.choices[0].id; }],
    ['选项过少', (d) => { d.choices.pop(); }], ['选项过多', (d) => { d.choices.push({ id: 'x', label: '多余' }); }],
    ['答案缺失', (d) => { d.correctChoiceId = 'missing'; }],
    ['原型选项', (d) => { d.choices[0].id = 'constructor'; }],
    ['空线索', (d) => { d.clues = []; }], ['错误线索', (d) => { d.clues = [null]; }],
    ['稀疏线索', (d) => { d.clues = new Array(1); }], ['稀疏选项', (d) => { delete d.choices[1]; }],
    ['空题目', (d) => { d.question = ' '; }], ['空选项文案', (d) => { d.choices[0].label = ''; }],
    ['空解释', (d) => { d.explanation = ''; }], ['空奖励', (d) => { d.reward = null; }],
    ['循环引用', (d) => { d.self = d; }], ['NPC携带bossId', (d) => { d.bossId = 'boss-1'; }],
  ];
  for (const [name, mutate] of invalidDefinitions) {
    it('拒绝' + name, () => {
      let d = clone(ENCOUNTERS['npc-1']);
      if (name === '空定义') d = null; else mutate(d);
      const s = createEncounterState(); unchangedFailure(s, () => openEncounter(s, d));
    });
  }
  it('Boss 必须有 bossId', () => {
    const d = clone(ENCOUNTERS['boss-1']); delete d.bossId;
    const s = createEncounterState(); unchangedFailure(s, () => openEncounter(s, d));
  });
  for (const amount of [NaN, Infinity, -Infinity, -1, 1.2, '8', null, undefined, Number.MAX_SAFE_INTEGER + 1]) {
    for (const field of ['reward', 'penalty']) {
      it('拒绝 ' + field + ' 非法数值 ' + String(amount), () => {
        const d = clone(ENCOUNTERS['npc-1']); d[field].shards = amount;
        const s = createEncounterState(); unchangedFailure(s, () => openEncounter(s, d));
      });
    }
  }
  it('零奖励和零惩罚合法', () => {
    const d = clone(ENCOUNTERS['npc-1']); d.reward = { shards: 0, heal: 0 }; d.penalty = { slowMs: 0 };
    expect(openEncounter(createEncounterState(), d).ok).toBe(true);
  });
  it.each([null, [], { seed: {} }, { seed: Symbol('x') }, { seed: NaN }])('拒绝非法随机参数 %s', (options) => {
    const s = createEncounterState(); unchangedFailure(s, () => openEncounter(s, ENCOUNTERS['npc-1'], options));
  });
  it('定义访问器不被调用，直接拒绝', () => {
    const d = clone(ENCOUNTERS['npc-1']); let calls = 0;
    Object.defineProperty(d, 'question', { enumerable: true, get() { calls++; throw new Error('getter'); } });
    const s = createEncounterState(); unchangedFailure(s, () => openEncounter(s, d)); expect(calls).toBe(0);
  });
  it('active 奖励被污染后不允许确认', () => {
    const s = createEncounterState(); openEncounter(s, ENCOUNTERS['npc-1']); selectChoice(s, 'silver'); s.active.reward.shards = -1;
    unchangedFailure(s, () => confirmChoice(s));
  });
  it('历史 push 被覆盖时仍能原子完成并保留数组引用', () => {
    const s = createEncounterState(); answer(s, ENCOUNTERS['npc-1']);
    const history = s.history; history.push = null;
    expect(finishEncounter(s).ok).toBe(true);
    expect(s.history).toBe(history); expect(s.history).toHaveLength(1);
  });
  it('结果非法数值不允许归档', () => {
    const s = createEncounterState(); answer(s, ENCOUNTERS['npc-1']); s.active.result.reward.shards = -1;
    unchangedFailure(s, () => finishEncounter(s));
  });
  it('冻结完成表或历史时不留下半完成记录', () => {
    for (const target of ['completed', 'history']) {
      const s = createEncounterState(); answer(s, ENCOUNTERS['npc-1']); Object.freeze(s[target]);
      unchangedFailure(s, () => finishEncounter(s));
    }
  });
});
