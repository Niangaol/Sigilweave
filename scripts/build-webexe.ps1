# Sigilweave 小体积版构建脚本（WinForms + WebView2 宿主）
# 用法：powershell -ExecutionPolicy Bypass -File scripts\build-webexe.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# 0. 结束正在运行的实例，避免 data 目录被占用
Get-Process Sigilweave -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { throw "找不到 csc.exe（需要 .NET Framework 4.x）" }

# 1. 确保 WebView2 托管程序集在位（缺失则从 NuGet 拉）
$wvDir = Join-Path $root 'tools\webview2'
$need = @('Microsoft.Web.WebView2.Core.dll', 'Microsoft.Web.WebView2.WinForms.dll', 'WebView2Loader.dll')
$missing = $need | Where-Object { -not (Test-Path (Join-Path $wvDir $_)) }
if ($missing) {
  $ver = '1.0.4314.35'
  Write-Host "拉取 WebView2 SDK $ver ..."
  $nupkg = Join-Path $root 'tools\wv2.nupkg'
  New-Item -ItemType Directory -Force $wvDir | Out-Null
  Invoke-WebRequest "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$ver/microsoft.web.webview2.$ver.nupkg" -OutFile $nupkg
  $pkg = Join-Path $root 'tools\wv2pkg'
  if (Test-Path $pkg) { Remove-Item $pkg -Recurse -Force }
  Copy-Item $nupkg "$pkg.zip" -Force
  Expand-Archive "$pkg.zip" -DestinationPath $pkg -Force
  Copy-Item "$pkg\lib\net462\Microsoft.Web.WebView2.Core.dll" $wvDir -Force
  Copy-Item "$pkg\lib\net462\Microsoft.Web.WebView2.WinForms.dll" $wvDir -Force
  Copy-Item "$pkg\runtimes\win-x64\native\WebView2Loader.dll" $wvDir -Force
}

# 2. 图标（有 Python + Pillow 时从美术素材生成）
$ico = Join-Path $root 'tools\webhost\sigilweave.ico'
if (-not (Test-Path $ico)) {
  $py = Get-Command python -ErrorAction SilentlyContinue
  if ($py) { & $py.Source (Join-Path $root "tools\gen-icon.py") }
}

# 3. 编译宿主
$exe = Join-Path $root 'tools\webhost\Sigilweave.exe'
$cscArgs = @("/nologo","/target:winexe","/platform:x64","/optimize+",
  "/win32icon:$ico","/win32manifest:$root\tools\webhost\app.manifest","/out:$exe",
  "/r:$wvDir\Microsoft.Web.WebView2.Core.dll","/r:$wvDir\Microsoft.Web.WebView2.WinForms.dll",
  "/r:System.Windows.Forms.dll","/r:System.Drawing.dll","$root\tools\webhost\host.cs")
& $csc $cscArgs
if ($LASTEXITCODE -ne 0) { throw "编译失败" }

# 4. 构建网页并组装
if (-not (Test-Path (Join-Path $root 'dist\index.html'))) { npm run build }
$stage = Join-Path $root 'release-web\Sigilweave'
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force $stage | Out-Null
Copy-Item $exe $stage
Copy-Item "$wvDir\Microsoft.Web.WebView2.Core.dll" $stage
Copy-Item "$wvDir\Microsoft.Web.WebView2.WinForms.dll" $stage
Copy-Item "$wvDir\WebView2Loader.dll" $stage
Copy-Item (Join-Path $root 'dist') (Join-Path $stage 'www') -Recurse
if (Test-Path (Join-Path $root "release-web\使用说明.txt")) { Copy-Item (Join-Path $root "release-web\使用说明.txt") $stage }

# 5. 压缩成 zip
$zip = Join-Path (Split-Path -Parent $root) ('Sigilweave-webview2-' + (Get-Date -Format 'yyyyMMdd') + '.zip')
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -CompressionLevel Optimal
$files = Get-ChildItem $stage -Recurse -File
$size = ($files | Measure-Object Length -Sum).Sum
Write-Host ("文件夹 {0:N2} MB / {1} 个文件；压缩包 {2:N2} MB -> {3}" -f ($size/1MB), $files.Count, ((Get-Item $zip).Length/1MB), $zip)