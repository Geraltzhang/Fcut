param()
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$version = '1.0.4258.31'
$expected = '56F7F4B8BF9AEE4B8EFEFBBDD4F67D5F74EBD1B100ED0806DA71BF76AF481AA9'
$cache = Join-Path $projectRoot '.build/webview2'
$archive = Join-Path $cache 'sdk.zip'
New-Item -ItemType Directory -Force -Path $cache | Out-Null
if (-not (Test-Path -LiteralPath $archive)) {
    Invoke-WebRequest "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$version/microsoft.web.webview2.$version.nupkg" -OutFile $archive
}
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $expected) { throw 'WebView2 SDK checksum mismatch.' }
Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $cache 'sdk') -Force
$sdk = Join-Path $cache 'sdk'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$core = Join-Path $sdk 'lib/net462/Microsoft.Web.WebView2.Core.dll'
$forms = Join-Path $sdk 'lib/net462/Microsoft.Web.WebView2.WinForms.dll'
& $compiler /nologo /target:winexe /platform:x64 /optimize+ "/win32icon:$projectRoot/desktop/fcut.ico" "/win32manifest:$projectRoot/desktop/app.manifest" "/out:$projectRoot/FCUT.exe" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll "/reference:$core" "/reference:$forms" (Join-Path $projectRoot 'desktop/FCUT.cs')
if ($LASTEXITCODE -ne 0) { throw 'Desktop compilation failed.' }
Copy-Item -LiteralPath $core,$forms -Destination $projectRoot -Force
Copy-Item -LiteralPath (Join-Path $sdk 'runtimes/win-x64/native/WebView2Loader.dll') -Destination $projectRoot -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'desktop/FCUT.exe.config') -Destination $projectRoot -Force
Copy-Item -LiteralPath (Join-Path $sdk 'LICENSE.txt') -Destination (Join-Path $projectRoot 'WebView2-LICENSE.txt') -Force
Copy-Item -LiteralPath (Join-Path $sdk 'NOTICE.txt') -Destination (Join-Path $projectRoot 'WebView2-NOTICE.txt') -Force
Write-Host "Built $projectRoot/FCUT.exe (WebView2 SDK $version)"
