export const TRACKS = [
  { id: 'text', name: '字幕', kind: 'text' },
  { id: 'v2', name: '画面 02', kind: 'video' },
  { id: 'v1', name: '画面 01', kind: 'video' },
  { id: 'a1', name: '配乐 01', kind: 'audio' },
  { id: 'a2', name: '配乐 02', kind: 'audio' },
];
export const uid = () => globalThis.crypto.randomUUID();
export function newProject() {
  return { version: 1, name: '未命名作品', width: 1920, height: 1080, fps: 30, clips: [] };
}
export const endOf = c => c.start + c.duration;
export const durationOf = p => Math.max(0, ...p.clips.map(endOf));
export function makeClip(asset, track, start = 0) {
  return { id: uid(), assetId: asset.id, kind: asset.kind, track, name: asset.name,
    start, duration: asset.kind === 'image' ? 5 : asset.duration, sourceIn: 0,
    speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, scale: 1, x: 0, y: 0 };
}
export function makeText(start = 0, duration = 3, text = '输入你的字幕') {
  return { id: uid(), kind: 'text', track: 'text', name: '字幕', text, start,
    duration, fontSize: 56, color: '#ffffff', y: 0.84, background: true };
}
export function splitClip(c, time) {
  if (time <= c.start + .04 || time >= endOf(c) - .04) return null;
  const left = { ...c, duration: time - c.start };
  const right = { ...c, id: uid(), start: time, duration: endOf(c) - time };
  if (c.kind !== 'text') {
    right.sourceIn = c.sourceIn + left.duration * c.speed;
    left.fadeOut = 0; right.fadeIn = 0;
    left.fadeIn = Math.min(left.fadeIn, left.duration);
    right.fadeOut = Math.min(right.fadeOut, right.duration);
  }
  return [left, right];
}
export function validateProject(p, assets) {
  if (!p || p.version !== 1 || typeof p.name !== 'string' || p.name.length > 200) throw Error('工程格式不正确');
  if (![1080, 1920, 1280, 720].includes(p.width) || ![1080, 1920, 1280, 720].includes(p.height)) throw Error('画布尺寸不支持');
  if (![24, 25, 30, 60].includes(p.fps)) throw Error('帧率不支持');
  if (!Array.isArray(p.clips) || p.clips.length > 500) throw Error('最多支持 500 个片段');
  const ids = new Set();
  const finite = (x, a, b) => Number.isFinite(x) && x >= a && x <= b;
  for (const c of p.clips) {
    if (typeof c.id !== 'string' || ids.has(c.id)) throw Error('片段 ID 无效');
    ids.add(c.id);
    if (!finite(c.start, 0, 21600) || !finite(c.duration, .04, 21600) || endOf(c) > 21600) throw Error('片段时间无效，最长支持 6 小时');
    const track = TRACKS.find(t => t.id === c.track);
    if (!track || !['video', 'image', 'audio', 'text'].includes(c.kind) || (c.kind === 'image' ? 'video' : c.kind) !== track.kind) throw Error('片段轨道类型不匹配');
    if (c.kind === 'text') {
      if (typeof c.text !== 'string' || c.text.length > 4000 || !finite(c.fontSize, 12, 200) || !finite(c.y, 0, .95) || !/^#[0-9a-f]{6}$/i.test(c.color)) throw Error('字幕参数无效');
    } else {
      const asset = assets.find(a => a.id === c.assetId);
      if (!asset || asset.kind !== c.kind) throw Error('找不到工程引用的素材，请在原素材库中打开工程');
      if (!finite(c.sourceIn, 0, 21600) || !finite(c.speed, .25, 4) || !finite(c.volume, 0, 2) || !finite(c.fadeIn, 0, c.duration) || !finite(c.fadeOut, 0, c.duration) || !finite(c.scale, .1, 3) || !finite(c.x, -1, 1) || !finite(c.y, -1, 1)) throw Error('片段参数无效');
      if (c.kind !== 'image' && c.sourceIn + c.duration * c.speed > asset.duration + .06) throw Error('片段超出素材时长');
    }
  }
  for (const t of TRACKS.filter(t => t.kind !== 'text')) {
    const clips = p.clips.filter(c => c.track === t.id).sort((a, b) => a.start - b.start);
    for (let i = 1; i < clips.length; i++) if (clips[i].start < endOf(clips[i - 1]) - .001) throw Error('同一轨道片段不能重叠，请移到另一轨道');
  }
  return p;
}
export function parseSrt(text) {
  const timestamp = s => { const m = s.match(/(\d+):(\d{2}):(\d{2})[,.](\d{3})/); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000 : NaN; };
  return text.replace(/^\uFEFF/, '').replace(/\r/g, '').trim().split(/\n\s*\n/).flatMap(block => {
    const lines = block.split('\n'); const i = lines.findIndex(l => l.includes('-->'));
    if (i < 0) return [];
    const [a, b] = lines[i].split('-->').map(timestamp);
    const body = lines.slice(i + 1).join('\n').replace(/<[^>]*>/g, '');
    return Number.isFinite(a) && b > a && body ? [makeText(a, b - a, body)] : [];
  });
}
