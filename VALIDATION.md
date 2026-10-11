# FCUT 0.3.1 检查记录

检查日期：2026-10-12（Asia/Shanghai）。以下为本机结果；最新 CI 状态以 [GitHub Actions](https://github.com/Geraltzhang/Fcut/actions) 为准。

| 检查 | 结果 | 范围 |
| --- | --- | --- |
| 单元测试 | 16 项通过 | 时间映射、轨道与参数校验、分割连续性、调色缓存、AI 输入输出与密钥处理 |
| 媒体集成测试 | 通过 | 实际 FFmpeg 导出、字幕像素、音轨、时长、范围请求 |
| 效果导出测试 | 通过 | 裁剪、调色、色键透明、图层顺序、淡化及位置/缩放/透明度动画 |
| 编辑器浏览器测试 | 通过 | 导入、拖动、裁剪片段、撤销重做、AI mock、新增轨道转字幕、导出、恢复工程 |
| 效果浏览器测试 | 通过 | WebGL 实际像素、调色/色键、关键帧控件、新增轨道与保存恢复 |
| 桌面后台测试 | 通过 | 动态端口、认证、保存、标准输入退出、父进程断开、损坏工程保留 |
| 原生桌面编译 | 通过 | Windows x64 C# + WebView2 SDK |
| 原生窗口启动/下载/退出烟测 | **受阻，未通过验收** | 本机 Windows Application Control 阻止生成的未签名 EXE；浏览器测试不代表原生窗口已验证 |

## 本轮修复与优化

- 新增画面/音频轨上的素材可以调用语音转字幕，不再被固定轨道列表误拒绝。
- JSON 损坏或读权限失败时明确停止启动并保留原文件，不再静默恢复空工程。
- 多轨调色查找表缓存最多 32 组（约 32 KB 像素数据），避免每帧切换图层重复计算同一调色表；没有删除效果或编码器。
- 原生下载对话框改为 WebView2 deferral 后显示，避免嵌套事件循环。依据 [Microsoft threading model](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/threading-model)。原生关闭超时/取消后恢复编辑状态，启动途中关闭不再继续初始化已销毁窗口。
- 包名跟随版本号；自动测量、生成校验和及 ZIP 外的 JSON 报告。压缩包和展开文件分别受 100,000,000 字节上限约束。

## 复现

```powershell
node --test tests/*.test.mjs
node tests/desktop-server.mjs
node tests/integration.mjs
node tests/effects-integration.mjs
# 安装可选测试依赖：npm install --no-save --package-lock=false playwright
node tests/browser.mjs
node tests/effects-browser.mjs
powershell -NoProfile -File scripts/build-desktop.ps1
powershell -NoProfile -File scripts/package.ps1
```

原生烟测命令为 `scripts/test-desktop.ps1`，需在允许执行该开发构建且没有其他 FCUT 桌面窗口的 Windows 环境运行。本项目不会修改系统应用控制策略。

体积约 81.5 MB 展开，具体以 `SIZE-REPORT.json` 和 ZIP 旁的 `.json` 报告为准。报告明确排除了系统 .NET Framework、WebView2 Runtime、字体、用户素材和开发测试产物；打包仍包含 Node、FFmpeg、FFprobe 和桌面 SDK。尚未做代表性大型工程的性能基准、HDR 色彩管理或原生签名发行验证。
