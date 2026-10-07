import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CLASS_NAMES, COLORS, letterbox } from './detection.mjs';
import { assetUrl, BASE_PATH } from './paths.mjs';
import { Icon, MobileHeader, useRelay } from './ui.jsx';

function drawBoxes(canvas, width, height, boxes) {
  if (!canvas) return;
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, width, height);
  const fontSize = Math.max(16, Math.round(width / 30));
  ctx.font = `700 ${fontSize}px system-ui`; ctx.lineWidth = Math.max(3, width / 230);
  boxes.forEach(box => {
    const color = COLORS[box.label], text = `${CLASS_NAMES[box.label]} ${(box.score * 100).toFixed(0)}%`;
    ctx.strokeStyle = color; ctx.strokeRect(box.x, box.y, box.w, box.h);
    const labelWidth = Math.min(width, ctx.measureText(text).width + 18), labelHeight = fontSize + 13;
    const left = Math.min(box.x, width - labelWidth), top = Math.max(0, box.y - labelHeight);
    ctx.fillStyle = color; ctx.fillRect(left, top, labelWidth, labelHeight); ctx.fillStyle = '#071410'; ctx.fillText(text, left + 8, top + fontSize + 2);
  });
}

export default function Detector({ session }) {
  const [room, update] = useRelay(session);
  const worker = useRef(null), callbacks = useRef(new Map()), nextId = useRef(0);
  const video = useRef(null), photo = useRef(null), overlay = useRef(null), fileInput = useRef(null), stream = useRef(null);
  const inputCanvas = useRef(document.createElement('canvas')), generation = useRef(0), busy = useRef(false), roomRef = useRef(room), stableFrames = useRef(0), sentForCycle = useRef(false), modeRef = useRef('empty'), imageUrl = useRef('');
  const [model, setModel] = useState({ loading: true, ready: false, progress: 0, status: '正在准备识别引擎', error: '' });
  const [mode, setMode] = useState('empty'), [photoSource, setPhotoSource] = useState(''), [dimensions, setDimensions] = useState({ width: 4, height: 3 });
  const [boxes, setBoxes] = useState([]), [timing, setTiming] = useState(null);
  roomRef.current = room;

  useEffect(() => { if (room.stage === 'idle') { sentForCycle.current = false; stableFrames.current = 0; } }, [room.stage]);
  const sendDetection = useCallback(async source => {
    if (sentForCycle.current || roomRef.current.stage !== 'idle') return;
    sentForCycle.current = true;
    await update({ stage: 'detected', eventSeq: (roomRef.current.eventSeq || 0) + 1, eventTime: Date.now(), triggerSource: source }, 'detector');
  }, [update]);

  function call(type, data = {}, transfer = []) {
    const id = ++nextId.current;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { callbacks.current.delete(id); reject(new Error('识别引擎响应超时')); }, type === 'load' ? 180000 : 60000);
      callbacks.current.set(id, { resolve, reject, timeout });
      worker.current.postMessage({ id, type, ...data }, transfer);
    });
  }

  function setViewMode(value) { modeRef.current = value; setMode(value); }
  function stopCamera(message = '相机已停止') {
    generation.current += 1;
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    if (video.current) video.current.srcObject = null;
    if (modeRef.current === 'camera') setViewMode('empty');
    setModel(value => ({ ...value, status: message }));
  }

  useEffect(() => {
    worker.current = new Worker(new URL('./inference.worker.js', import.meta.url), { type: 'module' });
    worker.current.onmessage = ({ data }) => {
      if (data.event === 'progress') { setModel(value => ({ ...value, progress: data.progress, status: data.progress === 100 ? '正在初始化模型' : '正在下载识别模型' })); return; }
      const callback = callbacks.current.get(data.id); if (!callback) return;
      callbacks.current.delete(data.id); clearTimeout(callback.timeout);
      data.error ? callback.reject(new Error(data.error)) : callback.resolve(data.result);
    };
    call('load', { size: 416, backend: 'wasm' }).then(() => setModel({ loading: false, ready: true, progress: 100, status: '识别引擎已就绪', error: '' })).catch(error => setModel({ loading: false, ready: false, progress: 0, status: '模型加载失败', error: error.message }));
    if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register(assetUrl('sw.js'), { scope: BASE_PATH }).catch(() => {});
    return () => { generation.current += 1; stream.current?.getTracks().forEach(track => track.stop()); if (imageUrl.current) URL.revokeObjectURL(imageUrl.current); worker.current?.terminate(); callbacks.current.forEach(cb => { clearTimeout(cb.timeout); cb.reject(new Error('页面已关闭')); }); };
  }, []);

  async function infer(source, width, height, token) {
    if (busy.current) return;
    busy.current = true;
    try {
      const geometry = letterbox(width, height, 416), canvas = inputCanvas.current;
      canvas.width = canvas.height = 416;
      const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.fillStyle = 'rgb(114,114,114)'; ctx.fillRect(0, 0, 416, 416); ctx.drawImage(source, geometry.padX, geometry.padY, geometry.resizedWidth, geometry.resizedHeight);
      const pixels = ctx.getImageData(0, 0, 416, 416).data.buffer, start = performance.now();
      const result = await call('infer', { pixels, geometry, threshold: .18 }, [pixels]);
      if (generation.current !== token) return;
      drawBoxes(overlay.current, width, height, result.boxes); setBoxes(result.boxes); setTiming(Math.round(performance.now() - start));
      if (result.boxes.length) {
        stableFrames.current += 1; setModel(value => ({ ...value, status: '已检出目标 · 正在确认' }));
        if ((modeRef.current === 'photo' || stableFrames.current >= 2) && !sentForCycle.current) sendDetection('vision');
      } else { stableFrames.current = 0; setModel(value => ({ ...value, status: '正在扫描路面目标' })); }
    } catch (error) { setModel(value => ({ ...value, error: error.message, status: '识别暂停' })); }
    finally { busy.current = false; }
  }

  async function startCamera() {
    stopCamera(); setPhotoSource(''); setBoxes([]); setTiming(null); setModel(value => ({ ...value, error: '', status: '请允许访问后置相机' }));
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { setModel(value => ({ ...value, error: '相机需要 HTTPS 安全连接。', status: '相机不可用' })); return; }
    const token = generation.current;
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
      if (token !== generation.current) { acquired.getTracks().forEach(track => track.stop()); return; }
      stream.current = acquired; video.current.srcObject = acquired; await video.current.play(); setViewMode('camera');
      const tick = async () => { if (token !== generation.current || !stream.current) return; const element = video.current; if (element.readyState >= 2 && element.videoWidth) { setDimensions({ width: element.videoWidth, height: element.videoHeight }); await infer(element, element.videoWidth, element.videoHeight, token); } if (token === generation.current) requestAnimationFrame(tick); };
      tick();
    } catch (error) { setModel(value => ({ ...value, error: error.name === 'NotAllowedError' ? '未获得相机权限，请允许后重试。' : `相机打开失败：${error.message}`, status: '相机未开启' })); }
  }

  function selectPhoto(event) {
    const file = event.target.files?.[0]; if (!file) return;
    stopCamera('正在读取照片'); setBoxes([]); setTiming(null); setViewMode('photo');
    if (imageUrl.current) URL.revokeObjectURL(imageUrl.current); imageUrl.current = URL.createObjectURL(file); setPhotoSource(imageUrl.current); event.target.value = '';
  }

  const signalSent = room.stage !== 'idle';
  return <div className="mobile-shell detector-shell"><MobileHeader title="数智清道夫" subtitle="手机边缘感知端" room={room}/><main className="detector-main">
    <section className="camera-card"><div className="camera-top"><span><i className={mode === 'camera' ? 'live' : ''}/>{mode === 'camera' ? '实时识别' : mode === 'photo' ? '照片识别' : '取景画面'}</span><b>YOLO · 本机运行</b></div><div className="camera-view" style={{ '--ratio': `${dimensions.width}/${dimensions.height}` }}><video ref={video} className={mode === 'camera' ? 'visible' : ''} playsInline muted autoPlay/>{photoSource && <img ref={photo} src={photoSource} alt="待识别照片" onLoad={() => { const w = photo.current.naturalWidth, h = photo.current.naturalHeight; setDimensions({ width: w, height: h }); infer(photo.current, w, h, generation.current); }}/>}<canvas ref={overlay}/>{mode === 'empty' && <div className="camera-empty"><span><Icon name="scan"/></span><strong>对准道路上的垃圾</strong><small>建议保持 30–80 cm 距离，避免镜面反光</small></div>}{mode === 'camera' && <div className="scan-line"/>}</div><div className="detector-metrics"><div><strong>{String(boxes.length).padStart(2,'0')}</strong><span>检出目标</span></div><div><strong>{boxes.length ? `${Math.round(Math.max(...boxes.map(box => box.score)) * 100)}%` : '—'}</strong><span>最高置信度</span></div><div><strong>{timing || '—'}<small> ms</small></strong><span>本次推理</span></div></div></section>
    <section className={`signal-card ${signalSent ? 'sent' : ''}`}><span className="signal-icon">{signalSent ? <Icon name="check"/> : <Icon name="cloud"/>}</span><div><strong>{signalSent ? '事件信号已上报' : '等待检测信号'}</strong><small>{signalSent ? '指挥中心已接收，请等待流程闭环' : '检测稳定后自动发送，画面不上传'}</small></div><b>{signalSent ? '已送达' : '待命'}</b></section>
    <div className="detector-status"><span className={model.ready ? 'ready' : ''}/><div><strong>{model.status}</strong>{model.loading && <progress max="100" value={model.progress}/>} {model.error && <small>{model.error}</small>}</div></div>
    <div className="mobile-actions"><button className="primary-mobile" onClick={mode === 'camera' ? () => stopCamera() : startCamera} disabled={!model.ready}>{mode === 'camera' ? '停止相机' : '开启后置相机'}</button><button onClick={() => fileInput.current.click()} disabled={!model.ready}><Icon name="camera"/>选择照片</button><input ref={fileInput} type="file" accept="image/*" hidden onChange={selectPhoto}/></div>
    <details className="backup-trigger"><summary>现场保障</summary><p>如现场光线或镜头影响识别，可仅发送一次事件信号。</p><button onClick={() => sendDetection('manual')} disabled={signalSent}>备用触发信号</button></details>
  </main><footer className="mobile-footer"><Icon name="shield"/>照片和相机画面仅在本机识别</footer></div>;
}
