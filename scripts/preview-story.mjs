// 目检用：开场六镜 / 结局四镜的三层静态布景 + 动态关键帧软渲染（沙箱无浏览器）。
// 用法：node scripts/preview-story.mjs [opening|ending|all] [--tall] [--p=50]
import { createRaster } from './lib/raster.mjs';
import { OPENING_STATIC, ENDING_STATIC, OPENING_STAGES, ENDING_STAGES, storyLayout, buildStars } from '../src/ui/story-art.js';

const args = process.argv.slice(2);
const tall = args.includes('--tall');
const pArg = args.find((a) => a.startsWith('--p='));
const pList = pArg ? [Number(pArg.slice(4)) / 100] : [0.5];
const pick = args.find((a) => !a.startsWith('--')) ?? 'all';
const W = 480;
const H = tall ? 760 : 270;
const L = storyLayout(W, H);
const stars = buildStars(0x9e37, 46, W, H);

const sets = [
  ['opening', OPENING_STATIC, OPENING_STAGES, ['skyfall', 'contracts', 'graveyard', 'altar', 'awaken', 'title']],
  ['ending', ENDING_STATIC, ENDING_STAGES, ['release', 'quiet', 'dawn', 'credits']],
];
for (const [mode, statics, stages, shots] of sets) {
  if (pick !== 'all' && pick !== mode) continue;
  for (const shot of shots) {
    for (const p of pList) {
      const r = createRaster(W, H, 0x0d0a17);
      for (const band of ['back', 'mid', 'fore']) statics[shot][band](r.g, L);
      stages[shot](r.g, { w: W, h: H, t: Math.round(p * 4000), p, accent: 0xc9a227, stars });
      const file = '.tmp/preview/' + mode + '-' + shot + (tall ? '-tall' : '') + '-p' + String(Math.round(p * 100)).padStart(3, '0') + '.png';
      r.savePng(file, 2);
      console.log('wrote ' + file);
    }
  }
}
