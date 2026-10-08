import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
function walk(dir) { return readdirSync(dir).flatMap(name=>statSync(join(dir,name)).isDirectory()?walk(join(dir,name)):[join(dir,name)]); }
const base=process.env.VITE_BASE_PATH||'/shuzhi-qingdaofu/';
if(!base.startsWith('/')||!base.endsWith('/'))throw new Error('VITE_BASE_PATH must start and end with /');
const files = walk('dist').map(path=>path.replaceAll('\\','/').replace(/^dist/,'')).filter(path=>!path.startsWith('/models/')&&path!=='/sw.js');
files.push('/models/manifest.json','/');
const versionHash=createHash('sha256').update(files.join('|'));
for(const file of files)if(file!=='/')versionHash.update(readFileSync('dist'+file));
const version=versionHash.digest('hex').slice(0,12);
const prefix='ican-garbage-shell-'+base.replace(/[^a-z0-9]/gi,'_')+'-';
const source=`const CACHE='${prefix}${version}', PREFIX=${JSON.stringify(prefix)}, BASE=${JSON.stringify(base)};
const FILES=${JSON.stringify(files.map(f=>base+f.slice(1)))};
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(FILES);await self.skipWaiting();})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith(PREFIX)&&name!==CACHE)await caches.delete(name);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(BASE)||url.pathname.endsWith('.onnx'))return;
 if(event.request.mode==='navigate'){
   event.respondWith(fetch(event.request).catch(async()=>await caches.match(event.request)||await caches.match(BASE+'index.html')||await caches.match(BASE)));return;
 }
 if(FILES.includes(url.pathname))event.respondWith((async()=>{const cache=await caches.open(CACHE);const cached=await cache.match(event.request);if(cached)return cached;const response=await fetch(event.request);if(response.ok)await cache.put(event.request,response.clone());return response;})());
});
`;
writeFileSync('dist/sw.js',source);
console.log('Offline shell',version,files.length,'same-origin files; photos never uploaded.');
