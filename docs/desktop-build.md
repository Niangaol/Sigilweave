# 桌面版：构建、验收与限制

游戏本体是 Vite 打包的单页，桌面版只给它套一层壳，两条路各有一个一键脚本。命令可直接复制，产物不写注册表、删文件夹即卸载。

| 方案 | 体积 | 依赖 | 脚本 |
| --- | --- | --- | --- |
| Electron 便携版 | 371 MB | 无 | `scripts\build-exe.ps1` |
| WinForms + WebView2 | 3.0 MB | 系统 WebView2 运行时 | `scripts\build-webexe.ps1` |

## 一、Electron 便携版

```bash
npm run build
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-exe.ps1
```

产物在 `release-out\Sigilweave-win32-x64\`，双击 exe 即玩、完全离线。脚本：`npm run build` → 复制 `dist` 到 `desktop\dist` → 复用 `%LOCALAPPDATA%\electron\Cache` 的 Electron zip（`.cache-electron`，断网也能打包）→ `npx @electron/packager` 出包，最后拷 `packaging\` 两份。

## 二、为什么不用 file://

ES module、fetch、IndexedDB 在 `file://` 下会被 CORS / opaque origin 拦掉，所以 `desktop/main.cjs` 在 `127.0.0.1` 起极小静态服务，窗口指向它。

| 点 | 做法 |
| --- | --- |
| 端口 | 47821 起，被占则 +1 顺延到 47860；服务生命周期 = 进程生命周期 |
| 越权 | 路径 `decodeURIComponent` 后必须 `startsWith(ROOT)`，否则 403 |
| 窗口 | 默认 1280×760、最小 960×600；F11 / Alt+Enter 全屏，Esc 退出 |

## 三、目录

| 路径 | 作用 |
| --- | --- |
| `desktop/main.cjs` + `package.json` | 主进程壳（服务 / 窗口 / 快捷键）与打包元信息 |
| `packaging/` | 随产物分发：`README-游戏说明.txt`、`启动（兼容模式）.cmd` |
| `scripts/build-exe.ps1`、`verify-run.ps1` + `verify-exe.mjs` | 一键构建、拉起产物做 CDP 冒烟与截图 |
| `desktop/dist/`、`release-out/` | 中间物与打包输出，不进仓库 |

## 四、构建时会踩的坑

| 现象 | 处理 |
| --- | --- |
| 单实例锁返回 false，窗口秒退 | 锁只当「已开一个就聚焦」，失败继续启动；重复判定靠端口占用 |
| 写 Roaming 失败 | userData 改到 `%LOCALAPPDATA%\Sigilweave` 并先 `mkdirSync`，否则 IndexedDB 报 0x3 |
| 双击没反应（沙箱初始化失败） | 用 `启动（兼容模式）.cmd`，即 `--no-sandbox` 启动 |
| 报 `EBUSY app.asar` | 输出固定 `release-out`，先删再打包，不原地覆盖 |
| 被当成 Node 进程拉起 | `main.cjs` 清掉 `ELECTRON_RUN_AS_NODE` 后重新拉起自己 |

## 五、验收 Electron 版

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-run.ps1
```

脚本杀掉同名进程 → 以 `--no-sandbox --remote-debugging-port=9411` 起 exe → 轮询 47821 与 `/json/version` → 都通就调 `node scripts/verify-exe.mjs`。

通过标准：`alive=True server=True cdp=True`，`canvases≥1`、`canvasSize` 非空、`webgl=true`，截图是标题画面。`-ExePath` / `-OutPng` 可换路径与截图名，日志看 `release-out\exe.err.log`。

## 六、小体积版：WinForms + WebView2

```bash
npm run build
powershell -ExecutionPolicy Bypass -File scripts\build-webexe.ps1
```

产物在 `release-web\Sigilweave\`，压缩包写到仓库**上一级**目录的 `Sigilweave-webview2-<yyyyMMdd>.zip`，`dist` 缺失时脚本自己补构建。包内 5 件运行时文件：`Sigilweave.exe`（源 `tools/webhost/host.cs`）、两个 WebView2 托管 DLL（缺失时从 NuGet 拉）、`WebView2Loader.dll`、`www\`；另有 `使用说明.txt`（存在则一并拷入）。

| 点 | 做法 |
| --- | --- |
| 同样绕不过 `file://` | 不起服务，`SetVirtualHostNameToFolderMapping` 把 `<exe>\www` 映射成 `https://sigilweave.local`：安全源、零端口、零后台进程 |
| 数据目录报「无法创建」 | 便携优先：先试写 exe 同目录 `data\`，不可写才回退 `%LOCALAPPDATA%`，`SIGILWEAVE_DATA` 可覆盖 |
| 控件不暴露 `AcceleratorKeyPressed` | 注入 JS 监听 F11 / Alt+Enter / Esc，`chrome.webview.postMessage` 回传宿主 |
| 白屏闪烁 | `DefaultBackgroundColor = #0D0A17`，标题栏 `DwmSetWindowAttribute(hwnd, 20, dark, 4)` |
| 系统没装运行时 | 捕获 `CreateAsync` 异常，弹窗给微软官方下载链接 |
| 编译环境 | 不装 .NET SDK，用 .NET Framework 4.8 自带 `csc.exe`（C# 5：不能写 `$""`、`?.`、`nameof`） |

验收：带远程调试端口启动，再连进去看。

```bash
export WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9412
./release-web/Sigilweave/Sigilweave.exe &
node scripts/verify-webexe.mjs      # VERIFY_PORT / VERIFY_PNG 可覆盖
node scripts/verify-gameplay.mjs    # 再按 Enter + 点一下进战斗
```

通过标准：`origin=https://sigilweave.local`、`canvasSize` 非空、`webgl` 与 `hasAudio` 为真，截图能看到标题画面与「选择初始法术套装」。

## 七、已知限制

- 只出 `win32-x64`，没有 arm64 与 mac/linux；体积差来自 Electron 自带运行时，WebView2 靠系统运行时。
- 两版都无自动更新、安装器、代码签名（脚本里无签名步骤），个别安全软件会拦。
- 端口 47821–47860 全被占用时 Electron 版直接弹窗退出，不降级。
- WebView2 版存档在 exe 同目录 `data\`，装在只读目录时退到 `%LOCALAPPDATA%`。

## 相关文档

- [交付说明](<交付说明.md>) —— 产物清单与分发口径。
- [技术架构](<技术架构.md>) —— 构建依赖的纯逻辑层与测试跑法。

## 历史

- 逐轮验收记录见 [迭代记录总览](<迭代记录总览.md>)。
