// Boss 阶段战参数与七场专属大招（纯数据，零 Phaser / 零 DOM / 零 Math.random）。
//
// 为什么单独一个文件而不并进 boss.js：src/logic/boss.js 的旧分支
// （model.phase === undefined，即不传 ctx 的老调用方）根本不读这些值，
// 阶段参数集中在这里才能保证「旧路径零漂移」——调数值不会顺手改坏
// 旧分支里 600ms 的硬编码预警，也不会让 tests/boss.test.js 的七场弹数变红。
//
// 纪律：非法场号/阶段号一律回退默认值，绝不抛错（战斗循环里扔异常会直接把一帧打成黑屏）。

// 三阶段循环参数。phase 0/1/2 对应 spec §4.1 表格里的阶段 1/2/3
// （血量区间 100%~66% / 66%~33% / 33%~0%）。
// attackMul 只作用在出手间隔上：阶段越靠后攻击越密，但单发伤害不变
// （伤害成长靠 BOSS_HP 与破防窗口，不靠阶段倍率，避免后期一发秒人）。
export const BOSS_PHASES = Object.freeze([
  Object.freeze({ phase: 0, attackMul: 1.0, windupMs: 600, countMul: 1.0, speedMul: 1.0, ultEveryMs: 12000 }),
  Object.freeze({ phase: 1, attackMul: 0.82, windupMs: 540, countMul: 1.25, speedMul: 1.08, ultEveryMs: 10000 }),
  Object.freeze({ phase: 2, attackMul: 0.68, windupMs: 480, countMul: 1.5, speedMul: 1.15, ultEveryMs: 8000 }),
]);
export const PHASE_COUNT = BOSS_PHASES.length;

// 破防窗口（spec §4.3）：大招落地后 Boss 临时归零装甲、受伤 ×1.2，
// 给玩家一轮三技能爆发的输出窗口。只要 1200ms / ×1.2，是因为再高就成了
// 「等破防 → 三技能 = 秒杀」，Boss 会被做成答题机。
export const BREAK_WINDOW_MS = 1200;
export const BREAK_DAMAGE_MUL = 1.2;

// 狂暴：残血再叠一层出手频率（与阶段倍率相乘，不取最大值，否则阶段 3 的狂暴形同虚设）。
export const ENRAGE_HP_RATIO = 0.2;
export const ENRAGE_ATTACK_MUL = 0.8;

// 转阶段演出：shiftLeft > 0 期间冻结一切出手，且一次最多推一格阶段
// （一击从 100% 打到 20% 也先演阶段 2，不允许两段演出叠在同一帧）。
export const PHASE_SHIFT_MS = 900;
export const PHASE_THRESHOLDS = Object.freeze([0.66, 0.33]);

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

export function bossPhaseFor(phase) {
  const i = Number.isInteger(phase) && phase >= 0 && phase < PHASE_COUNT ? phase : 0;
  return BOSS_PHASES[i];
}
