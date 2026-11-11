import { describe, it, expect } from 'vitest';
import { defaultMeta, sanitizeMeta, loadMeta, saveMeta, resetMeta, metaLevel, levelCap, upgradeCost, canUpgrade, upgradePassive, STORAGE_KEY } from '../src/logic/meta.js';

const memStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

describe('局外存档', () => {
  it('默认档结构完整，等级全 0', () => {
    const s = defaultMeta();
    expect(s.v).toBe(1); expect(s.resonance).toBe(0);
    expect(Object.keys(s.levels)).toHaveLength(11);
    expect(Object.values(s.levels).every(v => v === 0)).toBe(true);
    expect(s.milestones).toEqual([]);
  });
  it('坏档一律回落默认，不抛异常', () => {
    for (const bad of ['', 'null', '{', '[]', '{"levels":"x"}', '{"resonance":-5}', '{"milestones":["boss-1","boss-1","nope"]}', 42, undefined]) {
      const s = sanitizeMeta(bad);
      expect(s.v).toBe(1);
      expect(s.resonance).toBeGreaterThanOrEqual(0);
      expect(new Set(s.milestones).size).toBe(s.milestones.length);
    }
  });
  it('等级夹到 0..5，未知 id 丢弃', () => {
    const s = sanitizeMeta(JSON.stringify({ levels: { life: 9, swift: -2, hack: 3 }, milestones: ['boss-1', 'boss-3'] }));
    expect(s.levels.life).toBe(5); expect(s.levels.swift).toBe(0);
    expect('hack' in s.levels).toBe(false);
    expect(metaLevel(s, 'life')).toBe(5); expect(metaLevel(s, 'hack')).toBe(0);
  });
  it('上限随 boss-3/5/7 首杀提升且取最大', () => {
    const s = defaultMeta();
    expect(levelCap(s)).toBe(2);
    s.milestones = ['boss-3']; expect(levelCap(s)).toBe(3);
    s.milestones = ['boss-3', 'boss-7']; expect(levelCap(s)).toBe(5);
    s.milestones = ['boss-5']; expect(levelCap(s)).toBe(4);
  });
  it('升级消耗按当前等级取，满级返回 null', () => {
    const s = defaultMeta();
    expect(upgradeCost(s, 'life')).toBe(10);
    s.levels.life = 4; expect(upgradeCost(s, 'life')).toBe(120);
    s.levels.life = 5; expect(upgradeCost(s, 'life')).toBe(null);
    expect(upgradeCost(s, 'hack')).toBe(null);
  });
  it('残响不足 / 未解锁上限 / 已满级分别给原因且不扣钱', () => {
    const s = defaultMeta();
    s.resonance = 0;
    expect(canUpgrade(s, 'life').reason).toBe('cost');
    s.resonance = 999; s.levels.life = 2;
    expect(canUpgrade(s, 'life').reason).toBe('maxcap');
    s.milestones = ['boss-3', 'boss-5', 'boss-7']; s.levels.life = 5;
    expect(canUpgrade(s, 'life').reason).toBe('maxlevel');
    expect(canUpgrade(s, 'hack').reason).toBe('unknown');
    expect(s.resonance).toBe(999);
  });
  it('升级成功才扣残响，且返回新对象', () => {
    const s = defaultMeta(); s.resonance = 30; s.milestones = ['boss-3'];
    const r = upgradePassive(s, 'life');
    expect(r.ok).toBe(true);
    expect(r.save.resonance).toBe(20); expect(r.save.levels.life).toBe(1);
    expect(s.resonance).toBe(30); expect(s.levels.life).toBe(0);
    s.resonance = 0;
    const bad = upgradePassive(s, 'life');
    expect(bad.ok).toBe(false); expect(bad.save).toBe(s);
  });
  it('读写走同一 key，坏 JSON 读成默认档', () => {
    const st = memStorage();
    saveMeta(defaultMeta(), st);
    expect(JSON.parse(st.getItem(STORAGE_KEY)).v).toBe(1);
    st.setItem(STORAGE_KEY, '{oops');
    expect(loadMeta(st).resonance).toBe(0);
    resetMeta(st);
    expect(st.getItem(STORAGE_KEY)).toBe(null);
  });
  it('storage 抛错也不崩', () => {
    const boom = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
    expect(() => loadMeta(boom)).not.toThrow();
    expect(() => saveMeta(defaultMeta(), boom)).not.toThrow();
    expect(() => resetMeta(boom)).not.toThrow();
  });
});
