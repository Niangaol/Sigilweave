import { describe, it, expect } from 'vitest';
import { createGrid, rebuildDerived, exitTargets, neighborsOf } from '../src/logic/grid.js';
import { applyDraft, draftFromGrid, emptyDraft } from '../src/logic/build.js';
import { createRun, recordAct } from '../src/logic/run.js';
import { SigilEngine } from '../src/logic/engine.js';
import { applyDamage, resolveSigilTrigger, resolveComboBonus } from '../src/logic/effects.js';

function full() {
 const grid = createGrid(); for (const c of grid.cells) c.unlocked = true;
 rebuildDerived(grid, 2000); return grid;
}
const enemy = (id, x, y, hp = 100) => ({ id, x, y, hp, maxHp: hp, alive: true, armor: 0 });
const state = () => ({ player: { x: 0, y: 0, hp: 100, maxHp: 100, shield: 0 }, now: 0 });

describe('构筑派生效果', () => {
 it('沙漏指定邻格冷却缩短，移除后不残留', () => {
   const g = full();
   g.cells[5].slot = { kind: 'auxiliary', defId: 'hourglass' }; g.cells[5].auxTarget = 6;
   g.cells[6].slot = { kind: 'sigil', defId: 'arcane_bolt' };
   rebuildDerived(g, 1700); expect(g.cells[6].effCooldownMs).toBe(2200 * 0.7);
   g.cells[5].slot = null; rebuildDerived(g, 1700); expect(g.cells[6].effCooldownMs).toBe(2200);
 });
 it('扩域不污染配置出口，卸下辅助恢复原出口', () => {
   const g = full(); g.cells[6].slot = { kind: 'sigil', defId: 'arcane_bolt' };
   g.cells[6].exits = new Set(['down']);
   g.cells[5].slot = { kind: 'auxiliary', defId: 'wide_runes' }; g.cells[5].auxTarget = 6;
   rebuildDerived(g, 1700); expect(exitTargets(g, 6)).toHaveLength(8);
   expect([...g.cells[6].exits]).toEqual(['down']);
   g.cells[5].slot = null; rebuildDerived(g, 1700); expect(exitTargets(g, 6)).toEqual([10]);
 });
 it('中继抑制本格输出并把出发间隔乘0.6，受0.5秒下限约束', () => {
   const g = full(); g.cells[0].slot = { kind: 'sigil', defId: 'arcane_bolt' }; g.cells[0].runes[0] = 'relay';
   rebuildDerived(g, 2000); expect(g.cells[0].effIntervalMs).toBe(1200);
   const e = enemy(1, -100, -100);
   expect(resolveSigilTrigger({ grid: g, cellId: 0, defId: 'arcane_bolt', state: state(), enemies: [e] }).hits).toBe(0);
   expect(e.hp).toBe(100);
   rebuildDerived(g, 1000); expect(g.cells[0].effIntervalMs).toBe(600);
 });
 it('断流卸下后恢复保留的单向配置', () => {
   const g = full(); g.cells[5].exits = new Set(['right']); g.cells[5].runes[0] = 'sever';
   rebuildDerived(g, 2000); expect(exitTargets(g, 5)).toEqual([]);
   const d = draftFromGrid(g, { act: 3 }); d.runes[5] = [null, null];
   expect(applyDraft(g, d).ok).toBe(true); expect(exitTargets(g, 5)).toEqual([6]);
 });
 it('符印冷却倍率与共鸣石乘算后再限底', () => {
   const g = full(); g.cells[0].slot = { kind: 'sigil', defId: 'judgment_hammer' };
   g.cells[1].slot = { kind: 'auxiliary', defId: 'resonance_stone' };
   rebuildDerived(g, 2000); expect(g.cells[0].effCooldownMs).toBe(800 * 1.25 * 0.75);
   expect(g.cells[0].effIntervalMs).toBe(1500);
 });
 it.each([NaN, -1, 0, Infinity])('非法基础间隔 %j 不污染旧派生值', interval => {
   const g = full(); const before = JSON.stringify(g.cells);
   expect(() => rebuildDerived(g, interval)).toThrow(RangeError);
   expect(JSON.stringify(g.cells)).toBe(before); expect(g.baseIntervalMs).toBe(2000);
 });
 it('错误格号与未知方向安全返回空邻接', () => {
   const g = full(); expect(exitTargets(g, -1)).toEqual([]); expect(exitTargets(g, 16)).toEqual([]);
   expect(neighborsOf(5, ['bogus'])).toEqual([]); expect(neighborsOf(0.5)).toEqual([]);
 });
});

describe('结算数值与命中边界', () => {
 it.each([-1, NaN, Infinity, -Infinity])('非法伤害 %j 不回血或写入NaN', amount => {
   const e = enemy(1, 0, 0, 10); expect(applyDamage(e, amount)).toBe(0); expect(e.hp).toBe(10);
 });
 it.each([-1, 1, 2, NaN])('护甲 %j 被限制在有效减伤范围', armor => {
   const e = { ...enemy(1, 0, 0, 10), armor }; applyDamage(e, 5);
   expect(Number.isFinite(e.hp)).toBe(true); expect(e.hp).toBeGreaterThanOrEqual(5); expect(e.hp).toBeLessThanOrEqual(10);
 });
 it('固定落点单体结算不能追踪已经离开的目标', () => {
   const g = full(); const e = enemy(1, 100, 100);
   const result = resolveSigilTrigger({ grid: g, cellId: 0, defId: 'arcane_bolt', state: state(), enemies: [e], aimPoint: { x: -100, y: -100 } });
   expect(result.hits).toBe(0); expect(e.hp).toBe(100);
 });
 it('烈焰只命中落点附近最多三个目标，不跨地图伤害', () => {
   const g = full(); const enemies = [enemy(1, -100, -100), enemy(2, -98, -98), enemy(3, -95, -95), enemy(4, -92, -92), enemy(5, 100, 100)];
   const result = resolveSigilTrigger({ grid: g, cellId: 0, defId: 'flame_burst', state: state(), enemies, aimPoint: { x: -100, y: -100 } });
   expect(result.hits).toBe(3); expect(enemies[4].hp).toBe(100);
 });
 it('寒霜命中设置限时减速且熔炉倍率在共用入口生效', () => {
   const g = full(); g.cells[0].runes[0] = 'forge'; const e = enemy(1, -100, -100);
   resolveSigilTrigger({ grid: g, cellId: 0, defId: 'frost_arrow', state: state(), enemies: [e] });
   expect(e.hp).toBe(85); expect(e.slowUntil).toBe(2000); expect(e.slowFactor).toBe(0.6);
 });
 it('直线联组仅追加末格，不能给三格都加伤害', () => {
   const g = full(); for (const id of [0, 1, 2]) g.cells[id].slot = { kind: 'sigil', defId: 'arcane_bolt' };
   const enemies = [enemy(1, -100, -100), enemy(2, -30, -100), enemy(3, 30, -100)];
   resolveComboBonus({ grid: g, order: [0, 1, 2], defId: 'line3', bonus: 0.4, state: state(), enemies, half: 120 });
   expect(enemies.map(e => e.hp)).toEqual([100, 100, 95.2]);
 });
});

describe('演武会话与模拟暂停', () => {
 it('开局四张输出、六个解封，不偷放后期卡', () => {
   const run = createRun('seed'); expect(run.draft.unlocked).toHaveLength(6);
   expect(Object.keys(run.draft.slots)).toHaveLength(4);
   expect(applyDraft(createGrid(), run.draft).ok).toBe(true);
 });
 it('同幕统计只记录一次，防止重复幕间结算', () => {
   const run = createRun(); expect(recordAct(run, { triggers: 5 })).toBe(true);
   expect(recordAct(run, { triggers: 500 })).toBe(false); expect(run.reports[0].triggers).toBe(5);
   run.act = 2; expect(recordAct(run, {})).toBe(true);
 });
 it('暂停期间直接调用advance也不能偷跑时钟与队列', () => {
   const g = full(); const e = new SigilEngine({ grid: g, startCells: [5], seed: 1 });
   e.start(); e.advance(2000); const now = e.now, triggers = e.stats.triggers;
   e.paused = true; e.advance(10000); e.advanceTo(100000);
   expect(e.now).toBe(now); expect(e.stats.triggers).toBe(triggers);
   e.paused = false; e.advance(2000); expect(e.now).toBe(now + 2000);
 });
});
