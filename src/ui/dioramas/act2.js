// 第2幕「腐沼教堂」布景（占位：Phase B 由专门任务替换成完整三层）。
// 锚点用 0..1 归一化坐标，注册表负责换算。
import { fill, floor, courses } from '../diorama-kit.js';
import { C } from '../Palette.js';

export const anchors = {
  seal: { x: 0.5, y: 0.42, r: 0.16 },
  gate: { x: 0.5, y: 0.58, r: 0.12 },
};

export function back(g, L) {
  courses(g, { x: 0, y: 0, w: L.w, h: L.horizon, rowH: 10, color: C.stoneDark, alpha: 0.9, light: C.stone });
  fill(g, 0, L.horizon - 3, L.w, 3, C.ink, 0.9);
}

export function mid(g, L) {
  const w = Math.round(L.w * 0.18);
  const h = Math.round(L.h * 0.2);
  fill(g, L.anchors.gate.x - w / 2, L.horizon - h, w, h, C.void, 0.55);
}

export function fore(g, L) {
  floor(g, { w: L.w, h: L.h, horizon: L.horizon, color: C.ink, lineColor: C.stoneDark });
}
