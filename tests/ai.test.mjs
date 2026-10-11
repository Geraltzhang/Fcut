import test from 'node:test';
import assert from 'node:assert/strict';
import { AIService, validateEndpoint } from '../lib/ai.mjs';
const config = { text: { baseUrl: 'https://example.com/v1', model: 'test-text', key: 'test-secret' }, speech: { baseUrl: 'http://127.0.0.1:4321/v1', model: 'test-speech' } };
const input = { task: 'polish', subtitles: [{ id: 'one', text: '你好世界' }] };
test('keys never appear in public/disk config and are cleared on endpoint changes', () => {
  const ai = new AIService(config);
  assert.equal(ai.publicConfig().text.hasKey, true);
  assert.ok(!JSON.stringify(ai.publicConfig()).includes('test-secret')); assert.ok(!JSON.stringify(ai.diskConfig()).includes('test-secret'));
  ai.update({ text: { model: 'another' } }); assert.equal(ai.publicConfig().text.hasKey, true);
  ai.update({ text: { baseUrl: 'https://other.example/v1' } }); assert.equal(ai.publicConfig().text.hasKey, false);
  assert.throws(() => validateEndpoint('http://example.com/v1'));
  assert.throws(() => validateEndpoint('https://example.com/v1?key=secret'));
  assert.throws(() => validateEndpoint('https://me:secret@example.com/v1'));
});
test('subtitle editing sends only text and preserves IDs', async () => {
  let sent;
  const ai = new AIService(config, async (url, options) => { sent = { url, options }; return Response.json({ choices: [{ message: { content: '```json\n{"subtitles":[{"id":"one","text":"你好，世界！"}]}\n```' } }] }); });
  const out = await ai.subtitles(input);
  assert.equal(out.subtitles[0].text, '你好，世界！'); assert.equal(sent.options.redirect, 'error');
  assert.equal(sent.options.headers.Authorization, 'Bearer test-secret');
  assert.equal(sent.url, 'https://example.com/v1/chat/completions');
  assert.equal(JSON.parse(sent.options.body).model, 'test-text');
});
test('malformed model output and mutated subtitle IDs are rejected', async () => {
  for (const content of ['not json', '{"subtitles":[]}', '{"subtitles":[{"id":"wrong","text":"x"}]}']) {
    const ai = new AIService(config, async () => Response.json({ choices: [{ message: { content } }] }));
    await assert.rejects(ai.subtitles(input));
  }
});
test('provider error messages redact key; failed requests never change config', async () => {
  const ai = new AIService(config, async () => Response.json({ error: { message: 'bad key test-secret' } }, { status: 401 }));
  await assert.rejects(ai.subtitles(input), error => !error.message.includes('test-secret') && error.message.includes('401'));
});
test('transcription requires actual timestamps and constructs multipart request', async () => {
  let form;
  const ai = new AIService(config, async (url, options) => { form = options.body; return Response.json({ segments: [{ start: 0, end: 1, text: ' 你好 ' }] }); });
  assert.deepEqual(await ai.transcribeChunk(Buffer.from('RIFF'), 'zh'), [{ start: 0, end: 1, text: '你好' }]);
  assert.equal(form.get('response_format'), 'verbose_json'); assert.equal(form.get('language'), 'zh'); assert.equal(form.get('file').name, 'audio.wav');
  const invalid = new AIService(config, async () => Response.json({ text: 'no timestamps' }));
  await assert.rejects(invalid.transcribeChunk(Buffer.from('RIFF')), /时间戳/);
});
test('config updates are atomic when a later service is invalid', () => {
  const ai = new AIService(config); assert.throws(() => ai.update({ text: { model: 'new' }, speech: { baseUrl: 'file:///x' } }));
  assert.equal(ai.publicConfig().text.model, 'test-text');
});
