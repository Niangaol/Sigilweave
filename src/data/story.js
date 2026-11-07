// src/data/story.js
// 开场分镜与幕间 journey 的纯数据：不依赖 Phaser/Window，Node 直接单测。
// 文案与时长以 docs/superpowers/specs/2026-11-07-cinematic-opening-design.md 为准（已经用户批准）。

export const STORY_SKIP_GRACE_MS = 150;

export const OPENING_SHOTS = Object.freeze([
  { id: 'skyfall',   ms: 6000, stage: 'skyfall',   subtitle: '星陨之年，天外的火在王庭熄灭。', cue: 'bell' },
  { id: 'contracts', ms: 6000, stage: 'contracts', subtitle: '三枚契约钉入大地，锁住三位不死的契约主。', cue: 'chime' },
  { id: 'graveyard', ms: 6000, stage: 'graveyard', subtitle: '墓园的碑石，记得第一个名字。', cue: 'bell' },
  { id: 'altar',     ms: 7000, stage: 'altar',     subtitle: '而被遗忘的祭坛，等来了最后的刻阵者。', cue: 'arp' },
  { id: 'awaken',    ms: 6000, stage: 'awaken',    subtitle: '以脉流为笔，以法阵为刃——替沉默者，补完未竟的仪式。', cue: 'chime' },
  { id: 'title',     ms: 5000, stage: 'title',     subtitle: '', cue: 'finale' },
].map(Object.freeze));

export const JOURNEYS = Object.freeze({
  2: Object.freeze({
    act: 2, stage: 'swamp', label: '第贰幕 · 腐沼教堂',
    subtitle: '潮声把祷词泡烂。第二枚契约，沉在钟下。',
    accent: 0x7cc9a8, tint: 0x2b3a20,
  }),
  3: Object.freeze({
    act: 3, stage: 'star', label: '第叁幕 · 星陨王庭',
    subtitle: '星纹垂落如审判。最后一位契约主，记得所有名字。',
    accent: 0x7fd7ff, tint: 0x171b36,
  }),
});

const clamp01 = v => Math.max(0, Math.min(1, Number(v) || 0));

export function buildOpeningTimeline() {
  let at = 0;
  const shots = OPENING_SHOTS.map((s, index) => {
    const startMs = at;
    at += s.ms;
    return Object.freeze({ ...s, index, startMs, endMs: at });
  });
  return Object.freeze({ shots: Object.freeze(shots), totalMs: at });
}

export function shotAt(elapsed, timeline) {
  const t = Math.max(0, Number(elapsed) || 0);
  for (const shot of timeline.shots) {
    if (t < shot.endMs) {
      return { shot, index: shot.index, p: clamp01((t - shot.startMs) / shot.ms), t: t - shot.startMs };
    }
  }
  const last = timeline.shots[timeline.shots.length - 1];
  return { shot: last, index: last.index, p: 1, t: last.ms };
}

export function canSkipStory(elapsed) {
  return (Number(elapsed) || 0) >= STORY_SKIP_GRACE_MS;
}