# 敌人变体 + 一次性护盾 + AI 差异化（设计契约）

> 状态：已批准（2026-11-16）。本文件是并行实施的**唯一契约来源**；实现细节以本文件为准，计划正文见会话记录。
> 纪律：不新增依赖、不改 `package.json` / 构建配置 / 入口文件、不提交 git、不新画变体立绘。

## 1. 已拍板决策

1. 变体视觉：混合方案——3 张通用配件图（盾/肩甲/王冠）叠加在现有立绘上，代码生成纹理，可被同名美术 PNG 覆盖。
2. 护甲（原「护盾」）：一次性吸收伤害；破甲硬直 0.4s + 碎片爆散；不回复；不引入元素抗性。2026-11-16 验收后按用户决定把「铁甲」「持盾」合并为「重甲」（生命×1.6 + 0.6×生命护甲，肩甲+盾双配件），变体从 4 种收敛为 3 种。
3. AI：拆同质行为 + 每只怪独立节拍；保留 brain 字段语义，新增参数化行为函数，不做全量重写。
4. 执行：智能体团队并行，写作用域按文件互斥。

## 2. 变体数据（`src/data/enemy-variants.js` 新建）

```js
export const ENEMY_VARIANTS = {
  swift:  { id:'swift',  name:'疾行', prefix:'疾行', hpMul:0.85, speedMul:1.35, damageMul:1,
            scale:0.90, radiusMul:0.95, shardsAdd:0, cost:1, minChapter:1,
            tint:null, parts:[],               shieldHpMul:0 },
  heavy:  { id:'heavy',  name:'重甲', prefix:'重甲', hpMul:1.60, speedMul:0.82, damageMul:1.10,
            scale:1.10, radiusMul:1.06, shardsAdd:3, cost:2, minChapter:2,
            tint:null, parts:['pauldron','shield'], shieldHpMul:0.60 },
  elite:  { id:'elite',  name:'精英', prefix:'精英', hpMul:2.20, speedMul:0.95, damageMul:1.35,
            scale:1.30, radiusMul:1.18, shardsAdd:3, cost:2, minChapter:2,
            tint:null, parts:['crown'],        shieldHpMul:0, elite:true },
};

export const CHAPTER_VARIANT_WEIGHTS = {
  1: { normal: 0.94, swift: 0.06 },
  2: { normal: 0.84, swift: 0.07, heavy: 0.07, elite: 0.02 },
  3: { normal: 0.77, swift: 0.07, heavy: 0.13, elite: 0.03 },
  4: { normal: 0.72, swift: 0.06, heavy: 0.17, elite: 0.05 },
  5: { normal: 0.67, swift: 0.06, heavy: 0.20, elite: 0.07 },
};
```

纯函数（全部无 Phaser、无 `Math.random`，不修改入参）：

```js
// roll ∈ [0,1)。baseDef.elite 为真 → null；非法 chapter / 缺表 / 非法 roll → null。
// 按 normal→swift→heavy→elite 的声明顺序累加；命中变体 minChapter > chapter → null。
export function pickEnemyVariant(chapter, baseDef, roll)

// variant 可为 null；返回新对象：
// { ...base, id: base.id, baseId: base.id, name: variant ? variant.prefix+base.name : base.name,
//   hpMul: (base.hpMul??1)*(variant?.hpMul??1),
//   speedMul: (base.speedMul??1)*(variant?.speedMul??1),
//   damage: Math.max(1, Math.round((base.damage??1)*(variant?.damageMul??1))),
//   shards: (base.shards??1)+(variant?.shardsAdd??0),
//   radius: Math.max(3, Math.round((base.radius??6)*(variant?.radiusMul??1))),
//   elite: base.elite || variant?.elite || undefined,
//   variant: variant ?? null }
export function composeEnemyDef(baseDef, variant)
```

## 3. 护盾结算（`src/logic/effects.js` `applyDamage`）

顺序固定「盾 → 甲 → 血」：

```js
let remaining = amount, blocked = 0;
const shield = Number.isFinite(enemy.shield) ? Math.max(0, enemy.shield) : 0;
if (shield > 0) {
  blocked = Math.min(shield, remaining);
  enemy.shield = shield - blocked;
  remaining -= blocked;
  if (enemy.shield <= 0) enemy.shieldBrokenPending = true;
}
enemy.lastBlocked = blocked;
const armor = clamp(enemy.armor ?? 0, 0, 1);
const real = Math.min(Math.max(0, enemy.hp), remaining * (1 - armor));
enemy.hp -= real;
enemy.lastHitAmount = real;
if (enemy.hp <= 0) enemy.alive = false;
return real; // 返回值只统计扣血伤害
```

- 缺省/非有限/≤0 的 `shield` 必须完全走旧路径（旧测试逐字节不变）。
- 不额外掉碎片；尸爆走同一入口，会被盾吸收（有意，写文档）。
- 破盾只置 `shieldBrokenPending`，眩晕由 `Enemy.update` 消费。

## 4. 刷怪接入（`src/logic/spawn.js` + `src/scenes/BattleScene.js`）

```js
// spawn.js 新增纯函数
export function enemySpawnLoad(list) {
  let n = 0;
  for (const e of list ?? []) {
    if (!e || e.alive === false) continue;
    n += e.def?.variant?.cost ?? (e.def?.elite ? 2 : 1);
  }
  return n;
}
```

- `spawnEnemy`：落点 → `pickEnemyType(this.chapter, combatRng.next())` → `base.elite ? null : pickEnemyVariant(this.chapter, base, combatRng.next())` → `composeEnemyDef` → 现有 hp/speed/damage 公式与 `new Enemy(...)` 不变；返回该 Enemy。
- `updateSpawner`：`room = dif.maxAlive - enemySpawnLoad(this.enemies)`；`room <= 0` 停手 160ms。
- `spawnWave`：每个落点前检查 `enemySpawnLoad < dif.maxAlive`；已刷 ≥1 只后超载即 break。
- 掉落（约 BattleScene.js:1693-1696）：`drop = (def.elite ? 4 : 1) + (def.variant?.shardsAdd ?? 0)`；掉率门槛不变；`def.shards` 仍不消费。
- 经验（约 :1673）：`def.elite ? 6 : 1` 不变。
- 破盾回调 `onEnemyShieldBreak(enemy)`：`effects.shieldBreak(x,y)` + `sfx.shieldBreak()` + ≤2px/120ms 轻震屏。
- `?stress=1` 复用 `spawnEnemy`，自动继承变体。

## 5. AI（`src/logic/enemy-ai.js`）

### 5.1 架构

- `AI_PROFILE`：26 个 defId → `{ behavior, tune }`，behavior 名全局唯一。
- `createBrain`：写 `brain.behavior`、`brain.tune`，按 behavior 初始化既有字段（`attackIn/windupLeft/chargeLeft/pauseLeft/aim/blinkIn/stompIn/chargeIn` 等）；**保留既有字段语义**（测试读 `brain.mode`、`brain.chargeIn`）。
- `stepBrain`：`STEP_BY_BEHAVIOR[brain.behavior] ?? stepMarch`，ctx 带 `tune`。
- 旧规则常量（`KNIGHT_RULE` 等）继续导出；既有 10 个行为 tune 等于旧常量，`stepXxx` 用 `ctx.tune ?? XXX_RULE`，数值零漂移。
- `KNOWN_DEFS = new Set(Object.keys(AI_PROFILE))`；非法 defId 回退 `skeleton`。
- `makeResult` 增加第 6 参 `guard = false`，返回 `{x,y,shots,stomp,charging,windup,guard}`。
- 所有随机走 `nextRandom(brain)`；新增行为不得产生 NaN/越界；单次事件弹数 ≤4。

### 5.2 behavior 对照

| defId | behavior | tune 要点 |
|---|---|---|
| skeleton | march | 基线 |
| corpse | lurch | walkMs 520 / holdMs 260 / triggerDist 40 / windupMs 450 / lungeMs 320 / lungeMul 1.5 / recoverMs 800 |
| clockwork_doll | spring | walkMs 700 / windupMs 420 / dashMs 600 / dashMul 1.9 / recoverMs 500（charging 必须 false） |
| page_golem | bulwark | approachMul 0.85 / guardEveryMs 3000 / guardMs 900 / guardArmor 0.55 / guardSlowMul 0.4 |
| slag_beast | eruption | triggerDist 64 / intervalMs 3800 / windupMs 700 / stompRadius 40 / stompDamageMul 1.6 / cooldownMs 1400 |
| shackle_guard | chain | holdDist 110 / retreatDist 80 / intervalMs 3200 / windupMs 1000 / shots 2 / gapMs 110 / shotSpeed 120 / shotLifeMs 1600 / damageMul 1.1 |
| bat | weave | amplitude 14 / periodMs 900（原样） |
| rune_spider | skitter | straightMs 380 / lateralMs 160 / straightMul 1.7 / lateralMul 1.3 / lateralDist 40 |
| wraith | stalk | holdDist 120 / orbitMul 0.5 / intervalMs 3000 / windupMs 500 / dashMs 550 / dashMul 2.1 / recoverMs 900 |
| ink_wisp | drift | approachMul 0.7 / blinkEveryMs 1600 / blinkMin 40 / blinkMax 60 / minPlayerDist 26 |
| verdict_wraith | lance | holdDist 130 / retreatDist 96 / intervalMs 3000 / windupMs 750 / shotSpeed 140 / shotLifeMs 1100 / damageMul 1.4 |
| dawn_shade | mirror | holdDist 90 / dashMs 420 / dashMul 1.7 / cooldownMs 2000 |
| ember_imp | dart | sprintMs 280 / sprintMul 2.0 / pauseMs 260 |
| knight | charge | intervalMs 2600 / windupMs 600 / chargeMs 1200 / chargeSpeedMul 3.2（原样） |
| stone_gargoyle | slam_charge | intervalMs 3400 / windupMs 900 / chargeMs 900 / chargeMul 2.6 / staggerMs 500 |
| brass_warden | double_charge | intervalMs 3000 / windupMs 650 / chargeMs 800 / chargeMul 2.4 / pauseMs 320 / secondChargeMs 700 / secondMul 2.4 / cooldownMs 2400 |
| stardust_knight | charge_volley | intervalMs 3000 / windupMs 650 / chargeMs 1000 / chargeMul 2.9 / shots 4 / shotSpeed 76 / shotLifeMs 2000 / damageMul 1.2 / cooldownMs 2600 |
| cultist / crystal_dryad / void_elemental / stitch_abomination / oath_bishop / index_hound / scale_arbiter / anvil_tyrant / eclipse_priest | orbit / volley / phase / stomp / blink_caster / lunge / judge / slam / eclipse | 行为与数值保持原样 |

- 新增 step：`stepLurch / stepSpring / stepBulwark / stepEruption / stepChain / stepSkitter / stepStalk / stepDrift / stepLance / stepMirror / stepDart / stepSlamCharge / stepDoubleCharge / stepChargeVolley`，并把 `stepBat` 重命名为 `stepWeave`（导出可保留别名）。
- 共享工具：`approach / holdBand / lockAim / pushShot / beginWindup / beginDash`。
- 新 brain 字段只允许：`chain`（整数）、`lastPlayer`（{x,y}）。

### 5.3 roster 同步

`src/data/roster.js` 只改 14 个 def 的 `behavior` 字符串：corpse→lurch、clockwork_doll→spring、page_golem→bulwark、slag_beast→eruption、shackle_guard→chain、rune_spider→skitter、wraith→stalk、ink_wisp→drift、verdict_wraith→lance、ember_imp→dart、dawn_shade→mirror、stone_gargoyle→slam_charge、brass_warden→double_charge、stardust_knight→charge_volley。数值/权重/id 一律不动。

## 6. 视觉（`src/ui/variant-parts.js` 新建 + `Enemy.js`）

- 纹理：`var_shield` 16×16、`var_pauldron` 16×12、`var_crown` 16×10；`ensureVariantTextures(scene)` 幂等（`textures.exists` 跳过），Palette 硬边像素，无渐变/无 Math.random；已有同名美术 PNG 时优先使用。
- `BootScene.create()` 调 `ensureVariantTextures(this)`。
- Enemy 构造：
  - `variantId = def.variant?.id ?? null`
  - `tintColor = def.variant?.tint ?? style?.tint ?? null`，受击闪白后恢复 `tintColor`
  - `baseScale = (style?.scale ?? 1) * (def.variant?.scale ?? 1)`
  - `shieldMax = Math.max(0, Math.round(hp * (def.variant?.shieldHpMul ?? 0)))`；`shield = shieldMax`
  - `parts`：按 `def.variant?.parts` 逐个创建 image（重甲 = 肩甲 + 盾两件），depth `floor(y)+0.2`，每帧跟随位置/缩放/朝向；无精灵时按 `radius+12` 估身体高。`part` / `partKind` 保留为第一件的兼容别名。
- 破甲：`Enemy.update` 开头消费 `shieldBrokenPending` → `stunUntil = now+400`、隐藏全部配件、`scene.onEnemyShieldBreak?.(this)` 一次；眩晕内跳过 `stepBrain`、`windup/charging/guard=false`、`damage=baseDamage`。
- `guard`：`applyResult` 置 `this.guard`、`this.armor = guard ? 0.55 : 0`。
- 绘制：`shield > 0` 时血条上方 3px 画 11×1 青钢护甲条；破甲 160ms 白闪；眩晕头顶 3 个菱形；`destroy()` 释放全部 parts。
- `lastBlocked > 0`：不扣血播 hitSpark（青钢）+ `sfx.shieldHit()`。

## 7. 特效音效

- `EffectsLayer.shieldBreak(x,y)`：8~12 次绘制，≤420ms，复用 pxDiamond/pxRing/burst 语言。
- `Sfx.shieldHit()`：160Hz/30ms/gain ≤0.02/45ms 节流；`Sfx.shieldBreak()`：≤180ms/gain ≤0.03。

## 8. 测试与命令

```bash
npx vitest run --configLoader native --pool=threads --no-file-parallelism
```

基线：72 files / 1481 tests 全绿（重甲合并后）。新增测试文件：

- `tests/enemy-variants.test.js`：变体表/权重/门槛/累积命中/边界、compose 不改入参、enemySpawnLoad。
- `tests/shield-effects.test.js`：部分吸收/溢出/盾+甲/缺省不变/死后返回 0/尸爆吃盾。
- `tests/enemy-variant-entity.test.js`：shield 初始化、guard→armor、破盾眩晕与回调一次、destroy 释放 part、draw 调用 ≤30。
- `tests/runtime-fx.test.js`：补 shieldBreak 绘制断言。
- `tests/enemy-variant-entity.test.js`：重甲双配件（肩甲+盾）就位、按体型放大、破甲后两件一起隐藏。
- `tests/enemy-ai.test.js`：腐尸断言改为 lurch 节拍（平均位移 0.45~0.6 倍），新增 14 条逐行为节拍用例，behavior 唯一性断言。
- `tests/battle-flow.test.js`：合成 def 后 `def.id` 仍是基础 id 且 `variant` 结构存在。

## 9. 文件写作用域（并行互斥）

| 任务 | 文件 |
|---|---|
| T1 | `src/data/enemy-variants.js`, `tests/enemy-variants.test.js` |
| T2 | `src/logic/effects.js`, `tests/shield-effects.test.js` |
| T3 | `src/entities/Enemy.js`, `src/ui/variant-parts.js`, `src/scenes/BootScene.js`, `tests/enemy-variant-entity.test.js` |
| T4 | `src/ui/EffectsLayer.js`, `src/audio/Sfx.js`, `tests/runtime-fx.test.js` |
| T5 | `src/logic/enemy-ai.js`, `src/data/roster.js`, `tests/enemy-ai.test.js` |
| T6 | `src/scenes/BattleScene.js`, `src/logic/spawn.js`, `tests/battle-flow.test.js` |
| T7 | `docs/**` |
| T8 | `scripts/density-sim.mjs`, `scripts/sprites-shot.mjs` |

## 10. 验收

- 全量测试绿；新增/更新断言覆盖第 2~7 节全部契约。
- density-sim 清怪速度（口径固定为全局 **kills/min**）相对基线 ±15%；同屏稳态下降 ≤15%；弹丸峰值 ≤64。单只/单波清怪中位时长是副作用观测项，不作为门槛（变体更肉必然变长，本次 +8.6%~+19.8%，验收文档已披露）。
- 浏览器视觉验收由用户 `npm run dev` 手跑：第 1 幕疾行、第 2 幕起重甲+破甲、第 5 幕精英兼天生精英、60+ 同屏无叠图。2026-11-16 验收截图见 `docs/敌人变体验收-2026-11-16.md` 与 `docs/素材加工/验收-变体-*.png`。
