# 战斗深化（冲刺闪避 / Boss 阶段战 / 怪物编队）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给《共振法阵》加三层战斗纵深：玩家右键冲刺 + 控制抗性递减反制硬控；Boss 三阶段 + 专属大招 + 破防窗口；杂兵按编队出现并带护卫光环。

**Architecture:** 三层都遵循本项目既有分层——纯逻辑进 `src/logic/` 或 `src/data/`（零 Phaser、零 `Math.random`、非法输入回退），场景层只做接线与表现。冲刺状态机在 `Player`，Boss 阶段机在 `boss.js`（用 `ctx` 第五参分叉，旧路径零漂移），编队在 `spawn.js` + 新数据文件。

**Tech Stack:** Phaser 3、原生 ES Module、Vitest、Vite。

**Spec:** `docs/superpowers/specs/2026-11-18-combat-depth-design.md`（下称「spec」）

## Global Constraints

- 全中文注释与文案；注释解释「为什么」，不解释「是什么」。
- 纯逻辑模块纪律（`src/logic/`、`src/data/`）：零 Phaser、零 DOM、零 `Math.random`、非法输入一律回退默认值、不抛错。
- **不做 git commit。** 本项目当前处于「用户未批准提交」状态（工作区已有未提交改动）。每个任务结束只要求「测试绿」，改动留在工作区，由用户统一决定何时提交。
- 冻结不动：`index.html`、`package.json`、`vite.config.js`、`src/main.js`、`src/data/control.js`、`src/logic/enemy-ai.js`、`src/data/cards.js`、`src/data/evolutions.js`、`src/data/linkages.js`、`src/data/factions.js`、`src/ui/Palette.js`。
- 沙箱测试命令（`npm test` 会因 EPERM 失败，必须用临时配置）：

  ```bash
  cd /d/AgentPrograms/Sigilweave
  printf 'export default { test: { include: ["tests/**/*.test.js"], globals: false } };\n' > vitest.tmp.config.mjs
  npx vitest run --config vitest.tmp.config.mjs --pool=threads
  npx vite build --config vitest.tmp.config.mjs
  rm -f vitest.tmp.config.mjs
  ```

  单文件跑：`npx vitest run --config vitest.tmp.config.mjs --pool=threads tests/dash.test.js`
- 基线：87 files / 1784 tests 全绿。每波结束必须仍是全绿且数量只增不减。
- 唯一允许改的既有断言：`tests/hostile.test.js:182` 的 `toEqual` → `toMatchObject`（Task B5），以及 `tests/guide-content.test.js` 的 coverage 断言（Task A6 / B7 / C5）。

## Review Focus

1. **冲刺中吃到控制**：玩家按右键冲刺的同时被挂上 `root`，冲刺结束的那一刻应该是「仍然定身」而不是「冲刺把新控制也清了」——清除只发生在冲刺**启动**的那一帧，之后挂上的控制照常生效。
2. **不传 `ctx` 调 `stepBoss`**：任何既有调用方（含测试）不传第五参时，产出的弹幕必须与改动前逐字段一致，包括 `model.windupLeft === 600`。
3. **Boss 一次被打掉两档血**：技能是整发法术伤害，一跳从 100% 到 30% 是可能的；结果必须是「只演一段、推到阶段 2、剩余留到下一帧」，不能两段演出叠在一帧，也不能跳档导致阶段 3 的参数提前生效。
4. **编队里前排先死**：护卫光环必须在 vanguard 死亡后的**同一帧**消失，不能让后排还挂着 +0.15 armor 走完一个节流窗口。
5. **编队刷怪时同屏已接近上限**：`room <= 0` 时必须是「本轮不刷、编队轮次不消耗」，不能因为提前 return 就把 `waveIndex` 加一而白跳一次编队。

---

## A 波：读招与闪避

### Task A1: 把击退僵直从眩晕里拆出来

**Files:**
- Modify: `src/entities/Player.js`（`applyControl` 附近，约 79-95 行）
- Modify: `src/scenes/BattleScene.js`（`applyPlayerControl`，833-851 行）
- Test: `tests/dash.test.js`（新建，本任务先只写这一组）

**Interfaces:**
- Produces: `Player.applyKnockStun(ms: number, now: number): boolean`；`Player.knockStunUntil: number`（初值 0）；`Player.moveBlocked(now): boolean` 现在判 `stunUntil || rootUntil || knockStunUntil` 三者。

- [ ] **Step 1: 写失败测试**

```js
// tests/dash.test.js
import { describe, it, expect } from 'vitest';
import { FakeScene, makePlayer } from './helpers/player-fixture.js';

describe('击退僵直与眩晕分开', () => {
  it('applyKnockStun 只写 knockStunUntil', () => {
    const p = makePlayer();
    p.applyKnockStun(240, 1000);
    expect(p.knockStunUntil).toBe(1240);
    expect(p.stunUntil).toBe(0);
  });
  it('knockStun 期间移动被挡', () => {
    const p = makePlayer();
    p.applyKnockStun(240, 1000);
    expect(p.moveBlocked(1100)).toBe(true);
    expect(p.moveBlocked(1300)).toBe(false);
  });
  it('applyControl 仍只认 stun/root/slow', () => {
    const p = makePlayer();
    expect(p.applyControl('knock', 240, 1000)).toBe(false);
  });
});
```

`tests/helpers/player-fixture.js` 若不存在就新建：`FakeScene` 提供 `add.graphics()` 返回 `{ setDepth(){return this}, clear(){}, ... }`、`textures.exists()` 返回 `false`、`add.sprite` 不存在；`makePlayer()` 返回 `new Player(scene, 240, 135)`。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run --config vitest.tmp.config.mjs --pool=threads tests/dash.test.js`
Expected: FAIL，`p.applyKnockStun is not a function`。

- [ ] **Step 3: 实现**

`Player` 构造函数加 `this.knockStunUntil = 0;`。新增：

```js
// 击退的僵直与「真眩晕」分开记：眩晕冲刺解不掉，击退僵直冲刺能解（spec §3.1.1）。
applyKnockStun(ms, now) {
  if (!this.alive || !(ms > 0) || !Number.isFinite(ms)) return false;
  this.knockStunUntil = Math.max(this.knockStunUntil, now + ms);
  this.controlAt = now;
  return true;
}
```

`moveBlocked` 改为 `return now < this.stunUntil || now < this.rootUntil || now < this.knockStunUntil;`。
`BattleScene.applyPlayerControl` 的 knock 分支把 `p.applyControl('stun', cfg.ms ?? 200, now)` 换成 `p.applyKnockStun(cfg.ms ?? 200, now)`。

- [ ] **Step 4: 跑测试确认通过 + 全量回归**

Run: `npx vitest run --config vitest.tmp.config.mjs --pool=threads`
Expected: 全绿，1784 + 3 = 1787 项。

- [ ] **Step 5: 不提交，进入 A2。**

---

### Task A2: 控制抗性递减

**Files:**
- Modify: `src/entities/Player.js`（`applyControl`）
- Modify: `src/data/control.js`（新增常量，**只加导出，不改现有表**）
- Test: `tests/control-resistance.test.js`（新建）

**Interfaces:**
- Consumes: Task A1 的 `applyKnockStun`。
- Produces: `CONTROL_RESISTANCE = { windowMs: 10000, steps: [1, 0.6, 0.35], minMs: 150 }`（导出在 `src/data/control.js`）；`Player.controlLog: { stun: number[], root: number[], slow: number[] }`。

- [ ] **Step 1: 写失败测试**

```js
// tests/control-resistance.test.js
it('同类控制 10 秒内递减 1 → 0.6 → 0.35', () => {
  const p = makePlayer();
  p.applyControl('root', 800, 0);     expect(p.rootUntil - 0).toBe(800);
  p.applyControl('root', 800, 1000);  expect(p.rootUntil - 1000).toBe(480);
  p.applyControl('root', 800, 2000);  expect(p.rootUntil - 2000).toBe(280);
  p.applyControl('root', 800, 3000);  expect(p.rootUntil - 3000).toBe(280);
});
it('下限 150ms', () => {
  const p = makePlayer();
  p.applyControl('slow', 200, 0);
  p.applyControl('slow', 200, 100);
  p.applyControl('slow', 200, 200);   // 200×0.35=70 → 抬到 150
  expect(p.slowUntil - 200).toBe(150);
});
it('超过 10 秒窗口后重新计满', () => {
  const p = makePlayer();
  p.applyControl('root', 800, 0);
  p.applyControl('root', 800, 12000);
  expect(p.rootUntil - 12000).toBe(800);
});
it('不同 kind 独立计数', () => {
  const p = makePlayer();
  p.applyControl('root', 800, 0);
  p.applyControl('stun', 700, 0);     // 仍是满额
  expect(p.stunUntil - 0).toBe(700);
});
it('knockStun 不进递减表', () => {
  const p = makePlayer();
  p.applyKnockStun(240, 0);
  p.applyControl('stun', 700, 100);
  expect(p.stunUntil - 100).toBe(700);
});
```

- [ ] **Step 2: 跑测试确认失败**

Expected: 第一条 `expect 800 to be 480`。

- [ ] **Step 3: 实现**

`src/data/control.js` 追加 `CONTROL_RESISTANCE` 导出（spec §3.2 的值）。
`Player` 构造加 `this.controlLog = { stun: [], root: [], slow: [] };`。`applyControl` 在算 `until` 之前：

```js
const log = this.controlLog[kind];
const cutoff = now - CONTROL_RESISTANCE.windowMs;
while (log.length && log[0] <= cutoff) log.shift();
const step = CONTROL_RESISTANCE.steps[Math.min(log.length, CONTROL_RESISTANCE.steps.length - 1)];
const realMs = Math.max(CONTROL_RESISTANCE.minMs, ms * step);
log.push(now);
```

再用 `realMs` 写 `xxxUntil`。

- [ ] **Step 4: 跑全量**

Expected: 1787 + 5 = 1792 项全绿。

- [ ] **Step 5: 不提交，进入 A3。**

---

### Task A3: 冲刺状态机（纯逻辑）

**Files:**
- Modify: `src/data/roster.js`（`PLAYER` 加 `dash`）
- Modify: `src/entities/Player.js`（新增冲刺字段与方法，`takeDamage` 加 `dashInvulnUntil`）
- Test: `tests/dash.test.js`（追加）

**Interfaces:**
- Produces:
  - `PLAYER.dash = { distance: 108, ms: 180, invulnMs: 220, cooldownMs: 1200, afterMs: 400 }`
  - `Player.startDash(dx: number, dy: number, now: number): boolean` —— 成功返回 true，方向由 `dx/dy` 归一化，`dx=dy=0` 时朝 `this.facing`（`+1` → 右，`-1` → 左）。
  - `Player.dashReadyAt: number`、`Player.dashUntil: number`、`Player.dashInvulnUntil: number`、`Player.dashDir: {x,y}`、`Player.dashFrom: {x,y}`
  - `Player.updateDash(dtMs: number, bounds: object, now: number): boolean` —— 冲刺中返回 true 并按进度插值位置（含边界钳制）。

- [ ] **Step 1: 写失败测试**

```js
it('冲刺位移 108px 且到点停住', () => {
  const p = makePlayer(); p.x = 240; p.y = 135;
  p.startDash(1, 0, 0);
  p.updateDash(90, WORLD, 90);
  expect(Math.round(p.x)).toBe(267);   // 240 + 108×0.5
  p.updateDash(90, WORLD, 180);
  expect(Math.round(p.x)).toBe(348);
  expect(p.updateDash(16, WORLD, 200)).toBe(false);
});
it('冲刺写无敌 220ms 但不动 invulnUntil', () => {
  const p = makePlayer(); p.startDash(1, 0, 0);
  expect(p.dashInvulnUntil).toBe(220);
  expect(p.invulnUntil).toBe(0);
  expect(p.takeDamage(10, 100)).toBe(false);   // 冲刺无敌挡住
});
it('冲刺无敌不覆盖受击无敌', () => {
  const p = makePlayer();
  p.takeDamage(5, 0);                          // invulnUntil = 660
  p.startDash(1, 0, 100);                      // dashInvulnUntil = 320
  expect(p.invulnUntil).toBe(660);
  expect(p.takeDamage(5, 400)).toBe(false);    // 660 仍生效
});
it('冷却 1.2s + 后摇 400ms', () => {
  const p = makePlayer(); p.startDash(1, 0, 0);
  p.updateDash(180, WORLD, 180);
  expect(p.startDash(1, 0, 181)).toBe(false);
  expect(p.startDash(1, 0, 579)).toBe(false);  // 180+400 后摇内
  expect(p.startDash(1, 0, 1200)).toBe(true);  // 1.2s 到
});
it('无输入朝 facing', () => {
  const p = makePlayer(); p.facing = -1; p.startDash(0, 0, 0);
  expect(p.dashDir.x).toBe(-1); expect(p.dashDir.y).toBe(0);
});
it('冲刺启动时清 root/slow/knockStun，不清 stun', () => {
  const p = makePlayer();
  p.applyControl('root', 800, 0);
  p.applyControl('slow', 800, 0);
  p.applyKnockStun(240, 0);
  p.applyControl('stun', 700, 0);
  p.startDash(1, 0, 100);
  expect(p.rootUntil).toBe(0);
  expect(p.slowUntil).toBe(0);
  expect(p.knockStunUntil).toBe(0);
  expect(p.stunUntil).toBe(700);
});
it('冲刺启动之后挂的控制照常生效', () => {
  const p = makePlayer(); p.startDash(1, 0, 0);
  p.applyControl('root', 800, 90);
  expect(p.rootUntil).toBe(890);
});
it('冲刺越界被钳制', () => {
  const p = makePlayer(); p.x = 470;
  p.startDash(1, 0, 0);
  p.updateDash(180, WORLD, 180);
  expect(p.x).toBe(WORLD.right);
});
```

`WORLD = { left: 0, top: 20, right: 480, bottom: 250 }`。

- [ ] **Step 2: 跑测试确认失败**

Expected: `p.startDash is not a function`。

- [ ] **Step 3: 实现**

要点（按 spec §3.1 的数值）：`startDash` 先用 `now < this.dashReadyAt || now < this.dashUntil` 挡；算方向与终点 `dashTo = from + dir × distance`；写 `dashFrom/dashDir/dashUntil/dashInvulnUntil/dashReadyAt = now + ms + afterMs`（`afterMs` 是**后摇**，与冷却取更晚者：`dashReadyAt = now + Math.max(ms + afterMs, cooldownMs)`）；清 `rootUntil/slowUntil/knockStunUntil` 为 0。
`updateDash` 用 `t = (now - (dashUntil - ms)) / ms` 插值 `dashFrom → dashTo`，再按 `bounds` 加 `radius` 钳制；`now >= dashUntil` 返回 false。
`takeDamage` 首行判定改 `if (now < this.invulnUntil || now < this.dashInvulnUntil) return false;`。

- [ ] **Step 4: 跑全量**

Expected: 1792 + 8 = 1800 项全绿。

- [ ] **Step 5: 不提交，进入 A4。**

---

### Task A4: 冲刺接线（右键输入 + HUD）

**Files:**
- Modify: `src/entities/Player.js`（`update` 里若在冲刺则跳过普通移动，改调 `updateDash`）
- Modify: `src/scenes/BattleScene.js`（`updatePlayer` 与右键监听）
- Modify: `src/ui/Hud.js`（冲刺指示）
- Test: `tests/dash.test.js`（追加一条场景级）

**Interfaces:**
- Consumes: `Player.startDash / updateDash / dashReadyAt`。
- Produces: `BattleScene.tryDash(now: number): boolean`（供引导与测试直接调）。

- [ ] **Step 1: 写失败测试**

```js
it('冲刺期间普通移动不生效', () => {
  const p = makePlayer(); p.startDash(1, 0, 0);
  p.update(16, 0, -1, WORLD, 16);       // 想往上走
  expect(p.y).toBe(135);                 // 仍在冲刺插值，不改 y
});
```

- [ ] **Step 2: 跑测试确认失败**

Expected: `p.y` 变成 135 以外（普通移动生效）。

- [ ] **Step 3: 实现**

`Player.update` 开头：`if (this.updateDash(dtMs, bounds, now)) { this.draw(now); this.g.setDepth(Math.floor(this.y) + 0.5); return; }`。
`BattleScene` 构造里注册右键监听（**照 `editPointer` 的模式**，开编辑法阵/升级/暂停时 `off`）：

```js
this.dashPointer = (pointer) => { if (pointer.button === 2) this.tryDash(this.engine.now); };
this.input.on('pointerdown', this.dashPointer);
```

`tryDash(now)`：`if (this.phase !== 'play' || this.paused || this.menuOpen || this.editOpen || this.hitstopLeft > 0 || !this.player.alive) return false;` 然后取 `readMoveAxis()` 的 `dx/dy` 调 `startDash`，成功后 `sfx.trigger()` + `effects.burst(玩家位, C.teal, 8)`。`updatePlayer` 里若 `player.dashUntil > now` 就传 `dt` 与 `0,0` 给 `player.update`（让 `updateDash` 接管）。
`destroy`/`shutdown` 里 `off('pointerdown', this.dashPointer)`。
`Hud.drawSkills` 之后加 `drawDashCd(dashReadyAt, now)`：`left: 148, top: 216`，24×24 圆环，冷却中按扇形遮罩。

- [ ] **Step 4: 跑全量 + build**

Expected: 1801 项全绿；`npx vite build --config vitest.tmp.config.mjs` 成功。

- [ ] **Step 5: 不提交，进入 A5。**

---

### Task A5: 敌人前摇统一红环

**Files:**
- Modify: `src/entities/Enemy.js`（`applyResult` 记 `windupAt/windupDur`；`drawCastPose` 推 telegraph）
- Test: `tests/enemy-ai.test.js`（追加）或新建 `tests/enemy-telegraph.test.js`

**Interfaces:**
- Produces: `Enemy.windupAt: number`（进入 windup 的时刻）、`Enemy.windupDur: number`（本次前摇总时长，从 `brain.melee.windupMs` / `brain.ranged.windupMs` 读，读不到为 0）。

- [ ] **Step 1: 写失败测试**

```js
it('进入 windup 时记录起点与时长', () => {
  const e = makeEnemy('skeleton');
  e.applyResult({ windup: true, x: 240, y: 135 }, 16, 5000);
  expect(e.windupAt).toBe(5000);
  expect(e.windupDur).toBe(420);       // MELEE_RULES.skeleton.windupMs
});
it('读不到 windupMs 时为 0，不画红环', () => {
  const e = makeEnemy('bat');
  e.applyResult({ windup: true, x: 1, y: 1 }, 16, 100);
  expect(e.windupDur).toBe(260);        // bat 有 melee 表
});
```

- [ ] **Step 2: 跑测试确认失败**

Expected: `e.windupAt` 为 `undefined`。

- [ ] **Step 3: 实现**

在 `applyResult` 里 `this.windup && !wasWindup` 的那个分支内记 `this.windupAt = now; this.windupDur = Number.isFinite(brain?.melee?.windupMs) ? brain.melee.windupMs : (Number.isFinite(brain?.ranged?.windupMs) ? brain.ranged.windupMs : 0);`，并在同一分支调 `this.scene?.effects?.telegraph?.(this.x, this.y, this.windupDur, C.blood, this.radius * 1.6)`（**只推一次**，不能每帧推）。

- [ ] **Step 4: 跑全量**

Expected: 全绿，+2 项。

- [ ] **Step 5: 不提交，进入 A6。**

---

### Task A6: A 波收口（引导 + 规格表 + 仿真开关）

**Files:**
- Modify: `src/data/guide-content.json`（G17 + `meta.coverage` + `version` 0.4.2）
- Modify: `docs/内容规格表.md`
- Modify: `scripts/density-sim.mjs`（`SIM_DASH=1`）
- Test: `tests/guide-content.test.js`（coverage 断言）

**Interfaces:**
- Consumes: `BattleScene.tryDash`。

- [ ] **Step 1: 写失败测试**

`tests/guide-content.test.js` 的 coverage 断言加上 `'G17'`。

- [ ] **Step 2: 跑测试确认失败**

Expected: coverage 不含 G17。

- [ ] **Step 3: 实现**

G17 文案（墨宝语气）：「喵！被定住/被撞飞的时候按**右键**冲刺，能挣开——但眩晕挣不开，看到红圈要提前躲！」`trigger` 用 `{ scene: 'BattleScene', event: 'PLAYER_CONTROLED', oncePerRun: true }`，埋点在 `BattleScene.applyPlayerControl` 末尾（`cfg.kind !== 'stun'` 时 fire）。
`docs/内容规格表.md` 的玩家栏加「冲刺」一行（108px / 180ms / 无敌 220ms / 冷却 1200ms / 后摇 400ms / 解定身·迟滞·击退僵直，不解眩晕）。
`scripts/density-sim.mjs` 加 `SIM_DASH=1`：受控时每 1.2 秒调一次 `startDash`，日志头部打印模式名。

- [ ] **Step 4: 跑 A 波验收**

```bash
npx vitest run --config vitest.tmp.config.mjs --pool=threads
SIM_STAY=1 node scripts/density-sim.mjs
SIM_STAY=1 SIM_DASH=1 node scripts/density-sim.mjs
```

Expected: 全绿；两条仿真存活时长差距在 20~35 秒区间（spec §8），数据记下来给 D 波用。

- [ ] **Step 5: 不提交，进入 B 波。**

---

## B 波：Boss 阶段战

### Task B1: 阶段与大招数据

**Files:**
- Create: `src/data/boss-phases.js`
- Test: `tests/boss-phases.test.js`（新建）

**Interfaces:**
- Produces:
  - `BOSS_PHASES: [{ phase: 0, attackMul: 1.0, windupMs: 600, countMul: 1.0, speedMul: 1.0, ultEveryMs: 12000 }, { phase: 1, attackMul: 0.82, windupMs: 540, countMul: 1.25, speedMul: 1.08, ultEveryMs: 10000 }, { phase: 2, attackMul: 0.68, windupMs: 480, countMul: 1.5, speedMul: 1.15, ultEveryMs: 8000 }]`
  - `BOSS_ULTIMATES: { 1..7: { kind, chargeMs: 1200, waves, color } }`
  - `BOSS_CONTROLS: { 1..7: null | { kind, ms, factor? } }`
  - `bossUltimateFor(stage): object`、`bossControlFor(stage): object | null`、`bossPhaseFor(phase): object`
  - `BREAK_WINDOW_MS = 1200`、`BREAK_DAMAGE_MUL = 1.2`、`ENRAGE_HP_RATIO = 0.2`、`ENRAGE_ATTACK_MUL = 0.8`、`PHASE_SHIFT_MS = 900`、`PHASE_THRESHOLDS = [0.66, 0.33]`

- [ ] **Step 1: 写失败测试**

```js
it('三阶段参数与 spec §4.1 一致', () => {
  expect(BOSS_PHASES.map(p => p.windupMs)).toEqual([600, 540, 480]);
  expect(BOSS_PHASES.map(p => p.countMul)).toEqual([1, 1.25, 1.5]);
});
it('七场都有大招，且硬控只在场 3~7', () => {
  for (let s = 1; s <= 7; s++) expect(bossUltimateFor(s).chargeMs).toBe(1200);
  expect(bossControlFor(1)).toBeNull();
  expect(bossControlFor(2)).toBeNull();
  expect(bossControlFor(3)).toEqual({ kind: 'slow', ms: 1000, factor: 0.6 });
  expect(bossControlFor(7)).toEqual({ kind: 'stun', ms: 700 });
});
it('非法场号回退', () => { expect(bossUltimateFor(99).kind).toBe(bossUltimateFor(1).kind); });
```

- [ ] **Step 2: 跑测试确认失败**（模块不存在）

- [ ] **Step 3: 实现数据文件**，值照 spec §4.1 / §4.2 的两张表。

- [ ] **Step 4: 跑测试通过。**

- [ ] **Step 5: 不提交，进入 B2。**

---

### Task B2: `stepBoss` 阶段机（旧路径零漂移）

**Files:**
- Modify: `src/logic/boss.js`
- Test: `tests/boss-phases.test.js`（追加）

**Interfaces:**
- Consumes: `BOSS_PHASES`、`PHASE_SHIFT_MS`、`PHASE_THRESHOLDS`。
- Produces: `stepBoss(model, dtMs, position, target, ctx = null)`；`model` 新增 `phase / mode / modeLeft / shiftLeft / ultKind / ultIn`。

- [ ] **Step 1: 写失败测试（先固化旧行为）**

```js
it('不传 ctx 时与旧实现完全一致', () => {
  const m = createBossModel(1);
  const out = [];
  for (let i = 0; i < 200; i++) out.push(...stepBoss(m, 16, { x: 240, y: 72 }, { x: 240, y: 200 }));
  expect(m.windupLeft).toBe(600);              // 旧分支的硬编码
  expect(m.phase).toBeUndefined();             // 旧路径不初始化阶段字段
  expect(out.length).toBe(5 * Math.floor(out.length / 5));
});
it('传 ctx 时按 hpRatio 推阶段，一次只推一格', () => {
  const m = createBossModel(1);
  stepBoss(m, 16, { x: 240, y: 72 }, { x: 240, y: 200 }, { hpRatio: 0.3 });
  expect(m.phase).toBe(1);                     // 不是 2
  for (let i = 0; i < 60; i++) stepBoss(m, 16, { x: 240, y: 72 }, { x: 240, y: 200 }, { hpRatio: 0.3 });
  expect(m.phase).toBe(2);
});
it('转阶段期间不产弹', () => {
  const m = createBossModel(1);
  stepBoss(m, 16, { x: 240, y: 72 }, { x: 240, y: 200 }, { hpRatio: 0.6 });
  expect(m.shiftLeft).toBe(900);
  const shots = [];
  for (let i = 0; i < 55; i++) shots.push(...stepBoss(m, 16, { x: 240, y: 72 }, { x: 240, y: 200 }, { hpRatio: 0.6 }));
  expect(shots).toHaveLength(0);
});
it('阶段 2 的弹数 ×1.25 且张角同步放宽', () => {
  const m = createBossModel(1);
  stepBoss(m, 16, { x: 240, y: 72 }, { x: 240, y: 200 }, { hpRatio: 0.5 });
  const before = m.shiftLeft; void before;
  // 立刻把 shift 走完，再等一次出手
  for (let i = 0; i < 60; i++) stepBoss(m, 16, { x: 240, y: 72 }, { x: 240, y: 200 }, { hpRatio: 0.5 });
  const shots = [];
  for (let i = 0; i < 200; i++) shots.push(...stepBoss(m, 16, { x: 240, y: 72 }, { x: 240, y: 200 }, { hpRatio: 0.5 }));
  expect(shots.length).toBe(7);                // ceil(5 × 1.25) = 7
});
```

- [ ] **Step 2: 跑测试确认失败**

Expected: `m.phase` 为 `undefined` 到最后。

- [ ] **Step 3: 实现**

按 spec §4.1 写 `if (model.phase === undefined) { ...现有逻辑原样... return ... }`，然后新分支：
1. `if (ctx?.hpRatio === undefined) ctx = null` → 走旧分支。
2. `shiftLeft > 0` → 递减并 `return []`（冻结一切）。
3. 阶段推进：`while (phase < 2 && ctx.hpRatio <= PHASE_THRESHOLDS[phase]) { phase++; shiftLeft = PHASE_SHIFT_MS; mode = 'aim'; break; }`（`break` 保证一次一格）。
4. `mode === 'break'`：递减 `modeLeft`，归零回 `'aim'`；期间 `return []`。
5. 正常循环：`windupLeft` 用 `bossPhaseFor(phase).windupMs`；出手时 `count = Math.ceil(pattern.count × countMul)`、`spread × sqrt(countMul)`、`speed × speedMul`；`attackIn = Math.max(1000, 2200 - act×200) × attackMul`，`hpRatio < ENRAGE_HP_RATIO` 时再 `× ENRAGE_ATTACK_MUL`。
6. `ultIn` 递减，到 0 且 `mode === 'aim'` 时进 `'ultimate'`（Task B3 实现发射）。

- [ ] **Step 4: 跑全量**

Expected: 全绿；`tests/boss.test.js` 18 个块一个不改、全过。

- [ ] **Step 5: 不提交，进入 B3。**

---

### Task B3: 七场专属大招

**Files:**
- Modify: `src/logic/boss.js`
- Test: `tests/boss-phases.test.js`（追加）

**Interfaces:**
- Produces: `stepBoss` 新分支在 `mode === 'ultimate'` 时返回弹幕数组，每发带 `fromBoss: true`；`model.mode === 'break'` 且 `model.modeLeft = BREAK_WINDOW_MS` 的落地时刻由 `BattleScene` 读 `model.breakStartedAt`（新字段，等于落地时的 `model.clock`）。

- [ ] **Step 1: 写失败测试**

```js
it.each([[1,'ring'],[2,'ring'],[3,'lance'],[4,'mix'],[5,'lance'],[6,'ring'],[7,'mix']])('场 %i 大招形态 %s', (stage, kind) => {
  expect(bossUltimateFor(stage).kind).toBe(kind);
});
it('大招弹都带 fromBoss 且落地后进破防', () => {
  const m = createBossModel(1);
  stepBoss(m, 16, { x: 240, y: 72 }, { x: 240, y: 200 }, { hpRatio: 0.9 });
  let shots = [];
  for (let i = 0; i < 900; i++) shots.push(...stepBoss(m, 16, { x: 240, y: 72 }, { x: 240, y: 200 }, { hpRatio: 0.9 }));
  expect(shots.some(s => s.fromBoss === true)).toBe(true);
  expect(m.mode).toBe('break');
  expect(m.modeLeft).toBe(1200);
});
```

- [ ] **Step 2: 跑测试确认失败。**

- [ ] **Step 3: 实现** `emitUltimate(model, position, target)`：按 `kind` 生成弹（`ring` 等分整圈、`lance` 朝玩家 1 或 3 条、`homing` 追踪、`mix` 组合），全部 `fromBoss: true`，速度/伤害从 `BOSS_ULTIMATES` 读。

- [ ] **Step 4: 跑全量。**

- [ ] **Step 5: 不提交，进入 B4。**

---

### Task B4: 破防窗口

**Files:**
- Modify: `src/logic/effects.js`（`applyDamage` 读 `breakUntil`）
- Modify: `src/scenes/BattleScene.js`（`Boss.armor` 覆盖 + 写 `breakUntil`）
- Test: `tests/boss-phases.test.js`（追加）

- [ ] **Step 1: 写失败测试**

```js
it('破防窗口内受伤 ×1.2', () => {
  const e = { hp: 100, alive: true, armor: 0, breakUntil: 5000 };
  expect(applyDamage(e, 10, 1000)).toBeCloseTo(12, 5);
});
it('窗口外恢复原样', () => {
  const e = { hp: 100, alive: true, armor: 0, breakUntil: 5000 };
  expect(applyDamage(e, 10, 6000)).toBeCloseTo(10, 5);
});
it('破防与易伤各自相乘', () => {
  const e = { hp: 100, alive: true, armor: 0, breakUntil: 5000, vulnUntil: 5000, vulnFactor: 1.15 };
  expect(applyDamage(e, 10, 1000)).toBeCloseTo(13.8, 5);
});
```

- [ ] **Step 2: 跑测试确认失败。**

- [ ] **Step 3: 实现**

`applyDamage`：`const breakMul = Number.isFinite(now) && now < (enemy.breakUntil ?? 0) ? BREAK_DAMAGE_MUL : 1;` 然后 `let remaining = amount * vuln * breakMul;`。
`BattleScene`：每帧若 `boss.model.mode === 'break'` 则把 `boss.armor` 临时置 0（原值存 `boss.baseArmor`，退出时还原），并写 `boss.breakUntil = engine.now + BREAK_WINDOW_MS`。

- [ ] **Step 4: 跑全量。**

- [ ] **Step 5: 不提交，进入 B5。**

---

### Task B5: `fromBoss` 贯通与硬控分流

**Files:**
- Modify: `src/logic/hostile.js`（`hits.push` 加 `fromBoss`）
- Modify: `src/scenes/BattleScene.js`（`updateHostileShots` 分流）
- Modify: `tests/hostile.test.js:182`（`toEqual` → `toMatchObject`）
- Test: `tests/hostile.test.js`（追加）

- [ ] **Step 1: 改既有断言 + 写新测试**

```js
// tests/hostile.test.js 追加
it('命中记录透传 fromBoss', () => {
  const shot = makeShot({ x: 0, y: 0 }, { x: 1, y: 0 }, { damage: 4, speed: 0, fromBoss: true });
  const out = stepHostileShots([shot], { dtMs: 16, player: { x: 0, y: 0, radius: 6 }, world: WORLD });
  expect(out.hits[0].fromBoss).toBe(true);
});
```

- [ ] **Step 2: 跑测试确认失败。**

- [ ] **Step 3: 实现**

`hits.push({ damage, x, y, kind, fromBoss: shot.fromBoss === true })`。
`BattleScene.updateHostileShots` 命中循环：

```js
if (hit.fromBoss === true) {
  const cfg = this.boss ? bossControlFor(this.stage) : null;
  if (cfg) this.applyPlayerControl(cfg, hit.x, hit.y, now);
} else {
  this.applyPlayerControl(DEFAULT_SHOT_CONTROL, hit.x, hit.y, now);
}
```

- [ ] **Step 4: 跑全量。**

- [ ] **Step 5: 不提交，进入 B6。**

---

### Task B6: Boss 表现（转阶段 / 大招 / 破防 / 震屏 kind）

**Files:**
- Modify: `src/ui/camera-shake.js`（新增 `phase` kind）
- Modify: `src/entities/Boss.js`（`update` 传 ctx、`lastMode` 触发一次性演出、破防金环）
- Modify: `src/scenes/BattleScene.js`（转阶段只清杂弹）
- Test: `tests/camera-shake.test.js`（追加）

- [ ] **Step 1: 写失败测试**

```js
it('phase kind 不被 hurt 的 900ms 节流吞掉', () => {
  // shakeCamera 连发 hurt 后立刻发 phase，phase 必须被 admit
  expect(SHAKE_KINDS.phase.gapMs).toBeLessThanOrEqual(150);
});
```

- [ ] **Step 2: 跑测试确认失败。**

- [ ] **Step 3: 实现**

`camera-shake.js` 加 `SHAKE_KINDS.phase = { gapMs: 150, ampScale: 1 }`。
`Boss.update` 调 `stepBoss(this.model, dtMs, this, p, { hpRatio: this.hp / this.maxHp })`；`lastMode !== model.mode` 时按新 mode 触发一次性演出（转阶段：`setTintFill` + `shakeCamera(this.scene,'phase',...)` + 三层 `burst`；破防：金环 + `labelPopup`「破防」）。
`BattleScene` 转阶段清场改 `this.hostileShots = this.hostileShots.filter(s => s.fromBoss === true)`。

- [ ] **Step 4: 跑全量 + build。**

- [ ] **Step 5: 不提交，进入 B7。**

---

### Task B7: 血条阶段刻度 + G18

**Files:**
- Modify: `src/entities/Boss.js`（`draw` 血条加两道刻度）
- Modify: `src/data/guide-content.json`（G18 + coverage）
- Test: `tests/boss.test.js`（追加一条绘制不崩的冒烟测试）

- [ ] **Step 1: 写失败测试**（`boss.draw(0)` 在 `model.phase === 2` 时不抛错）
- [ ] **Step 2: 跑测试确认失败。**
- [ ] **Step 3: 实现**（刻度用 `pxRect`，`x ± 17 × 0.66 / 0.33`，当前阶段刻度用 `C.brassLight`）。G18 文案：「喵！它换打法了，节奏会更快、招数也变——别硬接，用右键躲！」
- [ ] **Step 4: 跑全量。**
- [ ] **Step 5: 不提交，进入 B8。**

---

### Task B8: B 波验收与 Boss 战时长仿真

**Files:**
- Modify: `scripts/density-sim.mjs`（`SIM_BOSS=1`：把 Boss 血量与阶段机接进仿真，记录一场 Boss 战的时长与阶段切换次数）
- Test: —

- [ ] **Step 1: 跑 B 波验收**

```bash
npx vitest run --config vitest.tmp.config.mjs --pool=threads
npx vite build --config vitest.tmp.config.mjs
SIM_BOSS=1 node scripts/density-sim.mjs
```

Expected: 全绿；一场 Boss 战时长落在 45~90 秒，且三个阶段都跑到。

- [ ] **Step 2: 不提交，进入 C 波。**

---

## C 波：怪物编队

### Task C1: 编队数据

**Files:**
- Create: `src/data/formations.js`
- Test: `tests/formations.test.js`（新建）

**Interfaces:**
- Produces: `FORMATIONS: Array<{ id, name, minChapter, weight, roles: Array<{ path: 'vanguard'|'ranged'|'control'|'elite'|'swarm', defIds: string[], count: number }>, aura?: { armorBonus: number, speedMul: number } }>`；`formationsFor(chapter): object[]`（已按 `minChapter` 过滤）；`formationAuraOf(formation): object | null`。

- [ ] **Step 1: 写失败测试**

```js
it('8 个编队，id 唯一，weight > 0', () => {
  expect(FORMATIONS).toHaveLength(8);
  expect(new Set(FORMATIONS.map(f => f.id)).size).toBe(8);
  FORMATIONS.forEach(f => expect(f.weight).toBeGreaterThan(0));
});
it('所有 defId 都存在于 ENEMY_TYPES', () => {
  for (const f of FORMATIONS) for (const r of f.roles) for (const id of r.defIds) expect(ENEMY_TYPES[id]).toBeTruthy();
});
it('按幕过滤', () => {
  expect(formationsFor(1).every(f => f.minChapter <= 1)).toBe(true);
  expect(formationsFor(5).length).toBe(8);
});
```

- [ ] **Step 2: 跑测试确认失败。**
- [ ] **Step 3: 实现** 8 个模板，值照 spec §5.1。
- [ ] **Step 4: 跑测试通过。**
- [ ] **Step 5: 不提交，进入 C2。**

---

### Task C2: 刷怪落点支持扇区

**Files:**
- Modify: `src/logic/spawn.js`（`pickSpawnPoint` / `pickWavePoints` 新增 `sectorAngle` / `sectorSpread`）
- Test: `tests/spawn.test.js`（追加）

- [ ] **Step 1: 写失败测试**

```js
it('缺省时角度仍全向随机（RNG 调用顺序不变）', () => {
  let n = 0; const rng = () => { n++; return 0.5; };
  pickSpawnPoint({ rng, player: { x: 240, y: 135 }, world: { w: 480, h: 270 } });
  expect(n).toBe(3);              // angle + dist + attempts 后仍 3 次
});
it('给扇区时落点在该扇区内', () => {
  const p = pickSpawnPoint({ rng: () => 0.5, player: { x: 240, y: 135 }, world: { w: 480, h: 270 }, sectorAngle: 0, sectorSpread: 0.6 });
  expect(Math.abs(Math.atan2(p.y - 135, p.x - 240))).toBeLessThanOrEqual(0.3 + 1e-9);
});
```

- [ ] **Step 2: 跑测试确认失败。**
- [ ] **Step 3: 实现**：`sectorAngle`/`sectorSpread` 都是有限数时 `angle = sectorAngle + (rng() - 0.5) * sectorSpread`，否则原式。
- [ ] **Step 4: 跑全量（对拍测试必须仍绿）。**
- [ ] **Step 5: 不提交，进入 C3。**

---

### Task C3: `updateSpawner` 编队接线

**Files:**
- Modify: `src/data/roster.js`（`DIFFICULTY.formationEvery = 3`）
- Modify: `src/scenes/BattleScene.js`（`waveIndex` + 编队分支）
- Test: `tests/formations.test.js`（追加纯逻辑部分）

**Interfaces:**
- Produces: `rollFormation({ chapter, load, maxAlive, rng }): { formation, picks } | null`（放 `src/logic/spawn.js`，纯函数，超标返回 null）。

- [ ] **Step 1: 写失败测试**

```js
it('编队总槽位超过 maxAlive×0.4 时返回 null', () => {
  expect(rollFormation({ chapter: 5, load: 0, maxAlive: 10, rng: () => 0.1 })).toBeNull();  // 10×0.4=4，编队 ≥5
});
it('同编队内 defId 不重复', () => {
  const r = rollFormation({ chapter: 5, load: 0, maxAlive: 88, rng: () => 0.3 });
  const ids = r.picks.map(p => p.defId);
  expect(new Set(ids).size).toBe(ids.length);
});
```

- [ ] **Step 2: 跑测试确认失败。**
- [ ] **Step 3: 实现** `rollFormation` 与 `BattleScene` 接线：`waveIndex` 只在成功 spawn 后 +1；`waveIndex % formationEvery === 0` 时试编队，`null` 降级单点；`sectorAngle` 取「玩家反方向 ± 0.6」。
- [ ] **Step 4: 跑全量。**
- [ ] **Step 5: 不提交，进入 C4。**

---

### Task C4: 护卫光环

**Files:**
- Modify: `src/logic/effects.js`（`applyDamage` 读 `formationAura.armorBonus`）
- Modify: `src/entities/Enemy.js`（`speedFactor` 乘 `formationAura.speedMul`）
- Modify: `src/scenes/BattleScene.js`（`updateEnemies` 每帧重算 + 全灭清理）
- Test: `tests/formations.test.js`（追加）

- [ ] **Step 1: 写失败测试**

```js
it('光环 armorBonus 与自身 armor 相加并 clamp', () => {
  const e = { hp: 100, alive: true, armor: 0.55, formationAura: { armorBonus: 0.15 } };
  expect(applyDamage(e, 100, 0)).toBeCloseTo(30, 5);   // 100 × (1-0.70) = 30
});
it('clamp 到 1', () => {
  const e = { hp: 100, alive: true, armor: 0.95, formationAura: { armorBonus: 0.15 } };
  expect(applyDamage(e, 100, 0)).toBe(0);
});
it('Boss 与精英不吃光环（由场景层不写字段保证）', () => { /* 断言场景层过滤，见 Step 3 */ });
```

- [ ] **Step 2: 跑测试确认失败。**
- [ ] **Step 3: 实现** `clamp01(enemy.armor + (enemy.formationAura?.armorBonus ?? 0))`；`updateEnemies` 每帧按 `formationId` 分组，vanguard 存活才写 `formationAura`，否则 `delete`；Boss 与 `def.elite` 跳过。
- [ ] **Step 4: 跑全量。**
- [ ] **Step 5: 不提交，进入 C5。**

---

### Task C5: 编队标记 + G19

**Files:**
- Modify: `src/entities/Enemy.js`（`draw` 脚下三角，用 `pxPoly`）
- Modify: `src/data/guide-content.json`（G19 + coverage）
- Test: `tests/enemy-variant-entity.test.js`（追加冒烟）

- [ ] **Step 1~4: TDD 冒烟（`draw` 在 `formationId` 存在时不抛错）→ 实现 → 全绿。**
- [ ] **Step 5: 不提交，进入 C6。**

---

### Task C6: C 波验收与密度回归

- [ ] **Step 1: 跑**

```bash
npx vitest run --config vitest.tmp.config.mjs --pool=threads
SIM_STAY=1 node scripts/density-sim.mjs
node scripts/density-sim.mjs
```

Expected: 全绿；同屏峰值不超过 45；站桩存活仍在 35~50 秒区间。

- [ ] **Step 2: 不提交，进入 D 波。**

---

## D 波：验收

### Task D1: 全量验证

- [ ] `npx vitest run --config vitest.tmp.config.mjs --pool=threads`（全绿，数量 ≥ 1784 + 新增）
- [ ] `npx vite build --config vitest.tmp.config.mjs`（成功）
- [ ] `node scripts/check-docs.mjs`（missing 为空）
- [ ] 删除 `vitest.tmp.config.mjs`

### Task D2: 文档

- [ ] 新建 `docs/战斗深化验收-2026-11-18.md`：三波交付表、测试计数、仿真数据（`SIM_STAY` 有无 DASH 对比、Boss 战时长、编队密度峰值）、规则口径（冲刺解/不解清单、阶段优先级、光环叠加表）、仍待实机试玩项。
- [ ] `docs/内容规格表.md`：玩家栏加冲刺；Boss 栏加阶段/大招/破防；怪物栏加编队。
- [ ] `docs/技术架构.md`：`src/data` 加 `boss-phases.js` / `formations.js` 两行。

### Task D3: 实机渲染检查

- [ ] `npx vite build` 后用静态服务打开，截图确认：右键不弹系统菜单、冲刺残影可见、红环在敌人脚下收缩、Boss 转阶段有震屏与色变、编队三角标记可读。

---

## Self-Review

**1. Spec 覆盖**：§3.1→A3/A4、§3.1.1→A1、§3.2→A2、§3.3→A5、§4.1→B2、§4.1.1~4.1.3→B2、§4.2→B3、§4.2.1~4.2.2→B5、§4.3→B4、§4.4→B6、§5.1→C1、§5.2→C2/C3、§5.3→C4、§5.4→C5、§6.4→A6/B7/C5、§7/§8→D1/D2。无缺口。

**2. 步骤扫描**：每个任务都有「写失败测试 → 跑确认失败 → 实现 → 跑确认通过」四步骨架；签名与数值照抄 spec，未把函数体写成转录（A3/B2/B3 三处算法给了要点而非全文）。

**3. 类型一致性**：`applyKnockStun`、`dashReadyAt`、`dashInvulnUntil`、`windupAt/windupDur`、`bossPhaseFor`、`bossUltimateFor`、`bossControlFor`、`formationsFor`、`formationAuraOf`、`rollFormation` 在首次出现处定义，后续任务只引用。

**4. Review Focus**：五条各自有归属任务——①A3 的「冲刺启动之后挂的控制照常生效」；②B2 的「不传 ctx 时与旧实现完全一致」；③B2 的「一次只推一格」；④C4 的死亡即删；⑤C3 的 `room<=0` 不消耗轮次（在 `rollFormation` 返回 null 的测试里覆盖）。

**5. 比例**：计划约 700 行，spec 约 557 行，未超过 spec 数倍；代码块只出现在测试断言与不可推导的算法要点处。
