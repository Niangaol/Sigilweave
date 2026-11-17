// 共振法阵 · P1 内容表
// 只放表现层需要的数据：符印名称/像素图案/伤害、魔物、第一幕解锁形状、难度曲线。
// 冷却、间隔、传导、联组规则全部在 src/logic/* 内，禁止在这里重复实现。
import { SECTOR_SCREEN_HALF_W, SECTOR_SCREEN_HALF_H, SECTOR_FAR_X, SECTOR_FAR_Y } from '../logic/constants.js';
import { SIGIL_DEFS, AUX_DEFS } from './cards.js';

// ---------- 玩家 ----------
export const PLAYER = {
  hp: 100,
  speed: 96,          // 像素/秒
  radius: 6,
  iframesMs: 1400,    // 受击无敌（割草密度上调后从 900 提到 1400：仿真里火焰起手包从 115s 阵亡变为满 180s 存活）
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
// 颜色：2026-10 割草版放开「己方一律暖金」的旧纪律——同屏 60~90 只怪 + 16 个法术时，
// 只靠形状区分太吃力。现在每个法术一个元素主色（寒霜冰白 / 烈焰橙 / 噬魂紫 / 地裂土黄…），
// 与 src/ui/spell-fx.js 的 SPELL_FX[defId].colors.body 保持一致，罗盘字模、方位光迹、
// 触发闪光都吃这个色。青绿仍只留给增益/运行层。
export const SIGILS = {
  frost_arrow: {
    id: 'frost_arrow',
    name: '寒霜箭',
    short: '寒霜',
    color: 0xaee4ff,
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
    color: 0xff7a3c,
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
    color: 0x849c6c,
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
  // —— 补齐原本缺图标的两个基础符印（此前共用一张兜底图案）——
  holy_ward: {
    id: 'holy_ward',
    name: '圣光壁垒',
    short: '壁垒',
    color: 0xf0d9a8,
    damage: 6,
    speed: 300,
    glyph: [
      '..####..',
      '.#.##.#.',
      '#..##..#',
      '#..##..#',
      '#.####.#',
      '.#....#.',
      '..####..',
      '........',
    ],
  },
  mana_siphon: {
    id: 'mana_siphon',
    name: '秘能汲取',
    short: '汲取',
    color: 0x9fe8ff,
    damage: 8,
    speed: 380,
    glyph: [
      '....#...',
      '...##...',
      '..####..',
      '.######.',
      '.##..##.',
      '.######.',
      '..####..',
      '........',
    ],
  },
  // —— 扩展法术（第二批）：每个都有自己的 8×8 字模 ——
  chain_lightning: {
    id: 'chain_lightning',
    name: '连锁闪电',
    short: '连锁',
    color: 0xfff0a0,
    damage: 12,
    speed: 520,
    glyph: [
      '#.....#.',
      '....##..',
      '...##...',
      '..####..',
      '...##...',
      '..##....',
      '.#....#.',
      '........',
    ],
  },
  pierce_lance: {
    id: 'pierce_lance',
    name: '穿刺之矛',
    short: '穿刺',
    color: 0xe0c35a,
    damage: 15,
    speed: 560,
    glyph: [
      '......#.',
      '.....##.',
      '#######.',
      '########',
      '#######.',
      '.....##.',
      '......#.',
      '........',
    ],
  },
  echo_sigil: {
    id: 'echo_sigil',
    name: '回声符文',
    short: '回声',
    color: 0xffaa33,
    damage: 11,
    speed: 420,
    glyph: [
      '..####..',
      '.#....#.',
      '#..##..#',
      '#.####.#',
      '#..##..#',
      '.#....#.',
      '..####..',
      '........',
    ],
  },
  ember_fan: {
    id: 'ember_fan',
    name: '余烬扇',
    short: '余烬',
    color: 0xff8a4d,
    damage: 10,
    speed: 340,
    glyph: [
      '#..#..#.',
      '.#.#.#..',
      '..#.#...',
      '...#....',
      '...#....',
      '..#.#...',
      '.#.#.#..',
      '#..#..#.',
    ],
  },
  quake_maw: {
    id: 'quake_maw',
    name: '地裂之颚',
    short: '地裂',
    color: 0xcc9c6c,
    damage: 14,
    speed: 240,
    glyph: [
      '#..#...#',
      '.#..#..#',
      '..#..#..',
      '#..#...#',
      '.#..#..#',
      '..#..#..',
      '#..#...#',
      '........',
    ],
  },
  soul_lance: {
    id: 'soul_lance',
    name: '噬魂箭',
    short: '噬魂',
    color: 0xb8a0ff,
    damage: 15,
    speed: 500,
    glyph: [
      '....#...',
      '...##...',
      '..###...',
      '#######.',
      '..###...',
      '...##...',
      '....#...',
      '........',
    ],
  },
  aegis_ring: {
    id: 'aegis_ring',
    name: '圣环',
    short: '圣环',
    color: 0xc8e8d0,
    damage: 8,
    speed: 300,
    glyph: [
      '..####..',
      '.#....#.',
      '#..#...#',
      '#..###.#',
      '#..#...#',
      '.#....#.',
      '..####..',
      '........',
    ],
  },
  meteor_judgment: {
    id: 'meteor_judgment',
    name: '陨星裁决',
    short: '陨星',
    color: 0xb08252,
    damage: 26,
    speed: 190,
    glyph: [
      '..##....',
      '.####...',
      '..##....',
      '...#....',
      '....#...',
      '.....#..',
      '......#.',
      '.......#',
    ],
  },
  // —— 第三批 ——
  frost_nova: {
    id: 'frost_nova',
    name: '霜华新星',
    short: '霜环',
    color: 0xbfe8ff,
    damage: 13,
    speed: 300,
    glyph: [
      '...##...',
      '.#.##.#.',
      '..####..',
      '########',
      '..####..',
      '.#.##.#.',
      '...##...',
      '........',
    ],
  },
  thunder_storm: {
    id: 'thunder_storm',
    name: '雷霆风暴',
    short: '雷暴',
    color: 0x9fe8ff,
    damage: 16,
    speed: 220,
    glyph: [
      '....##..',
      '...##...',
      '..##....',
      '.#####..',
      '...##...',
      '..##....',
      '.##.....',
      '........',
    ],
  },
  sunflare: {
    id: 'sunflare',
    name: '日轮耀斑',
    short: '耀斑',
    color: 0xffd36b,
    damage: 20,
    speed: 380,
    glyph: [
      '...#....',
      '.#.#.#..',
      '..###...',
      '#######.',
      '..###...',
      '.#.#.#..',
      '...#....',
      '........',
    ],
  },
  void_lance: {
    id: 'void_lance',
    name: '虚空之矛',
    short: '虚空',
    color: 0xb8a0ff,
    damage: 18,
    speed: 520,
    glyph: [
      '......#.',
      '.....##.',
      '....##..',
      '...##...',
      '..##....',
      '.##.....',
      '##......',
      '#.......',
    ],
  },
  sanctum: {
    id: 'sanctum',
    name: '圣所',
    short: '圣所',
    color: 0xffe3a3,
    damage: 6,
    speed: 260,
    glyph: [
      '..####..',
      '.#....#.',
      '#......#',
      '#......#',
      '#..##..#',
      '#..##..#',
      '########',
      '........',
    ],
  },
  bramble_maul: {
    id: 'bramble_maul',
    name: '荆棘巨槌',
    short: '巨槌',
    color: 0x849c6c,
    damage: 17,
    speed: 240,
    glyph: [
      '#.#.#.#.',
      '##.##.##',
      '.######.',
      '..####..',
      '.##..##.',
      '##....##',
      '........',
      '........',
    ],
  },
  soul_echo: {
    id: 'soul_echo',
    name: '魂灵回声',
    short: '魂回',
    color: 0xa88bd8,
    damage: 12,
    speed: 340,
    glyph: [
      '..####..',
      '.#....#.',
      '#..##..#',
      '#.#..#.#',
      '#..##..#',
      '.#....#.',
      '..####..',
      '........',
    ],
  },
  glacier: {
    id: 'glacier',
    name: '冰川裂谷',
    short: '冰川',
    color: 0x9fd8ff,
    damage: 15,
    speed: 300,
    glyph: [
      '#..#..#.',
      '##.##.##',
      '####.###',
      '.######.',
      '..####..',
      '.#.##.#.',
      '#..#..#.',
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
    damage: 2,
    shards: 1,
    behavior: 'march',
    hpMul: 1,
    speedMul: 1,
    color: 0xe4dcc4,
  },
  bat: {
    id: 'bat',
    name: '噬魂飞行体',
    radius: 5,
    damage: 1,
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
    damage: 3,
    shards: 2,
    behavior: 'lurch',
    hpMul: 2.2,
    speedMul: 0.55,
    color: 0x5d7a46,
  },
  cultist: {
    id: 'cultist',
    name: '邪教徒',
    radius: 6,
    damage: 2,
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
    damage: 2,
    shards: 3,
    behavior: 'charge',
    hpMul: 2,
    speedMul: 1,
    color: 0x4a4166,
  },
  // ---------- 2026-11 美术升级包新增怪（数值按当前割草伤害档重新缩放，不照搬旧包 9/15 的接触伤害）----------
  rune_spider: {
    id: 'rune_spider',
    name: '符纹蛛',
    radius: 5,
    damage: 1,
    shards: 1,
    behavior: 'skitter',
    hpMul: 0.6,
    speedMul: 1.55,
    color: 0x9a8a38,
  },
  stone_gargoyle: {
    id: 'stone_gargoyle',
    name: '熔岩石像鬼',
    radius: 9,
    damage: 3,
    shards: 3,
    behavior: 'slam_charge',
    hpMul: 2.4,
    speedMul: 0.8,
    color: 0x9a7a52,
  },
  crystal_dryad: {
    id: 'crystal_dryad',
    name: '晶棘树妖',
    radius: 8,
    damage: 2,
    shards: 3,
    behavior: 'volley',
    hpMul: 1.6,
    speedMul: 0.7,
    color: 0x5ed0c8,
  },
  clockwork_doll: {
    id: 'clockwork_doll',
    name: '齿轮傀儡',
    radius: 8,
    damage: 2,
    shards: 3,
    behavior: 'spring',
    hpMul: 2,
    speedMul: 0.6,
    color: 0xc9a227,
  },
  void_elemental: {
    id: 'void_elemental',
    name: '虚空符灵',
    radius: 7,
    damage: 2,
    shards: 2,
    behavior: 'phase',
    hpMul: 1.8,
    speedMul: 0.95,
    color: 0x7d6bb0,
  },
  wraith: {
    id: 'wraith',
    name: '幽誓女妖',
    radius: 6,
    damage: 2,
    shards: 2,
    behavior: 'stalk',
    hpMul: 1.4,
    speedMul: 1.15,
    color: 0xa88fce,
  },
  brass_warden: {
    id: 'brass_warden',
    name: '黄铜守誓者',
    radius: 12,
    damage: 4,
    shards: 6,
    behavior: 'double_charge',
    hpMul: 4.2,
    speedMul: 0.7,
    color: 0xe0c35a,
    elite: true,
  },
  // 二幕精英：缝合尸魁。慢速贴身后每 0.8s 践踏一次（事件由 enemy-ai 产出，伤害由场景结算）。
  stitch_abomination: {
    id: 'stitch_abomination',
    name: '缝合尸魁',
    radius: 14,
    damage: 4,
    shards: 5,
    behavior: 'stomp',
    hpMul: 4.5,
    speedMul: 0.5,
    color: 0x8a5f4a,
    elite: true,
  },
  // 三幕精英：咒誓主教。保持 110px，每 4.2s 瞬移侧翼并打三连弹。
  oath_bishop: {
    id: 'oath_bishop',
    name: '咒誓主教',
    radius: 12,
    damage: 3,
    shards: 8,
    behavior: 'blink_caster',
    hpMul: 3.5,
    speedMul: 1,
    color: 0x7d6bb0,
    elite: true,
  },
  // ================= 北斗后半段专属敌人（第 4-7 幕） =================
  // 四幕·天权（沉钟书库）：墨与纸的机关书库。
  ink_wisp: {
    id: 'ink_wisp', name: '墨灵', radius: 7, damage: 2, shards: 2,
    behavior: 'drift', hpMul: 1.3, speedMul: 1.25, color: 0x4a5a8e,
  },
  page_golem: {
    id: 'page_golem', name: '纸页傀儡', radius: 10, damage: 3, shards: 3,
    behavior: 'bulwark', hpMul: 2.0, speedMul: 0.7, color: 0xd8c9a0,
  },
  // 四幕精英：索引猎犬。蓄力后长距扑咬，冲锋期接触伤害翻倍。
  index_hound: {
    id: 'index_hound', name: '索引猎犬', radius: 12, damage: 4, shards: 6,
    behavior: 'lunge', hpMul: 3.6, speedMul: 1.0, color: 0x9fb4d8, elite: true,
  },
  // 五幕·玉衡（衡律法庭）：判词与枷锁。
  verdict_wraith: {
    id: 'verdict_wraith', name: '判词幽灵', radius: 7, damage: 3, shards: 3,
    behavior: 'lance', hpMul: 1.5, speedMul: 1.15, color: 0xcfd6e0,
  },
  shackle_guard: {
    id: 'shackle_guard', name: '枷锁守卫', radius: 11, damage: 4, shards: 4,
    behavior: 'chain', hpMul: 2.4, speedMul: 0.65, color: 0x9aa1ad,
  },
  // 五幕精英：天平裁决者。保持 130px，标记后打一发重判词弹。
  scale_arbiter: {
    id: 'scale_arbiter', name: '天平裁决者', radius: 12, damage: 4, shards: 7,
    behavior: 'judge', hpMul: 3.4, speedMul: 0.95, color: 0xe0d6c8, elite: true,
  },
  // 六幕·开阳（熔星锻炉）：炉渣与火星。
  slag_beast: {
    id: 'slag_beast', name: '炉渣兽', radius: 12, damage: 4, shards: 4,
    behavior: 'eruption', hpMul: 2.8, speedMul: 0.6, color: 0x8a4a2a,
  },
  ember_imp: {
    id: 'ember_imp', name: '火星精', radius: 6, damage: 2, shards: 2,
    behavior: 'dart', hpMul: 1.0, speedMul: 1.45, color: 0xff8a4d,
  },
  // 六幕精英：铁砧暴君。贴近后蓄力砸地，大范围震荡。
  anvil_tyrant: {
    id: 'anvil_tyrant', name: '铁砧暴君', radius: 14, damage: 5, shards: 8,
    behavior: 'slam', hpMul: 4.8, speedMul: 0.5, color: 0x6b543f, elite: true,
  },
  // 七幕·摇光（破晓之座）：晨光与星屑。
  dawn_shade: {
    id: 'dawn_shade', name: '晓色之影', radius: 8, damage: 3, shards: 3,
    behavior: 'mirror', hpMul: 1.8, speedMul: 1.2, color: 0xffd98a,
  },
  stardust_knight: {
    id: 'stardust_knight', name: '星屑骑士', radius: 10, damage: 4, shards: 5,
    behavior: 'charge_volley', hpMul: 2.6, speedMul: 0.85, color: 0xe8e0ff,
  },
  // 七幕精英：蚀日祭司。保持 100px，蓄力后打八向星环。
  eclipse_priest: {
    id: 'eclipse_priest', name: '蚀日祭司', radius: 12, damage: 4, shards: 9,
    behavior: 'eclipse', hpMul: 4.0, speedMul: 0.9, color: 0x9a7bd8, elite: true,
  },
};

// 五幕刷怪权重：键是「幕」（1..5），每幕权重和恒为 1（浮点求和精确等于 1，测试可直接判等）。
// 第一幕：骷髅为主 + 少量蝠；第二幕：蝠 / 腐尸 / 骷髅 + 缝合尸魁 8%；
// 第三幕：常规五种 + 咒誓主教 12%，骑士与邪教徒合计 44%（每幕精英只占尾部权重）。
// 第四幕（审判书库 = 沉钟书库 + 衡律法庭）：两场的专属怪合并成一池，六种专属占 64%；
// 第五幕（熔星破晓 = 熔星锻炉 + 破晓之座）：炉渣兽/火星精/铁砧暴君 + 晓色之影/星屑骑士/蚀日祭司，同样占 64%。
// 合并幕的意义就在这里：一幕之内能同时遇到两场的全部兵种，密度比旧七幕更厚。
export const CHAPTER_ENEMY_WEIGHTS = {
  1: [['skeleton', 0.46], ['bat', 0.18], ['rune_spider', 0.24], ['stone_gargoyle', 0.12]],
  2: [['bat', 0.16], ['corpse', 0.18], ['skeleton', 0.1], ['rune_spider', 0.12], ['crystal_dryad', 0.12], ['clockwork_doll', 0.12], ['stone_gargoyle', 0.12], ['stitch_abomination', 0.08]],
  3: [['skeleton', 0.06], ['bat', 0.08], ['corpse', 0.07], ['cultist', 0.09], ['knight', 0.1], ['rune_spider', 0.05], ['crystal_dryad', 0.09], ['clockwork_doll', 0.06], ['stone_gargoyle', 0.08], ['wraith', 0.1], ['void_elemental', 0.1], ['brass_warden', 0.06], ['oath_bishop', 0.06]],
  // 四幕·审判书库：墨灵/纸页傀儡/索引猎犬 + 判词幽灵/枷锁守卫/天平裁决者 = 0.64，旧怪只作陪衬。
  4: [['ink_wisp', 0.13], ['page_golem', 0.13], ['index_hound', 0.06], ['verdict_wraith', 0.13], ['shackle_guard', 0.13], ['scale_arbiter', 0.06], ['knight', 0.1], ['brass_warden', 0.06], ['oath_bishop', 0.06], ['clockwork_doll', 0.05], ['wraith', 0.05], ['cultist', 0.04]],
  // 五幕·熔星破晓：炉渣兽/火星精/铁砧暴君 + 晓色之影/星屑骑士/蚀日祭司 = 0.64，终局把缝合尸魁也放回来收尾。
  5: [['slag_beast', 0.13], ['ember_imp', 0.12], ['anvil_tyrant', 0.06], ['dawn_shade', 0.13], ['stardust_knight', 0.13], ['eclipse_priest', 0.07], ['knight', 0.1], ['brass_warden', 0.08], ['oath_bishop', 0.06], ['void_elemental', 0.05], ['corpse', 0.03], ['stone_gargoyle', 0.04]],
};

// 旧名保留：外部若还按七幕写着 ACT_ENEMY_WEIGHTS，语义已经变成「按幕」的同一张表。
export const ACT_ENEMY_WEIGHTS = CHAPTER_ENEMY_WEIGHTS;

// 确定性刷怪映射：roll ∈ [0,1) 自上而下落在哪个权重区间就是哪种敌人。
// 非法幕号 / 非法 roll 一律回退骷髅兵，保证刷怪函数永远有返回值。
export function pickEnemyType(chapter, roll) {
  const table = Number.isInteger(chapter) && Object.hasOwn(CHAPTER_ENEMY_WEIGHTS, chapter)
    ? CHAPTER_ENEMY_WEIGHTS[chapter]
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
// 【割草密度重做】下面这一组是「幸存者式割草」的设计值，不是旧曲线的小幅微调：
// 旧版同屏 9→26 只、每 2.4s→1.55s 才刷 1 只，屏幕上根本凑不出怪堆；
// 新版同屏 30→64 只（第三幕再 ×1.3，83）、0.7s→0.52s 一波，每波抽 1..2 只同刷。
// 上限不是越高越好：纯逻辑仿真（scripts/density-sim.mjs）显示刷怪超过清怪速度时，屏幕会变成一堵推不动的墙。
// 密度翻了约十倍后，接触伤害必须同步下调（见 ENEMY_TYPES），否则贴脸就是瞬间秒杀。
export const DIFFICULTY = {
  rampMs: 180000,
  // 五幕后单幕被拉长（合并幕约 6~7 分钟），所以末段数值整体抬一档：
  // 血量 4→12、速度 38→60、同屏 34→66、刷怪 700→500ms，配合按场放大的密度系数。
  hpStart: 4,
  hpEnd: 12,
  // 刷怪环在屏幕外 275~380px：速度太低会让怪走 7~15 秒才到脸上，屏幕长期空着，
  // 38→58 下 5~9 秒到位；蝙蝠 speedMul 1.6 也只有约 93px/s，仍略低于玩家 96，追不上人。
  speedStart: 38,
  speedEnd: 60,
  // 刷怪节奏按「玩家实际清怪速度」定，不是拍脑袋往死里堆：
  // 纯逻辑战斗仿真（scripts/density-sim.mjs）测得 2/3/3 脉流下第一幕击杀约 0.8/s、二三幕约 2.2~2.8/s，
  // 所以末段刷怪定在约 2.9/s（520ms × 平均 1.5 只），让同屏稳定在 30~60 而不是顶满上限变成一堵墙。
  spawnMsStart: 700,
  spawnMsEnd: 500,
  maxAliveStart: 34,
  maxAliveEnd: 66,
  // 兜底伤害：只有怪种没自带 damage 时才会用到
  damageStart: 3,
  damageEnd: 5,
  // 每次刷怪波抽 1..wave 只（末段经常 1~2 只同刷）
  waveStart: 1,
  waveEnd: 2,
};

// 按「场」放大的密度系数：越往后同屏越多、刷得越密（同屏上限仍由 maxAlive 兜住）。
// 七场封顶 66×1.62≈107 只，仍低于压测过的 150 只档位，留得住帧率。
// 合并幕（第四、五幕）内部两场的系数不同：换场那一刻密度会实打实再抬一级。
export const ACT_DENSITY = {
  1: { maxAlive: 1.00, spawnMs: 1.00 },
  2: { maxAlive: 1.10, spawnMs: 0.94 },
  3: { maxAlive: 1.20, spawnMs: 0.88 },
  4: { maxAlive: 1.34, spawnMs: 0.83 },
  5: { maxAlive: 1.42, spawnMs: 0.79 },
  6: { maxAlive: 1.52, spawnMs: 0.76 },
  7: { maxAlive: 1.62, spawnMs: 0.73 },
};

// 难度采样：difficultyAt(ms) 保持旧签名，不传场号等价于第一场（老调用点行为不变）。
// 参数是「场」不是「幕」：血量/速度在每一场内各自从头爬，跨场的抬升靠密度系数与兵种池。
// wave 随 k 线性取整（k=0→1、k=1→2）；非法场号回退第一场，非法 ms 按 0 处理（保持既有 clamp 语义）。
export function difficultyAt(elapsedMs, stage = 1) {
  const k = Number.isFinite(elapsedMs) ? Math.min(1, Math.max(0, elapsedMs / DIFFICULTY.rampMs)) : 0;
  const density = Number.isInteger(stage) && Object.hasOwn(ACT_DENSITY, stage) ? ACT_DENSITY[stage] : ACT_DENSITY[1];
  const maxAlive = Math.round(DIFFICULTY.maxAliveStart + (DIFFICULTY.maxAliveEnd - DIFFICULTY.maxAliveStart) * k);
  const spawnMs = DIFFICULTY.spawnMsStart + (DIFFICULTY.spawnMsEnd - DIFFICULTY.spawnMsStart) * k;
  const wave = Math.round(DIFFICULTY.waveStart + (DIFFICULTY.waveEnd - DIFFICULTY.waveStart) * k);
  return {
    hp: Math.round(DIFFICULTY.hpStart + (DIFFICULTY.hpEnd - DIFFICULTY.hpStart) * k),
    speed: DIFFICULTY.speedStart + (DIFFICULTY.speedEnd - DIFFICULTY.speedStart) * k,
    // 幕密度只放大「同屏上限」和「刷怪间隔」，血量/速度/单波数量按同一套曲线走
    spawnMs: spawnMs * density.spawnMs,
    maxAlive: Math.round(maxAlive * density.maxAlive),
    damage: Math.round(DIFFICULTY.damageStart + (DIFFICULTY.damageEnd - DIFFICULTY.damageStart) * k),
    wave,
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

// 铭文图标：和符印同一套 8×8 字模规范，工作台按钮与格子标记共用。
export const RUNE_GLYPHS = {
  forge: [
    '..#..#..',
    '.######.',
    '########',
    '.######.',
    '..#..#..',
    '..####..',
    '.##..##.',
    '........',
  ],
  relay: [
    '...#....',
    '..##....',
    '.###....',
    '########',
    '.###....',
    '..##....',
    '...#....',
    '........',
  ],
  sever: [
    '......#.',
    '.....#..',
    '....#...',
    '...#....',
    '..#.....',
    '.#......',
    '#.......',
    '........',
  ],
  silence: [
    '..####..',
    '.#....#.',
    '#..##..#',
    '#.####.#',
    '#..##..#',
    '.#....#.',
    '..####..',
    '...#....',
  ],
};

// ---------- 联组名称 ----------
export const COMBO_NAMES = {
  duo: '对偶',
  line3: '直线三连',
  elbow3: '折线三连',
  ring4: '环封四格',
};

// 方位条带参数：内 2×2 是屏幕范围，外 12 条延伸到整张地图。
export const SECTOR = {
  halfW: SECTOR_SCREEN_HALF_W,
  halfH: SECTOR_SCREEN_HALF_H,
  farX: SECTOR_FAR_X,
  farY: SECTOR_FAR_Y,
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

