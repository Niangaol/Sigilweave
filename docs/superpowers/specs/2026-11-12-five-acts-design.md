# 北斗五幕 · 设计文档（七幕压缩为五幕 + 密度加码）

- 日期：2026-11-12
- 状态：待用户批准
- 上游需求：用户 m00001「把七关缩减到五关，内容密度增大」
- 勘察依据：`docs/superpowers/specs/_inventory-tests.md`（测试/脚本/文档依赖清单）

## 0. 一句话方案

**引入"幕（chapter 1..5）"与"场（stage 1..7）"两级结构。** 旧七幕的七套主题/地图/Boss/敌人不改编号，整体降级为"七场"；五幕各含 1~2 场：前三幕一场，第四幕 = 沉钟书库→衡律法庭，第五幕 = 熔星锻炉→破晓之座。通关判定从"打完这一幕唯一的 Boss"改为"打完本幕所有场的主 Boss"；幕内两场之间不打开幕间工作台，直接过场接续。

这样做的三个好处：

1. **美术与内容零废弃**：7 套布景、8 张 Boss 立绘、12 种专属敌人、7 套弹幕、7 张幕卡全部按原编号继续使用，没有一张图被扔掉，也不需要重画。
2. **"七契"叙事不动**：全流程仍然收 7 份大 Boss 契约（`run.bossResolutions` 7 条），开场「七枚契约钉入大地」与结局「七契尽解」一字不改。
3. **改动面收敛**：所有"每场"数据表继续用 1..7 做键，只有"每幕"的少数表（ACTS/DIFFICULTY/幕名/幕进度）从 7 项变 5 项。

## 1. 术语

| 词 | 键 | 含义 | 例子 |
|---|---|---|---|
| 幕 chapter | 1..5 | 玩家视角的"关" | 第肆幕 · 天权·玉衡 |
| 场 stage | 1..7 | 一幕内的地图段，一套主题/世界/Boss | Ⅳ 沉钟书库、Ⅴ 衡律法庭 |

代码：`run.chapter`（1..5）、`run.stage`（1..7）；BattleScene 内 `this.chapter` / `this.stage`。旧的 `run.act`/`this.act` 一律拆开改写，不留双关。

## 2. 五幕总表

| 幕 | 星 | 场 | 主题 | 世界尺寸（原→新） | 事件点 | 主 Boss（等级） | 小 Boss | NPC |
|---|---|---|---|---|---|---|---|---|
| 一 | 天枢 | 1 Ⅰ | 荒废墓园 | 1920×1440 → **2400×1800** | 5 | 烬冠骑士（5） | 1a 1b **1c 1d** | 艾琳 |
| 二 | 天璇 | 2 Ⅱ | 腐沼教堂 | 2400×1600 → **2600×1900** | 5 | 溺誓女爵（10） | 2a 2b **2c 2d** | 瑟维安 |
| 三 | 天玑 | 3 Ⅲ | 星陨王庭 | 2400×1800 → **2800×2000** | 5 | 无昼织王（15） | 3a 3b **3c 3d** | 莉芙拉 |
| 四 | 天权 | 4 Ⅳ | 沉钟书库 | 2400×1800 → **2800×2100** | 3 | 万卷之喉（20） | 4a 4b | 梅薇 |
| 四 | 玉衡 | 5 Ⅴ | 衡律法庭 | 2400×1800 → **2800×2100** | 3 | 失衡法官（24） | 5a 5b | 奥菲 |
| 五 | 开阳 | 6 Ⅵ | 熔星锻炉 | 2400×1800 → **3000×2200** | 3 | 熔心匠主（28） | 6a 6b | 铎恩 |
| 五 | 摇光 | 7 Ⅶ | 破晓之座 | 2560×1920 → **3000×2200** | 3 | 破晓之王（32） | 7a 7b | 黎恩 |

- 粗体 = 本次新增（前三幕各补 2 个小 Boss，共 6 条，已写好草稿：`docs/superpowers/content/new-minis.js`）。
- 每幕遭遇场次：前三幕 1 NPC + 4 小 + 1 大 = **6 场/幕**；第四、五幕 2 NPC + 4 小 + 2 大 = **8 场/幕**（见 §9 的偏差说明）。
- 参考时长（仅结算口径，通幕仍由 Boss 决定）：场 1..7 = 210/220/230/200/200/210/240 秒；幕合计约 3.5 / 3.7 / 3.8 / 6.7 / 7.5 分钟。

## 3. 玩家流程

```
标题 → 构筑(L) → 幕1 场1 → [幕间] → 幕2 场2 → [幕间] → 幕3 场3 → [幕间]
   → 幕4 场4 ──(主 Boss 万卷之喉倒)── 幕内转场 ── 场5 ─(失衡法官倒)→ [幕间]
   → 幕5 场6 ──(熔心匠主倒)── 幕内转场 ── 场7 ─(破晓之王倒)→ 结局
```

- **幕间工作台只在"跨幕"时出现**（4 次），幕内换场不打断构筑，玩家带着当前血量/连斩/构筑直接进入下一场。
- 场间过场沿用现有 `JOURNEYS`（键 2..7 不变），但 `JOURNEYS[5]` 与 `JOURNEYS[7]` 改成"幕内接续"文案（短、不落地到工作台）。

## 4. 幕内换场（本次唯一的新架构）

现状**没有**幕内重建世界的路径：世界尺寸/背景/事件点/玩家位置都在 `BattleScene.create()` 里一次性建好，`Background` 没有 destroy。要么原地重建，要么整场景重启。**选择原地重建**，理由是重启会把血量回满、kill 计数与引擎时间清零，等于白送一段续航。

新增 `BattleScene.swapStage(nextStage)`，在"本场主 Boss 结算完成"后调用：

1. 背景：给 `src/ui/Background.js` 加 `destroy()`（销毁 `floorArt/staticG/flickerG`，构造里 :151-157 那些对象），然后 `new Background(this, nextStage, this.world)`。
2. 世界：`this.world = WORLD_SIZES[nextStage]`；重写 `worldBounds`/`battleBounds`（现 :155-156 一次性赋值）；`cameras.main.setBounds`。
3. 事件点：按新场重建（`done` 标记从 `run.completedEvents` 恢复）。
4. 清场：`enemies/projectiles/hostileShots/chests` 全部清空；`boss=null`、`bossStarted=false`、`bossDefeated=false`；玩家传送到新世界中心并 `resumeFollow()`。
5. 节奏：`spawnTimer` 给一小段热身；`this.stage` 更新；`phase='play'`。
6. **保留**：`engine`（脉流引擎）、`grid`、`board`、`hud`、`shards`、`kills`、`engine.now`、玩家当前血量。

表现层：换场瞬间做一次"幕内场次卡"——屏幕压暗 + 场次编号/星名/标题（复用 `cinematics.js` 的绘制，不切场景），约 1.6 秒，然后恢复。视觉语言与幕卡一致，但更短、不带"通幕"数据。

## 5. 通关判定与账目

| 旧 | 新 |
|---|---|
| `this.bossDefeated` 单布尔 = 唯一大 Boss 打完 | `this.bossDefeated` = **本场**主 Boss 打完；`completeAct()` 的条件与放行逻辑改为「本场打完 且 本场是本章最后一场」 |
| `run.majorBossActs[act]` 防重复触发 | `run.majorBossStages[stage]` |
| `run.bossResolutions[act]`（7 键 = 7 幕） | `run.bossResolutions[stage]`（7 键 = 7 场，语义变成"七契"，正好对齐叙事） |
| `resolveBossOnce(run, act, …)` 校验 `run.act === act` | `resolveBossOnce(run, stage, …)` 校验 `stage ∈ stagesOf(run.chapter)`，并保留"每场一条 receipt"的幂等 |
| `if (this.act < 7)` 通幕 | `if (!isLastStageOfChapter)` → 幕内换场；否则 `if (chapter < 5)` → 幕间；否则结算 |
| 每幕掉一张法术卡（7 项数组按 act 取） | 每场掉一张（同数组按 stage 取），7 张法术仍全部可得 |
| 终局 `run.act = 7` | 终局 `chapter = 5, stage = 7` |

## 6. 数据与代码改动面

### 6.1 每"场"（1..7，键不变，只加/改值）
- `src/logic/constants.js`：`WORLD_SIZES` 七档全部放大（见 §2）。
- `src/data/map-events.js`：`ACT_THEMES`/`ACT_LAYOUTS` 补 c/d 锚点与文案；`getEventPoints(stage, world)` 返回 5 点（场 1-3）或 3 点（场 4-7）；`MIN_WORLD_SIZE` 800→**1600**，`MIN_SPACING` 保持 400（1600×1600 的可用区内 5 点 400 间距可行，需用例校验）。
- `src/data/encounters.js`：`ENCOUNTERS` 34 条（28 + 新增 6）；`getEncounterForAct` 更名 `getEncounterForStage`，守卫 1..7 保留；顺手修掉 `getMinibossEncounters` 拼错连字符（现恒返回 `[undefined, undefined]`，且无人调用）。
- `src/logic/boss.js`：`BOSS_PATTERNS` 七套不变；`createBossModel` 守卫改"场"。
- `src/logic/progression.js`：`MAJOR_BOSS_LEVEL` 七项新值 5/10/15/20/24/28/32；`shouldTriggerMajorBoss` 改按场。
- `src/data/roster.js`：`ACT_ENEMY_WEIGHTS`、`ACT_DENSITY` 继续按场（1..7），权重重新配平并按"场"分层（见 §7）。
- `src/data/cinematics.js`：`ACT_CARDS` 七张不变（键 1..7 = 场），每张加 `chapter` 字段，眉栏文案改成「第 N 幕 · 场 Ⅳ · 天权」。
- `src/ui/dioramas/registry.js`、`src/ui/Background.js`：键不变；Background 加 `destroy()`。
- `src/entities/Boss.js`：立绘 clamp 仍 1..7。

### 6.2 每"幕"（1..5，7 → 5 项）
- `src/logic/constants.js` `ACTS`：5 项，每项 `{ act, stages: [..], baseIntervalMs, starts, unlocked }`；间隔 1.4/1.2/1.0/0.96/0.92；starts 2/3/3/4/4；unlocked 6/12/16/16/16。
- `src/data/roster.js` `DIFFICULTY`：5 档（hp 4/5.5/7/8.5/10、speed 38/44/49/53/58、spawnMs 700/640/590/550/520、maxAlive 34/42/50/58/66、wave 1/1/2/2/2）。
- `src/data/story.js`：`JOURNEYS` 键 2..7 不变，改文字与"是否跨幕"标记；`OPENING_SHOTS/ENDING_SHOTS` 不动（七契照旧）。
- `src/ui/Hud.js` `ACT_CN`：5 项，合并幕显示「天权·玉衡」「开阳·摇光」；`actLabel` clamp 1..5。
- BattleScene：`durationMs` 按场取值；`completeAct()` 重写（见 §5）；新增 `swapStage()`。

### 6.3 元进程与结算
- `src/logic/meta.js`：`:168 Math.min(7, …)` → 5；里程碑键 `'boss-' + r.act` 改成 `'boss-' + r.stage`。
- `src/data/meta.js`：`ACTS` 5 项；大 Boss 里程碑 7 条改按场；小 Boss 里程碑 14 → **20** 条（含 1c/1d/2c/2d/3c/3d）；通关里程碑 7 → 5 条。总数 24 → **32**。
- 存档/进度字符串（`meta.save` 里的 achievements）只增不减，不需要迁移。

## 7. 密度加码（用户勾选的四项）

1. **Boss 结构**：场 1-3 各 4 小 + 1 大；场 4-7 各 2 小 + 1 大（每幕合计 4 小 + 2 大）。小 Boss 每只 6 碎晶、大 Boss 4 碎晶 + 1 张法术卡，经济口径不变。
2. **敌人种类与节奏**：敌人 26 种不增不减，但权重表按场重排——每场 6~8 种（本场专属 4 种 + 从前面场次传承 2~4 种），避免"同场只有 4 种敌人"的单调；`ACT_DENSITY` 七档 maxAlive 1.00→1.62、spawnMs 1.00→0.70 平滑过渡。
3. **地图与世界尺寸**：七场全部放大 15%~35%（见 §2），事件点从 3 点扩到 3~5 点，间距与出生保护同步标定。
4. **单幕时长**：场 1-3 约 3.5 分钟、场 4-7 约 3.3~4 分钟；幕合计 3.5 / 3.7 / 3.8 / 6.7 / 7.5 分钟，四、五幕接近"单幕 5 分钟+"。

## 8. 叙事与视觉

- 开场「七枚契约钉入大地」、结局「七契尽解」、七颗星名全部保留；五幕名：荒废墓园 / 腐沼教堂 / 星陨王庭 / 审判书库 / 熔星破晓。
- 幕卡仍是 7 张（按场），眉栏从「第 N 幕 · ACT Ⅳ · 天权」变成「第 N 幕 · 场 Ⅳ · 天权」；合并幕的两张卡共享幕号。
- HUD 幕名对合并幕显示双星名；结算界面仍按大 Boss 条数显示契约（7 条）。
- 幕间工作台标题以幕为单位（5 次出现 4 次）。

## 9. 与"一幕七场"选项的偏差（需用户确认）

用户选定的方案是「每幕 = 1 NPC + 4 小 Boss + 2 大 Boss = 7 场」。按本文的"幕=章/场=地图段"模型，合并幕天然每段各有一个 NPC（书库的梅薇、法庭的奥菲；锻炉的铎恩、破晓的黎恩），于是第四、五幕是 **2 NPC + 4 小 + 2 大 = 8 场**。

- 采用（推荐）：七位向导的文案全部保留，密度更高，几乎零额外成本。
- 不采用：合并幕第二段的 NPC 降级为过场旁白（奥菲/黎恩 只出现在场次卡与对话里），每幕严格 7 场。

## 10. 验收标准

1. `npm test` 全绿（用例数从 694 涨到约 720+）；新增/改写用例覆盖：五幕常量、七场事件点、`swapStage` 换场后世界/事件点/血量不变、每场一条 receipt、幕内不弹工作台、终局入结局。
2. `npm run build` 通过。
3. `node scripts/three-act-smoke.mjs`（改造为五幕七场全回归）走通：7 场全清、7 条 receipt、HUD 幕名正确、终局返回 `chapter=5/stage=7`。
4. 截图验收：七场各一张 + 幕内换场前后各一张，人工目检地图放大后不空、不挤。
5. 文档：`docs/北斗七幕.md` 改写为 `docs/北斗五幕.md`（保留七场映射细节），`docs/规则契约.md` 参数段落同步，`README.md` 统计数字更新，`scripts/check-docs.mjs` 无死链。

## 11. 风险

| 风险 | 应对 |
|---|---|
| `act` 语义位移引发连锁错误（src 下 12 处 1..7 守卫、10 个文件） | 先加 `chapter/stage` 双字段与 `stagesOf(chapter)` 工具，再逐文件迁移；每步跑一次 vitest |
| 原地换场漏清理（残留敌人/弹丸/事件点图标） | `swapStage` 末尾断言 `enemies.length === 0`，并加单测 |
| 放大世界后背景烘焙变慢 | Background 是静态一次性烘焙，2400×1800 量级同一帧内完成；若超过 16ms 再改为分帧烘焙 |
| 5 点事件点在大世界里显得稀 | 事件点半径 28→**34**，走近提示延长；四/五幕只有 3 点，靠小 Boss 更硬、刷怪更密兜住密度 |
| 平衡漂移（7 场等级曲线 + 更密的刷怪） | 用 `scripts/density-sim.mjs`/`stress.mjs` 复测，必要时代码里调 `MAJOR_BOSS_LEVEL`，不改结构 |
