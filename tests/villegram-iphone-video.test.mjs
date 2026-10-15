import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
test('iPhone MOV MIME and missing MIME keep the MOV extension and QuickTime upload type',async()=>{
 const dom=new JSDOM('',{runScripts:'outside-only'}),w=dom.window;
 w.eval(await readFile('villegram-upload.js','utf8'));
 for(const type of ['video/quicktime','video/x-quicktime','','application/octet-stream']){const format=w.VillegramUpload.videoFormat({name:'IMG_1234.MOV',type});assert.equal(format.extension,'mov');assert.equal(format.type,'video/quicktime');}
 assert.equal(w.VillegramUpload.videoFormat({name:'bad.mov',type:'text/html'}),null);
 assert.equal(w.VillegramUpload.videoFormat({name:'IMG.MP4',type:''}).type,'video/mp4');
 let revoked=0;w.URL.createObjectURL=()=> 'blob:video';w.URL.revokeObjectURL=()=>revoked++;
 w.document.createElement=()=>({duration:10,set src(v){queueMicrotask(()=>this.onloadedmetadata())}});
 const inspected=await w.VillegramUpload.inspect({name:'IMG.MOV',type:'video/quicktime',size:1024});assert.equal(inspected.extension,'mov');assert.equal(inspected.video.playsInline,true);
 await assert.rejects(w.VillegramUpload.inspect({name:'IMG.MOV',type:'video/quicktime',size:51*1024*1024}),/50 MB/);
 w.document.createElement=()=>({set src(v){queueMicrotask(()=>this.onerror())}});
 await assert.rejects(w.VillegramUpload.inspect({name:'IMG.MOV',type:'video/quicktime',size:1024}),/codificação/);assert.equal(revoked,1);dom.window.close();
});
test('iPhone metadata-only video is seeked before waiting for its first frame',async()=>{
 const dom=new JSDOM('',{runScripts:'outside-only'}),w=dom.window;
 w.eval(await readFile('villegram-upload.js','utf8'));
 w.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){},getImageData:()=>({data:new Uint8Array([50,40,30,255])})});
 w.HTMLCanvasElement.prototype.toBlob=function(cb,type){cb(new w.Blob(['cover'],{type}))};
 const video=w.document.createElement('video');let ready=1,time=0;
 Object.defineProperties(video,{duration:{value:8},readyState:{get:()=>ready},videoWidth:{value:1080},videoHeight:{value:1920},currentTime:{get:()=>time,set:v=>{time=v;ready=2;queueMicrotask(()=>video.dispatchEvent(new w.Event('seeked')))}}});
 const cover=await w.VillegramUpload.poster(video);assert.equal(time,.5);assert.equal(cover.type,'image/jpeg');dom.window.close();
});
test('decoder starts mounted inline playback and captures without a seeked event',async()=>{
 const dom=new JSDOM('',{runScripts:'outside-only'}),w=dom.window;
 w.eval(await readFile('villegram-upload.js','utf8'));
 w.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){},getImageData:()=>({data:new Uint8Array([50,40,30,255])})});
 w.HTMLCanvasElement.prototype.toBlob=function(cb,type){cb(new w.Blob(['cover'],{type}))};
 const video=w.document.createElement('video');let ready=1,time=0,played=0,paused=0;
 video.pause=()=>paused++;
 video.play=()=>{assert.equal(video.isConnected,true);assert.equal(video.playsInline,true);assert.equal(video.muted,true);played++;ready=2;queueMicrotask(()=>video.dispatchEvent(new w.Event('playing')));return Promise.resolve()};
 Object.defineProperties(video,{duration:{value:8},readyState:{get:()=>ready},videoWidth:{value:1080},videoHeight:{value:1920},currentTime:{get:()=>time,set:v=>{time=v}}});
 const cover=await w.VillegramUpload.poster(video);assert.equal(cover.type,'image/jpeg');assert.equal(played,1);assert.equal(paused,1);assert.equal(video.isConnected,false);dom.window.close();
});
