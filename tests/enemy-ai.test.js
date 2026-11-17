import { describe, it, expect } from 'vitest';
import {
  createBrain, stepBrain, DEFAULT_BATTLE, AI_PROFILE,
  BAT_RULE, CULTIST_RULE, KNIGHT_RULE, STITCH_RULE, OATH_RULE,
  VOLLEY_RULE, PHASE_RULE, LUNGE_RULE, SLAM_RULE, JUDGE_RULE, ECLIPSE_RULE,
  MELEE_RULES, RANGED_RULES,
} from '../src/logic/enemy-ai.js';
import { ENEMY_TYPES, ACT_ENEMY_WEIGHTS, pickEnemyType } from '../src/data/roster.js';
import Enemy from '../src/entities/Enemy.js';

const PLAYER = Object.freeze({ x: 240, y: 220 });
const OPTS = { BATTLE: DEFAULT_BATTLE, damage: 8 };
const ALL_DEFS = [
  'skeleton', 'bat', 'corpse', 'cultist', 'knight',
  'stitch_abomination', 'oath_bishop',
  'rune_spider', 'stone_gargoyle', 'crystal_dryad',
  'clockwork_doll', 'void_elemental', 'wraith', 'brass_warden',
  'ink_wisp', 'page_golem', 'index_hound',
  'verdict_wraith', 'shackle_guard', 'scale_arbiter',
  'slag_beast', 'ember_imp', 'anvil_tyrant',
  'dawn_shade', 'stardust_knight', 'eclipse_priest',
];

// 按固定步长连续推进，喂回上一帧坐标（和 BattleScene / Enemy 的用法一致）
function simulate(brain, start, player = PLAYER, dtMs = 100, steps = 1, opts = OPTS) {
  let pos = { x: start.x, y: start.y };
  const trace = [];
  for (let i = 0; i < steps; i++) {
    const result = stepBrain(brain, {
      dtMs,
      now: (i + 1) * dtMs,
      self: { x: pos.x, y: pos.y, speed: start.speed, radius: start.radius },
      player,
      opts,
    });
    pos = { x: result.x, y: result.y };
    trace.push(result);
  }
  return { trace, pos };
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// 逐帧推进并记录 (坐标 / 位移 / 模式 / 旗标 / 弹丸)。onFrame 可让玩家动起来（mirror 用）。
function runFrames(defId, options = {}) {
  const {
    seed = 7,
    start = { x: 240, y: 200, speed: 30, radius: 8 },
    player = PLAYER,
    dtMs = 10,
    steps = 200,
    opts = OPTS,
    onFrame = null,
    brainId,
  } = options;
  const brain = createBrain(defId, { now: 0, seed });
  if (brainId !== undefined) brain.id = brainId;
  let self = { ...start };
  const frames = [];
  for (let i = 0; i < steps; i++) {
    const p = typeof onFrame === 'function' ? onFrame(i, self) : player;
    const r = stepBrain(brain, { dtMs, now: (i + 1) * dtMs, self: { ...self }, player: p, opts });
    frames.push({
      t: (i + 1) * dtMs,
      x: r.x,
      y: r.y,
      d: Math.hypot(r.x - self.x, r.y - self.y),
      mode: brain.mode,
      dir: brain.dir ? { ...brain.dir } : null,
      shots: r.shots,
      stomp: r.stomp,
      charging: r.charging,
      windup: r.windup,
      guard: r.guard,
      melee: r.melee,
      summon: r.summon,
      meleeIn: brain.meleeIn,
      melees: brain.melees,
      preview: brain.meleePreview ? { ...brain.meleePreview } : null,
    });
    self = { ...self, x: r.x, y: r.y };
  }
  return { brain, frames, end: self };
}

// 把连续同模式的帧压成块（{ mode, len, start }），len 是帧数。
function blocksOf(frames) {
  const blocks = [];
  for (const f of frames) {
    if (blocks.length && blocks.at(-1).mode === f.mode) blocks.at(-1).len += 1;
    else blocks.push({ mode: f.mode, len: 1, start: f.t });
  }
  return blocks;
}

// 只保留「上一帧同模式」的稳定帧：模式切换的那一帧仍带着上一段位移
function steady(frames) {
  return frames.filter((f, i) => i > 0 && frames[i - 1].mode === f.mode);
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

// 新行为（14 个）与本轮契约一一对应
const NEW_BEHAVIOR_DEFS = [
  'corpse', 'clockwork_doll', 'page_golem', 'slag_beast', 'shackle_guard',
  'rune_spider', 'wraith', 'ink_wisp', 'verdict_wraith', 'ember_imp',
  'dawn_shade', 'stone_gargoyle', 'brass_warden', 'stardust_knight',
];

// 美术升级包新增行为：至少保证 6.4 秒连续推进不产生 NaN/越界，并让两个远程新怪真的打出弹。
describe('新怪行为冒烟', () => {
  it('volley / phase / weave / charge / march 都能稳定推进', () => {
    for (const id of ['rune_spider', 'stone_gargoyle', 'crystal_dryad', 'clockwork_doll', 'void_elemental', 'wraith', 'brass_warden']) {
      const brain = createBrain(id, { now: 0, seed: 3 });
      const { trace } = simulate(brain, { x: 240, y: 80, speed: 30, radius: 6 }, PLAYER, 16, 400);
      let shots = 0;
      for (const r of trace) {
        expect(Number.isFinite(r.x) && Number.isFinite(r.y)).toBe(true);
        // 直线推进的怪允许冲出战斗边界（由战斗层退场判定清退），这里只防 NaN/无限大
        expect(Math.abs(r.x)).toBeLessThan(1e5);
        expect(Math.abs(r.y)).toBeLessThan(1e5);
        shots += r.shots.length;
      }
      if (id === 'crystal_dryad') expect(shots).toBeGreaterThanOrEqual(VOLLEY_RULE.shots);
      if (id === 'void_elemental') expect(shots).toBeGreaterThanOrEqual(PHASE_RULE.burstShots - 1);
    }
  });
});

describe('北斗后半段精英行为', () => {
  it('索引猎犬：蓄力后进入高速扑咬（windup + charging 都出现）', () => {
    const brain = createBrain('index_hound', { seed: 1 });
    let pos = { x: 240, y: 60 };
    let windup = false;
    let charging = false;
    for (let i = 0; i < 420; i++) {
      const r = stepBrain(brain, { dtMs: 16, now: i * 16, self: { ...pos, speed: 40, radius: 12 }, player: PLAYER, opts: OPTS });
      if (r.windup) windup = true;
      if (r.charging) charging = true;
      pos = { x: r.x, y: r.y };
    }
    expect(windup).toBe(true);
    expect(charging).toBe(true);
  });

  it('铁砧暴君：贴近后蓄力并产出 46px 大范围 stomp 事件', () => {
    const brain = createBrain('anvil_tyrant', { seed: 2 });
    let pos = { x: 240, y: 200 };
    let stomp = null;
    for (let i = 0; i < 260 && !stomp; i++) {
      const r = stepBrain(brain, { dtMs: 16, now: i * 16, self: { ...pos, speed: 30, radius: 14 }, player: PLAYER, opts: OPTS });
      if (r.stomp) stomp = r.stomp;
      pos = { x: r.x, y: r.y };
    }
    expect(stomp).not.toBeNull();
    expect(stomp.radius).toBe(46);
    expect(stomp.damage).toBeGreaterThanOrEqual(16);
  });

  it('天平裁决者：蓄力后打出一发慢速重弹', () => {
    const brain = createBrain('scale_arbiter', { seed: 3 });
    let pos = { x: 240, y: 120 };
    let shot = null;
    for (let i = 0; i < 640 && !shot; i++) {
      const r = stepBrain(brain, { dtMs: 16, now: i * 16, self: { ...pos, speed: 40, radius: 12 }, player: PLAYER, opts: OPTS });
      if (r.shots.length) shot = r.shots[0];
      pos = { x: r.x, y: r.y };
    }
    expect(shot).not.toBeNull();
    expect(Math.hypot(shot.vx, shot.vy)).toBeCloseTo(72, 5);
    expect(shot.damage).toBeGreaterThanOrEqual(12);
  });

  it('蚀日祭司：蓄力后打出八向星环', () => {
    const brain = createBrain('eclipse_priest', { seed: 4 });
    let pos = { x: 240, y: 120 };
    let shots = [];
    for (let i = 0; i < 960 && shots.length === 0; i++) {
      const r = stepBrain(brain, { dtMs: 16, now: i * 16, self: { ...pos, speed: 40, radius: 12 }, player: PLAYER, opts: OPTS });
      if (r.shots.length) shots = r.shots;
      pos = { x: r.x, y: r.y };
    }
    expect(shots).toHaveLength(8);
    expect(new Set(shots.map((s) => Math.round(Math.atan2(s.vy, s.vx) * 100))).size).toBe(8);
  });
});

describe('确定性：同 seed 同轨迹', () => {
  it.each(ALL_DEFS)('%s 两次同 seed 模拟逐帧完全一致', (defId) => {
    const run = (seed) => {
      const brain = createBrain(defId, { now: 0, seed });
      let self = { x: 220, y: 190, speed: 50, radius: 6 };
      const out = [];
      for (let i = 0; i < 180; i++) {
        const player = { x: 240 + Math.sin(i / 10) * 45, y: 150 + Math.cos(i / 13) * 35 };
        const r = stepBrain(brain, { dtMs: 16, now: i * 16, self, player, opts: OPTS });
        self = { x: r.x, y: r.y, speed: 50, radius: 6 };
        out.push(r);
      }
      return out;
    };
    expect(run(20261023)).toEqual(run(20261023));
  });

  it('brain 是纯数据：结构化克隆后继续步进，结果仍与原件一致', () => {
    const brain = createBrain('cultist', { now: 0, seed: 'clone' });
    const copy = structuredClone(brain);
    const self = { x: 240, y: 150, speed: 40, radius: 6 };
    const player = { x: 240, y: 80 };
    for (let i = 0; i < 40; i++) {
      const a = stepBrain(brain, { dtMs: 60, now: i * 60, self, player, opts: OPTS });
      const b = stepBrain(copy, { dtMs: 60, now: i * 60, self, player, opts: OPTS });
      expect(a).toEqual(b);
      self.x = a.x;
      self.y = a.y;
    }
  });

  it.each(ALL_DEFS)('%s 的返回结构固定为 { x, y, shots, stomp, charging, windup, guard, melee, summon }', (defId) => {
    const r = stepBrain(createBrain(defId, { seed: 1 }), {
      dtMs: 16, self: { x: 200, y: 200, speed: 30, radius: 6 }, player: PLAYER, opts: OPTS,
    });
    expect(Object.keys(r).sort()).toEqual(['charging', 'guard', 'melee', 'shots', 'stomp', 'summon', 'windup', 'x', 'y']);
    expect(r.stomp).toBeNull();
    expect(r.melee).toBeNull();
    expect(r.summon).toBeNull();
    expect(Array.isArray(r.shots)).toBe(true);
    expect(typeof r.charging).toBe('boolean');
    expect(typeof r.windup).toBe('boolean');
    expect(typeof r.guard).toBe('boolean');
    expect(Number.isFinite(r.x)).toBe(true);
    expect(Number.isFinite(r.y)).toBe(true);
  });
});

describe('噬魂蝠：正弦摆动但净前进', () => {
  it('垂直偏移按 900ms 周期变化，振幅约 14px', () => {
    const brain = createBrain('bat', { seed: 11 });
    const player = { x: 200, y: 20 };            // 正上方：前进轴竖直，摆动轴水平
    const start = { x: 200, y: 220, speed: 60, radius: 5 };
    const quarter = BAT_RULE.periodMs / 4;
    const { trace } = simulate(brain, start, player, quarter, 4);
    const offsets = trace.map(r => r.x - 200);
    const ys = trace.map(r => r.y);

    expect(BAT_RULE.amplitude).toBe(14);
    expect(BAT_RULE.periodMs).toBe(900);
    expect(Math.abs(offsets[0])).toBeCloseTo(14, 6);
    expect(offsets[2]).toBeCloseTo(-offsets[0], 6);   // 半周期后摆到另一侧
    expect(offsets[1]).toBeCloseTo(0, 6);
    expect(offsets[3]).toBeCloseTo(0, 6);             // 整周期回到中轴

    // 净前进：每个四分之一周期都在向玩家方向缩短距离，一个周期共前进 speed × 0.9s
    expect(ys[0]).toBeLessThan(220);
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeLessThan(ys[i - 1]);
    expect(220 - ys[3]).toBeCloseTo(60 * (BAT_RULE.periodMs / 1000), 6);
  });

  it('速度倍率 1.6、血量与接触伤害都低于骷髅', () => {
    expect(ENEMY_TYPES.bat.speedMul).toBeCloseTo(1.6, 6);
    expect(ENEMY_TYPES.bat.hpMul).toBeLessThan(ENEMY_TYPES.skeleton.hpMul);
    expect(ENEMY_TYPES.bat.damage).toBeLessThan(ENEMY_TYPES.skeleton.damage);
  });
});

describe('腐尸：慢而厚的 lurch 节拍', () => {
  // 3s 平均位移：自身速度 × 3s 的 0.45~0.6 倍（保留「慢而厚」，但不再是匀速直线）
  const averageSpeedRatio = (steps, seed = 'avg') => {
    const speed = 20;
    const player = { x: 240, y: 170 };
    const { frames } = runFrames('corpse', {
      seed, start: { x: 240, y: 200, speed, radius: 8 }, player, steps, dtMs: 10,
    });
    const path = frames.reduce((sum, f) => sum + f.d, 0);
    return path / (speed * (steps * 10 / 1000));
  };

  it('3s 平均位移约为自身速度的 0.45~0.6 倍', () => {
    const ratio = averageSpeedRatio(300);
    expect(ratio).toBeGreaterThanOrEqual(0.45);
    expect(ratio).toBeLessThanOrEqual(0.6);
    // 慢而厚：明显低于匀速直线
    expect(ratio).toBeLessThan(0.9);
  });

  it('长跑（10 个完整节拍）平均位移仍落在 0.45~0.6 倍', () => {
    // 玩家缓慢后退拉怪（5px/s）：腐尸被迫反复「踱步→停顿→扑咬→收势」，不会骑在玩家身上
    const speed = 20;
    let player = { x: 240, y: 170 };
    const { frames } = runFrames('corpse', {
      seed: 'long', start: { x: 240, y: 200, speed, radius: 8 },
      steps: 2350,                                            // 2350ms = walk520+hold260+windup450+lunge320+recover800
      onFrame: () => (player = { x: player.x, y: player.y - 5 * 0.01 }),
    });
    const ratio = frames.reduce((sum, f) => sum + f.d, 0) / (speed * 23.5);
    expect(ratio).toBeGreaterThanOrEqual(0.45);
    expect(ratio).toBeLessThanOrEqual(0.6);
  });

  it('节拍：踱步 520 → 停顿 260 → 预警 450（冻结）→ 扑咬 320（1.5 倍速）→ 收势 800', () => {
    const tune = AI_PROFILE.corpse.tune;
    expect(tune.walkMs).toBe(520);
    expect(tune.holdMs).toBe(260);
    expect(tune.windupMs).toBe(450);
    expect(tune.lungeMs).toBe(320);
    expect(tune.lungeMul).toBe(1.5);
    expect(tune.recoverMs).toBe(800);
    expect(tune.triggerDist).toBe(40);

    const { frames } = runFrames('corpse', {
      seed: 1, start: { x: 240, y: 200, speed: 20, radius: 8 }, player: { x: 240, y: 170 }, steps: 320,
    });
    const blocks = blocksOf(frames);
    expect(blocks.slice(0, 5).map(b => b.mode)).toEqual(['walk', 'hold', 'windup', 'charge', 'recover']);

    // 各段时长（±1 帧，10ms）：切换帧算在下一段
    const want = [tune.walkMs, tune.holdMs, tune.windupMs, tune.lungeMs, tune.recoverMs];
    blocks.slice(0, 5).forEach((b, i) => {
      expect(Math.abs(b.len * 10 - want[i])).toBeLessThanOrEqual(20);
    });

    // 预警期间冻结；扑咬是步行 1.5 倍速
    const windupFrames = frames.filter(f => f.mode === 'windup');
    expect(windupFrames.every(f => f.d === 0 && f.windup === true)).toBe(true);
    const walkD = median(frames.filter(f => f.mode === 'walk').map(f => f.d));
    const lungeD = median(frames.filter(f => f.mode === 'charge').map(f => f.d));
    expect(walkD).toBeCloseTo(20 * 0.01, 6);
    expect(lungeD / walkD).toBeCloseTo(tune.lungeMul, 6);
    // 预警锁定快照：扑咬方向朝预警开始时的玩家位置
    expect(frames.find(f => f.mode === 'charge').charging).toBe(true);
  });

  it('血量倍率 2.2、接触伤害高于骷髅', () => {
    expect(ENEMY_TYPES.corpse.speedMul).toBeCloseTo(0.55, 6);
    expect(ENEMY_TYPES.corpse.hpMul).toBeCloseTo(2.2, 6);
    expect(ENEMY_TYPES.corpse.damage).toBeGreaterThan(ENEMY_TYPES.skeleton.damage);
  });
});

describe('邪教徒：抬手结束才用 leadAim 现算方向', () => {
  it('每 2.2s 一次 600ms 抬手；抬手不动，结束那一帧朝玩家新位置打 3 发扇形慢弹', () => {
    const brain = createBrain('cultist', { seed: 'cultist' });
    const startPlayer = { x: 240, y: 80 };
    const movedPlayer = { x: 240, y: 240 };
    let self = { x: 240, y: 150, speed: 40, radius: 6 };  // 与玩家距离正好 70
    let player = startPlayer;
    const frames = [];
    for (let i = 1; i <= 30; i++) {
      // 抬手进行中（t=2500）玩家绕到敌人另一侧：不再锁抬手开始时的快照
      if (i === 25) player = movedPlayer;
      const r = stepBrain(brain, {
        dtMs: 100, now: i * 100,
        self: { x: self.x, y: self.y, speed: self.speed, radius: self.radius },
        player, opts: OPTS,
      });
      frames.push({ t: i * 100, x: r.x, y: r.y, windup: r.windup, shots: r.shots });
      self = { ...self, x: r.x, y: r.y };
    }

    const rule = RANGED_RULES.cultist;
    const windupFrames = frames.filter(f => f.windup);
    expect(windupFrames).toHaveLength(rule.windupMs / 100);       // 600ms
    expect(windupFrames[0].t).toBe(CULTIST_RULE.attackMs);        // 2200
    const frozen = windupFrames.map(f => `${f.x.toFixed(6)},${f.y.toFixed(6)}`);
    expect(new Set(frozen).size).toBe(1);                         // 抬手期间完全不动

    const shotFrames = frames.filter(f => f.shots.length > 0);
    expect(shotFrames).toHaveLength(1);
    expect(shotFrames[0].t).toBe(CULTIST_RULE.attackMs + rule.windupMs); // 2800
    expect(shotFrames[0].windup).toBe(false);
    expect(shotFrames[0].shots).toHaveLength(rule.count);         // 3 发

    const shots = shotFrames[0].shots;
    for (const shot of shots) {
      expect(shot).toMatchObject({ kind: 'bolt', damage: OPTS.damage, radius: 3, lifeMs: rule.lifeMs });
      expect(Math.hypot(shot.vx, shot.vy)).toBeCloseTo(rule.speed, 5);
      expect(rule.speed).toBeLessThan(96);                        // 慢于玩家，能躲
    }

    // 中轴朝「发射那一帧」的玩家位置，而不是抬手开始时的旧位置
    const launch = windupFrames[0];
    const mid = shots[1];
    const angleToNew = Math.atan2(movedPlayer.y - launch.y, movedPlayer.x - launch.x);
    const angleToOld = Math.atan2(startPlayer.y - launch.y, startPlayer.x - launch.x);
    expect(Math.atan2(mid.vy, mid.vx)).toBeCloseTo(angleToNew, 4);
    expect(Math.abs(Math.atan2(mid.vy, mid.vx) - angleToOld)).toBeGreaterThan(1);

    // 扇形总张角 0.32rad：中间发居中，两侧各 ±0.16
    const angles = shots.map(s => Math.atan2(s.vy, s.vx));
    expect(angles[1]).toBeCloseTo(angleToNew, 4);
    expect(Math.abs(angles[2] - angles[0])).toBeCloseTo(rule.spread, 5);

    // 不再写 brain.aim 快照用于瞄准
    expect(brain.aim).toBeNull();
  });

  it('玩家贴脸时后退，不硬贴', () => {
    const brain = createBrain('cultist', { seed: 3 });
    const player = { x: 240, y: 150 };
    const start = { x: 240, y: 165, speed: 40, radius: 6 }; // 距离 15 < 贴近阈值
    const d0 = distance(start, player);
    const { pos } = simulate(brain, start, player, 100, 5);
    expect(distance(pos, player)).toBeGreaterThan(d0);
  });

  it('距离过远时会朝玩家缩短到环绕圈附近', () => {
    const brain = createBrain('cultist', { seed: 5 });
    const player = { x: 240, y: 120 };
    const start = { x: 240, y: 250, speed: 40, radius: 6 }; // 距离 130
    const { pos } = simulate(brain, start, player, 50, 20); // 1000ms，尚未进入预警
    const d = distance(pos, player);
    expect(d).toBeLessThan(130);
    expect(d).toBeGreaterThan(55);
  });
});

describe('亡灵骑士：预警 → 冲锋 → 复位', () => {
  it('2.6s 后 600ms 预警；冲锋速度约 3.2 倍步行，冲过目标后恢复步行并重置计时', () => {
    const brain = createBrain('knight', { seed: 'knight' });
    const player = { x: 220, y: 100 };
    let self = { x: 100, y: 100, speed: 40, radius: 8 };
    const frames = [];
    for (let i = 1; i <= 40; i++) {
      const before = { ...self };
      const r = stepBrain(brain, {
        dtMs: 100, now: i * 100,
        self: { x: self.x, y: self.y, speed: self.speed, radius: self.radius },
        player, opts: OPTS,
      });
      frames.push({ t: i * 100, d: Math.hypot(r.x - before.x, r.y - before.y), x: r.x, y: r.y, charging: r.charging, windup: r.windup, chargeIn: brain.chargeIn });
      self = { ...self, x: r.x, y: r.y };
    }

    const windupFrames = frames.filter(f => f.windup);
    expect(windupFrames[0].t).toBe(KNIGHT_RULE.intervalMs);   // 2600
    expect(windupFrames.length).toBe(6);                      // 600ms
    const frozenAnchor = windupFrames[0];
    expect(windupFrames.slice(1).every(f => f.d === 0 && f.x === frozenAnchor.x && f.y === frozenAnchor.y)).toBe(true);

    const walkFrame = frames[1];                              // 100~200ms，纯步行
    const chargeFrame = frames.find(f => f.charging && f.d > 0);
    expect(chargeFrame.d / walkFrame.d).toBeCloseTo(KNIGHT_RULE.chargeSpeedMul, 2);
    expect(chargeFrame.d).toBeGreaterThan(walkFrame.d * 2.5);

    // 冲过目标点后复位：恢复步行、重置 2.6s 计时（复位当帧 chargeIn 回到 2600，之后继续步行倒计时）
    const lastCharge = frames.findLastIndex(f => f.charging);
    expect(frames[lastCharge + 1].chargeIn).toBe(KNIGHT_RULE.intervalMs);
    expect(brain.mode).toBe('walk');
    expect(frames.at(-1).charging).toBe(false);
    expect(frames.at(-1).windup).toBe(false);
  });

  it('没冲到目标也会在 1.2s 后停下恢复步行', () => {
    const brain = createBrain('knight', { seed: 2 });
    const player = { x: 450, y: 100 };
    let self = { x: 100, y: 100, speed: 10, radius: 8 };
    const frames = [];
    for (let i = 1; i <= 50; i++) {
      const before = { ...self };
      const r = stepBrain(brain, {
        dtMs: 100, now: i * 100,
        self: { x: self.x, y: self.y, speed: self.speed, radius: self.radius },
        player, opts: OPTS,
      });
      frames.push({ t: i * 100, d: Math.hypot(r.x - before.x, r.y - before.y), x: r.x, y: r.y, charging: r.charging, windup: r.windup });
      self = { ...self, x: r.x, y: r.y };
    }
    const chargeFrames = frames.filter(f => f.charging);
    expect(chargeFrames.length).toBe(12);                     // 1.2s / 100ms
    const afterCharge = frames.find(f => f.t === 4500);
    expect(afterCharge.charging).toBe(false);
    expect(afterCharge.d).toBeCloseTo(1, 6);                  // 回到 speed=10 的步行
  });

  it('预警锁定快照：玩家预警中跑开，冲锋方向仍朝旧点', () => {
    const brain = createBrain('knight', { seed: 4 });
    let self = { x: 100, y: 100, speed: 40, radius: 8 };
    let player = { x: 220, y: 100 };
    const playerMoved = { x: 100, y: 260 };
    let sawWindup = false, sawChargeAfterWindup = false;
    for (let i = 1; i <= 40; i++) {
      if (sawWindup && !sawChargeAfterWindup && brain.mode === 'windup') player = playerMoved;
      const r = stepBrain(brain, {
        dtMs: 100, now: i * 100,
        self: { x: self.x, y: self.y, speed: self.speed, radius: self.radius },
        player, opts: OPTS,
      });
      self = { x: r.x, y: r.y };
      if (r.windup) sawWindup = true;
      if (r.charging) {
        sawChargeAfterWindup = true;
        expect(brain.dir.x).toBeGreaterThan(0.99);            // 仍朝出生点的 +x 方向，没有拐向新玩家
        expect(Math.abs(brain.dir.y)).toBeLessThan(1e-6);
        break;
      }
    }
    expect(sawWindup).toBe(true);
    expect(sawChargeAfterWindup).toBe(true);
  });
});

describe('缝合尸魁：贴身践踏事件', () => {
  const STOMP_OPTS = { BATTLE: DEFAULT_BATTLE, damage: 14 };

  it('贴身 26px 时每 0.8s 产出一个 stomp 事件，站位固定且伤害来自 opts', () => {
    const brain = createBrain('stitch_abomination', { seed: 'stitch' });
    const player = { x: 240, y: 150 };
    let self = { x: 240, y: 160, speed: 20, radius: 14 }; // 距离 10 ≤ 26
    const frames = [];
    for (let i = 1; i <= 24; i++) {
      const r = stepBrain(brain, {
        dtMs: 100, now: i * 100, self: { ...self }, player, opts: STOMP_OPTS,
      });
      frames.push({ t: i * 100, ...r });
      self = { x: r.x, y: r.y };
    }

    const stompFrames = frames.filter(item => item.stomp);
    expect(stompFrames.map(item => item.t)).toEqual([800, 1600, 2400]);
    expect(brain.stomps).toBe(3);
    expect(stompFrames[0].stomp).toMatchObject({
      x: 240, y: 160, radius: STITCH_RULE.stompDist, damage: STOMP_OPTS.damage,
    });
    expect(frames.every(item => item.x === 240 && item.y === 160)).toBe(true); // 贴身站定
    expect(frames.filter(item => !item.stomp).every(item => item.stomp === null)).toBe(true);
  });

  it('远处只接近不践踏，进入范围后第 800ms 才第一次践踏', () => {
    const brain = createBrain('stitch_abomination', { seed: 'stitch2' });
    let self = { x: 240, y: 160, speed: 20, radius: 14 };
    let player = { x: 240, y: 400 };

    let r = stepBrain(brain, { dtMs: 100, now: 100, self: { ...self }, player, opts: STOMP_OPTS });
    expect(r.stomp).toBeNull();
    expect(r.y).toBeGreaterThan(160);                     // 慢速接近
    self = { x: r.x, y: r.y };

    player = { x: self.x, y: self.y - 10 };               // 贴身
    const stamps = [];
    for (let i = 1; i <= 8; i++) {
      r = stepBrain(brain, { dtMs: 100, now: 100 + i * 100, self: { ...self }, player, opts: STOMP_OPTS });
      self = { x: r.x, y: r.y };
      if (r.stomp) stamps.push(100 + i * 100);
    }
    expect(stamps).toEqual([900]);
  });

  it('蓄力不足 0.8s 就离开范围，再贴身需重新蓄满', () => {
    const brain = createBrain('stitch_abomination', { seed: 'stitch3' });
    let self = { x: 240, y: 160, speed: 20, radius: 14 };
    let player = { x: 240, y: 150 };
    let early = false;
    for (let i = 0; i < 5; i++) {                          // 贴身 500ms，不满 0.8s
      const r = stepBrain(brain, { dtMs: 100, now: i * 100, self: { ...self }, player, opts: STOMP_OPTS });
      self = { x: r.x, y: r.y };
      if (r.stomp) early = true;
    }
    expect(early).toBe(false);

    let r = stepBrain(brain, { dtMs: 100, now: 600, self: { ...self }, player: { x: 240, y: 400 }, opts: STOMP_OPTS });
    expect(r.stomp).toBeNull();                            // 离开范围，蓄力重置
    self = { x: r.x, y: r.y };

    player = { x: self.x, y: self.y - 5 };
    let hitAt = null;
    for (let i = 1; i <= 8; i++) {
      r = stepBrain(brain, { dtMs: 100, now: 600 + i * 100, self: { ...self }, player, opts: STOMP_OPTS });
      self = { x: r.x, y: r.y };
      if (r.stomp) { hitAt = 600 + i * 100; break; }
    }
    expect(hitAt).toBe(1400);                              // 重新蓄满 800ms 才践踏
  });

  it('非法 dt 不推进践踏计时', () => {
    const brain = createBrain('stitch_abomination', { seed: 1 });
    const before = structuredClone(brain);
    const r = stepBrain(brain, {
      dtMs: NaN, self: { x: 240, y: 160, speed: 20, radius: 14 }, player: { x: 240, y: 150 }, opts: STOMP_OPTS,
    });
    expect(r.stomp).toBeNull();
    expect(brain).toEqual(before);
  });
});

describe('咒誓主教：侧翼瞬移与三连弹', () => {
  const BISHOP_OPTS = { BATTLE: DEFAULT_BATTLE, damage: 10 };

  it('4.2s 瞬移到玩家侧翼约 110px，抬手 550ms 后按 0.15s 间隔三连弹', () => {
    const brain = createBrain('oath_bishop', { seed: 'bishop' });
    const player = { x: 240, y: 240 };
    let self = { x: 240, y: 150, speed: 40, radius: 12 };
    const frames = [];
    for (let i = 1; i <= 110; i++) {                       // 5500ms，覆盖一次完整连弹
      const before = { ...self };
      const r = stepBrain(brain, {
        dtMs: 50, now: i * 50,
        self: { x: self.x, y: self.y, speed: self.speed, radius: self.radius },
        player, opts: BISHOP_OPTS,
      });
      frames.push({
        t: i * 50, x: r.x, y: r.y,
        jump: Math.hypot(r.x - before.x, r.y - before.y),
        windup: r.windup, shot: r.shots[0] ?? null,
      });
      self = { x: r.x, y: r.y };
    }

    const rule = RANGED_RULES.oath_bishop;
    const blink = frames.find(item => item.jump > 50);
    expect(blink.t).toBe(OATH_RULE.blinkMs);                          // 4200ms
    expect(Math.hypot(blink.x - player.x, blink.y - player.y)).toBeCloseTo(OATH_RULE.holdDist, 6);
    expect(brain.blinks).toBe(1);

    // 瞬移那一帧就进入抬手，抬手持续 550ms（11 帧 × 50ms），期间站定
    const windupFrames = frames.filter(item => item.t >= blink.t && item.windup);
    expect(windupFrames.map(item => item.t)).toEqual([
      4200, 4250, 4300, 4350, 4400, 4450, 4500, 4550, 4600, 4650, 4700,
    ]);
    expect(windupFrames.length * 50).toBe(rule.windupMs);             // 550

    const shotFrames = frames.filter(item => item.shot);
    expect(shotFrames.map(item => item.t)).toEqual([4750, 4900, 5050]);
    for (let i = 1; i < shotFrames.length; i++) {
      expect(shotFrames[i].t - shotFrames[i - 1].t).toBe(rule.gapMs); // 150
    }
    expect(shotFrames.every(item => item.shot.damage === BISHOP_OPTS.damage)).toBe(true);
    expect(shotFrames.every(item => item.shot.kind === 'bolt')).toBe(true);
    expect(shotFrames.every(item => item.shot.lifeMs === rule.lifeMs)).toBe(true);
    expect(Math.hypot(shotFrames[0].shot.vx, shotFrames[0].shot.vy)).toBeCloseTo(rule.speed, 5);

    // 每发都朝发射帧的玩家位置（玩家不动时即瞬移点的朝向）
    const aimAngle = Math.atan2(player.y - blink.y, player.x - blink.x);
    expect(Math.atan2(shotFrames[0].shot.vy, shotFrames[0].shot.vx)).toBeCloseTo(aimAngle, 5);

    // 抬手与三连弹期间完全站定
    const stopped = frames.filter(item => item.t >= blink.t && item.t <= 5050);
    expect(stopped.every(item => item.x === blink.x && item.y === blink.y)).toBe(true);

    // 远程抬手不写 aim 快照
    expect(brain.aim).toBeNull();
  });

  it('瞬移左右由 seed 确定性决定：同 seed 同轨迹（含瞬移点）', () => {
    const run = (seed) => {
      const brain = createBrain('oath_bishop', { seed });
      const player = { x: 240, y: 240 };
      let self = { x: 240, y: 150, speed: 40, radius: 12 };
      const out = [];
      for (let i = 0; i < 100; i++) {
        const r = stepBrain(brain, {
          dtMs: 50, now: i * 50,
          self: { x: self.x, y: self.y, speed: self.speed, radius: self.radius },
          player, opts: BISHOP_OPTS,
        });
        self = { x: r.x, y: r.y };
        out.push([r.x, r.y]);
      }
      return out;
    };
    expect(run('alpha')).toEqual(run('alpha'));
  });

  it('空闲时维持约 110px：过远会靠近，过近会退开', () => {
    const player = { x: 240, y: 240 };
    const far = simulate(createBrain('oath_bishop', { seed: 7 }), { x: 240, y: 60, speed: 40, radius: 12 }, player, 100, 10);
    expect(distance(far.pos, player)).toBeLessThan(180);
    const near = simulate(createBrain('oath_bishop', { seed: 8 }), { x: 240, y: 180, speed: 40, radius: 12 }, player, 100, 10);
    expect(distance(near.pos, player)).toBeGreaterThan(60);
  });

  it('非法 dt 不推进瞬移/连弹状态', () => {
    const brain = createBrain('oath_bishop', { seed: 1 });
    const before = structuredClone(brain);
    const r = stepBrain(brain, {
      dtMs: NaN, self: { x: 240, y: 150, speed: 40, radius: 12 }, player: { x: 240, y: 240 }, opts: BISHOP_OPTS,
    });
    expect(r.shots).toEqual([]);
    expect(r.stomp).toBeNull();
    expect(brain).toEqual(before);
  });
});

describe('非法输入与超界：不崩、不产生非有限坐标', () => {
  it.each([Number.NaN, -1, -0.5, Infinity, -Infinity, 'abc', undefined])('dt=%j 不推进状态也不抛错', (dt) => {
    const brain = createBrain('knight', { seed: 'bad' });
    const before = structuredClone(brain);
    const result = stepBrain(brain, {
      dtMs: dt, now: 0, self: { x: 200, y: 200, speed: 40, radius: 8 }, player: { x: 240, y: 100 }, opts: OPTS,
    });
    expect(result.x).toBe(200);
    expect(result.y).toBe(200);
    expect(result.shots).toEqual([]);
    expect(result.stomp).toBeNull();
    expect(brain).toEqual(before);
  });

  it.each(ALL_DEFS)('%s 面对 NaN / 无穷 / 超界坐标仍返回有限数', (defId) => {
    const cases = [
      { x: NaN, y: NaN, speed: 30 },
      { x: Infinity, y: -Infinity, speed: 30 },
      { x: 1e12, y: -1e12, speed: 30 },
      { x: -1e12, y: 1e12, speed: 30 },
    ];
    for (const self of cases) {
      const result = stepBrain(createBrain(defId, { seed: 1 }), {
        dtMs: 33, self, player: { x: -1e12, y: 1e12 }, opts: OPTS,
      });
      expect(Number.isFinite(result.x)).toBe(true);
      expect(Number.isFinite(result.y)).toBe(true);
      for (const shot of result.shots) {
        expect(Number.isFinite(shot.x)).toBe(true);
        expect(Number.isFinite(shot.y)).toBe(true);
        expect(Number.isFinite(shot.vx)).toBe(true);
        expect(Number.isFinite(shot.vy)).toBe(true);
      }
    }
  });

  it('非法 brain / 缺省输入 / 未知 defId 都可安全调用', () => {
    for (const bad of [null, undefined, {}, { defId: 'dragon' }, 42]) {
      expect(() => stepBrain(bad, {
        dtMs: 16, self: { x: 3, y: 4, speed: 10 }, player: { x: 5, y: 6 },
      })).not.toThrow();
      const result = stepBrain(bad, { dtMs: 16, self: { x: 3, y: 4, speed: 10 }, player: { x: 5, y: 6 } });
      expect(Number.isFinite(result.x)).toBe(true);
      expect(Number.isFinite(result.y)).toBe(true);
      expect(result.shots).toEqual([]);
    }
    expect(() => stepBrain(createBrain('cultist'), undefined)).not.toThrow();
    expect(createBrain('dragon').defId).toBe('skeleton');
  });

  it('超大 dt 被截断，结果仍是有限坐标', () => {
    const result = stepBrain(createBrain('skeleton', { seed: 1 }), {
      dtMs: 1e9, self: { x: 0, y: 0, speed: 40 }, player: { x: 10, y: 10 }, opts: OPTS,
    });
    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.y)).toBe(true);
    expect(Math.abs(result.y)).toBeLessThan(1000);
  });
});

describe('Enemy 实体接线', () => {
  function fakeScene(player) {
    const g = {
      clear() {}, fillStyle() {}, fillRect() {}, fillPoints() {}, setDepth() { return g; }, destroy() {},
    };
    return {
      player,
      engine: { now: 0 },
      grid: { cells: [] },
      add: { graphics: () => g },
      hostile: [],
      addHostileShot(shot) { this.hostile.push(shot); },
    };
  }

  it('邪教徒的 3 发扇形弹由 Enemy 逐发转发给 scene.addHostileShot', () => {
    const scene = fakeScene({ x: 240, y: 80 });
    const enemy = new Enemy(scene, ENEMY_TYPES.cultist, 240, 150, { x: 240, y: 80 }, 20, 40, 8, 1);
    for (let i = 0; i < 29; i++) enemy.update(100, (i + 1) * 100);
    expect(scene.hostile).toHaveLength(RANGED_RULES.cultist.count);
    expect(scene.hostile.every(shot => shot.damage === 8)).toBe(true);
    expect(scene.hostile.every(shot => shot.lifeMs > 0)).toBe(true);
  });

  it('咒誓主教的瞬移三连弹经 Enemy 转发给 scene.addHostileShot', () => {
    const scene = fakeScene({ x: 240, y: 200 });
    const enemy = new Enemy(scene, ENEMY_TYPES.oath_bishop, 240, 120, { x: 240, y: 200 }, 35, 40, 10, 5);
    for (let i = 0; i < 101; i++) enemy.update(50, (i + 1) * 50);
    expect(scene.hostile).toHaveLength(3);
    expect(scene.hostile.every(shot => shot.damage === 10)).toBe(true);
  });

  it('场景没有 addHostileShot 时静默跳过', () => {
    const scene = fakeScene({ x: 240, y: 80 });
    delete scene.addHostileShot;
    const enemy = new Enemy(scene, ENEMY_TYPES.cultist, 240, 150, { x: 240, y: 80 }, 20, 40, 8, 2);
    expect(() => { for (let i = 0; i < 29; i++) enemy.update(100, (i + 1) * 100); }).not.toThrow();
  });

  it('亡灵骑士冲锋时接触伤害提高，冲锋结束恢复', () => {
    const scene = fakeScene({ x: 240, y: 200 });
    const enemy = new Enemy(scene, ENEMY_TYPES.knight, 240, 100, { x: 240, y: 200 }, 50, 40, 12, 3);
    let boosted = false;
    for (let i = 0; i < 40; i++) {
      enemy.update(100, (i + 1) * 100);
      if (enemy.charging) {
        boosted = true;
        expect(enemy.damage).toBe(30);
      }
    }
    expect(boosted).toBe(true);
    expect(enemy.damage).toBe(12);
  });
});

// ---------- 2026-11 AI 差异化：14 个新行为的逐条节拍 ----------
describe('新行为逐条节拍', () => {
  const nearFrame = (actual, expected) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(20);

  it('腐尸 lurch：玩家不在 40px 内时只踱步/停顿，不预警也不扑咬', () => {
    const { frames } = runFrames('corpse', {
      start: { x: 240, y: 200, speed: 20, radius: 8 }, player: { x: 240, y: 100 }, steps: 300,
    });
    expect(frames.some(f => f.mode === 'charge')).toBe(false);
    expect(frames.some(f => f.windup)).toBe(false);
    const modes = new Set(frames.map(f => f.mode));
    expect(modes.has('walk')).toBe(true);
    expect(modes.has('hold')).toBe(true);
  });

  it('齿轮傀儡 spring：700ms 走位 → 420ms 预警 → 600ms 1.9 倍速弹射，charging 恒为 false', () => {
    const tune = AI_PROFILE.clockwork_doll.tune;
    const { frames } = runFrames('clockwork_doll', {
      start: { x: 240, y: 200, speed: 30, radius: 8 }, player: { x: 240, y: 60 }, steps: 300,
    });
    const blocks = blocksOf(frames);
    expect(blocks.slice(0, 4).map(b => b.mode)).toEqual(['walk', 'windup', 'dash', 'recover']);
    nearFrame(blocks[1].len * 10, tune.windupMs);
    nearFrame(blocks[2].len * 10, tune.dashMs);
    nearFrame(blocks[3].len * 10, tune.recoverMs);
    expect(frames[0].t).toBe(10);
    expect(blocks[1].start).toBe(tune.walkMs);
    // 弹射不吃 ×2.5 接触伤害：charging 全程 false
    expect(frames.every(f => f.charging === false)).toBe(true);
    const walkD = median(frames.filter(f => f.mode === 'walk').map(f => f.d));
    const dashD = median(frames.filter(f => f.mode === 'dash').map(f => f.d));
    expect(dashD / walkD).toBeCloseTo(tune.dashMul, 6);
    // 预警与收势站定（跳过切换帧）
    expect(steady(frames).filter(f => f.mode === 'recover').every(f => f.d === 0)).toBe(true);
  });

  it('纸页傀儡 bulwark：每 3s 举盾 900ms，guard=true 且移速 ×0.4', () => {
    const tune = AI_PROFILE.page_golem.tune;
    const { frames } = runFrames('page_golem', {
      start: { x: 240, y: 200, speed: 30, radius: 10 }, player: { x: 240, y: 100 }, steps: 400,
    });
    const guardFrames = frames.filter(f => f.guard);
    expect(guardFrames.length).toBeGreaterThanOrEqual(88);
    expect(guardFrames.length).toBeLessThanOrEqual(92);
    expect(guardFrames[0].t).toBe(tune.guardEveryMs);         // 3000
    expect(guardFrames.every(f => f.windup === false)).toBe(true);
    const approachD = 30 * tune.approachMul * 0.01;
    const guardD = approachD * tune.guardSlowMul;             // 0.4 倍
    expect(median(frames.filter(f => !f.guard).map(f => f.d))).toBeCloseTo(approachD, 6);
    expect(median(guardFrames.slice(1).map(f => f.d))).toBeCloseTo(guardD, 6);
    expect(guardD / approachD).toBeCloseTo(0.4, 6);
  });

  it('炉渣兽 eruption：3.8s 到点 + 0.7s 预警后砸出 40px 圈，伤害 ×1.6', () => {
    const tune = AI_PROFILE.slag_beast.tune;
    // 玩家保持在近战半径（34px）之外：这里只验证 eruption 自身的节拍，近战另测
    const { frames } = runFrames('slag_beast', {
      start: { x: 240, y: 200, speed: 20, radius: 12 }, player: { x: 240, y: 80 }, steps: 600,
    });
    const stomps = frames.filter(f => f.stomp);
    expect(stomps).toHaveLength(1);                            // 6s 内只有一次（间隔 3.8s）
    expect(stomps[0].t).toBe(tune.intervalMs + tune.windupMs); // 4500
    expect(stomps[0].stomp.radius).toBe(40);
    expect(stomps[0].stomp.damage).toBe(Math.round(OPTS.damage * 1.6)); // 13
    // 预警段 700ms 站定（进入预警的那一帧仍带一次 approach，之后冻结）
    const windups = frames.filter(f => f.windup);
    nearFrame(windups.length * 10, tune.windupMs);
    expect(windups.slice(1).every(f => f.d === 0)).toBe(true);
    expect(frames.some(f => f.melee)).toBe(false);             // 距离 44px > 近战半径
  });

  it('枷锁守卫 chain：环带 110px，3.2s 预警 1s 后 110ms 间隔两连弹', () => {
    const tune = AI_PROFILE.shackle_guard.tune;
    const { frames } = runFrames('shackle_guard', {
      start: { x: 240, y: 200, speed: 30, radius: 11 }, player: { x: 240, y: 90 }, steps: 600,
    });
    expect(tune.holdDist).toBe(110);
    const windups = frames.filter(f => f.windup);
    expect(windups[0].t).toBe(tune.intervalMs);                // 3200
    nearFrame(windups.length * 10, tune.windupMs);             // 1000
    const shots = frames.filter(f => f.shots.length);
    expect(shots.map(f => f.t)).toEqual([4200, 4310]);
    for (const f of shots) {
      const shot = f.shots[0];
      expect(Math.hypot(shot.vx, shot.vy)).toBeCloseTo(tune.shotSpeed, 5);   // 120
      expect(shot.lifeMs).toBe(tune.shotLifeMs);                              // 1600
      expect(shot.damage).toBe(Math.round(OPTS.damage * tune.damageMul));     // 9
    }
    // 两发之间站定
    const between = frames.filter(f => f.t > 4200 && f.t < 4310);
    expect(between.every(f => f.d === 0)).toBe(true);
  });

  it('符纹蛛 skitter：380ms 直线 1.7 倍速 → 160ms 侧移 1.3 倍速，侧移不超过 40px', () => {
    const tune = AI_PROFILE.rune_spider.tune;
    const { frames } = runFrames('rune_spider', {
      start: { x: 240, y: 200, speed: 30, radius: 5 }, player: { x: 240, y: 60 }, steps: 120,
    });
    const straightD = median(frames.filter(f => f.mode === 'walk').map(f => f.d));
    const lateralD = median(frames.filter(f => f.mode === 'lateral').map(f => f.d));
    expect(straightD).toBeCloseTo(30 * tune.straightMul * 0.01, 6);   // 0.51
    expect(lateralD).toBeCloseTo(30 * tune.lateralMul * 0.01, 6);     // 0.39
    // 只取第一段侧移（120 帧里会出现两段）
    const startI = frames.findIndex(f => f.mode === 'lateral');
    const run = [];
    for (let i = startI; i < frames.length && frames[i].mode === 'lateral'; i++) run.push(frames[i]);
    nearFrame(run.length * 10, tune.lateralMs);
    // 玩家在正上方：侧移方向是水平轴
    const dir = run[0].dir;
    expect(Math.abs(dir.y)).toBeLessThan(1e-9);
    expect(Math.abs(dir.x)).toBeCloseTo(1, 6);
    // 单段侧移不超过 lateralDist（首帧还带着直线位移，从第二帧量起）
    const real = run.slice(1);
    if (real.length > 1) {
      const span = Math.hypot(real.at(-1).x - real[1].x, real.at(-1).y - real[1].y);
      expect(span).toBeLessThanOrEqual(tune.lateralDist + tune.lateralMul * 30 * 0.01);
    }
  });

  it('幽誓女妖 stalk：环带 120px，3s 预警 0.5s 后 2.1 倍速突进 0.55s，回收 0.9s', () => {
    const tune = AI_PROFILE.wraith.tune;
    const { frames } = runFrames('wraith', {
      start: { x: 240, y: 200, speed: 30, radius: 6 }, player: { x: 240, y: 80 }, steps: 700,
    });
    const blocks = blocksOf(frames);
    const windupBlock = blocks.find(b => b.mode === 'windup');
    expect(windupBlock.start).toBe(tune.intervalMs);           // 3000
    nearFrame(windupBlock.len * 10, tune.windupMs);            // 500
    const chargeBlock = blocks.find(b => b.mode === 'charge');
    nearFrame(chargeBlock.len * 10, tune.dashMs);              // 550
    const recoverBlock = blocks.find(b => b.mode === 'recover');
    nearFrame(recoverBlock.len * 10, tune.recoverMs);          // 900
    // 绕圈时 walk 只有 orbitMul 的切向速度，所以按「满速 × dashMul」比绝对值
    const dashD = median(frames.filter(f => f.mode === 'charge').map(f => f.d));
    expect(dashD).toBeCloseTo(30 * tune.dashMul * 0.01, 6);    // 2.1
    expect(frames.filter(f => f.mode === 'charge').every(f => f.charging === true)).toBe(true);
    expect(steady(frames).filter(f => f.mode === 'recover').every(f => f.d === 0)).toBe(true);
  });

  it('墨灵 drift：每 1.6s 瞬移 40~60px，且与玩家保持 ≥26px', () => {
    const tune = AI_PROFILE.ink_wisp.tune;
    const player = { x: 240, y: 60 };
    const { frames } = runFrames('ink_wisp', {
      start: { x: 240, y: 200, speed: 30, radius: 7 }, player, steps: 500,
    });
    const jumps = frames.filter(f => f.d > 30);
    expect(jumps.map(f => f.t)).toEqual([1600, 3200, 4800]);
    for (const jump of jumps) {
      expect(jump.d).toBeGreaterThanOrEqual(tune.blinkMin - 1);   // 40 - 一帧游走
      expect(jump.d).toBeLessThanOrEqual(tune.blinkMax + 1);      // 60 + 一帧游走
    }
    for (const f of frames) {
      expect(distance(f, player)).toBeGreaterThanOrEqual(tune.minPlayerDist - 1e-6);
    }
  });

  it('判词幽灵 lance：环带 130px，3s 抬手 0.7s 后打一发 160 速高速弹', () => {
    const tune = AI_PROFILE.verdict_wraith.tune;
    const rule = RANGED_RULES.verdict_wraith;
    const { frames } = runFrames('verdict_wraith', {
      start: { x: 240, y: 220, speed: 30, radius: 7 }, player: { x: 240, y: 90 }, steps: 500,
    });
    expect(tune.holdDist).toBe(130);
    const windups = frames.filter(f => f.windup);
    expect(windups[0].t).toBe(tune.intervalMs);                // 3000
    nearFrame(windups.length * 10, rule.windupMs);             // 700
    const shotFrame = frames.find(f => f.shots.length);
    expect(shotFrame.t).toBe(tune.intervalMs + rule.windupMs); // 3700
    const shot = shotFrame.shots[0];
    expect(shot.kind).toBe('bolt');
    expect(Math.hypot(shot.vx, shot.vy)).toBeCloseTo(rule.speed, 5); // 160
    expect(shot.lifeMs).toBe(rule.lifeMs);                            // 1100
    expect(shot.damage).toBe(OPTS.damage);                            // §4 表未给倍率
  });

  it('晓色之影 mirror：沿玩家上一段位移方向冲刺 0.42s（1.7 倍速）', () => {
    const tune = AI_PROFILE.dawn_shade.tune;
    // 玩家持续朝 +x 走，mirror 应该朝 +x 冲，而不是朝玩家当前位置
    const { frames } = runFrames('dawn_shade', {
      start: { x: 240, y: 200, speed: 30, radius: 8 }, steps: 260,
      onFrame: (i) => ({ x: 100 + (i + 1) * 2, y: 200 }),
    });
    const dashFrames = frames.filter(f => f.mode === 'dash');
    nearFrame(dashFrames.length * 10, tune.dashMs);            // 420
    expect(dashFrames[0].t).toBe(tune.cooldownMs);             // 2000
    expect(dashFrames.every(f => f.charging === false)).toBe(true); // 复刻走位，不吃 ×2.5
    for (const f of dashFrames) {
      expect(f.dir.x).toBeCloseTo(1, 6);
      expect(Math.abs(f.dir.y)).toBeLessThan(1e-9);
    }
    const dashD = median(dashFrames.map(f => f.d));
    expect(dashD).toBeCloseTo(30 * tune.dashMul * 0.01, 6);    // 1.7
  });

  it('火星精 dart：280ms 2 倍速冲刺 / 260ms 停顿，脉冲式贴脸', () => {
    const tune = AI_PROFILE.ember_imp.tune;
    const { frames } = runFrames('ember_imp', {
      start: { x: 240, y: 200, speed: 30, radius: 6 }, player: { x: 240, y: 60 }, steps: 120,
    });
    const blocks = blocksOf(frames);
    expect(blocks.slice(0, 4).map(b => b.mode)).toEqual(['sprint', 'pause', 'sprint', 'pause']);
    nearFrame(blocks[0].len * 10, tune.sprintMs);              // 280
    nearFrame(blocks[1].len * 10, tune.pauseMs);               // 260
    const sprintD = median(frames.filter(f => f.mode === 'sprint').map(f => f.d));
    expect(sprintD).toBeCloseTo(30 * tune.sprintMul * 0.01, 6); // 0.6
    expect(steady(frames).filter(f => f.mode === 'pause').every(f => f.d === 0)).toBe(true);
  });

  it('熔岩石像鬼 slam_charge：3.4s 预警 0.9s → 2.6 倍速冲锋 0.9s → 500ms 硬直', () => {
    const tune = AI_PROFILE.stone_gargoyle.tune;
    const { frames } = runFrames('stone_gargoyle', {
      start: { x: 240, y: 200, speed: 30, radius: 9 }, player: { x: 240, y: 60 }, steps: 600,
    });
    const blocks = blocksOf(frames);
    const windupBlock = blocks.find(b => b.mode === 'windup');
    expect(windupBlock.start).toBe(tune.intervalMs);           // 3400
    nearFrame(windupBlock.len * 10, tune.windupMs);            // 900
    const chargeBlock = blocks.find(b => b.mode === 'charge');
    nearFrame(chargeBlock.len * 10, tune.chargeMs);            // 900
    const staggerBlock = blocks.find(b => b.mode === 'stagger');
    nearFrame(staggerBlock.len * 10, tune.staggerMs);          // 500
    const walkD = median(frames.filter(f => f.mode === 'walk').map(f => f.d));
    const chargeD = median(frames.filter(f => f.mode === 'charge').map(f => f.d));
    expect(chargeD / walkD).toBeCloseTo(tune.chargeMul, 6);    // 2.6
    expect(steady(frames).filter(f => f.mode === 'stagger').every(f => f.d === 0)).toBe(true);
  });

  it('黄铜守誓者 double_charge：3s 一套两段冲锋，中间 320ms 短停', () => {
    const tune = AI_PROFILE.brass_warden.tune;
    const { frames } = runFrames('brass_warden', {
      start: { x: 240, y: 220, speed: 30, radius: 12 }, player: { x: 240, y: 100 }, steps: 800,
    });
    const blocks = blocksOf(frames);
    expect(blocks.slice(0, 6).map(b => b.mode)).toEqual(['walk', 'windup', 'charge', 'pause', 'charge', 'recover']);
    nearFrame(blocks[1].len * 10, tune.windupMs);              // 650
    nearFrame(blocks[2].len * 10, tune.chargeMs);              // 800
    nearFrame(blocks[3].len * 10, tune.pauseMs);               // 320
    nearFrame(blocks[4].len * 10, tune.secondChargeMs);        // 700
    nearFrame(blocks[5].len * 10, tune.cooldownMs);            // 2400
    const charges = frames.filter(f => f.mode === 'charge');
    expect(charges.length).toBe(tune.chargeMs / 10 + tune.secondChargeMs / 10);
    expect(charges.every(f => f.charging === true)).toBe(true);
    const walkD = median(frames.filter(f => f.mode === 'walk').map(f => f.d));
    const chargeD = median(charges.map(f => f.d));
    expect(chargeD / walkD).toBeCloseTo(tune.chargeMul, 6);    // 2.4
    expect(steady(frames).filter(f => f.mode === 'pause').every(f => f.d === 0)).toBe(true);
  });

  it('星屑骑士 charge_volley：冲锋 1s 后停 300ms，再沿冲锋方向打 4 发正向扇（0.5rad）', () => {
    const tune = AI_PROFILE.stardust_knight.tune;
    const rule = RANGED_RULES.stardust_knight;
    const { frames } = runFrames('stardust_knight', {
      start: { x: 240, y: 220, speed: 30, radius: 10 }, player: { x: 240, y: 100 }, steps: 700,
    });
    const blocks = blocksOf(frames);
    const windupBlock = blocks.find(b => b.mode === 'windup');
    expect(windupBlock.start).toBe(tune.intervalMs);           // 3000
    nearFrame(windupBlock.len * 10, tune.windupMs);            // 650
    const chargeBlock = blocks.find(b => b.mode === 'charge');
    nearFrame(chargeBlock.len * 10, tune.chargeMs);            // 1000

    // 冲锋结束不立刻出弹：先站定 300ms（cast）收势
    const castBlock = blocks.find(b => b.mode === 'cast');
    expect(castBlock).toBeDefined();
    nearFrame(castBlock.len * 10, rule.windupMs);              // 300
    const volleyFrame = frames.find(f => f.shots.length);
    expect(volleyFrame.t).toBe(tune.intervalMs + tune.windupMs + tune.chargeMs + rule.windupMs);
    expect(volleyFrame.shots).toHaveLength(rule.count);        // 4

    // 4 发以冲锋方向（brain.dir）为中轴，总张角 0.5rad
    const dir = volleyFrame.dir;
    expect(dir.y).toBeCloseTo(-1, 5);                          // 玩家在正上方
    const base = Math.atan2(dir.y, dir.x);
    const rel = volleyFrame.shots.map(s => {
      let a = Math.atan2(s.vy, s.vx) - base;
      while (a > Math.PI) a -= Math.PI * 2;
      while (a < -Math.PI) a += Math.PI * 2;
      return a;
    });
    expect(Math.max(...rel) - Math.min(...rel)).toBeCloseTo(rule.spread, 5);
    for (const shot of volleyFrame.shots) {
      expect(shot.kind).toBe('bolt');
      expect(Math.hypot(shot.vx, shot.vy)).toBeCloseTo(rule.speed, 5); // 76
      expect(shot.lifeMs).toBe(rule.lifeMs);                           // 2000
      expect(shot.damage).toBe(OPTS.damage);                           // §4 表未给倍率
    }
  });
});

// ---------- 2026-11 敌人攻击重做：T2 近战 / 弹幕 / 召唤 ----------
const MELEE_DEFS = Object.keys(MELEE_RULES);
const RANGED_CASES = [
  { def: 'cultist', count: 3, spread: 0.32, speed: 85, kind: 'bolt', lifeMs: 4200 },
  { def: 'crystal_dryad', count: 5, spread: 0.40, speed: 92, kind: 'bolt', lifeMs: 3600 },
  { def: 'void_elemental', count: 2, speed: 115, kind: 'bolt', lifeMs: 3200, gapMs: 170 },
  { def: 'oath_bishop', count: 3, speed: 150, kind: 'bolt', lifeMs: 3200, gapMs: 150 },
  { def: 'verdict_wraith', count: 1, speed: 160, kind: 'bolt', lifeMs: 1100 },
  { def: 'scale_arbiter', count: 1, speed: 72, kind: 'orb', lifeMs: 4200, damageMul: 1.6 },
  { def: 'ember_imp', count: 3, spread: 0.30, speed: 120, kind: 'bolt', lifeMs: 2400 },
  { def: 'dawn_shade', count: 1, speed: 46, kind: 'homing', lifeMs: 4200 },
  { def: 'eclipse_priest', count: 8, speed: 55, kind: 'bolt', lifeMs: 3600, ring: true },
  { def: 'stardust_knight', count: 4, spread: 0.5, speed: 76, kind: 'bolt', lifeMs: 2000, forward: true },
];

describe('近战事件（§3）', () => {
  it.each(MELEE_DEFS)('%s：前摇结束时产出一个 melee，扇形参数与 table 一致', (defId) => {
    const rule = MELEE_RULES[defId];
    const player = { x: 240, y: 190 };                        // 距出生点 10px，进入 range+4
    const { frames, brain } = runFrames(defId, {
      start: { x: 240, y: 200, speed: 20, radius: 8 }, player, steps: 120, dtMs: 10,
    });
    const hits = frames.filter(f => f.melee);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    const hit = hits[0];
    // 第一帧起手，前摇整段结束后出手（起手帧之后过 windupMs）
    expect(hit.t).toBe(rule.windupMs + 10);
    expect(hit.windup).toBe(false);
    expect(hit.melee).toMatchObject({
      arc: rule.arc, range: rule.range, damage: OPTS.damage, kind: rule.kind,
    });
    // 事件位置与本帧输出坐标一致，朝向指向出手瞬间的玩家（含本帧移动后的位置）
    expect(hit.melee.x).toBe(hit.x);
    expect(hit.melee.y).toBe(hit.y);
    expect(hit.melee.angle).toBeCloseTo(Math.atan2(player.y - hit.y, player.x - hit.x), 6);
    // arc 是弧度（100° = Math.PI/180*100）
    expect(Number.isFinite(hit.melee.arc)).toBe(true);
    expect(hit.melee.arc).toBeGreaterThan(0);
    expect(hit.melee.arc).toBeLessThanOrEqual(Math.PI);
    expect(brain.melees).toBe(1);
    // 冷却从出手帧起算满额（后续帧已在走冷却）
    expect(hit.meleeIn).toBe(rule.cooldownMs);
    expect(brain.meleeIn).toBeLessThanOrEqual(rule.cooldownMs);
    expect(brain.meleePreview).toBeNull();
    // 冷却期内不会再次出手
    const second = hits[1];
    if (second) expect(second.t - hit.t).toBeGreaterThanOrEqual(rule.cooldownMs);
  });

  it('张角按 spec 度数换算成弧度（骷髅 100° / 墨灵 160°）', () => {
    expect(MELEE_RULES.skeleton.arc).toBeCloseTo((Math.PI / 180) * 100, 9);
    expect(MELEE_RULES.ink_wisp.arc).toBeCloseTo((Math.PI / 180) * 160, 9);
    for (const rule of Object.values(MELEE_RULES)) {
      expect(rule.arc).toBeGreaterThan(0);
      expect(rule.arc).toBeLessThanOrEqual(Math.PI);
    }
  });

  it('前摇期间 brain.meleePreview 实时指向玩家，出手后清空（T3 绘制提示用）', () => {
    const brain = createBrain('skeleton', { seed: 1 });
    const self = { x: 240, y: 200, speed: 20, radius: 6 };
    let r = stepBrain(brain, { dtMs: 10, now: 10, self, player: { x: 240, y: 190 }, opts: OPTS });
    expect(r.windup).toBe(true);
    expect(brain.meleePreview).toMatchObject({
      arc: MELEE_RULES.skeleton.arc, range: 30, kind: 'bone_slash',
    });
    expect(brain.meleePreview.angle).toBeCloseTo(-Math.PI / 2, 6);

    // 玩家绕到右侧：提示角跟随（不是起手时的快照）
    r = stepBrain(brain, {
      dtMs: 10, now: 20, self: { x: r.x, y: r.y }, player: { x: 300, y: 200 }, opts: OPTS,
    });
    expect(Math.abs(brain.meleePreview.angle)).toBeLessThan(0.02);   // ≈ +x（骷髅本帧仍在向上微移）
    expect(brain.meleePreview.angle).toBeGreaterThan(0);
  });

  it('冲锋系 5 只怪永不产出 melee（冲撞仍走接触伤害/charging）', () => {
    for (const defId of ['knight', 'stone_gargoyle', 'brass_warden', 'stardust_knight', 'index_hound']) {
      const { frames } = runFrames(defId, {
        start: { x: 240, y: 200, speed: 30, radius: 10 }, player: { x: 240, y: 190 }, steps: 800,
      });
      expect(frames.some(f => f.melee)).toBe(false);
    }
  });

  it('范围近战保持 stomp 事件，不被 melee 替代', () => {
    for (const defId of ['stitch_abomination', 'anvil_tyrant']) {
      const { frames } = runFrames(defId, {
        start: { x: 240, y: 200, speed: 30, radius: 12 }, player: { x: 240, y: 190 }, steps: 400,
      });
      expect(frames.filter(f => f.stomp).length).toBeGreaterThan(0);
      expect(frames.some(f => f.melee)).toBe(false);
    }
  });
});

describe('远程弹幕形状（§4）：每只远程的弹数 / 形状 / 弹速', () => {
  const collectFirstVolley = (c) => {
    const { frames, brain } = runFrames(c.def, {
      start: { x: 240, y: 200, speed: 30, radius: 8 },
      player: { x: 240, y: 60 },
      steps: 1400,
      dtMs: 10,
    });
    const first = frames.find(f => f.shots.length);
    expect(first).toBeDefined();
    const window = c.gapMs ? c.gapMs * (c.count - 1) + 20 : 20;
    const shots = frames.filter(f => f.t >= first.t && f.t <= first.t + window).flatMap(f => f.shots);
    return { frames, brain, first, shots };
  };

  it.each(RANGED_CASES)('$def：$count 发 $kind，速度 $speed', (c) => {
    const { first, shots, brain } = collectFirstVolley(c);
    expect(shots).toHaveLength(c.count);
    const damage = c.damageMul ? Math.round(OPTS.damage * c.damageMul) : OPTS.damage;
    for (const shot of shots) {
      expect(shot.kind).toBe(c.kind);
      expect(shot).toMatchObject({ damage, lifeMs: c.lifeMs });
      expect(shot.radius).toBeGreaterThan(0);
      expect(Math.hypot(shot.vx, shot.vy)).toBeCloseTo(c.speed, 5);
    }
    // 远程弹道不再依赖 aim 快照；只有 stardust 仍写 aim —— 那是冲锋方向（移动），不是弹道
    if (!c.forward) expect(brain.aim).toBeNull();
    else expect(brain.aim).not.toBeNull();
    expect(first.windup).toBe(false);
  });

  it('扇形总张角与 §4 一致（cultist 0.32 / crystal 0.40 / ember 0.30 / stardust 0.5）', () => {
    for (const c of RANGED_CASES.filter(item => item.spread)) {
      const { first, shots } = collectFirstVolley(c);
      const dir = first.dir ?? { x: 0, y: 1 };
      const base = c.forward ? Math.atan2(dir.y, dir.x) : Math.atan2(60 - first.y, 240 - first.x);
      const rel = shots.map((s) => {
        let a = Math.atan2(s.vy, s.vx) - base;
        while (a > Math.PI) a -= Math.PI * 2;
        while (a < -Math.PI) a += Math.PI * 2;
        return a;
      });
      expect(Math.max(...rel) - Math.min(...rel)).toBeCloseTo(c.spread, 5);
      // 关于中轴对称
      expect(Math.max(...rel) + Math.min(...rel)).toBeCloseTo(0, 5);
    }
  });

  it('八向星环：8 发角度等分整圈', () => {
    const c = RANGED_CASES.find(item => item.def === 'eclipse_priest');
    const { shots } = collectFirstVolley(c);
    const angles = shots.map(s => (Math.atan2(s.vy, s.vx) + Math.PI * 2) % (Math.PI * 2)).sort((a, b) => a - b);
    expect(angles).toHaveLength(8);
    for (let i = 1; i < angles.length; i++) {
      expect(angles[i] - angles[i - 1]).toBeCloseTo((Math.PI * 2) / 8, 5);
    }
  });

  it('连发型（void 170ms / oath 150ms）在抬手后按间隔逐发打出', () => {
    for (const c of RANGED_CASES.filter(item => item.gapMs)) {
      const { frames } = collectFirstVolley(c);
      const times = frames.filter(f => f.shots.length).slice(0, c.count).map(f => f.t);
      expect(times).toHaveLength(c.count);
      for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBe(c.gapMs);
    }
  });

  it('远程抬手期间玩家移动会改变弹道（leadAim 在发射帧现算）', () => {
    const { frames } = runFrames('crystal_dryad', {
      start: { x: 240, y: 200, speed: 30, radius: 8 },
      player: { x: 240, y: 80 },
      steps: 500,
      dtMs: 10,
      onFrame: (i) => (i < 300 ? { x: 240, y: 80 } : { x: 320, y: 60 }),
    });
    const shotFrame = frames.find(f => f.shots.length);
    expect(shotFrame.t).toBeGreaterThan(3000);                // 抬手在 3000~3650
    const angles = shotFrame.shots.map(s => Math.atan2(s.vy, s.vx));
    const toOld = Math.atan2(80 - shotFrame.y, 240 - shotFrame.x);
    const toNew = Math.atan2(60 - shotFrame.y, 320 - shotFrame.x);
    expect(angles[2]).toBeCloseTo(toNew, 4);
    expect(Math.abs(angles[2] - toOld)).toBeGreaterThan(0.1);
  });
});

describe('召唤事件（§5）：节拍 / 伤害折算 / owner', () => {
  it('咒誓主教第 2 轮召唤炮台，伤害 = 敌人 damage ×0.6，owner 透传 brain.id', () => {
    const { frames } = runFrames('oath_bishop', {
      brainId: 42, steps: 950, player: { x: 240, y: 60 }, opts: { ...OPTS, damage: 10 },
    });
    const summons = frames.filter(f => f.summon);
    expect(summons).toHaveLength(1);
    const at = summons[0];
    expect(at.t).toBe(8950);                                  // 第 2 轮
    expect(at.summon).toMatchObject({ kind: 'turret', damage: 6, lifeMs: 5000, owner: 42 });
    expect(at.summon.x).toBe(at.x);                           // 炮台落在施法者位置
    expect(at.summon.y).toBe(at.y);
  });

  it('蚀日祭司第 2 轮召唤炮台：伤害同样 ×0.6', () => {
    const { frames } = runFrames('eclipse_priest', {
      steps: 1150, player: { x: 240, y: 60 }, opts: { ...OPTS, damage: 10 },
    });
    const summons = frames.filter(f => f.summon);
    expect(summons).toHaveLength(1);
    expect(summons[0].t).toBe(11000);
    expect(summons[0].summon).toMatchObject({ kind: 'turret', damage: 6, lifeMs: 5000 });
    expect(summons[0].summon).not.toHaveProperty('owner');      // 没有 id 时不写 owner
    expect(summons[0].summon.x).toBe(summons[0].x);
    expect(summons[0].summon.y).toBe(summons[0].y);
  });

  it('判词幽灵第 3 轮放符文：伤害直接用敌人 damage，落在玩家当前位置', () => {
    const player = { x: 240, y: 60 };
    const { frames } = runFrames('verdict_wraith', {
      steps: 1200, player, opts: { ...OPTS, damage: 10 },
    });
    const summons = frames.filter(f => f.summon);
    expect(summons).toHaveLength(1);
    expect(summons[0].t).toBe(11100);
    expect(summons[0].summon).toMatchObject({ kind: 'rune', damage: 10, lifeMs: 1200 });
    expect(summons[0].summon.x).toBe(player.x);
    expect(summons[0].summon.y).toBe(player.y);
  });

  it('天平裁决者第 2 轮放符文，重弹伤害 ×1.6', () => {
    const player = { x: 240, y: 60 };
    const { frames } = runFrames('scale_arbiter', {
      steps: 950, player, opts: { ...OPTS, damage: 10 },
    });
    const summons = frames.filter(f => f.summon);
    expect(summons).toHaveLength(1);
    expect(summons[0].t).toBe(8900);
    expect(summons[0].summon).toMatchObject({ kind: 'rune', damage: 10, lifeMs: 1200 });
    const orb = frames.find(f => f.shots.length).shots[0];
    expect(orb.damage).toBe(Math.round(10 * 1.6));
  });

  it('虚空元素每 3 轮补 1 个追踪球（homing / 46 速 / 4200ms）', () => {
    const { frames } = runFrames('void_elemental', {
      steps: 1200, player: { x: 240, y: 60 },
    });
    const homings = frames.filter(f => f.shots.some(s => s.kind === 'homing'));
    expect(homings).toHaveLength(1);
    expect(homings[0].t).toBe(11400);                         // 第 3 轮
    const homing = homings[0].shots.find(s => s.kind === 'homing');
    expect(homing).toMatchObject({ radius: 4, lifeMs: 4200, damage: OPTS.damage });
    expect(Math.hypot(homing.vx, homing.vy)).toBeCloseTo(46, 5);
    expect(homing.turnRate).toBeCloseTo(1.6, 6);
    // 同一轮的先头两发 bolt
    const roundShots = frames.filter(f => f.t >= 11400 && f.t <= 11400 + 170).flatMap(f => f.shots);
    expect(roundShots.filter(s => s.kind === 'bolt')).toHaveLength(2);
  });
});

describe('攻击参数表与 spec §3 / §4 逐值一致', () => {
  const DEG = Math.PI / 180;

  it('§3 近战表：距离 / 张角（弧度） / 前摇 / 冷却', () => {
    const table = {
      skeleton: [30, 100, 420, 1800],
      bat: [22, 120, 260, 1500],
      corpse: [26, 70, 520, 2000],
      rune_spider: [24, 80, 300, 1400],
      clockwork_doll: [30, 60, 380, 1800],
      wraith: [30, 110, 400, 1900],
      ink_wisp: [26, 160, 350, 2000],
      page_golem: [36, 150, 620, 2400],
      shackle_guard: [40, 160, 550, 2200],
      slag_beast: [30, 90, 480, 2100],
    };
    expect(Object.keys(MELEE_RULES).sort()).toEqual(Object.keys(table).sort());
    for (const [def, [range, deg, windupMs, cooldownMs]] of Object.entries(table)) {
      expect(MELEE_RULES[def].range).toBe(range);
      expect(MELEE_RULES[def].arc).toBeCloseTo(deg * DEG, 12);
      expect(MELEE_RULES[def].windupMs).toBe(windupMs);
      expect(MELEE_RULES[def].cooldownMs).toBe(cooldownMs);
    }
  });

  it('§4 远程表：抬手 / 弹数 / 张角 / 弹速 / 召唤节拍', () => {
    const table = {
      cultist: { windupMs: 600, count: 3, spread: 0.32, speed: 85 },
      crystal_dryad: { windupMs: 650, count: 5, spread: 0.40, speed: 92 },
      void_elemental: { windupMs: 600, count: 2, speed: 115, every: 3 },
      oath_bishop: { windupMs: 550, count: 3, speed: 150, summonEvery: 2, summonKind: 'turret' },
      verdict_wraith: { windupMs: 700, count: 1, speed: 160, summonEvery: 3, summonKind: 'rune' },
      scale_arbiter: { windupMs: 850, count: 1, speed: 72, damageMul: 1.6, summonEvery: 2, summonKind: 'rune' },
      ember_imp: { windupMs: 400, count: 3, spread: 0.30, speed: 120 },
      dawn_shade: { windupMs: 650, count: 1, speed: 46, kind: 'homing' },
      eclipse_priest: { windupMs: 700, count: 8, speed: 55, ring: true, summonEvery: 2, summonKind: 'turret' },
      stardust_knight: { windupMs: 300, count: 4, spread: 0.5, speed: 76, forward: true },
    };
    expect(Object.keys(RANGED_RULES).sort()).toEqual(Object.keys(table).sort());
    for (const [def, want] of Object.entries(table)) {
      for (const [key, value] of Object.entries(want)) {
        if (typeof value === 'number' && !Number.isInteger(value)) {
          expect(RANGED_RULES[def][key]).toBeCloseTo(value, 12);
        } else {
          expect(RANGED_RULES[def][key]).toBe(value);
        }
      }
    }
  });

  it('§3 的 10 只近战与 §4 的 10 只远程互不重叠，冲锋系不在近战表内', () => {
    const meleeIds = Object.keys(MELEE_RULES);
    const rangedIds = Object.keys(RANGED_RULES);
    expect(meleeIds.filter(id => rangedIds.includes(id))).toEqual([]);
    for (const id of ['knight', 'stone_gargoyle', 'brass_warden', 'stardust_knight', 'index_hound']) {
      expect(meleeIds).not.toContain(id);
    }
    expect(AI_PROFILE.stitch_abomination.melee).toBeUndefined();
    expect(AI_PROFILE.anvil_tyrant.melee).toBeUndefined();
  });
});

// ---------- AI_PROFILE 契约 ----------
describe('AI_PROFILE：26 个 defId 的单一事实源', () => {
  const ids = Object.keys(ENEMY_TYPES);

  it('roster 共 26 种敌人，AI_PROFILE 与之一一对应', () => {
    expect(ids).toHaveLength(26);
    expect(Object.keys(AI_PROFILE).sort()).toEqual([...ids].sort());
    for (const id of ids) {
      expect(AI_PROFILE[id].behavior).toBe(ENEMY_TYPES[id].behavior);
      expect(AI_PROFILE[id].tune).toBeTypeOf('object');
      const brain = createBrain(id, { seed: 1 });
      expect(brain.behavior).toBe(ENEMY_TYPES[id].behavior);
      expect(brain.tune).toBe(AI_PROFILE[id].tune);
      expect(brain.defId).toBe(id);
    }
  });

  it('26 个 behavior 名全局唯一（没有两只怪共用同一行为）', () => {
    const names = ids.map(id => AI_PROFILE[id].behavior);
    expect(new Set(names).size).toBe(26);
    expect(names).toContain('lurch');
    expect(names).toContain('charge_volley');
    expect(names).not.toContain('stepBat');
  });

  it('旧行为 tune 直接引用旧常量（数值/时序零漂移）', () => {
    expect(AI_PROFILE.skeleton.tune).toEqual({});
    expect(AI_PROFILE.bat.tune).toBe(BAT_RULE);
    expect(AI_PROFILE.cultist.tune).toBe(CULTIST_RULE);
    expect(AI_PROFILE.crystal_dryad.tune).toBe(VOLLEY_RULE);
    expect(AI_PROFILE.void_elemental.tune).toBe(PHASE_RULE);
    expect(AI_PROFILE.oath_bishop.tune).toBe(OATH_RULE);
    expect(AI_PROFILE.index_hound.tune).toBe(LUNGE_RULE);
    expect(AI_PROFILE.scale_arbiter.tune).toBe(JUDGE_RULE);
    expect(AI_PROFILE.anvil_tyrant.tune).toBe(SLAM_RULE);
    expect(AI_PROFILE.eclipse_priest.tune).toBe(ECLIPSE_RULE);
    expect(AI_PROFILE.knight.tune).toBe(KNIGHT_RULE);
    expect(AI_PROFILE.stitch_abomination.tune).toBe(STITCH_RULE);
  });

  it('14 个新行为的 tune 与契约 §5.2 逐字一致', () => {
    const SPEC = {
      corpse: { walkMs: 520, holdMs: 260, triggerDist: 40, windupMs: 450, lungeMs: 320, lungeMul: 1.5, recoverMs: 800 },
      clockwork_doll: { walkMs: 700, windupMs: 420, dashMs: 600, dashMul: 1.9, recoverMs: 500 },
      page_golem: { approachMul: 0.85, guardEveryMs: 3000, guardMs: 900, guardArmor: 0.55, guardSlowMul: 0.4 },
      slag_beast: { triggerDist: 64, intervalMs: 3800, windupMs: 700, stompRadius: 40, stompDamageMul: 1.6, cooldownMs: 1400 },
      shackle_guard: { holdDist: 110, retreatDist: 80, intervalMs: 3200, windupMs: 1000, shots: 2, gapMs: 110, shotSpeed: 120, shotLifeMs: 1600, damageMul: 1.1 },
      rune_spider: { straightMs: 380, lateralMs: 160, straightMul: 1.7, lateralMul: 1.3, lateralDist: 40 },
      wraith: { holdDist: 120, orbitMul: 0.5, intervalMs: 3000, windupMs: 500, dashMs: 550, dashMul: 2.1, recoverMs: 900 },
      ink_wisp: { approachMul: 0.7, blinkEveryMs: 1600, blinkMin: 40, blinkMax: 60, minPlayerDist: 26 },
      verdict_wraith: { holdDist: 130, retreatDist: 96, intervalMs: 3000, windupMs: 750, shotSpeed: 140, shotLifeMs: 1100, damageMul: 1.4 },
      ember_imp: { sprintMs: 280, sprintMul: 2.0, pauseMs: 260 },
      dawn_shade: { holdDist: 90, dashMs: 420, dashMul: 1.7, cooldownMs: 2000 },
      stone_gargoyle: { intervalMs: 3400, windupMs: 900, chargeMs: 900, chargeMul: 2.6, staggerMs: 500 },
      brass_warden: { intervalMs: 3000, windupMs: 650, chargeMs: 800, chargeMul: 2.4, pauseMs: 320, secondChargeMs: 700, secondMul: 2.4, cooldownMs: 2400 },
      stardust_knight: { intervalMs: 3000, windupMs: 650, chargeMs: 1000, chargeMul: 2.9, shots: 4, shotSpeed: 76, shotLifeMs: 2000, damageMul: 1.2, cooldownMs: 2600 },
    };
    for (const [id, tune] of Object.entries(SPEC)) {
      expect(AI_PROFILE[id].tune, id).toEqual(tune);
    }
    expect(Object.keys(SPEC)).toHaveLength(14);
  });

  it('非法 defId 回退 skeleton / march', () => {
    const brain = createBrain('dragon', { seed: 1 });
    expect(brain.defId).toBe('skeleton');
    expect(brain.behavior).toBe('march');
    expect(brain.tune).toBe(AI_PROFILE.skeleton.tune);
  });
});

// ---------- 新行为安全性 ----------
describe('新行为安全性：6s 连续推进', () => {
  it.each(NEW_BEHAVIOR_DEFS)('%s 无 NaN / 不越 1e5 / 单帧弹数 ≤4', (defId) => {
    const { frames } = runFrames(defId, {
      start: { x: 240, y: 120, speed: 40, radius: 8 }, player: { x: 240, y: 220 }, dtMs: 16, steps: 375,
    });
    for (const f of frames) {
      expect(Number.isFinite(f.x) && Number.isFinite(f.y)).toBe(true);
      expect(Math.abs(f.x)).toBeLessThan(1e5);
      expect(Math.abs(f.y)).toBeLessThan(1e5);
      if (!Number.isFinite(f.x) || !Number.isFinite(f.y)) continue;
      expect(f.shots.length).toBeLessThanOrEqual(4);
      for (const shot of f.shots) {
        expect(Number.isFinite(shot.x) && Number.isFinite(shot.y)).toBe(true);
        expect(Number.isFinite(shot.vx) && Number.isFinite(shot.vy)).toBe(true);
        expect(shot.damage).toBeGreaterThanOrEqual(1);
        expect(shot.lifeMs).toBeGreaterThan(0);
      }
      if (f.stomp) {
        expect(Number.isFinite(f.stomp.radius)).toBe(true);
        expect(f.stomp.radius).toBeGreaterThan(0);
        expect(f.stomp.damage).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

const weightOf = (chapter, id) => {
  const row = ACT_ENEMY_WEIGHTS[chapter].find(([key]) => key === id);
  return row ? row[1] : 0;
};

describe('roster：敌人数据与五幕权重', () => {
  it.each(['bat', 'corpse', 'cultist', 'knight', 'stitch_abomination', 'oath_bishop'])('%s 字段齐全且自洽', (id) => {
    const def = ENEMY_TYPES[id];
    for (const key of ['id', 'name', 'radius', 'damage', 'shards', 'behavior', 'hpMul', 'speedMul', 'color']) {
      expect(def).toHaveProperty(key);
    }
    expect(def.id).toBe(id);
    expect(typeof def.name).toBe('string');
    expect(def.name.length).toBeGreaterThan(0);
    expect(def.radius).toBeGreaterThan(0);
    expect(def.damage).toBeGreaterThan(0);
    expect(def.shards).toBeGreaterThan(0);
    expect(def.hpMul).toBeGreaterThan(0);
    expect(def.speedMul).toBeGreaterThan(0);
    expect(Number.isInteger(def.color)).toBe(true);
  });

  it('七种敌人的行为标签与逻辑层一一对应（腐尸已改为 lurch 节拍）', () => {
    expect(ENEMY_TYPES.skeleton.behavior).toBe('march');
    expect(ENEMY_TYPES.bat.behavior).toBe('weave');
    expect(ENEMY_TYPES.corpse.behavior).toBe('lurch');
    expect(ENEMY_TYPES.cultist.behavior).toBe('orbit');
    expect(ENEMY_TYPES.knight.behavior).toBe('charge');
    expect(ENEMY_TYPES.stitch_abomination.behavior).toBe('stomp');
    expect(ENEMY_TYPES.oath_bishop.behavior).toBe('blink_caster');
  });

  it('两种精英的数值、体型与 elite 标记符合设定', () => {
    expect(ENEMY_TYPES.stitch_abomination).toMatchObject({
      id: 'stitch_abomination', name: '缝合尸魁', behavior: 'stomp',
      hpMul: 4.5, speedMul: 0.5, damage: 4, shards: 5, radius: 14, elite: true,
    });
    expect(ENEMY_TYPES.oath_bishop).toMatchObject({
      id: 'oath_bishop', name: '咒誓主教', behavior: 'blink_caster',
      hpMul: 3.5, damage: 3, shards: 8, radius: 12, elite: true,
    });
    expect(ENEMY_TYPES.stitch_abomination.elite).toBe(true);
    expect(ENEMY_TYPES.oath_bishop.elite).toBe(true);
    expect(ENEMY_TYPES.skeleton.elite).toBeUndefined();  // 普通杂兵不带精英标记
  });

  it.each([1, 2, 3, 4, 5])('第 %i 幕权重和约为 1', (chapter) => {
    const table = ACT_ENEMY_WEIGHTS[chapter];
    expect(Array.isArray(table)).toBe(true);
    expect(table.length).toBeGreaterThanOrEqual(2);
    expect(table.every(([id, weight]) => ENEMY_TYPES[id] && weight > 0)).toBe(true);
    const sum = table.reduce((acc, [, weight]) => acc + weight, 0);
    expect(sum).toBeCloseTo(1, 12);
  });

  it('幕次构成：新怪按美术包权重加入，旧精英只在指定幕出现', () => {
    expect(weightOf(1, 'skeleton')).toBeCloseTo(0.46, 10);
    expect(weightOf(1, 'bat')).toBeCloseTo(0.18, 10);
    expect(weightOf(1, 'rune_spider')).toBeCloseTo(0.24, 10);
    expect(weightOf(1, 'stone_gargoyle')).toBeCloseTo(0.12, 10);
    for (const id of ['corpse', 'cultist', 'knight', 'stitch_abomination', 'oath_bishop']) {
      expect(weightOf(1, id)).toBe(0);
    }

    for (const id of ['bat', 'corpse', 'skeleton', 'rune_spider', 'crystal_dryad', 'clockwork_doll', 'stone_gargoyle']) {
      expect(weightOf(2, id)).toBeGreaterThan(0);
    }
    expect(weightOf(2, 'stitch_abomination')).toBeCloseTo(0.08, 10);
    expect(weightOf(2, 'skeleton')).toBeLessThan(0.25);
    expect(weightOf(2, 'cultist')).toBe(0);
    expect(weightOf(2, 'knight')).toBe(0);
    expect(weightOf(2, 'oath_bishop')).toBe(0);

    for (const id of ['skeleton', 'bat', 'corpse', 'cultist', 'knight', 'rune_spider', 'crystal_dryad', 'clockwork_doll', 'stone_gargoyle', 'wraith', 'void_elemental', 'brass_warden', 'oath_bishop']) {
      expect(weightOf(3, id)).toBeGreaterThan(0);
    }
    expect(weightOf(3, 'oath_bishop')).toBeCloseTo(0.06, 10);
    expect(weightOf(3, 'brass_warden')).toBeCloseTo(0.06, 10);
    expect(weightOf(3, 'knight')).toBeCloseTo(0.1, 10);
    expect(weightOf(3, 'stitch_abomination')).toBe(0);

    // 合并幕：第四幕把书库与法庭两套专属怪合进同一池，两边的招牌都在
    expect(ACT_ENEMY_WEIGHTS[4].length).toBeGreaterThanOrEqual(10);
    expect(weightOf(4, 'brass_warden')).toBeGreaterThan(0);
    expect(weightOf(4, 'ink_wisp')).toBeCloseTo(0.13, 10);
    expect(weightOf(4, 'page_golem')).toBeCloseTo(0.13, 10);
    expect(weightOf(4, 'index_hound')).toBeCloseTo(0.06, 10);
    expect(weightOf(4, 'verdict_wraith')).toBeCloseTo(0.13, 10);
    expect(weightOf(4, 'shackle_guard')).toBeCloseTo(0.13, 10);
    expect(weightOf(4, 'scale_arbiter')).toBeCloseTo(0.06, 10);
    expect(weightOf(4, 'clockwork_doll')).toBeCloseTo(0.05, 10);
    // 书库+法庭专属怪合计 64%，旧怪只作陪衬
    const libraryOnly = ['ink_wisp', 'page_golem', 'index_hound', 'verdict_wraith', 'shackle_guard', 'scale_arbiter'];
    expect(libraryOnly.reduce((sum, id) => sum + weightOf(4, id), 0)).toBeCloseTo(0.64, 10);

    // 第五幕：锻炉+破晓合并，缝合尸魁在终局收尾
    expect(ACT_ENEMY_WEIGHTS[5].length).toBeGreaterThanOrEqual(10);
    expect(weightOf(5, 'brass_warden')).toBeGreaterThan(0);
    expect(weightOf(5, 'slag_beast')).toBeCloseTo(0.13, 10);
    expect(weightOf(5, 'ember_imp')).toBeCloseTo(0.12, 10);
    expect(weightOf(5, 'anvil_tyrant')).toBeCloseTo(0.06, 10);
    expect(weightOf(5, 'dawn_shade')).toBeCloseTo(0.13, 10);
    expect(weightOf(5, 'stardust_knight')).toBeCloseTo(0.13, 10);
    expect(weightOf(5, 'eclipse_priest')).toBeCloseTo(0.07, 10);
    expect(weightOf(5, 'stitch_abomination')).toBe(0);
    const forgeOnly = ['slag_beast', 'ember_imp', 'anvil_tyrant', 'dawn_shade', 'stardust_knight', 'eclipse_priest'];
    expect(forgeOnly.reduce((sum, id) => sum + weightOf(5, id), 0)).toBeCloseTo(0.64, 10);
    // 六、七场不再是独立幕，不存在各自的权重表
    for (const stage of [6, 7]) {
      expect(ACT_ENEMY_WEIGHTS[stage]).toBeUndefined();
    }
  });

  it('roll 落入哪个区间就返回哪种敌人（按当前权重逐段验证）', () => {
    for (const chapter of [1, 2, 3, 4, 5]) {
      let acc = 0;
      for (const [id, weight] of ACT_ENEMY_WEIGHTS[chapter]) {
        expect(pickEnemyType(chapter, acc + weight / 2).id).toBe(id);
        acc += weight;
      }
      expect(pickEnemyType(chapter, 0).id).toBe(ACT_ENEMY_WEIGHTS[chapter][0][0]);
      expect(pickEnemyType(chapter, 0.999999).id).toBe(ACT_ENEMY_WEIGHTS[chapter].at(-1)[0]);
    }
  });

  it('同 chapter/roll 永远返回同一种敌人对象', () => {
    for (const act of [1, 2, 3, 4, 5]) {
      for (let i = 0; i < 50; i++) {
        const roll = (i + 0.37) / 50;
        const first = pickEnemyType(act, roll);
        expect(pickEnemyType(act, roll)).toBe(first);
        expect(ENEMY_TYPES[first.id]).toBe(first);
      }
    }
  });

  it('五幕遍历覆盖全部二十六种敌人，且从不返回表外敌人', () => {
    const appeared = new Set();
    for (const act of [1, 2, 3, 4, 5]) {
      for (let i = 0; i < 200; i++) {
        const def = pickEnemyType(act, i / 200);
        expect(ENEMY_TYPES[def.id]).toBe(def);
        appeared.add(def.id);
      }
    }
    expect([...appeared].sort()).toEqual([
      'anvil_tyrant', 'bat', 'brass_warden', 'clockwork_doll', 'corpse', 'crystal_dryad',
      'cultist', 'dawn_shade', 'eclipse_priest', 'ember_imp', 'index_hound', 'ink_wisp',
      'knight', 'oath_bishop', 'page_golem', 'rune_spider', 'scale_arbiter', 'shackle_guard',
      'skeleton', 'slag_beast', 'stardust_knight', 'stitch_abomination', 'stone_gargoyle',
      'verdict_wraith', 'void_elemental', 'wraith',
    ]);
  });

  it.each([
    [0, 0.5], [6, 0.5], [-1, 0.5], [1.5, 0.5], ['2', 0.5], [null, 0.5], [undefined, 0.5],
    [1, -0.1], [1, 1], [1, 1.0001], [1, Number.NaN], [1, Infinity], [1, '0.5'], [1, null], [1, undefined],
  ])('非法输入 chapter=%j roll=%j 回退骷髅兵', (act, roll) => {
    expect(pickEnemyType(act, roll)).toBe(ENEMY_TYPES.skeleton);
  });
});
