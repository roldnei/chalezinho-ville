import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {JSDOM} from 'jsdom';import {textLayersInput,publicationInput} from '../supabase/functions/_shared/villegram-publications.ts';
const layer={text:'Um café',x:50,y:30,size:6,color:'#ffffff',background:'transparent'};
test('text layers validate bounds, reject CSS injection and retain only public presentation fields',()=>{
 assert.deepEqual(textLayersInput([{...layer,private:'secret'}]),[layer]);for(const value of [[{...layer,color:'red;display:none'}],[{...layer,text:'x'.repeat(281)}],[{...layer,x:Infinity}],[{...layer,y:0}],[{...layer,size:10}],Array(6).fill(layer),{}])assert.throws(()=>textLayersInput(value),/invalid_text_layers/);
 const p=publicationInput({type:'trust',title:'Teste',caption:'Teste',media:[{kind:'photo',url:'assets/test.webp',text_layers:[layer]}]},'https://dev.supabase.co');assert.deepEqual(p.media[0].text_layers,[layer]);
});
test('avatar crop geometry covers circle, clamps edges, preserves proportions and supports portrait/landscape',async()=>{
 const d=new JSDOM('',{runScripts:'outside-only'});d.window.eval(await readFile(new URL('../villegram-avatar.js',import.meta.url),'utf8'));const g=d.window.VillegramAvatar.geometry;for(const [w,h] of [[800,1200],[1200,800]]){const a=g(w,h,1,0,1);assert.equal(a.side,800);assert.ok(a.x-a.side/2>=0);assert.ok(a.y+a.side/2<=h);const b=g(w,h,4,.5,.5);assert.equal(b.side,200);assert.equal(b.x,w/2);assert.equal(b.y,h/2)}d.window.close();
});
test('visitor text is escaped and remains a separate layer from cropped media',async()=>{
 const d=new JSDOM('',{runScripts:'outside-only'});d.window.eval(await readFile(new URL('../villegram-text.js',import.meta.url),'utf8'));d.window.document.body.innerHTML=d.window.VillegramText.markup([{...layer,text:'<img src=x onerror=alert(1)>'}]);assert.equal(d.window.document.querySelector('img'),null);assert.equal(d.window.document.querySelector('.vg-text-sticker').textContent,'<img src=x onerror=alert(1)>');d.window.close();
});
