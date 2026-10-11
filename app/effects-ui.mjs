import { EFFECTS, ANIMATED, valueOf, sample } from './effects.mjs';
export function effectFields(c, field, local) {
  const f = (label,key,step=.05) => field(label,key,valueOf(c,key),EFFECTS[key][1],EFFECTS[key][2],step);
  return `<section class="property-section"><h3>基础调色</h3>${f('曝光 / EV','exposure',.1)}${f('对比度','contrast')}${f('饱和度','saturation')}${f('冷暖','warmth')}<button id="reset-color">重置调色</button></section>
    <section class="property-section"><h3>裁剪 · 各边比例</h3>${['Left','Right','Top','Bottom'].map((s,i)=>f(['左','右','上','下'][i],'crop'+s)).join('')}<p>0.1 表示裁掉该边 10%，保留区域适应画布。</p></section>
    <section class="property-section"><h3>透明度与淡化</h3>${f('不透明度','opacity')}${f('画面淡入 / 秒','visualFadeIn',.1)}${f('画面淡出 / 秒','visualFadeOut',.1)}<p>上下画面轨重叠时，为上层添加淡入/淡出即可叠化。</p></section>
    <section class="property-section"><h3>关键帧 · 线性插值</h3><p>当前片段内 ${local.toFixed(2)} 秒。移动播放头后设置数值并添加关键帧。</p>${Object.entries(ANIMATED).map(([key,[min,max]],i)=>`<label class="property-row"><span>${['水平偏移','垂直偏移','缩放','不透明度'][i]}</span><input type="number" data-animation-value="${key}" min="${min}" max="${max}" step=".05" value="${sample(c,key,local).toFixed(3)}"></label><button data-keyframe="${key}">◇ 添加 / 更新</button> <button data-clear-animation="${key}">清除 (${c.keyframes?.[key]?.length || 0})</button>`).join('<br>')}</section>
    <section class="property-section"><h3>色键抠像</h3><label class="property-row"><span>启用色键</span><input data-prop="keyEnabled" type="checkbox" ${c.keyEnabled?'checked':''}></label><label class="property-row"><span>背景颜色</span><input data-prop="keyColor" type="color" value="${c.keyColor || '#00ff00'}"></label>${f('相似度','keySimilarity')}${f('边缘柔化','keyBlend')}<p>用于绿幕或纯色背景；不是智能主体识别。</p></section>`;
}
export function bindEffectActions(body, getClip, local, commit) {
  body.querySelector('#reset-color').onclick=()=>commit(()=>{const c=getClip(); for(const k of ['exposure','contrast','saturation','warmth'])delete c[k];});
  body.querySelectorAll('[data-keyframe]').forEach(b=>b.onclick=()=>{
    const key=b.dataset.keyframe, value=Number(body.querySelector(`[data-animation-value="${key}"]`).value);
    commit(()=>{const c=getClip(); if(local<0 || local>c.duration) throw Error('请将播放头移入选中片段'); c.keyframes??={}; const points=c.keyframes[key]??[]; c.keyframes[key]=[...points.filter(p=>Math.abs(p.time-local)>.00001),{time:local,value}].sort((a,b)=>a.time-b.time);});
  });
  body.querySelectorAll('[data-clear-animation]').forEach(b=>b.onclick=()=>commit(()=>{const c=getClip();const key=b.dataset.clearAnimation; c[key]=sample(c,key,local);if(c.keyframes)delete c.keyframes[key];}));
}
