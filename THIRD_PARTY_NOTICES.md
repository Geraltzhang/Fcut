# Third-party components

The MIT license in this repository covers FCUT's own source code. Separately downloaded tools retain their own licenses; FCUT's license does not relicense them.

| Component | Use | Upstream and license information |
| --- | --- | --- |
| Node.js | Local application server and JavaScript runtime | https://github.com/nodejs/node — see the LICENSE distributed with the exact version |
| FFmpeg / FFprobe | Media probing, thumbnails, audio extraction and video rendering | https://ffmpeg.org/ and https://ffmpeg.org/legal.html — license depends on the build configuration |
| Gyan Windows builds | Development reference binaries | https://www.gyan.dev/ffmpeg/builds/ — preserve the supplied license, build details and applicable source-distribution obligations |
| UPX | Optional lossless executable packing | https://github.com/upx/upx — see COPYING and LICENSE in the upstream distribution |
| Playwright | Optional browser tests only; not part of runtime | https://github.com/microsoft/playwright — Apache-2.0 |

This source repository does not include FFmpeg, Node, UPX executables, a web browser, fonts, user media, or API credentials. Setup scripts download tools from their upstream sources. The reference portable build uses Node 24.19.0, Gyan FFmpeg 9.0.2 essentials and UPX 5.2.0. The FFmpeg reference configuration includes GPL-enabled components. Retain the applicable third-party notices and satisfy corresponding source obligations when independently distributing binaries; the MIT source release is not a blanket license for every downloaded component.

The application reuses Windows-installed browser and fonts. These are not distributed by this repository. No Compositor source code is included.
