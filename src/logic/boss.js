// Boss 基础行为：纯模拟时钟、600ms预警、固定瞄准后发射；UI与命中由战斗层处理。
// 七位 Boss 使用不同弹幕模板：一扇形、二环形、三宽扇高速；四起是后四场的专属弹幕。
// 模板号 = 场号（1..7），场与旧七幕美术一一对应，弹幕表本身不随幕合并而改。
import { isValidStage } from './acts.js';
import {
  PHASE_SHIFT_MS,
  BREAK_WINDOW_MS,
  ENRAGE_HP_RATIO,
  ENRAGE_ATTACK_MUL,
  bossPhaseFor,
  bossPattern2For,
  bossUltimateFor,
} from '../data/boss-phases.js';
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

export function bossPattern(act, phase = 0) {
  // 阶段 2 换一套弹型（BOSS_PATTERNS_P2）：这是「换阶段」最直观的变化。
  // 旧分支永远用 phase 0，因此不传阶段时与改动前逐字一致。
  if (phase >= 1) return bossPattern2For(act);
  return BOSS_PATTERNS[act] ?? BOSS_PATTERNS[1];
}

export function createBossModel(stage = 1) {
  if (!isValidStage(stage)) throw new RangeError('Boss场号无效');
  return { act: stage, attackIn: 1200, windupLeft: 0, aim: null, shots: 0 };
}

// 阶段战入口。第五参 ctx = { hpRatio } 是总开关：不传（或 hpRatio 不是有限数）时
// 整段走旧分支，行为与改动前逐字段一致；只有带上有限 hpRatio 才启用阶段机。
// 这样拆是为了「旧路径零漂移」：旧分支里 600ms 的硬编码原地不动、根本不读
// BOSS_PHASES，tests/boss.test.js 的七场弹数用例靠的就是这条岔路。
export function stepBoss(model, dtMs, position, target, ctx = null) {
  if (!Number.isFinite(dtMs) || dtMs < 0) return [];
  const hpRatio = ctx && Number.isFinite(ctx.hpRatio) ? ctx.hpRatio : null;
  if (hpRatio === null) {
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
  return stepBossPhased(model, dtMs, position, target, hpRatio);
}

// 阶段战状态机（spec §4.1 / §4.1.1）。一帧内多件事撞车时的优先级写死在这里，
// 顺序不能调：后执行的不能覆盖先执行的，否则会出现「同帧自吞」——
// 比如转阶段和大招落地同帧时把大招吞掉、或破防窗口被阶段演出顶掉。
function stepBossPhased(model, dtMs, position, target, hpRatio) {
  // 首次进入阶段战才补字段：一路不传 ctx 的旧模型永远看不到这些键，
  // 旧调用方拿到的对象结构与改动前完全一致。
  if (model.phase === undefined) {
    model.phase = 0;
    model.mode = 'aim';
    model.modeLeft = 0;
    model.shiftLeft = 0;
    // 首次大招提前到 4 秒内起手（修复轮 Critical）：仿真实测 stage 2~7 的一战只有
    // 十余秒，若首招也按 ultEveryMs 12000/10000/8000 计时，七场里有五场玩家
    // 根本看不到大招、破防、转阶段演出与血条刻度——机制写在表里却不存在于体验。
    // min() 的另一个作用是兜底：将来若有阶段的 ultEveryMs 小于 4000，提前规则
    // 不会把间隔反而拉长。落地后仍按 cfg.ultEveryMs 循环（见 ④），不反复刷新。
    model.ultIn = Math.min(4000, bossPhaseFor(0).ultEveryMs);
  }
  const cfg = bossPhaseFor(model.phase);

  // ① 转阶段演出：冻结一切——不产弹、不推阶段、不进破防、不移动（最高优先级）。
  if (model.shiftLeft > 0) {
    model.shiftLeft = Math.max(0, model.shiftLeft - dtMs);
    return [];
  }

  // ② 破防窗口：Boss 自己在挨打，不产弹；modeLeft 归零才回 aim。
  //    窗口起点由场景层在 mode 边沿写 boss.breakUntil，这里不碰时钟字段
  //    （控制器裁定：boss.js 不新增 breakStartedAt / clock）。
  if (model.mode === 'break') {
    model.modeLeft = Math.max(0, model.modeLeft - dtMs);
    if (model.modeLeft <= 0) model.mode = 'aim';
    return [];
  }

  // ③ 阶段推进不再由本模块按血量比例自动触发：多管血下「打空一管」由
  //    Boss.enterNextBar() 显式写入 phase / shiftLeft（场景层在尸体判定前消费）。
  //    这里只负责 shiftLeft 的倒计时（见 ①），阶段一开就冻结出手。

  // ④ 大招蓄力：chargeMs 到点即落地，落地瞬间切破防。
  if (model.mode === 'ultimate') {
    model.modeLeft -= dtMs;
    if (model.modeLeft > 0) return [];
    const shots = emitUltimate(model, position, target);
    model.mode = 'break';
    model.modeLeft = BREAK_WINDOW_MS;
    model.ultIn = cfg.ultEveryMs;   // 落地才重新计时，蓄力期间不算进间隔
    return shots;
  }

  // ⑤ 正常循环（mode === 'aim'）。大招计时必须放在预警分支之前：
  //    否则正卡在预警里时 ultIn 到点会被预警分支的 return 吞掉，大招永远起不了手。
  model.ultIn -= dtMs;
  if (model.ultIn <= 0) {
    // ultKind 曾是「本场大招类型」的缓存字段，但 emitUltimate 每次都直接读
    // bossUltimateFor(model.act)，全仓没有任何地方读 model.ultKind——
    // 多一份缓存只是多一处会与真相漂移的假事实，修复轮已删除。
    const ult = bossUltimateFor(model.act);
    model.mode = 'ultimate';
    model.modeLeft = ult.chargeMs;
    // 没打完的预警作废：否则破防结束后会按大招前的陈旧瞄准位补射一发。
    model.windupLeft = 0;
    return [];
  }
  if (model.windupLeft > 0) {
    model.windupLeft = Math.max(0, model.windupLeft - dtMs);
    if (model.windupLeft > 0) return [];
    model.attackIn = attackIntervalOf(model, hpRatio);
    model.shots++;
    return phasedVolley(model, position, cfg);
  }
  model.attackIn -= dtMs;
  if (model.attackIn <= 0) {
    // 瞄准点同样做兜底：target 缺坐标时沿用上一轮的 aim（首轮则为 Boss 自身），
    // 否则 target 临时为 null 会让整个战斗循环抛异常、把一帧打成黑屏。
    const px = Number.isFinite(target?.x) ? target.x : (model.aim?.x ?? position?.x ?? 0);
    const py = Number.isFinite(target?.y) ? target.y : (model.aim?.y ?? position?.y ?? 0);
    model.aim = { x: px, y: py };
    model.windupLeft = cfg.windupMs;
  }
  return [];
}

// 出手间隔：基数 × 阶段倍率，残血再叠一层狂暴。两者相乘而不取 max，
// 否则阶段 3 的狂暴（0.8）会被阶段倍率（0.68）盖掉，等于没写。
function attackIntervalOf(model, hpRatio) {
  const cfg = bossPhaseFor(model.phase);
  let ms = Math.max(1000, 2200 - model.act * 200) * cfg.attackMul;
  if (hpRatio < ENRAGE_HP_RATIO) ms *= ENRAGE_ATTACK_MUL;
  return ms;
}

// 阶段战的普通弹幕：与旧分支同一套几何，只把 count / spread / speed 按阶段倍率放大。
// countMul 生效时 spread 同步 × sqrt(countMul)——否则弹变多而总张角不变，
// 玩家看到的不是「更凶」而是「糊成一堵墙」，反而不知道该往哪躲（spec §4.1.3）。
function phasedVolley(model, position, cfg) {
  const pattern = bossPattern(model.act, model.phase);
  // 坐标兜底：纯逻辑模块要求「非法输入回退、不抛错」。旧分支对此不做防护
  // （它假定调用方一定给真坐标），新分支补上——但只补新分支，旧分支一个字不动。
  const ox = Number.isFinite(position?.x) ? position.x : 0;
  const oy = Number.isFinite(position?.y) ? position.y : 0;
  const aim = model.aim ?? { x: ox, y: oy };
  const count = Math.max(1, Math.ceil(pattern.count * cfg.countMul));
  const spread = (Number.isFinite(pattern.spread) ? pattern.spread : 0) * Math.sqrt(cfg.countMul);
  const speed = pattern.speed * cfg.speedMul;
  const angle = Math.atan2(aim.y - oy, aim.x - ox);
  const half = (count - 1) / 2;
  const offsets = pattern.ring
    ? Array.from({ length: count }, (_, i) => (i / count) * Math.PI * 2)
    : Array.from({ length: count }, (_, i) => (i - half) * (spread / (half || 1)));
  return offsets.map(offset => ({
    x: ox, y: oy,
    vx: Math.cos(angle + offset) * speed,
    vy: Math.sin(angle + offset) * speed,
    damage: pattern.damage, lifeMs: 6000,
  }));
}

// 大招落地（spec §4.2）：按 kind 生成弹幕，全部带 fromBoss: true。
// 场景层据此分流三件事：转阶段清场只清 fromBoss !== true 的杂弹（不清自己的大招）、
// 命中时挂 bossControlFor(stage) 并跳过全场兜底迟滞、破防倍率单独乘。
// 注意普通弹幕（含阶段倍率后的）不带 fromBoss：它们不是大招，
// 走的是杂兵弹那条清场/迟滞通道，别让一个布尔值把两套规则搅混。
function emitUltimate(model, position, target) {
  const ult = bossUltimateFor(model.act);
  // 坐标兜底（同 phasedVolley）：target 坏 → 退回 Boss 自身，Boss 自身也坏 → 退回原点。
  // atan2(NaN) 不会报错，只会静默产出整堆 NaN 弹，那种 bug 在表现层才暴露、最难查。
  const ox = Number.isFinite(position?.x) ? position.x : 0;
  const oy = Number.isFinite(position?.y) ? position.y : 0;
  const px = Number.isFinite(target?.x) ? target.x : ox;
  const py = Number.isFinite(target?.y) ? target.y : oy;
  const aim = Math.atan2(py - oy, px - ox);
  const out = [];
  const shot = (offset, kind, extra) => {
    const base = {
      x: ox, y: oy,
      vx: Math.cos(aim + offset) * ult.speed,
      vy: Math.sin(aim + offset) * ult.speed,
      damage: ult.damage,
      lifeMs: 6000,
      fromBoss: true,
      kind,
    };
    return extra ? { ...base, ...extra } : base;
  };

  // 环形：等分整圈，与玩家方向无关（offset 从 0 起算，铺满一圈）。
  const ringCount = Math.max(0, Math.round(ult.ringCount ?? 0));
  for (let i = 0; i < ringCount; i++) out.push(shot((i / ringCount) * Math.PI * 2, 'orb'));

  // 直线：相邻间隔 lanceGapDeg，以玩家方向居中——3 条 ×120° 时正好有一条正对玩家。
  const lanceCount = Math.max(0, Math.round(ult.lanceCount ?? 0));
  if (lanceCount > 0) {
    const gap = (Number.isFinite(ult.lanceGapDeg) ? Math.max(0, ult.lanceGapDeg) : 0) * Math.PI / 180;
    const half = (lanceCount - 1) / 2;
    // 场 5 的「超宽直线」用命中半径表达（半径 20 = spec 的宽度 40px），
    // 表现层照常画粗线即可，不用为它单开一种弹型。
    const extra = Number.isFinite(ult.lanceRadius) ? { radius: ult.lanceRadius } : null;
    for (let i = 0; i < lanceCount; i++) out.push(shot((i - half) * gap, 'bolt', extra));
  }

  // 扇形：朝玩家，半宽 fanSpread（与普通弹幕同一套口径，读起来不用换脑子）。
  const fanCount = Math.max(0, Math.round(ult.fanCount ?? 0));
  if (fanCount > 0) {
    const spread = Number.isFinite(ult.fanSpread) ? ult.fanSpread : 0;
    const half = (fanCount - 1) / 2;
    for (let i = 0; i < fanCount; i++) out.push(shot((i - half) * (spread / (half || 1)), 'bolt'));
  }

  // 追踪：走 hostile.js 的 homing 通道（kind:'homing' + homing:true）。
  // 速度仍按 BOSS_ULTIMATES 读，不用 hostile.js 里 46 的缺省——大招弹比杂兵弹快是设计意图。
  const homingCount = Math.max(0, Math.round(ult.homingCount ?? 0));
  for (let i = 0; i < homingCount; i++) out.push(shot(0, 'homing', { homing: true }));

  return out;
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
