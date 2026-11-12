// 软渲染版画面指纹：不启动浏览器，直接从 raster.mjs 的内存位图算。
// 指标定义与 scripts/lib/pixel-signature.mjs 完全一致（同样的 48×27 降采样、RGB 3bit 格、局部对比 edges），
// 差别只在取样来源：那边取样页截图（含 veil/tint/碑座文字），这边取样三层布景的软渲染。
// 用途：本机跑不了浏览器时，仍能对「七幕辨识度」做回归——数值不能和截图基线直接比，只能同源纵向对比。
import { SIG } from './pixel-signature.mjs';

export function signatureFromRaster(raster, cfg = SIG) {
  const { w, h } = cfg;
  const W = raster.width, H = raster.height;
  const buf = raster.buffer;
  const colors = [];
  const cells = [];
  const buckets = new Map();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // 盒式降采样：取源图对应矩形内所有像素的平均色
      const x0 = Math.floor((x * W) / w), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * W) / w));
      const y0 = Math.floor((y * H) / h), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * H) / h));
      let sr = 0, sg = 0, sb = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * W + xx) * 4;
          sr += buf[i]; sg += buf[i + 1]; sb += buf[i + 2]; n++;
        }
      }
      const r = Math.round(sr / n), g = Math.round(sg / n), b = Math.round(sb / n);
      colors.push([r, g, b]);
      cells.push([r >> 5, g >> 5, b >> 5]);
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }
  }
  let top = 0, topKey = 0;
  for (const [k, v] of buckets) if (v > top) { top = v; topKey = k; }
  const dominant = [((topKey >> 8) & 15) * 16 + 8, ((topKey >> 4) & 15) * 16 + 8, (topKey & 15) * 16 + 8];

  const lum = colors.map(([r, g, b]) => (0.299 * r + 0.587 * g + 0.114 * b) / 255);
  let ink = 0, detail = 0;
  const edges = [];
  for (let i = 0; i < colors.length; i++) {
    const d = Math.max(Math.abs(colors[i][0] - dominant[0]), Math.abs(colors[i][1] - dominant[1]), Math.abs(colors[i][2] - dominant[2]));
    if (d > cfg.inkDelta) ink++;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let sum = 0, n = 0;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        sum += lum[ny * w + nx]; n++;
      }
      const edge = n && Math.abs(lum[i] - sum / n) > 0.012 ? 1 : 0;
      edges.push(edge);
      if (edge) detail++;
    }
  }
  return {
    w, h, cells, edges, dominant,
    ink: ink / (w * h),
    detail: detail / (w * h),
    buckets: buckets.size,
  };
}
