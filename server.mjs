import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { newProject, validateProject, durationOf } from './app/model.mjs';
import { buildRender, tempoFilters } from './lib/render.mjs';
import { AIService } from './lib/ai.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const data = process.env.FCUT_DATA_DIR || path.join(root, '.local');
for (const d of ['media', 'thumbs', 'exports', 'jobs']) await fsp.mkdir(path.join(data, d), { recursive: true });
const token = randomBytes(24).toString('hex');
const port = Number(process.env.PORT || 4317);
const binary = name => process.env[name.toUpperCase() + '_PATH'] || path.join(root, 'tools', process.platform === 'win32' ? `${name}.exe` : name);
const ffmpeg = binary('ffmpeg'), ffprobe = binary('ffprobe');
let assets = await readJson('assets.json', []);
let project = await readJson('project.json', newProject());
const ai = new AIService(await readJson('ai-settings.json', {}));
if (process.env.FCUT_TEXT_API_KEY) ai.update({ text: { key: process.env.FCUT_TEXT_API_KEY } });
if (process.env.FCUT_SPEECH_API_KEY) ai.update({ speech: { key: process.env.FCUT_SPEECH_API_KEY } });
let aiBusy = false;
const jobs = new Map();
let activeJob = null;
let writeQueue = Promise.resolve();
async function readJson(file, fallback) { try { return JSON.parse(await fsp.readFile(path.join(data, file), 'utf8')); } catch { return fallback; } }
function persist(file, value) {
  const contents = JSON.stringify(value, null, 2);
  const task = writeQueue.then(async () => { const target = path.join(data, file); await fsp.writeFile(target + '.tmp', contents); await fsp.rename(target + '.tmp', target); });
  writeQueue = task.catch(() => {}); return task;
}
function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, ...options }); let stdout = '', stderr = '', processError;
    child.stdout.on('data', b => stdout += b); child.stderr.on('data', b => { stderr = (stderr + b).slice(-12000); });
    child.on('error', e => { processError = e; }); child.on('close', code => processError ? reject(processError) : code === 0 ? resolve(stdout) : reject(Error(stderr || `进程退出 ${code}`)));
  });
}
function publicAsset(a) { const { path: localPath, ...rest } = a; return rest; }
function json(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
async function body(req) {
  let size = 0, chunks = [];
  for await (const b of req) { size += b.length; if (size > 4 * 1024 * 1024) throw Error('请求过大'); chunks.push(b); }
  return JSON.parse(Buffer.concat(chunks).toString());
}
async function serveFile(req, res, file, type, downloadName) {
  const stat = await fsp.stat(file);
  const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
  if (downloadName) headers['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`;
  const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
  if (req.headers.range && !range) { res.writeHead(416); return res.end(); }
  let start = 0, end = stat.size - 1, status = 200;
  if (range) {
    start = +range[1]; end = range[2] ? Math.min(+range[2], end) : end;
    if (start > end || start >= stat.size) { res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }); return res.end(); }
    status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
  }
  headers['Content-Length'] = end - start + 1;
  res.writeHead(status, headers);
  if (req.method === 'HEAD') return res.end();
  const stream = fs.createReadStream(file, { start, end }); stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res);
}
async function importMedia(req, url) {
  if (!fs.existsSync(ffprobe)) throw Error('FFmpeg 尚未安装，请运行 scripts/setup-ffmpeg.ps1');
  const name = path.basename(url.searchParams.get('name') || 'media');
  const ext = path.extname(name).toLowerCase();
  if (!['.mp4', '.mov', '.mkv', '.webm', '.m4v', '.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.png', '.jpg', '.jpeg', '.webp'].includes(ext)) throw Error('不支持这个素材格式');
  const id = randomUUID(); const file = path.join(data, 'media', id + ext);
  const length = Number(req.headers['content-length']);
  if (!Number.isFinite(length) || length <= 0 || length > 10 * 1024 ** 3) throw Error('单个素材须小于 10 GB');
  try {
    await pipeline(req, fs.createWriteStream(file, { flags: 'wx' }));
    const info = JSON.parse(await run(ffprobe, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file]));
    const video = info.streams.find(s => s.codec_type === 'video' && !s.disposition?.attached_pic);
    const audio = info.streams.find(s => s.codec_type === 'audio');
    const image = ['.png', '.jpg', '.jpeg', '.webp'].includes(ext);
    const kind = image ? 'image' : video ? 'video' : audio ? 'audio' : null;
    const duration = image ? 5 : Number(info.format.duration || video?.duration || audio?.duration);
    if (!kind || !Number.isFinite(duration) || duration <= 0) throw Error('无法读取素材时长');
    const a = { id, name, path: file, kind, duration, width: video?.width || 0, height: video?.height || 0, hasAudio: !!audio, size: (await fsp.stat(file)).size };
    if (video) {
      try { await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', file, '-frames:v', '1', '-vf', 'scale=320:180:force_original_aspect_ratio=decrease', '-threads', '1', path.join(data, 'thumbs', id + '.jpg')]); a.thumbnail = `/thumbs/${id}`; } catch {}
    }
    assets.push(a); await persist('assets.json', assets); return publicAsset(a);
  } catch (e) { await fsp.unlink(file).catch(() => {}); throw e; }
}
async function startExport(p) {
  validateProject(p, assets);
  if (!durationOf(p)) throw Error('请先添加片段');
  if (activeJob) throw Error('已有导出任务，请等待完成或取消');
  if (!fs.existsSync(ffmpeg)) throw Error('未找到 FFmpeg');
  const id = randomUUID(), dir = path.join(data, 'jobs', id), output = path.join(data, 'exports', id + '.mp4');
  const job = { id, status: 'preparing', progress: 0, name: p.name, error: '' }; jobs.set(id, job); activeJob = id;
  try {
    await fsp.mkdir(dir);
    const fonts = process.platform === 'win32' ? ['C:/Windows/Fonts/msyh.ttc', 'C:/Windows/Fonts/simhei.ttf', 'C:/Windows/Fonts/arial.ttf'] : ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'];
    const font = fonts.find(f => fs.existsSync(f));
    const texts = p.clips.filter(c => c.kind === 'text'), names = [];
    if (texts.length && !font) throw Error('未找到字幕字体');
    for (let i = 0; i < texts.length; i++) { const name = `text-${i}.txt`; await fsp.writeFile(path.join(dir, name), texts[i].text); names.push(name); }
    const args = buildRender(p, assets, output, names, font?.replaceAll('\\', '/').replaceAll(':', '\\:'));
    await fsp.writeFile(path.join(dir, 'project.json'), JSON.stringify(p, null, 2));
    const child = spawn(ffmpeg, args, { cwd: dir, windowsHide: true }); job.child = child; job.status = 'rendering';
    let stderr = '', progressBuffer = '';
    child.stderr.on('data', b => { stderr = (stderr + b).slice(-12000); });
    child.stdout.on('data', b => {
      progressBuffer += b; const lines = progressBuffer.split('\n'); progressBuffer = lines.pop();
      for (const line of lines) if (line.startsWith('out_time_us=')) job.progress = Math.min(.99, Math.max(0, Number(line.slice(12)) / 1e6 / durationOf(p)));
    });
    child.on('error', e => { job.status = 'failed'; job.error = e.message; activeJob = null; delete job.child; });
    child.on('close', async code => {
      if (job.status !== 'cancelled') { job.status = code === 0 ? 'done' : 'failed'; job.progress = code === 0 ? 1 : job.progress; job.error = code === 0 ? '' : stderr.slice(-3000); }
      activeJob = null; delete job.child;
      await fsp.writeFile(path.join(dir, 'ffmpeg.log'), stderr).catch(() => {});
      if (code !== 0) await fsp.unlink(output).catch(() => {});
    });
    return { id };
  } catch (e) { activeJob = null; job.status = 'failed'; job.error = e.message; throw e; }
}
async function transcribe(input, signal) {
  const c = input.clip;
  validateProject({ ...newProject(), clips: [c] }, assets);
  const asset = assets.find(a => a.id === c.assetId);
  if (!asset?.hasAudio || !['video', 'audio'].includes(c.kind)) throw Error('请选择有声音的视频或音频片段');
  if (c.duration > 1800) throw Error('请先把片段分割为不超过 30 分钟，再识别字幕');
  if (input.language && !/^[a-z]{2,3}$/.test(input.language)) throw Error('语言须为 ISO 语言代码，例如 zh 或 en，自动检测请留空');
  ai.ready('speech');
  const dir = await fsp.mkdtemp(path.join(data, 'jobs', 'asr-'));
  const output = path.join(dir, 'audio.wav'), subtitles = [];
  try {
    for (let offset = 0; offset < c.duration; offset += 240) {
      signal.throwIfAborted(); const seconds = Math.min(240, c.duration - offset);
      await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(c.sourceIn + offset * c.speed), '-t', String(seconds * c.speed), '-i', asset.path, '-vn', '-af', `${tempoFilters(c.speed)},atrim=duration=${seconds}`, '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', output], { signal });
      const segments = await ai.transcribeChunk(await fsp.readFile(output), input.language, signal);
      for (const s of segments) {
        const start = Math.max(0, s.start), end = Math.min(seconds, s.end);
        if (end - start >= .04) subtitles.push({ start: c.start + offset + start, duration: end - start, text: s.text });
      }
      if (subtitles.length > 500) throw Error('识别结果超过 500 条，请分割片段后识别');
    }
    return { subtitles };
  } finally {
    await fsp.unlink(output).catch(() => {}); await fsp.rmdir(dir).catch(() => {});
  }
}
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!allowedHosts.includes(req.headers.host)) return json(res, 403, { error: 'Host rejected' });
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      if (req.headers['x-fcut-token'] !== token) return json(res, 403, { error: '请刷新编辑器' });
      if (req.headers.origin && !allowedHosts.some(h => req.headers.origin === `http://${h}`)) return json(res, 403, { error: 'Origin rejected' });
      if (url.pathname === '/api/ai/config' && req.method === 'GET') return json(res, 200, ai.publicConfig());
      if (url.pathname === '/api/ai/config' && req.method === 'PUT') {
        if (aiBusy) throw Error('请等待当前 AI 任务完成再更改服务');
        const result = ai.update(await body(req)); await persist('ai-settings.json', ai.diskConfig()); return json(res, 200, result);
      }
      if (['/api/ai/subtitles', '/api/ai/transcribe'].includes(url.pathname) && req.method === 'POST') {
        if (aiBusy) return json(res, 409, { error: '已有 AI 任务进行中' });
        aiBusy = true; const controller = new AbortController();
        res.on('close', () => { if (!res.writableEnded) controller.abort(); });
        try { const input = await body(req); const result = url.pathname.endsWith('/transcribe') ? await transcribe(input, controller.signal) : await ai.subtitles(input, controller.signal); return json(res, 200, result); }
        finally { aiBusy = false; }
      }
      if (url.pathname === '/api/state' && req.method === 'GET') return json(res, 200, { project, assets: assets.map(publicAsset), engine: fs.existsSync(ffmpeg) && fs.existsSync(ffprobe) });
      if (url.pathname === '/api/assets' && req.method === 'POST') return json(res, 201, await importMedia(req, url));
      if (url.pathname === '/api/project' && req.method === 'PUT') { const p = await body(req); validateProject(p, assets); await persist('project.json', p); project = p; return json(res, 200, { saved: true }); }
      if (url.pathname === '/api/export' && req.method === 'POST') return json(res, 202, await startExport(await body(req)));
      const match = url.pathname.match(/^\/api\/jobs\/([\w-]+)$/);
      if (match) {
        const job = jobs.get(match[1]); if (!job) return json(res, 404, { error: '任务不存在' });
        if (req.method === 'DELETE' && job.child) { job.status = 'cancelled'; job.child.kill(); }
        const { child, ...safe } = job; return json(res, 200, safe);
      }
      return json(res, 404, { error: '接口不存在' });
    }
    if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: 'Method not allowed' });
    const media = url.pathname.match(/^\/(media|thumbs|exports)\/([\w-]+)$/);
    if (media) {
      const [, kind, id] = media;
      if (kind === 'exports') { const job = jobs.get(id); if (job?.status !== 'done') return json(res, 404, { error: '文件未就绪' }); return await serveFile(req, res, path.join(data, 'exports', id + '.mp4'), 'video/mp4', job.name + '.mp4'); }
      const asset = assets.find(a => a.id === id); if (!asset) return json(res, 404, { error: '素材不存在' });
      if (kind === 'thumbs') return await serveFile(req, res, path.join(data, 'thumbs', id + '.jpg'), 'image/jpeg');
      const mime = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.m4v': 'video/mp4', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
      return await serveFile(req, res, asset.path, mime[path.extname(asset.path)] || 'application/octet-stream');
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const html = (await fsp.readFile(path.join(root, 'app', 'index.html'), 'utf8')).replace('__TOKEN__', token);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'" }); return res.end(html);
    }
    const files = { '/app.mjs': 'text/javascript', '/ai-ui.mjs': 'text/javascript', '/model.mjs': 'text/javascript', '/style.css': 'text/css' };
    if (files[url.pathname]) return await serveFile(req, res, path.join(root, 'app', url.pathname.slice(1)), files[url.pathname]);
    return json(res, 404, { error: 'Not found' });
  } catch (e) { if (!res.headersSent && !res.destroyed) json(res, 400, { error: e.message }); }
});
server.listen(port, '127.0.0.1', () => console.log(`FCUT ready http://127.0.0.1:${port}`));
server.on('error', e => { console.error(e.message); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { for (const j of jobs.values()) j.child?.kill(); server.close(); });
