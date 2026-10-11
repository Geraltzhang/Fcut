param([string]$Version = '24.19.0')
$ErrorActionPreference = 'Stop'
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Version must be a numeric Node release, for example 24.19.0' }
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectRoot 'runtime'
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
$base = "https://nodejs.org/dist/v$Version"
$checksums = (Invoke-WebRequest -UseBasicParsing -Uri "$base/SHASUMS256.txt").Content
$line = ($checksums -split "`n" | Where-Object { $_ -match '\s+win-x64/node\.exe\s*$' } | Select-Object -First 1)
if (-not $line) { throw 'Official checksum for win-x64/node.exe is missing' }
$expected = ($line -split '\s+')[0]
$temporary = Join-Path $runtimeDir 'node.download.exe'
Invoke-WebRequest -UseBasicParsing -Uri "$base/win-x64/node.exe" -OutFile $temporary
if ((Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected.ToLowerInvariant()) { throw 'Node checksum mismatch; existing runtime was not replaced' }
Move-Item -LiteralPath $temporary -Destination (Join-Path $runtimeDir 'node.exe') -Force
Invoke-WebRequest -UseBasicParsing -Uri "https://raw.githubusercontent.com/nodejs/node/v$Version/LICENSE" -OutFile (Join-Path $runtimeDir 'LICENSE.txt')
Write-Host "Node $Version runtime ready."
