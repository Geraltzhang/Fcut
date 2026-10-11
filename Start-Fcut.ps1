param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$bundledNode = Join-Path $projectRoot 'runtime\node.exe'
$nodePath = if (Test-Path -LiteralPath $bundledNode) { $bundledNode } elseif ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
if (-not (Test-Path -LiteralPath $nodePath)) { throw 'Node.js 22+ is required. Install Node.js and try again.' }
$running = $false
try { $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:4317' -TimeoutSec 2; $running = $response.Content -match 'fcut-token' } catch {}
if (-not $running) {
    $logDir = Join-Path $projectRoot '.local'
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    $service = Start-Process -FilePath $nodePath -ArgumentList 'server.mjs' -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDir 'server.log') -RedirectStandardError (Join-Path $logDir 'server-error.log')
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Milliseconds 200
        if ($service.HasExited) { throw ('FCUT service exited: ' + (Get-Content -LiteralPath (Join-Path $logDir 'server-error.log') -Raw)) }
        try { $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:4317' -TimeoutSec 1; if ($response.Content -match 'fcut-token') { $running = $true; break } } catch {}
    }
}
if (-not $running) { throw 'FCUT could not start. Check .local/server-error.log.' }
Write-Host 'FCUT is ready: http://127.0.0.1:4317'
if (-not $NoBrowser) { Start-Process 'http://127.0.0.1:4317' }
