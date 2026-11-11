// 方位索敌：角色相对的 4×4 区域，每一列/行都是一条覆盖全图的无界条带
// （内 2×2 = 屏幕范围，外 12 条 = 屏幕外方向），这样任何坐标都必属于一个区域。
// 注意：区域只决定「朝哪个方位」，是否可选还要过屏幕可见性（options.view）：
// 屏外的怪即使落在本区域条带里也不会被锁定，避免法术提前飞向屏幕外。
import { toRC } from './grid.js';
import { SECTOR_SCREEN_HALF_W, SECTOR_SCREEN_HALF_H, SECTOR_FAR_X, SECTOR_FAR_Y } from './constants.js';

const N = 4;

// ---------- 屏幕可见性：索敌只看摄像机视口 ----------
// 2026-11-09：玩家反馈「会打屏幕外的小怪」。旧版把 16 条带铺满整张世界地图，
// 这种「全覆盖」让远处还没进屏的怪被提前锁定，玩家只看见法术飞向屏幕外。
// 现在统一以摄像机视口（worldView，含 zoom / 竖屏 offset / 死区）作为「屏幕内」的唯一标准：
// 身体只要有一部分在视口里就可选，完全在屏外的怪一律不锁，等它走进来再打。
// options.view 缺省时保持旧行为，纯逻辑/单测/非战斗调用方不受影响。
export function normalizeView(view) {
  if (!view || typeof view !== 'object') return null;
  const x = Number(view.x);
  const y = Number(view.y);
  const w = Number(view.w ?? view.width);
  const h = Number(view.h ?? view.height);
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
  return { left: x, top: y, right: x + w, bottom: y + h };
}

// 敌人占屏矩形：优先用实体给的视觉外框（精灵比逻辑半径高得多，脚在逻辑点上、身体向上长），
// 缺省回退成逻辑半径的外接方框。纯数据，便于单测。
export function enemyScreenRect(enemy) {
  const ext = enemy?.viewExtent;
  if (ext && [ext.left, ext.right, ext.top, ext.bottom].every(Number.isFinite)) {
    return {
      left: enemy.x + ext.left, right: enemy.x + ext.right,
      top: enemy.y + ext.top, bottom: enemy.y + ext.bottom,
    };
  }
  const r = Number.isFinite(enemy?.radius) ? Math.max(0, enemy.radius) : 0;
  return { left: enemy.x - r, right: enemy.x + r, top: enemy.y - r, bottom: enemy.y + r };
}

function onScreen(enemy, view) {
  if (!view) return true;
  if (!enemy || !Number.isFinite(enemy.x) || !Number.isFinite(enemy.y)) return false;
  const r = enemyScreenRect(enemy);
  return r.right >= view.left && r.left <= view.right && r.bottom >= view.top && r.top <= view.bottom;
}

export function isEnemyOnScreen(enemy, view) {
  return onScreen(enemy, normalizeView(view));
}

// 归一化一次、反复判断：伤害结算里一帧要过滤几十只怪，避免每次都解析视口矩形。
export function visibleFilter(view) {
  const v = normalizeView(view);
  if (!v) return () => true;
  return (enemy) => onScreen(enemy, v);
}

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
  const v = normalizeView(options.view);
  const picked = [];
  for (const e of enemies) {
    if (!e || !e.alive) continue;
    if (!onScreen(e, v)) continue;
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
  // 只锁屏幕内的怪：屏外怪再近也不算候选（assist 补射同理，不能借补射打到屏外）
  const v = normalizeView(options.view);
  let best = null;
  let bestD = Infinity;
  for (const e of enemies) {
    if (!e || !e.alive) continue;
    if (!onScreen(e, v)) continue;
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
      if (!onScreen(e, v)) continue;
      const d = (e.x - center.x) ** 2 + (e.y - center.y) ** 2;
      if (d < nearD || (d === nearD && near && e.id < near.id)) { nearD = d; near = e; }
    }
    if (near) return { target: near, aim: { x: near.x, y: near.y }, empty: false, assisted: true };
  }
  return { target: null, aim: regionCenter(cellId, px, py), empty: true, assisted: false };
}
