import { describe, it, expect } from 'vitest';
import {
  regionOf, resolveTarget, resolveVolley, isEnemyOnScreen, enemyScreenRect, normalizeView,
} from '../src/logic/sector.js';
import { resolveSigilTrigger, resolveDeathBursts, applyDamage } from '../src/logic/effects.js';
import { createGrid } from '../src/logic/grid.js';

// 屏幕 480×270，视口原点在 (0,0)：玩家居中 (240,135)
const VIEW = { x: 0, y: 0, w: 480, h: 270 };
const player = { x: 240, y: 135 };
const mob = (id, x, y, extra = {}) => ({ id, x, y, alive: true, hp: 100, maxHp: 100, radius: 6, ...extra });
const fullGrid = () => {
  const g = createGrid();
  for (const c of g.cells) c.unlocked = true;
  return g;
};
const state = (view) => ({ player: { x: 240, y: 135, hp: 100, maxHp: 100, shield: 0 }, now: 0, view });

describe('视口解析', () => {
  it('支持 x/y/w/h 与 x/y/width/height 两种写法，非法值返回 null', () => {
    expect(normalizeView({ x: 10, y: 20, w: 100, h: 50 })).toEqual({ left: 10, top: 20, right: 110, bottom: 70 });
    expect(normalizeView({ x: 10, y: 20, width: 100, height: 50 })).toEqual({ left: 10, top: 20, right: 110, bottom: 70 });
    for (const bad of [null, undefined, {}, { x: 0, y: 0, w: 0, h: 10 }, { x: NaN, y: 0, w: 1, h: 1 }]) {
      expect(normalizeView(bad)).toBeNull();
    }
  });

  it('没有视口时维持旧行为（全部可选）', () => {
    const far = mob(1, 5000, 5000);
    expect(isEnemyOnScreen(far, null)).toBe(true);
  });
});

describe('屏幕内判定', () => {
  it('逻辑半径回退：中心在屏外且半径碰不到边框就不算进屏', () => {
    expect(isEnemyOnScreen(mob(1, 480, 135), VIEW)).toBe(true);    // 中心在边框上
    expect(isEnemyOnScreen(mob(1, 487, 135), VIEW)).toBe(false);   // 6px 半径也碰不到
    expect(isEnemyOnScreen(mob(1, 486, 135), VIEW)).toBe(true);    // 身体擦到边框
  });

  it('视觉外框优先：脚刚出屏但身体还在屏里，算进屏', () => {
    const tall = mob(1, -10, 300, { viewExtent: { left: -20, right: 20, top: -56, bottom: 8 } });
    expect(enemyScreenRect(tall)).toEqual({ left: -30, right: 10, top: 244, bottom: 308 });
    expect(isEnemyOnScreen(tall, VIEW)).toBe(true);
    const gone = mob(2, -100, 300, { viewExtent: { left: -20, right: 20, top: -56, bottom: 8 } });
    expect(isEnemyOnScreen(gone, VIEW)).toBe(false);
  });

  it('非法坐标不出屏', () => {
    expect(isEnemyOnScreen({ id: 1, alive: true, x: NaN, y: 0 }, VIEW)).toBe(false);
    expect(isEnemyOnScreen(null, VIEW)).toBe(false);
  });
});

describe('只锁屏幕内的怪（player 相对方位 + 视口过滤）', () => {
  it('屏幕外的怪不再被选中，屏幕内的怪照常可选', () => {
    const outside = mob(1, 700, 100);
    const inside = mob(2, 430, 120);
    const rOut = regionOf(outside.x, outside.y, player.x, player.y);
    const rIn = regionOf(inside.x, inside.y, player.x, player.y);
    const miss = resolveTarget(rOut, player, [outside], { view: VIEW });
    expect(miss.target).toBeNull();
    expect(miss.empty).toBe(true);
    const hit = resolveTarget(rIn, player, [inside], { view: VIEW });
    expect(hit.target.id).toBe(2);
    // 旧调用方（不带 view）行为不变
    expect(resolveTarget(rOut, player, [outside]).target.id).toBe(1);
  });

  it('空区补射同样只看屏幕内：屏外怪不会被补射借道命中', () => {
    const offscreen = mob(1, -300, -300);
    const assisted = resolveTarget(10, player, [offscreen], { view: VIEW });
    expect(assisted.target).toBeNull();
    expect(assisted.empty).toBe(true);
    // 屏内目标仍然可以补射
    const visible = mob(2, 100, 100);
    const assist = resolveTarget(10, player, [visible], { view: VIEW });
    expect(assist.target.id).toBe(2);
    expect(assist.assisted).toBe(true);
  });

  it('齐射不会把屏外的怪算进数量', () => {
    const in1 = mob(1, 220, 134);
    const in2 = mob(2, 200, 134);
    const out = mob(3, -400, 134);
    const v = resolveVolley(regionOf(in1.x, in1.y, player.x, player.y), player, [in1, in2, out], { maxTargets: 3, view: VIEW });
    expect(v.targets.map((e) => e.id).sort()).toEqual([1, 2]);
    const none = resolveVolley(regionOf(out.x, out.y, player.x, player.y), player, [out], { maxTargets: 3, view: VIEW });
    expect(none.targets).toEqual([]);
  });
});

describe('伤害结算也只在屏幕内', () => {
  const grid = fullGrid();

  it('单体弹丸落在屏外敌人身上时不结算', () => {
    const off = mob(1, 700, 100);
    const r = resolveSigilTrigger({ grid, cellId: 5, defId: 'frost_arrow', state: state(VIEW), enemies: [off], aimPoint: { x: 700, y: 100 }, view: VIEW });
    expect(r.hits).toBe(0);
    expect(off.hp).toBe(100);
  });

  it('范围法术的溅射不会捎带屏外的怪', () => {
    const inside = mob(1, 460, 135);
    const outside = mob(2, 520, 135);   // 距离落点 60，在星陨 70 半径内，但在屏幕外
    const r = resolveSigilTrigger({ grid, cellId: 5, defId: 'starfall', state: state(VIEW), enemies: [inside, outside], aimPoint: { x: 460, y: 135 }, view: VIEW });
    expect(r.targets.map((e) => e.id)).toEqual([1]);
    expect(outside.hp).toBe(100);
  });

  it('镜头外的目标不因 aimPoint 命中判定被吃', () => {
    const off = mob(1, 700, 100);
    expect(applyDamage(off, 30)).toBe(30);
    expect(off.lastHitAmount).toBe(30); // 表现层读数
  });

  it('尸爆连锁跳过屏幕外的怪', () => {
    const off = mob(1, -16, 5);
    const r = resolveDeathBursts({ enemies: [off], seeds: [{ x: 5, y: 5 }], view: VIEW });
    expect(r.hits).toBe(0);
    expect(off.hp).toBe(100);
    const noView = resolveDeathBursts({ enemies: [mob(1, -16, 5)], seeds: [{ x: 5, y: 5 }] });
    expect(noView.hits).toBe(1);
  });
});
