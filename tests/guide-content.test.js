// 灵宠墨宝引导：数据完整性 + 两份副本同步 + 新机制覆盖。
// 运行时读 src/data/guide-content.json，docs/新手指引/assets 是给技能包的同源副本。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import GUIDE from '../src/data/guide-content.json' with { type: 'json' };

const root = resolve(import.meta.dirname, '..');
const docsCopy = JSON.parse(readFileSync(resolve(root, 'docs/新手指引/assets/guide-content.json'), 'utf8'));

const HIGHLIGHTS = new Set(Object.keys(GUIDE.highlights ?? {}).concat(['敌人']));
const TRIGGER_EVENTS = new Set([
  'sceneEnter', 'sceneEnterAfterCutscene', 'levelUpChoice', 'nearEventPoint', 'levelReached',
  'afterPaint', 'eliteFirstSeen', 'encounterResult', 'variantFirstSeen', 'enemyWindup', 'evolutionOffered', 'shieldGained',
  // 断点存档与道具技能库新增的三种触发
  'skillGranted', 'skillCast', 'saveResume',
]);

describe('引导数据', () => {
  it('两份副本完全一致', () => {
    expect(docsCopy).toEqual(GUIDE);
  });

  it('每张卡都有 id、触发、宠物与至少一句文案', () => {
    for (const card of GUIDE.guides) {
      expect(card.id).toBeTruthy();
      expect(card.trigger?.scene).toBeTruthy();
      expect(TRIGGER_EVENTS.has(card.trigger?.event)).toBe(true);
      expect(card.pet?.emotion).toBeTruthy();
      const lines = card.lines ?? card.steps?.flatMap((s) => s.lines ?? []) ?? Object.values(card.linesByAct ?? {}).flat();
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.every((l) => typeof l === 'string' && l.length > 0)).toBe(true);
      if (card.highlight != null) expect(HIGHLIGHTS.has(card.highlight)).toBe(true);
    }
  });

  it('id 唯一，且没有未登记的场景', () => {
    const ids = GUIDE.guides.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const card of GUIDE.guides) expect(['LoadoutScene', 'BattleScene', 'IntermissionScene']).toContain(card.trigger.scene);
  });

  it('新机制都有引导：变体、敌人还手、护盾、进化连携、职业差异', () => {
    const byId = new Map(GUIDE.guides.map((c) => [c.id, c]));
    const text = (id) => JSON.stringify(byId.get(id)).toLowerCase();
    expect(text('G13')).toMatch(/迅捷|重甲|精英/);
    expect(text('G14')).toMatch(/前摇|预警|弹幕/);
    expect(text('G15')).toMatch(/进化|连携/);
    expect(text('G16')).toMatch(/护盾/);
    expect(text('G00')).toMatch(/疾风|烈焰|壁垒/);
  });

  it('meta.coverage 覆盖到新增卡片', () => {
    for (const id of ['G13', 'G14', 'G15', 'G16']) expect(GUIDE.meta.coverage).toContain(id);
    expect(GUIDE.meta.pet.name).toBe('墨宝');
  });
});
