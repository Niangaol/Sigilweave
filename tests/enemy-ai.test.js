import { describe, it, expect } from 'vitest';
import {
  createBrain, stepBrain, DEFAULT_BATTLE,
  BAT_RULE, CULTIST_RULE, KNIGHT_RULE,
} from '../src/logic/enemy-ai.js';
import { ENEMY_TYPES, ACT_ENEMY_WEIGHTS, pickEnemyType } from '../src/data/roster.js';
import Enemy from '../src/entities/Enemy.js';

const PLAYER = Object.freeze({ x: 240, y: 220 });
const OPTS = { BATTLE: DEFAULT_BATTLE, damage: 8 };

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

describe('确定性：同 seed 同轨迹', () => {
  it.each(['skeleton', 'bat', 'corpse', 'cultist', 'knight'])('%s 两次同 seed 模拟逐帧完全一致', (defId) => {
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

  it.each(['skeleton', 'bat', 'corpse', 'cultist', 'knight'])('%s 的返回结构固定为 { x, y, shots, charging, windup }', (defId) => {
    const r = stepBrain(createBrain(defId, { seed: 1 }), {
      dtMs: 16, self: { x: 200, y: 200, speed: 30, radius: 6 }, player: PLAYER, opts: OPTS,
    });
    expect(Object.keys(r).sort()).toEqual(['charging', 'shots', 'windup', 'x', 'y']);
    expect(Array.isArray(r.shots)).toBe(true);
    expect(typeof r.charging).toBe('boolean');
    expect(typeof r.windup).toBe('boolean');
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

describe('腐尸：慢而厚', () => {
  it('相同基准速度下位移约为骷髅的 55%', () => {
    const player = { x: 240, y: 100 };
    const base = 40;
    const skeleton = stepBrain(createBrain('skeleton', { seed: 1 }), {
      dtMs: 1000, self: { x: 240, y: 200, speed: base * ENEMY_TYPES.skeleton.speedMul, radius: 6 }, player, opts: OPTS,
    });
    const corpse = stepBrain(createBrain('corpse', { seed: 1 }), {
      dtMs: 1000, self: { x: 240, y: 200, speed: base * ENEMY_TYPES.corpse.speedMul, radius: 8 }, player, opts: OPTS,
    });
    const skeletonMove = 200 - skeleton.y;
    const corpseMove = 200 - corpse.y;
    expect(corpseMove).toBeCloseTo(skeletonMove * 0.55, 6);
    expect(corpseMove).toBeLessThan(skeletonMove * 0.6);
  });

  it('血量倍率 2.2、接触伤害高于骷髅', () => {
    expect(ENEMY_TYPES.corpse.speedMul).toBeCloseTo(0.55, 6);
    expect(ENEMY_TYPES.corpse.hpMul).toBeCloseTo(2.2, 6);
    expect(ENEMY_TYPES.corpse.damage).toBeGreaterThan(ENEMY_TYPES.skeleton.damage);
  });

  it('和骷髅一样出生首帧锁方向、之后直线推进', () => {
    const brain = createBrain('corpse', { seed: 9 });
    const player = { x: 300, y: 60 };
    const start = { x: 120, y: 220, speed: 22, radius: 8 };
    const { pos } = simulate(brain, start, player, 100, 5);
    // 玩家中途跑开也不改道：方向仍指向出生时的位置
    const expected = Math.atan2(60 - 220, 300 - 120);
    const actual = Math.atan2(pos.y - start.y, pos.x - start.x);
    expect(actual).toBeCloseTo(expected, 6);
    expect(distance(pos, start)).toBeCloseTo(22 * 0.5, 6);
  });
});

describe('邪教徒：停稳预警后发射慢弹', () => {
  it('每 2.2s 一次 700ms 预警；预警期间位置冻结，预警结束才发射并锁定快照', () => {
    const brain = createBrain('cultist', { seed: 'cultist' });
    const oldAim = { x: 240, y: 80 };
    const newPlayer = { x: 240, y: 240 };
    let self = { x: 240, y: 150, speed: 40, radius: 6 };  // 与玩家距离正好 70
    let player = oldAim;
    const frames = [];
    for (let i = 1; i <= 30; i++) {
      if (i === 24) player = newPlayer;                   // 预警中玩家跑开，弹道不应跟随
      const r = stepBrain(brain, {
        dtMs: 100, now: i * 100,
        self: { x: self.x, y: self.y, speed: self.speed, radius: self.radius },
        player, opts: OPTS,
      });
      frames.push({ t: i * 100, x: r.x, y: r.y, windup: r.windup, shots: r.shots });
      self = { ...self, x: r.x, y: r.y };
    }

    const windupFrames = frames.filter(f => f.windup);
    expect(windupFrames.length).toBe(7);                  // 700ms
    const frozen = windupFrames.map(f => `${f.x.toFixed(6)},${f.y.toFixed(6)}`);
    expect(new Set(frozen).size).toBe(1);                 // 预警期间完全不动

    const shotFrames = frames.filter(f => f.shots.length > 0);
    expect(shotFrames).toHaveLength(1);
    expect(shotFrames[0].t).toBe(CULTIST_RULE.attackMs + CULTIST_RULE.windupMs); // 2900
    expect(shotFrames[0].windup).toBe(false);

    const shot = shotFrames[0].shots[0];
    expect(shot).toMatchObject({ damage: 8, lifeMs: CULTIST_RULE.shotLifeMs });
    const shotSpeed = Math.hypot(shot.vx, shot.vy);
    expect(shotSpeed).toBeCloseTo(CULTIST_RULE.shotSpeed, 5);
    expect(shotSpeed).toBeLessThan(96);                    // 慢于玩家，能躲

    const launch = windupFrames[0];
    const angleToOldAim = Math.atan2(oldAim.y - launch.y, oldAim.x - launch.x);
    const angleToNewPlayer = Math.atan2(newPlayer.y - launch.y, newPlayer.x - launch.x);
    expect(Math.atan2(shot.vy, shot.vx)).toBeCloseTo(angleToOldAim, 5);
    expect(Math.abs(Math.atan2(shot.vy, shot.vx) - angleToNewPlayer)).toBeGreaterThan(0.2);
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
    expect(brain).toEqual(before);
  });

  it.each(['skeleton', 'bat', 'corpse', 'cultist', 'knight'])('%s 面对 NaN / 无穷 / 超界坐标仍返回有限数', (defId) => {
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

  it('邪教徒的弹丸由 Enemy 转发给 scene.addHostileShot', () => {
    const scene = fakeScene({ x: 240, y: 80 });
    const enemy = new Enemy(scene, ENEMY_TYPES.cultist, 240, 150, { x: 240, y: 80 }, 20, 40, 8, 1);
    for (let i = 0; i < 29; i++) enemy.update(100, (i + 1) * 100);
    expect(scene.hostile).toHaveLength(1);
    expect(scene.hostile[0].damage).toBe(8);
    expect(scene.hostile[0].lifeMs).toBeGreaterThan(0);
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

const weightOf = (act, id) => {
  const row = ACT_ENEMY_WEIGHTS[act].find(([key]) => key === id);
  return row ? row[1] : 0;
};

describe('roster：敌人数据与三幕权重', () => {
  it.each(['bat', 'corpse', 'cultist', 'knight'])('%s 字段齐全且自洽', (id) => {
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

  it('五种敌人的行为标签与逻辑层一一对应', () => {
    expect(ENEMY_TYPES.skeleton.behavior).toBe('march');
    expect(ENEMY_TYPES.bat.behavior).toBe('weave');
    expect(ENEMY_TYPES.corpse.behavior).toBe('march');
    expect(ENEMY_TYPES.cultist.behavior).toBe('orbit');
    expect(ENEMY_TYPES.knight.behavior).toBe('charge');
  });

  it.each([1, 2, 3])('第 %i 幕权重和精确为 1', (act) => {
    const table = ACT_ENEMY_WEIGHTS[act];
    expect(Array.isArray(table)).toBe(true);
    expect(table.length).toBeGreaterThanOrEqual(2);
    expect(table.every(([id, weight]) => ENEMY_TYPES[id] && weight > 0)).toBe(true);
    const sum = table.reduce((acc, [, weight]) => acc + weight, 0);
    expect(sum).toBe(1);
  });

  it('幕次构成：一骷髅带蝠、二蝠/腐尸/骷髅、三五种齐全且骑士邪教徒过半', () => {
    expect(weightOf(1, 'skeleton')).toBeGreaterThan(0.7);
    expect(weightOf(1, 'bat')).toBeGreaterThan(0);
    expect(weightOf(1, 'corpse')).toBe(0);
    expect(weightOf(1, 'cultist')).toBe(0);
    expect(weightOf(1, 'knight')).toBe(0);
    for (const id of ['bat', 'corpse', 'skeleton']) expect(weightOf(2, id)).toBeGreaterThan(0);
    expect(weightOf(2, 'cultist')).toBe(0);
    expect(weightOf(2, 'knight')).toBe(0);
    for (const id of ['skeleton', 'bat', 'corpse', 'cultist', 'knight']) expect(weightOf(3, id)).toBeGreaterThan(0);
    expect(weightOf(3, 'knight') + weightOf(3, 'cultist')).toBeGreaterThanOrEqual(0.4);
    expect(weightOf(3, 'knight')).toBeGreaterThan(weightOf(1, 'knight'));
    expect(weightOf(3, 'cultist')).toBeGreaterThan(weightOf(2, 'cultist'));
  });

  it('roll 落入哪个区间就返回哪种敌人（含边界）', () => {
    expect(pickEnemyType(1, 0).id).toBe('skeleton');
    expect(pickEnemyType(1, 0.5).id).toBe('skeleton');
    expect(pickEnemyType(1, 0.874999).id).toBe('skeleton');
    expect(pickEnemyType(1, 0.875).id).toBe('bat');
    expect(pickEnemyType(1, 0.999999).id).toBe('bat');
    expect(pickEnemyType(2, 0.1).id).toBe('bat');
    expect(pickEnemyType(2, 0.5).id).toBe('corpse');
    expect(pickEnemyType(2, 0.9).id).toBe('skeleton');
    expect(pickEnemyType(3, 0.1).id).toBe('skeleton');
    expect(pickEnemyType(3, 0.2).id).toBe('bat');
    expect(pickEnemyType(3, 0.45).id).toBe('corpse');
    expect(pickEnemyType(3, 0.6).id).toBe('cultist');
    expect(pickEnemyType(3, 0.9).id).toBe('knight');
  });

  it('同 act/roll 永远返回同一种敌人对象', () => {
    for (const act of [1, 2, 3]) {
      for (let i = 0; i < 50; i++) {
        const roll = (i + 0.37) / 50;
        const first = pickEnemyType(act, roll);
        expect(pickEnemyType(act, roll)).toBe(first);
        expect(ENEMY_TYPES[first.id]).toBe(first);
      }
    }
  });

  it('三幕遍历覆盖全部五种敌人，且从不返回表外敌人', () => {
    const appeared = new Set();
    for (const act of [1, 2, 3]) {
      for (let i = 0; i < 200; i++) {
        const def = pickEnemyType(act, i / 200);
        expect(ENEMY_TYPES[def.id]).toBe(def);
        appeared.add(def.id);
      }
    }
    expect([...appeared].sort()).toEqual(['bat', 'corpse', 'cultist', 'knight', 'skeleton']);
  });

  it.each([
    [0, 0.5], [4, 0.5], [-1, 0.5], [1.5, 0.5], ['2', 0.5], [null, 0.5], [undefined, 0.5],
    [1, -0.1], [1, 1], [1, 1.0001], [1, Number.NaN], [1, Infinity], [1, '0.5'], [1, null], [1, undefined],
  ])('非法输入 act=%j roll=%j 回退骷髅兵', (act, roll) => {
    expect(pickEnemyType(act, roll)).toBe(ENEMY_TYPES.skeleton);
  });
});
