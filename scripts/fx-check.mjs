// 法术特效自检：逐法术 × 逐通道跑一遍，报绘制指令数、整数顶点、alpha 范围、确定性与样式合法性。
// 用法：node scripts/fx-check.mjs src/ui/spell-fx/spells/hot.js
//       node scripts/fx-check.mjs            （默认检查 cold.js）
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { TRAIL_STYLE_NAMES } from '../src/ui/spell-fx/kit.js';

const CAPS = { projectile: 72, trail: 52, cast: 64, impact: 140, ward: 140, link: 52 };
const KINDS = ['projectile', 'trail', 'cast', 'impact', 'ward', 'link'];

function fakeG() {
  const log = [];
  return {
    log,
    fillStyle(c, a) { log.push(['fillStyle', c, a]); },
    fillRect(x, y, w, h) { log.push(['fillRect', x, y, w, h]); },
    fillPoints(p, close) { log.push(['fillPoints', p, close]); },
    lineStyle() { throw new Error('v2 禁止 lineStyle，请用 band/band3 画粗线'); },
    strokePoints() { throw new Error('v2 禁止 strokePoints'); },
  };
}

const ctxFor = (kind, id) => {
  const trail = [{ x: 96, y: 66 }, { x: 102, y: 70 }, { x: 108, y: 73 }, { x: 114, y: 76 }, { x: 120, y: 78 }];
  switch (kind) {
    case 'projectile': return { x: 120, y: 78, angle: 0.6, k: 0.35, clock: 1234, trail };
    case 'trail': return { x: 120, y: 78, angle: 0.6, k: 0.35, clock: 1234, trail };
    case 'cast': return { x: 200, y: 120, angle: -0.4, k: 0.5, clock: 900 };
    case 'impact': return { x: 180, y: 90, k: 0.5, clock: 1500, radius: 46, angle: 0.3 };
    case 'ward': return { x: 160, y: 100, k: 0.25, clock: 700, radius: 40 };
    default: return { from: { x: 60, y: 80 }, to: { x: 190, y: 120 }, k: 0.3, clock: 600, index: 1 };
  }
};

const count = (log) => log.filter((c) => c[0] !== 'clear').length;

function checkNumbers(id, kind, log) {
  const bad = [];
  for (const c of log) {
    if (c[0] === 'fillStyle') {
      const a = c[2];
      if (!Number.isFinite(a) || a < 0 || a > 1.0001) bad.push(id + '.' + kind + ' alpha=' + a);
    } else if (c[0] === 'fillRect') {
      for (let i = 1; i <= 4; i++) if (!Number.isFinite(c[i])) bad.push(id + '.' + kind + ' fillRect 非有限');
      if (c[3] <= 0 || c[4] <= 0) bad.push(id + '.' + kind + ' fillRect 尺寸<=0');
    } else if (c[0] === 'fillPoints') {
      if (c[1].length < 3) bad.push(id + '.' + kind + ' 顶点<3');
      for (const p of c[1]) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) bad.push(id + '.' + kind + ' 顶点非有限');
        else if (!Number.isInteger(p.x) || !Number.isInteger(p.y)) bad.push(id + '.' + kind + ' 顶点非整数 ' + p.x + ',' + p.y);
      }
    }
  }
  return bad;
}

const modPath = resolve(process.argv[2] ?? 'src/ui/spell-fx/spells/cold.js');
const mod = await import(pathToFileURL(modPath).href);
const group = Object.values(mod)[0] ?? {};
const ids = Object.keys(group);
if (!ids.length) {
  console.error('模块里没有法术：' + modPath);
  process.exit(1);
}

const problems = [];
const rows = [];
for (const id of ids) {
  const impl = group[id];
  const desc = impl.descriptor ?? {};
  if (!impl.silhouette) problems.push(id + ' 缺少 silhouette');
  if (!impl.colors) problems.push(id + ' 缺少 colors');
  if (!impl.trail) problems.push(id + ' 缺少 trail');
  else if (!TRAIL_STYLE_NAMES.includes(impl.trail.style)) problems.push(id + '.trail.style 不存在: ' + impl.trail.style);
  const row = [id, impl.silhouette ?? '?', impl.trail?.style ?? '?'];
  for (const kind of KINDS) {
    const fn = kind === 'trail' ? impl.trailFx : impl[kind];
    if (typeof fn !== 'function') { problems.push(id + ' 缺少 ' + kind); row.push('-'); continue; }
    const g = fakeG();
    try {
      fn(g, ctxFor(kind, id), impl.colors);
    } catch (e) {
      problems.push(id + '.' + kind + ' 抛错: ' + e.message);
      row.push('ERR');
      continue;
    }
    const n = count(g.log);
    row.push(n);
    if (n === 0) problems.push(id + '.' + kind + ' 一次都没画');
    if (n > CAPS[kind]) problems.push(id + '.' + kind + ' 超限 ' + n + '>' + CAPS[kind]);
    if (impl.opBudget && n > impl.opBudget) problems.push(id + '.' + kind + ' 超 opBudget ' + n + '>' + impl.opBudget);
    problems.push(...checkNumbers(id, kind, g.log));
    // 确定性
    const g2 = fakeG();
    fn(g2, ctxFor(kind, id), impl.colors);
    if (JSON.stringify(g2.log.map((c) => (c[0] === 'fillPoints' ? c[1] : c))) !== JSON.stringify(g.log.map((c) => (c[0] === 'fillPoints' ? c[1] : c)))) {
      problems.push(id + '.' + kind + ' 不确定（两次结果不同）');
    }
    // clock 不改结构
    const g3 = fakeG();
    fn(g3, { ...ctxFor(kind, id), clock: 9999 }, impl.colors);
    if (count(g3.log) !== n) problems.push(id + '.' + kind + ' clock 改变了绘制数量 ' + n + '→' + count(g3.log));
    // 生命周期两端
    for (const kk of [0, 1]) {
      const gk = fakeG();
      try { fn(gk, { ...ctxFor(kind, id), k: kk }, impl.colors); } catch (e) { problems.push(id + '.' + kind + ' k=' + kk + ' 抛错'); }
    }
  }
  rows.push(row);
}

const head = ['defId', 'silhouette', 'trail', ...KINDS];
const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
const line = (r) => r.map((c, i) => String(c).padEnd(w[i])).join('  ');
console.log(line(head));
console.log('-' .repeat(w.reduce((a, b) => a + b + 2, 0)));
for (const r of rows) console.log(line(r));
console.log('\n建议 opBudget = 各通道最大值：');
for (const id of ids) {
  const i = ids.indexOf(id);
  const max = Math.max(...rows[i].slice(3).map((v) => (typeof v === 'number' ? v : 0)));
  console.log('  ' + id + ': ' + max);
}
if (problems.length) {
  console.error('\n发现 ' + problems.length + ' 个问题：');
  for (const p of [...new Set(problems)]) console.error('  - ' + p);
  process.exit(1);
}
console.log('\nOK：全部通过（预算 / 整数顶点 / alpha / 确定性 / 样式名）');
