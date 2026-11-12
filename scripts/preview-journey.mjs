// 目检用：把 journey 六幕的三层静态布景 + 动态关键帧软渲染成 PNG（沙箱无浏览器）。
// 用法：node scripts/preview-journey.mjs [all|swamp|star|library|court|forge|sunrise] [--tall] [--out=DIR]
import { createRaster } from './lib/raster.mjs';
import { JOURNEY_STATIC, JOURNEY_STAGES, journeyLayout, journeyPan } from '../src/ui/journey-static.js';
import { buildStars } from '../src/ui/story-art.js';

const args = process.argv.slice(2);
const tall = args.includes('--tall');
const outArg = args.find((a) => a.startsWith('--out='));
const outDir = outArg ? outArg.slice(6) : '.tmp/preview';
const stages = ['swamp', 'star', 'library', 'court', 'forge', 'sunrise'];
const pick = args.find((a) => !a.startsWith('--')) ?? 'all';
const list = pick === 'all' ? stages : [pick];

const W = 480;
const H = tall ? 760 : 270;
const B = 64;

function blit(dst, src, dx) {
  for (let y = 0; y < dst.height; y++) {
    for (let x = 0; x < dst.width; x++) {
      // 软渲染从 0 开始裁掉负坐标，与 Phaser 一致：layer 像素 = 游戏坐标，不能再加 B。
      const sx = x + dx;
      if (sx < 0 || sx >= src.width) continue;
      const si = (y * src.width + sx) * 4;
      // 层内背景色视作透明（软渲染无 alpha 通道，用底色的精确匹配代替）
      if (src.buffer[si] === 0x0d && src.buffer[si + 1] === 0x0a && src.buffer[si + 2] === 0x17) continue;
      const di = (y * dst.width + x) * 4;
      dst.buffer[di] = src.buffer[si];
      dst.buffer[di + 1] = src.buffer[si + 1];
      dst.buffer[di + 2] = src.buffer[si + 2];
      dst.buffer[di + 3] = 255;
    }
  }
}

function render(stage, p) {
  const L = journeyLayout(stage, W, H);
  const pan = journeyPan(p);
  const out = createRaster(W, H, 0x0d0a17);
  for (const band of ['back', 'mid', 'fore']) {
    const layer = createRaster(W + B * 2, H, 0x0d0a17);
    JOURNEY_STATIC[stage][band](layer.g, L);
    blit(out, layer, -pan[band]);
  }
  const stars = buildStars(7, 46, W, H);
  JOURNEY_STAGES[stage](out.g, { w: W, h: H, t: Math.round(p * 5200), p, accent: 0x7cc9a8, stars });
  return out;
}

for (const stage of list) {
  for (const p of [0.15, 0.5, 0.85]) {
    const r = render(stage, p);
    const file = outDir + '/journey-' + stage + (tall ? '-tall' : '') + '-p' + String(Math.round(p * 100)).padStart(3, '0') + '.png';
    r.savePng(file, 2);
    console.log('wrote ' + file);
  }
}
