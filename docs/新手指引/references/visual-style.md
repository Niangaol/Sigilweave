# 灵宠引导 · 西幻像素风视觉规范

> 来源：`../Sigilweave/src/ui/Palette.js` + `docs/法阵编辑统一.md` + 实机截图。
> 目的：保证引导 UI 与游戏本体画风一致。任何引导界面实现都必须遵守本规范。

## 一、硬规则（违反即打回）

1. **逻辑分辨率 480×270**，画布按整数倍放大（`RENDER_SCALE`）；引导 UI 在这套逻辑坐标里排版。
2. **全硬边色块**：禁止 CSS 渐变、`box-shadow`、模糊、`filter: blur`、抗锯齿圆角。
3. **无圆角卡片**：面板用 `pxRect` + 双层 `pxFrame` 画直角黄铜边框 + 四角铆钉，不要用 DOM `border-radius`。
4. **色板只能用 Palette.js 的 C / HEX**（见下表），不要自造颜色。
5. **像素素材放大必须用 nearest-neighbor**：CSS `image-rendering: pixelated` 或 Phaser `setScale` 整数倍，禁止双线性平滑。

## 二、真实色板（取自 Palette.js）

| 用途 | 色值 | 常量 |
| --- | --- | --- |
| 背景虚空 | `#0d0a17` | void |
| 深夜紫（面板底） | `#241c3a` | night |
| 更深夜紫 | `#1a142b` | nightDeep |
| 石灰紫 | `#3b3157` | stone |
| 黄铜（主描边） | `#c9a227` | brass |
| 深黄铜 | `#7a6118` | brassDark |
| 亮黄铜 | `#e0c35a` | brassLight |
| 羊皮纸（正文） | `#f0d9a8` | parchment |
| 奥术橙（强调） | `#ffb44d` | arcane |
| 青绿（灵宠/薄荷） | `#5ed0c8` | teal |
| 冷焰蓝 | `#9fe8ff` | coldFlame |
| 近黑紫描边 | `#1c1226` | outline |
| 骨白（高光） | `#e4dcc4` | bone |

## 三、字体

- 正文：`FONT = "Microsoft YaHei", "PingFang SC", "Noto Sans SC", "SimHei", sans-serif`（小字清晰的黑体）。
- 大标题（≥24px）：`FONT_DISPLAY = "SimSun", "Songti SC", serif`（西幻衬线味）。
- 中文小字必须带深色描边（`textStyle` 默认 `stroke: inkDark`），保证压在地图上可读。
- 字模图标：用 `drawGlyph` 画 8×8 像素 `'#'` 图案，不要 emoji、不要矢量图标。

## 四、灵宠头像与气泡实现

### 头像
- 素材：`assets/灵宠-墨宝-像素.png`，32×34 RGBA 像素精灵。
- 尺寸：逻辑坐标 32×34，按 `RENDER_SCALE` 整数倍放大（例：scale=2 → 64×68 设备像素）。
- 渲染：`image-rendering: pixelated`（Web）或 Phaser `setScale(整数)` + `texture.setFilter(Phaser.Textures.FilterMode.NEAREST)`。
- 情绪变体（可选）：符印颜色切换 teal → arcane（开心）/ blood（紧张），只换像素不改形状。

### 对话气泡
- 底色 `nightDeep` (#1a142b)，双层描边 `brass` (#c9a227) + `brassDark` (#7a6118)，1px 硬边。
- 气泡尾巴用小像素三角形（pxPoly），不要圆角。
- 名字条：`brassLight` 文字 + `brassDark` 底条，小字。
- 正文：`parchment`，`addText` 生成，带 `inkDark` 描边。
- 出现动画：整块气泡逐帧位移或硬切，不要淡入淡出（像素游戏保持硬切感）。

### 高亮框
- 用 `pxFrame(g, x, y, w, h, C.arcaneLight, 1)` 画 1px 硬边描边，或脉冲式 1px 闪烁（不要发光模糊）。

## 五、给开发的组件落点

- 新增 `src/ui/GuidePet.js`：封装 `show(guideCard)` / `hide()` / `next()`。
- 绘制全部走 `Palette.js`：`pxRect`、`pxFrame`、`addText`、`drawGlyph`、`applyPixelZoom` 对齐逻辑坐标。
- 头像 texture 用 `this.textures.addImage` 加载 32×34 PNG；Phaser 配置里加 `pixelArt: true`（`vite.config.js` 或 Phaser GameConfig），确保全局 NEAREST 过滤。
- 不要在引导里引入 DOM/HTML 覆盖层来画气泡（会破坏硬边与缩放一致性）；若必须叠 DOM，给容器加 `image-rendering:pixelated` 且尺寸为整数倍。

## 六、校验清单

- [ ] 逻辑坐标 480×270，整数倍缩放。
- [ ] 无渐变、无阴影、无模糊、无圆角。
- [ ] 只用 Palette.js 色板。
- [ ] 头像 32×34 像素精灵 + pixelated/NEAREST。
- [ ] 气泡为黄铜硬边框 + 像素三角尾巴。
- [ ] 中文小字带深色描边。
- [ ] 图标为 8×8 字模或像素块，无 emoji。
