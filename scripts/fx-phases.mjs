// 命中时序对比图：把每个法术的命中图案渲染成 4 个相位（8% / 34% / 70% / 起手 50%），
// 用来判断「峰值够不够亮、扩得够不够、余韵有没有留下东西」。静态单帧看不出这些。
// 用法：node scripts/fx-phases.mjs [输出目录]
import zlib from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { SPELL_FX, FX_DEF_IDS, drawImpactFx, drawCastFx, drawWardFx } from '../src/ui/spell-fx.js';
import { SIGIL_DEFS } from '../src/data/cards.js';

const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type, 'ascii'), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body)); return Buffer.concat([len, body, crc]); };
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; for (let x = 0; x < w * 4; x++) raw[y * (w * 4 + 1) + 1 + x] = rgba[y * w * 4 + x]; }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

class Raster {
  constructor(w, h, bg = 0x14101f) { this.w = w; this.h = h; this.px = new Uint8ClampedArray(w * h * 4); this.fill = 0xffffff; this.fa = 1; for (let i = 0; i < w * h; i++) { this.px[i * 4] = (bg >> 16) & 255; this.px[i * 4 + 1] = (bg >> 8) & 255; this.px[i * 4 + 2] = bg & 255; this.px[i * 4 + 3] = 255; } }
  blend(x, y, c, a) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return; const i = (y * this.w + x) * 4; const A = Math.min(1, a); this.px[i] = this.px[i] * (1 - A) + ((c >> 16) & 255) * A; this.px[i + 1] = this.px[i + 1] * (1 - A) + ((c >> 8) & 255) * A; this.px[i + 2] = this.px[i + 2] * (1 - A) + (c & 255) * A; }
  fillStyle(c, a = 1) { this.fill = c >>> 0; this.fa = a; }
  lineStyle() {}
  fillRect(x, y, w, h) { for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) this.blend(x + xx, y + yy, this.fill, this.fa); }
  fillPoints(pts) {
    if (!pts || pts.length < 3) return;
    let minY = Infinity; let maxY = -Infinity;
    for (const p of pts) { minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const xs = [];
      for (let i = 0; i < pts.length; i++) { const a = pts[i]; const b = pts[(i + 1) % pts.length]; if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x)); }
      xs.sort((m, n) => m - n);
      for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.ceil(xs[i]); x <= Math.floor(xs[i + 1]); x++) this.blend(x, y, this.fill, this.fa);
    }
  }
  strokePoints() {}
  line() {}
}

const OUT = process.argv[2] ?? '.tmp/fx-phase';
mkdirSync(OUT, { recursive: true });
const W = 150, H = 150, SCALE = 2;
const radiusOf = (id) => SIGIL_DEFS[id]?.radius ?? 18;
const KEYS = (process.env.FX_KEYS ?? '0.03,0.2,0.45,0.7,0.88').split(',').map(Number);   // 默认：入场/早/中/后/退场

for (const id of FX_DEF_IDS) {
  const strip = new Raster(W * 6, H, 0x0d0a17);
  const R = radiusOf(id);
  for (let i = 0; i < KEYS.length; i++) {
    drawImpactFx(strip, id, { x: W * (i + 0.5), y: H * 0.5, k: KEYS[i], radius: R, angle: 0.4, clock: 500 });
  }
  drawCastFx(strip, id, { x: W * 5.5, y: H * 0.5, k: 0.5, radius: R, angle: 0.4, clock: 500 });
  if (id === 'holy_ward' || id === 'aegis_ring') drawWardFx(strip, id, { x: W * 5.5, y: H * 0.5, k: 0.3, radius: 80, clock: 500 });
  const up = new Raster(W * 6 * SCALE, H * SCALE, 0x0d0a17);
  for (let y = 0; y < H * SCALE; y++) for (let x = 0; x < W * 6 * SCALE; x++) {
    const si = ((y / SCALE | 0) * (W * 6) + (x / SCALE | 0)) * 4; const di = (y * up.w + x) * 4;
    up.px[di] = strip.px[si]; up.px[di + 1] = strip.px[si + 1]; up.px[di + 2] = strip.px[si + 2]; up.px[di + 3] = 255;
  }
  writeFileSync(OUT + '/' + id + '.png', encodePNG(up.w, up.h, up.px));
}
console.log('PHASES ->', OUT, FX_DEF_IDS.length, 'spells');
