// 卡牌定义唯一来源，供构筑、派生参数与结算共用。
export const SIGIL_DEFS = {
  arcane_bolt:     { name: "奥术飞弹", damage: 12, cdMul: 1.00, kind: "single" },
  frost_arrow:     { name: "寒霜箭",   damage: 10, cdMul: 1.00, kind: "single", slow: 0.4, slowMs: 2000 },
  flame_burst:     { name: "烈焰喷涌", damage: 9,  cdMul: 1.10, kind: "fan3" },
  holy_ward:       { name: "圣光壁垒", damage: 6,  cdMul: 1.00, kind: "ward", shield: 14, shieldCap: 40, radius: 40 },
  mana_siphon:     { name: "秘能汲取", damage: 8,  cdMul: 0.90, kind: "single", heal: 2 },
  judgment_hammer: { name: "审判之锤", damage: 18, cdMul: 1.25, kind: "single", armorBonus: 0.5 },
  thorn_vine:      { name: "荆棘藤蔓", damage: 5,  cdMul: 1.20, kind: "area", rootMs: 1200, radius: 46 },
  starfall:        { name: "星陨",     damage: 22, cdMul: 1.50, kind: "area", radius: 70 },
};

export const AUX_DEFS = {
  resonance_stone: { name: "共鸣石" },
  hourglass:       { name: "时之沙漏" },
  wide_runes:      { name: "扩域符文" },
  slow_field:      { name: "迟滞结界" },
  shard_resonance: { name: "碎片共鸣" },
  sacrifice:       { name: "献祭" },
};

export const RUNE_DEFS = {
  relay:   { name: "中继" },
  forge:   { name: "熔炉" },
  sever:   { name: "断流" },
  silence: { name: "静默" },
};

export const OATH_DEFS = {
  lone_star: { name: "孤星之誓" },
  watcher:   { name: "守夜人之誓" },
  martyr:    { name: "殉道者之誓" },
};

