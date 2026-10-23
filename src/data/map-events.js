// 共振法阵 · 地图事件点（纯逻辑，无渲染/场景依赖）
//
// 大地图方案：每幕一张固定世界（尺寸见 src/logic/constants.js 的 WORLD_SIZES，
// 键为 w/h），NPC 遭遇与两波小 Boss 以「事件点」布置在世界中；玩家走近
// （距离 ≤ radius）时由场景调用 findTriggeredPoint 触发对应遭遇。
//
// 布置约束（tests/map-events.test.js 全量自校验）：
//   1. 每幕恰好 1 个 NPC 点 + 2 个小 Boss 点，分居三个不同象限（探索感）；
//   2. 距地图边缘 ≥ 80px；
//   3. 三点互相距离 ≥ 400px（不会一脚踏进两个点）；
//   4. 距地图中心（世界出生区）> 240px（出生不误触）。
//
// 实现方式：每幕手工标定三个「象限锚点比例」，乘以传入世界尺寸得像素坐标。
// 锚点按合法世界最小尺寸 800×800 校准过最坏情况并留有余量，因此对任意合法
// world（宽高 ≥ 800）都满足上述约束；同 act + 同 world 输出完全确定。

const POINT_RADIUS = 28;        // 事件点触发半径（px）
const EDGE_MARGIN = 80;         // 距地图边缘最小距离（px）
const MIN_SPACING = 400;        // 事件点互相最小间距（px）
const MIN_SPAWN_DISTANCE = 240; // 距地图中心（出生区）最小距离（严格大于）
const MIN_WORLD_SIZE = 800;     // 合法世界最小宽高（px）

// 每幕主题：NPC / 小 Boss 名（与 encounters.js 的灰烬墓园-腐沼教堂-星陨王庭对应）
// 以及三个点位的 UI 提示语（走近时展示，制造探索感）。
const ACT_THEMES = {
  1: {
    npcName: '艾琳',
    minibossName: '守墓傀儡',
    hints: {
      npc: '一座半开的石门，门缝里漏出银白色的灯火',
      minibossA: '坍塌的墓穴前，石像傀儡正在无风自动',
      minibossB: '成排的无字墓碑之间，两盏绿火在缓缓移动',
    },
  },
  2: {
    npcName: '瑟维安',
    minibossName: '腐沼巨尸',
    hints: {
      npc: '被藤蔓缠住的教堂侧廊，传来退潮般的诵经声',
      minibossA: '沉钟池的水面下，浮着一具缓慢挪动的巨影',
      minibossB: '腐沼深处的芦苇丛正被什么东西从内部撑开',
    },
  },
  3: {
    npcName: '莉芙拉',
    minibossName: '裂瞳主教',
    hints: {
      npc: '倾颓的王座阶前，星屑绕着一位织衣的身影盘旋',
      minibossA: '断裂的彩窗之后，一只竖瞳在阴影里眨动',
      minibossB: '星陨回廊的尽头，两尊主教石像共用同一双眼睛',
    },
  },
};

// 手工标定的象限锚点 [fx, fy]（比例坐标，乘世界宽高得像素坐标）。
// 每幕三点分居三个不同象限，三幕的锚点比例互不相同。
const ACT_LAYOUTS = {
  1: { npc: [0.2, 0.22], minibossA: [0.76, 0.18], minibossB: [0.24, 0.74] }, // 左上 / 右上 / 左下
  2: { npc: [0.78, 0.26], minibossA: [0.18, 0.72], minibossB: [0.74, 0.78] }, // 右上 / 左下 / 右下
  3: { npc: [0.74, 0.76], minibossA: [0.22, 0.2], minibossB: [0.78, 0.24] }, // 右下 / 左上 / 右上
};

// 解析世界尺寸：接受 {w,h}（WORLD_SIZES 的形状）或 {width,height} 别名；
// 非对象 / 宽高缺失 / 非有限数值 / 宽高 < 800 一律视为非法，返回 null。
function worldDimensions(world) {
  if (world === null || typeof world !== 'object' || Array.isArray(world)) return null;
  const w = world.w ?? world.width;
  const h = world.h ?? world.height;
  if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
  if (w < MIN_WORLD_SIZE || h < MIN_WORLD_SIZE) return null;
  return { w, h };
}

// 返回某一幕的事件点数组：[npc-<act>, miniboss-<act>-a, miniboss-<act>-b]。
// act 非法（非 1/2/3 整数）或 world 非法时返回 []。
export function getEventPoints(act, world) {
  if (!Number.isInteger(act) || act < 1 || act > 3) return [];
  const dims = worldDimensions(world);
  if (!dims) return [];
  const theme = ACT_THEMES[act];
  const layout = ACT_LAYOUTS[act];
  return [
    {
      id: 'npc-' + act,
      type: 'npc',
      name: theme.npcName,
      x: Math.round(layout.npc[0] * dims.w),
      y: Math.round(layout.npc[1] * dims.h),
      radius: POINT_RADIUS,
      hint: theme.hints.npc,
    },
    {
      id: 'miniboss-' + act + '-a',
      type: 'miniboss',
      name: theme.minibossName,
      x: Math.round(layout.minibossA[0] * dims.w),
      y: Math.round(layout.minibossA[1] * dims.h),
      radius: POINT_RADIUS,
      hint: theme.hints.minibossA,
    },
    {
      id: 'miniboss-' + act + '-b',
      type: 'miniboss',
      name: theme.minibossName,
      x: Math.round(layout.minibossB[0] * dims.w),
      y: Math.round(layout.minibossB[1] * dims.h),
      radius: POINT_RADIUS,
      hint: theme.hints.minibossB,
    },
  ];
}

// 返回数组序中第一个「与 (x,y) 距离 ≤ radius」的事件点；无命中或输入非法返回 null。
// 距离用平方比较避免开方误差；畸形点（null / 坐标非数值）跳过，缺 radius 按半径 0 处理。
export function findTriggeredPoint(points, x, y) {
  if (!Array.isArray(points)) return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  for (const point of points) {
    if (point === null || typeof point !== 'object') continue;
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const radius = Number.isFinite(point.radius) ? point.radius : 0;
    const dx = point.x - x;
    const dy = point.y - y;
    if (dx * dx + dy * dy <= radius * radius) return point;
  }
  return null;
}
