from pathlib import Path
import json,shutil,zipfile
root=Path(__file__).resolve().parents[1];public=root/'public/samples'
entries=json.loads((public/'index.json').read_text(encoding='utf-8'));bottles=json.loads((root/'artifacts/bottles/sources.json').read_text())
materials=json.loads((root/'validation/material-demo.json').read_text());card=next(x for x in materials if x['sample']=='cardboard-1.jpg')
new=[]
for source,target,title,original,split in [(root/'artifacts/bottles/bottle-10.jpg','demo-bottle.jpg','塑料瓶',bottles[9],'test'),(root/'artifacts/material-demo/cardboard-1.jpg','demo-cardboard.jpg','纸板',card['source'],'valid'),(root/'artifacts/bottles/bottle-11.jpg','demo-bottle-small.jpg','透明塑料瓶',bottles[10],'test')]:
    shutil.copyfile(source,public/target);new.append({'url':'/samples/'+target,'title':title,'source':original,'dataset':'keremberke/garbage-object-detection '+split,'license':'CC BY 4.0','purpose':'Selected demonstration image; not representative accuracy evidence'})
(public/'index.json').write_text(json.dumps(new+[e for e in entries if not e['url'].startswith('/samples/demo-')],ensure_ascii=False,indent=2),encoding='utf-8')
