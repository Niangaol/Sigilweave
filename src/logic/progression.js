// 等级、人物本体与罗盘本体成长；不依赖场景，也不直接发放选牌奖励。
const validLevel = (level) => Number.isSafeInteger(level) && level >= 1;
const finiteNonnegative = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const numberOr = (value, fallback) => finiteNonnegative(value) ? value : fallback;

export function expNeeded(level) {
  const L = validLevel(level) ? level : 1;
  return Math.round(6 * L ** 1.15) + 4;
}

export function createProgression() {
  return { level: 1, exp: 0 };
}

export function grantExp(state, amount, expMul = 1) {
  if (!object(state) || !validLevel(state.level) || !finiteNonnegative(state.exp)
    || !finiteNonnegative(amount) || !finiteNonnegative(expMul)) return { ok: false };
  const awarded = Math.ceil(amount * expMul);
  if (!Number.isSafeInteger(awarded) || !Number.isSafeInteger(state.exp + awarded)) return { ok: false };
  // 先在局部计算，非法输入与不可写状态不会留下半次升级。
  let level = state.level;
  let exp = state.exp + awarded;
  while (exp >= expNeeded(level)) {
    exp -= expNeeded(level);
    level++;
    if (!validLevel(level)) return { ok: false };
  }
  const fields = ['level', 'exp'].map((key) => Object.getOwnPropertyDescriptor(state, key));
  if (!fields.every((d) => d && 'value' in d && d.writable)) return { ok: false };
  const levelsGained = level - state.level;
  state.level = level;
  state.exp = exp;
  return { ok: true, levelsGained };
}

export function levelStats(level) {
  const L = validLevel(level) ? level : 1;
  return { hpMul: 1 + 0.16 * L, damageMul: 1 + 0.08 * L, speedMul: 1 + Math.min(0.3, 0.02 * L) };
}

// 七幕大 Boss 触发等级：每幕 +3。等级与经验跨幕保留，所以后四幕的入场等级本来就高。
export const MAJOR_BOSS_LEVEL = Object.freeze({ 1: 5, 2: 8, 3: 11, 4: 14, 5: 17, 6: 20, 7: 23 });

export function shouldTriggerMajorBoss(act, level) {
  return Number.isInteger(act) && act >= 1 && act <= 7 && validLevel(level) && level >= MAJOR_BOSS_LEVEL[act];
}

// 局外等级：0 表示未点亮，只走基础增益；1-5 走「残响祭坛」的追加增益。
const MAX_META_LEVEL = 5;
const metaLevelOf = (level) => (Number.isSafeInteger(level) && level > 0 ? Math.min(MAX_META_LEVEL, level) : 0);

function buff(id, name, desc, update, extra) {
  return {
    id,
    name,
    desc,
    // level 缺省为 0，保证所有旧调用点的行为与数值完全不变。
    apply(target, level = 0) {
      if (!object(target)) return desc;
      const lv = metaLevelOf(level);
      update(target);
      if (lv > 0 && typeof extra === 'function') extra(target, lv);
      return desc;
    },
  };
}

export const CHARACTER_BUFFS = [
  buff('life', '丰沛生命', '生命上限 +20，并恢复 20 点生命。', (t) => {
    const maxHp = numberOr(t.maxHp, 0) + 20;
    const hp = Math.min(maxHp, numberOr(t.hp, 0) + 20);
    if (Number.isFinite(maxHp) && Number.isFinite(hp)) { t.maxHp = maxHp; t.hp = hp; }
  }, (t, lv) => {
    const maxHp = numberOr(t.maxHp, 0) + 2 * lv;
    const hp = Math.min(maxHp, numberOr(t.hp, 0) + 2 * lv);
    if (Number.isFinite(maxHp) && Number.isFinite(hp)) { t.maxHp = maxHp; t.hp = hp; }
  }),
  buff('swift', '轻盈步伐', '移动速度提高 8%。', (t) => { t.speed = numberOr(t.speed, 0) * 1.08; },
    (t, lv) => { t.speed = numberOr(t.speed, 0) * (1 + 0.008 * lv); }),
  buff('magnet', '引晶之手', '拾取半径 +12。', (t) => { t.pickupRadius = numberOr(t.pickupRadius, 0) + 12; },
    (t, lv) => { t.pickupRadius = numberOr(t.pickupRadius, 0) + 1.5 * lv; }),
  buff('tough', '坚韧余辉', '受伤无敌时间增加 0.15 秒。', (t) => { t.iframeBonus = numberOr(t.iframeBonus, 0) + 0.15; },
    (t, lv) => { t.iframeBonus = numberOr(t.iframeBonus, 0) + 0.02 * lv; }),
  buff('aegis', '庇护印记', '护盾上限 +10。', (t) => { t.shieldCap = numberOr(t.shieldCap, 0) + 10; },
    (t, lv) => { t.shieldCap = numberOr(t.shieldCap, 0) + 1.5 * lv; }),
];

export const COMPASS_BUFFS = [
  buff('might', '强能刻度', '罗盘伤害倍率 +0.12，上限 1.6。', (c) => { c.damageMul = Math.min(1.6, numberOr(c.damageMul, 1) + 0.12); },
    (c, lv) => { c.damageMul = Math.min(1.6, numberOr(c.damageMul, 1) + 0.015 * lv); }),
  buff('haste', '疾转轴心', '触发间隔乘以 0.92，最低 0.55。', (c) => { c.intervalMul = Math.max(0.55, numberOr(c.intervalMul, 1) * 0.92); },
    (c, lv) => { c.intervalMul = Math.max(0.55, numberOr(c.intervalMul, 1) * (1 - 0.006 * lv)); }),
  buff('chill', '冷凝回路', '冷却时间乘以 0.90，最低 0.55。', (c) => { c.cooldownMul = Math.max(0.55, numberOr(c.cooldownMul, 1) * 0.90); },
    (c, lv) => { c.cooldownMul = Math.max(0.55, numberOr(c.cooldownMul, 1) * (1 - 0.006 * lv)); }),
  buff('wide', '扩域环带', '命中范围 +6，累计上限 +18。', (c) => { c.hitBonus = Math.min(18, numberOr(c.hitBonus, 0) + 6); },
    (c, lv) => { c.hitBonus = Math.min(18, numberOr(c.hitBonus, 0) + 0.8 * lv); }),
  buff('chain', '延续之链', '连击窗口乘以 1.25，上限 2。', (c) => { c.comboWindowMul = Math.min(2, numberOr(c.comboWindowMul, 1) * 1.25); },
    (c, lv) => { c.comboWindowMul = Math.min(2, numberOr(c.comboWindowMul, 1) * (1 + 0.04 * lv)); }),
  buff('greed', '求知棱镜', '经验倍率 +0.15，上限 1.6。', (c) => { c.expMul = Math.min(1.6, numberOr(c.expMul, 1) + 0.15); },
    (c, lv) => { c.expMul = Math.min(1.6, numberOr(c.expMul, 1) + 0.02 * lv); }),
];

// rng 是显式注入的随机源；不偷偷回退到 Math.random，便于复盘。
export function rollBuff(pool, rng) {
  if (!Array.isArray(pool) || pool.length === 0 || typeof rng !== 'function') return null;
  const value = rng();
  if (!Number.isFinite(value) || value < 0 || value >= 1) return null;
  return pool[Math.floor(value * pool.length)] ?? null;
}
