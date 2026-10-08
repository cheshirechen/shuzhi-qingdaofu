import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CLASS_NAMES, COLORS, letterbox } from './detection.mjs';
import { assetUrl } from './paths.mjs';
import './realtime-config.js';
import { DemoRelay } from './realtime.js';
import { DEMO_SESSION, normalizeSession } from './demoData.js';
import './detector-original.css';
import './detector-integration.css';

const VERSION = '1.0.0';
const session = normalizeSession(new URLSearchParams(window.location.search).get('session') || DEMO_SESSION);
const baseUrl = import.meta.env.BASE_URL;
function Icon({name, ...props}) {
  const paths = {camera: 'M8 6l2-3h4l2 3h4v14H4V6z M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0', image: 'M3 3h18v18H3z M3 17l6-6 5 5 3-3 4 4 M16 7h.01', save: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5', scan: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M7 12h10', stop: 'M6 6h12v12H6z', shield: 'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z m-4 9 3 3 5-6'};
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name] || paths.scan}/></svg>;
}

function drawBoxes(canvas, width, height, boxes) {
  if (canvas.width !== width || canvas.height !== height) {canvas.width = width; canvas.height = height;}
  const ctx = canvas.getContext('2d'); ctx.clearRect(0,0,width,height);
  const fontSize = Math.max(16, Math.round(width / 35));
  ctx.font = `600 ${fontSize}px system-ui`; ctx.lineWidth = Math.max(2, width / 260);
  for (const box of boxes) {
    const color = COLORS[box.label], text = `${CLASS_NAMES[box.label]} ${(box.score * 100).toFixed(0)}%`;
    ctx.strokeStyle = color; ctx.strokeRect(box.x,box.y,box.w,box.h);
    const labelWidth = Math.min(width, ctx.measureText(text).width + 14), labelHeight = fontSize + 12;
    const left = Math.min(box.x, width - labelWidth), top = Math.min(height - labelHeight, Math.max(0,box.y - labelHeight));
    ctx.fillStyle = color; ctx.fillRect(left,top,labelWidth,labelHeight);
    ctx.fillStyle = '#101917'; ctx.fillText(text,left+7,top+fontSize+2);
  }
}

function App() {
  const worker = useRef(), callbacks = useRef(new Map()), nextId = useRef(0);
  const video = useRef(), photo = useRef(), overlay = useRef(), fileInput = useRef();
  const stream = useRef(), generation = useRef(0), busy = useRef(false), modeRef = useRef('empty');
  const frame = useRef(document.createElement('canvas')), processedFrame = useRef(document.createElement('canvas'));
  const inputCanvas = useRef(document.createElement('canvas')), thresholdRef = useRef(.25), sizeRef = useRef(416);
  const resultsRef = useRef([]), imageUrl = useRef(), startedAt = useRef(0), samples = useRef([]), actions = useRef({});
  const savedResults = useRef([]);
  const relayRef = useRef(), roomRef = useRef({ stage: 'idle', eventSeq: 0 }), streakRef = useRef(0), sentRef = useRef(false);
  const [ready,setReady] = useState(false), [loading,setLoading] = useState(true), [progress,setProgress] = useState(0);
  const [status,setStatus] = useState('正在准备识别模型'), [error,setError] = useState('');
  const [mode,setMode] = useState('empty'), [size,setSize] = useState(416), [backend,setBackend] = useState('wasm'), [actualBackend,setActualBackend] = useState('wasm');
  const [threshold,setThreshold] = useState(.25), [boxes,setBoxes] = useState([]), [timing,setTiming] = useState(null);
  const [photoSource,setPhotoSource] = useState(''), [dimensions,setDimensions] = useState({width:4,height:3});
  const [processing,setProcessing] = useState(false), [offline,setOffline] = useState(!navigator.onLine), [cacheStatus,setCacheStatus] = useState('');
  const [deviceInfo,setDeviceInfo] = useState(''), [sampleList,setSampleList] = useState([]);
  const [sent,setSent] = useState(false);

  useEffect(() => {
    const relay = new DemoRelay(session, next => {
      roomRef.current = next;
      const eventInProgress = next.stage !== 'idle';
      sentRef.current = eventInProgress;
      setSent(eventInProgress);
      if (!eventInProgress) {
        streakRef.current = 0;
      }
    });
    relayRef.current = relay;
    relay.start();
    return () => relay.stop();
  }, []);

  async function sendDetection(force = false) {
    if (!relayRef.current || sentRef.current) return;
    if (!force && roomRef.current.stage !== 'idle') return;
    sentRef.current = true;
    setSent(true);
    setStatus('已识别目标 · 事件信号已发送');
    await relayRef.current.update({
      stage: 'detected',
      eventSeq: (roomRef.current.eventSeq || 0) + 1,
      eventTime: Date.now(),
      acceptedAt: null,
      completedAt: null,
    }, 'detector');
  }

  function call(type, data = {}, transfer = []) {
    const id = ++nextId.current;
    return new Promise((resolve,reject) => {
      const timeout = setTimeout(() => { callbacks.current.delete(id); reject(new Error('识别引擎响应超时，请重新加载页面。')); }, type === 'load' ? 180000 : 60000);
      callbacks.current.set(id,{resolve,reject,timeout});
      worker.current.postMessage({id,type,...data}, transfer);
    });
  }

  function stopCamera(message = '相机已停止') {
    generation.current++;
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    if (video.current) video.current.srcObject = null;
    if (modeRef.current === 'camera') { modeRef.current = 'empty'; setMode('empty'); setBoxes([]); resultsRef.current = []; overlay.current?.getContext('2d').clearRect(0,0,overlay.current.width,overlay.current.height); }
    setStatus(message);
  }

  async function loadModel(nextSize = sizeRef.current, nextBackend = backend) {
    stopCamera('正在加载模型'); setReady(false); setLoading(true); setError(''); setProgress(0); setTiming(null);
    sizeRef.current = nextSize; setSize(nextSize); setBackend(nextBackend);
    try {
      const result = await call('load',{size:nextSize,backend:nextBackend});
      setActualBackend(result.backend); setReady(true); setStatus(result.warning || '模型就绪 · 可以开始识别');
      setCacheStatus('当前模型已加载；离线可用性请通过下方检查确认');
      if (modeRef.current === 'photo') await inferPhoto();
    } catch (e) {setError(e.message); setStatus('模型加载失败');}
    finally {setLoading(false);}
  }

  useEffect(() => {
    worker.current = new Worker(new URL('./inference.worker.js', import.meta.url), {type:'module'});
    worker.current.onmessage = ({data}) => {
      if (data.event === 'progress') {setProgress(data.progress); setStatus(data.progress === 100 ? '模型已下载，正在初始化' : '正在下载识别模型');return;}
      const callback = callbacks.current.get(data.id); if (!callback) return;
      callbacks.current.delete(data.id); clearTimeout(callback.timeout);
      data.error ? callback.reject(new Error(data.error)) : callback.resolve(data.result);
    };
    worker.current.onerror = () => {
      for (const callback of callbacks.current.values()) {clearTimeout(callback.timeout);callback.reject(new Error('识别引擎启动失败，请重新加载页面。'));}
      callbacks.current.clear(); setReady(false);
    };
    loadModel();
    fetch(`${baseUrl}samples/index.json`).then(r => r.ok ? r.json() : []).then(items => setSampleList(items.map(item => ({ ...item, url: assetUrl(item.url) })))).catch(()=>{});
    if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register(`${baseUrl}sw.js`).catch(()=>setCacheStatus('离线缓存不可用，联网识别仍可使用'));
    const visibility = () => {if (document.hidden && modeRef.current === 'camera') stopCamera('已暂停 · 回到页面后点击开启相机');};
    const network = () => setOffline(!navigator.onLine);
    const pagehide = () => stopCamera('已暂停 · 点击开启相机继续');
    document.addEventListener('visibilitychange', visibility); window.addEventListener('pagehide', pagehide);
    window.addEventListener('online',network);window.addEventListener('offline',network);
    return () => {
      stopCamera(); worker.current.terminate();
      for (const cb of callbacks.current.values()) {clearTimeout(cb.timeout); cb.reject(new Error('页面已关闭'));}
      callbacks.current.clear(); if(imageUrl.current) URL.revokeObjectURL(imageUrl.current);
      document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',pagehide);window.removeEventListener('online',network);window.removeEventListener('offline',network);
    };
  }, []);

  async function infer(source, width, height, token) {
    if (busy.current) return null;
    busy.current = true; setProcessing(true);
    const start = performance.now();
    try {
      const geometry = letterbox(width,height,sizeRef.current), canvas = inputCanvas.current;
      canvas.width = canvas.height = sizeRef.current;
      const ctx = canvas.getContext('2d',{willReadFrequently:true});
      ctx.fillStyle = 'rgb(114,114,114)'; ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(source,geometry.padX,geometry.padY,geometry.resizedWidth,geometry.resizedHeight);
      // Keep the exact frame paired with its detections for saving, even during live preview.
      frame.current.width = width; frame.current.height = height; frame.current.getContext('2d').drawImage(source,0,0,width,height);
      const pixels = ctx.getImageData(0,0,canvas.width,canvas.height).data.buffer;
      const result = await call('infer',{pixels,geometry,threshold:thresholdRef.current},[pixels]);
      if (generation.current !== token) return null;
      const totalMs = performance.now()-start;
      processedFrame.current.width=width;processedFrame.current.height=height;
      processedFrame.current.getContext('2d').drawImage(frame.current,0,0);
      drawBoxes(overlay.current,width,height,result.boxes);
      resultsRef.current=result.boxes;savedResults.current=result.boxes;setBoxes(result.boxes);setTiming({inferenceMs:result.inferenceMs,totalMs});
      const hasConfidentTarget = result.boxes.some(box => box.score >= Math.max(.45, thresholdRef.current));
      streakRef.current = hasConfidentTarget ? streakRef.current + 1 : 0;
      if (hasConfidentTarget && (modeRef.current === 'photo' || streakRef.current >= 3)) sendDetection();
      samples.current.push({time:new Date().toISOString(),size:sizeRef.current,backend:result.backend,inferenceMs:result.inferenceMs,totalMs,count:result.boxes.length,mode:modeRef.current});
      if(samples.current.length>6000) samples.current.shift();
      setStatus(modeRef.current === 'camera' ? '正在识别 · 画面仅在本机处理' : result.boxes.length ? '照片识别完成' : '未发现达到阈值的目标');
      return result;
    } finally {busy.current=false;setProcessing(false);}
  }

  async function inferPhoto() {
    if (!photo.current?.complete || !photo.current?.naturalWidth) return;
    const scale=Math.min(1,1920/Math.max(photo.current.naturalWidth,photo.current.naturalHeight));
    try {await infer(photo.current,Math.round(photo.current.naturalWidth*scale),Math.round(photo.current.naturalHeight*scale),generation.current);} catch(e){setError(e.message);}
  }

  async function startCamera() {
    stopCamera();setError('');
    if(!window.isSecureContext || !navigator.mediaDevices?.getUserMedia){setError('相机需要安全连接。请使用 HTTPS 地址，并在 Safari 中打开。');return;}
    const token=generation.current;
    try {
      setStatus('请允许访问后置相机');
      const acquired=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}});
      if(token!==generation.current){acquired.getTracks().forEach(t=>t.stop());return;}
      acquired.getVideoTracks().forEach(track=>track.addEventListener('ended',()=>{
        if(token===generation.current){stopCamera('相机连接已中断');setError('摄像头已停止提供画面，请重新开启相机。');}
      },{once:true}));
      stream.current=acquired;video.current.srcObject=acquired;
      await video.current.play();
      if(token!==generation.current){acquired.getTracks().forEach(t=>t.stop());return;}
      modeRef.current='camera';setMode('camera');setPhotoSource('');setBoxes([]);resultsRef.current=[];startedAt.current=Date.now();
      const tick=async()=>{
        if(token!==generation.current || !stream.current)return;
        try {
          const v=video.current;
          if(v.readyState>=2 && v.videoWidth){setDimensions({width:v.videoWidth,height:v.videoHeight});await infer(v,v.videoWidth,v.videoHeight,token);}
        } catch(e){stopCamera('识别已停止');setError(e.message);return;}
        if(token===generation.current)requestAnimationFrame(tick);
      };tick();
    } catch(e){
      stopCamera('相机未开启');setError(e.name==='NotAllowedError'?'相机权限未获允许。请在 Safari 的网站设置中允许相机，再重试。':e.name==='NotFoundError'?'没有找到可用相机。你仍然可以选择照片识别。':`相机打开失败：${e.message}`);
    }
  }

  function openPhoto(url) {
    stopCamera();setError('');setBoxes([]);resultsRef.current=[];setTiming(null);setStatus('正在读取照片');
    if(imageUrl.current){URL.revokeObjectURL(imageUrl.current);imageUrl.current=null;}
    modeRef.current='photo';setMode('photo');setPhotoSource(url);
  }
  function selectFile(event){const file=event.target.files?.[0];if(!file)return; if(!file.type.startsWith('image/')){setError('请选择图片文件。');return;}const url=URL.createObjectURL(file);openPhoto(url);imageUrl.current=url;event.target.value='';}
  function downloadBlob(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
  async function saveFrame(){
    if(!timing)return;
    const canvas=document.createElement('canvas');canvas.width=processedFrame.current.width;canvas.height=processedFrame.current.height;
    const ctx=canvas.getContext('2d');ctx.drawImage(processedFrame.current,0,0);
    const labels=document.createElement('canvas');drawBoxes(labels,canvas.width,canvas.height,savedResults.current);ctx.drawImage(labels,0,0);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.92));if(!blob)return;
    const file=new File([blob],`清道夫识别-${Date.now()}.jpg`,{type:'image/jpeg'});
    try{if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file]});}else downloadBlob(blob,file.name);}catch(e){if(e.name!=='AbortError')downloadBlob(blob,file.name);}
  }
  function exportReport(){
    const report={appVersion:VERSION,createdAt:new Date().toISOString(),device:deviceInfo||'未填写',userAgent:navigator.userAgent,origin:location.origin,secureContext:isSecureContext,webgpuAvailable:!!navigator.gpu,settings:{size,threshold,requestedBackend:backend,actualBackend},sessionStartedAt:startedAt.current?new Date(startedAt.current).toISOString():null,samples:samples.current,qualityAssessment:'自动记录仅表示耗时和检出数；准确性、发热及 iPhone 真机结论需人工填写。'};
    downloadBlob(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),`识别测试记录-${Date.now()}.json`);
  }
  async function checkCache(){
    try{const modelCache=await caches.open('ican-garbage-models-v1');const keys=await modelCache.keys();const controlled=!!navigator.serviceWorker?.controller;setCacheStatus(controlled&&keys.some(k=>k.url.includes(`garbage-${size}.onnx`))?'当前模型已缓存。请断网并重新打开页面，确认本设备离线可用。':'缓存尚未齐全。模型加载完成后刷新一次页面，再检查。');}catch{setCacheStatus('浏览器未允许持久缓存，请联网使用。');}
  }
  actions.current={stopCamera,inferPhoto,read:()=>({ready,mode,size,backend:actualBackend,detections:resultsRef.current,timing})};
  useEffect(()=>{
    const context=document.modelContext;if(!context?.registerTool)return;
    const lifecycle=new AbortController();
    const register=tool=>{try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
    register({name:'read_garbage_detections',description:'读取当前页面的垃圾检测结果和本机识别状态。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>actions.current.read()});
    register({name:'detect_selected_photo',description:'重新识别用户已选择的照片，不开启相机，不上传图像。',inputSchema:{type:'object',properties:{},additionalProperties:false},execute:async()=>{if(actions.current.read().mode!=='photo'||!actions.current.read().ready)throw new Error('请先在页面选择照片，并等待模型就绪。');await actions.current.inferPhoto();return actions.current.read();}});
    return()=>lifecycle.abort();
  },[]);

  return <div className="app">
    <header><div className="brand-icon"><Icon name="scan"/></div><div><h1>数智清道夫</h1><p>手机垃圾识别</p></div><span className="privacy"><Icon name="shield"/>本机识别</span></header>
    <main>
      <section className="viewer-panel" aria-label="识别画面">
        <div className="viewer-top"><span><i className={mode==='camera'?'live':''}/>{mode==='camera'?'实时相机':mode==='photo'?'照片识别':'取景画面'}</span><span>{offline?'离线':'本机处理'} · {size} 输入</span></div>
        <div className={`viewer ${mode==='empty'?'empty':''}`} style={{'--ratio':`${dimensions.width} / ${dimensions.height}`}}>
          <div className="media-stage" style={{aspectRatio:`${dimensions.width}/${dimensions.height}`}}>
            <video ref={video} playsInline muted autoPlay className={mode==='camera'?'visible':''}/>
            {photoSource&&<img ref={photo} src={photoSource} alt="待识别照片" onLoad={()=>{setDimensions({width:photo.current.naturalWidth,height:photo.current.naturalHeight});if(ready)inferPhoto();}} onError={()=>{setError('无法读取这张照片，请尝试 JPG、PNG 或 Safari 支持的图片格式。');setStatus('照片读取失败');}}/>}
            <canvas ref={overlay} className={mode==='empty'?'hidden':''}/>
          </div>
          {mode==='empty'&&<div className="empty-content"><div className="scan-frame"><Icon name="scan"/></div><h2>对准垃圾，开始识别</h2><p>开启后置相机，或选择一张照片</p><span>图像仅在你的设备上处理</span></div>}
          {mode==='camera'&&<span className="live-label">● LIVE</span>}
        </div>
        <div className="metrics"><div><strong>{boxes.length.toString().padStart(2,'0')}</strong><span>检出目标</span></div><div><strong>{timing?Math.round(timing.totalMs):'—'}<small> ms</small></strong><span>单次识别耗时</span></div><div><strong>{timing?(1000/timing.totalMs).toFixed(1):'—'}<small> 次/秒</small></strong><span>处理速率估计</span></div></div>
      </section>
      <section className="control-panel">
        <div className="status-line" role="status"><span className={`status-dot ${ready?'ready':''}`}/><span>{status}</span></div>
        {sent&&<div className="dispatch-notice" role="status">事件信号已送达指挥中心</div>}
        {loading&&<div className="loading"><progress max="100" value={progress??undefined} aria-label="模型下载进度"/><span>{progress===100?'首次初始化可能需要稍等':progress===null?'下载中…':`${progress}%`}</span></div>}
        {error&&<div className="error" role="alert">{error}{!ready&&!loading&&<button onClick={()=>loadModel()}>重新加载模型</button>}</div>}
        <div className="actions"><button className="primary" disabled={!ready||loading||processing&&mode!=='camera'} onClick={mode==='camera'?()=>stopCamera():startCamera}><Icon name={mode==='camera'?'stop':'camera'}/>{mode==='camera'?'停止相机':'开启相机'}</button><button className="secondary" disabled={!ready||loading||processing} onClick={()=>fileInput.current.click()}><Icon name="image"/>选择照片</button></div>
        <input ref={fileInput} type="file" accept="image/*" onChange={selectFile} hidden/>
        <div className="section-title"><h2>识别设置</h2><span>{actualBackend==='webgpu'?'加速模式':'兼容模式'}</span></div>
        <label className="field-label" htmlFor="resolution">画面精细度</label>
        <select id="resolution" value={size} disabled={loading||processing} onChange={e=>loadModel(Number(e.target.value),backend)}><option value={416}>均衡 · 416（默认）</option><option value={640}>精细 · 640（更耗时）</option></select>
        <div className="range-label"><label htmlFor="confidence">置信度门槛</label><strong>{Math.round(threshold*100)}%</strong></div>
        <input id="confidence" type="range" min="0.1" max="0.9" step="0.05" value={threshold} onChange={e=>{const value=Number(e.target.value);thresholdRef.current=value;setThreshold(value);}} onPointerUp={()=>{if(mode==='photo'&&ready&&!processing)inferPhoto();}} onKeyUp={()=>{if(mode==='photo'&&ready&&!processing)inferPhoto();}}/>
        <p className="hint">门槛越高，显示越谨慎；分数不代表整体准确率。</p>
        <details><summary>性能与离线设置</summary><label className="field-label" htmlFor="backend">运行方式</label><select id="backend" value={backend} disabled={loading||processing} onChange={e=>loadModel(size,e.target.value)}><option value="wasm">兼容模式（默认）</option><option value="webgpu">尝试设备加速（不支持时自动回退）</option></select><p className="hint">切换设置会停止相机。加速效果需在当前设备实测。</p><button className="text-button" onClick={checkCache}>检查离线准备情况</button><p className="hint">{cacheStatus}</p><p className="hint">Safari：分享 → 添加到主屏幕。缓存被系统清理后，需要联网重新加载。</p></details>
        <details><summary>现场演示保障</summary><p className="hint">识别稳定后会自动通知指挥中心。每轮只发送一次；完成后在电脑端按 R 重置，按钮即可恢复。</p><button className="secondary" disabled={sent} onClick={() => sendDetection(true)}>{sent?'本轮事件已发送':'手动发送事件信号'}</button><p className="hint">房间码：{session}</p></details>
        <div className="section-title"><h2>检测结果</h2><button className="text-button" onClick={saveFrame} disabled={!timing}><Icon name="save"/>保存画面</button></div>
        {boxes.length?<ul className="detections">{boxes.map((box,i)=><li key={i}><span className="category-dot" style={{background:COLORS[box.label]}}/><span>{CLASS_NAMES[box.label]}</span><strong>{Math.round(box.score*100)}%</strong></li>)}</ul>:<p className="no-results">{timing?'未发现达到门槛的目标，可调整距离或阈值再试。':'识别后在这里查看类别与置信度。'}</p>}
        {sampleList.length>0&&<div className="samples"><h3>先试一张示例</h3><div>{sampleList.slice(0,3).map(s=><button key={s.url} disabled={!ready||loading||processing} onClick={()=>openPhoto(s.url)}><img src={s.url} alt={s.title}/><span>{s.title}</span></button>)}</div></div>}
      </section>
    </main>
    <section className="information"><div><h2>认识模型的边界</h2><p>识别六类：可降解垃圾、纸板、玻璃、金属、纸张、塑料。模型可能漏检或误检，也不能判断一个完好物品是否已被丢弃。</p><a href="https://huggingface.co/keremberke/yolov5n-garbage" target="_blank" rel="noreferrer">模型来源：Keremberke / YOLOv5n-garbage ↗</a></div><details><summary>保存本机测试记录</summary><label className="field-label" htmlFor="device">测试设备（可选）</label><input id="device" value={deviceInfo} onChange={e=>setDeviceInfo(e.target.value)} placeholder="例如：iPhone 15，iOS 版本"/><p className="hint">导出识别耗时与检出数，不包含照片。真机准确性和发热需人工记录。</p><button className="secondary" onClick={exportReport}>导出测试记录</button></details></section>
    <footer><span>iCAN · 数智清道夫</span><span>本地识别实验版 {VERSION}</span></footer>
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
