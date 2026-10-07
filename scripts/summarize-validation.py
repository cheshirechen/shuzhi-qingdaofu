"""Small fixed-subset check, not mAP and not representative deployment accuracy."""
import json
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[1]
r=json.loads((root/'validation/model-validation.json').read_text(encoding='utf-8'))
def iou(a,b):
    overlap=max(0,min(a[0]+a[2],b[0]+b[2])-max(a[0],b[0]))*max(0,min(a[1]+a[3],b[1]+b[3])-max(a[1],b[1]))
    return overlap/max(1e-9,a[2]*a[3]+b[2]*b[3]-overlap)
summary={'scope':'10 fixed public labeled images; score>=0.25, class-aware NMS 0.45, matching IoU>=0.5. Not mAP or overall accuracy.','sizes':{}}
for size in (416,640):
    counts=[{'class':name,'tp':0,'fp':0,'fn':0} for name in r['names']]
    for name,truth in r['public_test_subset']['ground_truth'].items():
        w,h=Image.open(root/'public/samples'/f'{name}.jpg').size
        scale=min(size/w,size/h);px=(size-round(w*scale))//2;py=(size-round(h*scale))//2
        boxes=next(c['boxes'] for c in r['checks'] if c['size']==size and c['sample']==name)
        matched=set()
        for x1,y1,x2,y2,score,label in boxes:
            label=int(label);b=[(x1-px)/scale,(y1-py)/scale,(x2-x1)/scale,(y2-y1)/scale]
            possible=[(iou(b,t['bbox']),i) for i,t in enumerate(truth) if i not in matched and t['label']==label]
            best=max(possible,default=(0,-1))
            if best[0]>=.5:counts[label]['tp']+=1;matched.add(best[1])
            else:counts[label]['fp']+=1
        for i,t in enumerate(truth):
            if i not in matched:counts[t['label']]['fn']+=1
    total={k:sum(c[k] for c in counts) for k in ['tp','fp','fn']}
    total['precision']=total['tp']/max(1,total['tp']+total['fp']);total['recall']=total['tp']/max(1,total['tp']+total['fn'])
    summary['sizes'][size]={'total':total,'by_class':counts}
(root/'validation/quality-subset.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False,indent=2))
