// 敌人招式对玩家的硬控配置（纯数据，零 Phaser）。
//
// 一条配置 = 某种敌人的某个攻击途径命中玩家时挂什么控制：
//   { kind: 'stun' | 'root' | 'slow' | 'knock', ms, factor?, force? }
// - stun / root：ms 之内玩家无法移动（stun 另带表现区分）
// - slow：ms 之内移动速度 × factor
// - knock：沿「敌人 → 玩家」方向立即位移 force 像素（并附带 ms 的僵直，避免贴脸连推）
// 同一敌人多个途径可各配一条；没配的途径不挂控制。
export const CONTROL_DEFS = Object.freeze({
  stun: Object.freeze({ name: '眩晕', color: 0xfff0a0 }),
  root: Object.freeze({ name: '定身', color: 0x9fe8ff }),
  slow: Object.freeze({ name: '迟滞', color: 0xa88bd8 }),
  knock: Object.freeze({ name: '击退', color: 0xff8a4d }),
});

// 每个 defId 只配它「真有这招」的途径：
//   stomp = 践踏/砸地落点结算；melee = 近战扇形；shot = 远程弹幕（目前只有全场统一的迟滞）
export const ENEMY_CONTROL = Object.freeze({
  // 大型怪砸地：眩晕，逼走位
  stitch_abomination: Object.freeze({ stomp: { kind: 'stun', ms: 700 } }),
  anvil_tyrant: Object.freeze({ stomp: { kind: 'stun', ms: 900 } }),
  stone_gargoyle: Object.freeze({ stomp: { kind: 'knock', ms: 240, force: 110 } }),
  // 冲锋怪：击退，撞开玩家的阵位
  knight: Object.freeze({ melee: { kind: 'knock', ms: 240, force: 100 } }),
  brass_warden: Object.freeze({ melee: { kind: 'knock', ms: 240, force: 100 } }),
  index_hound: Object.freeze({ melee: { kind: 'knock', ms: 260, force: 120 } }),
  stardust_knight: Object.freeze({ melee: { kind: 'knock', ms: 240, force: 100 } }),
  // 贴脸扑咬：定身
  corpse: Object.freeze({ melee: { kind: 'root', ms: 800 } }),
  rune_spider: Object.freeze({ melee: { kind: 'root', ms: 700 } }),
  // 远程/法系精英：迟滞，让玩家躲弹变难
  oath_bishop: Object.freeze({ shot: { kind: 'slow', ms: 1400, factor: 0.55 } }),
  eclipse_priest: Object.freeze({ shot: { kind: 'slow', ms: 1600, factor: 0.50 } }),
  crystal_dryad: Object.freeze({ shot: { kind: 'slow', ms: 1000, factor: 0.65 } }),
  verdict_wraith: Object.freeze({ shot: { kind: 'slow', ms: 1200, factor: 0.60 } }),
  scale_arbiter: Object.freeze({ shot: { kind: 'slow', ms: 1400, factor: 0.55 } }),
  shackle_guard: Object.freeze({ shot: { kind: 'root', ms: 600 } }),
});

// 接触（身体撞上）统一给一次短击退 + 240ms 僵直，这是「接触不再自毁」的配套。
export const DEFAULT_CONTACT_CONTROL = Object.freeze({ kind: 'knock', ms: 240, force: 36 });

// 远程弹幕目前不带来源 defId（hostile.js 的 hit 只有 x/y/damage），
// 所以全场敌方弹幕统一挂一条轻迟滞，精英的专属配置留给日后带来源信息的版本。
export const DEFAULT_SHOT_CONTROL = Object.freeze({ kind: 'slow', ms: 900, factor: 0.7 });

export function controlFor(defId, path) {
  const def = ENEMY_CONTROL[defId];
  if (!def) return null;
  return def[path] ?? null;
}
