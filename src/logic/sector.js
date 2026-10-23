// 方位索敌：角色相对 4x4 近远区域，不是 16 个等角扇区
import { toRC } from './grid.js';
import { SECTOR_HALF_SIZE } from './constants.js';

const N = 4;

export function regionCenter(regionId, px, py, half = SECTOR_HALF_SIZE) {
  const { r, c } = toRC(regionId);
  const span = (half * 2) / N;
  return {
    x: px - half + (c + 0.5) * span,
    y: py - half + (r + 0.5) * span,
  };
}

export function regionOf(x, y, px, py, half = SECTOR_HALF_SIZE) {
  const span = (half * 2) / N;
  const dc = Math.floor((x - (px - half)) / span);
  const dr = Math.floor((y - (py - half)) / span);
  if (dr < 0 || dr >= N || dc < 0 || dc >= N) return null;
  return dr * N + dc;
}

// 只攻击本区域内的敌人；区域为空则朝区域中心空射，不跨区找敌
export function resolveTarget(cellId, player, enemies, half = SECTOR_HALF_SIZE) {
  const px = player.x;
  const py = player.y;
  let best = null;
  let bestD = Infinity;
  for (const e of enemies) {
    if (!e.alive) continue;
    const reg = regionOf(e.x, e.y, px, py, half);
    if (reg !== cellId) continue;
    const dx = e.x - px;
    const dy = e.y - py;
    const d = dx * dx + dy * dy;
    if (d < bestD || (d === bestD && best && e.id < best.id)) {
      bestD = d;
      best = e;
    }
  }
  if (best) {
    return { target: best, aim: { x: best.x, y: best.y }, empty: false };
  }
  return { target: null, aim: regionCenter(cellId, px, py, half), empty: true };
}
