// 编队数据（src/data/formations.js）与 rollFormation（src/logic/spawn.js）的回归。
// 只测纯逻辑：不碰 Phaser、不碰 DOM、不碰 Math.random——所有随机都从注入的 rng 走。
import { describe, it, expect, vi } from 'vitest';

// 场景层那一段要驱动真实的 BattleScene.updateEnemies，而 BattleScene 在模块顶层 import 了 Phaser。
// 本文件其余部分仍是纯逻辑（零 Phaser 实例、零 DOM），这个替身只为让模块能加载；
// 没有 `new Phaser.Xxx()` 被构造，唯一用到的是 Scene 基类。
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

import { FORMATIONS, formationsFor, formationAuraOf } from '../src/data/formations.js';
import { ENEMY_TYPES, DIFFICULTY, CHAPTER_ENEMY_WEIGHTS } from '../src/data/roster.js';
import { rollFormation } from '../src/logic/spawn.js';
import { applyDamage } from '../src/logic/effects.js';
import Enemy from '../src/entities/Enemy.js';
import BattleScene from '../src/scenes/BattleScene.js';

const PATHS = new Set(['vanguard', 'ranged', 'control', 'elite', 'swarm']);

describe('编队数据', () => {
  it('8 个编队，id 唯一，weight > 0', () => {
    expect(FORMATIONS).toHaveLength(8);
    expect(new Set(FORMATIONS.map(f => f.id)).size).toBe(8);
    FORMATIONS.forEach(f => expect(f.weight).toBeGreaterThan(0));
  });

  it('所有 defId 都存在于 ENEMY_TYPES', () => {
    for (const f of FORMATIONS) for (const r of f.roles) for (const id of r.defIds) expect(ENEMY_TYPES[id]).toBeTruthy();
  });

  it('按幕过滤', () => {
    expect(formationsFor(1).every(f => f.minChapter <= 1)).toBe(true);
    expect(formationsFor(5).length).toBe(8);
  });

  it('结构完整：名称唯一、minChapter 是 1..5 的整数、role 的 path/count/defIds 都合法', () => {
    expect(new Set(FORMATIONS.map(f => f.name)).size).toBe(8);
    for (const f of FORMATIONS) {
      expect(Number.isInteger(f.minChapter)).toBe(true);
      expect(f.minChapter).toBeGreaterThanOrEqual(1);
      expect(f.minChapter).toBeLessThanOrEqual(5);
      expect(Array.isArray(f.roles)).toBe(true);
      expect(f.roles.length).toBeGreaterThan(0);
      for (const r of f.roles) {
        expect(PATHS.has(r.path)).toBe(true);
        expect(Number.isInteger(r.count)).toBe(true);
        expect(r.count).toBeGreaterThan(0);
        expect(Array.isArray(r.defIds)).toBe(true);
        expect(r.defIds.length).toBeGreaterThan(0);
      }
    }
  });

  it('同一编队内各 role 的 defId 池互不重叠（rollFormation 的去重靠这个前提）', () => {
    for (const f of FORMATIONS) {
      const seen = new Set();
      for (const r of f.roles) for (const id of r.defIds) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    }
  });

  it('每个编队在自己的 minChapter 就编得满（不存在「表里有、幕里抽不到」的死项）', () => {
    for (const f of FORMATIONS) {
      // CHAPTER_ENEMY_WEIGHTS 的值是 [defId, weight] 二元组数组，取键名只会拿到下标。
      const pool = new Set(CHAPTER_ENEMY_WEIGHTS[f.minChapter].map(([id]) => id));
      for (const r of f.roles) {
        expect(r.defIds.some(id => pool.has(id))).toBe(true);
      }
    }
  });

  it('formationsFor 随幕号单调不减，且不改原表', () => {
    const counts = [1, 2, 3, 4, 5].map(c => formationsFor(c).length);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    expect(counts.at(-1)).toBe(8);
    expect(formationsFor(3)).not.toBe(FORMATIONS);
    formationsFor(3).push('垃圾');
    expect(FORMATIONS).toHaveLength(8);
  });

  it('非法幕号回退空表，不抛错', () => {
    expect(formationsFor(NaN)).toEqual([]);
    expect(formationsFor('3')).toEqual([]);
    expect(formationsFor(undefined)).toEqual([]);
    expect(formationsFor(0)).toEqual([]);
  });

  it('表与表项都冻住：改数据必须改源码，不能被运行期意外写坏', () => {
    expect(Object.isFrozen(FORMATIONS)).toBe(true);
    for (const f of FORMATIONS) {
      expect(Object.isFrozen(f)).toBe(true);
      expect(Object.isFrozen(f.roles)).toBe(true);
      for (const r of f.roles) expect(Object.isFrozen(r)).toBe(true);
      if (f.aura) expect(Object.isFrozen(f.aura)).toBe(true);
    }
  });

  it('光环：只有带 vanguard 前排的编队有光环，值恒为 +0.15 甲 / ×0.9 速', () => {
    const withAura = FORMATIONS.filter(f => f.roles.some(r => r.path === 'vanguard'));
    const withoutAura = FORMATIONS.filter(f => !f.roles.some(r => r.path === 'vanguard'));
    expect(withAura.length).toBeGreaterThan(0);
    expect(withoutAura.length).toBeGreaterThan(0);
    for (const f of withAura) {
      expect(formationAuraOf(f)).toEqual({ armorBonus: 0.15, speedMul: 0.9 });
    }
    for (const f of withoutAura) expect(formationAuraOf(f)).toBeNull();
  });

  it('formationAuraOf 非法入参回退 null，不抛错', () => {
    expect(formationAuraOf(undefined)).toBeNull();
    expect(formationAuraOf(null)).toBeNull();
    expect(formationAuraOf({})).toBeNull();
    expect(formationAuraOf({ aura: { armorBonus: 'x', speedMul: 0.9 } })).toBeNull();
    expect(formationAuraOf({ aura: { armorBonus: 0.15 } })).toBeNull();
  });
});

// ---------- C3：rollFormation（纯函数，放 src/logic/spawn.js） ----------
describe('rollFormation 编队抽样', () => {
  it('编队总槽位超过 maxAlive×0.4 时返回 null', () => {
    // 先用同一个 rng 探明「第五章这个 roll 能编出多大的队」：闸放到 88 一定编得出，
    // 否则下面的 null 可能只是「本章抽不到」，测试会变成假绿。
    const probe = rollFormation({ chapter: 5, load: 0, maxAlive: 88, rng: () => 0.1 });
    expect(probe).not.toBeNull();
    expect(probe.picks.reduce((s, p) => s + p.count, 0)).toBeGreaterThan(4);   // 10×0.4=4，编队 ≥5
    expect(rollFormation({ chapter: 5, load: 0, maxAlive: 10, rng: () => 0.1 })).toBeNull();
  });

  it('同编队内 defId 不重复', () => {
    const r = rollFormation({ chapter: 5, load: 0, maxAlive: 88, rng: () => 0.3 });
    expect(r).not.toBeNull();
    const ids = r.picks.map(p => p.defId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('任何 rng 落点：编队成员 defId 不重复、员额不超闸、defId 都属本章兵池', () => {
    for (let i = 0; i < 60; i++) {
      const rng = () => (i * 0.017) % 1;
      const r = rollFormation({ chapter: 5, load: 0, maxAlive: 88, rng });
      if (!r) continue;
      const ids = r.picks.map(p => p.defId);
      expect(new Set(ids).size).toBe(ids.length);
      const pool = new Set(CHAPTER_ENEMY_WEIGHTS[5].map(([id]) => id));
      for (const id of ids) expect(pool.has(id)).toBe(true);
      expect(r.picks.reduce((s, p) => s + p.count, 0)).toBeLessThanOrEqual(88 * 0.4);
      expect(r.formation.minChapter).toBeLessThanOrEqual(5);
    }
  });

  it('成员带上 formationId 与 path/count，picks 与模板 role 一一对应', () => {
    const r = rollFormation({ chapter: 3, load: 0, maxAlive: 88, rng: () => 0.5 });
    expect(r).not.toBeNull();
    expect(r.picks).toHaveLength(r.formation.roles.length);
    for (let i = 0; i < r.picks.length; i++) {
      expect(r.picks[i].path).toBe(r.formation.roles[i].path);
      expect(r.picks[i].count).toBe(r.formation.roles[i].count);
      expect(ENEMY_TYPES[r.picks[i].defId]).toBeTruthy();
    }
  });

  it('非法入参一律回退 null，不抛错', () => {
    expect(rollFormation({ chapter: 9, load: 0, maxAlive: 88, rng: () => 0.5 })).toBeNull();
    expect(rollFormation({ chapter: NaN, load: 0, maxAlive: 88, rng: () => 0.5 })).toBeNull();
    expect(rollFormation({ chapter: 5, load: 0, maxAlive: 0, rng: () => 0.5 })).toBeNull();
    expect(rollFormation({ chapter: 5, load: 0, maxAlive: NaN, rng: () => 0.5 })).toBeNull();
    expect(rollFormation({ chapter: 5, load: NaN, maxAlive: 88, rng: () => 0.5 })).not.toBeNull();
    expect(rollFormation({ chapter: 5, load: 0, maxAlive: 88 })).toBeNull();          // 没有 rng
    expect(() => rollFormation({})).not.toThrow();
    expect(rollFormation({})).toBeNull();
  });

  it('DIFFICULTY.formationEvery 存在且为正整数（场景层按它排编队轮次）', () => {
    expect(Number.isInteger(DIFFICULTY.formationEvery)).toBe(true);
    expect(DIFFICULTY.formationEvery).toBeGreaterThan(0);
  });
});

// ---------- C4：护卫光环生效 ----------
// 光环的「数值叠加」在 applyDamage，」谁吃谁不吃」在场景层 updateEnemies。
// 这两段必须分开测：只测 applyDamage 的话，Boss/精英是否被过滤掉完全没有证据。
describe('C4 光环：armorBonus 与自身 armor 相加后 clamp01', () => {
  it('普通怪 0 甲 + 0.15 光环 → 吃 85% 伤害', () => {
    const e = { hp: 100, alive: true, armor: 0, formationAura: { armorBonus: 0.15, speedMul: 0.9 } };
    expect(applyDamage(e, 100, 0)).toBeCloseTo(85, 5);
  });

  it('举盾的 page_golem（0.55 甲）+ 0.15 光环 = 0.70 甲 → 100 伤害吃 30', () => {
    const e = { hp: 100, alive: true, armor: 0.55, formationAura: { armorBonus: 0.15, speedMul: 0.9 } };
    expect(applyDamage(e, 100, 0)).toBeCloseTo(30, 5);
  });

  it('0.95 甲 + 0.15 → clamp 到 1，实伤 0（不会被加成打到超过 1）', () => {
    const e = { hp: 100, alive: true, armor: 0.95, formationAura: { armorBonus: 0.15 } };
    expect(applyDamage(e, 100, 0)).toBe(0);
  });

  it('没有 formationAura 时与旧实现逐值一致（零漂移）', () => {
    for (const armor of [0, 0.15, 0.55, 1]) {
      const withAura = { hp: 100, alive: true, armor };
      const plain = { hp: 100, alive: true, armor };
      expect(applyDamage(withAura, 100, 0)).toBe(applyDamage(plain, 100, 0));
    }
  });

  it('光环数值非法（非有限数/缺字段）时按 0 处理，不产出 NaN 血量', () => {
    const bad = { hp: 100, alive: true, armor: 0.5, formationAura: { armorBonus: NaN } };
    expect(applyDamage(bad, 100, 0)).toBeCloseTo(50, 5);

    const missing = { hp: 100, alive: true, armor: 0.5, formationAura: {} };
    expect(applyDamage(missing, 100, 0)).toBeCloseTo(50, 5);

    const stringy = { hp: 100, alive: true, armor: 0.5, formationAura: { armorBonus: '0.15' } };
    expect(applyDamage(stringy, 100, 0)).toBeCloseTo(50, 5);

    const nanArmor = { hp: 100, alive: true, armor: NaN, formationAura: { armorBonus: 0.15 } };
    expect(applyDamage(nanArmor, 100, 0)).toBeCloseTo(85, 5);
  });

  it('破防倍率仍乘在护甲之前（光环不能吃掉 breakMul）', () => {
    // BREAK_DAMAGE_MUL = 1.2：100 × 1.2 × (1 - 0.70) = 36
    const e = { hp: 100, alive: true, armor: 0.55, breakUntil: 500, formationAura: { armorBonus: 0.15 } };
    expect(applyDamage(e, 100, 100)).toBeCloseTo(36, 5);
  });

  it('盾先于甲结算：光环只作用在盾吸收完的余量上', () => {
    const e = { hp: 100, alive: true, shield: 40, armor: 0.55, formationAura: { armorBonus: 0.15 } };
    expect(applyDamage(e, 100, 0)).toBeCloseTo(18, 5);   // (100-40) × 0.30
    expect(e.shield).toBe(0);
  });
});

// speedFactor 是 Enemy 的方法，但它只读 this.slowUntil / rootUntil / frozenUntil / scene.player
// 与 grid 上的 slow_field，不碰任何 Phaser 对象——用 call 绑一个最小 this 就能驱动真实实现，
// 不必构造整只 Enemy（那会把绘制、纹理、AI 全拖进来）。
describe('C4 光环：speedFactor 末尾乘 speedMul，且不打乱既有优先级', () => {
  const aura = { armorBonus: 0.15, speedMul: 0.9 };

  const factor = (enemy, now = 500) => Enemy.prototype.speedFactor.call(enemy, now);

  it('无任何控制时：光环把速度乘到 0.9', () => {
    expect(factor({ formationAura: aura, scene: {} })).toBeCloseTo(0.9, 6);
  });

  it('没有光环时仍返回 1（零漂移）', () => {
    expect(factor({ scene: {} })).toBe(1);
    expect(factor({ formationAura: null, scene: {} })).toBe(1);
    expect(factor({ formationAura: {}, scene: {} })).toBe(1);
  });

  it('减速与光环相乘：0.7 减速 × 0.9 光环 = 0.63', () => {
    const e = { slowUntil: 1000, slowFactor: 0.7, formationAura: aura, scene: {} };
    expect(factor(e)).toBeCloseTo(0.63, 6);
  });

  it('定身（root）仍归 0：光环不该把「完全停住」救活', () => {
    const e = { rootUntil: 1000, formationAura: aura, scene: {} };
    expect(factor(e)).toBe(0);
  });

  it('冻结（frozen）仍归 0', () => {
    const e = { frozenUntil: 1000, formationAura: aura, scene: {} };
    expect(factor(e)).toBe(0);
  });

  it('slow_field 的 ≤90px 额外减速仍是「取更小」，光环只在其后乘：min(1,0.6)×0.9 = 0.54', () => {
    const e = {
      x: 100, y: 100, formationAura: aura,
      scene: { player: { x: 100, y: 100 }, grid: { cells: [{ unlocked: true, slot: { defId: 'slow_field' } }] } },
    };
    expect(factor(e)).toBeCloseTo(0.54, 6);
  });

  it('slow_field 只对 90px 内生效：100px 外不额外减速，只剩光环', () => {
    const e = {
      x: 200, y: 100, formationAura: aura,
      scene: { player: { x: 100, y: 100 }, grid: { cells: [{ unlocked: true, slot: { defId: 'slow_field' } }] } },
    };
    expect(factor(e)).toBeCloseTo(0.9, 6);
  });

  it('光环 speedMul 非有限数时按 1 处理，不产出 NaN / 负数速度', () => {
    const e = { formationAura: { speedMul: NaN }, scene: {} };
    expect(factor(e)).toBe(1);
    const neg = { formationAura: { speedMul: -3 }, scene: {} };
    expect(Number.isFinite(factor(neg))).toBe(true);
    expect(factor(neg)).toBeGreaterThanOrEqual(0);
  });
});

// ---------- C4 场景层：谁吃光环、谁不吃、光环什么时候消失 ----------
// 这一段必须驱动真实的 BattleScene.updateEnemies：光环是「场景层写字段、实体层读字段」两段式，
// 只测 applyDamage / speedFactor 只能证明字段被正确消费，证明不了它被正确写入和删除。
// spec §5.3 的三条硬规则（Boss 不吃、精英不吃、前排倒下立刻失效）全部落在场景层，
// 所以这里用最小敌人替身跑真实原型方法，而不是给 updateEnemies 写个空壳再断言空函数体。
function auraScene(enemies) {
  const scene = {
    enemies,
    player: { x: 240, y: 135, radius: 5, alive: true, takeDamage: () => false },
    engine: { now: 1000 },
  };
  // updateEnemies 内部会调自己的辅助方法，跟 battle-flow.test.js 的 fixture 一样需要补绑原型；
  // 只绑被测方法直接调用、且真实实现确实会调用的那两个，不顶掉任何真实逻辑。
  scene.refreshFormationAuras = BattleScene.prototype.refreshFormationAuras.bind(scene);
  scene.updateEnemies = BattleScene.prototype.updateEnemies.bind(scene);
  return scene;
}

// 敌人替身：只实现 updateEnemies 真正读到的字段与两个方法。
// 离玩家足够远（≥26px 接触线），避免误触接触伤害分支干扰断言。
const auraMob = (extra = {}) => ({
  x: 100, y: 60, alive: true, radius: 6, damage: 8,
  def: { id: 'skeleton' },
  update() {}, destroy() { this.destroyed = true; this.alive = false; },
  ...extra,
});

describe('C4 场景层：updateEnemies 每帧重算护卫光环', () => {
  it('前排存活：同编队非前排成员拿到光环，值就是 formationAuraOf 给的那组', () => {
    const front = auraMob({ formationId: 'siege', formationPath: 'vanguard' });
    const back1 = auraMob({ formationId: 'siege', formationPath: 'ranged' });
    const back2 = auraMob({ formationId: 'siege', formationPath: 'ranged' });
    const scene = auraScene([front, back1, back2]);

    scene.updateEnemies(16);

    expect(back1.formationAura).toEqual({ armorBonus: 0.15, speedMul: 0.9 });
    expect(back2.formationAura).toEqual({ armorBonus: 0.15, speedMul: 0.9 });
    // 必须是逐只拷贝：某只怪的字段被单独改时不能污染全队
    expect(back1.formationAura).not.toBe(back2.formationAura);
  });

  it('前排是 vanguard 但已死：光环当场消失，不等任何节流窗口', () => {
    const front = auraMob({ formationId: 'siege', formationPath: 'vanguard', alive: false });
    const back = auraMob({ formationId: 'siege', formationPath: 'ranged' });
    back.formationAura = { armorBonus: 0.15, speedMul: 0.9 };   // 上一帧留下的
    const scene = auraScene([front, back]);

    scene.updateEnemies(16);

    expect('formationAura' in back).toBe(false);
  });

  it('前排死掉的那一帧：死亡成员不再算「前排还活着」', () => {
    const front = auraMob({ formationId: 'siege', formationPath: 'vanguard' });
    const back = auraMob({ formationId: 'siege', formationPath: 'ranged' });
    const scene = auraScene([front, back]);

    scene.updateEnemies(16);
    expect(back.formationAura).toBeTruthy();

    front.alive = false;
    scene.updateEnemies(16);
    expect('formationAura' in back).toBe(false);
  });

  it('def.elite 不吃光环：同队前排活着、兄弟都有光环时依然没有', () => {
    const front = auraMob({ formationId: 'siege', formationPath: 'vanguard' });
    const elite = auraMob({
      formationId: 'siege', formationPath: 'ranged',
      def: { id: 'oath_bishop', elite: true },
    });
    const plain = auraMob({ formationId: 'siege', formationPath: 'ranged' });
    const scene = auraScene([front, elite, plain]);

    scene.updateEnemies(16);

    expect('formationAura' in elite).toBe(false);
    expect(plain.formationAura).toEqual({ armorBonus: 0.15, speedMul: 0.9 });
  });

  it('Boss 不吃光环，也不算前排：它带 vanguard 路径也不给队友发加成', () => {
    const boss = auraMob({ isBoss: true, formationId: 'siege', formationPath: 'vanguard' });
    const back = auraMob({ formationId: 'siege', formationPath: 'ranged' });
    const scene = auraScene([boss, back]);

    scene.updateEnemies(16);

    expect('formationAura' in boss).toBe(false);
    // 把 Boss 算成前排的话这里会拿到光环
    expect('formationAura' in back).toBe(false);
  });

  it('前排自己不叠加光环（spec §5.3 给的是「同编队其余成员」）', () => {
    const front = auraMob({ formationId: 'siege', formationPath: 'vanguard' });
    const back = auraMob({ formationId: 'siege', formationPath: 'ranged' });
    const scene = auraScene([front, back]);

    scene.updateEnemies(16);

    expect('formationAura' in front).toBe(false);
    expect(back.formationAura).toBeTruthy();
  });

  it('不同编队互不串味：A 队前排活着不给 B 队加甲', () => {
    const frontA = auraMob({ formationId: 'siege', formationPath: 'vanguard' });
    const backA = auraMob({ formationId: 'siege', formationPath: 'ranged' });
    const backB = auraMob({ formationId: 'shield_wall', formationPath: 'ranged' });
    backB.formationAura = { armorBonus: 0.15, speedMul: 0.9 };
    const scene = auraScene([frontA, backA, backB]);

    scene.updateEnemies(16);

    expect(backA.formationAura).toBeTruthy();
    expect('formationAura' in backB).toBe(false);
  });

  it('同模板两批同屏：A 队前排死了不给 A 队后排加成，B 队前排活着照给 B 队', () => {
    // 编队约每 1.26s 试一次、shield_wall 占 12.5~13.6%，怪从 275~380px 走进来要 4~7s，
    // 同模板两批同屏是正常状态。只按 formationId 分组时，A 队前排已死、B 队前排还活着
    // → A 队后排仍带光环，「打掉前排光环就散」这个玩家可读的承诺就不成立了。
    // 分组键必须是 formationUid（这一批），formationId 只留给模板取数值。
    const frontA = auraMob({ formationId: 'shield_wall', formationUid: 'shield_wall#1', formationPath: 'vanguard', alive: false });
    const backA = auraMob({ formationId: 'shield_wall', formationUid: 'shield_wall#1', formationPath: 'ranged' });
    const frontB = auraMob({ formationId: 'shield_wall', formationUid: 'shield_wall#2', formationPath: 'vanguard' });
    const backB = auraMob({ formationId: 'shield_wall', formationUid: 'shield_wall#2', formationPath: 'ranged' });
    const scene = auraScene([frontA, backA, frontB, backB]);

    scene.updateEnemies(16);

    expect('formationAura' in backA).toBe(false);
    expect(backB.formationAura).toEqual({ armorBonus: 0.15, speedMul: 0.9 });
  });

  it('没有 vanguard 的编队（harass / swarm）不发光环', () => {
    const bat = auraMob({ formationId: 'swarm', formationPath: 'swarm' });
    const spider = auraMob({ formationId: 'swarm', formationPath: 'swarm' });
    const scene = auraScene([bat, spider]);

    scene.updateEnemies(16);

    expect('formationAura' in bat).toBe(false);
    expect('formationAura' in spider).toBe(false);
  });

  it('全灭清理：整队被移出 enemies 后，场上不留残留光环字段', () => {
    const front = auraMob({ formationId: 'siege', formationPath: 'vanguard' });
    const back = auraMob({ formationId: 'siege', formationPath: 'ranged' });
    const scene = auraScene([front, back]);
    scene.updateEnemies(16);
    expect(back.formationAura).toBeTruthy();

    front.alive = false;
    back.alive = false;
    scene.updateEnemies(16);

    expect(scene.enemies).toHaveLength(0);
    expect('formationAura' in back).toBe(false);
    expect('formationAura' in front).toBe(false);
  });

  it('普通波（无 formationId）完全不受影响', () => {
    const mob = auraMob();
    const scene = auraScene([mob]);
    scene.updateEnemies(16);
    expect('formationAura' in mob).toBe(false);
  });

  it('精英当前排也能给后排发光环，但精英自己不吃（shield_wall 第 3/5 幕的现实形态）', () => {
    // 这条以前被钉成「已知设计后果」：shield_wall 的 vanguard 池是 [page_golem, brass_warden]，
    // 第 3/5 幕的怪池没有 page_golem，前排必然只能抽到精英黄铜守誓者。
    // 旧实现把精英排除出「前排还活着」的证据，于是这两幕的光环永远不生效——
    // 机制写在表里却从不运行，与 Boss 大招那次是同一类缺陷，判定为 bug 而非设计。
    // 修法只动规则、不动数据：spec §5.3 原文是「vanguard 成员存活时，**其余成员**获得加成」，
    // 表里那句「精英不参与编队光环（编队只给杂兵）」讲的是**收方**，不是「精英不能当前排」。
    const wall = FORMATIONS.find((f) => f.id === 'shield_wall');
    const van = wall.roles.find((r) => r.path === 'vanguard');
    expect(van.defIds).toContain('brass_warden');
    // 这一半仍然是事实：第 3/5 幕可用的前排候选只有精英
    for (const ch of [3, 5]) {
      const pool = new Set(CHAPTER_ENEMY_WEIGHTS[ch].map(([id]) => id));
      const available = van.defIds.filter((id) => pool.has(id));
      expect(available.length).toBeGreaterThan(0);
      expect(available.every((id) => ENEMY_TYPES[id].elite)).toBe(true);
    }

    const front = auraMob({ formationId: 'shield_wall', formationPath: 'vanguard', def: { id: 'brass_warden', elite: true } });
    const back = auraMob({ formationId: 'shield_wall', formationPath: 'ranged' });
    const scene = auraScene([front, back]);

    scene.updateEnemies(16);

    expect(back.formationAura).toEqual({ armorBonus: 0.15, speedMul: 0.9 });   // 后排吃到了
    expect('formationAura' in front).toBe(false);                              // 前排自己不吃
  });

  it('精英当前排时仍然挡住「精英吃光环」这条：后排精英不收，杂兵照收', () => {
    // 上一条证明了「精英能当证据」，这一条守住另一半：收方剔除精英的规则没被顺手放开。
    const front = auraMob({ formationId: 'shield_wall', formationPath: 'vanguard', def: { id: 'brass_warden', elite: true } });
    const eliteBack = auraMob({ formationId: 'shield_wall', formationPath: 'ranged', def: { id: 'oath_bishop', elite: true } });
    const plainBack = auraMob({ formationId: 'shield_wall', formationPath: 'ranged' });
    const scene = auraScene([front, eliteBack, plainBack]);

    scene.updateEnemies(16);

    expect('formationAura' in eliteBack).toBe(false);
    expect(plainBack.formationAura).toEqual({ armorBonus: 0.15, speedMul: 0.9 });
  });

  it('端到端：场景层写的字段被 applyDamage 真的读到（0.55 甲的前排怪吃 30）', () => {
    const front = auraMob({ formationId: 'siege', formationPath: 'vanguard' });
    const golem = auraMob({
      formationId: 'siege', formationPath: 'ranged',
      def: { id: 'page_golem' }, armor: 0.55, hp: 100, maxHp: 100,
    });
    const scene = auraScene([front, golem]);

    scene.updateEnemies(16);

    expect(golem.formationAura).toEqual({ armorBonus: 0.15, speedMul: 0.9 });
    expect(applyDamage(golem, 100, 16)).toBeCloseTo(30, 5);
  });

  it('端到端：speedFactor 也读到同一个字段（0.9 倍速）', () => {
    const front = auraMob({ formationId: 'siege', formationPath: 'vanguard' });
    const back = auraMob({ formationId: 'siege', formationPath: 'ranged' });
    back.scene = {};
    const scene = auraScene([front, back]);

    scene.updateEnemies(16);

    expect(Enemy.prototype.speedFactor.call(back, 16)).toBeCloseTo(0.9, 6);
  });
});

// ---------- C5：G19 真的会被场景层发出来 ----------
// 光在 guide-content.json 里加一张 G19 不算交付：没有 fireGuide 调用，这张卡永远不会出现在玩家眼前。
// 这段驱动真实的 BattleScene.spawnEnemy，断言「只有编队成员会触发、且整局只触发一次」。
// rng 固定值可传：变体抽样阈值是按幕配的权重，0.5 恰好抽不到变体，
// 「G19 与 G13 共存」那条得给一个能抽到变体的固定值（0.8 → swift），否则测的是「没有变体」。
function guideScene(rngValue = 0.5) {
  const emitted = [];
  const graphics = () => {
    const target = {};
    const proxy = new Proxy(target, { get: (t, p) => (p in t ? t[p] : () => proxy) });
    target.clear = () => proxy;
    return proxy;
  };
  const scene = {
    chapter: 3,
    enemies: [],
    enemySeq: 0,
    combatRng: { next: () => rngValue },
    run: { guideSeen: {}, progression: { level: 1 } },
    player: { x: 240, y: 135, radius: 5, alive: true },
    world: { w: 480, h: 270 },
    add: { graphics },
    // fireGuide 只认 scene.game.events，且会 markSeen 去重——这里用真事件总线语义的替身
    game: { events: { emit: (name, payload) => emitted.push({ name, payload }) } },
  };
  scene.spawnEnemy = BattleScene.prototype.spawnEnemy.bind(scene);
  return { scene, emitted };
}
const DIFF = { hp: 20, speed: 60, damage: 8 };

describe('C5 G19：编队标记引导真的会触发', () => {
  it('普通波（无 formationId）不触发 G19', () => {
    const { scene, emitted } = guideScene();

    scene.spawnEnemy(DIFF, { x: 100, y: 60 });

    expect(emitted.some((e) => e.payload?.id === 'G19')).toBe(false);
  });

  it('第一个编队成员刷出时触发 G19，并带上「敌人」高亮', () => {
    const { scene, emitted } = guideScene();

    scene.spawnEnemy(DIFF, { x: 100, y: 60 }, { defId: 'skeleton', formationId: 'siege', formationPath: 'vanguard' });

    const hit = emitted.filter((e) => e.payload?.id === 'G19');
    expect(hit).toHaveLength(1);
    expect(hit[0].payload.highlight).toBe('敌人');
    expect(hit[0].payload.card.id).toBe('G19');
  });

  it('整局只触发一次：同波后续成员不再刷屏', () => {
    const { scene, emitted } = guideScene();
    const opts = { defId: 'skeleton', formationId: 'siege', formationPath: 'ranged' };

    scene.spawnEnemy(DIFF, { x: 100, y: 60 }, opts);
    scene.spawnEnemy(DIFF, { x: 110, y: 70 }, opts);
    scene.spawnEnemy(DIFF, { x: 120, y: 80 }, opts);

    expect(emitted.filter((e) => e.payload?.id === 'G19')).toHaveLength(1);
  });

  it('G19 与 G13 可以同帧共存：带变体的编队成员两条都该看到', () => {
    // 0.8 在第 3 幕能抽到 swift 变体；0.5 抽不到，那样这条测的就只是「没有变体」
    const { scene, emitted } = guideScene(0.8);

    scene.spawnEnemy(DIFF, { x: 100, y: 60 }, { defId: 'skeleton', formationId: 'siege', formationPath: 'ranged' });

    const ids = emitted.map((e) => e.payload?.id);
    expect(ids).toContain('G19');
    expect(ids).toContain('G13');
  });
});

// ---------- C5 标记：精英当前排也要画三角（I-1） ----------
// spec §5.4 写的是「同编队成员脚下画同色小三角」，没有精英例外；
// G19 的文案又在教玩家「打掉那个带三角标记的前排」。而 shield_wall 的 vanguard
// 在 ch3/ch5 是 100% 精英（前排池 [page_golem, brass_warden]，这两幕没有 page_golem），
// 于是按「精英不画」实现时，光环唯一的来源恰好是唯一没有标记的那只——文案与画面直接矛盾。
// 收方规则不动（精英仍不吃光环），只补画标记。
function markGraphics() {
  const polys = [];
  return {
    polys,
    fillStyle(color, alpha) { this.color = color; this.alpha = alpha; return this; },
    fillPoints(points) { polys.push({ points, color: this.color, alpha: this.alpha }); return this; },
  };
}

const markMob = (extra = {}) => ({
  formationId: 'shield_wall', formationPath: 'vanguard', radius: 6,
  isBoss: false, def: { id: 'brass_warden', elite: true },
  ...extra,
});

describe('C5 标记：谁脚下有三角', () => {
  it('前排精英画三角（否则光环来源没有标记，G19 文案对不上画面）', () => {
    const g = markGraphics();
    Enemy.prototype.drawFormationMark.call(markMob(), g, 100, 60);
    expect(g.polys).toHaveLength(1);
    expect(g.polys[0].points).toHaveLength(3);
  });

  it('不吃光环的精英（后排精英）仍不画：标记只承诺「这一伙」，不承诺「它有加成」', () => {
    const g = markGraphics();
    Enemy.prototype.drawFormationMark.call(markMob({ formationPath: 'ranged' }), g, 100, 60);
    expect(g.polys).toHaveLength(0);
  });

  it('Boss 不画（它根本不在编队桶里）', () => {
    const g = markGraphics();
    Enemy.prototype.drawFormationMark.call(markMob({ isBoss: true }), g, 100, 60);
    expect(g.polys).toHaveLength(0);
  });

  it('色相按批次取：同模板不同批次会落到不同色槽（4 槽哈希，8 个批次里必然分叉）', () => {
    const colors = new Set();
    for (let i = 1; i <= 8; i++) {
      const g = markGraphics();
      Enemy.prototype.drawFormationMark.call(markMob({ formationUid: `shield_wall#${i}` }), g, 100, 60);
      expect(g.polys).toHaveLength(1);
      colors.add(g.polys[0].color);
    }
    expect(colors.size).toBeGreaterThan(1);
  });

  it('普通波（无 formationId）不画', () => {
    const g = markGraphics();
    Enemy.prototype.drawFormationMark.call(markMob({ formationId: undefined }), g, 100, 60);
    expect(g.polys).toHaveLength(0);
  });
});

describe('C5 spawnEnemy：批次 id 落到成员上', () => {
  it('带 formationUid 时逐个写入，同批成员共享同一个 uid', () => {
    const { scene } = guideScene();
    scene.spawnEnemy(DIFF, { x: 100, y: 60 }, { defId: 'skeleton', formationId: 'siege', formationUid: 'siege#3', formationPath: 'vanguard' });
    scene.spawnEnemy(DIFF, { x: 110, y: 70 }, { defId: 'skeleton', formationId: 'siege', formationUid: 'siege#3', formationPath: 'ranged' });

    expect(scene.enemies.map((e) => e.formationUid)).toEqual(['siege#3', 'siege#3']);
    expect(scene.enemies.map((e) => e.formationId)).toEqual(['siege', 'siege']);
  });

  it('老调用方只给 formationId（不传 uid）时退回模板 id，向后兼容', () => {
    const { scene } = guideScene();
    scene.spawnEnemy(DIFF, { x: 100, y: 60 }, { defId: 'skeleton', formationId: 'siege', formationPath: 'vanguard' });

    expect(scene.enemies[0].formationUid).toBe('siege');
  });
});
