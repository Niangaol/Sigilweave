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
  // 反硬控（A6）：被定身/被撞飞时提示「右键冲刺能挣开」；眩晕不给这条（见 G17 文案）
  'PLAYER_CONTROLED',
  // 编队标记（C5）：第一次刷出带三角标记的编队成员。与 variantFirstSeen 分开，
  // 因为编队成员不一定带变体，复用会让「这张卡在什么时刻出现」在数据里说谎。
  'formationFirstSeen',
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
    expect(text('G17')).toMatch(/右键|冲刺/);
    expect(text('G00')).toMatch(/疾风|烈焰|壁垒/);
  });

  it('meta.coverage 覆盖到新增卡片', () => {
    // B7 追加 G18、C5 追加 G19（spec 授权改这条 coverage 断言）
    for (const id of ['G13', 'G14', 'G15', 'G16', 'G17', 'G18', 'G19']) expect(GUIDE.meta.coverage).toContain(id);
    expect(GUIDE.meta.pet.name).toBe('墨宝');
  });
});

// B7：Boss 阶段战引导 G18（spec §6.4）。文案 verbatim，触发事件必须落在已登记的
// TRIGGER_EVENTS 里——否则上面那条「每张卡都有 id、触发」会直接红。
describe('B7 Boss 阶段战引导', () => {
  it('G18 存在：换打法时教「节奏更快、别硬接、右键躲」', () => {
    const byId = new Map(GUIDE.guides.map((c) => [c.id, c]));
    const g18 = byId.get('G18');
    expect(g18).toBeTruthy();
    expect(g18.trigger.scene).toBe('BattleScene');
    expect(TRIGGER_EVENTS.has(g18.trigger.event)).toBe(true);
    expect(g18.trigger.oncePerRun).toBe(true);
    expect(JSON.stringify(g18)).toContain('喵！它换打法了，节奏会更快、招数也变——别硬接，用右键躲！');
  });
});

// C5：编队标记引导 G19（spec §6.4）。第一次看到带标记的怪时，教「脚下一伙的会互相加成」，
// 玩家才知道「为什么该先打前排」——光有三角标记而不解释，标记只会被当成美术装饰。
describe('C5 编队标记引导', () => {
  it('G19 存在：解释脚下三角是一伙的、前排死了光环就散', () => {
    const byId = new Map(GUIDE.guides.map((c) => [c.id, c]));
    const g19 = byId.get('G19');
    expect(g19).toBeTruthy();
    expect(g19.trigger.scene).toBe('BattleScene');
    expect(TRIGGER_EVENTS.has(g19.trigger.event)).toBe(true);
    expect(g19.trigger.oncePerRun).toBe(true);
    const text = JSON.stringify(g19);
    expect(text).toContain('脚下一伙的会互相加成');
    // 必须点明「先打前排」这个可执行动作，否则玩家读完仍不知道该怎么办
    expect(text).toMatch(/前排/);
  });

  it('G19 触发事件不是随手编的：必须挂在带标记的怪首次出现的那类事件上', () => {
    const g19 = GUIDE.guides.find((c) => c.id === 'G19');
    // 必须是编队首见，不能挂到变体首见上——否则把「编队」和「变体」两件事混成一件
    expect(g19.trigger.event).toBe('formationFirstSeen');
  });

  it('两份副本都含 G19 且 version 一致（docs 副本是给技能包的同源快照）', () => {
    expect(docsCopy.meta.version).toBe(GUIDE.meta.version);
    expect(docsCopy.guides.some((c) => c.id === 'G19')).toBe(true);
    expect(GUIDE.meta.version).toBe('0.4.3');
  });
});
