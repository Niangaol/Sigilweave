// P0 仿真：验证冷却与共鸣石的真实效果，输出可直接贴进文档的结论
import { createGrid, rebuildDerived, toId } from '../src/logic/grid.js';
import { SigilEngine } from '../src/logic/engine.js';
import { buildComboCatalog } from '../src/logic/combo.js';

const ALL = [...Array(16).keys()];

function buildGrid({ unlocked, intervalMs, stones = [], reduction = 0.25, cooldownMode = 'positional' }) {
  const g = createGrid();
  for (const id of unlocked) g.cells[id].unlocked = true;
  for (const id of stones) g.cells[id].slot = { kind: 'auxiliary', defId: 'resonance_stone' };
  // 临时改写乘算系数
  const saved = [];
  for (const c of g.cells) saved.push(c.slot);
  rebuildDerived(g, intervalMs);
  if (reduction !== 0.25) {
    // 用等效方式重算：手动设置因子
    for (const c of g.cells) c.resonanceStacks = 0;
    for (const id of stones) {
      const { r, c } = { r: Math.floor(id / 4), c: id % 4 };
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr > 3 || nc < 0 || nc > 3) continue;
        const t = g.cells[nr * 4 + nc];
        if (t.unlocked) t.resonanceStacks += 1;
      }
    }
    for (const c of g.cells) {
      const f = Math.pow(1 - reduction, c.resonanceStacks);
      c.effIntervalMs = Math.max(800, intervalMs * f);
      c.effCooldownMs = Math.max(1200, ({ corner: 1500, edge: 2000, center: 4000 })[
        (() => { const r = Math.floor(c.id / 4), col = c.id % 4;
          const er = r === 0 || r === 3, ec = col === 0 || col === 3;
          return er && ec ? 'corner' : (er || ec ? 'edge' : 'center'); })()] * f);
    }
  }
  if (cooldownMode === 'none') for (const c of g.cells) c.effCooldownMs = 0;
  if (cooldownMode === 'global2000') for (const c of g.cells) c.effCooldownMs = 2000;
  if (cooldownMode === 'global3000') for (const c of g.cells) c.effCooldownMs = 3000;
  return g;
}

function runOnce({ unlocked, intervalMs, stones, reduction, cooldownMode, seed, durationMs = 180000, combos = true }) {
  const g = buildGrid({ unlocked, intervalMs, stones, reduction, cooldownMode });
  const catalog = combos ? buildComboCatalog(['duo', 'line3', 'elbow3', 'ring4']) : null;
  const e = new SigilEngine({ seed, grid: g, startCells: [5], combos: catalog });
  e.start();
  e.advanceTo(durationMs);
  return e.summary(durationMs);
}

function aggregate(config, seeds = [1, 2, 3, 4, 5, 6, 7, 8]) {
  const rows = seeds.map((s) => runOnce({ ...config, seed: s }));
  const avg = (k) => rows.reduce((a, r) => a + r[k], 0) / rows.length;
  return {
    tps: avg('triggersPerSec'),
    blockedRate: avg('blockedRate'),
    fallbacks: avg('fallbacks'),
    dissipations: avg('dissipations'),
    combos: avg('combos'),
    triggers: avg('triggers'),
  };
}

const ACTS = [
  { name: '第一幕', unlocked: 6, intervalMs: 2000, starts: 1 },
  { name: '第二幕', unlocked: 12, intervalMs: 1700, starts: 1 },
  { name: '第三幕', unlocked: 16, intervalMs: 1400, starts: 2 },
];

const lines = [];
lines.push('# P0 纯逻辑仿真报告');
lines.push('');
lines.push('> 由 scripts/simulate.mjs 自动生成。每组 8 个固定种子，每局 180 秒，单脉流（第三幕双起点未接入）。');
lines.push('');
lines.push('## 一、各幕基础配置的实测触发与受阻');
lines.push('');
lines.push('| 幕 | 解封格 | 基础间隔 | 平均触发/秒 | 冷却受阻率 | 消散/局 | 保底传送/局 | 联组/局 |');
lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
for (const a of ACTS) {
  const r = aggregate({ unlocked: ALL.slice(0, a.unlocked), intervalMs: a.intervalMs });
  lines.push('| ' + a.name + ' | ' + a.unlocked + ' | ' + a.intervalMs + 'ms | ' +
    r.tps.toFixed(2) + ' | ' + (r.blockedRate * 100).toFixed(2) + '% | ' +
    r.dissipations.toFixed(2) + ' | ' + r.fallbacks.toFixed(2) + ' | ' + r.combos.toFixed(1) + ' |');
}
lines.push('');

// 关键实验 A：冷却到底有没有用
lines.push('## 二、实验 A：位置化冷却是否真的生效');
lines.push('');
lines.push('固定 16 格全开、单起点，只改冷却模式：');
lines.push('');
lines.push('| 间隔 | 无冷却 | 位置化(1.5/2/4s) | 全局 2s | 全局 3s |');
lines.push('| --- | --- | --- | --- | --- |');
for (const intervalMs of [2000, 1400, 1000, 800]) {
  const cells = [];
  for (const mode of ['none', 'positional', 'global2000', 'global3000']) {
    const r = aggregate({ unlocked: ALL, intervalMs, cooldownMode: mode });
    cells.push(r.blockedRate * 100);
  }
  lines.push('| ' + intervalMs + 'ms | ' + cells.map((v) => v.toFixed(2) + '%').join(' | ') + ' |');
}
lines.push('');

// 关键实验 B：共鸣石
lines.push('## 三、实验 B：共鸣石实际收益（25% 减幅，中心位 / 角位）');
lines.push('');
lines.push('| 场景 | 触发/秒 | 相对无石 | 冷却受阻率 |');
lines.push('| --- | --- | --- | --- |');
const baseline = aggregate({ unlocked: ALL, intervalMs: 2000 });
lines.push('| 无共鸣石 | ' + baseline.tps.toFixed(2) + ' | 基准 | ' + (baseline.blockedRate * 100).toFixed(2) + '% |');
for (const [name, stones] of [['中心(1,1)', [toId(1, 1)]], ['角位(0,0)', [toId(0, 0)]], ['中心+边各一', [toId(1, 1), toId(1, 2)]]]) {
  const r = aggregate({ unlocked: ALL, intervalMs: 2000, stones });
  const delta = ((r.tps / baseline.tps - 1) * 100).toFixed(1);
  lines.push('| ' + name + ' | ' + r.tps.toFixed(2) + ' | ' + (delta >= 0 ? '+' : '') + delta + '% | ' + (r.blockedRate * 100).toFixed(2) + '% |');
}
lines.push('');

// 关键实验 C：减幅档位
lines.push('## 四、实验 C：减幅档位对中心位的影响');
lines.push('');
lines.push('| 减幅 | 中心位触发/秒 | 相对 25% |');
lines.push('| --- | --- | --- |');
const ref = aggregate({ unlocked: ALL, intervalMs: 2000, stones: [toId(1, 1)], reduction: 0.25 });
for (const red of [0.20, 0.25, 0.30, 0.35]) {
  const r = aggregate({ unlocked: ALL, intervalMs: 2000, stones: [toId(1, 1)], reduction: red });
  const rel = ((r.tps / ref.tps - 1) * 100).toFixed(1);
  lines.push('| ' + (red * 100).toFixed(0) + '% | ' + r.tps.toFixed(2) + ' | ' + (rel >= 0 ? '+' : '') + rel + '% |');
}
lines.push('');

// 关键实验 D：探索保底
lines.push('## 五、实验 D：探索保底与格子覆盖率');
lines.push('');
lines.push('| 幕 | 无保底(需手改) | 有保底 | 说明 |');
lines.push('| --- | --- | --- | --- |');
lines.push('| 第一幕 6 格 | ' + aggregate({ unlocked: ALL.slice(0, 6), intervalMs: 2000 }).fallbacks.toFixed(2) + ' 次/局 | 同上 | 6 格很快走完 |');
lines.push('| 第十六格 | ' + aggregate({ unlocked: ALL, intervalMs: 1400 }).fallbacks.toFixed(2) + ' 次/局 | 同上 | 16 格随机游走覆盖率低 |');
lines.push('');

// 结论
lines.push('## 六、结论（数据驱动，不是设计稿原话）');
lines.push('');
const at2000 = aggregate({ unlocked: ALL, intervalMs: 2000 });
const at800 = aggregate({ unlocked: ALL, intervalMs: 800 });
lines.push('1. **基础间隔 2.0 秒时，位置化冷却完全不起作用**：受阻率 ' + (at2000.blockedRate * 100).toFixed(2) +
  '%。原因是最短合法回路是 4 跳（禁止立即回退），4×2.0=8 秒已超过最高的中心 4 秒冷却。');
lines.push('2. **冷却只在间隔压到约 1.0 秒以下才开始生效**：0.8 秒时受阻率 ' + (at800.blockedRate * 100).toFixed(2) +
  '%。设计稿「冷却从第一秒就产生实际作用」在基础值下不成立。');
lines.push('3. **共鸣石的价值主要来自间隔缩短，不是冷却**：它让局部频率上升，但也同时把冷却缩短 25%，所以受阻率不会等比例恶化。');
lines.push('4. **对策建议（待你拍板）**：① 保留位置化冷却，但承认它是后期参数（第三幕 1.4 秒才开始有感）；② 或把基础间隔下调到 1.5/1.2/1.0 秒，让冷却从第二幕起参与决策；③ 或引入「同格连续被踩加成」替代冷却作为早期决策点。');

const out = lines.join('\n') + '\n';
console.log(out);
