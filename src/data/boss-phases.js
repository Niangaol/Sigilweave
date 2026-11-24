// Boss 阶段战参数与七场专属大招（纯数据，零 Phaser / 零 DOM / 零 Math.random）。
//
// 为什么单独一个文件而不并进 boss.js：src/logic/boss.js 的旧分支
// （model.phase === undefined，即不传 ctx 的老调用方）根本不读这些值，
// 阶段参数集中在这里才能保证「旧路径零漂移」——调数值不会顺手改坏
// 旧分支里 600ms 的硬编码预警，也不会让 tests/boss.test.js 的七场弹数变红。
//
// 纪律：非法场号/阶段号一律回退默认值，绝不抛错（战斗循环里扔异常会直接把一帧打成黑屏）。

// 两阶段参数：一管血 = 一个阶段。phase 0 是第一条血（100%），
// 打空后回满进入 phase 1（第二条血）。不再按血量比例切段——
// 玩家看到的是「血条打空 → 它站起来、血条回满、换成另一套招」。
// attackMul 只作用在出手间隔上：阶段越靠后攻击越密，但单发伤害不变
// （伤害成长靠 BOSS_HP 与破防窗口，不靠阶段倍率，避免后期一发秒人）。
export const BOSS_PHASES = Object.freeze([
  Object.freeze({ phase: 0, attackMul: 1.0, windupMs: 600, countMul: 1.0, speedMul: 1.0, ultEveryMs: 12000 }),
  Object.freeze({ phase: 1, attackMul: 0.78, windupMs: 520, countMul: 1.3, speedMul: 1.12, ultEveryMs: 9000 }),
]);
export const PHASE_COUNT = BOSS_PHASES.length;
// 每条血 = 一个阶段。所有 Boss（含小 Boss）都是 2 管。
export const BOSS_BARS = PHASE_COUNT;

// 破防窗口（spec §4.3）：大招落地后 Boss 临时归零装甲、受伤 ×1.2，
// 给玩家一轮三技能爆发的输出窗口。只要 1200ms / ×1.2，是因为再高就成了
// 「等破防 → 三技能 = 秒杀」，Boss 会被做成答题机。
export const BREAK_WINDOW_MS = 1200;
export const BREAK_DAMAGE_MUL = 1.2;

// 狂暴：残血再叠一层出手频率（与阶段倍率相乘，不取最大值，否则阶段 3 的狂暴形同虚设）。
export const ENRAGE_HP_RATIO = 0.2;
export const ENRAGE_ATTACK_MUL = 0.8;

// 转阶段演出：shiftLeft > 0 期间冻结一切出手。多管血下阶段由「打空一管」触发，
// 不再按血量比例自动推进，因此也不存在「一击跨两段」的问题。
export const PHASE_SHIFT_MS = 900;

// 第二条血（阶段 2）的普通弹幕：每场换一套弹型，让「换阶段」在画面上立刻可读。
// 键与 BOSS_PATTERNS 相同（场号 1..7）；字段含义完全一致，只是数值与形状不同。
export const BOSS_PATTERNS_P2 = Object.freeze({
  1: Object.freeze({ name: '崩石环阵', count: 10, ring: true, speed: 46, damage: 11 }),
  2: Object.freeze({ name: '尸潮扇幕', count: 9, spread: 0.9, speed: 58, damage: 11 }),
  3: Object.freeze({ name: '虚空九线', count: 9, spread: 0.7, speed: 84, damage: 12 }),
  4: Object.freeze({ name: '书页环雨', count: 12, ring: true, speed: 52, damage: 11 }),
  5: Object.freeze({ name: '天平扇裁', count: 7, spread: 0.55, speed: 66, damage: 12 }),
  6: Object.freeze({ name: '熔火环爆', count: 14, ring: true, speed: 60, damage: 12 }),
  7: Object.freeze({ name: '终星扇环', count: 11, spread: 0.8, speed: 90, damage: 13 }),
});

// 阶段 2 的外观与横幅：每场一个名字 + 主色。场景层据此做转阶段横幅与光环，
// 实体层据此给立绘染一层常驻色偏。颜色沿用 Palette 的十六进制值（数据层不 import UI）。
export const BOSS_PHASE_STYLE = Object.freeze({
  1: Object.freeze({ name: '石心怒醒', color: 0xc9b98c }),
  2: Object.freeze({ name: '尸潮狂涌', color: 0x86a06b }),
  3: Object.freeze({ name: '虚蚀降临', color: 0x9a7bff }),
  4: Object.freeze({ name: '书焚之页', color: 0xdcc9a0 }),
  5: Object.freeze({ name: '天平倾覆', color: 0xf0c75a }),
  6: Object.freeze({ name: '熔炉沸腾', color: 0xff8a55 }),
  7: Object.freeze({ name: '终星燃尽', color: 0xff6b88 }),
});

// 七场专属大招（spec §4.2）。speed / damage 由本表提供，boss.js 不自己编数值。
// waves = 本次大招合成几拨弹型；spec 里场 2 的「双波间隔 200ms」在纯逻辑层
// 合并为同帧齐射（波间调度需要 model 增加波次字段，超出 B3 白名单），
// 间隔演出由场景层承担，故本表不放 waveGapMs 这种纯逻辑层读不到的死数据。
// 环形弹用 kind:'orb'（体积大，整圈看得清），直线/扇形用 'bolt'，追踪用 'homing'。
export const BOSS_ULTIMATES = Object.freeze({
  // 场 1 石像崩落：整圈 12 发，无附带硬控
  1: Object.freeze({ name: '石像崩落', kind: 'ring', chargeMs: 1200, waves: 1, ringCount: 12, speed: 62, damage: 13, color: 0xb9a98c }),
  // 场 2 尸潮回响：整圈 16 发
  2: Object.freeze({ name: '尸潮回响', kind: 'ring', chargeMs: 1200, waves: 2, ringCount: 16, speed: 54, damage: 12, color: 0x86a06b }),
  // 场 3 虚空裂口：3 条直线、相邻间隔 120°，以玩家方向居中
  3: Object.freeze({ name: '虚空裂口', kind: 'lance', chargeMs: 1200, waves: 1, lanceCount: 3, lanceGapDeg: 120, speed: 110, damage: 14, color: 0x7a6bd8 }),
  // 场 4 书页暴雨：整圈 10 发 + 朝玩家 5 发扇形
  4: Object.freeze({ name: '书页暴雨', kind: 'mix', chargeMs: 1200, waves: 2, ringCount: 10, fanCount: 5, fanSpread: 0.5, speed: 66, damage: 12, color: 0xdcc9a0 }),
  // 场 5 天平裁决：1 条超宽直线（半径放到 20px，等效 spec 的「宽度 40px」）+ 追踪 3 发
  5: Object.freeze({ name: '天平裁决', kind: 'lance', chargeMs: 1200, waves: 2, lanceCount: 1, lanceRadius: 20, homingCount: 3, speed: 96, damage: 14, color: 0xd8b24a }),
  // 场 6 熔炉倾覆：整圈 20 发
  6: Object.freeze({ name: '熔炉倾覆', kind: 'ring', chargeMs: 1200, waves: 1, ringCount: 20, speed: 72, damage: 13, color: 0xff7a45 }),
  // 场 7 终星陨落：整圈 16 发 + 追踪 4 发 + 2 条直线（相邻 90°，夹住玩家走位）
  7: Object.freeze({ name: '终星陨落', kind: 'mix', chargeMs: 1200, waves: 3, ringCount: 16, homingCount: 4, lanceCount: 2, lanceGapDeg: 90, speed: 104, damage: 15, color: 0xff5c7a }),
});

// 大招命中挂的控制（spec §4.2）：不走 ENEMY_CONTROL（那是杂兵表），
// 由 BattleScene 在命中时按来源分流，且命中 Boss 弹时跳过全场兜底迟滞，
// 免得「慢 + 定身 + 无敌帧」连环控。字段形状与 src/data/control.js 的约定一致。
export const BOSS_CONTROLS = Object.freeze({
  1: null,
  2: null,
  3: Object.freeze({ kind: 'slow', ms: 1000, factor: 0.6 }),
  4: Object.freeze({ kind: 'slow', ms: 1200, factor: 0.55 }),
  5: Object.freeze({ kind: 'root', ms: 800 }),
  6: Object.freeze({ kind: 'knock', ms: 240, force: 90 }),
  7: Object.freeze({ kind: 'stun', ms: 700 }),
});

// 场号守卫：与 src/logic/acts.js 的 isValidStage 同规则（1..7 整数）。
// 数据层不反向 import 逻辑层，否则形成「数据 → 逻辑」的倒挂依赖；
// 真需要跨层共享时应该把常量下沉，而不是让数据文件去 import 逻辑文件。
const ULTIMATE_STAGES = Object.keys(BOSS_ULTIMATES).map(Number);
const STAGE_MIN = Math.min(...ULTIMATE_STAGES);
const STAGE_MAX = Math.max(...ULTIMATE_STAGES);

function stageOf(stage) {
  return Number.isInteger(stage) && stage >= STAGE_MIN && stage <= STAGE_MAX ? stage : STAGE_MIN;
}

export function bossUltimateFor(stage) {
  return BOSS_ULTIMATES[stageOf(stage)];
}

export function bossControlFor(stage) {
  return BOSS_CONTROLS[stageOf(stage)] ?? null;
}

export function bossPattern2For(stage) {
  return BOSS_PATTERNS_P2[stageOf(stage)] ?? BOSS_PATTERNS_P2[STAGE_MIN];
}

export function bossPhaseStyleFor(stage) {
  return BOSS_PHASE_STYLE[stageOf(stage)] ?? BOSS_PHASE_STYLE[STAGE_MIN];
}

export function bossPhaseFor(phase) {
  const i = Number.isInteger(phase) && phase >= 0 && phase < PHASE_COUNT ? phase : 0;
  return BOSS_PHASES[i];
}
