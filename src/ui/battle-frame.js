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
