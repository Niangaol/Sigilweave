// 派系判定：只读 grid 与 slot，不碰渲染与实体。供伤害结算与界面查询共用。
import { factionOf, REACTIONS, RESONANCE_STEP, RESONANCE_CAP } from '../data/factions.js';
import { neighborsOf } from './grid.js';
import { ORTHO_DIRS } from './constants.js';

const sigilSlot = (cell) => cell?.slot?.kind === 'sigil' ? cell.slot : null;

// 同系正交相邻：每个相邻同派系符印 +10%，封顶 +30%。没有派系/空格/辅助返回 1。
export function resonanceMultiplier(grid, cellId) {
  const slot = sigilSlot(grid?.cells?.[cellId]);
  const here = factionOf(slot?.defId);
  if (!here) return 1;
  let same = 0;
  for (const nb of neighborsOf(cellId, ORTHO_DIRS)) {
    const other = sigilSlot(grid.cells[nb.id]);
    if (other && factionOf(other.defId) === here) same++;
  }
  return Math.min(1 + RESONANCE_STEP * same, 1 + RESONANCE_CAP);
}

// 无序配对：frost+fire 与 fire+frost 都返回同一个融化。
export function reactionFor(a, b) {
  if (!a || !b || a === b) return null;
  for (const reaction of Object.values(REACTIONS)) {
    const [x, y] = reaction.pair;
    if ((a === x && b === y) || (a === y && b === x)) return reaction;
  }
  return null;
}

// 当前格触发时能吃到哪个反应：只看正交相邻、已装符印的派系。
// 多个邻居同时满足时按 REACTIONS 声明顺序取第一个，保证同局面结果确定。
export function reactionAt(grid, cellId) {
  const slot = sigilSlot(grid?.cells?.[cellId]);
  const here = factionOf(slot?.defId);
  if (!here) return null;
  const seen = new Set();
  for (const nb of neighborsOf(cellId, ORTHO_DIRS)) {
    const other = sigilSlot(grid.cells[nb.id]);
    const faction = factionOf(other?.defId);
    if (!faction || faction === here || seen.has(faction)) continue;
    seen.add(faction);
    const reaction = reactionFor(here, faction);
    if (reaction) return reaction;
  }
  return null;
}

// 该格相邻的派系列表（界面画共振连线/图例用），去重保序。
export function neighborFactions(grid, cellId) {
  const out = [];
  for (const nb of neighborsOf(cellId, ORTHO_DIRS)) {
    const faction = factionOf(sigilSlot(grid.cells[nb.id])?.defId);
    if (faction && !out.includes(faction)) out.push(faction);
  }
  return out;
}
