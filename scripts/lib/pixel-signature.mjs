// 画面指纹：把游戏画布降采样成 32×18，用来量化「细节量（空白率）」与「七幕辨识度」。
// 只在验收脚本里跑（需要真实浏览器），不参与游戏运行时。
export const SIG = { w: 48, h: 27, inkDelta: 12, levels: 12 };

// 在页面上下文里执行：拿游戏画布（或传入的 PNG dataURL）→ 缩放 → 统计主色、空白率、亮度格子。
// 说明：Phaser 的 WebGL 画布没有 preserveDrawingBuffer，createImageBitmap(canvas) 会得到全黑，
// 所以实际验收走 signatureFromBuffer（先用 page.screenshot 拿像素）。
async function sigInPage(payload) {
  const cfg = payload.cfg ?? payload;
  let bmp;
  if (payload.b64) {
    const img = new Image();
    img.src = 'data:image/png;base64,' + payload.b64;
    await img.decode();
    bmp = img;
  } else {
    const canvas = globalThis.__SIGILWEAVE__?.game?.canvas || document.querySelector('canvas');
    if (!canvas) throw new Error('找不到游戏画布');
    bmp = await createImageBitmap(canvas);
  }
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
    // cells 存 RGB 三档（每通道 3bit）：只存亮度会把"紫→绿"这种同亮度的幕差判成相同。
    cells.push([r >> 5, g >> 5, b >> 5]);
  }
  let top = 0, topKey = 0;
  for (const [k, n] of buckets) if (n > top) { top = n; topKey = k; }
  const dominant = [((topKey >> 8) & 15) * 16 + 8, ((topKey >> 4) & 15) * 16 + 8, (topKey & 15) * 16 + 8];

  let ink = 0;
  for (const [r, g, b] of colors) {
    const d = Math.max(Math.abs(r - dominant[0]), Math.abs(g - dominant[1]), Math.abs(b - dominant[2]));
    if (d > cfg.inkDelta) ink++;
  }
  // detail：与上下左右邻居亮度差超过 0.012（约 3/255）的格子占比——衡量"画面里有东西"，比 ink 更适合暗调像素画。
  // ink 依旧保留：它统计"偏离主色"的像素，暗场景天然偏低，只作参考。
  let detail = 0;
  for (let y = 0; y < cfg.h; y++) {
    for (let x = 0; x < cfg.w; x++) {
      const i = y * cfg.w + x;
      const l = (0.299 * colors[i][0] + 0.587 * colors[i][1] + 0.114 * colors[i][2]) / 255;
      let sum = 0, n = 0;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cfg.w || ny >= cfg.h) continue;
        const j = ny * cfg.w + nx;
        sum += (0.299 * colors[j][0] + 0.587 * colors[j][1] + 0.114 * colors[j][2]) / 255;
        n++;
      }
      if (n && Math.abs(l - sum / n) > 0.012) detail++;
    }
  }
  // edges：每个格子是否"有边缘"（局部对比超阈值），用于比较轮廓结构而不是平均亮度。
  const edges = [];
  for (let y = 0; y < cfg.h; y++) {
    for (let x = 0; x < cfg.w; x++) {
      const i = y * cfg.w + x;
      const l = (0.299 * colors[i][0] + 0.587 * colors[i][1] + 0.114 * colors[i][2]) / 255;
      let sum = 0, n = 0;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cfg.w || ny >= cfg.h) continue;
        const j = ny * cfg.w + nx;
        sum += (0.299 * colors[j][0] + 0.587 * colors[j][1] + 0.114 * colors[j][2]) / 255;
        n++;
      }
      edges.push(n && Math.abs(l - sum / n) > 0.012 ? 1 : 0);
    }
  }
  return {
    w: cfg.w, h: cfg.h, cells, edges,
    ink: ink / (cfg.w * cfg.h),
    detail: detail / (cfg.w * cfg.h),
    buckets: buckets.size,
    dominant,
  };
}

export async function captureSignature(page) {
  return page.evaluate(sigInPage, { cfg: { ...SIG } });
}

// 从真实的截图 PNG 算指纹（绕开 WebGL 画布读不出来的问题）。
export async function signatureFromBuffer(page, buffer) {
  const b64 = Buffer.from(buffer).toString('base64');
  return page.evaluate(sigInPage, { b64, cfg: { ...SIG } });
}

// 指纹距离：在 RGB 格子上比「这一格的颜色差多少」，主项是"变了的格子占比"。
// 只用亮度会被骗：七幕都是暗调、亮度分布相近，紫幕与绿幕的亮度差不到 3%。
// 所以两幕"看起来完全不是一个地方"的正确度量是色相/结构一起变，而不是亮度均值。
export function distance(a, b) {
  if (!a || !b || a.cells.length !== b.cells.length) return 0;
  let colorSum = 0;
  let edgeDiff = 0;
  for (let i = 0; i < a.cells.length; i++) {
    const ca = a.cells[i], cb = b.cells[i];
    colorSum += Math.max(Math.abs(ca[0] - cb[0]), Math.abs(ca[1] - cb[1]), Math.abs(ca[2] - cb[2])) / 7;
    if ((a.edges?.[i] ?? 0) !== (b.edges?.[i] ?? 0)) edgeDiff++;
  }
  const colorMean = colorSum / a.cells.length;
  const edgeRatio = edgeDiff / a.cells.length;
  return 0.4 * colorMean + 0.6 * edgeRatio;
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

// 阈值说明：暗调像素画里主色本来就占大半画面，ink(偏主色像素) 0.55 不现实——实测第 1 幕 0.14、
// 旧 journey 0.04。改用 detail(局部对比覆盖率) 与 buckets(颜色桶数) 判定"有东西/有层次"。
// buckets：4bit 量化后暗调画天然只有 21–38 桶，18 只用来拦"整屏单一平色"。
// actDistance：格子颜色差(0.4) + 边缘结构差(0.6)；只用亮度会误判（七幕亮度分布相近），
// 只用平均色会低估轮廓差。实测七幕两两 0.21–0.31，取 0.18 留余量。
export const THRESHOLDS = {
  ink: 0.55, detail: 0.12, buckets: 18,
  actDistance: 0.18, kindDistance: 0.1,
};
