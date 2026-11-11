// 量每个法术命中图案的实际像素尺寸（不是相对 R，而是世界像素），防止「小法术看不见 / 大法术糊屏」。
import { FX_DEF_IDS, drawImpactFx, visualRadius, IMPACT_SCALE } from '../src/ui/spell-fx/index.js';
import { SIGIL_DEFS } from '../src/data/cards.js';

function bbox(fn, ctx) {
  const xs = []; const ys = [];
  const g = { fillStyle() {}, fillRect(x, y, w, h) { xs.push(x, x + w); ys.push(y, y + h); }, fillPoints(pts) { for (const p of pts) { xs.push(p.x); ys.push(p.y); } } };
  fn(g, ctx);
  return xs.length ? { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) } : { w: 0, h: 0 };
}

const rows = FX_DEF_IDS.map((id) => {
  const R = SIGIL_DEFS[id]?.radius ?? 18;
  const box = bbox((g, c) => drawImpactFx(g, id, c), { x: 300, y: 200, k: 0.2, clock: 700, radius: R, angle: 0.4 });
  return { id, R, vis: +(visualRadius(R) * (IMPACT_SCALE[id] ?? 0.5)).toFixed(1), w: box.w, h: box.h, max: Math.max(box.w, box.h) };
});
rows.sort((a, b) => a.max - b.max);
console.log('defId            gameplayR  passedR  width  height  max');
for (const r of rows) console.log(String(r.id).padEnd(17) + String(r.R).padStart(9) + String(r.vis).padStart(9) + String(r.w).padStart(7) + String(r.h).padStart(8) + String(r.max).padStart(6));
const bad = rows.filter((r) => r.max < 55 || r.max > 190);
console.log('\n口径：命中图案最大边 55~190 世界像素（480px 战场宽 ≈ 11%~40%）');
console.log(bad.length ? '越界：' + bad.map((r) => r.id + '(' + r.max + 'px)').join(', ') : '全部在口径内');
