// 布景目检：把某一幕的三层静态带渲染成 PNG（无需浏览器）。
//   node scripts/preview-diorama.mjs 1
//   node scripts/preview-diorama.mjs 3 --tall --out=.tmp/act3-tall.png
// 输出默认 .tmp/preview/act{N}.png（2 倍放大，便于看清 1px 材质）。
import { createRaster } from './lib/raster.mjs';
import { dioramaLayout, drawBand, DIORAMA_BANDS, getDiorama } from '../src/ui/dioramas/registry.js';
import { plinthLayout } from '../src/ui/cutscene-plinth.js';

const args = process.argv.slice(2);
const act = Number(args[0] || 1);
const tall = args.includes('--tall');
const outArg = args.find(a => a.startsWith('--out='));
const w = 480;
const h = tall ? 760 : 270;
const d = getDiorama(act);
const L = dioramaLayout(act, w, h);
const r = createRaster(w, h, d.tint);
r.g.fillStyle(0x000000, 1);

// 底色压暗，模拟 veil 下的舞台
r.g.fillStyle(d.tint, 1);
r.g.fillRect(0, 0, w, h);
for (const band of DIORAMA_BANDS) drawBand(act, band, r.g, L);

// 碑座（只画石带，不画文字）
const P = plinthLayout({ w, h, card: { compact: false, kind: 'act', stats: [] } });
r.g.fillStyle(0x0b0912, 0.88);
r.g.fillRect(P.panel.x, P.panel.y, P.panel.w, P.panel.h);
r.g.fillStyle(0x8a6a2f, 0.55);
r.g.fillRect(P.panel.x, P.panel.y, P.panel.w, 1);
r.g.fillStyle(0x000000, 0.9);
r.g.fillRect(P.panel.x, P.panel.y + P.panel.h - 1, P.panel.w, 1);

const out = outArg ? outArg.slice(6) : '.tmp/preview/act' + act + (tall ? '-tall' : '') + '.png';
r.savePng(out, 2);
console.log(out + '  ' + w + 'x' + h + '  horizon=' + L.horizon + '  anchors=' + JSON.stringify(L.anchors));
