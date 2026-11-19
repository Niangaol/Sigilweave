# 战斗深化：读招闪避 / Boss 阶段战 / 怪物编队（2026-11-18）

> 需求原文（2026-11-18）：「继续深化」（在「怪物难度大加强 + 硬控招式」落地之后）。
> 用户选择（ask_user_question）：三个方案全做；冲刺用**鼠标右键**。
> 补充信息（用户当场说明）：「顺便说一下刚刚做了主动的技能系统」——即 wangbichun 合的 `run.skillLibrary` + `castSkill(0/1/2)`（按 1/2/3 释放，`SKILL_CD_BASE = 5200`，每场重置）。本轮设计必须与它共存，不抢键位、不共用冷却。

## 0. 现状（侦察结论，2026-11-18 实测）

### 0.1 玩家侧：有难度，没有反制

- 输入只有 WASD / 方向键（`readMoveAxis` 定义在 `BattleScene.js:624`）。空格是「按住看详情」（`syncPauseState`，`BattleScene.js:636`），1/2/3 是主动技能（`BattleScene.js:704-706`）。
- 已有硬控状态（2026-11-17 怪物重做）：`Player.applyControl(kind, ms, now)` 只处理 `stun / root / slow` 三种；`knock` **不在 Player 层**——它由 `BattleScene.applyPlayerControl`（`BattleScene.js:833-851`）自己算位移，然后**转调 `p.applyControl('stun', cfg.ms ?? 200, now)`** 来产生僵直。这一条是 §3.1「冲刺解不解击退」的关键前提，见 §3.1.1。
- `moveBlocked(now)` 与 `speedFactorAt(now)` 在 `BattleScene.updatePlayer`（`BattleScene.js:813-819`）里生效。
- **没有任何闪避 / 翻滚 / 位移技**。硬控一旦吃到只能等结束。
- 敌人前摇是有的：`MELEE_RULES` 10 只近战 260~620ms 扇形预警、`RANGED_RULES` 10 只远程 400~850ms 抬手（`src/logic/enemy-ai.js`）。玩家能做的只有走开。
- 配了硬控的敌人：`src/data/control.js:19-42` 的 `ENEMY_CONTROL` 共 **15 条**表项（覆盖 15 个 defId），外加全场的 `DEFAULT_CONTACT_CONTROL`（击退）与 `DEFAULT_SHOT_CONTROL`（迟滞）兜底。

### 0.2 Boss 侧：一个循环的弹幕血包

- `src/logic/boss.js` 的 `stepBoss(model, dtMs, position, target)`：`attackIn` 倒计时 → 记一次 `aim` → `windupLeft = 600` → 到点按 `BOSS_PATTERNS[场号]` 发一组弹 → `attackIn = max(1000, 2200 - 场×200)`。**整场只有这一个循环，没有阶段、没有大招、没有弱点窗口。**
- `BOSS_PATTERNS` 7 套，`count` 3~10、`damage` 10~12、`speed` 38~78。
- `BOSS_HP = { base: 170, perStage: 85, majorMul: 1.45 }`，`BOSS_ARMOR = { mini: 0.25, major: 0.30 }`（场 7 是 `round((170+85×7)×1.45) = 1111` 血）。
- `src/entities/Boss.js` 已有：立绘精灵、`attack_warning` 素材预警条、读条瞄准线 + 落点双环（`draw` 里 `model.windupLeft > 0 && model.aim` 分支）、血条。`stepBoss` 在 `Boss.js:68` 调用，**未传 ctx**。
- `tests/boss.test.js` 共 **18 个 `it`/`it.each` 块**（`it.each` 七场再展开），锁住了：7 场每场弹数精确等于 `count`、`shots.every(damage > 0)`、`BOSS_HP` 键集合 `['base','majorMul','perStage']`（`Object.keys().sort()` 全等，**加任何字段即红**）、`model.windupLeft === 600`（硬编码常量的显式锁定）、`bossStats` 的 hp 公式。

### 0.3 怪物侧：26 种设计点，组合靠运气

- `BattleScene.updateSpawner`（`BattleScene.js:878`）按 `difficultyAt` 的 `spawnMs / wave / maxAlive` 单点刷怪，`spawnEnemy` 里 `pickEnemyType(chapter, roll)` 抽一个 defId，**没有编队概念**。
- 26 个 `ENEMY_TYPES` 各有独立 `behavior`（`AI_PROFILE`），彼此零协同。
- 已有 `pickWavePoints`（`src/logic/spawn.js:50`）一次抽多个互不重叠的落点，可以直接复用做编队站位。
- `enemySpawnLoad` 按变体 cost 折算槽位（精英/重甲算 2）。

### 0.4 与主动技能系统的关系（必须共存）

- 技能来自升级三选一选中的法术卡（`BattleScene.grantSkill`），`SKILL_SLOT_MAX = 3`，`skillCdOf` = `SKILL_CD_BASE × def.cdMul`。
- 技能走 `applySigil(this.skillHostCell(), defId, aim, angle)`，跟罗盘格共用命中管线，**伤害很高**（等于该法术的完整一发）。
- 因此：冲刺必须与技能**完全分开的冷却**（否则右键会顶掉技能节奏）；Boss 破防窗口的加成倍数要保守（见 §4.3），不能被技能爆发一波带走。

## 1. 目标与非目标

### 目标

1. **方案一 · 读招与闪避**：给玩家主动冲刺（右键），带无敌帧与硬控解除；新增控制抗性递减；强化敌人前摇可读性。
2. **方案二 · Boss 阶段战**：每个 Boss 三阶段 + 转阶段演出 + 每场专属大招 + 大招后的破防窗口 + 低血狂暴。
3. **方案三 · 怪物编队**：刷怪按编队模板出怪；编队内轻量协同（护卫光环）；编队同色标记让玩家读出「这是一伙的」。
4. 三者全部纯逻辑可测：冲刺/抗性在 `Player`，Boss 阶段在 `boss.js`，编队在 `spawn.js` + 新数据文件。

### 非目标

- 不做通用「翻滚动画/角色换帧」——像素立绘只有一张 `player` 图集，冲刺靠**残影 + 拉伸 + 拖尾**表现。
- 不给玩家加体力条 / 耐力条（冲刺冷却替代）。
- 不改现有 24 张法术、变体、派系、进化、联组、前摇的既有契约。
- 不改 `package.json`、构建配置、入口文件；不新增依赖；**不 commit**（沿用本项目当前「用户未批准 commit」的状态）。
- 触屏端冲刺按钮本轮延后（先写进待办，不动手）。

### 反目标

- **冲刺变成无脑位移**：冷却 1.2s、无敌只有 220ms、不解除眩晕——必须让「什么时候不冲刺」也是决策。
- **控制抗性递减变成控制免疫**：递减有 150ms 下限，且只对同一种控制生效，不同种类各算各的。
- **Boss 阶段变成三段血条**：转阶段必须有可感知的行为变化，否则就是加血。
- **编队变成一堵墙**：编队总槽位 cost 必须有上限，且编队之间必须留出单点刷怪的间隙。

## 2. 方案选择

用户在 ask_user_question 里三个都选了。三者互不冲突，且共享同一条前提（玩家有反制手段），所以按 1 → 2 → 3 顺序实施：先让玩家能反制（方案一），再让 Boss 变成关卡（方案二），最后让杂兵有战术结构（方案三）。

| 顺序 | 方案 | 为什么排这个位置 |
| --- | --- | --- |
| 第一 | 读招与闪避 | 后两个方案都会加剧压迫感；先给玩家反制手段，否则玩家只会觉得「更难受」。改动面最小（`Player.js` + `BattleScene.updatePlayer`），能最快拿到可玩验证。 |
| 第二 | Boss 阶段战 | 依赖方案一的「读招」语言：阶段大招的蓄力圈与闪避窗口是同一套表现词汇。 |
| 第三 | 怪物编队 | 依赖方案二确定的「哪些怪是威胁」的认知；编队编排要用到已实测的难度曲线。 |

未被选中的备选（记录在此以免重复讨论）：

- **武器切换 / 多把法杖**：改动面横跨罗盘、构筑、UI，且与「法术自动化」核心冲突。
- **玩家主动格挡（举盾减伤）**：与「护盾」资源语义重叠，容易变成拖时间。
- **Boss 多阶段独立血量条 UI**：纯表现且信息冗余，用血条上的分段刻度即可。

## 3. 方案一：读招与闪避

### 3.1 冲刺（鼠标右键）

**输入**：`BattleScene` 新增 `this.input.on('pointerdown', ...)` 分支——`pointer.button === 2` 时触发冲刺。`index.html:39` 已经拦截了 canvas 上的 `contextmenu`，右键不会弹系统菜单（这条是既有行为，本轮只依赖它，不改 `index.html`）。

注意：`BattleScene` 现有两个 `pointerdown` 监听（`editPointer` 在编辑法阵时、`levelupHandler` 在升级三选一时），都只做左键矩形命中。冲刺监听必须：
- 只在 `this.phase === 'play' && !this.paused && !this.menuOpen && !this.editOpen` 时生效；
- 在 `editOpen` / `levelup` 打开时不注册（这两个监听器在开/关时会 `off`，冲刺监听照同一模式处理）。

**方向**：取当前 WASD 输入方向；没有输入则朝**面向方向**（`player.facing`，水平）。不做鼠标位置瞄准——本作是俯视跑步，鼠标位置方向会跟摇杆语义打架。

**数值**（全部进 `PLAYER.dash`，便于一处调参）：

| 字段 | 值 | 理由 |
| --- | --- | --- |
| `distance` | 108px | 比一次接触击退（36px）远得多，能真正脱离包围圈；低于屏幕宽 480 的 1/4，不会瞬移出画面 |
| `ms` | 180 | 移动速度 96px/s，180ms 正常走 17px；冲刺 108px ≈ 6.4 倍，有明显爆发感 |
| `invulnMs` | 220 | 覆盖整个冲刺 + 40ms 余量，能穿一发弹幕，但不能穿整轮齐射 |
| `cooldownMs` | 1200 | 与技能最短冷却（`SKILL_CD_BASE=5200` 的最小值）错开一个量级，右键不会抢技能节奏 |
| `afterMs` | 400 | 冲刺结束后 400ms 内不能再次冲刺，形成「冲完要站稳」的节奏 |

**无敌走独立字段，不碰 `invulnUntil`**：`Player.takeDamage` 现在用 `invulnUntil` 做受击无敌（`PLAYER.iframesMs = 660`）。冲刺如果复用这个字段，220ms 的冲刺无敌会**把 660ms 的受击无敌截短**（`invulnUntil = now + 220` 覆盖原来的更远值），等于冲刺反而让玩家更容易被连击。

所以新增 `dashInvulnUntil`，`takeDamage` 判定改为：

```js
if (now < this.invulnUntil || now < this.dashInvulnUntil) return false;
```

两者取并集，互不覆盖。

**冲刺无敌只免伤害，不免控制**：冲刺中仍可能被新挂上 `stun` / `root` / `slow`。这与「冲刺不解眩晕」是同一套哲学——冲刺是位移与脱离，不是无敌帧免控。

**冲刺解除硬控的规则**：


| 控制 | 冲刺能否解除 | 理由 |
| --- | --- | --- |
| `root`（定身） | **能** | 定身就是「被困住」，冲刺是唯一解，这是它存在的价值 |
| `slow`（迟滞） | **能** | 迟滞是持续惩罚，解掉一次符合「读招」节奏 |
| `knock` 的僵直 | **能** | 击退本身是瞬移（已经发生），玩家被卡住的是之后的僵直。不清掉，冲刺就是废键 |
| `stun`（眩晕） | **不能** | 眩晕是本轮唯一「吃到就纯挨打」的硬控。对着践踏预警滚开是正确解，吃到就认罚 |

#### 3.1.1 必须先做的一处拆解：击退僵直 ≠ 眩晕

现状是 §0.1 里那条：`applyPlayerControl` 的 `knock` 分支做完位移后调 `p.applyControl('stun', cfg.ms ?? 200, now)`。也就是说**击退的僵直在 Player 层就是 stun**，冲刺若「解击退僵直」就必然要动 `stunUntil`，与上表最后一行直接冲突。

拆法（**A 波第一个任务**，先做，其余全部依赖它）：

1. `Player` 新增独立字段 `knockStunUntil`；新增方法 `applyKnockStun(ms, now)`，只写这个字段（叠加以更晚为准）。
2. `Player.moveBlocked(now)` 改为 `now < stunUntil || now < rootUntil || now < knockStunUntil`。
3. `BattleScene.applyPlayerControl` 的 `knock` 分支把 `p.applyControl('stun', ...)` 换成 `p.applyKnockStun(cfg.ms ?? 200, now)`。
4. `Player.applyControl` 的签名与三种 kind 的行为**完全不变**（现有测试不受影响）。
5. 冲刺的解除规则：清 `rootUntil`、`slowUntil`、`knockStunUntil`；**不动 `stunUntil`**。

这样 `applyControl('stun')` 的语义收窄为「真眩晕」，`ENEMY_CONTROL` 里两条 `stomp: stun`（缝合尸魁 700ms / 铁砧暴君 900ms）继续是真眩晕，冲刺解不掉——这正是设计要的。

**表现影响**：`Player.drawControl` 目前按 `stunUntil / rootUntil / slowUntil` 画三种提示。要把 `knockStunUntil` 并入眩晕的绘制条件（画同样的星点），但玩家看到的「眩晕」图标与「被击退的僵直」在美术上不做区分——区分只存在于逻辑层。这是有意的：玩家只需要知道「现在动不了，按右键」。

**控制抗性递增（§3.2）也必须跟着改**：`knockStunUntil` 不进 `controlLog`（它是击退的副产物，不是独立的一次控制），这样才能避免「被撞一下，下一次真眩晕被削到 150ms」。


**表现**（`Player.draw` 扩展，不新增素材）：
- 冲刺期间画 3 个逐渐淡出的残影（用 `drawProcedural` 的同一套色块，透明度 0.5 / 0.3 / 0.15）；
- 冲刺起点留一条 8px 的拖尾线（`C.teal`，200ms 淡出，走 `EffectsLayer`）；
- 冲刺结束瞬间脚下一个小冲击环（复用 `effects.burst`）。

**HUD**：`src/ui/Hud.js:10` 的 `SKILL_BAR = { left: 178, top: 216, slotW: 44, slotH: 28, gap: 6 }` 占 `x = 178..334`、`y = 216..244`。冲刺指示放**技能槽左边外侧**：`left: 148, top: 216`，24×24 圆形，冷却中按扇形遮罩（复用 `drawSkills` 同一套遮罩算法）。不压住现有三个槽，也不动 `SKILL_BAR` 常量。


### 3.2 控制抗性递减

`Player` 新增 `controlLog = { stun: [], root: [], slow: [] }`（存 `now` 时间戳数组，只用最近 10 秒）。**`knock` 不进这个表**——见 §3.1.1 最后一段。

`applyControl(kind, ms, now)` 的计算顺序：
1. 清掉该 kind 里早于 `now - 10000` 的记录；
2. `count` = 剩余记录数（0 / 1 / 2 / ≥3）；
3. 倍率 `[1, 0.6, 0.35, 0.35, ...]`；
4. 实际时长 = `max(150, ms × 倍率)`；
5. push `now` 进记录。

不同 kind 独立计数（连续吃两次定身会递减，但中途吃一次眩晕不影响定身的计数）。

**为什么下限是 150ms**：低于 150ms 的控制在 60fps 下只持续 9 帧，玩家感知不到，等于免控。

**为什么是 10 秒窗口**：`DEFAULT_CONTACT_CONTROL` 的接触击退每 600ms 就能触发一次，如果窗口太短，递减永远不会生效；10 秒能覆盖一次完整的「被围住」过程，但不会跨场景残留。

**注意**：接触击退只写 `knockStunUntil`，不写 `stunUntil`，所以**「被怪围着撞」不会让真眩晕递减**。递减只对真眩晕（两条精英 stomp）、定身（腐尸/符文蛛/锁链卫）、迟滞（各法系）生效。

### 3.3 前摇可读性强化

现有预警有：近战扇形（`Enemy.drawCastPose` 的 windup 分支 + `drawMeleeFan`）、远程抬手（头顶菱形 + 抬手弧光，**故意不画指向线**）、精英践踏圈、Boss 读条瞄准线。

本轮加一层**统一的地面红环**：敌人进入 `windup` 时，脚下画一个与剩余前摇同步收缩的红环，最后 120ms 闪烁频率翻倍。

**必须先确认的两个既有事实**（builder check 抓出来的，别再重复踩）：

1. `EffectsLayer.telegraph(x, y, durationMs, color, radius)`（`src/ui/EffectsLayer.js:87`）**已经实现**了「最后 120ms 更急的闪烁」——这条是既有行为，本轮**不需要新写**，只要传对 `durationMs`。
2. 「剩余前摇」目前**没有任何一个模块对外暴露**。`Enemy.windup` 是布尔（`Enemy.js:267-271`），`windupMs` 与已过时间都在 brain 内部。所以这条必须改 `src/entities/Enemy.js`（**A 波白名单已包含它**，见 §6.1）。

实现方式：`Enemy` 在 `applyResult` 拿到 `result.windup === true` 的那一刻记下 `this.windupAt = now` 与 `this.windupDur = melee.ranged 的 windupMs`（从 `brain.melee` / `brain.ranged` 读，读不到就不画），然后在 `drawCastPose` 里按 `(now - windupAt) / windupDur` 算收缩比例，交给 `effects.telegraph(x, y, windupDur, C.blood, radius)` 一次性推入（**只在进入 windup 的那一帧推一次**，不能每帧推）。

这样三套前摇（近战/远程/践踏）在视觉上是同一套语言，玩家只需要学一次「红环收缩 = 要挨打了」。


## 4. 方案二：Boss 阶段战

### 4.1 状态机

`boss.js` 的 `stepBoss` **保持向后兼容**，新增可选第五参：

```js
stepBoss(model, dtMs, position, target, ctx = null)
// ctx: { hpRatio?: number }   // 0..1，缺省视为 1
```

**兼容契约（这是 B 波最容易炸的地方，builder check 已实证）**：

`tests/boss.test.js` 现有 18 个块里有三条会直接锁死改动：

| 锁 | 位置 | 冲突 |
| --- | --- | --- |
| `expect(model.windupLeft).toBe(600)` | 旧分支硬编码 | 阶段 2/3 要 540/480，但旧分支必须还是 600 |
| `Object.keys(BOSS_HP).sort()` 全等 | `['base','majorMul','perStage']` | 往 `BOSS_HP` 加任何字段即红 |
| 每场弹数精确等于 `pattern.count` | `it.each` 七场 | 阶段 2/3 的弹数倍率会让它变红 |

解法（**实现者必须照做，不许改这三条测试**）：

1. **600 的硬编码原地不动**。阶段参数全部来自新文件 `src/data/boss-phases.js`，旧分支（`model.phase === undefined`）**根本不读** `BOSS_PHASES`。写法上就是：

   ```js
   // 旧分支：与改动前逐字节一致
   if (model.phase === undefined) {
     // ...现有全部逻辑，包含 model.windupLeft = 600 ...
   }
   // 新分支：读 BOSS_PHASES[model.phase].windupMs
   ```

2. **不往 `BOSS_HP` 加字段**。阶段战的任何血量相关常量（如果需要）进 `boss-phases.js`，`BOSS_HP` 保持三键。
3. **`tests/boss.test.js` 的七场弹数用例靠「不传 ctx」保住**——不传 ctx 时 `model.phase` 永远是 `undefined`，走旧分支，弹数就是 `pattern.count`。新增的阶段战用例一律显式传 `ctx: { hpRatio }`，测的是另一个函数入口。
4. 结论：§6.2 的红线「第四参之前行为逐字节不变」**成立**，但前提是实现者严格按上面第 1 条分叉，而不是「让旧分支也读参数」。


`model` 新增字段（只在阶段战启用时写入）：

| 字段 | 含义 |
| --- | --- |
| `phase` | `0` / `1` / `2`，由 `hpRatio` 跨边界时推进 |
| `mode` | `'aim'`（正常循环）/ `'ultimate'`（大招蓄力）/ `'break'`（破防窗口） |
| `modeLeft` | 当前 mode 剩余毫秒 |
| `shiftLeft` | 转阶段无敌演出剩余（>0 时 `stepBoss` 不产弹） |
| `ultKind` | 本场大招类型（`'ring'` / `'lance'` / `'homing'` / `'mix'`） |
| `ultIn` | 距离下一次大招的毫秒 |

**阶段推进**：每次调用读 `ctx.hpRatio`，跨过 `0.66` 或 `0.33` 时进入 `shiftLeft = 900`，并清空 `mode` 回 `'aim'`。

#### 4.1.1 一帧内多件事同时发生时的优先级（必须写死，否则会自吞）

技能是整发法术伤害（§0.4），一次命中从 100% 打到 33% 以下完全可能。三种事件可能在同一次 `stepBoss` 里撞车，按下面的顺序处理，**后执行的不能覆盖先执行的**：

1. **`shiftLeft > 0` 时冻结一切**：不产弹、不推阶段、不进破防、不移动。这是最高优先级——转阶段演出期间 Boss 是「无敌且不动」的。
2. **一次调用最多推一格阶段**：`phase = Math.min(2, phase + 1)`。从阶段 1 直接被技能打到阶段 3 时，先演出阶段 2，`shiftLeft` 归零后再判一次，才进阶段 3。**不允许两段演出叠在同一帧**。
3. **破防（`break`）优先级低于 `shift`**：如果大招落地的那一帧恰好跨了阶段边界，先转阶段，破防窗口延迟到 `shiftLeft` 归零后再开（`mode` 保持 `'aim'`，`ultIn` 保留）。
4. **`break` 期间不产弹**：破防窗口就是给玩家输出的窗口，Boss 自己在挨打。

#### 4.1.2 转阶段清场：只清杂弹，不清自己的大招

§4.4 说的「转阶段清空 `hostileShots` 给玩家喘息」有一个坑：现有 5 处清空点（`BattleScene.js:2114 / 2388 / 2421 / 2681 / 2791`）都是整体赋值 `this.hostileShots = []`。大招是多发弹幕（§4.2），如果转阶段和大招同帧发生，Boss 会把自己的大招吞掉。

**规则**：转阶段的清场改成

```js
this.hostileShots = this.hostileShots.filter(s => s.fromBoss === true);
```

即**只清杂兵和召唤物的弹**，Boss 自己的弹（含大招）留着。这也是「转阶段演出期间 Boss 不产弹」能成立的前提——已经飞出去的弹照常飞。

#### 4.1.3 阶段倍率同时放宽张角（否则「更凶」变成「更糊」）

现有非 ring 的偏移公式是 `(i - (count-1)/2) * (spread / ((count-1)/2 || 1))`——`count` 变大而 `spread` 不变时，**弹间距变小、总张角不变**，玩家看到的不是「弹更多了」而是「糊成一堵墙」，反而更难判断该往哪躲。

**规则**：弹数倍率 `countMul` 生效时，`spread` 同步乘 `Math.sqrt(countMul)`。阶段 3 的 `countMul = 1.5`，`sqrt(1.5) ≈ 1.22`，张角放大 22%，弹变多但仍然可读。


**每个阶段的循环参数**（`BOSS_PHASES`，新文件 `src/data/boss-phases.js`）：

| 阶段 | 血量区间 | `attackIn` 基数 | `windupMs` | 弹数倍率 | 速度倍率 | 大招间隔 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 100%~66% | `max(1000, 2200 - 场×200)` | 600 | ×1.0 | ×1.0 | 12000 |
| 2 | 66%~33% | 上式 ×0.82 | 540 | ×1.25（向上取整） | ×1.08 | 10000 |
| 3 | 33%~0% | 上式 ×0.68 | 480 | ×1.5（向上取整） | ×1.15 | 8000 |

**狂暴**：`hpRatio < 0.2` 时 `attackIn ×0.8` 再叠一次（与阶段倍率相乘）。

### 4.2 七场专属大招

每场一个大招类型，蓄力 1200ms（地面红环半径 140px，全屏警示），落地形态：

| 场 | 大招 | 形态 | 附带硬控 |
| --- | --- | --- | --- |
| 1 | 石像崩落 | `ring` 环形 12 发 | 无 |
| 2 | 尸潮回响 | `ring` 环形 16 发（双波，间隔 200ms） | 无 |
| 3 | 虚空裂口 | `lance` 3 条直线（间隔 120°，速度 110） | `slow` 1000ms ×0.6 |
| 4 | 书页暴雨 | `mix` 环形 10 发 + 朝玩家 5 发扇形 | `slow` 1200ms ×0.55 |
| 5 | 天平裁决 | `lance` 1 条超宽直线（宽度 40px）+ 追踪 3 发 | `root` 800ms |
| 6 | 熔炉倾覆 | `ring` 20 发 + 地面 4 处延迟落点 | `knock` 240ms / 力 90 |
| 7 | 终星陨落 | `mix` 环形 16 发 + 追踪 4 发 + 2 条直线 | `stun` 700ms |

**硬控**：大招命中挂的控制**不走** `ENEMY_CONTROL`（那是杂兵表），走 `boss.js` 导出的 `bossControlFor(stage)`，由 `BattleScene.updateHostileShots` 在命中时按来源分流。

#### 4.2.1 `fromBoss` 怎么落地（这里是白名单里唯一必须改既有测试的地方）

builder check 实测：`src/logic/hostile.js:239` 构造的是 `hits.push({ damage: shot.damage, x: shot.x, y: shot.y, kind: shot.kind })`，而 `tests/hostile.test.js:182` 是

```js
expect(out.hits).toEqual([{ damage: 4, x: 0, y: 0, kind: 'bolt' }]);
```

**`toEqual` 全量比较，追加任何字段都会红。**

处理方式（**批准改这一条测试**，这是本轮唯一允许动的既有断言）：

1. `makeShot(from, dir, spec)` → `normalizeShot` 的 `{...src}` 会**自动透传** `fromBoss`（builder check 已核实 `normalizeShot` 在 `hostile.js:158-173` 是 `{...src}` 全量保留），所以 `makeShot` 本身**不用改**，只要调用方传 `{ fromBoss: true }`。
2. `stepHostileShots` 的 `hits.push` 追加 `fromBoss: shot.fromBoss === true`。
3. `tests/hostile.test.js:182` 的 `toEqual` 改为 `toMatchObject`（保留原 4 字段的精确校验，同时允许新字段）。**这是「扩大检查面」而不是「放宽检查」**——原 4 个字段仍然逐字段精确比对，只是不再要求「没有别的字段」。
4. 理由写在这里以备案：命中记录是纯输出结构，**新增字段是唯一能把这个信息带回场景层的通道**；另起一条并行数组（如 `bossHits`）会破坏「输出数组保持输入顺序、便于逐帧对拍」的既有契约（`hostile.js` 头部注释第 4 条纪律）。

#### 4.2.2 Boss 弹不吃全场迟滞

`BattleScene.js:2460` 现状是命中后**无条件** `applyPlayerControl(DEFAULT_SHOT_CONTROL, ...)`（轻迟滞 900ms ×0.7）。如果 Boss 弹再叠一个专属硬控（比如场 5 的 `root` 800ms），玩家会同时「慢 + 定身 + 无敌帧」，等于连环控。

**规则**：`hit.fromBoss === true` 时**跳过** `DEFAULT_SHOT_CONTROL`，只用 `bossControlFor(stage)`。杂兵弹的兜底迟滞不变。


### 4.3 破防窗口

大招落地后进入 `mode = 'break'`，持续 **1200ms**：

- `Boss.armor` 临时归零（`BattleScene` 侧读 `boss.model.mode === 'break'` 时把 armor 覆盖成 0，不改 `Boss.armor` 原值）；
- 受到的伤害 **×1.2**（在 `effects.applyDamage` 里读 `enemy.breakUntil`，与已有的 `vulnFactor` 分开乘，互不覆盖）；
- 地面上画一圈金色碎环 + 头顶飘「破防」（`labelPopup`）；
- 破防期间 Boss 不移动（`Boss.update` 的 `d > 55` 位移分支跳过）。

**为什么只要 ×1.2 且只有 1200ms**：技能是整发法术伤害（§0.4），一轮三技能爆发在 1200ms 内能打掉 Boss 15%~25% 血量。再高就是「等破防 → 三技能 = 秒杀」，等于把 Boss 做成答题机。

### 4.4 表现（`Boss.js`）

- **转阶段**（`shiftLeft > 0`）：`sprite.setTintFill(0xffffff)` 闪两下 + 震屏 + 环形冲击波（`effects.burst` 三层）+ 清杂弹（**不是** `scene.hostileShots = []`，见 §4.1.2）。
- **震屏换 kind**：`shakeCamera(this, 'hurt', ...)` 会被节流——`src/ui/camera-shake.js` 的 `SHAKE_KINDS.hurt = { gapMs: 900, ampScale: 0.8 }`，900ms 内的第二次 `hurt` 直接**被吞掉**，且幅度还会被乘 0.8。转阶段如果刚好跟在一次受击之后，玩家会完全看不到震屏。
  **改用 `'strike'`**（或新增一个 `'phase'` kind，`gapMs: 150`、`ampScale: 1`），确保转阶段演出一定播出。这条必须改 `camera-shake.js` 或换 kind，不能只传参数。
- **大招蓄力**：`effects.telegraph(x, y, 1200, C.blood, 140)` + 瞄准线加粗 + 头顶画一个填充中的菱形进度。
- **破防**：地面金环（`C.brassLight`）+ 立绘闪白 100ms 一次。
- **阶段标记**：血条上加两道刻度（66% / 33%），当前阶段刻度高亮。

`Boss.update` 负责把 `this.hp / this.maxHp` 塞进 `ctx.hpRatio` 并在 `mode` 变化时触发上面的一次性演出（用 `this.lastMode` 对比，**不能每帧触发**）。

## 5. 方案三：怪物编队

### 5.1 数据（新文件 `src/data/formations.js`）

```js
// 编队模板：一组有战术意图的怪。
// roles[].defIds 用 defId 池 + rng 抽取，保证同编队不重复。
export const FORMATIONS = Object.freeze([
  {
    id: 'shield_wall', name: '盾墙推进', minStage: 1, weight: 3,
    roles: [
      { path: 'vanguard', defIds: ['page_golem', 'brass_warden'], count: 1 },
      { path: 'ranged', defIds: ['crystal_dryad', 'verdict_wraith'], count: 2 },
    ],
    aura: { armorBonus: 0.15, speedMul: 0.9 },   // 前排存活时给后排的加成
  },
  ...
]);
```

**8 个编队**（覆盖 26 种怪，每个编队有明确战术意图）：

| id | 名称 | 编队 | 战术意图 |
| --- | --- | --- | --- |
| `shield_wall` | 盾墙推进 | 1 前排 + 2 远程 | 打不穿前排就一直挨弹，要先绕后 |
| `pincer` | 钳形夹击 | 2 冲锋 + 1 控制 | 两侧同时冲，逼用冲刺 |
| `siege` | 远程阵地 | 3 远程 + 1 炮台 | 站桩输出位，必须冲进去 |
| `swarm` | 蝠群 | 5 蝠 + 1 蛛 | 数量压制，靠 AoE 清 |
| `casters` | 双法 | 2 法系精英 + 2 小怪 | 齐射 + 召唤，先秒法系 |
| `brute` | 重压 | 1 精英重甲 + 2 小怪 | 单点高压，考走位 |
| `harass` | 骚扰 | 3 冲刺怪 + 2 远程 | 打乱阵型，考冲刺时机 |
| `mixed` | 混编 | 1 前排 + 1 远程 + 1 控制 + 1 小怪 | 全要素，只在后期出现 |

### 5.2 刷怪改造（`BattleScene.updateSpawner`）

现有流程是「到点 → 算 room → 抽 1~2 个落点 → 各刷一只 → 重设定时器」。改成：

1. **波次计数**：新增 `this.waveIndex`，**只有实际成功 spawn 才 +1**（`room <= 0` 提前 return 时不动它）。`waveIndex > 0 && waveIndex % DIFFICULTY.formationEvery === 0` 时走编队。
2. **`formationEvery = 3`** 进 `DIFFICULTY`（新增字段，现有读取方不受影响）。
3. **抽模板**：按当前 `chapter` 过滤 `minChapter`，按 `weight` 加权抽一个模板，按 role 抽 defId（同编队不重复）。
4. **落点必须同侧**：现状 `pickWavePoints` 里 `pickSpawnPoint` 用 `angle = rng() * 2π` **全向随机，没有任何扇区参数**（builder check 实测）。所以 `src/logic/spawn.js` 必须新增一个可选参数：

   ```js
   pickSpawnPoint({ ..., sectorAngle = null, sectorSpread = null })
   // 两者都是有限数时：angle = sectorAngle + (rng() - 0.5) * sectorSpread
   // 缺省 null：保持现有 angle = rng() * 2π，行为逐字节不变
   ```

   `pickWavePoints` 原样透传这两个参数。编队调用时传「朝玩家的反方向 ±0.6 rad」的扇区，让这一队从同一侧压上来。
5. **槽位闸**：编队总 `enemySpawnLoad` 不得超过 `dif.maxAlive × 0.4`，超了就**降级为单点刷怪**（不是少刷几只，整轮降级更简单）。
6. 编队成员身上写入 `enemy.formationId`（同一个 id 共享），供协同与表现读取。

**`minStage` 改名 `minChapter`（1..5）**：字段名原写 `minStage` 但 §5.2 又说「按 chapter 过滤」，两者不是一回事（stage 是场 1..7，chapter 是幕 1..5）。统一用 `minChapter`，并按当前 `chapter` 的 `CHAPTER_ENEMY_WEIGHTS` 过滤候选 defId——**抽不到就降级单点刷怪**，不许硬塞一个本幕不存在的怪。

**为什么是「每 3 波」而不是「每波」**：`spawnMsStart = 440`，一波约 0.44 秒。全是编队会让同屏结构过于密集、且失去随机感。1/3 的编队比例让「有组织的怪」成为事件，而不是常态。

### 5.3 编队协同（只做一条，控制复杂度）

**护卫光环**：编队内 `vanguard` 路径的成员**存活**时，同编队其余成员获得 `armorBonus`（+0.15）与 `speedMul`（×0.9）。

实现：`BattleScene.updateEnemies` **每帧重算**（不做节流——8 个编队 × 每帧一次存活扫描，成本可忽略；节流会让 vanguard 死亡后的光环滞留一个窗口，玩家看到的是「前排死了加成还在」）。把结果写到成员 `enemy.formationAura = { armorBonus, speedMul }`；成员死亡或编队全灭时**立刻 delete 该字段**（在 `updateEnemies` 的清理分支里统一做）。

`applyDamage`（`src/logic/effects.js`）的 armor 计算改为：

```js
const armor = clamp01(enemy.armor + (enemy.formationAura?.armorBonus ?? 0));
```

**叠加规则（builder check 提问，这里定死）**：

| 情况 | 结果 |
| --- | --- |
| 普通怪 + 光环 | `0 + 0.15 = 0.15` |
| 举盾的 page_golem（`armor = 0.55`）+ 光环 | `0.55 + 0.15 = 0.70` |
| **Boss** | **不参与编队，永远不吃光环** |
| **精英（`def.elite === true`）** | **不参与编队光环**（编队只给杂兵，避免精英被数值撑爆） |

`Enemy.speedFactor(now)` 的返回值**末尾**乘 `(this.formationAura?.speedMul ?? 1)`。

**不加的东西**（明确写下来，避免后续膨胀）：不给编队加集火逻辑、不加齐射、不给编队单独 AI——编队只改「谁和谁一起出现」和「一条护卫光环」。


### 5.4 编队标记（表现）

同编队成员脚下画同色小三角，颜色从 4 个预设里按 `formationId` 哈希取。玩家能一眼看出「这三个是一伙的」，从而理解为什么要先打前排。

**`pxTriangle` 不存在**（builder check 实测，`src/ui/Palette.js` 只有 `pxRect/pxFrame/pxPoly/pxPolyLine/pxLine/pxDiamond/pxRing/pxHeart/pxShard`）。用 `pxPoly` 传三个顶点即可，不新增绘制原语。

不做头顶血条、不做连线——本作画布只有 480×270，再加信息会糊。

## 6. 工程契约（实现时必须遵守）

### 6.1 文件面与白名单

| 波次 | 新建 | 修改 |
| --- | --- | --- |
| A 读招与闪避 | — | `src/entities/Player.js`、`src/entities/Enemy.js`（§3.3 红环需要前摇时长）、`src/scenes/BattleScene.js`、`src/data/roster.js`（`PLAYER.dash`）、`src/ui/Hud.js`、`src/ui/EffectsLayer.js`、`src/data/guide-content.json`、`docs/内容规格表.md` |
| B Boss 阶段战 | `src/data/boss-phases.js` | `src/logic/boss.js`、`src/entities/Boss.js`、`src/logic/hostile.js`（`fromBoss`）、`src/logic/effects.js`（`breakUntil`）、`src/ui/camera-shake.js`（新增震屏 kind）、`src/scenes/BattleScene.js`、`docs/内容规格表.md` |
| C 怪物编队 | `src/data/formations.js` | `src/logic/spawn.js`（扇区参数）、`src/logic/effects.js`（`formationAura.armorBonus`）、`src/scenes/BattleScene.js`、`src/entities/Enemy.js`（`speedFactor` 乘光环）、`src/data/roster.js`（`formationEvery`）、`docs/内容规格表.md` |
| D 验收 | `docs/战斗深化验收-2026-11-18.md` | `README.md`、`docs/技术架构.md` |

**三条 builder check 抓出的白名单漏洞，已修正**：

1. A 波原来没给 `src/entities/Enemy.js`，但 §3.3 的红环必须读敌人前摇时长 → 已补进 A 波。
2. C 波原来没给 `src/logic/effects.js`，但 §5.3 的 `armorBonus` 要在 `applyDamage` 里读 → 已补进 C 波。B 波也改这个文件（`breakUntil`），**两波必须串行**（C 在 B 之后，不并行）。
3. B 波需要 `src/ui/camera-shake.js` 才能让转阶段震屏不被节流吞 → 已补进了 B 波。

**冻结不动**：`index.html`、`package.json`、`vite.config.js`、`src/main.js`、`src/data/control.js`（杂兵硬控表——方案二的大招硬控走新函数，不塞进来）、`src/logic/enemy-ai.js`、`src/data/cards.js`、`src/data/evolutions.js`、`src/data/linkages.js`、`src/data/factions.js`、`src/ui/Palette.js`（不新增绘制原语，用 `pxPoly`）。

### 6.2 向后兼容红线

1. `stepBoss` 不传第五参时行为逐字节不变——但**必须用 §4.1 的 if 分叉写法**（旧分支保留 `windupLeft = 600` 硬编码，新分支读 `BOSS_PHASES`），不能「让旧分支也读参数」。
2. `BOSS_HP` 不加任何字段（`tests/boss.test.js` 有 `Object.keys().sort()` 全等断言）。
3. `makeShot` 不改签名；`normalizeShot` 的 `{...src}` 会自动透传 `fromBoss`。`stepHostileShots` 的 `hits.push` 追加 `fromBoss`，**唯一允许改的既有断言**是 `tests/hostile.test.js:182` 的 `toEqual` → `toMatchObject`（见 §4.2.1，其余 4 个字段仍逐字段精确比对）。
4. `Player.applyControl(kind, ms, now)` 签名不变，只处理 `stun / root / slow` 三种；`knock` 的僵直改走新的 `applyKnockStun`（§3.1.1），**不改 `applyControl` 的既有语义**。
5. `moveBlocked` 的判定从两个条件变三个（加 `knockStunUntil`），对「没被击退过」的情况结果不变。
6. `effects.applyDamage` 的 `breakUntil` 只在 `enemy.breakUntil` 存在且 `now < breakUntil` 时生效，缺省无变化。
7. `Boss.armor` 的覆盖只在 `BattleScene` 侧做，`Boss` 实例自身的 `armor` 字段语义不变（`applyDamage` 仍读 `enemy.armor`）。
8. `pickSpawnPoint` 新增的 `sectorAngle / sectorSpread` 缺省 `null` 时必须走 `angle = rng() * 2π`，RNG 调用顺序不变（现有对拍测试依赖这一点）。
9. 冲刺监听必须在 `editOpen` / `levelup` / `menuOpen` 下完全静默，否则会跟现有两个 `pointerdown` 处理器抢事件。

### 6.3 测试策略

新增 4 个测试文件：

- `tests/dash.test.js`：方向、距离、无敌窗口（独立于 `invulnUntil`）、冷却、后摇、解除 `root`/`slow`/`knockStun`、**不解除 `stun`**、无输入朝 `facing`、越界钳制。
- `tests/control-resistance.test.js`：同类递减 1 → 0.6 → 0.35 → 0.35、150ms 下限、10 秒窗口过期、不同 kind 独立计数、`knockStun` 不进表。
- `tests/boss-phases.test.js`：`stepBoss` 不传 ctx 时与改动前快照零漂移、三阶段参数生效、转阶段不产弹、一次最多推一格、破防优先级低于转阶段、狂暴叠加、七场大招形态与硬控、`breakUntil` 写入。
- `tests/formations.test.js`：8 个编队数据契约（role 路径合法、defId 都在 `ENEMY_TYPES`、weight > 0、`minChapter` 在 1..5）、按幕过滤、槽位 40% 闸、同编队不重复 defId、护卫光环只在前排存活时生效、Boss 与精英不吃光环。

**修改的既有测试（只有两条，其余一律不改）**：

| 文件 | 改什么 | 为什么 |
| --- | --- | --- |
| `tests/hostile.test.js:182` | `toEqual` → `toMatchObject` | 命中记录新增 `fromBoss` 字段（§4.2.1） |
| `tests/guide-content.test.js:53-55` | `coverage` 断言加上 G17~G19 | §6.4 新增三条引导 |

**明确不需要改的**：`tests/density.test.js`（对 `DIFFICULTY` 只做字段读取，加 `formationEvery` 不会让它红——builder check 已核实）；`tests/boss.test.js`（不传 ctx 就走旧分支，18 个块全绿）；`tests/enemy-ai.test.js`（`formationAura` 缺省无字段，`speedFactor` 用 `?? 1`）。

**验证命令**（沙箱内 `npm test` 会因 EPERM 失败，用临时配置）：

```bash
cd /d/AgentPrograms/Sigilweave
printf 'export default { test: { include: ["tests/**/*.test.js"], globals: false } };\n' > vitest.tmp.config.mjs
npx vitest run --config vitest.tmp.config.mjs --pool=threads
npx vite build --config vitest.tmp.config.mjs
rm -f vitest.tmp.config.mjs
node scripts/check-docs.mjs
```

**仿真验证**：`scripts/density-sim.mjs` 已有 `SIM_STAY=1` 站桩模式。方案一落地后加 `SIM_DASH=1` 模式（每 1.2 秒在受控时冲刺），用同一颗种子跑「有冲刺 vs 无冲刺」的存活时长对比，日志贴进验收文档。

### 6.4 引导

`src/data/guide-content.json` 升到 `0.4.2`，新增三条（`G17` / `G18` / `G19`）：

- **G17（冲刺）**：第一次吃到 `root` / `knockStun` 时触发，教右键冲刺脱身。埋点放 `BattleScene.applyPlayerControl`（它统一收口四种 kind，Player 层不加埋点）。
- **G18（Boss 阶段）**：第一次看到 Boss 转阶段时触发，说「它换了打法」。
- **G19（编队）**：第一次遇到带编队标记的怪时触发，说「脚下一伙的会互相加成」。

三条都是 `oncePerRun: true`，且 **`meta.coverage` 必须同步加上 G17-G19**（`tests/guide-content.test.js:53-55` 断言 coverage 含 G13-G16，新增会红）。

## 7. 工作量

| 波次 | 任务数 | 净新增实现 | 净新增测试 | 说明 |
| --- | --- | --- | --- | --- |
| A 读招与闪避 | 6 | ~300 行 | ~260 行 | 改动集中在 `Player.js` + `BattleScene`，但 §3.1.1 的「击退僵直拆解」必须第一个做 |
| B Boss 阶段战 | 8 | ~560 行 | ~380 行 | 风险最高：`boss.js` 三处断言锁定 + 震屏要换 kind |
| C 怪物编队 | 6 | ~420 行 | ~280 行 | 数据设计与数据校验占一半；必须串在 B 之后（同改 `effects.js`） |
| D 验收 | 3 | — | — | 全量测试 + build + 文档 + 仿真数据 |
| **合计** | **23** | **~1280 行** | **~920 行** | 任务数比上一轮「法术形态扩层」（18 任务 / 5 波）多 27.8% |

**结论**：比上一轮法术深挖大约多四分之一，主因是 Boss 阶段战（测试锁定多、要新写震屏 kind、演出一整套）。分四波做，每波结束都跑全量测试，波与波之间可以停下来看效果。

**行数是估算，不是承诺**；验收看的是「全量测试绿 + build 过 + 仿真数据可复现」，不是行数。

## 8. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 右键与浏览器/系统菜单冲突 | `index.html:39` 已在 canvas 上 `preventDefault` contextmenu；实机 Playwright 验证一次 |
| 冲刺让硬控失去威胁 | 不解眩晕 + 1.2s 冷却 + 400ms 后摇；用 `SIM_DASH` 对比仿真确认「有无冲刺的存活差距在 20~35 秒」而不是翻倍 |
| 冲刺无敌被用来无脑穿弹幕 | 220ms 只够穿一发，且冷却远大于无敌；仿真里统计「每 10 秒冲刺次数」上限 |
| 冲刺无敌把受击无敌截短 | 用独立字段 `dashInvulnUntil`，两者取并集（§3.1） |
| Boss 转阶段演出卡帧 | 演出走 `EffectsLayer.push`（已被 24 张法术特效用过）；转阶段只清杂弹（§4.1.2）降低同帧负载 |
| 转阶段震屏被节流吞掉 | 换 `'strike'` 或新增 `'phase'` kind（§4.4），不靠调参数 |
| 破防窗口被技能秒杀 | ×1.2 且 1200ms，实测后按需下调 |
| 编队让同屏变成一堵墙 | 编队总槽位 ≤ `maxAlive × 0.4` 硬闸 + 每 3 波一次；跑 `density-sim` 对比同屏峰值不超过 45 |
| 编队光环把精英/Boss 撑爆 | §5.3 明确：Boss 与 `def.elite === true` 不吃光环 |
| 现有的 `boss.test.js` / `hostile.test.js` 被改坏 | §6.2 红线 + §4.1 的 if 分叉写法；`hostile.test.js:182` 是**唯一**允许改的既有断言，且只从 `toEqual` 放宽到 `toMatchObject` |

## 9. 留给实现者的判断

1. 冲刺残影的具体透明度曲线（0.5/0.3/0.15 是起点，可调）。
2. 编队 8 个模板的具体 `defIds` 池（只要 defId 在当前 chapter 的权重表里、role 合理，可以调整）。
3. 破防窗口的金环画几层。
4. 引导三条的文案（保持墨宝的「喵～」语气，与 G00-G16 一致）。
5. 阶段 2/3 的 `countMul` 取 1.25 / 1.5 是否够凶——先按表实现，仿真看 Boss 战时长再调。

## 10. 这份文档里我替你拍的决定（builder check 提出，不用你再答）

以下 16 条原本是「实现者必问」，都有唯一合理答案，我直接定了并写进对应章节。你只要扫一眼有没有明显不同意的一条：

| # | 问题 | 我的决定 | 章节 |
| --- | --- | --- | --- |
| 1 | 冲刺「解击退僵直」与「不解眩晕」冲突（击退僵直在代码里就是 stun） | 拆出独立 `knockStunUntil`，冲刺只清它 | §3.1.1 |
| 2 | `hit.fromBoss` 会打破 `hostile.test.js:182` 的 `toEqual` | 改那一条为 `toMatchObject`，其余 4 字段仍精确比对 | §4.2.1 |
| 3 | 转阶段清场会不会吞掉 Boss 自己的大招 | 只清 `fromBoss !== true` 的弹 | §4.1.2 |
| 4 | 转阶段 / 大招落地 / 破防同帧的优先级 | `shift` 期间冻结一切；一次最多推一格；破防排最后 | §4.1.1 |
| 5 | 一击跨两档阶段怎么推 | 一次最多推一格，下一帧再判 | §4.1.1 |
| 6 | 冲刺无敌复用 `invulnUntil` 会不会截短受击无敌 | 独立 `dashInvulnUntil`，取并集 | §3.1 |
| 7 | 冲刺无敌是否免控 | 不免控（只免伤害） | §3.1 |
| 8 | 红环要读敌人前摇，但 A 波白名单没给 `Enemy.js` | 把 `Enemy.js` 补进 A 波 | §6.1 |
| 9 | 编队光环与既有 armor 怎么叠 | 相加后 clamp01；Boss 与精英不吃 | §5.3 |
| 10 | 编队光环的生命周期（节流会滞留） | 每帧重算，死亡/全灭立刻 delete | §5.3 |
| 11 | `formationQueue` 与 `spawnTimer` 的时序 | 加 `waveIndex`，只有成功 spawn 才 +1；`room<=0` 不消耗编队轮次 | §5.2 |
| 12 | `minStage` 是场号还是幕号 | 改名 `minChapter`（1..5），按 `CHAPTER_ENEMY_WEIGHTS` 过滤，抽不到就降级单点 | §5.2 |
| 13 | 弹数倍率让扇形变密而非变宽 | `spread` 同步乘 `sqrt(countMul)` | §4.1.3 |
| 14 | HUD 冲刺指示放哪 | `left: 148, top: 216`（技能槽左侧外侧） | §3.1 |
| 15 | Boss 弹会不会「全场迟滞 + 专属硬控」连击 | `fromBoss` 时跳过 `DEFAULT_SHOT_CONTROL` | §4.2.2 |
| 16 | G17 的埋点放 Player 还是 BattleScene | `BattleScene.applyPlayerControl`（四种 kind 的统一收口） | §6.4 |

