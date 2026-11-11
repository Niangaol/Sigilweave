// 法术特效 v2 · 对外门面
// 实现拆成 kit（笔刷）+ 4 个元素组（cold/hot/storm/wild），本文件只做合并与分派。
// 对外的 6 个绘制函数签名与 v1 完全一致，接线处（Projectile / EffectsLayer）零改动。
import { C } from '../Palette.js';
import { normalize, drawEntry, drawExit, drawSpawnFlash, ENTRY_SPAN, EXIT_START } from './kit.js';
import { cold } from './spells/cold.js';
import { hot } from './spells/hot.js';
import { storm } from './spells/storm.js';
import { wild } from './spells/wild.js';

// 元素组合并：同 id 覆盖（后写优先），方便单组独立开发
const SPELLS = { ...cold, ...hot, ...storm, ...wild };

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

// 兜底：未知 defId 沿用旧的「菱形 + 白高光」语言
const FALLBACK_IMPL = {
  silhouette: 'legacy-diamond',
  trail: { max: 5, style: 'legacy' },
  colors: { edge: C.outline, body: C.arcane, core: C.white, accent: C.arcaneLight },
  opBudget: 20,
  projectile(g, c, col) {
    const a = 1 - c.k * 0.2;
    polyAt(g, c.x, c.y, 4, col, a);
  },
  trailFx(g, c, col) {
    const a = 1 - c.k;
    g.fillStyle(col.body, a * 0.8);
    if (!c.trail.length) {
      g.fillRect(Math.round(c.x) - 1, Math.round(c.y) - 1, 2, 2);
      return;
    }
    for (let i = 0; i < c.trail.length; i++) {
      g.fillRect(Math.round(c.trail[i].x) - 1, Math.round(c.trail[i].y) - 1, 2, 2);
    }
  },
  cast(g, c, col) {
    const a = 1 - c.k;
    polyAt(g, c.x, c.y, 3 + 8 * c.k, col, a);
  },
  impact(g, c, col) {
    const a = 1 - c.k;
    polyAt(g, c.x, c.y, 3 + c.radius * 0.2 * (0.4 + c.k), col, a);
  },
  ward(g, c, col) {
    const a = 1 - c.k;
    polyAt(g, c.x, c.y, Math.max(6, c.radius) * 0.7, col, a * 0.7);
  },
  link(g, c, col) {
    g.fillStyle(col.body, 1 - c.k);
    for (let i = 0; i <= 6; i++) {
      const u = i / 6;
      g.fillRect(Math.round(c.from.x + (c.to.x - c.from.x) * u), Math.round(c.from.y + (c.to.y - c.from.y) * u), 2, 2);
    }
  },
};

function polyAt(g, x, y, rad, col, a) {
  const pts = [];
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2;
    pts.push({ x: Math.round(x + Math.cos(ang) * rad), y: Math.round(y + Math.sin(ang) * rad) });
  }
  g.fillStyle(col.edge, a);
  g.fillPoints(pts, true);
  const inner = pts.map((p) => ({ x: Math.round(x + (p.x - x) * 0.62), y: Math.round(y + (p.y - y) * 0.62) }));
  g.fillStyle(col.body, a);
  g.fillPoints(inner, true);
  g.fillStyle(col.core, a);
  g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
}

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
  const impl = SPELLS[id] ?? FALLBACK_IMPL;
  SPELL_FX[id] = descriptorOf(id, impl);
}

export const FALLBACK_FX = descriptorOf('fallback', FALLBACK_IMPL);

export function fxFor(defId) {
  return SPELL_FX[defId] ?? FALLBACK_FX;
}

function implOf(defId) {
  return SPELLS[defId] ?? FALLBACK_IMPL;
}

// 命中图案的「落地尺寸」统一由这里收口：
// 16 套图案内部是照 3~5R 画的（细节足），但实战里 R 是伤害半径，视觉必须落回 1.6~2.4R，
// 否则陨星（radius 95）会画出 400px 的大爆、把小半个屏幕糊住。
// 轻法术收得紧一点（0.46），重击留大一点（0.56）——重量差就这样保留下来。
export const IMPACT_SCALE = {
  frost_arrow: 0.46,
  arcane_bolt: 0.56,
  chain_lightning: 0.6,
  echo_sigil: 0.46,
  mana_siphon: 0.56,
  flame_burst: 0.58,
  ember_fan: 0.5,
  thorn_vine: 0.5,
  soul_lance: 0.5,
  pierce_lance: 0.6,
  holy_ward: 0.5,
  aegis_ring: 0.5,
  starfall: 0.48,
  judgment_hammer: 0.56,
  quake_maw: 0.56,
  meteor_judgment: 0.56,
};
const DEFAULT_IMPACT_SCALE = 0.5;

// 视觉半径：不再直接吃「伤害半径」，否则寒霜（18）只有 30px、陨星（95）画到 400px。
// 用一条平缓曲线把小法术抬起来、把大法术压住：18 → 36.3，46 → 46.1，95 → 63.3。
// 这样轻/重之间仍有 ~2 倍差距（保留重量感），但最小的法术在 480px 战场里也看得见。
const VIS_FLOOR = 30;
const VIS_SLOPE = 0.35;
// 实机镜头（1920 下约 4 倍像素放大）里命中图案会比离线预览图看起来大 30% 左右，
// 0.8 的全局增益就是把「预览里刚好」校正成「实机里刚好」，不改各法术之间的相对大小。
const VIS_GAIN = 0.8;
export function visualRadius(gameplayRadius) {
  const r = Number.isFinite(gameplayRadius) ? Math.max(0, gameplayRadius) : 14;
  return (VIS_FLOOR + r * VIS_SLOPE) * VIS_GAIN;
}

// 入场 / 退场风格：按「法术怎么打出去」分三类，避免 16 个法术的出现与消失又长成一个样。
//   converge/dissipate —— 弹道类：凝聚出场、残余光点被吸回中心
//   erupt/settle       —— 爆裂类：炸开出场、碎屑外飘上浮 + 中心残环焦痕
//   assemble/shatter   —— 守护类：符文归位出场、环带碎裂散场
// 没列到的 defId 走 converge/dissipate 兜底。
export const ENTRY_STYLE = {
  frost_arrow: 'converge',
  arcane_bolt: 'converge',
  chain_lightning: 'converge',
  pierce_lance: 'converge',
  echo_sigil: 'converge',
  mana_siphon: 'converge',
  soul_lance: 'converge',
  flame_burst: 'erupt',
  ember_fan: 'erupt',
  starfall: 'erupt',
  meteor_judgment: 'erupt',
  quake_maw: 'erupt',
  thorn_vine: 'erupt',
  judgment_hammer: 'erupt',
  holy_ward: 'assemble',
  aegis_ring: 'assemble',
};

export const EXIT_STYLE = {
  frost_arrow: 'dissipate',
  arcane_bolt: 'dissipate',
  chain_lightning: 'dissipate',
  pierce_lance: 'dissipate',
  echo_sigil: 'dissipate',
  mana_siphon: 'dissipate',
  soul_lance: 'dissipate',
  flame_burst: 'settle',
  ember_fan: 'settle',
  starfall: 'settle',
  meteor_judgment: 'settle',
  quake_maw: 'settle',
  thorn_vine: 'settle',
  judgment_hammer: 'settle',
  holy_ward: 'shatter',
  aegis_ring: 'shatter',
};

// 「出现」：主体不是啪一下满尺寸，而是从 50% 弹到 100%（smoothstep），配上前 13% 的凝聚层。
// 「消失」：72% 之后主体的 k 被加速到 1.9 倍 —— 主体先散架，碎片层再接住，观感是「碎掉」而不是「变透明」。
function entryRadius(k, r) {
  if (k >= ENTRY_SPAN) return r;
  const p = k / ENTRY_SPAN;
  const e = p * p * (3 - 2 * p);
  return r * (0.5 + 0.5 * e);
}
function exitK(k) {
  if (k <= EXIT_START) return k;
  return Math.min(1, EXIT_START + (k - EXIT_START) * 1.9);
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
  const fn = DRAWERS[kind];
  if (!fn || typeof impl[kind === 'trail' ? 'trailFx' : kind] !== 'function') return;
  const c = normalize(ctx);
  const k0 = c.k;
  if (kind === 'impact') c.radius = visualRadius(c.radius) * (IMPACT_SCALE[defId] ?? DEFAULT_IMPACT_SCALE);
  // 护盾环同样按实机观感收 15%：它常驻在玩家身上，太大容易糊住角色
  else if (kind === 'ward') c.radius *= 0.85;
  if (kind === 'impact' || kind === 'ward') {
    c.radius = entryRadius(k0, c.radius);   // 出现：从小弹到满
    c.k = exitK(k0);                        // 消失：主体加速散架
  }
  // 出现：起手、命中、护盾都先给一段入场；弹丸另有一小圈出膛凝形
  if (kind === 'cast' || kind === 'impact' || kind === 'ward') {
    drawEntry(g, c, impl.colors, ENTRY_STYLE[defId] ?? 'converge');
  } else if (kind === 'projectile') {
    drawSpawnFlash(g, c, impl.colors);
  }
  fn(impl, g, c);
  // 消失：命中与护盾在生命后段拆成碎片/被吸回/碎裂，而不是整块淡出
  if (kind === 'impact' || kind === 'ward') {
    drawExit(g, c, impl.colors, EXIT_STYLE[defId] ?? 'dissipate');
  }
}

export function drawProjectileFx(g, defId, ctx) { run('projectile', g, defId, ctx); }
export function drawTrailFx(g, defId, ctx) { run('trail', g, defId, ctx); }
export function drawCastFx(g, defId, ctx) { run('cast', g, defId, ctx); }
export function drawImpactFx(g, defId, ctx) { run('impact', g, defId, ctx); }
export function drawWardFx(g, defId, ctx) { run('ward', g, defId, ctx); }
export function drawLinkFx(g, defId, ctx) { run('link', g, defId, ctx); }
