import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync,readFileSync } from 'node:fs';
import { letterbox,toTensor,decode } from '../src/detection.mjs';

test('landscape and portrait letterboxing preserve source coordinates',()=>{
  for(const [width,height] of [[1280,720],[720,1280],[4032,3024],[1,1000]]){
    const g=letterbox(width,height,416);
    assert.ok(g.padX>=0&&g.padY>=0);
    assert.ok(g.resizedWidth+g.padX<=416&&g.resizedHeight+g.padY<=416);
    const x=width*.3,y=height*.4,w=width*.2,h=height*.15;
    const row=Float32Array.from([(x+w/2)*g.scale+g.padX,(y+h/2)*g.scale+g.padY,w*g.scale,h*g.scale,.9,.8,0,0,0,0,0]);
    const [b]=decode(row,[1,1,11],g);
    for(const [actual,expected] of [[b.x,x],[b.y,y],[b.w,w],[b.h,h]])assert.ok(Math.abs(actual-expected)<.001);
  }
});
test('RGB normalization uses CHW order and ignores alpha',()=>{
  assert.deepEqual([...toTensor(new Uint8ClampedArray([255,0,128,255]),1)],[1,0,Math.fround(128/255)]);
});
test('objectness multiplication, same-class suppression and cross-class retention',()=>{
  const row=(obj,cls,p=.9)=>[100,100,50,50,obj,...Array.from({length:6},(_,i)=>i===cls?p:0)];
  const rows=[row(.9,0),row(.8,0),row(.9,1),row(.3,2,.3),row(NaN,3)];
  const result=decode(Float32Array.from(rows.flat()),[1,5,11],letterbox(416,416,416));
  assert.equal(result.length,2);assert.deepEqual(result.map(x=>x.label),[0,1]);
});
test('rejects mismatched models, clips boxes, and accepts empty output',()=>{
  const g=letterbox(416,416,416);
  assert.throws(()=>decode([], [1,1,85],g),/类别/);
  assert.deepEqual(decode([], [1,0,11],g),[]);
  const [b]=decode(Float32Array.from([0,0,100,100,.9,.9,0,0,0,0,0]),[1,1,11],g);
  assert.equal(b.x,0);assert.equal(b.y,0);assert.equal(b.w,50);assert.equal(b.h,50);
});
test('real exported-model predictions agree with Python NMS',()=>{
  const path=new URL('./fixtures/golden.json',import.meta.url);
  assert.ok(existsSync(path),'Run model preparation to generate the golden fixture.');
  const f=JSON.parse(readFileSync(path));const result=decode(Float32Array.from(f.data),f.dims,f.geometry);
  assert.equal(result.length,f.expected.length);
  for(let i=0;i<result.length;i++){
    const b=result[i],e=f.expected[i],g=f.geometry;
    assert.equal(b.label,e[5]);assert.ok(Math.abs(b.score-e[4])<1e-5);
    const x=Math.max(0,(e[0]-g.padX)/g.scale),y=Math.max(0,(e[1]-g.padY)/g.scale);
    assert.ok(Math.abs(b.x-x)<.01);assert.ok(Math.abs(b.y-y)<.01);
  }
});
