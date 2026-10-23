// 平衡对照实验：不改游戏默认值，只量化不同参数选择的后果，供拍板参考。
import { createGrid, rebuildDerived, toId, toRC, inBounds } from '../src/logic/grid.js';
import { SigilEngine } from '../src/logic/engine.js';
import { buildComboCatalog } from '../src/logic/combo.js';
import { ACTS } from '../src/logic/constants.js';

const SEEDS = ['lab-1', 'lab-2', 'lab-3', 'lab-4', 'lab-5', 'lab-6', 'lab-7', 'lab-8'];
const DURATION = 180000;

const ACT_CELLS = {
  1: [4, 5, 6, 7, 9, 10],
  2: [4, 5, 6, 7, 9, 10, 1, 2, 13, 14, 0, 3],
  3: Array.from({ length: 16 }, (_, i) => i),
};

// 三种布局：全铺符印 / 隔格稀疏 / 中心聚团
function pickCells(act, layout) {
  const unlocked = ACT_CELLS[act];
  if (layout === 'all') return unlocked.filter(() => true);
  if (layout === 'sparse') return unlocked.filter((id) => (toRC(id).r + toRC(id).c) % 2 === 0);
  const center = [5, 6, 9, 10, 4, 7];
  return unlocked.filter((id) => center.includes(id));
}

function roundTripDuoInstances() {
  const out = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        const nr = r + dr, nc = c + dc;
        if (!inBounds(nr, nc)) continue;
        const a = toId(r, c), b = toId(nr, nc);
        out.push({ defId: 'duo_rt', order: [a, b, a], bonus: 0.2 });
        out.push({ defId: 'duo_rt', order: [b, a, b], bonus: 0.2 });
      }
    }
  }
  return out;
}

function run({ act, interval, starts, layout, combos }) {
  const rows = [];
  for (const seed of SEEDS) {
    const grid = createGrid();
    for (const id of ACT_CELLS[act]) grid.cells[id].unlocked = true;
    const filled = pickCells(act, layout);
    for (const id of filled) grid.cells[id].slot = { kind: 'sigil', defId: 'arcane_bolt' };
    rebuildDerived(grid, interval);
    const engine = new SigilEngine({ seed, grid, startCells: starts.slice(), combos });
    engine.start();
    engine.advanceTo(DURATION);
    const s = engine.summary(DURATION);
    // 只有装了符印的格子才算有效输出；空符位被踏上只是空转
    const effective = engine.stats.perCellTriggers.reduce((a, n, id) => a + (filled.includes(id) ? n : 0), 0);
    rows.push({
      tps: s.triggers / (DURATION / 1000),
      eff: effective / (DURATION / 1000),
      blocked: s.blockedRate,
      combos: s.combos,
      combosByShape: engine.stats.combosByShape,
      idle: s.idleCells.filter((id) => filled.includes(id)).length,
    });
  }
  const avg = (fn) => rows.reduce((a, r) => a + fn(r), 0) / rows.length;
  const shapes = {};
  for (const r of rows) for (const [k, v] of Object.entries(r.combosByShape)) shapes[k] = (shapes[k] ?? 0) + v;
  for (const k of Object.keys(shapes)) shapes[k] = +(shapes[k] / rows.length).toFixed(1);
  return {
    tps: +avg((r) => r.tps).toFixed(3),
    eff: +avg((r) => r.eff).toFixed(3),
    blocked: +(avg((r) => r.blocked) * 100).toFixed(2),
    combos: +avg((r) => r.combos).toFixed(1),
    combosPerMin: +(avg((r) => r.combos) / (DURATION / 60000)).toFixed(1),
    idle: +avg((r) => r.idle).toFixed(1),
    shapes,
  };
}

const full = buildComboCatalog(['duo', 'line3', 'elbow3', 'ring4']);
const rt = [...buildComboCatalog(['line3', 'elbow3', 'ring4']), ...roundTripDuoInstances()];

const lines = [];
lines.push('# 平衡对照实验（方案对比，不改默认值）\n');
lines.push('> 目的：为三个待拍板问题提供数据。每格均装奥术飞弹（12 伤害），每场景 8 个固定种子 × 180 秒取平均。');
lines.push('> **有效输出/秒** 只统计装有符印的格；**总触发/秒** 包含空符位空转；受阻率 = 冷却未就绪被吞的比例；联组/分 = 每分钟联组次数。\n');

function table(title, rows) {
  lines.push('## ' + title + '\n');
  lines.push('| 场景 | 有效输出/秒 | 总触发/秒 | 受阻率 | 联组/分 | 空转格 | 对偶 | 直线三连 | 折线三连 | 环封四格 |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of rows) {
    const s = r.data.shapes;
    lines.push('| ' + r.label + ' | ' + r.data.eff + ' | ' + r.data.tps + ' | ' + r.data.blocked + '% | ' + r.data.combosPerMin + ' | ' + r.data.idle + ' | ' +
      (s.duo ?? 0) + ' | ' + (s.line3 ?? 0) + ' | ' + (s.elbow3 ?? 0) + ' | ' + (s.ring4 ?? 0) + ' |');
  }
  lines.push('');
}

// 实验一：基础间隔对冷却与触发率的影响（第三幕全铺、双起点）
const intervalRows = [2.0, 1.7, 1.4, 1.2, 1.0].map((interval) => ({
  label: '间隔 ' + interval.toFixed(1) + 's',
  data: run({ act: 3, interval: interval * 1000, starts: [5, 10], layout: 'all', combos: full }),
}));
table('实验一：基础间隔（第三幕 16 格全铺、2 起点）', intervalRows);

// 实验二：起点数对第三幕触发率
const startRows = [1, 2, 3, 4].map((n) => ({
  label: n + ' 起点',
  data: run({ act: 3, interval: 1400, starts: [5, 10, 1, 14].slice(0, n), layout: 'all', combos: full }),
}));
table('实验二：起点数（第三幕、间隔 1.4s、16 格全铺）', startRows);

// 实验三：对偶判定改往返（A→B→A）
const duoRows = [
  { label: '现规则（A→B 成立）', data: run({ act: 2, interval: 1700, starts: [5], layout: 'all', combos: full }) },
  { label: '改往返（A→B→A 成立）', data: run({ act: 2, interval: 1700, starts: [5], layout: 'all', combos: rt }) },
];
table('实验三：对偶联组判定（第二幕 12 格、单起点）', duoRows);

// 实验四：三种布局在默认参数下的表现（验证“集中/分布/联组都能跑”）
const layoutRows = ['all', 'sparse', 'cluster'].map((layout) => ({
  label: { all: '全铺符印', sparse: '隔格稀疏', cluster: '中心聚团' }[layout],
  data: run({ act: 2, interval: 1700, starts: [5], layout, combos: full }),
}));
table('实验四：布局形态（第二幕、默认参数）', layoutRows);

lines.push('## 读法与建议\n');
lines.push('- **间隔**：冷却是否“有感”取决于盘面规模与脉流数。第一幕 6 格单起点在 2.0s 受阻为 0%；第三幕 16 格双起点同为 2.0s 已有 5.6%，1.0s 升到 11.4%。想靠冷却制造取舍，1.2–1.4s 是比 2.0s 更现实的区间，但输出会同步上涨，需要重配敌人血量。');
lines.push('- **起点**：触发率约等于「起点数 / 间隔」。第三幕单起点在 1.4s 下明显偏低，2–3 个起点能补齐。');
lines.push('- **对偶**：现规则下对偶约每分钟 97 次（第二幕），属于常驻增益而不是爆发。**“改成往返”已被实测否决**：禁立即回退让 A→B→A 永远无法成立，成立次数为 0。可选的替代是把它压成 +8% 的基础增益，或干脆并入直线三连。');
lines.push('- **布局**：看“有效输出/秒”而不是总触发；空符位被脉流踩到只是空转，不产生伤害。\n');
// 补第一幕对照，解释旧结论“2.0s 冷却不生效”的适用范围
const act1 = run({ act: 1, interval: 2000, starts: [5], layout: 'all', combos: full });
lines.push('## 实验五：第一幕对照（6 格单起点 2.0s）\n');
lines.push('| 场景 | 有效输出/秒 | 总触发/秒 | 受阻率 | 联组/分 |');
lines.push('| --- | --- | --- | --- | --- |');
lines.push('| 第一幕默认 | ' + act1.eff + ' | ' + act1.tps + ' | ' + act1.blocked + '% | ' + act1.combosPerMin + ' |');
lines.push('');
lines.push('> 旧仿真报告里“2.0 秒间隔下冷却受阻率 0.00%”只对第一幕 6 格单脉流成立；16 格双起点时同参数受阻率约 5.6%，说明冷却是否生效取决于盘面规模与脉流数，不能一句话概括。\n');
lines.push('> **往返对偶不可行**：实测改往返后对偶成立 0 次。原因是引擎禁止立即回到上一格（防死锁规则），A→B→A 里的 B→A 永远被拒。因此“压成 +8% 基础增益”比改往返更现实。');
lines.push('> 以上为纯逻辑模拟，不含走位、治疗与生存压力，不能当作完整平衡结论；默认值未改，等拍板后再落。');

console.log(lines.join('\n'));
