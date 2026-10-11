import { spawn, execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { newProject, makeClip, makeText } from '../app/model.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = path.join(root, 'test-results', 'integration'); await fs.mkdir(temp, { recursive: true });
const ffmpeg = process.env.FFMPEG_PATH || path.join(root, 'tools', 'ffmpeg.exe'), ffprobe = process.env.FFPROBE_PATH || path.join(root, 'tools', 'ffprobe.exe');
const ff = args => execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { windowsHide: true, maxBuffer: 20 * 1024 ** 2 });
ff(['-f', 'lavfi', '-i', 'color=c=0x163c72:s=640x360:r=30:d=6', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(temp, 'blue.mp4')]);
ff(['-f', 'lavfi', '-i', 'color=c=0xd54836:s=320x180:r=30:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(temp, 'red.mp4')]);
ff(['-f', 'lavfi', '-i', 'sine=frequency=660:duration=3', path.join(temp, 'music.wav')]);
const port = 4318, base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server.mjs'], { cwd: root, windowsHide: true, env: { ...process.env, PORT: String(port), FCUT_DATA_DIR: path.join(temp, 'data') } });
let logs = ''; child.stdout.on('data', b => logs += b); child.stderr.on('data', b => logs += b);
try {
  let html;
  for (let i = 0; i < 60; i++) { try { html = await (await fetch(base)).text(); if (html.includes('fcut-token')) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  assert.ok(html?.includes('fcut-token'), logs);
  const token = html.match(/name="fcut-token" content="([^"]+)"/)[1];
  const api = async (route, options = {}) => { const res = await fetch(base + route, { ...options, headers: { 'X-Fcut-Token': token } }); const b = await res.json(); assert.ok(res.ok, JSON.stringify(b)); return b; };
  assert.equal((await fetch(base + '/api/state')).status, 403);
  assert.equal((await fetch(base + '/api/state', { headers: { 'X-Fcut-Token': token, Origin: 'https://external.example' } })).status, 403);
  const upload = async file => api('/api/assets?name=' + file, { method: 'POST', body: await fs.readFile(path.join(temp, file)) });
  const blue = await upload('blue.mp4'), red = await upload('red.mp4'), music = await upload('music.wav');
  assert.equal(blue.kind, 'video'); assert.equal(music.kind, 'audio'); assert.equal(blue.hasAudio, true);
  const p = newProject(); p.name = '端到端验证'; p.width = 1280; p.height = 720;
  p.clips = [
    { ...makeClip(blue, 'v1'), sourceIn: .2, duration: 4, speed: 1.25, volume: .4 },
    { ...makeClip(red, 'v2', 1), duration: 1, scale: .4 },
    { ...makeClip(music, 'a1'), duration: 4, speed: .5, volume: .25, fadeIn: .5, fadeOut: .5 },
    makeText(2.5, 1, '你好，世界 · FCUT 100%'),
  ];
  await api('/api/project', { method: 'PUT', body: JSON.stringify(p) });
  assert.equal((await api('/api/state')).project.name, p.name);
  const range = await fetch(base + '/media/' + blue.id, { headers: { Range: 'bytes=0-99' } }); assert.equal(range.status, 206); assert.equal((await range.arrayBuffer()).byteLength, 100);
  const { id } = await api('/api/export', { method: 'POST', body: JSON.stringify(p) });
  let j;
  for (let i = 0; i < 240; i++) { j = await api('/api/jobs/' + id); if (['done', 'failed'].includes(j.status)) break; await new Promise(r => setTimeout(r, 250)); }
  assert.equal(j.status, 'done', j.error);
  const output = path.join(temp, 'verified.mp4'); await fs.writeFile(output, Buffer.from(await (await fetch(base + '/exports/' + id)).arrayBuffer()));
  const probe = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', output], { encoding: 'utf8', windowsHide: true }));
  assert.ok(Math.abs(+probe.format.duration - 4) < .15); assert.ok(probe.streams.some(s => s.codec_type === 'audio')); assert.equal(probe.streams.find(s => s.codec_type === 'video').width, 1280);
  const pixels = t => ff(['-ss', String(t), '-i', output, '-frames:v', '1', '-vf', 'scale=320:180', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1']);
  const before = pixels(.5), overlay = pixels(1.5), caption = pixels(3);
  const center = (90 * 320 + 160) * 3;
  assert.ok(before[center + 2] > before[center], 'base must be blue'); assert.ok(overlay[center] > overlay[center + 2] + 50, 'upper track must be red');
  let bright = 0;
  for (let y = 140; y < 165; y++) for (let x = 30; x < 290; x++) { const k = (y * 320 + x) * 3; if (caption[k] > 175 && caption[k + 1] > 175 && caption[k + 2] > 175) bright++; }
  assert.ok(bright > 60, `caption pixels missing: ${bright}`);
  const jobFiles = await fs.readdir(path.join(temp, 'data', 'jobs', id));
  assert.ok(!jobFiles.includes('font.ttf'), 'export must reuse system font without copying it');
  ff(['-ss', '3', '-i', output, '-frames:v', '1', path.join(temp, 'export-frame.png')]);
  console.log(JSON.stringify({ ok: true, duration: probe.format.duration, streams: probe.streams.map(s => s.codec_type), subtitlePixels: bright, output }, null, 2));
} finally { child.kill(); }
