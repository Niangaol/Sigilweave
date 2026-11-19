// 架构护栏（零依赖）：把勘测出的分层规则固化成可重复检查。
// 用法：node scripts/check-architecture.mjs [--strict]
// 退出码：0 全部通过；1 有违规。
//
// 规则：
//  R1 src/logic/** 不得 import phaser / src/scenes / src/ui / src/entities / src/audio
//  R2 src/ui/** 与 src/entities/** 不得 import src/scenes
//  R3 src/data/** → src/logic/** 只允许白名单（5 条现状，新增即失败）
//  R4 文件级循环依赖必须为 0（Tarjan SCC）
//  R5 src/entities/** → src/ui/** 只允许白名单（表现层原语与 view 模块）
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative, sep } from 'node:path';

const ROOT = resolve(process.argv[1], '../..');
const SRC = join(ROOT, 'src');
const posix = (p) => p.split(sep).join('/');

const RULES = {
  // data → logic 白名单（勘测基线 5 条；修倒挂时必须从这里删，不得增）
  dataToLogic: [
    'src/data/cinematics.js -> src/logic/acts.js',
    'src/data/encounters.js -> src/logic/acts.js',
    'src/data/map-events.js -> src/logic/acts.js',
    'src/data/meta.js -> src/logic/acts.js',
    'src/data/roster.js -> src/logic/constants.js',
  ],
  // entities → ui 白名单（表现层原语 + 各 view 模块；新增非白名单边即失败）
  entitiesToUi: [
    'src/entities/Boss.js -> src/ui/Palette.js',
    'src/entities/Boss.js -> src/ui/camera-shake.js',
    'src/entities/Enemy.js -> src/ui/Palette.js',
    'src/entities/Enemy.js -> src/ui/variant-parts.js',
    'src/entities/ExpMote.js -> src/ui/Palette.js',
    'src/entities/Player.js -> src/ui/Palette.js',
    'src/entities/Player.js -> src/ui/kit-style.js',
    'src/entities/Projectile.js -> src/ui/Palette.js',
    'src/entities/Projectile.js -> src/ui/spell-fx.js',
    'src/entities/Shard.js -> src/ui/Palette.js',
    // 波 4 新增的 view 模块（实体绘制外置）
    'src/entities/Enemy.js -> src/ui/enemy-view.js',
    'src/entities/Boss.js -> src/ui/boss-view.js',
    'src/entities/Player.js -> src/ui/player-view.js',
  ],
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

// 提取 import / export-from / import() 的模块说明符（含多行 import）。
function importsOf(text) {
  const specs = [];
  const re = /(?:\bimport|\bexport)\s+(?:[^'"]*?\bfrom\s*)?['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(text)) !== null) specs.push(m[1]);
  const dyn = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = dyn.exec(text)) !== null) specs.push(m[1]);
  return specs;
}

function resolveSpec(file, spec) {
  if (spec === 'phaser') return 'phaser';
  if (!spec.startsWith('.')) return spec; // 外部包
  let p = resolve(dirname(file), spec);
  if (!p.endsWith('.js')) p += '.js';
  p = p.replace(/\\/g, '/');
  if (!p.startsWith(SRC.replace(/\\/g, '/'))) return null; // src 之外
  return p;
}

function category(abs) {
  if (abs === 'phaser' || !abs) return 'external';
  const rel = posix(relative(ROOT, abs));
  if (rel.startsWith('src/logic/')) return 'logic';
  if (rel.startsWith('src/data/')) return 'data';
  if (rel.startsWith('src/entities/')) return 'entities';
  if (rel.startsWith('src/scenes/')) return 'scenes';
  if (rel.startsWith('src/ui/')) return 'ui';
  if (rel.startsWith('src/audio/')) return 'audio';
  return 'other';
}

const files = walk(SRC);
const edges = new Map(); // file -> Set<file>
const violations = [];

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const from = posix(relative(ROOT, file));
  const fromCat = category(file);
  const set = new Set();
  for (const spec of importsOf(text)) {
    const target = resolveSpec(file, spec);
    if (!target) continue;
    const to = posix(relative(ROOT, target));
    const toCat = category(target);
    if (toCat !== 'external') set.add(target);

    const pair = from + ' -> ' + to;
    if (fromCat === 'logic') {
      if (toCat === 'external' && spec === 'phaser') violations.push(['R1', from, to, 'logic 不得依赖 Phaser']);
      if (['scenes', 'ui', 'entities', 'audio'].includes(toCat)) violations.push(['R1', from, to, 'logic 不得依赖 ' + toCat]);
    }
    if ((fromCat === 'ui' || fromCat === 'entities') && toCat === 'scenes') {
      violations.push(['R2', from, to, fromCat + ' 不得依赖 scenes']);
    }
    if (fromCat === 'data' && toCat === 'logic' && !RULES.dataToLogic.includes(pair)) {
      violations.push(['R3', from, to, 'data→logic 不在白名单']);
    }
    if (fromCat === 'entities' && toCat === 'ui' && !RULES.entitiesToUi.includes(pair)) {
      violations.push(['R5', from, to, 'entities→ui 不在白名单']);
    }
  }
  edges.set(file, set);
}

// 循环依赖：Tarjan SCC（只报 SCC 大小 > 1）
function findCycles() {
  let idx = 0;
  const index = new Map(), low = new Map(), onStack = new Set(), stack = [], cycles = [];
  const strong = (v) => {
    index.set(v, idx); low.set(v, idx); idx++;
    stack.push(v); onStack.add(v);
    for (const w of edges.get(v) ?? []) {
      if (!index.has(w)) { strong(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
    }
    if (low.get(v) === index.get(v)) {
      const comp = [];
      let w;
      do { w = stack.pop(); onStack.delete(w); comp.push(w); } while (w !== v);
      if (comp.length > 1) cycles.push(comp);
    }
  };
  for (const v of edges.keys()) if (!index.has(v)) strong(v);
  return cycles;
}

for (const comp of findCycles()) {
  violations.push(['R4', comp.map((f) => posix(relative(ROOT, f))).join(' <-> '), '', '循环依赖']);
}

if (violations.length) {
  console.error('架构检查失败：' + violations.length + ' 处违规\n');
  for (const [rule, a, b, why] of violations) {
    console.error(`  [${rule}] ${a}${b ? ' -> ' + b : ''}\n         ${why}`);
  }
  process.exit(1);
}

console.log(`架构检查通过：${files.length} 个文件，规则 R1-R5 全绿`);
