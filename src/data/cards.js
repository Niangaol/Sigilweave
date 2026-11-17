// 卡牌定义唯一来源，供构筑、派生参数与结算共用。
export const SIGIL_DEFS = {
  arcane_bolt:     { name: "奥术飞弹", damage: 12, cdMul: 1.00, kind: "single" },
  frost_arrow:     { name: "寒霜箭",   damage: 10, cdMul: 1.00, kind: "single", slow: 0.4, slowMs: 2000 },
  flame_burst:     { name: "烈焰喷涌", damage: 9,  cdMul: 1.10, kind: "fan3" },
  holy_ward:       { name: "圣光壁垒", damage: 6,  cdMul: 1.00, kind: "ward", shield: 7,  shieldCap: 24, radius: 40 },
  mana_siphon:     { name: "秘能汲取", damage: 8,  cdMul: 0.90, kind: "single", heal: 2 },
  judgment_hammer: { name: "审判之锤", damage: 18, cdMul: 1.25, kind: "single", armorBonus: 0.5 },
  thorn_vine:      { name: "荆棘藤蔓", damage: 5,  cdMul: 1.20, kind: "area", rootMs: 1200, radius: 46 },
  starfall:        { name: "星陨",     damage: 22, cdMul: 1.50, kind: "area", radius: 70 },

  // —— 扩展法术（第二批）——
  // 新机制：chain 连锁跳跃 / pierce 直线贯穿 / echo 对侧扇区各打一发
  chain_lightning: { name: "连锁闪电", damage: 12, cdMul: 1.30, kind: "chain", jumps: 2, jumpRadius: 88, decay: 0.7 },
  pierce_lance:    { name: "穿刺之矛", damage: 15, cdMul: 1.35, kind: "pierce", width: 28, length: 420 },
  echo_sigil:      { name: "回声符文", damage: 11, cdMul: 1.30, kind: "echo" },
  ember_fan:       { name: "余烬扇",   damage: 10, cdMul: 1.15, kind: "fan3", slow: 0.25, slowMs: 1200 },
  quake_maw:       { name: "地裂之颚", damage: 14, cdMul: 1.40, kind: "area", radius: 80, rootMs: 600 },
  soul_lance:      { name: "噬魂箭",   damage: 15, cdMul: 1.20, kind: "single", heal: 3 },
  aegis_ring:      { name: "圣环",     damage: 8,  cdMul: 1.35, kind: "ward", shield: 10, shieldCap: 36, radius: 55 },
  meteor_judgment: { name: "陨星裁决", damage: 26, cdMul: 1.60, kind: "area", radius: 95, innerRadius: 40, innerMul: 0.6 },

  // —— 第三批：元素学派与终极法术 ——
  // 新机制：nova 以玩家为中心的环形爆发；castMs 前摇（落点先亮预警圈再结算）
  frost_nova:      { name: "霜华新星", damage: 13, cdMul: 1.30, kind: "nova", radius: 90, slow: 0.45, slowMs: 2000, castMs: 600 },
  thunder_storm:   { name: "雷霆风暴", damage: 16, cdMul: 1.50, kind: "area", radius: 110, freezeMs: 200, castMs: 400 },
  sunflare:        { name: "日轮耀斑", damage: 20, cdMul: 1.45, kind: "pierce", width: 34, length: 460, castMs: 700 },
  void_lance:      { name: "虚空之矛", damage: 18, cdMul: 1.35, kind: "pierce", width: 22, length: 520 },
  sanctum:         { name: "圣所",     damage: 6,  cdMul: 1.20, kind: "ward", shield: 12, shieldCap: 44, radius: 70 },
  bramble_maul:    { name: "荆棘巨槌", damage: 17, cdMul: 1.40, kind: "area", radius: 60, rootMs: 1500, castMs: 350 },
  soul_echo:       { name: "魂灵回声", damage: 12, cdMul: 1.25, kind: "echo", heal: 2 },
  glacier:         { name: "冰川裂谷", damage: 15, cdMul: 1.45, kind: "pierce", width: 40, length: 380, slow: 0.5, slowMs: 2200, castMs: 450 },
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

