// 卡牌一句话效果：幕间构筑台与战斗内暂停改阵共用同一份文案。
// 只做展示，不参与任何结算；长度控制在 26 个汉字内，手牌行/详情面板都能放下。
export const CARD_HINTS = Object.freeze({
  arcane_bolt: '单体 12 伤害',
  frost_arrow: '10 伤害／减速 40%',
  flame_burst: '邻近最多 3 目标，各 9 伤害',
  holy_ward: '贴身伤害 6／护盾 +14',
  mana_siphon: '8 伤害／回复 2 生命',
  judgment_hammer: '18 伤害／破甲 +50%',
  thorn_vine: '区域 5 伤害／定身 1.2 秒',
  starfall: '半径 70 区域 22 伤害／内圈 -30%',
  chain_lightning: '12 伤害／向附近再跳 2 次（逐跳 -30%）',
  pierce_lance: '沿直线贯穿 15 伤害',
  echo_sigil: '本格与对侧扇区各打 11 伤害',
  ember_fan: '邻近 3 目标 10 伤害／减速 25%',
  quake_maw: '半径 80 区域 14 伤害／定身 0.6 秒',
  soul_lance: '15 伤害／回复 3 生命',
  aegis_ring: '贴身 8 伤害／护盾 +20（上限 60）',
  meteor_judgment: '半径 95 区域 26 伤害／内圈 -40%',
  frost_nova: '以自身为心 90 半径 13 伤害／减速 45%',
  thunder_storm: '半径 110 区域 16 伤害／冻结 0.2 秒',
  sunflare: '沿直线贯穿 20 伤害／前摇 0.7 秒',
  void_lance: '沿直线贯穿 18 伤害／射程最长',
  sanctum: '贴身 6 伤害／护盾 +24（上限 70）',
  bramble_maul: '半径 60 区域 17 伤害／定身 1.5 秒',
  soul_echo: '本格与对侧扇区各打 12／回复 2',
  glacier: '贯穿 15 伤害／减速 50%',
  resonance_stone: '正交邻格间隔与冷却 -25%',
  slow_field: '近身 90 范围敌人减速 40%',
  shard_resonance: '大幅扩大碎片吸取范围',
  sacrifice: '指向邻格：每次触发扣 8 护盾换双倍伤害',
  hourglass: '指向邻格：冷却 -30%',
  wide_runes: '指向邻格：增加全部八向出口',
  forge: '本格伤害 +50%',
  relay: '本格不出手，出发间隔 -40%',
  sever: '本格断流，保留配置出口',
  silence: '触发时压制正交邻格冷却',
});

export function hintOf(defId) {
  return CARD_HINTS[defId] ?? '';
}

// 变体说明：抽卡与构筑界面用一句话讲清锐/谐的取舍（base 不额外标注）。
export const VARIANT_HINTS = Object.freeze({
  base: '标准形态 · 不参与联组',
  sharp: '锐化 · 伤害 +30%，不可联组',
  harmon: '谐律 · 伤害 -18%，可参与联组',
});

export function variantHintOf(card) {
  if (!card || card.kind !== 'sigil') return '';
  return VARIANT_HINTS[card.variant ?? 'base'] ?? '';
}
