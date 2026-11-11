// 战场背景：世界坐标大地图底，全部程序化像素绘制，无外部图片、无平滑渐变
// 三幕主题：1 荒废墓园 / 2 腐沼教堂 / 3 星陨王庭
// staticG 在构造时一次性画完整张世界地图；flickerG 只承载蜡烛火苗的小范围重画
import { C, pxRect, pxLine, pxRing, pxDiamond } from './Palette.js';
import { WORLD_SIZES } from '../logic/constants.js';

const TILE = 32;     // 二/三幕地砖边长（世界像素）
const WALL_T = 12;   // 结界墙厚度

// 一幕地板重制（2026-10）：旧版是 32px 大方格 + 1/3 随机深浅，远看像马赛克迷彩。
// 现在换成横排错缝的碎石板：每块砖 1px 亮顶边 / 暗底边做出厚度，缝里长苔、砖面有裂缝缺角。
const ROW_H = 23;         // 石砖行高：故意不取 32，避免又和旧方格对齐
const SLAB_MIN_W = 22;    // 单块石板最窄
const SLAB_MAX_W = 46;    // 单块石板最宽

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
    // 画风同步：混入素材同源的中间调（khaki/mauve），让地砖有材质而不是纯色块
    noise: [C.stoneDark, C.groove, C.stoneLight, C.khaki, C.mauve],
    wall: C.stoneDark, wallEdge: C.groove, stud: C.stoneLight,
    pillar: C.stoneDark, pillarLit: C.stoneLight, wax: C.parchment,
    flame: C.arcane, flameCore: C.arcaneLight, glow: C.arcane,
    candles: 8,
    // 一幕专用的石砖地板配色（二/三幕仍走旧的 drawTiles）
    floor: {
      key: 'sigilweave-floor-act1',
      grout: 0x0b0813,                                 // 砖缝底：比 ink 再深两档，缝才立得起来
      // 五档石色：差一档只有 8 级时整片地板会糊成一块，这里放宽到 ~14 级。
      // 最暗一档要给足余量——压到近黑就会有单块砖变成「地面上的黑洞」。
      // 后两档只换色调不换亮度：清一色紫灰会显得是「塑料地砖」，掺一点苔绿和暖褐才像真石头
      tones: [0x1a1527, 0x201a30, C.graveTile, 0x2e2644, 0x38304f, 0x232a2b, 0x2b2231],
      hi: 0x5c5283,                                    // 左上受光的 1px 亮边
      lo: 0x0a0713,                                    // 右下背光的 1px 暗边
      crack: 0x08060f,                                 // 裂缝
      moss: 0x46543b,                                  // 缝里的苔（低饱和，别抢角色）
      mossDark: 0x2c3626,
    },
  },
  2: {
    name: '腐沼教堂',
    seed: 0x6d02,
    tileBase: C.mossTile, tileLit: C.mossTileLit, tileDark: C.mossTileDark,
    seam: C.ink,
    noise: [C.rot, C.mossTileLit, C.stoneDark, C.sage, C.khaki],
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
    noise: [C.runeDim, C.starTileLit, C.void, C.mauve],
    wall: C.starTileDark, wallEdge: C.runeCold, stud: C.runeCold,
    pillar: C.shardStone, pillarLit: C.runeDim, wax: C.parchment,
    flame: C.coldFlame, flameCore: C.coldFlameCore, glow: C.coldFlame,
    candles: 9,
  },
  // —— 后四幕（北斗七星）：沿用三幕的地砖/噪点/结界/蜡烛骨架，只换主题色与本幕装饰 ——
  // 4 天权 · 沉钟书库：墨蓝书库 + 铜金。烛火是书库的油灯色，墙钉用黄铜。
  4: {
    name: '沉钟书库',
    seed: 0x6d04,
    tileBase: 0x1a2036, tileLit: 0x242d47, tileDark: 0x121728,
    seam: 0x0a0d17,
    noise: [C.brassDark, C.parchment, 0x2f3a58, C.ink, 0x6c6c54],
    wall: 0x10142a, wallEdge: C.brassDark, stud: C.brassDark,
    pillar: 0x2a2016, pillarLit: C.brassDark, wax: C.parchment,
    flame: C.arcane, flameCore: C.arcaneLight, glow: C.arcane,
    candles: 12,
  },
  // 5 玉衡 · 衡律法庭：冷银灰大理石 + 暗红判词。火焰偏暗红，读作「判词烧过的余火」。
  5: {
    name: '衡律法庭',
    seed: 0x6d05,
    tileBase: 0x262a33, tileLit: 0x31363f, tileDark: 0x1b1e25,
    seam: 0x0d0f13,
    noise: [C.mute, 0x9aa1ad, C.bloodDark, C.ink, 0x4a505c],
    wall: 0x1a1c22, wallEdge: 0x8f95a1, stud: 0x8f95a1,
    pillar: 0x3a3f48, pillarLit: 0x9aa1ad, wax: C.parchment,
    flame: C.blood, flameCore: C.bone, glow: C.blood,
    candles: 10,
  },
  // 6 开阳 · 熔星锻炉：铁灰 + 橙红。蜡烛全部落成炉口/砧边的火种。
  6: {
    name: '熔星锻炉',
    seed: 0x6d06,
    tileBase: 0x2a2320, tileLit: 0x372d28, tileDark: 0x1c1714,
    seam: 0x0f0b09,
    noise: [C.arcane, C.tan, 0x4a3a30, C.ink, 0x6b543f],
    wall: 0x191311, wallEdge: 0xa8491c, stud: C.arcane,
    pillar: 0x30251f, pillarLit: 0x8a5a2a, wax: C.tan,
    flame: C.arcane, flameCore: C.white, glow: C.arcane,
    candles: 11,
  },
  // 7 摇光 · 破晓之座：深紫 + 金白。金白只给光，紫底承住它。
  7: {
    name: '破晓之座',
    seed: 0x6d07,
    tileBase: 0x1d1733, tileLit: 0x271f45, tileDark: 0x141026,
    seam: 0x090714,
    noise: [C.brass, C.parchment, C.runeDim, C.white, C.mauve],
    wall: 0x120e22, wallEdge: C.brassLight, stud: C.brassLight,
    pillar: 0x2b2447, pillarLit: C.brassLight, wax: C.parchment,
    flame: C.brassLight, flameCore: C.white, glow: C.brass,
    candles: 14,
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
    // 美术升级包：三幕各一张 512 无缝石砖，铺在世界底层；有图时跳过程序化地砖。
    // 第 4-7 幕没有新地板图，复用前三幕的石砖纹理并按幕染色，避免退化成 32px 素格子。
    const FLOOR_FALLBACK = {
      4: { key: 'floor_act1', tint: 0x9fb4d8 }, // 书库：冷蓝
      5: { key: 'floor_act3', tint: 0xcfd6e0 }, // 法庭：银灰
      6: { key: 'floor_act1', tint: 0xffb08a }, // 锻炉：暖橙
      7: { key: 'floor_act3', tint: 0xffd98a }, // 破晓：金白
    };
    const fallback = FLOOR_FALLBACK[act];
    const nativeKey = 'floor_act' + act;
    const useNative = !!scene.textures?.exists(nativeKey);
    const floorKey = useNative ? nativeKey : (fallback?.key ?? nativeKey);
    this.floorArt = scene.textures?.exists(floorKey) && typeof scene.add?.tileSprite === 'function'
      ? scene.add.tileSprite(0, 0, this.world.w, this.world.h, floorKey).setOrigin(0, 0).setDepth(-102).setAlpha(0.65).setTileScale(0.5, 0.5)
      : null;
    // 有本幕专属地板就原样用；只有缺图时才回退到旧地板并染色。
    if (this.floorArt && !useNative && fallback && typeof this.floorArt.setTint === 'function') this.floorArt.setTint(fallback.tint);
    this.staticG = scene.add.graphics().setDepth(-100);
    this.flickerG = scene.add.graphics().setDepth(-90);
    // 一幕地板烘焙成纹理后挂在这里（见 bakeFloor）；二/三幕恒为 null
    this.floorImg = null;
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

  // ---------- 一幕地板重制：错缝石砖 + 立体倒角 ----------

  // 一幕走新地板，二/三幕保持不变，避免一次改三幕的回归面
  drawFloor(g, rng, T) {
    if (this.act === 1 && this.bakeFloor(T)) return;
    this.drawTiles(g, rng, T);
  }

  // 石砖细节是每帧重绘的大头（约 4.5 万条绘制指令），所以先画进离屏 Graphics，
  // 烘焙成一张世界尺寸的纹理再贴回去：静态层每帧只剩一次绘制调用。
  // 纹理按「世界尺寸」做 key，同一局重开直接复用；生成失败自动落回 Graphics 直绘。
  bakeFloor(T) {
    const F = T.floor;
    if (!F || typeof this.scene.make?.graphics !== 'function') return false;
    const key = F.key + '-' + this.world.w + 'x' + this.world.h;
    if (!this.scene.textures?.exists?.(key)) {
      const bake = this.scene.make.graphics({ add: false });
      if (!bake) return false;
      const t0 = performance.now?.() ?? 0;
      // 独立种子：地板纹理换了也不影响墓碑/枯树/蜡烛的分布
      this.drawFlagstones(bake, makeRng(T.seed ^ 0x5eed), T);
      bake.generateTexture(key, this.world.w, this.world.h);
      bake.destroy();
      // 烘焙耗时（毫秒）：验收脚本读它，确认开局没有明显卡顿
      this.bakeMs = Math.round((performance.now?.() ?? 0) - t0);
    }
    if (!this.scene.textures.exists(key)) return false;
    this.floorImg = this.scene.add.image(0, 0, key).setOrigin(0, 0).setDepth(-101);
    return true;
  }

  // 横排错缝铺装：整张世界铺满，砖宽随机、排间错缝，偶尔一块长条石板
  drawFlagstones(g, rng, T) {
    const { w, h } = this.world;
    const F = T.floor;
    // 先整铺砖缝色：石板之间那 1px 露出来的就是缝
    pxRect(g, 0, 0, w, h, F.grout, 1);
    // 行高逐排随机（不是固定 ROW_H）：固定行高会让整片地板出现横向条带，
    // 高度忽高忽低才有「大小石块拼起来」的感觉。
    let y = -2;
    for (let row = 0; y < h; row++) {
      const rowH = row === 0 ? ROW_H : ROW_H - 5 + Math.floor(rng() * 10);
      if (y + rowH > h) { this.fillRow(g, rng, T, y, h - y); break; }
      this.fillRow(g, rng, T, y, rowH);
      y += rowH;
    }
    this.drawLongCracks(g, rng, T);
    this.drawFloorBlotches(g, rng, T);
  }

  // 铺一整排石板：排首随机左移做错缝，砖宽随机、偶尔一块长条石板
  fillRow(g, rng, T, top, rowH) {
    const w = this.world.w;
    let x = -Math.floor(rng() * 44);
    while (x < w) {
      let sw = SLAB_MIN_W + Math.floor(rng() * (SLAB_MAX_W - SLAB_MIN_W));
      if (rng() < 0.12) sw = Math.round(sw * 1.6);            // 长条石板
      const cw = Math.min(sw, w - x);
      if (cw < 6) break;
      // 砖高比排高再矮 1~3px：底边留出不等宽的空隙 = 碎掉的石边
      const sh = Math.max(4, rowH - 1 - (rng() < 0.28 ? 1 + Math.floor(rng() * 2) : 0));
      this.drawSlab(g, rng, T, x, top, cw, sh);
      x += cw + 1;                                            // 1px 竖缝
    }
  }

  // 单块石板：五档石色 + 左上亮边/右下暗边 + 缺角 + 磨损 + 裂缝 + 缝里长苔
  drawSlab(g, rng, T, x, y, w, h) {
    const F = T.floor;
    const tones = F.tones;
    // 五档明度 + 两档换色：比例压在中间调，太散会抢角色
    const r = rng();
    const tone = r < 0.10 ? tones[0]
      : r < 0.30 ? tones[1]
        : r < 0.72 ? tones[2]
          : r < 0.88 ? tones[3]
            : r < 0.94 ? tones[4]
              : r < 0.975 ? tones[5] : tones[6];
    pxRect(g, x, y, w, h, tone, 1);
    // 倒角：光源恒定在左上 → 顶边实亮、左边次级亮，底边实暗、右边次级暗，
    // 再往内补一层 0.22 的亮边 / 0.35 的暗边，石板边缘就「圆过去」了，而不是一张纸。
    // 倒角强度分两档：每块砖都打满高光会变成「一排排凸起的砖墙」，
    // 让约三分之一是沉降下去的平石，地面才有高低。
    const raised = rng() < 0.65;
    const k = raised ? 1 : 0.4;
    pxRect(g, x, y, w, 1, F.hi, k);
    pxRect(g, x, y + 1, 1, Math.max(1, h - 1), F.hi, 0.6 * k);
    pxRect(g, x + 1, y + 1, Math.max(1, w - 2), 1, F.hi, 0.22 * k);
    pxRect(g, x, y + h - 1, w, 1, F.lo, raised ? 1 : 0.5);
    pxRect(g, x + w - 1, y + 1, 1, Math.max(1, h - 1), F.lo, 0.85);
    pxRect(g, x + 1, y + h - 2, Math.max(1, w - 2), 1, F.lo, 0.35);
    // 啃边：底边/右边随机啃掉 1~2px 露出砖缝，缝线就不会一路笔直
    if (rng() < 0.34 && w > 8) {
      const bites = 1 + Math.floor(rng() * 2);
      for (let i = 0; i < bites; i++) {
        pxRect(g, x + 3 + Math.floor(rng() * (w - 7)), y + h - 1, 1 + Math.floor(rng() * 2), 1, F.grout, 1);
      }
    }
    if (rng() < 0.22 && h > 8) {
      pxRect(g, x + w - 1, y + 3 + Math.floor(rng() * (h - 7)), 1, 1 + Math.floor(rng() * 2), F.grout, 1);
    }
    // 缺角：啃掉 1~3×1~2px，露出底下的砖缝
    if (rng() < 0.4) {
      const cw = 1 + Math.floor(rng() * 3);
      const ch = 1 + Math.floor(rng() * 2);
      pxRect(g, rng() < 0.5 ? x : x + w - cw, rng() < 0.5 ? y : y + h - ch, cw, ch, F.grout, 1);
    }
    // 石面颗粒：±1 档的小点，远看就是石头的麻面
    const grains = 3 + Math.floor(rng() * 4);
    for (let i = 0; i < grains; i++) {
      if (w < 5 || h < 5) break;
      pxRect(g, x + 2 + Math.floor(rng() * (w - 4)), y + 2 + Math.floor(rng() * (h - 4)), 1, 1,
        rng() < 0.55 ? F.hi : F.lo, 0.3);
    }
    // 砖面磨损：短横条暗斑/亮斑，破掉石色的纯块感
    const spots = Math.floor(rng() * 3);
    for (let i = 0; i < spots; i++) {
      const sw = 2 + Math.floor(rng() * 5);
      if (w - sw - 2 <= 0) break;
      const sx = x + 1 + Math.floor(rng() * (w - sw - 2));
      const sy = y + 2 + Math.floor(rng() * Math.max(1, h - 3));
      pxRect(g, sx, sy, sw, 1, rng() < 0.55 ? F.lo : F.hi, 0.45);
    }
    // 裂缝：从缝往里爬的 1px 折线
    if (rng() < 0.15 && h > 6) {
      const cx = x + 2 + Math.floor(rng() * Math.max(1, w - 4));
      const len = Math.min(h - 3, 3 + Math.floor(rng() * 9));
      const dir = rng() < 0.5 ? -1 : 1;
      for (let i = 0; i < len; i++) {
        pxRect(g, cx + (i % 4 === 3 ? dir : 0), y + 1 + i, 1, 1, F.crack, 0.9);
      }
    }
    // 大石板内部：一整块 60×40 的纯色在 4 倍放大下就是一块「贴上去的板子」，
    // 用密集单像素点打散（点不会有直角，远看才是石头的麻面）。
    if (w >= 40 && h >= 24) {
      const specks = Math.min(120, Math.floor((w * h) / 55));
      for (let i = 0; i < specks; i++) {
        pxRect(g, x + 2 + Math.floor(rng() * (w - 4)), y + 2 + Math.floor(rng() * (h - 4)), 1, 1,
          rng() < 0.5 ? F.hi : F.lo, 0.35);
      }
      // 第二处缺角：这块石头的四边不能是四条笔直的线
      pxRect(g, rng() < 0.5 ? x : x + w - 3, rng() < 0.5 ? y : y + h - 2,
        2 + Math.floor(rng() * 3), 1 + Math.floor(rng() * 2), F.grout, 1);
    }
    // 缝里的苔：压在砖底边的缝上，只长在少数几块砖下沿（成簇，别撒成孤零零的点）
    if (rng() < 0.16) {
      const mw = 3 + Math.floor(rng() * 5);
      const mx = x + 1 + Math.floor(rng() * Math.max(1, w - mw - 1));
      pxRect(g, mx, y + h, mw, 1, F.moss, 0.85);
      pxRect(g, mx, y + h - 1, Math.max(1, mw - 1), 1, F.moss, 0.45);
      pxRect(g, mx + 1, y + h - 2, Math.max(1, mw - 3), 1, F.mossDark, 0.55);
      if (mw > 4 && rng() < 0.5) pxRect(g, mx + 2, y + h + 1, 2, 1, F.mossDark, 0.6);
    }
  }

  // 贯穿多块砖的长裂缝：整块地板「年久失修」的关键笔触
  drawLongCracks(g, rng, T) {
    const { w, h } = this.world;
    const F = T.floor;
    // 主方向统一走横向小幅爬行：竖着乱窜会画成一根电线，反而破坏石料感
    for (let k = 0; k < 3; k++) {
      let cx = w * (0.05 + rng() * 0.55);
      let cy = h * (0.1 + rng() * 0.8);
      const steps = 6 + Math.floor(rng() * 10);
      for (let i = 0; i < steps && cx < w - 10; i++) {
        const nx = cx + 6 + rng() * 7;
        const ny = cy + (rng() - 0.5) * 4;
        pxLine(g, cx, cy, nx, ny, F.crack, 0.7, 1);
        pxLine(g, cx, ny + 1, nx, cy + 1, F.hi, 0.18, 1);   // 缝下沿一道弱高光 = 深度
        cx = nx; cy = ny;
      }
    }
  }

  // 大尺度暗斑：用像素抖动堆出来的阴影团（硬边像素里唯一不糊的做法），
  // 打散石砖的规则排布，让地面有明暗起伏而不是一整片均匀灰紫。
  drawFloorBlotches(g, rng, T) {
    const { w, h } = this.world;
    const F = T.floor;
    for (let i = 0; i < 7; i++) {
      const cx = w * (0.06 + rng() * 0.88);
      const cy = h * (0.06 + rng() * 0.88);
      const rx = 70 + rng() * 130;
      const ry = 40 + rng() * 80;
      for (let y = -ry; y <= ry; y += 4) {
        for (let x = -rx; x <= rx; x += 4) {
          const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
          if (d > 1) continue;
          if (rng() > (1 - d) * 0.55) continue;            // 越靠近中心越密
          pxRect(g, cx + x, cy + y, 3, 1, F.lo, 0.5);
        }
      }
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

  // ---------- 四幕「天权 · 沉钟书库」 ----------

  // 高耸书架：柜体 + 层板 + 书脊，抽掉几本留出空档，斜靠一两本让排布不是琴键
  drawShelf(g, rng, x, groundY) {
    const bookCols = [0x2f4560, 0x3f5a3a, 0x6b4a2a, 0x5a3a4a, 0x3a4a6a, C.brassDark, 0x6b543f, 0x435070];
    const sw = 40 + Math.floor(rng() * 22);
    const sh = 92 + Math.floor(rng() * 62);
    const top = groundY - sh;
    pxRect(g, x, top, sw, sh, 0x0e1220, 1);
    pxRect(g, x, top, 2, sh, C.brassDark, 0.9);
    pxRect(g, x + sw - 2, top, 2, sh, C.brassDark, 0.9);
    pxRect(g, x, top, sw, 2, C.brassDark, 1);
    pxRect(g, x, groundY - 2, sw, 2, C.brassDark, 1);
    // 顶檐：书架顶是这套场景里唯一「能放东西」的平面，烛光落在这里
    pxRect(g, x - 2, top - 3, sw + 4, 3, 0x141a2c, 1);
    pxRect(g, x - 2, top - 3, sw + 4, 1, C.brassDark, 0.9);
    const rows = 3 + Math.floor(rng() * 3);
    const rowH = Math.max(6, Math.floor((sh - 8) / rows));
    for (let r = 0; r < rows; r++) {
      const ry = top + 4 + r * rowH;
      pxRect(g, x + 2, ry + rowH - 2, sw - 4, 1, C.brassDark, 0.55);
      let bx = x + 3;
      while (bx < x + sw - 4) {
        const bw = 2 + Math.floor(rng() * 3);
        if (rng() < 0.12) { bx += bw + 1; continue; }
        const bh = Math.min(rowH - 5, 5 + Math.floor(rng() * 9));
        if (bh < 2) { bx += bw + 1; continue; }
        pxRect(g, bx, ry + rowH - 3 - bh, bw, bh, bookCols[Math.floor(rng() * bookCols.length)], 0.95);
        pxRect(g, bx, ry + rowH - 3 - bh, 1, bh, C.parchment, 0.18);
        if (rng() < 0.15) pxRect(g, bx + bw, ry + rowH - 5, 2, 3, bookCols[Math.floor(rng() * bookCols.length)], 0.85);
        bx += bw + 1 + (rng() < 0.1 ? 1 : 0);
      }
    }
    pxRect(g, x + 3, groundY, 4, 2, C.brassDark, 0.8);
    pxRect(g, x + sw - 7, groundY, 4, 2, C.brassDark, 0.8);
    // 落地投影：书架必须有「压在地上」的那条暗边，否则远看会浮起来
    pxRect(g, x - 3, groundY + 1, sw + 6, 2, 0x080b12, 0.7);
    pxRect(g, x - 3, groundY + 1, sw + 6, 1, C.brassDark, 0.35);
    return { x: Math.round(x + sw / 2), y: Math.round(top - 3) };
  }

  // 垂挂铜钟：链 + 钟钮 + 阶梯收窄的钟体 + 钟舌，钟面留一道反光
  drawBrassBell(g, rng, x, y) {
    const chain = 18 + Math.floor(rng() * 26);
    pxRect(g, x, y, 1, chain, C.brassDark, 0.9);
    for (let i = 0; i < chain; i += 4) pxRect(g, x - 1, y + i, 3, 1, C.brassDark, 0.35);
    const by = y + chain;
    pxRect(g, x - 1, by - 2, 3, 3, C.brassDark, 1);
    pxRect(g, x - 7, by + 1, 15, 4, C.brass, 0.95);
    pxRect(g, x - 9, by + 5, 19, 4, C.brassDark, 0.95);
    pxRect(g, x - 11, by + 9, 23, 3, C.brassDark, 1);
    pxRect(g, x - 11, by + 9, 23, 1, C.brassLight, 0.5);
    pxRect(g, x, by + 12, 2, 4, C.brassLight, 0.85);
    if (rng() < 0.55) pxRect(g, x - 4, by + 4, 2, 5, C.parchment, 0.25);
    return { x: Math.round(x), y: Math.round(by + 12) };
  }

  // 翻飞书页：一小片硬边纸 + 折痕 + 身后两段拖影
  drawFlyingPage(g, rng, x, y) {
    const pw = 4 + Math.floor(rng() * 4);
    const ph = 3 + Math.floor(rng() * 3);
    pxRect(g, x, y, pw, ph, C.parchment, 0.85);
    pxRect(g, x, y + ph - 1, pw, 1, 0x8a7a5a, 0.9);
    pxRect(g, x + 1, y + 1, 1, Math.max(1, ph - 2), 0xb9a279, 0.7);
    pxRect(g, x - 3 - Math.floor(rng() * 3), y + 1, 2, 1, C.parchment, 0.3);
    pxRect(g, x - 6 - Math.floor(rng() * 4), y + 2, 2, 1, C.parchment, 0.16);
  }

  drawLibrary(g, rng) {
    const { w, h } = this.world;
    const anchors = [];
    const shelfN = Math.min(22, Math.max(12, Math.round((w * h) / 240000)));
    for (const p of this.scatter(rng, shelfN, 90, 150)) {
      const a = this.drawShelf(g, rng, Math.round(p.x), Math.round(p.y));
      if (a && anchors.length < 6) anchors.push(a);
    }
    for (const p of this.scatter(rng, 4, 220, 420)) {
      anchors.push(this.drawBrassBell(g, rng, Math.round(p.x), Math.round(p.y - 120)));
    }
    const pageN = Math.min(60, Math.max(34, Math.round((w * h) / 78000)));
    for (const p of this.scatter(rng, pageN, 40, 34)) {
      this.drawFlyingPage(g, rng, Math.round(p.x), Math.round(p.y));
    }
    return anchors;
  }

  // ---------- 五幕「玉衡 · 衡律法庭」 ----------

  // 大理石柱：柱身凹槽 + 柱头柱础，左受光右背光；少数柱身留有暗红判词残痕
  drawMarbleColumn(g, rng, x, groundY) {
    const ch = 70 + Math.floor(rng() * 54);
    const top = groundY - ch;
    const cw = 12 + Math.floor(rng() * 4);
    pxRect(g, x - cw, top, cw * 2, ch, 0x3a3f48, 1);
    pxRect(g, x - cw + 1, top, 2, ch, 0x9aa1ad, 0.75);
    pxRect(g, x + cw - 3, top, 2, ch, 0x14161b, 0.85);
    for (let i = -cw + 4; i < cw - 3; i += 4) pxRect(g, x + i, top + 6, 1, Math.max(1, ch - 12), 0x2a2e36, 0.9);
    pxRect(g, x - cw - 3, top, cw * 2 + 6, 4, 0x4a505c, 1);
    pxRect(g, x - cw - 3, top, cw * 2 + 6, 1, 0xb8bec9, 0.8);
    pxRect(g, x - cw - 3, groundY - 4, cw * 2 + 6, 4, 0x4a505c, 1);
    pxRect(g, x - cw - 3, groundY - 4, cw * 2 + 6, 1, 0x9aa1ad, 0.6);
    if (rng() < 0.32) pxRect(g, x - 2, top + 12 + Math.floor(rng() * Math.max(1, ch - 30)), 3, 2, C.blood, 0.45);
    pxRect(g, x - cw - 6, groundY + 1, cw * 2 + 12, 2, 0x080b12, 0.65);
    return { x: Math.round(x), y: Math.round(top) };
  }

  // 天平：立柱 + 微微倾斜的横梁 + 两侧吊绳与托盘
  drawScales(g, rng, x, groundY) {
    const postH = 42 + Math.floor(rng() * 16);
    const top = groundY - postH;
    pxRect(g, x - 6, groundY - 4, 13, 4, 0x2a2e36, 1);
    pxRect(g, x, top, 2, postH, 0x9aa1ad, 0.9);
    const span = 26 + Math.floor(rng() * 10);
    const tilt = rng() < 0.5 ? -3 : 3;
    pxRect(g, x - span, top + 2 + tilt, span * 2 + 1, 2, 0x9aa1ad, 1);
    for (const dir of [-1, 1]) {
      const px0 = x + dir * span;
      const py = top + 4 + (dir < 0 ? tilt : -tilt);
      pxRect(g, px0, py, 1, 8, 0x8f95a1, 0.8);
      pxRect(g, px0 - 5, py + 8, 11, 2, 0x9aa1ad, 1);
      pxRect(g, px0 - 5, py + 10, 11, 1, C.bloodDark, 0.55);
    }
    pxRect(g, x - 2, top - 3, 5, 3, C.blood, 0.7);
    return { x: Math.round(x), y: Math.round(top - 3) };
  }

  // 判词石碑：断口 + 暗红短行判词 + 碑座
  drawVerdictStele(g, rng, x, groundY) {
    const sw = 14 + Math.floor(rng() * 8);
    const sh = 26 + Math.floor(rng() * 18);
    const top = groundY - sh;
    pxRect(g, x - sw / 2, top, sw, sh, 0x3a3f48, 1);
    pxRect(g, x - sw / 2, top, 1, sh, 0x9aa1ad, 0.7);
    pxRect(g, x + sw / 2 - 1, top, 1, sh, 0x14161b, 0.8);
    pxRect(g, x - sw / 2 - 2, groundY - 3, sw + 4, 3, 0x2a2e36, 1);
    pxRect(g, x - sw / 2 + Math.floor(sw * 0.6), top, Math.max(2, Math.floor(sw * 0.4)), 2 + Math.floor(rng() * 3), C.ink, 1);
    const lines = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < lines; i++) {
      const lw = 3 + Math.floor(rng() * Math.max(1, sw - 6));
      pxRect(g, x - sw / 2 + 3 + Math.floor(rng() * Math.max(1, sw - 6 - lw)), top + 6 + i * 4, lw, 1, C.blood, 0.75);
    }
    return { x: Math.round(x), y: Math.round(top) };
  }

  drawCourt(g, rng) {
    const { w, h } = this.world;
    const anchors = [];
    const colN = Math.min(18, Math.max(10, Math.round((w * h) / 300000)));
    const cols = this.scatter(rng, colN, 110, 170);
    for (const p of cols) {
      const a = this.drawMarbleColumn(g, rng, Math.round(p.x), Math.round(p.y));
      if (anchors.length < 8) anchors.push(a);
    }
    for (const p of this.scatter(rng, 3, 240, 520, cols)) {
      anchors.push(this.drawScales(g, rng, Math.round(p.x), Math.round(p.y)));
    }
    const steleN = Math.min(9, Math.max(6, Math.round((w * h) / 520000)));
    for (const p of this.scatter(rng, steleN, 140, 220, cols)) {
      this.drawVerdictStele(g, rng, Math.round(p.x), Math.round(p.y));
    }
    return anchors;
  }

  // ---------- 六幕「开阳 · 熔星锻炉」 ----------

  // 铁砧：砧面 + 砧角 + 墩身，偶尔留一撮刚打过的余烬
  drawAnvil(g, rng, x, groundY) {
    pxRect(g, x - 10, groundY - 4, 21, 4, 0x141010, 1);
    pxRect(g, x - 5, groundY - 12, 11, 8, 0x2a2422, 1);
    pxRect(g, x - 11, groundY - 22, 23, 6, 0x3a3230, 1);
    pxRect(g, x - 11, groundY - 22, 23, 1, 0x6b5a52, 0.9);
    pxRect(g, x - 15, groundY - 20, 5, 3, 0x3a3230, 1);
    pxRect(g, x - 3, groundY - 16, 3, 4, 0x2a2422, 1);
    if (rng() < 0.6) {
      pxRect(g, x + 4, groundY - 26, 1, 2, C.arcane, 0.8);
      pxRect(g, x + 8, groundY - 30, 1, 1, C.tan, 0.7);
    }
    pxRect(g, x - 13, groundY + 1, 27, 2, 0x080605, 0.65);
    pxRect(g, x - 13, groundY + 1, 27, 1, 0x6b5a52, 0.3);
    return { x: Math.round(x), y: Math.round(groundY - 22) };
  }

  // 炉膛：石砌炉体 + 三段阶梯拱口 + 硬边火芯 + 火星
  drawFurnace(g, rng, x, groundY) {
    const fw = 26 + Math.floor(rng() * 14);
    const fh = 26 + Math.floor(rng() * 14);
    const top = groundY - fh;
    pxRect(g, x - fw / 2 - 4, top - 4, fw + 8, fh + 4, 0x1c1512, 1);
    pxRect(g, x - fw / 2 - 4, top - 4, fw + 8, 2, 0x4a3a30, 0.9);
    pxRect(g, x - fw / 2, top + 8, fw, fh - 8, 0x0b0705, 1);
    pxRect(g, x - fw / 2 + 3, top + 8, fw - 6, 4, 0x0b0705, 1);
    const flick = rng() < 0.5 ? 0 : 1;
    pxRect(g, x - fw / 2 + 2, top + 12, fw - 4, Math.max(2, fh - 14), 0x8a2f10, 0.95);
    pxRect(g, x - fw / 2 + 4, top + 16 + flick, fw - 8, Math.max(2, fh - 22), C.arcane, 0.95);
    pxRect(g, x - fw / 2 + 7, top + 20 + flick, Math.max(2, fw - 14), Math.max(2, fh - 28), C.arcaneLight, 0.9);
    pxRect(g, x - 2, top + 22 + flick, 5, 4, C.white, 0.9);
    for (let i = 0; i < 4; i++) {
      pxRect(g, x + Math.round((rng() - 0.5) * fw), top - 6 - Math.floor(rng() * 14), 1, 1, C.arcane, 0.5 + rng() * 0.4);
    }
    pxRect(g, x - fw / 2 - 6, groundY + 1, fw + 12, 2, 0x080605, 0.7);
    return { x: Math.round(x), y: Math.round(top - 6) };
  }

  // 吊链：交替粗细的链环，末端一截未锻的料
  drawHangingChain(g, rng, x, y) {
    const len = 22 + Math.floor(rng() * 40);
    for (let i = 0; i < len; i += 3) {
      pxRect(g, x - (i % 6 === 0 ? 0 : 1), y + i, i % 6 === 0 ? 3 : 2, 2, 0x6b5a52, 0.9);
    }
    pxRect(g, x - 4, y + len, 9, 2, 0x4a3a30, 1);
    pxRect(g, x - 2, y + len + 2, 5, 3, 0x2a2422, 1);
  }

  drawForge(g, rng) {
    const { w, h } = this.world;
    const anchors = [];
    const furnN = Math.min(10, Math.max(6, Math.round((w * h) / 480000)));
    const furn = this.scatter(rng, furnN, 160, 320);
    for (const p of furn) {
      const a = this.drawFurnace(g, rng, Math.round(p.x), Math.round(p.y));
      if (anchors.length < 6) anchors.push(a);
    }
    const anvilN = Math.min(12, Math.max(8, Math.round((w * h) / 360000)));
    for (const p of this.scatter(rng, anvilN, 120, 200, furn)) {
      this.drawAnvil(g, rng, Math.round(p.x), Math.round(p.y));
    }
    for (const p of this.scatter(rng, 6, 200, 340, furn)) {
      this.drawHangingChain(g, rng, Math.round(p.x), Math.round(p.y - 90));
    }
    const sparkN = Math.min(70, Math.max(40, Math.round((w * h) / 64000)));
    for (let i = 0; i < sparkN; i++) {
      pxRect(g, WALL_T + 8 + Math.floor(rng() * (w - WALL_T * 2 - 16)),
        WALL_T + 8 + Math.floor(rng() * (h - WALL_T * 2 - 16)),
        1, 1 + (rng() < 0.2 ? 1 : 0), rng() < 0.6 ? C.arcane : C.tan, 0.25 + rng() * 0.45);
    }
    return anchors;
  }

  // ---------- 七幕「摇光 · 破晓之座」 ----------

  // 断裂王座：椅背右上被整块削掉、断面阶梯、碎块飞散，座面留七芒徽记
  drawBrokenThrone(g, rng, x, groundY) {
    const gold = C.brassLight;
    const back = 0x3b3164;          // 椅背提亮一档：断面才看得见
    const seat = 0x2b2447;
    // 台座两级
    pxRect(g, x - 28, groundY - 4, 57, 4, seat, 1);
    pxRect(g, x - 28, groundY - 4, 57, 1, gold, 0.4);
    pxRect(g, x - 22, groundY - 10, 45, 6, seat, 1);
    pxRect(g, x - 22, groundY - 10, 45, 1, gold, 0.6);
    // 椅背：右上角被整块削掉，断面做成三级阶梯，断口描一道亮金 = 断口受光
    pxRect(g, x - 15, groundY - 54, 29, 44, back, 1);
    pxRect(g, x - 15, groundY - 54, 1, 44, gold, 0.55);
    pxRect(g, x + 14, groundY - 54, 1, 44, C.void, 0.9);
    pxRect(g, x + 3, groundY - 54, 12, 11, C.void, 1);
    pxRect(g, x + 3, groundY - 43, 8, 8, C.void, 1);
    pxRect(g, x + 3, groundY - 35, 4, 6, C.void, 1);
    pxRect(g, x + 3, groundY - 54, 12, 1, gold, 0.55);
    pxRect(g, x + 3, groundY - 43, 8, 1, gold, 0.4);
    // 断面崩落的碎块
    pxRect(g, x + 17, groundY - 52, 4, 3, back, 0.95);
    pxRect(g, x + 23, groundY - 58, 3, 3, back, 0.8);
    pxRect(g, x + 28, groundY - 50, 2, 2, back, 0.6);
    // 扶手 + 座面
    pxRect(g, x - 21, groundY - 24, 7, 15, seat, 1);
    pxRect(g, x - 21, groundY - 24, 7, 1, gold, 0.5);
    pxRect(g, x + 15, groundY - 22, 7, 13, seat, 1);
    pxRect(g, x + 15, groundY - 22, 7, 1, gold, 0.5);
    pxRect(g, x - 14, groundY - 21, 29, 6, seat, 1);
    pxRect(g, x - 14, groundY - 21, 29, 1, gold, 0.75);
    // 七芒徽记
    pxDiamond(g, x, groundY - 36, 5, gold, 0.75, false);
    pxDiamond(g, x, groundY - 36, 2, C.white, 0.9, true);
    pxRect(g, x - 30, groundY + 1, 61, 2, C.void, 0.5);
    return { x: Math.round(x), y: Math.round(groundY - 54) };
  }

  // 黎明地平线：北缘一条硬边金带。像素风不做平滑渐变，改用「等高层带 + 抖动碎边」：
  // 每 3px 一条整幅色带（alpha 随高度递减），带沿再撒短块把边界咬碎，远看就是晨光褪淡。
  drawDawnBands(g, rng) {
    const { w, h } = this.world;
    const bandH = Math.min(96, Math.round(h * 0.08));
    const inner = w - WALL_T * 2;
    for (let y = 0; y < bandH; y += 3) {
      const k = 1 - y / bandH;
      pxRect(g, WALL_T, WALL_T + y, inner, 3, y < bandH * 0.45 ? C.brassLight : C.brass, 0.035 + k * 0.11);
    }
    // 抖动碎边：每层随机短块，让色阶交界不是一条直线
    for (let y = 0; y < bandH; y += 3) {
      const k = 1 - y / bandH;
      const n = 6 + Math.floor(rng() * 10);
      for (let i = 0; i < n; i++) {
        const bw = 4 + Math.floor(rng() * 22);
        const bx = WALL_T + Math.floor(rng() * Math.max(1, inner - bw));
        pxRect(g, bx, WALL_T + y, bw, 1, y < bandH * 0.45 ? C.brassLight : C.brass, 0.12 + k * 0.2);
      }
    }
    pxRect(g, WALL_T, WALL_T, inner, 2, C.brassLight, 0.45);
    pxRect(g, WALL_T, WALL_T + 2, inner, 1, C.brass, 0.3);
    // 斜向晨光柱：从北缘斜插进来，越远越稀
    for (let i = 0; i < 5; i++) {
      const x0 = WALL_T + (i * 0.19 + 0.06) * inner;
      const len = Math.round(h * (0.26 + rng() * 0.22));
      for (let k = 0; k < len; k += 9) {
        pxRect(g, x0 + k * 0.35, WALL_T + k, 4, 3, C.brassLight, 0.04 + rng() * 0.05);
      }
    }
  }

  // 七颗星连成勺形（北斗）：节点按世界尺寸取相对坐标，连线 + 星芒
  drawDipper(g) {
    const { w, h } = this.world;
    const pts = [
      [0.16, 0.62], [0.28, 0.53], [0.4, 0.47], [0.51, 0.45],
      [0.47, 0.63], [0.62, 0.67], [0.68, 0.53],
    ].map(([u, v]) => ({ x: Math.round(u * w), y: Math.round(v * h) }));
    const links = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]];
    // 连线走 1px 矢量线：逐像素 pxLine 在 2500px 宽的地图上要几千条指令，只留硬边走线即可
    for (const [a, b] of links) {
      g.lineStyle(1, C.brassDark, 0.6);
      g.lineBetween(pts[a].x, pts[a].y, pts[b].x, pts[b].y);
      const mx = Math.round((pts[a].x + pts[b].x) / 2);
      const my = Math.round((pts[a].y + pts[b].y) / 2);
      pxRect(g, mx - 6, my, 13, 1, C.brass, 0.28);
    }
    for (const p of pts) {
      pxRing(g, p.x, p.y, 7, C.brass, 0.35, 2);
      pxDiamond(g, p.x, p.y, 4, C.brassLight, 0.8, true);
      pxDiamond(g, p.x, p.y, 2, C.white, 0.95, true);
      pxRect(g, p.x - 1, p.y - 9, 1, 3, C.brassLight, 0.4);
      pxRect(g, p.x - 9, p.y, 3, 1, C.brassLight, 0.4);
      pxRect(g, p.x + 7, p.y, 3, 1, C.brassLight, 0.4);
      pxRect(g, p.x - 1, p.y + 7, 1, 3, C.brassLight, 0.4);
    }
  }

  // 晨光池：抖动堆出的硬边金色光斑，把整张地图的中部也照亮
  drawDawnPools(g, rng) {
    const { w, h } = this.world;
    for (let i = 0; i < 4; i++) {
      const cx = w * (0.08 + rng() * 0.84);
      const cy = h * (0.1 + rng() * 0.8);
      const rx = 60 + rng() * 110;
      const ry = 34 + rng() * 70;
      for (let y = -ry; y <= ry; y += 6) {
        for (let x = -rx; x <= rx; x += 6) {
          const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
          if (d > 1) continue;
          if (rng() > (1 - d) * 0.55) continue;
          pxRect(g, cx + x, cy + y, 4, 1, C.brassLight, 0.08 + rng() * 0.08);
        }
      }
    }
  }

  drawDawnCourt(g, rng) {
    const { w, h } = this.world;
    const anchors = [];
    this.drawDawnPools(g, rng);
    this.drawDawnBands(g, rng);
    anchors.push(this.drawBrokenThrone(g, rng, Math.round(w * 0.22), Math.round(h * 0.34)));
    anchors.push(this.drawBrokenThrone(g, rng, Math.round(w * 0.74), Math.round(h * 0.78)));
    this.drawDipper(g);
    const moteN = Math.min(46, Math.max(28, Math.round((w * h) / 105000)));
    for (let i = 0; i < moteN; i++) {
      pxRect(g, WALL_T + 8 + Math.floor(rng() * (w - WALL_T * 2 - 16)),
        WALL_T + 8 + Math.floor(rng() * (h - WALL_T * 2 - 16)),
        1, 1 + (rng() < 0.25 ? 1 : 0), rng() < 0.5 ? C.brassLight : C.parchment, 0.2 + rng() * 0.4);
    }
    return anchors;
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

    if (!this.floorArt) this.drawFloor(g, rng, T);
    this.drawNoise(g, rng, T);

    let candleAnchors = [];
    if (this.act === 2) candleAnchors = this.drawSwampCathedral(g, rng);
    else if (this.act === 3) this.drawStarCourt(g, rng);
    else if (this.act === 4) candleAnchors = this.drawLibrary(g, rng);
    else if (this.act === 5) candleAnchors = this.drawCourt(g, rng);
    else if (this.act === 6) candleAnchors = this.drawForge(g, rng);
    else if (this.act === 7) candleAnchors = this.drawDawnCourt(g, rng);
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
      // 画风同步：火苗硬边化——实心焰身 + 1px 亮芯 + 单层硬边光晕（去掉旧多层柔光）
      pxRect(g, c.x, y - h, 1, h + 1, T.flame, 1);
      pxRect(g, c.x - 1, y - 1, 3, 2, T.flame, 1);
      pxRect(g, c.x, y - h - 1, 1, 1, T.flameCore, 1);
      pxRect(g, c.x - 3, y + 1, 7, 1, T.glow, 0.35);
      pxRect(g, c.x - 4, y, 9, 1, T.glow, 0.18);
    }
  }
}
