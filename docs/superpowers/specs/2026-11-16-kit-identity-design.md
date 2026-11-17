# 开局三职业：本命被动与人物小配件（2026-11-16）

> 需求原文（2026-11-16）：「还有三个职业 区分度增大 然后人物形象上做出略有不同」。
> 澄清结论：区分度**联动现有被动机制**；外观走**像素小配件**，不新画立绘。

## 0. 结论先行

- 「三个职业」不是新建职业系统，而是已有的三套起手法术套装 `STARTING_KITS`（疾风 / 烈焰 / 壁垒）。
- 每套绑两条本命被动，开局按 0 级各套用一次；宝箱与罗盘抽到本命被动时权重 ×2，让职业路线顺着原有成长系统滚大。
- 人物共用同一张 `player_sheet.png`，只加披风、胸章、法杖尖端三种像素配件，按职业换色/换形。

## 1. 目标与非目标

目标：

1. 开局选套不再只差四张法术，属性倾向可感知。
2. 本命被动与既有 `CHARACTER_BUFFS` / `COMPASS_BUFFS` 共用同一套 `apply(target, level)` 实现，不写第二份数值。
3. 人物形象在 2× 像素缩放下可辨，1× 不破坏原立绘轮廓。

非目标：

- 不做独立职业树、不加主动职业技能、不改开局四张法术的构成。
- 不改 `package.json`、构建配置、入口文件；不新增依赖。
- 不新画 26 张职业立绘（复用现有 `player_sheet.png`）。

## 2. 数据契约

### 2.1 `STARTING_KITS`（`src/logic/run.js`）

| 套装 | id | role | affinity | 额外 |
| --- | --- | --- | --- | --- |
| 疾风 | `bolt` | 疾行游走 · 高机动、快触发 | `swift` + `haste` | — |
| 烈焰 | `flame` | 爆发连击 · 高伤害、长连击链 | `might` + `chain` | — |
| 壁垒 | `ward` | 坚壁续航 · 高护盾、长无敌 | `aegis` + `tough` | `startShield: 10` |

`getKit(id)` 对未知 id 回退 `bolt`，不抛错。

### 2.2 统一适配器

`baseKitStats()` 输出宝箱/罗盘同款字段：

```
maxHp hp speed pickupRadius iframeBonus shieldCap
damageMul intervalMul cooldownMul hitBonus comboWindowMul expMul
```

`applyAffinity(kit)` 按 affinity 顺序调用 `buff.apply(stats, 0)`。

转换为 `run.characterStats`：

| 适配器 | run.characterStats |
| --- | --- |
| `maxHp` / `hp` | 同名 |
| `speed` | `speedMult = speed / PLAYER.speed` |
| `pickupRadius` | `pickupBonus = pickupRadius - 38` |
| `iframeBonus` | `iframesBonus` |
| `shieldCap` | `shieldCap` |
| — | `shield = kit.startShield ?? 0` |

转换为 `run.compassBuffs`：`damageMul / intervalMul / cooldownMul / hitBonus / comboWindowMul / expMul` 同名直传。

`createRun` 额外写入 `kitId` 与 `kitAffinity`（拷贝数组），战斗场景只读，不改 kit 对象。

### 2.3 本命被动实际数值

| 被动 | 类型 | 0 级效果 | 来源 |
| --- | --- | --- | --- |
| 轻盈步伐 `swift` | 人物 | speed ×1.08 | `CHARACTER_BUFFS` |
| 疾转轴心 `haste` | 罗盘 | intervalMul ×0.92 | `COMPASS_BUFFS` |
| 强能刻度 `might` | 罗盘 | damageMul ×1.12 | `COMPASS_BUFFS` |
| 延续之链 `chain` | 罗盘 | comboWindowMul ×1.25 | `COMPASS_BUFFS` |
| 庇护印记 `aegis` | 人物 | shieldCap +10（40 → 50） | `CHARACTER_BUFFS` |
| 坚韧余辉 `tough` | 人物 | iframeBonus +0.15 | `CHARACTER_BUFFS` |

### 2.4 加权抽取

`rollBuffWeighted(pool, rng, affinity = [], weight = 2)`（`src/logic/progression.js`）：

- 只消费一个 rng 值；命中 `affinity` 的条目权重 ×`weight`，其余为 1。
- 空池、非有限 rng、总权重 ≤0 返回 `null`；`weight` 非法时按 1 处理。
- 宝箱（`BattleScene` 人物增益）与罗盘事件两处调用，传 `this.run.kitAffinity`。
- `rollBuff` 保持原样，供不关心职业的旧调用点使用。

## 3. 外观

`src/ui/kit-style.js`：

| kit | accent | accentLight | cape | capeDark | emblem |
| --- | --- | --- | --- | --- | --- |
| bolt | `C.teal` | `C.runeCold` | `0x2f6f6c` | `0x1f4a48` | `wing` |
| flame | `C.arcane` | `C.arcaneLight` | `0x8a2f28` | `0x5a1f1c` | `ember` |
| ward | `C.brassLight` | `C.parchment` | `0x7a621f` | `0x4f3f12` | `ward` |

`kitStyle(kitId)` 对未知 id 返回 `null`，人物保持原样。

`Player.drawKitAccents(x, staffX, staffTipY, chestY)`：

- 披风：`backX = facing > 0 ? x - 5 : x + 3`；2×4 cape + 2×2 capeDark + 1×2 accent 收尾；`walkPhase / 160` 做 1px 摆动。
- 胸章：3×3，按 `emblem` 画翼 / 余烬 / 盾三种形状。
- 法杖尖端：sprite 路径与程序化路径都用 `accentLight ?? C.teal`，两侧各一个 accent 光点。
- 披风刻意与身体边缘重叠 2px，避免变成浮空色块；所有绘制走 Palette 硬边工具，无渐变。

## 4. 选套界面

- 卡面新增 `kit.role`（y+37，7px；选中时 `brassLight`）。
- 底栏从操作提示改为常驻「本命 {被动中文名} · 连接」，选中态靠边框、顶条、名字变色区分。
- 被动中文名来自 `CHARACTER_BUFFS` / `COMPASS_BUFFS` 的 `name`，不另建文案表。

## 5. 调试入口

`BattleScene.create` 读 `?kit=`：`createRun(seed, params.get('kit') ?? undefined)`。
示例：`http://localhost:5173/?scene=battle&kit=flame`。未知值回退 `bolt`。

## 6. 文件写作用域

- `src/logic/run.js`
- `src/logic/progression.js`
- `src/scenes/BattleScene.js`（仅 createRun 参数与两处抽取调用）
- `src/scenes/LoadoutScene.js`
- `src/entities/Player.js`
- `src/ui/kit-style.js`（新）
- `tests/run.test.js`、`tests/progression.test.js`、`tests/player-kits.test.js`（新）
- 文档：本 spec、`docs/职业区分验收-2026-11-16.md`、`docs/内容规格表.md`、`docs/规则契约.md`、`docs/技术架构.md`

## 7. 测试

| 文件 | 用例 | 覆盖 |
| --- | --- | --- |
| `tests/run.test.js` | 13（新增 5） | affinity 映射、三套倍率、非法 kit 回退 |
| `tests/progression.test.js` | 90（新增 3） | 加权边界、非法参数、单次 rng |
| `tests/player-kits.test.js` | 4（新） | 披风/尖端换色、位置、无 kit 不炸 |

全量：73 files / 1493 tests 全绿（`npx vitest run --configLoader native --pool=threads --no-file-parallelism`）。

## 8. 已知边界

- 本命加权只影响**抽取概率**，不保证一局内一定抽到；这是「路线倾向」而非「保底 build」。
- 同一被动重复获得仍走原有叠层逻辑，没有额外上限改动。
- 外观只做配色与 3×3 胸章，1× 缩放下主要靠披风色块辨认。
