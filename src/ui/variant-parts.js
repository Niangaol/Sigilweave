// 敌人变体配件：三张通用叠加件（盾 / 肩甲 / 王冠）。
// 契约见 docs/superpowers/specs/2026-11-16-enemy-variants-ai-design.md §6。
//
// 生成方式与 Background.bakeFloor 一致：先用 Graphics 画硬边像素再 generateTexture，
// 拿不到 Graphics（无渲染器的纯逻辑环境）时退回 CanvasTexture；两者都不可用就静默跳过，
// 实体层按 textures.exists 自动降级为「没有配件」，绝不因为美术缺失抛错。
//
// 美术覆盖：同名 PNG（assets/sprites/var_shield.png 等）一旦先被 BootScene 预载，
// textures.exists(key) 为真，这里直接跳过——美术图天然优先于程序化纹理。
// 全部硬边色块，无渐变、无 Math.random，尺寸与色板都来自 Palette。
import { C, pxRect } from './Palette.js';

// 三种配件的画布尺寸（像素）。key 与变体数据的 variant.parts 一一对应。
export const VARIANT_PART_TEXTURES = {
  var_shield: { part: 'shield', width: 16, height: 16, draw: drawShield },
  var_pauldron: { part: 'pauldron', width: 16, height: 12, draw: drawPauldron },
  var_crown: { part: 'crown', width: 16, height: 10, draw: drawCrown },
};

// 盾牌轮廓（自上而下的 [x, 宽] 行）：上宽下尖的鸢形盾，占 16×16 画布的 y=1..14。
const SHIELD_ROWS = [
  [4, 8], [3, 10], [2, 12], [2, 12], [2, 12], [2, 12], [2, 12],
  [2, 12], [2, 12], [3, 10], [4, 8], [5, 6], [6, 4], [7, 2],
];

function drawShield(g) {
  const Y = 1;
  // 近黑描边：整行先铺，内层再压回来，得到 1px 硬边
  for (let i = 0; i < SHIELD_ROWS.length; i++) {
    const [x, w] = SHIELD_ROWS[i];
    pxRect(g, x, Y + i, w, 1, C.outline, 1);
  }
  // 钢面：上四行提亮，往下压暗，读作受光
  for (let i = 1; i < SHIELD_ROWS.length; i++) {
    const [x, w] = SHIELD_ROWS[i];
    if (w <= 2) continue;
    pxRect(g, x + 1, Y + i, w - 2, 1, i <= 4 ? C.stoneLight : C.stone, 1);
  }
  // 左缘高光
  for (let i = 2; i <= 10; i++) pxRect(g, 3, Y + i, 1, 1, C.groove, 1);
  // 青钢盾心（硬边菱形，中央挖暗）
  pxRect(g, 7, Y + 4, 2, 1, C.teal, 1);
  pxRect(g, 6, Y + 5, 4, 1, C.teal, 1);
  pxRect(g, 6, Y + 6, 4, 1, C.teal, 1);
  pxRect(g, 7, Y + 7, 2, 1, C.teal, 1);
  pxRect(g, 7, Y + 5, 2, 2, C.outline, 1);
  // 黄铜铆钉
  pxRect(g, 4, Y + 3, 1, 1, C.brass, 1);
  pxRect(g, 11, Y + 3, 1, 1, C.brass, 1);
  pxRect(g, 4, Y + 8, 1, 1, C.brass, 1);
  pxRect(g, 11, Y + 8, 1, 1, C.brass, 1);
}

// 肩甲：三层叠片，越往下越暗；下缘黄铜压条 + 中央青钢宝石。
const PAULDRON_ROWS = [
  [2, 11], [1, 13], [1, 13], [1, 13], [1, 13],
  [1, 13], [1, 13], [2, 11], [3, 9],
];

function drawPauldron(g) {
  const Y = 1;
  for (let i = 0; i < PAULDRON_ROWS.length; i++) {
    const [x, w] = PAULDRON_ROWS[i];
    pxRect(g, x, Y + i, w, 1, C.outline, 1);
  }
  // 三层甲片：0-2 亮钢 / 3-5 中钢 / 6-8 暗钢
  for (let i = 1; i < PAULDRON_ROWS.length; i++) {
    const [x, w] = PAULDRON_ROWS[i];
    if (w <= 2) continue;
    const tone = i <= 2 ? C.stoneLight : i <= 5 ? C.stone : C.stoneDark;
    pxRect(g, x + 1, Y + i, w - 2, 1, tone, 1);
  }
  // 叠片接缝（留 1px 暗线，硬边分层）
  pxRect(g, 2, Y + 3, 11, 1, C.outline, 1);
  pxRect(g, 2, Y + 6, 11, 1, C.outline, 1);
  // 黄铜压条与铆钉
  pxRect(g, 3, Y + 7, 9, 1, C.brassDark, 1);
  pxRect(g, 2, Y + 1, 1, 1, C.brassLight, 1);
  pxRect(g, 12, Y + 1, 1, 1, C.brassLight, 1);
  // 中央青钢宝石
  pxRect(g, 7, Y + 3, 2, 1, C.teal, 1);
  pxRect(g, 6, Y + 4, 4, 1, C.teal, 1);
  pxRect(g, 7, Y + 5, 2, 1, C.teal, 1);
  pxRect(g, 7, Y + 4, 1, 1, C.outline, 1);
}

// 王冠：三尖（中高两低）+ 宽箍，黄铜主体 + 青钢宝石。
// 轮廓由填充掩膜按 8 邻域算出来（1px 近黑描边），保证尖角处也是硬边。
const CROWN_FILL = [
  [[7, 2]],
  [[2, 2], [6, 4], [12, 2]],
  [[1, 4], [5, 6], [11, 4]],
  [[1, 14]],
  [[1, 14]],
  [[1, 14]],
  [[1, 14]],
  [[2, 12]],
  [[2, 12]],
];

function drawCrown(g) {
  const W = 16;
  const H = 10;
  const mask = Array.from({ length: H }, () => new Array(W).fill(false));
  for (let y = 0; y < CROWN_FILL.length; y++) {
    for (const [x, w] of CROWN_FILL[y]) {
      for (let i = 0; i < w; i++) {
        if (x + i >= 0 && x + i < W) mask[y][x + i] = true;
      }
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (mask[y][x]) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy;
          const xx = x + dx;
          if (yy < 0 || xx < 0 || yy >= H || xx >= W) continue;
          if (mask[yy][xx]) { near = true; break; }
        }
      }
      if (near) pxRect(g, x, y, 1, 1, C.outline, 1);
    }
  }
  // 尖顶亮、主体黄铜、箍底压暗
  const toneOf = (y) => (y <= 2 ? C.brassLight : y <= 6 ? C.brass : C.brassDark);
  for (let y = 0; y < CROWN_FILL.length; y++) {
    for (const [x, w] of CROWN_FILL[y]) pxRect(g, x, y, w, 1, toneOf(y), 1);
  }
  // 箍上亮线
  pxRect(g, 2, 6, 12, 1, C.brassLight, 1);
  // 中央青钢宝石（菱形）+ 两侧小宝石
  pxRect(g, 7, 4, 2, 1, C.teal, 1);
  pxRect(g, 6, 5, 4, 1, C.teal, 1);
  pxRect(g, 7, 6, 2, 1, C.teal, 1);
  pxRect(g, 7, 4, 1, 1, C.white, 0.85);
  pxRect(g, 3, 4, 1, 1, C.teal, 1);
  pxRect(g, 12, 4, 1, 1, C.teal, 1);
}

// variant → 配件纹理 key 列表（重甲可以同时挂肩甲+盾）；未知配件名跳过。
export function variantPartKeys(variant) {
  const list = Array.isArray(variant?.parts)
    ? variant.parts
    : (typeof variant?.part === 'string' ? [variant.part] : []);
  const keys = [];
  for (const part of list) {
    if (typeof part !== 'string' || part.length === 0) continue;
    const key = 'var_' + part;
    if (Object.hasOwn(VARIANT_PART_TEXTURES, key)) keys.push(key);
  }
  return keys;
}

// 兼容旧调用：返回第一个配件 key。
export function variantPartKey(variant) {
  return variantPartKeys(variant)[0] ?? null;
}

// Canvas 2D 适配器：把 Palette 的 fillStyle/fillRect 接口翻译成 ctx 调用。
// 只在 Graphics 烘焙不可用时使用；颜色是 Palette 的 0xRRGGBB 数字。
function canvasAdapter(ctx) {
  const rgba = (color, alpha = 1) => {
    const n = Number.isFinite(color) ? color : 0;
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  };
  return {
    fillStyle(color, alpha = 1) { ctx.fillStyle = rgba(color, alpha); },
    fillRect(x, y, w, h) { ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); },
    fillPoints(points, close = true) {
      if (!Array.isArray(points) || points.length === 0) return;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      if (close) ctx.closePath();
      ctx.fill();
    },
  };
}

function bakeVariantTexture(scene, key, spec) {
  // 1) Graphics 烘焙（与 Background.bakeFloor 同一条路，渲染器在就用它）
  if (typeof scene.make?.graphics === 'function') {
    let g = null;
    try {
      g = scene.make.graphics({ x: 0, y: 0, add: false });
      if (g) {
        spec.draw(g);
        g.generateTexture(key, spec.width, spec.height);
        g.destroy();
        g = null;
        if (scene.textures.exists(key)) return true;
      }
    } catch {
      // 落到 Canvas 路径；下面的 finally 会回收 Graphics
    } finally {
      if (g) {
        try { g.destroy(); } catch { /* 已经销毁或不可销毁，忽略 */ }
      }
    }
  }
  // 2) CanvasTexture 兜底（无 Phaser 渲染器的环境不会走到这里）
  if (typeof scene.textures?.createCanvas === 'function') {
    let canvas = null;
    try {
      canvas = scene.textures.createCanvas(key, spec.width, spec.height);
      const ctx = typeof canvas?.getContext === 'function' ? canvas.getContext() : canvas?.context;
      if (!ctx) return false;
      spec.draw(canvasAdapter(ctx));
      if (typeof canvas.refresh === 'function') canvas.refresh();
      return true;
    } catch {
      try { scene.textures.remove?.(key); } catch { /* 忽略 */ }
      return false;
    }
  }
  return false;
}

// 幂等生成三张配件纹理；返回本次真正生成的张数。
// 已存在（美术 PNG 或上一次生成）的 key 一律跳过。
export function ensureVariantTextures(scene) {
  const textures = scene?.textures;
  if (!textures || typeof textures.exists !== 'function') return 0;
  let made = 0;
  for (const [key, spec] of Object.entries(VARIANT_PART_TEXTURES)) {
    if (textures.exists(key)) continue;
    if (bakeVariantTexture(scene, key, spec)) made++;
  }
  return made;
}

// 每种配件相对「身体外框」的落点（0~1 比例）。设计意图：
// 盾在朝向侧胸前、肩甲在朝向侧肩头、王冠压在头顶正中。
const PART_ANCHORS = {
  shield: { side: 0.34, lift: 0.52, flip: true },
  pauldron: { side: 0.24, lift: 0.22, flip: true },
  crown: { side: 0, lift: -0.03, flip: false },
};

// 身体外框（相对场景的像素矩形）：优先用 Enemy 维护的 viewExtent，
// 没有精灵时按 radius+12 估身体高度（与程序化绘制的身高一致）。
function partBodyBox(enemy) {
  const r = Number.isFinite(enemy?.radius) ? Math.max(0, enemy.radius) : 6;
  const y = Number.isFinite(enemy?.y) ? enemy.y : 0;
  const extent = enemy?.viewExtent;
  if (extent && Number.isFinite(extent.top) && Number.isFinite(extent.bottom) && extent.bottom > extent.top) {
    const top = y + extent.top;
    const height = Math.max(1, extent.bottom - extent.top);
    const width = Number.isFinite(extent.right) && Number.isFinite(extent.left)
      ? Math.max(1, extent.right - extent.left)
      : Math.max(1, r * 2);
    return { top, height, width };
  }
  const height = r + 12;
  return { top: y + 7 - height, height, width: Math.max(1, (r + 2) * 2) };
}

// 配件相对体型的大小：盾最大（要一眼读出「有甲」），肩甲/王冠略小。
function partScale(kind, box, baseScale) {
  const h = Math.max(12, box.height);
  const ratio = kind === 'shield' ? h / 32 : kind === 'pauldron' ? h / 40 : h / 44;
  const base = Number.isFinite(baseScale) ? Math.max(0.8, Math.min(1.25, baseScale)) : 1;
  return Math.max(0.85, Math.min(1.9, ratio)) * base;
}

// 每帧把配件摆到敌人身上：跟随位置 / 缩放 / 朝向 / 层级 / 可见性。
// 支持多配件（重甲 = 肩甲 + 盾）；只写表现层属性，不碰逻辑坐标。
export function placeVariantPart(enemy) {
  const list = Array.isArray(enemy?.parts) && enemy.parts.length
    ? enemy.parts
    : (enemy?.part ? [{ sprite: enemy.part, kind: enemy.partKind }] : []);
  if (!list.length) return;
  const box = partBodyBox(enemy);
  const face = enemy.face < 0 ? -1 : 1;
  for (const entry of list) {
    const sprite = entry?.sprite ?? entry;
    const kind = entry?.kind ?? enemy.partKind;
    if (!sprite || typeof sprite.setPosition !== 'function') continue;
    const anchor = PART_ANCHORS[kind];
    if (!anchor) continue;
    const scale = partScale(kind, box, enemy.baseScale);
    const x = Math.round(enemy.x + (anchor.side === 0 ? 0 : face * box.width * anchor.side));
    const y = Math.round(anchor.lift < 0
      ? box.top + box.height * anchor.lift - 2
      : box.top + box.height * anchor.lift);
    sprite.setPosition(x, y);
    if (typeof sprite.setDepth === 'function') sprite.setDepth(Math.floor(enemy.y) + 0.2);
    if (typeof sprite.setScale === 'function') sprite.setScale(scale);
    if (anchor.flip && typeof sprite.setFlipX === 'function') sprite.setFlipX(face < 0);
    // 盾牌配件在护甲值归零（破甲）后不再显示；其他配件只跟存活状态走。
    const visible = enemy.alive !== false
      && enemy.partHidden !== true
      && !(kind === 'shield' && !(enemy.shield > 0));
    if (typeof sprite.setVisible === 'function') sprite.setVisible(visible);
  }
}
