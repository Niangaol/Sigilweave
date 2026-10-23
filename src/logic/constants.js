// 共振法阵 · 全局常量（冻结值见 docs/规则契约.md）
export const GRID_N = 4;
export const CELL_COUNT = GRID_N * GRID_N;

// 方向向量：dr 为行增量，dc 为列增量
export const DIRS = {
  up: { dr: -1, dc: 0 },
  down: { dr: 1, dc: 0 },
  left: { dr: 0, dc: -1 },
  right: { dr: 0, dc: 1 },
  upleft: { dr: -1, dc: -1 },
  upright: { dr: -1, dc: 1 },
  downleft: { dr: 1, dc: -1 },
  downright: { dr: 1, dc: 1 },
};
export const ORTHO_DIRS = ['up', 'down', 'left', 'right'];
export const DIAG_DIRS = ['upleft', 'upright', 'downleft', 'downright'];
export const ALL_DIRS = [...ORTHO_DIRS, ...DIAG_DIRS];

// 位置化冷却（毫秒）：角 0.8s / 边 1.1s / 中心 2.2s
export const POSITION_COOLDOWN = { corner: 800, edge: 1100, center: 2200 };
export const INTERVAL_FLOOR_MS = 500;
export const COOLDOWN_FLOOR_MS = 600;

// 共鸣石：对正交四邻的间隔与冷却同时乘算 -25%
export const RESONANCE_FACTOR = 0.75;

// 三幕参数
export const ACTS = [
  { act: 1, baseIntervalMs: 1400, starts: 2, unlocked: 6 },
  { act: 2, baseIntervalMs: 1200, starts: 3, unlocked: 12 },
  { act: 3, baseIntervalMs: 1000, starts: 3, unlocked: 16 },
];

export const MAX_REROUTE = 2;          // 冷却受阻最多改道两次
export const EXPLORE_PATIENCE = 6;     // 连续 6 跳未踩新格触发探索保底
export const COMBO_WINDOW_FACTOR = 1.4;

// 方位索敌：角色相对 4x4 近远区域的半边长（像素）
export const SECTOR_HALF_SIZE = 120;

// 大地图：每幕一张固定世界（像素），屏幕逻辑分辨率仍 480×270，摄像机跟随
export const WORLD_SIZES = Object.freeze({
  1: { w: 1920, h: 1440 },
  2: { w: 2400, h: 1600 },
  3: { w: 2400, h: 1800 },
});
