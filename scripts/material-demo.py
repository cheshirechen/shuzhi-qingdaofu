"""Inspect fixed filename samples matching material prefixes, for the bottle-switch demo."""
import zipfile,json
from pathlib import Path
import cv2,numpy as np,onnxruntime as ort
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parents[1];out=root/'artifacts/material-demo';out.mkdir(exist_ok=True)
names=json.loads((root/'public/models/manifest.json').read_text(encoding='utf-8'))['classes']
archives=[zipfile.ZipFile(root/'artifacts'/f'public-{split}.zip') for split in ('test','valid')]
images=[];report=[]
opt=ort.SessionOptions();opt.intra_op_num_threads=4
session=ort.InferenceSession(str(root/'public/models/garbage-416.onnx'),sess_options=opt,providers=['CPUExecutionProvider'])
for category in names:
    choices=sorted([(name,z) for z in archives for name in z.namelist() if Path(name).name.startswith(category) and name.endswith('.jpg')],key=lambda v:Path(v[0]).name)[:4]
    for index,(filename,z) in enumerate(choices):
        data=z.read(filename);(out/f'{category}-{index+1}.jpg').write_bytes(data)
        im=cv2.imdecode(np.frombuffer(data,np.uint8),cv2.IMREAD_COLOR);im=cv2.resize(im,(416,416));x=np.ascontiguousarray(im[:,:,::-1].transpose(2,0,1)[None],dtype=np.float32)/255
        raw=session.run(None,{'images':x})[0][0];labels=raw[:,5:].argmax(1);scores=raw[:,4]*raw[:,5:].max(1);preds=[]
        for cls in range(6):
            ix=np.flatnonzero((labels==cls)&(scores>=.25));boxes=[[float(raw[i,0]-raw[i,2]/2),float(raw[i,1]-raw[i,3]/2),float(raw[i,2]),float(raw[i,3])] for i in ix]
            if boxes:
                for k in np.array(cv2.dnn.NMSBoxes(boxes,scores[ix].tolist(),.25,.45)).reshape(-1):preds.append({'label':names[cls],'score':float(scores[ix[k]]),'box':boxes[k]})
        report.append({'sample':f'{category}-{index+1}.jpg','source':filename,'predictions':preds,'purpose':'Qualitative material demo, not accuracy evaluation'})
        thumb=Image.open(out/f'{category}-{index+1}.jpg').convert('RGB').resize((180,180));card=Image.new('RGB',(180,225),'white');card.paste(thumb);d=ImageDraw.Draw(card);d.text((4,183),f'{category}-{index+1}',fill='black');d.text((4,200),', '.join(p['label'] for p in preds[:2]) or 'NONE',fill='black');images.append(card)
sheet=Image.new('RGB',(4*180,6*225),'#ddd')
for i,im in enumerate(images):sheet.paste(im,((i%4)*180,(i//4)*225))
sheet.save(out/'contact-sheet.jpg');(root/'validation/material-demo.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('Material demo complete',len(report),'samples')
