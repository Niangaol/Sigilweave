// 画面指纹：把游戏画布降采样成 32×18，用来量化「细节量（空白率）」与「七幕辨识度」。
// 只在验收脚本里跑（需要真实浏览器），不参与游戏运行时。
export const SIG = { w: 32, h: 18, inkDelta: 12, levels: 12 };

// 在页面上下文里执行：拿游戏画布 → 缩放 → 统计主色、空白率、亮度格子。
async function sigInPage(cfg) {
  const canvas = globalThis.__SIGILWEAVE__?.game?.canvas || document.querySelector('canvas');
  if (!canvas) throw new Error('找不到游戏画布');
  const bmp = await createImageBitmap(canvas);
  const off = document.createElement('canvas');
  off.width = cfg.w;
  off.height = cfg.h;
  const ctx = off.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(bmp, 0, 0, cfg.w, cfg.h);
  const data = ctx.getImageData(0, 0, cfg.w, cfg.h).data;

  const cells = [];
  const colors = [];
  const buckets = new Map();
  for (let i = 0; i < cfg.w * cfg.h; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    colors.push([r, g, b]);
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    buckets.set(key, (buckets.get(key) || 0) + 1);
    cells.push(Math.round(((0.299 * r + 0.587 * g + 0.114 * b) / 255) * (cfg.levels - 1)));
  }
  let top = 0, topKey = 0;
  for (const [k, n] of buckets) if (n > top) { top = n; topKey = k; }
  const dominant = [((topKey >> 8) & 15) * 16 + 8, ((topKey >> 4) & 15) * 16 + 8, (topKey & 15) * 16 + 8];

  let ink = 0;
  for (const [r, g, b] of colors) {
    const d = Math.max(Math.abs(r - dominant[0]), Math.abs(g - dominant[1]), Math.abs(b - dominant[2]));
    if (d > cfg.inkDelta) ink++;
  }
  return { w: cfg.w, h: cfg.h, cells, ink: ink / (cfg.w * cfg.h), dominant };
}

export async function captureSignature(page) {
  return page.evaluate(sigInPage, { ...SIG });
}

// 指纹距离：亮度格子的平均绝对差，归一到 0..1。同构图 ≈0，构图全变≈1。
export function distance(a, b) {
  if (!a || !b || a.cells.length !== b.cells.length) return 0;
  let sum = 0;
  for (let i = 0; i < a.cells.length; i++) sum += Math.abs(a.cells[i] - b.cells[i]);
  return sum / a.cells.length / (SIG.levels - 1);
}

export function pairwise(sigs) {
  const acts = Object.keys(sigs).map(Number).sort((x, y) => x - y);
  const out = [];
  for (let i = 0; i < acts.length; i++) {
    for (let j = i + 1; j < acts.length; j++) {
      out.push({ a: acts[i], b: acts[j], d: +distance(sigs[acts[i]], sigs[acts[j]]).toFixed(3) });
    }
  }
  return out;
}

export const THRESHOLDS = { ink: 0.55, actDistance: 0.18, kindDistance: 0.1 };
