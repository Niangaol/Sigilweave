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

// 优先本区域最近敌人；区域为空时补射“离本区中心最近的敌人”（方向辅助），
// 一个敌人都没有才朝区域中心空射。补射会在返回值里标记 assisted，便于统计。
export function resolveTarget(cellId, player, enemies, half = SECTOR_HALF_SIZE, options = {}) {
  const { assist = true } = options;
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
  if (assist) {
    const center = regionCenter(cellId, px, py, half);
    let near = null;
    let nearD = Infinity;
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = (e.x - center.x) ** 2 + (e.y - center.y) ** 2;
      if (d < nearD || (d === nearD && near && e.id < near.id)) { nearD = d; near = e; }
    }
    if (near) return { target: near, aim: { x: near.x, y: near.y }, empty: false, assisted: true };
  }
  return { target: null, aim: regionCenter(cellId, px, py, half), empty: true, assisted: false };
}
