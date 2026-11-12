// 前后对比图：同一画面的「旧提交」与「当前工作区」左右并排（沙箱跑不了浏览器时的目检替代）。
//
//   git worktree add -f .tmp/base <旧提交>
//   node scripts/preview-compare.mjs --base=.tmp/base --mode=act --pick=4,5
//   node scripts/preview-compare.mjs --base=.tmp/base --mode=journey --pick=forge --p=85
//   node scripts/preview-compare.mjs --base=.tmp/base --mode=story --pick=release,quiet,credits --p=70
//
// 输出默认写到 docs/cutscene/compare/，2 倍放大，中间 4px 铜色分隔条；左=旧、右=新。
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { createRaster } from './lib/raster.mjs';

const args = process.argv.slice(2);
const baseArg = args.find((a) => a.startsWith('--base='));
const outArg = args.find((a) => a.startsWith('--out='));
const modeArg = args.find((a) => a.startsWith('--mode='));
const pickArg = args.find((a) => a.startsWith('--pick='));
const pArg = args.find((a) => a.startsWith('--p='));
const tall = args.includes('--tall');
if (!baseArg) throw new Error('需要 --base=<旧提交的 worktree 目录>');

const headRoot = resolve(process.cwd());
const baseRoot = resolve(baseArg.slice(7));
const outDir = outArg ? outArg.slice(6) : 'docs/cutscene/compare';
const mode = modeArg ? modeArg.slice(7) : 'act';
const p = pArg ? Number(pArg.slice(4)) / 100 : 0.5;
const W = 480;
const H = tall ? 760 : 270;

const load = (root, file) => import(pathToFileURL(join(root, file)).href);

function blitAlpha(dst, src, ox, bg = [0x0d, 0x0a, 0x17]) {
  for (let y = 0; y < dst.height && y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const dx = x + ox;
      if (dx < 0 || dx >= dst.width) continue;
      const si = (y * src.width + x) * 4;
      // 软渲染没有 alpha 通道：底色精确匹配视作透明（与 preview-journey.mjs 同法）
      if (src.buffer[si] === bg[0] && src.buffer[si + 1] === bg[1] && src.buffer[si + 2] === bg[2]) continue;
      const di = (y * dst.width + dx) * 4;
      dst.buffer[di] = src.buffer[si];
      dst.buffer[di + 1] = src.buffer[si + 1];
      dst.buffer[di + 2] = src.buffer[si + 2];
      dst.buffer[di + 3] = 255;
    }
  }
}

function blitFlat(dst, src, ox) {
  for (let y = 0; y < dst.height && y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const dx = x + ox;
      if (dx < 0 || dx >= dst.width) continue;
      const si = (y * src.width + x) * 4;
      const di = (y * dst.width + dx) * 4;
      dst.buffer[di] = src.buffer[si];
      dst.buffer[di + 1] = src.buffer[si + 1];
      dst.buffer[di + 2] = src.buffer[si + 2];
      dst.buffer[di + 3] = 255;
    }
  }
}

async function renderAct(root, act) {
  const reg = await load(root, 'src/ui/dioramas/registry.js');
  const d = reg.getDiorama(act);
  const L = reg.dioramaLayout(act, W, H);
  const r = createRaster(W, H, d.tint);
  r.g.fillStyle(d.tint, 1);
  r.g.fillRect(0, 0, W, H);
  for (const band of reg.DIORAMA_BANDS) reg.drawBand(act, band, r.g, L);
  // 碑座石带（不画文字），让对比图接近真实构图
  const py0 = H - (tall ? 104 : 84);
  r.g.fillStyle(0x0b0912, 0.88);
  r.g.fillRect(0, py0, W, H - py0);
  r.g.fillStyle(0x8a6a2f, 0.55);
  r.g.fillRect(0, py0, W, 1);
  r.g.fillStyle(0x000000, 0.9);
  r.g.fillRect(0, H - 1, W, 1);
  return r;
}

async function renderJourney(root, stage) {
  const js = await load(root, 'src/ui/journey-static.js');
  const sa = await load(root, 'src/ui/story-art.js');
  const B = 64;
  const L = js.journeyLayout(stage, W, H);
  const pan = js.journeyPan(p);
  const out = createRaster(W, H, 0x0d0a17);
  for (const band of ['back', 'mid', 'fore']) {
    const layer = createRaster(W + B * 2, H, 0x0d0a17);
    js.JOURNEY_STATIC[stage][band](layer.g, L);
    blitAlpha(out, layer, -pan[band]);
  }
  const stars = sa.buildStars(7, 46, W, H);
  js.JOURNEY_STAGES[stage](out.g, { w: W, h: H, t: Math.round(p * 5200), p, accent: 0x7cc9a8, stars });
  return out;
}

async function renderStory(root, shot) {
  const sa = await load(root, 'src/ui/story-art.js');
  const L = sa.storyLayout(W, H);
  const stars = sa.buildStars(0x9e37, 46, W, H);
  const r = createRaster(W, H, 0x0d0a17);
  for (const band of ['back', 'mid', 'fore']) sa.ENDING_STATIC[shot][band](r.g, L);
  sa.ENDING_STAGES[shot](r.g, { w: W, h: H, t: Math.round(p * 4000), p, accent: 0xc9a227, stars });
  return r;
}

const picks = (pickArg ? pickArg.slice(7) : '').split(',').filter(Boolean);
const jobs = mode === 'act'
  ? (picks.length ? picks.map(Number) : [1, 2, 3, 4, 5, 6, 7]).map((n) => ({ key: 'act' + n, render: (root) => renderAct(root, n) }))
  : mode === 'journey'
    ? (picks.length ? picks : ['swamp', 'star', 'library', 'court', 'forge', 'sunrise']).map((s) => ({ key: 'journey-' + s, render: (root) => renderJourney(root, s) }))
    : (picks.length ? picks : ['release', 'quiet', 'dawn', 'credits']).map((s) => ({ key: 'ending-' + s, render: (root) => renderStory(root, s) }));

mkdirSync(outDir, { recursive: true });
const gap = 4;
for (const job of jobs) {
  const sheet = createRaster(W * 2 + gap, H, 0x000000);
  const left = await job.render(baseRoot);
  const right = await job.render(headRoot);
  blitFlat(sheet, left, 0);
  blitFlat(sheet, right, W + gap);
  sheet.g.fillStyle(0x8a6a2f, 0.85);
  sheet.g.fillRect(W, 0, gap, H);
  const suffix = mode === 'act' ? '' : '-p' + String(Math.round(p * 100)).padStart(3, '0');
  const out = join(outDir, job.key + (tall ? '-tall' : '') + suffix + '.png');
  sheet.savePng(out, 2);
  console.log('左=旧 右=新  ' + out);
}
