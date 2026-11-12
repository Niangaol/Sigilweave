# 过场动画重做 · 契约碑铭剧场 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现本计划。所有步骤用复选框（`- [ ]`）跟踪。每个任务都按「先写失败测试 → 跑失败 → 实现 → 跑通 → 提交」推进，不允许先写实现再补测试。

**Goal:** 把 Sigilweave 的过场动画从「暗紫底 + 居中大铜框卡片 + 符环」改成「七幕各有可辨认布景 + 八类各有专属三拍事件 + 标题降为底部碑座铭文」，在每帧 ≤700 指令的既有预算内把细节量提高 2–3 倍。

**Architecture:** 静态布景预绘制 + 动态活动件。七幕布景拆成 back/mid/fore 三条 Graphics，在 `create()` 各绘制一次，之后每帧只做 `setAlpha` 与整数位移；活动件（火苗、雾、灰、火星、契约钉、符环）仍在原有的 stageG/sealG/dustG/fxG 里逐帧绘制，总量不变。事件库以「幕锚点」为唯一对接面，因此七幕 × 八类可自由组合。

**Tech Stack:** Phaser 3.90（Graphics 程序化像素绘制）、Vitest 5（纯函数 + stub 计数测试）、Vite 8、Playwright 1.64（Chromium/Edge 截图验收）、Node ESM 脚本。

**Spec:** `docs/superpowers/specs/2026-11-11-cutscene-diorama-design.md`（13 节，含七幕布景规格、八类事件三拍表、碑座精确坐标、验收量化指标）

**Global Constraints:**

- 文案一律不动：`ACT_CARDS`、`COMPACT`、`formatReport`、`JOURNEYS` 的字符串与字数保持原样（`tests/cinematics.test.js` 锁死）。
- 时间轴一律不动：`TIMELINES` 的 cover/hold/reveal 毫秒、`SKIP_GRACE_MS=150`、`totalMs ∈ [900,1600]`（`tests/cinematics.test.js:11`）。
- 换场状态机（cover→swap→freeze→reveal）、`targetReady` 钉子逻辑、`window.__SIGILWEAVE_CUTSCENE__` 发布字段不动。
- 不引入图片/贴图/字体/新依赖；不使用渐变（`fillGradientStyle`）、模糊、`Math.random`、`Date.now` 参与绘制。
- 所有坐标为有限整数；同一组参数两次绘制必须产生完全相同的调用序列。
- 每帧活动四层（stageG+sealG+dustG+fxG）合计 ≤700 指令（`tests/cutscene-choreo.test.js` 回归）。
- 静态层一次性预算：单带 ≤1300、单幕合计 ≤3200。
- 不动 `src/ui/Background.js`（战斗背景，绑定世界坐标与 RenderTexture）、不动 `src/data/cinematics.js` 的结构。
- 测试替身只支持 `clear/fillStyle/fillRect/lineStyle/lineBetween/strokePoints/fillPoints/setDepth/setBlendMode/setAlpha/setPosition`；新增绘制只能使用这些方法（`tests/cutscene-scene.test.js` 会崩）。
- 命令在 Windows + bash 下可直接执行；测试入口 `npx vitest run <file>`。

**Review Focus:**

1. **布景是否真的「一剧一景」** —— 由 `tests/pixel-signature.test.js` + `scripts/cutscene-shot.mjs` 的七幕指纹断言守护（两两距离 ≥0.18）。
2. **事件是否有「结果留在画面」** —— 由 `tests/cutscene-events.test.js` 的 `residueAt(1) === residueAt(0.9)` 且非空守护。
3. **每帧预算没被偷偷突破** —— 由 `tests/cutscene-choreo.test.js` 的 8 kind × 8 时间点 ≤700 守护。
4. **静态层真的只画一次** —— 由 `tests/cutscene-scene.test.js` 的「200 帧后 clear 计数仍为 1」守护。
5. **文案与时长零回归** —— 由 `tests/cinematics.test.js` 全绿 + `scripts/cutscene-shot.mjs` 的 duration 断言守护。

---

## File Structure

**新建（共享层）**

| 文件 | 职责 |
| --- | --- |
| `src/ui/diorama-kit.js` | 材质工具：砖缝、凿痕、木纹、锈斑、苔、水痕倒影、煤烟、光尘。全部种子驱动、指令上界 40 |
| `src/ui/cutscene-diorama.js` | 七幕注册表 + `dioramaAnchors(act,{w,h})` 比例换算 + `createDiorama(act,{w,h})` 聚合 |
| `src/ui/dioramas/act1-graveyard.js` … `act7-dawn.js` | 每幕一个文件，导出 `{ act, name, marks, anchors, back, mid, fore }` |
| `src/ui/cutscene-plinth.js` | 纯布局函数 `plinthLayout({w,h,card})` + `toLocal(p,cx,cy)`，无 Phaser 依赖 |
| `src/ui/cine-props.js` | 可复用道具：契约钉、契约主剪影、魂火、北斗七星、灰堆、血纹、雾、烛 |
| `src/ui/cine-beats/short.js` | boot / sigil / retry / return 四类事件 |
| `src/ui/cine-beats/battle.js` | act / clear / death / victory 四类事件 |
| `src/ui/cutscene-events.js` | `BEATS` 三拍区间表 + `drawEvent` 分发 + `residueAt` |
| `scripts/lib/pixel-signature.mjs` | 截图降采样指纹 + ink ratio + 距离 |

**新建（测试）**

`tests/diorama-kit.test.js`、`tests/cutscene-diorama.test.js`、`tests/diorama-act1.test.js` … `diorama-act7.test.js`、`tests/cutscene-plinth.test.js`、`tests/pixel-signature.test.js`、`tests/cine-props.test.js`、`tests/cutscene-events.test.js`

**修改**

`src/scenes/CutsceneScene.js`（静态三层 + 碑座 + journey 静态件）、`src/ui/cutscene-choreo.js`（去掉 drawStage、改调事件库）、`src/ui/story-art.js`（拆 `*_STATIC`）、`src/scenes/StoryScene.js`（静态层）、`scripts/cutscene-shot.mjs`、`scripts/story-shot.mjs`、`scripts/ending-shot.mjs`、`docs/过场动画.md`、`docs/开场与幕间.md`、`tests/cutscene-scene.test.js`、`tests/cutscene-choreo.test.js`、`tests/story-art.test.js`

**阶段与并行图**

```
Phase A 骨架      T1 diorama-kit → T2 diorama 聚合 → T3 场景静态层 → T4 第一幕样板 → T5 碑座 → T6 指纹脚本
Phase B 七幕      T7..T12（六幕，互不共享文件，可 6 个 subagent 并行）
Phase C 事件      T13 cine-props → T14 short beats / T15 battle beats（可并行）→ T16 接线 choreo
Phase D journey   T17
Phase E 开场结局  T18 / T19（可并行，优先级最低）
Phase F 收尾      T20 文档 + 全量验收
```

---

## Phase A：骨架

### 任务 1：材质工具库 `diorama-kit`

**Files:**
- Create: `src/ui/diorama-kit.js`
- Test: `tests/diorama-kit.test.js`

**Interfaces:**
- Produces: `makeInk(seed) -> () => float[0,1)`；`brickSeams(g,{x,y,w,h,rows,cols,color,alpha,seed,stub})`；`chiselMarks(g,{x,y,w,h,count,color,alpha,seed,len})`；`woodGrain(g,{x,y,w,h,lines,color,alpha,seed})`；`rustPits(g,{x,y,w,count,color,alpha,seed})`；`moss(g,{x,y,w,count,color,alpha,seed})`；`waterReflect(g,{x,y,w,lines,color,alpha,seed,wave})`；`soot(g,{x,y,w,h,plumes,color,alpha,seed})`；`litSpecks(g,{x,y,w,h,count,color,seed,light})`。每个函数只画 1px 线段或 1×1 小点，指令数 ≤40。

- [ ] 步骤 1：写失败测试。建立计数 stub（方法名同 `tests/cinematic-art.test.js` 里的 gStub，并记录 `calls` 数组），对 8 个函数各断言「指令数 ≤40」「坐标全为有限整数」「同参数两次调用 calls 深相等」「不同 seed 产生不同 calls」。

```js
// tests/diorama-kit.test.js
import { describe, it, expect } from "vitest";
import { brickSeams, chiselMarks, woodGrain, rustPits, moss, waterReflect, soot, litSpecks } from "../src/ui/diorama-kit.js";

function stub() {
  const calls = [];
  const g = { calls };
  const rec = (name) => (...args) => { calls.push([name, ...args]); };
  for (const m of ["clear", "fillStyle", "fillRect", "lineStyle", "lineBetween", "strokePoints", "fillPoints"]) g[m] = rec(m);
  return g;
}
const BOX = { x: 10, y: 20, w: 60, h: 40 };

describe("diorama-kit 材质工具", () => {
  const cases = [
    ["brickSeams", brickSeams, { ...BOX, rows: 4, cols: 6, color: 0x333333, alpha: 0.4, seed: 7, stub: 1 }],
    ["chiselMarks", chiselMarks, { ...BOX, count: 3, color: 0x222222, alpha: 0.5, seed: 11, len: 6 }],
    ["woodGrain", woodGrain, { ...BOX, lines: 5, color: 0x3a2a1a, alpha: 0.3, seed: 13 }],
    ["rustPits", rustPits, { ...BOX, count: 6, color: 0x8a4a20, alpha: 0.6, seed: 17 }],
    ["moss", moss, { x: 10, y: 60, w: 60, count: 5, color: 0x3f6b3a, alpha: 0.5, seed: 19 }],
    ["waterReflect", waterReflect, { x: 10, y: 60, w: 60, lines: 5, color: 0x5a8a8a, alpha: 0.25, seed: 23, wave: 0.4 }],
    ["soot", soot, { ...BOX, plumes: 3, color: 0x1a1a1a, alpha: 0.35, seed: 29 }],
    ["litSpecks", litSpecks, { ...BOX, count: 8, color: 0xffe0a0, seed: 31, light: { x: 20, y: 30, w: 20, h: 20 } }],
  ];
  for (const [name, fn, opts] of cases) {
    it(name + " 有界、整数、确定", () => {
      const a = stub(); fn(a, opts);
      expect(a.calls.length).toBeGreaterThan(0);
      expect(a.calls.length).toBeLessThanOrEqual(40);
      for (const c of a.calls) for (const v of c.slice(1)) {
        if (typeof v === "number") { expect(Number.isFinite(v)).toBe(true); if (v % 1 !== 0) throw new Error(name + " 非整数坐标: " + v); }
      }
      const b = stub(); fn(b, opts);
      expect(b.calls).toEqual(a.calls);
    });
  }
  it("litSpecks 只落在光区", () => { const g = stub(); litSpecks(g, cases[7][2]); for (const c of g.calls) { if (c[0] === "fillRect") { expect(c[1]).toBeGreaterThanOrEqual(20); expect(c[1]).toBeLessThanOrEqual(40); } } });
});
```

- [ ] 步骤 2：跑测试确认失败。`npx vitest run tests/diorama-kit.test.js`
- [ ] 步骤 3：实现 `src/ui/diorama-kit.js`。约定：`makeInk(seed)` 用 xorshift32（`h ^= h << 13; h ^= h >>> 17; h ^= h << 5`，全程 `>>> 0` 保持 32 位无符号），返回归一化浮点；所有位置先 `Math.round` 再画；`litSpecks` 必须在 `light` 矩形内均匀取点。
- [ ] 步骤 4：跑测试确认通过，再跑全量 `npm test` 确认没影响旧测试。
- [ ] 步骤 5：提交。`git add src/ui/diorama-kit.js tests/diorama-kit.test.js && git commit -m "过场: 新增材质工具库 diorama-kit"`

---

### 任务 2：七幕注册表 + 锚点换算

**Files:**
- Create: `src/ui/cutscene-diorama.js`、`src/ui/dioramas/act1-graveyard.js` … `act7-dawn.js`（本任务只放占位版，各画 1 条地平线）
- Test: `tests/cutscene-diorama.test.js`

**Interfaces:**
- Consumes: 无
- Produces: `DIORAMAS`（`{1..7}` 键的对象）；`dioramaAnchors(act,{w=480,h=270}) -> {horizonY,groundY,nail,lord,light}`（整数，按 `w/480`、`h/270` 比例换算）；`createDiorama(act,{w,h}) -> {act,name,marks,anchors,back,mid,fore}`，三个绘制函数签名 `(g, ctx)`，`ctx={w,h,anchors,seed}`；未知 act 回退到 1。

- [ ] 步骤 1：写失败测试。

```js
// tests/cutscene-diorama.test.js
import { describe, it, expect } from "vitest";
import { DIORAMAS, dioramaAnchors, createDiorama } from "../src/ui/cutscene-diorama.js";

const SPEC = {
  1: { nail: [240, 193], lord: [268, 150], light: [106, 46], horizonY: 162 },
  2: { nail: [240, 196], lord: [240, 152], light: [336, 54], horizonY: 166 },
  3: { nail: [250, 196], lord: [250, 134], light: [240, 62], horizonY: 162 },
  4: { nail: [232, 193], lord: [232, 148], light: [240, 58], horizonY: 162 },
  5: { nail: [240, 196], lord: [240, 152], light: [330, 84], horizonY: 166 },
  6: { nail: [258, 196], lord: [258, 140], light: [206, 120], horizonY: 170 },
  7: { nail: [240, 196], lord: [240, 142], light: [240, 100], horizonY: 162 },
};

describe("cutscene-diorama 注册表", () => {
  it("七幕齐全且各带三枚辨识标记", () => {
    for (let a = 1; a <= 7; a++) {
      const d = DIORAMAS[a];
      expect(d.act).toBe(a);
      expect(d.marks.length).toBe(3);
      for (const k of ["back", "mid", "fore"]) expect(typeof d[k]).toBe("function");
    }
  });
  it("横屏锚点等于规格表", () => {
    for (let a = 1; a <= 7; a++) {
      const an = dioramaAnchors(a, { w: 480, h: 270 });
      expect([an.nail.x, an.nail.y]).toEqual(SPEC[a].nail);
      expect([an.lord.x, an.lord.y]).toEqual(SPEC[a].lord);
      expect([an.light.x, an.light.y]).toEqual(SPEC[a].light);
      expect(an.horizonY).toBe(SPEC[a].horizonY);
    }
  });
  it("竖屏按高度等比换算且为整数", () => {
    const an = dioramaAnchors(1, { w: 480, h: 760 });
    expect(an.horizonY).toBe(Math.round(162 * 760 / 270));
    expect(an.nail.x).toBe(240);
    for (const v of [an.horizonY, an.groundY, an.nail.y, an.lord.y, an.light.y]) expect(v % 1).toBe(0);
  });
  it("未知幕回退到第一幕", () => { expect(createDiorama(99, { w: 480, h: 270 }).act).toBe(1); });
});
```

- [ ] 步骤 2：跑测试确认失败。`npx vitest run tests/cutscene-diorama.test.js`
- [ ] 步骤 3：实现注册表 + 七个占位幕文件。占位版格式（后续任务只改这三个函数体，不动导出）：

```js
// src/ui/dioramas/act1-graveyard.js
const anchors = { horizonY: 162, groundY: 193, nail: { x: 240, y: 193 }, lord: { x: 268, y: 150 }, light: { x: 106, y: 46 } };
export default {
  act: 1,
  name: "graveyard",
  marks: ["arch-moon", "seven-tombs", "iron-fence"],
  anchors,
  back(g, ctx) { g.lineStyle(1, 0x2a2340, 0.6); g.lineBetween(0, ctx.anchors.horizonY, ctx.w, ctx.anchors.horizonY); },
  mid(g, ctx) { g.fillStyle(0x2b2438, 0.8); g.fillRect(220, ctx.anchors.groundY - 20, 40, 20); },
  fore(g, ctx) { g.lineStyle(1, 0x1d1828, 0.8); g.lineBetween(0, ctx.anchors.groundY, ctx.w, ctx.anchors.groundY); },
};
```

`dioramaAnchors` 换算规则：`sx=w/480`、`sy=h/270`，x 乘 sx、y 乘 sy，全部 `Math.round`；`groundY` 同表（1:193、2:196、3:196、4:193、5:196、6:200、7:196）。
- [ ] 步骤 4：跑测试确认通过。`npx vitest run tests/cutscene-diorama.test.js`
- [ ] 步骤 5：提交。`git add src/ui/cutscene-diorama.js src/ui/dioramas tests/cutscene-diorama.test.js && git commit -m "过场: 七幕布景注册表与锚点换算"`

---

### 任务 3：场景静态三层接入

**Files:**
- Modify: `src/scenes/CutsceneScene.js`（`create()` 图层段、`update()` 开头）
- Modify: `tests/cutscene-scene.test.js`（给 `makeGraphics` 加 `setPosition` 与 `calls` 计数；纯追加，不改已有断言）

**Interfaces:**
- Consumes: `createDiorama`、`dioramaAnchors`
- Produces: 场景新增字段 `scene.backG`、`scene.midG`、`scene.foreG`、`scene.dio`；图层 depth 调整为 veil 0 / back 1 / mid 1.5 / fore 1.8 / stage 2 / seal 2.5 / dust 3 / fx 3.5 / card 4。

- [ ] 步骤 1：先扩测试替身，再写失败测试。`tests/cutscene-scene.test.js:37` 的 `makeGraphics()` 追加四样（纯追加，不改已有断言）：`calls: []`；每个方法把 `[方法名, ...参数]` push 进 `calls`；`clear()` 里 `g.clears += 1` 并 push；补 `setAlpha(a)`、`setPosition(x, y)`（记录后都 `return g`）。场景用文件里已有的 `makeHarness({ kind: 'act', act: 1 })` 构造（内部会调 `create()`），帧推进用已有的 `advance(overlay, ms)`。

```js
it("静态三层只在 create 时绘制一次", () => {
  const { overlay } = makeHarness({ kind: "act", act: 1 });
  for (const layer of [overlay.backG, overlay.midG, overlay.foreG]) {
    expect(layer.calls.length).toBeGreaterThan(0);
    expect(layer.clears).toBe(1);
  }
  advance(overlay, 900);
  for (const layer of [overlay.backG, overlay.midG, overlay.foreG]) expect(layer.clears).toBe(1);
});
it("静态层不在帧内重画，每帧最多 6 次 setAlpha/setPosition", () => {
  const { overlay } = makeHarness({ kind: "act", act: 1 });
  advance(overlay, overlay.timeline.coverMs + 40);
  const sum = () => overlay.backG.calls.length + overlay.midG.calls.length + overlay.foreG.calls.length;
  const before = sum();
  overlay.update(0, 16);
  expect(sum() - before).toBeLessThanOrEqual(6);
});
```
- [ ] 步骤 2：跑测试确认失败。`npx vitest run tests/cutscene-scene.test.js`
- [ ] 步骤 3：实现。在 `create()` 建好 dustG 之后插入：

```js
this.backG = this.add.graphics().setDepth(1);
this.midG = this.add.graphics().setDepth(1.5);
this.foreG = this.add.graphics().setDepth(1.8);
this.stageG.setDepth(2);
this.sealG.setDepth(2.5);
this.dustG.setDepth(3);
this.fxG.setDepth(3.5);
const dio = createDiorama(this.act, { w: W, h: H });
this.dio = dio;
const dctx = { w: W, h: H, anchors: dio.anchors, seed: 0x9e37 + this.act * 97 };
dio.back(this.backG, dctx);
dio.mid(this.midG, dctx);
dio.fore(this.foreG, dctx);
```

`update()` 内、调用 `drawVeil` 之后插入（`phase`、`p` 已由 `phaseAt` 求出）：

```js
// phase 是 phaseAt(...) 的返回值：用 phase.phase 与 phase.p（不是裸的 p）
const ph = phase.phase;
const fade = ph === "cover" ? easeOutCubic(phase.p) : ph === "reveal" ? 1 - easeInOutCubic(phase.p) : 1;
const drift = ph === "hold" ? Math.round(phase.p * 3) : ph === "reveal" ? 3 : 0;
this.backG.setAlpha(fade).setPosition(0, 0);
this.midG.setAlpha(fade).setPosition(0, -Math.round(drift / 3));
this.foreG.setAlpha(fade).setPosition(0, -drift);
```

注意：`createDiorama` 与 `easeOutCubic/easeInOutCubic` 需在文件头部 import；journey 分支同样复用这套 diorama（Phase D 会换成 journey 专属静态件，本任务期间允许与 `JOURNEY_STAGES` 视觉重叠）。
- [ ] 步骤 4：跑 `npx vitest run tests/cutscene-scene.test.js tests/cutscene-choreo.test.js tests/cinematics.test.js` 全绿；再跑 `npm test`。
- [ ] 步骤 5：真机目检。先 `npm run build`，再另开一个终端跑 `node scripts/static-server.mjs dist 4174`，最后 `BASE_URL=http://127.0.0.1:4174 node scripts/cutscene-shot.mjs`。确认画面多出布景、cover 阶段遮罩依旧完全不透明（看不到新场景）。
- [ ] 步骤 6：提交。`git commit -am "过场: 场景接入静态三层布景"`

---

### 任务 4：第一幕布景样板（荒废墓园）

**Files:**
- Modify: `src/ui/dioramas/act1-graveyard.js`（替换三个函数体）
- Test: `tests/diorama-act1.test.js`

**Interfaces:**
- Consumes: `diorama-kit` 全部材质函数
- Produces: 第一幕真实布景；同构的「幕测试」模板供任务 7–12 复制。

- [ ] 步骤 1：写失败测试（模板，后续五幕照抄只改 act 号与 marks）。

```js
// tests/diorama-act1.test.js
import { describe, it, expect } from "vitest";
import act from "../src/ui/dioramas/act1-graveyard.js";
import { dioramaAnchors } from "../src/ui/cutscene-diorama.js";

function stub() {
  const calls = [];
  const g = { calls, clear() { calls.push(["clear"]); }, fillStyle(...a) { calls.push(["fillStyle", ...a]); }, fillRect(...a) { calls.push(["fillRect", ...a]); }, lineStyle(...a) { calls.push(["lineStyle", ...a]); }, lineBetween(...a) { calls.push(["lineBetween", ...a]); }, strokePoints(...a) { calls.push(["strokePoints", ...a]); }, fillPoints(...a) { calls.push(["fillPoints", ...a]); } };
  return g;
}
const ctx = (w, h) => ({ w, h, anchors: dioramaAnchors(1, { w, h }), seed: 0x9e37 + 97 });

describe("第 I 幕 荒废墓园", () => {
  for (const [w, h] of [[480, 270], [480, 760]]) {
    it("三带预算与确定性 " + w + "x" + h, () => {
      const totals = [];
      for (const band of ["back", "mid", "fore"]) {
        const a = stub(); act[band](a, ctx(w, h));
        const b = stub(); act[band](b, ctx(w, h));
        expect(a.calls.length).toBeGreaterThan(20);
        expect(a.calls.length).toBeLessThanOrEqual(1300);
        expect(b.calls).toEqual(a.calls);
        for (const c of a.calls) for (const v of c) if (typeof v === "number" && v % 1 !== 0) throw new Error("非整数: " + v);
        totals.push(a.calls.length);
      }
      expect(totals[0] + totals[1] + totals[2]).toBeLessThanOrEqual(3200);
    });
  }
});
```

- [ ] 步骤 2：跑测试确认失败（占位版每带只有 2–4 条指令）。
- [ ] 步骤 3：按规格 §6.1 实现。必须包含：远景 3 段天幕色带 + 残月 r13 与月晕 + 尖拱门洞 + 6 丛枯树线；中景 7 块墓碑（碑顶 3 种、碑面凿痕、2×2 缺口）+ 左断石棺 + 右铁栅栏 9 根与 2 横梁与 4 点锈；近景 5×9 错缝石板 + 1 条 5 段主裂缝 + 右下压边墓碑角 + 4 簇枯草。材质调用 `chiselMarks`（碑面）、`moss`（石基）、`rustPits`（栅栏）、`brickSeams`（石板）。
- [ ] 步骤 4：跑 `npx vitest run tests/diorama-act1.test.js` 通过，并确认单带指令数在 300–1300 之间。
- [ ] 步骤 5：截图目检。`npm run build`，起静态服务器，`BASE_URL=http://127.0.0.1:4174 node scripts/cutscene-shot.mjs`，看 `docs/cutscene/*act1*`；用 read_image 检查：尖拱、残月、七碑、栅栏四样是否都能一眼认出；若任一认不出，加重该物件的对比/尺寸后重跑。
- [ ] 步骤 6：提交。`git commit -am "过场: 第一幕墓园布景细节"`

---

### 任务 5：碑座（标题卡 → 底部铭文带）

**Files:**
- Create: `src/ui/cutscene-plinth.js`
- Modify: `src/scenes/CutsceneScene.js`（`buildCardView` 重写）
- Test: `tests/cutscene-plinth.test.js`

**Interfaces:**
- Produces: `plinthLayout({w,h,card}) -> layout`（字段见规格 §8.1/§8.2）；`toLocal({x,y},cx,cy) -> {x,y}`。`buildCardView` 仍产出 `{container,titleChars,titleText,statValues,statBaseY,titleBaseY}` 这些既有字段，choreo 无需改。

- [ ] 步骤 1：写失败测试。

```js
// tests/cutscene-plinth.test.js
import { describe, it, expect } from "vitest";
import { plinthLayout, toLocal } from "../src/ui/cutscene-plinth.js";

describe("碑座布局", () => {
  it("横屏非紧凑：底带 84 高", () => {
    const L = plinthLayout({ w: 480, h: 270, card: { compact: false } });
    expect(L.panel).toEqual({ x: 0, y: 186, w: 480, h: 84 });
    expect(L.title).toMatchObject({ x: 14, y: 202, size: 20, align: "left" });
    expect(L.eyebrow).toMatchObject({ x: 14, y: 192, size: 7 });
    expect(L.rule).toEqual({ y: 228, x1: 14, x2: 300 });
    expect(L.subtitle).toMatchObject({ x: 14, y: 230, size: 8, width: 300 });
    expect(L.stats.cols).toEqual([306, 346, 386, 426]);
    expect(L.hint).toMatchObject({ x: 466, y: 256, size: 6, align: "right" });
  });
  it("竖屏非紧凑：底带 104 高、标题 22", () => {
    const L = plinthLayout({ w: 480, h: 760, card: { compact: false } });
    expect(L.panel.y).toBe(656);
    expect(L.panel.h).toBe(104);
    expect(L.title.size).toBe(22);
  });
  it("紧凑卡：176×44 居中", () => {
    const L = plinthLayout({ w: 480, h: 270, card: { compact: true } });
    expect(L.panel).toEqual({ x: 152, y: 156, w: 176, h: 44 });
    expect(L.title).toMatchObject({ x: 240, y: 172, size: 13, align: "center" });
  });
  it("toLocal 把绝对坐标转成容器内坐标", () => {
    expect(toLocal({ x: 14, y: 202 }, 240, 135)).toEqual({ x: -226, y: 67 });
  });
});
```

- [ ] 步骤 2：跑测试确认失败。`npx vitest run tests/cutscene-plinth.test.js`
- [ ] 步骤 3：实现 `cutscene-plinth.js`（纯函数，不依赖 Phaser；紧凑卡 y 计算：横屏 `Math.round(h*0.66)`，竖屏 `Math.round(h*0.74)`，面板 y 减去 h/2）。 垂直居中规则：`title.y = panel.y + Math.round((panel.h - size) / 2)`（紧凑卡 13px 字落在 172）。注意 `Palette.addText` 默认 origin 是 (0,0)，所以非紧凑卡全部左对齐、直接用布局里的 y 当字顶；只有紧凑卡标题需要 `setOrigin(0.5, 0)` 并在 x 用 w/2 水平居中。
- [ ] 步骤 4：重写 `buildCardView`。容器仍 `add.container(this.cx, this.cy)`，所有子对象坐标经 `toLocal` 转换；面板绘制顺序：阴影线 → 面板填充（C.void 0.88）→ 上沿铜线 → 四角铆钉 → 2 条固定种子凿痕 → 4 点苔 → 底边暗线；标题/eyebrow/subtitle/hint/stats/水印按布局字段落位；`titleChars` 每字 x = `title.x + i*(title.size+6)`，初始 `setAlpha(0)`；`statBaseY` = 值行局部 y；`titleBaseY` = 标题局部 y。
- [ ] 步骤 5：跑 `npx vitest run tests/cutscene-plinth.test.js tests/cutscene-choreo.test.js tests/cutscene-scene.test.js tests/cinematics.test.js`；choreo 若因 `card.y` 语义出现 2px 抖动，改在 `container` 上用 `setY(cy + shake)` 即可，不要改字体坐标。
- [ ] 步骤 6：截图目检 act/clear/death/victory 四张：场景必须占上 62%，文字全部在底部带内，无重叠、无越界（竖屏 390×844 一张）。
- [ ] 步骤 7：提交。`git commit -am "过场: 标题卡改为底部碑座铭文带"`

---

### 任务 6：辨识度指纹与截图脚本

**Files:**
- Create: `scripts/lib/pixel-signature.mjs`
- Modify: `scripts/cutscene-shot.mjs`（新增七幕画廊 + 指纹断言 + `verify.json` 增字段）
- Test: `tests/pixel-signature.test.js`

**Interfaces:**
- Produces: `signatureFromLuma(px, w, h) -> Float32Array(576)`（32×18 网格，0–1 亮度，块内平均）；`inkRatio(sig) -> number`（与全图中位数差 >0.047 的格子占比）；`distance(a,b) -> number`（平均绝对差）；`snapshotSignature(page, selector) -> sig`（Playwright：截图 → base64 回灌页面 → `createImageBitmap` → 32×18 canvas → `getImageData`）。

- [ ] 步骤 1：写失败测试。

```js
// tests/pixel-signature.test.js
import { describe, it, expect } from "vitest";
import { signatureFromLuma, inkRatio, distance } from "../scripts/lib/pixel-signature.mjs";

const flat = (v) => new Float32Array(32 * 18).fill(v);
const stripe = (a, b) => { const s = new Float32Array(32 * 18); for (let y = 0; y < 18; y++) for (let x = 0; x < 32; x++) s[y * 32 + x] = x < 16 ? a : b; return s; };

describe("pixel-signature", () => {
  it("纯色画面 inkRatio 为 0", () => { expect(inkRatio(flat(0.2))).toBe(0); });
  it("半亮半暗画面 inkRatio 约 0.5", () => { expect(inkRatio(stripe(0.9, 0.1))).toBeGreaterThan(0.4); });
  it("同图距离 0，反相距离大", () => { expect(distance(flat(0.5), flat(0.5))).toBe(0); expect(distance(stripe(0.9, 0.1), stripe(0.1, 0.9))).toBeGreaterThan(0.4); });
  it("随机纹理的 inkRatio 不高（防「撒点冒充细节」）", () => {
    const s = new Float32Array(32 * 18); for (let i = 0; i < s.length; i++) s[i] = 0.47 + (i % 3) * 0.02;
    expect(inkRatio(s)).toBeLessThan(0.2);
  });
});
```

- [ ] 步骤 2：跑测试确认失败。`npx vitest run tests/pixel-signature.test.js`
- [ ] 步骤 3：实现 `scripts/lib/pixel-signature.mjs`；`inkRatio` 用「格子值与该图所有格子中位数差 >12/255」判定，避免整屏暗色被误计为细节。
- [ ] 步骤 4：扩展 `scripts/cutscene-shot.mjs`。脚本已有一段「第三幕画廊页」（198–222 行）可直接改成循环：`gallery.goto(BASE + '/?seed=cutscene-act3')` → 等 `__SIGILWEAVE_STORY__.phase === 'playing'` → `keyboard.press('Enter')` → 等 TitleScene 激活且 CutsceneScene 未激活 → `title.scene.launch('CutsceneScene', { from:'TitleScene', to:'LoadoutScene', payload:{__cine:true}, kind:'act', act:3 })` → 等 `__SIGILWEAVE_CUTSCENE__.phase === 'hold'` → 截图。把这段封装成 `shootAct(n)`，循环 1..7：

```js
async function shootAct(n) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', e => report.errors.push('act' + n + ': ' + e.message));
  await page.goto(BASE + '/?seed=cutscene-act' + n, { waitUntil: 'load' });
  await page.waitForFunction(() => (window.__SIGILWEAVE_STORY__?.elapsed ?? 0) > 250
    && window.__SIGILWEAVE_STORY__?.phase === 'playing', null, { timeout: 20000 });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__SIGILWEAVE__?.scene.isActive('TitleScene')
    && !window.__SIGILWEAVE__?.scene.isActive('CutsceneScene'), null, { timeout: 20000 });
  await page.evaluate((act) => {
    window.__SIGILWEAVE__.scene.getScene('TitleScene').scene.launch('CutsceneScene', {
      from: 'TitleScene', to: 'LoadoutScene', payload: { __cine: true }, kind: 'act', act,
    });
  }, n);
  await page.waitForFunction(() => window.__SIGILWEAVE_CUTSCENE__?.kind === 'act'
    && window.__SIGILWEAVE_CUTSCENE__?.phase === 'hold'
    && window.__SIGILWEAVE_CUTSCENE__?.elapsed > 520, null, { timeout: 20000 });
  const png = await page.screenshot({ path: OUT + '/act-' + n + '-stage.png' });
  const sig = await page.evaluate(async (b64) => {
    const blob = await (await fetch('data:image/png;base64,' + b64)).blob();
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas'); c.width = 32; c.height = 18;
    const g2 = c.getContext('2d'); g2.drawImage(bmp, 0, 0, 32, 18);
    const d = g2.getImageData(0, 0, 32, 18).data;
    const out = [];
    for (let i = 0; i < d.length; i += 4) out.push((0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255);
    return out;
  }, png.toString('base64'));
  await page.close();
  report.shots.push('act-' + n + '-stage');
  report.acts.push({ act: n, sig, ink: inkRatio(sig) });
}
```

跑完后两两算 `distance`，断言 `ink ≥ 0.55` 与 `min distance ≥ 0.18`；失败时打印最接近的两幕编号与距离。注意：
- 指纹在页面内用 `createImageBitmap` 降采样，不需要 PNG 解码依赖（脚本现已无此类依赖）。
- 必须等 `phase === 'hold'` 且 `elapsed > 520` 再截图，否则拍到 cover 黑屏。
- `verify.json` 里只写 `ink`、`minDistance` 与距离矩阵，不要把 576 个浮点数组写进去（文件会膨胀）。
- 7 幕 × 1080p 截图约 40–90 秒，脚本超时留足。
- [ ] 步骤 5：跑脚本。`npm run build && node scripts/static-server.mjs dist 4174 & sleep 2 && BASE_URL=http://127.0.0.1:4174 node scripts/cutscene-shot.mjs`。此时除第一幕外其余六幕是占位版，指纹断言预期失败——把失败输出记录下来，作为任务 7–12 的入口基线。
- [ ] 步骤 6：提交（脚本先落地，断言此刻红）。`git commit -am "过场: 截图脚本加入辨识度指纹与七幕画廊"`

---

## Phase B：七幕布景（六幕可并行）

> 任务 7–12 互不共享任何文件（各自只改自己的 `src/ui/dioramas/actN-*.js`、各自新建 `tests/diorama-actN.test.js`），可交给 6 个 subagent 同时做。每幕都必须给出规格 §6 里写明的：远景带 / 中景带 / 近景带 / ≥3 类依附材质 / 幕色只上光源 / 三枚辨识标记。

### 任务 7：第 II 幕 腐沼教堂
**Files:** Modify `src/ui/dioramas/act2-swamp.js`；Create `tests/diorama-act2.test.js`（复制任务 4 模板，act 号改 2）。
**内容：** §6.2 —— 圆彩窗 r14(336,54) + 2 尖窗 10×26 + 3×4 玻璃格与铅条 + 2 条光柱；吊钟（上14下24高22、钟口 2px 亮边、钟舌 3×10、吊绳到顶、横梁）；2 根石柱（0.28W/0.70W 宽 10）、3 排长椅；沼水 3 层色带 + 5 条倒影 + 3 个涟漪；左石阶 2 级、右芦苇 5 根。材质：`waterReflect`（水面）、`moss`（石基）、`brickSeams`（墙）、`chiselMarks`（柱）。
**步骤：** 同任务 4 六步（写测试 → 跑红 → 实现 → 跑绿并核对单带 300–1300 → 截图目检「彩窗/吊钟/倒影」三样是否认得出 → 提交 `过场: 第二幕腐沼教堂布景`）。

### 任务 8：第 III 幕 星陨王庭
**Files:** Modify `src/ui/dioramas/act3-court.js`；Create `tests/diorama-act3.test.js`。
**内容：** §6.3 —— 星纹环 (240,81) r46 + 内环 r30 + 24 刻度 + 3 菱形；星点 40 分 3 档；陨星划痕 3 条；断柱两侧；王座 40×44 + 扶手 + 靠背星纹 + 三级台阶 16/26/36 宽；台阶碎星晶体 5 枚；陨坑（0.78W 三层椭圆 + 6 碎石）+ 3 条外延裂纹。材质：`brickSeams`、`chiselMarks`、`litSpecks`（只在星光柱内）。
**步骤：** 同任务 4；截图核对「星纹环/王座台阶/陨坑」。
### 任务 9：第 IV 幕 沉钟书库
**Files:** Modify `src/ui/dioramas/act4-library.js`；Create `tests/diorama-act4.test.js`。
**内容：** §6.4 —— 两侧书架各 5 层、书脊 40 条（高 4–10，缺书留黑洞）；中央铜钟 20×18 + 横梁 + 钟绳；拱顶 3 道肋线；书梯（2 轨 + 6 踏）；阅读台 + 摊开书 2 页；吊灯铁环 r12 + 4 烛；近景书堆 3 堆、散页 5 张、走道缝。材质：`woodGrain`、`soot`（铜锈用 `rustPits`）、`litSpecks`（灯下）。
**步骤：** 同任务 4；截图核对「书脊阵列/铜钟/书梯」。
### 任务 10：第 V 幕 衡律法庭
**Files:** Modify `src/ui/dioramas/act5-court.js`；Create `tests/diorama-act5.test.js`。
**内容：** §6.5 —— 判词碑 3 块（14 宽、3 行刻字、每行 6 段 1px 笔画）；天平投影 alpha 0.18；柱廊 4 根（凹槽 3 条 + 柱头）；天平（立杆高 40、横梁 56、双盘 14×3、2 卷判词）；法官高台 64 宽 3 级；近景栏杆 9 柱 + 上下横梁；2 卷判决 + 2 火漆点；大理石纹 4 条。材质：`chiselMarks`、`brickSeams`、`rustPits`（火漆用 fillRect）、`litSpecks`（天平反光）。
**步骤：** 同任务 4；截图核对「天平/判词碑/栏杆」。
### 任务 11：第 VI 幕 熔星锻炉
**Files:** Modify `src/ui/dioramas/act6-forge.js`；Create `tests/diorama-act6.test.js`。
**内容：** §6.6 —— 炉膛拱口（0.34W–0.50W，0.30H–0.58H）三层色 0xffd98a/0xff8a4d/0x6b2a14；火星 8 点；煤烟 5 条；砖墙 6×10 错缝 + 2 缺砖；烟道梯形；铁砧 38×12 + 腰 10 + 底座 22 + 3 条高光；铁锤；2 条吊链各 8 环；淬火槽 16×6；剑胚 34 长斜置 3 段热色；铁屑 12 条 + 6 亮点。材质：`brickSeams`、`rustPits`、`soot`、`litSpecks`（炉光）。
**步骤：** 同任务 4；截图核对「炉火/铁砧+锤/吊链」。
### 任务 12：第 VII 幕 破晓之座
**Files:** Modify `src/ui/dioramas/act7-dawn.js`；Create `tests/diorama-act7.test.js`。
**内容：** §6.7 —— 晨光带 3 条（alpha 0.16/0.12/0.08）+ 地平光晕；北斗七星 7 点 + 6 段连线；两侧断柱；断裂王座（靠背断 2 段、缺一扶手、座面 3 裂）+ 王座后光晕 + 三级台阶 + 6 碎石 + 3 束枯藤；光池 3 层椭圆 + 5 反光点；2 块石碑；光尘只在光带内。材质：`chiselMarks`、`moss`、`litSpecks`、`brickSeams`。
**步骤：** 同任务 4；截图核对「黎明光带/断王座/北斗连线」。
**一次性收尾（任一任务完成后即可做，也可放任务 20）：** 重跑 `scripts/cutscene-shot.mjs`，七幕指纹断言转绿；若某两幕距离仍 <0.18，优先改「轮廓剪影」而不是加纹理。

---

## Phase C：事件（三拍 + 残留）

### 任务 13：道具库 `cine-props`
**Files:** Create `src/ui/cine-props.js`；Test `tests/cine-props.test.js`
**Interfaces（全部 `(g, opts)`，返回绘制指令数便于测试）：**
`drawNail(g,{x,y,len,w,color,alpha})`（钉帽 6×2、钉身 1px 长 14、落地阴影 1 条）；`drawLord(g,{x,y,act,alpha,fade})`（12×40 剪影：头 4×4、躯干 8×14、披风随幕色 2 笔，每幕加 1 件小配件——I 铁铲、II 香炉、III 星辰杖、IV 书、V 天平锤、VI 火钳、VII 无）；`drawSoulFire(g,{x,y,r,alpha})`（芯 3px + 晕 r5 + 2 缕尾）；`drawSevenStars(g,{cx,cy,r,alpha,lit[7],connect})`（7 点 + 6 段可选连线，位置由北斗角度常量表给出）；`drawAshPile(g,{x,y,w,h,seed,color})`（3 层梯形 + 6 粒）；`drawBloodCracks(g,{x,y,len,seed,color,alpha})`（4 段折线，逐段可点亮）；`drawFog(g,{x,y,w,count,seed,color,alpha})`（3 条 1px 折线 + 2 处起伏）；`drawCandle(g,{x,y,h,lit,alpha,color})`（柱 3 宽、焰 1×3、光晕 r4）。
**步骤：** ① 写测试（每函数 ≤60 指令、整数坐标、同参确定、`lit=false` 时不画焰）② 跑红 ③ 实现 ④ 跑绿 ⑤ 提交 `过场: 新增过场道具库 cine-props`。

### 任务 14：短过场事件 boot / sigil / retry / return
**Files:** Create `src/ui/cine-beats/short.js`；Test `tests/cutscene-events.test.js`（本任务先只覆盖四类）
**Interfaces:** 每个类导出 `{ beats:{prepare:[a,b],action:[c,d],result:[e,f]}, draw(scene, ctx), residueAt(holdP) -> string[] }`；`ctx={w,h,holdP,phase,anchors,accent,tint,seed}`；`draw` 只能碰 `scene.stageG / scene.sealG / scene.dustG / scene.fxG`。
**测试要点：** 区间 0≤a<b≤c<d≤e<f≤1；`holdP` 取 `[0,.2,.4,.6,.8,.9,1]` 各 ≤520 指令且 ≥30；同参两次调用序列相同；`residueAt(1)` 非空且 `deepEqual(residueAt(0.9))`；`residueAt(0)` 为空。
**内容：** 按规格 §7 表实现四类的三拍（boot 三烛→火苗拉成符环→环常明；sigil 落钉→触石震屏与石屑→环从钉帽外扩；retry 断口→刻笔逐段→刻线合拢；return 雾卷→烛逐盏熄→只余中央一盏）。符环：boot/sigil 用 r26→72 的小环（非大环）。
**步骤：** ① 测试 ② 红 ③ 实现 ④ 绿 ⑤ 提交 `过场: 四类短过场三拍事件`。

### 任务 15：战斗事件 act / clear / death / victory
**Files:** Create `src/ui/cine-beats/battle.js`；Modify `tests/cutscene-events.test.js`（追加四类）
**内容：** 规格 §7 —— act（门缝光 1→6px → 契约主现身 → 巨号幕数字压印碑座，残留门缝与剪影）；clear（契约主颤动 → 崩解成灰 → 契约钉被拔起断成两截，残留灰堆与断钉）；death（剪影跪倒 → 魂火升起被吹散 → 血纹从脚下蔓延 4 段，残留血纹与两盏熄烛）；victory（七钉自北斗七方位升起 → 向心汇成一枚星炸开 → 七星连线常亮，残留七星与七钉）。
**约束：** act 的「幕数字压印」只做碑座水印（`card.numeral` 相关对象由 CutsceneScene 提供），事件本身不碰文字对象；victory 可用大符环；death/clear 的符环 ≤90 或干脆不用。
**步骤：** ① 追加测试 ② 红 ③ 实现 ④ 绿（`npx vitest run tests/cutscene-events.test.js`）⑤ 提交 `过场: 四类战斗过场三拍事件`。

### 任务 16：编舞接线与预算回收
**Files:** Modify `src/ui/cutscene-choreo.js`（删除 `drawStage` 调用与 `drawKindEvent` 分发，改调 `drawEvent`）；Modify `tests/cutscene-choreo.test.js`（在 `makeScene` 里补 `anchors`、`dio` 字段；保留 ≤700 断言）
**做法：**
1. `choreo.draw` 不再调用 `drawStage`（布景已在静态层），从 `dioramaAnchors(act)` 取锚点传给事件库。
2. 保留：卡片动效（act 逐字砸落 + 落地抖 2px、clear 统计 stagger、compact 标题上浮）、clear 的 reveal 百叶、act 的落地闪洪与震屏、victory 的 flash、death 的 iris/glitch 只保留 reveal 阶段各一次。
3. 符环（sealG）：仅 `boot/sigil/victory` 画大环（cover 340→210、hold 呼吸、reveal 210→570 淡出）；其余类不画大环，交给事件画小环。
4. 音效调用保持原样（`cineIn/cineSlam/cineShatter/cineReveal/tick`），只允许把 `cineShatter` 从 clear.cover 移到 clear 事件的 action 起点。
**验证：** `npx vitest run tests/cutscene-choreo.test.js` 全绿（≤700 且 8×8 确定性）；实测指令数应从 440–700 降到 150–450，把最大值记录进 `docs/过场动画.md`。
**步骤：** ① 改测试替身（纯追加）② 跑红（因为 choreo 还没调事件库）③ 实现 ④ 绿 ⑤ 提交 `过场: 编舞改为事件驱动并回收每帧预算`。

---

## Phase D：journey 六幕

### 任务 17：journey 静态分层 + 长镜头三拍
**Files:** Modify `src/ui/story-art.js`（`JOURNEY_STAGES` 拆成 `JOURNEY_STATIC` + 动态部分）、`src/scenes/CutsceneScene.js`（journey 分支优先用 `JOURNEY_STATIC`）；Modify `tests/story-art.test.js`（追加 `JOURNEY_STATIC` 预算与确定性；保留原 ≤700）
**Interfaces:** `export const JOURNEY_STATIC = { swamp: {back,mid,fore}, star: {...}, library: {...}, court: {...}, forge: {...}, sunrise: {...} }`，每带 `(g,{w,h,anchor})`；`JOURNEY_STAGES` 导出与调用方式不变（`(g,ctx)`，每帧 ≤700）。
**内容：** 六幕沿用规格 §6 对应布景（可简化 20%），动态部分按规格 §9 的三拍实现（钟摆→波纹→倒影稳；星环转→陨星→陨坑亮；翻页→铜钟自鸣→页落回；天平倾→判卷滚落→栏杆落定；炉火涨→锤落→火星熄；晨光横扫→七星点亮→光池铺满）。字幕仍用 `jLabel/jSubtitle`，只加 1px 铜线分隔。
**步骤：** ① 追加测试（`JOURNEY_STATIC` 六幕 × 横竖屏：每带 >20 且 ≤1300，合计 ≤3200，确定性）② 红 ③ 实现 ④ 绿 ⑤ 截图目检：`docs/story/*journey*` 的空白率必须明显下降（ink ratio ≥0.50，用任务 6 的函数算）⑥ 提交 `过场: journey 六幕静态布景与三拍长镜头`。

---

## Phase E：开场与结局（可裁剪，优先级最低）

### 任务 18：开场 6 镜
**Files:** Modify `src/ui/story-art.js`（`OPENING_STATIC`）、`src/scenes/StoryScene.js`（静态三层 + 与过场一致的 fade/drift）；Modify `tests/story-art.test.js`、`scripts/story-shot.mjs`
**内容：** 规格 §10 六镜；每镜 back/mid/fore 各 ≤1300、合计 ≤3200；每帧活动层仍 ≤700。
**步骤：** ① 测试 ② 红 ③ 实现 ④ 绿 ⑤ 跑 `node scripts/story-shot.mjs`（11 项检查）⑥ 目检六张截图的无空白率与外框 ⑦ 提交 `过场: 开场六镜布景细节`。

### 任务 19：结局 4 镜
**Files:** Modify `src/ui/story-art.js`（`ENDING_STATIC`）、`src/scenes/StoryScene.js`；Modify `scripts/ending-shot.mjs`
**内容：** 规格 §10 四镜（七契碎裂成光上升 + 灰落 / 余烬空场 / 晨光扫过碑林 / 星图背景 + 名单）。
**步骤：** 同任务 18 的 ①–⑦，提交 `过场: 结局四镜布景细节`。

---

## Phase F：收尾

### 任务 20：文档与全量验收
**Files:** Modify `docs/过场动画.md`（新增「契约碑铭剧场」一节：分层架构、七幕锚点表、八类三拍表、静态/动态预算、指纹基线与本次实测值）、`docs/开场与幕间.md`（开场/journey/结局的静态分层说明）
**步骤：**
- [ ] 步骤 1：`npm test` 全绿（记录用例总数）。
- [ ] 步骤 2：`npm run build` 通过。
- [ ] 步骤 3：起静态服务器，依次跑 `scripts/cutscene-shot.mjs`（15 项 + 七幕画廊）、`scripts/story-shot.mjs`、`scripts/ending-shot.mjs`，三份 `verify.json` 全绿；把 ink ratio 与七幕指纹距离矩阵抄进文档。
- [ ] 步骤 4：竖屏复核（390×844 一张 act + 一张 compact）与 150ms 跳过复核（脚本已断言 skipped 字段）。
- [ ] 步骤 5：更新 `docs/过场动画.md` 第八节纪律：把「每帧重画全部剪影」改为「静态预绘制 + 活动件」并写明新预算。
- [ ] 步骤 6：提交 `过场: 契约碑铭剧场文档与验收数据`。

---

## Self-Review

**1. 规格覆盖**：规格 §4 锚点表 → 任务 2；§5 分层与预算 → 任务 3、16；§6 七幕 → 任务 4、7–12；§7 八类事件 → 任务 14、15；§8 碑座 → 任务 5；§9 journey → 任务 17；§10 开场结局 → 任务 18、19；§11 验收量化 → 任务 6、20。无遗漏项；规格里「不做清单」对应 Global Constraints 的六条禁令。
**2. 步骤粒度**：每个任务都是「写测试 → 跑红 → 实现 → 跑绿 → 目检 → 提交」六步以内；并行任务的文件集合互不相交。
**3. 类型/接口一致**：`dioramaAnchors`/`createDiorama` 在任务 2 定义、任务 3/4/16 使用，签名一致；`plinthLayout` 字段在任务 5 定义、测试与 `buildCardView` 使用一致；事件库 `{beats,draw,residueAt}` 在任务 14 定义、15 复用、16 接线一致；`JOURNEY_STATIC` 在任务 17 定义并被 `story-art.test.js` 与 `CutsceneScene` 同时引用。
**4. Review Focus 有测试**：五项分别落在 `pixel-signature`、`cutscene-events`、`cutscene-choreo`、`cutscene-scene`、`cinematics`+截图脚本。
**5. 篇幅比例**：骨架 6 任务、七幕 6 任务、事件 4 任务、journey 1、开场结局 2、收尾 1；最重的七幕部分已拆成互不干扰的单文件任务，适合并行。

**风险提示（执行时必须注意）：**
- 任务 5 改碑座后，`tests/cutscene-choreo.test.js` 里的 card 替身仍是旧的扁平对象；只要保留 `titleChars/titleText/statValues/statBaseY/titleBaseY` 五个字段就不会红。
- 任务 16 删掉 `drawStage` 后，`src/ui/cinematic-art.js` 里的 `drawStage` 与七个幕剪影函数会变成死代码；本计划**不删**（`tests/cinematic-art.test.js` 仍在测它们），只在文档里标注「已被 diorama 取代」。
- 截图脚本依赖 `dist`，每次改完源码必须先 `npm run build` 再截图，否则拍到旧画面。

---

## 交付记录（2026-11-12 完成）

20 个任务全部落地，按 phase 拆分提交：

| 提交 | 内容 |
| --- | --- |
| `1b7e914` | T1–T6 + 第一幕样板：`diorama-kit.js`、`dioramas/` 注册表与七幕占位、三层静态舞台、碑座、指纹脚本、七幕画廊 |
| `ea3fa05` | T13–T16：`cine-props` / 四类短过场事件 / 八类事件三拍 + 编舞事件驱动 |
| `a1b2fa1` | 碑座容器偏移修复（`plinthLayout` 绝对坐标 → 容器局部坐标）+ 截图等到 hold 中段 |
| `8b71458` | T7–T12：七幕返工（彩窗/星庭/法庭/破晓之座）+ 第 VII 幕藤色修正 |
| 本轮 | T17–T19：`journey-static.js` 六段 + `story-art.js` 开场六镜/结局四镜重写 + 文档 10.6–10.8 与第十一节 |

验收（2026-11-12 实跑）：`npx vitest run --configLoader native --pool threads` **67 文件 / 1245 项全绿**；`npx vite build --configLoader native` 通过；`cutscene-shot.mjs` 22 张、`story-shot.mjs` 14 张、`ending-shot.mjs` 9 张，三个脚本均 `ok: true`、0 pageerror。

指纹（`docs/cutscene/signatures.json`）：detail 0.329/0.529/0.430/0.525/0.441/0.346/0.454（阈值 0.12）；buckets 28/42/35/87/62/51/39（阈值 18）；21 组两两距离 0.212–0.305（阈值 0.18）。

任务 20 步骤完成情况：

- [x] 步骤 1：全量测试 67 文件 / 1245 项全绿
- [x] 步骤 2：`npx vite build --configLoader native` 通过
- [x] 步骤 3：三个截图脚本全绿，ink/detail/buckets 与距离矩阵已抄进 `docs/过场动画.md` 10.7 与第十一节
- [x] 步骤 4：竖屏复核（`14-portrait-act1.png`、`12-portrait-opening.png`、`08-portrait-ending-dawn.png`）与 150ms 跳过断言
- [x] 步骤 5：第八节纪律已改为「静态预绘制 + 活动件」，新增九条纪律（10.8）
- [x] 步骤 6：本轮提交

