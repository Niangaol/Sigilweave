// Boss 基础行为：纯模拟时钟、600ms预警、固定瞄准后发射；UI与命中由战斗层处理。
// 三位 Boss 使用不同弹幕模板：一扇形、二环形、三宽扇高速
export const BOSS_PATTERNS = Object.freeze({
  1: { name: '扇形五连', count: 5, spread: 0.42, speed: 53, damage: 8 },
  2: { name: '环封八向', count: 8, ring: true, speed: 38, damage: 7 },
  3: { name: '裂空七线', count: 7, spread: 0.62, speed: 69, damage: 8 },
});

export function bossPattern(act) {
  return BOSS_PATTERNS[act] ?? BOSS_PATTERNS[1];
}

export function createBossModel(act = 1) {
  if (!Number.isInteger(act) || act < 1 || act > 3) throw new RangeError('Boss幕数无效');
  return { act, attackIn: 1200, windupLeft: 0, aim: null, shots: 0 };
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

// 通关收据独立于普通伤害/掉落链，一幕只奖励一次。
export function resolveBossOnce(run, act, bossId, method, tier = 'major') {
  if (!run || typeof run !== 'object' || Array.isArray(run) || (run.act !== undefined && run.act !== act) || !Number.isInteger(act) || act < 1 || act > 3 || typeof bossId !== 'string' || !bossId
    || !['quiz', 'combat'].includes(method) || !['major', 'mini'].includes(tier)) return { ok: false, reward: 0 };
  if (run.bossResolutions !== undefined && (run.bossResolutions === null || typeof run.bossResolutions !== 'object' || Array.isArray(run.bossResolutions))) return { ok: false, reward: 0 };
  run.bossResolutions ??= {};
  run.miniBossResolutions ??= {};
  // 大Boss按幕记账（通幕依据）；小Boss按bossId记账（每局每只一次）
  const reward = tier === 'mini' ? 6 : 12;
  if (tier === 'major') {
    if (Object.hasOwn(run.bossResolutions, act)) return { ok: false, reward: 0 };
    const receipt = { act, bossId, method, tier, reward };
    run.bossResolutions[act] = receipt;
    return { ok: true, reward, receipt: { ...receipt } };
  }
  if (Object.hasOwn(run.miniBossResolutions, bossId)) return { ok: false, reward: 0 };
  const receipt = { act, bossId, method, tier, reward };
  run.miniBossResolutions[bossId] = receipt;
  return { ok: true, reward, receipt: { ...receipt } };
}
