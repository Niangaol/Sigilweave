// src/data/story.js
// 开场分镜与幕间 journey 的纯数据：不依赖 Phaser/Window，Node 直接单测。
// 文案与时长以 docs/superpowers/specs/2026-11-07-cinematic-opening-design.md 为准（已经用户批准）。

export const STORY_SKIP_GRACE_MS = 150;

export const OPENING_SHOTS = Object.freeze([
  { id: 'skyfall',   ms: 6000, stage: 'skyfall',   subtitle: '星陨之年，天外的火在王庭熄灭。', cue: 'bell' },
  { id: 'contracts', ms: 6000, stage: 'contracts', subtitle: '七枚契约钉入大地，锁住七位不死的契约主。', cue: 'chime' },
  { id: 'graveyard', ms: 6000, stage: 'graveyard', subtitle: '墓园的碑石，记得第一个名字。', cue: 'bell' },
  { id: 'altar',     ms: 7000, stage: 'altar',     subtitle: '而被遗忘的祭坛，等来了最后的刻阵者。', cue: 'arp' },
  { id: 'awaken',    ms: 6000, stage: 'awaken',    subtitle: '以脉流为笔，以法阵为刃——替沉默者，补完未竟的仪式。', cue: 'chime' },
  { id: 'title',     ms: 5000, stage: 'title',     subtitle: '', cue: 'finale' },
].map(Object.freeze));

// 幕间 journey 以幕（chapter 1..5）为键：四、五幕各含两场，journey 只在进幕时播一次，
// 因此取该幕首场的布景（chapter 4 → 书库、chapter 5 → 锻炉），场名与 journey-static 对齐。
export const JOURNEYS = Object.freeze({
  2: Object.freeze({
    chapter: 2, stage: 'swamp', label: '第贰幕 · 腐沼教堂',
    subtitle: '潮声把祷词泡烂。第二枚契约，沉在钟下。',
    accent: 0x7cc9a8, tint: 0x2b3a20,
  }),
  3: Object.freeze({
    chapter: 3, stage: 'star', label: '第叁幕 · 星陨王庭',
    subtitle: '星纹垂落如审判。最后一位契约主，记得所有名字。',
    accent: 0x7fd7ff, tint: 0x171b36,
  }),
  4: Object.freeze({
    chapter: 4, stage: 'library', label: '第肆幕 · 审判书库',
    subtitle: '书库的钟声还没停，碑上又多了一位契约主的名字。',
    accent: 0xcfd6e0, tint: 0x1a1e2e,
  }),
  5: Object.freeze({
    chapter: 5, stage: 'forge', label: '第伍幕 · 熔星破晓',
    subtitle: '炉火把夜烧穿。最后一夜的两位契约主，都在等天亮。',
    accent: 0xffd98a, tint: 0x1a1630,
  }),
});

// 结局分镜：七契尽解 → 法阵安静 → 黎明 → 名单。名单不署个人名，品牌行+职责行+感谢行。
export const ENDING_SHOTS = Object.freeze([
  { id: 'release', ms: 7000, stage: 'release', subtitle: '七枚契约主，归于沉默。', cue: 'bell' },
  { id: 'quiet',   ms: 7000, stage: 'quiet',   subtitle: '共振法阵第一次，安静下来。', cue: 'hush' },
  { id: 'dawn',    ms: 8000, stage: 'dawn',    subtitle: '星陨平息。黎明落在无人记得的碑上。', cue: 'arp' },
  {
    id: 'credits', ms: 10000, stage: 'credits', subtitle: '', cue: 'finale',
    credits: Object.freeze(['共 振 法 阵', '设计 · 程序 · 像素美术 · 程序化音乐', '感谢每一位刻阵者']),
  },
].map(Object.freeze));

// 播放器模式配置：音乐模式 / 验收发布键 / 播完后的无缝交接（复用 boot 符环收拢过场）。
export const STORY_MODES = Object.freeze({
  opening: Object.freeze({
    music: 'opening', publishKey: '__SIGILWEAVE_STORY__',
    handoff: Object.freeze({ kind: 'boot', to: 'TitleScene' }),
  }),
  ending: Object.freeze({
    music: 'ending', publishKey: '__SIGILWEAVE_ENDING__',
    handoff: Object.freeze({ kind: 'boot', to: 'GameOverScene' }),
  }),
});

const clamp01 = v => Math.max(0, Math.min(1, Number(v) || 0));

function buildTimeline(shots) {
  let at = 0;
  const timed = shots.map((s, index) => {
    const startMs = at;
    at += s.ms;
    return Object.freeze({ ...s, index, startMs, endMs: at });
  });
  return Object.freeze({ shots: Object.freeze(timed), totalMs: at });
}

export function buildOpeningTimeline() {
  return buildTimeline(OPENING_SHOTS);
}

export function buildEndingTimeline() {
  return buildTimeline(ENDING_SHOTS);
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