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
  failing: { tier: 'failing', breathHz: 0, pulseHz: 1.10, crackCount: 6, debrisPerSec: 4, seep: 1, bloodMix: 1 },
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
  if (r > 0.6) return TONE.intact;
  if (r > 0.3) return TONE.worn;
  return TONE.failing;
}

// 裂纹走位的四条边，按顺序轮转，6 条正好铺满两圈
const EDGE_ORDER = Object.freeze(['top', 'bottom', 'left', 'right']);

// 一条裂纹的骨架：从画布最外沿起笔，沿向内方向走 4~6px（加 1px 内衬最多 7px），
// 中途在一个像素上横向岔一格（裂缝的"拐"，也让画面不像梳子）。
// 深度必须小于 band(8)：内开口从 x/y=8 起就是 HUD 与罗盘的地盘，裂纹只能裂在框身上。
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
    // 终点曼哈顿距离 = 向内步数 = 4..6，加上 1px 内衬高光最多到 7，仍留在 8px 框身里
    const span = 5 + rng.int(3);
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
// 6 帧一闪根本看不见。这里按「1.5 秒左右从框上掉到画布底」反解：0.0002 px/ms² + 初速 0.02~0.05。
const GRAVITY = 0.0002;    // px/ms²，碎屑下落
const DEBRIS_LIFE = 2600;  // ms，一颗碎屑的存活时长（长于落地时间，寿命不再是隐形原因）

// 框体五层的偏移由 FRAME 递推：从外到内 1/2/1/3/1，加起来正好 8px。
// 不要把这些数字写死，改厚度时几何会悄悄错位。
const BAND_OFFSETS = Object.freeze((() => {
  const out = [];
  let at = 0;
  for (const thickness of [FRAME.outer, FRAME.brassDark, FRAME.brass, FRAME.stone, FRAME.inner]) {
    out.push(Object.freeze({ at, thickness }));
    at += thickness;
  }
  return out;
})());

function paintBands(g, stone, brass, brassDark) {
  const [outer, dark, light, body, line] = BAND_OFFSETS;
  pxFrame(g, outer.at, outer.at, W - outer.at * 2, H - outer.at * 2, INK, outer.thickness);
  pxFrame(g, dark.at, dark.at, W - dark.at * 2, H - dark.at * 2, brassDark, dark.thickness);
  pxFrame(g, light.at, light.at, W - light.at * 2, H - light.at * 2, brass, light.thickness);
  pxFrame(g, body.at, body.at, W - body.at * 2, H - body.at * 2, stone, body.thickness);
  pxFrame(g, line.at, line.at, W - line.at * 2, H - line.at * 2, INK, line.thickness);
}

// 侧边凹槽：框身石面上每 32px 一道 3×2 的暗槽，读作"框是分段的"
function paintNotches(g, stoneDark) {
  for (let y = 24; y <= H - 24; y += FRAME.notchStep) {
    pxRect(g, 4, y, 3, 2, stoneDark, 0.75);
    pxRect(g, W - 7, y, 3, 2, stoneDark, 0.75);
  }
  // 下沿凹槽严格对称：以 x=W/2 为轴成对落槽，避免中线偏半格
  for (let d = 8; W / 2 - d - 4 >= 24; d += FRAME.notchStep) {
    pxRect(g, W / 2 - d - 4, H - 6, 4, 2, stoneDark, 0.75);
    pxRect(g, W / 2 + d, H - 6, 4, 2, stoneDark, 0.75);
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
  // 横梁两侧各 40px 短竖纹（每 8px 一道竖槽），把横梁"钉"在上沿石面上
  for (let i = 1; i <= 5; i++) {
    pxRect(g, x0 - i * 8, 2, 1, 4, brassDark);
    pxRect(g, x0 + FRAME.beamW + i * 8 - 1, 2, 1, 4, brassDark);
  }
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
    this.tone = frameTone(1);
    // 三层同步创建：静态框体 / 裂纹磨损 / 每帧动态（Task 4 用）
    this.base = scene.add.graphics().setScrollFactor(0).setDepth(6000);
    this.wear = scene.add.graphics().setScrollFactor(0).setDepth(6001);
    this.dyn = scene.add.graphics().setScrollFactor(0).setDepth(6002);
    this.debris = [];
    this.spare = [];   // stepDebris 的双缓冲：复用数组，避免每帧新建（也避免自己清自己）
    this.rng = new Rng(`frame-debris:${this.seed}`);
    this.spawnAcc = 0;
    this.drawBase(this.tone);
    this.drawWear(this.tone);
  }

  // 血量比例入口：只有档位真的变了才重绘，避免每帧刷静态层
  setRatio(ratio) {
    const r = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
    const next = frameTone(r);
    if (next.tier === this.tone.tier) return;
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
      const dir = INSET_DIR[crack.edge];
      const pts = crack.points;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        pxLine(this.wear, a.x, a.y, b.x, b.y, C.void, 1);
        pxLine(this.wear, clampX(a.x + dir.x), clampY(a.y + dir.y), clampX(b.x + dir.x), clampY(b.y + dir.y), hi, 0.85);
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

  // 双缓冲：先把活着的搬进 spare，再交换引用。直接在 this.debris 上 length=0
  // 会把自己清空后再遍历自己（碎屑永远剩不到 2 颗），这个坑吃过一次。
  stepDebris(dt) {
    if (dt <= 0) return;
    const next = this.spare;
    next.length = 0;
    for (const d of this.debris) {
      d.vy += GRAVITY * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.life -= dt;
      // 横向抖动也不许离开框身：碎屑最宽 2px，左窄带 2..6、右窄带 W-7..W-3
      const lo = d.side === 'right' ? W - 7 : 2;
      d.x = Math.min(Math.max(d.x, lo), lo + 4);
      if (d.life > 0 && d.y < H && d.x > 0 && d.x < W) next.push(d);
    }
    this.spare = this.debris;
    this.debris = next;
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

  // 碎屑只从左右两条竖框掉：上沿掉渣要横穿整幅画面才落地（终审 nit：59.7% 的帧
  // 碎屑悬在画面上方），读作画面里的噪点而不是画框在碎；下沿一生成就出画，也不掉。
  // 这样每一颗都沿框身下滑，全程不出 8px 框身。
  makeDebris() {
    const r = this.rng;
    const side = r.int(2) === 0 ? 'left' : 'right';
    const inset = 3 + r.int(4);
    return {
      side,
      x: side === 'left' ? inset : W - 1 - inset,
      y: 10 + r.int(H - 20),
      vx: (r.next() - 0.5) * 0.008,
      vy: 0.02 + r.next() * 0.03,
      life: DEBRIS_LIFE * (0.7 + r.next() * 0.6),
      size: r.int(3) === 0 ? 1 : 2,              // 2×2 为主：1px 在 480×270 上读作噪点
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
        for (const s of CORNER_STREAKS) {
          const l = Math.min(len, s.max);
          if (l <= 0) continue;
          pxRect(g, s.x, s.dir > 0 ? s.y : s.y - l, 2, l, seepColor, 0.85);
        }
      }
    }

    // 宝石高光：四角一像素反光，转得慢，读作"还有一口气"
    const gemA = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(now / 1400));
    for (const [x, y] of GEM_SPOTS) pxRect(g, x, y, 1, 1, C.bone, gemA);

    // 碎屑
    for (const d of this.debris) {
      const color = d.tone === 'brass' ? C.brassDark : C.stoneDark;
      pxRect(g, d.x, d.y, d.size, d.size, color, Math.max(0, Math.min(1, d.life / DEBRIS_LIFE)));
    }
  }
}

// 四角渗血起点（内缘内侧 1px）。dir=1 向下渗，dir=-1 向上渗；max 是该角允许的最大长度
const CORNER_STREAKS = Object.freeze([
  Object.freeze({ x: 15, y: 8, dir: 1, max: 5 }),
  Object.freeze({ x: W - 17, y: 8, dir: 1, max: 5 }),
  Object.freeze({ x: 15, y: H - 8, dir: 1, max: 7 }),
  Object.freeze({ x: W - 17, y: H - 8, dir: 1, max: 7 }),
]);

// 四角宝石中心（14×14 角花，中心 7,7）
const GEM_SPOTS = Object.freeze([
  Object.freeze([7, 7]),
  Object.freeze([W - 7, 7]),
  Object.freeze([7, H - 7]),
  Object.freeze([W - 7, H - 7]),
]);

// 裂纹高光往"框身内侧"偏 1px：上/左加、下/右减。深度 <= 6 时偏移后仍 <= 7，不会越界
const INSET_DIR = Object.freeze({
  top: Object.freeze({ x: 0, y: 1 }),
  bottom: Object.freeze({ x: 0, y: -1 }),
  left: Object.freeze({ x: 1, y: 0 }),
  right: Object.freeze({ x: -1, y: 0 }),
});

function clampX(x) { return Math.max(0, Math.min(W - 1, x)); }
function clampY(y) { return Math.max(0, Math.min(H - 1, y)); }
