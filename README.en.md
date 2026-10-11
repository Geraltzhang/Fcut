# FCUT

[简体中文](README.md) | **English**

**A Windows x64 multitrack video editor under 100 MB: subtitles, music, color grading, keyframes and chroma key. Can you make it smaller without removing features?**

[![Tests](https://github.com/Geraltzhang/Fcut/actions/workflows/test.yml/badge.svg)](https://github.com/Geraltzhang/Fcut/actions/workflows/test.yml)

A small Windows video editor with local multitrack editing, subtitles, music and optional bring-your-own-model APIs. The reference portable build is approximately **81.5 MB unpacked, including the desktop shell, Node, FFmpeg and FFprobe**. It reuses Windows .NET Framework, WebView2 Runtime and system fonts; browser mode uses an installed browser. This is an early prototype, not a complete CapCut replacement or a verified claim to be the world's smallest editor.

**[Validation status](VALIDATION.md) · [Desktop guide](DESKTOP.md) · [Size challenge](CHALLENGE.md) · [Contributing](CONTRIBUTING.md) · [AI API](API.md) · [MIT License](LICENSE)**

The language links switch this README. The application interface and some linked documentation are currently in Chinese.

## Run from source

Install Node.js 22+ and run these commands in a Windows PowerShell environment that permits these project scripts. The initial media-tool download requires internet access:

```powershell
git clone https://github.com/Geraltzhang/Fcut.git
cd Fcut
powershell -NoProfile -File scripts/setup-ffmpeg.ps1
node server.mjs
```

Open http://127.0.0.1:4317 . No `npm install` is required. GitHub currently distributes source code only, with no public desktop binary release. Portable runtimes and media tools are not committed to Git. See [CONTRIBUTING.md](CONTRIBUTING.md) to assemble a portable build.

## What counts toward the size

The current desktop portable build is approximately 81.5 MB unpacked (77.7 MiB): about 56.8 MB for the media engine, 23.5 MB for Node, and 1 MB for the desktop shell and SDK. See [SIZE-REPORT.json](SIZE-REPORT.json) and the exact report generated during packaging. User media, exports, test artifacts and development tools are excluded. WebView2 Runtime, .NET Framework, system fonts, and the browser used in browser mode are explicitly shared dependencies.

Existing executables are packed with UPX; no existing codecs or features were removed to achieve this size. Archive size and unpacked size are measured separately. Smaller files do not imply proportionally lower memory usage.

Smaller implementations and PRs are welcome. Include source code, build instructions, dependencies, tests and a complete size report. See [CHALLENGE.md](CHALLENGE.md) for the rules.

The interface and application server have zero npm dependencies. An assembled portable build includes Node, FFmpeg and FFprobe, so a separate Node installation is unnecessary. FCUT supports browser mode and a Windows Forms + WebView2 desktop window. The desktop package is currently unsigned and portable, not an installer.

## Windows desktop mode

Extract the entire desktop portable package and run `FCUT.exe`. It uses the installed Windows .NET Framework and WebView2 Runtime. See [DESKTOP.md](DESKTOP.md) for startup, data locations, build instructions and validation limits.

Windows Application Control on the development machine currently blocks the unsigned executable. Native window validation has **not passed**; browser test results must not be treated as native validation.

## Browser mode

On Windows, double-click `Start-Fcut.cmd`, or run `node server.mjs` and open http://127.0.0.1:4317 . The launcher starts a hidden local server that keeps running after the browser closes. When started in a terminal, stop the server with Ctrl+C.

An assembled portable build should contain `runtime/node.exe`, `tools/ffmpeg.exe` and `tools/ffprobe.exe`. The launcher prefers the bundled runtime. The application targets 100 MB using lossless UPX executable packing, retaining existing codecs, filters and editing features. See [SIZE-REPORT.json](SIZE-REPORT.json). Browser mode uses an installed browser and system fonts. User media, exports and tests are counted separately. Executables unpack into memory when launched; disk savings do not imply matching RAM savings.

Run `scripts/setup-ffmpeg.ps1` to restore the media engine, then `scripts/compact.ps1` to restore compact size. Alternatively, set `FFMPEG_PATH` and `FFPROBE_PATH` to existing tools. Their licenses are in `tools/FFmpeg-LICENSE.txt` and `runtime/LICENSE.txt` after setup. `scripts/package.ps1` includes only runtime files, rejects builds over 100 MB, and excludes user media, test data and API configuration.

## Implemented features

- Import local video, audio and PNG/JPEG/WebP images; generate thumbnails and read media metadata.
- Start with two video tracks, two music tracks and a subtitle track; add video/music tracks up to 32 tracks total. Higher video tracks cover lower tracks.
- Drag clips to position them or move between compatible tracks; trim both ends; snapping and timeline zoom.
- Split, duplicate, delete, undo/redo and frame stepping.
- Playback speed from 0.25× to 4×, scale and position controls, landscape/portrait/square canvases.
- Source and music volume, mute, audio fade-in and fade-out.
- Manual subtitles, SRT import, font size, color, position and background controls.
- Autosave, project download and reopening.
- Real FFmpeg MP4 export with video compositing, burned-in subtitles and audio mixing; progress, cancellation and download.
- AI interfaces for subtitle polishing, translation and speech-to-subtitles; separate text/speech settings, result preview, manual application and undo.

## Visual effects and inspiration from Compositor

Select a video or image to adjust exposure, contrast, saturation, warmth, four-sided cropping, opacity and chroma key in the right panel. Effects apply to both preview and export, support undo, and are saved with the project.

Keyframes support horizontal/vertical position, scale and opacity. Move the playhead, enter values, then click “添加 / 更新” (Add / Update). Video fade-in/out durations are in seconds. Overlap clips on different video tracks and fade the upper clip to create a dissolve. Preview requires WebGL.

This is a basic implementation inspired by Compositor's non-destructive editing approach, not a port of its full Camera Raw system. Chroma key works with solid-color backgrounds; AI subject segmentation is not implemented. See [COMPOSITOR-NOTES.md](COMPOSITOR-NOTES.md) for the source analysis, implemented scope and planned intelligent tools.

## Using AI

Click “AI 助手” (AI Assistant) at the top and enter the API base URL, model ID and key for a text or speech service. Subtitle polishing/translation requires existing subtitles. For transcription, first select a video or audio clip containing sound, up to 30 minutes per request.

Services must support the OpenAI Chat Completions / Audio Transcriptions protocols. Speech models must support segment timestamps, such as a compatible service configured with `whisper-1`. Keys are kept only in the current server process's memory, never in the project or on disk; enter them again after restarting. The API base URL and model ID are saved in local configuration.

Only after clicking “发送并生成” (Send and Generate) is the selected subtitle text or clip audio sent to the configured service, which may charge for usage. Preview the result first; the project changes only after clicking “应用到时间线” (Apply to Timeline). See [API.md](API.md) for developer endpoints and request examples. No model service or free API credits are included.

## Basic workflow

1. Import media, then click its + button or drag it onto a compatible track.
2. Select a clip and edit its properties in the right panel. Click the ruler to move the playhead.
3. Split at the playhead or drag either edge to trim. Clips on the same video or audio track cannot overlap; this restriction does not apply to the subtitle track.
4. Add subtitles or import SRT; add music to an audio track.
5. Click “导出视频” (Export Video). Output is saved under `exports/` in the data directory, and can also be saved elsewhere using the completed export's download button.

Shortcuts: Space to play/pause, Ctrl+B to split, Ctrl+D to duplicate, Delete to remove, Ctrl+Z to undo, Ctrl+Shift+Z to redo, Ctrl+S to download the project, and Left/Right arrows to step through frames.

## Data and current limitations

Browser mode defaults to `.local/`; desktop mode uses `%LOCALAPPDATA%\FCUT\data`. The `.local` paths below refer to browser mode. Media libraries are not automatically migrated between modes.

- The server listens only on 127.0.0.1. Ordinary editing/export stays local; explicitly using AI uploads only selected text/audio. Importing **copies** files into `.local/media/`, so allow enough disk space. Moving clips stores edit instructions without repeatedly copying source media.
- `.local/project.json` is the autosaved project. Downloaded `.fcut` files contain edit information and media IDs, **not the media itself**. They currently require the same media library; media relinking and project packaging are not supported.
- Preview depends on browser codec support; H.264/AAC MP4 is preferred. Some MOV/MKV/HEVC files can be imported/exported but cannot be previewed. Proxy transcoding is not implemented.
- Preview uses browser media elements and a master clock, not a professional frame-synchronized engine. Complex media may cause switching delays. Browser subtitle layout and FFmpeg export can differ slightly in wrapping, glyphs and margins.
- Audio preview includes gain and fades. Export also applies limiting to avoid mix overload, so peaks may sound slightly different.
- Eased keyframes, transition presets, speed curves, curves/LUT file import, AI subject segmentation, offline speech recognition, audio waveform analysis and a commercial asset library are not implemented. Vertical lines on audio clips are decorative, not real waveforms.
- Export currently uses CPU H.264. Real-time multitrack 4K performance and extremely low RAM usage are not guaranteed. Limits: 10 GiB (10,737,418,240 bytes) per asset, 500 clips and 6 hours per project.
- Only one export can run at a time. Use one editor window while editing.

## Validation

See [VALIDATION.md](VALIDATION.md) for the full check record and reproduction commands. CI checks both archive size and total unpacked size; either exceeding 100,000,000 bytes fails the build.

`node --test tests/*.test.mjs` covers source-time mapping, track constraints, subtitle parsing and export graphs. `node tests/integration.mjs` generates synthetic media, runs a real export on an isolated port with a temporary data directory, and checks duration, audio and subtitle pixels. Browser tests use Playwright; see `tests/browser.mjs`.

## Roadmap

1. Shared preview/export composition descriptions, proxy previews, synchronization stability and real waveforms.
2. Track reordering/deletion, visual keyframe editing and easing, transition presets and curve-based grading.
3. Media relinking, project packaging, signed desktop releases and an installer.
4. Offline speech recognition, segmentation and other intelligent tools.

## License

FCUT's own source code uses the [MIT License](LICENSE). Node, FFmpeg, WebView2 and other components retain their own licenses. Public distribution of portable binaries must satisfy the applicable license and corresponding-source requirements; see [third-party notices](THIRD_PARTY_NOTICES.md).
