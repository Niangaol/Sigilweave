// 法术变体：同一张符印的「锐 / 谐」两种取向，外加兜底的标准形态。
// 锐（sharp）：伤害 +30%，但失去联组资格。
// 谐（harmon）：伤害 -18%，可参与联组。
// 标准（base）：旧数据与未知变体的兜底，同样不参与联组。
// 强力法术（星陨 / 陨星裁决 / 地裂之颚 / 审判之锤）只有标准形态，永远不参与联组。
import { SIGIL_DEFS } from './cards.js';

export const VARIANT_IDS = Object.freeze(['base', 'sharp', 'harmon']);

// 永不联组的强力法术。新增终局法术时只改这张清单。
export const COMBO_LOCKED = Object.freeze([
  'starfall', 'meteor_judgment', 'quake_maw', 'judgment_hammer',
]);

// 抽卡权重：标准最常见，锐/谐各占两成多。总和必须是 1。
export const VARIANT_WEIGHTS = Object.freeze({
  base: 0.45, sharp: 0.275, harmon: 0.275,
});

const MUL = Object.freeze({ base: 1, sharp: 1.3, harmon: 0.82 });

const DESC = Object.freeze({
  base: '标准形态：伤害居中，不参与联组。',
  sharp: '锐化形态：伤害 +30%，但失去联组资格。',
  harmon: '谐律形态：伤害 -18%，可参与联组。',
});

const LOCKED_DESC = '终局法术：伤害高，永不参与联组。';

function baseName(defId) {
  return SIGIL_DEFS[defId]?.name ?? defId;
}

function variantsOf(defId) {
  const name = baseName(defId);
  if (COMBO_LOCKED.includes(defId)) {
    return {
      base: { name, desc: LOCKED_DESC, damageMul: 1, combo: false },
    };
  }
  return {
    base: { name, desc: DESC.base, damageMul: MUL.base, combo: false },
    sharp: { name: name + '·锐', desc: DESC.sharp, damageMul: MUL.sharp, combo: false },
    harmon: { name: name + '·谐', desc: DESC.harmon, damageMul: MUL.harmon, combo: true },
  };
}

export const VARIANT_DEFS = Object.freeze(
  Object.fromEntries(Object.keys(SIGIL_DEFS).map((defId) => [defId, Object.freeze(variantsOf(defId))])),
);

// 未知法术 / 未知变体一律回退标准形态，构筑与存档都不会因为脏数据炸掉。
export function variantOf(defId, variantId) {
  const table = VARIANT_DEFS[defId];
  if (!table) return { name: defId, desc: '', damageMul: 1, combo: false };
  return table[variantId] ?? table.base;
}

// 这一格的法术能不能参与联组：必须是符印、有合法变体、且该变体 combo=true。
export function slotComboEligible(slot) {
  if (!slot || slot.kind !== 'sigil' || typeof slot.defId !== 'string') return false;
  return variantOf(slot.defId, slot.variant ?? 'base').combo === true;
}

// 抽卡时摇一个变体：强力法术恒标准，其余按权重。rng 传 Rng 实例。
export function rollVariant(rng, defId) {
  if (!VARIANT_DEFS[defId] || COMBO_LOCKED.includes(defId)) return 'base';
  const r = rng.next();
  let acc = 0;
  for (const id of VARIANT_IDS) {
    acc += VARIANT_WEIGHTS[id];
    if (r < acc) return id;
  }
  return 'base';
}
