import { describe, it, expect } from 'vitest';
import { createBossModel, stepBoss, resolveBossOnce, bossPattern, bossStats, BOSS_HP, BOSS_ARMOR } from '../src/logic/boss.js';
import Boss from '../src/entities/Boss.js';
import { C } from '../src/ui/Palette.js';

const fireOnce = (stage, position = { x: 0, y: 0 }, target = { x: 100, y: 0 }) => {
  const boss = createBossModel(stage);
  stepBoss(boss, 1200, position, target);   // 进入预警
  return { boss, shots: stepBoss(boss, 600, position, target) };
};

describe('Boss预警与实际攻击', () => {
  it('先等待再600ms预警，瞄准快照不跟随玩家移动', () => {
    const boss = createBossModel(1), p = { x: 0, y: 0 }, target = { x: 100, y: 0 };
    expect(stepBoss(boss, 1200, p, target)).toEqual([]);
    expect(boss.windupLeft).toBe(600); expect(boss.aim).toEqual(target);
    expect(stepBoss(boss, 599, p, { x: 0, y: 100 })).toEqual([]);
    const shots = stepBoss(boss, 1, p, { x: 0, y: 100 });
    expect(shots).toHaveLength(5); expect(shots[2].vx).toBeGreaterThan(0); expect(shots[2].vy).toBe(0);
    expect(boss.shots).toBe(1); expect(shots.every(s => s.damage > 0)).toBe(true);
  });

  it('后续攻击也需要下一轮预警', () => {
    const { boss } = fireOnce(3);
    expect(stepBoss(boss, 100, { x: 1, y: 1 }, { x: 1, y: 1 })).toEqual([]);
    expect(boss.shots).toBe(1);
  });

  it.each([
    [1, 5], [2, 8], [3, 7], [4, 6], [5, 10], [6, 3], [7, 9],
  ])('第 %i 场使用自己的弹幕模板（%i 发）', (stage, count) => {
    const { shots } = fireOnce(stage);
    expect(shots).toHaveLength(count);
    expect(shots.every(s => s.damage > 0 && s.lifeMs > 0)).toBe(true);
  });

  it('七场弹幕形态确实不同：一扇形、二环形、三更快，后四场各有专属模板', () => {
    const one = fireOnce(1).shots;
    const two = fireOnce(2).shots;
    const three = fireOnce(3).shots;
    // 环形应覆盖多个方向（正负都有），扇形集中在正前方一侧
    expect(two.some(s => s.vx < 0)).toBe(true);
    expect(two.some(s => s.vx > 0)).toBe(true);
    expect(one.every(s => s.vx >= 0)).toBe(true);       // 扇形整体朝目标方向
    expect(one.some(s => s.vy < 0) && one.some(s => s.vy > 0)).toBe(true); // 上下扩散
    // 三场速度更快，二场更慢
    const speed = (shots) => Math.hypot(shots[0].vx, shots[0].vy);
    expect(speed(three)).toBeGreaterThan(speed(one));
    expect(speed(two)).toBeLessThan(speed(one));
    expect(bossPattern(2).ring).toBe(true);
    expect(bossPattern(1).ring).toBeUndefined();
    // 后四场：四/六是扇形，五环形，七是更快的宽扇
    expect(bossPattern(4).ring).toBeUndefined();
    expect(bossPattern(5).ring).toBe(true);
    expect(bossPattern(6).ring).toBeUndefined();
    expect(speed(fireOnce(7).shots)).toBeGreaterThan(speed(fireOnce(6).shots));
    expect(new Set([1, 2, 3, 4, 5, 6, 7].map((stage) => bossPattern(stage).name)).size).toBe(7);
  });

  it.each([NaN, -1, Infinity])('非法步长%j不产生伤害弹丸', dt => {
    const boss = createBossModel(); const before = structuredClone(boss);
    expect(stepBoss(boss, dt, {x:0,y:0}, {x:1,y:1})).toEqual([]); expect(boss).toEqual(before);
  });
  it.each([0,8,'1',1.5])('非法场数%j拒绝', stage => expect(() => createBossModel(stage)).toThrow(RangeError));
  it('省略场数时默认第 1 场', () => expect(createBossModel()).toEqual(createBossModel(1)));
  it('未知场的模板回退到第一场', () => expect(bossPattern(9)).toBe(bossPattern(1)));
});

describe('统一Boss击败收据', () => {
  it.each(['quiz','combat'])('大 Boss 不同路径%s奖励相同且只记一次', method => {
    const run = { stage: 1 };
    const first = resolveBossOnce(run, 1, 'boss-1', method);
    expect(first).toMatchObject({ ok: true, reward: 12 });
    expect(first.receipt).toMatchObject({ stage: 1, bossId: 'boss-1', tier: 'major', method, reward: 12 });
    expect(resolveBossOnce(run, 1, 'boss-1', method === 'quiz' ? 'combat' : 'quiz')).toEqual({ ok: false, reward: 0 });
    first.receipt.reward = 999; expect(run.bossResolutions[1].reward).toBe(12);
  });

  it('大 Boss 按场记账：同场记两次只成功一次，跨场各记一次', () => {
    const run = { stage: 1, bossResolutions: {}, miniBossResolutions: {} };
    expect(resolveBossOnce(run, 1, 'boss-1', 'quiz', 'major')).toMatchObject({ ok: true, reward: 12 });
    expect(resolveBossOnce(run, 1, 'boss-1', 'combat', 'major')).toEqual({ ok: false, reward: 0 });
    // 第 4 幕有两场：解了场 4 不等于解了场 5，也不能提前领场 6。
    run.stage = 4;
    expect(resolveBossOnce(run, 4, 'boss-4', 'quiz', 'major').ok).toBe(true);
    expect(resolveBossOnce(run, 5, 'boss-5', 'quiz', 'major')).toEqual({ ok: false, reward: 0 });
    expect(resolveBossOnce(run, 6, 'boss-6', 'quiz', 'major')).toEqual({ ok: false, reward: 0 });
    run.stage = 5;
    expect(resolveBossOnce(run, 5, 'boss-5', 'quiz', 'major').ok).toBe(true);
    expect(Object.keys(run.bossResolutions).map(Number)).toEqual([1, 4, 5]);
    expect(run.bossResolutions[4].stage).toBe(4);
    expect(run.bossResolutions[5].stage).toBe(5);
  });

  it('七契：七场大 Boss 各记一条，账本共七条', () => {
    const run = { stage: 1, bossResolutions: {}, miniBossResolutions: {} };
    for (let stage = 1; stage <= 7; stage++) {
      run.stage = stage;
      expect(resolveBossOnce(run, stage, 'boss-' + stage, 'combat', 'major')).toMatchObject({ ok: true, reward: 12 });
      expect(resolveBossOnce(run, stage, 'boss-' + stage, 'combat', 'major')).toEqual({ ok: false, reward: 0 });
    }
    expect(Object.keys(run.bossResolutions).map(Number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(Object.values(run.bossResolutions).every(r => r.tier === 'major')).toBe(true);
    expect(Object.keys(run.miniBossResolutions)).toEqual([]);
  });

  it('小 Boss 仍按 bossId 每局一次，receipt 带场号，奖励 6', () => {
    const run = { stage: 1, miniBossResolutions: {} };
    const first = resolveBossOnce(run, 1, 'miniboss-1c', 'quiz', 'mini');
    expect(first).toMatchObject({ ok: true, reward: 6 });
    expect(first.receipt).toMatchObject({ stage: 1, bossId: 'miniboss-1c', tier: 'mini', method: 'quiz', reward: 6 });
    expect(resolveBossOnce(run, 1, 'miniboss-1c', 'combat', 'mini').ok).toBe(false);
    expect(run.miniBossResolutions['miniboss-1c'].stage).toBe(1);
    expect(run.bossResolutions).toBeUndefined();   // 小 Boss 不碰大 Boss 账本
  });

  it('场号超出 1..7 或与当前场不符时拒绝', () => {
    const run = { stage: 4 };
    expect(resolveBossOnce(run, 6, 'boss-6', 'quiz')).toEqual({ ok: false, reward: 0 });
    expect(run.bossResolutions).toBeUndefined();
    for (const bad of [0, 8, '1', 1.5, NaN, undefined]) {
      expect(resolveBossOnce({ stage: 1 }, bad, 'boss-1', 'quiz')).toEqual({ ok: false, reward: 0 });
    }
  });

  it.each([null, 'run', [], {stage:1,bossResolutions:[]}])('非法会话%j不抛错', run => {
    expect(() => resolveBossOnce(run,1,'boss-1','quiz')).not.toThrow();
    expect(resolveBossOnce(run,1,'boss-1','quiz').ok).toBe(false);
  });
  it('未知通关方式不发奖励', () => expect(resolveBossOnce({stage:1},1,'boss-1','skip')).toEqual({ok:false,reward:0}));
});

describe('Boss 血量与专属固定减伤', () => {
  it('小 Boss 血量 = base + perStage × 场，场 Boss 再乘 majorMul', () => {
    expect(BOSS_HP.base).toBeGreaterThan(0);
    expect(BOSS_HP.perStage).toBeGreaterThan(0);
    expect(BOSS_HP.majorMul).toBeGreaterThan(1);
    for (let stage = 1; stage <= 7; stage++) {
      const base = BOSS_HP.base + BOSS_HP.perStage * stage;
      expect(bossStats(stage, 'mini').hp).toBe(base);
      expect(bossStats(stage).hp).toBe(Math.round(base * BOSS_HP.majorMul));
      expect(bossStats(stage, 'major').hp).toBe(bossStats(stage).hp);
    }
    // 血量必须严格随场号上涨（这是「Boss 越来越硬」的契约）
    for (let stage = 2; stage <= 7; stage++) {
      expect(bossStats(stage, 'mini').hp).toBeGreaterThan(bossStats(stage - 1, 'mini').hp);
    }
  });

  it('减伤固定：小 Boss 25%、场 Boss 30%，且走 armor 通道', () => {
    expect(BOSS_ARMOR).toEqual({ mini: 0.25, major: 0.30 });
    for (let stage = 1; stage <= 7; stage++) {
      expect(bossStats(stage, 'mini').armor).toBe(0.25);
      expect(bossStats(stage).armor).toBe(0.30);
    }
  });

  it('非法场号回退第一场，未知 tier 按场 Boss 处理', () => {
    expect(bossStats(0, 'mini')).toEqual(bossStats(1, 'mini'));
    expect(bossStats(99, 'mini')).toEqual(bossStats(1, 'mini'));
    expect(bossStats(2, 'weird')).toEqual(bossStats(2, 'major'));
    // 具体基准值由数值表决定，这里只钉死「回退/别名」行为
    expect(Object.keys(BOSS_HP).sort()).toEqual(['base', 'majorMul', 'perStage']);
  });
});

// B7：血条阶段刻度。Boss.draw 画在 Phaser Graphics 上，测试用假 Graphics 记录 fillRect，
// 直接断言刻度的位置与点亮色——「不抛错」的冒烟测试挡不住刻度画错地方或忘记点亮。
describe('B7 血条阶段刻度', () => {
  const fakeScene = () => {
    const rects = [];
    const g = {
      color: null, alpha: 1,
      fillStyle(color, alpha = 1) { this.color = color; this.alpha = alpha; },
      lineStyle() {},
      fillRect(x, y, w, h) { rects.push({ x, y, w, h, color: this.color, alpha: this.alpha }); },
      fillPoints(points) { for (const p of points) rects.push({ x: p.x, y: p.y, w: 1, h: 1, color: this.color, alpha: this.alpha }); },
      strokePoints() {},
      clear() { rects.length = 0; },
      setDepth() { return this; },
      destroy() {},
    };
    return {
      rects,
      engine: { now: 0 },
      add: { graphics: () => g },
      textures: { exists: () => false },   // 素材缺失 → 走程序化回退血条（x-17 / y-26）
      addHostileShot() {},
      world: { w: 480, h: 270 },
      grid: { cells: [] },
      player: { x: 240, y: 200 },
      effects: { burst() {}, labelPopup() {} },
    };
  };

  // 血条上的刻度：1px 宽、比血条高出各 1px，按 barY-1 起画
  const tickAt = (rects, x, barY) => rects.find(r => r.x === x && r.y === barY - 1 && r.w === 1 && r.h === 5);

  it('draw(0) 在 phase===2 时不抛错，且 66% / 33% 两道刻度都被 brassLight 点亮', () => {
    const scene = fakeScene();
    const boss = new Boss(scene, { tier: 'major' }, 3, 1);
    boss.model.phase = 2;   // 已跨过两条换招线
    expect(() => boss.draw(0)).not.toThrow();
    const barY = Math.round(boss.y) - 26;
    const bx = Math.round(boss.x) - 17;
    const t1 = tickAt(scene.rects, bx + Math.round(34 * 0.66), barY);
    const t2 = tickAt(scene.rects, bx + Math.round(34 * 0.33), barY);
    expect(t1).toBeTruthy();
    expect(t2).toBeTruthy();
    expect(t1.color).toBe(C.brassLight);
    expect(t2.color).toBe(C.brassLight);
  });

  it('phase 1 只点亮 66% 那道：33% 还是预告，不是已完成的状态', () => {
    const scene = fakeScene();
    const boss = new Boss(scene, { tier: 'major' }, 3, 1);
    boss.model.phase = 1;
    boss.draw(0);
    const barY = Math.round(boss.y) - 26;
    const bx = Math.round(boss.x) - 17;
    expect(tickAt(scene.rects, bx + Math.round(34 * 0.66), barY).color).toBe(C.brassLight);
    expect(tickAt(scene.rects, bx + Math.round(34 * 0.33), barY).color).not.toBe(C.brassLight);
  });

  it('phase 0 两道都不点亮，且刻度不与血条填充同色（否则看不出是刻度）', () => {
    const scene = fakeScene();
    const boss = new Boss(scene, { tier: 'major' }, 3, 1);
    boss.draw(0);
    const barY = Math.round(boss.y) - 26;
    const bx = Math.round(boss.x) - 17;
    for (const ratio of [0.66, 0.33]) {
      const tick = tickAt(scene.rects, bx + Math.round(34 * ratio), barY);
      expect(tick).toBeTruthy();
      expect(tick.color).not.toBe(C.brassLight);
      expect(tick.color).not.toBe(C.blood);   // 血条填充色，撞色就白画了
    }
  });
});
