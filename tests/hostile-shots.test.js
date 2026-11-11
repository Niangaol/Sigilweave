// 大地图回归：敌方弹丸（Boss 弹幕 / 远程杂兵）在世界坐标飞行，
// 不能被旧单屏 480×270 边界清退——否则战斗发生在地图左上角以外时弹幕首发即消失。
import { describe, it, expect, vi } from 'vitest';

vi.mock('phaser', () => {
  class Scene {
    constructor(config) { this.config = config; }
  }
  return {
    default: {
      Scene,
      Core: { Events: { BLUR: 'blur', FOCUS: 'focus' } },
      Scenes: { Events: { CREATE: 'create', SHUTDOWN: 'shutdown' } },
    },
  };
});

import BattleScene from '../src/scenes/BattleScene.js';
import { createBossModel, stepBoss } from '../src/logic/boss.js';
import { WORLD_SIZES } from '../src/logic/constants.js';

// 真实 Boss 弹幕：预警结束后在 position 朝 target 发射
function bossShots(act, position, target) {
  const model = createBossModel(act);
  stepBoss(model, 1200, position, target);
  return stepBoss(model, 600, position, target);
}

// 只带 updateHostileShots 需要的最小上下文，不启动 Phaser
function makeCtx(world, player, shots) {
  return {
    world,
    hostileShots: shots,
    hostileG: { clear() {}, fillStyle() {}, fillRect() {} },
    player: {
      x: player.x, y: player.y, radius: 5,
      hits: [],
      takeDamage(amount, now) { this.hits.push({ amount, now }); return true; },
    },
    engine: { now: 1000 },
    effects: { hurtCount: 0, hurt() { this.hurtCount++; } },
  };
}

const step = (ctx, dt) => BattleScene.prototype.updateHostileShots.call(ctx, dt);

describe('敌方弹丸按世界边界飞行', () => {
  it.each([1, 2, 3])('第 %i 幕：地图中心开战时 Boss 弹幕不会首发即被清退', act => {
    const world = WORLD_SIZES[act];
    const player = { x: world.w / 2, y: world.h / 2 };
    const bossPos = { x: player.x, y: player.y - 110 };
    const shots = bossShots(act, bossPos, player);
    expect(shots.length).toBeGreaterThan(0);
    const ctx = makeCtx(world, player, shots.map(s => ({ ...s })));
    step(ctx, 16);
    expect(ctx.hostileShots).toHaveLength(shots.length);
    // 弹丸确实按速度推进，而不是原地不动
    const moved = ctx.hostileShots.some(s => Math.abs(s.x - bossPos.x) > 0.01 || Math.abs(s.y - bossPos.y) > 0.01);
    expect(moved).toBe(true);
  });

  it('世界中心的远程弹丸能命中玩家并结算伤害', () => {
    const world = WORLD_SIZES[1];
    const player = { x: world.w / 2, y: world.h / 2 };
    // 玩家正上方 20px、朝玩家飞的一发弹丸（ cultist / 主教同款世界坐标弹）
    const shot = { x: player.x, y: player.y - 20, vx: 0, vy: 60, damage: 3, lifeMs: 6000 };
    const ctx = makeCtx(world, player, [shot]);
    step(ctx, 16); // 前进约 1px，尚未命中
    expect(ctx.hostileShots).toHaveLength(1);
    expect(ctx.player.hits).toHaveLength(0);
    for (let i = 0; i < 20 && ctx.hostileShots.length; i++) step(ctx, 16);
    expect(ctx.hostileShots).toHaveLength(0);
    expect(ctx.player.hits).toEqual([{ amount: 3, now: 1000 }]);
    expect(ctx.effects.hurtCount).toBe(1);
  });

  it('旧屏幕区域（左上角）内的弹丸行为不变', () => {
    const ctx = makeCtx(WORLD_SIZES[1], { x: 240, y: 200 }, [
      { x: 200, y: 150, vx: 30, vy: 0, damage: 2, lifeMs: 6000 },
    ]);
    step(ctx, 16);
    expect(ctx.hostileShots).toHaveLength(1);
    expect(ctx.hostileShots[0].x).toBeGreaterThan(200);
  });

  it('飞出世界边界或寿命耗尽的弹丸仍被清退', () => {
    const world = WORLD_SIZES[1];
    const ctx = makeCtx(world, { x: world.w / 2, y: world.h / 2 }, [
      { x: world.w + 1, y: 500, vx: 10, vy: 0, damage: 2, lifeMs: 6000 },
      { x: 500, y: world.h + 1, vx: 0, vy: 10, damage: 2, lifeMs: 6000 },
      { x: -1, y: 500, vx: -10, vy: 0, damage: 2, lifeMs: 6000 },
      { x: 500, y: -1, vx: 0, vy: -10, damage: 2, lifeMs: 6000 },
      { x: 500, y: 500, vx: 0, vy: 0, damage: 2, lifeMs: 10 },
    ]);
    step(ctx, 16);
    expect(ctx.hostileShots).toHaveLength(0);
  });
});