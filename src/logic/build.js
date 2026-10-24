// 幕间构筑数据边界。校验失败绝不修改运行中法阵；快照和草稿共用同一数据形状。
import { createGrid, rebuildDerived, neighborsOf } from './grid.js';
import { ORTHO_DIRS, ACTS, DIRS, CELL_COUNT } from './constants.js';
import { SIGIL_DEFS, AUX_DEFS, RUNE_DEFS, OATH_DEFS } from './effects.js';

export const BUILD_ERROR = Object.freeze({
  INVALID_DRAFT: 'invalid_draft', INVALID_ACT: 'invalid_act', INVALID_CELL: 'invalid_cell',
  DUPLICATE_CELL: 'duplicate_cell', LOCKED_CELL: 'locked_cell', SLOT_CONFLICT: 'slot_conflict',
  UNKNOWN_DEF: 'unknown_def', RUNE_SLOT_FULL: 'rune_slot_full', DUPLICATE_RUNE: 'duplicate_rune',
  AUX_NEEDS_TARGET: 'aux_needs_target', AUX_TARGET_INVALID: 'aux_target_invalid',
  OATH_UNKNOWN: 'oath_unknown', TOO_MANY_UNLOCKED: 'too_many_unlocked',
  INVALID_EXITS: 'invalid_exits', WRONG_PHASE: 'wrong_phase',
});
export const AUX_TARGETED = new Set(['hourglass', 'wide_runes', 'sacrifice']);
const own = (o, k) => Object.hasOwn(o, k);
const record = v => v !== null && typeof v === 'object' && !Array.isArray(v)
  && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const cellId = id => Number.isInteger(id) && id >= 0 && id < CELL_COUNT;
const cellKey = key => /^(?:[0-9]|1[0-5])$/.test(key);

export function emptyDraft(act = 1) {
  return { version: 1, act, unlocked: [], slots: {}, runes: {}, exits: {}, auxTargets: {}, oath: null };
}

// 返回结构化错误，不把无效输入转换成合法配置（例如字符串格号或未知幕数）。
export function validateDraft(draft, opts = {}) {
  const errors = [];
  const fail = (code, fields = {}) => errors.push({ code, ...fields });
  if (!record(draft)) return [{ code: BUILD_ERROR.INVALID_DRAFT }];
  if (!Number.isInteger(draft.act) || !ACTS[draft.act - 1]) fail(BUILD_ERROR.INVALID_ACT);
  if (draft.version !== undefined && draft.version !== 1) fail(BUILD_ERROR.INVALID_DRAFT, { field: 'version' });
  if (!Array.isArray(draft.unlocked)) return [...errors, { code: BUILD_ERROR.INVALID_DRAFT, field: 'unlocked' }];
  const unlocked = new Set();
  for (const id of draft.unlocked) {
    if (!cellId(id)) fail(BUILD_ERROR.INVALID_CELL, { cellId: id });
    else if (unlocked.has(id)) fail(BUILD_ERROR.DUPLICATE_CELL, { cellId: id });
    else unlocked.add(id);
  }
  const max = opts.maxUnlocked ?? ACTS[draft.act - 1]?.unlocked;
  if (max !== undefined && (!Number.isInteger(max) || max < 0 || max > CELL_COUNT)) fail(BUILD_ERROR.INVALID_DRAFT, { field: 'maxUnlocked' });
  else if (max !== undefined && unlocked.size > max) fail(BUILD_ERROR.TOO_MANY_UNLOCKED);
  const maps = {};
  for (const name of ['slots', 'runes', 'exits', 'auxTargets']) {
    const value = draft[name] === undefined ? {} : draft[name];
    if (!record(value)) { fail(BUILD_ERROR.INVALID_DRAFT, { field: name }); maps[name] = {}; }
    else maps[name] = value;
    for (const key of Object.keys(maps[name])) {
      if (!cellKey(key)) fail(BUILD_ERROR.INVALID_CELL, { field: name, cellId: key });
      else if (!unlocked.has(Number(key))) fail(BUILD_ERROR.LOCKED_CELL, { field: name, cellId: Number(key) });
    }
  }
  for (const [key, slot] of Object.entries(maps.slots)) {
    if (slot === null) continue;
    if (!record(slot)) { fail(BUILD_ERROR.SLOT_CONFLICT, { cellId: key }); continue; }
    const table = slot.kind === 'sigil' ? SIGIL_DEFS : slot.kind === 'auxiliary' ? AUX_DEFS : null;
    if (!table || typeof slot.defId !== 'string' || !own(table, slot.defId)) fail(BUILD_ERROR.UNKNOWN_DEF, { cellId: key });
    if (Object.keys(slot).some(k => !['kind', 'defId'].includes(k))) fail(BUILD_ERROR.SLOT_CONFLICT, { cellId: key });
    if (slot.kind === 'auxiliary' && AUX_TARGETED.has(slot.defId)) {
      if (!own(maps.auxTargets, key)) fail(BUILD_ERROR.AUX_NEEDS_TARGET, { cellId: key });
    }
  }
  for (const [key, target] of Object.entries(maps.auxTargets)) {
    const slot = maps.slots[key];
    const targetSlot = maps.slots[target];
    if (!cellKey(key) || !record(slot) || slot.kind !== 'auxiliary' || !AUX_TARGETED.has(slot.defId)
      || !cellId(target) || !unlocked.has(target)
      || !neighborsOf(Number(key), ORTHO_DIRS).some(n => n.id === target)
      || !record(targetSlot) || targetSlot.kind !== 'sigil' || !own(SIGIL_DEFS, targetSlot.defId)) {
      fail(BUILD_ERROR.AUX_TARGET_INVALID, { cellId: key, target });
    }
  }
  for (const [key, runes] of Object.entries(maps.runes)) {
    if (!Array.isArray(runes)) { fail(BUILD_ERROR.INVALID_DRAFT, { field: 'runes', cellId: key }); continue; }
    if (runes.length > 2) fail(BUILD_ERROR.RUNE_SLOT_FULL, { cellId: key });
    const used = new Set();
    for (const rune of runes) {
      if (rune === null) continue;
      if (typeof rune !== 'string' || !own(RUNE_DEFS, rune)) fail(BUILD_ERROR.UNKNOWN_DEF, { cellId: key });
      else if (used.has(rune)) fail(BUILD_ERROR.DUPLICATE_RUNE, { cellId: key });
      else used.add(rune);
    }
  }
  for (const [key, exits] of Object.entries(maps.exits)) {
    const sever = Array.isArray(maps.runes[key]) && maps.runes[key].includes('sever');
    if (!Array.isArray(exits) || (!exits.length && !sever)
      || exits.some(dir => typeof dir !== 'string' || !own(DIRS, dir))
      || new Set(exits).size !== exits.length) fail(BUILD_ERROR.INVALID_EXITS, { cellId: key });
  }
  if (draft.oath !== undefined && draft.oath !== null && (typeof draft.oath !== 'string' || !own(OATH_DEFS, draft.oath))) fail(BUILD_ERROR.OATH_UNKNOWN);
  return errors;
}

function freezeTree(value) {
  for (const child of Object.values(value)) if (child && typeof child === 'object') freezeTree(child);
  return Object.freeze(value);
}

// 回读必须携带出口与辅助目标；不包含运行时冷却，避免编辑重新带入上一幕时钟。
export function draftFromGrid(grid, meta = {}) {
  const draft = emptyDraft(meta.act ?? grid.buildAct ?? 1);
  draft.oath = own(meta, 'oath') ? meta.oath : (grid.oath ?? null);
  for (const cell of grid.cells) {
    if (!cell.unlocked) continue;
    draft.unlocked.push(cell.id);
    if (cell.slot) draft.slots[cell.id] = { ...cell.slot };
    draft.runes[cell.id] = [...cell.runes];
    draft.exits[cell.id] = [...cell.exits];
    if (cell.auxTarget !== null && cell.auxTarget !== undefined) draft.auxTargets[cell.id] = cell.auxTarget;
  }
  return draft;
}

export function snapshotBuild(grid, meta = {}) {
  return freezeTree(draftFromGrid(grid, meta));
}

export function applyDraft(grid, draft, opts = {}) {
  if (opts.phase !== undefined && opts.phase !== 'intermission') return { ok: false, errors: [{ code: BUILD_ERROR.WRONG_PHASE }] };
  const errors = validateDraft(draft, opts);
  if (errors.length) return { ok: false, errors };
  // 完整构建临时法阵、重算派生值和快照后才替换，提交失败不会留下半套配置。
  const staged = createGrid();
  staged.buildAct = draft.act;
  staged.oath = draft.oath ?? null;
  for (const id of draft.unlocked) {
    const cell = staged.cells[id];
    cell.unlocked = true;
    const slot = draft.slots?.[id];
    cell.slot = slot ? { ...slot } : null;
    cell.runes = [...(draft.runes?.[id] ?? [null, null])];
    while (cell.runes.length < 2) cell.runes.push(null);
    cell.exits = new Set(draft.exits?.[id] ?? ORTHO_DIRS);
    cell.auxTarget = draft.auxTargets?.[id] ?? null;
    cell.seversPropagation = cell.runes.includes('sever');
  }
  rebuildDerived(staged, ACTS[draft.act - 1].baseIntervalMs);
  // 保留原格冷却（暂停改阵不允许靠重置冷却白嫖）
  if (opts.preserveFrom) {
    for (const cell of staged.cells) {
      const prev = opts.preserveFrom.cells?.[cell.id];
      if (prev) cell.cooldownUntil = prev.cooldownUntil ?? 0;
    }
  }
  const snapshot = snapshotBuild(staged);
  grid.cells.splice(0, grid.cells.length, ...staged.cells);
  grid.baseIntervalMs = staged.baseIntervalMs;
  grid.buildAct = staged.buildAct;
  grid.oath = staged.oath;
  return { ok: true, snapshot };
}

export function unlockToTarget(grid, target) {
  if (!Number.isInteger(target) || target < 0 || target > CELL_COUNT) throw new RangeError('解封目标必须是 0 至 16 的整数');
  const unlocked = new Set(grid.unlockedIds());
  const order = [5, 6, 9, 10, 1, 2, 4, 7, 8, 11, 13, 14, 0, 3, 12, 15];
  while (unlocked.size < target) {
    const next = order.find(id => !unlocked.has(id) && neighborsOf(id).some(n => unlocked.has(n.id)))
      ?? order.find(id => !unlocked.has(id));
    if (next === undefined) break;
    unlocked.add(next);
  }
  for (const id of unlocked) grid.cells[id].unlocked = true;
  return grid.unlockedIds();
}
