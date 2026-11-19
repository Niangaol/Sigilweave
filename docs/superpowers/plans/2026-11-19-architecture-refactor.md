# 代码架构全面重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把《共振法阵》从「三个上帝对象 + 四套重复布景」重构为分层清晰、道具唯一、带 golden 护栏的代码库，行为与画面零变化。

**Architecture:** 全部迁移采用「函数模块 + 场景同名一行委托」模式（与既有 `battle-pure.js` / `boss-framing.js` / `camera-shake.js` 一致）；UI 去重按「pixel-kit → props → 面板/法术表」自下而上；先用 golden 锁住现状，再逐单元搬家，每波独立 commit。

**Tech Stack:** Phaser 3.90、Vite 8、Vitest 5、Node 22+、零新增依赖；测试命令统一 `NODE_OPTIONS="--require ./scripts/sandbox-noexec.cjs" npx vitest run --pool=threads`。

**Spec:** `docs/superpowers/specs/2026-11-19-architecture-refactor-design.md`

## Global Constraints

- 行为、手感、画面绝对不变：golden 哈希相等是硬闸；不接受「看起来一样」。
- `BattleScene` 原型上**所有被迁移的方法**保留同名一行委托；测试文件零改动（新增 golden 除外）。
- 不新增依赖；不碰 `package.json`、`vite.config.js`、`index.html`、`src/main.js`。
- 不重排 `update` 调用顺序、不重排 `combatRng` 消耗顺序、不改 `createBrain` 抽签次序、不改 `Enemy` 构造期 dt=0 步进。
- 每波独立 commit，消息 `refactor: 波 N —— <内容>`；不 push。
- 每波闸门：全量测试全绿 + `vite build` 通过 + `node scripts/check-docs.mjs` 通过 + `node scripts/check-architecture.mjs` 通过 + 本波 golden 不变。
- 引用相等：`AI_PROFILE.tune` 必须保持对 `*_RULE` 的同一引用，搬引用不深拷贝。
- 冻结窗口：重构期间不动内容与视觉；用户新需求先单独 commit，再重录 golden。

## Review Focus

1. **非法输入不抛错**：`readTuning` 对 `?interval=abc` / 负数 / 超大值回退默认；`createBrain` 对未知 defId 回退 `skeleton`；迁移后这些兜底必须逐字保留（Task 1.5、4.2）。
2. **空列表 / 全灭**：`updateEnemies`、`combatTargets`、`refreshFormationAuras` 在敌人列表为空、Boss 已死、召唤物全清时不崩、不读 undefined（Task 3.4）。
3. **双高度**：480×270 与 480×760 下所有 band 的 op golden 都相等；竖屏分支 `L.tall` 不得被 kit 改写（Task 5.1-5.3）。
4. **暂停与顿帧**：`hitstopLeft > 0`、`pauseMode` 打开期间 `update` 不推进任何战斗状态；golden 录制时固定在未暂停态，但迁移后的代码路径要保留 `if (this.paused) return` 的分支（Task 3.6、4.3）。
5. **RNG 顺序**：`spawnEnemy` 的「类型 roll → 变体 roll → 间隔抖动」与 `createBrain` 的 1~2 次 `nextRandom` 次序；`battle-rng-trace-golden` 与 `enemy-ai-trace-golden` 是唯一证据（Task 0.2、0.3、3.3、4.2）。

---

## 波 0 · 护栏与清理

### Task 0.1: 绘制 op golden

**Files:**
- Create: `tests/ui-draw-golden.test.js`
- Read: `tests/diorama-act1.test.js`（recorder 范式）、`tests/story-art.test.js`（CTX 范式）

**Interfaces:**
- Produces: `makeGoldenRecorder()`（记录 `fillStyle/lineStyle/fillRect/strokePoints/fillPoints/strokeRect/clear` 等 op；量化 `q(v)=Math.round(v*100)/100`；返回 `{g, ops, hash()}`）、`hashOps(ops)`（sha256）。
- 记录对象：`JOURNEY_STAGES`/`OPENING_STAGES`/`ENDING_STAGES` 静态与 dyn（p=0/0.25/0.5/0.75/1）、`dioramas act1-7` 三带、24 法术六通道（k=0/0.5/1）、`Enemy/Boss/Player.draw` 最小 state、`Background.drawStatic` 直绘分支。两高度 480×270 / 480×760。

- [ ] **Step 1: 写 recorder 与第一个用例（第 I 幕三带）**，用 `expect(hash).toBe('<录制后填入>')` 占位，先 `expect(ops.length).toBeGreaterThan(0)`。
- [ ] **Step 2: 跑测试确认结构可用**：`NODE_OPTIONS="--require ./scripts/sandbox-noexec.cjs" npx vitest run --pool=threads tests/ui-draw-golden.test.js`。
- [ ] **Step 3: 跑两遍录制，把稳定哈希写入常量**；若同一用例两次哈希不同，先修量化（把 2 位小数降到 1 位或只留整数），再录。
- [ ] **Step 4: 补齐全部收录对象**，每类一个 `describe`。
- [ ] **Step 5: 跑全量确认不污染其他测试**：`... npx vitest run --pool=threads`。
- [ ] **Step 6: Commit**：`git commit -m "test(golden): 绘制 op 基线（波 0）"`。

### Task 0.2: 敌人轨迹 golden

**Files:**
- Create: `tests/enemy-ai-trace-golden.test.js`
- Read: `tests/enemy-ai.test.js:191-207`（run 范式）、`src/logic/enemy-ai.js:577-697`（createBrain）

**Interfaces:**
- Produces: `runTrace(defId, seed=20261023, ms=6000)` → 数组，每帧 `{x,y,mode,windup,shots,stomp,melee,summon}`（数值量化 2 位小数）；`traceHash`。
- 固定 player 出生位 `(240, 135)`、bounds `480×270`、`dt=16`。

- [ ] **Step 1: 先写确定性断言**（同 seed 两次轨迹 `toEqual`）跑绿。
- [ ] **Step 2: 录 26 个 defId 的哈希常量并填入**。
- [ ] **Step 3: 跑该文件 + `enemy-ai.test.js` 全绿**。
- [ ] **Step 4: Commit**：`test(golden): 26 敌人轨迹基线（波 0）`。

### Task 0.3: RNG 消耗 golden

**Files:**
- Create: `tests/battle-rng-trace-golden.test.js`

**Interfaces:**
- Consumes: `BattleScene.prototype.spawnEnemy` 或最小替身 + `logic/rng.js` 的 `Rng`。
- Produces: 30 次抽签的 `combatRng.next()` 返回值序列（前 6 位小数）哈希。

- [ ] **Step 1: 按 `tests/battle-flow.test.js:547-551` 的 spawnScene 替身写最小驱动**。
- [ ] **Step 2: 录哈希并跑绿；Step 3: Commit**：`test(golden): 刷怪 RNG 序列基线（波 0）`。

### Task 0.4: 架构检查脚本

**Files:**
- Create: `scripts/check-architecture.mjs`
- Modify: `.github/workflows/pages.yml`（`npm run build` 后加 `- run: node scripts/check-architecture.mjs`）

**Interfaces:**
- 零依赖；正则解析多行 `import {`、`export ... from`、`import('...')`；相对路径解析到 `src/`；输出违规列表；退出码 1。
- 规则：logic 禁 phaser/scenes/ui/entities/audio；ui 与 entities 禁 scenes；`data→logic` 白名单 5 条；0 循环；`entities→ui` 白名单（Palette/variant-parts/kit-style/camera-shake/spell-fx.js/各 view）。

- [ ] **Step 1: 写脚本，先在当前基线跑，确认输出 0 违规**。
- [ ] **Step 2: 手工注入一条违规（临时改 import）验证退出码 1，再还原**。
- [ ] **Step 3: 跑 `node scripts/check-architecture.mjs`，期望 exit 0**。
- [ ] **Step 4: Commit**：`chore: 架构检查脚本（波 0）`。

### Task 0.5: 死代码清理

**Files:**
- Modify: `src/logic/grid.js`、`src/logic/constants.js`、`src/data/card-hints.js`、`src/data/evolutions.js`、`src/logic/guide.js`、`src/ui/title-menu.js`、`src/logic/enemy-ai.js`、`src/entities/Enemy.js`

- [ ] **Step 1: 逐个删除前 grep 复核**：`chebyshev`、`hasRun`、`ALL_DIRS`、`hintOf`、`evolutionRoutes`、`fireStuck`、`helpPageCount`、`pushShot`、`meleeSpecOf`、`Enemy.meleePreview` 的 `attackKind` 分支。**保留** `TRAIL_STYLE_NAMES`、`roster.behavior`、178 个仅测试引用导出。
- [ ] **Step 2: 全量测试全绿**。
- [ ] **Step 3: `check-architecture.mjs` 仍 0 违规；Step 4: Commit**：`refactor: 死代码清理（波 0）`。

**波 0 闸门**：全量测试（1982 + 新 golden）全绿；构建通过；check-docs 通过；check-architecture exit 0。

---

## 波 1 · BattleScene 第 1 波（纯函数/纯绘制）

> 每个 Task 的模式相同：**先复制方法体到新文件、改成 `(scene, ...)` 签名；BattleScene 删原方法体、留一行委托；跑全量；commit**。行号以勘测时 `5bdbdc9` 为准，执行时以方法名定位。

### Task 1.1: battle-camera

**Files:** Create `src/ui/battle-camera.js`；Modify `src/scenes/BattleScene.js`（`viewRect` 1288-1297、`updateBossCamera` 1298-1333、`resumeFollow` 2608-2620）
**Interfaces:**
- Produces: `viewRect(scene) -> {x,y,w,h}`、`updateBossCamera(scene)`、`resumeFollow(scene, offsetY)`。
- Consumes（委托）：`viewRect(dt)`… 场景内原调用形式不变（`this.viewRect()` 等）。

- [ ] **Step 1: 建新文件，搬三个函数，`this.`→`scene.`；Step 2: 场景留委托**。
- [ ] **Step 3: 跑 `tests/boss-framing.test.js` + `camera-shake.test.js` + 全量**。
- [ ] **Step 4: Commit**：`refactor: 取景与跟随迁出 BattleScene（波 1）`。

### Task 1.2: spell-hit-fx（注意命名）

**Files:** Create `src/ui/spell-hit-fx.js`；Modify `src/scenes/BattleScene.js`（`spellPunch` 1583-1597、`spellStrikeSequence` 1598-1609、`spellLinkFx` 1610-1626、`reactionFx` 1627-1640）
**Interfaces:** `spellPunch(scene, defId, x, y, radius, angle)` 等 4 个；依赖既有 `ui/spell-punch.js`、`ui/camera-shake.js`、`data/factions.js`。**不得覆盖既有 `spell-punch.js` / `spell-fx.js`**。

- [ ] **Step 1-2: 搬家 + 委托；Step 3: 跑 `spell-punch.test.js` + `spell-fx.test.js` + 全量**；Step 4: Commit：`refactor: 命中表现迁出 BattleScene（波 1）`。

### Task 1.3: hostile-draw

**Files:** Create `src/ui/hostile-draw.js`；Modify `src/scenes/BattleScene.js`（模块级 `drawHostileShot` 3027-3051）
**Interfaces:** `drawHostileShot(g, shot)`（模块级直接 import，不是场景方法；场景内两处调用改 import）。

- [ ] **Step 1: 搬家；Step 2: 场景内调用点改 import；Step 3: 跑 `hostile-shots.test.js` + 全量**；Step 4: Commit：`refactor: 敌弹绘制独立（波 1）`。

### Task 1.4: battle-frequency

**Files:** Create `src/ui/battle-frequency.js`；Modify `src/scenes/BattleScene.js`（`updateFrequency` 2420-2436）
**Interfaces:** `computeFrequency(times, now, prev) -> {buckets, recentRate, peakRate, freqStart}`（纯函数，无 Phaser）；场景方法保留委托。

- [ ] **Step 1: 搬家并拆纯函数；Step 2: 委托；Step 3: 全量测试**；Step 4: Commit：`refactor: 频率统计纯函数化（波 1）`。

### Task 1.5: battle-setup

**Files:** Create `src/scenes/battle-setup.js`；Modify `src/scenes/BattleScene.js`（`readTuning` 446-457、`pickStartCells` 458-469、`sampleStartCell` 470-488）
**Interfaces:** `readTuning(params)`、`pickStartCells(scene)`、`sampleStartCell(scene)`。**Review Focus 1**：非法参数回退默认，逐字保留。

- [ ] **Step 1: 搬家 + 委托；Step 2: 加一条非法参数用例（`?interval=abc`、负数、Infinity）到现有 `tests/` 的对应文件或新用例**；Step 3: 全量测试；Step 4: Commit：`refactor: 战斗参数与起点迁出（波 1）`。

---

## 波 2 · BattleScene 第 2 波（自包含 UI 子系统）

### Task 2.1: grid-editor

**Files:** Create `src/ui/grid-editor.js`；Modify `src/scenes/BattleScene.js`（`openGridEdit` 1641-1689、`editNames`、`tickEditBoardMotion`、`editHint`、`drawGridEdit` 1713-1909、`editCellClick` 1910-1985、`syncAuxPending`、`closeGridEdit` 2006-2035）
**Interfaces:**
- Produces: `class GridEditor { constructor(scene, { onClose }); open(); close(); tick(time, delta); get isOpen(); destroy(); }`
- 约束：指针监听在 `destroy()` 里 off；`scene.editOpen` 由 editor 回写；`tick` 由 `update` 调用。

- [ ] **Step 1: 建类并搬 8 个方法；Step 2: create 中挂 `this.editor = new GridEditor(...)`，pauseMenu 回调改 `this.editor.open()`**。
- [ ] **Step 3: `onShutdown` 加 `this.editor?.destroy()`；Step 4: 跑 `pause-edit.test.js` + `editor-ui.test.js` + 全量**。
- [ ] **Step 5: 跑 `scripts/pause-edit-smoke.mjs`（需要构建 + 静态服务）或至少构建通过**；Step 6: Commit：`refactor: 法阵编辑器独立（波 2）`。

### Task 2.2: levelup-panel

**Files:** Create `src/ui/levelup-panel.js`；Modify `BattleScene.js`（`queueLevelPicks`、`openLevelupPick`、`rollEvolutionPick`、`pickLevelupCard`）
**Interfaces:** `class LevelupPanel { queue(n); open(); pick(card); destroy(); }`；回调 `grantSkill/applyEvolution` 由场景注入；`applyEvolution` 本体留场景。

- [ ] **Step 1-2: 建类 + 接线；Step 3: 跑 `progression-levels.test.js`、`evolutions.test.js`、`battle-flow.test.js` + 全量**；Step 4: Commit：`refactor: 升级三选一独立（波 2）`。

### Task 2.3: battle-encounters

**Files:** Create `src/scenes/battle-encounters.js`；Modify `BattleScene.js`（`checkProgressEvents`、`updateEventPointVisuals`、`beginEncounter`、`selectEncounterAnswer`、`confirmEncounterAnswer`、`continueEncounter`、`playBossIntro`）
**Interfaces:** 7 个 `(scene, ...)` 函数；`checkProgressEvents` 必须走 `scene.beginEncounter(def)`（`battle-flow.test.js:501` 会覆盖该属性）。

- [ ] **Step 1: 搬家 + 全部同名委托；Step 2: 跑 `battle-flow.test.js`（逐场）+ `encounters.test.js` + 全量**；Step 3: Commit：`refactor: 遭遇问答迁出（波 2）`。

---

## 波 3 · BattleScene 第 3 波（战斗核心）

> 迁移顺序固定：hostiles → skills → spawner → enemies → hit-pipeline → stage-flow。每个 Task：搬移 → 全量测试 + 对应 golden → commit。**委托面 = 迁移方法全集**。

### Task 3.1: battle-hostiles
**Files:** Create `src/scenes/battle-hostiles.js`；Modify `BattleScene.js`（9 个方法，含 `combatTargets`）
**委托：`addHostileShot`、`updateHostileShots`、`combatTargets`、`addEnemySummon`、`updateSummons`、`sweepSummons`、`onSummonDestroyed`、`detonateRune`、`drawSummons`**
- [ ] Step 1-2: 搬家 + 委托；Step 3: 跑 `hostile-shots.test.js`、`battle-flow.test.js`（召唤段）、全量；Step 4: Commit。

### Task 3.2: battle-skills
**Files:** Create `src/scenes/battle-skills.js`；Modify `BattleScene.js`（5 个方法）
**委托：`grantSkill`、`skillCdOf`、`skillHostCell`、`pickSkillAim`、`castSkill`**
- [ ] Step 1-2: 搬家 + 委托（`saveProgress` 留场景，模块内调 `scene.saveProgress()`）；Step 3: 跑 `battle-flow.test.js`、`dash.test.js`、全量；Step 4: Commit。

### Task 3.3: battle-spawner
**Files:** Create `src/scenes/battle-spawner.js`；Modify `BattleScene.js`（4 个方法）
**委托：`updateSpawner`、`spawnFormation`、`spawnWave`、`spawnEnemy`**
**Review Focus 5**：RNG 顺序不变；本任务后必须跑 `battle-rng-trace-golden` + `enemy-ai-trace-golden`。
- [ ] Step 1-2: 搬家 + 委托；Step 3: 跑 `spawn.test.js`、`formations.test.js`、两个 golden；Step 4: Commit。

### Task 3.4: battle-enemies
**Files:** Create `src/scenes/battle-enemies.js`；Modify `BattleScene.js`（6 个方法）
**委托：`refreshFormationAuras`、`updateEnemies`、`onEnemyKilled`、`bumpKillStreak`、`updateShards`、`onEnemyMelee`**
**Review Focus 2**：空敌人列表/全灭时 `updateEnemies` 与 `refreshFormationAuras` 不崩。
- [ ] Step 1-2: 搬家 + 委托；Step 3: 跑 `formations.test.js`、`enemy-variant-entity.test.js`、全量；Step 4: 加一条空列表用例；Step 5: Commit。

### Task 3.5: battle-hit-pipeline
**Files:** Create `src/scenes/battle-hit-pipeline.js`；Modify `BattleScene.js`（8 个方法）
**委托：`applySigil`、`onEnemyHit`、`triggerDeathBursts`、`collectDefeated`、`resolveProjectile`、`queueOrCommit`、`commitSigil`、`tickPendingCasts`**
- [ ] Step 1-2: 搬家 + 委托（`triggerDeathBursts` 调 `scene.onEnemyKilled`；`commitSigil` 调 `scene.spellPunch` 等）；Step 3: 跑 `effects.test.js`、`hit-feedback.test.js`、`battle-flow.test.js`、全量 + golden；Step 4: Commit。

### Task 3.6: battle-stage-flow
**Files:** Create `src/scenes/battle-stage-flow.js`；Modify `BattleScene.js`（7 个方法）
**委托：`finishStage`、`swapStage`、`defeatBoss`、`startBossClearTransition`、`checkDeath`、`die`、`buildSummary`**
**Review Focus 4**：`die`/`finishStage` 期间的暂停分支逐字保留。
- [ ] Step 1-2: 搬家 + 委托；Step 3: 跑 `battle-flow.test.js`、`boss.test.js`、`meta-gameover.test.js`、全量 + golden；Step 4: 确认 `wc -l src/scenes/BattleScene.js` ≤ 1100；Step 5: Commit：`refactor: 场次流转迁出（波 3）`。

---

## 波 4 · 敌人骨架化与实体瘦身

### Task 4.1: enemy-tables 数据搬迁
**Files:** Create `src/data/enemy-tables.js`；Modify `src/logic/enemy-ai.js`（改为 barrel + 内部引用）
**Interfaces:** 迁 `18 个 *_RULE`、`MELEE_RULES`、`RANGED_RULES`、`TURRET/RUNE_LIFE_MS`、`LURCH_MOMENTUM`、`AI_PROFILE`；`enemy-ai.js` 重新导出全部既有名字；`AI_PROFILE.tune` 保持引用相等。
- [ ] Step 1: 搬表并加 `expect(AI_PROFILE.bat.tune).toBe(BAT_RULE)` 用例；Step 2: 全量 + `enemy-ai.test.js`；Step 3: Commit。

### Task 4.2: 行为骨架合并（逐行为迁移）
**Files:** Create `src/logic/enemy/{rng,geometry,attack,melee,dash}.js`、`behaviors/*.js`、`index.js`；Modify `enemy-ai.js`
**Interfaces:** `nextRandom/hashSeed/seedText`、`approach/holdBand/...`、`beginWindup/beginCast/makeVolley/finishCast`、`stepMelee`、`beginCharge/stepChargeBody`；`STEP_BY_BEHAVIOR` 键集合不变。
- [ ] Step 1: 先搬共享工具（rng/geometry/attack/melee），跑 golden；Step 2: 按 6 类骨架逐行为迁移，**每次只迁一个 behavior**，跑 `enemy-ai-trace-golden` + `enemy-ai.test.js`；Step 3: 全部迁完后 `enemy-ai.js` ≤ 300 行；Step 4: Commit（可按骨架分 6 个 commit）。
**Review Focus 1**：未知 defId 回退 `skeleton`、非法 dt 分支逐字保留。

### Task 4.3: Enemy/Boss/Player 视图与纯规则
**Files:** Create `src/ui/enemy-view.js`、`src/ui/boss-view.js`、`src/ui/player-view.js`、`src/ui/bars.js`、`src/logic/enemy/telegraph.js`、`src/logic/enemy/control-factor.js`；Modify `src/entities/{Enemy,Boss,Player}.js`
**Interfaces:** `drawEnemy(g, state, now)`、`drawBoss(g, state, now)`、`drawPlayer(g, state, now)`、`drawHpBar(g, x, y, ratio, chip, marks)`、`windupRemaining(brain)`、`speedFactor(now, state, extra)`。
- [ ] Step 1: 先搬 Enemy 绘制（`Enemy.js` 437-920），实体调 `drawEnemy`；Step 2: 跑 `enemy-variant-entity.test.js` + `ui-draw-golden`；Step 3: Boss/Player 同理；Step 4: 全量 + 构建；Step 5: Commit。

### Task 4.4: 层次倒挂修复（最后做）
**Files:** Create `src/data/sector-constants.js`；Modify `src/logic/constants.js`、`src/data/roster.js`、`src/data/{cinematics,encounters,map-events,meta}.js`
- [ ] Step 1: 常量下沉；Step 2: `check-architecture.mjs` 规则 3 白名单减 5 条；Step 3: 全量测试；Step 4: Commit。

---

## 波 5 · UI 去重

### Task 5.1: 先补 Title/Intermission 布局模型测试（在动 UI 之前）
**Files:** Create `tests/title-scene.test.js`、`tests/intermission-scene.test.js`
- [ ] Step 1: 用桩 `addText` 记录「文本、字号、坐标」；断言 5 项菜单坐标与焦点、四个子面板标题/行数/内容；Step 2: Intermission 断言手牌页数、离开按钮；Step 3: 跑绿；Step 4: Commit：`test: 标题与幕间布局基线（波 5）`。

### Task 5.2: pixel-kit
**Files:** Create `src/ui/art/pixel-kit.js`；Modify `src/ui/story-art.js`（`skyFill`、`groundSlabs`）、`src/ui/journey-static.js`（内联天空带）
**Interfaces:** `mix`、`makeRng`（同序列）、`box`、`skyBands`、`ridge`、`fogBand`、`slabFloor`。
- [ ] Step 1: 搬 + 替换（逐文件，一次一个）；Step 2: `ui-draw-golden` 必须全等；Step 3: 跑全量；Step 4: Commit。

### Task 5.3: props 道具库
**Files:** Create `src/ui/art/props.js`；Modify `journey-static/story-art/dioramas/Background`
**Interfaces:** `deadTree/tower/gravestone/chain/candelabrum/roseWindow/brokenColumn/sevenStars/archWall/shelfWall/heroSilhouette`。
- [ ] Step 1: 按「枯树→塔→墓碑→链→烛台→七星→彩窗→断柱→书架→拱墙」顺序，一次一个函数；Step 2: 每个函数替换后跑 `ui-draw-golden`；Step 3: 全部完成后全量；Step 4: Commit（可拆多个）。

### Task 5.4: 法术总表
**Files:** Modify `src/ui/spell-fx/index.js`、`src/ui/spell-fx/kit.js`、`src/ui/spell-fx/spells/*.js`
**Interfaces:** `SPELL_DEFS = { id: { impactScale, entry, exit, impl } }`；旧表名继续导出（兼容测试）。
- [ ] Step 1: 合表 + 保留旧名；Step 2: 加 schema 测试（24 id 六通道齐全）；Step 3: 跑 `spell-fx.test.js` + `fx-check.mjs`（`node scripts/fx-check.mjs`）；Step 4: Commit。

### Task 5.5: 面板与过场卡
**Files:** Create `src/ui/panel.js`、`src/ui/title-panels.js`、`src/ui/cutscene-card.js`；Modify `TitleScene/GuideScene/LoadoutScene/GameOverScene/CutsceneScene`
- [ ] Step 1: 抽 `panel()`；Step 2: 迁 4 个面板（保留 `titleChars/statValues/titleBaseY` 契约）；Step 3: TitleScene ≤ 500 行、CutsceneScene ≤ 400 行；Step 4: 跑 `title-scene.test.js`、`cutscene-*`、全量；Step 5: Commit。

### Task 5.6: 七幕局部去重
**Files:** Modify `src/ui/dioramas/act2/act3/act5/act7.js`
- [ ] Step 1: act2 `lancet/polyline/bandPoly` 换 kit；Step 2: act5 `line/poly/courtColumn/gothicWindow`；Step 3: act7 `line/ellipse`；Step 4: act3 `seg/diamond`；每步跑 `ui-draw-golden`；Step 5: Commit。

---

## 波 6 · 收尾

### Task 6.1: journey/Background golden 断言文件
**Files:** Create `tests/journey-static-golden.test.js`、`tests/background-golden.test.js`（引用 Task 0.1 的 recorder）
- [ ] Step 1: 写断言文件；Step 2: 跑绿；Step 3: Commit。

### Task 6.2: 文档同步
**Files:** Modify `docs/技术架构.md`、`README.md`
- [ ] Step 1: 更新目录表（`src/logic/enemy/`、`src/ui/art/`、`src/ui/panel.js`、`src/scenes/battle-*.js`、`src/data/enemy-tables.js`）；Step 2: 更新测试数字与命令；Step 3: `node scripts/check-docs.mjs`；Step 4: Commit。

### Task 7: 终验
- [ ] Step 1: 全量测试；Step 2: `NODE_OPTIONS="--require ./scripts/sandbox-noexec.cjs" npx vite build`；Step 3: `check-docs`；Step 4: `check-architecture`；Step 5: 截图目检（标题页 + 战斗第 1 场，各 2 帧）；Step 6: `git status` 只剩报名材料；Step 7: 汇总指标（各文件行数、净删行数、测试数）给用户。

---

## 执行顺序与依赖

```
波 0（T0.1-0.5）→ 波 1（T1.1-1.5）→ 波 2（T2.1-2.3）→ 波 3（T3.1-3.6）
→ 波 4（T4.1-4.4）→ 波 5（T5.1-5.6）→ 波 6（T6.1-6.2）→ 终验
```

每波完成后必须：全量测试 → 构建 → check-docs → check-architecture → commit。任何一步红：修复或回滚该 commit，不带红进入下一波。
