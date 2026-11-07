# 开场动画与幕间过渡 · 设计规格

> 日期 2026-11-07 ｜ 状态：已经用户逐节批准（剧情分镜 ✅ / 技术设计 ✅）
> 前置基础：`docs/过场动画.md` 的短过场系统（Cover→Swap→Freeze→Reveal，已真实浏览器验收）。
> 本规格只加不拆：现有 10 条短过场路径的行为一行不改。

## 一、需求与已确认决策

| 决策点 | 结论 |
| --- | --- |
| 开场形态 | 多镜头剧情开场，约 36 秒（20–60s 区间），全部程序化像素美术，不用视频/序列帧 |
| 开场位置 | 进游戏就播：Boot → StoryScene（开场）→ 标题页；每次刷新都播，可跳过 |
| 幕间形态 | 单镜头演出，每段约 5.8 秒（4–8s 区间），进入二/三幕时播；进入第一幕保持现有 1.5s 标题卡 |
| 剧情来源 | 基于现有世界观（星陨、三枚契约、契约主、被遗忘的炼金祭坛、最后的刻阵者），文案已经用户批准 |
| 音频 | WebAudio 程序化氛围配乐 + 现有合成音效，零外部素材 |
| 实现路线 | 方案 A：分镜纯数据 + 独立 StoryScene；幕间复用 CutsceneScene 加 `journey` 类型 |
| 无缝要求 | 不黑屏、不闪空帧、输入不穿透、可跳过；目标场景在覆盖层底下就绪并冻结，揭开才放行 |

## 二、剧情分镜（已批准）

### 开场（6 镜，总约 36s）

| # | id | 时长 | 画面 | 字幕 |
| --- | --- | --- | --- | --- |
| 1 | skyfall | 6000ms | 夜空星点闪烁，陨星划痕斜坠，镜头缓下摇，地平线浮出墓园剪影 | 星陨之年，天外的火在王庭熄灭。 |
| 2 | contracts | 6000ms | 三个小舞台依次亮起：墓碑、沉钟、王座，各有契约符环钉入点亮 | 三枚契约钉入大地，锁住三位不死的契约主。 |
| 3 | graveyard | 6000ms | 荒废墓园全景，雾带烛火，镜头缓推中央墓碑，碑面符环微光渐亮 | 墓园的碑石，记得第一个名字。 |
| 4 | altar | 7000ms | 俯视祭坛 4×4 刻格，主角剪影走近立定，刻线逐格亮起，脉流沿格线流动 | 而被遗忘的祭坛，等来了最后的刻阵者。 |
| 5 | awaken | 6000ms | 符环扩张旋转，八枚符文绕环点亮，浮尘上升，中央菱形核心耀亮 | 以脉流为笔，以法阵为刃——替沉默者，补完未竟的仪式。 |
| 6 | title | 5000ms | 符环收拢成一点，「共振法阵」标题浮现；结尾接 `playCutscene(kind:'boot')` 揭开标题页 | （无字幕，音乐收尾） |

镜头 5/6 的符环与 boot 过场符环同源（同一 `drawSeal`），视觉连续不断片。

### 幕间 journey（各 5840ms：cover 320 / hold 5200 / reveal 320）

| 触发 | 画面 | 字幕 | 角标 |
| --- | --- | --- | --- |
| 幕间 → 第二幕 | 横移长镜头：主角剪影走出墓碑群，雾带沼水渐起，远处教堂彩窗逐格亮灯、吊钟轻摆 | 潮声把祷词泡烂。第二枚契约，沉在钟下。 | 第贰幕 · 腐沼教堂 |
| 幕间 → 第三幕 | 教堂彩窗在身后暗灭，镜头上摇，星纹垂落、浮空碎星升起，王庭立柱与王座浮现 | 星纹垂落如审判。最后一位契约主，记得所有名字。 | 第叁幕 · 星陨王庭 |

## 三、架构

### 新增模块

| 模块 | 职责 | 关键约束 |
| --- | --- | --- |
| `src/data/story.js` | 开场分镜数组（id/ms/stage/subtitle/musicCue）、journey 配置、`buildOpeningTimeline()`、`shotAt(elapsed)` 纯函数 | 不依赖 Phaser/Window，Node 直接单测；数据 Object.freeze |
| `src/ui/story-art.js` | 每镜头一个纯绘制函数 + 两段 journey 长镜头；复用 cinematic-art 的 drawSeal/drawDust/三幕剪影 | 硬边色块、整数坐标、无渐变无滤镜；长线走 1px 矢量线；每帧 ≤700 条绘制指令；浮尘/星点固定种子预建，每帧不新建对象 |
| `src/scenes/StoryScene.js` | 全屏开场播放器：推进镜头、字幕淡入淡出、跳过、结尾接 boot 过场 | 150ms 宽限后任意键/点击跳过整段；发布 `window.__SIGILWEAVE_STORY__`；SHUTDOWN 停音乐 |
| `src/audio/CineMusic.js` | 程序化配乐：双正弦 detune 低音铺底 + 镜头 cue 稀疏钟声/琶音，主增益 ≤0.02 | 遵守 `isSoundEnabled()`；AudioContext 失败/suspended 静默降级；stop 带短淡出 |

### 改动现有文件

1. `src/scenes/BootScene.js` `create`：正常路径改 `this.scene.start('StoryScene')`；`cutscenesDisabled()`（`?cine=0`/`?stress=1`）或 `?scene=` 调试直达时保持原 `playCutscene(kind:'boot')` 路径。
2. `src/scenes/IntermissionScene.js` 出发处：`kind: 'act'` → `kind: 'journey'`（幕间出发只去二/三幕；LoadoutScene 的第一幕 `act` 卡不动）。
3. `src/data/cinematics.js`：`TIMELINES` 加 `journey: { coverMs:320, holdMs:5200, revealMs:320 }`；`buildCard('journey')` 返回 null。
4. `src/scenes/CutsceneScene.js`：hold 阶段 `kind==='journey'` 时调用 journey 绘制（演出时间 = `elapsed - coverMs`），角标幕名小字；盖场/换场/冻结/揭开/跳过看门狗机制不改。
5. `src/main.js`：场景列表在 CutsceneScene 之前插入 StoryScene（覆盖层仍排最后）。

### 数据流

```
BootScene.create
  ├─ cine=0 / stress=1 / ?scene= → playCutscene(boot) → TitleScene（原路径）
  └─ 正常 → StoryScene
              ├─ 每帧：shotAt(elapsed) → story-art[shot.stage](g, {t, w, h, …})
              ├─ 跳过（>150ms）→ 直接结尾
              └─ 结尾 → playCutscene(this, {kind:'boot', to:'TitleScene', payload:{__cine:true}})
                          → 标题页在覆盖层下 create+PAUSED → 揭开 resume

IntermissionScene 出发 → playCutscene(kind:'journey', act:2|3, to:'BattleScene')
  → cover 盖满 → stop 旧场景 / launch BattleScene → create 完成冻结
  → hold 5.2s journey 演出（战斗在底下 PAUSED）
  → reveal 揭开 resume（现有 ensureTargetRunning 看门狗兜底）
```

## 四、无缝衔接保证

1. 开场每镜满幅绘制，底色祭坛暗紫系，无纯黑帧；首镜与 Boot 的 `#0d0a17` 背景同色连续。
2. 开场→标题、幕间→战斗都走已验收的 Cover→Swap→Freeze→Reveal；目标未就绪不揭开，1500ms 兜底放行。
3. 转场期间输入只用于跳过；旧场景暂停仍渲染，目标场景冻结待命。
4. 跳过路径与正常路径同机制；跳过竞态由现有看门狗处理（journey 继承，开场结尾的 boot 过场继承）。
5. 竖屏（480×760）：舞台与字幕位置上移适配，沿用 `isPortrait()` 与现有过场布局策略。

## 五、音频

- 开场：StoryScene create 时 `CineMusic.start('opening')`；镜头切换按 musicCue 触发钟声/琶音；结尾与 SHUTDOWN 淡出。
- journey：hold 开始短氛围铺底，揭开时淡出；盖场/揭开仍播现有 `cineIn`/`cineReveal`。
- 浏览器限制：首屏无用户手势时 AudioContext suspended，开场静音播放，首次点击激活；不算缺陷，验收文档写明。
- 静音开关（现有 M 键/菜单）对配乐同样生效。

## 六、错误处理与性能

- 音乐任何异常静默降级，绝不抛 pageerror（沿用 Sfx 模式）。
- 分镜数据合法性（时长区间、舞台 id 存在、字幕非空）由单测拦截；运行期不加兜底分支。
- 每帧绘制指令 ≤700（计数 stub 单测锁定）；固定种子粒子预建；`update` 内不分配新对象。
- StoryScene 异常不影响可跳过性：输入监听独立于绘制逻辑。

## 七、调试开关

| 参数 | 行为 |
| --- | --- |
| `?cine=0` / `?stress=1` | 开场与全部过场关闭，Boot 直达标题（自动化/压测现状不变） |
| `?scene=battle` / `?scene=gameover` | 不播开场，保持现有调试直达 |
| `window.__SIGILWEAVE_STORY__` | 开场状态（shot/elapsed/skipped/phase），验收脚本断言用 |
| `window.__SIGILWEAVE_CUTSCENE__` | 现有过场状态，journey 沿用 |

## 八、测试与验收

### 单元测试（vitest）

- `tests/story-data.test.js`：分镜边界、总时长落在 20–60s、字幕非空、舞台 id 合法、journey 时长 4–8s。
- `tests/story-scene.test.js`：Phaser 最小替身跑状态机（镜头推进、跳过→boot 交接、SHUTDOWN 停乐、重复触发防护）。
- `tests/cine-music.test.js`：AudioContext 替身（start/stop/开关/异常降级）。
- 现有 `tests/cinematics.test.js` 扩充 journey；`tests/cutscene-scene.test.js` 扩充 journey 全流程与跳过。
- story-art 绘制预算计数测试（仿 spell-fx 模式）。

### 真实浏览器验收（硬性门槛）

- 新增 `scripts/story-shot.mjs`（仿 `scripts/cutscene-shot.mjs`）：真实 Edge，1920×1080 + 390×844 两档。
- 逐镜截图存 `docs/story/`；断言：开场→标题揭开瞬间 TitleScene 已 create；journey 期间 BattleScene `status===6(PAUSED)`、揭开后运行；跳过不软锁；0 pageerror。
- 结果写 `docs/story/verify.json`；验收记录追加到 `docs/过场动画.md` 或新 `docs/开场与幕间.md`。
- `npm test` 全绿 + `npm run build` 通过。

## 九、明确不做（YAGNI）

- 不做视频/序列帧/AI 生成素材；不做配音；不做多语言。
- 不做"仅首次播放"存档标记；不做标题页剧情回顾入口（用户选择每次进游戏都播）。
- 不改现有 10 条短过场的时长与文案；不重构换场状态机。
- 第一幕入场不重复演出（保持 act 标题卡）。