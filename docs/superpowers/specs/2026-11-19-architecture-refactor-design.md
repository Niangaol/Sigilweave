# 代码架构全面重构：分层、去重与工程护栏（2026-11-19）

> 需求原文（2026-11-19）：「整体重构一下 精进嗲吗」
> 用户拍板（ask_user_question，2026-11-19）：
> - **范围**：代码架构重构（画面、手感、玩法绝对不变）
> - **基线**：未提交的战斗深化改动先落本地 commit 当基线（已执行：`5bdbdc9`，45 文件 +5776/−80）
> - **动机**：冲比赛
> - **方案**：B · 全面重构
> - **护栏**：golden 测试与架构检查脚本都加
>
> 勘测：4 个只读子智能体分别勘测 BattleScene、敌人/实体层、UI 层、全局耦合，结论均附文件与行号证据（勘测基线 `5bdbdc9`；下文行号为勘测时实测）。

## 0. 现状（勘测结论）

### 0.1 基线

- `src` 38,412 行 / 108 个 `.js` 文件；`tests` 92 文件 / 1982 项，全绿。
- 构建：`vite build` 117 modules，产物体积正常；文档校验 `scripts/check-docs.mjs` 40 项通过。
- 工程配套：无 ESLint / Prettier / editorconfig；`scripts/` 有 79 个验收脚本，未接入 CI；CI 只有 `npm test` + `npm run build` + Pages。

### 0.2 BattleScene（3051 行 / 105 个方法）

- 22 个职责组；10 个方法吃掉 45% 体量（`create` 326 行、`drawGridEdit` 197、`update` 132、`onEngineEvent` 120）。
- 真正的耦合点：`this.player`（166 次引用、6 个写入者）、`this.enemies`（5 个写入者）、`this.run`（126 次，跨场真相）、`this.phase` / `this.paused` / `this.hitstopLeft` 三条横切总线、`this.effects`（87 次，表现层唯一出口）。
- **14 个测试文件直接绑定 24 个原型方法**：`tests/battle-flow.test.js:181/547-551/793-795` 用 `BattleScene.prototype[name].bind(scene)` 逐方法驱动；`tests/formations.test.js:314-315`、`tests/hostile-shots.test.js:45` 同理。迁移方法必须保留**同名一行委托**，否则测试成片 `TypeError`。
- `update` 的 20 余步调用顺序与 `combatRng` 消耗顺序是同一 seed 可复现的前提（`spawnEnemy` 内「类型 roll → 变体 roll」明确依赖次序），任何重排都算换基线。

### 0.3 敌人层

- `enemy-ai.js` 2006 行：26 个行为状态机合计 1226 行（61%），但实际只有 **6 类骨架**（直行 / 环绕 / 瞬移 / 抬手射击 / 冲锋 / 砸地），被展开成 26 份实现。
- 复制粘贴证据：`stepKnight 785-840` 与 `stepLunge 1052-1107` 只差 2 行函数名 + 1 行常数；环带走位 5 份（约 122 行同一件事）；冲锋 9 份（约 270 行）；抬手→放弹→补发 10 份；瞬移 2 份。
- 状态字段语义重载：`brain.chargeLeft` 同时是冲锋剩余 / 硬直 / 后摇 / 收势前摇；`burstLeft` 被借去当冲锋段数；`phase` 被 `skitter` 借去当分段计时。
- `Enemy.js` 930 行：484 行（52%）是程序化绘制；`speedFactor` 读 `this.scene.grid` / `this.scene.player`（纯规则却依赖场景）；`windupRemaining` + 16ms 重推判据是可疑的纯函数。
- `Boss.js` 与 `Enemy.js` 结构平行约 70 行（追人、减速、血条、受击闪白各写一份）；`Player.js` 378 行中规则约 128 行，以有状态方法住在实体里。
- 真死代码：`pushShot`（394-406）、`meleeSpecOf`（421-424）、`Enemy.meleePreview` 读 `brain.attackKind`（该字段全仓 0 写入）。
- **勘测纠错（2026-11-19 复核）**：`roster.ENEMY_TYPES[*].behavior` **不是**死字段——`tests/enemy-ai.test.js:1411` 断言 `AI_PROFILE[id].behavior === ENEMY_TYPES[id].behavior`，1524-1528 逐条断言。本轮保留双写现状，不删除、不合并。
- 层次倒挂：`data → logic` 5 条（`cinematics/encounters/map-events/meta → acts.js`、`roster → constants.js`），与 `data/boss-phases.js:71-73` 自己写的「数据层不反向 import 逻辑层」相矛盾。

### 0.4 UI 层（占全仓 55%）

- 同一幕被画 2~4 遍：`journey-static`（旅程）、`story-art`（开场/结局）、`dioramas/act1-7`、`Background`（战斗世界）。
- 已量化的重复：枯树 4 份、塔楼 2 份、墓碑 4 份、吊链 5 份、烛台 6 份、彩窗 2 份、断柱 3 份、北斗七星 3 份、书架 3 份、拱墙 4 份、主角剪影 2 份、尖拱几何 4 份。
- 面板外框被抄 5 份（TitleScene / GuideScene / LoadoutScene / GameOverScene 各一套，`editor-ui.kitPanel` 只服务 Intermission/Battle）。
- 法术：24 个法术 × 6 通道 = 144 个方法，流水线已经存在（`spell-fx/index.js` 的 `run()`），问题是 **4 张同键表平行维护**（`FX_DEF_IDS` / `IMPACT_SCALE` / `ENTRY_STYLE` / `EXIT_STYLE`），加一处漏三处。
- 现测试只验「预算上限 + 两次一致 + 覆盖率」，**证明不了画面不变**（全绿仍可能整体偏 1px）。删改绘制前必须录 op 日志 golden。

### 0.5 依赖健康度与工程配套

- **好消息**：文件级 0 循环依赖（Tarjan 全图 0 SCC）、0 个死文件、0 条失效测试引用；`logic` 零 Phaser、零 `Math.random`（4 处 `window` 访问均有守卫）。
- 死导出 7 个（`chebyshev`、`hasRun`、`ALL_DIRS`、`hintOf`、`evolutionRoutes`、`fireStuck`、`helpPageCount`）；178 个导出仅测试引用（**不要删**，是测试接缝）。
- **勘测纠错（2026-11-19 复核）**：`TRAIL_STYLE_NAMES` 不是死导出——`scripts/fx-check.mjs:6/74` 直接 import 并用于校验 `trail.style`，保留不动。
- **勘测纠错（2026-11-19 复核）**：`combatTargets` 被 `tests/battle-flow.test.js:901` 直接绑原型，必须进入波 3 委托清单（见 §3 波 3 的「委托面」定义）。
- 重复实现：`clamp01` ×7、`lerp` ×3、确定性 LCG ×4、FNV-1a `hashSeed` ×2、内联夹取 `Math.max(..,Math.min(..))` ×77。
- 测试缺口：18 个 src 文件无 vitest 覆盖，其中 5 个场景（Title 703 / Intermission 555 / Meta 168 / Loadout 195 / Guide 221）与 `journey-static`（1947）、`Background`（1232）是高危重构区。

### 0.6 三条不可违反的既有约束

1. **测试直接绑原型方法**：所有从 BattleScene 迁出的方法保留同名原型委托，测试文件零改动。
2. **时序与 RNG 不可变**：`update` 内调用顺序、`combatRng` 消耗顺序、`createBrain` 抽签次序、`Enemy` 构造期 dt=0 步进，全部逐字保留。
3. **同名文件不得覆盖语义**：`src/ui/spell-punch.js`（命中重量表）与 `src/ui/spell-fx.js`（法术特效门面）已存在，本轮的命中表现模块必须取新名（`src/ui/spell-hit-fx.js`）。

## 1. 目标 / 非目标 / 反目标

### 目标

1. `BattleScene.js` 3051 行 → 约 900~1100 行；拆出模块全部为「函数模块 + 同名一行委托」或自包含 UI 子系统。
2. `enemy-ai.js` 26 个行为归纳为 6 类共享骨架，删除重复段约 300 行；`enemy-ai.js` 永久保留为 barrel，全部既有命名导出不变。
3. `Enemy.js` 绘制抽离到 `src/ui/enemy-view.js`，实体回归「状态 + 事件端口」。
4. UI 层按「道具库 / 面板库 / 法术总表 / 像素 kit」四层去重，净删约 1200~1800 行。
5. 新增 golden 护栏（绘制 op 日志 + 敌人轨迹）与 `scripts/check-architecture.mjs`，把本次扫描的规则固化为可重复检查。
6. 补 4 个高危场景文件的 characterization 测试；更新 `docs/技术架构.md`、README 基线数字。

### 非目标

- 不改任何玩法数值、不调平衡、不改 UI 视觉设计（像素级都不变）。
- 不引入新依赖（不使用 `es-module-lexer`；架构脚本用正则静态扫描）。
- 不碰 `package.json`、`vite.config.js`、`index.html`、`src/main.js`（场景注册清单不变）。
- 不做全仓 lint 格式化（38k 行的淹没性 diff 会毁掉可审查性）；不推送到 GitHub。
- 不重写 `update` 主循环、不重排 RNG、不合并 26 个行为的语义（只合并重复的代码段）。
- 不动 `报名材料-共振法阵/`（未跟踪参赛材料）。

### 反目标

- **重构变成重写**：任何模块的功能增量都属于新需求，不属于本轮。
- **画面 1px 漂移**：绘制类改动一律以 op golden 为硬闸，golden 变了就是失败，不接受「看起来一样」。
- **测试被迁就**：不允许为了让测试变绿而放宽断言或删减检查；检查漏了只许补上或扩大检查面。
- **拆完更乱**：每个新模块必须有明确职责与依赖方向，禁止出现新的「万能工具」文件。

## 2. 总原则（重构纪律）

1. **只搬家不改逻辑**：拆出的函数体逐行复制（含注释与魔法数），唯一允许的改动是 `this.` → `scene.` 与函数签名首参。
2. **原型委托**：凡被测试直接调用的方法，BattleScene 原型上保留一行同名委托。
3. **跨组调用走场景**：模块间不互相 import，一律经 `scene.xxx()` 调用，保持测试「只绑被测方法 + 桩掉邻居」的写法可用。
4. **每波独立 commit**：一轮一提交，提交前全量测试 + 构建 + 文档校验 + 本波 golden 全绿；任何一项红就回滚该提交。
5. **先加检查再动手**：波 0 的 golden 与架构脚本先于一切代码迁移。
6. **单线程、主工作区**：不使用 worktree（用户随时可能开游戏验证）；每波开始前确认 `git status` 干净（仅允许 `报名材料-共振法阵/` 未跟踪）。
7. **冻结窗口**：重构期间不动内容与视觉。若用户中途提新需求：先暂停重构、把新需求单独 commit，再重录受影响的 golden，并另起一个 `test(golden): 重录基线 —— <原因>` commit 记录重录理由。golden 变化与重构漂移必须能从 commit 历史区分开。

## 3. 分波计划

### 波 0 · 护栏与清理（零行为变化）

**新增测试**

- `tests/ui-draw-golden.test.js`：fake Graphics 录制 op 序列，**量化规则**：所有数值 `Math.round(v*100)/100`（2 位小数）、颜色取整数后再 JSON 序列化 + SHA-256。该量化保证跨 Node 22/24、跨平台稳定（浮点差异远小于 0.005）。收录对象与采样点：
  - journey-static 18 带静态 + 6 个 dyn（`p = 0 / 0.25 / 0.5 / 0.75 / 1`）；story-art 30 带静态 + 10 个 dyn（同 5 点）；两高度 480×270 / 480×760 都录。
  - dioramas act1-7 各 3 带（共 21 带），两高度。
  - 24 个法术 × 6 通道（`k = 0 / 0.5 / 1` 三个相位点）。
  - Enemy / Boss / Player 的绘制（波 4 会动）：用最小 state 对象 + fake Graphics 录 `draw` 全量 op。
  - Background 只录 `drawStatic` 直绘分支（纹理烘焙路径 fake Graphics 无法覆盖，由 Playwright 截图兜底）。
  - **不纳入 op golden 的对象**：`drawGridEdit`（状态依赖过重）由 `scripts/pause-edit-smoke.mjs` + Playwright 截图对比覆盖；Title 面板（文本走 `addText`）改为独立「布局模型测试」（见波 5）；文字内容统一靠截图目检。
  - 哈希存测试内常量；测试同时断言「两次调用 op 完全一致」。
- `tests/enemy-ai-trace-golden.test.js`：26 个 defId × 固定 seed `20261023` × 6 秒（16ms 步进）× 固定 player 出生位。每帧记录量化后的 `[x, y, mode, windupRemaining, shots 伤害/数量, stomp 时间, melee 标记, summon 标记]`，JSON 序列化 + SHA-256。与现有 `tests/enemy-ai.test.js:191` 的增量：那里证「同版本两次一致」，这里证「跨重构版本一致」。
- `tests/battle-rng-trace-golden.test.js`（**必做**）：最小场景替身驱动 `spawnEnemy` 30 次，录 `combatRng` 消耗序列（每次 `next()` 返回值前 6 位）的哈希；波 3 迁移 `spawnEnemy/spawnWave` 时以此证明抽签次序未变。

**新增脚本**

- `scripts/check-architecture.mjs`（零依赖，正则解析 import/export）：
  - 规则 1：`src/logic/**` 禁止 import `phaser`、`src/scenes/**`、`src/ui/**`、`src/entities/**`、`src/audio/**`。
  - 规则 2：`src/ui/**` 禁止 import `src/scenes/**`；`src/entities/**` 禁止 import `src/scenes/**`。
  - 规则 3：`src/data/** → src/logic/**` 只允许现有 5 条白名单（`cinematics/encounters/map-events/meta → acts.js`、`roster → constants.js`），新增即失败。
  - 规则 4：文件级循环依赖必须为 0（Tarjan）。
  - 规则 5（债务模式）：`src/entities/** → src/ui/**` 采用**白名单**而非清零——允许 `Palette`、`variant-parts`、`kit-style`、`camera-shake`、`spell-fx.js` 门面、以及波 4 新增的各 view 模块；白名单外新增边则失败。纯分层在 Phaser 实体里不现实，白名单化足以阻止腐化。
  - 退出码：任何规则失败返回 1，可直接进 CI。
- CI 接线（`.github/workflows/pages.yml` 在 `npm run build` 后加一行 `node scripts/check-architecture.mjs`）；不动 `package.json`（不加 npm script）。

**死代码清理（每个符号删除前先 grep 复核）**

- 7 个死导出：`grid.chebyshev`、`grid.hasRun`、`constants.ALL_DIRS`、`card-hints.hintOf`、`evolutions.evolutionRoutes`、`guide.fireStuck`、`title-menu.helpPageCount`。
- **保留** `spell-fx/kit.TRAIL_STYLE_NAMES`（`scripts/fx-check.mjs` 在用）。
- `enemy-ai.js` 的 `pushShot`、`meleeSpecOf`；`Enemy.meleePreview` 的 `attackKind` 分支。
- **不动** `roster.ENEMY_TYPES[*].behavior`（复核确认被 `tests/enemy-ai.test.js:1411/1524-1528` 断言，非死字段）。
- 不删除「仅测试引用」的导出与 `cinematic-art.drawStage` 系列（178+ 个测试接缝）；这些留到波 5 的 M1 单独评估。

**波 0 闸门**：全量测试（1982 + 新增 golden）全绿；`check-architecture.mjs` 退出 0；构建通过；golden 哈希在两次运行间稳定。

### 波 1 · BattleScene 第 1 波（纯函数 / 纯绘制，约 −250 行）

| 新文件 | 迁入（源行号） | 说明 |
| --- | --- | --- |
| `src/ui/battle-camera.js` | `viewRect` 1288-1297、`updateBossCamera` 1298-1333、`resumeFollow` 2608-2620 | 视口与 Boss 抬头夹紧；依赖 `ui/boss-framing.js` |
| `src/ui/spell-hit-fx.js` | `spellPunch` 1583-1597、`spellStrikeSequence` 1598-1609、`spellLinkFx` 1610-1626、`reactionFx` 1627-1640 | 命名避开既有 `spell-punch.js` / `spell-fx.js` |
| `src/ui/hostile-draw.js` | 模块级 `drawHostileShot` 3027-3051 | 本来就在模块级，直接搬 |
| `src/ui/battle-frequency.js` | `updateFrequency` 2420-2436 | 抽纯函数 `computeFrequency(times, now, prev)` |
| `src/scenes/battle-setup.js` | `readTuning` 446-457、`pickStartCells` 458-469、`sampleStartCell` 470-488 | URL 参数与起点格 |

测试影响：0 个测试文件改动（已核对无测试直接调用这 11 个方法）。每搬一组跑一次全量。

### 波 2 · BattleScene 第 2 波（自包含 UI 子系统，约 −560 行）

| 新文件 | 迁入 | 形态 |
| --- | --- | --- |
| `src/ui/grid-editor.js` | `openGridEdit` 1641-1689、`editNames`、`tickEditBoardMotion`、`editHint`、`drawGridEdit` 1713-1909、`editCellClick` 1910-1985、`syncAuxPending`、`closeGridEdit` 2006-2035 | 类 `GridEditor`：`open()/close()/tick()/get isOpen()`；指针注册与解绑全部在类内；场景用 `this.editor` |
| `src/ui/levelup-panel.js` | `queueLevelPicks` 2058-2062、`openLevelupPick` 2063-2123、`rollEvolutionPick` 2124-2141、`pickLevelupCard` 2156-2180 | 类 `LevelupPanel`：`queue(n)/open()/pick(card)` |
| `src/scenes/battle-encounters.js` | `checkProgressEvents` 2437-2461、`updateEventPointVisuals` 2462-2485、`beginEncounter` 2486-2516、`selectEncounterAnswer` 2517-2523、`confirmEncounterAnswer` 2524-2536、`continueEncounter` 2537-2566、`playBossIntro` 2036-2057 | 7 个函数模块；`checkProgressEvents` 必须经 `scene.beginEncounter(def)` 回调（测试会覆盖该属性） |

关键约束：`applyEvolution`（2142-2155）不搬（它写 `run.evolutions` + `grid.cells[].slot` + `rebuildDerived`，是数据重建）；**`editOpen` 保留为场景布尔字段（唯一真相）**：GridEditor 的 `open()/close()` 通过 `scene.editOpen = true/false` 回写，`GridEditor.isOpen` 读 `scene.editOpen`，`closePause/update/tryDash` 继续读 `this.editOpen`。不得改成 `this.editor?.isOpen`——`tests/dash.test.js:161` 用 `makeBattle({ editOpen: true })` 驱动 `tryDash`，fake scene 没有 `editor` 会红。

### 波 3 · BattleScene 第 3 波（战斗核心，约 −900 行，BattleScene 落到 900~1100 行）

| 新文件 | 迁入 | 测试绑定方法（必须保留委托） |
| --- | --- | --- |
| `src/scenes/battle-hostiles.js` | `addHostileShot` 2639-2647、`updateHostileShots` 2648-2685、`combatTargets` 2686-2693、`addEnemySummon` 2694-2739、`updateSummons` 2740-2756、`sweepSummons` 2757-2770、`onSummonDestroyed` 2771-2781、`detonateRune` 2782-2811、`drawSummons` 2812-2860 | `addHostileShot`、`updateHostileShots`、`addEnemySummon`、`updateSummons`、`sweepSummons`、`onSummonDestroyed`、`detonateRune`、`drawSummons` |
| `src/scenes/battle-skills.js` | `grantSkill` 1347-1361、`skillCdOf` 1362-1366、`skillHostCell` 1367-1375、`pickSkillAim` 1376-1388、`castSkill` 1389-1412 | `grantSkill`、`skillCdOf`、`saveProgress` 留场景 |
| `src/scenes/battle-spawner.js` | `updateSpawner` 941-976、`spawnFormation` 977-1022、`spawnWave` 1023-1045、`spawnEnemy` 1046-1112 | `spawnEnemy`、`spawnWave`、`spawnFormation` |
| `src/scenes/battle-enemies.js` | `refreshFormationAuras` 1113-1151、`updateEnemies` 1152-1207、`onEnemyKilled` 2347-2386、`bumpKillStreak` 2387-2401、`updateShards` 2402-2419、`onEnemyMelee` 2861-2883 | `refreshFormationAuras`、`updateEnemies`、`bumpKillStreak`、`onEnemyMelee` |
| `src/scenes/battle-hit-pipeline.js` | `applySigil` 1417-1456、`onEnemyHit` 1457-1495、`triggerDeathBursts` 1496-1506、`collectDefeated` 1531-1534、`resolveProjectile` 1535-1542、`queueOrCommit` 1543-1554、`commitSigil` 1555-1571、`tickPendingCasts` 1572-1582 | 无直接绑定（经 `applySigil` 间接） |
| `src/scenes/battle-stage-flow.js` | `finishStage` 2236-2289、`swapStage` 2290-2346、`defeatBoss` 2567-2607、`startBossClearTransition` 2621-2638、`checkDeath` 2884-2887、`die` 2888-2911、`buildSummary` 2912-2936 | `finishStage`、`swapStage`、`defeatBoss`、`startBossClearTransition`、`buildSummary` |

留守场景：`constructor/create/update/onShutdown`、`mountUiLayer`、输入与暂停（G4）、`updatePlayer`、`applyPlayerControl/applyEnemyControl`、`onEngineEvent/onSignalDissipate`、`combatState`、`saveProgress`、`updateHint/updateStartSample`、`startStress`，以及全部同名委托。

**委托面定义**：本波迁移的**全部方法**（不只表格里标注测试绑定的）都在 BattleScene 原型上保留一行同名委托 `xxx(...args) { return moduleXxx(this, ...args) }`。`combatTargets` 虽只在 `battle-flow.test.js:901` 被直接绑定，同样保留委托。委托清单 = 迁移方法全集，照此执行即不可能漏。

迁移顺序（依赖从少到多）：`battle-hostiles → battle-skills → battle-spawner → battle-enemies → battle-hit-pipeline → battle-stage-flow`。每个模块一个独立 commit。

### 波 4 · 敌人骨架化与实体瘦身

**4.1 数据层（先做，低风险）**

- 新建 `src/data/enemy-tables.js`：迁入 `enemy-ai.js` 的 18 个 `*_RULE` 常量（26-135）、`MELEE_RULES`（147-158）、`RANGED_RULES`（166-192）、`TURRET/RUNE_LIFE_MS`（195-196）、`LURCH_MOMENTUM`（200）、`AI_PROFILE`（206-233）。
- **引用相等必须保留**：`AI_PROFILE.tune` 直接指向 `*_RULE`，搬引用不深拷贝；加测试 `expect(AI_PROFILE.bat.tune).toBe(BAT_RULE)`。
- `enemy-ai.js` 保留为 barrel：`export { ... } from './enemy/index.js'`，全部既有命名导出与 `STEP_BY_BEHAVIOR` 不变。

**4.2 行为骨架合并（中风险，先有轨迹 golden）**

- 新建 `src/logic/enemy/`：`rng.js`（242-263）、`geometry.js`（266-322、344-386）、`attack.js`（324-331、389-439、498-574）、`melee.js`（444-495）、`dash.js`（新抽，合并 9 份冲锋）、`behaviors/`（26 个 step 按 6 类骨架归并）、`index.js`（577-697、1927-2006）。
- 合并口径：只抽「重复的代码段」（环带微步、冲锋步进、抬手-放弹-补发、瞬移侧翼），每个 behavior 保留自己的状态机壳与函数名；**不写通用 DSL、不改行为语义**。
- 每次只迁移 1 个 behavior，跑 `enemy-ai-trace-golden` + `enemy-ai.test.js` 确定性用例；轨迹哈希漂移即回退该个。
- 顺手修：`stepSlamCharge` 等 10 处 `const stepMs = Math.min(dt, brain.chargeLeft)` 统一走 `dash.js` 单函数封装，先位移后扣时。

**4.3 实体瘦身**

- `src/ui/enemy-view.js`：`Enemy` 绘制 437-920 抽成 `drawEnemy(g, state, now)` + 局部辅助函数；`Enemy.js` 降到约 450 行。
- `src/logic/enemy/telegraph.js`：`windupRemaining` + 16ms 重推判据改为纯函数。
- `src/logic/enemy/control-factor.js`：`speedFactor` 改纯函数，入参从场景传入（`slowUntil/rootUntil/frozenUntil/inSlowField/auraMul`）。
- `src/ui/bars.js`：合并 `Enemy.drawHealth`、`Boss.drawHpBar`、`drawShieldBar` 为 `drawHpBar(g, x, y, ratio, chip, marks)`。
- `src/ui/boss-view.js` 与 `src/ui/player-view.js`：Boss 118-184、Player 201-372 迁出；实体只留状态与事件端口。
- `Player` 规则纯函数化（可选、低优先）：`src/logic/player-control.js` / `player-dash.js` / `player-damage.js`；若时间不够留到后续，但**不做**半吊子迁移（要么整块搬，要么不动）。
- 层次倒挂修复（放最后）：`SECTOR_SCREEN_HALF_W/H`、`SECTOR_FAR_X/Y` 从 `logic/constants.js` 下沉到 `src/data/sector-constants.js`，`roster.js` 改 import；`data/* → acts.js` 5 条若不能一次性清零，保留白名单并在架构脚本中标注。

**波 4 闸门**：轨迹 golden 全绿、`enemy-ai.test.js` 24 个确定性用例全绿、全量测试全绿、构建通过、抽查 3 个法术命中敌人的伤害数值不变。

### 波 5 · UI 去重（按 recon-ui 的 M0~M7）

- **M0**：波 0 的 `ui-draw-golden` 扩展覆盖本波全部对象（已是硬前提）。
- **M1 清死代码**：`story.drawSkyfall`、`title-menu.helpPageCount`（波 0 已删）、`cinematic-art.drawStage` + 7 幕舞台 + `drawKindEvent`（仅测试引用 → 同步删/改测试）、`diorama-kit.floor`（仅测试引用，同处理）。净删约 450 行。
- **M2 新增 `src/ui/art/pixel-kit.js`**：`mix`、`makeRng`（与 cinematic-art 同序列）、`box`（体色+受光+暗边三联）、`skyBands`、`ridge`、`fogBand`、`slabFloor`。先替换 story 的 `skyFill/groundSlabs` 与 journey 内联天空带，op golden 逐条一致。
- **M3 新增 `src/ui/art/props.js`**：枯树、塔、墓碑、吊链、烛台、彩窗、断柱、北斗七星、书架、拱墙、主角剪影、尖拱——每个函数保留现有参数，先搬后并；story/journey/act/Background 四处调用点同批替换并删本地副本。
- **M4 七幕局部去重**：act2 `lancet/polyline/bandPoly`、act5 `line/poly/courtColumn/gothicWindow`、act7 `line/ellipse`、act3 `seg/diamond` 换 kit；**只抽 band 头部 10~20 行**，不抽整带、不拆 24 个法术文件。
- **M5 法术收表**：`spell-fx/index.js` 四表合一张 `SPELL_DEFS = { id: { impactScale, entry, exit, impl } }`，对外旧表名保留兼容；`kit.js` 增补 `flatBlob/flatSector`（合并 hot 与 strike-fx 的同构实现）；加 schema 测试（24 个 id 六通道齐全、opBudget 不超 CAPS）。
- **M6 场景面板**：新增 `src/ui/panel.js`（`panel(g,{x,y,w,h,fill,frame,double,rivets})`）+ `src/ui/title-panels.js`（4 个面板迁出 TitleScene）+ `src/ui/cutscene-card.js`（`buildCardView` 迁出）。TitleScene 703 → 约 430，CutsceneScene 462 → 约 340。保留 `cutscene-choreo.js` 依赖的 `titleChars/statValues/titleBaseY` 字段契约。
- 净删目标约 1200~1800 行；**不追求**全部达到，逐项可回滚。

### 波 6 · 补测试、文档同步与终验

- 新增 characterization 测试：`tests/title-scene.test.js`、`tests/intermission-scene.test.js`（**必须在波 5 M6 动 TitleScene 之前完成**，即波 5 开头；否则事后补测试抓不住 M6 的回归）；`tests/journey-static-golden.test.js`、`tests/background-golden.test.js` 的 op golden 已在波 0 录制，本波只补断言文件与双高度用例。Title 面板的「布局模型测试」覆盖：5 项菜单的矩形坐标、焦点索引变化、四个子面板（说明/设置/档案/名单）的标题、行数与每行文本内容；文本用 `addText` 的桩记录参数。
- 文档：`docs/技术架构.md` 更新目录表（新增 `src/logic/enemy/`、`src/ui/art/`、`src/ui/panel.js` 等）、数据流不变声明；README「测试基线」数字更新；`docs/内容规格表.md` 仅在数值位置变化时同步。
- 终验：全量 vitest（预期 100+ 文件）、`vite build`、`node scripts/check-docs.mjs`、`node scripts/check-architecture.mjs`、两场截图目检（标题页 + 战斗第 1 场各 2 帧）。
- 最终 commit 让工作区干净（除报名材料）。

## 4. 每波闸门（Definition of Done）

1. `NODE_OPTIONS="--require ./scripts/sandbox-noexec.cjs" npx vitest run --pool=threads` 全绿（含新增 golden）。
2. `NODE_OPTIONS="--require ./scripts/sandbox-noexec.cjs" npx vite build` 通过，产物 `dist/` 正常。
3. `node scripts/check-docs.mjs` 通过。
4. `node scripts/check-architecture.mjs` 退出 0。
5. 本波涉及对象的 golden 哈希与基线一致。
6. 该波独立 commit；commit message 形如 `refactor: 波 N —— <内容>`。
7. 若任何一项红：修复或回滚该 commit，不得带红进入下一波。

## 5. 风险与缓解

| # | 风险 | 证据 | 缓解 |
| --- | --- | --- | --- |
| R1 | 测试绑原型方法，迁移即 `TypeError` | `battle-flow.test.js:181` 等 14 个文件、24 个方法 | 全部同名一行委托；迁移清单固化；每模块单独 commit |
| R2 | 共享对象多写入者，写路径分裂 | `this.player` 6 个写入者、`this.enemies` 5 个 | 模块只经明确函数写；`lastHitAmount/lastBlocked` 统一由 applySigil 清零 |
| R3 | 时序 / RNG 漂移 | `update` 20 余步、`createBrain` 抽签次序 | 只搬不重排；`battle-rng-trace-golden` + `enemy-ai-trace-golden` 做硬闸 |
| R4 | 画面 1px 漂移 | UI 499 个绘制函数、取整顺序敏感 | op 日志 golden；所有新函数沿用「参数先 round、内部不再变换」 |
| R5 | 事件监听解绑遗漏 | 5 组 input 监听在 create/onShutdown 成对 | GridEditor/LevelupPanel 的 `destroy()` 负责 off；`onShutdown` 加 `this.editor?.destroy()` |
| R6 | 魔法数字搬迁中悄悄改值 | `Enemy.js:359` 0.55 与 `BULWARK_RULE` 重复 | 只搬不改；同值不同语义的（0.75 减速 vs alpha）不合并 |
| R7 | 死代码误删测试接缝 | 178 个导出仅测试引用 | 删除前 grep 全仓；仅测试引用的一律留 |
| R8 | 玩家/环境干扰 | 用户随时开游戏；报名材料未跟踪 | 每波前 `git status` 干净；不碰 `package.json`/入口；报名材料不 add |
| R9 | 重构战线过长 | 6 波 × 约 3000~5000 行改动 | 每波可独立交付；波 4/5 可按子项再切；任何时候可停在干净状态 |

## 6. 明确不做

- 不新增玩法、不调数值、不改配色与像素画。
- 不拆 24 个法术文件、不拆 7 幕为独立文件（保持 locality）。
- 不重写 `update` 主循环、不引入 ECS/状态管理器/事件总线等新范式。
- 不改 `package.json`、`vite.config.js`、`index.html`、`src/main.js` 的场景注册。
- 不做全仓 lint/format；不提交 `报名材料-共振法阵/`；不 push。
- 不删除任何「仅测试引用」的导出与数据表。

## 7. 交付物清单

- 新增模块：`src/ui/battle-camera.js`、`spell-hit-fx.js`、`hostile-draw.js`、`battle-frequency.js`、`grid-editor.js`、`levelup-panel.js`、`enemy-view.js`、`boss-view.js`、`player-view.js`、`bars.js`、`art/pixel-kit.js`、`art/props.js`、`panel.js`、`title-panels.js`、`cutscene-card.js`；`src/scenes/battle-setup.js`、`battle-encounters.js`、`battle-hostiles.js`、`battle-skills.js`、`battle-spawner.js`、`battle-enemies.js`、`battle-hit-pipeline.js`、`battle-stage-flow.js`；`src/data/enemy-tables.js`、`sector-constants.js`；`src/logic/enemy/`（rng/geometry/attack/melee/dash/telegraph/control-factor/behaviors/index）。
- 新增测试：`ui-draw-golden`、`enemy-ai-trace-golden`、`battle-rng-trace-golden`、`title-scene`、`intermission-scene`、`journey-static-golden`、`background-golden`、`arch-guard`（脚本自测）。
- 新增脚本：`scripts/check-architecture.mjs`；CI 加一行。
- 文档：本设计、`docs/superpowers/plans/2026-11-19-architecture-refactor.md`（实施计划）、`docs/技术架构.md`、README。
- 代码指标：`BattleScene` ≤ 1100 行、`enemy-ai.js` ≤ 300 行（barrel + 汇总）、`Enemy.js` ≤ 500 行、`journey-static.js` 与 `story-art.js` 净减、全仓净减约 2000~3000 行。
