import { describe, it, expect } from 'vitest';
import { applyPassiveToCharacter, applyPassiveToCompass, metaPassiveLabel } from '../src/logic/meta.js';
import { CHARACTER_BUFFS, COMPASS_BUFFS } from '../src/logic/progression.js';

const byId = (pool, id) => pool.find(b => b.id === id);

describe('场景侧应用助手', () => {
  it('人物被动按等级加成并返回基础描述', () => {
    const adapter = { maxHp: 100, hp: 60, speed: 100, pickupRadius: 40, iframeBonus: 0, shieldCap: 30 };
    const desc = applyPassiveToCharacter(byId(CHARACTER_BUFFS, 'life'), adapter, 3);
    expect(adapter.maxHp).toBe(126); expect(adapter.hp).toBe(86);
    expect(desc).toContain('生命上限');
    expect(metaPassiveLabel(3)).toBe('（残响 3）');
    expect(metaPassiveLabel(0)).toBe('');
  });
  it('罗盘被动按等级加成', () => {
    const compass = { damageMul: 1, intervalMul: 1, cooldownMul: 1, hitBonus: 0, comboWindowMul: 1, expMul: 1 };
    applyPassiveToCompass(byId(COMPASS_BUFFS, 'might'), compass, 5);
    expect(compass.damageMul).toBeCloseTo(1.195, 6);
    applyPassiveToCompass(byId(COMPASS_BUFFS, 'haste'), compass, 0);
    expect(compass.intervalMul).toBeCloseTo(0.92, 6);
  });
  it('缺省等级等价于 0，buff 为空时安全', () => {
    const adapter = { maxHp: 100, hp: 60 };
    expect(applyPassiveToCharacter(byId(CHARACTER_BUFFS, 'life'), adapter)).toContain('生命上限');
    expect(adapter.maxHp).toBe(120);
    expect(applyPassiveToCharacter(null, adapter, 3)).toBe('');
  });
});
