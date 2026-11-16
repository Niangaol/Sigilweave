# 一键构建 Windows 便携版 exe
# 用法： powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-exe.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$ErrorActionPreference = 'Continue'

Write-Host '[1/4] 构建网页产物 (npm run build)' -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw 'vite 构建失败' }

Write-Host '[2/4] 准备 desktop/dist' -ForegroundColor Cyan
if (Test-Path 'desktop\dist') { Remove-Item 'desktop\dist' -Recurse -Force }
Copy-Item dist desktop\dist -Recurse

Write-Host '[3/4] 准备 Electron 缓存' -ForegroundColor Cyan
if (-not (Test-Path '.cache-electron')) { New-Item -ItemType Directory '.cache-electron' | Out-Null }
$zip = Get-ChildItem "$env:LOCALAPPDATA\electron\Cache" -Recurse -Filter 'electron-v44.9.3-win32-x64.zip' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($zip) {
  Copy-Item $zip.FullName '.cache-electron\electron-v44.9.3-win32-x64.zip' -Force
  Write-Host ('  复用本地缓存: ' + $zip.FullName)
} else {
  New-Item -ItemType Directory '.cache-electron' -Force | Out-Null
}

Write-Host '[4/4] 打包 (npx @electron/packager)' -ForegroundColor Cyan
if (Test-Path 'release-out') { Remove-Item 'release-out' -Recurse -Force -ErrorAction SilentlyContinue }
npx @electron/packager desktop Sigilweave --platform=win32 --arch=x64 --out=release-out --overwrite --asar --prune=true --app-version=0.2.0 --build-version=0.2.0 --electron-version=44.9.3 --electron-zip-dir=.cache-electron --win32metadata.CompanyName=Niangaol "--win32metadata.FileDescription=共振法阵 Sigilweave"
if ($LASTEXITCODE -ne 0) { throw '打包失败' }

$out = 'release-out\Sigilweave-win32-x64'
Copy-Item 'packaging\README-游戏说明.txt' $out -ErrorAction SilentlyContinue
Copy-Item 'packaging\启动（兼容模式）.cmd' $out -ErrorAction SilentlyContinue
$sum = (Get-ChildItem $out -Recurse -File | Measure-Object Length -Sum)
Write-Host ('完成: ' + $out + '  文件数=' + $sum.Count + '  体积=' + [math]::Round($sum.Sum/1MB,1) + ' MB') -ForegroundColor Green
