// 共振法阵 · 战斗画面外框（雕花画框）
// 480×270 逻辑画布最外层一圈 8px 框体，框的形制随玩家血量陈旧化：
// 颜色向血色插值、裂纹逐档增加、低血改心跳脉动、掉碎屑、四角渗血。
// 时钟约定：所有动画读传进来的 now（调用方传 engine.now），暂停与顿帧会一起冻结。
import { C, pxRect, pxFrame, pxLine, pxPoly } from './Palette.js';
import { Rng } from '../logic/rng.js';

// 几何：8px 框身由五层叠出来，加起来必须正好等于 band
export const FRAME = Object.freeze({
  band: 8,
  outer: 1,      // 外硬描边（outline）
  brassDark: 2,  // 黄铜暗部
  brass: 1,      // 黄铜亮棱
  stone: 3,      // 石质框身
  inner: 1,      // 内硬描边
  ornament: 14,  // 四角角花尺寸
  gem: 4,        // 角花内嵌菱形宝石
  beamW: 120,    // 上沿居中横梁
  beamH: 8,
  notchStep: 32, // 侧边竖向凹槽间距
});

// 内开口（可绘制区）：x 8..471、y 8..261
export const FRAME_INNER = Object.freeze({ left: 8, top: 8, right: 472, bottom: 262 });

// 三档框体状态。数值是设计文档 §3 的表，改这里等于改手感，别散落到别处。
const TONE = Object.freeze({
  intact: { tier: 'intact', breathHz: 0.30, pulseHz: 0, crackCount: 0, debrisPerSec: 0, seep: 0, bloodMix: 0 },
  worn: { tier: 'worn', breathHz: 0.20, pulseHz: 0, crackCount: 3, debrisPerSec: 0, seep: 0.35, bloodMix: 0.35 },
  failing: { tier: 'failing', breathHz: 0, pulseHz: 1.10, crackCount: 6, debrisPerSec: 0.9, seep: 1, bloodMix: 1 },
});

// 两条 0xRRGGBB 颜色按 t 线性插值；t 越界夹到 0..1，非数值当 0
export function mixColor(a, b, t) {
  const k = Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0;
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * k);
  const g = Math.round(ag + (bg - ag) * k);
  const bl = Math.round(ab + (bb - ab) * k);
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (bl & 0xff);
}

// 血量比例 -> 档位。非数值（maxHp 为 0 算出的 NaN / Infinity）按 0 处理，
// 落到破损档而不是抛错：血量读不出来时，画面宁可惨一点也别崩。
export function frameTone(ratio) {
  const r = Number.isFinite(ratio) ? ratio : 0;
  if (r > 0.6) return { ...TONE.intact };
  if (r > 0.3) return { ...TONE.worn };
  return { ...TONE.failing };
}

// 裂纹走位的四条边，按顺序轮转，6 条正好铺满两圈
const EDGE_ORDER = Object.freeze(['top', 'bottom', 'left', 'right']);

// 一条裂纹的骨架：从画布最外沿起笔，沿向内方向走 6~14px，
// 中途在一个像素上横向岔一格（裂缝的"拐"，也让画面不像梳子）。
// 返回 {edge, points:[{x,y}...]}，点与点之间都是 1px 的一步。
export function frameCracks(seed, count) {
  const n = Number.isFinite(count) ? Math.floor(count) : 0;
  if (n <= 0) return [];

  const head = new Rng(`frame-cracks:head:${seed}`);
  const firstEdge = head.int(4);
  const cracks = [];

  for (let i = 0; i < n; i++) {
    // 每条纹路独立取种子：档位从 3 条升到 6 条时，原有 3 条纹路位置不变
    const rng = new Rng(`frame-cracks:${seed}:${i}`);
    const edge = EDGE_ORDER[(firstEdge + i) % 4];
    // 沿边起点：横向边（上/下）有 480 的余量，竖向边（左/右）只有 270，两边分开取
    const horizontal = edge === 'top' || edge === 'bottom';
    const along = 12 + rng.int(horizontal ? 456 : 246);
    // 端点曼哈顿距离 = 向内步数 + 横向岔格 = (7..14-1) + 1 = 7..14
    const span = 7 + rng.int(8);
    const inwardSteps = span - 1;
    const jogAt = 1 + rng.int(Math.max(1, inwardSteps - 1));
    const jogDir = rng.int(2) === 0 ? 1 : -1;

    const points = [];
    for (let step = 0; step <= inwardSteps; step++) {
      points.push(toCanvas(edge, along, step));
      // 在 jogAt 这一步插入一个横向岔点，再回到原线上
      if (step === jogAt) points.push(toCanvas(edge, along + jogDir, step));
    }
    cracks.push({ edge, points });
  }

  return cracks;
}

// 把 (沿边位置, 向内深度) 换成画布坐标
function toCanvas(edge, along, inward) {
  if (edge === 'top') return { x: along, y: inward };
  if (edge === 'bottom') return { x: along, y: 269 - inward };
  if (edge === 'left') return { x: inward, y: along };
  return { x: 479 - inward, y: along };
}

// —— 静态框体 ——————————————————————————————————————————————
// 逻辑画布尺寸写死在这里：画框是屏幕级装饰，不跟世界坐标走。
const W = 480;
const H = 270;
const INK = C.outline;
export const FRAME_DEBRIS_CAP = 8;
// 设计文档写的是 0.06 px/ms²，那是 1 秒内位移 3 万像素的加速度：1px 碎屑 100ms 内就飞出画面，
// 6 帧一闪根本看不见。这里按「1 秒掉出画面」反解，取 0.0006 px/ms²。
const GRAVITY = 0.0006;    // px/ms²，碎屑下落
const DEBRIS_LIFE = 1600;  // ms，一颗碎屑的存活时长

// 框体五层：从外到内 1/2/1/3/1，加起来正好 8px
function paintBands(g, stone, brass, brassDark) {
  pxFrame(g, 0, 0, W, H, INK, FRAME.outer);
  pxFrame(g, FRAME.outer, FRAME.outer, W - FRAME.outer * 2, H - FRAME.outer * 2, brassDark, FRAME.brassDark);
  pxFrame(g, 3, 3, W - 6, H - 6, brass, FRAME.brass);
  pxFrame(g, 4, 4, W - 8, H - 8, stone, FRAME.stone);
  pxFrame(g, 7, 7, W - 14, H - 14, INK, FRAME.inner);
}

// 侧边凹槽：框身石面上每 32px 一道 3×2 的暗槽，读作"框是分段的"
function paintNotches(g, stoneDark) {
  for (let y = 24; y <= H - 24; y += FRAME.notchStep) {
    pxRect(g, 4, y, 3, 2, stoneDark, 0.75);
    pxRect(g, W - 7, y, 3, 2, stoneDark, 0.75);
  }
  for (let x = 24; x <= W - 24; x += FRAME.notchStep) {
    pxRect(g, x, H - 6, 4, 2, stoneDark, 0.75);
  }
}

// 上沿居中横梁：120×8 石面浮雕，三连菱形 + 两侧中线
function paintBeam(g, stone, brass, brassDark) {
  const x0 = (W - FRAME.beamW) / 2;
  pxRect(g, x0, 0, FRAME.beamW, FRAME.beamH, brassDark);
  pxFrame(g, x0, 0, FRAME.beamW, FRAME.beamH, INK, 1);
  pxRect(g, x0 + 1, 1, FRAME.beamW - 2, FRAME.beamH - 2, stone);
  for (const cx of [x0 + 25, W / 2, x0 + FRAME.beamW - 25]) {
    pxPoly(g, diamond(cx, 4, 3), brass);
    pxRect(g, cx - 1, 3, 2, 2, INK, 0.85);
  }
  pxRect(g, x0 + 8, 4, 12, 1, brass);
  pxRect(g, x0 + FRAME.beamW - 20, 4, 12, 1, brass);
}

// 四角角花：14×14 黄铜底 + 内凹石面 + 4px 菱形宝石，向画面内凸出 6px
function paintCorners(g, stone, brass, brassDark, gem) {
  const s = FRAME.ornament;
  const spots = [
    [0, 0],
    [W - s, 0],
    [0, H - s],
    [W - s, H - s],
  ];
  for (const [x, y] of spots) {
    pxRect(g, x, y, s, s, brassDark);
    pxFrame(g, x, y, s, s, INK, 1);
    pxRect(g, x + 2, y + 2, s - 4, s - 4, stone);
    pxFrame(g, x + 2, y + 2, s - 4, s - 4, brass, 1);
    // 角上的小铆钉，让角花不至于是一块平板
    pxRect(g, x + 2, y + 2, 2, 1, brass);
    pxRect(g, x + s - 4, y + s - 3, 2, 1, brass);
    const cx = x + s / 2;
    const cy = y + s / 2;
    pxPoly(g, diamond(cx, cy, 2), gem);
    pxRect(g, cx, cy - 1, 1, 1, C.bone, 0.9);
  }
}

function diamond(cx, cy, r) {
  return [
    { x: cx, y: cy - r },
    { x: cx + r, y: cy },
    { x: cx, y: cy + r },
    { x: cx - r, y: cy },
  ];
}

export default class BattleFrame {
  constructor(scene, seed = 'frame') {
    this.seed = String(seed);
    this.ratio = 1;
    this.tone = frameTone(1);
    // 三层同步创建：静态框体 / 裂纹磨损 / 每帧动态（Task 4 用）
    this.base = scene.add.graphics().setScrollFactor(0).setDepth(6000);
    this.wear = scene.add.graphics().setScrollFactor(0).setDepth(6001);
    this.dyn = scene.add.graphics().setScrollFactor(0).setDepth(6002);
    this.debris = [];
    this.rng = new Rng(`frame-debris:${this.seed}`);
    this.spawnAcc = 0;
    this.drawBase(this.tone);
    this.drawWear(this.tone);
  }

  // 血量比例入口：只有档位真的变了才重绘，避免每帧刷静态层
  setRatio(ratio) {
    const r = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
    const next = frameTone(r);
    const changed = next.tier !== this.tone.tier;
    this.ratio = r;
    if (!changed) return;
    this.tone = next;
    this.base.clear();
    this.wear.clear();
    this.drawBase(next);
    this.drawWear(next);
  }

  // 静态层：只填，不清。清屏由 setRatio 统一做，避免构造函数里多出一次 clear 调用
  drawBase(tone) {
    const stone = mixColor(C.stone, C.blood, tone.bloodMix * 0.6);
    const brass = mixColor(C.brass, C.blood, tone.bloodMix * 0.45);
    const brassDark = mixColor(C.brassDark, C.bloodDark, tone.bloodMix * 0.5);
    const gem = mixColor(C.teal, C.blood, tone.bloodMix);
    paintBands(this.base, stone, brass, brassDark);
    paintNotches(this.base, C.void);
    paintBeam(this.base, stone, brass, brassDark);
    paintCorners(this.base, stone, brass, brassDark, gem);
  }

  // 磨损层：按档位重画裂纹，每条两遍（1px 暗底 + 1px 混色高光）
  drawWear(tone) {
    this.wear.clear();
    const hi = mixColor(C.brassDark, C.blood, tone.bloodMix);
    const cracks = frameCracks(this.seed, tone.crackCount);
    for (const crack of cracks) {
      const pts = crack.points;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        pxLine(this.wear, a.x, a.y, b.x, b.y, C.void, 1);
        pxLine(this.wear, clampX(a.x + 1), clampY(a.y + 1), clampX(b.x + 1), clampY(b.y + 1), hi, 0.85);
      }
    }
  }

  // 每帧入口。dt<=0（暂停、顿帧）时碎屑既不生成也不推进，画面彻底静止
  update({ ratio, now, dt } = {}) {
    const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const t = Number.isFinite(now) ? now : 0;
    this.setRatio(ratio);
    this.dyn.clear();
    this.stepDebris(step);
    this.spawnDebris(step);
    this.paintDyn(t);
  }

  stepDebris(dt) {
    if (dt <= 0) return;
    const alive = [];
    for (const d of this.debris) {
      d.vy += GRAVITY * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.life -= dt;
      if (d.life > 0 && d.y < H && d.x > 0 && d.x < W) alive.push(d);
    }
    this.debris = alive;
  }

  // 期望生成率攒够一颗就掉一颗：低帧率下不会漏，也不会一帧爆一堆
  spawnDebris(dt) {
    const perMs = this.tone.debrisPerSec / 1000;
    if (dt <= 0 || perMs <= 0) return;
    this.spawnAcc += perMs * dt;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (this.debris.length >= FRAME_DEBRIS_CAP) continue;
      this.debris.push(this.makeDebris());
    }
  }

  makeDebris() {
    const r = this.rng;
    const side = r.int(4);
    const along = 8 + r.int(side < 2 ? W - 16 : H - 16);
    const size = r.int(2) === 0 ? 1 : 2;
    const x = side === 0 ? along : side === 1 ? along : side === 2 ? 4 : W - 5;
    const y = side === 0 ? 4 : side === 1 ? H - 5 : along;
    return {
      x,
      y,
      vx: (r.next() - 0.5) * 0.04,
      vy: 0.02 + r.next() * 0.03,
      life: DEBRIS_LIFE * (0.7 + r.next() * 0.6),
      size,
      tone: r.int(2) === 0 ? 'brass' : 'stone',
    };
  }

  // 动态层只用 fillRect：单帧图元控制在 60 以内，斜线交给静态层
  paintDyn(now) {
    const tone = this.tone;
    const g = this.dyn;
    const glow = mixColor(C.brassLight, C.blood, tone.bloodMix);

    // 呼吸：内缘 1px 高光，缓慢明灭；脉动档这层交给心跳
    if (tone.breathHz > 0) {
      const a = 0.18 + 0.12 * Math.sin((2 * Math.PI * tone.breathHz * now) / 1000);
      pxFrame(g, 7, 7, W - 14, H - 14, glow, 1, a);
    }

    // 心跳：低血时内缘 2px 血色光晕，与 HUD 的低血闪烁同频
    if (tone.pulseHz > 0) {
      const k = 0.5 + 0.5 * Math.sin((2 * Math.PI * tone.pulseHz * now) / 1000);
      pxFrame(g, 8, 8, W - 16, H - 16, C.blood, 2, 0.15 + 0.4 * k);
    }

    // 渗血：四角竖向渗痕，长度随呼吸伸缩。上角止在 5px（顶栏文字 y13、心形 y15 之上），
    // 下角直接渗在框体下沿上（y262 起），避开底部提示文字，读作血从角上木缝里漫出来。
    if (tone.seep > 0) {
      const len = Math.round((4 + 6 * (0.5 + 0.5 * Math.sin(now / 900))) * tone.seep);
      const seepColor = mixColor(C.bloodDark, C.blood, tone.seep);
      if (len > 0) {
        for (const s of cornerStreaks()) {
          const l = Math.min(len, s.max);
          if (l <= 0) continue;
          pxRect(g, s.x, s.dir > 0 ? s.y : s.y - l, 2, l, seepColor, 0.85);
        }
      }
    }

    // 宝石高光：四角一像素反光，转得慢，读作"还有一口气"
    const gemA = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(now / 1400));
    for (const [x, y] of gemSpots()) pxRect(g, x, y, 1, 1, C.bone, gemA);

    // 碎屑
    for (const d of this.debris) {
      const color = d.tone === 'brass' ? C.brassDark : C.stoneDark;
      pxRect(g, d.x, d.y, d.size, d.size, color, Math.max(0, Math.min(1, d.life / DEBRIS_LIFE)));
    }
  }
}

// 四角渗血起点（内缘内侧 1px）。dir=1 向下渗，dir=-1 向上渗；max 是该角允许的最大长度
function cornerStreaks() {
  return [
    { x: 15, y: 8, dir: 1, max: 5 },
    { x: W - 17, y: 8, dir: 1, max: 5 },
    { x: 15, y: H - 8, dir: 1, max: 7 },
    { x: W - 17, y: H - 8, dir: 1, max: 7 },
  ];
}

// 四角宝石中心（14×14 角花，中心 7,7）
function gemSpots() {
  return [
    [7, 7],
    [W - 7, 7],
    [7, H - 7],
    [W - 7, H - 7],
  ];
}

function clampX(x) { return Math.max(0, Math.min(W - 1, x)); }
function clampY(y) { return Math.max(0, Math.min(H - 1, y)); }
