// 七派系：给每张符印一层元素身份。同派系正交相邻产生共鸣（伤害递增），
// 四对固定组合在触发时产生反应（状态/额外伤害）。纯数据，不引任何运行时对象。
export const FACTIONS = Object.freeze({
  frost: { id: 'frost', name: '霜', color: '#aee4ff', desc: '减速与冻结，越冷越稳' },
  fire: { id: 'fire', name: '火', color: '#ff8a4d', desc: '爆发与灼烧，贴脸最凶' },
  storm: { id: 'storm', name: '雷', color: '#9fe8ff', desc: '跳跃传导，专打扎堆' },
  arcane: { id: 'arcane', name: '奥术', color: '#b8a0ff', desc: '纯粹伤害与贯穿' },
  holy: { id: 'holy', name: '神圣', color: '#ffd79a', desc: '护盾、审判与净化' },
  wild: { id: 'wild', name: '野性', color: '#849c6c', desc: '区域压制与定身' },
  soul: { id: 'soul', name: '魂灵', color: '#a88bd8', desc: '汲取生命，越打越久' },
});

// 每张符印的派系。24 张全覆盖（新 8 张先登记，波 4 落地数值）。
export const SIGIL_FACTION = Object.freeze({
  arcane_bolt: 'arcane',
  frost_arrow: 'frost',
  flame_burst: 'fire',
  holy_ward: 'holy',
  mana_siphon: 'arcane',
  judgment_hammer: 'holy',
  thorn_vine: 'wild',
  starfall: 'arcane',
  chain_lightning: 'storm',
  pierce_lance: 'arcane',
  echo_sigil: 'arcane',
  ember_fan: 'fire',
  quake_maw: 'wild',
  soul_lance: 'soul',
  aegis_ring: 'holy',
  meteor_judgment: 'fire',
  // 波 4 新法术（数值与特效随后落地，派系先定）
  frost_nova: 'frost',
  thunder_storm: 'storm',
  sunflare: 'fire',
  void_lance: 'arcane',
  sanctum: 'holy',
  bramble_maul: 'wild',
  soul_echo: 'soul',
  glacier: 'frost',
});

export function factionOf(defId) {
  return SIGIL_FACTION[defId] ?? null;
}

// 同派系相邻：每个相邻同派系 +10%，封顶 +30%。
export const RESONANCE_STEP = 0.10;
export const RESONANCE_CAP = 0.30;

// 四对异系反应。pair 无序：顺序不写死，reactionOf 双向查。
export const REACTIONS = Object.freeze({
  melt: Object.freeze({
    id: 'melt', name: '融化', color: '#ff9d6b', pair: Object.freeze(['frost', 'fire']),
    vulnMs: 2000, vulnFactor: 1.15,
    desc: '霜与火相激：命中后 2 秒内目标易伤 15%',
  }),
  conduct: Object.freeze({
    id: 'conduct', name: '导电', color: '#9fe8ff', pair: Object.freeze(['storm', 'frost']),
    freezeMs: 1200, chainFactor: 0.3,
    desc: '雷借霜势：冻结 1.2 秒，并向最近的另一名敌人补一跳',
  }),
  scorch: Object.freeze({
    id: 'scorch', name: '灼烧', color: '#ffb347', pair: Object.freeze(['fire', 'wild']),
    extraFactor: 0.9, ticks: 3,
    desc: '火借草木：本次命中额外 90% 伤害（3 段 ×30%）',
  }),
  purify: Object.freeze({
    id: 'purify', name: '净化', color: '#ffd79a', pair: Object.freeze(['soul', 'holy']),
    undeadFactor: 1.4, heal: 2,
    desc: '魂与圣光：对不死/腐化目标伤害 +40%，并回复 2 生命',
  }),
});

// 净化反应的目标类型：亡灵与腐化（按敌人 defId 归类）。
export const UNDEAD_OR_CORRUPT = Object.freeze([
  'skeleton', 'bat', 'corpse', 'stitch_abomination', 'wraith', 'verdict_wraith',
  'cultist', 'oath_bishop', 'void_elemental',
]);
