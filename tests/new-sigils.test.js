import { describe, it, expect } from 'vitest';
import { createGrid, rebuildDerived } from '../src/logic/grid.js';
import { resolveSigilTrigger, SIGIL_DEFS } from '../src/logic/effects.js';
import { CARD_POOL } from '../src/logic/workshop.js';
import { SIGILS } from '../src/data/roster.js';

function full() {
  const grid = createGrid();
  for (const c of grid.cells) c.unlocked = true;
  rebuildDerived(grid, 2000);
  return grid;
}
function state(extra = {}) {
  return { player: { x: 0, y: 0, hp: 100, maxHp: 100, shield: 0 }, now: 0, ...extra };
}
function enemy(id, x, y, opts = {}) {
  const hp = opts.hp ?? 100;
  return { id, x, y, hp, maxHp: hp, alive: true, armor: 0 };
}
function trigger(grid, cellId, defId, st, enemies, aimPoint) {
  grid.cells[cellId].slot = { kind: 'sigil', defId };
  return resolveSigilTrigger({ grid, cellId, defId, state: st, enemies, aimPoint });
}

describe('每个法术都必须有独立图标', () => {
  const ids = Object.keys(SIGIL_DEFS);
  it('符印数量已扩充到 16', () => {
    expect(ids.length).toBe(16);
  });
  it('每个符印都在 SIGILS 里有 8×8 字模，且不是空格', () => {
    for (const id of ids) {
      const visual = SIGILS[id];
      expect(visual, id + ' 缺少表现定义').toBeTruthy();
      expect(Array.isArray(visual.glyph), id + ' 缺少 glyph').toBe(true);
      expect(visual.glyph).toHaveLength(8);
      let lit = 0;
      for (const row of visual.glyph) {
        expect(row, id + ' 行宽必须是 8').toHaveLength(8);
        expect(/^[.#]+$/.test(row), id + ' 只能由 . 和 # 组成').toBe(true);
        lit += [...row].filter((ch) => ch === '#').length;
      }
      expect(lit, id + ' 图标不能是空白').toBeGreaterThanOrEqual(6);
    }
  });
  it('16 张图标两两不同，不存在共用兜底图案', () => {
    const seen = new Map();
    for (const id of ids) {
      const key = SIGILS[id].glyph.join('|');
      expect(seen.has(key), id + ' 与 ' + seen.get(key) + ' 图标重复').toBe(false);
      seen.set(key, id);
    }
    expect(seen.size).toBe(ids.length);
  });
  it('升级/幕间卡池里的符印都在定义表内，且都有图标', () => {
    const sigilCards = CARD_POOL.filter((c) => c.kind === 'sigil');
    expect(sigilCards).toHaveLength(16);
    for (const card of sigilCards) {
      expect(SIGIL_DEFS[card.defId], card.defId).toBeTruthy();
      expect(SIGILS[card.defId]?.glyph, card.defId + ' 无图标').toBeTruthy();
    }
  });
});

describe('连锁闪电', () => {
  it('命中后向附近最近的敌人跳跃，伤害逐跳衰减', () => {
    const g = full();
    const a = enemy(1, 100, 0);
    const b = enemy(2, 150, 0);   // 距 a 50，在跳跃半径内
    const c = enemy(3, 200, 0);   // 距 b 50
    const far = enemy(4, 900, 0); // 太远，跳不到
    const r = trigger(g, 5, 'chain_lightning', state(), [a, b, c, far]);
    expect(r.hits).toBe(3);
    expect(r.targets.map((e) => e.id)).toEqual([1, 2, 3]);
    // 12 / 8.4 / 5.88（12×0.7 / ×0.49）
    expect(a.maxHp - a.hp).toBeCloseTo(12, 5);
    expect(b.maxHp - b.hp).toBeCloseTo(12 * 0.7, 5);
    expect(c.maxHp - c.hp).toBeCloseTo(12 * 0.49, 5);
    expect(far.hp).toBe(100);
  });
  it('跳跃半径外不连锁，同一敌人不重复命中', () => {
    const g = full();
    const a = enemy(1, 100, 0);
    const b = enemy(2, 400, 0);
    const r = trigger(g, 5, 'chain_lightning', state(), [a, b]);
    expect(r.hits).toBe(1);
    expect(r.targets.map((e) => e.id)).toEqual([1]);
  });
});

describe('穿刺之矛', () => {
  it('贯穿走廊内的全部敌人，按距离由近到远结算', () => {
    const g = full();
    const near = enemy(1, 120, 0);
    const mid = enemy(2, 220, 10);   // 走廊宽度内
    const far = enemy(3, 380, -10);
    const off = enemy(4, 200, 60);   // 偏离走廊
    const r = trigger(g, 5, 'pierce_lance', state(), [near, mid, far, off], { x: 400, y: 0 });
    expect(r.targets.map((e) => e.id)).toEqual([1, 2, 3]);
    expect(off.hp).toBe(100);
    for (const e of [near, mid, far]) expect(e.maxHp - e.hp).toBeCloseTo(15, 5);
  });
  it('超出射程的敌人不受影响', () => {
    const g = full();
    const beyond = enemy(1, 500, 0);
    const r = trigger(g, 5, 'pierce_lance', state(), [beyond], { x: 100, y: 0 });
    expect(r.hits).toBe(0);
    expect(beyond.hp).toBe(100);
  });
});

describe('回声符文', () => {
  it('本格扇区与对侧扇区各命中一个目标', () => {
    const g = full();
    // 5 号在左上象限（x<0,y<0），对侧是 10 号（x>0,y>0）
    const own = enemy(1, -80, -80);
    const mirror = enemy(2, 80, 80);
    const r = trigger(g, 5, 'echo_sigil', state(), [own, mirror]);
    expect(r.hits).toBe(2);
    expect(r.targets.map((e) => e.id).sort()).toEqual([1, 2]);
    expect(own.maxHp - own.hp).toBeCloseTo(11, 5);
    expect(mirror.maxHp - mirror.hp).toBeCloseTo(11, 5);
  });
  it('对侧没有敌人时只打本格扇区，不会空转', () => {
    const g = full();
    const own = enemy(1, -80, -80);
    const r = trigger(g, 5, 'echo_sigil', state(), [own]);
    expect(r.hits).toBe(1);
    expect(r.targets[0].id).toBe(1);
  });
});

describe('其余新法术的数值落地', () => {
  it('陨星裁决内圈按 60% 结算', () => {
    const g = full();
    const inner = enemy(1, 300, 0);
    const outer = enemy(2, 360, 0);
    const r = trigger(g, 5, 'meteor_judgment', state(), [inner, outer], { x: 300, y: 0 });
    expect(r.hits).toBe(2);
    expect(inner.maxHp - inner.hp).toBeCloseTo(26 * 0.6, 5);
    expect(outer.maxHp - outer.hp).toBeCloseTo(26, 5);
  });
  it('圣环给盾但不超过 60 上限', () => {
    const g = full();
    const st = state();
    for (let i = 0; i < 5; i++) trigger(g, 5, 'aegis_ring', st, []);
    expect(st.player.shield).toBe(60);
  });
  it('噬魂箭命中后回血，且不超过上限', () => {
    const g = full();
    const st = state();
    st.player.hp = 98;
    trigger(g, 5, 'soul_lance', st, [enemy(1, 100, 0)]);
    expect(st.player.hp).toBe(100);
  });
  it('地裂之颚定身 0.6 秒', () => {
    const g = full();
    const e = enemy(1, 100, 0);
    trigger(g, 5, 'quake_maw', state(), [e], { x: 100, y: 0 });
    expect(e.rootUntil).toBe(600);
  });
  it('余烬扇附带 25% 减速', () => {
    const g = full();
    const e = enemy(1, 100, 0);
    trigger(g, 5, 'ember_fan', state(), [e], { x: 100, y: 0 });
    expect(e.slowFactor).toBeCloseTo(0.75, 5);
    expect(e.slowUntil).toBe(1200);
  });
});
