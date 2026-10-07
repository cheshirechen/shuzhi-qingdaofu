import {readFileSync,writeFileSync} from 'node:fs';
const path='public/manifest.webmanifest',m=JSON.parse(readFileSync(path));
m.id='./';m.start_url='./';m.scope='./';m.icons=m.icons.map(i=>({...i,src:'./'+i.src.replace(/^\//,'')}));writeFileSync(path,JSON.stringify(m));
