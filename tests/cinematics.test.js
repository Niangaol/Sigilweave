import { describe, expect, it } from 'vitest';
import {
  ACT_CARDS, TIMELINES, SKIP_GRACE_MS, buildTimeline, phaseAt, canSkip,
  skipResult, formatReport, buildCard,
} from '../src/data/cinematics.js';

// journey 是 5.8s 幕间演出，由下方 journey describe 单独验收，不算短过场。
const KINDS = Object.keys(TIMELINES).filter(k => k !== 'journey');

describe('过场时间轴', () => {
  it('八类过场都有时间轴，总时长都落在 900–1600ms', () => {
    expect(KINDS.sort()).toEqual(['act', 'boot', 'clear', 'death', 'retry', 'return', 'sigil', 'victory']);
    for (const kind of KINDS) {
      const tl = buildTimeline(kind);
      expect(tl.kind).toBe(kind);
      expect(tl.totalMs).toBe(tl.coverMs + tl.holdMs + tl.revealMs);
      expect(tl.revealAt).toBe(tl.coverMs + tl.holdMs);
      expect(tl.totalMs).toBeGreaterThanOrEqual(900);
      expect(tl.totalMs).toBeLessThanOrEqual(1600);
      expect(Object.isFrozen(tl)).toBe(true);
    }
  });

  it('未知类型退回 sigil，不让接入点因为拼错 kind 卡死', () => {
    expect(buildTimeline('nope').kind).toBe('sigil');
    expect(buildTimeline(undefined).totalMs).toBe(TIMELINES.sigil.coverMs + TIMELINES.sigil.holdMs + TIMELINES.sigil.revealMs);
  });

  it('阶段边界清楚：cover → hold → reveal → done，边界归后一阶段', () => {
    const tl = buildTimeline('act');
    expect(phaseAt(0, tl)).toMatchObject({ phase: 'cover', p: 0 });
    expect(phaseAt(tl.coverMs - 1, tl).phase).toBe('cover');
    expect(phaseAt(tl.coverMs, tl)).toMatchObject({ phase: 'hold', p: 0 });
    expect(phaseAt(tl.revealAt - 1, tl).phase).toBe('hold');
    expect(phaseAt(tl.revealAt, tl)).toMatchObject({ phase: 'reveal', p: 0 });
    expect(phaseAt(tl.totalMs - 1, tl).phase).toBe('reveal');
    expect(phaseAt(tl.totalMs, tl)).toMatchObject({ phase: 'done', p: 1 });
    // 负数/缺参按 0 处理
    expect(phaseAt(-50, tl).phase).toBe('cover');
    expect(phaseAt(undefined, tl).phase).toBe('cover');
  });

  it('每帧进度单调不减，不会在阶段交界处跳回 0', () => {
    const tl = buildTimeline('victory');
    let lastT = -1;
    for (let t = 0; t <= tl.totalMs; t += 16) {
      const ph = phaseAt(t, tl);
      expect(ph.t).toBeGreaterThanOrEqual(lastT);
      lastT = ph.t;
      expect(ph.p).toBeGreaterThanOrEqual(0);
      expect(ph.p).toBeLessThanOrEqual(1);
    }
  });
});

describe('跳过语义', () => {
  it('转入后 ' + SKIP_GRACE_MS + 'ms 内不允许跳过，防止触发键顺带把转场吞掉', () => {
    expect(canSkip(0)).toBe(false);
    expect(canSkip(SKIP_GRACE_MS - 1)).toBe(false);
    expect(canSkip(SKIP_GRACE_MS)).toBe(true);
  });

  it('未换场时跳过 = 立刻换场并进入揭开', () => {
    const tl = buildTimeline('act');
    const r = skipResult(200, tl, false);
    expect(r).toEqual({ allowed: true, elapsed: tl.revealAt, action: 'swap-reveal' });
  });

  it('停留阶段跳过 = 直接揭开；揭开阶段跳过 = 直接结束', () => {
    const tl = buildTimeline('act');
    expect(skipResult(tl.coverMs + 30, tl, true).action).toBe('reveal');
    const r = skipResult(tl.revealAt + 40, tl, true);
    expect(r.action).toBe('finish');
    expect(r.elapsed).toBe(tl.totalMs);
  });

  it('太早的跳过请求原样返回，不能把计时器往回拨', () => {
    const tl = buildTimeline('act');
    expect(skipResult(80, tl, false)).toEqual({ allowed: false, elapsed: 80, action: 'none' });
  });
});

describe('标题卡与文案', () => {
  it('七幕标题卡齐全、幕名唯一、字幕是单行短句', () => {
    expect(Object.keys(ACT_CARDS)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    const titles = new Set();
    for (const [act, card] of Object.entries(ACT_CARDS)) {
      expect(card.title.length).toBeGreaterThan(1);
      expect(card.title.length).toBeLessThanOrEqual(6);
      expect(card.subtitle.length).toBeGreaterThan(12);
      expect(card.subtitle.length).toBeLessThanOrEqual(34);
      expect(card.subtitle).not.toContain('\n');
      expect(card.hint.length).toBeLessThanOrEqual(40);
      expect(Number.isInteger(card.accent)).toBe(true);
      expect(Number.isInteger(card.tint)).toBe(true);
      titles.add(card.title);
    }
    expect(titles.size).toBe(7);
    // 北斗七星：每一幕都必须有唯一星名
    const stars = new Set(Object.values(ACT_CARDS).map((card) => card.star));
    expect(stars.size).toBe(7);
    expect(Object.values(ACT_CARDS).map((card) => card.star)).toEqual(['天枢', '天璇', '天玑', '天权', '玉衡', '开阳', '摇光']);
  });

  it('buildCard(act)：幕序号、标题、提示、主题色都取当幕；越界回退第一幕', () => {
    const card = buildCard('act', 2);
    expect(card.compact).toBe(false);
    expect(card.eyebrow).toBe('第 2 幕 · ACT II · 天璇');
    expect(card.title).toBe(ACT_CARDS[2].title);
    expect(card.accent).toBe(ACT_CARDS[2].accent);
    expect(card.stats).toEqual([]);
    expect(buildCard('act', 7).eyebrow).toBe('第 7 幕 · ACT VII · 摇光');
    expect(buildCard('act', 99).title).toBe(ACT_CARDS[1].title);
    expect(buildCard('act', 'x').eyebrow).toBe('第 1 幕 · ACT I · 天枢');
  });

  it('clear 卡带本幕四项数据，victory 卡带总计数据', () => {
    const report = { elapsedMs: 143000, kills: 312, triggers: 980, combos: 26 };
    const clear = buildCard('clear', 1, report);
    expect(clear.title).toBe('契约解除');
    expect(clear.subtitle).toContain(ACT_CARDS[1].title);
    expect(clear.stats.map(s => s.value)).toEqual(['02:23', '312', '980', '26']);
    const victory = buildCard('victory', 3, report);
    expect(victory.title).toBe('契约终结');
    expect(victory.stats).toHaveLength(4);
    expect(victory.hint).toContain('结算');
  });

  it('death 是血红主题；boot 不压字；短转场用紧凑卡', () => {
    const death = buildCard('death', 2);
    expect(death.title).toBe('魂火熄灭');
    expect(death.eyebrow).toContain('第 2 幕');
    expect(buildCard('boot', 1)).toBeNull();
    for (const kind of ['sigil', 'retry', 'return']) {
      const card = buildCard(kind, 1);
      expect(card.compact).toBe(true);
      expect(card.title.startsWith(' ')).toBe(false);
      expect(card.stats).toEqual([]);
    }
  });

  it('formatReport：时间补齐两位，缺字段按 0，负数按 0', () => {
    expect(formatReport({ elapsedMs: 0, kills: 0 }).map(s => s.value)).toEqual(['00:00', '0', '0', '0']);
    expect(formatReport({ elapsedMs: 59999 }).map(s => s.value)[0]).toBe('00:59');
    expect(formatReport({ elapsedMs: 143000 }).map(s => s.value)[0]).toBe('02:23');
    expect(formatReport({ elapsedMs: -1, kills: -5 }).map(s => s.value)).toEqual(['00:00', '-5', '0', '0']);
    expect(formatReport(undefined).map(s => s.label)).toEqual(['用时', '击杀', '脉流触发', '联组']);
  });
});

describe('journey 幕间演出时间轴', () => {
  it('总时长 5840ms，落在 4–8 秒区间', () => {
    const tl = buildTimeline('journey');
    expect(tl.coverMs).toBe(320);
    expect(tl.holdMs).toBe(5200);
    expect(tl.revealMs).toBe(320);
    expect(tl.totalMs).toBe(5840);
    expect(tl.totalMs).toBeGreaterThanOrEqual(4000);
    expect(tl.totalMs).toBeLessThanOrEqual(8000);
  });

  it('阶段边界与跳过语义和其他过场一致', () => {
    const tl = buildTimeline('journey');
    expect(phaseAt(319, tl).phase).toBe('cover');
    expect(phaseAt(320, tl).phase).toBe('hold');
    expect(phaseAt(5519, tl).phase).toBe('hold');
    expect(phaseAt(5520, tl).phase).toBe('reveal');
    expect(phaseAt(5840, tl).phase).toBe('done');
    expect(skipResult(100, tl, false).allowed).toBe(false);
    expect(skipResult(200, tl, false)).toMatchObject({ action: 'swap-reveal', elapsed: 5520 });
    expect(skipResult(600, tl, true)).toMatchObject({ action: 'reveal', elapsed: 5520 });
    expect(skipResult(5600, tl, true)).toMatchObject({ action: 'finish', elapsed: 5840 });
  });

  it('journey 不压标题卡', () => {
    expect(buildCard('journey', 2)).toBeNull();
    expect(buildCard('journey', 3)).toBeNull();
  });
});
