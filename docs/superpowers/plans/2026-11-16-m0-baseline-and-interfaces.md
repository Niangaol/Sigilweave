# M0 · 基线冻结与接口就位 实现计划（共振法阵 / Sigilweave）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把一份 30k 行单人项目切成三块互不重叠的代码所有权，落好双语内容管线（M0 以题库为样板）与引导挂接点，让三个人能在一周内各自提交而不撞车。

**Architecture:** 内容层从 `src/data/*.js` 里逐步拆出到 `content/*.json`（M0 先迁题库），文本一律 `{zh, en}`，靠 `src/logic/locale.js` 的 `t()` 在读取点取当前语言；`src/logic/bus.js` 提供零依赖事件总线，`BattleScene` 只往里发四个引导事件，表现层订阅；数值按「全局系数进 `constants.js`、单体数值留 `roster.js`」两层切开。每个任务都能独立跑测试、独立提交。

**Tech Stack:** Phaser 3.90、原生 JS ESM、Vite 8、Vitest 5、Node 24（本机）/ Node 22（CI）。不引入任何新依赖。

**Spec:** `docs/superpowers/specs/2026-11-16-tga2027-polish-roadmap-design.md`（v1.3）

**范围（v1.3 改口径，年糕选定）：** M0 的内容外置**只做题库与问答面板**（约 386 条）。叙事、场次卡、卡牌提示、标题页说明随 M1 各自功能重写一起迁，`roster.js` / `map-events.js` 随 M2 迁。完整波次表见下方「内容外置的分三波」.

## Global Constraints

- 三个人、每人每周约 10 小时；三个文件所有权块见 spec 第六节，**本计划的每个任务都标注了归属人**。
- `main` 永远可玩：任何任务结束时 `npm test` 必须全绿，失败的改动当天修，不回滚别人的东西。
- 现有 69 个测试文件必须保持全绿；新增测试只增不减。改断言时**只允许机械改写**（例如 `.question` → `.question.zh`），**不许改动断言里的中文字面量** —— 那些字面量是内容迁移「逐字一致」的唯一证据。
- 沙箱内跑测试必须带 `NODE_OPTIONS` 前缀：`export NODE_OPTIONS='--require ./scripts/sandbox-noexec.cjs' && npx vitest run --pool=threads`；`npm run build` 用 `./scripts/sandbox-netuse.cjs` 同法前缀。
- 文本一律 `{ "zh": "...", "en": "..." }` 两键对象，两键都必须非空；`en` 里不许出现中日韩字符，`en` 不许与 `zh` 完全相同。
- 英文文案**由 DeepSeek 初翻 + 人工逐条过一遍**，不是手写原创；术语按 Task 1 的术语表统一，不许一个词三种译法。
- 只保 PC，不做移动端；主交付是网页，exe 只是离线兜底。
- 不加新依赖；不迁移框架；不重写 TypeScript。
- `package.json`、`vite.config.js`、`.github/**`、`scripts/**` 归 A（年糕）独写；本计划里其他人需要动这三处的任务，必须先跟 A 说，由 A 落。

## 内容外置的分三波（spec 决策 13，v1.3 改口径）

实测清点：全项目约 **1000+ 条**玩家可见中文字面量，分布在 35 个文件里。原本 spec 要求 M0 全量迁完，但其中大半所在文件在 M1/M2 本来就要被重写（标题页重构、战斗反馈强化、构筑台改版、事件点表达），M0 全迁等于同一个文件迁两遍。年糕拍板：**M0 只迁题库**。

| 文件 | 中文字面量 | 波次 |
|---|---|---|
| `src/data/encounters.js` | 374 | **M0 迁移**（Task 8） |
| `src/ui/EncounterPanel.js` | 12 | **M0 迁移**（Task 8） |
| `src/data/story.js`（开场六镜/幕间/结局含名单） | 19 | M1 随「开场节奏重排」 |
| `src/data/cinematics.js`（七张场次卡） | 65 | M1 随「开场节奏重排」 |
| `src/data/card-hints.js`（26 条卡牌提示） | 26 | M1 随「战斗反馈强化」 |
| `src/scenes/TitleScene.js`（玩法说明整页） | 12 | M1 随「标题页重构」 |
| `src/scenes/BattleScene.js`（内联文案） | 95 | M1 随「战斗反馈强化」 |
| `src/scenes/IntermissionScene.js`（内联文案） | 92 | M1 随「构筑台改版」 |
| `src/logic/*`（校验与反馈消息） | ~117 | M1 |
| `src/data/roster.js`（符印/怪物名） | 72 | M2 随「敌人与 Boss 表达」 |
| `src/data/map-events.js`（事件点提示） | 41 | M2 随「事件点可发现性」 |
| 其余场景与 UI 零散文案 | ~90 | M1/M2 按文件重写节奏 |

**M0 为什么只挑题库**：题库与问答面板的内容形态已经定型（34 条遭遇、题面/线索/三选一/解析/成败文案），M1/M2 不会重写，迁一次就锁死；而且它是全项目文本量最大、结构最规整的一块（374 条），拿它当管线的样板最有说服力 —— 后面几波照抄同一套 `{zh,en}` + 校验器 + `t()` 取值即可。

**代价与对冲**：「全部可见文本双语」要到 M2 末才成立。对冲有三条：每波都带 en 态断言（不许有中文残留）；校验器随每波扩一类 schema，坏内容在 CI 就被拦；M4 留了整月做全量核对（spec 本来就有），Task 12 收口时用 `git grep` 列出剩余中文字面量清单交给 M1。

## Review Focus

这五件事 spec 没写死、但最可能坑到真实玩家，每个都在对应任务的测试里钉住（第 1、2、5 条在 M0 只看题库这一波，后续波次照同一套断言扩）：

1. **切到英文后仍有文案走中文**：任何没接 `t()` 的读取点都会在中英混排里露出来 —— Task 2/8 各有一条「en 态下取到英文」的断言；Task 12 用一次 `?lang=en` 全流程冒烟兜底。
2. **英文太长把 480×270 面板撑破**：`EncounterPanel` 的三选一按钮与题面是最危险的两处 —— Task 8 断言英文长度上限（选项 ≤ 40 字符，题面/解析 ≤ 200），并按 `getLocale() === 'en'` 收窄换行宽度。
3. **漏写 `en` 时界面静默变空**：`t()` 对坏数据返回 `''`，界面就白一块 —— Task 7 的校验器把「两键缺一」判为构建失败，Task 2 测 `t({zh})` 回退到中文而不是空串。
4. **引导状态机的乱序与重入**：玩家第二次装牌、跨幕升级、重复触发同一事件 —— Task 4 断言乱序不推进、重复不推进。
5. **内容 JSON 在 CI（Node 22）与本机（Node 24）加载不一致**：CI 只跑 vitest（走 Vite 转换），`with { type: 'json' }` 已在本机 Node 24 与 vitest 下实测通过；任何需要 `node` 直跑的脚本必须用 `JSON.parse(readFileSync())`，不许依赖 import 属性 —— Task 8 的验收步骤里有一条 `git grep` 检查。

---

### Task 1: 分工与协作文档 + 术语表

**归属：A（年糕）** ｜ 约 3 小时

**Files:**
- Create: `docs/分工与协作.md`

**Interfaces:**
- Produces: 全项目唯一的文件归属表。后续所有任务的「归属」都以本文档为准；跨块改动先查这张表。

- [ ] **Step 1: 写 `docs/分工与协作.md`，四个小节**

1. **文件归属表**：三列（A 年糕 / B 同学 B / C 同学 C），逐条列全路径。范围直接从 spec 第六节的三张表抄下来，补上本计划新增的 `content/**`、`src/tutorial/**`、`src/logic/locale.js`、`src/logic/bus.js`、`src/data/content-schema.js`、`scripts/verify-content.mjs`。写清一句：**同一个文件只归一个人，其他人提 issue/在同步里说，不直接改。**
2. **接口清单**：`t(value, locale)`、`isText(value)`、`createBus(options)`、`createTutorial(options)`、`TUTORIAL_STEPS`、`TUTORIAL_EVENTS`、`validateContent(files)`、`validateEncounters(json)`、`validateUiCopy(json)`，以及 `content/*.json` 的字段表。每个接口一行签名。字段表只列**已迁**的文件（M0 是 `encounters.json` 与 `ui-copy.json`），后续波次迁到哪写哪，不预先画饼。
3. **分支与合并纪律**：每周五出可玩版本；`main` 全绿；测试失败当天修；接口变更先同步；内容 JSON 不合规即构建失败。
4. **术语表**（中 → 英，一个词只有一个译法）：

| 中文 | 英文 |
|---|---|
| 符印 | sigil |
| 脉流 | pulse |
| 碎晶 | shard |
| 法阵 | sigil array |
| 契约 / 契约主 | pact / pact-lord |
| 残响祭坛 | Echo Altar |
| 幕 / 场 | act / stage |
| 幕间 | interlude |
| 构筑台 | workshop |
| 联组 | combo |
| 小 Boss / 大 Boss | miniboss / major boss |
| 题面 / 线索 / 解析 | question / clue / breakdown |
| 破局成功 / 破局失败 | pact broken / pact held |

- [ ] **Step 2: 校验文档里写的每个路径都真实存在**

```bash
node -e "const fs=require('fs');const t=fs.readFileSync('docs/分工与协作.md','utf8');const p=[...t.matchAll(/\`(src\/[^\`]+|content\/[^\`]+|scripts\/[^\`]+)\`/g)].map(m=>m[1]);const norm=p.map(x=>x.replace(/\/\*\*$/,''));const miss=norm.filter(x=>!fs.existsSync(x));console.log('paths:',p.length,'missing:',miss)"
```

Expected: `paths:` 大于 60，`missing: []`

- [ ] **Step 3: 校验文档链接没坏**

```bash
node scripts/check-docs.mjs
```

Expected: JSON 里 `"missing": []`

- [ ] **Step 4: Commit**

```bash
git add docs/分工与协作.md
git commit -m "docs: 三块文件所有权、接口清单与术语表"
```

---

### Task 2: 语言状态与 `t()` 取值器

**归属：A（年糕）** ｜ 约 4 小时 ｜ **无依赖，可最先做**

**Files:**
- Create: `src/logic/locale.js`
- Test: `tests/locale.test.js`

**Interfaces:**
- Produces:
  - `LOCALES: readonly string[]` = `['zh', 'en']`
  - `DEFAULT_LOCALE: string` = `'zh'`
  - `getLocale(): string`
  - `setLocale(next): string` —— 返回生效后的语言；非法输入不改变当前值
  - `t(value, locale = getLocale()): string` —— `string` 原样返回；`{zh,en}` 取对应键，缺该键回退 `zh`，再缺回退 `''`；其它类型返回 `''`

- [ ] **Step 1: 写失败测试 `tests/locale.test.js`**

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { LOCALES, DEFAULT_LOCALE, getLocale, setLocale, t } from '../src/logic/locale.js';

describe('语言状态', () => {
  beforeEach(() => { setLocale('zh'); });

  it('默认中文，可切英文，非法值被忽略', () => {
    expect(DEFAULT_LOCALE).toBe('zh');
    expect(LOCALES).toEqual(['zh', 'en']);
    expect(getLocale()).toBe('zh');
    expect(setLocale('en')).toBe('en');
    expect(getLocale()).toBe('en');
    expect(setLocale('fr')).toBe('en');
    expect(getLocale()).toBe('en');
    expect(setLocale(null)).toBe('en');
  });
});

describe('t() 取值', () => {
  beforeEach(() => { setLocale('zh'); });

  it('字符串原样返回；双语对象按当前语言取', () => {
    expect(t('原文')).toBe('原文');
    expect(t({ zh: '符印', en: 'sigil' })).toBe('符印');
    setLocale('en');
    expect(t({ zh: '符印', en: 'sigil' })).toBe('sigil');
  });

  it('缺英文回退中文，缺中文回退空串，都不是 [object Object]', () => {
    setLocale('en');
    expect(t({ zh: '仅中文' })).toBe('仅中文');
    expect(t({ en: 'only english' })).toBe('only english');
    expect(t({})).toBe('');
    expect(t(null)).toBe('');
    expect(t(undefined)).toBe('');
    expect(t(42)).toBe('');
  });

  it('显式 locale 参数覆盖当前语言', () => {
    expect(t({ zh: '甲', en: 'A' }, 'en')).toBe('A');
    expect(t({ zh: '甲', en: 'A' }, 'zh')).toBe('甲');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
export NODE_OPTIONS='--require ./scripts/sandbox-noexec.cjs'
npx vitest run tests/locale.test.js --pool=threads
```

Expected: FAIL，`Failed to resolve import "../src/logic/locale.js"`

- [ ] **Step 3: 实现 `src/logic/locale.js`**

纯模块，不碰 `window`/`localStorage`（持久化是 M1 设置面板的事，M0 只要纯逻辑，才能在 Node 里测）。

- [ ] **Step 4: 跑测试确认通过**

```bash
export NODE_OPTIONS='--require ./scripts/sandbox-noexec.cjs'
npx vitest run tests/locale.test.js --pool=threads
```

Expected: PASS，3 项

- [ ] **Step 5: Commit**

```bash
git add src/logic/locale.js tests/locale.test.js
git commit -m "feat: 语言状态与 t() 双语取值器"
```

---

### Task 3: 零依赖事件总线

**归属：A（年糕）** ｜ 约 4 小时 ｜ **无依赖，可与 Task 2 并行**

**Files:**
- Create: `src/logic/bus.js`
- Test: `tests/bus.test.js`

**Interfaces:**
- Produces:
  - `createBus({ onError } = {})` → `{ on(type, fn): unsubscribe, off(type, fn): void, emit(type, payload): number, clear(): void, count(type): number }`
  - `emit` 返回实际被调用的监听器数量；某个监听器抛错**不打断其余监听器**，错误交给 `onError(err, type)`
  - `on` 返回的 `unsubscribe()` 可重复调用且幂等
  - `emit` 过程中新增/移除监听器，不影响本轮已快照的调用

- [ ] **Step 1: 写失败测试 `tests/bus.test.js`**

```js
import { describe, it, expect, vi } from 'vitest';
import { createBus } from '../src/logic/bus.js';

describe('事件总线', () => {
  it('收发与计数', () => {
    const bus = createBus();
    const seen = [];
    bus.on('a', (p) => seen.push(p));
    bus.on('a', (p) => seen.push(p * 2));
    expect(bus.count('a')).toBe(2);
    expect(bus.emit('a', 3)).toBe(2);
    expect(seen).toEqual([3, 6]);
    expect(bus.emit('nobody', 1)).toBe(0);
  });

  it('退订只摘掉自己，且幂等', () => {
    const bus = createBus();
    const first = vi.fn();
    const second = vi.fn();
    const off = bus.on('a', first);
    bus.on('a', second);
    off();
    off();
    bus.emit('a', 1);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(bus.count('a')).toBe(1);
  });

  it('单个监听器抛错不打断其余监听器', () => {
    const errors = [];
    const bus = createBus({ onError: (err, type) => errors.push([type, err.message]) });
    const after = vi.fn();
    bus.on('a', () => { throw new Error('boom'); });
    bus.on('a', after);
    expect(bus.emit('a', 1)).toBe(2);
    expect(after).toHaveBeenCalledTimes(1);
    expect(errors).toEqual([['a', 'boom']]);
  });

  it('emit 期间退订不影响本轮', () => {
    const bus = createBus();
    const hits = [];
    const off = bus.on('a', () => { hits.push('first'); off(); });
    bus.on('a', () => hits.push('second'));
    bus.emit('a', 1);
    expect(hits).toEqual(['first', 'second']);
    bus.emit('a', 1);
    expect(hits).toEqual(['first', 'second', 'second']);
  });

  it('clear 清空全部', () => {
    const bus = createBus();
    bus.on('a', () => {});
    bus.on('b', () => {});
    bus.clear();
    expect(bus.count('a')).toBe(0);
    expect(bus.count('b')).toBe(0);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
export NODE_OPTIONS='--require ./scripts/sandbox-noexec.cjs'
npx vitest run tests/bus.test.js --pool=threads
```

Expected: FAIL，模块不存在

- [ ] **Step 3: 实现 `src/logic/bus.js`**

监听器存 `Map<string, Set<fn>>`；`emit` 先 `Array.from(set)` 快照再逐个调用，每个外面包 `try/catch`。

- [ ] **Step 4: 跑测试确认通过**

```bash
export NODE_OPTIONS='--require ./scripts/sandbox-noexec.cjs'
npx vitest run tests/bus.test.js --pool=threads
```

Expected: PASS，5 项

- [ ] **Step 5: Commit**

```bash
git add src/logic/bus.js tests/bus.test.js
git commit -m "feat: 零依赖事件总线，用于引导与表现层解耦"
```

---

### Task 4: 引导四步状态机

**归属：B（同学 B）** ｜ 约 6 小时 ｜ **依赖 Task 3**

**Files:**
- Create: `src/tutorial/steps.js`
- Test: `tests/tutorial-steps.test.js`

**Interfaces:**
- Consumes: `createBus` from `src/logic/bus.js`
- Produces:
  - `TUTORIAL_STEPS: readonly string[]` = `['move', 'place', 'cast', 'upgrade']`
  - `TUTORIAL_EVENTS` = `{ MOVE: 'player:moved', PLACE: 'board:card-placed', CAST: 'board:cast', UPGRADE: 'board:upgraded' }`（`Object.freeze`）
  - `createTutorial({ bus = null, onProgress = null } = {})` → `{ step(): string|null, index(): number, progress(): number, isComplete(): boolean, advance(type): { advanced: boolean, step: string|null, index: number, completed: boolean }, destroy(): void }`
  - `progress()` 返回 0..4 的已完成步数；完成时 `step()` 返回 `null`
  - 传入 `bus` 时自动订阅四个 `TUTORIAL_EVENTS` 的值；只接受**当前步**对应的事件，乱序与重复事件都返回 `advanced: false`

- [ ] **Step 1: 写失败测试 `tests/tutorial-steps.test.js`**

```js
import { describe, it, expect, vi } from 'vitest';
import { createBus } from '../src/logic/bus.js';
import { TUTORIAL_STEPS, TUTORIAL_EVENTS, createTutorial } from '../src/tutorial/steps.js';

describe('引导四步', () => {
  it('四个步骤与事件名固定', () => {
    expect(TUTORIAL_STEPS).toEqual(['move', 'place', 'cast', 'upgrade']);
    expect(TUTORIAL_EVENTS).toEqual({
      MOVE: 'player:moved', PLACE: 'board:card-placed',
      CAST: 'board:cast', UPGRADE: 'board:upgraded',
    });
  });

  it('按顺序走完四步后完成', () => {
    const tut = createTutorial();
    expect(tut.step()).toBe('move');
    expect(tut.progress()).toBe(0);
    expect(tut.advance(TUTORIAL_EVENTS.MOVE)).toMatchObject({ advanced: true, step: 'place', index: 1 });
    expect(tut.advance(TUTORIAL_EVENTS.PLACE).step).toBe('cast');
    expect(tut.advance(TUTORIAL_EVENTS.CAST).step).toBe('upgrade');
    expect(tut.advance(TUTORIAL_EVENTS.UPGRADE)).toMatchObject({ advanced: true, step: null, completed: true });
    expect(tut.progress()).toBe(4);
    expect(tut.isComplete()).toBe(true);
  });

  it('乱序与重复事件不推进', () => {
    const tut = createTutorial();
    expect(tut.advance(TUTORIAL_EVENTS.CAST).advanced).toBe(false);
    expect(tut.step()).toBe('move');
    tut.advance(TUTORIAL_EVENTS.MOVE);
    expect(tut.advance(TUTORIAL_EVENTS.MOVE).advanced).toBe(false);
    expect(tut.step()).toBe('place');
  });

  it('接总线后自动推进，onProgress 报每一步', () => {
    const bus = createBus();
    const seen = [];
    const tut = createTutorial({ bus, onProgress: (p) => seen.push(p) });
    bus.emit(TUTORIAL_EVENTS.MOVE, { at: 100 });
    bus.emit(TUTORIAL_EVENTS.PLACE, { at: 200 });
    expect(tut.index()).toBe(2);
    expect(seen).toEqual([1, 2]);
  });

  it('destroy 后退订，总线不再推进', () => {
    const bus = createBus();
    const tut = createTutorial({ bus });
    tut.destroy();
    bus.emit(TUTORIAL_EVENTS.MOVE, {});
    expect(tut.index()).toBe(0);
    expect(bus.count(TUTORIAL_EVENTS.MOVE)).toBe(0);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
export NODE_OPTIONS='--require ./scripts/sandbox-noexec.cjs'
npx vitest run tests/tutorial-steps.test.js --pool=threads
```

Expected: FAIL，模块不存在

- [ ] **Step 3: 实现 `src/tutorial/steps.js`**

纯逻辑，不 import `phaser`、不碰 DOM —— 引导的绘制在 M1 由 B 的 `src/tutorial/overlay.js` 负责，本任务只交付可测的状态机。

- [ ] **Step 4: 跑测试确认通过**

```bash
export NODE_OPTIONS='--require ./scripts/sandbox-noexec.cjs'
npx vitest run tests/tutorial-steps.test.js --pool=threads
```

Expected: PASS，5 项

- [ ] **Step 5: Commit**

```bash
git add src/tutorial/steps.js tests/tutorial-steps.test.js
git commit -m "feat: 引导四步状态机（纯逻辑，可在 Node 单测）"
```

---

### Task 5: `BattleScene` 只发事件、不画引导

**归属：A（年糕）** ｜ 约 6 小时 ｜ **依赖 Task 3、Task 4**

**Files:**
- Modify: `src/scenes/BattleScene.js`
- Test: `tests/tutorial-wiring.test.js`

**Interfaces:**
- Consumes: `createBus`、`createTutorial`、`TUTORIAL_EVENTS`
- Produces: `BattleScene` 实例上的 `this.tutorialBus`（`createBus()` 实例）与 `this.tutorial`（`createTutorial` 实例），供 M1 的表现层订阅；`this.emitTutorial(type)` 方法。**`BattleScene.js` 内不得出现任何 `tutorial` 相关的绘制代码。**

- [ ] **Step 1: 写失败测试 `tests/tutorial-wiring.test.js`**

测试只钉三件事：场景有总线、`emitTutorial` 在没总线时不炸、四个调用点没有被删掉。

```js
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('phaser', () => {
  class Scene { constructor(key) { this.key = key; } }
  return { default: { Scene, Core: { Events: { BLUR: 'blur', FOCUS: 'focus' } }, Scenes: { Events: { CREATE: 'create', SHUTDOWN: 'shutdown' } }, BlendModes: { ADD: 1 } } };
});
vi.mock('../src/ui/transition.js', () => ({ CUTSCENE_KEY: 'CutsceneScene', cutscenesDisabled: () => true, playCutscene: () => false }));
vi.mock('../src/audio/Sfx.js', () => ({ sfx: new Proxy({}, { get: () => () => {} }), toggleSound: () => {} }));

import BattleScene from '../src/scenes/BattleScene.js';
import { createBus } from '../src/logic/bus.js';
import { TUTORIAL_EVENTS } from '../src/tutorial/steps.js';

describe('BattleScene 的引导挂接点', () => {
  it('emitTutorial 把事件转给总线，没总线时静默', () => {
    const bus = createBus();
    const got = [];
    bus.on(TUTORIAL_EVENTS.MOVE, (p) => got.push(p));
    const scene = { tutorialBus: bus, time: { now: 1234 }, player: { x: 0, y: 0 } };
    BattleScene.prototype.emitTutorial.call(scene, TUTORIAL_EVENTS.MOVE);
    expect(got).toEqual([{ at: 1234, x: 0, y: 0 }]);
    expect(() => BattleScene.prototype.emitTutorial.call({}, TUTORIAL_EVENTS.MOVE)).not.toThrow();
  });

  it('四个引导事件在场景源码里各有一个调用点', () => {
    const src = readFileSync('src/scenes/BattleScene.js', 'utf8');
    for (const type of Object.values(TUTORIAL_EVENTS)) {
      expect(src).toContain('this.emitTutorial(TUTORIAL_EVENTS.');
    }
    expect(src.match(/this\.emitTutorial\(/g) ?? []).toHaveLength(4);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
export NODE_OPTIONS='--require ./scripts/sandbox-noexec.cjs'
npx vitest run tests/tutorial-wiring.test.js --pool=threads
```

Expected: FAIL，`BattleScene.prototype.emitTutorial is not a function` / 调用点数量为 0

- [ ] **Step 3: 实现**

1. `src/scenes/BattleScene.js` 顶部加 `import { createBus } from '../logic/bus.js';`、`import { createTutorial, TUTORIAL_EVENTS } from '../tutorial/steps.js';`
2. 在 `create()` 里（其余系统初始化之后、第一次 `update` 之前）加：

```js
this.tutorialBus = createBus();
this.tutorial = createTutorial({ bus: this.tutorialBus });
```

3. 在类里加方法（放在 `create()` 之后任意位置）：

```js
emitTutorial(type) {
  this.tutorialBus?.emit(type, { at: this.time?.now ?? 0, x: this.player?.x ?? 0, y: this.player?.y ?? 0 });
}
```

4. 接四个发点，语义按下面找落点（不是逐字照抄行号，落点按现有代码结构定）：
   - **走位**：`update()` 里玩家朝某个方向实际位移生效的那次分支 —— 只在**整局第一次**位移时发 `TUTORIAL_EVENTS.MOVE`（用一个 `this.moveSignaled` 布尔挡住重复发）。
   - **装牌**：玩家把第一张手牌落到格子并成功写入构筑的那条成功分支 —— 发 `TUTORIAL_EVENTS.PLACE`。
   - **投射**：引擎第一次成功触发一次投射（不是受阻、不是取消）的那条分支 —— 发 `TUTORIAL_EVENTS.CAST`。
   - **升级**：`levelUp` 结算分支里，等级真正提升之后 —— 发 `TUTORIAL_EVENTS.UPGRADE`。
   - 四处都用 `this.emitTutorial(...)`，不直接 `emit`，这样测试能一次钉死「事件只有一个出口」。

- [ ] **Step 4: 跑测试与全量回归**

```bash
export NODE_OPTIONS='--require ./scripts/sandbox-noexec.cjs'
npx vitest run tests/tutorial-wiring.test.js tests/battle-flow.test.js --pool=threads
npx vitest run --pool=threads
```

Expected: 两个文件 PASS；全量 PASS（原 1363 项 + 新增）

- [ ] **Step 5: Commit**

```bash
git add src/scenes/BattleScene.js tests/tutorial-wiring.test.js
git commit -m "feat: BattleScene 只发引导事件，表现层通过总线订阅"
```

---

### Task 6: 数值两层 —— 全局曲线搬进 `constants.js`

**归属：A（年糕）** ｜ 约 3 小时 ｜ **依赖 Task 1（归属表）**

**Files:**
- Modify: `src/logic/constants.js`（新增 `DIFFICULTY`、`ACT_DENSITY`）
- Modify: `src/data/roster.js:592-631`（删掉这两个常量的定义，改为从 constants 引入；`difficultyAt` 留在原地）
- Modify: `scripts/density-sim.mjs:26`
- Modify: `tests/density.test.js:4`
- Test: `tests/balance-layers.test.js`（新建）

**Interfaces:**
- Produces: `import { DIFFICULTY, ACT_DENSITY } from '../src/logic/constants.js'` —— 数值一分不动，只是换家。`src/data/roster.js` 不再导出这两个名字。
- 边界：**全局倍率与曲线** 归 `constants.js`（A 改）；**单体数值**（每个符印的 `damage`、每种敌人的 `hp`/`damage`、`PLAYER`）留 `roster.js`（C 改）。

- [ ] **Step 1: 写失败测试 `tests/balance-layers.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { DIFFICULTY, ACT_DENSITY } from '../src/logic/constants.js';
import * as roster from '../src/data/roster.js';

describe('数值两层', () => {
  it('全局难度曲线只定义在 constants.js', () => {
    expect(DIFFICULTY.rampMs).toBeGreaterThan(0);
    expect(ACT_DENSITY[1]).toEqual({ maxAlive: 1, spawnMs: 1 });
    expect(() => roster).not.toThrow();
  });

  it('roster.js 不再持有全局曲线', () => {
    expect(roster.DIFFICULTY).toBeUndefined();
    expect(roster.ACT_DENSITY).toBeUndefined();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
export NODE_OPTIONS='--require ./scripts/sandbox-noexec.cjs'
npx vitest run tests/balance-layers.test.js --pool=threads
```

Expected: FAIL，`DIFFICULTY` 不是 constants 的具名导出

- [ ] **Step 3: 实施搬迁**

1. 把 `src/data/roster.js` 里 `export const DIFFICULTY = {...}` 与 `export const ACT_DENSITY = {...}` 两块**原样**剪到 `src/logic/constants.js`（值、注释、顺序都不动），改成 `export const ...`。
2. `src/data/roster.js` 顶部加 `import { DIFFICULTY, ACT_DENSITY } from '../logic/constants.js';`，删掉原定义。
3. `scripts/density-sim.mjs:26` 与 `tests/density.test.js:4` 的 import 里，把 `DIFFICULTY`、`ACT_DENSITY` 移到从 `../src/logic/constants.js` 引入的那一行（`roster.js` 那一行只留 `ENEMY_TYPES`/`SIGILS`/`PLAYER`/`difficultyAt`/`pickEnemyType`）。
4. `git grep -n "DIFFICULTY\|ACT_DENSITY"` 复核：只有 `constants.js` 在定义，其余都是引用。

- [ ] **Step 4: 确认数值一分没变**

```bash
export NODE_OPTIONS='--require ./scripts/sandbox-noexec.cjs'
npx vitest run tests/density.test.js tests/balance-layers.test.js --pool=threads
```

Expected: 两个文件都 PASS，且 `tests/density.test.js` 里那些硬编码期望值（`66`、`73`、`79`、`88`、`94`、`100`、`107`，以及 `500 * 0.94` 等）**一个字符都没改**。若这些数变了，说明搬错了，回退重搬。

- [ ] **Step 5: Commit**

```bash
git add src/logic/constants.js src/data/roster.js scripts/density-sim.mjs tests/density.test.js tests/balance-layers.test.js
git commit -m "refactor: 全局难度曲线归 constants.js，单体数值留 roster.js"
```

---

### Task 7: 内容校验器（schema + CLI + CI）

**归属：C（同学 C）** ｜ 约 6 小时 ｜ **无依赖，可与 Task 2/3 并行**

**Files:**
- Create: `src/data/content-schema.js`
- Create: `scripts/verify-content.mjs`
- Modify: `package.json`（新增 `"verify:content": "node scripts/verify-content.mjs"`）
- Modify: `.github/workflows/pages.yml`（`npm ci` 之后加一行）
- Test: `tests/content-schema.test.js`

**Interfaces:**
- Produces:
  - `isText(value): boolean` —— 是不是合法的 `{zh, en}` 双非空字符串对象（只允许这两个键）
  - `collectTextErrors(node, path, maxLen, out): void` —— 递归找所有「看起来是文本」的位置并校验
  - `validateEncounters(json): string[]`、`validateUiCopy(json): string[]` —— 返回错误消息数组，空数组表示通过
  - `validateContent(files: Record<string, object>): string[]` —— 按文件名分派（M0 只有 `encounters` 与 `ui-copy`），未知文件名报错
  - 后续波次（`story` / `cinematics` / `cards` / `title`）在各自迁移任务里往这里加一个 `validateXxx` 并在 `validateContent` 里注册一行；M0 不提前写空壳
  - CLI：`node scripts/verify-content.mjs` 读 `content/*.json`，打印 `{ "ok": true, "errors": [] }` 或错误数组，有错时 `process.exitCode = 1`

- [ ] **Step 1: 写失败测试 `tests/content-schema.test.js`**

用内联 fixture，不依赖真实内容（这样校验器可以先于内容落地）：

```js
import { describe, it, expect } from 'vitest';
import { isText, validateEncounters, validateContent } from '../src/data/content-schema.js';

const enc = (over = {}) => ({
  id: 'npc-1', type: 'npc',
  name: { zh: '艾琳', en: 'Elyn' }, title: { zh: '守灯人', en: 'Lampkeeper' },
  clues: [{ id: 'a', text: { zh: '线索一', en: 'Clue one' } }, { id: 'b', text: { zh: '线索二', en: 'Clue two' } }],
  question: { zh: '应交给艾琳哪种灯油？', en: 'Which oil should you give Elyn?' },
  choices: [
    { id: 'silver', label: { zh: '银叶灯油', en: 'Silverleaf oil' } },
    { id: 'pine', label: { zh: '松脂灯油', en: 'Pine resin' } },
    { id: 'whale', label: { zh: '鲸脂灯油', en: 'Whale fat' } },
  ],
  correctChoiceId: 'silver',
  explanation: { zh: '守灯人说明了银叶。', en: 'The lampkeeper said silverleaf.' },
  successText: { zh: '白焰亮起。', en: 'The white flame lights.' },
  failureText: { zh: '错色的火焰。', en: 'Wrong-colored flame.' },
  reward: { shards: 8, heal: 15 }, penalty: { slowMs: 8000 },
  ...over,
});

describe('文本对象校验', () => {
  it('只认 zh+en 两个非空字符串', () => {
    expect(isText({ zh: '甲', en: 'A' })).toBe(true);
    expect(isText({ zh: '甲' })).toBe(false);
    expect(isText({ zh: '', en: 'A' })).toBe(false);
    expect(isText({ zh: '甲', en: 'A', fr: 'B' })).toBe(false);
    expect(isText('甲')).toBe(false);
  });
});

describe('遭遇内容校验', () => {
  it('合法样本无错误', () => {
    expect(validateEncounters({ 'npc-1': enc() })).toEqual([]);
  });

  it('缺 en、en 里混中文、en 与 zh 相同都会被挡', () => {
    expect(validateEncounters({ 'npc-1': enc({ name: { zh: '艾琳' } }) }).join()).toMatch(/name/);
    expect(validateEncounters({ 'npc-1': enc({ name: { zh: '艾琳', en: '艾琳' } }) }).join()).toMatch(/name/);
    expect(validateEncounters({ 'npc-1': enc({ question: { zh: '问', en: '问什么' } }) }).join()).toMatch(/question/);
  });

  it('选择题必须是三选一，且正确项在选项里', () => {
    const two = enc(); two.choices = two.choices.slice(0, 2);
    expect(validateEncounters({ 'npc-1': two }).join()).toMatch(/choices/);
    expect(validateEncounters({ 'npc-1': enc({ correctChoiceId: 'ghost' }) }).join()).toMatch(/correctChoiceId/);
  });

  it('题面不能直接包含正确选项的文案（不泄漏答案）', () => {
    const leak = enc(); leak.question = { zh: '银叶灯油是哪一个？', en: 'Which one is Silverleaf oil?' };
    expect(validateEncounters({ 'npc-1': leak }).join()).toMatch(/leak|泄漏/);
  });

  it('mini 必须 tier=mini 且有 bossId，npc 不许有 tier', () => {
    const mini = enc({ id: 'miniboss-1a', type: 'boss' });
    expect(validateEncounters({ 'miniboss-1a': mini }).join()).toMatch(/tier/);
    expect(validateEncounters({ 'npc-1': enc({ tier: 'mini' }) }).join()).toMatch(/tier/);
  });

  it('未知文件名报错', () => {
    expect(validateContent({ mystery: {} }).join()).toMatch(/mystery/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
export NODE_OPTIONS='--require ./scripts/sandbox-noexec.cjs'
npx vitest run tests/content-schema.test.js --pool=threads
```

Expected: FAIL，模块不存在

- [ ] **Step 3: 实现 `src/data/content-schema.js`**

校验规则（逐条落实，错误消息里要带 JSON 路径，例如 `encounters.npc-1.name`）：
- 文本对象：恰好 `zh`、`en` 两个键，都是非空字符串；`zh` 至少含一个中日韩字符；`en` 不含中日韩字符；`en !== zh`。
- 长度上限：`name`/`title`/`choice.label`/`star` ≤ 40 字（按 `zh` 计）；`clue`/`question`/`explanation`/`success`/`failure` ≤ 200 字。
- 遭遇：34 条；key 与 `id` 一致；`type ∈ {npc, boss}`；`clues` 恰好 2 条且 `id` 不重复；`choices` 恰好 3 个且 `id` 不重复；`correctChoiceId` 必须在 `choices` 里；`npc` 不得有 `tier`；`miniboss-` 前缀必须 `tier === 'mini'` 且 `bossId === id`；题面不得包含正确选项的 `zh` 文案（不泄漏答案）。
- 问答面板文案（`ui-copy`）：`encounterPanel` 下十个键一个不许少；每个都是合法文本对象；`bossRule`/`npcRule`/`note` 长度上限 200，按钮文案上限 40。

- [ ] **Step 4: 实现 `scripts/verify-content.mjs` 并接到 CI**

脚本用 `readFileSync` + `JSON.parse`（**不许**用 import 属性，Node 22 上不可靠），遍历 `content/*.json` 后调用 `validateContent`。

`package.json` 的 `scripts` 加一项：`"verify:content": "node scripts/verify-content.mjs"`。

`.github/workflows/pages.yml` 在 `- run: npm ci` 之后插入：

```yaml
      - run: npm run verify:content
```

- [ ] **Step 5: 跑测试与脚本**

```bash
export NODE_OPTIONS='--require ./scripts/sandbox-noexec.cjs'
npx vitest run tests/content-schema.test.js --pool=threads
node scripts/verify-content.mjs
```

Expected: 测试 PASS（6 项）；脚本此时因为 `content/` 还不存在而打印 `{ "ok": true, "errors": [] }`（空目录算通过），退出码 0。Task 8 落地 `content/` 之后这个脚本才真正开始拦东西。

- [ ] **Step 6: Commit**

```bash
git add src/data/content-schema.js scripts/verify-content.mjs package.json .github/workflows/pages.yml tests/content-schema.test.js
git commit -m "feat: 内容校验器与 CI 门禁，坏内容直接构建失败"
```

---

### Task 8: 问答链路双语化

**归属：C（同学 C）主导译稿，A（年糕）接 `src/data/encounters.js`，B（同学 B）改面板** ｜ 约 20 小时 ｜ **依赖 Task 2、Task 7**

**Files:**
- Create: `content/encounters.json`（34 条全量）
- Create: `content/ui-copy.json`（问答面板固定文案）
- Modify: `src/data/encounters.js`（改为 JSON 加载 + 保留原查询函数）
- Modify: `src/logic/encounters.js`（`isEncounterDefinition` 与 `finishEncounter` 的文本校验改用文本对象）
- Modify: `src/ui/EncounterPanel.js`（所有文本读取走 `t()`，固定文案走 `content/ui-copy.json`）
- Modify: `tests/encounters.test.js`（机械加 `.zh`，不改字面量）
- Test: `tests/encounter-i18n.test.js`（新建）

**Interfaces:**
- Consumes: `t()`、`isText()`、`validateEncounters()`
- Produces: `ENCOUNTERS` 的文本字段变成 `{zh, en}`；`src/logic/encounters.js` 的 `finishEncounter` 结果里 `text`、`explanation` 也变成 `{zh, en}`；`content/ui-copy.json` 的形状：

```json
{
  "encounterPanel": {
    "bossRule": { "zh": "答对：直接消灭Boss＋奖励  /  答错：进入Boss战", "en": "..." },
    "npcRule": { "zh": "答对：碎片＋治疗  /  答错：短时迟滞诅咒", "en": "..." },
    "cluesLabel": { "zh": "线索：", "en": "Clues: " },
    "note": { "zh": "先选答案，再确认；读题不限时，战斗已冻结。", "en": "..." },
    "confirm": { "zh": "确认作答", "en": "Confirm" },
    "success": { "zh": "破局成功", "en": "Pact broken" },
    "failure": { "zh": "破局失败", "en": "Pact held" },
    "breakdownLabel": { "zh": "解析：", "en": "Breakdown: " },
    "toBattle": { "zh": "准备战斗", "en": "To battle" },
    "continue": { "zh": "继续前进", "en": "Move on" }
  }
}
```

- [ ] **Step 1: 写失败测试 `tests/encounter-i18n.test.js`**

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { getEncounterById } from '../src/data/encounters.js';
import { createEncounterState, openEncounter, selectChoice, confirmChoice } from '../src/logic/encounters.js';
import { setLocale, t } from '../src/logic/locale.js';

describe('遭遇文本双语', () => {
  beforeEach(() => setLocale('zh'));

  it('34 条的每个文本字段都是 {zh, en}', () => {
    for (const def of Object.values(ENCOUNTERS)) {
      for (const key of ['name', 'title', 'question', 'explanation', 'successText', 'failureText']) {
        expect(Object.keys(def[key]).sort(), `${def.id}.${key}`).toEqual(['en', 'zh']);
      }
      for (const clue of def.clues) expect(Object.keys(clue.text).sort()).toEqual(['en', 'zh']);
      for (const choice of def.choices) expect(Object.keys(choice.label).sort()).toEqual(['en', 'zh']);
    }
  });

  it('中文逐字仍是原来那句（抽查三条）', () => {
    expect(ENCOUNTERS['npc-1'].question.zh).toBe('要点亮开门的白焰，应交给艾琳哪种灯油？');
    expect(ENCOUNTERS['npc-1'].clues[0].text.zh).toBe('守灯人：只有银叶灯油能点亮通往祭坛的白焰。');
    expect(ENCOUNTERS['npc-1'].choices[0].label.zh).toBe('银叶灯油');
  });

  it('英文态下取到英文，不是中文也不是空', () => {
    setLocale('en');
    const def = getEncounterById('npc-1');
    expect(t(def.question)).toMatch(/^[A-Za-z]/);
    expect(t(def.question)).not.toMatch(/[一-鿿]/);
    expect(t(def.question).length).toBeLessThanOrEqual(200);
  });

  it('结算结果里的文本也随语言切换', () => {
    const def = getEncounterById('npc-1');
    const state = createEncounterState();
    expect(openEncounter(state, def).ok).toBe(true);
    selectChoice(state, 'silver');
    const res = confirmChoice(state);
    expect(res.ok).toBe(true);
    expect(typeof t(state.result.text)).toBe('string');
    setLocale('en');
    expect(t(state.result.text)).not.toMatch(/[一-鿿]/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
export NODE_OPTIONS='--require ./scripts/sandbox-noexec.cjs'
npx vitest run tests/encounter-i18n.test.js --pool=threads
```

Expected: FAIL，`Object.keys(def.name)` 得到字符下标数组（还是字符串）

- [ ] **Step 3: 生成 `content/encounters.json`**

从 `src/data/encounters.js` 把 34 条**原样**搬成 JSON：非文本字段（`id`、`type`、`tier`、`bossId`、`correctChoiceId`、`reward`、`penalty`）保持原类型；文本字段（`name`、`title`、`clues[].text`、`question`、`choices[].label`、`explanation`、`successText`、`failureText`）改成 `{ "zh": 原文, "en": 译稿 }`。`zh` 必须逐字复制，一个标点都不改。

- [ ] **Step 4: 译 `en`**

DeepSeek 初翻 → 逐条人工过一遍。纪律：术语按 Task 1 术语表；`question` 的英文不许出现正确选项的英文文案（校验器会拦）；单条 `question`/`explanation` ≤ 200 字符，`label` ≤ 40 字符。

- [ ] **Step 5: 改 `src/data/encounters.js` 为 JSON 加载**

```js
import raw from '../../content/encounters.json' with { type: 'json' };
import { isValidStage, minorBossIdsOfStage } from '../logic/acts.js';

export const ENCOUNTERS = raw;
```

下面四个查询函数（`getEncounterForStage`/`getEncounterForAct`/`getEncounterById`/`getMinibossEncounters`）一字不改。文件头注释补一句：**内容在 `content/encounters.json`，本文件只做查询，不许再写文本。**

`with { type: 'json' }` 已在本机 Node 24 与 vitest 5 实测通过，Vite 构建时 JSON 会被内联。

- [ ] **Step 6: 改 `src/logic/encounters.js` 的文本校验**

把原来判断「字符串」的地方换成文本对象判断（`import { isText } from '../data/content-schema.js'`，或就地写等价判断）：`isEncounterDefinition` 里 `d.name`/`d.title`/`d.question`、每条 `clue.text`、每个 `choice.label`、以及 `finishEncounter` 产出的 `result.text`/`result.explanation` 都要通过同一套文本对象校验。

- [ ] **Step 7: 改 `src/ui/EncounterPanel.js`**

- `active.name + ' · ' + active.title` → `t(active.name) + ' · ' + t(active.title)`
- `active.clues.map(c => c.text).join(' ')` → `active.clues.map(c => t(c.text)).join(' ')`
- `active.question`、`result.text`、`result.explanation`、`choice.label` 全部套 `t()`
- 十条固定文案从 `content/ui-copy.json` 的 `encounterPanel` 取（`import uiCopy from '../../content/ui-copy.json' with { type: 'json' }`）
- 英文态下按钮文案要限宽：`drawButton` 的 `textExtra.wordWrap.width` 在 `getLocale() === 'en'` 时由 396/420 收到 380/404，避免溢出

- [ ] **Step 8: 机械更新 `tests/encounters.test.js`**

只改读取方式，不改字面量：`d.name` → `d.name.zh`、`d.question` → `d.question.zh`、`definition.choices` 里 `c.id` 不变、结果断言 `result.text` → `result.text.zh`。凡是出现了「把字符串改成 `{zh,en}`」的地方，都是加 `.zh`，不许动引号里的字。

- [ ] **Step 9: 跑测试与校验器**

```bash
export NODE_OPTIONS='--require ./scripts/sandbox-noexec.cjs'
npx vitest run tests/encounter-i18n.test.js tests/encounters.test.js --pool=threads
node scripts/verify-content.mjs
```

Expected: 测试全 PASS；校验器 `{ "ok": true, "errors": [] }`。若校验器报错，先修 JSON，别改校验器规则。

- [ ] **Step 10: 确认没有脚本依赖 import 属性**

```bash
git grep -ln "content/encounters.json" -- 'scripts/*'
```

Expected: 无输出（脚本一律走 `readFileSync`）

- [ ] **Step 11: Commit**

```bash
git add content/encounters.json content/ui-copy.json src/data/encounters.js src/logic/encounters.js src/ui/EncounterPanel.js tests/encounters.test.js tests/encounter-i18n.test.js
git commit -m "feat: 34 条遭遇外置为双语 JSON，问答面板按语言取值"
```

---

### Task 9: 试玩清单与 R1 报告模板

**归属：C（同学 C）** ｜ 约 4 小时 ｜ **无依赖**

**Files:**
- Create: `docs/试玩清单.md`
- Create: `docs/试玩报告/_模板.md`
- Create: `docs/试玩报告/README.md`

**Interfaces:**
- Produces: 后续每个里程碑的试玩记录都用 `_模板.md` 的字段；`docs/迭代记录总览.md` 追加轮次时引用报告文件名。

- [ ] **Step 1: 写 `docs/试玩清单.md`**

分五节，每节都是可勾选的条目（**不许**写「观察玩家反应」这类没法勾的话）：

1. **准备**：机器、浏览器、是否用 exe、是否静音、录屏开没开。
2. **不问不提示的前 5 分钟**：记录四个时间点 —— 开始走位、装第一张牌、第一次投射、第一次升级（各自用了多少秒）；超过 120 秒没发生就记「未发生」。
3. **卡点**：玩家停住超过 15 秒的位置、玩家说出口的原话（逐字记，不转述）。
4. **问答**：有没有看懂「答对能直接消灭 Boss」；有没有发现「不答也能硬打」；两条路径各选了几次。
5. **收尾三问**：「你觉得这游戏在让你做什么？」「哪里最烦？」「还想不想再玩一局？」

- [ ] **Step 2: 写 `docs/试玩报告/_模板.md`**

固定表头：日期、版本（`git rev-parse --short HEAD`）、人数、机器、时长；正文按清单五节填；结尾一句「本轮最该改的一件事」。

- [ ] **Step 3: 写 `docs/试玩报告/README.md`**

一句话：报告按 `YYYY-MM-<轮次>.md` 命名（`r1`/`r2`…），每轮一个文件；R1 目标是 5~8 人，凑不满就按实际人数记，**不许编数据**。

- [ ] **Step 4: 校验文档链接**

```bash
node scripts/check-docs.mjs
```

Expected: `"missing": []`

- [ ] **Step 5: Commit**

```bash
git add docs/试玩清单.md docs/试玩报告/
git commit -m "docs: 试玩清单与报告模板，四步引导按秒记录"
```

---

### Task 10: 前 15 分钟现状时间轴

**归属：C（同学 C）** ｜ 约 8 小时 ｜ **依赖 Task 9 的清单口径**

**Files:**
- Create: `docs/前15分钟时间轴.md`

**Interfaces:**
- Produces: M1/M2 的「开场节奏重排」以这份时间轴为基线；重排后要再跑一次，把两份并排放。

- [ ] **Step 1: 实机跑一遍并在文档里逐分钟记录**

从点开标题开始计时，一路玩到第 15 分钟，每分钟一行，四列：`分钟 | 玩家在做什么 | 屏幕上有什么反馈 | 这一段想不想继续`。

- [ ] **Step 2: 标出「空走段」**

凡是连续 20 秒以上只有走路、没有战斗/问答/事件点/过场的时段，在表格下方单列一张「空走段」表（起止分钟、时长、当时附近有没有事件点）。

- [ ] **Step 3: 写结论三条**

1. 第一个「好玩时刻」出现在第几分钟；
2. 最想放弃的一分钟是第几分钟、为什么；
3. M2 重排时最该往前挪的三件事（各一句话）。

- [ ] **Step 4: 校验文档链接**

```bash
node scripts/check-docs.mjs
```

Expected: `"missing": []`

- [ ] **Step 5: Commit**

```bash
git add docs/前15分钟时间轴.md
git commit -m "docs: 前 15 分钟现状时间轴与空走段清单"
```

---

### Task 11: UI 可读性现状清单（带截图）

**归属：B（同学 B）** ｜ 约 6 小时 ｜ **无依赖**

**Files:**
- Create: `docs/UI可读性清单.md`
- Create: `docs/screenshots/m0/*.png`

**Interfaces:**
- Produces: M1 的「战斗反馈强化」与 M2 的「事件点可发现性」都从这里取待办项；每条待办必须能指到某张截图的具体位置。

- [ ] **Step 1: 出截图**

```bash
export NODE_OPTIONS='--require ./scripts/sandbox-noexec.cjs'
npm run build
npm run preview -- --port 4173 &
node scripts/scene-shot.mjs
node scripts/board-shot.mjs
node scripts/text-shot.mjs
```

截图落到脚本默认目录后，挑出 6 张代表帧另存到 `docs/screenshots/m0/`：标题页、开场第一场战斗、怪群最密的一帧、问答面板（横屏）、场次卡、残响祭坛。

- [ ] **Step 2: 逐张标注**

每张截图写三行：**看到了什么** / **哪里看不清**（指到具体元素：玩家与怪的前景背景对比度、伤害数字、方位光迹、按钮文字、题面字号）/ **M1 或 M2 该怎么做**（一句话，可执行）。

- [ ] **Step 3: 汇总成待办表**

文档末尾一张表：`编号 | 问题 | 截图 | 归属阶段（M1/M2）| 负责人`，按「挡住理解玩法」优先排序。

- [ ] **Step 4: 校验文档链接（截图必须真实存在）**

```bash
node scripts/check-docs.mjs
```

Expected: `"missing": []`

- [ ] **Step 5: Commit**

```bash
git add docs/UI可读性清单.md docs/screenshots/m0/
git commit -m "docs: UI 可读性截图清单与分阶段待办"
```

---

### Task 12: 一个完整周循环收口

**归属：A（年糕）** ｜ 约 4 小时 ｜ **依赖前面全部任务**

**Files:**
- Create: `docs/分工与协作.md`（追加「M0 收口记录」一节）
- Modify: `README.md`（补一句「内容在 `content/*.json`，改文案不用碰代码」与 `npm run verify:content`）

**Interfaces:**
- Produces: M0 出口证据。spec 说 M0 出口是「三块所有权跑通一次完整周循环」，这一节就是那份证据。

- [ ] **Step 1: 三块各留一次提交证据**

```bash
git log --oneline --all -30
git log --pretty='%an %s' -20 | sort | uniq -c | sort -rn
```

Expected: 至少 3 位作者、每人至少一次提交（或在本机同一 git 用户下，用 commit 里的模块范围证明——`git show --stat` 能看到三块文件分别被改过）

- [ ] **Step 2: 全量门禁**

```bash
export NODE_OPTIONS='--require ./scripts/sandbox-noexec.cjs'
npx vitest run --pool=threads
node scripts/verify-content.mjs
node scripts/check-docs.mjs
npm run build      # 用 sandbox-netuse.cjs 前缀
```

Expected: 测试全 PASS（原 1363 项 + 本计划新增约 30 项）；校验器 `ok: true`；文档 `missing: []`；构建成功（只允许 chunk 体积警告）

- [ ] **Step 3: 英文态冒烟（只验题库这一波）**

M0 不做语言切换 UI（那是 M1 标题页重构的一部分），所以用一次性的默认语言改动来验：

1. 把 `src/logic/locale.js` 的 `DEFAULT_LOCALE` 临时改成 `'en'`；
2. `npm run dev`，浏览器打开 `http://127.0.0.1:5173`，玩到第一个 NPC；
3. 逐条核对：问答面板的题面、两条线索、三个选项、`确认作答`按钮、答完的`破局成功`/`解析`文字、`继续前进`/`准备战斗`按钮，**全部为英文且没有中文残留**；英文题面不溢出面板、按钮文字不撑破边框；
4. 把 `DEFAULT_LOCALE` 改回 `'zh'`，`git diff` 确认这一步没有留下任何改动。

Expected: 四类文案全英文，无溢出。**标题页、开场字幕、场次卡、结算报表此时仍是中文，属正常** —— 它们在 M1/M2 迁。发现题库一路有中文残留或溢出，记进 `docs/分工与协作.md` 的 M1 待办，不在本任务里修。

> 起 dev server 用: `export NODE_OPTIONS='--require ./scripts/sandbox-netuse.cjs'; npx vite`

- [ ] **Step 4: 追加收口记录并改 README**

`docs/分工与协作.md` 追加一节：本周三块各自改了什么文件、撞没撞车、下周要不要重分（spec 决策 11 要求 M0 结束按实测工时重分一次）。

- [ ] **Step 5: Commit 并推送**

```bash
git add docs/分工与协作.md README.md
git commit -m "docs: M0 收口记录与内容管线说明"
GIT_SSH='C:/Windows/System32/OpenSSH/ssh.exe' git push origin main
```

Expected: push 成功；GitHub Actions 的 build/deploy 两个 job 都绿；Pages 上产物指纹与本地 `dist/index.html` 一致

---

## Self-Review

**1. Spec 覆盖（对照 v1.3 的 M0 表）**

| spec 要求（M0） | 落在哪个任务 |
|---|---|
| 三块所有权落地 `docs/分工与协作.md` | Task 1、Task 12 |
| 题库与问答面板外置 `{zh,en}`（决策 13 的 M0 波次，约 386 条） | Task 8 |
| `scripts/verify-content.mjs` + CI | Task 7 |
| `src/tutorial` 挂接点与事件总线 | Task 3、4、5 |
| 数值两层拆分 | Task 6 |
| 第一轮试玩（5~8 人） | Task 9（清单与模板）；**实际执行需要真人，是 M0 期间的组织工作，不是本计划的代码任务** |
| 开场 15 分钟时间轴诊断 | Task 10 |
| UI 可读性清单 | Task 11 |
| M0 出口：三块跑通一次周循环 | Task 12 |
| 第二波（叙事/场次卡/卡牌/标题页/两场景内联文案/逻辑层消息） | **不在本计划，见「待办移交」** |
| 第三波（`roster.js` / `map-events.js`） | **不在本计划，见「待办移交」** |

**2. 步骤扫描**：12 个任务都有「写测试 → 跑失败 → 实现 → 跑通过 → 提交」的闭环；纯文档任务（1、9、10、11）用 `check-docs.mjs` 与路径存在性脚本代替代码测试，结论可验。没有出现「TBD」「处理边界情况」这类不决定任何事的步骤。

**3. 类型一致性**：`t(value, locale)` 在 Task 2 定义、Task 8 使用，参数形状一致；`createBus` 的 `on` 返回值在 Task 3 定义、Task 4 的 `destroy` 使用；`TUTORIAL_EVENTS` 的四个值在 Task 4 定义、Task 5 的 `emitTutorial` 与测试引用同一常量而非字面量；`isText(value)` 在 Task 7 定义，Task 8 的 `src/logic/encounters.js` 复用它校验 `{zh,en}` 而不是另写一套。

**4. Review Focus 的测试归属**：第 1 条（英文残留）→ Task 2 的显式 locale 测试 + Task 8 的 en 断言 + Task 12 的全流程冒烟；第 2 条（英文过长）→ Task 8 的 `length <= 200` / `<= 40` 与换行宽度收窄；第 3 条（漏写 en 静默变空）→ Task 7 的 `isText` 与 `validateEncounters`、Task 2 的回退断言；第 4 条（状态机乱序重入）→ Task 4 的第 3 条测试；第 5 条（Node 22 与 Node 24 差异）→ Task 7 Step 4 与 Task 8 Step 10 的 `git grep` 检查。

**5. 篇幅与工作量**：本计划约 520 行，spec 约 400 行；代码块只保留测试断言与接口骨架，实现体一律描述而非转录。12 个任务的估算合计约 **150 人时**（A 约 55、B 约 30、C 约 65），低于 spec 给 M0 留的 240 人时 —— 差额是试玩组织、译稿人工校对与首次协作的磨合成本，留下当缓冲，不再塞任务。

## 待办移交下一份计划（M1 / M2，不属于 M0）

**M1（随各自功能重写一起做，别单独迁）**
- 叙事与场次卡外置：`content/story.json` + `content/cinematics.json`（约 84 条），随「开场节奏重排」迁；同时给 `content-schema.js` 加 `validateStory` / `validateCinematics`。
- 卡牌提示与标题页说明外置：`content/cards.json` + `content/title.json`（约 38 条），随「战斗反馈强化」与「标题页重构」迁。
- `BattleScene.js`（95）与 `IntermissionScene.js`（92）内联文案，随各自改版迁；逻辑层校验与反馈消息（约 117 条）同批。
- 语言切换 UI 与持久化（`localStorage`）、`?lang=en` 查询参数。
- `src/tutorial/overlay.js` 引导绘制与四步完成率埋点上报。

**M2**
- `src/data/roster.js` 符印与怪物名（72）、`src/data/map-events.js` 事件点提示（41）。
- 其余场景与 UI 零散文案（约 90）。

**M4**
- 全量核对：`npm run verify:content` 必须覆盖全部 6 类内容文件；再跑一次 en 态全流程冒烟与术语表一致性检查。

**其余功能项**
- 拖放装阵（M1）、配乐三段（M2）、大 Boss 多阶段（M3）。
