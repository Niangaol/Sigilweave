// 按幕解锁法术：前期不出重档与演出级。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SIGIL_DEFS } from '../src/logic/effects.js';
import { CARD_POOL, createWorkshop, chooseReward } from '../src/logic/workshop.js';
import { TIERS, TIER_MIN_ACT, TIER_ORDER, tierOf, minActOf, unlockedAt, cardsForAct, sigilsForAct } from '../src/logic/spell-gating.js';

const allSigils = Object.keys(SIGIL_DEFS);
const root = resolve(import.meta.dirname, '..');

describe('法术分档', () => {
  it('24 张符印每张都归了档，不重不漏', () => {
    const listed = TIER_ORDER.flatMap(tier => TIERS[tier]);
    expect(listed.length).toBe(allSigils.length);
    expect(new Set(listed).size).toBe(listed.length);
    for (const id of allSigils) expect(tierOf(id), id).toBeTruthy();
  });

  it('解锁幕：轻 1 / 中 2 / 重 3 / 演出级 4', () => {
    expect(TIER_MIN_ACT).toEqual({ light: 1, medium: 2, heavy: 3, ultimate: 4 });
    expect(minActOf('arcane_bolt')).toBe(1);
    expect(minActOf('chain_lightning')).toBe(2);
    expect(minActOf('starfall')).toBe(3);
    expect(minActOf('meteor_judgment')).toBe(4);
    expect(unlockedAt('meteor_judgment', 3)).toBe(false);
    expect(unlockedAt('meteor_judgment', 4)).toBe(true);
    // 未登记的 id 当轻档，不让新法术默认被锁死
    expect(minActOf('some_future_sigil')).toBe(1);
    expect(unlockedAt('some_future_sigil', 1)).toBe(true);
  });
});

describe('卡池过滤', () => {
  const sigilCards = CARD_POOL.filter(c => c.kind === 'sigil');
  const idsAt = act => cardsForAct(CARD_POOL, act).filter(c => c.kind === 'sigil').map(c => c.defId);

  it('幕 1 只有轻档，且不含任何重档/演出级', () => {
    const ids = idsAt(1);
    expect(ids.sort()).toEqual([...TIERS.light].sort());
    for (const id of TIERS.heavy) expect(ids).not.toContain(id);
    for (const id of TIERS.ultimate) expect(ids).not.toContain(id);
  });

  it('幕 2 加中档、幕 3 加重档、幕 4 才放演出级', () => {
    // 抽取池只有 16 张基础符印（另 8 张定义齐备但不在池内），所以按池内交集比。
    const inPool = tier => TIERS[tier].filter(id => sigilCards.some(c => c.defId === id));
    expect(idsAt(2).sort()).toEqual([...inPool('light'), ...inPool('medium')].sort());
    expect(idsAt(3)).toContain('judgment_hammer');
    expect(idsAt(3)).not.toContain('quake_maw');
    expect(idsAt(4)).toContain('quake_maw');
    expect(idsAt(4)).toContain('meteor_judgment');
  });

  it('辅助卡不受幕限制；非法 act 按幕 1 处理', () => {
    const auxAt1 = cardsForAct(CARD_POOL, 1).filter(c => c.kind === 'auxiliary');
    expect(auxAt1.length).toBe(CARD_POOL.filter(c => c.kind === 'auxiliary').length);
    expect(idsAt(NaN).sort()).toEqual([...TIERS.light].sort());
    expect(cardsForAct(null, 1)).toEqual([]);
  });

  it('sigilsForAct 按档位从轻到重排', () => {
    const order = sigilsForAct(allSigils, 4).map(id => TIER_ORDER.indexOf(tierOf(id)));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(sigilsForAct(allSigils, 1).every(id => tierOf(id) === 'light')).toBe(true);
  });
});

describe('卡池出口都按幕过滤', () => {
  // offers 是模块内部的三轮表，对外只有当前这一轮；用 chooseReward 走完三轮收集。
  const offersOf = act => {
    const w = createWorkshop({ seed: 'gate:' + act, act });
    const cards = [];
    for (let i = 0; i < 3; i++) {
      if (!w.offer) break;
      cards.push(...w.offer.cards);
      chooseReward(w, w.offer.id, 0);
    }
    return cards;
  };

  it('幕间三选一：第一幕不会刷出重档与演出级，三轮共 9 张', () => {
    const cards = offersOf(1);
    expect(cards.length).toBe(9);
    for (const card of cards) if (card.kind === 'sigil') expect(unlockedAt(card.defId, 1)).toBe(true);
    expect(cards.some(c => TIERS.ultimate.includes(c.defId))).toBe(false);
  });

  it('幕 1 第一轮必有输出符印，且都是轻档', () => {
    const w = createWorkshop({ seed: 'gate:opener', act: 1 });
    expect(w.offer.cards.every(c => c.kind === 'sigil')).toBe(true);
    expect(w.offer.cards.every(c => tierOf(c.defId) === 'light')).toBe(true);
  });

  it('幕 5 才可能抽到演出级；升级三选一与幕间都用同一个过滤器', () => {
    // 单次抽不一定命中，扫 20 个种子确认演出级真的能出现
    const many = Array.from({ length: 20 }, (_, i) =>
      offersOf(5).map(c => c.defId).concat(createWorkshop({ seed: 'gate5:' + i, act: 5 }).offer.cards.map(c => c.defId)));
    const hit = many.some(ids => ids.some(id => TIERS.ultimate.includes(id)));
    expect(hit).toBe(true);
    expect(cardsForAct(CARD_POOL, 4).filter(c => c.kind === 'sigil').some(c => TIERS.ultimate.includes(c.defId))).toBe(true);
    // 波 2 起升级三选一迁到 ui/levelup-panel.js：检查面合并两个文件（只扩大、不放松）。
    const battle = readFileSync(resolve(root, 'src/scenes/BattleScene.js'), 'utf8')
      + readFileSync(resolve(root, 'src/ui/levelup-panel.js'), 'utf8');
    expect(battle).toContain('cardsForAct(CARD_POOL, this.scene.chapter)');
    const intermission = readFileSync(resolve(root, 'src/scenes/IntermissionScene.js'), 'utf8');
    expect(intermission).toContain('act: chapter');
  });
});
