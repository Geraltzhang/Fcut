import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, makeClip, splitClip, validateProject, addTrack, tracksOf } from '../app/model.mjs';
import { sample, opacityAt, colorTable } from '../app/effects.mjs';
const asset={id:'v',name:'test',kind:'video',duration:10};
test('legacy projects retain tracks; added tracks persist and reject invalid configurations',()=>{
  const p=newProject(); delete p.tracks; assert.equal(tracksOf(p).length,5);
  const t=addTrack(p,'video'); p.clips=[makeClip(asset,t.id)]; validateProject(p,[asset]);
  assert.equal(tracksOf(JSON.parse(JSON.stringify(p)))[1].id,t.id);
  p.tracks.push({...t}); assert.throws(()=>validateProject(p,[asset]),/轨道/);
});
test('keyframes interpolate and remain continuous when split',()=>{
  const c={...makeClip(asset,'v1'),keyframes:{x:[{time:0,value:-1},{time:10,value:1}]}};
  assert.equal(sample(c,'x',5),0); assert.equal(sample(c,'x',-1),-1); assert.equal(sample(c,'x',11),1);
  const [a,b]=splitClip(c,4); assert.equal(sample(a,'x',4),sample(b,'x',0));
  assert.ok(Math.abs(sample(b,'x',3)-sample(c,'x',7))<1e-12); b.keyframes.x[0].value=.9; assert.notEqual(a.keyframes.x.at(-1).value,.9);
});
test('invalid effects and hostile expressions cannot enter the filter graph',()=>{
  const p=newProject(), c=makeClip(asset,'v1');p.clips=[c];
  for(const bad of [{exposure:NaN},{cropLeft:.6,cropRight:.5},{keyColor:'red:movie=x'},{keyframes:{x:[{time:1,value:0},{time:1,value:1}]}},{keyframes:{scale:[{time:0,value:0}]}}]){
    p.clips=[{...c,...bad}]; assert.throws(()=>validateProject(p,[asset]));
  }
});
test('neutral grading is identity; exposure and fades use stable parameter meanings',()=>{
  assert.deepEqual(colorTable({},0),Array.from({length:256},(_,i)=>i));
  assert.ok(colorTable({exposure:1},0)[100]>100);
  const c={duration:4,opacity:.8,visualFadeIn:1,visualFadeOut:1};
  assert.equal(opacityAt(c,.5),.4);assert.equal(opacityAt(c,2),.8);assert.equal(opacityAt(c,3.5),.4);
});
