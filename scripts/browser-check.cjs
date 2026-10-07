/* Run against the production preview. Optional SOAK_SECONDS=600 tests desktop fake camera. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge',args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 const context=await browser.newContext({viewport:{width:390,height:844},permissions:['camera'],acceptDownloads:true});
 // Verify the download fallback; native OS share sheets cannot be automated headlessly.
 await context.addInitScript(()=>Object.defineProperty(navigator,'canShare',{value:()=>false,configurable:true}));
 const canvasCamera=Number(process.env.SOAK_SECONDS||15)>30;
 if(canvasCamera)await context.addInitScript(()=>{
   navigator.mediaDevices.getUserMedia=async()=>{
     const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;
     const ctx=canvas.getContext('2d');let tick=0;
     const timer=setInterval(()=>{ctx.fillStyle='#808080';ctx.fillRect(0,0,1280,720);ctx.fillStyle='#cccccc';ctx.fillRect((tick++*4)%1100,100,150,200);},100);
     const stream=canvas.captureStream(10);stream.getTracks().forEach(t=>{const stop=t.stop.bind(t);t.stop=()=>{clearInterval(timer);stop();};});return stream;
   };
 });
 const page=await context.newPage();const errors=[],requests=[],failed=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({method:r.method(),url:r.url()}));page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()?.errorText}));
 const base=process.env.TEST_URL||'http://localhost:4173';
 const report={targetUrl:base,environment:`Desktop Edge/Chromium, mobile viewport, ${canvasCamera?'canvas-generated camera stream (getUserMedia stub)':'browser fake camera device'}; NOT iPhone Safari`,startedAt:new Date().toISOString(),checks:{}};
 const ready=()=>page.getByRole('button',{name:'开启相机',exact:true}).waitFor({state:'visible'}).then(()=>page.waitForFunction(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent==='开启相机');return b&&!b.disabled},{},{timeout:180000}));
 try{
 await page.goto(base);await ready();report.checks.modelLoaded=true;
 await page.locator('input[type=file]').setInputFiles(path.resolve('public/samples/public-test-01.jpg'));
 await page.waitForFunction(()=>/照片识别完成|未发现达到阈值/.test(document.querySelector('[role=status]')?.textContent),{},{timeout:60000});
 report.photo416=await page.locator('.metrics').innerText();report.checks.photo416=true;
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 const geometry=await page.evaluate(()=>{const i=document.querySelector('.media-stage img').getBoundingClientRect(),c=document.querySelector('.media-stage canvas').getBoundingClientRect();return {image:{x:i.x,y:i.y,w:i.width,h:i.height},canvas:{x:c.x,y:c.y,w:c.width,h:c.height}}});
 assert.ok(Math.abs(geometry.image.w-geometry.canvas.w)<1&&Math.abs(geometry.image.h-geometry.canvas.h)<1);report.checks.overlayAlignedPortrait=true;
 fs.mkdirSync('validation',{recursive:true});await page.screenshot({path:'validation/mobile-photo.png',fullPage:true});
 await page.selectOption('#resolution','640');await ready();report.photo640=await page.locator('.metrics').innerText();report.checks.photo640=true;
 await page.setViewportSize({width:844,height:390});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);report.checks.landscapeNoOverflow=true;
 await page.screenshot({path:'validation/landscape-photo.png',fullPage:true});
 await page.selectOption('#resolution','416');await ready();
 const downloadPromise=page.waitForEvent('download',{timeout:10000}).catch(()=>null);await page.getByRole('button',{name:'保存画面',exact:true}).click();const download=await downloadPromise;
 report.checks.saveDownload=!!download;assert.ok(download);
 await page.getByRole('button',{name:'开启相机',exact:true}).click();await page.getByRole('button',{name:'停止相机',exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelector('[role=status]')?.textContent.includes('正在识别'),{},{timeout:60000});
 report.checks.cameraContinuous=true;
 const duration=Number(process.env.SOAK_SECONDS||15);const start=Date.now();
 while(Date.now()-start<duration*1000){await page.waitForTimeout(Math.min(30000,duration*1000-(Date.now()-start)));const state=await page.locator('video').evaluate(v=>({src:!!v.srcObject,tracks:v.srcObject?.getVideoTracks().map(t=>({state:t.readyState,muted:t.muted})),paused:v.paused}));console.log('Camera soak',Math.round((Date.now()-start)/1000),'seconds',state);assert.ok(state.tracks?.every(t=>t.state==='live'));}
 report.cameraSoakSeconds=(Date.now()-start)/1000;report.cameraMetrics=await page.locator('.metrics').innerText();
 await page.evaluate(()=>{window.testTracks=document.querySelector('video').srcObject.getTracks()});
 await page.getByRole('button',{name:'停止相机',exact:true}).click();assert.ok(await page.evaluate(()=>window.testTracks.every(t=>t.readyState==='ended')));report.checks.stopReleasesTracks=true;
 await page.getByRole('button',{name:'开启相机',exact:true}).click();await page.getByRole('button',{name:'停止相机',exact:true}).waitFor();await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));await page.getByRole('button',{name:'开启相机',exact:true}).waitFor();report.checks.pagehideStopsCamera=true;
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await ready();
 await context.setOffline(true);await page.reload();await ready();
 await page.locator('.samples button').first().click();await page.waitForFunction(()=>/照片识别完成|未发现达到阈值/.test(document.querySelector('[role=status]')?.textContent),{},{timeout:60000});report.checks.offlineReloadAndInference=true;
 await context.setOffline(false);await page.locator('summary').filter({hasText:'性能与离线设置'}).click();await page.selectOption('#backend','webgpu');await ready();report.checks.webgpuOrWasmFallback=true;
 report.backendStatus=await page.locator('.status-line').innerText();
 report.checks.noImageUploads=requests.every(r=>r.method==='GET');assert.ok(report.checks.noImageUploads);
 report.checks.noExternalInferenceRequests=requests.every(r=>r.url.startsWith(base)||r.url.startsWith('blob:')||r.url.startsWith('data:'));assert.ok(report.checks.noExternalInferenceRequests);
 report.errors=errors;report.requestFailures=failed;assert.equal(errors.length,0);report.passed=true;
 }catch(e){report.passed=false;report.failure=e.stack;await page.screenshot({path:'validation/browser-failure.png',fullPage:true}).catch(()=>{});process.exitCode=1;}
 finally{report.finishedAt=new Date().toISOString();fs.writeFileSync('validation/browser-validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();}
})();
