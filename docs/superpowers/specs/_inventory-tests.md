# 勘察·测试与脚本依赖（七幕 → 五幕）

来源：只读勘察子智能体 9057b58b（2026-11-12）。本文件是"改五幕后哪些断言会红"的权威清单。

## 1) tests/（66 个 .test.js / 694 个 it() + 53 个 it.each + 161 describe()）

### A. 硬断言某幕具体数值（改五幕必改）
- tests/progression.test.js:77 MAJOR_BOSS_LEVEL toEqual {1:5,2:8,3:11,4:14,5:17,6:20,7:23}；:78 逐项；:84 it.each 拒 act 8（五幕后 6 才是越界）
- tests/density.test.js:61-75 maxAlive 35/39/41/44/46/49、ramp 74/83/88/93/99/104、spawnMs 700×0.92/0.85/0.73 与 520×同系数；:80-84 第七幕必须最多最密；:147-155 ACT_DENSITY 精确七项 {1:[1,1] … 7:[1.62,0.73]}；:183-188 ACT_ENEMY_WEIGHTS[1] 精确 4 项 + [1..7] 权重和=1
- tests/boss.test.js:27-33 it.each([[1,5],[2,8],[3,7],[4,6],[5,10],[6,3],[7,9]]) 每幕弹幕发数；:35-56 七套形态互异、:55 Set.size=7；:62 拒 act 8
- tests/enemy-ai.test.js:711 [1..7] 权重和；:720-767 逐幕精确权重（act4 ink_wisp .18/page_golem .18/index_hound .08/clockwork_doll .12；act5 verdict_wraith .16/shackle_guard .18/scale_arbiter .08/knight .12；act6 slag_beast .18/ember_imp .16/anvil_tyrant .08/oath_bishop 0；act7 dawn_shade .16/stardust_knight .16/eclipse_priest .1/stitch .02）；:747-750 [4,5,6,7] 表长≥10；:792-807 26 敌人 id 精确排序
- tests/cinematics.test.js:85 ACT_CARDS 键必须 ['1'..'7']；:98/:101 titles/stars size=7；:102 星名七项；:112 buildCard('act',7) eyebrow
- tests/encounters.test.js:23-31 28 条 id（boss-1..7/miniboss-1a..7b/npc-1..7）与 28 唯一名
- tests/story-data.test.js:49 JOURNEYS 键 ['2'..'7']；:50-69 第贰..第柒 label/stage/accent
- tests/diorama-registry.test.js:24-28 ids 长 7、accent 7、getDiorama(99).act=7
- tests/cinematic-art.test.js:115 drawNumeral IV-VII 循环；tests/cine-props.test.js:63-65 drawLord [1..7]、counts[6]<counts[0]
- tests/meta-data.test.js:6/:11 24 里程碑=[7,14,3]；:19 CAP_UNLOCKS boss-3/5/7；:34-35 minor 14（含 6a/6b/7a/7b）、major boss-1..7
- tests/meta-settle.test.js:17-18 act7 base=7*8+2+60；:46-49 act7 clear 成就；:40 (i%7)+1
- tests/meta-gameover.test.js:54-56 act7 base=7*8+2+60、gained 118

### B. 只枚举 1..7（改五幕后数量断言失效、数值不锁）
- tests/map-events.test.js:19 const ACTS=[1..7]，:80-83 toHaveLength(21)=7×3 事件点、:87 21
- tests/diorama-act1..7.test.js 是 7 个按幕拆分的文件（act7 12 it / act6 6 / act5 5）

### C. 与幕数无关
- tests/hostile-shots.test.js:48 只 [1,2,3]；tests/build.test.js:19 非法幕表、:26 第一幕六格

### D. 无 PNG 尺寸/数量断言
- grep existsSync/.png/naturalWidth 只命中 tests/cutscene-plinth.test.js:20 expect(L.subtitle.width).toBe(286)（排版宽度）

## 2) package.json 与 scripts/
package.json 仅 5 条：:7 test=vitest run、:8 dev、:9 build、:10 preview、:11 sim=node scripts/simulate.mjs。**没有 smoke/verify 条目，须手动 node 跑。**
- scripts/three-act-smoke.mjs（七幕全回归，破坏最重）：:1-2 注释 6/12/16×5 格、2/3/3/3/4/4/4 脉流；:17 BOSS_LEVEL 7 项；:44 for act=1..7；:52 npc-+act；:54 boss-+act；:55 if(act<7) 幕间；:73-77 7 行 deepEqual；:79 HUD 七幕名；:81 result.act=7；:82 7 条 resolutions；:86 elapsed>=200；:89 截图 docs/北斗七幕通关.png
- scripts/density-sim.mjs：:52 clamp(1..3) 只跑前三幕；:58 WORLD_SIZES[act]；:67 unlocked slice(act===2?12:16)；:76 ACTS[act-1].baseIntervalMs；:160 ACTS[act-1].starts → 五幕后 act4/5 语义变但不炸
- scripts/verify-gameplay.mjs 19 行，CDP 截图+title/canvas，无幕假设，安全
- scripts/acceptance.mjs:3 串行 16 脚本（含 three-act-smoke/progression-smoke/balance-acceptance/stress/mow-fx-shot），:6 LONG=1，默认 BASE_URL 4173
- scripts/balance-acceptance.mjs:10 ACTS.map（7 行）、:30 每幕受阻率 15–25%（按七幕调）
- BOSS_LEVEL 7 项硬编码 5 处：workshop-smoke.mjs:21、encounter-smoke.mjs:56/:136、progression-smoke.mjs:97、hostile-shot-smoke.mjs:27、aux-target-workshop-check.mjs:21；workshop-smoke.mjs:42 首次幕间 {act:2,count:12,reports:1}
- scripts/cutscene-shot.mjs:153-159 注入 act1..7 胜利统计、:80 act1 卡、:132 journey act2 时长 4–8s
- scripts/ending-shot.mjs:21 VICTORY_KILLS 7 项合计 1190、:28 7 条 bossResolutions、:32 s.act=7
- scripts/preview-gallery.mjs:25 for act=1..7、:48 /7 均值；preview-compare.mjs:113 picks [1..7]
- scripts/check-docs.mjs:4 校验 README+docs/*.md 全部相对链接 → 改名/删 docs/北斗七幕.md 直接 exit 1
- scripts/stress.mjs / smoke.mjs / pages-check.mjs / simulate.mjs（:65 自带 3 幕 ACTS）与幕数弱相关

## 3) docs/ 改写清单
- docs/北斗七幕.md 整篇（:1 标题、:7-15 七行映射、:19-30 后四幕遭遇、:32-53 代码落点、:55-61 美术、:63-76 验收、:78-105 16 截图、:112-116 边界）→ 需改名/归档为「北斗五幕」
- docs/规则契约.md：:119「大地图与三幕参数」标题、:121 七星名、:123-131 七列表、:156 七法术、:162 24 节点(7+14+3)、:169 七档密度、:179 26 敌人/后四幕、:182 四精英、:190 七小 Boss、:191 等级 5/8/11/14/17/20/23+七 Boss 名、:194 七套弹幕
- docs/内容规格表.md：:74「敌人（首版 5 类）」过旧、:122-132 §九状态、:130 只写二幕 74/三幕 83
- docs/迭代记录总览.md：:14「3 天，46 次提交」、:15「32 文件、800 项」、:20 三幕游戏、R1-R13 无七幕轮次、:112/:119/:127 记 45/924、46/932、47/1064、:183-189、:206 索引
- docs/验收总览.md：:3 历史横幅、:30「P3 三幕完整版」、:34/:48、:55「405 测试通过」、:63 等级 5/8/11 + 2/3/3
- 次级：docs/试玩清单.md:9/:11/:27/:28/:29/:47；docs/交付说明.md:3/:55/:56/:60/:77/:82；docs/大地图验收记录.md:5/:13/:16/:18/:34；docs/过场动画.md:3/:15/:16/:35/:59-61/:171-172、:224；docs/开场与幕间.md:27/:78/:123；docs/割草与法术特效验收.md:11/:18/:62/:111/:127；docs/技术架构.md:28/:37/:90；docs/结局与演职员.md:18/:26；docs/落地计划.md:55/:95；docs/仿真报告.md:3/:13；docs/平衡实验.md:6/:16/:42；docs/美术升级包合并.md:69-73；docs/地板重制验收.md:7/:33/:64/:79；docs/P2构筑闭环验收.md:8/:19/:38；docs/P3问答验收.md:7/:20/:39；docs/P4性能报告.md:83；README.md:30(54 文件/1114 项过期)/:32/:33/:39/:42/:43/:46/:73
- 历史设计档（会误导但不阻塞）：docs/superpowers/plans/2026-11-11-cutscene-diorama.md（20 处七幕）、docs/superpowers/specs/2026-11-11-cutscene-diorama-design.md:95/:214、docs/superpowers/specs/2026-11-11-meta-progression-design.md:83/:97/:121
- 资产：docs/北斗七幕/ 16 张 + docs/北斗七幕通关.png（three-act-smoke.mjs:89 生成）

## 4) 规模与运行限制（关键）
- 66 个测试文件 / 694 it() + 53 it.each + 161 describe()；README.md:30 记 54 文件 1114 项、docs/北斗七幕.md:74 记 47 文件 1064 项 —— 均过期
- **本会话 run_code 内 npm test 跑不起来**：failed to load config from vite.config.js → Error: Build failed with 1 error: [plugin externalize-deps] Error: spawn EPERM（沙箱禁 child_process）。npm run build 同理未验证且会写 dist/。→ 验收命令必须走 tools.pwsh 起独立进程跑，不能在 run_code 里 execSync。
- 测试里没有 PNG 尺寸/数量断言；素材只靠 BootScene 预加载，无测试守护

## 5) 关键源码补充
- src/logic/constants.js:30-38 ACTS 七项（间隔 1.4→0.92、starts 2/3/3/3/4/4/4、unlocked 6/12/16×5）、:54-62 WORLD_SIZES 七张（终幕 2560×1920）
- src/data/meta.js:34 ACTS=[1..7]
