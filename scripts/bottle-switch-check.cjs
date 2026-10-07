const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,channel:'msedge'});const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();
const report={targetUrl:process.env.TEST_URL||'http://localhost:4174/codex_practice/',startedAt:new Date().toISOString(),environment:'Desktop Edge, real ONNX inference, synthetic camera carrying static public images; NOT physical iPhone camera',photos:[],checks:{}};
try{
await page.goto(process.env.TEST_URL||'http://localhost:4174/codex_practice/');await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='开启相机'&&!b.disabled),{},{timeout:180000});
let bottle;
for(const filename of ['public/samples/demo-bottle.jpg','public/samples/demo-bottle-small.jpg']){
await page.locator('input[type=file]').setInputFiles(path.resolve(filename));await page.waitForFunction(()=>/照片识别完成|未发现达到阈值/.test(document.querySelector('[role=status]')?.textContent),{},{timeout:60000});
const text=await page.locator('.detections').innerText().catch(()=>'none');report.photos.push({file:filename,detections:text});if(text.includes('塑料')&&!bottle)bottle=filename;
}
assert.ok(bottle,'No tested plastic bottle recognized; retain report without claiming success.');
const cardboard='public/samples/demo-cardboard.jpg';
const frames=[bottle,cardboard].map(f=>'data:image/jpeg;base64,'+fs.readFileSync(f).toString('base64'));
await page.evaluate(async frames=>{
window.demoImages=await Promise.all(frames.map(src=>new Promise(resolve=>{const i=new Image();i.onload=()=>resolve(i);i.src=src;})));window.demoIndex=0;
navigator.mediaDevices.getUserMedia=async()=>{const c=document.createElement('canvas');c.width=416;c.height=416;const ctx=c.getContext('2d');const timer=setInterval(()=>ctx.drawImage(window.demoImages[window.demoIndex],0,0,416,416),100);const s=c.captureStream(10);s.getTracks().forEach(t=>{const stop=t.stop.bind(t);t.stop=()=>{clearInterval(timer);stop()}});return s;};
},frames);
await page.getByRole('button',{name:'开启相机',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.detections')?.textContent.includes('塑料'),{},{timeout:60000});report.checks.liveBottlePlastic=true;
await page.screenshot({path:'validation/live-plastic-demo.png',fullPage:true});
await page.evaluate(()=>window.demoIndex=1);await page.waitForFunction(()=>document.querySelector('.detections')?.textContent.includes('纸板')&&!document.querySelector('.detections')?.textContent.includes('塑料'),{},{timeout:60000});report.checks.switchToCardboardWithoutRestart=true;
await page.screenshot({path:'validation/live-cardboard-demo.png',fullPage:true});await page.getByRole('button',{name:'停止相机',exact:true}).click();
report.selectedDemoBottle=bottle;report.passed=true;
}catch(e){report.passed=false;report.error=e.stack;process.exitCode=1;}finally{fs.writeFileSync('validation/bottle-switch.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();}})();
