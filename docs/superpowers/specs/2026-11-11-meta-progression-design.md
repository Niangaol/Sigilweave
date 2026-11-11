# 局外成长「残响祭坛」设计（2026-11-11）

## 0. 一句话

把升级三选一里的 **11 个人物/罗盘增益** 变成可跨局强化的「被动」：每局结束按表现结算**残响**，残响买被动等级；Boss 首杀与特殊成就点亮**契约图鉴**，决定被动等级上限并额外发残响。全程只强化已有被动，不新增符印、套装或格位。

## 1. 已定的约束（用户拍板）

| 项 | 选择 |
| --- | --- |
| 挂法 | **α 触发强化**：抽到该被动时，效果按局外等级额外加成；不改抽取权重、不改开局 |
| 双轨 | **里程碑（不花残响） + 残响（花在等级上）** |
| 范围 | **只强化被动**，不加新内容 |
| 烈度 | **温和**：全部满级后的总收益约等于局内 2~3 次三选一 |
| 里程碑 | **A + C**：7 个大 Boss 首杀 + 14 个小 Boss 首杀 + 3 个特殊成就（共 24 个） |

## 2. 现状与落点（改之前先看清）

- 被动本体在 `src/logic/progression.js:53-72`：`CHARACTER_BUFFS`(5) + `COMPASS_BUFFS`(6)，形态是 `buff(id, name, desc, update)`，`apply(target)` 直接改传入对象。
- 宝箱应用点：`src/scenes/BattleScene.js:1508-1531`（adapter → 写回 player 字段）。
- Boss 战利品应用点：`src/scenes/BattleScene.js:1785-1792`（直接改 `run.compassBuffs` 并 rebuildDerived）。
- 局内等级/经验：`src/logic/progression.js:7-47`（`expNeeded` / `levelStats` / `MAJOR_BOSS_LEVEL`），本设计**不动**。
- 结算：`BattleScene.die()` → `buildSummary()`（1879-1896）→ `GameOverScene`；通关走 `completeAct()`（1541-1578）→ 结局 → `GameOverScene{victory:true}`。
- **全仓库没有任何 localStorage / 存档层**，这是本次要新建的第一层。
- 标题页 `src/scenes/TitleScene.js` 只有 Enter 开始、H 帮助、点击开始 —— 需要加第三个入口。

## 3. 存档模型

键：`localStorage['sigilweave:meta:v1']`（单机、单档、自动保存；不做云同步）。

```json
{
  "v": 1,
  "resonance": 0,
  "levels": { "life": 0, "swift": 0, "magnet": 0, "tough": 0, "aegis": 0,
              "might": 0, "haste": 0, "chill": 0, "wide": 0, "chain": 0, "greed": 0 },
  "milestones": ["boss-1", "miniboss-1a"],
  "counters": { "runs": 0, "wins": 0, "quizWins": 0, "bestAct": 1, "bestKills": 0 },
  "updatedAt": 0
}
```

**读取纪律（sanitize）**：解析失败 / 非对象 / v 不符 → 返回全新档；`levels` 只保留已知 id 并夹到 `[0, 5]`；`milestones` 只保留已知 id 并去重；数值字段必须安全非负整数，否则回落默认。所有搬运都在 `src/logic/meta.js` 里做，UI 不直接碰 localStorage 字符串。

## 4. 十一条被动与五级数值

「基础」= 现在局内的量；「每级追加」= 每多一级、每次触发时多给的量；Lv5 时追加合计约为基础量的 4~5 成（这是「温和」的来源）。所有加成与现有上限共用同一个 cap，不会叠爆。

| id | 名称 | 线 | 基础效果 | 每级追加 | Lv5 追加合计 |
| --- | --- | --- | --- | --- | --- |
| life | 丰沛生命 | 人物 | 生命上限 +20，回 20 | +2 上限 / +2 回复 | +10 / +10 |
| swift | 轻盈步伐 | 人物 | 移速 ×1.08 | 移速再 ×(1+0.008L) | 再 +4% |
| magnet | 引晶之手 | 人物 | 拾取半径 +12 | +1.5 | +7.5 |
| tough | 坚韧余辉 | 人物 | 无敌 +0.15s | +0.02s | +0.1s |
| aegis | 庇护印记 | 人物 | 护盾上限 +10 | +1.5 | +7.5 |
| might | 强能刻度 | 罗盘 | 伤害倍率 +0.12（cap 1.6） | +0.015 | +0.075 |
| haste | 疾转轴心 | 罗盘 | 间隔 ×0.92（下限 0.55） | 再 ×(1-0.006L) | 再 ×0.97 |
| chill | 冷凝回路 | 罗盘 | 冷却 ×0.90（下限 0.55） | 再 ×(1-0.006L) | 再 ×0.97 |
| wide | 扩域环带 | 罗盘 | 命中范围 +6（cap +18） | +0.8 | +4 |
| chain | 延续之链 | 罗盘 | 连击窗口 ×1.25（cap 2） | +0.04 | +0.2 |
| greed | 求知棱镜 | 罗盘 | 经验倍率 +0.15（cap 1.6） | +0.02 | +0.1 |

**升级消耗（残响）**：Lv1 **10** / Lv2 **24** / Lv3 **48** / Lv4 **80** / Lv5 **120**（一条线满级 282，11 条全满 3102）。

**上限**：默认 **2 级**。`boss-3` 首杀 → 3 级；`boss-5` 首杀 → 4 级；`boss-7` 首杀 → 5 级。上限只由大 Boss 首杀决定，残响买不到。

**触发形态**：`buff.apply(target, level)`，`level=0` 时与现在完全一致（老测试零改动）。`level` 由 `metaLevel(save, buff.id)` 取得。

## 5. 残响结算

每局结束（死亡或通关）算一次，**死亡按 60% 折损**，`?quick=1` 再 ×0.5，`?stress=1` 不结算存档。

```
base = act × 8
     + floor(kills / 40)
     + 小Boss收据 × 2
     + 大Boss收据 × 6
     + 问答破局次数 × 4
     + (通关 ? 60 : 0)
resonance = round(base × (死亡 ? 0.6 : 1) × (quick ? 0.5 : 1))
```

参考值（待仿真校准）：第一幕阵亡 ≈ 6；第三幕阵亡 ≈ 31；七幕通关 ≈ 250。

**里程碑额外发放**（首杀一次性）：小 Boss **+8**、大 Boss **+25**、特殊成就 **+60 / +40 / +80**。

## 6. 里程碑（24 个）

| 类别 | 数量 | id | 效果 |
| --- | --- | --- | --- |
| 大 Boss 首杀 | 7 | `boss-1` … `boss-7` | +25 残响；`boss-3/5/7` 另解锁等级上限 3/4/5 |
| 小 Boss 首杀 | 14 | `miniboss-1a` … `miniboss-7b` | +8 残响，点亮图鉴 |
| 特殊成就 | 3 | `quiz-5` / `kills-300` / `clear` | +60 / +40 / +80 残响 |

- `quiz-5`：累计以问答破局解决 Boss ≥ 5 次（跨局累计，存 `counters.quizWins`）。
- `kills-300`：单局击杀 ≥ 300。
- `clear`：七幕尽解（`victory`）。

判定输入统一是 `runSummary`：`{ act, kills, quizWins, bosses: [{id, method, tier}], victory, quick }`。纯函数 `settleRun(save, summary)` 一次算出 `{ save, gained, newMilestones }`，场景只负责拿出 summary 和写回。

## 7. 界面

- **标题页**：底行补一句「B 残响祭坛」，按 B 或点右上角「祭坛」进入 `MetaScene`（不改现有 Enter/H 行为）。
- **MetaScene（480×270）** 两页，Tab / Q·E 切换：
  - 祭坛页：左列人物 5 条、右列罗盘 6 条；每条一行：名称、5 格等级点、Lv N→N+1 的效果差、消耗、锁定原因（如「需首杀幕三契约主」）。选中行在底部详情条显示完整描述与「升级」按钮（残响不足/已满级/被上限锁 → 按钮灰且给原因）。
  - 图鉴页：24 格 4×6，未点亮显示 `???`，已点亮显示 Boss 名与「首杀」标记；顶部显示已点亮数。
  - 顶部常驻：残响余额、被动等级上限、「重置存档」按钮（二次确认，清空本档）。
- **结算页 GameOverScene**：在现有数据行下加两行 ——「残响 +N」与「新契约：xxx / 无」。
- **战斗内文案**：宝箱与 Boss 提示带上meta 等级，例：`宝箱 · 丰沛生命（残响 3）：生命上限 +26`，让玩家当场看见局外成长。

## 8. 调试与验收钩子

- `?scene=meta` 直达祭坛（与现有 `?scene=battle` / `?scene=gameover` 同风格）。
- `window.__SIGILWEAVE_META__` = 存档快照 + 最近一次 `settleRun` 结果，供 Playwright 断言。
- `?resonance=999` 临时注入残响（只改内存，方便验收升级交互）。
- 验收脚本：进标题 → 按 B → 升一级 → 退出 → 结算一局 → 残响增加与图鉴点亮；另跑 `npm test` 与 `npm run build`。

## 9. 明确不做

- 不新增符印 / 辅助 / 铭文 / 誓约 / 套装 / 法阵格。
- 不改三选一奖励池权重，不改七幕 Boss 等级门槛，不改局内数值。
- 不做云存档、多档位、跨设备同步。
- 不动 `package.json`、`vite.config.js`、`index.html`（除必要的 scene 注册外，若注册在 `src/main.js` 则只改 main.js）。

## 10. 风险与对策

| 风险 | 对策 |
| --- | --- |
| 存档被手改/损坏，游戏开局崩 | `sanitizeMeta` 全字段兜底，坏档当新档，不抛异常 |
| 局外加成与局内 cap 冲突（例：might 叠到 1.6 以上） | 元加成走同一 cap，`Math.min` 封顶 |
| `?quick=1` 刷档 | 残响 ×0.5；`?stress=1` 完全不结算 |
| 老测试因 `apply(target)` 签名变化炸掉 | `level` 默认 0，行为与旧版逐字节一致 |
| 图鉴 24 格在小屏挤 | 4×6 网格 + 800 缩放下的像素字体，实机截图校 |

## 11. 验收标准

1. `npm test` 全绿，新增 `tests/meta.test.js` 覆盖：结算公式、折损、quick、升级消耗与上限、sanitize 坏档、里程碑去重与首杀、`applyPassive(level=0)` 与旧行为一致。
2. 宝箱与 Boss 战利品在局外等级 > 0 时确实多给，且 cap 生效。
3. 死亡与通关都能写档并给出「残响 +N」；刷新页面后进度还在。
4. `npm run build` 通过；真实浏览器（Edge/Chromium）跑通祭坛升级、图鉴点亮、结算回写，截图入 `docs/meta/`。
5. README 与 `docs/规则契约.md` 补一节「局外成长」。

## 12. 实现顺序（给计划用）

1. `src/logic/meta.js` + `src/data/meta.js`（纯逻辑 + 数值/文案唯一来源）+ 单测。
2. `progression.js` 的 `apply(target, level)` 扩展 + 单测回归。
3. `BattleScene` 接入（宝箱 1508 / Boss 1785 / 结算 die() 与 completeAct()）+ 头像文案。
4. `TitleScene` 入口 + `MetaScene` 两页 UI + `main.js` 注册。
5. `GameOverScene` 残响行。
6. 验收：单测、构建、真实浏览器截图、README/docs。
