# 开场动画与幕间过渡 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 36 秒六镜程序化像素开场（Boot→StoryScene→标题）+ 两段 5.8 秒幕间 journey 演出，全部无缝衔接游玩画面。

**Architecture:** 方案 A：分镜纯数据 `story.js` + 镜头绘制 `story-art.js` + 全屏 `StoryScene`；幕间复用现有 CutsceneScene 的 Cover→Swap→Freeze→Reveal 机制，新增 `journey` 类型；`CineMusic.js` WebAudio 程序化配乐。现有 10 条短过场行为不改。

**Tech Stack:** Phaser 3.90 / Vite 8 / vitest 5 / Playwright（真实 Edge 验收）。

**Spec:** `docs/superpowers/specs/2026-11-07-cinematic-opening-design.md`（执行前必读，剧情文案与时长以它为准）

## Global Constraints

- 全程中文文案；硬边像素色块、整数坐标、无渐变无滤镜无 `Math.random`（抖动走固定种子）。
- 每帧绘制指令 ≤700 条；长线用 1px 矢量线（`thinLine`），粒子预建每帧不新建对象。
- 无缝：不黑屏、不闪空帧、输入不穿透、可跳过；目标场景未就绪不揭开。
- 开场总时长 36000ms（20–60s 区间）；journey 总时长 5840ms（4–8s 区间）；跳过宽限 150ms。
- `?cine=0` / `?stress=1` / `?scene=` 时开场不播，调试/压测路径不变。
- 音乐失败静默降级，绝不抛 pageerror；遵守 `isSoundEnabled()`。
- 工作区有用户未提交改动（`src/scenes/BattleScene.js` 等）：**任何提交只 add 本任务明确列出的文件，绝不 `git add -A` / `git add .`**。
- 每个任务结束跑 `npx vitest run`（全绿）再提交；提交信息中文、遵循 `feat:/test:/docs:` 前缀风格。

---

### Task 1: story.js 分镜与 journey 纯数据

**Files:**
- Create: `src/data/story.js`
- Test: `tests/story-data.test.js`

**Interfaces:**
- Consumes: 无（纯数据模块，不 import 任何东西）
- Produces:
  - `OPENING_SHOTS`: 冻结数组，6 项 `{ id, ms, stage, subtitle, cue }`
  - `JOURNEYS`: 冻结对象 `{ 2: { act, stage, label, subtitle, accent, tint }, 3: {...} }`
  - `buildOpeningTimeline()`: `{ shots: [{ ...shot, index, startMs, endMs }], totalMs }`（均冻结）
  - `shotAt(elapsed, timeline)`: `{ shot, index, p, t }`（p=镜头内进度 0–1，t=镜头内毫秒；边界归后一镜头；超尾返回末镜 p=1）
  - `canSkipStory(elapsed)`: boolean（≥150ms 才 true）
  - `STORY_SKIP_GRACE_MS = 150`

- [ ] **Step 1: 写失败测试**

```js
// tests/story-data.test.js
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/story-data.test.js`
Expected: FAIL（Cannot find module '../src/data/story.js'）

- [ ] **Step 3: 实现 story.js**

```js
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
```

- [ ] **Step 4: 跑测试确认通过 + 全量回归**

Run: `npx vitest run tests/story-data.test.js && npx vitest run`
Expected: 本文件 6 项 PASS；全量全绿（此前 800 项 + 新增）

- [ ] **Step 5: 提交**

```bash
git add src/data/story.js tests/story-data.test.js
git commit -m "feat: 开场分镜与幕间 journey 纯数据（六镜 36s / 双 journey 配置）"
```

---

### Task 2: cinematics.js 加 journey 时间轴

**Files:**
- Modify: `src/data/cinematics.js`（TIMELINES 与 buildCard）
- Test: `tests/cinematics.test.js`（追加 describe 块）

**Interfaces:**
- Consumes: Task 1 无直接依赖（journey 视觉配置在 story.js，本任务只管时间轴）
- Produces: `TIMELINES.journey = { coverMs: 320, holdMs: 5200, revealMs: 320 }`；`buildTimeline('journey').totalMs === 5840`；`buildCard('journey') === null`

- [ ] **Step 1: 追加失败测试**

在 `tests/cinematics.test.js` 末尾追加（import 行已有 buildTimeline/buildCard/phaseAt/skipResult，缺哪个补哪个）：

```js
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/cinematics.test.js`
Expected: FAIL（journey 回退成 sigil 时间轴，totalMs 920 ≠ 5840）

- [ ] **Step 3: 实现**

`src/data/cinematics.js` 两处修改：

TIMELINES 对象里 `return:` 行后加一行：
```js
  return:  { coverMs: 300, holdMs: 320, revealMs: 300 },
  journey: { coverMs: 320, holdMs: 5200, revealMs: 320 },
```

buildCard 的 switch 里：
```js
    case 'boot':
    case 'journey':
      return null;
```

- [ ] **Step 4: 跑测试确认通过 + 全量回归**

Run: `npx vitest run tests/cinematics.test.js && npx vitest run`
Expected: 全绿

- [ ] **Step 5: 提交**

```bash
git add src/data/cinematics.js tests/cinematics.test.js
git commit -m "feat: 过场时间轴新增 journey 类型（5.8s 幕间演出，不压标题卡）"
```

---

### Task 3: story-art 基座 + 开场镜头 1–3

**Files:**
- Modify: `src/ui/cinematic-art.js`（3 个私有工具改导出：thinLine / strokeRing / RUNE_MARKS）
- Create: `src/ui/story-art.js`（本任务只写 helpers + skyfall/contracts/graveyard）
- Test: `tests/story-art.test.js`

**Interfaces:**
- Consumes: `cinematic-art.js` 的 `clamp01/easeOutCubic/easeInOutCubic/makeRng/drawSeal` 与本任务改导出的 `thinLine/strokeRing/RUNE_MARKS`；Palette 的 `C/pxRect/pxLine/pxDiamond/pxFrame/drawGlyph`
- Produces:
  - `buildStars(seed, count, w, h)` → `[{ x, y, size, phase }]`（整数坐标）
  - `OPENING_STAGES`：本任务先注册 `{ skyfall, contracts, graveyard }` 三个键；Task 4 补齐 altar/awaken/title
  - 每个舞台函数签名 `(g, ctx)`，`ctx = { w, h, t, p, accent, stars }`；**g 的清空由调用方负责**；函数内不新建粒子数组
  - `heroSilhouette(g, x, y, a)`（主角剪影，journey 与 altar 共用）

- [ ] **Step 1: 写失败测试**

```js
// tests/story-art.test.js
import { describe, expect, it } from 'vitest';
import { OPENING_STAGES, buildStars } from '../src/ui/story-art.js';

// 计数 stub：任何方法调用都计一条绘制指令（与 spell-fx 预算测试同思路）
function makeCounting() {
  const state = { n: 0 };
  const g = new Proxy({}, {
    get(t, k) {
      if (k === 'count') return state.n;
      return (...args) => {
        state.n++;
        for (const a of args) {
          if (typeof a === 'number' && !Number.isFinite(a)) throw new Error('非有限坐标: ' + String(a));
        }
        return g;
      };
    },
  });
  return g;
}

const CTX = (p, h = 270) => ({
  w: 480, h, t: Math.round(p * 6000), p, accent: 0xc9a227,
  stars: buildStars(0x9e37, 46, 480, h),
});

describe('story-art 绘制预算与确定性', () => {
  it('buildStars 固定种子确定性，坐标整数且在画布内', () => {
    const a = buildStars(0x9e37, 46, 480, 270);
    const b = buildStars(0x9e37, 46, 480, 270);
    expect(a).toEqual(b);
    expect(a).toHaveLength(46);
    for (const s of a) {
      expect(Number.isInteger(s.x)).toBe(true);
      expect(Number.isInteger(s.y)).toBe(true);
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThan(480);
      expect(s.y).toBeGreaterThanOrEqual(0);
    }
  });

  for (const stage of ['skyfall', 'contracts', 'graveyard']) {
    it(stage + ' 每帧 ≤700 条指令，横竖屏确定性', () => {
      for (const h of [270, 760]) {
        for (const p of [0, 0.25, 0.5, 0.75, 1]) {
          const g1 = makeCounting();
          const g2 = makeCounting();
          OPENING_STAGES[stage](g1, CTX(p, h));
          OPENING_STAGES[stage](g2, CTX(p, h));
          expect(g1.count).toBeLessThanOrEqual(700);
          expect(g1.count).toBeGreaterThan(0);
          expect(g1.count).toBe(g2.count);
        }
      }
    });
  }
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/story-art.test.js`
Expected: FAIL（Cannot find module '../src/ui/story-art.js'）

- [ ] **Step 3: cinematic-art.js 改导出 + 实现 story-art.js**

`src/ui/cinematic-art.js` 三处加 `export`（函数体一行不动）：
```js
export function thinLine(g, x1, y1, x2, y2, color, alpha = 1) {
export function strokeRing(g, cx, cy, r, color, alpha, segments = 48) {
export const RUNE_MARKS = [
```

创建 `src/ui/story-art.js`：

```js
// 开场与幕间 journey 的镜头绘制：硬边色块、整数坐标；g 的清空由调用方负责。
// 粒子（星点/浮尘）由调用方预建传入，每帧不新建对象。
import { C, pxRect, pxLine, pxDiamond, pxFrame, drawGlyph } from './Palette.js';
import {
  clamp01, easeOutCubic, easeInOutCubic, makeRng, drawSeal, thinLine, RUNE_MARKS,
} from './cinematic-art.js';

export { clamp01, easeOutCubic, easeInOutCubic };

export function buildStars(seed, count, w, h) {
  const rng = makeRng(seed);
  return Array.from({ length: count }, () => ({
    x: Math.floor(rng() * w),
    y: Math.floor(rng() * h * 0.7),
    size: rng() > 0.85 ? 2 : 1,
    phase: rng() * Math.PI * 2,
  }));
}

// 主角剪影：刻阵者。身体/头/衣摆 + 魂火一点，journey 与 altar 共用。
export function heroSilhouette(g, x, y, a = 1) {
  const ix = Math.round(x), iy = Math.round(y);
  pxRect(g, ix - 3, iy - 14, 6, 10, C.ink, a);
  pxDiamond(g, ix, iy - 17, 3, C.ink, a, true);
  pxRect(g, ix - 4, iy - 6, 8, 4, C.stoneDark, 0.8 * a);
  pxRect(g, ix - 1, iy - 16, 2, 1, C.brassLight, 0.9 * a);
}

// 镜头 1：星陨。夜空星点 + 陨星划痕，镜头下摇（地平线从 0.92h 降到 0.62h），墓园剪影渐显。
function drawSkyfall(g, { w, h, t, p, stars }) {
  pxRect(g, 0, 0, w, h, C.void, 1);
  for (const s of stars) {
    const tw = 0.3 + 0.4 * (0.5 + 0.5 * Math.sin(t * 0.002 + s.phase));
    pxRect(g, s.x, s.y, s.size, s.size, C.parchment, tw);
  }
  for (let i = 0; i < 2; i++) {
    const mp = clamp01(p * 1.2 - i * 0.35);
    if (mp <= 0 || mp >= 1) continue;
    const x = Math.round(w * (0.75 - mp * 0.45) + i * 60);
    const y = Math.round(20 + mp * h * 0.4 + i * 24);
    pxLine(g, x, y, x + 16, y + 26, C.runeCold, (1 - mp) * 0.8, 1);
    pxRect(g, x, y, 2, 2, C.white, (1 - mp) * 0.9);
  }
  const horizon = Math.round(h * (0.92 - 0.3 * easeInOutCubic(p)));
  const a = clamp01((p - 0.35) / 0.4);
  if (a <= 0) return;
  pxRect(g, 0, horizon, w, h - horizon, C.ink, 0.95 * a);
  for (const [x, gh] of [[60, 26], [120, 18], [210, 30], [300, 22], [380, 26], [440, 16]]) {
    pxRect(g, x, horizon - gh, 14, gh, C.stoneDark, 0.95 * a);
    pxRect(g, x, horizon - gh, 14, 2, C.stoneLight, 0.5 * a);
  }
  for (const [cx, top] of [[150, horizon - 80], [330, horizon - 92]]) {
    for (let i = 0; i < 6; i++) {
      const sw = Math.round(60 * (0.4 + i * 0.1));
      pxRect(g, cx - sw / 2, top + i * 6, sw, 6, C.stoneDark, 0.9 * a);
    }
  }
}

// 镜头 2：三契钉入。墓碑/沉钟/王座三个小舞台依次亮起契约符环。
function drawContracts(g, { w, h, t, p, accent }) {
  pxRect(g, 0, 0, w, h, C.nightDeep, 1);
  const baseY = Math.round(h * 0.68);
  pxRect(g, 0, baseY, w, h - baseY, C.ink, 0.95);
  pxRect(g, 0, baseY, w, 2, C.groove, 0.5);
  const centers = [Math.round(w / 2 - 150), Math.round(w / 2), Math.round(w / 2 + 150)];
  centers.forEach((cx, i) => {
    const lit = clamp01(p * 3.2 - i * 0.9);
    const a = 0.35 + 0.65 * lit;
    if (i === 0) {
      // 墓碑
      pxRect(g, cx - 10, baseY - 34, 20, 34, C.stoneDark, a);
      pxRect(g, cx - 10, baseY - 34, 20, 2, C.stoneLight, 0.6 * a);
      pxLine(g, cx - 4, baseY - 26, cx + 3, baseY - 8, C.ink, 0.7 * a, 1);
    } else if (i === 1) {
      // 沉钟
      pxLine(g, cx, baseY - 96, cx, baseY - 44, C.brassDark, 0.7 * a, 1);
      pxRect(g, cx - 12, baseY - 44, 25, 4, C.brass, 0.9 * a);
      pxRect(g, cx - 8, baseY - 40, 17, 5, C.brassDark, 0.95 * a);
      pxRect(g, cx - 4, baseY - 34, 9, 3, C.brassDark, 0.9 * a);
      pxRect(g, cx, baseY - 31, 2, 4, C.brassLight, 0.8 * a);
    } else {
      // 王座
      pxRect(g, cx - 30, baseY - 8, 60, 8, C.shardStone, 0.9 * a);
      pxRect(g, cx - 20, baseY - 16, 40, 8, C.stoneDark, 0.9 * a);
      pxRect(g, cx - 12, baseY - 52, 24, 36, C.stoneDark, 0.95 * a);
      pxRect(g, cx - 8, baseY - 48, 16, 30, C.starTileLit, 0.7 * a);
      pxDiamond(g, cx, baseY - 34, 5, accent, 0.6 * a, true);
    }
    if (lit > 0) {
      drawSeal(g, { cx, cy: baseY - 80, r: 28, t, accent, alpha: lit * 0.8, spokes: 8 });
      pxDiamond(g, cx, baseY - 80, 3, accent, lit * 0.9, true);
    }
  });
}

// 镜头 3：墓园推镜。墓碑群向中央主碑缓慢放大（坐标绕中心缩放，保持整数），碑面符环微光渐亮。
function drawGraveyardPush(g, { w, h, t, p, accent }) {
  pxRect(g, 0, 0, w, h, C.nightDeep, 1);
  const horizon = Math.round(h * 0.62);
  const z = 1 + 0.35 * easeInOutCubic(p);
  const cx = w / 2;
  const X = x => Math.round(cx + (x - cx) * z);
  pxRect(g, 0, horizon, w, h - horizon, C.ink, 0.95);
  pxRect(g, 0, horizon, w, 2, C.groove, 0.5);
  for (let i = 1; i <= 4; i++) {
    const y = Math.round(horizon + (h - horizon) * (i / 5));
    pxRect(g, 0, y, w, 1, C.stoneDark, 0.28);
  }
  const graves = [[70, 26], [130, 18], [240, 40], [350, 22], [410, 28]];
  for (const [x, gh] of graves) {
    const gw = Math.max(2, Math.round(16 * z));
    const ghh = Math.round(gh * z);
    pxRect(g, X(x) - Math.round(gw / 2), horizon - ghh, gw, ghh, C.stoneDark, 0.95);
    pxRect(g, X(x) - Math.round(gw / 2), horizon - ghh, gw, 2, C.stoneLight, 0.55);
  }
  const glow = clamp01((p - 0.45) / 0.4);
  if (glow > 0) {
    drawSeal(g, {
      cx: X(240), cy: horizon - Math.round(20 * z), r: Math.round(14 * z),
      t, accent, alpha: glow * 0.7, spokes: 6,
    });
  }
  // 烛火两盏
  for (const [x, i] of [[96, 0], [384, 1]]) {
    const flick = Math.round(Math.sin(t * 0.012 + i * 1.7) * 1.2);
    pxRect(g, X(x) - 1, horizon + 12, 3, 14, C.parchment, 0.75);
    pxRect(g, X(x) + flick, horizon + 8, 1, 4, accent, 0.9);
  }
  // 雾带横移
  for (let i = 0; i < 2; i++) {
    const ox = Math.round(((t * (0.012 + i * 0.004) + i * 97) % (w + 200)) - 200);
    pxRect(g, ox, horizon - 12 + i * 7, 220, 3, C.fog, 0.05 + i * 0.02);
  }
}

export const OPENING_STAGES = {
  skyfall: drawSkyfall,
  contracts: drawContracts,
  graveyard: drawGraveyardPush,
};
```

- [ ] **Step 4: 跑测试确认通过 + 全量回归**

Run: `npx vitest run tests/story-art.test.js && npx vitest run`
Expected: 全绿（cinematic-art 改导出不影响既有行为，cutscene 相关测试必须仍绿）

- [ ] **Step 5: 提交**

```bash
git add src/ui/cinematic-art.js src/ui/story-art.js tests/story-art.test.js
git commit -m "feat: 开场镜头绘制基座与星陨/三契/墓园推镜（每帧≤700指令）"
```

---

### Task 4: story-art 开场镜头 4–6

**Files:**
- Modify: `src/ui/story-art.js`（追加 altar/awaken/title 并注册进 OPENING_STAGES）
- Test: `tests/story-art.test.js`（追加用例）

**Interfaces:**
- Consumes: Task 3 的 `heroSilhouette`、`OPENING_STAGES`、cinematic-art 的 `drawSeal/RUNE_MARKS/thinLine`
- Produces: `OPENING_STAGES.altar / .awaken / .title`（签名同 Task 3）；title 镜头只画符环收拢，「共振法阵」文字由 StoryScene 负责

- [ ] **Step 1: 追加失败测试**

`tests/story-art.test.js` 的 for 循环数组改为 `['skyfall', 'contracts', 'graveyard', 'altar', 'awaken', 'title']`，并追加：

```js
describe('OPENING_STAGES 完整性', () => {
  it('六个镜头舞台全部注册且为函数', () => {
    for (const id of ['skyfall', 'contracts', 'graveyard', 'altar', 'awaken', 'title']) {
      expect(typeof OPENING_STAGES[id], id).toBe('function');
    }
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/story-art.test.js`
Expected: FAIL（altar/awaken/title undefined）

- [ ] **Step 3: 实现三个镜头**

`src/ui/story-art.js` 追加（import 行确认已有 `pxFrame/drawGlyph/thinLine/RUNE_MARKS`）：

```js
// 镜头 4：祭坛俯视。4×4 刻格逐格点亮，脉流沿格线流动，主角剪影走近立定。
function drawAltar(g, { w, h, t, p, accent }) {
  pxRect(g, 0, 0, w, h, C.nightDeep, 1);
  const cell = 30, gap = 4, size = cell * 4 + gap * 3;
  const ox = Math.round(w / 2 - size / 2), oy = Math.round(h / 2 - size / 2);
  pxRect(g, ox - 10, oy - 10, size + 20, size + 20, C.stoneDark, 0.95);
  pxFrame(g, ox - 10, oy - 10, size + 20, size + 20, C.brassDark, 1, 0.7);
  const litCount = Math.floor(clamp01((p - 0.25) / 0.65) * 16);
  const centerOf = i => [
    ox + (i % 4) * (cell + gap) + Math.round(cell / 2),
    oy + Math.floor(i / 4) * (cell + gap) + Math.round(cell / 2),
  ];
  for (let i = 0; i < 16; i++) {
    const gx = ox + (i % 4) * (cell + gap);
    const gy = oy + Math.floor(i / 4) * (cell + gap);
    const lit = i < litCount;
    pxRect(g, gx, gy, cell, cell, lit ? C.graveTileLit : C.graveTile, 0.95);
    pxFrame(g, gx, gy, cell, cell, C.groove, 1, lit ? 0.8 : 0.3);
    if (lit) drawGlyph(g, gx + Math.round(cell / 2) - 4, gy + Math.round(cell / 2) - 4, RUNE_MARKS[i % RUNE_MARKS.length], accent, { alpha: 0.8 });
  }
  for (let i = 1; i < litCount; i++) {
    const [x1, y1] = centerOf(i - 1);
    const [x2, y2] = centerOf(i);
    thinLine(g, x1, y1, x2, y2, accent, 0.45);
  }
  const wp = easeOutCubic(clamp01(p / 0.3));
  const hx = Math.round(w / 2);
  const hy = Math.round(oy + size + 40 - wp * 34);
  heroSilhouette(g, hx, hy, 1);
  // 立定后魂火微光
  if (p > 0.3) pxDiamond(g, hx, hy - 22, 2, accent, clamp01((p - 0.3) / 0.3) * 0.8, true);
}

// 镜头 5：符环觉醒。符环扩张旋转，核心耀亮（浮尘由场景层统一画）。
function drawAwaken(g, { w, h, t, p, accent }) {
  pxRect(g, 0, 0, w, h, C.nightDeep, 1);
  const r = Math.round(120 + 90 * easeOutCubic(p));
  drawSeal(g, {
    cx: Math.round(w / 2), cy: Math.round(h * 0.46), r, t, accent,
    alpha: 0.5 + 0.4 * p, spokes: 12,
  });
}

// 镜头 6：标题收拢。符环收成一点，文字由 StoryScene 淡入。
function drawTitleSeal(g, { w, h, t, p, accent }) {
  pxRect(g, 0, 0, w, h, C.nightDeep, 1);
  const r = Math.max(24, Math.round(210 - 186 * easeInOutCubic(clamp01(p * 1.15))));
  const a = p < 0.85 ? 0.85 : 0.85 * (1 - (p - 0.85) / 0.15);
  drawSeal(g, { cx: Math.round(w / 2), cy: Math.round(h * 0.46), r, t, accent, alpha: a });
}
```

OPENING_STAGES 注册补齐：
```js
export const OPENING_STAGES = {
  skyfall: drawSkyfall,
  contracts: drawContracts,
  graveyard: drawGraveyardPush,
  altar: drawAltar,
  awaken: drawAwaken,
  title: drawTitleSeal,
};
```

- [ ] **Step 4: 跑测试确认通过 + 全量回归**

Run: `npx vitest run tests/story-art.test.js && npx vitest run`
Expected: 全绿

- [ ] **Step 5: 提交**

```bash
git add src/ui/story-art.js tests/story-art.test.js
git commit -m "feat: 开场祭坛/符环觉醒/标题收拢三镜头"
```

---

### Task 5: story-art 两段 journey 舞台

**Files:**
- Modify: `src/ui/story-art.js`（追加 JOURNEY_STAGES）
- Test: `tests/story-art.test.js`（追加用例）

**Interfaces:**
- Consumes: Task 3 的 `heroSilhouette/buildStars`、Palette 色板
- Produces: `JOURNEY_STAGES = { swamp: drawJourneySwamp, star: drawJourneyStar }`，签名 `(g, { w, h, t, p, accent, stars })`；t 为 hold 内毫秒（0–5200），p 为 hold 进度

- [ ] **Step 1: 追加失败测试**

```js
import { JOURNEY_STAGES } from '../src/ui/story-art.js';

describe('journey 舞台绘制预算', () => {
  for (const stage of ['swamp', 'star']) {
    it(stage + ' 每帧 ≤700 条指令，横竖屏确定性', () => {
      for (const h of [270, 760]) {
        for (const p of [0, 0.25, 0.5, 0.75, 1]) {
          const g1 = makeCounting();
          const g2 = makeCounting();
          const ctx = { w: 480, h, t: Math.round(p * 5200), p, accent: 0x7cc9a8, stars: buildStars(7, 46, 480, h) };
          JOURNEY_STAGES[stage](g1, ctx);
          JOURNEY_STAGES[stage](g2, ctx);
          expect(g1.count).toBeLessThanOrEqual(700);
          expect(g1.count).toBeGreaterThan(0);
          expect(g1.count).toBe(g2.count);
        }
      }
    });
  }
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/story-art.test.js`
Expected: FAIL（JOURNEY_STAGES 未导出）

- [ ] **Step 3: 实现两段 journey**

```js
// 幕间 journey · 二幕：横移长镜头。墓碑群滚动离场，沼水反光渐起，教堂彩窗逐格亮灯，主角剪影前行。
function drawJourneySwamp(g, { w, h, t, p, accent }) {
  pxRect(g, 0, 0, w, h, C.nightDeep, 1);
  const horizon = Math.round(h * 0.6);
  const pan = Math.round(p * 160);
  pxRect(g, 0, horizon, w, h - horizon, C.ink, 0.95);
  pxRect(g, 0, horizon, w, 2, C.groove, 0.4);
  // 沼水反光
  for (let i = 0; i < 4; i++) {
    const y = horizon + 12 + i * 14;
    const ox = Math.round((t * (0.02 + i * 0.005)) % (w + 120)) - 120;
    pxRect(g, ox, y, 84, 1, C.swampGlint, 0.16);
    pxRect(g, ox + 130, y + 4, 52, 1, C.swampGlint, 0.1);
  }
  // 左侧墓碑群离场
  for (const [x, gh] of [[30, 26], [80, 18], [140, 30], [200, 22]]) {
    const sx = x - pan;
    if (sx < -30) continue;
    pxRect(g, sx, horizon - gh, 14, gh, C.stoneDark, 0.95);
    pxRect(g, sx, horizon - gh, 14, 2, C.stoneLight, 0.5);
  }
  // 右侧教堂尖窗（视差慢移），彩窗逐格亮灯
  const cx = Math.round(400 - pan * 0.3);
  const bw = 72, top = horizon - 110;
  for (let i = 0; i < 7; i++) {
    const sw = Math.round(bw * (0.35 + i * 0.09));
    pxRect(g, cx - Math.round(sw / 2), top + i * 6, sw, 6, C.stoneDark, 0.95);
  }
  const litRows = Math.floor(clamp01((p - 0.35) / 0.5) * 5);
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 3; c++) {
      const lit = r < litRows;
      pxRect(g, cx - 22 + c * 15, top + 38 + r * 12, 11, 9,
        lit ? ((r + c) % 2 === 0 ? C.glassRed : C.glassBlue) : C.stoneDark, lit ? 0.8 : 0.6);
    }
  }
  // 吊钟轻摆
  const swing = Math.round(Math.sin(t * 0.0016) * 4);
  pxLine(g, cx - 90, 30, cx - 90 + swing, horizon - 100, C.brassDark, 0.7, 1);
  pxRect(g, cx - 90 + swing - 10, horizon - 100, 21, 4, C.brass, 0.85);
  pxRect(g, cx - 90 + swing - 7, horizon - 96, 15, 5, C.brassDark, 0.9);
  // 主角剪影前行（步行上下颠簸）
  const hx = Math.round(110 + p * 130);
  const hy = horizon + 26 + Math.round(Math.sin(t * 0.008) * 1.5);
  heroSilhouette(g, hx, hy, 1);
  // 雾带
  for (let i = 0; i < 2; i++) {
    const ox = Math.round(((t * (0.014 + i * 0.005) + i * 130) % (w + 200)) - 200);
    pxRect(g, ox, horizon - 10 + i * 8, 220, 3, C.fog, 0.06 + i * 0.02);
  }
  // 鬼火两点
  for (let i = 0; i < 2; i++) {
    const x = Math.round(260 + i * 60 + Math.sin(t * 0.003 + i) * 4);
    const y = Math.round(horizon - 24 - i * 10 + Math.sin(t * 0.004 + i) * 3);
    pxRect(g, x, y, 2, 2, accent, 0.5);
    pxRect(g, x + 1, y - 1, 1, 1, C.wispCore, 0.8);
  }
}

// 幕间 journey · 三幕：教堂彩窗在身后暗灭，镜头上摇，星纹垂落，王庭立柱与王座浮现。
function drawJourneyStar(g, { w, h, t, p, accent, stars }) {
  pxRect(g, 0, 0, w, h, C.starTileDark, 1);
  // 身后教堂彩窗暗灭（左侧小窗）
  const dim = 1 - clamp01(p / 0.4);
  if (dim > 0) {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 2; c++) {
        pxRect(g, 40 + c * 15, Math.round(h * 0.4) + r * 12, 11, 9,
          (r + c) % 2 === 0 ? C.glassRed : C.glassBlue, 0.55 * dim);
      }
    }
  }
  // 镜头上摇：地平线下移
  const horizon = Math.round(h * (0.55 + 0.2 * easeInOutCubic(p)));
  // 星点垂落
  for (const s of stars) {
    const y = Math.round((s.y + p * 36) % Math.max(20, horizon - 30));
    const tw = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * 0.002 + s.phase));
    pxRect(g, s.x, y, s.size, s.size, C.parchment, tw);
  }
  pxRect(g, 0, horizon, w, h - horizon, C.ink, 0.95);
  const a = clamp01((p - 0.3) / 0.5);
  if (a > 0) {
    // 两侧立柱
    for (const x of [100, 364]) {
      pxRect(g, x, horizon - 140, 16, 140, C.starTileDark, 0.95 * a);
      pxRect(g, x + 3, horizon - 140, 2, 140, C.runeDim, 0.35 * a);
      pxRect(g, x - 3, horizon - 144, 22, 5, C.shardStone, 0.9 * a);
    }
    // 王座
    pxRect(g, 190, horizon - 10, 100, 10, C.shardStone, 0.9 * a);
    pxRect(g, 204, horizon - 20, 72, 10, C.stoneDark, 0.9 * a);
    pxRect(g, 222, horizon - 70, 36, 50, C.stoneDark, 0.95 * a);
    pxRect(g, 227, horizon - 64, 26, 42, C.starTileLit, 0.7 * a);
    pxDiamond(g, 240, horizon - 44, 8, accent, 0.6 * a, true);
  }
  // 浮空碎星升起
  for (let i = 0; i < 5; i++) {
    const x = Math.round(140 + i * 50 + Math.sin(t * 0.0012 + i) * 7);
    const y = Math.round(horizon - 110 - p * 20 + Math.sin(t * 0.0018 + i * 1.9) * 6);
    pxDiamond(g, x, y, 3 + (i % 2), accent, 0.55 * a, i % 2 === 0);
  }
}

export const JOURNEY_STAGES = {
  swamp: drawJourneySwamp,
  star: drawJourneyStar,
};
```

- [ ] **Step 4: 跑测试确认通过 + 全量回归**

Run: `npx vitest run tests/story-art.test.js && npx vitest run`
Expected: 全绿

- [ ] **Step 5: 提交**

```bash
git add src/ui/story-art.js tests/story-art.test.js
git commit -m "feat: 幕间 journey 腐沼横移与星陨上摇两段长镜头"
```

---

### Task 6: CineMusic 程序化配乐

**Files:**
- Create: `src/audio/CineMusic.js`
- Test: `tests/cine-music.test.js`

**Interfaces:**
- Consumes: `Sfx.js` 的 `isSoundEnabled()`
- Produces: `startMusic(kind='opening')`（kind 也接受 'journey'）、`musicCue(cue)`（cue ∈ bell/chime/arp/finale，未知 cue 静默忽略）、`stopMusic()`（0.25s 淡出）。全部无返回值、永不抛异常。

- [ ] **Step 1: 写失败测试**

```js
// tests/cine-music.test.js
import { describe, expect, it, vi, beforeEach } from 'vitest';

const sound = { on: true };
vi.mock('../src/audio/Sfx.js', () => ({ isSoundEnabled: () => sound.on }));

function makeFakeAudio() {
  const state = { nodes: [], started: 0, stopped: 0, disconnected: 0 };
  class FakeParam {
    constructor() { this.value = 1; }
    setValueAtTime(v) { this.value = v; }
    exponentialRampToValueAtTime(v) { this.value = v; }
    cancelScheduledValues() {}
  }
  class FakeNode {
    constructor(kind) { this.kind = kind; this.gain = new FakeParam(); this.frequency = new FakeParam(); state.nodes.push(this); }
    connect() {}
    disconnect() { state.disconnected++; }
    start() { state.started++; }
    stop() { state.stopped++; }
  }
  class FakeCtx {
    constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
    createOscillator() { return new FakeNode('osc'); }
    createGain() { return new FakeNode('gain'); }
    resume() { return Promise.resolve(); }
  }
  return { state, FakeCtx };
}

beforeEach(() => {
  vi.resetModules();
  sound.on = true;
});

async function load() {
  const { state, FakeCtx } = makeFakeAudio();
  globalThis.window = { AudioContext: FakeCtx };
  const mod = await import('../src/audio/CineMusic.js');
  return { mod, state };
}

describe('CineMusic 程序化配乐', () => {
  it('start 建低音铺底，stop 全部停掉', async () => {
    const { mod, state } = await load();
    mod.startMusic('opening');
    expect(state.started).toBeGreaterThanOrEqual(3);
    mod.stopMusic();
    expect(state.stopped).toBeGreaterThanOrEqual(3);
  });

  it('音效关闭时 start/cue 完全静默', async () => {
    const { mod, state } = await load();
    sound.on = false;
    mod.startMusic('opening');
    mod.musicCue('bell');
    expect(state.started).toBe(0);
  });

  it('cue 在铺底之上追加乐音，未知 cue 忽略', async () => {
    const { mod, state } = await load();
    mod.startMusic('opening');
    const base = state.started;
    mod.musicCue('arp');
    expect(state.started).toBeGreaterThan(base);
    const n = state.started;
    mod.musicCue('不存在');
    expect(state.started).toBe(n);
    mod.stopMusic();
  });

  it('重复 start 先清旧铺底，不叠两层', async () => {
    const { mod, state } = await load();
    mod.startMusic('opening');
    mod.startMusic('journey');
    expect(state.stopped).toBeGreaterThanOrEqual(3);
    mod.stopMusic();
  });

  it('没有 AudioContext 时静默降级，不抛异常', async () => {
    vi.resetModules();
    globalThis.window = {};
    const mod = await import('../src/audio/CineMusic.js');
    expect(() => { mod.startMusic(); mod.musicCue('bell'); mod.stopMusic(); }).not.toThrow();
  });

  it('未 start 直接 cue / stop 不抛异常', async () => {
    const { mod } = await load();
    expect(() => { mod.musicCue('bell'); mod.stopMusic(); }).not.toThrow();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/cine-music.test.js`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 CineMusic.js**

```js
// src/audio/CineMusic.js
// 过场配乐：WebAudio 现场合成，双正弦 detune 低音铺底 + 镜头 cue 乐音。
// 与 Sfx 同纪律：首次用户手势前 AudioContext 可能 suspended，静默降级；任何异常都不抛出。
import { isSoundEnabled } from './Sfx.js';

let ctx = null;
let master = null;
let drone = [];
let failed = false;

function ensure() {
  if (failed) return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { failed = true; return null; }
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch { failed = true; return null; }
}

function note(freq, dur, gain, when = 0) {
  if (!ctx || !master) return;
  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const t0 = ctx.currentTime + when;
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  } catch { /* 配乐失败不影响画面 */ }
}

export function startMusic(kind = 'opening') {
  if (!isSoundEnabled()) return;
  const c = ensure();
  if (!c) return;
  stopMusic();
  try {
    master = c.createGain();
    master.gain.setValueAtTime(0.0001, c.currentTime);
    master.gain.exponentialRampToValueAtTime(kind === 'journey' ? 0.5 : 0.9, c.currentTime + 1.2);
    master.connect(c.destination);
    const base = kind === 'journey' ? 73.4 : 55;
    for (const [freq, gain] of [[base, 0.018], [base * 1.005, 0.014], [base * 2, 0.006]]) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq, c.currentTime);
      g.gain.setValueAtTime(gain, c.currentTime);
      o.connect(g); g.connect(master);
      o.start();
      drone.push({ o });
    }
  } catch { failed = true; }
}

const CUES = Object.freeze({
  bell:   [[440, 1.6]],
  chime:  [[523, 1.2], [659, 1.4]],
  arp:    [[220, 0.5], [277, 0.5], [330, 0.5], [440, 0.9]],
  finale: [[392, 1.2], [523, 1.4], [659, 2.0]],
});

export function musicCue(cue) {
  if (!isSoundEnabled() || !ctx || !master) return;
  const seq = CUES[cue];
  if (!seq) return;
  seq.forEach(([freq, dur], i) => note(freq, dur, 0.04, i * 0.14));
}

export function stopMusic() {
  const c = ctx, m = master, d = drone;
  master = null;
  drone = [];
  if (!c || !m) return;
  try {
    const t0 = c.currentTime;
    m.gain.cancelScheduledValues(t0);
    m.gain.setValueAtTime(Math.max(0.0001, m.gain.value), t0);
    m.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
    for (const { o } of d) { try { o.stop(t0 + 0.3); } catch { /* 已停 */ } }
    setTimeout(() => { try { m.disconnect(); } catch { /* 已断开 */ } }, 350);
  } catch { /* 静默 */ }
}
```

- [ ] **Step 4: 跑测试确认通过 + 全量回归**

Run: `npx vitest run tests/cine-music.test.js && npx vitest run`
Expected: 全绿

- [ ] **Step 5: 提交**

```bash
git add src/audio/CineMusic.js tests/cine-music.test.js
git commit -m "feat: 过场程序化配乐（低音铺底 + 镜头 cue，静默降级）"
```

---

### Task 7: StoryScene 开场播放器

**Files:**
- Create: `src/scenes/StoryScene.js`
- Test: `tests/story-scene.test.js`

**Interfaces:**
- Consumes: Task 1 `buildOpeningTimeline/shotAt/canSkipStory`；Task 3/4 `OPENING_STAGES/buildStars`；Task 6 `startMusic/stopMusic/musicCue`；现有 `playCutscene(scene, { kind:'boot', to:'TitleScene', payload:{__cine:true} })`、`buildDust/drawDust`、Palette
- Produces: `StoryScene`（Phaser Scene，key `'StoryScene'`）；`window.__SIGILWEAVE_STORY__ = { phase, shot, index, elapsed, totalMs, skipped }`；结尾调 playCutscene 返回 false 时 `this.scene.stop()` 兜底

- [ ] **Step 1: 写失败测试**

```js
// tests/story-scene.test.js
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

vi.mock('phaser', () => {
  class Scene { constructor(config = {}) { this.config = config; this.events = new EventEmitter(); } }
  return { default: { Scene, Scenes: { Events: { CREATE: 'create', SHUTDOWN: 'shutdown' } } } };
});

vi.mock('../src/ui/Palette.js', async (importOriginal) => {
  const actual = await importOriginal();
  const fakeText = () => {
    const t = {
      text: '', alpha: 1,
      setOrigin: () => t, setAlpha: (v) => { t.alpha = v; return t; }, setDepth: () => t,
      setText: (s) => { t.text = s; return t; }, destroy: () => {},
    };
    return t;
  };
  return { ...actual, addText: () => fakeText() };
});

const music = { startMusic: vi.fn(), stopMusic: vi.fn(), musicCue: vi.fn() };
vi.mock('../src/audio/CineMusic.js', () => music);
vi.mock('../src/audio/Sfx.js', () => ({ sfx: { tick: () => {} } }));
const transition = { playCutscene: vi.fn(() => true) };
vi.mock('../src/ui/transition.js', () => transition);

import StoryScene from '../src/scenes/StoryScene.js';
import { buildOpeningTimeline } from '../src/data/story.js';

function makeGraphics() {
  const g = {
    clear: () => g, fillStyle: () => g, fillRect: () => g, lineStyle: () => g,
    lineBetween: () => g, strokePoints: () => g, fillPoints: () => g, setDepth: () => g,
  };
  return g;
}

function makeHarness() {
  const calls = [];
  const scene = new StoryScene();
  scene.scene = { stop: () => calls.push(['stop']), };
  scene.cameras = { main: { setZoom() {}, centerOn() {} } };
  scene.add = { graphics: () => makeGraphics() };
  scene.input = { keyboard: { on() {}, off() {} }, on() {}, off() {} };
  scene.events = new EventEmitter();
  scene.init();
  scene.create();
  return { scene, calls };
}

function advance(scene, ms, step = 16) {
  let left = ms;
  while (left > 0 && !scene.finished) {
    const dt = Math.min(step, left);
    scene.update(0, dt);
    left -= dt;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  transition.playCutscene.mockReturnValue(true);
  globalThis.window = { location: { search: '' }, __SIGILWEAVE_STORY__: null };
});

describe('StoryScene 开场状态机', () => {
  it('create 起配乐并发布状态；镜头按时间轴推进', () => {
    const { scene } = makeHarness();
    expect(music.startMusic).toHaveBeenCalledWith('opening');
    expect(window.__SIGILWEAVE_STORY__.totalMs).toBe(36000);
    advance(scene, 100);
    expect(window.__SIGILWEAVE_STORY__.shot).toBe('skyfall');
    advance(scene, 6000);
    expect(window.__SIGILWEAVE_STORY__.shot).toBe('contracts');
    expect(music.musicCue).toHaveBeenCalledWith('chime');
    advance(scene, 12000);
    expect(window.__SIGILWEAVE_STORY__.shot).toBe('altar');
  });

  it('宽限期内跳过无效，宽限期后跳过直达 boot 交接', () => {
    const { scene } = makeHarness();
    advance(scene, 100);
    scene.onSkip({ type: 'keydown' });
    expect(scene.finished).toBe(false);
    advance(scene, 100);
    scene.onSkip({ type: 'keydown' });
    expect(scene.finished).toBe(true);
    expect(scene.skipped).toBe(true);
    expect(transition.playCutscene).toHaveBeenCalledWith(scene, {
      kind: 'boot', to: 'TitleScene', payload: { __cine: true },
    });
    expect(music.stopMusic).toHaveBeenCalled();
  });

  it('按键 repeat 不触发跳过；finish 幂等', () => {
    const { scene } = makeHarness();
    advance(scene, 300);
    scene.onSkip({ type: 'keydown', repeat: true });
    expect(scene.finished).toBe(false);
    scene.onSkip({ type: 'keydown' });
    scene.onSkip({ type: 'keydown' });
    expect(transition.playCutscene).toHaveBeenCalledTimes(1);
  });

  it('播完 36 秒自动交接标题', () => {
    const { scene } = makeHarness();
    advance(scene, 37000);
    expect(scene.finished).toBe(true);
    expect(scene.skipped).toBe(false);
    expect(transition.playCutscene).toHaveBeenCalledTimes(1);
  });

  it('过场被禁用（playCutscene 返回 false）时自己停掉，不软锁', () => {
    transition.playCutscene.mockReturnValue(false);
    const { scene, calls } = makeHarness();
    advance(scene, 37000);
    expect(calls).toContainEqual(['stop']);
  });

  it('SHUTDOWN 停配乐并发布 done', () => {
    const { scene } = makeHarness();
    scene.events.emit('shutdown');
    expect(music.stopMusic).toHaveBeenCalled();
    expect(window.__SIGILWEAVE_STORY__.phase).toBe('done');
  });

  it('最后一镜标题文字淡入，其余镜头隐藏', () => {
    const { scene } = makeHarness();
    advance(scene, 1000);
    expect(scene.titleText.alpha).toBe(0);
    advance(scene, 33000);
    expect(scene.shotIndex).toBe(5);
    expect(scene.titleText.alpha).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/story-scene.test.js`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 StoryScene.js**

```js
// src/scenes/StoryScene.js
// 全屏开场播放器：按分镜时间轴推进镜头，字幕淡入淡出，任意键/点击跳过（150ms 宽限）。
// 结尾走现有 playCutscene(boot)：标题页在覆盖层底下创建并冻结，揭开才放行——无缝交接复用已验收机制。
import Phaser from 'phaser';
import {
  HEX, addText, getRenderScale, isPortrait, CANVAS_H_PORTRAIT, BASE_W, BASE_H, FONT_DISPLAY,
} from '../ui/Palette.js';
import { buildOpeningTimeline, shotAt, canSkipStory } from '../data/story.js';
import { OPENING_STAGES, buildStars } from '../ui/story-art.js';
import { buildDust, drawDust, clamp01, easeOutCubic } from '../ui/cinematic-art.js';
import { playCutscene } from '../ui/transition.js';
import { startMusic, stopMusic, musicCue } from '../audio/CineMusic.js';
import { sfx } from '../audio/Sfx.js';

export default class StoryScene extends Phaser.Scene {
  constructor() {
    super({ key: 'StoryScene' });
  }

  init() {
    this.timeline = buildOpeningTimeline();
    this.elapsed = 0;
    this.shotIndex = -1;
    this.finished = false;
    this.skipped = false;
  }

  create() {
    const W = BASE_W;
    const H = isPortrait() ? CANVAS_H_PORTRAIT : BASE_H;
    this.W = W;
    this.H = H;
    const cam = this.cameras.main;
    cam.setZoom(getRenderScale());
    cam.centerOn(W / 2, H / 2);

    this.stageG = this.add.graphics().setDepth(0);
    this.dustG = this.add.graphics().setDepth(1);
    this.dust = buildDust(0x51c7, 40, W, H);
    this.stars = buildStars(0x9e37, 46, W, H);

    const tall = isPortrait();
    this.subtitle = addText(this, W / 2, Math.round(H * (tall ? 0.62 : 0.86)), '', tall ? 11 : 10, HEX.parchment, {
      align: 'center', wordWrap: { width: W - 80 }, lineSpacing: 4,
      stroke: '#0d0a17', strokeThickness: 2,
    }).setOrigin(0.5, 0).setDepth(2).setAlpha(0);

    this.titleText = addText(this, W / 2, Math.round(H * (tall ? 0.34 : 0.4)), '共振法阵', tall ? 40 : 34, HEX.parchment, {
      fontFamily: FONT_DISPLAY, letterSpacing: 8, stroke: '#0d0a17', strokeThickness: 3,
      shadow: { offsetX: 2, offsetY: 2, color: '#0d0a17', blur: 0, fill: true },
    }).setOrigin(0.5).setDepth(2).setAlpha(0);

    this.hint = addText(this, W / 2, H - 14, '任意键 / 点击 跳过', tall ? 9 : 8, HEX.mute, {})
      .setOrigin(0.5, 1).setDepth(2).setAlpha(0.7);

    this.input.keyboard.on('keydown', this.onSkip, this);
    this.input.on('pointerdown', this.onSkip, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard.off('keydown', this.onSkip, this);
      this.input.off('pointerdown', this.onSkip, this);
      stopMusic();
      this.publish('done');
    });
    startMusic('opening');
    this.publish('playing');
  }

  onSkip(event) {
    if (this.finished) return;
    if (event && event.type === 'keydown' && event.repeat) return;
    if (!canSkipStory(this.elapsed)) return;
    this.skipped = true;
    sfx.tick?.();
    this.finish();
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    stopMusic();
    this.publish('done');
    const handed = playCutscene(this, { kind: 'boot', to: 'TitleScene', payload: { __cine: true } });
    // 过场被禁用时 playCutscene 已直接切到标题；这里停掉自己即可
    if (!handed) this.scene.stop();
  }

  publish(phase) {
    window.__SIGILWEAVE_STORY__ = {
      phase,
      shot: this.timeline.shots[this.shotIndex]?.id ?? null,
      index: this.shotIndex,
      elapsed: Math.round(this.elapsed),
      totalMs: this.timeline.totalMs,
      skipped: this.skipped,
    };
  }

  update(time, delta) {
    if (this.finished) return;
    this.elapsed += Math.min(64, Number(delta) || 16);
    if (this.elapsed >= this.timeline.totalMs) {
      this.finish();
      return;
    }
    const cur = shotAt(this.elapsed, this.timeline);
    if (cur.index !== this.shotIndex) {
      this.shotIndex = cur.index;
      this.subtitle.setText(cur.shot.subtitle);
      musicCue(cur.shot.cue);
    }
    const accent = 0xc9a227;
    this.stageG.clear();
    OPENING_STAGES[cur.shot.stage](this.stageG, {
      w: this.W, h: this.H, t: cur.t, p: cur.p, accent, stars: this.stars,
    });
    this.dustG.clear();
    drawDust(this.dustG, this.dust, { h: this.H, t: this.elapsed, accent, alpha: 0.5 });

    const fadeIn = clamp01(cur.t / 500);
    const fadeOut = clamp01((cur.shot.ms - cur.t) / 500);
    this.subtitle.setAlpha(cur.shot.subtitle ? Math.min(fadeIn, fadeOut) : 0);
    this.titleText.setAlpha(cur.shot.id === 'title' ? easeOutCubic(clamp01((cur.p - 0.3) / 0.5)) : 0);
    this.publish('playing');
  }
}
```

- [ ] **Step 4: 跑测试确认通过 + 全量回归**

Run: `npx vitest run tests/story-scene.test.js && npx vitest run`
Expected: 全绿

- [ ] **Step 5: 提交**

```bash
git add src/scenes/StoryScene.js tests/story-scene.test.js
git commit -m "feat: StoryScene 全屏开场播放器（分镜推进/跳过/无缝交接标题）"
```

---

### Task 8: CutsceneScene 接入 journey

**Files:**
- Modify: `src/scenes/CutsceneScene.js`
- Test: `tests/cutscene-scene.test.js`（追加 describe 块 + harness 小改）

**Interfaces:**
- Consumes: Task 1 `JOURNEYS`；Task 5 `JOURNEY_STAGES`；Task 3 `buildStars`；Task 6 `startMusic/stopMusic`；Task 2 `buildTimeline('journey')/buildCard('journey')===null`
- Produces: `kind:'journey'` 时 hold 阶段播 journey 舞台 + 角标/字幕，盖场/换场/冻结/揭开/跳过机制不变；`resumeTarget` 与 SHUTDOWN 停配乐

- [ ] **Step 1: 追加失败测试**

`tests/cutscene-scene.test.js` 顶部 mock 区追加：
```js
const music = { startMusic: vi.fn(), stopMusic: vi.fn(), musicCue: vi.fn() };
vi.mock('../src/audio/CineMusic.js', () => music);
```

harness 小改（保持既有默认行为不变）：`makeHarness` 里
```js
  const targetKey = data?.to ?? 'IntermissionScene';
  const target = { key: targetKey, events: new EventEmitter() };
```
manager.get 改为：
```js
    get(key) { return key === targetKey ? target : { key, events: new EventEmitter() }; },
```

末尾追加：
```js
describe('journey 幕间演出', () => {
  it('不压标题卡，创建角标/字幕并起配乐', () => {
    const { overlay } = makeHarness({ kind: 'journey', act: 2, from: 'IntermissionScene', to: 'BattleScene' });
    expect(overlay.cardData).toBeNull();
    expect(overlay.journey.label).toBe('第贰幕 · 腐沼教堂');
    expect(music.startMusic).toHaveBeenCalledWith('journey');
  });

  it('演出期间目标战斗在底下冻结，揭开才放行，全程不软锁', () => {
    const { overlay, target, manager, timers } = makeHarness({ kind: 'journey', act: 2, from: 'IntermissionScene', to: 'BattleScene' });
    advance(overlay, overlay.timeline.coverMs + 20);
    target.events.emit('create', target);
    runZeroTimers(timers);
    expect(manager.isPaused('BattleScene')).toBe(true);
    advance(overlay, 3000);
    expect(manager.isPaused('BattleScene')).toBe(true);
    expect(overlay.finished).toBe(false);
    advance(overlay, 3000);
    expect(overlay.finished).toBe(true);
    expect(manager.isPaused('BattleScene')).toBe(false);
    expect(music.stopMusic).toHaveBeenCalled();
  });

  it('跳过 journey：先换场钉到揭开点，第二次直接结束', () => {
    const { overlay, target, manager, timers } = makeHarness({ kind: 'journey', act: 3, from: 'IntermissionScene', to: 'BattleScene' });
    advance(overlay, 200);
    overlay.onSkipInput({ type: 'keydown' });
    expect(overlay.skipped).toBe(true);
    expect(overlay.elapsed).toBe(overlay.timeline.revealAt);
    advance(overlay, 32);
    target.events.emit('create', target);
    runZeroTimers(timers);
    advance(overlay, 32);
    expect(overlay.resumed).toBe(true);
    overlay.onSkipInput({ type: 'keydown' });
    expect(overlay.finished).toBe(true);
    expect(manager.isPaused('BattleScene')).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/cutscene-scene.test.js`
Expected: FAIL（overlay.journey undefined / startMusic 未调用）

- [ ] **Step 3: 实现 CutsceneScene journey 分支**

`src/scenes/CutsceneScene.js` 修改（机制代码一行不动，只加分支）：

import 区追加：
```js
import { JOURNEYS } from '../data/story.js';
import { JOURNEY_STAGES, buildStars } from '../ui/story-art.js';
import { startMusic, stopMusic } from '../audio/CineMusic.js';
```

`create()` 里 `this.dust = buildDust(...)` 之后追加：
```js
    // journey：不压标题卡，改播单镜头演出 + 角标/字幕
    if (this.options.kind === 'journey') {
      this.journey = JOURNEYS[this.options.act] ?? JOURNEYS[2];
      this.stars = buildStars(0x9e37 + this.options.act, 46, W, H);
      const tall = isPortrait();
      this.jLabel = addText(this, 14, tall ? 14 : 12, this.journey.label, tall ? 9 : 8, hexOf(this.journey.accent), {
        letterSpacing: 2,
      }).setOrigin(0, 0).setDepth(4).setAlpha(0);
      this.jSubtitle = addText(this, this.cx, Math.round(H * (tall ? 0.6 : 0.84)), this.journey.subtitle, tall ? 11 : 10, HEX.parchment, {
        align: 'center', wordWrap: { width: W - 90 }, lineSpacing: 4,
        stroke: '#0d0a17', strokeThickness: 2,
      }).setOrigin(0.5, 0).setDepth(4).setAlpha(0);
      startMusic('journey');
    }
```

SHUTDOWN 回调里 `window.__SIGILWEAVE_CUTSCENE__ = {...}` 之前加一行 `stopMusic();`。

`resumeTarget()` 里 `sfx.cineReveal?.(this.options.kind);` 前加一行 `stopMusic();`。

`update()` 里 accent/tint 取值改为：
```js
    const accent = this.cardData?.accent ?? this.journey?.accent ?? 0xc9a227;
    const tint = this.cardData?.tint ?? this.journey?.tint ?? 0x241c3a;
```

`update()` 里 `drawVeil(...)` 调用之后、原 `drawStage(...)` 之前插入 journey 分支（提前 return，跳过符环/标题卡绘制）：
```js
    drawVeil(this.veilG, { w: this.W, h: this.H, cover, tint, kind });

    // journey：hold 阶段是单镜头演出，不画中央符环与标题卡
    if (kind === 'journey' && this.journey) {
      const jt = Math.max(0, this.elapsed - tl.coverMs);
      const jp = clamp01(jt / tl.holdMs);
      this.stageG.clear();
      JOURNEY_STAGES[this.journey.stage](this.stageG, {
        w: this.W, h: this.H, t: jt, p: jp, accent, stars: this.stars,
      });
      this.dustG.clear();
      drawDust(this.dustG, this.dust, { h: this.H, t: this.elapsed, accent, alpha: veil });
      const ta = clamp01((veil - 0.55) / 0.45);
      this.jLabel.setAlpha(ta);
      this.jSubtitle.setAlpha(ta);
      if (this.elapsed >= tl.revealAt && this.targetReady) this.resumeTarget();
      if (this.lastPhase !== phase.phase) this.publish(phase.phase);
      if (this.elapsed >= tl.totalMs) this.finish();
      else this.publish(phase.phase);
      return;
    }
```
（原 `drawVeil` 行被新分支前移取代，不要重复调用。）

- [ ] **Step 4: 跑测试确认通过 + 全量回归**

Run: `npx vitest run tests/cutscene-scene.test.js && npx vitest run`
Expected: 全绿（既有 8 类过场用例必须仍绿）

- [ ] **Step 5: 提交**

```bash
git add src/scenes/CutsceneScene.js tests/cutscene-scene.test.js
git commit -m "feat: CutsceneScene 接入 journey 幕间演出（复用冻结/揭开/跳过机制）"
```

---

### Task 9: 全流程接线（Boot / Intermission / main）

**Files:**
- Modify: `src/scenes/BootScene.js:82-88`（create 分支）
- Modify: `src/scenes/IntermissionScene.js:486`（kind 改 journey）
- Modify: `src/main.js:7-14,54`（注册 StoryScene）
- Test: `tests/boot-story.test.js`（新建）

**Interfaces:**
- Consumes: Task 7 StoryScene；现有 `cutscenesDisabled()`
- Produces: 正常路径 Boot→StoryScene；`?cine=0`/`?stress=1`/`?scene=` 保持原 playCutscene(boot) 路径；幕间出发 kind='journey'

- [ ] **Step 1: 写失败测试**

```js
// tests/boot-story.test.js
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

vi.mock('phaser', () => {
  class Scene { constructor(config = {}) { this.config = config; this.events = new EventEmitter(); } }
  return { default: { Scene, Scenes: { Events: { CREATE: 'create', SHUTDOWN: 'shutdown' } } } };
});
vi.mock('../src/ui/Palette.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, applyPixelZoom: () => {} };
});

import BootScene from '../src/scenes/BootScene.js';

function makeBoot(search) {
  globalThis.window = { location: { search } };
  const calls = [];
  const scene = new BootScene();
  scene.scene = {
    key: 'BootScene',
    start: (key) => calls.push(['start', key]),
    launch: (key, data) => calls.push(['launch', key, data]),
    isActive: () => false,
    get: () => undefined,
  };
  scene.cameras = { main: { setBackgroundColor() {} } };
  scene.textures = { exists: () => false };
  scene.anims = { exists: () => false, create() {} };
  scene.create();
  return calls;
}

describe('BootScene 开场接线', () => {
  it('正常路径进 StoryScene 播开场', () => {
    const calls = makeBoot('');
    expect(calls).toContainEqual(['start', 'StoryScene']);
  });

  it('?cine=0 不播开场，保持原 boot 过场入口（无覆盖层时直达标题）', () => {
    const calls = makeBoot('?cine=0');
    expect(calls.some(c => c[1] === 'StoryScene')).toBe(false);
    expect(calls).toContainEqual(['start', 'TitleScene']);
  });

  it('?stress=1 同样不播开场', () => {
    const calls = makeBoot('?stress=1');
    expect(calls.some(c => c[1] === 'StoryScene')).toBe(false);
  });

  it('?scene=battle 调试直达不播开场', () => {
    const calls = makeBoot('?scene=battle');
    expect(calls.some(c => c[1] === 'StoryScene')).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/boot-story.test.js`
Expected: FAIL（正常路径仍走 playCutscene，没有 start StoryScene）

- [ ] **Step 3: 实现三处接线**

`src/scenes/BootScene.js`：import 行改为
```js
import { playCutscene, cutscenesDisabled } from '../ui/transition.js';
```
`create()` 改为：
```js
  create() {
    this.createAnims();
    applyPixelZoom(this);
    this.cameras.main.setBackgroundColor('#0d0a17');
    const params = new URLSearchParams(window.location.search);
    // 调试/压测/调试直达保持原路径；正常路径先播全屏开场，再由开场交接标题
    if (cutscenesDisabled() || params.get('scene')) {
      playCutscene(this, { kind: 'boot', to: 'TitleScene', payload: { __cine: true } });
      return;
    }
    this.scene.start('StoryScene');
  }
```

`src/scenes/IntermissionScene.js:486`：`kind: 'act'` 改 `kind: 'journey'`，上方注释改为：
```js
    // 幕间 → 下一幕：journey 单镜头演出（5.8s），再落到新地图
```

`src/main.js`：import 区加 `import StoryScene from './scenes/StoryScene.js';`；场景列表改为：
```js
  scene: [BootScene, TitleScene, LoadoutScene, BattleScene, IntermissionScene, GameOverScene, StoryScene, CutsceneScene],
```

- [ ] **Step 4: 跑测试确认通过 + 全量回归 + 构建**

Run: `npx vitest run && npm run build`
Expected: 全绿 + 构建通过

- [ ] **Step 5: 提交**

```bash
git add src/scenes/BootScene.js src/scenes/IntermissionScene.js src/main.js tests/boot-story.test.js
git commit -m "feat: 接线开场与幕间 journey（Boot→StoryScene，幕间出发改 journey）"
```

---

### Task 10: 真实浏览器验收 + 文档

**Files:**
- Create: `scripts/story-shot.mjs`
- Create: `docs/开场与幕间.md`（验收后写真实结果）
- 产出: `docs/story/*.png` + `docs/story/verify.json`

**Interfaces:**
- Consumes: 全部前序任务；`scripts/static-server.mjs`；现有 `window.__SIGILWEAVE_STORY__ / __SIGILWEAVE_CUTSCENE__ / __SIGILWEAVE_BATTLE__ / __SIGILWEAVE_WORKSHOP__`
- Produces: 验收证据（截图 + verify.json），规格第八节的硬性门槛

- [ ] **Step 1: 写验收脚本**

```js
// scripts/story-shot.mjs
// 开场与幕间 journey 真实浏览器验收：逐镜截图 + 无缝/跳过断言。
//   npm run build
//   node scripts/static-server.mjs dist 4174
//   BASE_URL=http://127.0.0.1:4174 node scripts/story-shot.mjs
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4174';
const OUT = process.env.OUT_DIR ?? 'docs/story';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'msedge' });
const report = { ok: false, shots: [], errors: [], checks: [] };
const check = (name, pass, detail) => {
  report.checks.push({ name, pass: !!pass, detail });
  if (!pass) throw new Error('验收失败：' + name + (detail ? ' — ' + detail : ''));
};

try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', e => report.errors.push(e.message));
  const shot = async (name) => {
    await page.screenshot({ path: OUT + '/' + name + '.png' });
    report.shots.push(name);
  };
  const settle = async (key) => {
    await page.waitForFunction(k => window.__SIGILWEAVE__?.scene.isActive(k)
      && !window.__SIGILWEAVE__?.scene.isActive('CutsceneScene')
      && !window.__SIGILWEAVE__?.scene.isActive('StoryScene'), key, { timeout: 20000 });
    await page.waitForTimeout(300);
  };

  // 1) 开场六镜逐镜截图
  await page.goto(BASE + '/?seed=story-shot', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__SIGILWEAVE_STORY__?.phase === 'playing', null, { timeout: 20000 });
  const total = await page.evaluate(() => window.__SIGILWEAVE_STORY__.totalMs);
  check('开场总时长 36000ms', total === 36000, String(total));
  for (const [i, id] of ['skyfall', 'contracts', 'graveyard', 'altar', 'awaken', 'title'].entries()) {
    await page.waitForFunction(k => window.__SIGILWEAVE_STORY__?.shot === k, id, { timeout: 20000 });
    await page.waitForTimeout(2500);
    await shot('0' + (i + 1) + '-opening-' + id);
  }

  // 2) 开场→标题无缝：boot 过场停留时标题页已在底下创建并冻结
  // 直接等 status===6（PAUSED）：freezeTarget 是 delayedCall(0)，targetReady 当帧可能还没落 pause
  await page.waitForFunction(() => window.__SIGILWEAVE_CUTSCENE__?.kind === 'boot'
    && window.__SIGILWEAVE_CUTSCENE__?.targetReady === true
    && window.__SIGILWEAVE__?.scene.getScene('TitleScene')?.sys.settings.status === 6, null, { timeout: 20000 });
  const under = await page.evaluate(() => ({
    titleStatus: window.__SIGILWEAVE__?.scene.getScene('TitleScene')?.sys.settings.status,
    cutActive: window.__SIGILWEAVE__?.scene.isActive('CutsceneScene'),
  }));
  check('boot 停留时标题页已在底下创建并冻结', under.cutActive && under.titleStatus === 6, JSON.stringify(under));
  await shot('07-boot-handoff');
  await settle('TitleScene');
  await shot('08-title');

  // 3) 跳过：重新加载，宽限期后一键跳过整段开场
  await page.goto(BASE + '/?seed=story-skip', { waitUntil: 'load' });
  await page.waitForFunction(() => (window.__SIGILWEAVE_STORY__?.elapsed ?? 0) > 250
    && window.__SIGILWEAVE_STORY__?.phase === 'playing', null, { timeout: 20000 });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__SIGILWEAVE_STORY__?.skipped === true, null, { timeout: 5000 });
  await settle('TitleScene');
  report.checks.push({ name: '开场跳过后仍落到标题页', pass: true });

  // 4) 标题→选套→第一幕（第一幕保持 act 标题卡）
  await page.keyboard.press('Enter');
  await settle('LoadoutScene');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__SIGILWEAVE_CUTSCENE__?.kind === 'act'
    && window.__SIGILWEAVE_CUTSCENE__?.phase === 'hold', null, { timeout: 20000 });
  const act1 = await page.evaluate(() => ({ ...window.__SIGILWEAVE_CUTSCENE__ }));
  check('第一幕仍是 act 标题卡', act1.act === 1 && act1.duration <= 1600, JSON.stringify(act1));
  await settle('BattleScene');

  // 5) 幕间→第二幕 journey：演出期间战斗在底下冻结
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    s.phase = 'bossDefeated'; s.bossDefeated = true; s.transitionLeft = 0; s.completeAct();
  });
  await page.waitForFunction(() => window.__SIGILWEAVE_CUTSCENE__?.kind === 'clear', null, { timeout: 20000 });
  await settle('IntermissionScene');
  await page.evaluate(() => {
    const w = window.__SIGILWEAVE_WORKSHOP__;
    w.workshop.roundsRemaining = 0;
    w.workshop.offer = null;
    w.depart();
    if (!w.departed) {
      window.__SIGILWEAVE__.scene.launch('CutsceneScene', {
        from: 'IntermissionScene', to: 'BattleScene',
        payload: { run: w.run, __cine: true }, kind: 'journey', act: 2,
      });
    }
  });
  await page.waitForFunction(() => window.__SIGILWEAVE_CUTSCENE__?.kind === 'journey'
    && window.__SIGILWEAVE_CUTSCENE__?.phase === 'hold'
    && window.__SIGILWEAVE_CUTSCENE__?.targetReady === true, null, { timeout: 20000 });
  const j2 = await page.evaluate(() => ({
    cut: { ...window.__SIGILWEAVE_CUTSCENE__ },
    battleStatus: window.__SIGILWEAVE__?.scene.getScene('BattleScene')?.sys.settings.status,
  }));
  check('journey 属于第 2 幕且时长 5840ms', j2.cut.act === 2 && j2.cut.duration === 5840, JSON.stringify(j2.cut));
  check('journey 演出期间战斗已在底下冻结', j2.battleStatus === 6, String(j2.battleStatus));
  await page.waitForTimeout(2000);
  await shot('09-journey-act2');
  await page.waitForFunction(() => window.__SIGILWEAVE_CUTSCENE__?.phase === 'reveal', null, { timeout: 10000 });
  await page.waitForTimeout(120);
  await shot('09b-journey-act2-reveal');
  await settle('BattleScene');
  const run2 = await page.evaluate(() => window.__SIGILWEAVE__?.scene.getScene('BattleScene')?.sys.settings.status);
  check('揭开后战斗正常运行', run2 === 5, String(run2));
  await shot('10-act2-battle');

  // 6) 幕间→第三幕 journey
  await page.evaluate(() => {
    const s = window.__SIGILWEAVE_BATTLE__;
    s.phase = 'bossDefeated'; s.bossDefeated = true; s.transitionLeft = 0; s.completeAct();
  });
  await page.waitForFunction(() => window.__SIGILWEAVE_CUTSCENE__?.kind === 'clear', null, { timeout: 20000 });
  await settle('IntermissionScene');
  await page.evaluate(() => {
    const w = window.__SIGILWEAVE_WORKSHOP__;
    w.workshop.roundsRemaining = 0;
    w.workshop.offer = null;
    w.depart();
    if (!w.departed) {
      window.__SIGILWEAVE__.scene.launch('CutsceneScene', {
        from: 'IntermissionScene', to: 'BattleScene',
        payload: { run: w.run, __cine: true }, kind: 'journey', act: 3,
      });
    }
  });
  await page.waitForFunction(() => window.__SIGILWEAVE_CUTSCENE__?.kind === 'journey'
    && window.__SIGILWEAVE_CUTSCENE__?.phase === 'hold', null, { timeout: 20000 });
  const j3 = await page.evaluate(() => ({ ...window.__SIGILWEAVE_CUTSCENE__ }));
  check('第二段 journey 属于第 3 幕', j3.act === 3, String(j3.act));
  await page.waitForTimeout(2000);
  await shot('11-journey-act3');
  await settle('BattleScene');

  // 7) journey 跳过不软锁：重开一局到幕间再跳过（直接用覆盖层注入验证跳过路径）
  await page.evaluate(() => {
    window.__SIGILWEAVE__.scene.launch('CutsceneScene', {
      from: 'BattleScene', to: 'BattleScene',
      payload: { run: window.__SIGILWEAVE_BATTLE__.run, __cine: true }, kind: 'journey', act: 3,
    });
  });
  await page.waitForFunction(() => window.__SIGILWEAVE_CUTSCENE__?.kind === 'journey', null, { timeout: 10000 });
  await page.waitForTimeout(300);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__SIGILWEAVE_CUTSCENE__?.skipped === true, null, { timeout: 5000 });
  await settle('BattleScene');
  const runAfterSkip = await page.evaluate(() => window.__SIGILWEAVE__?.scene.getScene('BattleScene')?.sys.settings.status);
  check('journey 跳过后战斗正常运行（不软锁）', runAfterSkip === 5, String(runAfterSkip));

  // 8) ?cine=0：开场不播，直达标题
  const nocine = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  nocine.on('pageerror', e => report.errors.push('cine0: ' + e.message));
  await nocine.goto(BASE + '/?cine=0', { waitUntil: 'load' });
  await nocine.waitForFunction(() => window.__SIGILWEAVE__?.scene.isActive('TitleScene'), null, { timeout: 20000 });
  const storyNever = await nocine.evaluate(() => window.__SIGILWEAVE_STORY__ == null);
  check('?cine=0 开场不播', storyNever, String(storyNever));
  await nocine.close();

  // 9) 竖屏：开场首镜 + 跳过落标题
  const portrait = await browser.newPage({ viewport: { width: 390, height: 844 } });
  portrait.on('pageerror', e => report.errors.push('portrait: ' + e.message));
  await portrait.goto(BASE + '/?seed=story-portrait', { waitUntil: 'load' });
  await portrait.waitForFunction(() => window.__SIGILWEAVE_STORY__?.phase === 'playing', null, { timeout: 20000 });
  await portrait.waitForTimeout(1500);
  await portrait.screenshot({ path: OUT + '/12-portrait-opening.png' });
  report.shots.push('12-portrait-opening');
  await portrait.keyboard.press('Enter');
  await portrait.waitForFunction(() => window.__SIGILWEAVE__?.scene.isActive('TitleScene')
    && !window.__SIGILWEAVE__?.scene.isActive('CutsceneScene')
    && !window.__SIGILWEAVE__?.scene.isActive('StoryScene'), null, { timeout: 20000 });
  await portrait.screenshot({ path: OUT + '/13-portrait-title.png' });
  report.shots.push('13-portrait-title');
  await portrait.close();

  report.ok = report.errors.length === 0;
  check('0 个 pageerror', report.errors.length === 0, report.errors.join(' | '));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await writeFile(OUT + '/verify.json', JSON.stringify(report, null, 2));
  await browser.close();
}
```

- [ ] **Step 2: 构建 + 起服务器 + 跑验收**

```bash
npm run build
node scripts/static-server.mjs dist 4174   # 后台起
BASE_URL=http://127.0.0.1:4174 node scripts/story-shot.mjs
```
Expected: 全部 check 通过、`report.ok === true`、截图落 `docs/story/`。
沙箱若 Playwright 报 EPERM：`TEMP=$PWD/.tmp/pw-temp TMP=$PWD/.tmp/pw-temp` 前缀重跑。
**任何 check 失败：先修代码再重跑，不许改断言迁就实现。**

- [ ] **Step 3: 全量回归**

Run: `npx vitest run && npm run build`
Expected: 全绿 + 构建通过

- [ ] **Step 4: 写验收文档**

创建 `docs/开场与幕间.md`：分镜表（引用规格）、真实浏览器验收结果（日期、环境、check 列表从 verify.json 摘录）、截图表格（相对路径引用 docs/story/*.png）、复跑命令、已知限制（首屏无手势时配乐静音）。同时改 `docs/过场动画.md` 第一节表格：幕间→二/三幕两行从 `act 1460ms` 更新为 `journey 5840ms`，并在文末加一段指向新文档。

- [ ] **Step 5: 提交**

```bash
git add scripts/story-shot.mjs docs/开场与幕间.md docs/过场动画.md docs/story/
git commit -m "test: 开场与幕间 journey 真实浏览器验收（逐镜截图+无缝断言）"
```

---

## Self-Review 记录

- **Spec 覆盖**：分镜数据→T1；journey 时间轴→T2；六镜绘制→T3/T4；journey 绘制→T5；配乐→T6；开场播放器→T7；幕间接入→T8；Boot/Intermission/main 接线与调试开关→T9；浏览器验收/文档→T10。规格第七节调试开关由 T9（cine=0/stress/scene）+ T10 第 8 步覆盖。规格第四节无缝保证由 T7/T8 复用现有机制 + T10 断言覆盖。
- **类型一致**：`OPENING_STAGES`/`JOURNEY_STAGES` 键名与 story.js 的 stage 字段一致（skyfall/contracts/graveyard/altar/awaken/title/swamp/star）；`shotAt` 返回 `{shot,index,p,t}` 与 StoryScene 消费一致；`JOURNEYS[act].label/subtitle/accent/tint/stage` 与 CutsceneScene 消费一致；CineMusic 三函数签名在 T6/T7/T8 一致。
- **已知风险**：T8  harness 改动保持默认行为；T10 第 7 步注入 journey 的 from/to 都是 BattleScene，swapScenes 会 stop 再 launch 同一场景——与现有 retry 路径同构，安全。