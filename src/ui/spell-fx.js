// 共振法阵 · 16 个符印法术的像素特效库
// 纯绘制：不 import Phaser、不访问 scene，只吃传入的 Graphics 与 ctx（世界坐标/数值）。
// 纪律：硬边色块 / 整数坐标 / 三层结构（暗描边 C.outline → 本体 body → 亮芯 core），
//       禁止 Math.random、渐变、模糊；alpha 只做整体生命周期淡出（随 k 单调不增）。
import { C } from './Palette.js';

// ---------------------------------------------------------------------------
// 接线约定（给 BattleScene / EffectsLayer 的接线者）
//   · 六个函数都只吃 (g, defId, ctx)，g 是任意 Phaser.Graphics；调用方负责 clear()。
//   · 每帧一个特效一个 Graphics 就够：本库只"画"，不管生命周期、深度、清理。
//   · ctx 字段：x / y / angle（弧度，0 = 朝 +x，与 Math.atan2(dy, dx) 一致）/ k（0..1
//     生命周期）/ clock（毫秒，做相位动画，暂停时冻结即自动定格）/ radius / trail / from / to。
//     缺字段不会抛错，按 0 / 默认 14 处理，但会"少画"。
//   · drawImpactFx 的 pierce / echo / soul / ember 会读可选 ctx.angle 决定方向；不传就当 0
//     （朝右），给的话贯穿光束/镜像回声/拉回丝线才和飞行方向一致。
//   · drawWardFx 必须传 radius（holy_ward 40 / aegis_ring 55），否则环绕圈缩到默认 14。
//   · drawLinkFx 必须传 from / to；index 只做相位错开（同一帧多条链不重叠）。
//   · 建议深度：拖尾 < 弹体 < 命中 < 护盾（护盾压在角色之上，别盖 UI）。
//   · opBudget = 六个函数里单次调用的最坏绘制调用数（含 fillStyle 切换，不含 clear），
//     实测值，测试会守住这条线；需求硬上限为 40/30/30/80/80/30。
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2;
const clamp01 = (v) => (v <= 0 ? 0 : v >= 1 ? 1 : v);
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const rnd = (v) => Math.round(v);

// 确定性伪随机：抖动只用整数哈希，绝不用 Math.random
function hash01(seed) {
  let x = Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  x = (x ^ (x >>> 13)) >>> 0;
  x = Math.imul(x, 0xc2b2ae35) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

// ---------- 基础绘制原语（每个原语自己承担 fillStyle，省调用） ----------

function poly(g, pts, color, alpha, close = true) {
  if (!pts || pts.length < 3) return;
  const out = new Array(pts.length);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    // 兼容 [x, y] 与 { x, y } 两种顶点写法
    out[i] = Array.isArray(p) ? { x: rnd(p[0]), y: rnd(p[1]) } : { x: rnd(p.x), y: rnd(p.y) };
  }
  g.fillStyle(color, alpha);
  g.fillPoints(out, close);
}

function dots(g, pts, color, alpha) {
  if (!pts || !pts.length) return;
  g.fillStyle(color, alpha);
  for (let i = 0; i < pts.length; i++) g.fillRect(rnd(pts[i].x), rnd(pts[i].y), 1, 1);
}

function blocks(g, pts, color, alpha, size = 2) {
  if (!pts || !pts.length) return;
  const s = Math.max(1, rnd(size));
  const o = Math.floor(s / 2);
  g.fillStyle(color, alpha);
  for (let i = 0; i < pts.length; i++) g.fillRect(rnd(pts[i].x) - o, rnd(pts[i].y) - o, s, s);
}

// list: [[x, y, w, h], ...]
function rects(g, list, color, alpha) {
  if (!list || !list.length) return;
  g.fillStyle(color, alpha);
  for (let i = 0; i < list.length; i++) {
    const q = list[i];
    g.fillRect(rnd(q[0]), rnd(q[1]), Math.max(1, rnd(q[2])), Math.max(1, rnd(q[3])));
  }
}

// ---------- 几何工具 ----------

// 把局部方向 (lx, ly) 旋到世界，角度 0 = 朝 +x（与 Math.atan2(dy, dx) 一致）
function offset(x, y, ang, lx, ly) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return { x: x + lx * c - ly * s, y: y + lx * s + ly * c };
}

// list: [[lx, ly], ...] → 世界点数组
function shape(x, y, ang, list) {
  const out = new Array(list.length);
  for (let i = 0; i < list.length; i++) out[i] = offset(x, y, ang, list[i][0], list[i][1]);
  return out;
}

function diamondAt(x, y, ang, rad) {
  return shape(x, y, ang, [[rad, 0], [0, -rad], [-rad, 0], [0, rad]]);
}

// 五角星（外/内半径），ang 为整体旋转
function starAt(cx, cy, ang, outer, inner, arms = 5) {
  const out = [];
  const n = arms * 2;
  for (let i = 0; i < n; i++) {
    const rad = i % 2 === 0 ? outer : inner;
    const a = ang - Math.PI / 2 + (i / n) * TAU;
    out.push({ x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad });
  }
  return out;
}

// 折线 → 带宽度的多边形（电弧/长矛用），w 为半宽
function strip(pts, w) {
  const n = pts.length;
  if (n < 2) return [];
  const out = [];
  const dir = (i) => {
    const p = pts[i];
    const q = pts[Math.min(i + 1, n - 1)];
    const o = pts[Math.max(i - 1, 0)];
    let dx = q.x - o.x;
    let dy = q.y - o.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    return { dx, dy, p };
  };
  for (let i = 0; i < n; i++) {
    const { dx, dy, p } = dir(i);
    out.push({ x: p.x - dy * w, y: p.y + dx * w });
  }
  for (let i = n - 1; i >= 0; i--) {
    const { dx, dy, p } = dir(i);
    out.push({ x: p.x + dy * w, y: p.y - dx * w });
  }
  return out;
}

// 从 a 到 b 均分 count 个像素点（硬边直线，调用数可控）
function lineDots(ax, ay, bx, by, count) {
  const n = Math.max(2, count | 0);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    out[i] = { x: ax + (bx - ax) * u, y: ay + (by - ay) * u };
  }
  return out;
}

// 连续像素圆环：一条「外圈正向 + 内圈反向」的带孔多边形，一次 fillPoints 出整环。
// 大半径下点阵会散成噪点（r=46 的 12 点环 = 每 24px 才一个像素），带孔多边形始终是 1px 硬边环。
function ringPoly(cx, cy, rad, thick = 1.4, phase = 0, squash = 1, seg = 20) {
  const r = Math.max(1.1, rad);
  const rOut = r + thick / 2;
  const rIn = Math.max(0.4, r - thick / 2);
  const pts = [];
  for (let i = 0; i <= seg; i++) {
    const a = phase + (i / seg) * TAU;
    pts.push({ x: cx + Math.cos(a) * rOut, y: cy + Math.sin(a) * rOut * squash });
  }
  for (let i = seg; i >= 0; i--) {
    const a = phase + (i / seg) * TAU;
    pts.push({ x: cx + Math.cos(a) * rIn, y: cy + Math.sin(a) * rIn * squash });
  }
  return pts;
}

function ringDots(cx, cy, rad, count, phase = 0, squash = 1) {
  const out = new Array(count);
  for (let i = 0; i < count; i++) {
    const ang = phase + (i / count) * TAU;
    out[i] = { x: cx + Math.cos(ang) * rad, y: cy + Math.sin(ang) * rad * squash };
  }
  return out;
}

function sinePts(ax, ay, bx, by, amp, count, phase) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const u = count === 1 ? 0 : i / (count - 1);
    const perp = Math.sin(u * Math.PI * 2 + phase) * amp;
    out.push({ x: ax + (bx - ax) * u, y: ay + (by - ay) * u + perp });
  }
  return out;
}

// ---------- ctx 归一化（缺字段也绝不抛错） ----------
function normalize(ctx) {
  const c = ctx && typeof ctx === 'object' ? ctx : {};
  const x = num(c.x);
  const y = num(c.y);
  const trailRaw = Array.isArray(c.trail) ? c.trail : [];
  const trail = [];
  for (let i = 0; i < trailRaw.length; i++) {
    const p = trailRaw[i];
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) trail.push({ x: p.x, y: p.y });
  }
  const from = c.from && Number.isFinite(c.from.x) && Number.isFinite(c.from.y)
    ? { x: c.from.x, y: c.from.y }
    : { x, y };
  const to = c.to && Number.isFinite(c.to.x) && Number.isFinite(c.to.y)
    ? { x: c.to.x, y: c.to.y }
    : { x, y };
  return {
    x,
    y,
    angle: num(c.angle, 0),
    k: clamp01(num(c.k)),
    clock: num(c.clock, 0),
    radius: Math.max(3, num(c.radius, 14)),
    index: num(c.index, 0),
    trail,
    from,
    to,
  };
}

// ---------- 拖尾通用分段渲染 ----------
// 近中远三段：近段最亮最大 → 远段最暗最小；位置/尺寸由飞行历史决定，alpha 只随寿命淡出。
const bandOf = (u) => (u > 0.66 ? 'near' : u > 0.34 ? 'mid' : 'far');

function makeBands(c, o) {
  const raw = c.trail;
  const maxPts = Math.max(1, Math.min(o.max ?? 6, 12));
  const n = Math.min(raw.length, maxPts);
  const bands = { near: [], mid: [], far: [] };
  for (let i = 0; i < n; i++) {
    const p = raw[raw.length - n + i];
    const u = n === 1 ? 1 : (i + 1) / n;
    const sway = (o.sway ?? 0) * Math.sin(u * 5.4 + c.clock / 320);
    const q = {
      x: p.x + (o.driftX ?? 0) * (1 - u) + sway,
      y: p.y + (o.driftY ?? 0) * (1 - u) - Math.abs(sway) * (o.swayUp ?? 0),
    };
    bands[bandOf(u)].push(q);
  }
  return bands;
}

const TRAIL_STYLES = {
  mote(g, c, col, o, b, a) {
    dots(g, b.far, o.accent ?? col.accent, a * 0.4);
    dots(g, b.mid, col.body, a * 0.7);
    blocks(g, b.near, col.core, a, 2);
  },
  twinkle(g, c, col, o, b, a) {
    dots(g, b.far, o.accent ?? col.accent, a * 0.35);
    dots(g, b.mid, col.body, a * 0.6);
    dots(g, b.near, col.core, a);
    dots(g, b.near.map((p, i) => ({ x: p.x - 2 + (i % 2) * 4, y: p.y + ((i % 3) - 1) })), col.accent, a * 0.6);
  },
  block(g, c, col, o, b, a) {
    dots(g, b.far, col.edge, a * 0.5);
    blocks(g, b.mid, col.body, a * 0.7, 2);
    blocks(g, b.near, col.core, a, 2);
  },
  dash(g, c, col, o, b, a) {
    rects(g, b.far.map((p) => [p.x - 1, p.y, 2, 1]), o.accent ?? col.accent, a * 0.4);
    rects(g, b.mid.map((p) => [p.x - 2, p.y, 4, 1]), col.body, a * 0.65);
    rects(g, b.near.map((p) => [p.x - 2, p.y - 1, 4, 2]), col.core, a);
  },
  leaf(g, c, col, o, b, a) {
    dots(g, b.far, col.edge, a * 0.4);
    rects(g, b.mid.map((p) => [p.x - 1, p.y, 2, 1]), col.body, a * 0.75);
    rects(g, b.near.map((p) => [p.x - 1, p.y - 1, 2, 3]), o.accent ?? col.accent, a);
  },
  spark(g, c, col, o, b, a) {
    dots(g, b.far, col.accent, a * 0.35);
    dots(g, b.mid.map((p, i) => ({ x: p.x + (i % 2 ? 1 : -1), y: p.y })), col.body, a * 0.8);
    blocks(g, b.near, col.core, a, 2);
  },
  ghost(g, c, col, o, b, a) {
    blocks(g, b.far, col.edge, a * 0.35, 2);
    blocks(g, b.mid, col.edge, a * 0.55, 3);
    blocks(g, b.mid, col.body, a * 0.6, 2);
    dots(g, b.near, col.core, a);
  },
  ring(g, c, col, o, b, a) {
    dots(g, b.far, col.accent, a * 0.3);
    const pts = [];
    for (let i = 0; i < b.mid.length; i++) {
      const p = b.mid[i];
      for (let s = 0; s < 6; s++) pts.push(offset(p.x, p.y, c.clock / 400 + (s / 6) * TAU, 2.4, 0));
    }
    dots(g, pts, col.body, a * 0.6);
    dots(g, b.near, col.core, a);
  },
  thread(g, c, col, o, b, a) {
    dots(g, b.far, col.accent, a * 0.4);
    const pairs = [];
    for (let i = 0; i < b.mid.length; i++) {
      pairs.push({ x: b.mid[i].x - 1, y: b.mid[i].y }, { x: b.mid[i].x + 1, y: b.mid[i].y });
    }
    dots(g, pairs, col.body, a * 0.7);
    blocks(g, b.near, col.core, a, 2);
  },
  rubble(g, c, col, o, b, a) {
    dots(g, b.far, col.edge, a * 0.45);
    blocks(g, b.mid, col.edge, a * 0.5, 3);
    blocks(g, b.mid, col.body, a * 0.7, 2);
    blocks(g, b.near, col.core, a, 2);
  },
  wisp(g, c, col, o, b, a) {
    dots(g, b.far, col.accent, a * 0.3);
    dots(g, b.mid, col.body, a * 0.55);
    dots(g, b.near, col.core, a * 0.9);
    dots(g, b.mid.map((p) => ({ x: p.x + 2, y: p.y - 1 })), col.edge, a * 0.5);
  },
  rune(g, c, col, o, b, a) {
    dots(g, b.far, col.accent, a * 0.3);
    blocks(g, b.mid, col.body, a * 0.6, 2);
    blocks(g, b.near, col.core, a, 2);
    dots(g, b.near.map((p) => ({ x: p.x + 2, y: p.y - 2 })), col.accent, a * 0.65);
  },
  smoke(g, c, col, o, b, a) {
    blocks(g, b.far, col.edge, a * 0.3, 3);
    blocks(g, b.mid, col.edge, a * 0.5, 2);
    dots(g, b.near, C.mute, a * 0.55);
    blocks(g, b.near, col.body, a * 0.8, 2);
  },
};

function bandTrail(g, c, col, o) {
  if (!c.trail.length) return;
  const bands = makeBands(c, o);
  const style = TRAIL_STYLES[o.style] ?? TRAIL_STYLES.mote;
  style(g, c, col, o, bands, 1 - c.k);
}

// ---------- 16 套特效 ----------
// 每个法术：silhouette / trail / colors / opBudget + six 绘制函数
const SPELLS = {
  // 1. 寒霜箭：菱形箭头 + 双侧冰翼，冷白霜点拖尾，命中六角冰晶炸 + 扩散霜环
  frost_arrow: {
    silhouette: 'arrow',
    trail: { max: 6, style: 'frost-mote' },
    colors: { edge: C.outline, body: 0xaee4ff, core: 0xeafcff, accent: 0x7fd7ff },
    opBudget: 27,
    projectile(g, c, col) {
      const a = 1 - c.k * 0.2;
      const { x, y, angle } = c;
      // 三层箭头：暗描边 → 本体 → 亮芯三角
      poly(g, shape(x, y, angle, [[9.2, 0], [0.6, -4.2], [-3.2, 0], [0.6, 4.2]]), col.edge, a);
      poly(g, shape(x, y, angle, [[7.8, 0], [0.2, -2.8], [-2.2, 0], [0.2, 2.8]]), col.body, a);
      // 两侧冰翼：先描边后本色
      poly(g, shape(x, y, angle, [[-0.6, -1.8], [-6.4, -6], [-8, -3.2], [-2.4, -1.8]]), col.edge, a * 0.95);
      poly(g, shape(x, y, angle, [[-1, -1.7], [-5.6, -5], [-6.8, -3.2], [-2.4, -1.8]]), col.accent, a);
      poly(g, shape(x, y, angle, [[-0.6, 1.8], [-6.4, 6], [-8, 3.2], [-2.4, 1.8]]), col.edge, a * 0.95);
      poly(g, shape(x, y, angle, [[-1, 1.7], [-5.6, 5], [-6.8, 3.2], [-2.4, 1.8]]), col.accent, a);
      poly(g, shape(x, y, angle, [[5.4, 0], [2, -1.4], [0.6, 0], [2, 1.4]]), col.core, a);
      dots(g, [offset(x, y, angle, 10.6, 0)], col.core, a);
    },
    trailFx(g, c, col) {
      bandTrail(g, c, col, { style: 'mote', max: 6, sway: 1.2, accent: col.accent });
    },
    cast(g, c, col) {
      const a = 1 - c.k;
      const p = Math.min(1, c.k * 2.2);
      const spikes = [];
      for (let i = 0; i < 6; i++) spikes.push(offset(c.x, c.y, (i / 6) * TAU, 2 + 11 * p, 0));
      dots(g, spikes, col.core, a);
      poly(g, ringPoly(c.x, c.y, 3 + 7 * p, 1.4, c.clock / 600), col.accent, a * 0.8);
      rects(g, [[c.x - 1, c.y - 16 - 6 * p, 2, 8], [c.x, c.y - 24 - 6 * p, 1, 10]], col.body, a * 0.9);
    },
    impact(g, c, col) {
      const a = 1 - c.k;
      const R = Math.max(4, c.radius);
      const grow = R * (0.7 + 0.5 * c.k);
      // 扩散霜环：细环，不和大色块抢空间
      poly(g, ringPoly(c.x, c.y, grow, 1.4), col.accent, a * 0.85);
      poly(g, ringPoly(c.x, c.y, grow * 0.6, 1.2), col.body, a * 0.7);
      // 中心六角冰晶（三层：描边 / 本体 / 亮芯）
      const hexAt = (rad, color, al) => poly(g, shape(c.x, c.y, c.clock / 900, [
        [0, -rad], [rad * 0.87, -rad * 0.5], [rad * 0.87, rad * 0.5],
        [0, rad], [-rad * 0.87, rad * 0.5], [-rad * 0.87, -rad * 0.5],
      ]), color, al);
      hexAt(grow * 0.34, col.edge, a);
      hexAt(grow * 0.24, col.body, a);
      hexAt(grow * 0.12, col.core, a);
      // 6 根冰刺甩到环外
      const sh = [];
      for (let i = 0; i < 6; i++) sh.push(offset(c.x, c.y, (i / 6) * TAU + 0.3, grow * 1.08, 0));
      dots(g, sh, col.core, a * 0.95);
    },
    ward(g, c, col) {
      const a = 1 - c.k;
      const R = Math.max(6, c.radius) * 0.8;
      const shards = [];
      for (let i = 0; i < 6; i++) shards.push(offset(c.x, c.y, c.clock / 700 + (i / 6) * TAU, R, 0));
      blocks(g, shards, col.body, a, 2);
      poly(g, ringPoly(c.x, c.y, R, 1.4, c.clock / 900), col.accent, a * 0.55);
    },
    link(g, c, col) {
      const a = (1 - c.k) * 0.9;
      dots(g, lineDots(c.from.x, c.from.y, c.to.x, c.to.y, 14), col.body, a);
      dots(g, ringDots(c.to.x, c.to.y, 4, 6, c.clock / 500), col.core, a * 0.9);
      blocks(g, [c.from, c.to], col.accent, a * 0.8, 2);
    },
  },

  // 2. 奥术飞弹：旋转方框 / 菱形叠加 + 白核，余烬方块拖尾，命中同心双菱形 + 4 向亮线
  arcane_bolt: {
    silhouette: 'rune-square',
    trail: { max: 6, style: 'rune-square' },
    colors: { edge: C.outline, body: 0xffb44d, core: 0xffd79a, accent: 0xe0c35a },
    opBudget: 20,
    projectile(g, c, col) {
      const a = 1 - c.k * 0.2;
      const { x, y, angle } = c;
      poly(g, diamondAt(x, y, angle, 6.2), col.edge, a);
      poly(g, diamondAt(x, y, angle, 4.2), col.body, a);
      poly(g, diamondAt(x, y, angle, 2.2), col.edge, a); // 内框：镂空感
      blocks(g, [offset(x, y, angle, 0, 0)], col.core, a, 2);
      // 外圈 4 个随 clock 旋转的刻点（符文在转）
      const spin = c.clock / 420;
      const ticks = [];
      for (let i = 0; i < 4; i++) {
        const ang = spin + (i / 4) * TAU;
        ticks.push(offset(x, y, 0, Math.cos(ang) * 7.4, Math.sin(ang) * 7.4));
      }
      dots(g, ticks, col.accent, a);
    },
    trailFx(g, c, col) {
      bandTrail(g, c, col, { style: 'block', max: 6, sway: 0.6 });
    },
    cast(g, c, col) {
      const a = 1 - c.k;
      const p = Math.min(1, c.k * 2);
      // 起手：方框符文展开 + 四向火花
      poly(g, shape(c.x, c.y, c.clock / 400, [[6 + 10 * p, 0], [0, -6 - 10 * p], [-6 - 10 * p, 0], [0, 6 + 10 * p]]), col.edge, a * 0.9);
      poly(g, shape(c.x, c.y, c.clock / 400, [[4 + 8 * p, 0], [0, -4 - 8 * p], [-4 - 8 * p, 0], [0, 4 + 8 * p]]), col.body, a);
      const sparks = [];
      for (let i = 0; i < 4; i++) sparks.push(offset(c.x, c.y, (i / 4) * TAU + Math.PI / 4, 12 + 8 * p, 0));
      dots(g, sparks, col.core, a);
    },
    impact(g, c, col) {
      const a = 1 - c.k;
      const R = Math.max(4, c.radius);
      const grow = R * (0.55 + 0.45 * c.k);
      poly(g, diamondAt(c.x, c.y, 0, grow + 2), col.edge, a * 0.9);
      poly(g, diamondAt(c.x, c.y, 0, grow), col.body, a);
      poly(g, diamondAt(c.x, c.y, 0, Math.max(2, grow * 0.55)), col.edge, a * 0.85);
      const rays = [];
      for (let i = 0; i < 4; i++) rays.push(offset(c.x, c.y, (i / 4) * TAU + Math.PI / 4, grow * 1.15, 0));
      dots(g, rays, col.core, a);
      blocks(g, [c], col.core, a, 2);
    },
    ward(g, c, col) {
      const a = 1 - c.k;
      const R = Math.max(6, c.radius) * 0.8;
      const ph = c.clock / 700;
      const nodes = [];
      for (let i = 0; i < 4; i++) nodes.push(offset(c.x, c.y, ph + (i / 4) * TAU, R, 0));
      blocks(g, nodes, col.body, a, 2);
      dots(g, nodes.map((p) => offset(p.x, p.y, 0, 2, 0)), col.core, a);
      poly(g, shape(c.x, c.y, -ph, [[R * 0.55, 0], [0, -R * 0.55], [-R * 0.55, 0], [0, R * 0.55]]), col.accent, a * 0.55);
    },
    link(g, c, col) {
      const a = (1 - c.k) * 0.9;
      const pts = lineDots(c.from.x, c.from.y, c.to.x, c.to.y, 5);
      for (let i = 1; i < pts.length; i++) {
        poly(g, diamondAt(pts[i].x, pts[i].y, Math.PI / 4, 3), col.edge, a * 0.8);
        poly(g, diamondAt(pts[i].x, pts[i].y, Math.PI / 4, 2), col.body, a);
      }
      poly(g, diamondAt(c.to.x, c.to.y, Math.PI / 4, 4), col.core, a);
    },
  },

  // 3. 烈焰喷涌：三瓣火舌，上飘火星拖尾，命中圆形火团 + 上窜火苗
  flame_burst: {
    silhouette: 'tri-flame',
    trail: { max: 7, style: 'ember-up' },
    colors: { edge: C.outline, body: 0xff7a3c, core: 0xffd79a, accent: 0xffb44d },
    opBudget: 30,
    projectile(g, c, col) {
      const a = 1 - c.k * 0.2;
      const { x, y, angle } = c;
      // 三瓣火舌：外轮廓 → 上下两瓣 → 内芯
      poly(g, shape(x, y, angle, [[8, 0], [1.4, -4.6], [-5, -3.6], [-2.2, 0], [-5, 3.6], [1.4, 4.6]]), col.edge, a);
      poly(g, shape(x, y, angle, [[6.4, 0], [1, -3.4], [-4, -2.6], [-1.4, 0], [-4, 2.6], [1, 3.4]]), col.body, a);
      poly(g, shape(x, y, angle, [[5.2, 0], [0.6, -2.4], [-3.4, -1.4], [-0.6, 0]]), col.accent, a);
      poly(g, shape(x, y, angle, [[5.2, 0], [0.6, 2.4], [-3.4, 1.4], [-0.6, 0]]), col.accent, a);
      blocks(g, [offset(x, y, angle, 2.6, -0.4)], col.core, a, 2);
      dots(g, [offset(x, y, angle, -6, 0)], col.core, a * 0.85);
    },
    trailFx(g, c, col) {
      bandTrail(g, c, col, { style: 'mote', max: 7, driftY: -3, sway: 0.8, accent: col.accent });
    },
    cast(g, c, col) {
      const a = 1 - c.k;
      const p = Math.min(1, c.k * 2);
      // 起手：杖尖向上窜的火柱（三段递减，硬色块）
      rects(g, [
        [c.x - 3, c.y - 10 - 12 * p, 6, 5],
        [c.x - 2, c.y - 16 - 16 * p, 4, 8],
        [c.x - 1, c.y - 22 - 20 * p, 2, 8],
      ], col.body, a);
      rects(g, [[c.x - 1, c.y - 12 - 12 * p, 2, 10], [c.x, c.y - 24 - 18 * p, 1, 6]], col.core, a);
      const embers = [];
      for (let i = 0; i < 5; i++) {
        embers.push({ x: c.x + Math.sin(i * 2.1 + c.clock / 300) * 6, y: c.y - 6 - 22 * p * ((i % 3) + 1) / 3 });
      }
      dots(g, embers, col.accent, a * 0.85);
    },
    impact(g, c, col) {
      const a = 1 - c.k;
      const R = Math.max(4, c.radius);
      const grow = R * (0.65 + 0.4 * c.k);
      poly(g, ringPoly(c.x, c.y, grow, 1.4, 0, 0.85), col.edge, a * 0.85);
      poly(g, ringPoly(c.x, c.y, grow * 0.8, 1.4, 0.2, 0.85), col.body, a);
      // 上窜火舌：三簇，越往上越细
      for (let i = 0; i < 3; i++) {
        const fx = c.x - 5 + i * 5;
        const h = 5 + grow * 0.5;
        poly(g, [[fx - 2, c.y - grow * 0.2], [fx, c.y - h], [fx + 2, c.y - grow * 0.2]], col.accent, a * 0.9);
      }
      blocks(g, [c], col.core, a, 2);
      dots(g, [offset(c.x, c.y, 0, 0, -grow * 0.9)], col.core, a);
    },
    ward(g, c, col) {
      const a = 1 - c.k;
      const R = Math.max(6, c.radius) * 0.8;
      const ph = c.clock / 500;
      const ring = [];
      for (let i = 0; i < 6; i++) {
        const p = offset(c.x, c.y, ph + (i / 6) * TAU, R, 0);
        ring.push({ x: p.x, y: p.y - Math.abs(Math.sin(ph * 2 + i)) * 2 });
      }
      dots(g, ring, col.edge, a * 0.8);
      blocks(g, ring, col.body, a * 0.85, 2);
      dots(g, ring.map((p) => ({ x: p.x, y: p.y - 2 })), col.core, a * 0.8);
    },
    link(g, c, col) {
      const a = (1 - c.k) * 0.9;
      const pts = sinePts(c.from.x, c.from.y, c.to.x, c.to.y, 3 + (1 - c.k) * 2, 12, c.clock / 260);
      dots(g, pts, col.body, a);
      dots(g, pts.map((p) => ({ x: p.x, y: p.y - 2 })), col.accent, a * 0.6);
      dots(g, [c.to], col.core, a);
    },
  },

  // 4. 审判之锤：锤头 + 短柄，金色冲击波拖尾，命中地面十字冲击 + 竖直光柱
  judgment_hammer: {
    silhouette: 'hammer',
    trail: { max: 5, style: 'impact-wave' },
    colors: { edge: C.outline, body: 0xc9a227, core: 0xfff2c0, accent: 0xe0c35a },
    opBudget: 18,
    projectile(g, c, col) {
      const a = 1 - c.k * 0.2;
      const { x, y, angle } = c;
      poly(g, shape(x, y, angle, [[-9.4, -2.4], [-2, -2.4], [-2, 2.4], [-9.4, 2.4]]), col.edge, a);
      poly(g, shape(x, y, angle, [[-8.6, -1.4], [-2.4, -1.4], [-2.4, 1.4], [-8.6, 1.4]]), col.accent, a);
      poly(g, shape(x, y, angle, [[0, -5.2], [7.2, -5.2], [7.2, 5.2], [0, 5.2]]), col.edge, a);
      poly(g, shape(x, y, angle, [[0.8, -4], [6.4, -4], [6.4, 4], [0.8, 4]]), col.body, a);
      blocks(g, [offset(x, y, angle, 2.6, -3)], col.core, a, 2);
      dots(g, [offset(x, y, angle, 5.6, 3)], col.core, a * 0.9);
    },
    trailFx(g, c, col) {
      bandTrail(g, c, col, { style: 'dash', max: 5, accent: col.edge });
    },
    cast(g, c, col) {
      const a = 1 - c.k;
      const p = Math.min(1, c.k * 2);
      // 起手：竖直光柱 + 地面光环（审判的仪式感）
      rects(g, [[c.x - 3, c.y - 20 - 10 * p, 6, 4], [c.x - 2, c.y - 30 - 12 * p, 4, 10], [c.x - 1, c.y - 36 - 12 * p, 2, 8]], col.body, a);
      rects(g, [[c.x - 1, c.y - 22 - 10 * p, 2, 14]], col.core, a);
      poly(g, ringPoly(c.x, c.y, 4 + 10 * p, 1.4, 0, 0.45), col.accent, a * 0.85);
    },
    impact(g, c, col) {
      const a = 1 - c.k;
      const R = Math.max(4, c.radius);
      const grow = R * (0.6 + 0.5 * c.k);
      // 地面十字冲击
      rects(g, [[c.x - grow, c.y - 1, grow * 2, 2], [c.x - 1, c.y - grow * 0.7, 2, grow * 1.4]], col.edge, a * 0.85);
      rects(g, [[c.x - grow * 0.8, c.y, grow * 1.6, 1], [c.x, c.y - grow * 0.55, 1, grow * 1.1]], col.accent, a);
      // 竖直光柱
      rects(g, [[c.x - 3, c.y - 26 - 8 * c.k, 6, 5], [c.x - 2, c.y - 34 - 10 * c.k, 4, 10], [c.x - 1, c.y - 42 - 12 * c.k, 2, 10]], col.body, a * 0.9);
      rects(g, [[c.x - 1, c.y - 40 - 12 * c.k, 2, 18]], col.core, a);
      blocks(g, [c], col.core, a, 2);
    },
    ward(g, c, col) {
      const a = 1 - c.k;
      const R = Math.max(6, c.radius) * 0.8;
      const ph = c.clock / 900;
      poly(g, ringPoly(c.x, c.y, R, 1.4, ph), col.body, a * 0.8);
      const marks = [];
      for (let i = 0; i < 4; i++) marks.push(offset(c.x, c.y, ph + (i / 4) * TAU + Math.PI / 4, R * 0.7, 0));
      blocks(g, marks, col.accent, a * 0.9, 2);
      rects(g, marks.map((p) => [p.x, p.y - 2, 1, 5]), col.core, a * 0.85);
    },
    link(g, c, col) {
      const a = (1 - c.k) * 0.9;
      const pts = lineDots(c.from.x, c.from.y, c.to.x, c.to.y, 10);
      dots(g, pts, col.accent, a * 0.75);
      // 冲击纹：末端两道八字
      dots(g, [offset(c.to.x, c.to.y, Math.PI * 0.75, 4, 0), offset(c.to.x, c.to.y, -Math.PI * 0.75, 4, 0)], col.core, a);
      blocks(g, [c.to], col.body, a, 2);
    },
  },

  // 5. 荆棘藤蔓：缠绕藤 + 尖刺团，叶片拖尾，命中地面窜出藤刺环 + 缠绕圈
  thorn_vine: {
    silhouette: 'vine',
    trail: { max: 6, style: 'leaf' },
    colors: { edge: C.outline, body: 0x849c6c, core: 0xcc9c6c, accent: 0x6c6c54 },
    opBudget: 42,
    projectile(g, c, col) {
      const a = 1 - c.k * 0.2;
      const { x, y, angle } = c;
      // 螺旋缠绕的藤身（点串）
      const vine = [];
      for (let i = 0; i < 11; i++) {
        const u = i / 10;
        vine.push(offset(x, y, angle, -6.4 + u * 12.8, Math.sin(u * Math.PI * 1.8 + c.clock / 260) * 2.6));
      }
      dots(g, vine, col.body, a);
      // 三根尖刺
      poly(g, shape(x, y, angle, [[-1.4, -2.6], [1.2, -7.4], [2, -2.4]]), col.edge, a);
      poly(g, shape(x, y, angle, [[-1.4, -2.6], [1.2, -6.4], [1.6, -2.4]]), col.core, a);
      poly(g, shape(x, y, angle, [[3.4, 2], [7.6, 4.6], [4.6, 1.2]]), col.edge, a);
      poly(g, shape(x, y, angle, [[3.4, 2], [6.8, 4], [4.4, 1.4]]), col.core, a * 0.9);
      poly(g, shape(x, y, angle, [[-5, 1.6], [-9, 2.2], [-5.4, 3.2]]), col.accent, a);
      blocks(g, [offset(x, y, angle, -2.4, 0)], col.core, a, 2);
    },
    trailFx(g, c, col) {
      bandTrail(g, c, col, { style: 'leaf', max: 6, sway: 1.4 });
    },
    cast(g, c, col) {
      const a = 1 - c.k;
      const p = Math.min(1, c.k * 2);
      // 起手：地面三处新芽破土，向上抽藤
      for (let i = 0; i < 3; i++) {
        const bx = c.x - 6 + i * 6;
        const h = 4 + 12 * p;
        dots(g, lineDots(bx, c.y, bx + Math.sin(i + c.clock / 400) * 2, c.y - h, 5), col.body, a * 0.9);
      }
      rects(g, [[c.x - 4, c.y - 1, 9, 2]], col.accent, a * 0.8);
      poly(g, ringPoly(c.x, c.y, 3 + 8 * p, 1.4, 0, 0.4), col.core, a * 0.7);
    },
    impact(g, c, col) {
      const a = 1 - c.k;
      const R = Math.max(4, c.radius);
      const grow = R * (0.55 + 0.5 * c.k);
      // 6 根藤刺：长度/粗细随半径放大，否则半径 46 的刺只有 2px 高，等于看不见
      const len = Math.max(4, Math.min(16, grow * 0.34));
      const halfW = Math.max(1.8, len * 0.36);
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * TAU + 0.2 + c.clock / 2400;
        const root = offset(c.x, c.y, ang, grow * 0.86, 0);
        const tip = offset(c.x, c.y, ang, grow * 0.86 + len, 0);
        const perp = ang + Math.PI / 2;
        const aA = offset(root.x, root.y, perp, halfW, 0);
        const aB = offset(root.x, root.y, perp, -halfW, 0);
        poly(g, [aA, tip, aB], col.edge, a * 0.95);
        const bA = offset(root.x, root.y, perp, halfW * 0.55, 0);
        const bB = offset(root.x, root.y, perp, -halfW * 0.55, 0);
        poly(g, [bA, tip, bB], col.body, a);
        // 亮芯在刺身中段，不悬空
        dots(g, [offset(root.x, root.y, ang, len * 0.55, 0)], col.core, a * 0.95);
      }
      // 缠绕圈（连续细环）
      poly(g, ringPoly(c.x, c.y, grow * 0.55, 1.4, c.clock / 600), col.accent, a * 0.85);
      blocks(g, [c], col.core, a, 2);
    },
    ward(g, c, col) {
      const a = 1 - c.k;
      const R = Math.max(6, c.radius) * 0.8;
      const ph = c.clock / 800;
      const ring = [];
      for (let i = 0; i < 10; i++) {
        const ang = ph + (i / 10) * TAU;
        ring.push(offset(c.x, c.y, ang, R, Math.sin(ang * 3) * 1.6));
      }
      dots(g, ring, col.body, a * 0.9);
      const spikes = [];
      for (let i = 0; i < 4; i++) spikes.push(offset(c.x, c.y, ph + (i / 4) * TAU, R * 1.15, 0));
      dots(g, spikes, col.core, a);
    },
    link(g, c, col) {
      const a = (1 - c.k) * 0.9;
      const pts = sinePts(c.from.x, c.from.y, c.to.x, c.to.y, 4, 11, c.clock / 300);
      dots(g, pts, col.body, a);
      dots(g, pts.filter((p, i) => i % 3 === 1).map((p) => ({ x: p.x + 1, y: p.y - 1 })), col.core, a * 0.75);
    },
  },

  // 6. 星陨：五角星碎片，星尘拖尾，命中星形爆 + 内圈小星环
  starfall: {
    silhouette: 'star',
    trail: { max: 6, style: 'stardust' },
    colors: { edge: C.outline, body: 0xffd79a, core: 0xfff6e0, accent: 0xffb44d },
    opBudget: 20,
    projectile(g, c, col) {
      const a = 1 - c.k * 0.2;
      const { x, y, angle } = c;
      const spin = angle + c.clock / 500;
      poly(g, starAt(x, y, spin, 7.4, 3.2, 5), col.edge, a);
      poly(g, starAt(x, y, spin, 5.6, 2.2, 5), col.body, a);
      blocks(g, [offset(x, y, angle, 0, 0)], col.core, a, 2);
      dots(g, [offset(x, y, angle, 0, -7.6), offset(x, y, angle, 7.6, 1)], col.core, a * 0.8);
    },
    trailFx(g, c, col) {
      bandTrail(g, c, col, { style: 'twinkle', max: 6, accent: col.accent });
    },
    cast(g, c, col) {
      const a = 1 - c.k;
      const p = Math.min(1, c.k * 1.8);
      // 起手：5 颗小星螺旋展开
      const pts = [];
      for (let i = 0; i < 5; i++) {
        const ang = c.clock / 500 + (i / 5) * TAU;
        pts.push(offset(c.x, c.y, ang, 3 + 12 * p, 0));
      }
      dots(g, pts, col.core, a);
      poly(g, starAt(c.x, c.y - 6 * p, c.clock / 400, 4 + 4 * p, 1.6 + 1.6 * p), col.body, a * 0.9);
      poly(g, ringPoly(c.x, c.y, 6 + 8 * p, 1.4, 0, 0.5), col.accent, a * 0.6);
    },
    impact(g, c, col) {
      const a = 1 - c.k;
      const R = Math.max(4, c.radius);
      const grow = R * (0.6 + 0.45 * c.k);
      // 描边只比本体大 2px：按比例缩小会把 18% 的边扩成 13px 厚黑框（半径 70 时）
      poly(g, starAt(c.x, c.y, c.clock / 600, grow + 2, grow * 0.45 + 2, 5), col.edge, a * 0.85);
      poly(g, starAt(c.x, c.y, c.clock / 600 + 0.2, grow, grow * 0.45, 5), col.body, a);
      poly(g, starAt(c.x, c.y, -c.clock / 400, grow * 0.4, grow * 0.18, 5), col.core, a * 0.9);
      // 内圈小星环：一条连续细环 + 5 颗随半径放大的小星（半径 70 时不再是 5 个孤点）
      poly(g, ringPoly(c.x, c.y, grow * 0.62, 1, c.clock / 900), col.core, a * 0.55);
      const starR = Math.max(2, Math.min(5, grow * 0.1));
      for (let i = 0; i < 5; i++) {
        const p = offset(c.x, c.y, (i / 5) * TAU + c.clock / 900, grow * 0.62, 0);
        poly(g, starAt(p.x, p.y, c.clock / 500 + i, starR, starR * 0.45, 5), col.core, a * 0.9);
      }
    },
    ward(g, c, col) {
      const a = 1 - c.k;
      const R = Math.max(6, c.radius) * 0.8;
      const ph = c.clock / 800;
      const stars = [];
      for (let i = 0; i < 5; i++) stars.push(offset(c.x, c.y, ph + (i / 5) * TAU, R, 0));
      for (let i = 0; i < stars.length; i++) {
        poly(g, starAt(stars[i].x, stars[i].y, ph + i, 2.6, 1.2, 5), col.body, a * 0.9);
      }
      poly(g, ringPoly(c.x, c.y, R, 1.4, -ph), col.accent, a * 0.45);
    },
    link(g, c, col) {
      const a = (1 - c.k) * 0.9;
      const pts = lineDots(c.from.x, c.from.y, c.to.x, c.to.y, 12);
      dots(g, pts.filter((p, i) => i % 2 === 0), col.accent, a * 0.7);
      poly(g, starAt(c.to.x, c.to.y, c.clock / 500, 4.4, 1.8, 5), col.core, a);
    },
  },

  // 7. 圣光壁垒：六边形圣盾，起手六芒星展开 + 上升光柱，环绕玩家盾环
  holy_ward: {
    silhouette: 'hex-shield',
    trail: { max: 4, style: 'hex-ward' },
    colors: { edge: C.outline, body: 0xf0d9a8, core: 0xfff6e0, accent: 0xe0c35a },
    opBudget: 28,
    projectile(g, c, col) {
      const a = 1 - c.k * 0.2;
      const { x, y, angle } = c;
      const hex = (rad) => shape(x, y, angle, [
        [rad, 0], [rad * 0.5, -rad * 0.87], [-rad * 0.5, -rad * 0.87],
        [-rad, 0], [-rad * 0.5, rad * 0.87], [rad * 0.5, rad * 0.87],
      ]);
      poly(g, hex(7), col.edge, a);
      poly(g, hex(5.4), col.body, a);
      poly(g, hex(3), col.edge, a); // 中空盾面
      rects(g, [[x - 1, y - 4, 2, 8]], col.core, a);
      dots(g, [offset(x, y, angle, 0, -8.6), offset(x, y, angle, 0, 8.6)], col.accent, a * 0.85);
    },
    trailFx(g, c, col) {
      bandTrail(g, c, col, { style: 'ghost', max: 4, accent: col.accent });
    },
    cast(g, c, col) {
      const a = 1 - c.k;
      const p = Math.min(1, c.k * 2);
      // 起手：六芒星展开 + 上升光柱
      const arms = [];
      for (let i = 0; i < 6; i++) arms.push(offset(c.x, c.y, (i / 6) * TAU, 4 + 12 * p, 0));
      dots(g, arms, col.core, a);
      poly(g, ringPoly(c.x, c.y, 5 + 10 * p, 1.4, c.clock / 700), col.accent, a * 0.8);
      rects(g, [[c.x - 3, c.y - 18 - 12 * p, 6, 4], [c.x - 2, c.y - 26 - 14 * p, 4, 10], [c.x - 1, c.y - 32 - 14 * p, 2, 8]], col.body, a * 0.9);
      rects(g, [[c.x - 1, c.y - 24 - 12 * p, 2, 12]], col.core, a);
    },
    impact(g, c, col) {
      const a = 1 - c.k;
      const R = Math.max(4, c.radius);
      const grow = R * (0.55 + 0.45 * c.k);
      const hex = (rad) => shape(c.x, c.y, 0, [
        [rad, 0], [rad * 0.5, -rad * 0.87], [-rad * 0.5, -rad * 0.87],
        [-rad, 0], [-rad * 0.5, rad * 0.87], [rad * 0.5, rad * 0.87],
      ]);
      // 同样：描边外扩 2px，不做按比例缩放（半径 40 时那会变成 10px 厚黑框）
      poly(g, hex(grow + 2), col.edge, a * 0.8);
      poly(g, hex(grow), col.body, a * 0.55);
      poly(g, ringPoly(c.x, c.y, grow * 1.1, 1.4, c.clock / 500), col.core, a);
      rects(g, [[c.x - 3, c.y - 26 - 8 * c.k, 6, 4], [c.x - 2, c.y - 34 - 10 * c.k, 4, 10], [c.x - 1, c.y - 42 - 10 * c.k, 2, 10]], col.body, a * 0.85);
      rects(g, [[c.x - 1, c.y - 40 - 10 * c.k, 2, 16]], col.core, a);
    },
    ward(g, c, col) {
      const a = 1 - c.k;
      const R = Math.max(6, c.radius);
      const ph = c.clock / 900;
      // 6 块盾片环绕
      for (let i = 0; i < 6; i++) {
        const ang = ph + (i / 6) * TAU;
        const p = offset(c.x, c.y, ang, R * 0.85, 0);
        poly(g, shape(p.x, p.y, ang, [[3.2, 0], [1.6, -2.6], [-1.6, -2.6], [-3.2, 0], [-1.6, 2.6], [1.6, 2.6]]), col.edge, a * 0.9);
        poly(g, shape(p.x, p.y, ang, [[2.4, 0], [1.2, -1.8], [-1.2, -1.8], [-2.4, 0], [-1.2, 1.8], [1.2, 1.8]]), col.body, a);
      }
      poly(g, ringPoly(c.x, c.y, R * 1.02, 1.4, -ph), col.accent, a * 0.5);
    },
    link(g, c, col) {
      const a = (1 - c.k) * 0.9;
      const pts = lineDots(c.from.x, c.from.y, c.to.x, c.to.y, 10);
      dots(g, pts, col.body, a * 0.8);
      dots(g, pts.map((p) => ({ x: p.x, y: p.y + 1 })), col.accent, a * 0.4);
      const mid = { x: (c.from.x + c.to.x) / 2, y: (c.from.y + c.to.y) / 2 };
      poly(g, ringPoly(mid.x, mid.y, 3.4, 1.4, c.clock / 500), col.core, a);
    },
  },

  // 8. 秘能汲取：蓝白光球 + 3 条螺旋丝，命中光点被拉回
  mana_siphon: {
    silhouette: 'orb-spiral',
    trail: { max: 6, style: 'siphon-thread' },
    colors: { edge: C.outline, body: 0x9fe8ff, core: 0xeafcff, accent: 0x5ed0c8 },
    opBudget: 20,
    projectile(g, c, col) {
      const a = 1 - c.k * 0.2;
      const { x, y, angle } = c;
      poly(g, diamondAt(x, y, angle, 5.4), col.edge, a);
      poly(g, diamondAt(x, y, angle, 3.6), col.body, a);
      blocks(g, [offset(x, y, angle, 0, 0)], col.core, a, 2);
      // 3 条螺旋丝：随 clock 缠绕
      const threads = [];
      for (let s = 0; s < 3; s++) {
        for (let i = 0; i < 3; i++) {
          const u = i / 3;
          const lx = -7.4 + u * 4.6;
          const ly = Math.sin(c.clock / 300 + s * (TAU / 3) + u * 4) * 3.2;
          threads.push(offset(x, y, angle, lx, ly));
        }
      }
      dots(g, threads, col.accent, a);
      dots(g, [offset(x, y, angle, 0, -6.4)], col.core, a * 0.8);
    },
    trailFx(g, c, col) {
      bandTrail(g, c, col, { style: 'thread', max: 6, sway: 0.8, accent: col.accent });
    },
    cast(g, c, col) {
      const a = 1 - c.k;
      const p = Math.min(1, c.k * 2);
      // 起手：光球成形 + 三条螺旋丝
      poly(g, ringPoly(c.x, c.y, 3 + 9 * p, 1.4, c.clock / 500), col.core, a);
      const threads = [];
      for (let s = 0; s < 3; s++) {
        for (let i = 0; i < 3; i++) {
          const u = i / 3;
          threads.push(offset(c.x, c.y, c.clock / 400 + s * (TAU / 3) + u * 5, 5 + 8 * u * p, 0));
        }
      }
      dots(g, threads, col.accent, a * 0.85);
      blocks(g, [c], col.core, a, 2);
    },
    impact(g, c, col) {
      const a = 1 - c.k;
      const R = Math.max(4, c.radius);
      const grow = R * (0.9 - 0.5 * c.k); // 反向：光点被拉回中心
      poly(g, ringPoly(c.x, c.y, grow, 1.4, c.clock / 400), col.body, a);
      poly(g, ringPoly(c.x, c.y, grow * 0.55, 1.4, -c.clock / 500), col.core, a * 0.9);
      const motes = [];
      for (let i = 0; i < 6; i++) motes.push(offset(c.x, c.y, (i / 6) * TAU + c.clock / 600, grow + 3, 0));
      dots(g, motes, col.accent, a * 0.8);
      blocks(g, [c], col.core, a, 2);
    },
    ward(g, c, col) {
      const a = 1 - c.k;
      const R = Math.max(6, c.radius) * 0.8;
      const ph = c.clock / 700;
      poly(g, ringPoly(c.x, c.y, R, 1.4, ph), col.accent, a * 0.6);
      const threads = [];
      for (let s = 0; s < 3; s++) {
        for (let i = 0; i < 3; i++) {
          const u = i / 3;
          threads.push(offset(c.x, c.y, ph * 1.4 + s * (TAU / 3) + u * 4.4, R * (0.45 + 0.5 * u), 0));
        }
      }
      dots(g, threads, col.body, a * 0.8);
    },
    link(g, c, col) {
      const a = (1 - c.k) * 0.9;
      const pts = sinePts(c.from.x, c.from.y, c.to.x, c.to.y, 3, 9, c.clock / 280);
      dots(g, pts, col.body, a * 0.8);
      // 拉回的流向：从目标向起点方向偏一点
      dots(g, pts.filter((p, i) => i % 2 === 0).map((p, i) => offset(p.x, p.y, 0, 0, i % 2 ? 1 : -1)), col.accent, a * 0.55);
      poly(g, ringPoly(c.to.x, c.to.y, 3.4, 1.4, c.clock / 400), col.core, a);
    },
  },

  // 9. 连锁闪电：锯齿电弧弹 + 电火花拖尾，命中电弧炸 + 到下一目标的锯齿链
  chain_lightning: {
    silhouette: 'zigzag',
    trail: { max: 5, style: 'arc-spark' },
    colors: { edge: C.outline, body: 0xfff0a0, core: 0xffffff, accent: 0xffd79a },
    opBudget: 14,
    projectile(g, c, col) {
      const a = 1 - c.k * 0.2;
      const { x, y, angle } = c;
      const spine = [
        offset(x, y, angle, 8.4, 0),
        offset(x, y, angle, 3.6, -3),
        offset(x, y, angle, -0.4, 0.4),
        offset(x, y, angle, -4.4, -2.6),
        offset(x, y, angle, -7.6, 0),
      ];
      poly(g, strip(spine, 2.2), col.edge, a);
      poly(g, strip(spine, 1.2), col.body, a);
      dots(g, [offset(x, y, angle, 0, 0), offset(x, y, angle, 3.2, -4.4), offset(x, y, angle, -3.6, 2.8)], col.core, a);
      dots(g, [offset(x, y, angle, -5.6, 4.4)], col.accent, a * 0.9);
    },
    trailFx(g, c, col) {
      bandTrail(g, c, col, { style: 'spark', max: 5, accent: col.accent });
    },
    cast(g, c, col) {
      const a = 1 - c.k;
      const p = Math.min(1, c.k * 2);
      // 起手：三条分叉电弧从杖尖射出
      for (let i = 0; i < 3; i++) {
        const ang = c.angle + (i - 1) * 0.55;
        const spine = [];
        for (let s = 0; s < 4; s++) {
          const u = s / 3;
          spine.push(offset(c.x, c.y, ang + Math.sin(s * 2.4) * 0.12, 3 + 15 * p * u, Math.sin(s * 3.1) * 2));
        }
        poly(g, strip(spine, 1.1), col.body, a * 0.95);
      }
      poly(g, ringPoly(c.x, c.y, 3 + 5 * p, 1.4, c.clock / 400), col.core, a);
    },
    impact(g, c, col) {
      const a = 1 - c.k;
      const R = Math.max(4, c.radius);
      const grow = R * (0.5 + 0.5 * c.k);
      // 电弧炸：四向锯齿
      for (let i = 0; i < 4; i++) {
        const ang = (i / 4) * TAU + 0.4;
        const spine = [];
        for (let s = 0; s < 4; s++) {
          const u = s / 3;
          spine.push(offset(c.x, c.y, ang + Math.sin(s * 2.7 + i) * 0.16, grow * 0.3 + grow * 0.7 * u, 0));
        }
        poly(g, strip(spine, 1.1), col.body, a * 0.9);
      }
      poly(g, ringPoly(c.x, c.y, grow * 0.9, 1.4, c.clock / 300), col.accent, a * 0.8);
      blocks(g, [c], col.core, a, 2);
    },
    ward(g, c, col) {
      const a = 1 - c.k;
      const R = Math.max(6, c.radius) * 0.85;
      const ph = c.clock / 260;
      // 电弧环：4 段锯齿弧
      for (let i = 0; i < 4; i++) {
        const base = ph + (i / 4) * TAU;
        const spine = [];
        for (let s = 0; s < 3; s++) {
          spine.push(offset(c.x, c.y, base + s * 0.24, R + Math.sin(s * 3 + i) * 1.4, 0));
        }
        poly(g, strip(spine, 1), col.body, a * 0.85);
      }
      dots(g, [offset(c.x, c.y, ph, R, 0)], col.core, a);
    },
    link(g, c, col) {
      const a = (1 - c.k) * 0.95;
      // 锯齿链（连锁跳跃的主用形态）
      const spine = [];
      const n = 6;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        const jitter = Math.sin(i * 2.3 + c.clock / 220) * 3.2 * (i === 0 || i === n - 1 ? 0 : 1);
        spine.push({
          x: c.from.x + (c.to.x - c.from.x) * u,
          y: c.from.y + (c.to.y - c.from.y) * u + jitter,
        });
      }
      poly(g, strip(spine, 1.8), col.edge, a * 0.85);
      poly(g, strip(spine, 1.1), col.body, a);
      dots(g, spine.filter((p, i) => i % 2 === 1), col.core, a);
    },
  },

  // 10. 穿刺之矛：细长锥形长矛 + 尾羽，直线破风虚线拖尾，命中沿飞行方向的贯穿光束
  pierce_lance: {
    silhouette: 'lance',
    trail: { max: 6, style: 'wind-dash' },
    colors: { edge: C.outline, body: 0xe0c35a, core: 0xfff6e0, accent: 0xc9a227 },
    opBudget: 30,
    projectile(g, c, col) {
      const a = 1 - c.k * 0.2;
      const { x, y, angle } = c;
      poly(g, shape(x, y, angle, [[11, 0], [2, -2.8], [-4.4, -1.6], [-4.4, 1.6], [2, 2.8]]), col.edge, a);
      poly(g, shape(x, y, angle, [[9.6, 0], [1.6, -1.9], [-3.6, -1], [-3.6, 1], [1.6, 1.9]]), col.body, a);
      poly(g, shape(x, y, angle, [[-4, -1.4], [-9.4, -4.6], [-6.4, -0.6]]), col.edge, a * 0.9);
      poly(g, shape(x, y, angle, [[-4, -1.2], [-8.4, -4], [-6.2, -0.8]]), col.accent, a);
      poly(g, shape(x, y, angle, [[-4, 1.4], [-9.4, 4.6], [-6.4, 0.6]]), col.edge, a * 0.9);
      poly(g, shape(x, y, angle, [[-4, 1.2], [-8.4, 4], [-6.2, 0.8]]), col.accent, a);
      dots(g, [offset(x, y, angle, 10.4, 0)], col.core, a);
    },
    trailFx(g, c, col) {
      bandTrail(g, c, col, { style: 'dash', max: 6, accent: col.accent });
    },
    cast(g, c, col) {
      const a = 1 - c.k;
      const p = Math.min(1, c.k * 2);
      // 起手：沿朝向射出一道细光束 + 两道破风撇
      const pts = [];
      for (let i = 0; i < 10; i++) pts.push(offset(c.x, c.y, c.angle, 4 + 20 * p * (i / 9), 0));
      dots(g, pts, col.body, a);
      dots(g, pts.slice(0, 4), col.core, a * 0.9);
      dots(g, [offset(c.x, c.y, c.angle + 0.5, 6 + 8 * p, 0), offset(c.x, c.y, c.angle - 0.5, 6 + 8 * p, 0)], col.accent, a);
    },
    impact(g, c, col) {
      const a = 1 - c.k;
      const R = Math.max(4, c.radius);
      const ang = c.angle;
      // 贯穿光束：沿飞行方向的中轴，长 3R。用连续细多边形而不是点阵
      // （半径 46 时 14 个点跨 138px ＝ 每 10px 一个像素，实机是虚线）
      const len = R * 3;
      const halfW = Math.max(1.2, Math.min(4, R * 0.07));
      const axis = [offset(c.x, c.y, ang, -len / 2, 0), offset(c.x, c.y, ang, len / 2, 0)];
      poly(g, strip(axis, halfW + 1), col.edge, a * 0.8);
      poly(g, strip(axis, halfW), col.body, a);
      poly(g, strip(axis, Math.max(0.6, halfW * 0.4)), col.core, a);
      // 两侧破风撇：同样用线段多边形，长度随半径
      const perp = ang + Math.PI / 2;
      const tickLen = Math.max(2, Math.min(9, R * 0.16));
      for (let i = 0; i < 3; i++) {
        const u = -0.35 + i * 0.35;
        const p0 = offset(c.x, c.y, ang, len * u, 0);
        for (const side of [-1, 1]) {
          const p1 = offset(p0.x, p0.y, perp, tickLen * side, 0);
          poly(g, strip([p0, p1], 0.7), col.accent, a * 0.8);
        }
      }
      dots(g, [offset(c.x, c.y, ang, len / 2, 0)], col.core, a);
    },
    ward(g, c, col) {
      const a = 1 - c.k;
      const R = Math.max(6, c.radius) * 0.85;
      const ph = c.clock / 900;
      // 8 根朝内的矛尖环
      const tips = [];
      for (let i = 0; i < 8; i++) tips.push(offset(c.x, c.y, ph + (i / 8) * TAU, R, 0));
      dots(g, tips, col.body, a * 0.9);
      dots(g, tips.map((p) => offset(c.x, c.y, Math.atan2(p.y - c.y, p.x - c.x), R - 2.4, 0)), col.core, a * 0.8);
      poly(g, ringPoly(c.x, c.y, R, 1.4, -ph), col.accent, a * 0.35);
    },
    link(g, c, col) {
      const a = (1 - c.k) * 0.9;
      const pts = lineDots(c.from.x, c.from.y, c.to.x, c.to.y, 12);
      dots(g, pts, col.accent, a * 0.7);
      dots(g, pts.map((p) => ({ x: p.x, y: p.y + 1 })), col.body, a * 0.6);
      // 末端箭头
      const ang = Math.atan2(c.to.y - c.from.y, c.to.x - c.from.x);
      dots(g, [offset(c.to.x, c.to.y, ang, 3, 0)], col.core, a);
    },
  },

  // 11. 回声符文：双层环 + 符文点，3 个渐隐残影拖尾，命中同心声波环 + 对侧镜像小环
  echo_sigil: {
    silhouette: 'double-ring',
    trail: { max: 6, style: 'echo-ring' },
    colors: { edge: C.outline, body: 0xffaa33, core: 0xffd79a, accent: 0x5ed0c8 },
    opBudget: 17,
    projectile(g, c, col) {
      const a = 1 - c.k * 0.2;
      const { x, y, angle } = c;
      const ph = c.clock / 500;
      // 双层环：环形用「单条带孔多边形」画（1px 连续硬边），环距留 1.6px 才不糊成一坨
      poly(g, ringPoly(x, y, 7, 1.3, ph), col.edge, a);
      poly(g, ringPoly(x, y, 4.4, 1.3, ph), col.body, a);
      // 环间 4 个符文点：回声的「二次读点」
      dots(g, ringDots(x, y, 5.8, 4, -ph), col.accent, a);
      blocks(g, [offset(x, y, angle, 0, 0)], col.core, a, 2);
      dots(g, [offset(x, y, angle, 0, -2.4), offset(x, y, angle, 2.4, 1.6), offset(x, y, angle, -2.4, 1.6)], col.core, a * 0.85);
    },
    trailFx(g, c, col) {
      bandTrail(g, c, col, { style: 'ring', max: 6, accent: col.accent });
    },
    cast(g, c, col) {
      const a = 1 - c.k;
      const p = Math.min(1, c.k * 2);
      // 起手：双层环展开 + 符文点
      poly(g, ringPoly(c.x, c.y, 4 + 13 * p, 1.4, c.clock / 500), col.body, a);
      poly(g, ringPoly(c.x, c.y, 3 + 9 * p, 1.4, -c.clock / 500), col.accent, a * 0.9);
      dots(g, [offset(c.x, c.y, c.clock / 300, 7 + 12 * p, 0), offset(c.x, c.y, c.clock / 300 + Math.PI, 7 + 12 * p, 0)], col.core, a);
    },
    impact(g, c, col) {
      const a = 1 - c.k;
      const R = Math.max(4, c.radius);
      const grow = R * (0.5 + 0.6 * c.k);
      // 三层同心声波环
      poly(g, ringPoly(c.x, c.y, grow, 1.4, c.clock / 500), col.body, a);
      poly(g, ringPoly(c.x, c.y, grow * 0.66, 1.4, c.clock / 500), col.accent, a * 0.85);
      poly(g, ringPoly(c.x, c.y, grow * 0.34, 1.4, -c.clock / 500), col.core, a * 0.8);
      // 对侧镜像小环（回声的“另一半”）
      const ang = c.angle;
      const mir = offset(c.x, c.y, ang + Math.PI, grow * 0.9, 0);
      poly(g, ringPoly(mir.x, mir.y, Math.max(2, grow * 0.3), 1.4, -c.clock / 400), col.core, a * 0.85);
    },
    ward(g, c, col) {
      const a = 1 - c.k;
      const R = Math.max(6, c.radius) * 0.8;
      const ph = c.clock / 700;
      poly(g, ringPoly(c.x, c.y, R, 1.4, ph), col.body, a * 0.9);
      poly(g, ringPoly(c.x, c.y, R * 0.68, 1.4, -ph), col.accent, a * 0.75);
      poly(g, ringPoly(c.x, c.y, R * 0.32, 1.4, ph * 2), col.core, a * 0.7);
    },
    link(g, c, col) {
      const a = (1 - c.k) * 0.9;
      const pts = lineDots(c.from.x, c.from.y, c.to.x, c.to.y, 11);
      dots(g, pts.filter((p, i) => i % 2 === 1), col.body, a * 0.8);
      poly(g, ringPoly(c.from.x, c.from.y, 4, 1.4, c.clock / 500), col.accent, a * 0.7);
      poly(g, ringPoly(c.to.x, c.to.y, 4, 1.4, -c.clock / 500), col.core, a * 0.9);
    },
  },

  // 12. 余烬扇：3 根羽毛状火星，橙色余烬飘落拖尾，命中扇形火星爆 + 地面焦痕
  ember_fan: {
    silhouette: 'feather-fan',
    trail: { max: 7, style: 'ember-fall' },
    colors: { edge: C.outline, body: 0xff8a4d, core: 0xffd79a, accent: 0xcc9c6c },
    opBudget: 25,
    projectile(g, c, col) {
      const a = 1 - c.k * 0.2;
      const { x, y, angle } = c;
      // 3 根羽毛状火星，沿飞行方向散开
      for (let i = 0; i < 3; i++) {
        const spread = (i - 1) * 0.44;
        const ax = x + Math.cos(angle + spread) * 3.2;
        const ay = y + Math.sin(angle + spread) * 3.2;
        const ang2 = angle + spread;
        poly(g, shape(ax, ay, ang2, [[6.6, -1], [0.4, -2.2], [-3.4, -0.6], [0.4, 1.4]]), col.edge, a * 0.95);
        poly(g, shape(ax, ay, ang2, [[5.4, -0.8], [0.4, -1.7], [-2.6, -0.4], [0.4, 1]]), i === 1 ? col.body : col.accent, a);
      }
      blocks(g, [offset(x, y, angle, 1.4, 0)], col.core, a, 2);
      dots(g, [offset(x, y, angle, -4.4, 2.2)], col.core, a * 0.8);
    },
    trailFx(g, c, col) {
      bandTrail(g, c, col, { style: 'mote', max: 7, driftY: 2.4, sway: 1, accent: col.accent });
    },
    cast(g, c, col) {
      const a = 1 - c.k;
      const p = Math.min(1, c.k * 2);
      // 起手：三向火星扇开
      const pts = [];
      for (let i = 0; i < 3; i++) {
        const ang = c.angle + (i - 1) * 0.34;
        for (let s = 0; s < 3; s++) pts.push(offset(c.x, c.y, ang, 3 + (6 + 8 * p) * (s / 2), 0));
      }
      dots(g, pts, col.body, a);
      blocks(g, [c], col.core, a, 2);
      dots(g, [offset(c.x, c.y, c.angle, 8 + 10 * p, 0)], col.core, a * 0.85);
    },
    impact(g, c, col) {
      const a = 1 - c.k;
      const R = Math.max(4, c.radius);
      const grow = R * (0.55 + 0.5 * c.k);
      const ang = c.angle;
      // 扇形火星爆：沿朝向 ±40° 撒火星
      const sparks = [];
      for (let i = 0; i < 9; i++) {
        const spread = (i / 8 - 0.5) * 1.4;
        sparks.push(offset(c.x, c.y, ang + spread, grow * (0.6 + 0.4 * ((i % 3) / 2)), 0));
      }
      dots(g, sparks, col.body, a);
      dots(g, sparks.map((p, i) => ({ x: p.x, y: p.y - 2 - (i % 2) })), col.core, a * 0.85);
      // 地面焦痕
      rects(g, [[c.x - grow * 0.7, c.y + 1, grow * 1.4, 2], [c.x - grow * 0.35, c.y + 3, grow * 0.7, 1]], col.accent, a * 0.7);
    },
    ward(g, c, col) {
      const a = 1 - c.k;
      const R = Math.max(6, c.radius) * 0.8;
      const ph = c.clock / 500;
      const ring = [];
      for (let i = 0; i < 8; i++) {
        const p = offset(c.x, c.y, ph + (i / 8) * TAU, R, 0);
        ring.push({ x: p.x, y: p.y + Math.sin(ph * 3 + i) * 1.6 });
      }
      dots(g, ring, col.body, a * 0.9);
      dots(g, ring.map((p) => ({ x: p.x, y: p.y + 2 })), col.core, a * 0.7);
    },
    link(g, c, col) {
      const a = (1 - c.k) * 0.9;
      const pts = lineDots(c.from.x, c.from.y, c.to.x, c.to.y, 11);
      dots(g, pts.filter((p, i) => i % 2 === 0), col.body, a * 0.8);
      dots(g, pts.map((p, i) => ({ x: p.x, y: p.y + 1 + (i % 2) })), col.accent, a * 0.55);
      blocks(g, [c.to], col.core, a, 2);
    },
  },

  // 13. 地裂之颚：上下两排锯齿牙，碎石拖尾，命中地面锯齿裂口张开 + 碎石飞溅
  quake_maw: {
    silhouette: 'jaw',
    trail: { max: 6, style: 'rubble' },
    colors: { edge: C.outline, body: 0xcc9c6c, core: 0xe0c35a, accent: 0x6c6c54 },
    opBudget: 31,
    projectile(g, c, col) {
      const a = 1 - c.k * 0.2;
      const { x, y, angle } = c;
      const jaw = (sign, w) => {
        const pts = [];
        for (let i = 0; i <= 8; i++) {
          const lx = -7 + i * 1.75;
          const ly = sign * (w + (i % 2 === 0 ? 0 : 3.6));
          pts.push([lx, ly]);
        }
        return pts;
      };
      // 两排锯齿牙：先描边后本体（牙床朝内）
      poly(g, shape(x, y, angle, jaw(-1, 1)), col.edge, a * 0.95);
      poly(g, shape(x, y, angle, jaw(-1, 1.8)), col.body, a * 0.9);
      poly(g, shape(x, y, angle, jaw(1, 1)), col.edge, a * 0.95);
      poly(g, shape(x, y, angle, jaw(1, 1.8)), col.body, a * 0.9);
      blocks(g, [offset(x, y, angle, 0, 0)], col.core, a, 2);
      dots(g, [offset(x, y, angle, -8, 0), offset(x, y, angle, 8, 0)], col.accent, a * 0.8);
    },
    trailFx(g, c, col) {
      bandTrail(g, c, col, { style: 'rubble', max: 6, sway: 0.5, accent: col.accent });
    },
    cast(g, c, col) {
      const a = 1 - c.k;
      const p = Math.min(1, c.k * 2);
      // 起手：地面裂缝从杖尖前方张开 + 碎石溅起
      const pts = [];
      for (let i = 0; i < 8; i++) {
        const u = i / 7;
        pts.push({ x: c.x + (u - 0.35) * 22 * p, y: c.y + 1 + Math.sin(i * 2.2 + c.clock / 400) * 1.6 });
      }
      dots(g, pts, col.body, a);
      dots(g, pts.filter((q, i) => i % 2 === 1).map((q) => ({ x: q.x, y: q.y - 2 })), col.core, a * 0.8);
      blocks(g, [offset(c.x, c.y, 0, -5, -6 * p), offset(c.x, c.y, 0, 5, -4 * p)], col.accent, a * 0.85, 2);
    },
    impact(g, c, col) {
      const a = 1 - c.k;
      const R = Math.max(4, c.radius);
      const grow = R * (0.6 + 0.5 * c.k);
      // 裂口张开：牙床从裂缝两侧分开（半径 80 时约 20px，不能撑成半屏黑坑）
      const open = Math.min(1.5 + grow * 0.13, R * 0.13);
      // 牙尖间距压到 ~6px：半径 80 时 26 颗牙，半径 14 时 5 颗，任何半径下都是连续锯齿
      const toothCount = Math.max(5, Math.min(26, Math.round((grow * 2) / 6)));
      const step = (grow * 2) / toothCount;
      const depth = Math.max(3, Math.min(10, grow * 0.13));
      // 牙床 = 「平基线 + 锯齿内缘」的实心多边形，牙尖朝裂缝
      const jaw = (sign, gapY, dep) => {
        const pts = [];
        for (let i = 0; i <= toothCount; i++) {
          const x = c.x - grow + i * step;
          pts.push({ x, y: c.y + sign * (gapY + dep) });
          if (i < toothCount) pts.push({ x: x + step / 2, y: c.y + sign * gapY });
        }
        return pts;
      };
      // 牙床内缘的锯齿线（牙根/牙尖交替）：既做牙的边界，也做裂缝的边界
      const zigzag = (sign, gapY, dep) => {
        const pts = [];
        for (let i = 0; i < toothCount; i++) {
          const x = c.x - grow + i * step;
          pts.push({ x, y: c.y + sign * (gapY + dep) });
          pts.push({ x: x + step / 2, y: c.y + sign * gapY });
        }
        pts.push({ x: c.x + grow, y: c.y + sign * (gapY + dep) });
        return pts;
      };
      // 裂缝：深渊底沿锯齿内缘铺（不再是直边黑矩形），中间再压一条 2px 硬边裂缝线
      const chasm = zigzag(-1, open, depth).concat(zigzag(1, open, depth).reverse());
      poly(g, chasm, C.void, a * 0.5);
      rects(g, [[c.x - grow * 0.92, c.y - 1, grow * 1.84, 2]], C.outline, a * 0.9);
      // 上下两排牙：描边 → 牙床 body → 牙尖 core（三层，全部是连续多边形）
      for (const sign of [-1, 1]) {
        poly(g, jaw(sign, Math.max(0.5, open - 1), depth + 1.4), col.edge, a * 0.95);
        poly(g, jaw(sign, open, depth), col.body, a);
        poly(g, jaw(sign, open, Math.max(1, depth * 0.42)), col.core, a * 0.8);
      }
      // 碎石飞溅：数量随半径增加，避免大半径下只剩几颗孤点
      const rocks = [];
      const rockCount = Math.max(6, Math.min(12, Math.round(grow / 6)));
      for (let i = 0; i < rockCount; i++) {
        const ang = (i / rockCount) * TAU + 0.5;
        rocks.push(offset(c.x, c.y, ang, grow * (0.94 + (i % 3) * 0.1), 0));
      }
      blocks(g, rocks, col.accent, a * 0.85, 2);
    },
    ward(g, c, col) {
      const a = 1 - c.k;
      const R = Math.max(6, c.radius) * 0.8;
      const ph = c.clock / 1200;
      const rocks = [];
      for (let i = 0; i < 8; i++) rocks.push(offset(c.x, c.y, ph + (i / 8) * TAU, R, 0));
      blocks(g, rocks, col.body, a * 0.9, 2);
      dots(g, rocks.map((p) => ({ x: p.x, y: p.y - 2 })), col.core, a * 0.7);
      poly(g, ringPoly(c.x, c.y, R * 0.6, 1.4, -ph, 0.35), col.accent, a * 0.5);
    },
    link(g, c, col) {
      const a = (1 - c.k) * 0.9;
      // 地裂：沿线的锯齿裂缝
      const pts = [];
      const n = 9;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        pts.push({
          x: c.from.x + (c.to.x - c.from.x) * u,
          y: c.from.y + (c.to.y - c.from.y) * u + Math.sin(i * 2.6) * 1.8,
        });
      }
      dots(g, pts, col.body, a * 0.9);
      dots(g, pts.filter((p, i) => i % 2 === 0).map((p) => ({ x: p.x, y: p.y + 1 })), col.core, a * 0.7);
      blocks(g, [c.to], col.accent, a, 2);
    },
  },

  // 14. 噬魂箭：暗紫魂矢 + 亮箭尖，游魂拖影，命中魂火炸 + 丝线拉回
  soul_lance: {
    silhouette: 'soul-arrow',
    trail: { max: 6, style: 'wisp' },
    colors: { edge: C.outline, body: 0xb8a0ff, core: 0xfff6e0, accent: 0x7d6bb0 },
    opBudget: 24,
    projectile(g, c, col) {
      const a = 1 - c.k * 0.2;
      const { x, y, angle } = c;
      poly(g, shape(x, y, angle, [[9.6, 0], [1, -3.6], [-5.4, -1.8], [-5.4, 1.8], [1, 3.6]]), col.edge, a);
      poly(g, shape(x, y, angle, [[8, 0], [0.6, -2.4], [-4.4, -1.2], [-4.4, 1.2], [0.6, 2.4]]), col.body, a);
      poly(g, shape(x, y, angle, [[5.2, 0], [1.4, -1.2], [-1.4, 0], [1.4, 1.2]]), col.core, a);
      // 游魂拖影
      const wisps = [];
      for (let i = 0; i < 3; i++) {
        wisps.push(offset(x, y, angle, -6 - i * 2.2, Math.sin(c.clock / 320 + i * 1.8) * 2.4));
      }
      dots(g, wisps, col.accent, a * 0.85);
      dots(g, [offset(x, y, angle, 10.4, 0)], col.core, a);
    },
    trailFx(g, c, col) {
      bandTrail(g, c, col, { style: 'wisp', max: 6, sway: 2, accent: col.accent });
    },
    cast(g, c, col) {
      const a = 1 - c.k;
      const p = Math.min(1, c.k * 2);
      // 起手：魂火上窜 + 游魂点
      const flame = [];
      for (let i = 0; i < 5; i++) {
        flame.push({ x: c.x + Math.sin(i * 2.4 + c.clock / 300) * (3 - i * 0.4), y: c.y - 2 - i * (2.4 + 3 * p) });
      }
      dots(g, flame, col.body, a);
      dots(g, flame.map((q) => ({ x: q.x, y: q.y - 1 })), col.core, a * 0.8);
      poly(g, ringPoly(c.x, c.y, 4 + 7 * p, 1.4, -c.clock / 500, 0.6), col.accent, a * 0.7);
    },
    impact(g, c, col) {
      const a = 1 - c.k;
      const R = Math.max(4, c.radius);
      const grow = R * (0.6 + 0.45 * c.k);
      // 魂火炸
      poly(g, shape(c.x, c.y, 0, [[0, -grow], [grow * 0.5, -grow * 0.2], [grow * 0.28, grow * 0.8], [-grow * 0.28, grow * 0.8], [-grow * 0.5, -grow * 0.2]]), col.accent, a * 0.8);
      poly(g, ringPoly(c.x, c.y, grow * 0.8, 1.4, c.clock / 500), col.body, a);
      poly(g, ringPoly(c.x, c.y, grow * 0.45, 1.4, -c.clock / 600), col.core, a * 0.85);
      // 丝线拉回：从落点反方向抽 3 条
      const ang = c.angle + Math.PI;
      for (let i = 0; i < 3; i++) {
        const pts = [];
        for (let s = 0; s < 4; s++) {
          const u = s / 3;
          pts.push(offset(c.x, c.y, ang + (i - 1) * 0.26, (2 + grow) * u, Math.sin(u * 4 + i) * 1.6));
        }
        dots(g, pts, col.core, a * 0.7);
      }
    },
    ward(g, c, col) {
      const a = 1 - c.k;
      const R = Math.max(6, c.radius) * 0.8;
      const ph = c.clock / 800;
      const ring = [];
      for (let i = 0; i < 9; i++) {
        const ang = ph + (i / 9) * TAU;
        ring.push(offset(c.x, c.y, ang, R, Math.sin(ang * 2 + c.clock / 400) * 1.4));
      }
      dots(g, ring, col.body, a * 0.85);
      dots(g, ring.map((p) => ({ x: p.x, y: p.y - 2 })), col.core, a * 0.7);
      poly(g, ringPoly(c.x, c.y, R * 0.45, 1.4, -ph), col.accent, a * 0.5);
    },
    link(g, c, col) {
      const a = (1 - c.k) * 0.9;
      const pts = sinePts(c.from.x, c.from.y, c.to.x, c.to.y, 5, 12, c.clock / 340);
      dots(g, pts, col.body, a * 0.85);
      dots(g, pts.filter((p, i) => i % 3 === 0), col.core, a * 0.7);
      dots(g, [offset(c.from.x, c.from.y, 0, 0, -2), offset(c.from.x, c.from.y, 0, 2, 1)], col.accent, a * 0.6);
    },
  },

  // 15. 圣环：3 层同心环 + 4 个符文节点，起手环展开 + 符文旋转
  aegis_ring: {
    silhouette: 'triple-ring',
    trail: { max: 5, style: 'rune-orbit' },
    colors: { edge: C.outline, body: 0xc8e8d0, core: 0x5ed0c8, accent: 0xe0c35a },
    opBudget: 18,
    projectile(g, c, col) {
      const a = 1 - c.k * 0.2;
      const { x, y } = c;
      const ph = c.clock / 520;
      poly(g, ringPoly(x, y, 7.2, 1, ph), col.edge, a * 0.9);
      poly(g, ringPoly(x, y, 4.6, 1.2, -ph), col.body, a);
      poly(g, ringPoly(x, y, 2.2, 1, ph * 1.6), col.core, a * 0.9);
      // 4 个符文节点（夹在中环与外环之间）
      const nodes = [];
      for (let i = 0; i < 4; i++) nodes.push(offset(x, y, ph + (i / 4) * TAU, 5.9, 0));
      dots(g, nodes, col.accent, a);
      blocks(g, [c], col.core, a, 2);
    },
    trailFx(g, c, col) {
      bandTrail(g, c, col, { style: 'rune', max: 5, accent: col.accent });
    },
    cast(g, c, col) {
      const a = 1 - c.k;
      const p = Math.min(1, c.k * 2);
      // 起手：环展开 + 4 符文旋转
      poly(g, ringPoly(c.x, c.y, 5 + 12 * p, 1.4, c.clock / 500), col.body, a);
      poly(g, ringPoly(c.x, c.y, 3 + 8 * p, 1.4, -c.clock / 500), col.core, a * 0.85);
      const nodes = [];
      for (let i = 0; i < 4; i++) nodes.push(offset(c.x, c.y, c.clock / 300 + (i / 4) * TAU, 6 + 10 * p, 0));
      blocks(g, nodes, col.accent, a);
    },
    impact(g, c, col) {
      const a = 1 - c.k;
      const R = Math.max(4, c.radius);
      const grow = R * (0.5 + 0.6 * c.k);
      poly(g, ringPoly(c.x, c.y, grow, 1.4, c.clock / 500), col.body, a);
      poly(g, ringPoly(c.x, c.y, grow * 0.7, 1.4, -c.clock / 500), col.core, a * 0.9);
      poly(g, ringPoly(c.x, c.y, grow * 0.4, 1.4, c.clock / 400), col.accent, a * 0.8);
      const nodes = [];
      for (let i = 0; i < 4; i++) nodes.push(offset(c.x, c.y, -c.clock / 400 + (i / 4) * TAU, grow * 0.85, 0));
      blocks(g, nodes, col.core, a, 2);
    },
    ward(g, c, col) {
      const a = 1 - c.k;
      const R = Math.max(6, c.radius);
      const ph = c.clock / 800;
      // 3 层同心环 + 4 符文节点（圣环本体）
      poly(g, ringPoly(c.x, c.y, R * 0.5, 1.4, ph), col.core, a * 0.9);
      poly(g, ringPoly(c.x, c.y, R * 0.75, 1.4, -ph), col.body, a * 0.85);
      poly(g, ringPoly(c.x, c.y, R * 1.0, 1.4, ph * 1.6), col.accent, a * 0.75);
      const nodes = [];
      for (let i = 0; i < 4; i++) nodes.push(offset(c.x, c.y, ph * 1.2 + (i / 4) * TAU, R * 0.88, 0));
      blocks(g, nodes, col.core, a, 2);
    },
    link(g, c, col) {
      const a = (1 - c.k) * 0.9;
      const pts = lineDots(c.from.x, c.from.y, c.to.x, c.to.y, 9);
      dots(g, pts, col.body, a * 0.6);
      poly(g, ringPoly(c.from.x, c.from.y, 3.4, 1.4, c.clock / 500), col.accent, a * 0.8);
      poly(g, ringPoly(c.to.x, c.to.y, 3.4, 1.4, -c.clock / 500), col.core, a * 0.9);
      blocks(g, [{ x: (c.from.x + c.to.x) / 2, y: (c.from.y + c.to.y) / 2 }], col.accent, a * 0.8, 2);
    },
  },

  // 16. 陨星裁决：不规则岩石 + 火焰拖尾 + 黑烟点，命中大爆炸双环 + 陨坑
  meteor_judgment: {
    silhouette: 'rock',
    trail: { max: 8, style: 'smoke' },
    colors: { edge: C.outline, body: 0xb08252, core: 0xfff2c0, accent: 0xff7a3c },
    opBudget: 38,
    projectile(g, c, col) {
      const a = 1 - c.k * 0.2;
      const { x, y, angle } = c;
      const spin = c.clock / 700;
      // 不规则岩石：8 个顶点用确定性哈希固定抖动量
      const rock = [];
      const rad = 6.6;
      for (let i = 0; i < 8; i++) {
        const ang = spin + (i / 8) * TAU;
        const j = rad * (0.82 + hash01(i + 7) * 0.32);
        rock.push([Math.cos(ang) * j, Math.sin(ang) * j]);
      }
      poly(g, shape(x, y, 0, rock), col.edge, a);
      const inner = rock.map(([lx, ly]) => [lx * 0.72, ly * 0.72]);
      poly(g, shape(x, y, 0, inner), col.body, a);
      // 火焰拖尾（向后）
      poly(g, shape(x, y, angle, [[-4, -2.4], [-10.4, -0.8], [-6.6, 2.6]]), col.accent, a * 0.9);
      // 黑烟点
      dots(g, [offset(x, y, angle, -8.4, -2.6), offset(x, y, angle, -11.4, 1.8)], C.mute, a * 0.8);
      dots(g, [offset(x, y, angle, 2.4, -2)], col.core, a * 0.9);
    },
    trailFx(g, c, col) {
      bandTrail(g, c, col, { style: 'smoke', max: 8, driftY: 1.6, sway: 1.6, accent: col.accent });
    },
    cast(g, c, col) {
      const a = 1 - c.k;
      const p = Math.min(1, c.k * 2);
      // 起手：岩石在杖尖上方成形 + 黑烟 + 火星
      const rock = [];
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * TAU + c.clock / 700;
        const j = (2 + 6 * p) * (0.85 + hash01(i + 21) * 0.3);
        rock.push([Math.cos(ang) * j, Math.sin(ang) * j - 6 * p]);
      }
      poly(g, shape(c.x, c.y, 0, rock), col.body, a);
      poly(g, ringPoly(c.x, c.y - 6 * p, 4 + 8 * p, 1.4, c.clock / 600), col.core, a * 0.8);
      dots(g, [offset(c.x, c.y, 0, -3, -8 - 10 * p), offset(c.x, c.y, 0, 3, -6 - 12 * p)], col.accent, a * 0.85);
    },
    impact(g, c, col) {
      const a = 1 - c.k;
      const R = Math.max(4, c.radius);
      const grow = R * (0.55 + 0.55 * c.k);
      // 大爆炸双环
      poly(g, ringPoly(c.x, c.y, grow, 1.3, 0, 0.9), col.edge, a * 0.9);
      poly(g, ringPoly(c.x, c.y, grow * 0.82, 1.2, 0.1, 0.9), col.accent, a);
      poly(g, ringPoly(c.x, c.y, grow * 0.48, 1.1, -0.2, 0.9), col.core, a * 0.9);
      // 陨坑：下沉的地面裂口（两段短横 + 一道底缝，不横穿整个爆环）
      rects(g, [
        [c.x - grow * 0.52, c.y + grow * 0.5, grow * 0.42, 2],
        [c.x + grow * 0.1, c.y + grow * 0.5, grow * 0.42, 2],
        [c.x - grow * 0.24, c.y + grow * 0.62, grow * 0.48, 1],
      ], col.body, a * 0.75);
      // 碎石：数量随半径增加（半径 95 时才不会只剩 5 颗孤零零的石头）
      const rocks = [];
      const rockCount = Math.max(7, Math.min(12, Math.round(grow / 7)));
      for (let i = 0; i < rockCount; i++) {
        rocks.push(offset(c.x, c.y, (i / rockCount) * TAU + 0.7, grow * (1.02 + (i % 2) * 0.08), 0));
      }
      blocks(g, rocks, col.body, a * 0.9, 2);
      // 外圈细碎火星，把大半径下的空隙填上
      const embers = [];
      const emberCount = Math.max(6, Math.min(10, Math.round(grow / 9)));
      for (let i = 0; i < emberCount; i++) {
        embers.push(offset(c.x, c.y, (i / emberCount) * TAU + 1.3, grow * 1.22, 0));
      }
      dots(g, embers, col.accent, a * 0.8);
      blocks(g, [c], col.core, a, 3);
    },
    ward(g, c, col) {
      const a = 1 - c.k;
      const R = Math.max(6, c.radius) * 0.8;
      const ph = c.clock / 1400;
      const rocks = [];
      for (let i = 0; i < 6; i++) rocks.push(offset(c.x, c.y, ph + (i / 6) * TAU, R, 0));
      blocks(g, rocks, col.body, a * 0.9, 3);
      dots(g, rocks.map((p) => ({ x: p.x, y: p.y - 2 })), col.accent, a * 0.8);
      poly(g, ringPoly(c.x, c.y, R * 1.05, 1.4, -ph), col.core, a * 0.45);
    },
    link(g, c, col) {
      const a = (1 - c.k) * 0.9;
      const pts = lineDots(c.from.x, c.from.y, c.to.x, c.to.y, 12);
      dots(g, pts, col.accent, a * 0.75);
      dots(g, pts.filter((p, i) => i % 3 === 0), C.mute, a * 0.6);
      blocks(g, [c.to], col.core, a, 2);
    },
  },
};

// 兜底：未知 defId 沿用旧的「菱形 + 白色高光」语言，配色退回奥术
const FALLBACK_IMPL = {
  silhouette: 'legacy-diamond',
  trail: { max: 5, style: 'legacy' },
  colors: { edge: C.outline, body: C.arcane, core: C.white, accent: C.arcaneLight },
  opBudget: 20,
  projectile(g, c, col) {
    poly(g, diamondAt(c.x, c.y, 0, 3), col.edge, 1, false);
    poly(g, diamondAt(c.x, c.y, 0, 2), col.body, 1);
    blocks(g, [{ x: c.x - 1, y: c.y - 1 }], col.core, 1, 1);
    dots(g, [{ x: c.x, y: c.y }], col.accent, 1);
  },
  trailFx(g, c, col) {
    bandTrail(g, c, col, { style: 'mote', max: 5, accent: col.accent });
  },
  cast(g, c, col) {
    const a = 1 - c.k;
    poly(g, ringPoly(c.x, c.y, 3 + 8 * c.k, 1.4, c.clock / 500), col.accent, a);
  },
  impact(g, c, col) {
    const a = 1 - c.k;
    poly(g, diamondAt(c.x, c.y, 0, 3 + c.radius * 0.25 * (0.4 + c.k)), col.edge, a, false);
    poly(g, diamondAt(c.x, c.y, 0, 2 + c.radius * 0.2 * (0.4 + c.k)), col.body, a);
    dots(g, [c], col.core, a);
  },
  ward(g, c, col) {
    const a = 1 - c.k;
    poly(g, ringPoly(c.x, c.y, Math.max(6, c.radius) * 0.8, 1.4, c.clock / 600), col.accent, a * 0.7);
  },
  link(g, c, col) {
    dots(g, lineDots(c.from.x, c.from.y, c.to.x, c.to.y, 8), col.body, 1 - c.k);
  },
};

// ---------- 对外 API ----------

// 顺序稳定：与需求清单一致，Lead 可直接按这个顺序做接线/调试面板
export const FX_DEF_IDS = [
  'frost_arrow',
  'arcane_bolt',
  'flame_burst',
  'judgment_hammer',
  'thorn_vine',
  'starfall',
  'holy_ward',
  'mana_siphon',
  'chain_lightning',
  'pierce_lance',
  'echo_sigil',
  'ember_fan',
  'quake_maw',
  'soul_lance',
  'aegis_ring',
  'meteor_judgment',
];

const IMPL = SPELLS;

// descriptor 是给接线/调试面板看的只读摘要：
//   silhouette 16 个互不相同；trail.style 是人类可读的拖尾标签（实际分段渲染在各自的
//   trailFx 里，标签只用于文档/调试）；colors 四色都来自此表，别再在外面写死。
function descriptorOf(id, impl) {
  return {
    id,
    silhouette: impl.silhouette,
    trail: { max: impl.trail.max, style: impl.trail.style },
    colors: { ...impl.colors },
    opBudget: impl.opBudget,
  };
}

export const SPELL_FX = {};
for (let i = 0; i < FX_DEF_IDS.length; i++) {
  const id = FX_DEF_IDS[i];
  SPELL_FX[id] = descriptorOf(id, SPELLS[id]);
}

export const FALLBACK_FX = descriptorOf('fallback', FALLBACK_IMPL);

// 未知 defId 返回兜底 descriptor（沿用旧菱形风格）
export function fxFor(defId) {
  return SPELL_FX[defId] ?? FALLBACK_FX;
}

function implOf(defId) {
  return IMPL[defId] ?? FALLBACK_IMPL;
}

const DRAWERS = {
  projectile: (impl, g, c) => impl.projectile(g, c, impl.colors),
  trail: (impl, g, c) => impl.trailFx(g, c, impl.colors),
  cast: (impl, g, c) => impl.cast(g, c, impl.colors),
  impact: (impl, g, c) => impl.impact(g, c, impl.colors),
  ward: (impl, g, c) => impl.ward(g, c, impl.colors),
  link: (impl, g, c) => impl.link(g, c, impl.colors),
};

function run(kind, g, defId, ctx) {
  const impl = implOf(defId);
  DRAWERS[kind](impl, g, normalize(ctx));
}

export function drawProjectileFx(g, defId, ctx) { run('projectile', g, defId, ctx); }
export function drawTrailFx(g, defId, ctx) { run('trail', g, defId, ctx); }
export function drawCastFx(g, defId, ctx) { run('cast', g, defId, ctx); }
export function drawImpactFx(g, defId, ctx) { run('impact', g, defId, ctx); }
export function drawWardFx(g, defId, ctx) { run('ward', g, defId, ctx); }
export function drawLinkFx(g, defId, ctx) { run('link', g, defId, ctx); }
