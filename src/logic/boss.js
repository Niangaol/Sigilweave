// Boss 基础行为：纯模拟时钟、600ms预警、固定瞄准后发射；UI与命中由战斗层处理。
// 七位 Boss 使用不同弹幕模板：一扇形、二环形、三宽扇高速；四起是后四场的专属弹幕。
// 模板号 = 场号（1..7），场与旧七幕美术一一对应，弹幕表本身不随幕合并而改。
import { isValidStage } from './acts.js';
export const BOSS_PATTERNS = Object.freeze({
  1: { name: '扇形五连', count: 5, spread: 0.42, speed: 53, damage: 11 },
  2: { name: '环封八向', count: 8, ring: true, speed: 38, damage: 10 },
  3: { name: '裂空七线', count: 7, spread: 0.62, speed: 69, damage: 11 },
  4: { name: '书页扇幕', count: 6, spread: 0.5, speed: 56, damage: 11 },
  5: { name: '天平十向', count: 10, ring: true, speed: 42, damage: 10 },
  6: { name: '熔火三叉', count: 3, spread: 0.5, speed: 74, damage: 12 },
  7: { name: '终星九线', count: 9, spread: 0.7, speed: 78, damage: 12 },
});

// Boss 血量与专属减伤：小 Boss（tier 'mini'）130 + 65×场；场 Boss（major）再 ×1.35。
// 减伤走敌人 armor 通道（applyDamage 按 1-armor 结算）：小 Boss 25%，场 Boss 30%。
export const BOSS_HP = Object.freeze({ base: 170, perStage: 85, majorMul: 1.45 });
export const BOSS_ARMOR = Object.freeze({ mini: 0.25, major: 0.30 });

export function bossStats(stage, tier = 'major') {
  const s = isValidStage(stage) ? stage : 1;
  const isMini = tier === 'mini';
  const base = BOSS_HP.base + BOSS_HP.perStage * s;
  return {
    hp: Math.round(isMini ? base : base * BOSS_HP.majorMul),
    armor: isMini ? BOSS_ARMOR.mini : BOSS_ARMOR.major,
  };
}

export function bossPattern(act) {
  return BOSS_PATTERNS[act] ?? BOSS_PATTERNS[1];
}

export function createBossModel(stage = 1) {
  if (!isValidStage(stage)) throw new RangeError('Boss场号无效');
  return { act: stage, attackIn: 1200, windupLeft: 0, aim: null, shots: 0 };
}
export function stepBoss(model, dtMs, position, target) {
  if (!Number.isFinite(dtMs) || dtMs < 0) return [];
  if (model.windupLeft > 0) {
    model.windupLeft = Math.max(0, model.windupLeft - dtMs);
    if (model.windupLeft > 0) return [];
    const angle = Math.atan2(model.aim.y - position.y, model.aim.x - position.x);
    const pattern = bossPattern(model.act);
    model.attackIn = Math.max(1000, 2200 - model.act * 200);
    model.shots++;
    const offsets = pattern.ring
      ? Array.from({ length: pattern.count }, (_, i) => (i / pattern.count) * Math.PI * 2)
      : Array.from({ length: pattern.count }, (_, i) => (i - (pattern.count - 1) / 2) * (pattern.spread / ((pattern.count - 1) / 2 || 1)));
    return offsets.map(offset => ({
      x: position.x, y: position.y,
      vx: Math.cos(angle + offset) * pattern.speed,
      vy: Math.sin(angle + offset) * pattern.speed,
      damage: pattern.damage, lifeMs: 6000,
    }));
  }
  model.attackIn -= dtMs;
  if (model.attackIn <= 0) {
    model.aim = { x: target.x, y: target.y };
    model.windupLeft = 600;
  }
  return [];
}

// 通关收据独立于普通伤害/掉落链。
// 大 Boss 按「场」记账 → run.bossResolutions[stage]，七场 = 七契，通幕判定读它；
// 小 Boss 按 bossId 记账 → run.miniBossResolutions[bossId]，每局每只只记一次。
export function resolveBossOnce(run, stage, bossId, method, tier = 'major') {
  const validTier = tier === 'major' || tier === 'mini';
  if (!run || typeof run !== 'object' || Array.isArray(run)
    || !isValidStage(stage)
    || (run.stage !== undefined && run.stage !== stage)
    || typeof bossId !== 'string' || !bossId
    || !['quiz', 'combat'].includes(method) || !validTier) return { ok: false, reward: 0 };
  for (const key of ['bossResolutions', 'miniBossResolutions']) {
    const ledger = run[key];
    if (ledger !== undefined && (ledger === null || typeof ledger !== 'object' || Array.isArray(ledger))) return { ok: false, reward: 0 };
  }
  const reward = tier === 'mini' ? 6 : 12;
  if (tier === 'major') {
    run.bossResolutions ??= {};
    if (Object.hasOwn(run.bossResolutions, stage)) return { ok: false, reward: 0 };
    const receipt = { stage, bossId, method, tier, reward };
    run.bossResolutions[stage] = receipt;
    return { ok: true, reward, receipt: { ...receipt } };
  }
  run.miniBossResolutions ??= {};
  if (Object.hasOwn(run.miniBossResolutions, bossId)) return { ok: false, reward: 0 };
  const receipt = { stage, bossId, method, tier, reward };
  run.miniBossResolutions[bossId] = receipt;
  return { ok: true, reward, receipt: { ...receipt } };
}
