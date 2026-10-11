# FCUT

**80.4 MB 的多轨剪辑器，你能在不删功能的前提下做得更小吗？**

A small Windows video editor with local multitrack editing, subtitles, music and optional bring-your-own-model APIs. The reference portable build is approximately **80.4 MB unpacked, including Node + FFmpeg + FFprobe**. It reuses the system browser and fonts. This is an early prototype, not a complete CapCut replacement and not a verified world's-smallest claim.

**[参与体积挑战 / Size challenge](CHALLENGE.md) · [贡献指南](CONTRIBUTING.md) · [AI API](API.md) · [MIT License](LICENSE)**

### 从源码开始

安装 Node.js 22+ 后，在 Windows PowerShell 中运行：

```powershell
git clone https://github.com/Geraltzhang/Fcut.git
cd Fcut
powershell -NoProfile -File scripts/setup-ffmpeg.ps1
node server.mjs
```

打开 http://127.0.0.1:4317 。无需 `npm install`。Git 仓库只包含源码；便携运行时和媒体工具不提交到 Git。从源码组装便携版的方法见 [CONTRIBUTING.md](CONTRIBUTING.md)。

### 体积计算口径

参考便携版约 80.4 MB（约 76.7 MiB），媒体引擎约 56.8 MB，Node 运行时约 23.5 MB。用户素材、导出文件、测试产物和开发工具不计入软件本体；系统浏览器和字体为明确的共享依赖。使用 UPX 压缩现有可执行文件，没有通过移除编码器或现有功能来得到该数字。下载包大小和展开后的大小分别计算，压缩体积不代表运行内存。

欢迎提交更小的实现或 PR；请附上源码、构建步骤、依赖、测试和完整体积报告。详细规则见 [CHALLENGE.md](CHALLENGE.md)。

本地多轨剪辑工作台，第一阶段可运行原型。界面及应用服务零 npm 依赖。按贡献指南组装的便携版包含独立 Node 运行时、FFmpeg 和 FFprobe，无需另外安装 Node；源码仓库不附带这些二进制文件。支持浏览器模式，另提供 Windows Forms + WebView2 独立窗口封装（当前为未签名便携包，非安装器）。

## Windows 桌面版

已新增独立窗口封装，完整解压桌面便携包后运行 `FCUT.exe`。使用 Windows 自带/已安装的 .NET Framework 和 WebView2 Runtime；详细启动、数据位置、构建及验证限制见 [DESKTOP.md](DESKTOP.md)。当前开发机器的应用程序控制策略阻止未签名 EXE 启动，原生窗口验证尚未通过；不能把浏览器测试结果视为原生验证。

## 浏览器模式启动

Windows 双击 `Start-Fcut.cmd`，或执行 `node server.mjs` 后访问 http://127.0.0.1:4317 。启动器会启动隐藏的本地服务，浏览器关闭后服务仍运行。命令行启动时可用 Ctrl+C 停止服务。

组装便携版后，工作目录应包含 `runtime/node.exe`、`tools/ffmpeg.exe` 和 `tools/ffprobe.exe`。启动器优先使用附带的运行时。软件本体目标 100 MB，完整运行组件采用 UPX 无损压缩，没有删除原有编码器、滤镜和编辑功能。详见 `SIZE-REPORT.json`。依赖 Windows 已安装的浏览器和系统字体；用户素材、导出视频、测试产物另计。磁盘压缩不会等比例降低运行内存，首次启动需解压到内存。

若仅从源码恢复媒体引擎，可运行 `scripts/setup-ffmpeg.ps1`，然后运行 `scripts/compact.ps1` 恢复紧凑体积；也可用 FFMPEG_PATH、FFPROBE_PATH 指定现有工具。许可证位于 `tools/FFmpeg-LICENSE.txt` 和 `runtime/LICENSE.txt`。`scripts/package.ps1` 只打包运行所需文件，超过 100 MB 会拒绝打包，不会打包素材、测试数据或 API 配置。

## 已实现

- 本地导入视频、音频、PNG/JPEG/WebP；生成缩略图、读取媒体信息。
- 默认两条画面轨、两条配乐轨和字幕轨；可添加画面/配乐轨，最多共 32 条。高位画面覆盖低位画面。
- 拖动片段定位及跨兼容轨道移动；拖动两端修剪；吸附、时间线缩放。
- 分割、复制、删除、撤销/重做、逐帧定位。
- 0.25–4 倍速、画面缩放与位移、横竖屏和方形画布。
- 原声音量与配乐音量、静音、音频淡入淡出。
- 手动字幕、SRT 导入、字号/颜色/位置/背景设置。
- 自动保存、工程下载与重新打开。
- FFmpeg 真实 MP4 导出：多画面合成、字幕烧录、音频混合；进度、取消和下载。
- AI 接口：字幕润色、翻译、语音转字幕；文字/语音服务独立配置，结果预览、手动应用和撤销。

## 画面效果与 Compositor 借鉴

选中视频或图片，在右侧设置曝光、对比度、饱和度、冷暖、四边裁剪、透明度和色键抠像。所有效果同时用于预览和导出，可撤销并随工程保存。

关键帧支持水平/垂直位置、缩放和透明度：移动播放头，输入数值，再点击“添加 / 更新”。画面淡入/淡出以秒计；将片段放在不同画面轨上重叠，淡化上层可实现叠化。预览需要 WebGL。

这是参考 Compositor 非破坏编辑方式实现的基础版本，不等于移植其完整 Camera Raw。色键用于纯色背景，尚不具备 AI 主体抠像。源码分析、已实现范围及智能工具方案见 [COMPOSITOR-NOTES.md](COMPOSITOR-NOTES.md)。

## AI 使用

点击顶部“AI 助手”，填写文字或语音服务的 API 基础地址、模型 ID 和 Key。字幕润色/翻译需要已有字幕；语音转字幕须先选中有声音的视频或音频片段。服务兼容 OpenAI Chat Completions / Audio Transcriptions 协议；语音模型必须支持分段时间戳，例如配置为 whisper-1 的兼容服务。Key 仅在当前服务进程内存中保存，重启后重新填写，不写入工程和磁盘。

点击“发送并生成”后，所选字幕文字或片段音频才发送到配置的服务，可能产生服务商费用。结果先预览，点击“应用到时间线”才修改工程。开发 API 和请求示例见 [API.md](API.md)。AI 接口不附带免费额度或模型服务。

## 使用

1. 导入媒体，点击素材上的 +，或拖入相应轨道。
2. 点击片段选中，右侧编辑属性。点击标尺移动播放头。
3. 在播放头处分割，或拖动片段左右边缘裁切。相同轨道不允许片段重叠。
4. 添加字幕或导入 SRT；添加配乐到音频轨道。
5. 点击“导出视频”。输出保存在 `.local/exports/`，并可通过完成后的下载按钮另存。

快捷键：Space 播放/暂停，Ctrl+B 分割，Ctrl+D 复制，Delete 删除，Ctrl+Z 撤销，Ctrl+Shift+Z 重做，Ctrl+S 下载工程，左右方向键逐帧定位。

## 数据与当前边界

- 仅监听 127.0.0.1，普通剪辑/导出在本机进行；主动使用 AI 时仅上传所选文字/音频。导入会**复制**文件到 `.local/media/`，请预留磁盘空间。拖动素材仅保存编辑指令，不反复复制源文件。
- `.local/project.json` 为当前自动保存工程，`.fcut` 下载文件包含编辑信息和素材 ID，**不包含素材本身**；当前须在同一素材库打开，不支持素材重定位或工程打包。
- 当前预览依赖浏览器支持的编码，优先使用 H.264/AAC MP4。某些 MOV/MKV/HEVC 能导入和导出，但浏览器无法预览；尚未实现代理转码。
- 预览基于浏览器媒体元素和主时钟，尚非专业逐帧同步引擎；复杂素材下可能有切换延迟。字幕预览使用浏览器文字排版，导出使用 FFmpeg，换行、字形及边距可能略有差异。
- 音频预览包含增益与淡入淡出；导出额外使用限幅避免混音过载，峰值听感可能略有差别。
- 尚未实现缓动关键帧、转场预设、曲线变速、曲线/LUT 文件导入、智能主体抠像、离线语音识别、音频波形分析及商业素材库。音频片段上的竖线是装饰，不是真实波形。
- 导出当前使用 CPU H.264；不承诺 4K 多轨实时性能或极小内存占用。素材上限 10 GB/个，工程上限 500 个片段、6 小时。
- 同时只支持一个导出任务；编辑时请仅使用一个工作台窗口。

## 验证

`node --test tests/*.test.mjs` 验证源时间映射、轨道约束、字幕解析和导出图。`node tests/integration.mjs` 会生成合成测试素材，在独立端口和临时数据目录执行真实导出，并检查媒体时长、音频和字幕像素。浏览器测试使用 Playwright；详见 `tests/browser.mjs`。

## 后续实现顺序

1. 统一预览/导出合成描述、代理预览与同步稳定性、真实波形。
2. 轨道排序/删除、关键帧可视化与缓动、转场预设及曲线调色。
3. 素材重定位、工程打包、桌面签名发行与安装器。
4. 扩展离线语音识别、抠像和其他智能工具。
