import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
let pw;try{pw=require('playwright');}catch{pw=require(process.env.PLAYWRIGHT_PATH || path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const dir=path.resolve('test-results/effects-browser');await fs.mkdir(dir,{recursive:true});
const child=spawn(process.execPath,['server.mjs'],{windowsHide:true,env:{...process.env,PORT:'4321',FCUT_DATA_DIR:path.join(dir,'data-'+Date.now())}});
await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);});
const browser=await pw.chromium.launch({executablePath:process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}}), errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto('http://127.0.0.1:4321');await page.waitForSelector('#save-state:text("已恢复本地工程")');
  await page.locator('#media-input').setInputFiles(path.resolve('test-results/effects/blue.png'));
  await page.waitForSelector('[data-add]');await page.locator('[data-add]').click();
  const pixel=()=>page.evaluate(()=>{const c=document.querySelector('#effect-preview'),g=c.getContext('webgl'),b=new Uint8Array(4);g.readPixels(c.width/2,c.height/2,1,1,g.RGBA,g.UNSIGNED_BYTE,b);return [...b];});
  await page.waitForFunction(()=>document.querySelector('img.preview-media')?.naturalWidth>0);
  await page.waitForTimeout(150);const blue=await pixel();assert.ok(blue[2]>blue[0]+30,JSON.stringify(blue));
  const set=async(key,value)=>{await page.locator(`[data-prop=${key}]`).fill(String(value));await page.locator(`[data-prop=${key}]`).press('Tab');};
  await set('saturation',0);const gray=await pixel();assert.ok(Math.max(...gray.slice(0,3))-Math.min(...gray.slice(0,3))<3);
  await set('exposure',1);const bright=await pixel();assert.ok(bright[0]>gray[0]+10);
  await page.locator('#reset-color').click();assert.ok((await pixel())[2]>gray[2]);
  await set('keyColor','#163c72');await page.locator('[data-prop=keyEnabled]').check();
  assert.ok((await pixel()).slice(0,3).every(v=>v<3),'matching background is transparent');
  await page.locator('[data-prop=keyEnabled]').uncheck();
  await page.locator('[data-animation-value=x]').fill('-.2');await page.locator('[data-keyframe=x]').click();
  const ruler=await page.locator('#ruler').boundingBox();await page.mouse.click(ruler.x+110,ruler.y+10);
  await page.locator('[data-animation-value=x]').fill('.2');await page.locator('[data-keyframe=x]').click();
  assert.ok((await page.locator('[data-clear-animation=x]').innerText()).includes('(2)'));
  await page.locator('#add-video-track').click();await page.locator('#add-audio-track').click();assert.equal(await page.locator('.track').count(),7);
  await set('cropLeft',.2);await set('warmth',.3);await set('visualFadeIn',.5);
  await page.screenshot({path:path.join(dir,'effects.png')});
  await page.waitForSelector('#save-state:text("已自动保存")');await page.reload();await page.waitForSelector('.clip.image');
  assert.equal(await page.locator('.track').count(),7);await page.locator('.clip.image').click();
  assert.equal(await page.locator('[data-prop=cropLeft]').inputValue(),'0.2');
  assert.ok((await page.locator('[data-clear-animation=x]').innerText()).includes('(2)'));assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ok:true,checks:['preview pixels','exposure','saturation','color reset','chroma alpha','keyframe UI','add tracks','save/reload'],screenshot:path.join(dir,'effects.png')}));
}finally{await browser.close();child.kill();}
