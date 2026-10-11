import { durationOf, validateProject } from '../app/model.mjs';
const n = x => Number(x.toFixed(6));
export function tempoFilters(speed) {
  const filters = [];
  while (speed > 2) { filters.push('atempo=2'); speed /= 2; }
  while (speed < .5) { filters.push('atempo=0.5'); speed /= .5; }
  filters.push(`atempo=${n(speed)}`); return filters.join(',');
}
export function buildRender(p, assets, output, subtitleFiles, fontFile) {
  validateProject(p, assets);
  const duration = durationOf(p);
  if (!duration) throw Error('时间线为空');
  const args = ['-hide_banner', '-y', '-filter_complex_threads', '2'];
  const media = p.clips.filter(c => c.kind !== 'text');
  for (const c of media) {
    const a = assets.find(a => a.id === c.assetId);
    if (c.kind === 'image') args.push('-loop', '1');
    else args.push('-ss', String(n(c.sourceIn)));
    args.push('-t', String(n(c.duration * c.speed)), '-i', a.path);
  }
  const filters = [`color=c=black:s=${p.width}x${p.height}:r=${p.fps}:d=${n(duration)}[base]`];
  let previous = 'base';
  const visuals = media.filter(c => c.kind !== 'audio').sort((a, b) => a.track.localeCompare(b.track) || a.start - b.start);
  visuals.forEach((c, i) => {
    const index = media.indexOf(c);
    const w = Math.max(2, Math.round(p.width * c.scale / 2) * 2), h = Math.max(2, Math.round(p.height * c.scale / 2) * 2);
    filters.push(`[${index}:v]setpts=(PTS-STARTPTS)/${n(c.speed)},scale=${w}:${h}:force_original_aspect_ratio=decrease,setsar=1,format=yuva420p,setpts=PTS+${n(c.start)}/TB[v${i}]`);
    filters.push(`[${previous}][v${i}]overlay=x=(W-w)/2+${n(c.x * p.width)}:y=(H-h)/2+${n(c.y * p.height)}:eof_action=pass:enable='gte(t,${n(c.start)})*lt(t,${n(c.start + c.duration)})'[mix${i}]`);
    previous = `mix${i}`;
  });
  p.clips.filter(c => c.kind === 'text').forEach((c, i) => {
    // Font/text paths are generated relative to the render job directory; user text is never a filter expression.
    filters.push(`[${previous}]drawtext=fontfile='${fontFile}':textfile='${subtitleFiles[i]}':expansion=none:fontsize=${c.fontSize}:fontcolor=${c.color.replace('#', '0x')}:x=(w-text_w)/2:y=h*${n(c.y)}-text_h/2:borderw=2:bordercolor=black@0.7:box=${c.background ? 1 : 0}:boxcolor=black@0.55:boxborderw=12:enable='gte(t,${n(c.start)})*lt(t,${n(c.start + c.duration)})'[text${i}]`);
    previous = `text${i}`;
  });
  const audioLabels = [];
  media.forEach((c, i) => {
    const a = assets.find(a => a.id === c.assetId);
    if (!a.hasAudio || c.volume === 0) return;
    let f = `[${i}:a]asetpts=PTS-STARTPTS,${tempoFilters(c.speed)},atrim=duration=${n(c.duration)},volume=${n(c.volume)}`;
    if (c.fadeIn) f += `,afade=t=in:st=0:d=${n(c.fadeIn)}`;
    if (c.fadeOut) f += `,afade=t=out:st=${n(c.duration - c.fadeOut)}:d=${n(c.fadeOut)}`;
    f += `,adelay=${Math.round(c.start * 1000)}:all=1[a${i}]`; filters.push(f); audioLabels.push(`[a${i}]`);
  });
  if (audioLabels.length) filters.push(`${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=longest:normalize=0,alimiter=limit=0.95:level=0:latency=1,apad,atrim=duration=${n(duration)}[audio]`);
  else filters.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${n(duration)}[audio]`);
  args.push('-filter_complex', filters.join(';'), '-map', `[${previous}]`, '-map', '[audio]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-threads', '2', '-r', String(p.fps), '-c:a', 'aac', '-b:a', '192k', '-t', String(n(duration)), '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', output);
  return args;
}
