const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function mountAI({ api, getProject, getSelected, apply, notify, pause }) {
  const button = document.createElement('button'); button.id = 'ai-assistant'; button.textContent = '✦ AI 助手';
  document.querySelector('.top-actions').insertBefore(button, document.querySelector('#export'));
  const dialog = document.createElement('dialog'); dialog.id = 'ai-dialog';
  dialog.innerHTML = `<div class="dialog-title"><div><span class="eyebrow">YOUR MODELS, YOUR WORKFLOW</span><h2>AI 创作助手</h2></div><button id="ai-close" aria-label="关闭 AI 助手">×</button></div>
    <p class="dialog-description">连接你自己的 API。字幕润色、翻译与语音识别按需调用，无需安装模型。</p>
    <details id="ai-settings"><summary>服务与模型设置 <span id="ai-key-state"></span></summary><div class="ai-providers">
      ${['text', 'speech'].map(kind => `<section><h3>${kind === 'text' ? '文字模型 · 润色 / 翻译' : '语音模型 · 自动字幕'}</h3><label>API 基础地址<input id="ai-${kind}-url" type="url" placeholder="https://api.openai.com/v1"></label><label>模型 ID<input id="ai-${kind}-model" placeholder="${kind === 'text' ? '填写服务商的文字模型 ID' : 'whisper-1 或兼容分段时间戳的模型'}"></label><label>API Key<input id="ai-${kind}-key" type="password" autocomplete="off" placeholder="可留空使用本机无鉴权服务"></label><label class="ai-clear"><input id="ai-${kind}-clear" type="checkbox">清除已保存的密钥</label></section>`).join('')}
    </div><p class="ai-note">密钥仅保存在本次服务进程内存中，不写入工程或磁盘；重启服务后需重新输入。基础地址和模型名称会保存在本机。两个服务可分别配置。</p><button id="ai-save-settings">保存设置</button></details>
    <div class="ai-task-grid"><label>工作类型<select id="ai-task"><option value="polish">字幕润色 / 纠错</option><option value="translate">字幕翻译</option><option value="transcribe">语音转字幕</option></select></label><label id="ai-scope-row">字幕范围<select id="ai-scope"><option value="all">时间线全部字幕</option><option value="selected">选中的一条字幕</option></select></label><label id="ai-language-row" hidden>目标语言<input id="ai-language" value="英语" placeholder="例如：英语、日语"></label><label id="ai-speech-language-row" hidden>音频语言<input id="ai-speech-language" placeholder="自动检测；可填 zh / en"></label></div>
    <label id="ai-instruction-row" class="ai-instruction">补充要求（可选）<textarea id="ai-instruction" maxlength="1000" placeholder="例如：保持口语感，统一标点，不改变原意。"></textarea></label>
    <div class="ai-disclosure" id="ai-disclosure"></div><div id="ai-message" role="status"></div><div id="ai-results" hidden></div>
    <div class="dialog-actions"><button id="ai-cancel" hidden>取消请求</button><button id="ai-apply" hidden>应用到时间线</button><button id="ai-run" class="primary">发送并生成</button></div>`;
  document.body.append(dialog);
  const $ = id => dialog.querySelector('#' + id);
  let config, controller, proposal, snapshot;
  function loadConfig(c) {
    config = c;
    for (const kind of ['text', 'speech']) { $(`ai-${kind}-url`).value = c[kind].baseUrl; $(`ai-${kind}-model`).value = c[kind].model; $(`ai-${kind}-key`).value = ''; $(`ai-${kind}-key`).placeholder = c[kind].hasKey ? '本次会话已配置；留空保留' : '输入 API Key；无鉴权服务可留空'; $(`ai-${kind}-clear`).checked = false; }
    $('ai-key-state').textContent = [c.text.hasKey ? '文字已配置' : '', c.speech.hasKey ? '语音已配置' : ''].filter(Boolean).join(' · ');
  }
  async function saveConfig() {
    const body = {};
    for (const kind of ['text', 'speech']) {
      body[kind] = { baseUrl: $(`ai-${kind}-url`).value.trim(), model: $(`ai-${kind}-model`).value.trim() };
      const key = $(`ai-${kind}-key`).value.trim(); if (key || $(`ai-${kind}-clear`).checked) body[kind].key = $(`ai-${kind}-clear`).checked ? '' : key;
    }
    loadConfig(await api('/api/ai/config', { method: 'PUT', body: JSON.stringify(body) })); updateDisclosure();
  }
  function rows() { const p = getProject(); return p.clips.filter(c => c.kind === 'text' && ($('ai-scope').value === 'all' || c.id === getSelected()?.id)); }
  function updateDisclosure() {
    const speech = $('ai-task').value === 'transcribe', translate = $('ai-task').value === 'translate';
    $('ai-scope-row').hidden = speech; $('ai-language-row').hidden = !translate; $('ai-speech-language-row').hidden = !speech; $('ai-instruction-row').hidden = speech;
    const destination = $(`ai-${speech ? 'speech' : 'text'}-url`).value || '尚未配置的服务';
    const clip = getSelected();
    $('ai-disclosure').textContent = speech
      ? (clip && ['video', 'audio'].includes(clip.kind) ? `将提取选中片段「${clip.name}」的 ${clip.duration.toFixed(1)} 秒音频，发送到 ${destination}。不会发送画面；服务商可能计费。识别结果先预览，不会自动插入。` : '请先在时间线选中一个有声音的视频或音频片段，再打开 AI 助手。')
      : `将发送 ${rows().length} 条字幕文字到 ${destination}，不会发送视频和音频。服务商可能计费。结果先预览，应用后可撤销。`;
  }
  function busy(value) {
    for (const control of dialog.querySelectorAll('input,select,textarea,#ai-save-settings,#ai-run,#ai-apply')) control.disabled = value;
    $('ai-cancel').hidden = !value;
  }
  button.onclick = async () => {
    pause(); dialog.showModal(); proposal = null; $('ai-results').hidden = true; $('ai-apply').hidden = true; $('ai-message').textContent = '';
    try { loadConfig(await api('/api/ai/config')); $('ai-settings').open = !config.text.model; $('ai-scope').value = getSelected()?.kind === 'text' ? 'selected' : 'all'; updateDisclosure(); }
    catch (e) { $('ai-message').textContent = e.message; }
  };
  const close = () => { controller?.abort(); dialog.close(); };
  $('ai-close').onclick = close; dialog.addEventListener('cancel', () => controller?.abort());
  $('ai-task').onchange = () => { proposal = null; $('ai-results').hidden = true; $('ai-apply').hidden = true; updateDisclosure(); };
  $('ai-scope').onchange = updateDisclosure;
  for (const kind of ['text', 'speech']) $(`ai-${kind}-url`).oninput = updateDisclosure;
  $('ai-save-settings').onclick = async () => { try { await saveConfig(); $('ai-message').textContent = '设置已保存，密钥仅在本次服务会话有效'; } catch (e) { $('ai-message').textContent = e.message; } };
  $('ai-cancel').onclick = () => controller?.abort();
  $('ai-run').onclick = async () => {
    busy(true); proposal = null; $('ai-results').hidden = true; $('ai-apply').hidden = true; $('ai-message').textContent = '准备请求…'; controller = new AbortController();
    try {
      await saveConfig(); snapshot = JSON.stringify(getProject());
      const task = $('ai-task').value, source = rows(), clip = getSelected();
      if (task === 'transcribe' && (!clip || !['video', 'audio'].includes(clip.kind))) throw Error('请先选择视频或音频片段');
      if (task !== 'transcribe' && !source.length) throw Error('当前范围没有字幕，请先添加或导入字幕');
      $('ai-message').textContent = task === 'transcribe' ? '正在提取音频并识别，较长片段会分段处理…' : '模型正在处理字幕…';
      const body = task === 'transcribe' ? { clip: structuredClone(clip), language: $('ai-speech-language').value.trim() } : { task, subtitles: source.map(({ id, text }) => ({ id, text })), language: $('ai-language').value.trim(), instruction: $('ai-instruction').value };
      const result = await api(task === 'transcribe' ? '/api/ai/transcribe' : '/api/ai/subtitles', { method: 'POST', body: JSON.stringify(body), signal: controller.signal });
      proposal = { task, subtitles: result.subtitles };
      $('ai-settings').open = false;
      $('ai-results').innerHTML = result.subtitles.map((r, i) => `<div class="ai-result"><small>${task === 'transcribe' ? `${r.start.toFixed(2)}s → ${(r.start + r.duration).toFixed(2)}s` : `字幕 ${i + 1}`}</small>${task !== 'transcribe' ? `<p class="ai-original">${esc(source[i].text)}</p>` : ''}<p>${esc(r.text)}</p></div>`).join('');
      $('ai-results').hidden = false; $('ai-apply').hidden = !result.subtitles.length;
      $('ai-message').textContent = result.subtitles.length ? `已生成 ${result.subtitles.length} 条，请检查后应用。` : '没有识别到语音。';
    } catch (e) { $('ai-message').textContent = controller?.signal.aborted ? '已取消，本地工程没有修改' : e.message; }
    finally { controller = null; busy(false); }
  };
  $('ai-apply').onclick = () => {
    if (!proposal) return;
    if (snapshot !== JSON.stringify(getProject())) { $('ai-message').textContent = '工程已变化，请重新生成，避免覆盖编辑。'; return; }
    if (apply(proposal)) { notify('AI 结果已应用，可用 Ctrl+Z 撤销'); dialog.close(); }
  };
}
