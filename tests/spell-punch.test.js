import { describe, it, expect } from 'vitest';
import { SPELL_PUNCH, DEFAULT_PUNCH, punchFor, shouldPunch } from '../src/ui/spell-punch.js';
import { FX_DEF_IDS } from '../src/ui/spell-fx.js';

describe('命中重量表', () => {
  it('16 个法术每个都有重量，键与 FX_DEF_IDS 对齐', () => {
    expect(Object.keys(SPELL_PUNCH).sort()).toEqual([...FX_DEF_IDS].sort());
  });

  it('三档重量单调：轻 < 中 < 重（震屏强度与顿帧）', () => {
    const light = punchFor('frost_arrow');
    const mid = punchFor('flame_burst');
    const heavy = punchFor('meteor_judgment');
    expect(light.amp).toBeLessThan(mid.amp);
    expect(mid.amp).toBeLessThan(heavy.amp);
    expect(light.stopMs).toBe(0);
    expect(mid.stopMs).toBe(0);
    expect(heavy.stopMs).toBeGreaterThan(30);
  });

  it('数值都在安全范围：amp<=0.012、stopMs<=90、gapMs>=50', () => {
    for (const [id, s] of Object.entries(SPELL_PUNCH)) {
      expect(s.amp, id).toBeGreaterThan(0);
      expect(s.amp, id).toBeLessThanOrEqual(0.012);
      expect(s.ms, id).toBeGreaterThan(0);
      expect(s.stopMs, id).toBeGreaterThanOrEqual(0);
      expect(s.stopMs, id).toBeLessThanOrEqual(90);
      expect(s.gapMs, id).toBeGreaterThanOrEqual(50);
    }
  });

  it('unknown defId 走默认档，不炸', () => {
    expect(punchFor('nope')).toBe(DEFAULT_PUNCH);
    expect(punchFor(undefined)).toBe(DEFAULT_PUNCH);
  });

  it('shouldPunch：gapMs 内第二次返回 false，过了才放行', () => {
    const spec = punchFor('meteor_judgment');
    expect(shouldPunch('meteor_judgment', 1000, 1000 - spec.gapMs)).toBe(true);
    expect(shouldPunch('meteor_judgment', 1000, 1000 - spec.gapMs + 1)).toBe(false);
    expect(shouldPunch('meteor_judgment', 0, -99999)).toBe(true);
    expect(shouldPunch('meteor_judgment', NaN, 0)).toBe(false);
  });
});
