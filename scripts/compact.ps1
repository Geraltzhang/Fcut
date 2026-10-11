$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$buildDir = Join-Path $projectRoot '.build'
$upx = Join-Path $buildDir 'upx\upx-5.2.0-win64\upx.exe'
if (-not (Test-Path -LiteralPath $upx)) {
    New-Item -ItemType Directory -Force -Path $buildDir | Out-Null
    $zip = Join-Path $buildDir 'upx.zip'
    Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/upx/upx/releases/download/v5.2.0/upx-5.2.0-win64.zip' -OutFile $zip
    Expand-Archive -LiteralPath $zip -DestinationPath (Join-Path $buildDir 'upx') -Force
}
foreach ($relative in @('tools\ffmpeg.exe','tools\ffprobe.exe','runtime\node.exe')) {
    $binaryPath = Join-Path $projectRoot $relative
    if (-not (Test-Path -LiteralPath $binaryPath)) { continue }
    & $upx -t $binaryPath 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { Write-Host "Already packed: $relative"; continue }
    $packedPath = $binaryPath + '.packed.exe'
    & $upx -9 --lzma -o $packedPath $binaryPath
    if ($LASTEXITCODE -ne 0) { throw "Compression failed: $relative" }
    & $upx -t $packedPath
    if ($LASTEXITCODE -ne 0) { throw "Verification failed: $relative" }
    # Both paths are fixed children of this workspace, never user-derived paths.
    Move-Item -LiteralPath $packedPath -Destination $binaryPath -Force
}
Write-Host 'Compression complete. Existing codecs and filters are retained.'
