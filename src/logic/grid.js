// 4x4 法阵拓扑：邻接、出口、位置类型、间隔与冷却推导
import {
  GRID_N, CELL_COUNT, DIRS, ORTHO_DIRS,
  POSITION_COOLDOWN, INTERVAL_FLOOR_MS, COOLDOWN_FLOOR_MS, RESONANCE_FACTOR,
} from './constants.js';
import { SIGIL_DEFS } from '../data/cards.js';

export function toId(r, c) {
  return r * GRID_N + c;
}

export function toRC(id) {
  return { r: Math.floor(id / GRID_N), c: id % GRID_N };
}

export function inBounds(r, c) {
  return r >= 0 && r < GRID_N && c >= 0 && c < GRID_N;
}

export function manhattan(a, b) {
  const pa = toRC(a);
  const pb = toRC(b);
  return Math.abs(pa.r - pb.r) + Math.abs(pa.c - pb.c);
}

export function chebyshev(a, b) {
  const pa = toRC(a);
  const pb = toRC(b);
  return Math.max(Math.abs(pa.r - pb.r), Math.abs(pa.c - pb.c));
}

// 结构位置类型：只由方格坐标决定，与是否解封无关
export function positionType(id) {
  const { r, c } = toRC(id);
  const edgeR = r === 0 || r === GRID_N - 1;
  const edgeC = c === 0 || c === GRID_N - 1;
  if (edgeR && edgeC) return 'corner';
  if (edgeR || edgeC) return 'edge';
  return 'center';
}

export function baseCooldown(id) {
  return POSITION_COOLDOWN[positionType(id)];
}

export function neighborsOf(id, dirs = ORTHO_DIRS) {
  if (!Number.isInteger(id) || id < 0 || id >= CELL_COUNT || !Array.isArray(dirs)) return [];
  const { r, c } = toRC(id);
  const out = [];
  for (const name of dirs) {
    if (!Object.hasOwn(DIRS, name)) continue;
    const d = DIRS[name];
    const nr = r + d.dr;
    const nc = c + d.dc;
    if (inBounds(nr, nc)) out.push({ id: toId(nr, nc), dir: name });
  }
  return out;
}

export function createCell(id) {
  return {
    id,
    unlocked: false,
    slot: null,            // { kind: 'sigil'|'auxiliary', defId }
    runes: [null, null],   // 两个铭文槽
    exits: new Set(ORTHO_DIRS), // 配置出口；断流铭文只阻止运行时传播
    cooldownUntil: 0,
    // 派生值（rebuildDerived 刷新）
    effIntervalMs: 0,
    effCooldownMs: 0,
    resonanceStacks: 0,
  };
}

export function createGrid() {
  const cells = [];
  for (let i = 0; i < CELL_COUNT; i++) cells.push(createCell(i));
  return {
    cells,
    baseIntervalMs: 2000,
    byId: (id) => cells[id],
    unlockedIds() {
      return cells.filter((c) => c.unlocked).map((c) => c.id);
    },
    resetCooldowns() {
      for (const c of cells) c.cooldownUntil = 0;
    },
  };
}

// 重新推导每格的共鸣石层数、有效间隔与有效冷却。
// 规则：共鸣石作用于正交四邻，不影响自身；减幅乘算后再夹硬下限。
export function rebuildDerived(grid, baseIntervalMs, { cooldownMul = 1 } = {}) {
  if (!Number.isFinite(cooldownMul) || cooldownMul <= 0) throw new RangeError('冷却倍率必须是有限正数');
  if (!Number.isFinite(baseIntervalMs) || baseIntervalMs <= 0) throw new RangeError('基础间隔必须是有限正数');
  grid.baseIntervalMs = baseIntervalMs;
  for (const cell of grid.cells) {
    cell.resonanceStacks = 0;
    cell.hourglassStacks = 0;
    cell.effectiveExits = null;
    cell.seversPropagation = cell.runes.includes('sever');
    cell.mutedOutput = cell.runes.includes('relay');
  }
  for (const cell of grid.cells) {
    if (!cell.unlocked || cell.slot?.kind !== 'auxiliary') continue;
    if (cell.slot.defId === 'resonance_stone') {
      for (const nb of neighborsOf(cell.id)) if (grid.cells[nb.id].unlocked) grid.cells[nb.id].resonanceStacks++;
    }
    const target = grid.cells[cell.auxTarget];
    if (!target?.unlocked || target.slot?.kind !== 'sigil' || !neighborsOf(cell.id).some(n => n.id === target.id)) continue;
    if (cell.slot.defId === 'hourglass') target.hourglassStacks++;
    if (cell.slot.defId === 'wide_runes') target.effectiveExits = new Set([...target.exits, ...Object.keys(DIRS)]);
  }
  for (const cell of grid.cells) {
    const factor = Math.pow(RESONANCE_FACTOR, cell.resonanceStacks);
    const cdMul = cell.slot?.kind === 'sigil' ? (SIGIL_DEFS[cell.slot.defId]?.cdMul ?? 1) : 1;
    cell.effIntervalMs = Math.max(INTERVAL_FLOOR_MS, baseIntervalMs * factor * (cell.mutedOutput ? 0.6 : 1));
    cell.effCooldownMs = Math.max(COOLDOWN_FLOOR_MS, baseCooldown(cell.id) * factor * Math.pow(0.7, cell.hourglassStacks) * cdMul * cooldownMul);
  }
  return grid;
}

// 该格当前的可用出口目标（只考虑已解封且未被断流本格阻止的邻居）
export function exitTargets(grid, cellId) {
  if (!Number.isInteger(cellId) || cellId < 0 || cellId >= CELL_COUNT) return [];
  const cell = grid.cells[cellId];
  if (!cell.unlocked) return [];
  if (cell.seversPropagation) return [];
  const out = [];
  for (const dirName of cell.effectiveExits ?? cell.exits) {
    const d = DIRS[dirName];
    if (!d) continue;
    const { r, c } = toRC(cellId);
    const nr = r + d.dr;
    const nc = c + d.dc;
    if (!inBounds(nr, nc)) continue;
    const targetId = toId(nr, nc);
    if (!grid.cells[targetId].unlocked) continue;
    out.push(targetId);
  }
  return out;
}

export function hasRun(grid, cellId, runeId) {
  const cell = grid.cells[cellId];
  return cell.runes.includes(runeId);
}
