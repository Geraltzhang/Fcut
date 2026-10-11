param([string]$OutputPath)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $OutputPath) { $OutputPath = Join-Path $projectRoot 'dist\FCUT-0.3-desktop-win-x64.zip' }
$parent = Split-Path -Parent ([IO.Path]::GetFullPath($OutputPath))
New-Item -ItemType Directory -Force -Path $parent | Out-Null
$allowlist = @('app','lib','runtime','tools','scripts','server.mjs','package.json','Start-Fcut.cmd','Start-Fcut.ps1','README.md','API.md','LICENSE','THIRD_PARTY_NOTICES.md','CHALLENGE.md','CONTRIBUTING.md','COMPOSITOR-NOTES.md','SIZE-REPORT.json')
$allowlist += @('FCUT.exe','FCUT.exe.config','Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll','WebView2-LICENSE.txt','WebView2-NOTICE.txt','DESKTOP.md','desktop')
$paths = $allowlist | ForEach-Object { Join-Path $projectRoot $_ }
foreach ($item in $paths) { if (-not (Test-Path -LiteralPath $item)) { throw "Missing package file: $item. Run scripts/build-desktop.ps1 first." } }
$bytes = ($paths | ForEach-Object { Get-ChildItem -LiteralPath $_ -Recurse -File } | Measure-Object -Property Length -Sum).Sum
if ($bytes -gt 100000000) { throw "Portable app exceeds 100 MB budget: $bytes bytes" }
Compress-Archive -LiteralPath $paths -DestinationPath $OutputPath -CompressionLevel Optimal -Force
Write-Host "Portable size: $bytes bytes. Archive: $OutputPath"
