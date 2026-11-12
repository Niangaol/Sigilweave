// 纯 Node 软渲染：把 diorama-kit 的 fillRect/fillPoints/strokePoints 画进内存位图并存 PNG。
// 用途：沙箱里跑不了浏览器时，仍能对七幕布景做目检；也是给并行 subagent 的自查工具。
// 不追求 Phaser 的像素级一致（三角形填充用扫描线、线用 Bresenham），只看构图与材质。
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
export function encodePng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy ? rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
      : raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function createRaster(w, h, bg = 0x000000) {
  const buf = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    buf[i * 4] = (bg >> 16) & 255; buf[i * 4 + 1] = (bg >> 8) & 255; buf[i * 4 + 2] = bg & 255; buf[i * 4 + 3] = 255;
  }
  let color = 0xffffff;
  let alpha = 1;
  const blend = (x, y, a) => {
    if (x < 0 || y < 0 || x >= w || y >= h || a <= 0) return;
    const i = (y * w + x) * 4;
    const sr = (color >> 16) & 255, sg = (color >> 8) & 255, sb = color & 255;
    const da = a > 1 ? 1 : a;
    buf[i] = Math.round(sr * da + buf[i] * (1 - da));
    buf[i + 1] = Math.round(sg * da + buf[i + 1] * (1 - da));
    buf[i + 2] = Math.round(sb * da + buf[i + 2] * (1 - da));
    buf[i + 3] = 255;
  };
  const line = (x0, y0, x1, y1) => {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, x = x0, y = y0;
    for (;;) {
      blend(x, y, alpha);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  };
  const g = {
    fillStyle(c, a = 1) { color = c; alpha = a; return g; },
    lineStyle(_w, c, a = 1) { color = c; alpha = a; return g; },
    fillRect(x, y, rw, rh) {
      const x0 = Math.round(x), y0 = Math.round(y);
      for (let yy = y0; yy < y0 + Math.round(rh); yy++) for (let xx = x0; xx < x0 + Math.round(rw); xx++) blend(xx, yy, alpha);
      return g;
    },
    lineBetween(x0, y0, x1, y1) { line(x0, y0, x1, y1); return g; },
    strokePoints(pts, close) {
      for (let i = 1; i < pts.length; i++) line(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
      if (close && pts.length > 1) line(pts[pts.length - 1].x, pts[pts.length - 1].y, pts[0].x, pts[0].y);
      return g;
    },
    fillPoints(pts) {
      let minY = Infinity, maxY = -Infinity;
      for (const p of pts) { minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
      for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
        const xs = [];
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], b = pts[(i + 1) % pts.length];
          if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
        }
        xs.sort((m, n) => m - n);
        for (let k = 0; k + 1 < xs.length; k += 2) {
          for (let x = Math.ceil(xs[k]); x <= Math.floor(xs[k + 1]); x++) blend(x, y, alpha);
        }
      }
      return g;
    },
  };
  return {
    g,
    width: w,
    height: h,
    buffer: buf,
    savePng(path, scale = 2) {
      mkdirSync(dirname(path), { recursive: true });
      if (scale === 1) { writeFileSync(path, encodePng(w, h, buf)); return; }
      const W = w * scale, H = h * scale;
      const big = Buffer.alloc(W * H * 4);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const si = (Math.floor(y / scale) * w + Math.floor(x / scale)) * 4;
        big.set(buf.subarray(si, si + 4), (y * W + x) * 4);
      }
      writeFileSync(path, encodePng(W, H, big));
    },
  };
}
