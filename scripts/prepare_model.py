"""Fetch pinned assets, export YOLOv5 and compare PyTorch/ONNX without training.
Run with the independent Python 3.12 environment documented in README.md.
"""
from pathlib import Path
import hashlib, io, json, os, sys, types, zipfile, pickletools, time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'artifacts'
PUBLIC = ROOT / 'public'
SOURCE_REF = 'v7.0'
MODEL_REPO = 'keremberke/yolov5n-garbage'
EXPECTED_NAMES = ['biodegradable','cardboard','glass','metal','paper','plastic']

def get(url):
    print('GET', url, flush=True)
    req = urllib.request.Request(url, headers={'User-Agent':'ican-garbage-evaluation/1.0'})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=90) as response: return response.read()
        except Exception:
            if attempt == 2: raise
            time.sleep(2)

def sha(data): return hashlib.sha256(data).hexdigest()
def write_json(path, value):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')

def acquire():
    ART.mkdir(exist_ok=True)
    metadata_path = ART/'acquisition.json'
    if metadata_path.exists(): metadata=json.loads(metadata_path.read_text(encoding='utf-8'))
    else:
        model_meta=json.loads(get('https://huggingface.co/api/models/'+MODEL_REPO))
        source_meta=json.loads(get('https://api.github.com/repos/ultralytics/yolov5/commits/'+SOURCE_REF))
        metadata={'model_revision':model_meta['sha'],'source_revision':source_meta['sha'],'model_repository':MODEL_REPO}
        write_json(metadata_path,metadata)
    weights = ART/'best.pt'
    if not weights.exists(): weights.write_bytes(get(f'https://huggingface.co/{MODEL_REPO}/resolve/{metadata["model_revision"]}/best.pt'))
    metadata['weight_sha256']=sha(weights.read_bytes())
    # Check serialized globals before loading; never execute arbitrary downloaded scripts.
    with zipfile.ZipFile(weights) as archive:
        payload=archive.read(next(name for name in archive.namelist() if name.endswith('data.pkl')))
        globals_=[arg for op,arg,_ in pickletools.genops(payload) if op.name=='GLOBAL']
        allowed=('torch.','torch HalfStorage','torch LongStorage','torch FloatStorage','yolov5.models.','models.','collections OrderedDict','__builtin__ set','builtins set')
        unexpected=[value for value in globals_ if not value.startswith(allowed)]
        if unexpected: raise RuntimeError(f'Unexpected checkpoint globals: {unexpected}')
        metadata['checkpoint_globals']=sorted(set(globals_))
    vendor=ART/'vendor'/'yolov5'
    if not (vendor/'models/yolo.py').exists():
        archive=zipfile.ZipFile(io.BytesIO(get('https://codeload.github.com/ultralytics/yolov5/zip/'+metadata['source_revision'])))
        for member in archive.infolist():
            parts=Path(member.filename).parts[1:]
            if not parts or member.is_dir(): continue
            relative=Path(*parts)
            if '..' in relative.parts: raise ValueError('Unsafe archive path')
            target=vendor/relative;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(archive.read(member))
    write_json(metadata_path,metadata)
    return weights,vendor,metadata

def main():
    weights,vendor,metadata=acquire()
    os.environ['YOLOV5_AUTOINSTALL']='false'
    os.environ['YOLOV5_CONFIG_DIR']=str(ART/'config')
    sys.path.insert(0,str(vendor))
    # This public checkpoint was serialized by the yolov5 pip namespace.
    # Alias that namespace to the pinned upstream v7.0 code instead of installing a changing wrapper.
    package=types.ModuleType('yolov5');package.__path__=[str(vendor)];sys.modules['yolov5']=package
    import torch, numpy as np, cv2, onnx, onnxruntime as ort
    torch.set_num_threads(4)
    checkpoint=torch.load(weights,map_location='cpu',weights_only=False)
    model=checkpoint.get('ema') or checkpoint['model']
    model.float().eval()
    names=model.names
    if isinstance(names,dict): names=[names[i] for i in range(len(names))]
    if names != EXPECTED_NAMES: raise RuntimeError(f'Unexpected classes: {names}')
    print('CLASSES',names,'MODEL',type(model).__name__,flush=True)
    for layer in model.modules():
        if layer.__class__.__name__=='Detect': layer.inplace=False;layer.dynamic=False;layer.export=True
    from utils.general import non_max_suppression
    public_models=PUBLIC/'models';public_models.mkdir(parents=True,exist_ok=True)
    report={'provenance':metadata,'names':names,'runtime':{'python':sys.version,'torch':torch.__version__,'onnx':onnx.__version__,'onnxruntime':ort.__version__},'checks':[],'iphone_tested':False}
    entries=[]
    sample_root=PUBLIC/'samples';sample_root.mkdir(parents=True,exist_ok=True)
    # Public labeled test subset: choose two images per class by filename, never by model score.
    dataset_zip=ART/'public-test.zip'
    if not dataset_zip.exists(): dataset_zip.write_bytes(get('https://huggingface.co/datasets/keremberke/garbage-object-detection/resolve/main/data/test.zip'))
    dataset_archive=zipfile.ZipFile(dataset_zip)
    annotation_name=next(n for n in dataset_archive.namelist() if n.endswith('_annotations.coco.json'))
    annotations=json.loads(dataset_archive.read(annotation_name))
    category_map={c['id']:c['name'].lower() for c in annotations['categories']}
    by_image={}
    for ann in annotations['annotations']:
        if category_map[ann['category_id']] in names: by_image.setdefault(ann['image_id'],[]).append(ann)
    picked={}
    for category in names:
        candidates=sorted((im for im in annotations['images'] if any(category_map[a['category_id']]==category for a in by_image.get(im['id'],[]))),key=lambda im:im['file_name'])
        for im in candidates[:2]: picked[im['id']]=im
    test_inputs=[];sample_entries=[];ground_truth={}
    for idx,im in enumerate(picked.values()):
        filename=next(n for n in dataset_archive.namelist() if n.endswith('/'+im['file_name']) or n==im['file_name'])
        data=dataset_archive.read(filename);image=cv2.imdecode(np.frombuffer(data,np.uint8),cv2.IMREAD_COLOR)
        name=f'public-test-{idx+1:02d}';ground_truth[name]=[{'label':names.index(category_map[a['category_id']]),'bbox':a['bbox']} for a in by_image[im['id']]]
        test_inputs.append((name,image,'Public labeled test subset; fixed filename selection, not a complete evaluation'))
        (sample_root/(name+'.jpg')).write_bytes(data)
        sample_entries.append({'url':f'/samples/{name}.jpg','title':['可降解垃圾','纸板','玻璃','金属','纸张','塑料'][ground_truth[name][0]['label']],'source':im['file_name'],'dataset':'keremberke/garbage-object-detection test','license':'CC BY 4.0'})
    report['public_test_subset']={'images':len(test_inputs),'selection':'first two filenames containing each class, deduplicated','ground_truth':ground_truth,'dataset_zip_sha256':sha(dataset_zip.read_bytes())}
    # Author's examples are explicitly identified as a montage, not an independent test set.
    sample=sample_root/'author-examples.jpg'
    if not sample.exists(): sample.write_bytes(get(f'https://huggingface.co/{MODEL_REPO}/resolve/{metadata["model_revision"]}/sample_visuals.jpg'))
    montage=cv2.imdecode(np.frombuffer(sample.read_bytes(),np.uint8),cv2.IMREAD_COLOR)
    if montage is None: raise RuntimeError('Cannot decode public sample')
    write_json(sample_root/'index.json',sample_entries)
    # Include unannotated local road samples for qualitative checks, never republish user images.
    inputs=test_inputs+[('author-montage',montage,'Author supplied annotated montage; pipeline smoke test only'),('blank-negative',np.full((480,640,3),114,np.uint8),'Synthetic uniform image; not a real-world negative sample')]
    local=Path(os.environ['LOCAL_ROAD_SAMPLES']) if os.environ.get('LOCAL_ROAD_SAMPLES') else None
    for path in (sorted(local.glob('*.jpg'))[:6] if local else []):
        image=cv2.imdecode(np.frombuffer(path.read_bytes(),np.uint8),cv2.IMREAD_COLOR)
        if image is not None: inputs.append((path.stem,image,'Local road photo, no compatible six-class ground truth; qualitative only'))
    (ART/'predictions').mkdir(exist_ok=True)
    for size in (416,640):
        output=public_models/f'garbage-{size}.onnx'
        x=torch.zeros(1,3,size,size)
        with torch.no_grad():
            for _ in range(2): model(x)
            torch.onnx.export(model,x,str(output),opset_version=12,input_names=['images'],output_names=['output0'],do_constant_folding=True)
        graph=onnx.load(str(output));onnx.checker.check_model(graph)
        props={'names':json.dumps(names),'source':MODEL_REPO,'weight_sha256':metadata['weight_sha256']}
        onnx.helper.set_model_props(graph,props);onnx.save(graph,str(output))
        options=ort.SessionOptions();options.intra_op_num_threads=4
        session=ort.InferenceSession(str(output),sess_options=options,providers=['CPUExecutionProvider'])
        for name,image,note in inputs:
            h,w=image.shape[:2];scale=min(size/w,size/h);nw,nh=round(w*scale),round(h*scale);px,py=(size-nw)//2,(size-nh)//2
            prepared=np.full((size,size,3),114,np.uint8);prepared[py:py+nh,px:px+nw]=cv2.resize(image,(nw,nh),interpolation=cv2.INTER_LINEAR)
            tensor=np.ascontiguousarray(prepared[:,:,::-1].transpose(2,0,1)[None],dtype=np.float32)/255
            with torch.no_grad(): pred=model(torch.from_numpy(tensor)); pred=pred[0] if isinstance(pred,(tuple,list)) else pred
            t0=time.perf_counter();converted=session.run(None,{'images':tensor})[0];elapsed=(time.perf_counter()-t0)*1000
            raw=pred.detach().numpy();max_error=float(np.abs(raw-converted).max());mean_error=float(np.abs(raw-converted).mean())
            boxes_pt=non_max_suppression(pred.clone(),.25,.45)[0].cpu().numpy()
            boxes_onnx=non_max_suppression(torch.from_numpy(converted.copy()),.25,.45)[0].cpu().numpy()
            same=boxes_pt.shape==boxes_onnx.shape and bool(np.allclose(boxes_pt,boxes_onnx,atol=.02,rtol=.001))
            check={'size':size,'sample':name,'note':note,'output_shape':list(converted.shape),'max_absolute_error':max_error,'mean_absolute_error':mean_error,'post_nms_equivalent':same,'detections':len(boxes_onnx),'onnx_cpu_ms':elapsed,'boxes':boxes_onnx.tolist()}
            report['checks'].append(check)
            print(json.dumps({k:v for k,v in check.items() if k not in ('boxes','note')},ensure_ascii=True),flush=True)
            if not same: raise RuntimeError(f'Conversion mismatch: {name} @ {size}')
            painted=image.copy()
            for x1,y1,x2,y2,conf,cls in boxes_onnx:
                a,b=int(max(0,(x1-px)/scale)),int(max(0,(y1-py)/scale));c,d=int(min(w,(x2-px)/scale)),int(min(h,(y2-py)/scale))
                cv2.rectangle(painted,(a,b),(c,d),(80,220,120),2);cv2.putText(painted,f'{names[int(cls)]} {conf:.2f}',(a,max(15,b-4)),cv2.FONT_HERSHEY_SIMPLEX,.5,(20,80,30),1,cv2.LINE_AA)
            ok,jpeg=cv2.imencode('.jpg',painted)
            if ok:(ART/'predictions'/f'{size}-{name}.jpg').write_bytes(jpeg.tobytes())
            if size==416 and name=='author-montage':
                # Portable golden data verifies the JS YOLOv5 decoder against Python NMS.
                fixture=ROOT/'tests'/'fixtures';fixture.mkdir(parents=True,exist_ok=True)
                keep=converted[0,:,4]>=.25
                write_json(fixture/'golden.json',{'data':converted[0,keep,:].reshape(-1).tolist(),'dims':[1,int(keep.sum()),11],'geometry':{'scale':scale,'width':w,'height':h,'size':size,'padX':px,'padY':py},'expected':boxes_onnx.tolist()})
        entries.append({'size':size,'url':f'/models/{output.name}','bytes':output.stat().st_size,'sha256':sha(output.read_bytes())})
    manifest={'model':MODEL_REPO,'revision':metadata['model_revision'],'classes':names,'classesZh':['可降解垃圾','纸板','玻璃','金属','纸张','塑料'],'format':'YOLOv5 decoded xywh,obj,classes','precision':'float32','models':entries}
    write_json(public_models/'manifest.json',manifest)
    report['summary']='Conversion parity checked on identical preprocessed inputs. No independent accuracy metric and no iPhone benchmark are claimed.'
    write_json(ART/'validation.json',report)
    write_json(ROOT/'validation'/'model-validation.json',report)
    print('COMPLETE',json.dumps(entries),flush=True)

if __name__=='__main__': main()
