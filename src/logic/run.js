// 本局会话：仅保存战斗/幕间共享的数据，不引用 Phaser 对象。
import { emptyDraft } from './build.js';

export function createRun(seed = 'sigil') {
  const draft = emptyDraft(1);
  draft.unlocked = [4, 5, 6, 7, 9, 10];
  draft.slots = {
    4: { kind: 'sigil', defId: 'frost_arrow' },
    5: { kind: 'sigil', defId: 'arcane_bolt' },
    6: { kind: 'sigil', defId: 'flame_burst' },
    9: { kind: 'sigil', defId: 'holy_ward' },
  };
  return { seed: String(seed), act: 1, shards: 0, draft, hand: {}, runeCosts: {}, reports: [] };
}

export function recordAct(run, report) {
  if (run.reports.some(r => r.act === run.act)) return false;
  run.reports.push({ ...report, act: run.act });
  return true;
}
