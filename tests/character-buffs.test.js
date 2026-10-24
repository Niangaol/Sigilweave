// 人物宝箱增益的真实生效测试：无敌帧（秒）、护盾上限、碎片吸附半径、罗盘命中加成。
// 全部走纯逻辑/实体方法，不启动 Phaser 场景。
import { describe, it, expect } from 'vitest';
import Player from '../src/entities/Player.js';
import Shard, { pickupPullParams } from '../src/entities/Shard.js';
import { createGrid, rebuildDerived } from '../src/logic/grid.js';
import { resolveSigilTrigger } from '../src/logic/effects.js';
import { PLAYER } from '../src/data/roster.js';

// 只构造实体方法需要的最小状态，避免 Player 构造函数依赖 Phaser 场景
function barePlayer(overrides = {}) {
  return Object.assign(Object.create(Player.prototype), {
    hp: 100,
    maxHp: 100,
    shield: 0,
    alive: true,
    invulnUntil: 0,
    iframesBonus: 0,
    hurtAt: -9999,
  }, overrides);
}

function grid16() {
  const g = createGrid();
  for (const c of g.cells) c.unlocked = true;
  rebuildDerived(g, 2000);
  return g;
}

function enemy(id, x, y, hp = 100) {
  return { id, alive: true, hp, armor: 0, x, y };
}

function combatState(extra = {}) {
  return {
    player: { x: 0, y: 0, hp: 100, maxHp: 100, shield: 0, ...(extra.player || {}) },
    now: 0,
    ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'player')),
  };
}

function trigger(grid, cellId, defId, state, enemies, aimPoint) {
  return resolveSigilTrigger({
    grid, cellId, defId, state, enemies, half: 120, aimPoint,
  });
}

// 碎片只用 update/draw，绘图对象用空实现即可
function bareShard(x, y) {
  const g = {
    clear() {}, setDepth() {}, setVisible() {}, fillStyle() {}, fillRect() {},
    fillPoints() {}, lineStyle() {}, strokePoints() {},
  };
  return Object.assign(Object.create(Shard.prototype), {
    x, y, alive: true, phase: 0, time: 0, g,
  });
}

describe('人物宝箱 · 受击无敌帧', () => {
  it('无增益时保持 900ms 默认值', () => {
    const p = barePlayer();
    expect(p.takeDamage(10, 1000)).toBe(true);
    expect(p.invulnUntil).toBe(1000 + PLAYER.iframesMs);
    expect(p.takeDamage(10, 1899)).toBe(false);
    expect(p.takeDamage(10, 1900)).toBe(true);
  });

  it('iframesBonus 以秒为单位叠加（0.15 秒 = 150ms）', () => {
    const p = barePlayer({ iframesBonus: 0.15 });
    expect(p.takeDamage(10, 0)).toBe(true);
    expect(p.invulnUntil).toBe(PLAYER.iframesMs + 150);
    expect(p.takeDamage(10, PLAYER.iframesMs + 149)).toBe(false);
    expect(p.takeDamage(10, PLAYER.iframesMs + 150)).toBe(true);
  });

  it('负数、NaN、Infinity、字符串等非法加成按 0 处理', () => {
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, '0.2', null]) {
      const p = barePlayer({ iframesBonus: bad });
      p.takeDamage(10, 0);
      expect(p.invulnUntil).toBe(PLAYER.iframesMs);
    }
  });

  it('护盾吸收与原逻辑一致，护盾扣完才扣血', () => {
    const p = barePlayer({ shield: 4 });
    p.takeDamage(10, 0);
    expect(p.shield).toBe(0);
    expect(p.hp).toBe(94);
  });
});

describe('人物宝箱 · 圣光壁垒护盾上限', () => {
  it('无 player.shieldCap 时仍使用卡面 40', () => {
    const g = grid16();
    const st = combatState();
    for (let i = 0; i < 5; i++) trigger(g, 5, 'holy_ward', st, []);
    expect(st.player.shield).toBe(40);
  });

  it('读取 player.shieldCap（庇护印记 40 + 10 = 50）', () => {
    const g = grid16();
    const st = combatState({ player: { shieldCap: 50 } });
    for (let i = 0; i < 4; i++) trigger(g, 5, 'holy_ward', st, []);
    // 14 × 4 = 56，应被人物上限 50 截断
    expect(st.player.shield).toBe(50);
  });

  it('player.shieldCap 为 0 时不能获得护盾', () => {
    const g = grid16();
    const st = combatState({ player: { shieldCap: 0 } });
    trigger(g, 5, 'holy_ward', st, []);
    expect(st.player.shield).toBe(0);
  });

  it('非法 player.shieldCap 回退到卡面值，不产生 NaN', () => {
    for (const bad of [Number.NaN, -10, Number.POSITIVE_INFINITY, '50']) {
      const g = grid16();
      const st = combatState({ player: { shieldCap: bad } });
      for (let i = 0; i < 5; i++) trigger(g, 5, 'holy_ward', st, []);
      expect(st.player.shield).toBe(40);
      expect(Number.isFinite(st.player.shield)).toBe(true);
    }
  });
});

describe('罗盘命中加成 · hitBonus', () => {
  it('落点单体命中半径 = 28 + bonus', () => {
    const g = grid16();
    g.cells[0].slot = { kind: 'sigil', defId: 'arcane_bolt' };
    const aim = { x: 0, y: 0 };

    const far = enemy(1, 29, 0);
    const miss = trigger(g, 0, 'arcane_bolt', combatState(), [far], aim);
    expect(miss.hits).toBe(0);
    expect(miss.empty).toBe(true);

    const near = enemy(2, 29, 0);
    const hit = trigger(g, 0, 'arcane_bolt', combatState({ hitBonus: 2 }), [near], aim);
    expect(hit.hits).toBe(1);
    expect(near.hp).toBe(88); // 奥术飞弹 12 伤害
  });

  it('扇形三连扩散半径 = 50 + bonus', () => {
    const g = grid16();
    g.cells[0].slot = { kind: 'sigil', defId: 'flame_burst' };
    const aim = { x: 0, y: 0 };

    const outside = enemy(1, 52, 0);
    expect(trigger(g, 0, 'flame_burst', combatState(), [outside], aim).hits).toBe(0);

    const inside = enemy(2, 52, 0);
    const r = trigger(g, 0, 'flame_burst', combatState({ hitBonus: 5 }), [inside], aim);
    expect(r.hits).toBe(1);
    expect(inside.hp).toBe(91); // 烈焰喷涌 9 伤害
  });

  it('范围符印半径 = def.radius + bonus（星陨 70 + 4）', () => {
    const g = grid16();
    g.cells[0].slot = { kind: 'sigil', defId: 'starfall' };
    const aim = { x: 0, y: 0 };

    const outside = enemy(1, 72, 0);
    expect(trigger(g, 0, 'starfall', combatState(), [outside], aim).hits).toBe(0);

    const inside = enemy(2, 72, 0);
    // 72 在 70 之外，但在 74 之内；且 72 > 内圈 35，伤害不打折
    const r = trigger(g, 0, 'starfall', combatState({ hitBonus: 4 }), [inside], aim);
    expect(r.hits).toBe(1);
    expect(inside.hp).toBe(78); // 星陨 22 伤害
  });

  it('护盾类范围同样吃到命中加成，保持「命中范围」语义一致', () => {
    const g = grid16();
    g.cells[0].slot = { kind: 'sigil', defId: 'holy_ward' };

    const outside = enemy(1, 42, 0);
    expect(trigger(g, 0, 'holy_ward', combatState(), [outside]).hits).toBe(0);

    const inside = enemy(2, 42, 0);
    const r = trigger(g, 0, 'holy_ward', combatState({ hitBonus: 4 }), [inside]);
    expect(r.hits).toBe(1);
    expect(inside.hp).toBe(94); // 圣光壁垒 6 伤害
  });

  it('负数、NaN、Infinity 的 hitBonus 一律按 0 处理', () => {
    const g = grid16();
    g.cells[0].slot = { kind: 'sigil', defId: 'arcane_bolt' };
    const aim = { x: 0, y: 0 };
    for (const bad of [-5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const e = enemy(1, 29, 0);
      const r = trigger(g, 0, 'arcane_bolt', combatState({ hitBonus: bad }), [e], aim);
      expect(r.hits).toBe(0);
    }
  });
});

describe('人物宝箱 · 碎片吸附半径', () => {
  it('无增益时默认参数保持 38 / 34 / 12', () => {
    expect(pickupPullParams({})).toEqual({ pullRadius: 38, pullSpeed: 34, pickRadius: 12 });
    expect(pickupPullParams({ pickupBonus: 0 })).toEqual({ pullRadius: 38, pullSpeed: 34, pickRadius: 12 });
  });

  it('pickupBonus 以像素为单位叠加到吸附半径', () => {
    expect(pickupPullParams({ pickupBonus: 12 }).pullRadius).toBe(50);
    // 碎片共鸣的 96 基准值之上仍然可以叠加人物增益
    expect(pickupPullParams({ pickupBonus: 12 }, { pullRadius: 96, pullSpeed: 92 }))
      .toEqual({ pullRadius: 108, pullSpeed: 92, pickRadius: 12 });
  });

  it('非法 pickupBonus 不改变默认吸附半径', () => {
    for (const bad of [-9, Number.NaN, Number.POSITIVE_INFINITY, '12']) {
      expect(pickupPullParams({ pickupBonus: bad }).pullRadius).toBe(38);
    }
  });

  it('实际 update：45px 处默认不动，有 +12 增益时被吸向玩家', () => {
    const still = bareShard(45, 0);
    still.update(100, { x: 0, y: 0, alive: true }, 0);
    expect(still.x).toBe(45);

    const pulled = bareShard(45, 0);
    pulled.update(100, { x: 0, y: 0, alive: true, pickupBonus: 12 }, 0);
    expect(pulled.x).toBeCloseTo(41.6, 6); // 34px/s × 0.1s
    expect(pulled.y).toBeCloseTo(0, 6);
  });

  it('实际 update：碎片共鸣基准半径同样叠加 pickupBonus', () => {
    const noBonus = bareShard(100, 0);
    noBonus.update(100, { x: 0, y: 0, alive: true }, 0, { pullRadius: 96, pullSpeed: 92 });
    expect(noBonus.x).toBe(100);

    const withBonus = bareShard(100, 0);
    withBonus.update(100, { x: 0, y: 0, alive: true, pickupBonus: 12 }, 0, { pullRadius: 96, pullSpeed: 92 });
    expect(withBonus.x).toBeCloseTo(90.8, 6); // 92px/s × 0.1s
  });

  it('接触拾取半径仍为 12px，默认行为不变', () => {
    const close = bareShard(11, 0);
    expect(close.update(1, { x: 0, y: 0, alive: true, pickupBonus: 12 }, 0)).toBe(true);
    const edge = bareShard(13, 0);
    expect(edge.update(1, { x: 0, y: 0, alive: true, pickupBonus: 12 }, 0)).toBe(false);
  });
});
