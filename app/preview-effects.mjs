import { createColorTableCache, valueOf, sample, opacityAt } from './effects.mjs';

// One WebGL context composites all video tracks; media elements keep decoding/audio.
export function createPreview(canvas) {
  const gl = canvas.getContext('webgl', { alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
  if (!gl) throw Error('画面预览需要 WebGL，请启用浏览器硬件加速；导出仍可使用。');
  const shader = (type, source) => {
    const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s)); return s;
  };
  const program = gl.createProgram();
  gl.attachShader(program, shader(gl.VERTEX_SHADER, `attribute vec2 p; varying vec2 uv; uniform vec4 rect; void main(){uv=vec2(p.x,1.0-p.y); gl_Position=vec4(rect.xy+p*rect.zw,0.,1.);}`));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, `precision highp float;
    varying vec2 uv; uniform sampler2D source; uniform sampler2D lut;
    uniform vec4 crop; uniform vec3 keyColor; uniform vec3 key; uniform float saturation; uniform float opacity;
    void main(){vec4 c=texture2D(source,crop.xy+uv*crop.zw);
      if(key.x>0.5){float d=distance(c.rgb,keyColor)/sqrt(3.0); c.a*=key.z>0.0?clamp((d-key.y)/key.z,0.0,1.0):step(key.y,d);}
      c.rgb=vec3(texture2D(lut,vec2((c.r*255.0+0.5)/256.0,.5)).r,texture2D(lut,vec2((c.g*255.0+0.5)/256.0,.5)).g,texture2D(lut,vec2((c.b*255.0+0.5)/256.0,.5)).b);
      float l=dot(c.rgb,vec3(.2126,.7152,.0722)); c.rgb=clamp(mix(vec3(l),c.rgb,saturation),0.0,1.0);
      gl_FragColor=vec4(c.rgb,c.a*opacity);
    }`));
  gl.linkProgram(program); if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,0,1,0,0,1,0,1,1,0,1,1]), gl.STATIC_DRAW);
  const pos = gl.getAttribLocation(program, 'p'); gl.enableVertexAttribArray(pos); gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
  const locations = Object.fromEntries(['rect','crop','source','lut','keyColor','key','saturation','opacity'].map(k => [k, gl.getUniformLocation(program,k)]));
  const texture = unit => {
    gl.activeTexture(gl.TEXTURE0 + unit); const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,t);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE); return t;
  };
  const source = texture(0), lut = texture(1);
  gl.uniform1i(locations.source,0); gl.uniform1i(locations.lut,1);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  let lastLut = '';
  const cachedTable = createColorTableCache();
  return (project, clips, elements, time) => {
    if (gl.isContextLost()) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(canvas.clientWidth * ratio)), h = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0,0,w,h); gl.clearColor(0,0,0,1); gl.clear(gl.COLOR_BUFFER_BIT);
    for (const c of clips) {
      const el = elements.get(c.id)?.el, sw = el?.videoWidth || el?.naturalWidth, sh = el?.videoHeight || el?.naturalHeight;
      if (!sw || !sh || (el.tagName === 'VIDEO' && el.readyState < 2)) continue;
      const local = time - c.start, scale = sample(c,'scale',local), x = sample(c,'x',local), y = sample(c,'y',local);
      const left = valueOf(c,'cropLeft'), top = valueOf(c,'cropTop'), cw = 1-left-valueOf(c,'cropRight'), ch = 1-top-valueOf(c,'cropBottom');
      const fit = Math.min(project.width/(sw*cw),project.height/(sh*ch))*scale;
      const dw = sw*cw*fit/project.width, dh = sh*ch*fit/project.height;
      gl.uniform4f(locations.rect,-dw+2*x,-dh-2*y,2*dw,2*dh);
      gl.uniform4f(locations.crop,left,top,cw,ch);
      gl.uniform1f(locations.opacity,opacityAt(c,local)); gl.uniform1f(locations.saturation,valueOf(c,'saturation'));
      const color = c.keyColor || '#00ff00'; gl.uniform3f(locations.keyColor,...[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255));
      gl.uniform3f(locations.key,c.keyEnabled?1:0,valueOf(c,'keySimilarity'),valueOf(c,'keyBlend'));
      const signature = JSON.stringify([c.exposure,c.contrast,c.warmth]);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,lut);
      if (signature !== lastLut) {
        const bytes = cachedTable(c);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,256,1,0,gl.RGBA,gl.UNSIGNED_BYTE,bytes); lastLut=signature;
      }
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,source);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,el); gl.drawArrays(gl.TRIANGLES,0,6);
    }
  };
}
