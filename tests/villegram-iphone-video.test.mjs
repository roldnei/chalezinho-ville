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
