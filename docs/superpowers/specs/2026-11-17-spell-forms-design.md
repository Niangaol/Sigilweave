# 法术发放形式扩层：环绕 / 领域 / 强化（2026-11-17）

> 需求原文（2026-11-17）：「现在的法术都是发弹幕的形式 增加更多形式，比如生成一个飞剑环绕角色 给周围的怪加debuff 还有很多辅助的效果」。
> 用户澄清（ask_user_question）：① 踩中触发、持续 5~8 秒，不做常驻光环；② 三种形态全要（环绕体 / 领域 debuff / 自身强化）；③ 本轮不动辅助卡。
> 第二轮澄清：④ 同格重复触发「就当无事发生」——持续体还在时再踩，忽略本次生成、不刷新不叠加（格子冷却照常开始，踩早一脚就是白踩）；⑤ 环绕体**不挡**敌方弹幕，只负责输出与上状态；⑥ 领域 debuff 只做减速 / 易伤 / 眩晕。

## 0. 现状

- 24 张法术是同一套发放模型：法术格被踩中 → `signal:trigger` → `BattleScene` 的 `resolveVolley`/`fireProjectile` → 落地 `applySigil` → `effects.resolveSigilTrigger` **一次算完就返回**。引擎里没有「持续存在」这一层。
- 敌方有 `summons`（滞空炮台 / 地面符文）可借鉴结构，但归属是敌方阵营，玩家侧没有对应系统。
- 已有可复用的持续状态：`slowUntil/slowFactor`、`rootUntil`、`frozenUntil`、`vulnUntil/vulnFactor`、`stunUntil`、`shield`、`armor`。
- 已有身份层（变体 / 派系 / 进化 / 联组 / 前摇）全部以 `slot.defId` 为键，新法术自动可套。

## 1. 目标与非目标

目标：

1. 新增三种发放形式：**环绕体**（绕玩家转的飞剑/守卫）、**领域**（持续给范围内敌人上 debuff）、**自身强化**（给玩家挂限时 buff）。
2. 踩中触发，持续 5~8 秒后消失；格子冷却照常开始。
3. 与现有变体、派系共鸣/反应、进化、联组、前摇全部兼容。
4. 纯逻辑可测：环绕碰撞、领域 tick、buff 倍率都放在不依赖 Phaser 的模块里。

非目标：

- 不改现有 24 张法术的发放形式。
- 不做常驻光环（放上去永久生效）与固定炮台。
- 本轮不扩辅助卡（`AUX_DEFS` 保持 6 张）。
- 不改 `package.json`、构建配置、入口文件；不新增依赖。

反目标：环绕体变成「自动清屏」，玩家不用走位；领域把怪压得走不到脸上，战斗变挂机。数值必须让走位与站位仍然有意义。

## 2. 方案选择（对话中用户已选）

| 方案 | 内容 | 结论 |
| --- | --- | --- |
| A 只加新形态法术 | 8 张新法术走新形式，现有 24 张不动 | **选中** |
| B A + 进化可跨形态 | 进化路线让老法术变成新形态（寒霜箭→冰锥环绕） | 未选，留作下一轮 |
| C 常驻光环 | 放上罗盘永久生效 | 否决：拆掉「踩格触发」核心，联组失去意义 |

## 3. 数据契约

`src/data/cards.js` 的 `SIGIL_DEFS` 每条可选 `form`，缺省 `'bolt'`：

```js
// 环绕体
sword_orbit:   { name: '流光剑阵', damage: 4,  cdMul: 1.40, kind: 'persist', form: 'orbit',
                 count: 3, orbitRadius: 56, orbitSpeed: 1.6, duration: 6000, hitInterval: 350 }
// 领域
frost_bog:     { name: '寒霜沼泽', damage: 2,  cdMul: 1.40, kind: 'persist', form: 'aura',
                 radius: 80, duration: 5000, tickMs: 600, follow: true, effects: ['slow'] }
// 自身强化
battle_rage:   { name: '战意咆哮', cdMul: 1.30, kind: 'persist', form: 'buff',
                 duration: 6000, mods: { speedMul: 1.30, damageMul: 1.15 } }
```

- 持续型统一 `kind: 'persist'`，**不进** `resolveVolley` / `fireProjectile`；`VOLLEY_LIMITS` 补 `persist: 0`。
- `form` 是唯一分派字段：`bolt` 走现有链路，`orbit`/`aura`/`buff` 走新的持续链路。
- 前摇复用 `castMs`（可选），`pendingCasts` 到点后生成持续体，而不是结算一次伤害。
- **同格唯一**：每个持续体记录 `cellId`；生成前先查 `persistentAt(cellId)`，还有活跃体就直接返回（「当无事发生」，不刷新、不叠加）。格子冷却由引擎照常开始。
- **不拦截弹幕**：环绕体只做输出与施状态，不碰敌方 `hostileShots`。
- **领域锚点**：`follow: true` 的领域吸附在玩家身上；固定领域锚在 `resolveTarget` 的 `aim`（与弹丸落点同一语义），屏外空区时不生成落点、改为跟随玩家，避免领域画在镜头外。

八个新法术（派系 / 形式 / 核心设计点）：

| ID | 名称 | 派系 | 形式 | 设计点 |
| --- | --- | --- | --- | --- |
| sword_orbit | 流光剑阵 | arcane | orbit | 3 把飞剑高速环绕，单体伤害低、覆盖广，适合贴脸走位 |
| frost_sentinel | 冰晶守卫 | frost | orbit | 1 个大型冰晶慢速环绕，伤害高、带减速，像一面移动的盾 |
| storm_orb | 雷光游珠 | storm | orbit | 2 颗雷珠更快更远，命中 3 次后必定眩晕，节奏感强 |
| frost_bog | 寒霜沼泽 | frost | aura | 跟随玩家的霜环，持续减速 + 小额掉血，逼迫走位 |
| soul_corrosion | 蚀魂领域 | soul | aura | 固定在触发点，给敌人挂易伤，配合后续爆发 |
| thunder_ground | 雷引地脉 | storm | aura | 固定在触发点，每 1.2 秒落雷单点 + 短暂眩晕 |
| battle_rage | 战意咆哮 | wild | buff | 移速 +30%、伤害 +15%，与「快打快撤」联动 |
| guardian_blessing | 守护恩泽 | holy | buff | 每秒回盾、受伤 -15%，撑住被围的时刻 |

## 4. 逻辑层

| 文件 | 职责 | 测试 |
| --- | --- | --- |
| `src/data/spell-forms.js` | `FORMS`（id/name/desc/color）、`spellFormOf(defId)`、`formNameOf` | `tests/spell-forms.test.js` |
| `src/logic/orbital.js` | `createOrbital(defId, def, cellId, player, now)`、`stepOrbitals(list, ctx)`：推进角度、算位置、圆形碰撞、同敌 `hitInterval` 去重、寿命过期；命中经 `applyDamage`，伤害系数**每次命中实时算** `damageMultiplier(grid, cellId, state)`（含派系、誓约、变体、进化） | `tests/orbital.test.js` |
| `src/logic/aura.js` | `createAura(defId, def, cellId, anchor, now)`、`stepAuras(list, ctx)`：按 `tickMs` 结算，施加减速/易伤/眩晕，过期移除；伤害同样实时算 | `tests/aura.test.js` |
| `src/logic/player-buffs.js` | `applyBuff(state, def, now)`、`buffMulOf(state, key)`、`stepBuffs(state, now)`：同 id 刷新不叠加；**独立于罗盘的 `state.buffMul`**，键为 `damageMul / speedMul / damageTakenMul / shieldPerSec` | `tests/player-buffs.test.js` |
| `src/logic/effects.js` | 新增 `resolvePersistTrigger({defId, state, grid, cellId})`，返回生成描述（纯数据，不造实体） | 复用上述测试 |
| `src/logic/build.js` | 校验 `form` 合法值；持续型法术不允许出现 `projectile` 相关字段 | `tests/build.test.js` 补例 |

状态字段：环绕体 `{ id, defId, cellId, angle, orbitRadius, speed, until, hitCd: Map<enemyId, nextAt> }`；领域 `{ id, defId, cellId, anchor, follow, until, nextTick }`；玩家 buff `playerBuffs[id] = { until, mods }`。

玩家强化的三个决定（builder 定，写进实现）：`battle_rage` 的 `damageMul` 乘在 `damageMultiplier` 最后一步，作用于所有玩家来源伤害（含环绕/领域 tick 与联组 bonus）；`guardian_blessing` 每秒回 2 盾、上限 +20，受伤 ×0.85 走 `Player.takeDamage` 新增的 `damageTakenMul`（缺省 1，行为不变）；强化移速直接乘 `Player.speedMult`。

## 5. 场景与表现

- `BattleScene`：新增 `this.orbitals` / `this.auras` 与 `this.persistG`；`update` 里 `updatePersistents(dt)`；换幕/死亡/暂停清空；触发处按 `spellFormOf` 分派。
- 分派点必须在 `resolveVolley(...)` 的 `volley.targets.length` 早退**之前**（照 `ward`/`nova` 分支的位置），否则屏幕内没怪时强化与领域放不出来。`VOLLEY_LIMITS` 仍补 `persist: 0` 仅作文档口径，拦截靠分支本身。
- 前摇：`commitSigil` 里再按 `spellFormOf` 分派（`applySigil` 只服务一次性结算）；`telegraph` 的半径对环绕体用 `orbitRadius`、对领域用 `radius`。
- 命中表现：环绕命中走 `hitSpark` + 伤害数字，**同敌按 `hitInterval` 去重**，避免刷屏；领域 tick 用 `labelPopup` 显示状态词（减速/易伤/眩晕），每 tick 一次。
- 绘制：新建 `src/ui/orbital-fx.js`（飞剑/冰晶/雷珠本体，硬边像素）与 `src/ui/aura-fx.js`（地面环 + 波纹 + 落雷柱）；沿用 spell-fx v2 纪律（硬边、整数坐标、无渐变、确定性 hash）。**环绕体本体只由 `orbital-fx.js` 画一次**，`fifth.js` 的 `projectile` 通道只做 `cast`/`impact` 等瞬时帧，避免同一帧画两遍。
- `src/ui/Hud.js`：加一行玩家 buff 图标与剩余时间条。
- `src/ui/editor-ui.js` / `SigilBoard.js`：格子显示形态徽记（环绕=环上剑、领域=同心波纹、强化=上箭头），详情面板显示「形态 · 环绕」。

## 6. 表现层与 spell-fx 的兼容

`tests/spell-fx.test.js` 的六通道预算体系不绕过：8 张持续型进 `FX_DEF_IDS`，新建 `src/ui/spell-fx/spells/fifth.js` 提供 6 通道（`projectile` = 本体轮廓、`trail` = 极简、`cast` = 生成闪光、`impact` = 领域展开 / 强化光环炸开、`ward` / `link` = 环）。`EXPECTED` 24 → 32，24 张原有法术的几何签名不受影响。

硬约束两条：8 张新法术的 `silhouette` 与 `colors.body` 必须与现有 24 张两两不同（测试断言 `new Set(...).size === 32`），body 色要按派系色板挑，不能复用 `0xbfe8ff / 0x8fd8ff / 0xffd36b / 0xc4a6ff / 0xffe3a3 / 0x7f9a5e / 0xa88bd8 / 0x9fd8ff`。

## 7. 兼容与连带改动

- 变体：`VARIANT_DEFS` 由 `SIGIL_DEFS` 自动生成。`COMBO_LOCKED` 追加 `sword_orbit`、`thunder_ground` 后，这两张按现有规则只有 `base` 变体、不能联组；其余 6 张三变体、`harmon` 可联组。
- 派系：`SIGIL_FACTION` 补 8 张映射，共鸣与反应对持续型同样生效（环绕体命中吃共鸣倍率，领域 tick 也吃）。
- 进化：`EVOLUTIONS` 补 16 条（8 张 × 2），`mods` 新增 `count`、`durationMul`、`tickMul`、`radius`、`buffMul`；进化卡逻辑复用现有 45% 三选一。
- 联组：持续型法术有 `harmon` 变体即可联组，形状判定不变。
- 测试更新：`tests/new-sigils.test.js` 24 → 32；`tests/spell-fx.test.js` 24 → 32；`tests/volley.test.js` 补 `persist: 0`。

## 8. 验收

1. `npm test` 全绿、`npm run build` 通过。
2. 8 张新法术各有 8×8 字模、特效、数值、2 条进化、派系与变体。
3. 环绕体持续绕玩家转、命中不刷屏；领域 debuff 在敌人身上可见；强化有 HUD 倒计时。
4. 踩中触发一次即消失，冷却与现有法术一致；暂停 / 换幕 / 死亡时持续体正确清理。
5. 实机试玩：环绕体与领域的强度不盖过主动走位与手动放法。

## 9. 工作量

5 波、约 18 个任务：波 1 数据与逻辑（形态表、8 张数值、orbital/aura/buffs），波 2 场景接线与前摇，波 3 表现层（fifth.js / orbital-fx / aura-fx / HUD），波 4 身份层兼容（变体/派系/进化/联组/界面），波 5 测试与验收。
