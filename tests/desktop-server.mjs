import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const dir=path.resolve('test-results/desktop-server-'+Date.now());
await fs.mkdir(dir,{recursive:true});
for(const exitMode of ['shutdown','stdin-close']) {
  const child=spawn(process.execPath,['server.mjs'],{windowsHide:true,env:{...process.env,PORT:'0',FCUT_DESKTOP:'1',FCUT_DATA_DIR:dir},stdio:['pipe','pipe','pipe']});
  let log='';child.stderr.on('data',b=>log+=b);
  const exit=new Promise(resolve=>child.on('exit',code=>resolve(code)));
  const timer=setTimeout(()=>child.kill(),20000);
  try {
    const url=await new Promise((resolve,reject)=>{let output='';child.stdout.on('data',b=>{output+=b;const m=output.match(/FCUT ready (http:\/\/127\.0\.0\.1:\d+)/);if(m)resolve(m[1]);});child.once('error',reject);child.once('exit',()=>reject(Error(log || 'Exited before ready')));});
    assert.ok(!url.endsWith(':0'));
    const html=await(await fetch(url)).text(),token=html.match(/name="fcut-token" content="([^"]+)"/)[1];
    const headers={'X-Fcut-Token':token};
    assert.equal((await fetch(url+'/api/desktop/status')).status,403);
    assert.deepEqual(await(await fetch(url+'/api/desktop/status',{headers})).json(),{exporting:false});
    const state=await(await fetch(url+'/api/state',{headers})).json();
    state.project.name='Desktop lifecycle';
    assert.equal((await fetch(url+'/api/project',{method:'PUT',headers,body:JSON.stringify(state.project)})).status,200);
    if(exitMode==='shutdown')child.stdin.write('shutdown\n');else child.stdin.end();
    assert.equal(await exit,0,log);
    assert.equal(JSON.parse(await fs.readFile(path.join(dir,'project.json'),'utf8')).name,'Desktop lifecycle');
    await assert.rejects(()=>fetch(url));
  }finally{clearTimeout(timer);if(child.exitCode===null)child.kill();}
}
console.log('PASS: isolated ephemeral port, authenticated desktop status, persisted project, stdin shutdown and parent disconnect.');
