// 共振法阵 · P1 内容表
// 只放表现层需要的数据：符印名称/像素图案/伤害、魔物、第一幕解锁形状、难度曲线。
// 冷却、间隔、传导、联组规则全部在 src/logic/* 内，禁止在这里重复实现。
import { SECTOR_HALF_SIZE } from '../logic/constants.js';
import { SIGIL_DEFS, AUX_DEFS } from './cards.js';

// ---------- 玩家 ----------
export const PLAYER = {
  hp: 100,
  speed: 96,          // 像素/秒
  radius: 6,
  iframesMs: 900,     // 受击无敌
  hurtFlashMs: 180,
};

// ---------- 第一幕法阵：T 形 6 格 ----------
// 第二行整排（4 格）+ 第三行中间两格（2 格）。
// 上面一整排负责玩家上方的四个方位扇区，下面两格兜住贴身下方，起步就能看懂方位映射。
export const ACT1_CELLS = [4, 5, 6, 7, 9, 10];

// 每格刻的符印（纯表现 + 伤害，不影响引擎时序）
export const ACT1_SIGIL_BY_CELL = {
  4: 'frost_arrow',
  5: 'arcane_bolt',
  6: 'flame_burst',
  7: 'judgment_hammer',
  9: 'thorn_vine',
  10: 'starfall',
};

// 符印定义：glyph 为 8×8 像素图案，'#' 为亮像素。
// 颜色仍然守纪律：己方伤害一律暖金/羊皮纸，冷色只留给敌人。
export const SIGILS = {
  frost_arrow: {
    id: 'frost_arrow',
    name: '寒霜箭',
    short: '寒霜',
    color: 0xffd79a,
    damage: 5,
    speed: 460,
    glyph: [
      '...#....',
      '..##....',
      '.######.',
      '..##....',
      '...#....',
      '..#.....',
      '.#......',
      '........',
    ],
  },
  arcane_bolt: {
    id: 'arcane_bolt',
    name: '奥术飞弹',
    short: '飞弹',
    color: 0xffb44d,
    damage: 7,
    speed: 420,
    glyph: [
      '........',
      '....#...',
      '...##...',
      '.######.',
      '...##...',
      '....#...',
      '........',
      '........',
    ],
  },
  flame_burst: {
    id: 'flame_burst',
    name: '烈焰喷涌',
    short: '烈焰',
    color: 0xffb44d,
    damage: 9,
    speed: 330,
    glyph: [
      '...#....',
      '..##....',
      '..###...',
      '.#####..',
      '.#####..',
      '..###...',
      '...#....',
      '........',
    ],
  },
  judgment_hammer: {
    id: 'judgment_hammer',
    name: '审判之锤',
    short: '审判',
    color: 0xc9a227,
    damage: 13,
    speed: 260,
    glyph: [
      '....##..',
      '...###..',
      '..#####.',
      '...##...',
      '...##...',
      '...##...',
      '..####..',
      '........',
    ],
  },
  thorn_vine: {
    id: 'thorn_vine',
    name: '荆棘藤蔓',
    short: '荆棘',
    color: 0xe0c35a,
    damage: 8,
    speed: 360,
    glyph: [
      '..#..#..',
      '.#.##.#.',
      '..####..',
      '...##...',
      '...##...',
      '..####..',
      '.#.##.#.',
      '#..#..#.',
    ],
  },
  starfall: {
    id: 'starfall',
    name: '星陨',
    short: '星陨',
    color: 0xffd79a,
    damage: 16,
    speed: 210,
    glyph: [
      '...#....',
      '...#....',
      '..###...',
      '#######.',
      '..###...',
      '...#....',
      '.##.##..',
      '........',
    ],
  },
};

// ---------- 魔物 ----------
// hpMul / speedMul 由刷怪层乘算到难度基准上；damage 是接触伤害；behavior 对应 src/logic/enemy-ai.js。
// 颜色取自 Palette 的冷色纪律：骨白、腐绿、石紫留给敌人，暖金只属于己方。
export const ENEMY_TYPES = {
  skeleton: {
    id: 'skeleton',
    name: '骷髅兵',
    radius: 6,
    damage: 9,
    shards: 1,
    behavior: 'march',
    hpMul: 1,
    speedMul: 1,
    color: 0xe4dcc4,
  },
  bat: {
    id: 'bat',
    name: '噬魂蝠',
    radius: 5,
    damage: 5,
    shards: 1,
    behavior: 'weave',
    hpMul: 0.6,
    speedMul: 1.6,
    color: 0x8a7aa8,
  },
  corpse: {
    id: 'corpse',
    name: '腐尸',
    radius: 8,
    damage: 15,
    shards: 2,
    behavior: 'march',
    hpMul: 2.2,
    speedMul: 0.55,
    color: 0x5d7a46,
  },
  cultist: {
    id: 'cultist',
    name: '邪教徒',
    radius: 6,
    damage: 8,
    shards: 2,
    behavior: 'orbit',
    hpMul: 1.2,
    speedMul: 0.9,
    color: 0x6b5b8e,
  },
  knight: {
    id: 'knight',
    name: '亡灵骑士',
    radius: 8,
    damage: 12,
    shards: 3,
    behavior: 'charge',
    hpMul: 2,
    speedMul: 1,
    color: 0x4a4166,
  },
};

// 三幕刷怪权重：每幕权重和恒为 1（全部取二进制分数，浮点求和精确等于 1，测试可直接判等）。
// 第一幕：骷髅为主 + 少量蝠；第二幕：蝠 / 腐尸 / 骷髅；第三幕：五种齐全，骑士与邪教徒合计过半。
export const ACT_ENEMY_WEIGHTS = {
  1: [['skeleton', 0.875], ['bat', 0.125]],
  2: [['bat', 0.375], ['corpse', 0.375], ['skeleton', 0.25]],
  3: [['skeleton', 0.125], ['bat', 0.1875], ['corpse', 0.1875], ['cultist', 0.25], ['knight', 0.25]],
};

// 确定性刷怪映射：roll ∈ [0,1) 自上而下落在哪个权重区间就是哪种敌人。
// 非法幕数 / 非法 roll 一律回退骷髅兵，保证刷怪函数永远有返回值。
export function pickEnemyType(act, roll) {
  const table = Number.isInteger(act) && Object.hasOwn(ACT_ENEMY_WEIGHTS, act)
    ? ACT_ENEMY_WEIGHTS[act]
    : null;
  if (!table || !Number.isFinite(roll) || roll < 0 || roll >= 1) return ENEMY_TYPES.skeleton;
  let acc = 0;
  for (const [id, weight] of table) {
    acc += weight;
    if (roll < acc) return ENEMY_TYPES[id];
  }
  return ENEMY_TYPES[table[table.length - 1][0]];
}

// ---------- 难度曲线（第一幕 3 分钟内的线性抬升） ----------
export const DIFFICULTY = {
  rampMs: 180000,
  hpStart: 5,
  hpEnd: 16,
  speedStart: 20,
  speedEnd: 40,
  spawnMsStart: 2400,
  spawnMsEnd: 1550,
  maxAliveStart: 7,
  maxAliveEnd: 22,
  damageStart: 8,
  damageEnd: 12,
};

export function difficultyAt(elapsedMs) {
  const k = Math.min(1, Math.max(0, elapsedMs / DIFFICULTY.rampMs));
  return {
    hp: Math.round(DIFFICULTY.hpStart + (DIFFICULTY.hpEnd - DIFFICULTY.hpStart) * k),
    speed: DIFFICULTY.speedStart + (DIFFICULTY.speedEnd - DIFFICULTY.speedStart) * k,
    spawnMs: DIFFICULTY.spawnMsStart + (DIFFICULTY.spawnMsEnd - DIFFICULTY.spawnMsStart) * k,
    maxAlive: Math.round(DIFFICULTY.maxAliveStart + (DIFFICULTY.maxAliveEnd - DIFFICULTY.maxAliveStart) * k),
    damage: Math.round(DIFFICULTY.damageStart + (DIFFICULTY.damageEnd - DIFFICULTY.damageStart) * k),
  };
}

// ---------- 方位名称（暂停细目用） ----------
// 4×4 虚拟扇区的行列含义：左远 / 左近 / 右近 / 右远；上 / 下。
export function sectorLabel(cellId) {
  const r = Math.floor(cellId / 4);
  const c = cellId % 4;
  const vertical = r < 2 ? '上' : '下';
  const horizontal = c === 0 ? '左远' : c === 1 ? '左近' : c === 2 ? '右近' : '右远';
  return vertical + horizontal;
}

// ---------- 联组名称 ----------
export const COMBO_NAMES = {
  duo: '对偶',
  line3: '直线三连',
  elbow3: '折线三连',
  ring4: '环封四格',
};

export const SECTOR = {
  half: SECTOR_HALF_SIZE,
  span: (SECTOR_HALF_SIZE * 2) / 4,
};

// 描绘与数值分离：名称来自唯一卡牌表；空位不能假装是奥术飞弹。
export function cardVisual(slot) {
  if (!slot) return { id: null, name: '空符位', short: '空', glyph: [], color: 0x6b5b8e };
  const definition = SIGIL_DEFS[slot.defId] ?? AUX_DEFS[slot.defId];
  const known = SIGILS[slot.defId];
  const auxiliary = slot.kind === 'auxiliary';
  return {
    ...known, ...definition,
    id: slot.defId,
    name: definition?.name ?? '未知卡牌',
    short: (definition?.name ?? '未知').slice(0, 2),
    color: auxiliary ? 0x5ed0c8 : (known?.color ?? 0xffd79a),
    glyph: known?.glyph ?? (auxiliary
      ? ['...#....', '..###...', '.#.#.#..', '###.###.', '.#.#.#..', '..###...', '...#....', '........']
      : ['..####..', '..#..#..', '########', '.##..##.', '.##..##.', '..####..', '...##...', '........']),
    speed: known?.speed ?? 400,
  };
}

