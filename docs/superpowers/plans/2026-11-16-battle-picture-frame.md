# 战斗画面雕花画框 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 `BattleScene` 的 480×270 画布套一圈 8px 雕花画框，框体随玩家血量连续陈旧化（换色 + 裂纹 + 呼吸/心跳脉动 + 碎屑 + 渗血）。

**Architecture:** 新增 `src/ui/battle-frame.js`，导出纯函数（几何/档位/裂纹/混色）与 `BattleFrame` 类。类内部用三个 `Graphics` 分层：底色层和裂纹层只在档位切换时重绘，动态层每帧只画 ≤60 个图元。画框走既有的 `mountUiLayer` 路径进入 `uiRoot` 容器（depth 6000~6002），压在 HUD 与罗盘之上。为让出 8px，HUD 顶栏下层高 33→42、罗盘整体左移 8px。

**Tech Stack:** Phaser 3.90（`scene.add.graphics`）、Vitest（纯函数测试 + fake graphics）、Playwright（截图验收）。

**Spec:** `docs/superpowers/specs/2026-11-16-battle-picture-frame-design.md`

## Global Constraints

- 逻辑画布恒定 `480×270`，所有绘制用逻辑坐标；不得改动渲染倍率逻辑（`src/ui/Palette.js` 的 `applyPixelZoom` / `setRenderScale`）。
- 只用 `pxRect` / `pxLine` / `pxPoly` / `pxPolyFrame` 等 `src/ui/Palette.js` 硬边工具，禁止渐变、模糊、贴图资源。
- 不新增任何依赖，不改 `package.json`、`vite.config.js`、`src/main.js`。
- 不改 `src/logic/*` 任何文件。
- 画框只在横屏创建：`isPortrait()` 为真时**不构造** `BattleFrame`。
- 画框深度固定 `6000 / 6001 / 6002`，且必须在 `this.mountUiLayer()` 之前创建。
- 时钟一律用 `this.engine.now`（暂停与顿帧会冻结），不得用 `scene.time.now`。
- 全部新增注释与文案用中文，与仓库现有风格一致。
- 每完成一个任务运行 `npm test`，全量必须保持 0 failed。

## Review Focus

- **`maxHp` 为 0 或血量字段缺失时的除零**：`hp / maxHp` 会得到 `Infinity` 或 `NaN`，`frameTone` 必须给出确定档位而不是抛错或画出半透明乱码 → Task 1 测试覆盖 `NaN` / `Infinity` / 负数。
- **暂停（`engine.paused`）时画框仍在动**：`engine.now` 冻结而 `dt` 仍在传入，若用 `dt` 累积碎屑会出现"暂停还在掉渣" → Task 4 测试覆盖 `dt=0` 与时钟不前进。
- **血量回升后裂纹不消失**：`wear` 层若不按档位键重绘，旧裂纹会永久留在框上 → Task 3 测试覆盖 `failing → intact` 时裂纹图元被清空。
- **竖屏误创建画框**：竖屏画布 480×760，8px 框会卡在地图区中间 → Task 5 测试覆盖 `isPortrait()` 为真时不实例化。
- **HUD 下移后撞到框体内缘**：顶栏底板高度与文字 y 若不一起改，`♥` 会被框压住 → Task 6 测试断言所有顶栏文字 y ≥ 12、底板高 ≥ 41。

---

### Task 1: 几何常量、混色与血量档位

**Files:**
- Create: `src/ui/battle-frame.js`
- Test: `tests/battle-frame.test.js`

**Interfaces:**
- Consumes: `C`（`src/ui/Palette.js` 的色板对象）
- Produces:
  - `FRAME: { band: 8, outer: 1, brassDark: 2, brass: 1, stone: 3, inner: 1, ornament: 14, gem: 4, beamW: 120, beamH: 8, notchStep: 32 }`
  - `FRAME_INNER: { left: 8, top: 8, right: 472, bottom: 262 }`
  - `mixColor(a: number, b: number, t: number): number` —— `a`/`b` 是 `0xRRGGBB`
  - `frameTone(ratio: number): { tier: 'intact'|'worn'|'failing', breathHz: number, pulseHz: number, crackCount: number, debrisPerSec: number, seep: number, bloodMix: number }`

- [ ] **Step 1: 写失败测试**

```js
// tests/battle-frame.test.js
import { describe, it, expect } from 'vitest';
import { FRAME, FRAME_INNER, mixColor, frameTone } from '../src/ui/battle-frame.js';

describe('画框几何', () => {
  it('内开口与框厚自洽，正好覆盖 480×270', () => {
    expect(FRAME_INNER.left).toBe(FRAME.band);
    expect(FRAME_INNER.top).toBe(FRAME.band);
    expect(FRAME_INNER.right).toBe(480 - FRAME.band);
    expect(FRAME_INNER.bottom).toBe(270 - FRAME.band);
    expect(FRAME.band).toBe(8);
  });
  it('8px 框身的五层厚度相加等于框厚', () => {
    const sum = FRAME.outer + FRAME.brassDark + FRAME.brass + FRAME.stone + FRAME.inner;
    expect(sum).toBe(FRAME.band);
  });
});

describe('混色', () => {
  it('t=0 取 a、t=1 取 b、中间按通道线性插值', () => {
    expect(mixColor(0x000000, 0xffffff, 0)).toBe(0x000000);
    expect(mixColor(0x000000, 0xffffff, 1)).toBe(0xffffff);
    expect(mixColor(0x000000, 0xffffff, 0.5)).toBe(0x808080);
  });
  it('t 越界被夹到 0..1，非数值按 0 处理', () => {
    expect(mixColor(0x000000, 0xffffff, -3)).toBe(0x000000);
    expect(mixColor(0x000000, 0xffffff, 7)).toBe(0xffffff);
    expect(mixColor(0x000000, 0xffffff, NaN)).toBe(0x000000);
  });
});

describe('血量档位', () => {
  it('三档边界：>0.6 完好 / 0.3~0.6 陈旧 / <=0.3 破损', () => {
    expect(frameTone(1).tier).toBe('intact');
    expect(frameTone(0.61).tier).toBe('intact');
    expect(frameTone(0.6).tier).toBe('worn');
    expect(frameTone(0.31).tier).toBe('worn');
    expect(frameTone(0.3).tier).toBe('failing');
    expect(frameTone(0).tier).toBe('failing');
  });
  it('档位数值与设计文档一致', () => {
    expect(frameTone(1)).toMatchObject({ breathHz: 0.3, pulseHz: 0, crackCount: 0, debrisPerSec: 0, seep: 0, bloodMix: 0 });
    expect(frameTone(0.5)).toMatchObject({ breathHz: 0.2, pulseHz: 0, crackCount: 3, debrisPerSec: 0, seep: 0.35, bloodMix: 0.35 });
    expect(frameTone(0.1)).toMatchObject({ breathHz: 0, pulseHz: 1.1, crackCount: 6, debrisPerSec: 0.9, seep: 1, bloodMix: 1 });
  });
  it('NaN / Infinity / 负数不抛错，落到确定档位', () => {
    for (const bad of [NaN, Infinity, -Infinity, -1, undefined, null, '0.2']) {
      const tone = frameTone(bad);
      expect(['intact', 'worn', 'failing']).toContain(tone.tier);
    }
    expect(frameTone(NaN).tier).toBe('failing');
    expect(frameTone(-1).tier).toBe('failing');
    expect(frameTone(3).tier).toBe('intact');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/battle-frame.test.js`
Expected: FAIL，报 `Failed to resolve import "../src/ui/battle-frame.js"`。

- [ ] **Step 3: 实现 `src/ui/battle-frame.js` 的纯逻辑部分**

文件头注释写明用途与时钟约定。用 `Number.isFinite` 夹取后按 `> 0.6` / `> 0.3` 分档，三档分别返回设计文档 §3 表里的常量；`mixColor` 逐通道拆 `>> 16 & 0xff` 后 `Math.round` 回拼。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/battle-frame.test.js`
Expected: PASS，6 个用例全绿。

- [ ] **Step 5: 提交**

```bash
git add src/ui/battle-frame.js tests/battle-frame.test.js
git commit -m "feat: 画框几何常量、混色与血量档位纯逻辑"
```

---

### Task 2: 确定性裂纹生成

**Files:**
- Modify: `src/ui/battle-frame.js`
- Test: `tests/battle-frame.test.js`

**Interfaces:**
- Consumes: `FRAME`、`FRAME_INNER`（Task 1）、`Rng`（`src/logic/rng.js`）
- Produces: `frameCracks(seed: string, count: number): Array<{ edge: 'top'|'bottom'|'left'|'right', points: Array<{ x: number, y: number }> }>`

约定：每条裂纹**从画布最外沿起笔**（`top` 起点 `y=0`、`bottom` 起点 `y=269`、`left` 起点 `x=0`、`right` 起点 `x=479`），沿法线向内延伸 `6~14px`，因此必然横穿 8px 框身，长裂纹会溢出 0~6px 到画面里；折线每 2px 一个结，横向抖动 ±1px。

- [ ] **Step 1: 写失败测试（追加到 `tests/battle-frame.test.js`）**

```js
import { frameCracks } from '../src/ui/battle-frame.js';

describe('裂纹生成', () => {
  it('同种子同结果，不同种子不同结果', () => {
    const a = frameCracks('run-1:frame:1', 6);
    const b = frameCracks('run-1:frame:1', 6);
    const c = frameCracks('run-2:frame:1', 6);
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });
  it('条数准确，起点在画布最外沿，长度落在 6~14px', () => {
    const cracks = frameCracks('s', 6);
    expect(cracks).toHaveLength(6);
    for (const crack of cracks) {
      const start = crack.points[0];
      const end = crack.points[crack.points.length - 1];
      if (crack.edge === 'top') expect(start.y).toBe(0);
      if (crack.edge === 'bottom') expect(start.y).toBe(269);
      if (crack.edge === 'left') expect(start.x).toBe(0);
      if (crack.edge === 'right') expect(start.x).toBe(479);
      const len = Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
      expect(len).toBeGreaterThanOrEqual(6);
      expect(len).toBeLessThanOrEqual(14);
      for (const p of crack.points) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(479);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(269);
      }
    }
  });
  it('count<=0 或非数值返回空数组且不抛错', () => {
    expect(frameCracks('s', 0)).toEqual([]);
    expect(frameCracks('s', -3)).toEqual([]);
    expect(frameCracks('s', NaN)).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/battle-frame.test.js`
Expected: FAIL，`frameCracks is not a function`。

- [ ] **Step 3: 实现 `frameCracks`**

用 `new Rng(seed + ':crack:' + i)` 每条纹路独立取种子，保证数量变化时已有纹路不位移。内部分 `edgeCracks(edge)` 处理四条边，按边选法线方向。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/battle-frame.test.js`
Expected: PASS，9 个用例全绿。

- [ ] **Step 5: 提交**

```bash
git add src/ui/battle-frame.js tests/battle-frame.test.js
git commit -m "feat: 画框裂纹的确定性生成"
```

---

### Task 3: `BattleFrame` 静态框体与档位重绘

**Files:**
- Modify: `src/ui/battle-frame.js`
- Test: `tests/battle-frame.test.js`

**Interfaces:**
- Consumes: `FRAME`、`FRAME_INNER`、`mixColor`、`frameTone`、`frameCracks`、`C`、`pxRect`/`pxFrame`/`pxLine`/`pxPoly`（`src/ui/Palette.js`）
- Produces:
  - `export default class BattleFrame`
  - `new BattleFrame(scene: Phaser.Scene, seed?: string)`
  - `frame.ratio: number`（最近一次喂入的血量比例，初值 1）
  - `frame.tone`（当前档位对象，初值 `frameTone(1)`）
  - `frame.drawBase(tone)` / `frame.drawWear(tone)` / `frame.setRatio(ratio)`

- [ ] **Step 1: 写失败测试（追加）**

```js
import BattleFrame from '../src/ui/battle-frame.js';

function fakeGraphics() {
  const calls = [];
  const g = {
    calls,
    depth: 0,
    scrollFactorX: 1, scrollFactorY: 1,
    setDepth(d) { g.depth = d; return g; },
    setScrollFactor(n) { g.scrollFactorX = n; g.scrollFactorY = n; return g; },
    fillStyle: () => g, fillRect: (...a) => { calls.push(['rect', ...a]); return g; },
    lineStyle: () => g, strokePoints: () => g, fillPoints: () => g,
    clear: () => { calls.push(['clear']); return g; },
  };
  return g;
}
function fakeScene() {
  const made = [];
  return {
    made,
    add: { graphics: () => { const g = fakeGraphics(); made.push(g); return g; } },
  };
}

describe('BattleFrame 静态层', () => {
  it('构造出三层 graphics，深度 6000/6001/6002 且固定于视口', () => {
    const frame = new BattleFrame(fakeScene(), 'seed');
    expect(frame.base.depth).toBe(6000);
    expect(frame.wear.depth).toBe(6001);
    expect(frame.dyn.depth).toBe(6002);
    for (const g of [frame.base, frame.wear, frame.dyn]) expect(g.scrollFactorX).toBe(0);
  });
  it('底图绘制覆盖四边框身，且不越出画布', () => {
    const frame = new BattleFrame(fakeScene(), 'seed');
    expect(frame.base.calls.length).toBeGreaterThan(40);
    for (const [, x, y, w, h] of frame.base.calls) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + w).toBeLessThanOrEqual(480);
      expect(y + h).toBeLessThanOrEqual(270);
    }
  });
  it('完好档不画裂纹；破损档画 6 条；血量回升后裂纹图元被清空', () => {
    // 只看最后一次 clear 之后的图元，避免把历史调用算进来
    const rectsSinceClear = (g) => {
      let start = 0;
      g.calls.forEach((c, i) => { if (c[0] === 'clear') start = i + 1; });
      return g.calls.slice(start).filter(c => c[0] === 'rect').length;
    };
    const frame = new BattleFrame(fakeScene(), 'seed');
    expect(rectsSinceClear(frame.wear)).toBe(0);
    frame.setRatio(0.1);
    expect(frame.tone.tier).toBe('failing');
    expect(rectsSinceClear(frame.wear)).toBe(6 * 2); // 每条裂纹画两遍：1px 底 + 1px 高光
    frame.setRatio(1);
    expect(frame.tone.tier).toBe('intact');
    expect(rectsSinceClear(frame.wear)).toBe(0);
  });
  it('同档位重复喂入不重复重绘', () => {
    const frame = new BattleFrame(fakeScene(), 'seed');
    frame.setRatio(0.1);
    const before = frame.wear.calls.length;
    frame.setRatio(0.12);
    expect(frame.wear.calls.length).toBe(before);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/battle-frame.test.js`
Expected: FAIL，`BattleFrame is not a constructor`。

- [ ] **Step 3: 实现 `BattleFrame` 构造函数与静态层**

构造函数里三次 `scene.add.graphics()` 后依次 `setScrollFactor(0)`、`setDepth(6000/6001/6002)`，保存 `this.seed`、`this.tone = frameTone(1)`、`this.ratio = 1`，然后调 `this.drawBase(this.tone)` 与 `this.drawWear(this.tone)`。`setRatio` 里先用 `frameTone` 取新档位，`tier` 未变则直接更新 `this.ratio` 返回，变了才重绘两层并更新 `this.tone`。

`drawBase(tone)`：按设计文档 §2 的分层表逐边填 5 条（外描边 → 黄铜暗 → 黄铜亮棱 → 石面 → 内描边），石面与黄铜按 `tone.bloodMix` 向 `C.blood` 混色；四角 14×14 角花，中间 4×4 菱形宝石（`C.teal` 向 `C.blood` 混）；上沿居中 120×8 三连菱形横梁；左右下沿每 32px 一个 4×2 竖向凹槽。

`drawWear(tone)`：先 `this.wear.clear()`，再对 `frameCracks(this.seed, tone.crackCount)` 每条折线画两遍（1px `C.void` 底 + 1px `mixColor(C.brassDark, C.blood, tone.bloodMix)` 高光）。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/battle-frame.test.js`
Expected: PASS，13 个用例全绿。

- [ ] **Step 5: 提交**

```bash
git add src/ui/battle-frame.js tests/battle-frame.test.js
git commit -m "feat: 画框静态框体与档位重绘"
```

---

### Task 4: 动态层（呼吸、脉动、渗血、碎屑）

**Files:**
- Modify: `src/ui/battle-frame.js`
- Test: `tests/battle-frame.test.js`

**Interfaces:**
- Consumes: Task 3 的 `BattleFrame`
- Produces:
  - `frame.update({ ratio: number, now: number, dt: number }): void`
  - `frame.debris: Array<{ x: number, y: number, vx: number, vy: number, life: number, size: number }>`（同屏上限 `FRAME_DEBRIS_CAP = 8`，导出常量）

- [ ] **Step 1: 写失败测试（追加）**

```js
import { FRAME_DEBRIS_CAP } from '../src/ui/battle-frame.js';

describe('BattleFrame 动态层', () => {
  it('完好档动态层只有呼吸，不产生碎屑', () => {
    const frame = new BattleFrame(fakeScene(), 'seed');
    for (let t = 0; t < 3000; t += 16) frame.update({ ratio: 1, now: t, dt: 16 });
    expect(frame.debris).toHaveLength(0);
  });
  it('破损档 3 秒内产生碎屑且不超过上限', () => {
    const frame = new BattleFrame(fakeScene(), 'seed');
    let now = 0;
    for (let i = 0; i < 190; i++) { now += 16; frame.update({ ratio: 0.1, now, dt: 16 }); }
    expect(frame.debris.length).toBeGreaterThan(0);
    expect(frame.debris.length).toBeLessThanOrEqual(FRAME_DEBRIS_CAP);
  });
  it('暂停（dt=0 且 now 不前进）时不新增碎屑、不动画', () => {
    const frame = new BattleFrame(fakeScene(), 'seed');
    for (let t = 0; t < 2000; t += 16) frame.update({ ratio: 0.1, now: t, dt: 16 });
    const before = frame.debris.map(d => ({ ...d }));
    for (let i = 0; i < 30; i++) frame.update({ ratio: 0.1, now: 2000, dt: 0 });
    expect(frame.debris).toEqual(before);
  });
  it('单帧动态层图元不超过 60 个', () => {
    const frame = new BattleFrame(fakeScene(), 'seed');
    frame.update({ ratio: 0.1, now: 1234, dt: 16 });
    const rects = frame.dyn.calls.filter(c => c[0] === 'rect').length;
    expect(rects).toBeLessThanOrEqual(60);
  });
  it('血量比例喂入后 ratio 被夹到 0..1', () => {
    const frame = new BattleFrame(fakeScene(), 'seed');
    frame.update({ ratio: 5, now: 0, dt: 16 });
    expect(frame.ratio).toBe(1);
    frame.update({ ratio: -2, now: 16, dt: 16 });
    expect(frame.ratio).toBe(0);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/battle-frame.test.js`
Expected: FAIL，`frame.update is not a function`。

- [ ] **Step 3: 实现 `update`**

每帧 `this.dyn.clear()` 后：先按 `dt` 推进既有碎屑（位置、重力 `+0.06 px/ms²`、`life -= dt`，飞出内开口或寿命归零则移除），再按 `tone.debrisPerSec * dt / 1000` 的期望值用确定性 Rng 决定本帧是否生成（`this.debris.length < FRAME_DEBRIS_CAP` 且 `dt > 0` 才生成）；最后画呼吸（沿框体内缘 1px 高光，`alpha = 0.18 + 0.12 * sin(2π * breathHz * now / 1000)`）、脉动（`pulseHz > 0` 时内缘 2px `C.blood` 光晕，`alpha = 0.15 + 0.4 * (0.5 + 0.5 * sin(2π * pulseHz * now / 1000))`）、四角渗血（长度 `4 + 6 * (0.5 + 0.5 * sin(now / 900))` 乘 `tone.seep`）、宝石高光，最后逐颗画碎屑。`update` 内部先调 `setRatio(ratio)`。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/battle-frame.test.js`
Expected: PASS，18 个用例全绿。

- [ ] **Step 5: 提交**

```bash
git add src/ui/battle-frame.js tests/battle-frame.test.js
git commit -m "feat: 画框动态层（呼吸、脉动、渗血、碎屑）"
```

---

### Task 5: 接入 `BattleScene`

**Files:**
- Modify: `src/scenes/BattleScene.js:44`（import 区）、`:318-324`（创建时机）、`:669-682`（每帧更新）
- Test: `tests/battle-frame.test.js`

**Interfaces:**
- Consumes: `BattleFrame`（Task 4）
- Produces: `battleScene.frame: BattleFrame | undefined`

- [ ] **Step 1: 写失败测试（追加）**

```js
import { afterEach, vi } from 'vitest';
import { setPortrait } from '../src/ui/Palette.js';
import { createBattleFrame } from '../src/scenes/BattleScene.js';

// 与 tests/battle-flow.test.js 同款：沙箱里没有浏览器，用最小 Phaser 替身只为让模块能被 import
vi.mock('phaser', () => ({
  default: { Scene: class { constructor(key) { this.key = key; } } },
}));

function frameScene() {
  const made = [];
  return {
    made,
    add: { graphics: () => { const g = fakeGraphics(); made.push(g); return g; } },
  };
}

describe('画框接入战斗场景', () => {
  afterEach(() => setPortrait(false));
  it('横屏构造画框，种子带上局内 seed 与场次', () => {
    setPortrait(false);
    const frame = createBattleFrame(frameScene(), { seed: 'run-x', stage: 3 });
    expect(frame).toBeDefined();
    expect(frame.seed).toContain('run-x');
    expect(frame.seed).toContain('3');
  });
  it('竖屏不构造画框', () => {
    setPortrait(true);
    expect(createBattleFrame(frameScene(), { seed: 'run-x', stage: 1 })).toBeUndefined();
  });
});
```

`vi.mock` 必须写在文件顶部（与其它 import 同层），Vitest 会把它提到所有 import 之前；`fakeGraphics` 复用 Task 3 里那个记录器。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/battle-frame.test.js`
Expected: FAIL，`createBattleFrame is not a function`。

- [ ] **Step 3: 实现接入**

`BattleScene.js`：
1. import 区（`:44` 附近）加 `import BattleFrame from '../ui/battle-frame.js';`（与其它 UI import 同组）。
2. 文件顶部 `const BATTLE = ...` 之前导出工厂：`export function createBattleFrame(scene, { seed, stage }) { if (isPortrait()) return undefined; return new BattleFrame(scene, seed + ':frame:' + stage); }`（`isPortrait` 已在 `:44` 的 Palette 解构里导入）。
3. `create()` 里 `this.mountUiLayer();`（`:324`）**之前**插入 `this.frame = createBattleFrame(this, { seed: this.run.seed, stage: this.stage });`。
4. `update()` 末尾 `this.hud.update({...})`（`:669-682`）之后插入：

```js
this.frame?.update({
  ratio: this.player.hp / Math.max(1, this.player.maxHp),
  now: this.engine.now,
  dt,
});
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/battle-frame.test.js`
Expected: PASS，20 个用例全绿。

- [ ] **Step 5: 跑全量回归**

Run: `npm test`
Expected: 0 failed。

- [ ] **Step 6: 提交**

```bash
git add src/scenes/BattleScene.js tests/battle-frame.test.js
git commit -m "feat: 战斗场景接入血量驱动画框"
```

---

### Task 6: 顶栏下移 8px（33 → 42）

**Files:**
- Modify: `src/ui/Hud.js:22-31`（文字 y）、`:46-58`（静态底板）、`:67-85`（动态血条与 EXP 条）、`:94`（碎片图标）、`:97-101`（频率小柱）
- Test: `tests/hud.test.js`

**Interfaces:**
- Consumes: 无
- Produces: 顶栏底板高 `42`，第一行文字 `y=13`，第二行文字 `y=29`

- [ ] **Step 1: 写失败测试（追加到 `tests/hud.test.js`）**

```js
describe('顶栏为画框让出 8px', () => {
  it('两行文字都落在 y>=12，不会被画框压住', () => {
    const hud = fixture();
    expect(hud.hpText.y).toBe(13);
    expect(hud.timeText.y).toBe(13);
    expect(hud.lvText.y).toBe(29);
    expect(hud.expText.y).toBe(29);
  });
  it('顶栏底板覆盖到 y=42，画框不再压住任何字', () => {
    // 记录型 stub：把 fillRect 的矩形全存下来
    const rects = [];
    const g = {
      fillStyle: () => g, lineStyle: () => g, strokePoints: () => g, fillPoints: () => g,
      fillRect: (x, y, w, h) => { rects.push([x, y, w, h]); return g; }, clear: () => g,
    };
    const scene = {
      time: { now: 0 },
      add: {
        graphics: () => g,
        text: (x, y, s) => {
          const t = { x, y, text: s, setDepth() { return t; }, setOrigin() { return t; }, setResolution() { return t; }, setScrollFactor() { return t; }, setText(v) { t.text = v; return t; } };
          return t;
        },
      },
    };
    new Hud(scene);
    expect(rects.some(([x, y, w, h]) => x === 0 && y === 0 && w === 480 && h === 42)).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/hud.test.js`
Expected: FAIL，`expected 4 to be 13`。

- [ ] **Step 3: 平移坐标**

`Hud.js` 全部按 `+8` 平移：`hpText/shardText/freqText/actText/timeText` 的 y `4→13`；`lvText/expText` 的 y `20→29`；静态底板 `pxRect(g,0,0,480,33)` → `480,42`，黄铜线 `y33` → `42`，分隔线 `y18` → `27`，铆钉 `y3/y14` → `12/23`，血条槽与刻度 `y7` → `16`，频率槽 `y14` → `23`；动态层血条 `y8` → `17`、刻度 `y7` → `16`、心形 `y6` → `15`、低血侧边条 `h19` → `h28`；EXP 槽 `y24/25` → `33/34`；频率小柱 `y17 - h` → `y26 - h`；碎片图标 `y6` → `15`。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/hud.test.js`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/ui/Hud.js tests/hud.test.js
git commit -m "feat: 顶栏下移 8px 为画框让位"
```

---

### Task 7: 罗盘左移 8px 与细目右移

**Files:**
- Modify: `src/ui/SigilBoard.js:10-22`（`BOARD_LANDSCAPE`）、`:84-89`（细目文字 x）
- Test: `tests/board-decor.test.js`（新增一个 describe 或改放到 `tests/battle-frame.test.js`）

**Interfaces:**
- Consumes: 无
- Produces: `BOARD_LANDSCAPE.panel = { x: 318, y: 174, w: 152, h: 86 }`、`BOARD_LANDSCAPE.left = 338`

- [ ] **Step 1: 写失败测试**

```js
// 追加到 tests/battle-frame.test.js
import { applyBoardLayout, BOARD, hullPoints } from '../src/ui/SigilBoard.js';

describe('罗盘为画框让位', () => {
  it('横屏面板与台面都不越过内开口（右沿 <= 472，下沿 <= 262）', () => {
    applyBoardLayout(false);
    expect(BOARD.panel.x).toBe(318);
    expect(BOARD.panel.x + BOARD.panel.w).toBeLessThanOrEqual(472);
    expect(BOARD.panel.y + BOARD.panel.h).toBeLessThanOrEqual(262);
    const hull = hullPoints();
    expect(Math.max(...hull.map(p => p.x))).toBeLessThanOrEqual(472);
    expect(Math.max(...hull.map(p => p.y))).toBeLessThanOrEqual(262);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/battle-frame.test.js`
Expected: FAIL，`expected 326 to be 318`。

- [ ] **Step 3: 平移**

`BOARD_LANDSCAPE.panel.x` `326 → 318`，`BOARD_LANDSCAPE.left` `346 → 338`（其余字段不动，台面右沿随 `left` 从 473 收到 465）。细目三处 x `8/62/8` → `11/65/11`。竖屏 `BOARD_PORTRAIT` 不动。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/battle-frame.test.js`
Expected: PASS。

- [ ] **Step 5: 跑全量回归**

Run: `npm test`
Expected: 0 failed。

- [ ] **Step 6: 提交**

```bash
git add src/ui/SigilBoard.js tests/battle-frame.test.js
git commit -m "feat: 罗盘左移 8px 为画框让位"
```

---

### Task 8: 截图验收

**Files:**
- Create: `scripts/frame-shot.mjs`
- Output: `docs/frame-intact.png`、`docs/frame-worn.png`、`docs/frame-failing.png`

**Interfaces:**
- Consumes: 运行中的 `vite preview`（默认 `http://127.0.0.1:4173`，可用 `BASE_URL` 覆盖）、`window.__SIGILWEAVE_BATTLE__`
- Produces: 三张 1920×1080 战斗截图

- [ ] **Step 1: 写截图脚本**

照 `scripts/battle-shot.mjs` 的骨架（`chromium.launch({ channel: 'msedge' })`、`?seed=frame`、Enter 进 Loadout、Enter 进战斗、等 `phase === 'play'`），依次把 `s.player.hp` 设为 `maxHp`、`0.45 * maxHp`、`0.15 * maxHp`（同时 `s.player.invulnUntil = Number.MAX_SAFE_INTEGER` 防被怪打死），每档等 1200ms 后截图，输出到 `docs/frame-intact.png` / `frame-worn.png` / `frame-failing.png`，最后打印 `pageerror` 收集结果。

- [ ] **Step 2: 起预览服务**

Run: `npm run build && npx vite preview --port 4173`
Expected: 输出 `Local: http://127.0.0.1:4173/`（后台任务运行）。

- [ ] **Step 3: 跑截图**

Run: `node scripts/frame-shot.mjs`
Expected: `{"errors":[]}`，三张 PNG 落盘。

- [ ] **Step 4: 逐张看图**

用 `read_image` 看三张图，确认：框体四边完整、角花对称、上沿横梁居中；完好档无裂纹无碎屑；陈旧档出现 3 道裂纹；破损档 6 道裂纹且四角有渗血；顶栏文字不被框遮挡；罗盘右沿与框体留出空隙；底部提示文字完整可见。

- [ ] **Step 5: 提交**

```bash
git add scripts/frame-shot.mjs docs/frame-intact.png docs/frame-worn.png docs/frame-failing.png
git commit -m "test: 画框三档血量截图验收"
```
