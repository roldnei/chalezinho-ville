import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {JSDOM} from 'jsdom';
const uid='4069a585-7cc6-48ad-9263-567358a45c0c',url='https://pxfqmnhqodqyaaqeyjgr.supabase.co';
const tick=()=>new Promise(r=>setTimeout(r,10));
test('TUS resumes a failed second chunk from the server offset without duplicating the file',async()=>{
 const d=new JSDOM('',{url,runScripts:'outside-only'}),w=d.window;w.CHALEZINHO_CONFIG={supabaseUrl:url,supabaseKey:'public-key'};w.AbortSignal.timeout=()=>undefined;
 let offset=0,creates=0,fail=true;const offsets=[];w.fetch=async(_url,r)=>{if(r.method==='POST'){creates++;return {ok:true,headers:new Headers({Location:url+'/storage/v1/upload/resumable/test'})}}if(r.method==='HEAD')return {ok:true,headers:new Headers({'Upload-Offset':String(offset)})};offsets.push(Number(r.headers['Upload-Offset']));if(offset>0&&fail){fail=false;return {ok:false}}offset+=r.body.size;return {ok:true,headers:new Headers({'Upload-Offset':String(offset)})}};
 w.eval(await readFile(new URL('../villegram-upload.js',import.meta.url),'utf8'));const sb={auth:{getSession:async()=>({data:{session:{access_token:'test'}}})}},file=new Blob([new Uint8Array(7*1024*1024)],{type:'video/mp4'});
 await assert.rejects(w.VillegramUpload.upload(sb,file,uid+'/test.mp4'),/interrompido/);assert.equal(offset,6*1024*1024);
 await w.VillegramUpload.upload(sb,file,uid+'/test.mp4');assert.equal(offset,file.size);assert.equal(creates,1);assert.deepEqual(offsets,[0,6*1024*1024,6*1024*1024]);d.window.close();
});
async function editor(){const d=new JSDOM(await readFile(new URL('../villegram-admin.html',import.meta.url),'utf8'),{url:url+'/villegram-admin.html',runScripts:'outside-only',pretendToBeVisual:true}),w=d.window;const rows=[],saved=[];w.CHALEZINHO_CONFIG={supabaseUrl:url,supabaseKey:'public-key'};w.AbortSignal.timeout=()=>undefined;w.HTMLElement.prototype.scrollIntoView=function(){};w.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'test',user:{id:uid}}}})}})};
 w.fetch=async(_url,opts)=>{const b=JSON.parse(opts.body);if(b.operation==='admin_list')return response({publications:rows,properties:[{id:1,name:'Ville',gallery:['assets/photo.webp']}],products:[],offers:[],settings:{enabled:true,auto_publish:false,frequency_hours:24,max_offers:3,templates:{}}});if(b.operation==='report')return response({rows:[]});if(b.operation==='save'){saved.push(b);const p={...b.publication,id:b.id||uid,updated_at:'revision-'+saved.length,author_name:'Equipe'};rows.splice(0,rows.length,p);return response({publication:p})}return response({})};function response(data){return {ok:true,json:async()=>({ok:true,...data})}}
 w.VillegramMedia={editor:async()=>new Blob(['photo'],{type:'image/webp'})};w.URL.createObjectURL=()=>url+'/preview.webp';w.eval(await readFile(new URL('../villegram-admin.js',import.meta.url),'utf8'));await tick();return {d,w,rows,saved};}
test('manual editor saves draft, retains identity during edit, publishes and archives',async()=>{
 const {d,w,saved}=await editor(),f=w.document.querySelector('#vg-post-form');f.elements.property_id.value='1';f.elements.title.value='Manual';f.elements.caption.value='Foto real';w.document.querySelector('[data-photo]').click();
 f.dispatchEvent(new w.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:f.querySelector('[name=draft]')}));await tick();assert.equal(saved[0].publication.status,'draft');assert.match(w.document.querySelector('#vg-editor-message').textContent,/Rascunho salvo/);
 f.elements.caption.value='Legenda editada';f.dispatchEvent(new w.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:f.querySelector('[name=published]')}));await tick();assert.equal(saved[1].id,uid);assert.equal(saved[1].updated_at,'revision-1');assert.equal(saved[1].publication.status,'published');assert.equal(saved[1].publication.caption,'Legenda editada');
 w.document.querySelector('#vg-archive').click();await tick();assert.equal(saved[2].publication.status,'archived');assert.equal(saved[2].id,uid);d.window.close();
});
test('retrying a failed video poster upload preserves the already uploaded video',async()=>{
 const {d,w}=await editor();let videoUploads=0,posterUploads=0,fail=true;w.VillegramUpload={inspect:async()=>({url:'blob:video',video:{duration:4}}),poster:async()=>new Blob(['poster']),upload:async(_sb,_file,path)=>{if(path.endsWith('.mp4'))videoUploads++;else{posterUploads++;if(fail){fail=false;throw Error('upload failed')}}}};
 const input=w.document.querySelector('#vg-upload');Object.defineProperty(input,'files',{value:[new w.File(['video'],'real.mp4',{type:'video/mp4'})]});input.dispatchEvent(new w.Event('change'));await tick();assert.equal(w.document.querySelector('#vg-upload-retry').hidden,false);assert.equal(videoUploads,1);
 w.document.querySelector('#vg-upload-retry').click();await tick();assert.equal(videoUploads,1);assert.equal(posterUploads,2);assert.equal(w.document.querySelectorAll('#vg-media-list video').length,1);d.window.close();
});

test('native publication clicks and Enter preserve published status during subsequent edits',async()=>{
 const {d,w,saved}=await editor(),f=w.document.querySelector('#vg-post-form');f.elements.property_id.value='1';f.elements.title.value='Publicação';f.elements.caption.value='Cena real';w.document.querySelector('[data-photo]').click();
 f.querySelector('[name=published]').click();await tick();assert.equal(saved[0].publication.status,'published');assert.equal(w.document.querySelector('#vg-post-status').textContent,'Publicada');assert.equal(f.querySelector('[name=draft]').hidden,true);assert.equal(f.querySelector('[name=published]').textContent,'Salvar alterações');
 const link=w.document.querySelector('#vg-view-post');assert.equal(link.hidden,false);assert.equal(new URL(link.href).searchParams.get('publication'),uid);
 f.elements.caption.value='Legenda corrigida';f.requestSubmit();await tick();assert.equal(saved[1].publication.status,'published');assert.equal(saved[1].publication.caption,'Legenda corrigida');assert.equal(saved[1].id,uid);assert.equal(saved[1].updated_at,'revision-1');
 // A stale caller selecting the old draft action must also preserve publication.
 f.dispatchEvent(new w.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:f.querySelector('[name=draft]')}));await tick();assert.equal(saved[2].publication.status,'published');
 w.document.querySelector('#vg-archive').click();await tick();assert.equal(saved[3].publication.status,'archived');assert.equal(link.hidden,true);assert.equal(w.document.querySelector('#vg-post-status').textContent,'Arquivada');d.window.close();
});
test('uploaded video can be published by clicking the actual button and saved edits keep the file identity',async()=>{
 const {d,w,saved}=await editor(),f=w.document.querySelector('#vg-post-form');w.VillegramUpload={inspect:async()=>({url:'blob:video',video:{duration:9.7}}),poster:async()=>new Blob(['poster'],{type:'image/webp'}),upload:async()=>{}};
 f.elements.property_id.value='1';f.elements.title.value='Vinho no SPA aquecido?';f.elements.caption.value='Vídeo real do imóvel';const input=w.document.querySelector('#vg-upload');Object.defineProperty(input,'files',{value:[new w.File(['video'],'real.mp4',{type:'video/mp4'})]});input.dispatchEvent(new w.Event('change'));await tick();
 assert.match(w.document.querySelector('#vg-upload-status').textContent,/Mídia enviada/);assert.equal(saved.length,0);f.querySelector('[name=published]').click();await tick();assert.equal(saved[0].publication.status,'published');const file=saved[0].publication.media[0];assert.equal(file.kind,'video');assert.ok(file.path.endsWith('.mp4'));assert.ok(file.poster_path.endsWith('.webp'));
 f.elements.caption.value='Nova legenda';f.querySelector('[name=published]').click();await tick();assert.equal(saved[1].publication.status,'published');assert.equal(saved[1].publication.media[0].path,file.path);d.window.close();
});

test('cover generation seeks a decoded frame and rejects a black canvas instead of uploading it',async()=>{
 const d=new JSDOM('',{url,runScripts:'outside-only',pretendToBeVisual:true}),w=d.window;let dark=false;
 w.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){},getImageData(){return {data:Uint8ClampedArray.from([dark?0:50,0,0,255])}}});w.HTMLCanvasElement.prototype.toBlob=function(callback){callback(new w.Blob(['cover'],{type:'image/webp'}))};w.eval(await readFile(new URL('../villegram-upload.js',import.meta.url),'utf8'));
 const video=w.document.createElement('video');let time=0;Object.defineProperties(video,{readyState:{value:2},duration:{value:9.7},videoWidth:{value:2160},videoHeight:{value:3840},currentTime:{get:()=>time,set:value=>{time=value;Promise.resolve().then(()=>video.dispatchEvent(new w.Event('seeked')))}}});
 const cover=await w.VillegramUpload.poster(video);assert.equal(time,.5);assert.equal(cover.type,'image/webp');dark=true;await assert.rejects(w.VillegramUpload.poster(video,1),/capa ficou preta/);assert.equal(time,1);d.window.close();
});
