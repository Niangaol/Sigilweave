// 高级法术「多段演出」时序图：每个演出 6 个相位一张横条，用来检查出现/峰值/余震/余韵是否连贯。
// 用法：node scripts/strike-phases.mjs [输出目录]
import zlib from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { drawMeteorStrike, drawQuakeStrike, METEOR_STRIKE_DUR, QUAKE_STRIKE_DUR } from '../src/ui/strike-fx.js';

const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const body = Buffer.concat([Buffer.from(t, 'ascii'), d]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc32(body)); return Buffer.concat([l, body, cr]); };
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; for (let x = 0; x < w * 4; x++) raw[y * (w * 4 + 1) + 1 + x] = rgba[y * w * 4 + x]; }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
class Raster {
  constructor(w, h, bg = 0x14101f) { this.w = w; this.h = h; this.px = new Uint8ClampedArray(w * h * 4); this.f = 0xffffff; this.fa = 1; for (let i = 0; i < w * h; i++) { this.px[i * 4] = (bg >> 16) & 255; this.px[i * 4 + 1] = (bg >> 8) & 255; this.px[i * 4 + 2] = bg & 255; this.px[i * 4 + 3] = 255; } }
  blend(x, y, c, a) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return; const i = (y * this.w + x) * 4; const A = Math.min(1, a); this.px[i] = this.px[i] * (1 - A) + ((c >> 16) & 255) * A; this.px[i + 1] = this.px[i + 1] * (1 - A) + ((c >> 8) & 255) * A; this.px[i + 2] = this.px[i + 2] * (1 - A) + (c & 255) * A; }
  fillStyle(c, a = 1) { this.f = c >>> 0; this.fa = a; }
  fillRect(x, y, w, h) { for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) this.blend(x + xx, y + yy, this.f, this.fa); }
  fillPoints(pts) {
    if (!pts || pts.length < 3) return;
    let minY = Infinity; let maxY = -Infinity;
    for (const p of pts) { minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const xs = [];
      for (let i = 0; i < pts.length; i++) { const a = pts[i]; const b = pts[(i + 1) % pts.length]; if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x)); }
      xs.sort((m, n) => m - n);
      for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.ceil(xs[i]); x <= Math.floor(xs[i + 1]); x++) this.blend(x, y, this.f, this.fa);
    }
  }
  lineStyle() {} strokePoints() {} line() {}
}

const OUT = process.argv[2] ?? '.tmp/fx-strike';
mkdirSync(OUT, { recursive: true });
const W = 200, H = 200, SCALE = 2;
const K = [0.02, 0.1, 0.25, 0.45, 0.7, 0.95];
const JOBS = [
  { id: 'meteor_judgment', fn: drawMeteorStrike, radius: 110, dur: METEOR_STRIKE_DUR },
  { id: 'quake_maw', fn: drawQuakeStrike, radius: 100, dur: QUAKE_STRIKE_DUR },
];
for (const job of JOBS) {
  const strip = new Raster(W * K.length, H, 0x0d0a17);
  for (let i = 0; i < K.length; i++) {
    job.fn(strip, { x: W * (i + 0.5), y: H * 0.55, k: K[i], clock: 800, radius: job.radius, angle: 0.5 });
  }
  const up = new Raster(W * K.length * SCALE, H * SCALE, 0x0d0a17);
  for (let y = 0; y < H * SCALE; y++) for (let x = 0; x < W * K.length * SCALE; x++) {
    const si = ((y / SCALE | 0) * (W * K.length) + (x / SCALE | 0)) * 4; const di = (y * up.w + x) * 4;
    up.px[di] = strip.px[si]; up.px[di + 1] = strip.px[si + 1]; up.px[di + 2] = strip.px[si + 2]; up.px[di + 3] = 255;
  }
  writeFileSync(OUT + '/' + job.id + '.png', encodePNG(up.w, up.h, up.px));
  console.log(job.id, 'dur=' + job.dur + 'ms ->', OUT + '/' + job.id + '.png');
}
