// 敌人移动工具：取整/夹紧、读边界与自身、接近与环带走位、锁定瞄准快照。
// 从 logic/enemy-ai.js 拆出（2026-11-19 架构重构波 4）。
import { DEFAULT_BATTLE } from '../../data/enemy-tables.js';
import { nextRandom } from './rng.js';

const COORD_LIMIT = 1e6;

export function finiteOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function clampCoord(value) {
  return Math.max(-COORD_LIMIT, Math.min(COORD_LIMIT, value));
}

export function finitePoint(point) {
  return point !== null && typeof point === 'object'
    && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y));
}

export function unitVector(dx, dy) {
  const len = Math.hypot(dx, dy);
  if (!Number.isFinite(len) || len < 1e-6) return null;
  return { x: dx / len, y: dy / len };
}

export function readBounds(opts) {
  const raw = opts && (opts.BATTLE ?? opts.bounds);
  const source = raw && typeof raw === 'object' ? raw : DEFAULT_BATTLE;
  let left = finiteOr(source.left, DEFAULT_BATTLE.left);
  let right = finiteOr(source.right, DEFAULT_BATTLE.right);
  let top = finiteOr(source.top, DEFAULT_BATTLE.top);
  let bottom = finiteOr(source.bottom, DEFAULT_BATTLE.bottom);
  if (left >= right) { left = DEFAULT_BATTLE.left; right = DEFAULT_BATTLE.right; }
  if (top >= bottom) { top = DEFAULT_BATTLE.top; bottom = DEFAULT_BATTLE.bottom; }
  return { left, right, top, bottom };
}

export function readSelf(self, brain, bounds) {
  const fallbackX = Number.isFinite(brain.x) ? brain.x : (bounds.left + bounds.right) / 2;
  const fallbackY = Number.isFinite(brain.y) ? brain.y : (bounds.top + bounds.bottom) / 2;
  const x = clampCoord(finiteOr(self?.x, fallbackX));
  const y = clampCoord(finiteOr(self?.y, fallbackY));
  const speed = Math.max(0, finiteOr(self?.speed, 0));
  const radius = Math.max(0, finiteOr(self?.radius, 0));
  return { x, y, speed, radius };
}

export function readPlayer(player, self) {
  return {
    x: clampCoord(finiteOr(player?.x, self.x)),
    y: clampCoord(finiteOr(player?.y, self.y)),
    radius: Math.max(0, finiteOr(player?.radius, 0)),
    // 提前量要用的速度分量；没有时按静止处理（leadAim 会退化为直指当前位置）
    vx: finiteOr(player?.vx, 0),
    vy: finiteOr(player?.vy, 0),
  };
}

export function clampToBounds(point, bounds) {
  point.x = Math.min(bounds.right, Math.max(bounds.left, point.x));
  point.y = Math.min(bounds.bottom, Math.max(bounds.top, point.y));
}

export function approach(brain, ctx, mul = 1) {
  const { self, player, dt, bounds } = ctx;
  const dir = unitVector(player.x - self.x, player.y - self.y);
  if (dir) {
    brain.x = self.x + dir.x * self.speed * mul * (dt / 1000);
    brain.y = self.y + dir.y * self.speed * mul * (dt / 1000);
  } else {
    brain.x = self.x;
    brain.y = self.y;
  }
  clampToBounds(brain, bounds);
}

export function holdBand(brain, ctx, tune) {
  const { self, player, dt, bounds } = ctx;
  const dx = player.x - self.x;
  const dy = player.y - self.y;
  const dist = Math.hypot(dx, dy);
  const nx = dist > 1e-6 ? dx / dist : 0;
  const ny = dist > 1e-6 ? dy / dist : 1;
  const holdDist = finiteOr(tune?.holdDist, 110);
  const retreatDist = finiteOr(tune?.retreatDist, holdDist * 0.7);
  const orbitMul = finiteOr(tune?.orbitMul, 0.6);
  let vx = 0;
  let vy = 0;
  if (dist < retreatDist) {
    // 贴身：沿反方向退开
    vx = -nx * self.speed * 1.1;
    vy = -ny * self.speed * 1.1;
  } else {
    const radial = Math.max(-self.speed, Math.min(self.speed, (dist - holdDist) * 2.2));
    const tangential = self.speed * orbitMul * (brain.orbitDir < 0 ? -1 : 1);
    vx = -ny * tangential + nx * radial;
    vy = nx * tangential + ny * radial;
    const mag = Math.hypot(vx, vy);
    const cap = self.speed * 1.15;
    if (mag > cap && mag > 0) { vx = (vx / mag) * cap; vy = (vy / mag) * cap; }
  }
  brain.x = self.x + vx * (dt / 1000);
  brain.y = self.y + vy * (dt / 1000);
  clampToBounds(brain, bounds);
}

export function lockAim(brain, ctx) {
  brain.aim = { x: ctx.player.x, y: ctx.player.y };
}

