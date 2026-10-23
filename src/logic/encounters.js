import { Rng } from './rng.js';

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const id = (value) => text(value) && !['__proto__', 'prototype', 'constructor'].includes(value);
const fail = (message) => ({ ok: false, message });

// 只接受可复制的纯数据；不悄悄将 NaN、Infinity 或 undefined 转成 null。
function copy(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!record(value) && !Array.isArray(value)) throw new Error('不是纯数据');
  if (seen.has(value)) throw new Error('循环数据');
  const proto = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) throw new Error('不是普通对象');
  seen.add(value);
  const result = Array.isArray(value) ? new Array(value.length) : {};
  for (const key of Object.keys(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('非法字段');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!own(descriptor, 'value')) throw new Error('不接受访问器');
    result[key] = copy(descriptor.value, seen);
  }
  seen.delete(value);
  return result;
}

function validAmounts(value) {
  return record(value) && Object.values(value).every((n) => Number.isSafeInteger(n) && n >= 0);
}

function validDefinition(d) {
  if (!record(d) || !id(d.id) || !['npc', 'boss'].includes(d.type)) return false;
  if (!['name', 'title', 'question', 'explanation', 'successText', 'failureText'].every((key) => text(d[key]))) return false;
  if (d.type === 'boss' ? !id(d.bossId) : own(d, 'bossId')) return false;
  if (!Array.isArray(d.clues) || d.clues.length === 0 || !Array.from(d.clues).every((c) => record(c) && id(c.id) && text(c.text))) return false;
  if (new Set(d.clues.map((c) => c.id)).size !== d.clues.length) return false;
  if (!Array.isArray(d.choices) || d.choices.length !== 3 || !Array.from(d.choices).every((c) => record(c) && id(c.id) && text(c.label))) return false;
  if (new Set(d.choices.map((c) => c.id)).size !== 3) return false;
  return id(d.correctChoiceId) && d.choices.some((c) => c.id === d.correctChoiceId) && validAmounts(d.reward) && validAmounts(d.penalty);
}

function writable(object, key) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return descriptor ? own(descriptor, 'value') && descriptor.writable : Object.isExtensible(object);
}

function validState(state) {
  return record(state) && text(state.runId) && own(state, 'active') && record(state.completed)
    && Array.isArray(state.history) && writable(state, 'active');
}

function guarded(operation) {
  try { return operation(); } catch { return fail('遭遇输入非法，请检查状态或定义。'); }
}

export function createEncounterState(runId = 'run') {
  return { runId: text(runId) ? runId : 'run', active: null, completed: {}, history: [] };
}

export function openEncounter(state, definition, options = {}) {
  return guarded(() => {
    if (!validState(state)) return fail('遭遇状态非法。');
    if (state.active !== null) return fail('请先完成当前遭遇。');
    if (!record(options)) return fail('遭遇随机参数非法。');
    const seed = options.seed === undefined ? 'encounter' : options.seed;
    if (!(typeof seed === 'string' || (typeof seed === 'number' && Number.isFinite(seed)))) return fail('遭遇种子非法。');
    const d = copy(definition);
    if (!validDefinition(d)) return fail('遭遇定义非法：请检查线索、选项、答案及奖励。');
    if (own(state.completed, d.id) && state.completed[d.id] === true) return fail('该遭遇已经完成，不能重复开启。');
    const rng = new Rng(seed);
    for (let i = d.choices.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [d.choices[i], d.choices[j]] = [d.choices[j], d.choices[i]];
    }
    state.active = { ...d, phase: 'question', selectedChoiceId: null, result: null };
    return { ok: true, message: '遭遇已开启，请阅读线索后选择。' };
  });
}

function questionReady(state) {
  return validState(state) && record(state.active) && state.active.phase === 'question'
    && validDefinition(copy(state.active));
}

export function selectChoice(state, choiceId) {
  return guarded(() => {
    if (!questionReady(state)) return fail('当前没有可作答的遭遇。');
    if (!id(choiceId) || !state.active.choices.some((c) => c.id === choiceId)) return fail('选项编号非法。');
    if (!writable(state.active, 'selectedChoiceId')) return fail('遭遇状态不可修改。');
    state.active.selectedChoiceId = choiceId;
    return { ok: true, message: '已选择答案，请确认。' };
  });
}

export function confirmChoice(state) {
  return guarded(() => {
    if (!questionReady(state)) return fail('当前遭遇不能重复确认或尚未开启。');
    const d = state.active;
    if (!id(d.selectedChoiceId) || !d.choices.some((c) => c.id === d.selectedChoiceId)) return fail('请先选择一个合法答案。');
    if (!writable(d, 'phase') || !writable(d, 'result')) return fail('遭遇状态不可修改。');
    const correct = d.selectedChoiceId === d.correctChoiceId;
    const result = {
      encounterId: d.id, type: d.type, bossId: d.type === 'boss' ? d.bossId : null, correct,
      action: d.type === 'npc' ? 'resume' : correct ? 'bossDefeated' : 'bossBattle',
      reward: correct ? copy(d.reward) : {}, penalty: correct ? {} : copy(d.penalty),
      text: correct ? d.successText : d.failureText, explanation: d.explanation,
    };
    const returned = copy(result);
    d.result = result;
    d.phase = 'result';
    // 这里不修改历史、不结算资源；调用方仅在 ok=true 时消费此结果一次。
    return { ok: true, message: correct ? '回答正确。' : '回答错误。', result: returned };
  });
}

export function finishEncounter(state) {
  return guarded(() => {
    if (!validState(state) || !record(state.active) || state.active.phase !== 'result') return fail('尚无可结束的遭遇结果。');
    const d = state.active;
    if (!validDefinition(copy(d)) || !record(d.result) || d.result.encounterId !== d.id
      || !validAmounts(d.result.reward) || !validAmounts(d.result.penalty)
      || typeof d.result.correct !== 'boolean' || !text(d.result.text) || !text(d.result.explanation)
      || d.result.type !== d.type || d.result.bossId !== (d.type === 'boss' ? d.bossId : null)
      || d.result.action !== (d.type === 'npc' ? 'resume' : d.result.correct ? 'bossDefeated' : 'bossBattle')) return fail('遭遇结果非法。');
    if ((own(state.completed, d.id) && state.completed[d.id] === true) || !writable(state.completed, d.id)
      || !Object.isExtensible(state.history) || state.history.length >= 4294967295 || !writable(state.history, 'length')) return fail('遭遇完成记录不可修改或已经完成。');
    const historyResult = copy(d.result);
    const returned = copy(d.result);
    // 在所有验证与复制完成后提交，避免非法输入留下半完成记录。
    Object.defineProperty(state.completed, d.id, { value: true, writable: true, configurable: true, enumerable: true });
    // 不调用输入对象可能覆盖的 push，也不触发原型链上的索引 setter。
    Object.defineProperty(state.history, state.history.length, { value: historyResult, writable: true, configurable: true, enumerable: true });
    state.active = null;
    return { ok: true, message: '遭遇已结束。', result: returned };
  });
}
