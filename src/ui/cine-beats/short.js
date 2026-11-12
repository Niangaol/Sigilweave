// 四类短过场（boot / sigil / retry / return）的三拍事件。
// 布景是静态的（七幕 diorama），这里只画活动件：阶段内用 holdP 0→1 推进，
// 结果拍（result）结束后残留留在画面上，揭开始终保留。
import { pxRect, C } from '../Palette.js';
import { drawCandle, drawNail, drawFog } from '../cine-props.js';

const R = Math.round;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
// 段内进度：把 holdP 映射成某拍自己的 0→1
const seg = (p, a, b) => clamp01((p - a) / Math.max(0.0001, b - a));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - (1 - t) * (1 - t);

function dot(g, x, y, color, alpha) {
  pxRect(g, R(x), R(y), 1, 1, color, clamp01(alpha));
}
// 1px 点弧：steps 个点，从 a0 到 a1（弧度）
function arcDots(g, cx, cy, r, a0, a1, steps, color, alpha) {
  for (let i = 0; i < steps; i++) {
    const a = lerp(a0, a1, i / Math.max(1, steps - 1));
    dot(g, cx + Math.cos(a) * r, cy + Math.sin(a) * r, color, alpha);
  }
}
const TAU = Math.PI * 2;
const START = -Math.PI / 2;


// 环境浮尘：保证每个时刻都不是空场，也让揭开的静态布景有空气感。
function ambient(g, ctx, color = C.mute) {
  const { w, h, holdP, seed = 1 } = ctx;
  let n = (seed | 0) * 1103515245 + 12345;
  const rnd = () => { n = (n * 1103515245 + 12345) % 2147483648; return n / 2147483648; };
  const y0 = h * 0.36, y1 = h * 0.8;
  for (let i = 0; i < 20; i++) {
    const x = rnd() * w;
    const y = y0 + rnd() * (y1 - y0) - holdP * 6 * rnd();
    dot(g, x, y, color, 0.06 + rnd() * 0.08);
  }
  pxRect(g, 0, R(h * 0.82), w, 1, C.nightDeep, 0.35);
  pxRect(g, 0, R(h * 0.82) - 1, w, 1, color, 0.05);
}

function candlesAt(g, cx, baseY, litCount, alpha, spread = 30) {
  for (let i = 0; i < 3; i++) {
    const x = cx + (i - 1) * spread;
    drawCandle(g, { x, y: baseY, h: i === 1 ? 14 : 11, lit: i < litCount, alpha });
    if (i < litCount) {
      // 烛座光晕：地面上的小亮斑
      pxRect(g, R(x - 4), R(baseY + 1), 9, 1, C.arcane, 0.12 * alpha);
    }
  }
}

// —— boot：三烛依次点燃 → 火苗拉成符环 → 环常明 ——
export const boot = {
  beats: { prepare: [0, 0.35], action: [0.35, 0.75], result: [0.75, 1] },
  draw(scene, ctx) {
    const g = scene.stageG;
    const { w, h, holdP, accent, anchors } = ctx;
    const cx = anchors?.seal?.x ?? w / 2;
    const cy = anchors?.seal?.y ?? h * 0.45;
    const baseY = h * 0.82;
    const p = holdP;
    ambient(g, ctx);
    const lit = p < 0.12 ? 0 : p < 0.22 ? 1 : p < 0.32 ? 2 : 3;
    candlesAt(g, cx, baseY, lit, 1);
    // 火苗拉成环：9 段弧 + 三段连接火舌
    if (p >= 0.35) {
      const t = easeOut(seg(p, 0.35, 0.75));
      const r = lerp(26, 64, t);
      const sg = scene.sealG;
      const sweep = Math.max(0.08, t) * TAU;
      arcDots(sg, cx, cy, r, START, START + sweep, Math.max(6, R(9 + t * 20)), accent, 0.85);
      arcDots(sg, cx, cy, r - 3, START, START + sweep, Math.max(4, R(5 + t * 12)), accent, 0.3);
      for (let i = 0; i < 3; i++) {
        const x = cx + (i - 1) * 30;
        const tip = baseY - 18;
        const a = START + (i / 3) * TAU;
        const ex = cx + Math.cos(a) * r * t;
        const ey = cy + Math.sin(a) * r * t;
        // 火舌：从烛焰斜拉向环（每缕 3 段）
        for (let k = 1; k <= 3; k++) {
          const u = k / 3;
          dot(g, lerp(x, ex, u), lerp(tip, ey, u), C.arcane, 0.55 - u * 0.25);
        }
      }
      if (t >= 1) arcDots(sg, cx, cy, r, 0, TAU, 26, accent, 0.18);
    }
    return { residue: this.residueAt(p) };
  },
  residueAt(p) {
    return p >= 0.75 ? ['candle-1', 'candle-2', 'candle-3', 'ring'] : [];
  },
};

// —— sigil：钉自上方落下 → 触石震屏、石屑、闪洪 → 符环从钉帽外扩 ——
export const sigil = {
  beats: { prepare: [0, 0.28], action: [0.28, 0.45], result: [0.45, 1] },
  draw(scene, ctx) {
    const g = scene.stageG;
    const { w, h, holdP, accent, anchors } = ctx;
    const ax = anchors?.nail ?? { x: w / 2, y: h * 0.72 };
    const x = ax.x;
    const groundY = ax.y;
    const p = holdP;
    ambient(g, ctx, C.stoneLight);
    // 落钉：从地面向上 40px 处落到地面
    const fall = easeOut(seg(p, 0, 0.28));
    const y = lerp(groundY - 44, groundY, fall);
    if (p < 0.28) {
      // 拖影 2 段
      pxRect(g, R(x), R(y - 18), 1, 8, C.stoneLight, 0.18);
      pxRect(g, R(x), R(y - 10), 1, 6, C.stoneLight, 0.28);
    }
    drawNail(g, { x, y, len: 14, color: C.stoneLight, alpha: 1 });
    if (p >= 0.28) {
      const t = seg(p, 0.28, 0.45);
      // 触石：石屑 8 粒
      const shard = R(8 * easeOut(t));
      for (let i = 0; i < shard; i++) {
        const a = -Math.PI + (i / 8) * Math.PI;
        const d = 6 + (i % 3) * 4;
        dot(g, x + Math.cos(a) * d * t, groundY + Math.sin(a) * d * 0.6 * t, C.stoneLight, 0.7);
      }
      // 闪洪 1 次（fxG）
      if (t > 0.2 && t < 0.8) {
        pxRect(scene.fxG, R(x - 26), R(groundY - 3), 52, 2, C.parchment, 0.25 * (1 - t));
      }
    }
    if (p >= 0.45) {
      const t = easeOut(seg(p, 0.45, 1));
      const r = lerp(18, 72, t);
      const sg = scene.sealG;
      arcDots(sg, x, y - 2, r, 0, TAU, 28, accent, 0.7 * Math.min(1, 0.3 + t));
      arcDots(sg, x, y - 2, r - 4, 0, TAU, 14, accent, 0.22);
      // 3 条裂痕从钉脚辐射
      for (let i = 0; i < 3; i++) {
        const a = Math.PI * (0.2 + i * 0.3);
        for (let k = 1; k <= 4; k++) {
          dot(g, x + Math.cos(a) * k * 4, groundY + Math.sin(a) * k * 2, C.void, 0.6);
        }
      }
    }
    return { residue: this.residueAt(p) };
  },
  residueAt(p) {
    return p >= 0.45 ? ['nail', 'ring', 'cracks', 'shards'] : [];
  },
};

// —— retry：断口 → 刻笔逐段描过 → 刻线合拢发光 ——
const RETRY_PATH = [
  [-34, 0], [-24, -3], [-14, 2], [-5, -2], [4, 3], [13, -1], [22, 2], [30, 0],
];
export const retry = {
  beats: { prepare: [0, 0.2], action: [0.2, 0.7], result: [0.7, 1] },
  draw(scene, ctx) {
    const g = scene.stageG;
    const { w, h, holdP, accent } = ctx;
    const cx = w / 2;
    const cy = h * 0.55;
    const p = holdP;
    ambient(g, ctx, C.stoneDark);
    // 6 段断口：准备时只有零散暗刻
    const litCount = p < 0.2 ? 0 : Math.min(6, 1 + Math.floor(seg(p, 0.2, 0.7) * 6));
    const path = RETRY_PATH.map(([dx, dy]) => [cx + dx, cy + dy]);
    for (let i = 0; i < path.length - 1; i++) {
      const [x1, y1] = path[i];
      const [x2, y2] = path[i + 1];
      const on = i < litCount;
      const a = on ? 0.85 : 0.14;
      // 每段 4 个点，硬边
      for (let k = 0; k <= 4; k++) {
        dot(g, lerp(x1, x2, k / 4), lerp(y1, y2, k / 4), on ? accent : C.stoneDark, a);
      }
      if (on) dot(g, x2, y2 - 1, accent, 0.4);
    }
    // 笔尖：行动拍沿路径移动，结果拍停在末端并留余点
    if (p >= 0.2) {
      const t = seg(p, 0.2, 0.7);
      const idx = Math.min(path.length - 2, Math.floor(t * (path.length - 1)));
      const local = t * (path.length - 1) - idx;
      const [x1, y1] = path[idx];
      const [x2, y2] = path[idx + 1];
      const nx = lerp(x1, x2, local);
      const ny = lerp(y1, y2, local);
      pxRect(g, R(nx), R(ny - 2), 1, 5, C.parchment, p < 0.7 ? 0.9 : 0.25);
      if (p >= 0.7) {
        dot(g, path[path.length - 1][0], path[path.length - 1][1] - 2, accent, 0.6);
        for (let k = 0; k < 3; k++) dot(g, cx + 6 + k * 3, cy + 8, accent, 0.3 - k * 0.08);
      }
    }
    return { residue: this.residueAt(p) };
  },
  residueAt(p) {
    return p >= 0.7 ? ['line', 'nib'] : [];
  },
};

// —— return：雾自两侧卷入 → 烛逐盏熄灭 → 只余中央一盏 ——
export const returnTo = {
  beats: { prepare: [0, 0.35], action: [0.35, 0.8], result: [0.8, 1] },
  draw(scene, ctx) {
    const g = scene.stageG;
    const { w, h, holdP, accent } = ctx;
    const p = holdP;
    const baseY = h * 0.82;
    const cx = w / 2;
    ambient(g, ctx);
    // 雾：左右各 3 缕，自边缘卷到中央脚下
    const fogT = easeOut(seg(p, 0, 0.8));
    for (let i = 0; i < 3; i++) {
      const y = baseY - 8 + i * 5;
      const spread = lerp(w * 0.46, w * 0.3, fogT);
      drawFog(g, { x: cx - spread, y, w: spread * 2, count: 1, seed: 11 + i, color: C.fog, alpha: 0.1 + 0.06 * fogT });
    }
    drawFog(g, { x: cx - w * 0.34, y: baseY + 2, w: w * 0.68, count: 1, seed: 19, color: C.fog, alpha: 0.16 * fogT });
    // 三烛：行动拍逐盏熄灭（3→2→1）
    const out = p < 0.35 ? 0 : p < 0.5 ? 1 : p < 0.65 ? 2 : 2;
    for (let i = 0; i < 3; i++) {
      const x = cx + (i - 1) * 34;
      const lit = i === 1 ? true : i < out ? false : true;
      drawCandle(g, { x, y: baseY, h: i === 1 ? 14 : 11, lit, alpha: 1 });
      if (lit) pxRect(g, R(x - 4), R(baseY + 1), 9, 1, C.arcane, 0.12);
      else {
        // 熄掉的烛：一缕文烟
        for (let k = 1; k <= 3; k++) dot(g, x + k * 0.6, baseY - 12 - k * 3, C.mute, 0.22 - k * 0.05 + 0.1 * fogT);
      }
    }
    return { residue: this.residueAt(p) };
  },
  residueAt(p) {
    return p >= 0.8 ? ['candle-mid', 'fog', 'smoke'] : [];
  },
};

export const SHORT_EVENTS = { boot, sigil, retry, return: returnTo };
export function getShortEvent(kind) {
  return SHORT_EVENTS[kind] ?? null;
}
