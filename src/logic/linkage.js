// 专属连携的纯逻辑：配对查询、组内配对检测、同对冷却。
import { linkageFor } from '../data/linkages.js';

export const LINKAGE_COOLDOWN_MS = 1500;

export function linkageKey(a, b) {
  return [a, b].sort().join('|');
}

// 组内是否同时出现一对搭档；返回配对与两格的 cellId（同一法术多格时取最先出现的一格）。
export function groupLinkage(grid, order) {
  if (!Array.isArray(order) || order.length < 2) return null;
  const byDef = new Map();
  for (const cellId of order) {
    const slot = grid.cells[cellId]?.slot;
    if (!slot || slot.kind !== 'sigil') continue;
    if (!byDef.has(slot.defId)) byDef.set(slot.defId, cellId);
  }
  const defs = [...byDef.keys()];
  for (let i = 0; i < defs.length; i++) {
    for (let j = i + 1; j < defs.length; j++) {
      const pair = linkageFor(defs[i], defs[j]);
      if (pair) return { pair, aCell: byDef.get(defs[i]), bCell: byDef.get(defs[j]) };
    }
  }
  return null;
}

export function linkageReady(state, a, b) {
  const now = Number.isFinite(state?.now) ? state.now : 0;
  const until = state?.linkageCd?.[linkageKey(a, b)] ?? 0;
  return now >= until;
}

export function markLinkage(state, a, b) {
  if (!state?.linkageCd) return false;
  const now = Number.isFinite(state?.now) ? state.now : 0;
  state.linkageCd[linkageKey(a, b)] = now + LINKAGE_COOLDOWN_MS;
  return true;
}
