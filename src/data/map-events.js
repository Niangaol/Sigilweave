// 共振法阵 · 地图事件点（纯逻辑，无渲染/场景依赖）
//
// 五幕七场：每「场」一张固定世界（尺寸见 src/logic/constants.js 的 WORLD_SIZES，
// 键为 w/h）。场 1-3（前三个独立幕）各 1 个 NPC + 4 个小 Boss；场 4-7（第四、五幕
// 各拆两段）各 1 个 NPC + 2 个小 Boss。NPC 遭遇与小 Boss 以「事件点」布置在世界中；
// 玩家走近（距离 ≤ radius）时由场景调用 findTriggeredPoint 触发对应遭遇。
//
// 布置约束（tests/map-events.test.js 全量自校验）：
//   1. 场 1-3 恰好 1 个 NPC 点 + 4 个小 Boss 点，场 4-7 恰好 1 + 2；
//   2. 距地图边缘 ≥ 80px；
//   3. 点与点互相距离 ≥ 400px（不会一脚踏进两个点）；
//   4. 距地图中心（世界出生区）> 240px（出生不误触）。
//
// 实现方式：每场手工标定「象限锚点比例」，乘以传入世界尺寸得像素坐标。
// 锚点按合法世界最小尺寸 1600×1600 校准过最坏情况（比例坐标下，最坏情形
// 就出现在宽高同时取最小值时），因此对任意合法 world（宽高 ≥ 1600）都满足
// 上述约束；同场 + 同 world 输出完全确定。

// 事件点 id 与 src/logic/acts.js 的 minorBossIdsOfStage / encounterIdsOfStage 对齐。
import { isValidStage, minorBossIdsOfStage } from '../logic/acts.js';

export const POINT_RADIUS = 34;        // 事件点触发半径（px）
export const EDGE_MARGIN = 80;         // 距地图边缘最小距离（px）
export const MIN_SPACING = 400;        // 事件点互相最小间距（px）
export const MIN_SPAWN_DISTANCE = 240; // 距地图中心（出生区）最小距离（严格大于）
export const MIN_WORLD_SIZE = 1600;    // 合法世界最小宽高（px）

// 每场主题：NPC / 小 Boss 名（与 encounters.js 的场次主题对应）
// 以及各点位的 UI 提示语（走近时展示，制造探索感）。
// 场 1-3 四点，场 4-7 两点；后四场的文案沿用原七幕后四幕。
const STAGE_THEMES = {
  1: {
    npcName: '艾琳',
    minibossName: '守墓傀儡',
    hints: {
      npc: '一座半开的石门，门缝里漏出银白色的灯火',
      minibossA: '坍塌的墓穴前，石像傀儡正在无风自动',
      minibossB: '成排的无字墓碑之间，两盏绿火在缓缓移动',
      minibossC: '墓园西侧的枯柏间，新翻的泥土还冒着白气',
      minibossD: '北坡的草亭前，一盏旧灯台倒在积灰里，火苗还亮着',
    },
  },
  2: {
    npcName: '瑟维安',
    minibossName: '腐沼巨尸',
    hints: {
      npc: '被藤蔓缠住的教堂侧廊，传来退潮般的诵经声',
      minibossA: '沉钟池的水面下，浮着一具缓慢挪动的巨影',
      minibossB: '腐沼深处的芦苇丛正被什么东西从内部撑开',
      minibossC: '教堂后殿只剩窗框，藤蔓顺着框沿一直垂进水里',
      minibossD: '西岸的木栈道泡在浑水里，只露出几块发黑的踏板',
    },
  },
  3: {
    npcName: '莉芙拉',
    minibossName: '裂瞳主教',
    hints: {
      npc: '倾颓的王座阶前，星屑绕着一位织衣的身影盘旋',
      minibossA: '断裂的彩窗之后，一只竖瞳在阴影里眨动',
      minibossB: '星陨回廊的尽头，两尊主教石像共用同一双眼睛',
      minibossC: '王庭东面的观星台塌了半边，栏杆上还嵌着星屑',
      minibossD: '中庭枯井边堆着碎裂的星石，井口正往上渗着光',
    },
  },
  4: {
    npcName: '梅薇',
    minibossName: '缄默书吏',
    hints: {
      npc: '一排高到看不见顶的书架之间，有人正借着铜钟的微光抄经',
      minibossA: '借阅厅的柜台后，一本翻开的书自己翻了一页',
      minibossB: '断页厅的地上散着纸屑，一册残书悬在半空',
    },
  },
  5: {
    npcName: '奥菲',
    minibossName: '铁面陪审',
    hints: {
      npc: '法庭的书记席上，羽毛笔在无人时自己记录',
      minibossA: '东席陪审团的席位后，一排铁面具同时转向你',
      minibossB: '西席的断秤悬在梁上，秤盘还在轻轻晃动',
    },
  },
  6: {
    npcName: '铎恩',
    minibossName: '淬火傀儡',
    hints: {
      npc: '炉膛的白火旁，铸星者正把一块星铁翻面',
      minibossA: '淬火池冒着白汽，池底有什么东西缓缓立起',
      minibossB: '铁砧旁悬着一柄没人握的巨锤，正在自己起落',
    },
  },
  7: {
    npcName: '黎恩',
    minibossName: '残星骑士',
    hints: {
      npc: '断裂的王座前，守望者数着天上第七颗星',
      minibossA: '星桥中央，一名骑士的盾上钉着七枚星钉',
      minibossB: '晓色门前，七盏灯只亮着三盏',
    },
  },
};

// 手工标定的象限锚点 [fx, fy]（比例坐标，乘世界宽高得像素坐标）。
// 场 1-3 五点铺开、场 4-7 三点分居三个不同象限；各场锚点比例互不相同。
// 场 1-3 这套比例已按 1600×1600 最坏情况验算：任意两点间距 ≥ 400、
// 距边缘 ≥ 80、距出生区 > 240。
const STAGE_LAYOUTS = {
  // 场 1：NPC 中上，四角各一只小 Boss
  1: {
    npc: [0.5, 0.14],
    minibossA: [0.18, 0.3],
    minibossB: [0.82, 0.3],
    minibossC: [0.22, 0.78],
    minibossD: [0.78, 0.78],
  },
  // 场 2：NPC 中下，上排两只 + 中排两只
  2: {
    npc: [0.5, 0.84],
    minibossA: [0.16, 0.22],
    minibossB: [0.84, 0.22],
    minibossC: [0.16, 0.56],
    minibossD: [0.84, 0.56],
  },
  // 场 3：NPC 左上，右上 / 右下 / 左下各一只 + 中下一只
  3: {
    npc: [0.22, 0.16],
    minibossA: [0.78, 0.2],
    minibossB: [0.8, 0.62],
    minibossC: [0.18, 0.62],
    minibossD: [0.5, 0.86],
  },
  4: { npc: [0.2, 0.76], minibossA: [0.78, 0.2], minibossB: [0.26, 0.2] }, // 左下 / 右上 / 左上
  5: { npc: [0.24, 0.24], minibossA: [0.8, 0.78], minibossB: [0.78, 0.22] }, // 左上 / 右下 / 右上
  6: { npc: [0.76, 0.24], minibossA: [0.2, 0.2], minibossB: [0.26, 0.76] }, // 右上 / 左上 / 左下
  7: { npc: [0.2, 0.24], minibossA: [0.8, 0.2], minibossB: [0.24, 0.78] }, // 左上 / 右上 / 左下
};

// 解析世界尺寸：接受 {w,h}（WORLD_SIZES 的形状）或 {width,height} 别名；
// 非对象 / 宽高缺失 / 非有限数值 / 宽高 < MIN_WORLD_SIZE 一律视为非法，返回 null。
function worldDimensions(world) {
  if (world === null || typeof world !== 'object' || Array.isArray(world)) return null;
  const w = world.w ?? world.width;
  const h = world.h ?? world.height;
  if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
  if (w < MIN_WORLD_SIZE || h < MIN_WORLD_SIZE) return null;
  return { w, h };
}

// 单个事件点：比例锚点 → 像素坐标（四舍五入），统一挂上半径与提示语。
function makePoint(id, type, name, anchor, hint, dims) {
  return {
    id,
    type,
    name,
    x: Math.round(anchor[0] * dims.w),
    y: Math.round(anchor[1] * dims.h),
    radius: POINT_RADIUS,
    hint,
  };
}

// 返回某一场的事件点数组：场 1-3 为 [npc-<s>, miniboss-<s>a..d] 五点，
// 场 4-7 为 [npc-<s>, miniboss-<s>a, miniboss-<s>b] 三点。
// id 直接取自 acts.js 的 minorBossIdsOfStage，保证与遭遇表逐条对齐。
// stage 非法（非 1-7 整数）或 world 非法时返回 []。
export function getEventPoints(stage, world) {
  if (!isValidStage(stage)) return [];
  const dims = worldDimensions(world);
  if (!dims) return [];
  const theme = STAGE_THEMES[stage];
  const layout = STAGE_LAYOUTS[stage];
  const points = [
    makePoint('npc-' + stage, 'npc', theme.npcName, layout.npc, theme.hints.npc, dims),
  ];
  for (const id of minorBossIdsOfStage(stage)) {
    const suffix = id.slice(('miniboss-' + stage).length); // 'a'..'d'
    const key = 'miniboss' + suffix.toUpperCase();          // 'minibossA'..'minibossD'
    points.push(makePoint(id, 'miniboss', theme.minibossName, layout[key], theme.hints[key], dims));
  }
  return points;
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
