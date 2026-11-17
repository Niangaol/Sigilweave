// 共振法阵 · 战斗画面外框（雕花画框）
// 480×270 逻辑画布最外层一圈 8px 框体，框的形制随玩家血量陈旧化：
// 颜色向血色插值、裂纹逐档增加、低血改心跳脉动、掉碎屑、四角渗血。
// 时钟约定：所有动画读传进来的 now（调用方传 engine.now），暂停与顿帧会一起冻结。
import { C, pxRect } from './Palette.js';
import { Rng } from '../logic/rng.js';

// 几何：8px 框身由五层叠出来，加起来必须正好等于 band
export const FRAME = Object.freeze({
  band: 8,
  outer: 1,      // 外硬描边（outline）
  brassDark: 2,  // 黄铜暗部
  brass: 1,      // 黄铜亮棱
  stone: 3,      // 石质框身
  inner: 1,      // 内硬描边
  ornament: 14,  // 四角角花尺寸
  gem: 4,        // 角花内嵌菱形宝石
  beamW: 120,    // 上沿居中横梁
  beamH: 8,
  notchStep: 32, // 侧边竖向凹槽间距
});

// 内开口（可绘制区）：x 8..471、y 8..261
export const FRAME_INNER = Object.freeze({ left: 8, top: 8, right: 472, bottom: 262 });

// 三档框体状态。数值是设计文档 §3 的表，改这里等于改手感，别散落到别处。
const TONE = Object.freeze({
  intact: { tier: 'intact', breathHz: 0.30, pulseHz: 0, crackCount: 0, debrisPerSec: 0, seep: 0, bloodMix: 0 },
  worn: { tier: 'worn', breathHz: 0.20, pulseHz: 0, crackCount: 3, debrisPerSec: 0, seep: 0.35, bloodMix: 0.35 },
  failing: { tier: 'failing', breathHz: 0, pulseHz: 1.10, crackCount: 6, debrisPerSec: 0.9, seep: 1, bloodMix: 1 },
});

// 两条 0xRRGGBB 颜色按 t 线性插值；t 越界夹到 0..1，非数值当 0
export function mixColor(a, b, t) {
  const k = Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0;
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * k);
  const g = Math.round(ag + (bg - ag) * k);
  const bl = Math.round(ab + (bb - ab) * k);
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (bl & 0xff);
}

// 血量比例 -> 档位。非数值（maxHp 为 0 算出的 NaN / Infinity）按 0 处理，
// 落到破损档而不是抛错：血量读不出来时，画面宁可惨一点也别崩。
export function frameTone(ratio) {
  const r = Number.isFinite(ratio) ? ratio : 0;
  if (r > 0.6) return { ...TONE.intact };
  if (r > 0.3) return { ...TONE.worn };
  return { ...TONE.failing };
}

// 裂纹走位的四条边，按顺序轮转，6 条正好铺满两圈
const EDGE_ORDER = Object.freeze(['top', 'bottom', 'left', 'right']);

// 一条裂纹的骨架：从画布最外沿起笔，沿向内方向走 6~14px，
// 中途在一个像素上横向岔一格（裂缝的"拐"，也让画面不像梳子）。
// 返回 {edge, points:[{x,y}...]}，点与点之间都是 1px 的一步。
export function frameCracks(seed, count) {
  const n = Number.isFinite(count) ? Math.floor(count) : 0;
  if (n <= 0) return [];

  const head = new Rng(`frame-cracks:head:${seed}`);
  const firstEdge = head.int(4);
  const cracks = [];

  for (let i = 0; i < n; i++) {
    // 每条纹路独立取种子：档位从 3 条升到 6 条时，原有 3 条纹路位置不变
    const rng = new Rng(`frame-cracks:${seed}:${i}`);
    const edge = EDGE_ORDER[(firstEdge + i) % 4];
    // 沿边起点：横向边（上/下）有 480 的余量，竖向边（左/右）只有 270，两边分开取
    const horizontal = edge === 'top' || edge === 'bottom';
    const along = 12 + rng.int(horizontal ? 456 : 246);
    // 端点曼哈顿距离 = 向内步数 + 横向岔格 = (7..14-1) + 1 = 7..14
    const span = 7 + rng.int(8);
    const inwardSteps = span - 1;
    const jogAt = 1 + rng.int(Math.max(1, inwardSteps - 1));
    const jogDir = rng.int(2) === 0 ? 1 : -1;

    const points = [];
    for (let step = 0; step <= inwardSteps; step++) {
      points.push(toCanvas(edge, along, step));
      // 在 jogAt 这一步插入一个横向岔点，再回到原线上
      if (step === jogAt) points.push(toCanvas(edge, along + jogDir, step));
    }
    cracks.push({ edge, points });
  }

  return cracks;
}

// 把 (沿边位置, 向内深度) 换成画布坐标
function toCanvas(edge, along, inward) {
  if (edge === 'top') return { x: along, y: inward };
  if (edge === 'bottom') return { x: along, y: 269 - inward };
  if (edge === 'left') return { x: inward, y: along };
  return { x: 479 - inward, y: along };
}
