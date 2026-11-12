// 碑座：标题卡的替代版面。旧版把卡片放画面正中（占 65% 面积，挡住中景），
// 新版把铭文压到底部一条 84px 的通栏石带里，场景占上方 62%。
// 纯函数，不依赖 Phaser：CutsceneScene 拿它返回的绝对坐标建文字对象，再 toLocal 转进容器。
import { clamp01 } from './cinematic-art.js';

export const PLINTH = {
  full: { short: 84, tall: 104 },
  compact: { w: 176, h: 44 },
  pad: 14,
};

// 返回画布绝对坐标；紧凑卡也用同一套字段，编排代码不必分支。
export function plinthLayout({ w, h, card } = {}) {
  const compact = !!card?.compact;
  const tall = h > 400;

  if (compact) {
    const { w: pw, h: ph } = PLINTH.compact;
    const centerY = Math.round(h * (tall ? 0.74 : 0.66));
    const panel = { x: Math.round((w - pw) / 2), y: centerY - Math.round(ph / 2), w: pw, h: ph };
    const size = 13;
    return {
      compact: true,
      tall,
      panel,
      title: { x: Math.round(w / 2), y: panel.y + Math.round((ph - size) / 2), size, align: 'center' },
      stats: [],
      watermark: null,
    };
  }

  const ph = tall ? PLINTH.full.tall : PLINTH.full.short;
  const y0 = h - ph;
  const titleSize = tall ? 22 : 20;
  const stats = Array.isArray(card?.stats) ? card.stats : [];
  const hasStats = stats.length > 0;
  const statXs = [306, 346, 386, 426];

  return {
    compact: false,
    tall,
    panel: { x: 0, y: y0, w, h: ph },
    shadowY: y0 - 1,
    eyebrow: { x: PLINTH.pad, y: y0 + 6, size: 7 },
    title: { x: PLINTH.pad, y: y0 + 16, size: titleSize, step: titleSize + 6, align: 'left' },
    rule: { x1: PLINTH.pad, x2: 300, y: y0 + 42 },
    subtitle: { x: PLINTH.pad, y: y0 + 44, size: 8, width: hasStats ? 286 : Math.min(300, w - 28) },
    stats: hasStats ? stats.map((_, i) => ({
      x: statXs[i] ?? 306 + i * 40,
      labelY: y0 + 14,
      valueY: y0 + 24,
      labelSize: 6,
      valueSize: 11,
      divider: i > 0 ? (statXs[i] ?? 306 + i * 40) - 20 : null,
    })) : [],
    hint: { x: w - PLINTH.pad, y: y0 + 70, size: 6, align: 'right' },
    watermark: card?.kind === 'act'
      ? { x: 450, y: y0 - 56, size: 46, alpha: 0.18 }
      : { x: 450, y: y0 + 20, size: 28, alpha: 0.12 },
  };
}

// 画布绝对坐标 → 容器局部坐标
export function toLocal(p, cx, cy) {
  return { x: Math.round(p.x - cx), y: Math.round(p.y - cy) };
}

// 碑座石面的静态刻痕（固定种子，像素级硬边）：凿痕 + 贴底苔点。
export function plinthMarks(seed = 3) {
  let s = (seed >>> 0) || 3;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const marks = [];
  for (let i = 0; i < 2; i++) marks.push({ x: 40 + Math.round(rnd() * 180) + i * 210, y: 26 + Math.round(rnd() * 40), len: 6 + Math.round(rnd() * 12) });
  const moss = [];
  for (let i = 0; i < 4; i++) moss.push({ x: 12 + Math.round(rnd() * 440), y: 78 + Math.round(rnd() * 4), w: 1 + Math.round(rnd() * 2) });
  return { marks, moss };
}
