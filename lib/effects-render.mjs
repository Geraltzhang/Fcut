import { valueOf } from '../app/effects.mjs';
const n = x => String(Number(x.toFixed(6)));
export function animationExpression(c, key, clock = 't') {
  const points = c.keyframes?.[key];
  if (!points?.length) return n(valueOf(c,key));
  let expr = n(points.at(-1).value);
  for (let i = points.length - 1; i > 0; i--) {
    const a = points[i-1], b = points[i];
    expr = `if(lt(${clock},${n(b.time)}),${n(a.value)}+(${n(b.value-a.value)})*(${clock}-${n(a.time)})/${n(b.time-a.time)},${expr})`;
  }
  return `if(lte(${clock},${n(points[0].time)}),${n(points[0].value)},${expr})`;
}
export function visualFilters(c, p) {
  const f = [];
  const l=valueOf(c,'cropLeft'), r=valueOf(c,'cropRight'), t=valueOf(c,'cropTop'), b=valueOf(c,'cropBottom');
  if (l+r+t+b) f.push(`crop=w=iw*${n(1-l-r)}:h=ih*${n(1-t-b)}:x=iw*${n(l)}:y=ih*${n(t)}:exact=1`);
  f.push('format=rgba');
  if(c.keyEnabled) f.push(`colorkey=${(c.keyColor || '#00ff00').replace('#','0x')}:${n(valueOf(c,'keySimilarity'))}:${n(valueOf(c,'keyBlend'))}`);
  if (valueOf(c,'exposure') || valueOf(c,'contrast') !== 1 || valueOf(c,'warmth')) {
    const lin='if(lte(val/255,0.04045),val/255/12.92,pow((val/255+0.055)/1.055,2.4))';
    const lit=`(${lin}*${n(2**valueOf(c,'exposure'))})`;
    const encoded=`if(lte(${lit},0.0031308),12.92*${lit},1.055*pow(${lit},1/2.4)-0.055)`;
    f.push('lutrgb='+['r','g','b'].map((ch,i)=>`${ch}='clip(round(((${encoded}-0.5)*${n(valueOf(c,'contrast'))}+0.5+${n(valueOf(c,'warmth')*(i===0?.08:i===2?-.08:0))})*255),0,255)'`).join(':'));
  }
  const s=valueOf(c,'saturation'), weights=[.2126,.7152,.0722];
  if(s!==1) f.push('colorchannelmixer='+['r','g','b'].flatMap((out,i)=>['r','g','b'].map((input,j)=>`${out}${input}=${n(weights[j]*(1-s)+(i===j?s:0))}`)).join(':'));
  const scale = animationExpression(c,'scale');
  f.push(`scale=w='max(2,trunc(min(${p.width}/iw,${p.height}/ih)*iw*(${scale})/2)*2)':h='max(2,trunc(min(${p.width}/iw,${p.height}/ih)*ih*(${scale})/2)*2)':eval=frame`, 'setsar=1');
  if(valueOf(c,'opacity')!==1 || c.keyframes?.opacity?.length){
    f.push(`geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*(${animationExpression(c,'opacity','T')})'`);
  }
  if(valueOf(c,'visualFadeIn'))f.push(`fade=t=in:st=0:d=${n(c.visualFadeIn)}:alpha=1`);
  if(valueOf(c,'visualFadeOut'))f.push(`fade=t=out:st=${n(c.duration-c.visualFadeOut)}:d=${n(c.visualFadeOut)}:alpha=1`);
  return f.join(',');
}
