# 结局演出与过场大胆化 · 设计规格

> 日期 2026-11-08 ｜ 状态：已经用户批准（范围 ✅ / 结局形态 ✅ / 视觉尺度 ✅），已实现并真实浏览器验收。
> 前置基础：`docs/过场动画.md` 的短过场系统（Cover→Swap→Freeze→Reveal）与 `docs/开场与幕间.md` 的开场/幕间 journey（均已验收）。
> 本规格只加不拆：换场状态机一行不改；开场六镜与两段 journey 内容一行不改。

## 一、需求与已确认决策

游戏已有开场与关卡过渡，缺口是「真正的结局演出」与「过场视觉偏保守」。用户三项决策：

| 决策点 | 结论 |
| --- | --- |
| 范围 | 保留无缝换场机制与开场骨架；新增结局演出；短过场全面大胆化 |
| 结局形态 | 剧情尾声（3 镜）+ 制作名单滚动，共 32s，可跳过；复用分镜播放器与程序化配乐；最后落到现有胜利结算面板 |
| 视觉尺度 | 像素硬边内大胆：无渐变/模糊/Math.random；运镜冲击、全屏符阵爆发、碎裂擦除、超大动态排版、幕色闪洪、加性混合硬边辉光。**短过场时长不变**（900–1600ms），大胆 ≠ 更长 |

## 二、结局分镜（StoryScene ending 模式，4 镜总 32000ms）

| # | id | 时长 | 画面 | 字幕 / cue |
| --- | --- | --- | --- | --- |
| 1 | release | 7000ms | 与开场「三契钉入」同一组圣物（墓碑/沉钟/王座），三枚符环依次碎裂，圣物逐次暗成墨色 | 三枚契约主，归于沉默。/ bell |
| 2 | quiet | 7000ms | 祭坛 4×4 刻格逆向逐格熄灭，脉流断绝，刻阵者立定，魂火 gutter 后熄灭 | 共振法阵第一次，安静下来。/ hush |
| 3 | dawn | 8000ms | 星点淡出、陨星停息，硬边黄铜黎明色带叠层升起，低日浮出地平线；「契约终结」标题淡入 | 星陨平息。黎明落在无人记得的碑上。/ arp |
| 4 | credits | 10000ms | 夜空星点 + 一圈暗符环缓转，名单三行硬边带状滚动 | （无字幕）/ finale |

名单内容（不署个人名）：`共 振 法 阵` → `设计 · 程序 · 像素美术 · 程序化音乐` → `感谢每一位刻阵者`。后续如需署名，替换 `ENDING_SHOTS` credits 数组一行即可。

## 三、架构

### 数据流

```
BattleScene.completeAct() 第三幕分支
  ├─ cutscenesDisabled()（?cine=0 / ?stress=1）→ scene.start('GameOverScene', 去__cine的胜利payload)（不播结局）
  └─ 正常 → playCutscene(kind:'victory', to:'StoryScene', payload:{mode:'ending', stats:胜利payload, __cine:true})
              → 胜利卡 1600ms（编舞版）→ StoryScene(ending) 在覆盖层下 create+PAUSED
              → 揭开 → 32s 结局四镜 → finish()
              → playCutscene(kind:'boot', to:'GameOverScene', payload:stats 原样)
              → 结算面板在覆盖层下 create+PAUSED → 揭开 resume（胜利面板不变）
```

胜利 payload 与改动前完全一致（buildSummary + totals + victory + bossResolutions + __cine），两跳原样透传，结算面板零改动。

### 新增 / 改动模块

| 模块 | 职责 | 关键约束 |
| --- | --- | --- |
| `src/data/story.js` | 加 `ENDING_SHOTS`、`buildEndingTimeline()`、`STORY_MODES`（music/publishKey/handoff） | 纯数据冻结，Node 单测 |
| `src/scenes/StoryScene.js` | 参数化为双模式播放器：`init(data)` 读 mode/stats；结局推迟配乐到首次 update；名单 Text 滚动；handoff 按 mode | 无参开场路径行为不变；发布键 ending 用 `__SIGILWEAVE_ENDING__` |
| `src/ui/story-art.js` | 加 `ENDING_STAGES`（release/quiet/dawn/credits）；提取 `drawContractRelic` 与开场共用 | 每帧 ≤700 指令；竖屏布局避让字幕 |
| `src/ui/cutscene-choreo.js`（新） | `createChoreo(kind, act)` → 每类视觉编舞；journey 返回 null | 状态机无关；四层合计最坏帧 ≤700；种子确定 |
| `src/ui/cinematic-art.js` | 加 drawShatter/drawFlood/drawWhipStreaks/drawIris/drawGlitchSlices/drawNumeral | 硬边整数坐标，单函数 ≤40 指令 |
| `src/scenes/CutsceneScene.js` | 视觉块委托给 choreo；加 fxG 加性层；buildCardView 暴露 titleChars/statValues/titleText 引用 | 盖场/换场/冻结/揭开/跳过/publish 一行不动 |
| `src/audio/CineMusic.js` | startMusic 加 'ending'（65.4Hz/0.6）；CUES 加 hush | 静默降级纪律不变 |
| `src/audio/Sfx.js` | 加 cineSlam / cineShatter | 增益 ≤0.018 |

### 每类编舞（时长不变）

- **act**：cover 甩镜 streak；巨号幕数字 I/II/III 垫底（α0.14）；幕名拆 ≤4 单字依次砸落（45ms stagger、easeOutBack 过冲）；落地震屏 ±2px ≤90ms + 2 帧幕色闪洪 + 符环过冲 + cineSlam。
- **clear**：hold 起点符环碎裂飞散（cineShatter）；四项统计 60ms stagger 弹出；reveal 12 列硬边百叶擦除。
- **death**：cover 血色 iris 收拢；hold glitch 切片 + 双跳心跳符环脉冲；reveal iris 张开。
- **victory**：hold 三环向心合并；合并瞬间黄铜闪洪 0.22 + 加性核心辉光 + cineShatter + 符环过冲。
- **boot/sigil/retry/return**：符环过冲 punch + 紧凑标题砸落 + 1 帧幕色 tick。

编舞里符环 `runes:false`（8×drawGlyph 约 250 指令），把预算让给冲击层；death 符环 spokes 8 再省 16 指令保最坏帧 ≤700。

## 四、无缝衔接保证

1. 结局两跳（victory→StoryScene、boot→GameOverScene）都走已验收的 Cover→Swap→Freeze→Reveal；目标未就绪不揭开，1500ms 兜底。
2. **音乐竞态**：CutsceneScene.resumeTarget 揭开时调 stopMusic；结局若 create 里起乐会被杀。结局推迟到首次 update 起乐（PAUSED 不跑 update，揭开后才启动）。
3. **跳过死锁修复**：结局在胜利过场 reveal 收尾窗口（isActive 仍 true）内被跳过时，playCutscene 的「已在过场中」守卫会吞掉交接。StoryScene.handoff 区分「被禁用」（自停）与「过场收尾」（标记 handoffPending，覆盖层停下后 update 自动重试），不自停致死锁。单测 + 真实浏览器探针双重回归。
4. 竖屏：名单滚动带 0.35–0.55H；quiet/dawn 舞台布局上移/压低避让 0.62H 字幕。

## 五、测试与验收（已执行）

- 单测：`story-data`（结局时间轴/STORY_MODES）、`story-scene`（ending 模式 + 死锁回归）、`story-art`/`cinematic-art`（预算/确定性）、`cutscene-choreo`（每类最坏帧 ≤700）、`cine-music`/`cine-sfx`（ending/hush/冲击音）。全量 **41 文件 / 889 项绿**（含在途 hostile-shots）。
- 真实浏览器（Edge，1920×1080 + 390×844）：
  - `scripts/ending-shot.mjs`（新）：8 断言全过——胜利卡 1600ms、结局 32000ms、两跳目标 PAUSED→RUNNING、跑分透传（kills 1142）、跳过不软锁、?cine=0 直达面板、0 pageerror。证据 `docs/ending/verify.json`。
  - `scripts/cutscene-shot.mjs`：15 断言全过（已对齐 journey/开场新流程）。
  - `scripts/story-shot.mjs`：11 断言全过（开场回归）。

## 六、明确不做（YAGNI）

- 不做视频/序列帧/AI 素材/配音/多语言。
- 不改短过场时长与文案；不重构换场状态机；不动开场六镜与 journey 内容。
- 名单不署个人名（默认品牌+职责+感谢）；不做"仅首次"存档标记。