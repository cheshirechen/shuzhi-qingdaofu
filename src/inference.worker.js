import * as ort from 'onnxruntime-web/webgpu';
import { toTensor, decode } from './detection.mjs';
import { assetUrl } from './paths.mjs';

ort.env.wasm.wasmPaths = assetUrl('runtime/');
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
let session, activeSize, activeBackend, chain = Promise.resolve();
const cacheName = 'ican-garbage-models-v1';

async function download(url, id, checksum) {
  const valid = async bytes => !checksum || Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)), x => x.toString(16).padStart(2,'0')).join('') === checksum;
  let cache;
  try { cache = await caches.open(cacheName); } catch { /* Private browsing can deny storage. */ }
  const hit = await cache?.match(url);
  if (hit) {
    const bytes = await hit.arrayBuffer();
    if (await valid(bytes)) {self.postMessage({ id, event: 'progress', progress: 100, cached: true }); return bytes;}
    await cache.delete(url);
  }
  const response = await fetch(url, { cache: 'no-cache', credentials: 'same-origin' });
  if (!response.ok) throw new Error(`模型下载失败（${response.status}），请检查网络后重试。`);
  const length = Number(response.headers.get('Content-Length'));
  const reader = response.body.getReader();
  const chunks = []; let received = 0;
  while (true) {
    const {done, value} = await reader.read(); if (done) break;
    chunks.push(value); received += value.length;
    self.postMessage({ id, event: 'progress', progress: length ? Math.min(99, Math.round(received / length * 100)) : null, bytes: received });
  }
  const buffer = new Uint8Array(received); let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  if (checksum) {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
    if (Array.from(digest, x => x.toString(16).padStart(2,'0')).join('') !== checksum) throw new Error('模型文件校验失败，请重试下载。');
  }
  try { await cache?.put(url, new Response(buffer, { headers: {'Content-Type': 'application/octet-stream'} })); } catch { /* Inference works without persistence. */ }
  self.postMessage({ id, event:'progress', progress: 100 });
  return buffer.buffer;
}

async function handle(message) {
  const {id, type} = message;
  try {
    if (type === 'load') {
      await session?.release(); session = undefined;
      const manifestResponse = await fetch(assetUrl('models/manifest.json'));
      if (!manifestResponse.ok) throw new Error('无法读取模型信息，请检查网络后重试。');
      const manifest = await manifestResponse.json();
      const entry = manifest.models.find(model => model.size === message.size);
      if (!entry) throw new Error('该输入尺寸还没有可用模型。');
      const model = await download(assetUrl(entry.url), id, entry.sha256);
      let backend = message.backend === 'webgpu' ? 'webgpu' : 'wasm';
      let warning = '';
      try {
        session = await ort.InferenceSession.create(model, { executionProviders: [backend], graphOptimizationLevel: 'all' });
        const warmup = new ort.Tensor('float32', new Float32Array(3 * message.size ** 2), [1,3,message.size,message.size]);
        const outputs = await session.run({ [session.inputNames[0]]: warmup });
        warmup.dispose(); Object.values(outputs).forEach(t => t.dispose());
      } catch (error) {
        await session?.release(); session = undefined;
        if (backend !== 'webgpu') throw error;
        backend = 'wasm'; warning = '加速模式暂不可用，已使用兼容模式。';
        session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      }
      activeSize = message.size; activeBackend = backend;
      self.postMessage({ id, result: { ready: true, backend, size: activeSize, warning, manifest } });
    } else if (type === 'infer') {
      if (!session || message.geometry.size !== activeSize) throw new Error('模型尚未就绪。');
      const start = performance.now();
      const input = new ort.Tensor('float32', toTensor(new Uint8ClampedArray(message.pixels), activeSize), [1,3,activeSize,activeSize]);
      let outputs;
      try {
        outputs = await session.run({ [session.inputNames[0]]: input });
        const tensor = outputs[session.outputNames[0]];
        const boxes = decode(tensor.data, tensor.dims, message.geometry, message.threshold, 0.45);
        self.postMessage({ id, result: { boxes, inferenceMs: performance.now() - start, backend: activeBackend } });
      } finally { input.dispose(); if (outputs) Object.values(outputs).forEach(t => t.dispose()); }
    }
  } catch (error) { self.postMessage({id, error: error?.message || String(error)}); }
}
self.onmessage = ({data}) => { chain = chain.then(() => handle(data)); };
