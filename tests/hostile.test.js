// T1：敌方弹道 / 召唤物 / 扇形命中 纯逻辑（spec 2026-11-17-enemy-attacks-design §2.5）
// 模块零 Phaser、零 DOM、零 Math.random；非法输入一律回退默认值，不抛错。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  HOSTILE_LIMITS,
  leadAim,
  makeShot,
  normalizeShot,
  stepHostileShots,
  normalizeSummon,
  stepSummons,
  arcHitTest,
  meleeHits,
  damageSummon,
} from '../src/logic/hostile.js';

const player = (x = 0, y = 0, radius = 5, extra = {}) => ({ x, y, radius, ...extra });
const world = (w = 1000, h = 1000) => ({ x: 0, y: 0, w, h });

describe('HOSTILE_LIMITS', () => {
  it('冻结且数值与 spec 一致', () => {
    expect(HOSTILE_LIMITS).toEqual({ shots: 96, summons: 20, turret: 12, rune: 8, homing: 16 });
    expect(Object.isFrozen(HOSTILE_LIMITS)).toBe(true);
  });
});

describe('leadAim 提前量', () => {
  it('静止目标：返回指向目标的单位向量', () => {
    const d = leadAim({ x: 0, y: 0 }, { x: 100, y: 0 }, 150);
    expect(d).toEqual({ x: 1, y: 0 });
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 9);
  });

  it('侧向移动目标：朝预测点偏移，而不是当前位置', () => {
    const from = { x: 0, y: 0 };
    const target = { x: 300, y: 0, vx: 0, vy: 90 };
    const d = leadAim(from, target, 150); // dist 300 / speed 150 = 2s，预测 y = 180
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 9);
    expect(d.x).toBeCloseTo(300 / Math.hypot(300, 180), 9);
    expect(d.y).toBeCloseTo(180 / Math.hypot(300, 180), 9);
    expect(d.y).toBeGreaterThan(0);
  });

  it('速度非法时退化为「直指当前位置」且仍为单位向量', () => {
    const target = { x: 0, y: 100, vx: 50, vy: 0 };
    for (const speed of [0, -10, NaN, Infinity, undefined, null, 'fast']) {
      const d = leadAim({ x: 0, y: 0 }, target, speed);
      expect(Number.isFinite(d.x)).toBe(true);
      expect(Number.isFinite(d.y)).toBe(true);
      expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 9);
      expect(d.x).toBeCloseTo(0, 9);
      expect(d.y).toBeCloseTo(1, 9);
    }
  });

  it('同点 / 非法坐标 / null：回退有限默认方向 {1,0}', () => {
    for (const d of [
      leadAim({ x: 5, y: 5 }, { x: 5, y: 5 }, 100),
      leadAim(null, { x: 1, y: 1 }, 100),
      leadAim({ x: NaN, y: 0 }, { x: 10, y: 0 }, 100),
      leadAim({ x: 0, y: 0 }, { x: Infinity, y: 0 }, 100),
      leadAim(undefined, undefined, NaN),
    ]) {
      expect(d).toEqual({ x: 1, y: 0 });
    }
  });

  it('预测点因目标反向速度落到原点：不会产出零向量', () => {
    const d = leadAim({ x: 0, y: 0 }, { x: 100, y: 0, vx: -100, vy: 0 }, 100);
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 9);
  });
});

describe('makeShot / normalizeShot', () => {
  it('dir 会被归一化，速度取 spec.speed', () => {
    const s = makeShot({ x: 10, y: 20 }, { x: 3, y: 4 }, { speed: 100, damage: 3, kind: 'orb' });
    expect(s.x).toBe(10);
    expect(s.y).toBe(20);
    expect(Math.hypot(s.vx, s.vy)).toBeCloseTo(100, 9);
    expect(s.vx).toBeCloseTo(60, 9);
    expect(s.vy).toBeCloseTo(80, 9);
    expect(s.speed).toBeUndefined();
  });

  it('按 kind 取半径 / 默认速度，homing 默认 turnRate 1.6', () => {
    const bolt = makeShot({ x: 0, y: 0 }, { x: 1, y: 0 }, {});
    expect(bolt.kind).toBe('bolt');
    expect(bolt.radius).toBe(3);
    expect(bolt.homing).toBe(false);
    expect(bolt.turnRate).toBe(0);

    const orb = makeShot({ x: 0, y: 0 }, { x: 1, y: 0 }, { kind: 'orb' });
    expect(orb.radius).toBe(6);
    expect(Math.hypot(orb.vx, orb.vy)).toBeCloseTo(80, 9);

    const homing = makeShot({ x: 0, y: 0 }, { x: 0, y: 1 }, { kind: 'homing' });
    expect(homing.homing).toBe(true);
    expect(homing.turnRate).toBeCloseTo(1.6, 9);
    expect(Math.hypot(homing.vx, homing.vy)).toBeCloseTo(46, 9);
  });

  it('spec 显式给出的 radius / turnRate / lifeMs / damage 优先', () => {
    const s = makeShot({ x: 0, y: 0 }, { x: 1, y: 0 }, {
      kind: 'homing', radius: 9, turnRate: 2.4, lifeMs: 1000, damage: 7, speed: 40,
    });
    expect(s.radius).toBe(9);
    expect(s.turnRate).toBeCloseTo(2.4, 9);
    expect(s.lifeMs).toBe(1000);
    expect(s.damage).toBe(7);
    expect(s.homing).toBe(true);
  });

  it('非法 spec 字段逐个回退默认值，数值全部有限', () => {
    const s = normalizeShot({
      x: NaN, y: 'a', vx: Infinity, vy: undefined,
      damage: -3, lifeMs: -1, kind: 'laser', radius: -2, homing: 'yes', turnRate: NaN,
    });
    expect(s.kind).toBe('bolt');
    expect(s.x).toBe(0);
    expect(s.y).toBe(0);
    expect(s.vx).toBe(0);
    expect(s.vy).toBe(0);
    expect(s.damage).toBe(1);
    expect(s.lifeMs).toBe(6000);
    expect(s.radius).toBe(3);
    expect(s.homing).toBe(false);
    expect(s.turnRate).toBe(0);
    for (const k of ['x', 'y', 'vx', 'vy', 'damage', 'lifeMs', 'radius', 'turnRate']) {
      expect(Number.isFinite(s[k])).toBe(true);
    }
  });

  it('非对象输入回退默认 shot，不抛错', () => {
    for (const bad of [null, undefined, 0, 'shot', [], true]) {
      const s = normalizeShot(bad);
      expect(s).toMatchObject({ x: 0, y: 0, vx: 0, vy: 0, damage: 1, lifeMs: 6000, kind: 'bolt', radius: 3, homing: false, turnRate: 0 });
    }
  });

  it('保留未知字段（owner/color），便于场景侧附加信息', () => {
    const s = normalizeShot({ x: 1, y: 2, vx: 0, vy: 0, owner: 'cultist', color: 0xff0000 });
    expect(s.owner).toBe('cultist');
    expect(s.color).toBe(0xff0000);
  });

  it('零方向向量回退默认朝向 +x', () => {
    const s = makeShot({ x: 0, y: 0 }, { x: 0, y: 0 }, { speed: 50 });
    expect(s.vx).toBeCloseTo(50, 9);
    expect(s.vy).toBeCloseTo(0, 9);
  });
});

describe('stepHostileShots 推进', () => {
  it('bolt 直线推进（像素/秒 → 毫秒 dt）', () => {
    const out = stepHostileShots(
      [{ x: 100, y: 100, vx: 120, vy: 0, damage: 2, lifeMs: 6000 }],
      { dtMs: 500, player: player(9999, 9999), world: world(), maxShots: 96 },
    );
    expect(out.list).toHaveLength(1);
    expect(out.list[0].x).toBeCloseTo(160, 9);
    expect(out.list[0].y).toBeCloseTo(100, 9);
    expect(out.list[0].lifeMs).toBe(5500);
    expect(out.hits).toEqual([]);
    expect(out.expired).toBe(0);
  });

  it('orb 同样是直线', () => {
    const out = stepHostileShots(
      [{ x: 0, y: 100, vx: 0, vy: -80, kind: 'orb', radius: 6, lifeMs: 1000 }],
      { dtMs: 250, player: player(9999, 9999), world: world() },
    );
    expect(out.list[0].y).toBeCloseTo(80, 9);
    expect(out.list[0].x).toBeCloseTo(0, 9);
  });

  it('命中玩家：输出 hits 并从列表移除', () => {
    const out = stepHostileShots(
      [{ x: 0, y: 0, vx: 0, vy: 0, damage: 4, lifeMs: 6000, kind: 'bolt' }],
      { dtMs: 16, player: player(8, 0, 5), world: world() },
    );
    expect(out.list).toHaveLength(0);
    // B5：hits 记录从 4 字段扩到 5 字段（追加 fromBoss），既有全量比较改 toMatchObject；
    // 4 个原字段仍逐个精确比对，fromBoss 的是否透传由下面那条专用用例负责。
    expect(out.hits).toMatchObject([{ damage: 4, x: 0, y: 0, kind: 'bolt' }]);
  });

  it('B5 命中记录透传 fromBoss：大招弹 true、普通弹 false', () => {
    const hit = (fromBoss) => stepHostileShots(
      [makeShot({ x: 0, y: 0 }, { x: 1, y: 0 }, { damage: 4, speed: 0, fromBoss })],
      { dtMs: 16, player: player(8, 0, 5), world: world() },
    ).hits[0];
    expect(hit(true).fromBoss).toBe(true);
    // 普通弹必须显式为 false：场景层据此走 DEFAULT_SHOT_CONTROL，
    // 少这个字段会让 undefined 混进控制矩阵、Boss 专属控制漏挂或错挂。
    expect(hit(false).fromBoss).toBe(false);
  });

  it('命中阈值严格小于 radius+r+1：正好等于不命中', () => {
    // player.radius 5 + shot.radius 3 + 1 = 9
    const at9 = stepHostileShots(
      [{ x: 0, y: 0, vx: 0, vy: 0, damage: 4, lifeMs: 6000, radius: 3 }],
      { dtMs: 16, player: player(9, 0, 5), world: world() },
    );
    expect(at9.list).toHaveLength(1);
    expect(at9.hits).toEqual([]);

    const justInside = stepHostileShots(
      [{ x: 0, y: 0, vx: 0, vy: 0, damage: 4, lifeMs: 6000, radius: 3 }],
      { dtMs: 16, player: player(8.9, 0, 5), world: world() },
    );
    expect(justInside.hits).toHaveLength(1);
  });

  it('homing 以 turnRate 转向玩家（受转向速率限制）', () => {
    // 朝 +x 飞，玩家在正 +y 方向；1s 只允许转 1.0rad，小于所需的 π/2，所以不会对准
    const out = stepHostileShots(
      [{ x: 0, y: 0, vx: 46, vy: 0, kind: 'homing', lifeMs: 4200, turnRate: 1.0 }],
      { dtMs: 1000, player: player(0, 200), world: world() },
    );
    const s = out.list[0];
    expect(Math.hypot(s.vx, s.vy)).toBeCloseTo(46, 6); // 速度大小保持
    const angle = Math.atan2(s.vy, s.vx);
    expect(angle).toBeCloseTo(1.0, 6); // 恰好转满 turnRate * dt
    expect(angle).toBeLessThan(Math.PI / 2); // 还没对准
    expect(s.vy).toBeGreaterThan(0);
  });

  it('homing 小 dt 不会瞬间对准玩家', () => {
    const out = stepHostileShots(
      [{ x: 0, y: 0, vx: 46, vy: 0, kind: 'homing', lifeMs: 4200, turnRate: 1.6 }],
      { dtMs: 16, player: player(0, 200), world: world() },
    );
    const angle = Math.atan2(out.list[0].vy, out.list[0].vx);
    expect(Math.abs(angle)).toBeCloseTo(1.6 * 0.016, 6); // 只转 1 帧的量
  });

  it('turnRate 缺省时按 1.6 处理（kind=homing 自带默认）', () => {
    const out = stepHostileShots(
      [{ x: 0, y: 0, vx: 46, vy: 0, kind: 'homing', lifeMs: 4200 }],
      { dtMs: 500, player: player(0, 200), world: world() },
    );
    expect(Math.atan2(out.list[0].vy, out.list[0].vx)).toBeCloseTo(0.8, 6); // 1.6 * 0.5s
  });

  it('lifeMs 归零移除并计入 expired', () => {
    const out = stepHostileShots(
      [{ x: 0, y: 0, vx: 0, vy: 0, lifeMs: 10 }],
      { dtMs: 16, player: player(9999, 9999), world: world() },
    );
    expect(out.list).toHaveLength(0);
    expect(out.expired).toBe(1);
  });

  it('出界移除并计入 expired', () => {
    const out = stepHostileShots(
      [{ x: 90, y: 50, vx: 1000, vy: 0, lifeMs: 6000 }],
      { dtMs: 100, player: player(9999, 9999), world: world(100, 100) },
    );
    expect(out.list).toHaveLength(0);
    expect(out.expired).toBe(1);
  });

  it('world 缺失时不做边界清退', () => {
    const out = stepHostileShots(
      [{ x: 5000, y: 5000, vx: 10, vy: 0, lifeMs: 6000 }],
      { dtMs: 16, player: player(0, 0), maxShots: 96 },
    );
    expect(out.list).toHaveLength(1);
  });

  it('保持输入顺序', () => {
    const out = stepHostileShots(
      [
        { x: 0, y: 0, vx: 0, vy: 0, damage: 1, lifeMs: 6000 },
        { x: 10, y: 0, vx: 0, vy: 0, damage: 2, lifeMs: 6000 },
        { x: 20, y: 0, vx: 0, vy: 0, damage: 3, lifeMs: 6000 },
      ],
      { dtMs: 16, player: player(9999, 9999), world: world() },
    );
    expect(out.list.map(s => s.damage)).toEqual([1, 2, 3]);
  });

  it('maxShots 裁剪保留前 maxShots 个', () => {
    const list = [1, 2, 3, 4, 5].map(i => ({ x: i * 100, y: 0, vx: 0, vy: 0, damage: i, lifeMs: 6000 }));
    const out = stepHostileShots(list, { dtMs: 16, player: player(9999, 9999), world: world(), maxShots: 3 });
    expect(out.list.map(s => s.damage)).toEqual([1, 2, 3]);
  });

  it('不修改输入数组与输入对象', () => {
    const raw = { x: 0, y: 0, vx: 10, vy: 0, lifeMs: 1000 };
    const list = [raw];
    stepHostileShots(list, { dtMs: 16, player: player(9999, 9999), world: world() });
    expect(list).toHaveLength(1);
    expect(raw).toEqual({ x: 0, y: 0, vx: 10, vy: 0, lifeMs: 1000 });
  });

  it('非法输入（null 列表 / 非数组 / 缺 opts / 非法 dt）不抛错', () => {
    expect(stepHostileShots(null)).toEqual({ list: [], hits: [], expired: 0 });
    expect(stepHostileShots(undefined, undefined)).toEqual({ list: [], hits: [], expired: 0 });
    expect(stepHostileShots('nope', { dtMs: 16 })).toEqual({ list: [], hits: [], expired: 0 });

    const withBad = stepHostileShots(
      [null, { x: 0, y: 0, vx: 0, vy: 0, lifeMs: 6000 }],
      { dtMs: NaN, player: null, world: null },
    );
    expect(withBad.list).toHaveLength(1); // 列表里的 null 被丢弃，不凭空造弹
    for (const s of withBad.list) {
      for (const k of ['x', 'y', 'vx', 'vy', 'damage', 'lifeMs', 'radius', 'turnRate']) {
        expect(Number.isFinite(s[k])).toBe(true);
      }
    }

    const negativeDt = stepHostileShots(
      [{ x: 0, y: 0, vx: 100, vy: 0, lifeMs: 6000 }],
      { dtMs: -50, player: player(9999, 9999), world: world() },
    );
    expect(negativeDt.list[0].x).toBe(0);
  });
});

describe('normalizeSummon', () => {
  it('turret 默认值（§5：5000ms / 12hp / 1200ms 间隔）', () => {
    const s = normalizeSummon({ kind: 'turret', x: 1, y: 2 });
    expect(s).toMatchObject({
      kind: 'turret', x: 1, y: 2, lifeMs: 5000, hp: 12, radius: 6,
      damage: 1, alive: true, intervalMs: 1200, timerMs: 1200,
    });
  });

  it('rune 默认值（§5：1200ms 引信 / 8hp / 爆炸半径 44）', () => {
    const s = normalizeSummon({ kind: 'rune', x: 5, y: 6, damage: 9 });
    expect(s).toMatchObject({
      kind: 'rune', x: 5, y: 6, lifeMs: 1200, hp: 8, radius: 44,
      damage: 9, alive: true, intervalMs: 0, timerMs: 0,
    });
  });

  it('未知 kind 回退 turret；非对象输入回退默认 turret', () => {
    expect(normalizeSummon({ kind: 'totem' }).kind).toBe('turret');
    for (const bad of [null, undefined, 7, 'rune', []]) {
      expect(normalizeSummon(bad)).toMatchObject({ kind: 'turret', hp: 12, lifeMs: 5000 });
    }
  });

  it('非法数值字段回退默认且全部有限', () => {
    const s = normalizeSummon({
      kind: 'rune', x: NaN, y: Infinity, lifeMs: -5, hp: 'x', damage: -1, radius: -44, intervalMs: -1,
    });
    expect(s).toMatchObject({ kind: 'rune', x: 0, y: 0, lifeMs: 1200, hp: 8, damage: 1, radius: 44 });
    for (const k of ['x', 'y', 'lifeMs', 'hp', 'damage', 'radius', 'intervalMs', 'timerMs']) {
      expect(Number.isFinite(s[k])).toBe(true);
    }
  });

  it('保留未知字段并保留显式 timerMs', () => {
    const s = normalizeSummon({ kind: 'turret', x: 0, y: 0, owner: 'oath_bishop', timerMs: 300 });
    expect(s.owner).toBe('oath_bishop');
    expect(s.timerMs).toBe(300);
  });
});

describe('stepSummons', () => {
  const turretPlayer = () => player(100, 0, 5, { vx: 0, vy: 0 });

  it('turret 未到 intervalMs 不发弹，计时推进', () => {
    const out = stepSummons([{ kind: 'turret', x: 0, y: 0, lifeMs: 5000, intervalMs: 1000, damage: 3 }], {
      dtMs: 500, player: turretPlayer(), world: world(), maxShots: 96,
    });
    expect(out.shots).toEqual([]);
    expect(out.list).toHaveLength(1);
    expect(out.list[0].timerMs).toBe(500);
    expect(out.list[0].lifeMs).toBe(4500);
  });

  it('turret 到点朝玩家当前位置发 1 发弹并重置计时', () => {
    const first = stepSummons(
      [{ kind: 'turret', x: 0, y: 0, lifeMs: 5000, intervalMs: 1000, damage: 3, radius: 6 }],
      { dtMs: 500, player: turretPlayer(), world: world() },
    );
    const second = stepSummons(first.list, { dtMs: 500, player: turretPlayer(), world: world() });
    expect(second.shots).toHaveLength(1);
    const shot = second.shots[0];
    expect(shot.damage).toBe(3);
    expect(shot.kind).toBe('bolt');
    expect(shot.x).toBe(0);
    expect(shot.y).toBe(0);
    expect(shot.vx).toBeGreaterThan(0);
    expect(shot.vy).toBeCloseTo(0, 9);
    expect(Math.hypot(shot.vx, shot.vy)).toBeCloseTo(60, 9); // 慢弹
    expect(second.list[0].timerMs).toBe(1000); // 重置到 intervalMs
  });

  it('turret 发弹用 leadAim（玩家横移时带提前量）', () => {
    const out = stepSummons(
      [{ kind: 'turret', x: 0, y: 0, lifeMs: 5000, intervalMs: 1000, damage: 2 }],
      { dtMs: 1000, player: player(100, 0, 5, { vx: 0, vy: 60 }), world: world(), maxShots: 96 },
    );
    expect(out.shots).toHaveLength(1);
    expect(out.shots[0].vy).toBeGreaterThan(0);
    expect(Math.hypot(out.shots[0].vx, out.shots[0].vy)).toBeCloseTo(60, 9);
  });

  it('turret lifeMs 归零移除（计入 expired）', () => {
    const out = stepSummons([{ kind: 'turret', x: 0, y: 0, lifeMs: 100, intervalMs: 1000 }], {
      dtMs: 200, player: turretPlayer(), world: world(),
    });
    expect(out.list).toHaveLength(0);
    expect(out.shots).toEqual([]);
    expect(out.expired).toBe(1);
  });

  it('rune 引信归零 → detonations 一条并移除', () => {
    const out = stepSummons([{ kind: 'rune', x: 10, y: 20, lifeMs: 1200, damage: 5, radius: 44 }], {
      dtMs: 1200, player: player(0, 0), world: world(),
    });
    expect(out.list).toHaveLength(0);
    expect(out.detonations).toEqual([{ x: 10, y: 20, radius: 44, damage: 5 }]);
    expect(out.expired).toBe(1);
  });

  it('rune 未到引信时间不引爆', () => {
    const out = stepSummons([{ kind: 'rune', x: 10, y: 20, lifeMs: 1200, damage: 5 }], {
      dtMs: 1199, player: player(0, 0), world: world(),
    });
    expect(out.detonations).toEqual([]);
    expect(out.list).toHaveLength(1);
    expect(out.list[0].lifeMs).toBeCloseTo(1, 9);
  });

  it('rune 默认爆炸半径 44', () => {
    const out = stepSummons([{ kind: 'rune', x: 0, y: 0, lifeMs: 10 }], {
      dtMs: 10, player: player(0, 0), world: world(),
    });
    expect(out.detonations[0].radius).toBe(44);
  });

  it('保持输入顺序（列表与产出的弹丸）', () => {
    const out = stepSummons(
      [
        { kind: 'turret', x: 0, y: 0, intervalMs: 100, lifeMs: 5000, damage: 1, timerMs: 1 },
        { kind: 'rune', x: 50, y: 50, lifeMs: 5000, damage: 2 },
        { kind: 'turret', x: 10, y: 0, intervalMs: 100, lifeMs: 5000, damage: 3, timerMs: 1 },
      ],
      { dtMs: 16, player: turretPlayer(), world: world() },
    );
    expect(out.list.map(s => s.kind)).toEqual(['turret', 'rune', 'turret']);
    expect(out.shots.map(s => s.damage)).toEqual([1, 3]);
  });

  it('maxShots 裁剪产出的弹丸（保留前 maxShots 发）', () => {
    const out = stepSummons(
      [
        { kind: 'turret', x: 0, y: 0, intervalMs: 100, lifeMs: 5000, damage: 1, timerMs: 1 },
        { kind: 'turret', x: 10, y: 0, intervalMs: 100, lifeMs: 5000, damage: 2, timerMs: 1 },
        { kind: 'turret', x: 20, y: 0, intervalMs: 100, lifeMs: 5000, damage: 3, timerMs: 1 },
      ],
      { dtMs: 16, player: turretPlayer(), world: world(), maxShots: 2 },
    );
    expect(out.shots.map(s => s.damage)).toEqual([1, 2]);
  });

  it('已死亡召唤物被丢弃（alive=false / hp<=0），不计入 expired', () => {
    const out = stepSummons(
      [
        { kind: 'turret', x: 0, y: 0, hp: 0, lifeMs: 5000 },
        { kind: 'rune', x: 0, y: 0, hp: 4, alive: false, lifeMs: 5000 },
        { kind: 'turret', x: 0, y: 0, hp: 12, lifeMs: 5000 },
      ],
      { dtMs: 16, player: turretPlayer(), world: world() },
    );
    expect(out.list).toHaveLength(1);
    expect(out.expired).toBe(0);
  });

  it('不修改输入数组与输入对象', () => {
    const raw = { kind: 'turret', x: 0, y: 0, lifeMs: 5000, intervalMs: 1000 };
    const list = [raw];
    stepSummons(list, { dtMs: 16, player: turretPlayer(), world: world() });
    expect(list).toHaveLength(1);
    expect(raw).toEqual({ kind: 'turret', x: 0, y: 0, lifeMs: 5000, intervalMs: 1000 });
  });

  it('非法输入不抛错', () => {
    expect(stepSummons(null)).toEqual({ list: [], shots: [], detonations: [], expired: 0 });
    expect(stepSummons(undefined, undefined)).toEqual({ list: [], shots: [], detonations: [], expired: 0 });
    expect(stepSummons('x', { dtMs: 16 })).toEqual({ list: [], shots: [], detonations: [], expired: 0 });

    const out = stepSummons([null, { kind: 'rune', lifeMs: 10, damage: 1 }], {
      dtMs: 10, player: null, world: null,
    });
    expect(out.list).toEqual([]);
    expect(out.detonations).toHaveLength(1);
    expect(Number.isFinite(out.detonations[0].x)).toBe(true);
    expect(Number.isFinite(out.detonations[0].y)).toBe(true);
  });
});

describe('arcHitTest 扇形判定', () => {
  const origin = { x: 0, y: 0 };
  const at = (deg, dist) => ({
    x: Math.cos((deg * Math.PI) / 180) * dist,
    y: Math.sin((deg * Math.PI) / 180) * dist,
  });

  it('正前方命中', () => {
    expect(arcHitTest(origin, 0, Math.PI / 2, 30, { x: 20, y: 0 })).toBe(true);
  });

  it('正好落在弧边界（角度差 == arc/2）算命中', () => {
    expect(arcHitTest(origin, 0, Math.PI / 2, 30, at(45, 20))).toBe(true);
    expect(arcHitTest(origin, 0, Math.PI / 2, 30, at(-45, 20))).toBe(true);
  });

  it('弧外（差一点点）不命中', () => {
    expect(arcHitTest(origin, 0, Math.PI / 2, 30, at(46, 20))).toBe(false);
    expect(arcHitTest(origin, 0, Math.PI / 2, 30, at(-46, 20))).toBe(false);
    expect(arcHitTest(origin, 0, Math.PI / 2, 30, { x: -10, y: 0 })).toBe(false);
  });

  it('距离正好 == range + pointRadius 算命中，超出不算', () => {
    expect(arcHitTest(origin, 0, 0.2, 30, { x: 30, y: 0 })).toBe(true);
    expect(arcHitTest(origin, 0, 0.2, 30, { x: 30.001, y: 0 })).toBe(false);
    expect(arcHitTest(origin, 0, 0.2, 30, { x: 31, y: 0 }, 1)).toBe(true);
    expect(arcHitTest(origin, 0, 0.2, 30, { x: 31.5, y: 0 }, 1)).toBe(false);
  });

  it('pointRadius 只放宽距离，不放宽角度', () => {
    expect(arcHitTest(origin, 0, Math.PI / 2, 10, at(46, 29.9), 20)).toBe(false);
    expect(arcHitTest(origin, 0, Math.PI / 2, 10, at(44, 29.9), 20)).toBe(true);
  });

  it('跨 ±π 的角度差正确归一到 [-π, π]', () => {
    // 攻击朝向 174.3°，落点 185°：跨过 ±π 边界后夹角约 10.7° < arc/2 (11.5°)
    expect(arcHitTest(origin, Math.PI - 0.1, 0.4, 30, at(185, 20))).toBe(true);
    expect(arcHitTest(origin, Math.PI - 0.1, 0.4, 30, at(160, 20))).toBe(false);
  });

  it('origin 上的点（dist=0）算命中', () => {
    expect(arcHitTest(origin, Math.PI, 0.1, 10, { x: 0, y: 0 })).toBe(true);
  });

  it('arc >= 2π 全向命中', () => {
    expect(arcHitTest(origin, 0, Math.PI * 2, 30, { x: -20, y: 0 })).toBe(true);
    expect(arcHitTest(origin, 0, Math.PI * 4, 30, { x: 0, y: -20 })).toBe(true);
  });

  it('非法输入返回 false 而不是抛错', () => {
    expect(arcHitTest(null, 0, 1, 10, { x: 1, y: 0 })).toBe(false);
    expect(arcHitTest(origin, NaN, 1, 10, { x: 1, y: 0 })).toBe(false);
    expect(arcHitTest(origin, 0, NaN, 10, null)).toBe(false);
    expect(arcHitTest(origin, 0, 1, NaN, { x: 1, y: 0 })).toBe(false);
    expect(arcHitTest(origin, 0, 1, 10, { x: NaN, y: 0 })).toBe(false);
  });
});

describe('meleeHits', () => {
  const melee = { x: 0, y: 0, angle: 0, arc: Math.PI / 2, range: 30, damage: 3, kind: 'slash' };

  it('玩家在扇形内命中，使用玩家半径扩展距离', () => {
    expect(meleeHits(melee, player(25, 0, 5))).toBe(true);
    expect(meleeHits(melee, player(25, 0, 0))).toBe(true);
    expect(meleeHits(melee, player(36, 0, 5))).toBe(false); // 36 > range 30 + 玩家半径 5
  });

  it('玩家半径补齐距离：range+r 内命中', () => {
    expect(meleeHits(melee, player(35, 0, 5))).toBe(true);
    expect(meleeHits(melee, player(35.5, 0, 5))).toBe(false);
  });

  it('玩家在扇形外不命中', () => {
    expect(meleeHits(melee, player(0, 25, 5))).toBe(false);
  });

  it('null / 缺字段回退 false，不抛错', () => {
    expect(meleeHits(null, player(0, 0))).toBe(false);
    expect(meleeHits(melee, null)).toBe(false);
    expect(meleeHits({}, player(0, 0))).toBe(false);
    expect(meleeHits({ x: 0, y: 0, angle: 0, arc: NaN, range: 30 }, player(10, 0))).toBe(false);
  });
});

describe('damageSummon', () => {
  it('扣血并返回实扣', () => {
    const s = { kind: 'turret', hp: 12, alive: true };
    expect(damageSummon(s, 5)).toBe(5);
    expect(s.hp).toBe(7);
    expect(s.alive).toBe(true);
    expect(s.lastHitAmount).toBe(5);
  });

  it('伤害超过剩余生命：只扣到 0，返回剩余生命，alive=false', () => {
    const s = { kind: 'rune', hp: 8, alive: true };
    expect(damageSummon(s, 99)).toBe(8);
    expect(s.hp).toBe(0);
    expect(s.alive).toBe(false);
    expect(s.lastHitAmount).toBe(8);
  });

  it('正好打空也置 alive=false', () => {
    const s = { kind: 'homing', hp: 6, alive: true };
    expect(damageSummon(s, 6)).toBe(6);
    expect(s.hp).toBe(0);
    expect(s.alive).toBe(false);
  });

  it('已死亡 / 非法 amount / null 输入返回 0，不抛错', () => {
    const dead = { kind: 'turret', hp: 0, alive: false };
    expect(damageSummon(dead, 5)).toBe(0);
    expect(dead.hp).toBe(0);

    const s = { kind: 'turret', hp: 12, alive: true };
    for (const amount of [0, -5, NaN, Infinity, undefined, 'x']) {
      expect(damageSummon(s, amount)).toBe(0);
      expect(s.hp).toBe(12);
    }
    expect(damageSummon(null, 5)).toBe(0);
    expect(damageSummon(undefined, 5)).toBe(0);
  });

  it('缺 hp 时按 kind 默认生命扣（turret 12 / rune 8 / 其它 6）', () => {
    const turret = { kind: 'turret', alive: true };
    expect(damageSummon(turret, 5)).toBe(5);
    expect(turret.hp).toBe(7);

    const rune = { kind: 'rune', alive: true };
    damageSummon(rune, 1);

    const homing = { kind: 'homing', alive: true };
    expect(damageSummon(homing, 100)).toBe(6);
    expect(homing.alive).toBe(false);
  });
});

describe('确定性与纯净性', () => {
  let randomSpy;
  beforeEach(() => { randomSpy = vi.spyOn(Math, 'random'); });
  afterEach(() => { randomSpy.mockRestore(); });

  it('同一输入两次运行结果完全一致，且全程不调用 Math.random', () => {
    const run = () => stepHostileShots(
      [
        { x: 0, y: 0, vx: 30, vy: 10, damage: 2, lifeMs: 2000 },
        { x: 10, y: 10, vx: -20, vy: 25, kind: 'homing', damage: 1, lifeMs: 2000 },
        { x: 400, y: 400, vx: 0, vy: 0, kind: 'orb', damage: 3, lifeMs: 2000 },
      ],
      { dtMs: 33, player: player(20, 20, 5), world: world(500, 500), maxShots: 96 },
    );
    const a = run();
    const b = run();
    expect(a).toEqual(b);
    expect(randomSpy).not.toHaveBeenCalled();
  });

  it('召唤物推进同样确定且不调用 Math.random', () => {
    const seedList = () => [
      { kind: 'turret', x: 0, y: 0, lifeMs: 5000, intervalMs: 1200, damage: 2 },
      { kind: 'rune', x: 40, y: 40, lifeMs: 1200, damage: 4 },
    ];
    const opts = () => ({ dtMs: 1200, player: player(200, 0, 5), world: world(), maxShots: 96 });
    const a = stepSummons(seedList(), opts());
    const b = stepSummons(seedList(), opts());
    expect(a).toEqual(b);
    expect(randomSpy).not.toHaveBeenCalled();
  });

  it('leadAim 与扇形判定不调用 Math.random', () => {
    leadAim({ x: 0, y: 0 }, { x: 10, y: 0, vx: 3, vy: 4 }, 50);
    arcHitTest({ x: 0, y: 0 }, 0, 1, 10, { x: 5, y: 5 });
    meleeHits({ x: 0, y: 0, angle: 0, arc: 1, range: 10 }, player(5, 0));
    damageSummon({ kind: 'turret', hp: 3 }, 1);
    expect(randomSpy).not.toHaveBeenCalled();
  });
});
