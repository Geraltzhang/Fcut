import { TRACKS, tracksOf, addTrack, uid, newProject, makeClip, makeText, durationOf, endOf, splitClip, validateProject, parseSrt } from './model.mjs';
import { mountAI } from './ai-ui.mjs';
import { effectFields, bindEffectActions } from './effects-ui.mjs';
import { sliceAnimation } from './effects.mjs';
import { createPreview } from './preview-effects.mjs';
const $ = s => document.querySelector(s);
const token = $('meta[name=fcut-token]').content;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let project = newProject(), assets = [], selected = null, tab = 'media', time = 0, playing = false, px = 55, snap = true;
let history = [], future = [], saveTimer, toastTimer, jobId, dragState, audioContext;
let saveQueue = Promise.resolve(), saveRevision = 0, clockStart = 0, clockTime = 0;
let initialStateLoaded = false;
const elements = new Map();
const effectCanvas = document.createElement('canvas'); effectCanvas.id = 'effect-preview'; $('#visual-layers').append(effectCanvas);
let paintPreview; try { paintPreview = createPreview(effectCanvas); } catch (e) { setTimeout(()=>toast(e.message),0); }
const format = t => { const f = Math.floor(Math.max(0, t) * 100 + .001); return `${String(Math.floor(f / 360000)).padStart(2, '0')}:${String(Math.floor(f / 6000) % 60).padStart(2, '0')}:${String(Math.floor(f / 100) % 60).padStart(2, '0')}.${String(f % 100).padStart(2, '0')}`; };
const short = t => `${Math.floor(t / 60).toString().padStart(2, '0')}:${Math.floor(t % 60).toString().padStart(2, '0')}`;
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 4200); }
async function api(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { 'X-Fcut-Token': token, ...options.headers } });
  const result = await res.json(); if (!res.ok) throw Error(result.error || '请求失败'); return result;
}
function queueSave() {
  clearTimeout(saveTimer); $('#save-state').textContent = '有未保存更改'; const revision = ++saveRevision;
  const content = JSON.stringify(project);
  saveTimer = setTimeout(() => {
    saveQueue = saveQueue.catch(() => {}).then(() => api('/api/project', { method: 'PUT', body: content })).then(() => {
      if (revision === saveRevision) $('#save-state').textContent = '已自动保存';
    }).catch(e => { $('#save-state').textContent = '保存失败'; toast(e.message); });
  }, 450);
}
// The native host waits for this promise before stopping its owned backend.
window.fcutDesktopPrepareClose = async () => {
  pause();
  if (!initialStateLoaded) return confirm('工程尚未加载完成。现在关闭窗口？现有工程不会被替换。');
  try {
    const state = await api('/api/desktop/status');
    if (state.exporting && !confirm('正在导出视频。关闭 FCUT 将取消导出，是否继续？')) return false;
    document.body.inert = true;
    clearTimeout(saveTimer);
    await saveQueue.catch(() => {});
    await api('/api/project', { method: 'PUT', body: JSON.stringify(project) });
    return true;
  } catch (e) { document.body.inert = false; toast('保存失败，窗口保持打开：' + e.message); return false; }
};
function commit(fn) {
  pause(); const before = structuredClone(project);
  try { fn(); validateProject(project, assets); }
  catch (e) { project = before; toast(e.message); render(); return false; }
  history.push(before); if (history.length > 60) history.shift(); future = []; queueSave(); render(); return true;
}
function undo() { if (!history.length) return; pause(); future.push(structuredClone(project)); project = history.pop(); selected = null; queueSave(); render(); }
function redo() { if (!future.length) return; pause(); history.push(structuredClone(project)); project = future.pop(); selected = null; queueSave(); render(); }
const selection = () => project.clips.find(c => c.id === selected);
function render() {
  $('#project-name').value = project.name; $('#ratio').value = `${project.width},${project.height}`;
  $('#undo').disabled = !history.length; $('#redo').disabled = !future.length;
  for (const id of ['split', 'duplicate', 'delete']) $('#' + id).disabled = !selection();
  $('#clip-count').textContent = `${project.clips.length} 个片段`;
  $('#total-time').textContent = format(durationOf(project));
  $('#export').disabled = !project.clips.length;
  renderLibrary(); renderTimeline(); renderInspector(); sizePreview(); syncPreview(true); updatePlayhead();
}
function renderLibrary() {
  document.querySelectorAll('.nav').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $('#library-title').textContent = tab === 'text' ? '文字与字幕' : tab === 'audio' ? '音频素材' : '项目素材';
  $('#import').innerHTML = tab === 'text' ? '＋ 导入 SRT 字幕' : '＋ 导入素材';
  $('#library-filter-label').textContent = tab === 'audio' ? '音频' : tab === 'text' ? '字幕工具' : '全部素材';
  const list = $('#asset-list');
  if (tab === 'text') {
    $('#asset-count').textContent = project.clips.filter(c => c.kind === 'text').length;
    list.innerHTML = '<div class="text-preset"><strong>让故事被看见</strong><p>基础字幕 · 自定义文字、大小与颜色</p><button id="preset-text">＋ 添加字幕</button></div><button id="import-srt" class="import-button" style="margin:0;width:100%">导入 SRT 字幕文件</button><p class="library-note">在播放头位置添加文字。选中字幕片段，在右侧调整样式和显示时间。<br><br>当前版本支持手动字幕和 SRT。点击顶部 AI 助手可接入语音转字幕。</p>';
    $('#preset-text').onclick = addText; $('#import-srt').onclick = () => $('#srt-input').click(); return;
  }
  const visible = assets.filter(a => tab !== 'audio' || a.kind === 'audio');
  $('#asset-count').textContent = visible.length;
  list.innerHTML = visible.length ? visible.map(a => `<article class="asset-card" draggable="true" data-asset="${a.id}">${a.thumbnail ? `<img class="asset-thumb" src="${a.thumbnail}" alt="">` : '<div class="asset-thumb audio-thumb">♫</div>'}<div class="asset-info"><strong title="${esc(a.name)}">${esc(a.name)}</strong><small>${a.kind === 'image' ? '图片' : short(a.duration)}${a.width ? ` · ${a.width}×${a.height}` : ' · 音频'}</small></div><button data-add="${a.id}" aria-label="添加 ${esc(a.name)}" title="添加到时间线">＋</button></article>`).join('') : '<div class="library-empty"><div class="symbol">▧</div>把灵感放进素材库<br>支持视频、音频和图片</div>';
  list.querySelectorAll('[data-add]').forEach(b => b.onclick = () => addAsset(b.dataset.add));
  list.querySelectorAll('[draggable]').forEach(b => {
    b.ondragstart = e => { e.dataTransfer.setData('application/fcut-asset', b.dataset.asset); e.dataTransfer.effectAllowed = 'copy'; };
    b.ondblclick = () => addAsset(b.dataset.asset);
  });
}
function trackEnd(id) { return Math.max(0, ...project.clips.filter(c => c.track === id).map(endOf)); }
function addAsset(id, track, at) {
  const a = assets.find(a => a.id === id); if (!a) return;
  track ||= a.kind === 'audio' ? 'a1' : 'v1'; at ??= trackEnd(track);
  const c = makeClip(a, track, at); selected = c.id;
  if (commit(() => project.clips.push(c))) { seek(at); toast('已添加到时间线'); }
}
function addText() { const c = makeText(time); selected = c.id; tab = 'text'; commit(() => project.clips.push(c)); }
async function importFiles(files) {
  if (!files.length) return;
  $('#import').disabled = true;
  for (let i = 0; i < files.length; i++) {
    const file = files[i]; $('#status').textContent = `正在导入 ${i + 1}/${files.length} · ${file.name}`;
    try {
      const a = await api('/api/assets?name=' + encodeURIComponent(file.name), { method: 'POST', body: file }); assets.push(a); renderLibrary();
      toast(`已导入 ${a.name}`);
    } catch (e) { toast(`导入失败：${e.message}`); }
  }
  $('#import').disabled = false; $('#status').textContent = '剪辑本地处理 · AI 按需联网'; $('#media-input').value = '';
}
function renderTimeline() {
  const width = Math.max($('#timeline-scroll').clientWidth, (Math.max(18, durationOf(project) + 5)) * px);
  $('#timeline-content').style.width = `${width}px`;
  const step = px < 25 ? 5 : px < 70 ? 2 : 1;
  $('#ruler').innerHTML = Array.from({ length: Math.ceil(width / px / step) }, (_, i) => `<span class="tick" style="left:${i * step * px}px">${short(i * step)}</span>`).join('');
  const tracks = tracksOf(project);
  $('.track-labels').innerHTML = '<div class="ruler-label">时间线</div>' + tracks.map(t=>`<div class="track-label ${t.kind}"><span>${t.kind==='audio'?'♫':t.kind==='text'?'T':'▧'}</span><div>${esc(t.name)}<small>${t.kind==='video'?'上层覆盖下层':'轨道'}</small></div></div>`).join('');
  $('#timeline-content').style.height = (27 + tracks.length * (innerHeight >= 950 ? 55 : 47)) + 'px';
  $('.track-labels').scrollTop = $('#timeline-scroll').scrollTop;
  $('#tracks').innerHTML = tracks.map(t => `<div class="track" data-track="${t.id}" style="background-size:${px * step}px 100%">${project.clips.filter(c => c.track === t.id).map(c => {
    const a = assets.find(a => a.id === c.assetId);
    return `<div class="clip ${c.kind} ${selected === c.id ? 'selected' : ''}" data-clip="${c.id}" style="left:${c.start * px}px;width:${Math.max(4, c.duration * px)}px" title="${esc(c.text || c.name || '')} · ${format(c.start)}"><span class="trim-handle left" data-trim="left"></span>${a?.thumbnail ? `<img src="${a.thumbnail}" alt="">` : ''}<span class="clip-label">${esc(c.kind === 'audio' ? '♫ ' + c.name : c.text || c.name || '')}</span><span class="trim-handle right" data-trim="right"></span></div>`;
  }).join('')}${!project.clips.some(c => c.track === t.id) ? `<span class="track-hint">${t.id === 'v1' ? '拖入视频或图片，开始剪辑' : t.id === 'a1' ? '拖入音乐，为画面加入节奏' : ''}</span>` : ''}</div>`).join('');
  document.querySelectorAll('.track').forEach(track => {
    track.ondragover = e => { e.preventDefault(); track.classList.add('drag-over'); };
    track.ondragleave = () => track.classList.remove('drag-over');
    track.ondrop = e => { e.preventDefault(); track.classList.remove('drag-over'); const id = e.dataTransfer.getData('application/fcut-asset'); if (id) addAsset(id, track.dataset.track, snapTime(Math.max(0, (e.clientX - track.getBoundingClientRect().left) / px))); else if (e.dataTransfer.files.length) importFiles([...e.dataTransfer.files]); };
  });
}
function snapTime(value, exclude, duration = 0) {
  if (!snap) return Math.max(0, value);
  const edges = [0, time, ...project.clips.filter(c => c.id !== exclude).flatMap(c => [c.start, endOf(c)])];
  let result = value, distance = 8 / px;
  for (const edge of edges) for (const candidate of [edge, edge - duration]) if (candidate >= 0 && Math.abs(candidate - value) < distance) { distance = Math.abs(candidate - value); result = candidate; }
  return Math.max(0, Math.round(result * project.fps) / project.fps);
}
$('#tracks').addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  const el = e.target.closest('.clip');
  if (!el) { const track = e.target.closest('.track'); if (track) { selected = null; seek((e.clientX - track.getBoundingClientRect().left) / px); renderInspector(); document.querySelectorAll('.clip').forEach(el => el.classList.remove('selected')); } return; }
  pause(); selected = el.dataset.clip; const c = selection();
  document.querySelectorAll('.clip').forEach(n => n.classList.toggle('selected', n === el)); renderInspector();
  for (const id of ['split', 'duplicate', 'delete']) $('#' + id).disabled = false;
  dragState = { x: e.clientX, y: e.clientY, original: structuredClone(c), before: structuredClone(project), trim: e.target.dataset.trim, element: el, moved: false };
  e.preventDefault();
});
window.addEventListener('pointermove', e => {
  if (!dragState) return;
  const d = dragState, c = selection(), delta = (e.clientX - d.x) / px, o = d.original;
  if (!c || Math.hypot(e.clientX - d.x, e.clientY - d.y) < 3 && !d.moved) return; d.moved = true;
  if (d.trim === 'left') {
    let start = snapTime(o.start + delta, c.id);
    start = Math.min(endOf(o) - .1, Math.max(o.kind === 'text' || o.kind === 'image' ? 0 : o.start - o.sourceIn / o.speed, start));
    c.start = start; c.duration = endOf(o) - start;
    if (!['text', 'image'].includes(c.kind)) c.sourceIn = o.sourceIn + (start - o.start) * c.speed;
  } else if (d.trim === 'right') {
    const asset = assets.find(a => a.id === c.assetId), max = c.kind === 'text' || c.kind === 'image' ? 21600 : (asset.duration - c.sourceIn) / c.speed;
    c.duration = Math.max(.1, Math.min(max, snapTime(endOf(o) + delta, c.id) - o.start));
  } else {
    c.start = snapTime(o.start + delta, c.id, c.duration);
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.track');
    const t = tracksOf(project).find(t => t.id === target?.dataset.track);
    if (t && t.kind === (c.kind === 'image' ? 'video' : c.kind)) c.track = t.id;
  }
  if (c.kind !== 'text') { c.fadeIn = Math.min(c.fadeIn, c.duration); c.fadeOut = Math.min(c.fadeOut, c.duration); }
  d.element.style.left = c.start * px + 'px'; d.element.style.width = c.duration * px + 'px';
  const targetTrack = document.querySelector(`.track[data-track="${c.track}"]`); if (d.element.parentElement !== targetTrack) targetTrack.append(d.element);
  syncPreview(true);
});
window.addEventListener('pointerup', () => {
  if (!dragState) return; const d = dragState; dragState = null;
  if (d.moved) {
    try { const c=selection(); if(d.trim && c.kind!=='text'){ c.keyframes=sliceAnimation(d.original,c.start-d.original.start,c.duration); c.visualFadeIn=Math.min(c.visualFadeIn||0,c.duration); c.visualFadeOut=Math.min(c.visualFadeOut||0,c.duration); } validateProject(project, assets); history.push(d.before); future = []; queueSave(); }
    catch (e) { project = d.before; toast(e.message); }
  }
  render();
});
let scrubbing = false;
$('#ruler').onpointerdown = e => { scrubbing = true; $('#ruler').setPointerCapture(e.pointerId); seek((e.clientX - $('#ruler').getBoundingClientRect().left) / px); };
$('#ruler').onpointermove = e => { if (scrubbing) seek((e.clientX - $('#ruler').getBoundingClientRect().left) / px); };
$('#ruler').onpointerup = () => scrubbing = false;

function field(label, key, value, min, max, step = .1) { return `<label class="property-row"><span>${label}</span><input data-prop="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${Number(value.toFixed(3))}"></label>`; }
function renderInspector() {
  const c = selection(); $('#inspector-title').textContent = c ? (c.kind === 'text' ? '字幕属性' : c.kind === 'audio' ? '音频属性' : '画面属性') : '项目设置';
  const body = $('#inspector-body');
  if (!c) {
    body.innerHTML = `<div class="inspector-empty-icon">▣</div><div class="property-section"><h3>让每一个片段，恰到好处</h3><p>选中时间线片段，调整画面、声音和字幕。</p></div><div class="project-spec"><span>画布</span><strong>${project.width} × ${project.height}</strong></div><div class="project-spec"><span>时间线帧率</span><strong>${project.fps} fps</strong></div><div class="project-spec"><span>项目时长</span><strong>${short(durationOf(project))}</strong></div><div class="project-spec"><span>媒体引擎</span><strong>FFmpeg · 本地</strong></div><div class="hint-card"><strong>专注剪辑，安心创作</strong><p>剪辑和导出在本机完成。主动调用 AI 时，仅发送所选内容到配置的服务。</p></div>`; return;
  }
  let html = `<section class="property-section"><h3>${esc(c.kind === 'text' ? '时间与内容' : c.name)}</h3>${field('开始时间 / 秒', 'start', c.start, 0, 21600)}${field('片段时长 / 秒', 'duration', c.duration, .1, 21600)}</section>`;
  if (c.kind === 'text') {
    html += `<section class="property-section"><h3>字幕内容</h3><textarea data-prop="text" aria-label="字幕内容">${esc(c.text)}</textarea></section><section class="property-section"><h3>文字样式</h3>${field('字号 / px', 'fontSize', c.fontSize, 12, 200, 1)}<label class="property-row"><span>文字颜色</span><input data-prop="color" type="color" value="${c.color}"></label>${field('垂直位置 / %', 'yPercent', c.y * 100, 0, 95, 1)}<label class="property-row"><span>半透明底色</span><input data-prop="background" type="checkbox" ${c.background ? 'checked' : ''}></label></section>`;
  } else {
    html += `<section class="property-section"><h3>素材与速度</h3>${c.kind !== 'image' ? field('素材入点 / 秒', 'sourceIn', c.sourceIn, 0, 21600) + `<label class="property-row"><span>播放速度</span><select data-prop="speed">${[.25, .5, .75, 1, 1.25, 1.5, 2, 4].map(v => `<option value="${v}" ${v === c.speed ? 'selected' : ''}>${v}×</option>`).join('')}</select></label>` : '<p>拖动片段右侧边缘调整图片时长。</p>'}</section>`;
    if (c.kind !== 'audio') html += `<section class="property-section"><h3>画面变换</h3>${field('缩放 / %', 'scalePercent', c.scale * 100, 10, 300, 1)}${field('水平偏移 / %', 'xPercent', c.x * 100, -100, 100, 1)}${field('垂直偏移 / %', 'yPercent', c.y * 100, -100, 100, 1)}</section>`;
    if (assets.find(a => a.id === c.assetId)?.hasAudio) html += `<section class="property-section"><h3>音频</h3>${field('音量 / %', 'volumePercent', c.volume * 100, 0, 200, 1)}${field('淡入 / 秒', 'fadeIn', c.fadeIn, 0, c.duration)}${field('淡出 / 秒', 'fadeOut', c.fadeOut, 0, c.duration)}<p>音量设为 0 可静音原声。</p></section>`;
  }
  if(c.kind==='video'||c.kind==='image') html += effectFields(c,field,time-c.start);
  body.innerHTML = html;
  if(c.kind==='video'||c.kind==='image') bindEffectActions(body,selection,time-c.start,commit);
  body.querySelectorAll('[data-prop]').forEach(input => input.onchange = () => {
    const key = input.dataset.prop;
    commit(() => {
      const c = selection(); let value = input.type === 'checkbox' ? input.checked : ['text', 'color', 'keyColor'].includes(key) ? input.value : Number(input.value);
      if (key.endsWith('Percent')) { c[key.replace('Percent', '')] = value / 100; }
      else if (key === 'speed') { const factor=c.speed/value; for(const points of Object.values(c.keyframes||{}))for(const point of points)point.time*=factor; c.visualFadeIn=(c.visualFadeIn||0)*factor; c.visualFadeOut=(c.visualFadeOut||0)*factor; c.duration = c.duration * c.speed / value; c.speed = value; c.fadeIn = Math.min(c.fadeIn, c.duration); c.fadeOut = Math.min(c.fadeOut, c.duration); }
      else c[key] = value;
    });
  });
}
function sizePreview() {
  const wrap = $('.preview-wrap'), availableW = wrap.clientWidth - 52, availableH = wrap.clientHeight - 18, ratio = project.width / project.height;
  const w = Math.min(availableW, availableH * ratio);
  $('#preview').style.width = Math.max(1, w) + 'px'; $('#preview').style.height = Math.max(1, w / ratio) + 'px';
}
new ResizeObserver(() => { sizePreview(); syncPreview(); }).observe($('.preview-wrap'));
function connectAudio(record) {
  if (!audioContext || record.gain || record.el.tagName === 'IMG') return;
  record.source = audioContext.createMediaElementSource(record.el); record.gain = audioContext.createGain(); record.source.connect(record.gain).connect(audioContext.destination); record.el.volume = 1;
}
function syncPreview(force = false) {
  const active = project.clips.filter(c => c.kind !== 'text' && time >= c.start && time < endOf(c));
  for (const [id, record] of elements) {
    if (!project.clips.some(c => c.id === id)) { record.el.pause?.(); record.source?.disconnect(); record.gain?.disconnect(); record.el.remove(); elements.delete(id); }
    else if (!active.some(c => c.id === id)) { record.el.pause?.(); record.el.style.display = 'none'; }
  }
  for (const c of active) {
    let record = elements.get(c.id);
    if (!record) {
      const el = document.createElement(c.kind === 'image' ? 'img' : c.kind === 'audio' ? 'audio' : 'video');
      el.src = `/media/${c.assetId}`; el.className = 'preview-media'; el.preload = 'auto'; el.playsInline = true;
      el.addEventListener('error', () => { if (!record.failed) { record.failed = true; toast('该素材无法直接预览，请转换为 H.264 MP4 / AAC 后导入；仍可尝试 FFmpeg 导出。'); } });
      el.addEventListener('loadeddata',()=>syncPreview()); el.addEventListener('load',()=>syncPreview()); el.addEventListener('seeked',()=>syncPreview());
      $('#visual-layers').append(el); record = { el, failed: false }; elements.set(c.id, record);
    }
    const el = record.el; el.style.display = 'none';
    el.style.zIndex = c.track === 'v2' ? '2' : '1';
    el.style.width = c.scale * 100 + '%'; el.style.height = c.scale * 100 + '%';
    el.style.left = ((1 - c.scale) / 2 + c.x) * 100 + '%'; el.style.top = ((1 - c.scale) / 2 + c.y) * 100 + '%';
    if (c.kind !== 'image') {
      const desired = c.sourceIn + (time - c.start) * c.speed;
      if (force || Math.abs(el.currentTime - desired) > .22) { try { el.currentTime = desired; } catch {} }
      el.playbackRate = c.speed; connectAudio(record);
      const local = time - c.start;
      const volume = c.volume * (c.fadeIn ? Math.min(1, local / c.fadeIn) : 1) * (c.fadeOut ? Math.min(1, (c.duration - local) / c.fadeOut) : 1);
      if (record.gain) record.gain.gain.value = volume; else el.volume = Math.min(1, volume);
      if (playing && el.paused && !record.failed) el.play().catch(() => {}); else if (!playing && !el.paused) el.pause();
    }
  }
  const tracks=tracksOf(project);
  paintPreview?.(project,active.filter(c=>c.kind!=='audio').sort((a,b)=>tracks.findIndex(t=>t.id===b.track)-tracks.findIndex(t=>t.id===a.track)),elements,time);
  const textClips = project.clips.filter(c => c.kind === 'text' && time >= c.start && time < endOf(c));
  const factor = $('#preview').clientWidth / project.width;
  const html = textClips.map(c => `<div class="subtitle" style="top:${c.y * 100}%;font-size:${c.fontSize * factor}px;color:${c.color};${c.background ? `background:#0009;padding:${12 * factor}px` : ''}">${esc(c.text)}</div>`).join('');
  if ($('#subtitle-layers').innerHTML !== html) $('#subtitle-layers').innerHTML = html;
  $('#preview-empty').hidden = project.clips.length > 0;
}
function updatePlayhead() { $('#current-time').textContent = format(time); $('#playhead').style.left = time * px + 'px'; }
function pause() { playing = false; $('#play').textContent = '▶'; $('#play').setAttribute('aria-label', '播放'); for (const r of elements.values()) r.el.pause?.(); }
function seek(t) { pause(); time = Math.max(0, Math.min(durationOf(project), t)); syncPreview(true); updatePlayhead(); renderInspector(); }
async function togglePlay() {
  if (playing) { pause(); renderInspector(); return; } if (!project.clips.length) return;
  if (time >= durationOf(project) - .02) time = 0;
  audioContext ||= new AudioContext(); await audioContext.resume();
  playing = true; clockStart = performance.now(); clockTime = time; $('#play').textContent = 'Ⅱ'; $('#play').setAttribute('aria-label', '暂停'); syncPreview(true);
}
function frame(now) {
  if (playing) {
    time = Math.min(durationOf(project), clockTime + (now - clockStart) / 1000);
    if (time >= durationOf(project)) pause(); syncPreview(); updatePlayhead();
    const scroll = $('#timeline-scroll'); if (time * px > scroll.scrollLeft + scroll.clientWidth - 25) scroll.scrollLeft = time * px - 70;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
function split() { const c = selection(); if (!c) return; const pair = splitClip(c, time); if (!pair) return toast('请把播放头移到片段中间'); commit(() => { project.clips.splice(project.clips.indexOf(c), 1, ...pair); selected = pair[1].id; }); }
function remove() { if (!selection()) return; commit(() => { project.clips = project.clips.filter(c => c.id !== selected); selected = null; }); }
function duplicate() { const c = selection(); if (!c) return; const copy = { ...structuredClone(c), id: uid(), start: trackEnd(c.track) }; selected = copy.id; commit(() => project.clips.push(copy)); }
function zoom(value) { px = Math.max(12, Math.min(160, value)); $('#zoom').value = px; renderTimeline(); updatePlayhead(); }
function download(data, name, type = 'application/json') { const url = URL.createObjectURL(new Blob([data], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
$('#import').onclick = () => (tab === 'text' ? $('#srt-input') : $('#media-input')).click();
$('#empty-import').onclick = () => $('#media-input').click();
$('#media-input').onchange = e => importFiles([...e.target.files]);
$('#srt-input').onchange = async e => {
  const file = e.target.files[0]; if (!file) return; const clips = parseSrt(await file.text());
  if (!clips.length) toast('没有读取到有效的 SRT 字幕'); else { tab = 'text'; commit(() => project.clips.push(...clips)); toast(`已导入 ${clips.length} 条字幕`); } e.target.value = '';
};
document.querySelectorAll('.nav').forEach(b => b.onclick = () => { tab = b.dataset.tab; renderLibrary(); });
$('#project-name').onchange = e => commit(() => project.name = e.target.value.trim() || '未命名作品');
$('#ratio').onchange = e => commit(() => [project.width, project.height] = e.target.value.split(',').map(Number));
$('#undo').onclick = undo; $('#redo').onclick = redo; $('#split').onclick = split; $('#delete').onclick = remove; $('#duplicate').onclick = duplicate;
$('#add-video-track').onclick=()=>commit(()=>addTrack(project,'video'));
$('#add-audio-track').onclick=()=>commit(()=>addTrack(project,'audio'));
$('#timeline-scroll').addEventListener('scroll',()=>$('.track-labels').scrollTop=$('#timeline-scroll').scrollTop);
$('#add-text').onclick = addText; $('#play').onclick = togglePlay;
$('#start').onclick = () => seek(0); $('#end').onclick = () => seek(Math.max(0, durationOf(project) - 1 / project.fps));
$('#back-frame').onclick = () => seek(time - 1 / project.fps); $('#next-frame').onclick = () => seek(time + 1 / project.fps);
$('#zoom').oninput = e => zoom(+e.target.value); $('#zoom-in').onclick = () => zoom(px + 10); $('#zoom-out').onclick = () => zoom(px - 10);
$('#fit-timeline').onclick = () => zoom(($('#timeline-scroll').clientWidth - 50) / Math.max(10, durationOf(project)));
$('#snap').onclick = () => { snap = !snap; $('#snap').classList.toggle('enabled', snap); };
$('#save-project').onclick = () => { queueSave(); download(JSON.stringify(project, null, 2), project.name + '.fcut'); toast('工程已下载；素材引用保留在本机素材库中'); };
$('#open-project').onclick = () => $('#project-input').click();
$('#project-input').onchange = async e => {
  const file = e.target.files[0]; if (!file) return;
  try { const p = JSON.parse(await file.text()); validateProject(p, assets); selected = null; if (commit(() => project = p)) seek(0); } catch (e) { toast(e.message); } e.target.value = '';
};
$('#new-project').onclick = () => {
  if (project.clips.length && !confirm('新建将替换当前自动保存的工程。需要保留时，请先点击“保存工程”下载工程文件。继续新建？')) return;
  selected = null; time = 0; commit(() => project = newProject());
};
window.addEventListener('keydown', e => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || $('#export-dialog').open) return;
  const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  else if (mod && key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (mod && key === 'b') { e.preventDefault(); split(); }
  else if (mod && key === 'd') { e.preventDefault(); duplicate(); }
  else if (mod && key === 's') { e.preventDefault(); $('#save-project').click(); }
  else if (key === 'delete' || key === 'backspace') { e.preventDefault(); remove(); }
  else if (key === 'arrowleft' || key === 'arrowright') { e.preventDefault(); seek(time + (key === 'arrowright' ? 1 : -1) / project.fps); }
});
window.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
window.addEventListener('drop', e => { e.preventDefault(); if (e.target.closest('.track')) return; if (e.dataTransfer.files.length) importFiles([...e.dataTransfer.files]); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
$('#export').onclick = () => { pause(); $('#export-size').textContent = `${project.width} × ${project.height}`; $('#export-fps').value = project.fps; $('#export-dialog').showModal(); };
$('#close-export').onclick = () => $('#export-dialog').close();
$('#start-export').onclick = async () => {
  $('#start-export').disabled = true; $('#download-export').hidden = true; $('#export-error').textContent = ''; $('#export-progress-area').hidden = false;
  $('#export-progress').value = 0; $('#export-percent').textContent = '0%'; $('#export-status').textContent = '准备导出…';
  try {
    const p = structuredClone(project); p.fps = +$('#export-fps').value;
    const job = await api('/api/export', { method: 'POST', body: JSON.stringify(p) }); jobId = job.id; $('#cancel-export').hidden = false; pollExport();
  } catch (e) { $('#export-error').textContent = e.message; $('#export-status').textContent = '无法导出'; $('#start-export').disabled = false; }
};
async function pollExport() {
  try {
    const j = await api('/api/jobs/' + jobId);
    $('#export-progress').value = j.progress; $('#export-percent').textContent = Math.round(j.progress * 100) + '%';
    $('#export-status').textContent = ({ preparing: '准备素材…', rendering: '正在渲染视频…', done: '导出完成', cancelled: '已取消导出', failed: '导出失败' })[j.status];
    if (['preparing', 'rendering'].includes(j.status)) return setTimeout(pollExport, 600);
    $('#cancel-export').hidden = true; $('#start-export').disabled = false; $('#export-error').textContent = j.error || '';
    if (j.status === 'done') { $('#download-export').href = '/exports/' + j.id; $('#download-export').hidden = false; toast('视频已导出，可以下载了'); }
  } catch (e) { $('#export-error').textContent = e.message; $('#start-export').disabled = false; $('#cancel-export').hidden = true; }
}
$('#cancel-export').onclick = async () => { if (jobId) await api('/api/jobs/' + jobId, { method: 'DELETE' }); };
mountAI({ api, getProject: () => project, getSelected: selection, pause, notify: toast, apply: proposal => commit(() => {
  if (proposal.task === 'transcribe') project.clips.push(...proposal.subtitles.map(s => makeText(s.start, s.duration, s.text)));
  else for (const row of proposal.subtitles) { const c = project.clips.find(c => c.id === row.id && c.kind === 'text'); if (!c) throw Error('字幕已变化，请重新生成'); c.text = row.text; }
}) });
try {
  const state = await api('/api/state'); project = state.project; assets = state.assets;
  initialStateLoaded = true;
  if (!state.engine) toast('媒体引擎未安装，运行 scripts/setup-ffmpeg.ps1 后重启');
  $('#save-state').textContent = '已恢复本地工程'; render();
} catch (e) { render(); toast('加载失败：' + e.message); }
