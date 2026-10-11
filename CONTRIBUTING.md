# Contributing to FCUT

Bug fixes, accessibility improvements, media compatibility work and size reductions are welcome. Please describe the user-visible behavior and keep changes focused.

## Development

Use Node.js 22+ on Windows. Runtime source has no npm dependencies.

```powershell
powershell -NoProfile -File scripts/setup-ffmpeg.ps1
node server.mjs
node --test tests/*.test.mjs
node tests/integration.mjs
```

Open http://127.0.0.1:4317 . For browser tests, optionally install `npm install --no-save --package-lock=false playwright`, then run `node tests/browser.mjs`. Tests use Edge by default; set `BROWSER_PATH` to another Chromium executable or `PLAYWRIGHT_PATH` to an installed Playwright package. Run integration tests first to generate browser fixtures.

The AI browser tests use a local mock provider. Never use production API keys or upload private recordings in tests. Keep `.local/`, `.build/`, `tools/`, `runtime/`, `test-results/`, `.env` and credentials out of commits.

For a portable build, run `scripts/setup-runtime.ps1`, `scripts/setup-ffmpeg.ps1`, `scripts/compact.ps1`, `scripts/build-desktop.ps1`, `node scripts/measure-size.mjs` and `scripts/package.ps1`. Setup downloads must be online; normal editing and export run offline. The size report includes all runtime components but not shared .NET Framework, WebView2 Runtime, system browser and fonts. Tool versions affect the resulting size.

## Before opening a PR

- Run relevant tests; preserve the existing editing/export behavior.
- For API changes, include input validation and tests for secrets, malformed provider responses and cancellation.
- For size optimizations, follow [CHALLENGE.md](CHALLENGE.md), including measurements and trade-offs.
- Do not introduce cloud uploads or analytics as a default editing behavior.
- Avoid adding npm runtime dependencies for work supported by Node's built-in APIs.

Your contributions are made under this repository's MIT license. Third-party components retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

New visual effects: also run `node tests/effects-integration.mjs` and, with Playwright, `node tests/effects-browser.mjs`. Generate media fixtures with the integration scripts first. See [COMPOSITOR-NOTES.md](COMPOSITOR-NOTES.md).

Desktop builds: run `scripts/build-desktop.ps1` before `scripts/package.ps1`. Native lifecycle verification uses `scripts/test-desktop.ps1` and requires a policy that permits launching the unsigned development build; see [DESKTOP.md](DESKTOP.md).
