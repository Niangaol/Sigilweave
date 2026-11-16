# 桌面版（Windows x64 便携版）构建说明

## 结论先行

```
npm run build                     # 网页产物 → dist/
powershell -File scripts\build-exe.ps1   # 一键：构建 + 复制 + 打包 → release-out/Sigilweave-win32-x64/
```

产物是一个**免安装、完全离线**的文件夹，双击 `Sigilweave.exe` 即玩。删除文件夹即卸载。

## 为什么是「Electron + 本地 http 服务」而不是 file:// 直开

游戏是 Vite 打包的单页应用，用到了 ES module、fetch 资源、IndexedDB 存档。
`file://` 协议下这些都会被 CORS/opaque origin 拦掉，所以 `desktop/main.cjs` 在启动时起一个
**只监听 127.0.0.1** 的极小静态服务（端口 47821 起，被占则顺延到 47860），再把窗口指过去。
服务生命周期 = 进程生命周期，不开放外网访问，带路径穿越防护。

## 目录结构

```
desktop/                 Electron 主进程壳（main.cjs + package.json）
desktop/dist/            vite 产物的副本（构建时复制，不进仓库）
packaging/               随产物一起分发的说明与兼容启动脚本
scripts/build-exe.ps1    一键构建
scripts/verify-run.ps1   启动产物 + CDP 连上去截图，做冒烟验证
scripts/verify-exe.mjs   verify-run 调用的 playwright 校验脚本
release-out/             打包输出（不进仓库）
```

## 关键实现点

| 问题 | 处理 |
| --- | --- |
| 单实例锁在受限环境下返回 false，导致秒退 | 锁只用于「已开一个就聚焦」，失败也继续启动；真正的重复判定靠端口占用 |
| 存档/窗口状态写入 Roaming 可能失败 | `app.setPath('userData', %LOCALAPPDATA%\\Sigilweave)` 并先 `mkdirSync` |
| Electron 二进制下载慢/断网 | 复用 `%LOCALAPPDATA%\\electron\\Cache` 里已缓存的 `electron-v44.9.3-win32-x64.zip`，打包时用 `--electron-zip-dir` |
| 部分受限环境 Chromium 沙箱初始化失败 | 附 `启动（兼容模式）.cmd`，用 `--no-sandbox` 启动 |
| 打包时报 `EBUSY app.asar` | 输出目录换新（`release-out`），不要原地覆盖旧产物 |

## 版本

- Electron 44.9.3 / @electron/packager 20.x / Node 侧壳为 CJS
- 产物约 370 MB（Electron 运行时占绝大多数），压缩后约 150 MB
- 若要显著瘦身，见下一节的 WebView2 方案（约 3 MB，依赖系统 WebView2 运行时）


---

## 小体积版：WinForms + WebView2（约 3 MB）

```
npm run build                                  # 网页产物 → dist/
powershell -ExecutionPolicy Bypass -File scripts\build-webexe.ps1
```

产物：`release-web\Sigilweave\`（2.84 MB / 63 个文件），压缩包约 **1.08 MB**。
对比 Electron 版的 370 MB 文件夹 / 152 MB zip，体积差约 130 倍，代价是**依赖系统自带的 WebView2 运行时**。

### 组成

| 文件 | 大小 | 作用 |
| --- | --- | --- |
| `Sigilweave.exe` | 150 KB | 自写的 WinForms 宿主（`tools/webhost/host.cs`，csc 直接编译，无框架依赖） |
| `Microsoft.Web.WebView2.Core.dll` | 687 KB | WebView2 托管 API |
| `Microsoft.Web.WebView2.WinForms.dll` | 38 KB | WinForms 控件封装 |
| `WebView2Loader.dll` | 190 KB | WebView2 原生加载器 |
| `www\` | 1.8 MB | vite 产物（与 GitHub Pages 上的一致） |

### 关键实现点

| 问题 | 处理 |
| --- | --- |
| `file://` 下 ES module / fetch / IndexedDB 全废 | 不用本地 http 服务，改用 `core.SetVirtualHostNameToFolderMapping("sigilweave.local", <exe>\www, Allow)`，直接映射成 `https://sigilweave.local`——安全源，但**零端口、零后台服务** |
| WebView2 数据目录建在 `%LOCALAPPDATA%\Sigilweave\WebView2` 时，Edge 报「无法创建数据目录」 | 改为**便携**：优先用 exe 同目录 `data\`（先试写探测），不可写才回退 `%LOCALAPPDATA%`；也可用环境变量 `SIGILWEAVE_DATA` 覆盖 |
| 全屏快捷键 | WebView2 的 WinForms 控件不暴露 `CoreWebView2Controller`（没有 `AcceleratorKeyPressed`），改为注入 JS 监听 F11 / Alt+Enter / Esc，`chrome.webview.postMessage` 回传宿主 |
| 白屏闪烁 | `WebView2.DefaultBackgroundColor = #0D0A17`，标题栏用 `DwmSetWindowAttribute(hwnd, 20, dark, 4)` 转深色 |
| 运行时缺失 | 捕获 `CreateAsync` 异常 → 弹窗并给出微软官方下载链接 |
| 编译环境 | 无需 .NET SDK：用 `.NET Framework 4.8` 自带 `csc.exe`（**C# 5 语法**：不能写 `$""`、`?.`、`nameof`） |

### 验证

`scripts\verify-webexe.mjs` + `scripts\verify-gameplay.mjs`：用
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=94xx` 启动，
playwright `connectOverCDP` 连进去，打印 `url/title/canvas/webgl/audio` 并截图。
实测：`title=共振法阵 · 第一幕`、`canvas=1280x720`、`webgl=true`、`origin=https://sigilweave.local`，
点进战斗后正常显示「选择初始法术套装」。
