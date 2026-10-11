param([string]$OutputPath)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid package version.' }
if (-not $OutputPath) { $OutputPath = Join-Path $projectRoot "dist\FCUT-$version-desktop-win-x64.zip" }
$parent = Split-Path -Parent ([IO.Path]::GetFullPath($OutputPath))
New-Item -ItemType Directory -Force -Path $parent | Out-Null
$allowlist = @('app','lib','runtime','tools','scripts','server.mjs','package.json','Start-Fcut.cmd','Start-Fcut.ps1','README.md','API.md','LICENSE','THIRD_PARTY_NOTICES.md','CHALLENGE.md','CONTRIBUTING.md','COMPOSITOR-NOTES.md','VALIDATION.md','SIZE-REPORT.json')
$allowlist += @('FCUT.exe','FCUT.exe.config','Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll','WebView2-LICENSE.txt','WebView2-NOTICE.txt','DESKTOP.md','desktop')
$paths = $allowlist | ForEach-Object { Join-Path $projectRoot $_ }
foreach ($item in $paths) { if (-not (Test-Path -LiteralPath $item)) { throw "Missing package file: $item. Run scripts/build-desktop.ps1 first." } }
& (Join-Path $projectRoot 'runtime/node.exe') (Join-Path $PSScriptRoot 'measure-size.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Size measurement failed.' }
$bytes = ($paths | ForEach-Object { Get-ChildItem -LiteralPath $_ -Recurse -File } | Measure-Object -Property Length -Sum).Sum
if ($bytes -gt 100000000) { throw "Portable app exceeds 100 MB budget: $bytes bytes" }
Compress-Archive -LiteralPath $paths -DestinationPath $OutputPath -CompressionLevel Optimal -Force
$archiveBytes = (Get-Item -LiteralPath $OutputPath).Length
if ($archiveBytes -gt 100000000) { throw "Archive exceeds 100 MB budget: $archiveBytes bytes" }
$hash = (Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText($OutputPath + '.sha256', "$hash  $([IO.Path]::GetFileName($OutputPath))`n")
$report = [ordered]@{ version=$version; unpackedBytes=$bytes; archiveBytes=$archiveBytes; budgetBytes=100000000; sha256=$hash; nativeSmoke='blocked on development machine by Windows Application Control' }
$report | ConvertTo-Json | Set-Content -LiteralPath ($OutputPath + '.json') -Encoding utf8
Write-Host "Portable size: $bytes bytes. Archive: $OutputPath"
