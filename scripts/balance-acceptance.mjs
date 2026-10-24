// 当前默认参数的标准盘基准：不把静态全铺基准当成所有构筑/走位的保证。
import assert from 'node:assert/strict';
import { createGrid, rebuildDerived } from '../src/logic/grid.js';
import { unlockToTarget } from '../src/logic/build.js';
import { ACTS } from '../src/logic/constants.js';
import { ACT1_STARTING_CELLS } from '../src/logic/run.js';
import { SigilEngine } from '../src/logic/engine.js';
const durationMs = 180000;
const seeds = Array.from({ length: 8 }, (_, i) => 'balance-acceptance-' + (i + 1));
const rows = ACTS.map(act => {
  const results = seeds.map(seed => {
    const grid = createGrid();
    for (const id of ACT1_STARTING_CELLS) grid.cells[id].unlocked = true;
    unlockToTarget(grid, act.unlocked);
    for (const c of grid.cells) if (c.unlocked) c.slot = { kind: 'sigil', defId: 'arcane_bolt' };
    rebuildDerived(grid, act.baseIntervalMs);
    // 世界中心映射到10号，按BattleScene.pickStartCells从id升序补足起点。
    const starts = [10, ...grid.unlockedIds().filter(id => id !== 10)].slice(0, act.starts);
    const engine = new SigilEngine({ seed, grid, startCells: starts });
    engine.start();
    engine.advanceTo(durationMs);
    const summary = engine.summary(durationMs);
    return { seed, rate: summary.blockedRate * 100, triggers: summary.triggers, blocked: summary.blocked };
  });
  const rates = results.map(r => r.rate);
  const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
  return { act: act.act, starts: act.starts, intervalMs: act.baseIntervalMs, mean, min: Math.min(...rates), max: Math.max(...rates), results };
});
console.log(JSON.stringify({ scope: '无辅助、全铺奥术、角色固定世界中心、每幕8种子各180秒；受阻率为百分比', rows }));
for (const row of rows) assert(row.mean >= 15 && row.mean <= 25, '第' + row.act + '幕标准盘平均受阻率须在15-25%，实际' + row.mean);
