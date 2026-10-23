// 战场背景：世界坐标大地图底，全部程序化像素绘制，无外部图片、无平滑渐变
// 三幕主题：1 荒废墓园 / 2 腐沼教堂 / 3 星陨王庭
// staticG 在构造时一次性画完整张世界地图；flickerG 只承载蜡烛火苗的小范围重画
import { C, pxRect, pxLine, pxRing, pxDiamond } from './Palette.js';
import { WORLD_SIZES } from '../logic/constants.js';

const TILE = 32;     // 地砖边长（世界像素）
const WALL_T = 12;   // 结界墙厚度

// 固定种子的噪点，保证每次打开画面一致
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// 三幕主题配置：地砖三档色 / 砖缝 / 噪点色池 / 蜡烛数 / 火焰色 / 结界墙配色
const THEMES = {
  1: {
    name: '荒废墓园',
    seed: 0x6d01,
    tileBase: C.graveTile, tileLit: C.graveTileLit, tileDark: C.graveTileDark,
    seam: C.nightDeep,
    noise: [C.stoneDark, C.groove, C.stoneLight],
    wall: C.stoneDark, wallEdge: C.groove, stud: C.stoneLight,
    pillar: C.stoneDark, pillarLit: C.stoneLight, wax: C.parchment,
    flame: C.arcane, flameCore: C.arcaneLight, glow: C.arcane,
    candles: 8,
  },
  2: {
    name: '腐沼教堂',
    seed: 0x6d02,
    tileBase: C.mossTile, tileLit: C.mossTileLit, tileDark: C.mossTileDark,
    seam: C.ink,
    noise: [C.rot, C.mossTileLit, C.stoneDark],
    wall: C.mossTileDark, wallEdge: C.swampGlint, stud: C.brassDark,
    pillar: C.ruinStone, pillarLit: C.mossTileLit, wax: C.parchment,
    flame: C.wisp, flameCore: C.wispCore, glow: C.wisp,
    candles: 7,
  },
  3: {
    name: '星陨王庭',
    seed: 0x6d03,
    tileBase: C.starTile, tileLit: C.starTileLit, tileDark: C.starTileDark,
    seam: C.ink,
    noise: [C.runeDim, C.starTileLit, C.void],
    wall: C.starTileDark, wallEdge: C.runeCold, stud: C.runeCold,
    pillar: C.shardStone, pillarLit: C.runeDim, wax: C.parchment,
    flame: C.coldFlame, flameCore: C.coldFlameCore, glow: C.coldFlame,
    candles: 9,
  },
};

export default class Background {
  // world 形如 { w, h }；默认按幕取 WORLD_SIZES，act=1 时即 WORLD_SIZES[1]
  // new Background(scene) 完全向后兼容：act=1、1920x1440
  constructor(scene, act = 1, world = WORLD_SIZES[act] || WORLD_SIZES[1]) {
    this.scene = scene;
    this.act = act;
    this.world = { w: Math.round(world.w), h: Math.round(world.h) };
    this.theme = THEMES[act] || THEMES[1];
    this.staticG = scene.add.graphics().setDepth(-100);
    this.flickerG = scene.add.graphics().setDepth(-90);
    this.candles = [];
    this.lastFlickerStep = -1;
    this.drawStatic();
  }

  // ---------- 通用工具 ----------

  // 拒绝采样：在墙面内缩 margin 的区域里取 count 个互距 >= minDist 的点
  scatter(rng, count, margin, minDist, seedPts = []) {
    const { w, h } = this.world;
    const taken = seedPts.slice();
    const out = [];
    let guard = 0;
    while (out.length < count && guard++ < count * 400) {
      const x = margin + rng() * (w - margin * 2);
      const y = margin + rng() * (h - margin * 2);
      let ok = true;
      for (const p of taken) {
        const dx = p.x - x, dy = p.y - y;
        if (dx * dx + dy * dy < minDist * minDist) { ok = false; break; }
      }
      if (ok) { out.push({ x, y }); taken.push({ x, y }); }
    }
    return out;
  }

  // 蜡烛：优先占用主题锚点（如吊灯烛杯），不足再用采样补齐，全部世界坐标
  makeCandles(rng, anchors = []) {
    const pts = [];
    for (const a of anchors) {
      if (pts.length >= this.theme.candles) break;
      pts.push({ x: Math.round(a.x), y: Math.round(a.y), phase: Math.floor(rng() * 3) });
    }
    const rest = this.scatter(rng, this.theme.candles - pts.length, 90, 190, pts);
    for (const p of rest) pts.push({ x: Math.round(p.x), y: Math.round(p.y), phase: Math.floor(rng() * 3) });
    return pts;
  }

  // ---------- 地砖与噪点（三幕共用骨架，配色不同） ----------

  drawTiles(g, rng, T) {
    const { w, h } = this.world;
    // 基色整铺
    pxRect(g, 0, 0, w, h, T.tileBase, 1);
    // 亮/暗变体石板：约 1/3 概率，其中再切一半宽度制造碎砖感
    const cols = Math.ceil(w / TILE);
    const rows = Math.ceil(h / TILE);
    for (let ty = 0; ty < rows; ty++) {
      for (let tx = 0; tx < cols; tx++) {
        const r = rng();
        if (r >= 0.33) continue;
        const half = rng() < 0.33;
        const cw = half ? TILE / 2 : TILE;
        pxRect(g, tx * TILE, ty * TILE, cw, TILE, r < 0.17 ? T.tileLit : T.tileDark, 1);
      }
    }
    // 砖缝：横竖全长 1px 硬缝
    for (let i = 1; i < rows; i++) pxRect(g, 0, i * TILE, w, 1, T.seam, 0.85);
    for (let i = 1; i < cols; i++) pxRect(g, i * TILE, 0, 1, h, T.seam, 0.85);
    // 缝交点破损小块
    for (let i = 0; i < cols * rows * 0.02; i++) {
      const bx = (1 + Math.floor(rng() * (cols - 1))) * TILE - 1;
      const by = (1 + Math.floor(rng() * (rows - 1))) * TILE - 1;
      pxRect(g, bx, by, 2, 2, T.seam, 0.7);
    }
  }

  drawNoise(g, rng, T) {
    const { w, h } = this.world;
    const m = WALL_T + 4;
    const count = Math.round((w * h) / 1200);
    for (let i = 0; i < count; i++) {
      const x = m + Math.floor(rng() * (w - m * 2));
      const y = m + Math.floor(rng() * (h - m * 2));
      pxRect(g, x, y, 1, 1, T.noise[Math.floor(rng() * T.noise.length)], 0.18 + rng() * 0.3);
    }
  }

  // ---------- 一幕「荒废墓园」 ----------

  drawTomb(g, rng, x, groundY) {
    const w = 8 + Math.floor(rng() * 5);
    const h = 13 + Math.floor(rng() * 6);
    const top = groundY - h;
    const body = rng() < 0.5 ? C.stoneDark : C.graveTileLit;
    pxRect(g, x - w / 2, top, w, h, body, 1);
    pxRect(g, x - w / 2, top, 1, h, C.stoneLight, 0.8);
    pxRect(g, x + w / 2 - 1, top, 1, h, C.ink, 0.7);
    const style = rng();
    if (style < 0.4) {
      pxRect(g, x - w / 2 + 1, top - 1, w - 2, 1, body, 1);
      pxRect(g, x - w / 2 + 2, top - 2, w - 4, 1, body, 1);
    } else if (style < 0.75) {
      pxRect(g, x - 1, top - 5, 2, 5, body, 1);
      pxRect(g, x - 3, top - 4, 6, 2, body, 1);
    }
    if (rng() < 0.35) {
      pxLine(g, x + Math.floor(rng() * 4) - 2, top + 3, x + Math.floor(rng() * 6) - 3, groundY - 3, C.ink, 0.8, 1);
    }
    pxRect(g, x - w / 2 - 1, groundY, w + 2, 2, C.graveTileDark, 1);
  }

  drawDeadTree(g, rng, x, groundY) {
    const h = 46 + Math.floor(rng() * 34);
    const top = groundY - h;
    pxRect(g, x, top, 2, h, C.ink, 1);
    pxRect(g, x + 2, top + 10, 1, h - 10, C.ink, 0.9);
    const branches = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < branches; i++) {
      const by = top + 8 + Math.floor(h * 0.55 * rng());
      const dir = rng() < 0.5 ? -1 : 1;
      const len = 10 + Math.floor(rng() * 18);
      const ex = x + 1 + dir * len;
      const ey = by - 6 - Math.floor(rng() * 10);
      pxLine(g, x + 1, by, ex, ey, C.ink, 1, 1);
      pxLine(g, ex, ey, ex + dir * (4 + Math.floor(rng() * 6)), ey - 3 - Math.floor(rng() * 5), C.ink, 1, 1);
    }
    pxRect(g, x - 2, groundY - 1, 6, 2, C.ink, 0.9);
  }

  drawGraveyard(g, rng) {
    const { w, h } = this.world;
    const area = w * h;
    // 墓碑群：成簇分布，簇内 3-6 块
    const clusterN = Math.min(16, Math.max(8, Math.round(area / 260000)));
    const clusters = this.scatter(rng, clusterN, 120, 260);
    for (const c of clusters) {
      const n = 3 + Math.floor(rng() * 4);
      for (let i = 0; i < n; i++) {
        const tx = Math.round(c.x + (rng() - 0.5) * 110);
        const ty = Math.round(c.y + (rng() - 0.5) * 70);
        this.drawTomb(g, rng, tx, ty);
      }
    }
    // 枯树剪影
    const treeN = Math.min(12, Math.max(6, Math.round(area / 340000)));
    for (const p of this.scatter(rng, treeN, 140, 240, clusters)) {
      this.drawDeadTree(g, rng, Math.round(p.x), Math.round(p.y));
    }
    // 散骨：bone 色小段
    for (let i = 0; i < 6; i++) {
      const bx = 80 + rng() * (w - 160);
      const by = 80 + rng() * (h - 160);
      const seg = 3 + Math.floor(rng() * 3);
      pxRect(g, bx, by, seg, 1, C.bone, 0.65);
      pxRect(g, bx - 1, by - 1, 1, 1, C.bone, 0.5);
      pxRect(g, bx + seg, by, 1, 1, C.bone, 0.5);
    }
    // 雾带：最后画，罩在墓碑与枯树之上
    for (let i = 0; i < 4; i++) {
      const bw = w * (0.55 + rng() * 0.45);
      const bx = rng() * (w - bw);
      const by = h * (0.22 + rng() * 0.62);
      const bh = 5 + Math.floor(rng() * 8);
      pxRect(g, bx, by, bw, bh, C.fog, 0.05 + rng() * 0.05);
      pxRect(g, bx + bw * 0.15, by, bw * 0.6, 1, C.fog, 0.13);
    }
  }

  // ---------- 二幕「腐沼教堂」 ----------

  drawGlassWindow(g, rng, cx, topY, winW, winH) {
    const glass = [C.glassRed, C.glassBlue, C.brass];
    const layers = 5;
    const stepH = 3;
    for (let i = 0; i < layers; i++) {
      const lw = Math.round(winW * (0.4 + (i / layers) * 0.6));
      pxRect(g, cx - lw / 2, topY + i * stepH, lw, stepH, glass[i % 3], 1);
    }
    const bodyTop = topY + layers * stepH;
    const bodyH = winH - layers * stepH;
    let gx = Math.round(cx - winW / 2);
    let k = 0;
    const right = Math.round(cx + winW / 2);
    while (gx < right) {
      const gw = Math.min(4 + Math.floor(rng() * 3), right - gx);
      pxRect(g, gx, bodyTop, gw, bodyH, glass[k % 3], 0.9);
      pxRect(g, gx, bodyTop, 1, bodyH, C.nightDeep, 0.9);
      gx += gw;
      k++;
    }
    if (rng() < 0.35) {
      pxRect(g, cx - winW / 2 + 2 + Math.floor(rng() * (winW - 8)), bodyTop + 4 + Math.floor(rng() * Math.max(1, bodyH - 12)), 4 + Math.floor(rng() * 4), 3 + Math.floor(rng() * 4), C.ink, 1);
    }
    pxRect(g, cx - winW / 2 - 1, topY + layers * stepH - 4, 1, winH - layers * stepH + 4, C.stoneDark, 1);
    pxRect(g, cx + winW / 2, topY + layers * stepH - 4, 1, winH - layers * stepH + 4, C.stoneDark, 1);
  }

  drawRuinedWall(g, rng, x, groundY) {
    const w = 110 + Math.floor(rng() * 50);
    const h = 120 + Math.floor(rng() * 80);
    const top = groundY - h;
    pxRect(g, x, top + 12, w, h - 12, C.ruinStone, 1);
    // 断口锯齿顶
    const notches = 4 + Math.floor(rng() * 4);
    for (let i = 0; i < notches; i++) {
      pxRect(g, x + (w / notches) * i, top + 12, w / notches, 2 + Math.floor(rng() * 12), C.ruinStone, 1);
      pxRect(g, x + (w / notches) * i, top + 12, w / notches, 1, C.mossTileLit, 0.7);
    }
    // 尖拱彩窗分列左右，中央留门洞
    this.drawGlassWindow(g, rng, x + w * 0.22, top + 26, 20, 42);
    this.drawGlassWindow(g, rng, x + w * 0.78, top + 26, 20, 42);
    pxRect(g, x + w / 2 - 10, groundY - 34, 20, 34, C.ink, 1);
    pxRect(g, x + w / 2 - 10, groundY - 35, 20, 1, C.stoneDark, 1);
    // 墙根苔藓
    for (let i = 0; i < w / 5; i++) {
      if (rng() < 0.5) {
        pxRect(g, x + rng() * (w - 4), groundY - 2 - Math.floor(rng() * 6), 2 + Math.floor(rng() * 3), 2 + Math.floor(rng() * 4), C.rot, 0.7);
      }
    }
  }

  drawBrokenPillar(g, rng, x, groundY) {
    const h = 22 + Math.floor(rng() * 30);
    pxRect(g, x - 5, groundY - 3, 10, 3, C.ruinStone, 1);
    pxRect(g, x - 3, groundY - 3 - h, 6, h, C.ruinStone, 1);
    pxRect(g, x - 3, groundY - 3 - h, 1, h, C.mossTileLit, 0.6);
    pxRect(g, x + 2, groundY - 3 - h, 1, h, C.ink, 0.8);
    // 断裂斜口：顶部宽度阶梯收窄
    pxRect(g, x - 3, groundY - 3 - h, 5, 2, C.ruinStone, 1);
    pxRect(g, x - 3, groundY - 3 - h + 2, 3, 2, C.ruinStone, 1);
    if (rng() < 0.5) pxRect(g, x - 1, groundY - 3 - h - 3, 4, 3, C.ruinStone, 0.95);
    for (let i = 0; i < 3; i++) pxRect(g, x - 1 + i * 2, groundY - 3 - h + 4, 1, h - 6, C.ink, 0.45);
  }

  drawPuddle(g, rng, x, y) {
    const segs = 2 + Math.floor(rng() * 3);
    let px = x;
    for (let i = 0; i < segs; i++) {
      const sw = 14 + Math.floor(rng() * 20);
      const dy = Math.floor((rng() - 0.5) * 5);
      const sh = 3 + Math.floor(rng() * 3);
      pxRect(g, px, y + dy, sw, sh, C.swampWater, 0.85);
      pxRect(g, px, y + dy, sw, 1, C.swampGlint, 0.35);
      // 反光条：水洼中部的亮条，腐沼的核心辨识点
      if (rng() < 0.8) {
        const rw = 4 + Math.floor(rng() * 5);
        pxRect(g, px + 2 + Math.floor(rng() * Math.max(1, sw - rw - 3)), y + dy + Math.floor(sh / 2), rw, 1, C.swampGlint, 0.6);
      }
      px += sw + 2;
    }
  }

  drawChandelier(g, rng, x, y) {
    const beamW = 36 + Math.floor(rng() * 34);
    pxRect(g, x - beamW / 2, y, beamW, 3, C.stoneDark, 1);
    pxRect(g, x - beamW / 2, y, beamW, 1, C.stoneLight, 0.5);
    pxRect(g, x - beamW / 2 - 3, y + 2, 3, 4, C.ruinStone, 1);
    const chainLen = 10 + Math.floor(rng() * 14);
    pxRect(g, x, y + 3, 1, chainLen, C.groove, 0.9);
    const ly = y + 3 + chainLen;
    pxRect(g, x - 8, ly, 17, 1, C.brassDark, 1);
    pxRect(g, x - 8, ly - 2, 1, 2, C.brassDark, 1);
    pxRect(g, x + 7, ly - 2, 1, 2, C.brassDark, 1);
    pxRect(g, x - 1, ly + 1, 1, 5, C.brassDark, 1);
    if (rng() < 0.5) pxRect(g, x - 4, ly - 1, 3, 1, C.brassDark, 0.8);
    const out = [];
    if (rng() < 0.6) out.push({ x: x - 8, y: ly - 2 });
    if (rng() < 0.6) out.push({ x: x + 7, y: ly - 2 });
    return out;
  }

  drawSwampCathedral(g, rng) {
    const { w, h } = this.world;
    const groundY = h - WALL_T;
    // 残墙主体：左右各安一座，位置偏角落
    const wallSpots = [
      { x: w * 0.08 + rng() * 40, y: groundY * (0.3 + rng() * 0.15) },
      { x: w * 0.62 + rng() * 40, y: groundY * (0.68 + rng() * 0.12) },
    ];
    const chandelierFlames = [];
    for (const s of wallSpots) this.drawRuinedWall(g, rng, Math.round(s.x), Math.round(s.y));
    // 断柱群
    const pillarN = Math.min(8, Math.max(5, Math.round((w * h) / 500000)));
    for (const p of this.scatter(rng, pillarN, 130, 200)) {
      this.drawBrokenPillar(g, rng, Math.round(p.x), Math.round(p.y));
    }
    // 吊灯残骸：吊在断梁上，烛杯坐标作为烛光锚点
    const lampN = 5;
    for (const p of this.scatter(rng, lampN, 150, 260, wallSpots)) {
      const flames = this.drawChandelier(g, rng, Math.round(p.x), Math.round(p.y));
      chandelierFlames.push(...flames);
    }
    // 水洼反光条
    const puddleN = Math.min(12, Math.max(8, Math.round((w * h) / 220000)));
    for (const p of this.scatter(rng, puddleN, 100, 170, wallSpots)) {
      this.drawPuddle(g, rng, Math.round(p.x), Math.round(p.y));
    }
    // 芦苇：1px 折线，顶端亮
    for (let i = 0; i < 8; i++) {
      const rx = 70 + rng() * (w - 140);
      const ry = 70 + rng() * (h - 140);
      const rh = 8 + Math.floor(rng() * 8);
      const lean = rng() < 0.5 ? -2 : 2;
      pxLine(g, rx, ry, rx + lean, ry - rh, C.rot, 0.9, 1);
      pxLine(g, rx + lean, ry - rh, rx + lean * 2, ry - rh - 3, C.mossTileLit, 0.9, 1);
      pxRect(g, rx + lean * 2, ry - rh - 4, 1, 1, C.swampGlint, 0.8);
    }
    return chandelierFlames;
  }

  // ---------- 三幕「星陨王庭」 ----------

  drawRuneRing(g, rng, cx, cy, r) {
    pxRing(g, cx, cy, r, C.runeDim, 0.9, 2);
    if (r > 14) pxRing(g, cx, cy, r - 5, C.runeDim, 0.45, 2);
    const marks = 8 + Math.floor(rng() * 5);
    for (let i = 0; i < marks; i++) {
      const a = (i / marks) * Math.PI * 2 + rng() * 0.2;
      const mx = Math.round(cx + Math.cos(a) * r);
      const my = Math.round(cy + Math.sin(a) * r);
      const kind = rng();
      if (kind < 0.4) {
        pxRect(g, mx, my - 2, 1, 5, C.runeCold, 0.8);
        pxRect(g, mx - 2, my, 5, 1, C.runeCold, 0.8);
      } else if (kind < 0.7) {
        pxRect(g, mx - 1, my - 1, 3, 3, C.runeCold, 0.7);
      } else {
        pxRect(g, mx, my - 2, 1, 2, C.runeCold, 0.7);
        pxRect(g, mx, my + 1, 1, 2, C.runeCold, 0.7);
      }
    }
    pxDiamond(g, cx, cy, Math.max(6, Math.floor(r * 0.3)), C.runeDim, 0.8, false);
  }

  drawFloatingShard(g, rng, x, y) {
    const w = 6 + Math.floor(rng() * 8);
    const h = 5 + Math.floor(rng() * 7);
    pxRect(g, x, y, w, h, C.shardStone, 1);
    pxRect(g, x, y, w, 1, C.runeDim, 0.9);
    pxRect(g, x + w - 1, y + 1, 1, h - 1, C.void, 0.8);
    if (rng() < 0.6) pxRect(g, x - 2, y + 2 + Math.floor(rng() * Math.max(1, h - 3)), 2, 2, C.shardStone, 0.9);
    // 悬浮投影：石块下方脱开的暗影表现离地
    pxRect(g, x + 1, y + h + 4 + Math.floor(rng() * 3), Math.max(2, w - 2), 2, C.void, 0.35);
  }

  drawCrater(g, rng, x, y) {
    const r = 8 + Math.floor(rng() * 10);
    for (let dy = -r; dy <= r; dy++) {
      const half = Math.floor(Math.sqrt(r * r - dy * dy));
      pxRect(g, x - half, y + dy, half * 2, 1, C.starTileDark, 0.9);
    }
    pxRing(g, x, y, r, C.void, 0.6, 2);
    pxRect(g, x - 1, y - 1, 2, 2, C.runeCold, 0.5);
  }

  drawThrone(g, rng, x, groundY) {
    const st = C.shardStone;
    pxRect(g, x - 11, groundY - 40, 22, 40, st, 1);
    pxRect(g, x - 11, groundY - 40, 22, 1, C.runeCold, 0.7);
    pxRect(g, x - 14, groundY - 46, 3, 8, st, 1);
    pxRect(g, x + 11, groundY - 46, 3, 8, st, 1);
    pxRect(g, x - 15, groundY - 12, 30, 12, st, 1);
    pxRect(g, x - 15, groundY - 12, 30, 1, C.runeCold, 0.5);
    for (let i = 0; i < 3; i++) {
      const ry = groundY - 34 + i * 10;
      pxRect(g, x - 1, ry, 3, 1, C.runeCold, 0.6);
      pxRect(g, x, ry - 1, 1, 3, C.runeCold, 0.6);
    }
    pxRect(g, x - 17, groundY, 34, 2, C.void, 0.6);
  }

  drawStarCourt(g, rng) {
    const { w, h } = this.world;
    // 符文环：三个不同半径的大环
    const ringSpots = this.scatter(rng, 3, 260, 520);
    const radii = [64, 92, 76];
    ringSpots.forEach((p, i) => this.drawRuneRing(g, rng, Math.round(p.x), Math.round(p.y), radii[i]));
    // 王庭王座残骸：固定偏西北角作地标，避开中心行走区
    this.drawThrone(g, rng, Math.round(w * 0.16), Math.round(h * 0.18));
    // 悬浮碎石
    const shardN = Math.min(12, Math.max(8, Math.round((w * h) / 240000)));
    for (const p of this.scatter(rng, shardN, 120, 190, ringSpots)) {
      this.drawFloatingShard(g, rng, Math.round(p.x), Math.round(p.y - 10));
    }
    // 陨石坑
    for (const p of this.scatter(rng, 3, 160, 420, ringSpots)) {
      this.drawCrater(g, rng, Math.round(p.x), Math.round(p.y));
    }
    // 地面星纹：稀疏小十字
    for (let i = 0; i < 26; i++) {
      const sx = Math.round(WALL_T + 8 + rng() * (w - (WALL_T + 8) * 2));
      const sy = Math.round(WALL_T + 8 + rng() * (h - (WALL_T + 8) * 2));
      pxRect(g, sx, sy - 1, 1, 3, C.runeCold, 0.45);
      pxRect(g, sx - 1, sy, 3, 1, C.runeCold, 0.45);
    }
  }

  // ---------- 蜡烛底座 / 结界墙 ----------

  drawCandleBase(g, T, c) {
    pxRect(g, c.x - 3, c.y + 2, 7, 2, C.ink, 0.8);
    pxRect(g, c.x - 2, c.y - 1, 5, 3, T.pillar, 1);
    pxRect(g, c.x - 2, c.y - 1, 1, 3, T.pillarLit, 0.8);
    pxRect(g, c.x, c.y - 7, 1, 6, T.wax, 1);
    pxRect(g, c.x - 1, c.y, 3, 1, C.brassDark, 1);
  }

  drawBarrier(g, T) {
    const { w, h } = this.world;
    const t = WALL_T;
    pxRect(g, 0, 0, w, t, T.wall, 1);
    pxRect(g, 0, h - t, w, t, T.wall, 1);
    pxRect(g, 0, 0, t, h, T.wall, 1);
    pxRect(g, w - t, 0, t, h, T.wall, 1);
    // 内缘亮描边 + 外侧一道阴影，保证边界一眼可辨
    pxRect(g, t, t, w - t * 2, 1, T.wallEdge, 0.75);
    pxRect(g, t, h - t - 1, w - t * 2, 1, T.wallEdge, 0.75);
    pxRect(g, t, t, 1, h - t * 2, T.wallEdge, 0.75);
    pxRect(g, w - t - 1, t, 1, h - t * 2, T.wallEdge, 0.75);
    pxRect(g, t + 1, t + 1, w - t * 2 - 2, 1, C.void, 0.45);
    pxRect(g, t + 1, h - t - 2, w - t * 2 - 2, 1, C.void, 0.45);
    // 等距符钉
    const stride = 96;
    for (let x = stride; x < w - t; x += stride) {
      pxRect(g, x - 1, Math.floor(t / 2) - 1, 3, 3, T.stud, 0.9);
      pxRect(g, x - 1, h - Math.floor(t / 2) - 1, 3, 3, T.stud, 0.9);
    }
    for (let y = stride; y < h - t; y += stride) {
      pxRect(g, Math.floor(t / 2) - 1, y - 1, 3, 3, T.stud, 0.9);
      pxRect(g, w - Math.floor(t / 2) - 1, y - 1, 3, 3, T.stud, 0.9);
    }
    // 四角符石
    for (const cx of [t, w - t]) {
      for (const cy of [t, h - t]) {
        pxRect(g, cx - 4, cy - 4, 8, 8, T.wallEdge, 0.9);
        pxRect(g, cx - 1, cy - 3, 2, 6, C.void, 0.9);
        pxRect(g, cx - 3, cy - 1, 6, 2, C.void, 0.9);
      }
    }
  }

  // ---------- 总装：一次画完，不逐帧重画 ----------

  drawStatic() {
    const g = this.staticG;
    g.clear();
    const T = this.theme;
    const rng = makeRng(T.seed);

    this.drawTiles(g, rng, T);
    this.drawNoise(g, rng, T);

    let candleAnchors = [];
    if (this.act === 2) candleAnchors = this.drawSwampCathedral(g, rng);
    else if (this.act === 3) this.drawStarCourt(g, rng);
    else this.drawGraveyard(g, rng);

    this.candles = this.makeCandles(rng, candleAnchors);
    for (const c of this.candles) this.drawCandleBase(g, T, c);

    this.drawBarrier(g, T);
  }

  // 只重画 flickerG 上的火苗小范围（130ms 一步限频），不碰 staticG
  update(time) {
    const step = Math.floor(time / 130);
    if (step === this.lastFlickerStep) return;
    this.lastFlickerStep = step;
    const g = this.flickerG;
    g.clear();
    const T = this.theme;
    for (const c of this.candles) {
      const f = (step + c.phase) % 3;
      const h = 2 + (f === 0 ? 1 : 0);
      const y = c.y - 8;
      pxRect(g, c.x, y - h, 1, h + 1, T.flame, 0.9);
      pxRect(g, c.x - 1, y - 1, 3, 2, T.flame, 0.7);
      pxRect(g, c.x, y - h - 1, 1, 1, T.flameCore, 1);
      pxRect(g, c.x - 3, y + 1, 7, 1, T.glow, 0.08);
      pxRect(g, c.x - 5, y - 2, 11, 3, T.glow, 0.05);
    }
  }
}
