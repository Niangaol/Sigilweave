import { describe, expect, it } from 'vitest';
import {
  OPENING_SHOTS, JOURNEYS, buildOpeningTimeline, shotAt, canSkipStory, STORY_SKIP_GRACE_MS,
} from '../src/data/story.js';

describe('开场分镜数据', () => {
  it('六镜总时长 36000ms，落在 20–60 秒区间', () => {
    const tl = buildOpeningTimeline();
    expect(tl.shots).toHaveLength(6);
    expect(tl.totalMs).toBe(36000);
    expect(tl.totalMs).toBeGreaterThanOrEqual(20000);
    expect(tl.totalMs).toBeLessThanOrEqual(60000);
  });

  it('镜头时间轴首尾相接，id 与舞台唯一且文案符合规格', () => {
    const tl = buildOpeningTimeline();
    expect(tl.shots.map(s => s.id)).toEqual(['skyfall', 'contracts', 'graveyard', 'altar', 'awaken', 'title']);
    tl.shots.forEach((s, i) => {
      expect(s.startMs).toBe(i === 0 ? 0 : tl.shots[i - 1].endMs);
      expect(s.endMs - s.startMs).toBe(s.ms);
      expect(s.stage).toBe(s.id);
      if (s.id !== 'title') expect(s.subtitle.length).toBeGreaterThan(0);
      expect(s.cue).toBeTruthy();
    });
    expect(tl.shots[0].subtitle).toBe('星陨之年，天外的火在王庭熄灭。');
    expect(tl.shots[4].subtitle).toBe('以脉流为笔，以法阵为刃——替沉默者，补完未竟的仪式。');
  });

  it('shotAt 边界归后一镜头，超尾返回末镜 p=1', () => {
    const tl = buildOpeningTimeline();
    expect(shotAt(0, tl).index).toBe(0);
    expect(shotAt(5999, tl).index).toBe(0);
    expect(shotAt(6000, tl).index).toBe(1);
    expect(shotAt(6000, tl).t).toBe(0);
    expect(shotAt(9000, tl).p).toBeCloseTo(0.5);
    expect(shotAt(999999, tl).index).toBe(5);
    expect(shotAt(999999, tl).p).toBe(1);
    expect(shotAt(-5, tl).index).toBe(0);
  });

  it('跳过宽限 150ms', () => {
    expect(STORY_SKIP_GRACE_MS).toBe(150);
    expect(canSkipStory(149)).toBe(false);
    expect(canSkipStory(150)).toBe(true);
  });

  it('journey 配置覆盖二/三幕，文案与幕名符合规格', () => {
    expect(Object.keys(JOURNEYS)).toEqual(['2', '3']);
    expect(JOURNEYS[2].label).toBe('第贰幕 · 腐沼教堂');
    expect(JOURNEYS[2].subtitle).toBe('潮声把祷词泡烂。第二枚契约，沉在钟下。');
    expect(JOURNEYS[2].stage).toBe('swamp');
    expect(JOURNEYS[3].label).toBe('第叁幕 · 星陨王庭');
    expect(JOURNEYS[3].subtitle).toBe('星纹垂落如审判。最后一位契约主，记得所有名字。');
    expect(JOURNEYS[3].stage).toBe('star');
    expect(JOURNEYS[2].accent).toBe(0x7cc9a8);
    expect(JOURNEYS[3].accent).toBe(0x7fd7ff);
  });

  it('数据全部冻结，运行期不会被 accidental 修改', () => {
    expect(Object.isFrozen(OPENING_SHOTS)).toBe(true);
    expect(Object.isFrozen(JOURNEYS)).toBe(true);
    expect(Object.isFrozen(buildOpeningTimeline())).toBe(true);
  });
});