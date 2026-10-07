"""Additional qualitative samples from validation split; not an unbiased accuracy test."""
import json,zipfile,sys,os
from pathlib import Path
from prepare_model import get,sha,write_json,ROOT,ART,PUBLIC
import numpy as np,cv2,onnxruntime as ort
archive_path=ART/'public-valid.zip'
if not archive_path.exists():archive_path.write_bytes(get('https://huggingface.co/datasets/keremberke/garbage-object-detection/resolve/main/data/valid.zip'))
z=zipfile.ZipFile(archive_path);coco=json.loads(z.read(next(n for n in z.namelist() if n.endswith('_annotations.coco.json'))))
names=json.loads((PUBLIC/'models/manifest.json').read_text(encoding='utf-8'))['classes'];categories={c['id']:c['name'] for c in coco['categories']}
by_image={}
for a in coco['annotations']:by_image.setdefault(a['image_id'],[]).append(a)
report={'source':'keremberke/garbage-object-detection validation split','archive_sha256':sha(archive_path.read_bytes()),'purpose':'Qualitative class coverage, NOT independent test accuracy','available_annotation_classes':sorted(set(categories[a['category_id']] for a in coco['annotations'])),'checks':[]}
selected={}
for category in names:
    choices=sorted((i for i in coco['images'] if any(categories[a['category_id']]==category for a in by_image.get(i['id'],[]))),key=lambda i:i['file_name'])
    if choices:selected[choices[0]['id']]=choices[0]
sys.path.insert(0,str(ROOT/'src'))
def decode(raw,threshold=.25):
    rows=raw[0];labels=rows[:,5:].argmax(axis=1);scores=rows[:,4]*rows[:,5:].max(axis=1);indices=np.flatnonzero(scores>=threshold)
    boxes=[]
    for cls in range(6):
        ix=indices[labels[indices]==cls]
        coords=[[float(rows[i,0]-rows[i,2]/2),float(rows[i,1]-rows[i,3]/2),float(rows[i,2]),float(rows[i,3])] for i in ix]
        if coords:
            keep=cv2.dnn.NMSBoxes(coords,scores[ix].tolist(),threshold,.45)
            for k in np.array(keep).reshape(-1):boxes.append({'label':int(cls),'score':float(scores[ix[k]]),'box':coords[k]})
    return boxes
out=ART/'extra-predictions';out.mkdir(exist_ok=True)
for size in (416,640):
    opt=ort.SessionOptions();opt.intra_op_num_threads=4
    session=ort.InferenceSession(str(PUBLIC/'models'/f'garbage-{size}.onnx'),sess_options=opt,providers=['CPUExecutionProvider'])
    for index,im in enumerate(selected.values()):
        filename=next(n for n in z.namelist() if n.endswith('/'+im['file_name']) or n==im['file_name']);data=z.read(filename)
        image=cv2.imdecode(np.frombuffer(data,np.uint8),cv2.IMREAD_COLOR);h,w=image.shape[:2];s=min(size/w,size/h);nw,nh=round(w*s),round(h*s);px,py=(size-nw)//2,(size-nh)//2
        prepared=np.full((size,size,3),114,np.uint8);prepared[py:py+nh,px:px+nw]=cv2.resize(image,(nw,nh));tensor=np.ascontiguousarray(prepared[:,:,::-1].transpose(2,0,1)[None],dtype=np.float32)/255
        predictions=decode(session.run(None,{'images':tensor})[0]);report['checks'].append({'size':size,'file':im['file_name'],'annotated_classes':sorted(set(categories[a['category_id']] for a in by_image[im['id']])),'detections':predictions})
        for b in predictions:
            x,y,bw,bh=b['box'];x1,y1,x2,y2=[round(v) for v in ((x-px)/s,(y-py)/s,(x+bw-px)/s,(y+bh-py)/s)]
            cv2.rectangle(image,(x1,y1),(x2,y2),(80,220,120),2);cv2.putText(image,f'{names[b["label"]]} {b["score"]:.2f}',(max(0,x1),max(15,y1)),cv2.FONT_HERSHEY_SIMPLEX,.45,(20,80,30),1)
        (out/f'{size}-valid-{index+1}.jpg').write_bytes(cv2.imencode('.jpg',image)[1].tobytes())
write_json(ROOT/'validation/extra-samples.json',report)
print(json.dumps(report,ensure_ascii=True),flush=True)
