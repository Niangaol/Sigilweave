param([string]$ExePath = 'release-out\Sigilweave-win32-x64\Sigilweave.exe', [string]$OutPng = 'release-out\exe-verify.png')
$ErrorActionPreference = 'Continue'
$exe = (Resolve-Path $ExePath).Path
Get-Process Sigilweave -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500
$env:ELECTRON_RUN_AS_NODE = $null
$p = Start-Process -FilePath $exe -ArgumentList '--no-sandbox','--remote-debugging-port=9411' -PassThru -RedirectStandardError 'release-out\exe.err.log' -RedirectStandardOutput 'release-out\exe.out.log'
Write-Output ('pid=' + $p.Id)
$cdp = $false; $srv = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 500
  if (-not $srv) { try { if ((Invoke-WebRequest 'http://127.0.0.1:47821/index.html' -TimeoutSec 2 -UseBasicParsing).StatusCode -eq 200) { $srv = $true } } catch {} }
  if (-not $cdp) { try { if ((Invoke-WebRequest 'http://127.0.0.1:9411/json/version' -TimeoutSec 2 -UseBasicParsing).StatusCode -eq 200) { $cdp = $true } } catch {} }
  if ($srv -and $cdp) { break }
  if ($p.HasExited) { break }
}
Write-Output ('alive=' + (-not $p.HasExited) + ' server=' + $srv + ' cdp=' + $cdp)
Get-Process Sigilweave -ErrorAction SilentlyContinue | Select-Object Id,MainWindowTitle | Format-Table -AutoSize | Out-String
if ($cdp) {
  $env:VERIFY_PNG = $OutPng
  node scripts/verify-exe.mjs 2>&1 | Out-String
}
Write-Output '=== stderr tail ==='
Get-Content 'release-out\exe.err.log' -Tail 12 -ErrorAction SilentlyContinue
