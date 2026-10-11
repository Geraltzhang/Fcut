// Non-destructive, portable effect parameters. No platform frameworks or model weights.
export const EFFECTS = {
  exposure: [0, -3, 3], contrast: [1, 0, 2], saturation: [1, 0, 2], warmth: [0, -1, 1],
  cropLeft: [0, 0, .9], cropRight: [0, 0, .9], cropTop: [0, 0, .9], cropBottom: [0, 0, .9],
  opacity: [1, 0, 1], visualFadeIn: [0, 0, 21600], visualFadeOut: [0, 0, 21600],
  keySimilarity: [.15, .01, 1], keyBlend: [.1, 0, 1],
};
export const ANIMATED = { x: [-1, 1], y: [-1, 1], scale: [.1, 3], opacity: [0, 1] };
export const valueOf = (c, key) => c[key] ?? EFFECTS[key]?.[0];
export function sample(c, key, local) {
  const points = c.keyframes?.[key];
  if (!points?.length) return valueOf(c, key);
  if (local <= points[0].time) return points[0].value;
  for (let i = 1; i < points.length; i++) if (local < points[i].time) {
    const a = points[i - 1], b = points[i];
    return a.value + (b.value - a.value) * (local - a.time) / (b.time - a.time);
  }
  return points.at(-1).value;
}
export function opacityAt(c, local) {
  const fadeIn = valueOf(c, 'visualFadeIn'), fadeOut = valueOf(c, 'visualFadeOut');
  return sample(c, 'opacity', local) * (fadeIn ? Math.min(1, Math.max(0, local / fadeIn)) : 1) * (fadeOut ? Math.min(1, Math.max(0, (c.duration - local) / fadeOut)) : 1);
}
export function sliceAnimation(c, from, duration) {
  const result = {};
  for (const key of Object.keys(c.keyframes || {})) {
    const points = c.keyframes[key]; if (!points.length) continue;
    result[key] = [{ time: 0, value: sample(c, key, from) }, ...points.filter(p => p.time > from && p.time < from + duration).map(p => ({ ...p, time: p.time - from })), { time: duration, value: sample(c, key, from + duration) }];
  }
  return result;
}
export function validateEffects(c) {
  for (const [key, [fallback, min, max]] of Object.entries(EFFECTS)) {
    const v = c[key] ?? fallback;
    if (!Number.isFinite(v) || v < min || v > max) throw Error('画面效果参数无效：' + key);
  }
  if (valueOf(c, 'cropLeft') + valueOf(c, 'cropRight') > .95 || valueOf(c, 'cropTop') + valueOf(c, 'cropBottom') > .95) throw Error('裁剪后至少保留 5% 画面');
  if (valueOf(c, 'visualFadeIn') > c.duration || valueOf(c, 'visualFadeOut') > c.duration) throw Error('画面淡入淡出不能超过片段时长');
  if (c.keyEnabled != null && typeof c.keyEnabled !== 'boolean') throw Error('色键开关无效');
  if (c.keyColor != null && !/^#[0-9a-f]{6}$/i.test(c.keyColor)) throw Error('色键颜色无效');
  if (c.keyframes != null && (typeof c.keyframes !== 'object' || Array.isArray(c.keyframes))) throw Error('关键帧格式无效');
  for (const [key, points] of Object.entries(c.keyframes || {})) {
    if (!Object.hasOwn(ANIMATED, key) || !Array.isArray(points) || points.length > 100) throw Error('关键帧属性或数量无效');
    let last = -1;
    for (const p of points) {
      if (!Number.isFinite(p.time) || p.time < 0 || p.time > c.duration || p.time <= last || !Number.isFinite(p.value) || p.value < ANIMATED[key][0] || p.value > ANIMATED[key][1]) throw Error('关键帧时间或数值无效');
      last = p.time;
    }
  }
}
export function colorTable(c, channel) {
  const exposure = 2 ** valueOf(c, 'exposure'), contrast = valueOf(c, 'contrast');
  const offset = valueOf(c, 'warmth') * (channel === 0 ? .08 : channel === 2 ? -.08 : 0);
  return Array.from({ length: 256 }, (_, byte) => {
    const s = byte / 255;
    const linear = s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
    const lit = linear * exposure;
    const encoded = lit <= .0031308 ? 12.92 * lit : 1.055 * lit ** (1 / 2.4) - .055;
    return Math.round(Math.max(0, Math.min(1, (encoded - .5) * contrast + .5 + offset)) * 255);
  });
}
