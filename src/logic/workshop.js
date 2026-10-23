// 幕间工作台：仅维护构筑草稿与交易，不依赖渲染或运行中法阵。
import { validateDraft, emptyDraft } from './build.js';
import { SIGIL_DEFS, AUX_DEFS, RUNE_DEFS } from './effects.js';
import { CELL_COUNT } from './constants.js';
import { Rng } from './rng.js';

// 完整首版卡池：8 符印 + 6 辅助。符印在前，保证首轮三选一必出输出。
export const CARD_POOL = Object.freeze([
  ...['arcane_bolt', 'frost_arrow', 'flame_burst', 'holy_ward',
    'mana_siphon', 'judgment_hammer', 'thorn_vine', 'starfall']
    .map(defId => Object.freeze({ kind: 'sigil', defId })),
  ...['resonance_stone', 'slow_field', 'shard_resonance', 'sacrifice',
    'hourglass', 'wide_runes']
    .map(defId => Object.freeze({ kind: 'auxiliary', defId })),
]);
const sessions = new WeakMap();
const clone = value => structuredClone(value);
const result = (ok, message) => ({ ok, message });
const keyOf = card => card.kind + ':' + card.defId;
const validCard = card => card && typeof card.defId === 'string'
  && (card.kind === 'sigil' ? Object.hasOwn(SIGIL_DEFS, card.defId)
    : card.kind === 'auxiliary' && Object.hasOwn(AUX_DEFS, card.defId));
const validState = state => !!state && sessions.has(state);
function cellError(state, id) {
  if (!validState(state)) return '工作台状态无效';
  if (!Number.isInteger(id) || id < 0 || id >= CELL_COUNT) return '格号无效';
  if (!state.draft.unlocked.includes(id)) return '该格尚未解封';
  return null;
}
function clearTargets(draft, id) {
  delete draft.auxTargets[id];
  for (const [source, target] of Object.entries(draft.auxTargets)) {
    if (target === id) delete draft.auxTargets[source];
  }
}
function returnCard(state, card) {
  if (card) state.hand[keyOf(card)] = (state.hand[keyOf(card)] ?? 0) + 1;
}

export function createWorkshop({ draft = emptyDraft(), shards = 0, seed = 'workshop' } = {}) {
  const copy = clone(draft);
  // 不改写调用方的冻结快照；补齐构筑协议允许省略的映射。
  for (const name of ['slots', 'runes', 'exits', 'auxTargets']) copy[name] ??= {};
  const rng = new Rng(seed);
  const offers = Array.from({ length: 3 }, (_, round) => {
    const pool = [...(round === 0 ? CARD_POOL.slice(0, 4) : CARD_POOL)];
    const cards = [];
    while (cards.length < 3) cards.push({ ...pool.splice(rng.int(pool.length), 1)[0] });
    return { id: 'workshop:' + JSON.stringify(String(seed)) + ':' + (round + 1), cards };
  });
  const state = {
    draft: copy,
    shards: Number.isSafeInteger(shards) && shards >= 0 ? shards : 0,
    hand: Object.fromEntries(CARD_POOL.map(card => [keyOf(card), 0])),
    offer: clone(offers[0]), roundsRemaining: 3, runeCosts: {},
  };
  for (const id of copy.unlocked) {
    state.runeCosts[id] = [0, 1].map(slot => copy.runes[id]?.[slot] ? 0 : null);
  }
  sessions.set(state, { offers, round: 0 });
  return state;
}

export function chooseReward(state, offerId, index) {
  if (!validState(state)) return result(false, '工作台状态无效');
  const session = sessions.get(state);
  const offer = session.offers[session.round];
  if (!offer || offer.id !== offerId || state.offer?.id !== offerId) return result(false, '奖励已领取或选牌凭证已过期');
  if (!Number.isInteger(index) || index < 0 || index >= offer.cards.length) return result(false, '奖励选项无效');
  returnCard(state, offer.cards[index]);
  session.round++;
  state.roundsRemaining = 3 - session.round;
  state.offer = session.round < 3 ? clone(session.offers[session.round]) : null;
  return result(true, '已领取奖励');
}

export function placeCard(state, cellId, cardKey) {
  const error = cellError(state, cellId);
  if (error) return result(false, error);
  const parts = typeof cardKey === 'string' ? cardKey.split(':') : [];
  const card = { kind: parts[0], defId: parts[1] };
  if (parts.length !== 2 || !validCard(card)) return result(false, '卡牌类型或名称无效');
  if (!Number.isSafeInteger(state.hand[cardKey]) || state.hand[cardKey] <= 0) return result(false, '手牌中没有这张卡');
  const previous = state.draft.slots[cellId];
  if (previous && !validCard(previous)) return result(false, '原主槽卡牌无效');
  state.hand[cardKey]--;
  returnCard(state, previous);
  clearTargets(state.draft, cellId);
  state.draft.slots[cellId] = card;
  return result(true, '已装入卡牌，原卡已返回手牌');
}

export function removeCard(state, cellId) {
  const error = cellError(state, cellId);
  if (error) return result(false, error);
  const card = state.draft.slots[cellId];
  if (!card) return result(false, '该格没有可拆卸的卡牌');
  if (!validCard(card)) return result(false, '原主槽卡牌无效');
  returnCard(state, card);
  delete state.draft.slots[cellId];
  clearTargets(state.draft, cellId);
  return result(true, '卡牌已返回手牌');
}

export function installRune(state, cellId, runeId, slotIndex) {
  const error = cellError(state, cellId);
  if (error) return result(false, error);
  if (typeof runeId !== 'string' || !Object.hasOwn(RUNE_DEFS, runeId)) return result(false, '未知铭文');
  if (slotIndex !== 0 && slotIndex !== 1) return result(false, '铭文槽号必须是 0 或 1');
  const runes = state.draft.runes[cellId] ?? [null, null];
  if (runes[slotIndex]) return result(false, '该铭文槽已满，请先拆卸');
  if (runes.includes(runeId)) return result(false, '同格不能重复安装同名铭文');
  if (!Number.isSafeInteger(state.shards) || state.shards < 8) return result(false, '碎片不足，需要 8 碎片');
  const next = [runes[0] ?? null, runes[1] ?? null];
  next[slotIndex] = runeId;
  state.draft.runes[cellId] = next;
  state.runeCosts[cellId] ??= [null, null];
  state.runeCosts[cellId][slotIndex] = 8;
  state.shards -= 8;
  return result(true, '铭文已安装，消耗 8 碎片');
}

export function removeRune(state, cellId, slotIndex) {
  const error = cellError(state, cellId);
  if (error) return result(false, error);
  if (slotIndex !== 0 && slotIndex !== 1) return result(false, '铭文槽号必须是 0 或 1');
  if (!state.draft.runes[cellId]?.[slotIndex]) return result(false, '该槽没有可拆卸的铭文');
  const cost = state.runeCosts[cellId]?.[slotIndex];
  const refund = Number.isSafeInteger(cost) && cost > 0 ? Math.floor(cost * 0.6) : 0;
  state.draft.runes[cellId][slotIndex] = null;
  state.runeCosts[cellId] ??= [null, null];
  state.runeCosts[cellId][slotIndex] = null;
  state.shards += refund;
  return result(true, '已拆卸铭文，返还 ' + refund + ' 碎片');
}

export function canDepart(state) {
  if (!validState(state)) return result(false, '工作台状态无效');
  if (state.roundsRemaining !== 0 || state.offer !== null) return result(false, '请先完成三轮奖励选择');
  const errors = validateDraft(state.draft);
  if (errors.length) return result(false, '构筑校验未通过：' + errors.map(error => error.code).join('、'));
  const outputs = Object.entries(state.draft.slots).filter(([id, card]) =>
    card?.kind === 'sigil' && !state.draft.runes[id]?.includes('relay'));
  if (outputs.length < 2) return result(false, '法阵中至少需要两张未安装中继的输出符印');
  return result(true, '构筑完成，可以出发');
}
