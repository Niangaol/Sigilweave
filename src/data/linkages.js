// 专属连携：每张可联组法术只认一个搭档。组内同时出现两格配对的法术时，
// 联组追加伤害之外再额外打一笔「连携伤害」，并播自己的短词。
// 强力法术（COMBO_LOCKED）本来就不能联组，因此不参与这里的配对。
export const LINKAGES = Object.freeze([
  { id: 'frostfire', a: 'frost_arrow', b: 'flame_burst', name: '霜火', desc: '冰与火在联组里互相引爆', bonus: 0.5 },
  { id: 'thunderprison', a: 'chain_lightning', b: 'thunder_storm', name: '雷狱', desc: '连锁与雷暴同组时，落点持续放电', bonus: 0.45 },
  { id: 'voidpierce', a: 'pierce_lance', b: 'void_lance', name: '虚空贯穿', desc: '贯穿与虚空同组，直线上的敌人一起被撕开', bonus: 0.45 },
  { id: 'resonant_soul', a: 'echo_sigil', b: 'soul_echo', name: '回响之魂', desc: '回声与魂灵同组，两侧扇区一起鸣响', bonus: 0.4 },
  { id: 'sunbolt', a: 'arcane_bolt', b: 'sunflare', name: '秘阳', desc: '奥术与日轮同组，飞弹带上一圈日冕', bonus: 0.35 },
  { id: 'sanctum_ward', a: 'holy_ward', b: 'sanctum', name: '圣所', desc: '壁垒与圣所同组，光域重叠', bonus: 0.35 },
  { id: 'frostring', a: 'aegis_ring', b: 'glacier', name: '冰环', desc: '圣环与冰川同组，环上结满冰刺', bonus: 0.35 },
  { id: 'siphon_reap', a: 'mana_siphon', b: 'soul_lance', name: '汲魂', desc: '汲取与噬魂同组，命中回一次血', bonus: 0.4 },
  { id: 'thorn_maul', a: 'thorn_vine', b: 'bramble_maul', name: '荆棘巨兽', desc: '藤蔓与巨槌同组，地面炸出荆棘', bonus: 0.4 },
  { id: 'frostdeluge', a: 'ember_fan', b: 'frost_nova', name: '霜扇', desc: '余烬与霜华同组，扇形里下起冰雨', bonus: 0.4 },
]);

const BY_KEY = new Map();
for (const item of LINKAGES) BY_KEY.set(linkageKeyOf(item.a, item.b), item);

export function linkageKeyOf(a, b) {
  return [a, b].sort().join('|');
}

export function linkageFor(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return null;
  return BY_KEY.get(linkageKeyOf(a, b)) ?? null;
}
