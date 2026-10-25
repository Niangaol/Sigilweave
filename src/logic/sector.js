// 方位索敌：角色相对的 4×4 区域，且覆盖整张世界地图（不是只看屏幕内）。
// 旧版把区域做成固定的 ±120px 小方格，敌人在 140–520px 环上刷出后大多落在格子之外，
// 只有「本区域恰好空了」才靠补射命中，玩家感知就是「只打得着屏幕里的怪」。
// 现在每一列/行都是一条覆盖全图的无界条带：内 2×2 = 屏幕范围，外 12 条 = 屏幕外。
import { toRC } from './grid.js';
import { SECTOR_SCREEN_HALF_W, SECTOR_SCREEN_HALF_H, SECTOR_FAR_X, SECTOR_FAR_Y } from './constants.js';

const N = 4;

// 列：0 屏左外 / 1 左半屏 / 2 右半屏 / 3 屏右外
function colOf(x, px) {
  if (x < px - SECTOR_SCREEN_HALF_W) return 0;
  if (x < px) return 1;
  if (x < px + SECTOR_SCREEN_HALF_W) return 2;
  return 3;
}

// 行：0 屏上外 / 1 上半屏 / 2 下半屏 / 3 屏下外
function rowOf(y, py) {
  if (y < py - SECTOR_SCREEN_HALF_H) return 0;
  if (y < py) return 1;
  if (y < py + SECTOR_SCREEN_HALF_H) return 2;
  return 3;
}

// 任何坐标都必属于一个区域：不会再有「敌人不在任何区域里」的漏网情况。
export function regionOf(x, y, px, py) {
  return rowOf(y, py) * N + colOf(x, px);
}

// 区域参考点：内区取屏幕半区中心，外区取屏幕外一侧的固定距离，用于空区补射的方向。
export function regionCenter(regionId, px, py) {
  const { r, c } = toRC(regionId);
  const cx = c === 0 ? px - SECTOR_FAR_X
    : c === 1 ? px - SECTOR_SCREEN_HALF_W / 2
      : c === 2 ? px + SECTOR_SCREEN_HALF_W / 2
        : px + SECTOR_FAR_X;
  const cy = r === 0 ? py - SECTOR_FAR_Y
    : r === 1 ? py - SECTOR_SCREEN_HALF_H / 2
      : r === 2 ? py + SECTOR_SCREEN_HALF_H / 2
        : py + SECTOR_FAR_Y;
  return { x: cx, y: cy };
}

// ---------- 割草「齐射」：一格一次打多个 ----------
// 设计动机：只打「本区域最近一只」时，玩家的清怪速度上限约 2 只/秒，刷怪一多就变成推不动的墙。
// 齐射让同一格在一次触发里对区域内最近的 N 个敌人各打一发，清怪速度随密度线性上升，才有割草感。
// 各结算类型的 N 不同（单体 3、扇形/连锁/贯穿 2、回声/区域 1），见 VOLLEY_LIMITS。
export const VOLLEY_LIMITS = Object.freeze({
  single: 3, fan3: 2, chain: 2, pierce: 2, echo: 1, ward: 0, area: 1,
});
export function volleyLimit(kind) {
  return Number.isInteger(VOLLEY_LIMITS[kind]) ? VOLLEY_LIMITS[kind] : 1;
}

// 取本区域最近的 N 个敌人（按距离、再按 id 升序，结果确定）。
// 区域里一个敌人都没有时回退成 resolveTarget：保留补射/空射行为，不让齐射把空区的指向提示弄丢。
export function resolveVolley(cellId, player, enemies, options = {}) {
  const limit = Number.isFinite(options.maxTargets)
    ? Math.max(1, Math.min(8, Math.floor(options.maxTargets)))
    : 3;
  const px = player.x;
  const py = player.y;
  const picked = [];
  for (const e of enemies) {
    if (!e || !e.alive) continue;
    if (regionOf(e.x, e.y, px, py) !== cellId) continue;
    const dx = e.x - px;
    const dy = e.y - py;
    picked.push({ e, d2: dx * dx + dy * dy });
  }
  if (!picked.length) {
    const one = resolveTarget(cellId, player, enemies, options);
    return {
      targets: one.target ? [one.target] : [],
      aims: [one.aim],
      empty: one.empty,
      assisted: !!one.assisted,
    };
  }
  picked.sort((a, b) => a.d2 - b.d2 || ((a.e.id ?? 0) - (b.e.id ?? 0)));
  const chosen = picked.slice(0, limit);
  return {
    targets: chosen.map((p) => p.e),
    aims: chosen.map((p) => ({ x: p.e.x, y: p.e.y })),
    empty: false,
    assisted: false,
  };
}

// 优先打本区域最近敌人；区域为空时补射「离本区参考点最近的敌人」，
// 一个敌人都没有才朝参考点空射。补射会在返回值里标记 assisted，便于统计。
export function resolveTarget(cellId, player, enemies, options = {}) {
  const { assist = true } = options;
  const px = player.x;
  const py = player.y;
  let best = null;
  let bestD = Infinity;
  for (const e of enemies) {
    if (!e || !e.alive) continue;
    if (regionOf(e.x, e.y, px, py) !== cellId) continue;
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
    const center = regionCenter(cellId, px, py);
    let near = null;
    let nearD = Infinity;
    for (const e of enemies) {
      if (!e || !e.alive) continue;
      const d = (e.x - center.x) ** 2 + (e.y - center.y) ** 2;
      if (d < nearD || (d === nearD && near && e.id < near.id)) { nearD = d; near = e; }
    }
    if (near) return { target: near, aim: { x: near.x, y: near.y }, empty: false, assisted: true };
  }
  return { target: null, aim: regionCenter(cellId, px, py), empty: true, assisted: false };
}
