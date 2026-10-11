# FCUT AI API

本地地址 `http://127.0.0.1:4317`。所有 `/api/*` 请求使用 `X-Fcut-Token` 请求头，值来自同源首页 `<meta name="fcut-token">`，服务重启后更新。不允许跨站 Origin。不要把本地接口开放到公网。

服务商接口基于 OpenAI-compatible Chat Completions 和 Audio Transcriptions；文字和语音可连接不同服务。不兼容这两种协议的服务需要另写适配器。

## 配置

`GET /api/ai/config` 返回每个服务的 `baseUrl`、`model`、`hasKey`；不会返回 Key。

`PUT /api/ai/config`

```json
{
  "text": {"baseUrl":"https://your-provider.example/v1","model":"your-text-model","key":"your-key"},
  "speech": {"baseUrl":"https://api.openai.com/v1","model":"whisper-1","key":"your-key"}
}
```

密钥仅存在本次后端进程内存，重启后需重新输入。可分别通过 `FCUT_TEXT_API_KEY` / `FCUT_SPEECH_API_KEY` 环境变量提供。配置文件 `.local/ai-settings.json` 仅存地址及模型名称。省略 `key` 保留当前密钥，传空字符串清除；改变地址时会先清除旧地址对应的密钥，避免发给另一服务。

API 基础地址要求 HTTPS，本机 `localhost` / `127.0.0.1` / `[::1]` 允许 HTTP。服务端拒绝重定向，避免 Authorization 被转发到意外目的地。基础地址不带 `/chat/completions` 或 `/audio/transcriptions`。

## 字幕润色 / 翻译

`POST /api/ai/subtitles`

```json
{"task":"translate","language":"英语","instruction":"保持口语表达","subtitles":[{"id":"clip-uuid","text":"你好，世界"}]}
```

`task` 为 `polish` 或 `translate`。最多 500 条、总计 10 万字，每批最多 40 条。仅发送字幕 ID 和文字，不发送视频、音频、时间线或源文件路径。向服务商请求 `/chat/completions`，从 `choices[0].message.content` 读取 JSON。验证 ID、顺序、条数和文字长度；异常时整次请求失败，不返回部分改写结果。

成功返回 `{"subtitles":[{"id":"clip-uuid","text":"Hello, world"}]}`，不改变原字幕时间。接口本身不会写入工程。

## 语音转字幕

`POST /api/ai/transcribe`

```json
{"clip":{"id":"...","assetId":"...","kind":"video","track":"v1","name":"clip.mp4","start":2,"duration":5,"sourceIn":0,"speed":1,"volume":1,"fadeIn":0,"fadeOut":0,"scale":1,"x":0,"y":0},"language":"zh"}
```

`clip` 为工程中的完整视频/音频片段对象；必须引用当前素材库的有效素材。`language` 可省略自动检测。单次片段最多 30 分钟，按最终时间线每 4 分钟提取一段 16kHz 单声道 WAV，并调用服务商 `/audio/transcriptions`，请求 `response_format=verbose_json`、`timestamp_granularities[]=segment`。

需要模型支持 `segments: [{start,end,text}]`。普通文字大模型不能代替语音模型；不返回分段时间戳的语音服务会明确报错，不编造字幕时间。音频只提取所选源入点和时长，并应用片段速度，返回时间戳已映射到时间线位置。音量和淡入淡出不应用到识别音频，以免影响识别。不会发送视频画面。

成功返回 `{"subtitles":[{"start":2.1,"duration":0.6,"text":"你好"}]}`。分块可能影响跨块语句，应用前请检查。临时 WAV 在完成、报错或取消后清理。接口本身不修改工程。

## 错误和取消

- 单次上游请求超时 120 秒；同一时刻允许一个 AI 任务。
- 输入或上游异常返回 HTTP 400 + `{"error":"..."}`；AI 忙返回 409。
- 关闭请求连接会取消后续处理；已发送到服务商的内容无法撤回，是否停止计费由服务商决定。
- 界面点击“发送并生成”才向所配置的服务发送选中内容；生成结果先预览，点击“应用到时间线”才写入，可撤销。

## 验证与参考

`tests/ai.test.mjs` 验证输入、密钥隐藏、模型结果验证、错误脱敏和 multipart 字段。`tests/browser.mjs` 使用本机模拟服务验证真实音频提取、字幕润色/翻译、预览应用、撤销、取消和错误结果处理。未配置真实服务商密钥时，不声称已完成真实模型质量或账号兼容性测试。

协议参考：[Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)、[Audio Transcriptions](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create)。
