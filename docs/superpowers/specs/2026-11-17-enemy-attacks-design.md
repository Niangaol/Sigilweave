# 敌人近战与远程重做（2026-11-17）

> 需求原文（2026-11-17）：「敌人的攻击也要改进 现在基本没有近战 增加近战 然后优化远程 现在的远程都是先锁定再发射激光,改为正常的远程发射逻辑,发射弹幕或者其他的召唤物,其中一些可以在空中存续较长时间」。
> 用户澄清：近战走「普通怪挥砍、精英/猎犬冲撞」混合；远程走「抬手动作 + 弹幕、不画瞄准线」；召唤物三类全要（滞空炮台、地面符文/地雷、追踪小召唤物）。

## 0. 现状

- 敌方「远程」= 蓄力时 `lockAim` 锁玩家快照，`drawTelegraph` 从敌人画红线到落点 + 双环，随后沿锁定方向发射直线弹；观感就是「先锁定再打激光」。
- 近战只有接触伤害；有动作的仅缝合尸魁践踏（stomp，26px）与铁砧暴君砸地（slam，46px）。其余怪走到脸上靠接触自毁结算。
- 敌方弹丸只有 `{x,y,vx,vy,damage,lifeMs}` 直线一种，同屏上限 64，绘制为 3×3 红点；没有召唤物、滞空、追踪。

## 1. 目标与非目标

目标：

1. 近战有真正的出手动作：前摇 → 扇形判定 → 命中/挥空都有表现；冲锋系保留冲撞作为近战手段。
2. 远程删除瞄准激光：抬手（身体闪光/抬臂）后，在发射瞬间朝玩家**当前位置**出弹，弹幕形状按敌种区分。
3. 引入三类可存续的召唤物：滞空炮台、地面延时符文、追踪小召唤物。
4. 保持纯逻辑可测：弹道/召唤/扇形判定放在无 Phaser 的模块里。

非目标：

- 不改 Boss 的 `boss.js` 弹幕模板与 `Boss.js`。
- 不改敌人移动/变体/护盾体系；仅在现有 behavior 上加攻击事件。
- 不新增美术图；召唤物用 Palette 硬边几何绘制。
- 不改 `package.json`、构建配置、入口文件；不新增依赖。

## 2. 攻击事件契约（纯逻辑 → 场景）

`stepBrain` 的返回值新增三个字段，旧字段（x/y/shots/stomp/charging/windup/guard）保持兼容：

```js
{
  shots: [{ x, y, vx, vy, damage, lifeMs, kind, radius?, homing?, turnRate? }],
  melee: { x, y, angle, arc, range, damage, kind } | null,
  summon: { kind, x, y, lifeMs, damage, intervalMs?, radius?, angle? } | null,
  ...
}
```

- `shots[].kind`：`bolt`（直线，默认）/ `orb`（较慢的大弹）/ `homing`（慢速追踪）。
- `melee.arc` 为**弧度制总张角**；`angle` 为朝向；判定用「距离 ≤ range + 玩家半径」且「与 angle 的夹角 ≤ arc/2」。
- `summon.kind`：`turret`（滞空炮台）/ `rune`（地面延时符文）。
- 所有数值必须有限；非法输入回退默认值，不抛错（沿用 `pushShot` 的防御口径）。

## 2.5 纯逻辑模块 API（`src/logic/hostile.js`）

所有函数零 Phaser、零 DOM、零 `Math.random`，非法输入回退默认值：

```js
export const HOSTILE_LIMITS = { shots: 96, summons: 20, turret: 12, rune: 8, homing: 16 };
export function leadAim(from, target, speed) // -> 单位方向 {x,y}，带一次线性提前量
export function makeShot(from, dir, spec) // -> 规范化 shot（kind/radius/homing/turnRate）
export function normalizeShot(spec)
export function stepHostileShots(list, { dtMs, player, world, maxShots })
  // -> { list, hits: [{damage,x,y,kind}], expired }
export function normalizeSummon(spec)
export function stepSummons(list, { dtMs, player, world, maxShots })
  // -> { list, shots, detonations: [{x,y,radius,damage}], expired }
export function arcHitTest(origin, angle, arc, range, point, pointRadius = 0) // -> bool
export function meleeHits(melee, player) // -> bool，arcHitTest 的封装
export function damageSummon(summon, amount) // -> 实扣生命；hp 归零置 alive=false
```

- `stepHostileShots`：bolt/orb 直线；homing 以 `turnRate` 转向玩家；命中判定 `dist < player.radius + shot.radius + 1`。
- `stepSummons`：turret 按 `intervalMs` 发射并重置计时；rune 引信归零产出 `detonations` 并移除；两者 `lifeMs` 归零即移除。
- 所有列表输出保持输入顺序，便于确定性测试。

## 3. 近战分配

普通怪（挥砍类，前摇 300~620ms，命中扇形 70°~170°）：

| 敌人 | 招式 | 距离 | 张角 | 前摇 | 冷却 |
| --- | --- | --- | --- | --- | --- |
| 骷髅 skeleton | 骨剑劈砍 | 30 | 100° | 420ms | 1800ms |
| 噬魂蝠 bat | 俯冲啄击 | 22 | 120° | 260ms | 1500ms |
| 腐尸 corpse | 撕咬 | 26 | 70° | 520ms | 2000ms |
| 符文蛛 rune_spider | 扑咬 | 24 | 80° | 300ms | 1400ms |
| 发条傀儡 clockwork_doll | 活塞拳 | 30 | 60° | 380ms | 1800ms |
| 怨灵 wraith | 爪击 | 30 | 110° | 400ms | 1900ms |
| 墨灵 ink_wisp | 墨溅 | 26 | 160° | 350ms | 2000ms |
| 纸页傀儡 page_golem | 重扫 | 36 | 150° | 620ms | 2400ms |
| 枷锁守卫 shackle_guard | 锁链横扫 | 40 | 160° | 550ms | 2200ms |
| 炉渣兽 slag_beast | 熔咬 | 30 | 90° | 480ms | 2100ms |

冲锋系（保留冲撞作为近战）：亡灵骑士 knight、石像鬼 stone_gargoyle、黄铜守卫 brass_warden、星屑骑士 stardust_knight、索引猎犬 index_hound。冲撞期接触伤害 ×2.5 的现有规则不变。
范围近战（已有事件）：缝合尸魁践踏、铁砧暴君砸地。

近战伤害取 `enemy.damage`（与接触伤害同源），不额外乘倍率；命中后玩家仍走 1400ms 无敌帧。

## 4. 远程重做

删除 `lockAim` + `drawTelegraph` 的红线与落点双环。改为：

1. 进入 `windup`（抬手）：敌人身体亮色闪一下、轻微后仰；**不画任何瞄准线**。
2. 抬手结束时才计算方向：`angle = atan2(player.y - self.y, player.x - self.x)`，按弹速做一次线性提前量（`leadAim`），然后生成弹幕。
3. 弹幕形状按敌种：

| 敌人 | 抬手 | 弹幕 |
| --- | --- | --- |
| 邪教徒 cultist | 600ms | 3 发扇形 0.32rad，慢速 85 |
| 晶枝树妖 crystal_dryad | 650ms | 5 发窄扇 0.40rad，92 |
| 虚空元素 void_elemental | 600ms | 2 发连射 + 每 3 次出 1 个追踪球 |
| 咒誓主教 oath_bishop | 550ms | 3 发快弹 150；每 2 轮召唤 1 个神圣炮台 |
| 判词幽灵 verdict_wraith | 700ms | 1 发高速长枪 160；每 3 轮放 1 个地面符文 |
| 天平裁决者 scale_arbiter | 850ms | 1 发重弹 ×1.6；每 2 轮放 1 个裁决符文 |
| 火星精 ember_imp | 400ms | 3 发扇形 0.30rad，120 |
| 晓色之影 dawn_shade | 650ms | 1 个追踪残影 |
| 蚀日祭司 eclipse_priest | 700ms | 8 向星环 + 每 2 轮召唤 1 个蚀日炮台 |
| 星屑骑士 stardust_knight | 冲锋后 300ms | 4 发正向扇形 0.5rad |

近战怪被拉到远处时仍只靠近，不补远程；远程怪被贴脸时优先后撤（沿用各自 retreat 距离），不改成近战。

## 5. 召唤物

用户追加确认：**召唤物可被玩家打掉**。

| 类型 | 存续 | 生命 | 行为 | 上限 |
| --- | --- | --- | --- | --- |
| 滞空炮台 turret | 5000ms | 12 | 悬停，每 1200ms 朝玩家当前位置发 1 发慢弹（伤害 = 召唤者 damage ×0.6） | 每个施法者同时 1 个；全场 12 |
| 地面符文 rune | 1200ms 引信 | 8 | 落地后 1.2s 爆炸：半径 44 内伤害 + 向外 6 发环形弹 | 每个施法者 1 个；全场 8 |
| 追踪小召唤物 homing | 4200ms | 6 | 慢速 46，转向速率 1.6rad/s，接触伤害 | 计入弹丸池，全场 16 |

### 5.1 可破坏规则

- 召唤物是**独立实体**，不进入 `this.enemies`（不给经验、碎片、掉落、尸爆种子），但会加入玩家法术的**索敌候选**：`BattleScene.combatTargets()` 返回 `enemies.concat(summons)`，只传给 `resolveSigilTrigger` 的 `enemies` 参数。
- 索敌要求字段：`id`（负数区间避免与敌人 id 冲突）、`x/y`、`alive`、`hp`、`radius`、`def.color`、`lastHitAmount`。命中反馈走现有 `onEnemyHit`；召唤物死亡时由场景统一 `onSummonDestroyed`（爆散 + 音效），不进 `collectDefeated`。
- 生命：炮台 12、符文 8、追踪体 6（吃等级/法术伤害，不乘敌种倍率）。
- 尸爆/星陨等 AOE 同样能打到召唤物（因为它们走同一份目标列表）。
- 召唤物在 Boss 通幕、玩家死亡、换幕时统一清空。
- 性能：弹丸上限 64 → **96**；召唤物 20；全部几何绘制，仍走单 graphics 批。

## 6. 表现与音效

- `EffectsLayer.slash(x, y, angle, range, arc, color)`：2px 硬边弧线 + 尖端白点，260ms；近战挥空也画。
- `EffectsLayer.summonPulse(x, y, kind, color)`：炮台出现时一圈菱形环；符文落地时画裂开的菱形。
- `Sfx` 新增 `enemyCast`（低音短促）、`meleeSwing`（噪声扫）、`summon`（两段上行）；全部带 45ms 节流。
- 敌人抬手时 `Enemy.drawCastPose`：身体染 `C.arcane` 20% + 头顶小菱形闪动；近战抬手额外画地面扇形提示（仅近战，不是激光）。

## 7. 文件写作用域

- 新增 `src/logic/hostile.js`（纯逻辑：弹道、追踪、召唤、扇形命中、提前量）
- 新增 `tests/hostile.test.js`
- `src/logic/enemy-ai.js` + `tests/enemy-ai.test.js`（抬手/弹幕/近战/召唤事件）
- `src/entities/Enemy.js`（转发 melee/summon、抬手姿态、删除瞄准线绘制）
- `src/scenes/BattleScene.js`（弹丸渲染、召唤物更新/绘制、近战结算、清场）
- `src/ui/EffectsLayer.js`、`src/audio/Sfx.js`、`tests/runtime-fx.test.js`
- `tests/battle-flow.test.js`（如需接线断言）
- 文档：本 spec、`docs/敌人攻击验收-2026-11-17.md`、`docs/内容规格表.md` §6、`docs/规则契约.md` §7.2、`docs/技术架构.md`

## 8. 测试

- `tests/hostile.test.js`：直线/追踪/召唤推进、提前量、扇形边界（正好在弧上/弧外）、非法输入、上限裁剪、确定性。
- `tests/enemy-ai.test.js`：远程不再锁快照（发射时位置变化会改变弹道）、每只远程弹数/形状、近战前摇→事件、冲锋系不产生 melee 事件、召唤节拍、非法 dt。
- `tests/runtime-fx.test.js`：slash/summonPulse 绘制次数与颜色预算。
- 全量命令：`npx vitest run --configLoader native --pool=threads --no-file-parallelism`。
- 仿真：`node scripts/density-sim.mjs` 对照清怪速度与弹丸峰值（门限 ±15%）。

## 9. 已知取舍

- 召唤物**可被击破**（2026-11-17 用户拍板后修改；spec 首发为「不可摧毁」）：炮台 hp12、符文 hp8，法术索敌走 `BattleScene.combatTargets()`（敌人 + 召唤物）；击破不给奖励，只爆散。玩家收益是走位 + 可以选择清场。
- 删除瞄准线后，远程威胁从「红线预告」变成「抬手+弹幕可读」；如果实机觉得太难，先调抬手时长与弹速，而不是把线加回来。
- Boss 弹幕不在本轮范围，仍保留其模板。


## 10. 验收与实现偏差（2026-11-17）

- 全量测试：**79 files / 1701 tests 全绿**（`npx vitest run --dir tests --configLoader native --pool=threads --no-file-parallelism`，13–15s）。`npm run build` 成功（104 modules，1,958.36 kB / gzip 568.5 kB，仅既有 chunk>1800 kB 警告）。
- 弹丸上限 64 → **96**（`HOSTILE_LIMITS.shots`）；density-sim 已改为 import 该常量，不再写死 64。
- 召唤物上限：全场 20 / 炮台 12 / 符文 8（跨列表）、同一 owner 同时 1 个；超出静默丢弃，不入列不出特效。炮台 damage 由 `enemy-ai` 折算一次 ×0.6，`hostile.js` 不隐式打折。
- 近战前摇**不冻结移动**：`stepBrain` 先跑行为再叠加 melee/summon 事件。冻结方案实测把 corpse 平均速度压到 0.413、page_golem guard 帧 88→38、slag stomp 4500→5480，已否决。
- 远程不锁快照：抬手只记时间，发射帧 `leadAim` 现算；`brain.aim` 仅 stardust_knight 冲锋方向保留。`Enemy.drawTelegraph` 删除，改为 `drawCastPose`（头顶括号 + 菱形闪动；仅近战额外画地面扇形）。
- 视觉修正（首轮截图后）：抬手弧光从整只怪方框改为肩线以上短括号；近战扇面加 `pxPoly` 淡红填充 + 每 5px 辐条 + 外沿亮边；召唤物新增 `summonAirG`（depth 1150）画在立绘上层；炮台偏移 `+14`、悬空高度 `-26`，符文视觉下移 5px。
- 密度对照（180s、5 seed、bolt；S=普通幕，D=高密度）：S1 137.4 / S2 300.8 / S3 329.2 / S4 359 / S5 386.2 / S6 319.4 / S7 331.4 / D5 552.4 / D7 462.6 击杀。1–5 幕与 D5 不顶 96；6/7 幕与 D7 在密集窗口触顶（S6/S7 约 10 发/180s，D7 约 114 发/180s 被静默丢弃），不破帧、不堆积；`overFrames` 最多 39（D7，仿真口径）。仿真不结算弹幕/近战/召唤物对玩家伤害（沿用旧口径）。
- 截图证据（`docs/素材加工/验收-攻击-*.png`，8 张）：近战前摇/挥砍、远程抬手/弹幕、炮台、符文、召唤物受击、追踪弹。实测骷髅 range 30 / arc 100°、邪教徒抬手 `aim=null` 且 3 发 bolt、炮台 hp12/damage3、符文引爆 6 环弹、召唤物 `applyDamage` 12→8 存活、`ERRORS []`。
- 验收记录：`docs/敌人攻击验收-2026-11-17.md`；数据表 `docs/内容规格表.md` §6.6；契约 `docs/规则契约.md` §7.2。
- 未做：Boss 弹幕、召唤物之间互相碰撞、召唤物的独立血条（现在只做受击闪白+击破爆散）。
