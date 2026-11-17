// 法术进化：每张符印两条升级路线，格子上的 slot.evo 指向其中一条。
// mods 里的字段只描述「相对基础法术的增量/替换」，结算层按字段名读取；
// 没写到的字段保持基础值，所以新增路线不需要改代码，只需要登记字段。
export const EVOLUTIONS = Object.freeze({
  arcane_bolt: [
    { id: 'split_bolt', name: '裂魂弹', desc: '伤害 -15%，但间隔与冷却都缩短 25%', mods: { damageMul: 0.85, cdMul: 0.75 } },
    { id: 'piercing_bolt', name: '贯魂弹', desc: '伤害 +35%，命中后 1.4 秒内目标再受击 +15%', mods: { damageMul: 1.35, vulnMs: 1400, vulnFactor: 1.15 } },
  ],
  frost_arrow: [
    { id: 'glacier_arrow', name: '冰河箭', desc: '伤害 +40%，减速 55% 持续 2.6 秒', mods: { damageMul: 1.4, slow: 0.55, slowMs: 2600 } },
    { id: 'shatter_arrow', name: '碎冰箭', desc: '命中冻结 0.8 秒，对减速目标伤害 +25%', mods: { freezeMs: 800, damageMul: 1.25 } },
  ],
  flame_burst: [
    { id: 'inferno', name: '炼狱', desc: '落点范围 +14，命中追加 50% 灼烧伤害', mods: { radius: 14, burnFactor: 0.5 } },
    { id: 'wildfire', name: '野火', desc: '冷却 -30%，伤害 -10%', mods: { cdMul: 0.7, damageMul: 0.9 } },
  ],
  holy_ward: [
    { id: 'bastion', name: '堡垒', desc: '护盾 14 → 24，上限 40 → 56', mods: { shield: 10, shieldCap: 16 } },
    { id: 'radiance', name: '圣辉', desc: '范围 +20，伤害 +50%', mods: { radius: 20, damageMul: 1.5 } },
  ],
  mana_siphon: [
    { id: 'greater_siphon', name: '汲魂', desc: '回复 2 → 5，伤害 +15%', mods: { heal: 3, damageMul: 1.15 } },
    { id: 'arcane_drain', name: '抽魔', desc: '冷却 -30%', mods: { cdMul: 0.7 } },
  ],
  judgment_hammer: [
    { id: 'verdict', name: '裁决', desc: '伤害 +45%', mods: { damageMul: 1.45 } },
    { id: 'retribution', name: '报应', desc: '对带护甲目标额外 40% 伤害', mods: { armorBonus: 1.2, damageMul: 1.15 } },
  ],
  thorn_vine: [
    { id: 'bramble', name: '棘牢', desc: '定身 1.2 → 2.0 秒，伤害 +30%', mods: { rootMs: 2000, damageMul: 1.3 } },
    { id: 'venom_vine', name: '毒藤', desc: '命中追加 60% 毒伤', mods: { burnFactor: 0.6 } },
  ],
  starfall: [
    { id: 'meteor', name: '陨星', desc: '伤害 +30%，范围 +10', mods: { damageMul: 1.3, radius: 10 } },
    { id: 'comet', name: '彗星', desc: '冷却 -20%', mods: { cdMul: 0.8 } },
  ],
  chain_lightning: [
    { id: 'storm_chain', name: '风暴连锁', desc: '跳跃次数 +2', mods: { jumps: 2 } },
    { id: 'overload', name: '过载', desc: '每跳衰减 0.7 → 0.88', mods: { decay: 0.88 } },
  ],
  pierce_lance: [
    { id: 'long_lance', name: '长枪', desc: '贯穿长度 +180', mods: { length: 180 } },
    { id: 'skewer', name: '穿刺', desc: '宽度 +20，伤害 +20%', mods: { width: 20, damageMul: 1.2 } },
  ],
  echo_sigil: [
    { id: 'echo_storm', name: '回声风暴', desc: '伤害 +30%', mods: { damageMul: 1.3 } },
    { id: 'mirror_echo', name: '镜像回声', desc: '冷却 -25%', mods: { cdMul: 0.75 } },
  ],
  ember_fan: [
    { id: 'emberstorm', name: '烬风', desc: '扇形半径 50 → 80', mods: { fanRadius: 30 } },
    { id: 'ash_fan', name: '灰烬扇', desc: '减速 30% 并追加 40% 灼烧', mods: { slow: 0.3, slowMs: 2000, burnFactor: 0.4 } },
  ],
  quake_maw: [
    { id: 'abyss', name: '深渊之口', desc: '范围 +18，定身 2.4 秒', mods: { radius: 18, rootMs: 2400 } },
    { id: 'tremor', name: '震颤', desc: '伤害 +40%，冷却 +10%', mods: { damageMul: 1.4, cdMul: 1.1 } },
  ],
  soul_lance: [
    { id: 'soul_reap', name: '收割', desc: '回复 3 → 6', mods: { heal: 3 } },
    { id: 'soul_pierce', name: '噬魂贯穿', desc: '伤害 +35%', mods: { damageMul: 1.35 } },
  ],
  aegis_ring: [
    { id: 'aegis_eternal', name: '永恒圣环', desc: '护盾 20 → 30，上限 60 → 80', mods: { shield: 10, shieldCap: 20 } },
    { id: 'aegis_bolt', name: '圣环冲击', desc: '伤害 +60%', mods: { damageMul: 1.6 } },
  ],
  meteor_judgment: [
    { id: 'extinction', name: '湮灭', desc: '伤害 +30%，内圈 60% → 80%', mods: { damageMul: 1.3, innerMul: 0.8 } },
    { id: 'starfall_judgment', name: '星落', desc: '范围 +20，冷却 -10%', mods: { radius: 20, cdMul: 0.9 } },
  ],
  // 波 4 新法术的进化路线（数值与特效随后落地）
  frost_nova: [
    { id: 'absolute_zero', name: '绝对零度', desc: '命中冻结 1.2 秒', mods: { freezeMs: 1200 } },
    { id: 'permafrost', name: '永冻', desc: '减速 55% 持续 3 秒', mods: { slow: 0.55, slowMs: 3000 } },
  ],
  thunder_storm: [
    { id: 'tempest', name: '雷暴', desc: '范围 +30', mods: { radius: 30 } },
    { id: 'stormfront', name: '风暴前线', desc: '冷却 -30%', mods: { cdMul: 0.7 } },
  ],
  sunflare: [
    { id: 'solar_flare', name: '太阳耀斑', desc: '命中追加 100% 灼烧', mods: { burnFactor: 1.0 } },
    { id: 'radiance_flare', name: '炽阳', desc: '伤害 +35%', mods: { damageMul: 1.35 } },
  ],
  void_lance: [
    { id: 'void_pierce', name: '虚空贯穿', desc: '长度 +150', mods: { length: 150 } },
    { id: 'null_field', name: '零域', desc: '命中冻结 0.8 秒', mods: { freezeMs: 800 } },
  ],
  sanctum: [
    { id: 'sanctuary', name: '圣所', desc: '护盾上限 +20', mods: { shieldCap: 20, shield: 8 } },
    { id: 'chapel', name: '礼拜堂', desc: '范围 +25', mods: { radius: 25 } },
  ],
  bramble_maul: [
    { id: 'entangle', name: '缠绞', desc: '定身 2.5 秒', mods: { rootMs: 2500 } },
    { id: 'crushing_roots', name: '碎根', desc: '伤害 +40%', mods: { damageMul: 1.4 } },
  ],
  soul_echo: [
    { id: 'soul_chorus', name: '魂之合唱', desc: '回复 2', mods: { heal: 2 } },
    { id: 'echo_spiral', name: '回声旋涡', desc: '冷却 -25%', mods: { cdMul: 0.75 } },
  ],
  glacier: [
    { id: 'glacier_wall', name: '冰川墙', desc: '宽度 +20', mods: { width: 20 } },
    { id: 'permafrost_glacier', name: '永冻之墙', desc: '减速 60% 持续 3 秒', mods: { slow: 0.6, slowMs: 3000 } },
  ],
});

export function evolutionRoutes(defId) {
  return EVOLUTIONS[defId] ?? null;
}

export function evolutionOf(defId, evoId) {
  if (typeof evoId !== 'string') return null;
  return EVOLUTIONS[defId]?.find(route => route.id === evoId) ?? null;
}

// 结算层每帧都用：缺省返回空对象，调用方可以无脑展开。
export function evoModsOf(slot) {
  if (!slot || slot.kind !== 'sigil' || typeof slot.evo !== 'string') return null;
  return evolutionOf(slot.defId, slot.evo)?.mods ?? null;
}

export function slotEvolved(slot) {
  return slot?.kind === 'sigil' && typeof slot.evo === 'string' && !!evolutionOf(slot.defId, slot.evo);
}
