import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../experiencias-admin.js',import.meta.url),'utf8');
const upload=source.slice(source.indexOf('async function uploadPhotos(e){'),source.indexOf('async function save(e){'));
function setup(send){
 const dom=new JSDOM('<button id="save-experience"></button><select id="experience-picker"></select><button id="new-experience"></button><button id="toggle-status"></button><button id="delete-experience"></button><input id="photo-upload"><input id="exp-name" value="QA"><p id="admin-message"></p>',{runScripts:'outside-only'});
 const w=dom.window;w.$=s=>w.document.querySelector(s);w.uploading=false;w.draftKey='qa';w.mediaItems=[];w.normalizeMedia=()=>{};w.renderPhotos=()=>{};
 w.sb={storage:{from:()=>({upload:send,getPublicUrl:p=>({data:{publicUrl:p}})})}};w.eval(upload);return {dom,w};
}
test('oversized image is rejected without success message or network upload',async()=>{
 let calls=0;const {dom,w}=setup(async()=>{calls++;return {}});
 await w.uploadPhotos({target:{files:[{name:'large.jpg',type:'image/jpeg',size:11*1024*1024}],value:'file'}});
 assert.equal(calls,0);assert.equal(w.mediaItems.length,0);assert.match(w.$('#admin-message').textContent,/Nenhuma foto.*ultrapassa 10 MB/);assert.equal(w.$('#save-experience').disabled,false);dom.window.close();
});
test('upload prevents saving or changing experience and restores controls after network failure',async()=>{
 let reject;const {dom,w}=setup(()=>new Promise((_,r)=>{reject=r}));
 const pending=w.uploadPhotos({target:{files:[{name:'qa.jpg',type:'image/jpeg',size:100}],value:'file'}});
 assert.equal(w.$('#save-experience').disabled,true);assert.equal(w.$('#experience-picker').disabled,true);assert.equal(w.$('#new-experience').disabled,true);
 reject(new Error('offline'));await pending;
 assert.equal(w.$('#save-experience').disabled,false);assert.equal(w.$('#experience-picker').disabled,false);assert.equal(w.mediaItems.length,0);assert.match(w.$('#admin-message').textContent,/Nenhuma foto.*Falha no envio.*offline/);dom.window.close();
});
