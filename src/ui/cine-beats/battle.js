// 四类战斗过场（act / clear / death / victory）的三拍事件。
// 与 short.js 同一套契约：只用活动图层，holdP 0→1 推进，结果拍残留不动。
import { pxRect, C } from '../Palette.js';
import { drawNail, drawLord, drawSoulFire, drawSevenStars, drawAshPile, drawBloodCracks, drawCandle } from '../cine-props.js';

const R = Math.round;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const seg = (p, a, b) => clamp01((p - a) / Math.max(0.0001, b - a));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const TAU = Math.PI * 2;
const START = -Math.PI / 2;

function dot(g, x, y, color, alpha) { pxRect(g, R(x), R(y), 1, 1, color, clamp01(alpha)); }
function arcDots(g, cx, cy, r, steps, color, alpha, spread = TAU) {
  for (let i = 0; i < steps; i++) {
    const a = START + (i / Math.max(1, steps - 1)) * spread;
    dot(g, cx + Math.cos(a) * r, cy + Math.sin(a) * r, color, alpha);
  }
}
// 环境浮尘（与 short.js 同构，保证低 holdP 时也不是空场）
function ambient(g, ctx, color = C.mute) {
  const { w, h, holdP, seed = 1 } = ctx;
  let n = (seed | 0) * 1103515245 + 12345;
  const rnd = () => { n = (n * 1103515245 + 12345) % 2147483648; return n / 2147483648; };
  const y0 = h * 0.36, y1 = h * 0.8;
  for (let i = 0; i < 30; i++) {
    dot(g, rnd() * w, y0 + rnd() * (y1 - y0) - holdP * 5, color, 0.05 + rnd() * 0.07);
  }
  pxRect(g, 0, R(h * 0.82), w, 1, C.nightDeep, 0.35);
}

// 玩家剪影：站立 10×30；跪倒时压低并前倾
function playerSilhouette(g, x, baseY, kneel, alpha, color = C.void) {
  const hh = lerp(30, 19, kneel);
  const yy = baseY - hh;
  pxRect(g, R(x - 2), R(yy), 4, 4, color, alpha);
  pxRect(g, R(x - 4), R(yy + 4), 8, R(hh - 10), color, alpha);
  pxRect(g, R(x - 5), R(baseY - 6), 11, 5, color, alpha);
  if (kneel > 0.4) pxRect(g, R(x + 3), R(baseY - 4), 5, 4, color, alpha);
  pxRect(g, R(x - 4), R(yy + 5), 1, R(hh - 12), C.stoneLight, 0.18 * alpha);
}

// —— act：门缝光 → 契约主现身 → 幕数字压印（碑座由 CutsceneScene 负责，事件只给光柱）——
export const act = {
  beats: { prepare: [0, 0.25], action: [0.25, 0.68], result: [0.68, 1] },
  draw(scene, ctx) {
    const g = scene.stageG;
    const { w, h, holdP, accent, anchors } = ctx;
    const gate = anchors?.gate ?? anchors?.seal ?? { x: w / 2, y: h * 0.4 };
    const lord = anchors?.lord ?? { x: w / 2, y: h * 0.56 };
    const p = holdP;
    ambient(g, ctx, accent);
    // 门缝：宽 1→6px，高 len 随幕
    const t1 = easeOut(seg(p, 0, 0.25));
    const slitW = Math.max(1, R(lerp(1, 6, t1)));
    const doorH = Math.max(10, R(h * 0.18));
    const gx = gate.x, gy = gate.y;
    pxRect(g, R(gx - slitW / 2), R(gy - doorH), slitW, doorH, accent, 0.85);
    pxRect(g, R(gx - slitW / 2 - 1), R(gy - doorH), slitW + 2, doorH, accent, 0.16);
    // 地面上的光柱（越到结果越短）
    const spill = R(lerp(0, 22, t1) * (p > 0.68 ? 0.7 : 1));
    for (let i = 0; i < spill; i += 2) pxRect(g, R(gx - (6 - i * 0.05)), R(gy + i), R(12 - i * 0.1), 1, accent, 0.07);
    // 契约主：行动拍现身（fade 0→1）
    const fade = easeOut(seg(p, 0.25, 0.5));
    if (fade > 0.02) {
      drawLord(g, { x: lord.x ?? gx, y: (lord.y ?? gy + doorH) - 40, act: ctx.act ?? 1, alpha: 1, fade, accent });
    }
    // 压印拍：脚下圆环脉冲 + 两侧描边（数字本体是文字对象，不在这里画）
    if (p >= 0.5) {
      const t = seg(p, 0.5, 0.68);
      const r = lerp(26, 40, t);
      arcDots(scene.sealG, gx, gy, r, 12, accent, 0.5 * (1 - t * 0.4));
      if (t > 0.5) arcDots(scene.sealG, gx, gy, r + 4, 12, accent, 0.2);
    }
    return { residue: this.residueAt(p) };
  },
  residueAt(p) {
    return p >= 0.68 ? ['door-slit', 'lord', 'numeral'] : [];
  },
};

// —— clear：契约主颤动 → 崩解成灰 → 契约钉被拔起断成两截 ——
export const clear = {
  beats: { prepare: [0, 0.15], action: [0.15, 0.7], result: [0.7, 1] },
  draw(scene, ctx) {
    const g = scene.stageG;
    const { w, h, holdP, accent, tint, anchors } = ctx;
    const lord = anchors?.lord ?? { x: w / 2, y: h * 0.5 };
    const nail = anchors?.nail ?? { x: w / 2, y: h * 0.7 };
    const p = holdP;
    ambient(g, ctx, C.stoneLight);
    const lx = lord.x ?? w / 2, ly = lord.y ?? h * 0.5;
    // 颤动：±1px 三次
    const shake = p < 0.15 ? [0, -1, 1, -1, 1, 0][Math.floor(seg(p, 0, 0.15) * 6)] : 0;
    // 崩解：0.15→0.45 剪影变淡，8 缕灰上浮
    const dissolve = seg(p, 0.15, 0.45);
    const lordAlpha = 1 - dissolve;
    if (lordAlpha > 0.02) drawLord(g, { x: lx + shake, y: ly - 40, act: ctx.act ?? 1, alpha: lordAlpha, fade: 1, accent });
    for (let i = 0; i < 8; i++) {
      if (dissolve <= 0) break;
      const rise = easeOut(seg(p, 0.15 + i * 0.02, 0.6));
      const ax = lx + ((i % 4) - 1.5) * 5 + Math.sin(i) * 2;
      const ay = ly - 30 - rise * (24 + i * 2) + shake;
      dot(g, ax, ay, i % 3 === 0 ? C.ash : tint, (0.5 - rise * 0.3) * (1 - seg(p, 0.7, 1)));
      if (i % 2 === 0) dot(g, ax + 1, ay + 2, C.mute, 0.22);
    }
    // 拔钉断两截：0.45→0.70
    if (p >= 0.45) {
      const t = easeOut(seg(p, 0.45, 0.7));
      const nx = nail.x ?? w / 2, ny = nail.y ?? h * 0.7;
      const lift = lerp(0, 12, t);
      drawNail(g, { x: nx - t * 4, y: ny - lift, len: 10, color: C.stoneLight, alpha: 1 });
      if (t > 0.5) {
        const t2 = seg(p, 0.55, 0.75);
        drawNail(g, { x: nx + 3 + t2 * 6, y: ny - lift * 0.5, len: 6, color: C.ash, alpha: 0.9 });
        pxRect(g, R(nx - 2), R(ny - lift + 6), 3, 1, C.void, 0.6);
      }
      drawAshPile(g, { x: nx, y: ny + 3, w: R(lerp(4, 18, t)), h: R(lerp(1, 5, t)), seed: 9, color: C.ash });
    }
    if (p >= 0.7) {
      // 余烬 2 点
      dot(g, (nail.x ?? w / 2) - 6, (nail.y ?? h * 0.7) + 2, C.arcane, 0.35);
      dot(g, (nail.x ?? w / 2) + 5, (nail.y ?? h * 0.7) + 1, C.arcane, 0.2);
    }
    return { residue: this.residueAt(p) };
  },
  residueAt(p) {
    return p >= 0.7 ? ['ash-pile', 'broken-nail', 'cracks', 'embers'] : [];
  },
};

// —— death：跪倒 → 魂火升起被吹散 → 血纹 4 段蔓延 ——
export const death = {
  beats: { prepare: [0, 0.3], action: [0.3, 0.85], result: [0.85, 1] },
  draw(scene, ctx) {
    const g = scene.stageG;
    const { w, h, holdP, accent, anchors } = ctx;
    const lie = anchors?.lord ?? anchors?.seal ?? { x: w / 2, y: h * 0.6 };
    const p = holdP;
    ambient(g, ctx, C.stoneDark);
    const x = lie.x ?? w / 2;
    const baseY = Math.min(h * 0.8, (lie.y ?? h * 0.6) + 26);
    const kneel = easeOut(seg(p, 0, 0.3));
    playerSilhouette(g, x, baseY, kneel, 1);
    // 魂火：0.30 升起，0.45 后横向吹散
    if (p >= 0.3) {
      const rise = easeOut(seg(p, 0.3, 0.45));
      const blow = seg(p, 0.45, 0.62);
      const fx = x + blow * 26, fy = baseY - 20 - rise * 14 - blow * 6;
      drawSoulFire(g, { x: fx, y: fy, r: R(lerp(3, 6, rise)), alpha: 0.9 * (1 - blow * 0.9) });
      // 被吹散的 4 缕
      for (let i = 0; i < 4; i++) {
        dot(g, fx + blow * (8 + i * 7), fy - i * 2 + blow * i * 3, C.teal, 0.3 * (1 - blow));
      }
    }
    // 血纹：0.62 起 4 段从脚下蔓延
    const blood = seg(p, 0.62, 0.85);
    if (blood > 0) {
      drawBloodCracks(g, { x, y: baseY + 1, len: R(lerp(6, 30, blood)), seed: 3, lit: Math.ceil(blood * 4), alpha: 0.9 });
    }
    // 结果拍：两盏烛熄灭（画在两侧作为静物），血纹停住
    const cx1 = x - 56, cx2 = x + 56;
    drawCandle(g, { x: cx1, y: baseY + 2, h: 10, lit: p < 0.85 });
    drawCandle(g, { x: cx2, y: baseY + 2, h: 12, lit: p < 0.85 });
    if (p >= 0.85) {
      for (let i = 0; i < 2; i++) {
        const cx = i === 0 ? cx1 : cx2;
        for (let k = 1; k <= 3; k++) dot(g, cx + k * 0.8, baseY - 8 - k * 3, C.mute, 0.18);
      }
      dot(g, x, baseY + 1, C.bloodDark, 0.5);
    }
    return { residue: this.residueAt(p) };
  },
  residueAt(p) {
    return p >= 0.85 ? ['blood-cracks', 'candle-out', 'ash'] : [];
  },
};

// —— victory：七钉自北斗方位升起 → 向心汇成一枚星炸开 → 七星连线常亮 ——
export const victory = {
  beats: { prepare: [0, 0.42], action: [0.42, 0.7], result: [0.7, 1] },
  draw(scene, ctx) {
    const g = scene.stageG;
    const { w, h, holdP, accent, anchors } = ctx;
    const seal = anchors?.seal ?? { x: w / 2, y: h * 0.45 };
    const cx = seal.x ?? w / 2, cy = seal.y ?? h * 0.45;
    const p = holdP;
    ambient(g, ctx, accent);
    const span = Math.min(w * 0.4, h * 0.6);
    // 七星：准备拍逐颗点亮，结果拍全亮且连线
    const riseT = easeOut(seg(p, 0, 0.42));
    const lit = [];
    for (let i = 0; i < 7; i++) lit.push(p >= 0.06 * i);
    const starR = lerp(span * 0.5, span, riseT);
    drawSevenStars(g, { cx, cy, r: starR, alpha: p < 0.94 ? 1 : 0.9, lit, connect: p >= 0.7, color: p >= 0.7 ? C.parchment : accent, link: accent });
    // 七钉：从画面下方升到各自星位（0–0.42）
    const DIPPER = [
      [-0.95, -0.16], [-0.58, -0.44], [-0.2, -0.3], [-0.04, 0.12],
      [0.26, 0.44], [0.66, 0.22], [0.95, -0.18],
    ];
    for (let i = 0; i < 7; i++) {
      const ux = DIPPER[i][0], uy = DIPPER[i][1];
      const tx = cx + ux * starR, ty = cy + uy * starR;
      const fromY = h * 0.92;
      const ny = lerp(fromY, ty, riseT);
      const nx = lerp(cx + ux * starR * 0.7, tx, riseT);
      if (p >= 0.42 && p < 0.7) {
        // 向心：钉从星位飞向中心
        const t = easeOut(seg(p, 0.42, 0.7));
        const mx = lerp(tx, cx, t), my = lerp(ty, cy, t);
        drawNail(g, { x: mx, y: my, len: R(lerp(8, 3, t)), color: accent, alpha: 1 - t * 0.3, shadow: false });
      } else if (p >= 0.7) {
        drawNail(g, { x: tx, y: ty - 2, len: 6, color: accent, alpha: 0.95, shadow: false });
      } else {
        drawNail(g, { x: nx, y: ny, len: 8, color: C.stoneLight, alpha: 0.9 });
      }
    }
    // 汇聚点炸开：0.62–0.75 闪光环
    if (p >= 0.6) {
      const t = seg(p, 0.6, 0.78);
      if (t < 1) {
        arcDots(scene.fxG, cx, cy, lerp(2, 54, easeOut(t)), 24, C.parchment, 0.7 * (1 - t));
        arcDots(scene.fxG, cx, cy, lerp(2, 30, easeOut(t)), 16, accent, 0.5 * (1 - t));
      }
      if (p >= 0.7) {
        pxRect(scene.fxG, R(cx - 2), R(cy - 2), 5, 5, C.parchment, 0.85);
        arcDots(scene.fxG, cx, cy, 14, 12, accent, 0.25);
      }
    }
    return { residue: this.residueAt(p) };
  },
  residueAt(p) {
    return p >= 0.7 ? ['seven-stars', 'seven-nails', 'star-spot'] : [];
  },
};

export const BATTLE_EVENTS = { act, clear, death, victory };
export function getBattleEvent(kind) {
  return BATTLE_EVENTS[kind] ?? null;
}
