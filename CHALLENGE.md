# Can you make FCUT smaller without removing features?

**Current reference: approximately 80.4 MB unpacked, including Node.js, FFmpeg and FFprobe. Goal: keep the same useful editing workflow and beat that size.**

This is an open engineering challenge, not a claim to be the world's smallest editor. It is a working early prototype, not a full replacement for CapCut. Smaller implementations and honest trade-offs are welcome.

## 比什么 / What counts

- Primary metric: total logical file bytes of the ready-to-run Windows x64 application, including its application-specific runtime and media engine. Use decimal MB (1 MB = 1,000,000 bytes), and also report MiB.
- Count downloaded components needed for the baseline features, even if they download only on first use. Moving FFmpeg outside the application folder does not make it disappear from the comparison.
- The baseline reuses the Windows browser and system fonts. Disclose all additional OS dependencies; a self-contained-browser build is a different comparison class.
- Report ZIP/download size separately from unpacked size. Do not compare one project's archive with another project's installed files.
- Exclude user footage, exported movies, development tools, screenshots and test fixtures. Disclose every exclusion.
- Cloud AI model weights are excluded because AI is an optional remote service. Local editing and exporting must still work offline. Do not replace local video export with an undisclosed cloud service.
- Report startup time, peak memory and export time on the same hardware and fixtures. A smaller file can still use more memory or start more slowly.

## 不能删的功能 / Baseline behavior

1. Local media import, metadata and thumbnails, including video, audio and still images.
2. Two video tracks, two audio tracks and a subtitle track; overlays and audio mixing.
3. Drag, trim, split, duplicate, delete, snapping, timeline zoom, undo/redo and frame stepping.
4. 0.25–4× speed, image scaling/position, horizontal/vertical/square canvas.
5. Original audio and music volume, mute and fades.
6. Chinese/manual subtitles and SRT import; editable text, size, color, position and background.
7. Autosave, project save/reopen and local MP4 export with real rendered subtitles and mixed audio.
8. Optional configurable model APIs for subtitle polish, translation and timestamped transcription; preview before applying and no API keys in saved projects.

Preserve the currently supported media formats. If changing the engine or codec build, list codecs/demuxers removed and show equivalent support for the existing import/export paths. A reduced-format experiment can still be submitted but will be listed separately.

## 如何提交 / How to submit

Open a **Size challenge** issue or submit a pull request with:

- Source commit, build commands and artifact SHA-256.
- Unpacked total bytes, archive bytes and a per-component size breakdown.
- Runtime, codec, browser, font and network dependencies.
- Test results: unit tests, real FFmpeg export, browser editing and AI mock-provider checks.
- Startup, memory and export measurements; OS/CPU/RAM and fixture description.
- Any regressions or trade-offs. No claims based only on an empty application shell.

For FCUT's current layout:

```powershell
node --test tests/*.test.mjs
node tests/integration.mjs
# Optional: install Playwright and set BROWSER_PATH if Edge is not installed.
node tests/browser.mjs
node scripts/measure-size.mjs
```

`SIZE-REPORT.json` is a reference measurement, not a universal performance guarantee. Adding documentation or using different tool versions changes the exact total. Use a fresh measurement for each entry.

欢迎用更好的依赖复用、更小的运行时、更高效的媒体管线，或者彻底不同的实现来挑战。**功能保留、体积算清、结果可复现，就来 PR。**
