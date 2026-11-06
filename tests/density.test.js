// 割草密度：难度曲线 / 接触伤害 / 分桶分离 / 一波多点（纯逻辑，不依赖 Phaser）
import { describe, it, expect } from 'vitest';
import {
  ENEMY_TYPES, DIFFICULTY, ACT_DENSITY, ACT_ENEMY_WEIGHTS, difficultyAt,
} from '../src/data/roster.js';
import {
  pickSpawnPoint, pickWavePoints, separateEnemies, separateEnemiesBucketed,
  MAX_WAVE_POINTS, SEPARATE_BRUTE_LIMIT,
} from '../src/logic/spawn.js';
import { Rng } from '../src/logic/rng.js';

const world = { w: 1920, h: 1440 };
const player = { x: 960, y: 720 };

// 固定序列伪随机：用项目自带的 Rng，保证测试本身可复现
const rngOf = (seed) => { const r = new Rng(seed); return () => r.next(); };

// 造 n 只随机敌人：留出 40px 边距，保证推挤后也不会被推到负坐标
function makeEnemies(n, seed = 20261025) {
  const rnd = rngOf(seed);
  const list = [];
  for (let i = 0; i < n; i++) {
    list.push({
      id: i,
      alive: true,
      x: 40 + rnd() * (world.w - 80),
      y: 40 + rnd() * (world.h - 80),
    });
  }
  return list;
}

// 场上最近一对活怪的距离（用于验证「任一对 >= gap」不变量）
function minPairDistance(list) {
  let min = Infinity;
  for (let i = 0; i < list.length; i++) {
    if (!list[i]?.alive) continue;
    for (let j = i + 1; j < list.length; j++) {
      if (!list[j]?.alive) continue;
      const d = Math.hypot(list[i].x - list[j].x, list[i].y - list[j].y);
      if (d < min) min = d;
    }
  }
  return min;
}

describe('difficultyAt：割草密度曲线', () => {
  it('第一幕起点：同屏 30、每 700ms 一波、单波 1 只', () => {
    expect(difficultyAt(0)).toMatchObject({
      hp: 4, speed: 38, spawnMs: 700, maxAlive: 30, damage: 3, wave: 1,
    });
  });

  it('第一幕满值：同屏 64、每 520ms 一波、单波最多 2 只', () => {
    expect(difficultyAt(DIFFICULTY.rampMs, 1)).toMatchObject({
      hp: 10, speed: 58, spawnMs: 520, maxAlive: 64, damage: 5, wave: 2,
    });
  });

  it('第二/三幕按 ACT_DENSITY 抬高同屏上限、压缩刷怪间隔', () => {
    expect(difficultyAt(0, 2).maxAlive).toBe(35);                     // round(30 × 1.15)
    expect(difficultyAt(0, 3).maxAlive).toBe(39);                     // round(30 × 1.30)
    expect(difficultyAt(0, 2).spawnMs).toBeCloseTo(700 * 0.92, 6);
    expect(difficultyAt(0, 3).spawnMs).toBeCloseTo(700 * 0.85, 6);
    expect(difficultyAt(DIFFICULTY.rampMs, 2).maxAlive).toBe(74);     // round(64 × 1.15)
    expect(difficultyAt(DIFFICULTY.rampMs, 3).maxAlive).toBe(83);     // round(64 × 1.30)
    expect(difficultyAt(DIFFICULTY.rampMs, 2).spawnMs).toBeCloseTo(520 * 0.92, 6);
    expect(difficultyAt(DIFFICULTY.rampMs, 3).spawnMs).toBeCloseTo(520 * 0.85, 6);

    // 第三幕永远是同屏最多、刷得最密的那一幕
    for (const ms of [0, 60000, DIFFICULTY.rampMs]) {
      expect(difficultyAt(ms, 3).maxAlive).toBeGreaterThan(difficultyAt(ms, 1).maxAlive);
      expect(difficultyAt(ms, 3).spawnMs).toBeLessThan(difficultyAt(ms, 1).spawnMs);
    }
  });

  it('幕密度只放大上限与间隔：血量/速度/伤害/单波数量三幕相同', () => {
    for (const ms of [0, 45000, DIFFICULTY.rampMs]) {
      const base = difficultyAt(ms, 1);
      for (const act of [2, 3]) {
        const dif = difficultyAt(ms, act);
        for (const key of ['hp', 'speed', 'damage', 'wave']) {
          expect(dif[key]).toBe(base[key]);
        }
      }
    }
  });

  it('不传 act 时与第一幕完全一致（旧签名向后兼容）', () => {
    for (const ms of [0, 12345, 90000, DIFFICULTY.rampMs, 9e9]) {
      expect(difficultyAt(ms)).toEqual(difficultyAt(ms, 1));
    }
  });

  it('非法 act 一律回退第一幕', () => {
    for (const act of [0, 4, -1, 1.5, '2', null, Number.NaN, Infinity, true, {}, undefined]) {
      expect(difficultyAt(60000, act)).toEqual(difficultyAt(60000, 1));
    }
  });

  it('非法 elapsedMs 按 0 处理，超界按 clamp 处理', () => {
    for (const ms of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 'abc', null, undefined, {}]) {
      expect(difficultyAt(ms)).toEqual(difficultyAt(0));
    }
    expect(difficultyAt(-5000)).toEqual(difficultyAt(0));
    expect(difficultyAt(9e9)).toEqual(difficultyAt(DIFFICULTY.rampMs));
  });

  it('wave 边界：k=0→1、k=1→2，全程都是 1..2 的整数且只增不减', () => {
    expect(difficultyAt(0).wave).toBe(1);
    expect(difficultyAt(DIFFICULTY.rampMs).wave).toBe(2);
    expect(difficultyAt(DIFFICULTY.rampMs * 0.25, 2).wave).toBe(1);   // 1 + 1×0.25 = 1.25 → 1
    expect(difficultyAt(DIFFICULTY.rampMs * 0.75, 2).wave).toBe(2);   // 1 + 1×0.75 = 1.75 → 2
    let prev = 1;
    for (let i = 0; i <= 60; i++) {
      const dif = difficultyAt(DIFFICULTY.rampMs * (i / 60), 3);
      expect(Number.isInteger(dif.wave)).toBe(true);
      expect(dif.wave).toBeGreaterThanOrEqual(1);
      expect(dif.wave).toBeLessThanOrEqual(2);
      expect(dif.wave).toBeGreaterThanOrEqual(prev);
      prev = dif.wave;
    }
  });

  it('同屏上限单调抬高、刷怪间隔单调缩短', () => {
    let lastAlive = 0;
    let lastSpawnMs = Infinity;
    for (let i = 0; i <= 36; i++) {
      const dif = difficultyAt(DIFFICULTY.rampMs * (i / 36), 3);
      expect(dif.maxAlive).toBeGreaterThanOrEqual(lastAlive);
      expect(dif.spawnMs).toBeLessThanOrEqual(lastSpawnMs);
      lastAlive = dif.maxAlive;
      lastSpawnMs = dif.spawnMs;
    }
  });

  it('ACT_DENSITY 三幕系数就是设计值', () => {
    expect(ACT_DENSITY[1]).toEqual({ maxAlive: 1, spawnMs: 1 });
    expect(ACT_DENSITY[2]).toEqual({ maxAlive: 1.15, spawnMs: 0.92 });
    expect(ACT_DENSITY[3]).toEqual({ maxAlive: 1.3, spawnMs: 0.85 });
  });
});

describe('敌人接触伤害：密度上调后同步下调', () => {
  it('七种敌人的伤害都是新值', () => {
    expect(ENEMY_TYPES.skeleton.damage).toBe(2);
    expect(ENEMY_TYPES.bat.damage).toBe(1);
    expect(ENEMY_TYPES.corpse.damage).toBe(3);
    expect(ENEMY_TYPES.cultist.damage).toBe(2);
    expect(ENEMY_TYPES.knight.damage).toBe(2);
    expect(ENEMY_TYPES.stitch_abomination.damage).toBe(4);
    expect(ENEMY_TYPES.oath_bishop.damage).toBe(3);
  });

  it('相对关系仍成立：腐尸比骷髅疼、蝙蝠比骷髅轻', () => {
    expect(ENEMY_TYPES.corpse.damage).toBeGreaterThan(ENEMY_TYPES.skeleton.damage);
    expect(ENEMY_TYPES.bat.damage).toBeLessThan(ENEMY_TYPES.skeleton.damage);
    expect(ENEMY_TYPES.knight.damage).toBeGreaterThanOrEqual(ENEMY_TYPES.skeleton.damage);
  });

  it('美术升级包只加新怪，旧怪 hpMul / speedMul / radius 保持不变', () => {
    expect(ENEMY_TYPES.bat.speedMul).toBeCloseTo(1.6, 6);
    expect(ENEMY_TYPES.corpse.speedMul).toBeCloseTo(0.55, 6);
    expect(ENEMY_TYPES.corpse.hpMul).toBeCloseTo(2.2, 6);
    expect(ENEMY_TYPES.stitch_abomination.hpMul).toBeCloseTo(4.5, 6);
    expect(ENEMY_TYPES.oath_bishop.hpMul).toBeCloseTo(3.5, 6);
    expect(ENEMY_TYPES.stitch_abomination.radius).toBe(14);
    expect(ENEMY_TYPES.oath_bishop.radius).toBe(12);
    expect(ACT_ENEMY_WEIGHTS[1]).toEqual([
      ['skeleton', 0.46], ['bat', 0.18], ['rune_spider', 0.24], ['stone_gargoyle', 0.12],
    ]);
    for (const act of [1, 2, 3]) {
      expect(ACT_ENEMY_WEIGHTS[act].reduce((sum, [, w]) => sum + w, 0)).toBeCloseTo(1, 12);
    }
  });
});

describe('分桶分离：语义与 O(n²) 版一致', () => {
  it('小规模（<= 48）直接走原实现，结果逐字段相同', () => {
    const make = () => [
      { id: 1, alive: true, x: 100, y: 100 },
      { id: 2, alive: true, x: 104, y: 100 },
      { id: 3, alive: true, x: 100, y: 106 },
    ];
    const fast = make();
    const slow = make();
    expect(SEPARATE_BRUTE_LIMIT).toBe(48);
    expect(separateEnemiesBucketed(fast, { gap: 22 })).toBe(separateEnemies(slow, { gap: 22 }));
    expect(fast).toEqual(slow);
  });

  it('120 只随机怪：两版都满足「任意一对距离 >= gap」', () => {
    const gap = 22;
    const bucket = makeEnemies(120, 11);
    const brute = makeEnemies(120, 11);
    separateEnemiesBucketed(bucket, { gap });
    separateEnemies(brute, { gap });
    expect(minPairDistance(bucket)).toBeGreaterThanOrEqual(gap - 1e-9);
    expect(minPairDistance(brute)).toBeGreaterThanOrEqual(gap - 1e-9);
  });

  it('完全重合的一对按 id 给确定方向分开（30 组，互不干扰）', () => {
    const list = [];
    for (let k = 0; k < 30; k++) {
      const x = 100 + (k % 6) * 300;
      const y = 100 + Math.floor(k / 6) * 300;
      list.push({ id: k * 2, alive: true, x, y }, { id: k * 2 + 1, alive: true, x, y });
    }
    expect(list).toHaveLength(60);                      // 保证走分桶分支
    expect(separateEnemiesBucketed(list, { gap: 22 })).toBe(30);
    for (let k = 0; k < 30; k++) {
      const d = Math.hypot(list[k * 2].x - list[k * 2 + 1].x, list[k * 2].y - list[k * 2 + 1].y);
      expect(d).toBeCloseTo(22, 6);
    }
  });

  it('Boss 既不进桶也不被推开', () => {
    const list = makeEnemies(60, 21);
    for (let i = 0; i < 5; i++) list[i].isBoss = true;
    list[5].x = list[0].x;                              // 一只杂兵正好压在 Boss 身上
    list[5].y = list[0].y;
    const before = list.map((e) => ({ x: e.x, y: e.y }));
    separateEnemiesBucketed(list, { gap: 22 });
    for (let i = 0; i < 5; i++) {
      expect(list[i].x).toBe(before[i].x);
      expect(list[i].y).toBe(before[i].y);
    }
    // 与 Boss 重合的杂兵也不算「一对」，不会被推开（Boss 有独立站位逻辑）
    expect(list[5].x).toBe(before[5].x);
    expect(list[5].y).toBe(before[5].y);
  });

  it('玩家贴身的一对不推（接触碎灭留给战斗层）', () => {
    const list = makeEnemies(60, 22);
    // 把其他怪挪远，只留最后一对贴在玩家身边
    for (let i = 0; i < 58; i++) { list[i].x = 100 + (i % 10) * 160; list[i].y = 100 + Math.floor(i / 10) * 220; }
    list[58].x = player.x + 6; list[58].y = player.y;
    list[59].x = player.x + 16; list[59].y = player.y;
    const before = list.map((e) => ({ x: e.x, y: e.y }));
    separateEnemiesBucketed(list, { gap: 22, player, contactDist: 30 });
    expect(list[58].x).toBe(before[58].x);
    expect(list[58].y).toBe(before[58].y);
    expect(list[59].x).toBe(before[59].x);
    expect(list[59].y).toBe(before[59].y);
    expect(separateEnemiesBucketed(list, { gap: 22, player, contactDist: 30 })).toBe(0);
  });

  it('确定性：同一输入两次调用结果深相等', () => {
    const run = () => {
      const list = makeEnemies(120, 33);
      const pushes = separateEnemiesBucketed(list, { gap: 22, player });
      return { list, pushes };
    };
    expect(run()).toEqual(run());
  });

  it('120 只随机怪不打 NaN、不越界', () => {
    const list = makeEnemies(120, 44);
    separateEnemiesBucketed(list, { gap: 22 });
    for (const e of list) {
      expect(Number.isFinite(e.x)).toBe(true);
      expect(Number.isFinite(e.y)).toBe(true);
      expect(e.x).toBeGreaterThanOrEqual(0);
      expect(e.x).toBeLessThanOrEqual(world.w);
      expect(e.y).toBeGreaterThanOrEqual(0);
      expect(e.y).toBeLessThanOrEqual(world.h);
    }
  });

  it('死怪不进桶，也不会被推动', () => {
    const list = [];
    for (let i = 0; i < 58; i++) list.push({ id: i, alive: false, x: 300, y: 300 });
    list.push({ id: 58, alive: true, x: 900, y: 900 });
    list.push({ id: 59, alive: true, x: 900, y: 900 });
    expect(separateEnemiesBucketed(list, { gap: 22 })).toBe(1);
    for (let i = 0; i < 58; i++) {
      expect(list[i].x).toBe(300);
      expect(list[i].y).toBe(300);
    }
    expect(Math.hypot(list[58].x - list[59].x, list[58].y - list[59].y)).toBeCloseTo(22, 6);
  });

  it('空数组 / 单只 / 非数组输入都安全返回 0', () => {
    expect(separateEnemiesBucketed([], { gap: 22 })).toBe(0);
    expect(separateEnemiesBucketed([{ id: 1, alive: true, x: 1, y: 1 }], { gap: 22 })).toBe(0);
    expect(separateEnemiesBucketed(null, { gap: 22 })).toBe(0);
    expect(separateEnemiesBucketed(undefined, { gap: 22 })).toBe(0);
  });
});

describe('pickWavePoints：一次刷 1~4 只', () => {
  it('count 个点互不重叠，且都落在屏幕外环上', () => {
    const points = pickWavePoints({
      rng: rngOf('wave-1'), player, world, count: 3,
      minDist: 275, maxDist: 380, minGap: 36,
    });
    expect(points).toHaveLength(3);
    for (const p of points) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
      expect(typeof p.gap).toBe('number');
      const dp = Math.hypot(p.x - player.x, p.y - player.y);
      expect(dp).toBeGreaterThanOrEqual(140);            // nearDist 默认值
      expect(dp).toBeLessThanOrEqual(560);               // farDist 默认值
      expect(p.x).toBeGreaterThanOrEqual(28);
      expect(p.x).toBeLessThanOrEqual(world.w - 28);
    }
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        expect(Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y)).toBeGreaterThanOrEqual(36);
      }
    }
  });

  it('同 seed 复现同样的点序列，换 seed 换序列', () => {
    const draw = (seed) => pickWavePoints({ rng: rngOf(seed), player, world, count: 3 });
    expect(draw('wave-a')).toEqual(draw('wave-a'));
    expect(draw('wave-a')).not.toEqual(draw('wave-b'));
  });

  it('场上已有的怪也参与间距，同波点不会贴着它们', () => {
    const enemies = [{ x: 1235, y: 720 }, { x: 685, y: 720 }];
    const points = pickWavePoints({
      rng: rngOf('wave-2'), player, world, enemies, count: 2, minGap: 36,
    });
    expect(points).toHaveLength(2);
    for (const p of points) {
      for (const e of enemies) {
        expect(Math.hypot(p.x - e.x, p.y - e.y)).toBeGreaterThanOrEqual(36);
      }
    }
    expect(enemies).toHaveLength(2);                      // 不改动调用方的数组
  });

  it('count <= 0 表示本波不刷', () => {
    const rng = rngOf('wave-0');
    expect(pickWavePoints({ rng, player, world, count: 0 })).toEqual([]);
    expect(pickWavePoints({ rng, player, world, count: -3 })).toEqual([]);
  });

  it('非法 count 回退 1 只，超大 count 被上限截断', () => {
    for (const count of [Number.NaN, Infinity, -Infinity, 'abc', null, {}, [], true]) {
      const points = pickWavePoints({ rng: rngOf('wave-x'), player, world, count });
      expect(points).toHaveLength(1);
    }
    expect(pickWavePoints({ rng: rngOf('wave-cap'), player, world, count: 100 })).toHaveLength(MAX_WAVE_POINTS);
    expect(MAX_WAVE_POINTS).toBe(8);
    expect(pickWavePoints({ rng: rngOf('wave-frac'), player, world, count: 2.7 })).toHaveLength(2);
  });

  it('缺省 count 就是 1 只，其余参数走 pickSpawnPoint 默认值', () => {
    const points = pickWavePoints({ rng: rngOf('wave-default'), player, world });
    expect(points).toHaveLength(1);
    const dp = Math.hypot(points[0].x - player.x, points[0].y - player.y);
    expect(dp).toBeGreaterThanOrEqual(140);
    expect(dp).toBeLessThanOrEqual(560);
  });
});

describe('pickSpawnPoint 兜底：世界比环还小时也不抛错', () => {
  it('环形落点全部不合法时，仍返回受钳制的有限坐标', () => {
    // 旧实现在这条兜底分支里引用了循环外的 gap，会直接抛 ReferenceError
    const tinyWorld = { w: 60, h: 60 };
    let point;
    expect(() => {
      point = pickSpawnPoint({
        rng: seqRng(), player: { x: 30, y: 30 }, world: tinyWorld, enemies: [],
      });
    }).not.toThrow();
    expect(Number.isFinite(point.x)).toBe(true);
    expect(Number.isFinite(point.y)).toBe(true);
  });
});

// 固定序列 rng：给「必然采样失败」的用例一个确定落点
function seqRng() {
  const values = [0.1, 0.5, 0.3, 0.5, 0.7, 0.5, 0.9, 0.5];
  let i = 0;
  return () => values[i++ % values.length];
}
