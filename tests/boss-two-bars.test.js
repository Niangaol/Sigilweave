// Boss 多管血：打空一管不回死，标记 pendingBarShift 交给场景层回满进二阶段。
// 覆盖：applyDamage 的拦截、enterNextBar 的回满/换阶段、第二条血打空才死、普通怪零漂移。
import { describe, expect, it } from 'vitest';
import { applyDamage } from '../src/logic/effects.js';
import { bossPattern } from '../src/logic/boss.js';
import Boss from '../src/entities/Boss.js';

function fakeScene() {
  const rects = [];
  const g = {
    color: null, alpha: 1,
    fillStyle(color, alpha = 1) { this.color = color; this.alpha = alpha; },
    lineStyle() {},
    fillRect(x, y, w, h) { rects.push({ x, y, w, h, color: this.color, alpha: this.alpha }); },
    fillPoints(points) { for (const pt of points) rects.push({ x: pt.x, y: pt.y, w: 1, h: 1, color: this.color, alpha: this.alpha }); },
    strokePoints() {},
    clear() { rects.length = 0; },
    setDepth() { return this; },
    destroy() {},
  };
  return {
    rects,
    engine: { now: 0 },
    add: { graphics: () => g },
    textures: { exists: () => false },
    addHostileShot() {},
    world: { w: 480, h: 270 },
    grid: { cells: [] },
    player: { x: 240, y: 200 },
    effects: { burst() {}, labelPopup() {} },
    cameras: { main: { shake() {} } },
  };
}

describe('Boss 多管血', () => {
  it('打空第一条血：不死亡，标记 pendingBarShift，hp 归零', () => {
    const scene = fakeScene();
    const boss = new Boss(scene, { tier: 'major' }, 1, 1);
    boss.hp = 5;
    applyDamage(boss, 999, 0);
    expect(boss.hp).toBe(0);
    expect(boss.alive).toBe(true);          // 没死
    expect(boss.pendingBarShift).toBe(true);
    expect(boss.bar).toBe(0);
  });

  it('场景消费 pendingBarShift 后：回满、进入第二条血、冻结 900ms', () => {
    const scene = fakeScene();
    const boss = new Boss(scene, { tier: 'major' }, 1, 1);
    boss.hp = 5;
    applyDamage(boss, 999, 0);
    const style = boss.enterNextBar();
    boss.pendingBarShift = false;
    expect(style).toBeTruthy();
    expect(boss.bar).toBe(1);
    expect(boss.hp).toBe(boss.maxHp);
    expect(boss.alive).toBe(true);
    expect(boss.model.phase).toBe(1);
    expect(boss.model.shiftLeft).toBe(900);
  });

  it('第二条血打空才真正死亡', () => {
    const scene = fakeScene();
    const boss = new Boss(scene, { tier: 'major' }, 1, 1);
    boss.hp = 5;
    applyDamage(boss, 999, 0);
    boss.enterNextBar();
    boss.pendingBarShift = false;
    boss.hp = 5;
    applyDamage(boss, 999, 0);
    expect(boss.alive).toBe(false);
    expect(boss.pendingBarShift).not.toBe(true);
  });

  it('普通怪（无 bar 字段）行为不变：血量归零即死亡', () => {
    const mob = { alive: true, hp: 10, armor: 0 };
    applyDamage(mob, 999, 0);
    expect(mob.hp).toBe(0);
    expect(mob.alive).toBe(false);
    expect(mob.pendingBarShift).toBeUndefined();
  });

  it('阶段 2 换弹幕表：场 7 从九线变成扇形十一发', () => {
    const p1 = bossPattern(7, 0);
    const p2 = bossPattern(7, 1);
    expect(p1.count).toBe(9);
    expect(p2.count).toBe(11);
    expect(p2.ring).not.toBe(true);
  });
});
