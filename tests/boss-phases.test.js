import { describe, it, expect } from 'vitest';
import { createBossModel, stepBoss } from '../src/logic/boss.js';
import { applyDamage } from '../src/logic/effects.js';
import {
  BOSS_PHASES,
  BOSS_ULTIMATES,
  BOSS_CONTROLS,
  bossUltimateFor,
  bossControlFor,
  bossPhaseFor,
  BREAK_WINDOW_MS,
  BREAK_DAMAGE_MUL,
  ENRAGE_HP_RATIO,
  ENRAGE_ATTACK_MUL,
  PHASE_SHIFT_MS,
  PHASE_THRESHOLDS,
} from '../src/data/boss-phases.js';

// Boss 站位与玩家站位： Boss 在正上方、玩家在正下方，
// 于是「朝玩家」= 角度 +π/2（vx=0, vy>0），环形弹的夹角可以直接数。
const BOSS_POS = { x: 240, y: 72 };
const PLAYER_POS = { x: 240, y: 200 };
const AIM = Math.PI / 2;

// 相对「朝玩家」方向的角度差，归一化到 [0, 2π)。
function relToAim(shot) {
  const a = Math.atan2(shot.vy, shot.vx);
  const d = (a - AIM) % (Math.PI * 2);
  return (d + Math.PI * 2) % (Math.PI * 2);
}

// 把 Boss 一路推进到大招落地那一帧，返回落地弹幕与最终模型。
function landUltimate(stage, hpRatio = 0.9) {
  const model = createBossModel(stage);
  stepBoss(model, 16, BOSS_POS, PLAYER_POS, { hpRatio });
  for (let i = 0; i < 1400; i++) {
    const shots = stepBoss(model, 16, BOSS_POS, PLAYER_POS, { hpRatio });
    if (shots.some(s => s.fromBoss === true)) return { model, shots };
  }
  return { model, shots: [] };
}

describe('B1 阶段与大招数据', () => {
  it('三阶段参数与 spec §4.1 一致', () => {
    expect(BOSS_PHASES.map(p => p.windupMs)).toEqual([600, 540, 480]);
    expect(BOSS_PHASES.map(p => p.countMul)).toEqual([1, 1.25, 1.5]);
  });

  it('七场都有大招，且硬控只在场 3~7', () => {
    for (let s = 1; s <= 7; s++) expect(bossUltimateFor(s).chargeMs).toBe(1200);
    expect(bossControlFor(1)).toBeNull();
    expect(bossControlFor(2)).toBeNull();
    expect(bossControlFor(3)).toEqual({ kind: 'slow', ms: 1000, factor: 0.6 });
    expect(bossControlFor(7)).toEqual({ kind: 'stun', ms: 700 });
  });

  it('非法场号回退', () => { expect(bossUltimateFor(99).kind).toBe(bossUltimateFor(1).kind); });

  it('其余常量与 spec §4.1 / §4.3 对齐', () => {
    expect(PHASE_THRESHOLDS).toEqual([0.66, 0.33]);
    expect(PHASE_SHIFT_MS).toBe(900);
    expect(BREAK_WINDOW_MS).toBe(1200);
    expect(BREAK_DAMAGE_MUL).toBe(1.2);
    expect(ENRAGE_HP_RATIO).toBe(0.2);
    expect(ENRAGE_ATTACK_MUL).toBe(0.8);
    expect(BOSS_PHASES.map(p => p.attackMul)).toEqual([1, 0.82, 0.68]);
    expect(BOSS_PHASES.map(p => p.speedMul)).toEqual([1, 1.08, 1.15]);
    expect(BOSS_PHASES.map(p => p.ultEveryMs)).toEqual([12000, 10000, 8000]);
  });

  it.each([0, 8, 99, -1, 1.5, '1', NaN, Infinity, null, undefined])('非法入参 %j 一律回退不抛错', bad => {
    expect(() => bossUltimateFor(bad)).not.toThrow();
    expect(() => bossControlFor(bad)).not.toThrow();
    expect(() => bossPhaseFor(bad)).not.toThrow();
    expect(bossUltimateFor(bad)).toBe(bossUltimateFor(1));
    expect(bossPhaseFor(bad)).toBe(BOSS_PHASES[0]);
    expect(bossPhaseFor(1)).toBe(BOSS_PHASES[1]);
    expect(bossPhaseFor(2)).toBe(BOSS_PHASES[2]);
    expect(bossPhaseFor(3)).toBe(BOSS_PHASES[0]);   // 只有 0/1/2 三个阶段，3 也回退
  });

  it('七场大招表与硬控表键集合齐全', () => {
    expect(Object.keys(BOSS_ULTIMATES).map(Number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(Object.keys(BOSS_CONTROLS).map(Number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (let s = 1; s <= 7; s++) {
      const ult = bossUltimateFor(s);
      expect(ult.speed).toBeGreaterThan(0);
      expect(ult.damage).toBeGreaterThan(0);
      expect(ult.waves).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('B2 stepBoss 阶段机（旧路径零漂移）', () => {
  // 注意：200 帧（3200ms）只够打完第一轮——1200ms 等 + 600ms 预警 → 第 113 帧出手，
  // 出手当帧 windupLeft 被清零、之后重设 attackIn=2000，所以末尾 windupLeft 是 0 而不是 600。
  // 这条时序对改动前后一视同仁（见下面「旧路径黄金快照」钉死的逐帧结果）。
  it('不传 ctx 时与旧实现完全一致', () => {
    const m = createBossModel(1);
    const out = [];
    for (let i = 0; i < 200; i++) out.push(...stepBoss(m, 16, BOSS_POS, PLAYER_POS));
    expect(out.length).toBe(5);                   // 只打完第一轮，弹数 = pattern.count
    expect(out.length % 5).toBe(0);               // 每轮都是整整一发
    expect(out.every(s => s.fromBoss === undefined)).toBe(true);  // 普通弹不带大招标记
    expect(m.phase).toBeUndefined();              // 旧路径不初始化阶段字段
    expect(m.windupLeft).toBe(0);
    expect(m.attackIn).toBe(608);                 // 2000 - 87×16
  });

  // 「零漂移」最硬的形态：把整条旧路径逐帧跑一遍，模型每个字段 + 每帧弹数都钉死。
  // 任何人改动了旧分支（哪怕是「顺手优化」），这里必红。
  it('旧路径黄金快照：模型字段与逐帧弹数全钉死', () => {
    const m = createBossModel(1);
    const shots = [];
    const trace = [];
    for (let i = 0; i < 500; i++) {
      const s = stepBoss(m, 16, BOSS_POS, PLAYER_POS);
      shots.push(...s);
      trace.push(s.length);
    }
    // 500 帧 = 8000ms，出手点 113 / 276 / 439（首轮 1200+600，之后每轮 2000+600）
    expect(trace.filter(n => n > 0)).toEqual([5, 5, 5]);
    expect(shots.every(s => s.fromBoss === undefined)).toBe(true);
    expect(m).toEqual({
      act: 1,
      attackIn: 1024,          // 2000 - 61×16（第 439 帧出手后到第 500 帧）
      windupLeft: 0,
      aim: { x: 240, y: 200 },
      shots: 3,
    });
  });

  it('旧路径不写入任何阶段字段（含 mode/shiftLeft/ultIn）', () => {
    const m = createBossModel(3);
    // 480 帧：场 3 出手点在 113 / 251 / 389（首轮 1200ms 等 + 600ms 预警，
    // 之后每轮 attackIn=1600 + 600ms），第 4 次预警要到第 489 帧才起——480 帧正好落在两轮之间。
    for (let i = 0; i < 480; i++) stepBoss(m, 16, BOSS_POS, PLAYER_POS);
    // ultKind 已在修复轮删除（全仓零读取死字段），不再占位
    for (const key of ['phase', 'mode', 'modeLeft', 'shiftLeft', 'ultIn']) {
      expect(Object.hasOwn(m, key)).toBe(false);
    }
    expect(m.windupLeft).toBe(0);
    expect(m.attackIn).toBe(144);          // 1600 - 91×16
  });

  it.each([undefined, null, {}, { hpRatio: NaN }, { hpRatio: '0.5' }, { hpRatio: Infinity }])('ctx=%j 缺 hpRatio 时仍走旧分支', ctx => {
    const m = createBossModel(1);
    stepBoss(m, 1200, BOSS_POS, PLAYER_POS, ctx);
    expect(m.windupLeft).toBe(600);
    const shots = stepBoss(m, 600, BOSS_POS, PLAYER_POS, ctx);
    expect(shots).toHaveLength(5);
    expect(shots.every(s => s.fromBoss === undefined)).toBe(true);
  });

  it('传 ctx 时按 hpRatio 推阶段，一次只推一格', () => {
    const m = createBossModel(1);
    stepBoss(m, 16, { x: 240, y: 72 }, { x: 240, y: 200 }, { hpRatio: 0.3 });
    expect(m.phase).toBe(1);                     // 不是 2
    for (let i = 0; i < 60; i++) stepBoss(m, 16, { x: 240, y: 72 }, { x: 240, y: 200 }, { hpRatio: 0.3 });
    expect(m.phase).toBe(2);
  });

  it('转阶段期间不产弹', () => {
    const m = createBossModel(1);
    stepBoss(m, 16, { x: 240, y: 72 }, { x: 240, y: 200 }, { hpRatio: 0.6 });
    expect(m.shiftLeft).toBe(900);
    const shots = [];
    for (let i = 0; i < 55; i++) shots.push(...stepBoss(m, 16, { x: 240, y: 72 }, { x: 240, y: 200 }, { hpRatio: 0.6 }));
    expect(shots).toHaveLength(0);
  });

  it('阶段 2 的弹数 ×1.25 且张角同步放宽', () => {
    const m = createBossModel(1);
    stepBoss(m, 16, { x: 240, y: 72 }, { x: 240, y: 200 }, { hpRatio: 0.5 });
    const before = m.shiftLeft; void before;
    // 立刻把 shift 走完，再等一次出手
    for (let i = 0; i < 60; i++) stepBoss(m, 16, { x: 240, y: 72 }, { x: 240, y: 200 }, { hpRatio: 0.5 });
    const shots = [];
    for (let i = 0; i < 200; i++) shots.push(...stepBoss(m, 16, { x: 240, y: 72 }, { x: 240, y: 200 }, { hpRatio: 0.5 }));
    expect(shots.length).toBe(7);                // ceil(5 × 1.25) = 7
  });

  it('阶段 3 的弹数 ×1.5 且张角同步放宽', () => {
    const m = createBossModel(1);
    stepBoss(m, 16, BOSS_POS, PLAYER_POS, { hpRatio: 0.5 });
    for (let i = 0; i < 60; i++) stepBoss(m, 16, BOSS_POS, PLAYER_POS, { hpRatio: 0.2 });
    expect(m.phase).toBe(2);
    // 走完第二段 shift（0.2 ≤ 0.33），再等一次出手
    for (let i = 0; i < 60; i++) stepBoss(m, 16, BOSS_POS, PLAYER_POS, { hpRatio: 0.2 });
    const shots = [];
    for (let i = 0; i < 200; i++) shots.push(...stepBoss(m, 16, BOSS_POS, PLAYER_POS, { hpRatio: 0.2 }));
    expect(shots.length).toBe(8);                // ceil(5 × 1.5) = 8
  });

  it('张角随 sqrt(countMul) 放宽：同样 7 发比旧口径更宽', () => {
    // 阶段 1 的 5 发与阶段 2 的 7 发同表对比没意义，直接钉「极弹夹角」：
    const m = createBossModel(1);
    stepBoss(m, 16, BOSS_POS, PLAYER_POS, { hpRatio: 0.5 });
    for (let i = 0; i < 60; i++) stepBoss(m, 16, BOSS_POS, PLAYER_POS, { hpRatio: 0.5 });
    const shots = [];
    for (let i = 0; i < 200; i++) shots.push(...stepBoss(m, 16, BOSS_POS, PLAYER_POS, { hpRatio: 0.5 }));
    const angles = shots.map(s => Math.atan2(s.vy, s.vx)).sort((a, b) => a - b);
    const span = angles[angles.length - 1] - angles[0];
    // spread 是「半宽」：极弹偏移 = ±spread，故总张角 = 2×spread。
    // 7 发、spread 0.42 × sqrt(1.25) ≈ 0.4697 → 总张角 ≈ 0.9394
    expect(span).toBeCloseTo(2 * 0.42 * Math.sqrt(1.25), 6);
  });

  it('阶段 2 出手频率更快（attackIn ×0.82），狂暴再 ×0.8', () => {
    const fireAt = (hpRatio) => {
      const m = createBossModel(1);
      stepBoss(m, 16, BOSS_POS, PLAYER_POS, { hpRatio });
      for (let i = 0; i < 60; i++) stepBoss(m, 16, BOSS_POS, PLAYER_POS, { hpRatio });
      for (let i = 0; i < 4000; i++) {
        const shots = stepBoss(m, 16, BOSS_POS, PLAYER_POS, { hpRatio });
        if (shots.length > 0) return { tick: i, attackIn: m.attackIn };
      }
      return { tick: -1, attackIn: NaN };
    };
    const normal = fireAt(0.5);
    const enraged = fireAt(0.1);
    expect(normal.tick).toBeGreaterThan(0);
    expect(normal.attackIn).toBeCloseTo(2000 * 0.82, 6);        // 2200 - 1×200 = 2000，阶段 2
    expect(enraged.attackIn).toBeCloseTo(2000 * 0.68 * 0.8, 6); // 阶段 3 再叠狂暴
    expect(enraged.attackIn).toBeLessThan(normal.attackIn);
  });

  it('阶段 2 的 windupMs 是 540 而不是旧分支的 600', () => {
    const m = createBossModel(1);
    stepBoss(m, 16, BOSS_POS, PLAYER_POS, { hpRatio: 0.5 });
    for (let i = 0; i < 60; i++) stepBoss(m, 16, BOSS_POS, PLAYER_POS, { hpRatio: 0.5 });
    for (let i = 0; i < 4000; i++) {
      if (m.windupLeft > 0) { expect(m.windupLeft).toBe(540); return; }
      stepBoss(m, 16, BOSS_POS, PLAYER_POS, { hpRatio: 0.5 });
    }
    expect.unreachable('阶段 2 应当出手');
  });

  it('破防期间不产弹，modeLeft 归零后回 aim', () => {
    const { model, shots } = landUltimate(1);
    expect(shots.length).toBeGreaterThan(0);
    expect(model.mode).toBe('break');
    expect(model.modeLeft).toBe(BREAK_WINDOW_MS);
    const during = [];
    for (let i = 0; i < 80; i++) during.push(...stepBoss(model, 16, BOSS_POS, PLAYER_POS, { hpRatio: 0.9 }));
    expect(during).toHaveLength(0);
    expect(model.mode).toBe('aim');
  });

  it('hpRatio 回到阈值以上不倒退阶段', () => {
    const m = createBossModel(1);
    stepBoss(m, 16, BOSS_POS, PLAYER_POS, { hpRatio: 0.3 });
    expect(m.phase).toBe(1);
    for (let i = 0; i < 60; i++) stepBoss(m, 16, BOSS_POS, PLAYER_POS, { hpRatio: 0.9 });
    expect(m.phase).toBe(1);
  });
});

describe('B3 七场专属大招', () => {
  it.each([[1, 'ring'], [2, 'ring'], [3, 'lance'], [4, 'mix'], [5, 'lance'], [6, 'ring'], [7, 'mix']])('场 %i 大招形态 %s', (stage, kind) => {
    expect(bossUltimateFor(stage).kind).toBe(kind);
  });

  // 落地帧才是断言点：整轮 900 帧跑完，破防窗口（1200ms = 75 帧）早已归位到 aim，
  // 循环末尾的 mode 必然是 'aim'。所以要在「产出弹幕那一帧」当场抓 mode/modeLeft。
  it('大招弹都带 fromBoss 且落地后进破防', () => {
    const m = createBossModel(1);
    stepBoss(m, 16, BOSS_POS, PLAYER_POS, { hpRatio: 0.9 });
    let landFrame = null;
    for (let i = 0; i < 900; i++) {
      const shots = stepBoss(m, 16, BOSS_POS, PLAYER_POS, { hpRatio: 0.9 });
      if (shots.some(s => s.fromBoss === true)) landFrame = { shots, mode: m.mode, modeLeft: m.modeLeft, ultIn: m.ultIn };
    }
    expect(landFrame).not.toBeNull();
    expect(landFrame.shots.every(s => s.fromBoss === true)).toBe(true);
    expect(landFrame.mode).toBe('break');          // 落地瞬间进破防，场景层据此写 boss.breakUntil
    expect(landFrame.modeLeft).toBe(BREAK_WINDOW_MS);
    expect(landFrame.ultIn).toBe(12000);           // 落地才重新计时
  });

  // 破防窗口从落地帧算起：落地那一帧 mode 已经翻成 'break'，同时也在产大招弹，
  // 所以「一弹不出」只约束落地帧之后；窗口长度正好是 BREAK_WINDOW_MS / dtMs 帧。
  it('破防窗口结束自动回 aim，全程不产弹', () => {
    const m = createBossModel(1);
    stepBoss(m, 16, BOSS_POS, PLAYER_POS, { hpRatio: 0.9 });
    let landIdx = -1;
    const frames = [];
    for (let i = 0; i < 900; i++) {
      const shots = stepBoss(m, 16, BOSS_POS, PLAYER_POS, { hpRatio: 0.9 });
      if (shots.some(s => s.fromBoss === true)) landIdx = i;
      if (landIdx >= 0) frames.push({ mode: m.mode, n: shots.length });
    }
    const breakRun = frames.filter(f => f.mode === 'break');
    expect(breakRun.length).toBe(BREAK_WINDOW_MS / 16);
    expect(breakRun.slice(1).every(f => f.n === 0)).toBe(true);   // 落地帧之后一弹不出
    expect(frames.at(-1).mode).toBe('aim');                     // 窗口结束自动回 aim
  });

  it('大招落地时刻可复现：首次 ultIn 4000ms + chargeMs 1200ms', () => {
    const m = createBossModel(1);
    stepBoss(m, 16, BOSS_POS, PLAYER_POS, { hpRatio: 0.9 });
    let landTick = -1;
    for (let i = 0; i < 900; i++) {
      const shots = stepBoss(m, 16, BOSS_POS, PLAYER_POS, { hpRatio: 0.9 });
      if (shots.some(s => s.fromBoss === true)) { landTick = i; break; }
    }
    // 首帧（上面那次预热调用）初始化 ultIn = min(4000, 12000) = 4000 并当帧扣掉 16 → 3984；
    // 循环里每帧 -16，第 248 个下标到点起手蓄力（3984 - 16×249 = 0）；
    // chargeMs 1200ms 再数 75 帧落地。循环下标 323 = 总第 325 帧 = 5200ms。
    // 修复轮把首次大招从 12000ms 提前到 4000ms，这里同步钉新时刻（值本身仍是确定性断言）。
    expect(landTick).toBe(323);
  });

  it.each([
    [1, 12, 0, 0, 0],      // ring 12
    [2, 16, 0, 0, 0],      // ring 16
    [3, 0, 3, 0, 0],       // lance 3
    [4, 10, 0, 5, 0],      // ring 10 + fan 5
    [5, 0, 1, 0, 3],       // lance 1 + homing 3
    [6, 20, 0, 0, 0],      // ring 20
    [7, 16, 2, 0, 4],      // ring 16 + lance 2 + homing 4
  ])('场 %i 落地构成：ring %i / lance %i / fan %i / homing %i', (stage, ring, lance, fan, homing) => {
    const { shots } = landUltimate(stage);
    const kindOf = (k) => shots.filter(s => (s.kind ?? 'bolt') === k).length;
    expect(kindOf('orb')).toBe(ring);          // 环形弹用 orb（体积大、看得清整圈）
    expect(kindOf('bolt')).toBe(lance + fan);  // 直线与扇形共用 bolt
    expect(shots.filter(s => s.homing === true)).toHaveLength(homing);
    expect(shots.length).toBe(ring + lance + fan + homing);
    expect(shots.every(s => s.fromBoss === true)).toBe(true);
    const ult = bossUltimateFor(stage);
    expect(shots.every(s => s.damage === ult.damage)).toBe(true);
    expect(shots.every(s => Math.abs(Math.hypot(s.vx, s.vy) - ult.speed) < 1e-9)).toBe(true);
    expect(shots.every(s => s.lifeMs > 0)).toBe(true);
  });

  it('ring 等分整圈：相邻夹角全部相等', () => {
    const { shots } = landUltimate(1);
    const angles = shots.map(s => Math.atan2(s.vy, s.vx)).sort((a, b) => a - b);
    expect(angles).toHaveLength(12);
    for (let i = 1; i < angles.length; i++) {
      expect(angles[i] - angles[i - 1]).toBeCloseTo((Math.PI * 2) / 12, 6);
    }
    expect(angles[0] + Math.PI * 2 - angles[11]).toBeCloseTo((Math.PI * 2) / 12, 6);
  });

  it('lance 朝玩家：场 3 三线间隔 120°且有一条正对玩家', () => {
    const { shots } = landUltimate(3);
    const rel = shots.map(relToAim).sort((a, b) => a - b);
    expect(rel[0]).toBeCloseTo(0, 6);
    expect(rel[1]).toBeCloseTo((Math.PI * 2) / 3, 6);
    expect(rel[2]).toBeCloseTo((Math.PI * 4) / 3, 6);
    // 正对玩家那一发：Boss 在玩家正上方 → vx=0, vy>0
    const straight = shots.find(s => Math.abs(s.vx) < 1e-9);
    expect(straight).toBeDefined();
    expect(straight.vy).toBeGreaterThan(0);
  });

  it('场 5 的直线是超宽单发（radius 20 = 宽 40px）且追踪弹走 homing 通道', () => {
    const { shots } = landUltimate(5);
    const lances = shots.filter(s => s.homing !== true);
    expect(lances).toHaveLength(1);
    expect(lances[0].radius).toBe(20);
    expect(lances[0].vx).toBeCloseTo(0, 6);
    expect(lances[0].vy).toBeGreaterThan(0);
    const homing = shots.filter(s => s.homing === true);
    expect(homing).toHaveLength(3);
    expect(homing.every(s => s.kind === 'homing')).toBe(true);
  });

  it('场 4 的扇形 5 发集中在玩家方向 ±0.5rad 内', () => {
    const { shots } = landUltimate(4);
    const fan = shots.filter(s => s.kind === 'bolt');
    expect(fan).toHaveLength(5);
    for (const s of fan) {
      const rel = relToAim(s);
      const off = Math.min(rel, Math.PI * 2 - rel);
      expect(off).toBeLessThanOrEqual(0.5 + 1e-9);
    }
    const angles = fan.map(s => Math.atan2(s.vy, s.vx)).sort((a, b) => a - b);
    expect(angles[4] - angles[0]).toBeCloseTo(1.0, 6);   // 半宽 0.5 → 总张角 1.0
  });

  it('homing 弹速度也按 BOSS_ULTIMATES 读（不是 hostile.js 的 46 缺省）', () => {
    const { shots } = landUltimate(7);
    const homing = shots.filter(s => s.homing === true);
    expect(homing).toHaveLength(4);
    expect(Math.hypot(homing[0].vx, homing[0].vy)).toBeCloseTo(bossUltimateFor(7).speed, 6);
  });

  it('破防窗口起点由场景层写 breakUntil：boss.js 不新增 breakStartedAt/clock 字段', () => {
    const { model } = landUltimate(1);
    for (const key of ['breakStartedAt', 'clock']) {
      expect(Object.hasOwn(model, key)).toBe(false);
    }
  });

  it('大招落地后 ultIn 重新按本阶段间隔计时', () => {
    const { model } = landUltimate(1);
    expect(model.ultIn).toBe(bossPhaseFor(0).ultEveryMs);
  });

  // 纯逻辑模块的兜底契约：坏输入回退，不抛错。NaN 弹是最难查的一类 bug——
  // atan2(NaN) 不报错，只静默产出一堆 NaN，到表现层才暴露。
  it('target 非法时大招回退到朝 Boss 自身，不抛错也不产 NaN', () => {
    const m = createBossModel(7);
    stepBoss(m, 16, BOSS_POS, PLAYER_POS, { hpRatio: 0.9 });
    let land = null;
    for (const bad of [null, undefined, {}, { x: NaN, y: NaN }, { x: '240', y: 200 }]) {
      for (let i = 0; i < 900 && !land; i++) {
        const shots = stepBoss(m, 16, BOSS_POS, bad, { hpRatio: 0.9 });
        if (shots.some(s => s.fromBoss === true)) land = shots;
      }
    }
    expect(land).not.toBeNull();
    for (const s of land) {
      for (const k of ['x', 'y', 'vx', 'vy', 'damage', 'lifeMs']) {
        expect(Number.isFinite(s[k])).toBe(true);
      }
    }
  });

  it('position 非法时同样回退原点，不抛错', () => {
    const m = createBossModel(1);
    stepBoss(m, 16, BOSS_POS, PLAYER_POS, { hpRatio: 0.9 });
    let land = null;
    for (let i = 0; i < 900 && !land; i++) {
      const shots = stepBoss(m, 16, null, PLAYER_POS, { hpRatio: 0.9 });
      if (shots.some(s => s.fromBoss === true)) land = shots;
    }
    expect(land).not.toBeNull();
    expect(land.every(s => s.x === 0 && s.y === 0)).toBe(true);
  });

  it('dtMs 非法（NaN / 负数）时直接返回空数组且不推进任何状态', () => {
    const m = createBossModel(1);
    stepBoss(m, 16, BOSS_POS, PLAYER_POS, { hpRatio: 0.9 });
    const before = structuredClone(m);
    expect(stepBoss(m, NaN, BOSS_POS, PLAYER_POS, { hpRatio: 0.9 })).toEqual([]);
    expect(stepBoss(m, -16, BOSS_POS, PLAYER_POS, { hpRatio: 0.9 })).toEqual([]);
    expect(stepBoss(m, NaN, BOSS_POS, PLAYER_POS)).toEqual([]);
    expect(m).toEqual(before);
  });

  it('纯逻辑模块：零 Phaser / 零 DOM / 零 Math.random', async () => {
    const fs = await import('node:fs');
    const url = await import('node:url');
    const dir = url.fileURLToPath(new URL('.', import.meta.url));
    for (const rel of ['../src/data/boss-phases.js', '../src/logic/boss.js']) {
      // 先剥掉行注释与块注释再查：注释里写「零 Phaser」是在声明纪律，不是依赖。
      const src = fs.readFileSync(dir + rel, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      expect(src).not.toMatch(/Phaser|phaser/);
      expect(src).not.toMatch(/document\.|window\.|requestAnimationFrame/);
      expect(src).not.toMatch(/Math\.random/);
    }
  });
});

// B4 破防窗口：effects.applyDamage 读 enemy.breakUntil，窗口内伤害 ×BREAK_DAMAGE_MUL。
// 落点与顺序：盾 → 破防倍率 × 易伤（都在 amount 上相乘）→ 护甲 (1-armor) → 扣血。
// 进化 damageMul 在更上游（damageMultiplier 里乘进 base），不在本层重复乘。
describe('B4 破防窗口：applyDamage 的破防倍率', () => {
  it('破防窗口内受伤 ×BREAK_DAMAGE_MUL', () => {
    const e = { hp: 100, alive: true, armor: 0, breakUntil: 5000 };
    expect(applyDamage(e, 10, 1000)).toBeCloseTo(10 * BREAK_DAMAGE_MUL, 5);
    expect(e.hp).toBeCloseTo(100 - 10 * BREAK_DAMAGE_MUL, 5);
  });

  it('窗口外（now >= breakUntil）恢复原样', () => {
    const e = { hp: 100, alive: true, armor: 0, breakUntil: 5000 };
    expect(applyDamage(e, 10, 6000)).toBeCloseTo(10, 5);
    expect(e.hp).toBeCloseTo(90, 5);
  });

  it('窗口边界：now === breakUntil 时已出窗，不吃倍率', () => {
    const e = { hp: 100, alive: true, armor: 0, breakUntil: 5000 };
    expect(applyDamage(e, 10, 5000)).toBeCloseTo(10, 5);
  });

  it('破防 × 易伤各自相乘：10 × 1.15 × 1.2 ≈ 13.8', () => {
    const e = { hp: 100, alive: true, armor: 0, breakUntil: 5000, vulnUntil: 5000, vulnFactor: 1.15 };
    expect(applyDamage(e, 10, 1000)).toBeCloseTo(13.8, 5);
  });

  it('破防倍率乘在护甲之前：×1.2 后再按 armor 减伤', () => {
    const e = { hp: 100, alive: true, armor: 0.5, breakUntil: 5000 };
    // 10 × 1.2 = 12，再 ×(1-0.5) = 6；若顺序反了会得到 10×0.5×1.2 之外的错误值。
    expect(applyDamage(e, 10, 1000)).toBeCloseTo(6, 5);
  });

  it('不传 now 的旧调用（尸爆等）零漂移：不吃破防也不吃易伤', () => {
    const e = { hp: 100, alive: true, armor: 0, breakUntil: 5000, vulnUntil: 5000, vulnFactor: 1.15 };
    expect(applyDamage(e, 10)).toBeCloseTo(10, 5);
  });

  it('破防窗口内先扣盾：盾吸收的是 ×1.2 之后的量', () => {
    const e = { hp: 100, alive: true, armor: 0, shield: 4, breakUntil: 5000 };
    expect(applyDamage(e, 10, 1000)).toBeCloseTo(8, 5);
    expect(e.shield).toBe(0);
    expect(e.lastBlocked).toBeCloseTo(4, 5);
  });
});

// 修复轮（Critical）：首次大招提前到 4 秒内起手。
// 依据：仿真实测 stage 2~7 的一战只有 12~18 秒，而 ultEveryMs 12000/10000/8000
// 再加 1200ms 蓄力，意味着大招与破防在七场里有五场根本不运行——写在数据表里的
// 机制玩家看不到，等于没做。控制器裁定：首次 ultIn 取 Math.min(4000, ultEveryMs)，
// 落地后仍按阶段值循环（不改 BOSS_PHASES 的既有值）。
// 数学上首次落地时刻 = 4000（起手）+ 1200（chargeMs）= 5200ms，正好卡在 12 秒的
// 最短一战里还留足输出窗口，也保证 45~90 秒的长一战能多看到一轮。
describe('修复轮：首次大招 4 秒内起手，每场至少一次大招 + 一次破防', () => {
  // 推进到大招落地那一帧为止，返回落地累计毫秒 / 落地弹幕 / 模型引用。
  function runUntilUltimate(stage, hpRatio = 0.9, maxMs = 20000) {
    const model = createBossModel(stage);
    let elapsed = 0;
    while (elapsed < maxMs) {
      const shots = stepBoss(model, 16, BOSS_POS, PLAYER_POS, { hpRatio });
      elapsed += 16;
      if (shots.some(s => s.fromBoss === true)) return { at: elapsed, shots, model };
    }
    return null;
  }

  it.each([1, 2, 3, 4, 5, 6, 7])('场 %i：大招 5200ms 内落地，落地即破防', stage => {
    const landed = runUntilUltimate(stage);
    expect(landed).not.toBeNull();
    expect(landed.at).toBe(5200);                 // 4000 起手 + 1200 蓄力，逐帧累加无余量
    expect(landed.shots.some(s => s.fromBoss === true)).toBe(true);
    expect(landed.model.mode).toBe('break');       // 大招落地同帧翻破防
    expect(landed.model.modeLeft).toBe(BREAK_WINDOW_MS);
  });

  it('落地后 ultIn 回到阶段值循环，不再提前', () => {
    const landed = runUntilUltimate(1);
    expect(landed.model.ultIn).toBe(BOSS_PHASES[0].ultEveryMs);   // 12000，不是 4000
  });

  it('hpRatio 掉到阶段 2 后大招仍按阶段值循环，不被 4 秒提前规则反复刷新', () => {
    // 转阶段会把 mode 打回 aim 但保留 ultIn：若把「提前」写进阶段切换，
    // 玩家压一次阶段就能无限续大招，阶段战会被做成答题机。
    //
    // 这里的断言点必须推到 phase 真的变成 1 之后的那一帧。原因是 stepBoss 里
    // 破防分支（②）先于阶段推进（③），一次带 dtMs=1200 的调用只把 modeLeft
    // 耗尽、mode 归 aim 就 return 了，phase 仍是 0——在那一帧断言 ultIn 等于
    // BOSS_PHASES[0] 的值，等于断言「没变的东西没变」，把提前规则注入 ③ 也不会红。
    const model = createBossModel(1);
    let elapsed = 0;
    while (elapsed < 6000) { stepBoss(model, 16, BOSS_POS, PLAYER_POS, { hpRatio: 0.9 }); elapsed += 16; }
    expect(model.mode).toBe('break');                          // 第一次大招已落地
    stepBoss(model, 1200, BOSS_POS, PLAYER_POS, { hpRatio: 0.2 });   // 只耗尽破防窗口，phase 未推进
    expect(model.mode).toBe('aim');
    expect(model.phase).toBe(0);                               // 上一帧的真实位置，别在这里断言 ultIn

    // 推进到阶段真正切换的那一帧（③ 分支），此后 mode 仍被写回 aim。
    let guard = 0;
    while (model.phase === 0 && guard++ < 64) stepBoss(model, 16, BOSS_POS, PLAYER_POS, { hpRatio: 0.2 });
    expect(model.phase).toBe(1);                               // 确认真的进入了阶段 2

    // 转阶段不清零、也不套用提前规则：保留的是阶段 1 落地时写的 cfg.ultEveryMs，
    // 而不是 Math.min(4000, …) 的 4000。
    expect(model.ultIn).toBe(BOSS_PHASES[0].ultEveryMs);
    expect(model.ultIn).not.toBe(4000);
  });

  it('旧路径（不传 ctx）零影响：跑到 11200ms 也不出一个大招弹、不写阶段字段', () => {
    const m = createBossModel(1);
    const out = [];
    for (let i = 0; i < 700; i++) out.push(...stepBoss(m, 16, BOSS_POS, PLAYER_POS));   // 11200ms > 4000
    expect(out.every(s => s.fromBoss === undefined)).toBe(true);
    expect(m.phase).toBeUndefined();
    expect(Object.hasOwn(m, 'ultIn')).toBe(false);
    expect(Object.hasOwn(m, 'mode')).toBe(false);
  });
});
