// 离线像素光栅器：把 spell-fx 的 16 套绘制函数渲染成 PNG，供无浏览器环境下逐法术自审。
// 用法：node scripts/fx-preview.mjs [输出目录]   （默认 docs/mow-fx-preview）
// 产物：每个法术一张 440×300 的 kit 图（拖尾+飞行体+起手+命中+护盾+连接线）+ contact-sheet.png
// 说明：这是「形状/配色」自审工具，不是实机截图；真实战斗画面用 scripts/mow-fx-shot.mjs。
// 零依赖：只用 node 内置 zlib，把 fillPoints/fillRect/line 光栅化成 RGBA 再编码 PNG。
import zlib from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { SPELL_FX, FX_DEF_IDS, drawProjectileFx, drawTrailFx, drawCastFx, drawImpactFx, drawWardFx, drawLinkFx } from '../src/ui/spell-fx.js';

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
const crc32 = (buf) => { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy ? rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4) : raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

class Raster {
  constructor(w, h, bg = 0x15111f) {
    this.w = w; this.h = h;
    this.px = new Uint8ClampedArray(w * h * 4);
    this.fill = 0xffffff; this.fa = 1; this.lw = 1; this.stroke = 0xffffff; this.sa = 1;
    this.clearTo(bg);
  }
  clearTo(c) { for (let i = 0; i < this.w * this.h; i++) { this.px[i * 4] = (c >> 16) & 255; this.px[i * 4 + 1] = (c >> 8) & 255; this.px[i * 4 + 2] = c & 255; this.px[i * 4 + 3] = 255; } }
  blend(x, y, c, a) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const i = (y * this.w + x) * 4; const A = Math.min(1, a);
    this.px[i] = this.px[i] * (1 - A) + ((c >> 16) & 255) * A;
    this.px[i + 1] = this.px[i + 1] * (1 - A) + ((c >> 8) & 255) * A;
    this.px[i + 2] = this.px[i + 2] * (1 - A) + (c & 255) * A;
    this.px[i + 3] = 255;
  }
  fillStyle(c, a = 1) { this.fill = c >>> 0; this.fa = a; }
  lineStyle(w, c, a = 1) { this.lw = Math.max(1, w | 0); this.stroke = c >>> 0; this.sa = a; }
  fillRect(x, y, w, h) { for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) this.blend(x + xx, y + yy, this.fill, this.fa); }
  fillPoints(pts) {
    if (!pts || pts.length < 3) return;
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) { minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
      xs.sort((m, n) => m - n);
      for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.ceil(xs[i]); x <= Math.floor(xs[i + 1]); x++) this.blend(x, y, this.fill, this.fa);
    }
  }
  strokePoints(pts, close = true) {
    if (!pts || pts.length < 2) return;
    const n = close ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) this.line(pts[i].x, pts[i].y, pts[(i + 1) % pts.length].x, pts[(i + 1) % pts.length].y, this.stroke, this.sa, this.lw);
  }
  line(x1, y1, x2, y2, c, a, w) {
    const dx = x2 - x1, dy = y2 - y1; const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
    for (let s = 0; s <= steps; s++) {
      const x = Math.round(x1 + (dx * s) / steps), y = Math.round(y1 + (dy * s) / steps);
      for (let oy = 0; oy < w; oy++) for (let ox = 0; ox < w; ox++) this.blend(x + ox - ((w - 1) >> 1), y + oy - ((w - 1) >> 1), c, a);
    }
  }
  clear() { this.clearTo(0x15111f); }
  rect(x, y, w, h, c, a = 1) { this.fillStyle(c, a); this.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  panel(x, y, w, h) { this.rect(x, y, w, h, 0x1f1933); this.rect(x, y, w, 1, 0x3b3157); this.rect(x, y + h - 1, w, 1, 0x241c3a); }
}

const TILE_W = 220, TILE_H = 150, SCALE = 2, COLS = 4, ROWS = 4;
const OUT = process.argv[2] ?? 'docs/mow-fx-preview';
const SHEET_PATH = 'docs/mow-fx-preview.png';
mkdirSync(OUT, { recursive: true });

const radiusOf = (id) => ({ holy_ward: 40, aegis_ring: 55, starfall: 70, quake_maw: 80, meteor_judgment: 95, thorn_vine: 46 }[id] ?? 18);

function renderTile(defId, index) {
  const r = new Raster(TILE_W, TILE_H);
  const desc = SPELL_FX[defId];
  const col = desc?.colors ?? { core: 0xffffff };
  r.panel(2, 2, TILE_W - 4, TILE_H - 4);
  // 主色板
  r.rect(8, 8, 26, 4, col.body, 1);
  r.rect(38, 8, 26, 4, col.core, 1);
  r.rect(68, 8, 26, 4, col.accent, 1);
  // 拖尾 + 飞行体：从左下往右上
  const angle = -0.55;
  const px = 92, py = 84;
  const trail = [];
  for (let i = 6; i >= 1; i--) trail.push({ x: px - Math.cos(angle) * i * 7, y: py - Math.sin(angle) * i * 7 });
  drawTrailFx(r, defId, { x: px, y: py, angle, k: 0.45, clock: 640, trail });
  drawProjectileFx(r, defId, { x: px, y: py, angle, k: 0.45, clock: 640, trail });
  // 起手
  drawCastFx(r, defId, { x: 40, y: 40, angle: 0.3, k: 0.55, clock: 640 });
  // 命中
  drawImpactFx(r, defId, { x: 168, y: 52, k: 0.4, clock: 640, radius: radiusOf(defId), angle });
  // 护盾 / 连接线
  drawWardFx(r, defId, { x: 48, y: 112, k: 0.35, clock: 640, radius: radiusOf(defId) });
  drawLinkFx(r, defId, { from: { x: 120, y: 122 }, to: { x: 190, y: 100 }, k: 0.5, clock: 640, index: index });
  return r;
}

const sheet = new Raster(TILE_W * COLS, TILE_H * ROWS, 0x0d0a17);
FX_DEF_IDS.forEach((id, i) => {
  const tile = renderTile(id, i);
  const ox = (i % COLS) * TILE_W, oy = Math.floor(i / COLS) * TILE_H;
  for (let y = 0; y < TILE_H; y++) for (let x = 0; x < TILE_W; x++) {
    const si = (y * TILE_W + x) * 4, di = ((oy + y) * sheet.w + ox + x) * 4;
    sheet.px[di] = tile.px[si]; sheet.px[di + 1] = tile.px[si + 1]; sheet.px[di + 2] = tile.px[si + 2]; sheet.px[di + 3] = 255;
  }
  const up = new Raster(TILE_W * SCALE, TILE_H * SCALE);
  for (let y = 0; y < TILE_H * SCALE; y++) for (let x = 0; x < TILE_W * SCALE; x++) {
    const si = ((y / SCALE | 0) * TILE_W + (x / SCALE | 0)) * 4, di = (y * up.w + x) * 4;
    up.px[di] = tile.px[si]; up.px[di + 1] = tile.px[si + 1]; up.px[di + 2] = tile.px[si + 2]; up.px[di + 3] = 255;
  }
  writeFileSync(OUT + '/' + String(i + 1).padStart(2, '0') + '-' + id + '.png', encodePNG(up.w, up.h, up.px));
});
writeFileSync(SHEET_PATH, encodePNG(sheet.w, sheet.h, sheet.px));
console.log('SHEET', SHEET_PATH);
console.log('RENDERED', FX_DEF_IDS.length, 'spells; sheet', sheet.w, 'x', sheet.h);
console.log(FX_DEF_IDS.map((id, i) => (i + 1) + ' ' + id).join(' | '));