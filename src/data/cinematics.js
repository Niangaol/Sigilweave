// 过场动画的剧本与时间轴：纯数据 + 纯函数，不依赖 Phaser，可在 Node 里直接单测。
// 接入点见 src/ui/transition.js；画面实现在 src/scenes/CutsceneScene.js。

// 三幕标题卡。文案与现有世界观（契约、契约主、脉流、法阵）保持一致；
// 幕名取自 Background 的三幕主题，不新造地名。
export const ACT_CARDS = Object.freeze({
  1: Object.freeze({
    numeral: 'I',
    title: '荒废墓园',
    subtitle: '第一枚契约钉进碑石。以脉流为笔，替沉默者补完未竟的仪式。',
    hint: '方向键走位 · 踩亮符印出手 · 答对问答可直接处决契约主',
    accent: 0xc9a227,
    tint: 0x332b4a,
  }),
  2: Object.freeze({
    numeral: 'II',
    title: '腐沼教堂',
    subtitle: '潮声把祷词泡烂。第二枚契约沉在钟下，债主只认答对的名字。',
    hint: '二幕解封 12 格 · 进入幕间先重排罗盘，再决定带什么走',
    accent: 0x7cc9a8,
    tint: 0x2b3a20,
  }),
  3: Object.freeze({
    numeral: 'III',
    title: '星陨王庭',
    subtitle: '星纹垂落如审判。最后一位契约主记得所有名字，包括你的。',
    hint: '三幕十六格全开 · 这一局所有选择都会在这里结算',
    accent: 0x7fd7ff,
    tint: 0x171b36,
  }),
});

// 每类过场的时间轴（毫秒）。总时长全部落在 900–1600ms 的验收区间内：
//   cover  盖住旧场景（目标场景在完全盖住后才启动）
//   hold   标题卡停留（目标场景在底下已就绪并暂停）
//   reveal 揭开，目标场景已在底下运行
export const TIMELINES = Object.freeze({
  boot:    { coverMs: 300, holdMs: 360, revealMs: 300 },
  sigil:   { coverMs: 300, holdMs: 320, revealMs: 300 },
  act:     { coverMs: 320, holdMs: 820, revealMs: 320 },
  clear:   { coverMs: 320, holdMs: 780, revealMs: 320 },
  death:   { coverMs: 380, holdMs: 440, revealMs: 300 },
  victory: { coverMs: 360, holdMs: 900, revealMs: 340 },
  retry:   { coverMs: 300, holdMs: 320, revealMs: 300 },
  return:  { coverMs: 300, holdMs: 320, revealMs: 300 },
});

// 防止「触发转场的那一下按键/点击」被当成跳过：转入 150ms 后才允许跳过。
export const SKIP_GRACE_MS = 150;

const clamp01 = v => Math.max(0, Math.min(1, Number(v) || 0));

export function buildTimeline(kind) {
  const safeKind = Object.hasOwn(TIMELINES, kind) ? kind : 'sigil';
  const spec = TIMELINES[safeKind];
  const revealAt = spec.coverMs + spec.holdMs;
  return Object.freeze({
    kind: safeKind,
    coverMs: spec.coverMs,
    holdMs: spec.holdMs,
    revealMs: spec.revealMs,
    revealAt,
    totalMs: revealAt + spec.revealMs,
  });
}

// 根据已播放毫秒数返回阶段与阶段内进度（0–1）。边界归到后一阶段，调用方不需要再 ±1。
export function phaseAt(elapsed, timeline) {
  const t = Math.max(0, Number(elapsed) || 0);
  if (t < timeline.coverMs) return { phase: 'cover', p: clamp01(t / timeline.coverMs), t };
  if (t < timeline.revealAt) return { phase: 'hold', p: clamp01((t - timeline.coverMs) / Math.max(1, timeline.holdMs)), t };
  if (t < timeline.totalMs) return { phase: 'reveal', p: clamp01((t - timeline.revealAt) / Math.max(1, timeline.revealMs)), t };
  return { phase: 'done', p: 1, t };
}

export function canSkip(elapsed) {
  return (Number(elapsed) || 0) >= SKIP_GRACE_MS;
}

// 跳过语义：还没换场就立刻换场并进入揭开；正在揭开则直接结束。
// 返回新的 elapsed，场景只需把内部计时器设成它，下一帧按同一套阶段逻辑收尾。
export function skipResult(elapsed, timeline, swapped) {
  const t = Math.max(0, Number(elapsed) || 0);
  if (!canSkip(t)) return { allowed: false, elapsed: t, action: 'none' };
  if (!swapped) return { allowed: true, elapsed: timeline.revealAt, action: 'swap-reveal' };
  if (t < timeline.revealAt) return { allowed: true, elapsed: timeline.revealAt, action: 'reveal' };
  return { allowed: true, elapsed: timeline.totalMs, action: 'finish' };
}

export function formatReport(report = {}) {
  const ms = Math.max(0, Number(report.elapsedMs) || 0);
  const mm = String(Math.floor(ms / 60000)).padStart(2, '0');
  const ss = String(Math.floor(ms / 1000) % 60).padStart(2, '0');
  return Object.freeze([
    Object.freeze({ label: '用时', value: mm + ':' + ss }),
    Object.freeze({ label: '击杀', value: String(report.kills ?? 0) }),
    Object.freeze({ label: '脉流触发', value: String(report.triggers ?? 0) }),
    Object.freeze({ label: '联组', value: String(report.combos ?? 0) }),
  ]);
}

const COMPACT = Object.freeze({
  boot:    Object.freeze({ title: '', subtitle: '', hint: '' }),
  sigil:   Object.freeze({ title: '起 手 契 约', subtitle: '', hint: '' }),
  retry:   Object.freeze({ title: '再 入 契 约', subtitle: '', hint: '' }),
  return:  Object.freeze({ title: '祭 坛 暂 歇', subtitle: '', hint: '' }),
});

// 统一的卡片内容给 CutsceneScene 用；返回 null 表示这一类只走视觉、不压字。
export function buildCard(kind, act = 1, report = null) {
  const safeAct = [1, 2, 3].includes(Number(act)) ? Number(act) : 1;
  const actCard = ACT_CARDS[safeAct];
  switch (kind) {
    case 'act':
      return {
        kind,
        compact: false,
        eyebrow: '第 ' + safeAct + ' 幕 · ACT ' + actCard.numeral,
        title: actCard.title,
        subtitle: actCard.subtitle,
        hint: actCard.hint,
        stats: [],
        accent: actCard.accent,
        tint: actCard.tint,
      };
    case 'clear': {
      const stats = formatReport(report ?? {});
      return {
        kind,
        compact: false,
        eyebrow: '第 ' + safeAct + ' 幕 · 完成',
        title: '契约解除',
        subtitle: actCard.title + '的契约主已归于沉默，法阵把这一幕的刻痕收进核心。',
        hint: '进入幕间工作台 · 重排罗盘',
        stats,
        accent: actCard.accent,
        tint: actCard.tint,
      };
    }
    case 'death':
      return {
        kind,
        compact: false,
        eyebrow: '第 ' + safeAct + ' 幕 · 契约反噬',
        title: '魂火熄灭',
        subtitle: '刻线还温着。下一局，把缺的那一角补上。',
        hint: '查看本局结算',
        stats: [],
        accent: 0xa83b39,
        tint: 0x2a1020,
      };
    case 'victory': {
      const stats = formatReport(report ?? {});
      return {
        kind,
        compact: false,
        eyebrow: '终局 · 三契尽解',
        title: '契约终结',
        subtitle: '三枚契约主归于沉默。共振法阵第一次，安静下来。',
        hint: '查看本局结算',
        stats,
        accent: 0xe0c35a,
        tint: 0x2c2416,
      };
    }
    case 'boot':
      return null;
    default: {
      const compact = COMPACT[kind] ?? COMPACT.sigil;
      return {
        kind,
        compact: true,
        eyebrow: '',
        title: compact.title,
        subtitle: compact.subtitle,
        hint: compact.hint,
        stats: [],
        accent: actCard.accent,
        tint: actCard.tint,
      };
    }
  }
}
