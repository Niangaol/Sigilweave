// 随机配置模糊测试：随机构筑、间隔、起点、暂停交错，寻找异常与 NaN。
import { createGrid, rebuildDerived } from '../src/logic/grid.js';
import { SigilEngine } from '../src/logic/engine.js';
import { buildComboCatalog } from '../src/logic/combo.js';
import { applyDraft, emptyDraft, unlockToTarget } from '../src/logic/build.js';

const combos = buildComboCatalog(['duo', 'line3', 'elbow3', 'ring4']);
const ROUNDS = Number(process.env.FUZZ_ROUNDS ?? 300);
const SIGILS = ['arcane_bolt', 'frost_arrow', 'flame_burst', 'holy_ward', 'mana_siphon', 'judgment_hammer', 'thorn_vine', 'starfall'];
const AUX = ['resonance_stone', 'slow_field', 'shard_resonance', 'sacrifice', 'hourglass', 'wide_runes'];
const RUNES = ['forge', 'relay', 'sever', 'silence'];
const OATHS = [null, 'lone_star', 'watcher', 'martyr'];

let seed = 12345;
const rnd = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const finiteDeep = (value) => {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(finiteDeep);
  if (value && typeof value === 'object') return Object.values(value).every(finiteDeep);
  return true;
};

let valid = 0, invalid = 0, events = 0, pausedChecks = 0;
const failures = [];
for (let round = 0; round < ROUNDS; round++) {
  const act = int(1, 3);
  const draft = emptyDraft(act);
  // unlockToTarget 作用在法阵上，再把解封结果随机裁成子集
  const base = createGrid();
  unlockToTarget(base, [1, 6, 12, 16][int(0, 3)]);
  const all = base.unlockedIds();
  draft.unlocked = all.filter(() => rnd() < 0.85);
  if (!draft.unlocked.length) draft.unlocked = [all[0] ?? 5];
  const layout = int(0, 2);
  for (const id of draft.unlocked) {
    if (layout === 1 && (Math.floor(id / 4) + (id % 4)) % 2) continue;
    if (layout === 2 && ![5, 6, 9, 10, 4, 7].includes(id)) continue;
    if (rnd() < 0.75) {
      const aux = rnd() < 0.2;
      draft.slots[id] = aux ? { kind: 'auxiliary', defId: pick(AUX) } : { kind: 'sigil', defId: pick(SIGILS) };
      if (aux && ['sacrifice', 'hourglass', 'wide_runes'].includes(draft.slots[id].defId)) {
        const nbs = [id - 4, id + 4, id - 1, id + 1].filter(n => draft.unlocked.includes(n));
        if (nbs.length) draft.auxTargets[id] = pick(nbs);
      }
    }
    if (rnd() < 0.25) draft.runes[id] = [pick(RUNES), rnd() < 0.3 ? pick(RUNES) : null];
    if (rnd() < 0.2) {
      const dirs = ['up', 'down', 'left', 'right'];
      const kept = dirs.filter(() => rnd() < 0.6);
      const sever = draft.runes[id]?.includes('sever');
      if (kept.length || sever) draft.exits[id] = kept;
    }
  }
  draft.oath = pick(OATHS);
  const grid = createGrid();
  const applied = applyDraft(grid, draft);
  if (!applied.ok) { invalid++; continue; }
  valid++;
  const interval = 800 + Math.round(rnd() * 2200);
  rebuildDerived(grid, interval);
  const starts = [];
  for (const id of draft.unlocked) { if (starts.length < int(1, 4) && !starts.includes(id)) starts.push(id); }
  if (!starts.length) { starts.push(draft.unlocked[0] ?? 5); }
  let evCount = 0;
  try {
    const engine = new SigilEngine({ seed: 'fuzz-' + round, grid, startCells: starts, combos, onEvent: () => { evCount++; } });
    engine.start();
    let t = 0;
    const duration = int(1000, 60000);
    while (t < duration) {
      const step = Math.min(duration - t, int(50, 4000));
      if (rnd() < 0.25) {
        engine.paused = true;
        const before = engine.now;
        engine.advance(step);
        if (engine.now !== before) failures.push({ round, why: 'paused clock moved', before, after: engine.now });
        pausedChecks++;
        engine.paused = false;
      }
      engine.advance(step);
      t += step;
    }
    const s = engine.summary(engine.now);
    events += evCount;
    if (!Number.isFinite(engine.now)) failures.push({ round, why: 'now not finite' });
    if (!finiteDeep(s)) failures.push({ round, why: 'summary has non-finite', summary: s });
    if (s.triggers < 0 || s.blocked < 0 || s.combos < 0) failures.push({ round, why: 'negative stat' });
    if (!engine.stats.perCellTriggers.every(Number.isInteger)) failures.push({ round, why: 'non-int perCell' });
  } catch (error) {
    failures.push({ round, why: 'throw', message: error.message });
  }
  if (failures.length > 3) break;
}

console.log(JSON.stringify({ rounds: ROUNDS, valid, invalid, pausedChecks, events, failures }, null, 2));
if (failures.length) process.exitCode = 1;
