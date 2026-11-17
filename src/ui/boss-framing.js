// Boss 战取景：镜头要为大立绘抬起来，但不能把玩家顶出画面下沿。
// 背景（2026-11-17 用户报「打 Boss 时角色和 Boss 都不在屏幕里」）：
// 跟随偏移是叠加的——横屏基准 CAMERA_LIFT=50 再加上 Boss 取景 80，玩家会被推到
// 屏幕 y≈265（270 高的视口），再被 40 高的跟随死区吃掉 20px 就整只掉出画面。
// 这里把「抬头量」算成可测的数：先按 Boss 头顶需要多少，再夹在「玩家安全线」以内。

export const DEFAULT_VIEW_H = 270;
export const DEFAULT_DEADZONE_H = 40;
export const PLAYER_SAFE_MARGIN = 26;   // 玩家中心离画面下沿至少这么多
export const BOSS_SAFE_MARGIN = 10;     // Boss 头顶离 HUD 下沿至少这么多

// 跟随偏移上限：超过这个值，玩家中心就会被死区带到画面外。
export function followOffsetLimit(viewH = DEFAULT_VIEW_H, deadzoneH = DEFAULT_DEADZONE_H) {
  return Math.max(0, viewH / 2 - deadzoneH / 2 - PLAYER_SAFE_MARGIN);
}

// 把任意偏移夹进安全区间（正负对称）。
export function clampFollowOffset(total, viewH = DEFAULT_VIEW_H, deadzoneH = DEFAULT_DEADZONE_H) {
  const limit = followOffsetLimit(viewH, deadzoneH);
  if (!Number.isFinite(total)) return 0;
  return Math.max(-limit, Math.min(limit, total));
}

// Boss 战该抬多少：让 Boss 头顶落在 hudBottom 以下，同时不超过玩家安全线。
// 返回的 limited 为 true 表示「Boss 装不下，只能优先保证玩家可见」。
export function bossFrameOffset({
  viewH = DEFAULT_VIEW_H,
  deadzoneH = DEFAULT_DEADZONE_H,
  baseOffset = 0,
  playerY = 0,
  bossTop = 0,
  hudBottom = 40,
} = {}) {
  const need = hudBottom + BOSS_SAFE_MARGIN - viewH / 2 - bossTop + playerY;
  const want = Math.max(baseOffset, Number.isFinite(need) ? need : baseOffset);
  const offset = clampFollowOffset(want, viewH, deadzoneH);
  return { offset, limited: want > offset + 0.5 };
}

// 玩家在不在画面里（留一点内缩，避免「贴着边缘算看不见」）。
export function playerVisible(player, view, margin = 8) {
  if (!player || !view || !Number.isFinite(view.x) || !Number.isFinite(view.w)) return true;
  return player.x >= view.x + margin && player.x <= view.x + view.w - margin
    && player.y >= view.y + margin && player.y <= view.y + view.h - margin;
}

// Boss 拴绳：Boss 追不上玩家时会停在原地放招，玩家一跑开它就整只留在画面外。
// 这里把它夹回画面（留 margin），既能看见血条，也不影响它的招式落点。
export function leashIntoView(entity, view, marginX = 22, marginY = 18) {
  if (!entity || !view || !Number.isFinite(view.x) || !Number.isFinite(view.w)) return false;
  const minX = view.x + marginX, maxX = view.x + view.w - marginX;
  const minY = view.y + marginY, maxY = view.y + view.h - marginY;
  const nx = Math.max(minX, Math.min(maxX, entity.x));
  const ny = Math.max(minY, Math.min(maxY, entity.y));
  if (nx === entity.x && ny === entity.y) return false;
  entity.x = nx; entity.y = ny;
  return true;
}
