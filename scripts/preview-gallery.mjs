// 七幕软渲染画廊 + 指纹回归（无需浏览器）。
//   node scripts/preview-gallery.mjs            # 横屏 480×270
//   node scripts/preview-gallery.mjs --tall     # 竖屏 480×760
//   SIGIL_ROOT=.tmp/base node scripts/preview-gallery.mjs   # 对另一个 worktree 的旧版取基线
// 输出：每幕 ink/detail/buckets + 两两距离矩阵 + 最近一对；--out=<file.json> 可存盘。
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createRaster } from './lib/raster.mjs';
import { signatureFromRaster } from './lib/soft-signature.mjs';

const root = resolve(process.env.SIGIL_ROOT || process.cwd());
const registry = await import(pathToFileURL(join(root, 'src/ui/dioramas/registry.js')).href);
const { getDiorama, dioramaLayout, drawBand, DIORAMA_BANDS } = registry;

const args = process.argv.slice(2);
const tall = args.includes('--tall');
const outArg = args.find(a => a.startsWith('--out='));
const w = 480;
const h = tall ? 760 : 270;

const sigs = {};
const rows = [];
for (let act = 1; act <= 7; act++) {
  const d = getDiorama(act);
  const L = dioramaLayout(act, w, h);
  const r = createRaster(w, h, d.tint);
  r.g.fillStyle(d.tint, 1);
  r.g.fillRect(0, 0, w, h);
  for (const band of DIORAMA_BANDS) drawBand(act, band, r.g, L);
  const sig = signatureFromRaster(r);
  sigs[act] = sig;
  rows.push({ act, ink: +sig.ink.toFixed(3), detail: +sig.detail.toFixed(3), buckets: sig.buckets });
}

const pairs = [];
const acts = Object.keys(sigs).map(Number).sort((a, b) => a - b);
for (let i = 0; i < acts.length; i++) {
  for (let j = i + 1; j < acts.length; j++) {
    const a = sigs[acts[i]], b = sigs[acts[j]];
    let colorSum = 0, edgeDiff = 0;
    for (let k = 0; k < a.cells.length; k++) {
      colorSum += Math.max(
        Math.abs(a.cells[k][0] - b.cells[k][0]),
        Math.abs(a.cells[k][1] - b.cells[k][1]),
        Math.abs(a.cells[k][2] - b.cells[k][2]),
      ) / 7;
      if (a.edges[k] !== b.edges[k]) edgeDiff++;
    }
    pairs.push({
      pair: acts[i] + '-' + acts[j],
      d: +(0.4 * (colorSum / a.cells.length) + 0.6 * (edgeDiff / a.cells.length)).toFixed(3),
    });
  }
}
const nearest = pairs.slice().sort((x, y) => x.d - y.d)[0];

console.log((tall ? '竖屏' : '横屏') + ' 480x' + h + '  root=' + root);
console.log('act  ink    detail  buckets');
for (const r of rows) console.log(String(r.act).padStart(3) + '  ' + String(r.ink).padEnd(6) + ' ' + String(r.detail).padEnd(7) + ' ' + r.buckets);
console.log('两两距离：' + pairs.map(p => p.pair + '=' + p.d).join('  '));
console.log('最近一对：' + nearest.pair + ' = ' + nearest.d);

if (outArg) {
  const out = outArg.slice(6);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ tall, w, h, rows, pairs, nearest }, null, 2));
  console.log('已写入 ' + out);
}
