// 本局会话：仅保存战斗/幕间共享的数据，不引用 Phaser 对象。
// 本局只认 chapter（幕 1..5）与 stage（场 1..7）两个游标，不再有 act 字段。
import { emptyDraft } from './build.js';
import { PLAYER } from '../data/roster.js';
import { CHARACTER_BUFFS, COMPASS_BUFFS } from './progression.js';

// 本命被动索引：三套职业各绑两条「已有被动」，开局直接套用，后续宝箱/罗盘
// 抽到本命被动时按双倍权重出现，让职业路线通过原有被动系统自然滚大。
const BUFF_BY_ID = new Map([...CHARACTER_BUFFS, ...COMPASS_BUFFS].map((buff) => [buff.id, buff]));

// 与人物宝箱 / 罗盘事件共用的适配器形状：被动只改自己认识的字段。
function baseKitStats() {
  return {
    maxHp: PLAYER.hp,
    hp: PLAYER.hp,
    speed: PLAYER.speed,
    pickupRadius: 38,
    iframeBonus: 0,
    shieldCap: 24,
    damageMul: 1,
    intervalMul: 1,
    cooldownMul: 1,
    hitBonus: 0,
    comboWindowMul: 1,
    expMul: 1,
  };
}

// 第一幕固定解封 6 格：第二行整排 + 第三行左二（与 roster.ACT1_CELLS 一致）。
export const ACT1_STARTING_CELLS = Object.freeze([4, 5, 6, 7, 9, 10]);

// 开局四张固定谐律形态：伤害 -18%，但第一幕就能摆出联组，让资格制从第一波起可读。
const sigil = (defId, variant = 'harmon') => Object.freeze({ kind: 'sigil', defId, variant });

// 开局法术套装：每套固定四张主槽，全部来自基础法术，不使用星陨/审判之锤等后期卡。
// 三套只改变第一幕的起手组合，解封格数与后续幕间构筑完全一致。
export const STARTING_KITS = Object.freeze([
  Object.freeze({
    id: 'bolt',
    name: '疾风',
    role: '疾行游走 · 高机动、快触发',
    tagline: '飞弹寒霜起手，烈焰圣光补位',
    // 本命被动：轻盈步伐（移速 +8%）+ 疾转轴心（触发间隔 ×0.92）。
    affinity: Object.freeze(['swift', 'haste']),
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
    role: '爆发连击 · 高伤害、长连击链',
    tagline: '烈焰喷涌压场，秘能汲取续命',
    // 本命被动：强能刻度（伤害 +12%）+ 延续之链（连击窗口 ×1.25）。
    affinity: Object.freeze(['might', 'chain']),
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
    role: '坚壁续航 · 高护盾、长无敌',
    tagline: '圣光壁垒护身，寒霜飞弹反打',
    // 本命被动：庇护印记（护盾上限 +10）+ 坚韧余辉（无敌 +0.15s）。
    affinity: Object.freeze(['aegis', 'tough']),
    // 壁垒开局直接带 6 点盾，让「护盾上限」在第一条命就看得见。
    startShield: 6,
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

// 把本命被动套进统一适配器；未知 id 静默跳过（老存档/拼写错误的 kit 不炸）。
function applyAffinity(kit) {
  const stats = baseKitStats();
  for (const id of kit.affinity ?? []) {
    const buff = BUFF_BY_ID.get(id);
    if (buff) buff.apply(stats, 0);
  }
  return stats;
}

export function createRun(seed = 'sigil', kitId = 'bolt') {
  const kit = getKit(kitId);
  const draft = emptyDraft(1);
  draft.unlocked = [...ACT1_STARTING_CELLS];
  draft.slots = {};
  for (const [cellId, slot] of Object.entries(kit.slots)) {
    draft.slots[cellId] = { ...slot };
  }
  const stats = applyAffinity(kit);
  // 职业数据全部落在 run 上：战斗场景只 Read，宝箱/罗盘抽到本命被动时读 affinity 加权。
  const characterStats = {
    maxHp: stats.maxHp,
    hp: stats.hp,
    speedMult: stats.speed / PLAYER.speed,
    pickupBonus: stats.pickupRadius - 38,
    iframesBonus: stats.iframeBonus,
    shieldCap: stats.shieldCap,
    shield: kit.startShield ?? 0,
  };
  const compassBuffs = {
    damageMul: stats.damageMul,
    intervalMul: stats.intervalMul,
    cooldownMul: stats.cooldownMul,
    hitBonus: stats.hitBonus,
    comboWindowMul: stats.comboWindowMul,
    expMul: stats.expMul,
  };
  return {
    seed: String(seed), chapter: 1, stage: 1, shards: 0, draft, hand: {}, runeCosts: {}, reports: [],
    kitId: kit.id,
    kitAffinity: [...(kit.affinity ?? [])],
    characterStats,
    compassBuffs,
    // 法术进化：{ defId: evoId }，局内持久；放置新卡时按这张表补 slot.evo。
    evolutions: {},
    guideSeen: {},
    // 道具技能库：只来自升级三选一玩家所选卡，每场重置；skillStage 记录库归属的场。
    skillLibrary: [],
    skillStage: 1,
  };
}

// 幕间报告按「幕」去重：同一幕内的换场不重复记录，进下一幕才写第二条。
// 报告里同时带 chapter 与 stage（stage 是记账时的场次，便于复盘）。
export function recordAct(run, report) {
  if (run.reports.some(r => r.chapter === run.chapter)) return false;
  run.reports.push({ ...report, chapter: run.chapter, stage: run.stage });
  return true;
}
