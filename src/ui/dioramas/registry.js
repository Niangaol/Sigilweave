// 七幕布景注册表：每一幕 = 一条「远景/中景/近景」三层静态画 + 一组归一化锚点。
// 锚点是所有事件特效的落点（符环中心、门洞、祭坛、王座、锻炉…），用 0..1 的归一化坐标写，
// 由 dioramaLayout 换算成当前画布像素——这样横屏 480×270 与竖屏 480×760 用同一份布景数据。
import * as act1 from './act1.js';
import * as act2 from './act2.js';
import * as act3 from './act3.js';
import * as act4 from './act4.js';
import * as act5 from './act5.js';
import * as act6 from './act6.js';
import * as act7 from './act7.js';

// 单带静态预算：create 时只画一次，但仍要控制，否则切场首帧会卡。
export const BAND_BUDGET = { back: 1300, mid: 1300, fore: 900 };

// 幕色只允许上光源与事件高光；tint 是底色（大面积），accent 是光源（小面积）。
export const DIORAMAS = [
  null,
  { act: 1, id: 'graveyard', title: '荒废墓园', numeral: 'I', accent: 0xc9a227, tint: 0x332b4a, horizon: 0.4444, module: act1 },
  { act: 2, id: 'swamp-church', title: '腐沼教堂', numeral: 'II', accent: 0x7cc9a8, tint: 0x2b3a20, horizon: 0.47, module: act2 },
  { act: 3, id: 'star-court', title: '星陨王庭', numeral: 'III', accent: 0x7fd7ff, tint: 0x171b36, horizon: 0.46, module: act3 },
  { act: 4, id: 'library', title: '沉钟书库', numeral: 'IV', accent: 0x9fb4d8, tint: 0x1a1e2e, horizon: 0.49, module: act4 },
  { act: 5, id: 'court', title: '衡律法庭', numeral: 'V', accent: 0xcfd6e0, tint: 0x241f26, horizon: 0.50, module: act5 },
  { act: 6, id: 'forge', title: '熔星锻炉', numeral: 'VI', accent: 0xff8a4d, tint: 0x2a1814, horizon: 0.50, module: act6 },
  { act: 7, id: 'dawn-seat', title: '破晓之座', numeral: 'VII', accent: 0xffd98a, tint: 0x1a1630, horizon: 0.44, module: act7 },
];

export function getDiorama(act) {
  const n = Math.round(Number(act) || 1);
  return DIORAMAS[Math.max(1, Math.min(7, n))];
}

export const DIORAMA_BANDS = ['back', 'mid', 'fore'];

// 归一化锚点 → 画布像素。任何幕缺省锚点都退回「中央符环」，事件代码不用判空。
export function dioramaLayout(act, w, h) {
  const d = getDiorama(act);
  const tall = h > 400;
  const s = Math.min(w / 480, h / 270);
  const horizon = Math.round(h * (d.horizon ?? 0.6));
  const floorY = Math.round(h * 0.84);
  const src = d.module.anchors || {};
  const anchors = {};
  for (const key of Object.keys(src)) {
    const a = src[key];
    anchors[key] = {
      x: Math.round(a.x * w),
      y: Math.round(a.y * h),
      r: Math.round((a.r ?? 0.1) * Math.min(w, h)),
    };
  }
  if (!anchors.seal) anchors.seal = { x: Math.round(w / 2), y: Math.round(h * 0.45), r: Math.round(0.16 * Math.min(w, h)) };
  return { act: d.act, id: d.id, w, h, tall, scale: s, horizon, floorY, accent: d.accent, tint: d.tint, anchors };
}

// 画一条带。带函数可缺省（先做远景、后补近景），缺省即不画。
export function drawBand(act, band, g, layout) {
  const d = getDiorama(act);
  const fn = d.module[band];
  if (typeof fn !== 'function') return false;
  fn(g, layout);
  return true;
}
