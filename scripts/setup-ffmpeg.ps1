$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$toolsDir = Join-Path $projectRoot 'tools'
$buildDir = Join-Path $projectRoot '.build'
New-Item -ItemType Directory -Path $toolsDir -Force | Out-Null
New-Item -ItemType Directory -Path $buildDir -Force | Out-Null
$archive = Join-Path $buildDir 'ffmpeg.zip'
Invoke-WebRequest -UseBasicParsing -Uri 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip' -OutFile $archive
$unpacked = Join-Path $buildDir 'ffmpeg-unpacked'
Expand-Archive -LiteralPath $archive -DestinationPath $unpacked -Force
foreach ($binaryName in @('ffmpeg.exe', 'ffprobe.exe')) {
    $source = Get-ChildItem -LiteralPath $unpacked -Filter $binaryName -Recurse | Select-Object -First 1
    if (-not $source) { throw "Missing $binaryName" }
    Copy-Item -LiteralPath $source.FullName -Destination (Join-Path $toolsDir $binaryName)
}
Get-ChildItem -LiteralPath $unpacked -Filter '*LICENSE*' -Recurse -File | Select-Object -First 1 | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $toolsDir 'FFmpeg-LICENSE.txt') }
Get-ChildItem -LiteralPath $unpacked -Filter '*README*' -Recurse -File | Select-Object -First 1 | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $toolsDir 'FFmpeg-README.txt') }
Write-Host 'FFmpeg ready.'
