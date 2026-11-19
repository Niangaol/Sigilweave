// 敌人行为数值表：移动规则、近战/远程攻击表、行为注册表。
// 从 logic/enemy-ai.js 迁出（2026-11-19 架构重构波 4）。纯数据层，不 import logic / Phaser。
// AI_PROFILE 的 tune 直接引用上面的规则常量（引用相等，数值零漂移）。
export const DEFAULT_BATTLE = Object.freeze({ left: 10, right: 470, top: 26, bottom: 262 });

// 噬魂蝠：沿锁定方向前进，同时做左右正弦摆动（垂直偏移 = 振幅 × sin）
export const BAT_RULE = Object.freeze({ amplitude: 14, periodMs: 900 });

// 邪教徒：保持距离环绕；每 2.2s 一次 700ms 预警，预警结束发射一枚慢弹
export const CULTIST_RULE = Object.freeze({
  holdDist: 70,
  retreatDist: 46,
  attackMs: 2200,
  windupMs: 700,
  shotSpeed: 85,
  shotLifeMs: 4200,
});

// 亡灵骑士：每 2.6s 一次 600ms 预警，然后以 3.2 倍步行速度直线冲锋，最多 1.2s
export const KNIGHT_RULE = Object.freeze({
  intervalMs: 2600,
  windupMs: 600,
  chargeMs: 1200,
  chargeSpeedMul: 3.2,
});

// 缝合尸魁（二幕精英）：慢速接近，贴身后每 0.8s 践踏一次；本层只产出事件与计时
export const STITCH_RULE = Object.freeze({ stompDist: 26, stompMs: 800 });

// 咒誓主教（三幕精英）：保持约 110px，每 4.2s 瞬移到玩家侧翼，停顿 0.5s 后 0.15s 间隔三连弹
export const OATH_RULE = Object.freeze({
  holdDist: 110,
  blinkMs: 4200,
  pauseMs: 500,
  burstShots: 3,
  burstGapMs: 150,
  shotSpeed: 150,
  shotLifeMs: 3200,
});

// 晶棘树妖：保持 92px，每 3s 蓄力 650ms，然后扇形三连弹。
export const VOLLEY_RULE = Object.freeze({
  holdDist: 92,
  retreatDist: 56,
  attackMs: 3000,
  windupMs: 650,
  shots: 3,
  spreadRad: 0.3,
  shotSpeed: 92,
  shotLifeMs: 3600,
});

// 虚空符灵：保持 86px，每 3.6s 瞬移侧翼，停顿 480ms 后两连弹。
export const PHASE_RULE = Object.freeze({
  holdDist: 86,
  blinkMs: 3600,
  pauseMs: 480,
  burstShots: 2,
  burstGapMs: 170,
  shotSpeed: 115,
  shotLifeMs: 3200,
});

// 四幕精英：索引猎犬。长蓄力后高速扑咬，冲锋期接触伤害翻倍。
export const LUNGE_RULE = Object.freeze({ intervalMs: 3200, windupMs: 700, chargeMs: 900, chargeSpeedMul: 4.2 });
// 六幕精英：铁砧暴君。贴近 58px 后蓄力砸地，大范围震荡。
export const SLAM_RULE = Object.freeze({ slamDist: 58, windupMs: 650, cooldownMs: 1500, radius: 46, damageMul: 2.0 });
// 五幕精英：天平裁决者。保持 130px，蓄力后打一发慢速重判词弹。
export const JUDGE_RULE = Object.freeze({ holdDist: 130, retreatDist: 90, attackMs: 3600, windupMs: 850, shotSpeed: 72, shotLifeMs: 4200, damageMul: 1.6 });
// 七幕精英：蚀日祭司。保持 100px，蓄力后打八向星环。
export const ECLIPSE_RULE = Object.freeze({ holdDist: 100, retreatDist: 64, attackMs: 4800, windupMs: 700, shots: 8, shotSpeed: 55, shotLifeMs: 3600 });

// ---------- 2026-11 新行为规则（数值来自设计契约 §5.2，逐字使用） ----------
// 腐尸：踱步 → 停顿 → 预警 → 扑咬 → 收势。真步幅只有名义速度的一小半，靠扑咬制造威胁。
export const LURCH_RULE = Object.freeze({
  walkMs: 520, holdMs: 260, triggerDist: 40,
  windupMs: 450, lungeMs: 320, lungeMul: 1.5, recoverMs: 800,
});
// 齿轮傀儡：上弦走位 → 预警 → 弹射冲刺（不算 charging，不吃 ×2.5 接触伤害）。
export const SPRING_RULE = Object.freeze({ walkMs: 700, windupMs: 420, dashMs: 600, dashMul: 1.9, recoverMs: 500 });
// 纸页傀儡：慢速前压，每 3s 举盾 900ms；举盾时移速 ×0.4、armor 由 Enemy 置 0.55。
export const BULWARK_RULE = Object.freeze({ approachMul: 0.85, guardEveryMs: 3000, guardMs: 900, guardArmor: 0.55, guardSlowMul: 0.4 });
// 炉渣兽：进入 64px 后 700ms 预警，砸出 40px 半径熔岩圈（伤害 ×1.6），后摇 1.4s。
export const ERUPTION_RULE = Object.freeze({
  triggerDist: 64, intervalMs: 3800, windupMs: 700,
  stompRadius: 40, stompDamageMul: 1.6, cooldownMs: 1400,
});
// 枷锁守卫：环带 110px，每 3.2s 预警 1s，然后 110ms 间隔两连枷锁弹。
export const CHAIN_RULE = Object.freeze({
  holdDist: 110, retreatDist: 80, intervalMs: 3200, windupMs: 1000,
  shots: 2, gapMs: 110, shotSpeed: 120, shotLifeMs: 1600, damageMul: 1.1,
});
// 符纹蛛：直线猛窜 380ms → 侧移 160ms（单次侧移不超过 40px），交替往复。
export const SKITTER_RULE = Object.freeze({ straightMs: 380, lateralMs: 160, straightMul: 1.7, lateralMul: 1.3, lateralDist: 40 });
// 幽誓女妖：环带 120px 慢绕，每 3s 预警 0.5s，然后 2.1 倍速突进 0.55s，回收 0.9s。
export const STALK_RULE = Object.freeze({ holdDist: 120, orbitMul: 0.5, intervalMs: 3000, windupMs: 500, dashMs: 550, dashMul: 2.1, recoverMs: 900 });
// 墨灵：慢速游走，每 1.6s 瞬移 40~60px，且与玩家保持 ≥26px。
export const DRIFT_RULE = Object.freeze({ approachMul: 0.7, blinkEveryMs: 1600, blinkMin: 40, blinkMax: 60, minPlayerDist: 26 });
// 判词幽灵：环带 130px，每 3s 预警 0.75s，然后打一发 140 速快弹（伤害 ×1.4）。
export const LANCE_RULE = Object.freeze({ holdDist: 130, retreatDist: 96, intervalMs: 3000, windupMs: 750, shotSpeed: 140, shotLifeMs: 1100, damageMul: 1.4 });
// 晓色之影：环带 90px，每 2s 沿玩家上一段位移方向冲刺 0.42s（1.7 倍速）。
export const MIRROR_RULE = Object.freeze({ holdDist: 90, dashMs: 420, dashMul: 1.7, cooldownMs: 2000 });
// 火星精：280ms 2 倍速冲刺 → 260ms 停顿，脉冲式贴脸。
export const DART_RULE = Object.freeze({ sprintMs: 280, sprintMul: 2.0, pauseMs: 260 });
// 熔岩石像鬼：每 3.4s 预警 0.9s → 2.6 倍速冲锋 0.9s → 500ms 硬直（速度 0）。
export const SLAM_CHARGE_RULE = Object.freeze({ intervalMs: 3400, windupMs: 900, chargeMs: 900, chargeMul: 2.6, staggerMs: 500 });
// 黄铜守誓者：每 3s 一套两段冲锋（0.8s @2.4 → 0.32s 停顿 → 0.7s @2.4），后摇 2.4s。
export const DOUBLE_CHARGE_RULE = Object.freeze({
  intervalMs: 3000, windupMs: 650, chargeMs: 800, chargeMul: 2.4,
  pauseMs: 320, secondChargeMs: 700, secondMul: 2.4, cooldownMs: 2400,
});
// 星屑骑士：每 3s 预警 0.65s → 2.9 倍速冲锋 1s → 结束瞬间朝四个正向各射 1 弹，后摇 2.6s。
export const CHARGE_VOLLEY_RULE = Object.freeze({
  intervalMs: 3000, windupMs: 650, chargeMs: 1000, chargeMul: 2.9,
  shots: 4, shotSpeed: 76, shotLifeMs: 2000, damageMul: 1.2, cooldownMs: 2600,
});

// ---------- 2026-11-17 敌人攻击重做（spec: docs/superpowers/specs/2026-11-17-enemy-attacks-design.md） ----------
// 设计：移动/走位仍由上面的 behavior 负责；攻击是挂在 defId 上的「事件层」。
// 之所以不复用 tune：tune 的数值被 §5.2 契约测试逐字锁死（移动节拍），
// 而本轮 §3/§4 给了新的攻击时序；两者分开，避免为了攻击去改移动手感。

const DEG = Math.PI / 180;

// §3 近战表：10 只普通怪。range = 扇形半径，arc = 总张角（弧度），
// 触发条件是「距离 ≤ range + 4 且冷却就绪且当前处于可出手状态」。
// 伤害取 opts.damage（与接触伤害同源），不额外乘倍率。
export const MELEE_RULES = Object.freeze({
  skeleton: Object.freeze({ windupMs: 420, cooldownMs: 1800, range: 30, arc: 100 * DEG, kind: 'bone_slash' }),
  bat: Object.freeze({ windupMs: 260, cooldownMs: 1500, range: 22, arc: 120 * DEG, kind: 'dive_peck' }),
  corpse: Object.freeze({ windupMs: 520, cooldownMs: 2000, range: 26, arc: 70 * DEG, kind: 'bite' }),
  rune_spider: Object.freeze({ windupMs: 300, cooldownMs: 1400, range: 24, arc: 80 * DEG, kind: 'pounce' }),
  clockwork_doll: Object.freeze({ windupMs: 380, cooldownMs: 1800, range: 30, arc: 60 * DEG, kind: 'piston_punch' }),
  wraith: Object.freeze({ windupMs: 400, cooldownMs: 1900, range: 30, arc: 110 * DEG, kind: 'claw' }),
  ink_wisp: Object.freeze({ windupMs: 350, cooldownMs: 2000, range: 26, arc: 160 * DEG, kind: 'ink_splash' }),
  page_golem: Object.freeze({ windupMs: 620, cooldownMs: 2400, range: 36, arc: 150 * DEG, kind: 'heavy_sweep' }),
  shackle_guard: Object.freeze({ windupMs: 550, cooldownMs: 2200, range: 40, arc: 160 * DEG, kind: 'chain_sweep' }),
  slag_beast: Object.freeze({ windupMs: 480, cooldownMs: 2100, range: 30, arc: 90 * DEG, kind: 'molten_bite' }),
});

// §4 远程表：10 只远程的抬手与弹幕形状。
// - windupMs：抬手时长（抬手期间只站定，不记录玩家位置）；
// - count/spread：扇形弹数 / 总张角（弧度）；ring:true 时按 count 等分整圈；
// - forward:true 时扇形中轴取 brain.dir（冲锋方向）而不是朝玩家；
// - every/summonEvery + bonus/summonKind：轮次节拍（第 N 轮额外出一发/一个召唤物）；
// - attackMs：本身没有攻击节拍的行为（dart / mirror）的施法间隔，其余行为沿用 tune 的 attack 间隔。
export const RANGED_RULES = Object.freeze({
  cultist: Object.freeze({ windupMs: 600, count: 3, spread: 0.32, speed: 85, lifeMs: 4200, kind: 'bolt' }),
  crystal_dryad: Object.freeze({ windupMs: 650, count: 5, spread: 0.40, speed: 92, lifeMs: 3600, kind: 'bolt' }),
  void_elemental: Object.freeze({
    windupMs: 600, count: 2, gapMs: 170, speed: 115, lifeMs: 3200, kind: 'bolt',
    every: 3, bonus: 'homing',
  }),
  oath_bishop: Object.freeze({
    windupMs: 550, count: 3, gapMs: 150, speed: 150, lifeMs: 3200, kind: 'bolt',
    summonEvery: 2, summonKind: 'turret',
  }),
  verdict_wraith: Object.freeze({
    windupMs: 700, count: 1, speed: 160, lifeMs: 1100, kind: 'bolt',
    summonEvery: 3, summonKind: 'rune',
  }),
  scale_arbiter: Object.freeze({
    windupMs: 850, count: 1, speed: 72, lifeMs: 4200, kind: 'orb', damageMul: 1.6,
    summonEvery: 2, summonKind: 'rune',
  }),
  ember_imp: Object.freeze({ windupMs: 400, count: 3, spread: 0.30, speed: 120, lifeMs: 2400, kind: 'bolt', attackMs: 2600 }),
  dawn_shade: Object.freeze({ windupMs: 650, count: 1, speed: 46, lifeMs: 4200, kind: 'homing', attackMs: 3000 }),
  eclipse_priest: Object.freeze({
    windupMs: 700, count: 8, ring: true, speed: 55, lifeMs: 3600, kind: 'bolt',
    summonEvery: 2, summonKind: 'turret',
  }),
  stardust_knight: Object.freeze({ windupMs: 300, count: 4, spread: 0.5, speed: 76, lifeMs: 2000, kind: 'bolt', forward: true }),
});

// 召唤物存续时长（§5 表）；各自的上限由场景侧跨列表统计，本层不做限流。
export const TURRET_LIFE_MS = 5000;
export const RUNE_LIFE_MS = 1200;

// 腐尸收势阶段保留的惯性比例（0 = 完全站定）。契约只给了 recoverMs，这里用少量前蹭，
// 让 3s 平均位移落在 0.45~0.6 倍，同时保持「慢而厚」的手感（见 T5 报告）。
export const LURCH_MOMENTUM = 0.3;
// 环带/位移用的兜底轨道方向；有 orbitDir 的行为在 createBrain 里随机化
export const EMPTY_TUNE = Object.freeze({});

// ---------- 行为注册表（单一事实源） ----------
// 旧行为的 tune 直接指向旧规则常量（引用相等，数值零漂移）；新行为使用上面的新常量。
export const AI_PROFILE = Object.freeze({
  skeleton: { behavior: 'march', tune: EMPTY_TUNE, melee: MELEE_RULES.skeleton },
  bat: { behavior: 'weave', tune: BAT_RULE, melee: MELEE_RULES.bat },
  corpse: { behavior: 'lurch', tune: LURCH_RULE, melee: MELEE_RULES.corpse },
  cultist: { behavior: 'orbit', tune: CULTIST_RULE, ranged: RANGED_RULES.cultist },
  knight: { behavior: 'charge', tune: KNIGHT_RULE },
  rune_spider: { behavior: 'skitter', tune: SKITTER_RULE, melee: MELEE_RULES.rune_spider },
  stone_gargoyle: { behavior: 'slam_charge', tune: SLAM_CHARGE_RULE },
  crystal_dryad: { behavior: 'volley', tune: VOLLEY_RULE, ranged: RANGED_RULES.crystal_dryad },
  clockwork_doll: { behavior: 'spring', tune: SPRING_RULE, melee: MELEE_RULES.clockwork_doll },
  void_elemental: { behavior: 'phase', tune: PHASE_RULE, ranged: RANGED_RULES.void_elemental },
  wraith: { behavior: 'stalk', tune: STALK_RULE, melee: MELEE_RULES.wraith },
  brass_warden: { behavior: 'double_charge', tune: DOUBLE_CHARGE_RULE },
  stitch_abomination: { behavior: 'stomp', tune: STITCH_RULE },
  oath_bishop: { behavior: 'blink_caster', tune: OATH_RULE, ranged: RANGED_RULES.oath_bishop },
  ink_wisp: { behavior: 'drift', tune: DRIFT_RULE, melee: MELEE_RULES.ink_wisp },
  page_golem: { behavior: 'bulwark', tune: BULWARK_RULE, melee: MELEE_RULES.page_golem },
  index_hound: { behavior: 'lunge', tune: LUNGE_RULE },
  verdict_wraith: { behavior: 'lance', tune: LANCE_RULE, ranged: RANGED_RULES.verdict_wraith },
  shackle_guard: { behavior: 'chain', tune: CHAIN_RULE, melee: MELEE_RULES.shackle_guard },
  scale_arbiter: { behavior: 'judge', tune: JUDGE_RULE, ranged: RANGED_RULES.scale_arbiter },
  slag_beast: { behavior: 'eruption', tune: ERUPTION_RULE, melee: MELEE_RULES.slag_beast },
  ember_imp: { behavior: 'dart', tune: DART_RULE, ranged: RANGED_RULES.ember_imp },
  anvil_tyrant: { behavior: 'slam', tune: SLAM_RULE },
  dawn_shade: { behavior: 'mirror', tune: MIRROR_RULE, ranged: RANGED_RULES.dawn_shade },
  stardust_knight: { behavior: 'charge_volley', tune: CHARGE_VOLLEY_RULE, ranged: RANGED_RULES.stardust_knight },
  eclipse_priest: { behavior: 'eclipse', tune: ECLIPSE_RULE, ranged: RANGED_RULES.eclipse_priest },
});

