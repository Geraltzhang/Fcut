import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, makeClip, makeText, splitClip, validateProject, parseSrt } from '../app/model.mjs';
import { buildRender } from '../lib/render.mjs';
const asset = { id: 'video', kind: 'video', duration: 20, path: 'sample.mp4', hasAudio: true, name: 'sample' };
test('split preserves source timing at non-unit playback speed', () => {
  const c = { ...makeClip(asset, 'v1', 2), sourceIn: 1, duration: 6, speed: 2 };
  const [left, right] = splitClip(c, 4.5);
  assert.equal(left.duration, 2.5); assert.equal(right.sourceIn, 6); assert.equal(right.duration, 3.5);
  assert.equal(right.start, 4.5); assert.notEqual(right.id, left.id);
  assert.equal(splitClip(c, 2), null);
});
test('same-track overlaps are rejected; compositing on another track is accepted', () => {
  const p = newProject(); p.clips = [{ ...makeClip(asset, 'v1'), duration: 3 }, { ...makeClip(asset, 'v1', 2), duration: 2 }];
  assert.throws(() => validateProject(p, [asset]), /重叠/);
  p.clips[1].track = 'v2'; assert.doesNotThrow(() => validateProject(p, [asset]));
});
test('source bounds and unknown media cannot enter saved projects', () => {
  const p = newProject(); p.clips = [{ ...makeClip(asset, 'v1'), sourceIn: 10 }];
  assert.throws(() => validateProject(p, [asset]), /超出/);
  p.clips[0].sourceIn = 0; assert.throws(() => validateProject(p, []), /找不到/);
});
test('SRT supports BOM, CRLF, multiline content and malformed blocks', () => {
  const result = parseSrt('\uFEFF1\r\n00:00:01,250 --> 00:00:03,500\r\n你好\r\n世界\r\n\r\nbad block\r\n\r\n2\r\n00:00:04.000 --> 00:00:05.000\r\n<b>下一句</b>');
  assert.equal(result.length, 2); assert.equal(result[0].start, 1.25); assert.equal(result[0].duration, 2.25); assert.equal(result[0].text, '你好\n世界'); assert.equal(result[1].text, '下一句');
});
test('export escapes text by using files and retains timed audio mixing', () => {
  const p = newProject(); p.clips = [{ ...makeClip(asset, 'v1', 2), duration: 4, speed: .25, fadeIn: 1 }, makeText(3, 2, "100% 中文 ' : [x]")];
  const args = buildRender(p, [asset], 'out.mp4', ['text-0.txt'], 'font.ttf');
  const graph = args[args.indexOf('-filter_complex') + 1];
  assert.ok(graph.includes('atempo=0.5,atempo=0.5')); assert.ok(graph.includes('adelay=2000:all=1'));
  assert.ok(graph.includes('expansion=none')); assert.ok(!graph.includes('100%'));
  assert.ok(graph.includes('normalize=0')); assert.ok(graph.includes('afade=t=in'));
});
