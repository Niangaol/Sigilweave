// 本局会话：仅保存战斗/幕间共享的数据，不引用 Phaser 对象。
import { emptyDraft } from './build.js';

// 第一幕固定解封 6 格：第二行整排 + 第三行左二（与 roster.ACT1_CELLS 一致）。
export const ACT1_STARTING_CELLS = Object.freeze([4, 5, 6, 7, 9, 10]);

const sigil = defId => Object.freeze({ kind: 'sigil', defId });

// 开局法术套装：每套固定四张主槽，全部来自基础法术，不使用星陨/审判之锤等后期卡。
// 三套只改变第一幕的起手组合，解封格数与后续幕间构筑完全一致。
export const STARTING_KITS = Object.freeze([
  Object.freeze({
    id: 'bolt',
    name: '疾风',
    tagline: '飞弹寒霜起手，烈焰圣光补位',
    slots: Object.freeze({
      4: sigil('frost_arrow'),
      5: sigil('arcane_bolt'),
      6: sigil('flame_burst'),
      9: sigil('holy_ward'),
    }),
  }),
  Object.freeze({
    id: 'flame',
    name: '烈焰',
    tagline: '烈焰喷涌压场，秘能汲取续命',
    slots: Object.freeze({
      4: sigil('flame_burst'),
      5: sigil('mana_siphon'),
      6: sigil('thorn_vine'),
      9: sigil('arcane_bolt'),
    }),
  }),
  Object.freeze({
    id: 'ward',
    name: '壁垒',
    tagline: '圣光壁垒护身，寒霜飞弹反打',
    slots: Object.freeze({
      4: sigil('holy_ward'),
      5: sigil('frost_arrow'),
      6: sigil('arcane_bolt'),
      9: sigil('mana_siphon'),
    }),
  }),
]);

// 未知/省略的 id 一律回退第一套，选包与测试都不需要先判断合法性。
export function getKit(id) {
  return STARTING_KITS.find(kit => kit.id === id) ?? STARTING_KITS[0];
}

export function createRun(seed = 'sigil', kitId = 'bolt') {
  const kit = getKit(kitId);
  const draft = emptyDraft(1);
  draft.unlocked = [...ACT1_STARTING_CELLS];
  draft.slots = {};
  for (const [cellId, slot] of Object.entries(kit.slots)) {
    draft.slots[cellId] = { ...slot };
  }
  return { seed: String(seed), act: 1, shards: 0, draft, hand: {}, runeCosts: {}, reports: [] };
}

export function recordAct(run, report) {
  if (run.reports.some(r => r.act === run.act)) return false;
  run.reports.push({ ...report, act: run.act });
  return true;
}
