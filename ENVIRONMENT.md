# 环境约定

- **Playwright 固定 `1.65.0`**（精确版本，对应 chromium revision 1254）。不要改成 `^1.65.0`，也不要升级到 1.65.1——那会要求 chromium 1255，本机没有。
- 浏览器统一用全局缓存 `%LOCALAPPDATA%\ms-playwright`，不要设置 `PLAYWRIGHT_BROWSERS_PATH` 到项目内。
- 完整规范：`D:\AgentPrograms\ENVIRONMENTS.md`；体检脚本：`D:\AgentPrograms\env-doctor.ps1`。
- 变更记录：`D:\AgentPrograms\env-cleanup\cleanup-20261124.md`。

_2026-11-24 锁定。_
