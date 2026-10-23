// Boss 基础行为：纯模拟时钟、600ms预警、固定瞄准后发射；UI与命中由战斗层处理。
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
    model.attackIn = Math.max(1000, 2200 - model.act * 200);
    model.shots++;
    return [-0.42, -0.21, 0, 0.21, 0.42].map(offset => ({
      x: position.x, y: position.y, vx: Math.cos(angle + offset) * (45 + model.act * 8),
      vy: Math.sin(angle + offset) * (45 + model.act * 8), damage: 8, lifeMs: 6000,
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
export function resolveBossOnce(run, act, bossId, method) {
  if (!run || typeof run !== 'object' || Array.isArray(run) || (run.act !== undefined && run.act !== act) || !Number.isInteger(act) || act < 1 || act > 3 || typeof bossId !== 'string' || !bossId
    || !['quiz', 'combat'].includes(method)) return { ok: false, reward: 0 };
  if (run.bossResolutions !== undefined && (run.bossResolutions === null || typeof run.bossResolutions !== 'object' || Array.isArray(run.bossResolutions))) return { ok: false, reward: 0 };
  run.bossResolutions ??= {};
  if (Object.hasOwn(run.bossResolutions, act)) return { ok: false, reward: 0 };
  const receipt = { act, bossId, method, reward: 12 };
  run.bossResolutions[act] = receipt;
  return { ok: true, reward: receipt.reward, receipt: { ...receipt } };
}
