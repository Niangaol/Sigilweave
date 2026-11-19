import { describe, it, expect, vi } from 'vitest';
import { FakeScene, makePlayer } from './helpers/player-fixture.js';
// BattleScene 顶层 import 了 Phaser：Node 里没有 window，按 battle-flow.test.js 的既有做法替身掉。
// 这里只需要 Scene 基类与两个事件表——本文件只驱动原型方法，不建真场景。
vi.mock('phaser', () => {
  class Scene { constructor(key) { this.key = key; } }
  return {
    default: {
      Scene,
      Core: { Events: { BLUR: 'blur', FOCUS: 'focus' } },
      Scenes: { Events: { CREATE: 'create', SHUTDOWN: 'shutdown' } },
      BlendModes: { ADD: 1 },
    },
  };
});
import BattleScene from '../src/scenes/BattleScene.js';
import { C } from '../src/ui/Palette.js';

describe('击退僵直与眩晕分开', () => {
  it('applyKnockStun 只写 knockStunUntil', () => {
    const p = makePlayer();
    p.applyKnockStun(240, 1000);
    expect(p.knockStunUntil).toBe(1240);
    expect(p.stunUntil).toBe(0);
  });
  it('knockStun 期间移动被挡', () => {
    const p = makePlayer();
    p.applyKnockStun(240, 1000);
    expect(p.moveBlocked(1100)).toBe(true);
    expect(p.moveBlocked(1300)).toBe(false);
  });
  it('applyControl 仍只认 stun/root/slow', () => {
    const p = makePlayer();
    expect(p.applyControl('knock', 240, 1000)).toBe(false);
  });
});

const WORLD = { left: 0, top: 20, right: 480, bottom: 250 };

it('冲刺位移 108px 且到点停住', () => {
  const p = makePlayer(); p.x = 240; p.y = 135;
  p.startDash(1, 0, 0);
  p.updateDash(90, WORLD, 90);
  expect(Math.round(p.x)).toBe(294);   // 240 + 108×0.5
  p.updateDash(90, WORLD, 180);
  expect(Math.round(p.x)).toBe(348);
  expect(p.updateDash(16, WORLD, 200)).toBe(false);
});
it('冲刺写无敌 220ms 但不动 invulnUntil', () => {
  const p = makePlayer(); p.startDash(1, 0, 0);
  expect(p.dashInvulnUntil).toBe(220);
  expect(p.invulnUntil).toBe(0);
  expect(p.takeDamage(10, 100)).toBe(false);   // 冲刺无敌挡住
});
it('冲刺无敌不覆盖受击无敌', () => {
  const p = makePlayer();
  p.takeDamage(5, 0);                          // invulnUntil = 660
  p.startDash(1, 0, 100);                      // dashInvulnUntil = 320
  expect(p.invulnUntil).toBe(660);
  expect(p.takeDamage(5, 400)).toBe(false);    // 660 仍生效
});
it('冷却 1.2s + 后摇 400ms', () => {
  const p = makePlayer(); p.startDash(1, 0, 0);
  p.updateDash(180, WORLD, 180);
  expect(p.startDash(1, 0, 181)).toBe(false);
  expect(p.startDash(1, 0, 579)).toBe(false);  // 180+400 后摇内
  expect(p.startDash(1, 0, 1200)).toBe(true);  // 1.2s 到
});
it('无输入朝 facing', () => {
  const p = makePlayer(); p.facing = -1; p.startDash(0, 0, 0);
  expect(p.dashDir.x).toBe(-1); expect(p.dashDir.y).toBe(0);
});
it('冲刺启动时清 root/slow/knockStun，不清 stun', () => {
  const p = makePlayer();
  p.applyControl('root', 800, 0);
  p.applyControl('slow', 800, 0);
  p.applyKnockStun(240, 0);
  p.applyControl('stun', 700, 0);
  p.startDash(1, 0, 100);
  expect(p.rootUntil).toBe(0);
  expect(p.slowUntil).toBe(0);
  expect(p.knockStunUntil).toBe(0);
  expect(p.stunUntil).toBe(700);
});
it('冲刺启动之后挂的控制照常生效', () => {
  const p = makePlayer(); p.startDash(1, 0, 0);
  p.applyControl('root', 800, 90);
  expect(p.rootUntil).toBe(890);
});
it('冲刺越界被钳制', () => {
  const p = makePlayer(); p.x = 470;
  p.startDash(1, 0, 0);
  p.updateDash(180, WORLD, 180);
  expect(p.x).toBe(WORLD.right);
});

// Minor 5：dashUntil === 0（从未冲刺过）时 now === 0 的帧会把 t 算成 k=1，
// 一次性瞬移 +108px。updateDash 必须显式要求 dashUntil 是个正的时刻。
it('没冲刺过时 updateDash 不动位置', () => {
  const p = makePlayer(); p.x = 240; p.y = 135;
  expect(p.dashUntil).toBe(0);
  expect(p.updateDash(16, WORLD, 0)).toBe(false);
  expect(p.x).toBe(240);
  expect(p.y).toBe(135);
});

// A4：update 必须在冲刺期间把位移交给 updateDash，普通移动整帧跳过——
// 否则输入轴会在冲刺时间轴之外再叠一份位移，冲刺距离不再是稳定的 108px。
it('冲刺期间普通移动不生效', () => {
  const p = makePlayer();
  p.startDash(1, 0, 0);
  p.update(16, 0, -1, WORLD, 16);
  expect(p.y).toBe(135);
});

// ---------- 场景级：BattleScene.tryDash 的门槛/冷却/右键接线 ----------
// 用最小替身驱动原型方法：渲染、实体、音效全部顶掉，只留 tryDash 真正会碰的字段。
function makeBattle(over = {}) {
  const player = makePlayer();
  const bursts = [];
  const input = { on() {}, off() {} };
  const scene = {
    phase: 'play', paused: false, menuOpen: false, editOpen: false, hitstopLeft: 0,
    engine: { now: 0 },
    player,
    input,
    axis: { dx: 1, dy: 0 },
    readMoveAxis() { return this.axis; },
    effects: { burst: (...a) => bursts.push(a) },
    ...over,
  };
  // 原型方法按真实调用关系挂上去：dashPointer 内部还会走 this.tryDash
  scene.tryDash = (...a) => BattleScene.prototype.tryDash.call(scene, ...a);
  scene.bindDashPointer = () => BattleScene.prototype.bindDashPointer.call(scene);
  scene.updatePlayer = (dt) => BattleScene.prototype.updatePlayer.call(scene, dt);
  return { scene, player, bursts, input };
}
const call = (scene, method, ...args) => BattleScene.prototype[method].call(scene, ...args);

describe('右键冲刺接线（BattleScene.tryDash）', () => {
  it('按输入方向起跑，并放青色爆点', () => {
    const { scene, player, bursts } = makeBattle();
    expect(call(scene, 'tryDash', 0)).toBe(true);
    expect(player.dashUntil).toBe(180);
    expect(player.dashDir).toEqual({ x: 1, y: 0 });
    expect(bursts).toHaveLength(1);
    expect(bursts[0][2]).toBe(C.teal);
    expect(bursts[0][3]).toBe(8);
  });
  it('无输入时朝 facing', () => {
    const { scene, player } = makeBattle({ axis: { dx: 0, dy: 0 } });
    player.facing = -1;
    expect(call(scene, 'tryDash', 0)).toBe(true);
    expect(player.dashDir.x).toBe(-1);
  });
  it('暂停、编辑、顿帧、三选一、死亡都不给冲', () => {
    const dead = makeBattle();
    dead.player.alive = false;
    const cases = [
      makeBattle({ paused: true }),
      makeBattle({ editOpen: true }),
      makeBattle({ hitstopLeft: 30 }),
      makeBattle({ phase: 'levelup' }),   // 升级三选一里 phase 已不是 play
      dead,
    ];
    for (const { scene, player } of cases) {
      expect(call(scene, 'tryDash', 0)).toBe(false);
      expect(player.dashUntil).toBe(0);
    }
  });
  it('冷却中再按无效', () => {
    const { scene } = makeBattle();
    expect(call(scene, 'tryDash', 0)).toBe(true);
    expect(call(scene, 'tryDash', 100)).toBe(false);
  });
  it('冲刺期间 updatePlayer 只喂 dt，不喂输入轴', () => {
    const { scene, player } = makeBattle();
    scene.worldBounds = WORLD;
    scene.playerSlowUntil = 0;
    expect(call(scene, 'tryDash', 0)).toBe(true);
    const seen = [];
    player.update = (dt, dx, dy) => seen.push({ dt, dx, dy });
    call(scene, 'updatePlayer', 16);
    expect(seen).toEqual([{ dt: 16, dx: 0, dy: 0 }]);
    scene.engine.now = 400;                 // 冲刺结束，输入恢复
    call(scene, 'updatePlayer', 16);
    expect(seen[1]).toEqual({ dt: 16, dx: 1, dy: 0 });
  });
  it('只认右键：左键不触发，右键起跑；重复绑定不叠监听', () => {
    const { scene, player, input } = makeBattle();
    const bound = [];
    input.on = (ev, fn) => bound.push([ev, fn]);
    call(scene, 'bindDashPointer');
    expect(bound).toEqual([['pointerdown', scene.dashPointer]]);
    scene.dashPointer({ button: 0 });       // 左键留给走位与编辑
    expect(player.dashUntil).toBe(0);
    scene.dashPointer({ button: 2 });       // 右键
    expect(player.dashUntil).toBe(180);
    call(scene, 'bindDashPointer');         // 二次 create 不叠监听
    expect(bound).toHaveLength(1);
  });

  // Important-3：冲刺期间位置归 updateDash 时间轴独占，击退位移写进去也会被下一帧抹掉，
  // 玩家会以为「击退失效」。所以冲刺中只挂击退僵直、不做位移；僵直照常生效
  // （冲刺无敌只免伤不免控）。
  it('冲刺中被击退：只挂僵直不位移', () => {
    const { scene, player } = makeBattle();
    scene.worldBounds = WORLD;
    expect(call(scene, 'tryDash', 0)).toBe(true);
    player.updateDash(90, WORLD, 90);          // 冲到一半：x = 294
    expect(Math.round(player.x)).toBe(294);
    call(scene, 'applyPlayerControl', { kind: 'knock', ms: 240, force: 40 }, 200, 135, 90);
    expect(player.x).toBe(294);                // 位移没生效（写了也会被时间轴覆盖）
    expect(player.knockStunUntil).toBe(330);   // 僵直照挂
  });
  it('非冲刺时被击退：位移与僵直都生效', () => {
    const { scene, player } = makeBattle();
    scene.worldBounds = WORLD;
    player.x = 240;
    call(scene, 'applyPlayerControl', { kind: 'knock', ms: 240, force: 40 }, 200, 135, 1000);
    expect(player.x).toBeGreaterThan(240);    // 远离来源方向顶开
    expect(player.knockStunUntil).toBe(1240);
  });
});
