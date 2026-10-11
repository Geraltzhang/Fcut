$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$testData = Join-Path $projectRoot ('test-results/desktop-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $testData | Out-Null
$priorData = $env:FCUT_DATA_DIR
try {
    $env:FCUT_DATA_DIR = $testData
    $app = Start-Process -FilePath (Join-Path $projectRoot 'FCUT.exe') -ArgumentList '--smoke-test' -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru
    if (-not $app.WaitForExit(60000)) { Stop-Process -Id $app.Id; throw 'Desktop smoke test timed out.' }
    if (Test-Path (Join-Path $testData 'desktop-error.txt')) { throw (Get-Content (Join-Path $testData 'desktop-error.txt') -Raw) }
    $ready = Get-Content (Join-Path $testData 'desktop-ready.txt')
    $saved = Get-Content (Join-Path $testData 'project.json') -Raw | ConvertFrom-Json
    $download = Get-Content (Join-Path $testData 'download.fcut') -Raw | ConvertFrom-Json
    if ($saved.name -ne '桌面封装验证' -or $download.name -ne $saved.name) { throw 'Native save/download verification failed.' }
    if (Get-Process -Id ([int]$ready[1]) -ErrorAction SilentlyContinue) { throw 'Owned backend remained alive after window closed.' }
    Write-Host "PASS: native WebView2 + WebGL, project download, save-on-close, backend cleanup. Screenshot: $testData/desktop.png"
} finally { $env:FCUT_DATA_DIR = $priorData }
