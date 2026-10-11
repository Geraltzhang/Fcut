# FCUT Windows desktop

## Run

Extract the **entire** desktop ZIP and open `FCUT.exe`. Keep `app/`, `lib/`, `runtime/`, `tools/`, the WebView2 DLLs and `server.mjs` beside it. This is a portable Windows x64 desktop application, not a single-file executable or MSI installer. It opens an embedded editor without browser tabs or a console window. Running again activates the existing window.

The shell uses Windows Forms, .NET Framework 4.7.2+ and Microsoft's **Evergreen WebView2 Runtime**. These are shared system prerequisites and are not counted as bundled application bytes. A missing WebView2 Runtime produces an explanation; get it from [Microsoft](https://developer.microsoft.com/microsoft-edge/webview2/). No automatic download or security-policy changes are made. Package size is not installed system dependency size or memory usage.

## Data and lifecycle

- Desktop media, projects, exports and AI settings: `%LOCALAPPDATA%\FCUT\data`.
- WebView2 profile/cache: `%LOCALAPPDATA%\FCUT\webview`.
- Existing browser-mode `.local` data is not moved or overwritten. To reuse it, stop the browser-mode service first, then launch `FCUT.exe` with `FCUT_DATA_DIR` set to that directory. Never run two services against one data directory.
- The window starts its own Node process on an OS-assigned localhost port. API tokens remain required. The old browser service on port 4317 is not stopped or reused.
- Closing saves the current project before requesting server shutdown. During export, the editor asks before cancelling the export. Save failure keeps the window open. A Windows Job Object terminates the owned backend and its descendants if the shell exits or crashes.
- Project and video downloads use a native Save As dialog. AI configuration and the existing effects/export features remain available.

## Build from source

On Windows x64 with .NET Framework and the media/runtime dependencies already prepared:

```powershell
powershell -NoProfile -File scripts/build-desktop.ps1
powershell -NoProfile -File scripts/package.ps1
```

The build downloads Microsoft's NuGet package `Microsoft.Web.WebView2` **1.0.4258.31**, checks a pinned SHA-256, and compiles with the Windows .NET Framework C# compiler. No .NET SDK, Electron, Chromium bundle or npm install is required. The WebView2 SDK license/notice are included beside the executable. Build caches stay in `.build/` and are excluded from the package and Git.

## Verification and current limitation

```powershell
node tests/desktop-server.mjs
powershell -NoProfile -File scripts/test-desktop.ps1
```

The native smoke test uses isolated test data, checks WebView2/WebGL startup, downloads a project, saves on close and confirms the backend exits; it captures a screenshot. Run it with no existing FCUT desktop window open.

**On the development machine, compilation succeeds but Windows Application Control blocks execution of the generated executable. Native smoke verification therefore remains blocked.** The test failure is not evidence that the native window works. The package is unsigned. Distribution to policy-managed machines may require an authorized publisher signing certificate and a compatible application-control policy. FCUT does not disable or bypass those controls. Browser/Node tests do not substitute for native smoke testing.

This local portable package includes separately licensed Node and FFmpeg binaries. Public binary distribution still requires their license/source obligations to be satisfied; source publication alone does not satisfy that requirement. See `THIRD_PARTY_NOTICES.md`.
