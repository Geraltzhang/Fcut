# Compositor reference and FCUT implementation

Reviewed upstream commit: [a1bd74c](https://github.com/robbietilton/Compositor/tree/a1bd74c9bc055f876882dd6fd9fe6b851ef03a20).

Compositor is a macOS still-image editor, not a video editor. Its image layers are useful architectural references, but they do not provide a video timeline, video keyframes, or clip transitions to transplant.

## What its grading does

- [CameraRaw.swift](https://github.com/robbietilton/Compositor/blob/a1bd74c9bc055f876882dd6fd9fe6b851ef03a20/Compositor/Document/CameraRaw.swift) stores editable settings, builds a composed lookup table through `CameraRawTables`, and runs C pixel kernels. Curves, color mixing/grading, detail, optics, and spatial effects have separate stages. It is not merely a CSS filter or a call to a language model.
- [ImageAdjustments.swift](https://github.com/robbietilton/Compositor/blob/a1bd74c9bc055f876882dd6fd9fe6b851ef03a20/Compositor/Document/ImageAdjustments.swift) includes the sRGB decode → linear-light exposure → sRGB encode approach. Exposure uses stops; it is not simply adding brightness to encoded RGB.
- [LayerAdjustment.swift](https://github.com/robbietilton/Compositor/blob/a1bd74c9bc055f876882dd6fd9fe6b851ef03a20/Compositor/Document/LayerAdjustment.swift) describes serializable, editable adjustment layers. [AdjustmentSurface.swift](https://github.com/robbietilton/Compositor/blob/a1bd74c9bc055f876882dd6fd9fe6b851ef03a20/Compositor/Rendering/AdjustmentSurface.swift) renders offscreen surfaces and accounts for screen scale and spatial-filter padding.
- [SubjectRemoval.swift](https://github.com/robbietilton/Compositor/blob/a1bd74c9bc055f876882dd6fd9fe6b851ef03a20/Compositor/Document/SubjectRemoval.swift) uses Apple's `VNGenerateForegroundInstanceMaskRequest`, caches the generated mask, then refines edges, contrast and edge shift. This framework is not available on Windows. Still-image masks also need temporal stabilization to become good video mattes.

## Implemented in FCUT

FCUT uses its own JavaScript/WebGL/FFmpeg implementation; Swift, Apple frameworks, upstream lookup-table binaries and pretrained models are not bundled.

| Feature | Implementation |
| --- | --- |
| Expandable tracks | Add video/audio tracks up to 32 total; stored with the project. Top video track covers lower tracks. Old projects retain the original five tracks. |
| Basic grading | Exposure in linear-light stops, contrast, saturation, relative warmth. Shared parameter meanings; WebGL lookup textures for preview and FFmpeg RGB filters for export. |
| Crop | Non-destructive crop ratios on all four edges, followed by fit/scale/position. |
| Keyframes | Linear position, scale and opacity tracks in clip-local seconds. Endpoint hold, split continuity, trim remapping and speed retiming. |
| Transitions | Per-clip visual fade in/out. Overlap clips on different tracks and fade the upper one for a dissolve. Same-track overlap and transition presets are not implemented. |
| Chroma key | Color, similarity and edge softness; transparency composites over lower video tracks in preview/export. This is not AI subject segmentation. |

The common order is crop → color key → exposure/contrast/warmth → saturation → transform → opacity/fade → layer composition → subtitles. Effects are saved as parameters; original media is untouched. Preview and H.264 export can differ slightly due to scaling, color conversion, codec loss and color-key sampling. This is SDR RGB grading, not full Camera Raw, HDR or a managed color workflow.

## Next adaptations, not yet implemented

1. RGB curves, levels and an editable adjustment stack: use a shared LUT representation and export the same tables; do not introduce separate preview-only looks.
2. Subject/background removal: keep mask inference separate from refinement, following Compositor. Use an explicitly configured segmentation API or an optional downloaded local model; never bundle large weights into the 100 MB base. A chat-completions endpoint does not supply pixel masks. Provider choice, mask format, video frame correspondence and cancellation need a concrete service integration before this can be enabled.
3. Mask refinement: guided filtering, feathering and edge contraction after inference. Video needs consistency across frames and scene cuts.
4. Content-aware fill/healing: investigate `Document/ContentFill.swift` and `Rendering/HealPixels.c`; still-image patch synthesis is not a ready-made temporally consistent video object-removal system.
5. Video-specific work: track reordering/removal, transition presets, easing curves and keyframe visualization must be built for FCUT; Compositor supplies no corresponding video implementation.

## License and verification

Upstream is MIT, copyright 2026 Wonder Assembly LLC. Direct source reuse is possible with its copyright and license notice preserved. This iteration references the architecture and standard color math and implements the FCUT code independently; it does not change third-party binary licenses.

Run `node --test tests/*.test.mjs`, `node tests/integration.mjs`, and `node tests/effects-integration.mjs`. With Playwright installed, run `node tests/browser.mjs` and `node tests/effects-browser.mjs` after generating the integration fixtures. Tests cover real export pixels, chroma transparency, grayscale, cropping, track order, animation, WebGL preview pixels, UI editing, and save/reload.
