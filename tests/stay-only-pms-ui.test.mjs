import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
test('PMS loads and saves a lodging-only offer with the calendar minimum and pause preserved',async()=>{
 const w=new JSDOM(readFileSync('estadias-admin.html','utf8'),{url:'https://qa.example/estadias-admin.html',runScripts:'outside-only'}).window;
 const offer={id:'stay-only',updated_at:'2030-01-01',name:'Hospedagem e limpeza',description:'Somente hospedagem',status:'active',property_ids:[1],product_ids:[],min_nights:2,max_nights:7,discount_bps:0,discount_enabled:false,media:[],villegram:{photos:[]},showcase:{enabled:true,nights:[2],duration_mode:'minimum',horizon_days:21,celebrations:true}};
 const calls=[];w.structuredClone=structuredClone;
 w.CHALEZINHO_CONFIG={bookingEngine:'https://qa.example/engine',supabaseUrl:'https://qa.example',supabaseKey:'fixture'};
 w.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'fixture'}}})}})};
 w.fetch=async(url,options={})=>{const body=options.body?JSON.parse(options.body):{};calls.push(body);const data=new URL(url).searchParams.get('action')==='property_media'?{properties:[{id:1,name:'Ville',gallery:[]}]}:body.operation==='preview'?{ok:true,offer:body,issues:[],packages:[]}:body.operation==='save'?{ok:true,offer:body}:{ok:true,offers:[offer],products:[]};return {ok:true,json:async()=>data};};
 w.eval(readFileSync('stay-offers.js','utf8'));w.eval(readFileSync('estadias-admin.js','utf8'));
 const until=async f=>{for(let i=0;i<100;i++){if(f())return;await new Promise(r=>setTimeout(r,5))}throw Error('PMS did not update: '+w.document.querySelector('#offer-message').textContent+' calls '+JSON.stringify(calls))};
 try{
 await until(()=>typeof w.document.querySelector('#offer-picker').onchange==='function');
 const picker=w.document.querySelector('#offer-picker');picker.value='stay-only';picker.dispatchEvent(new w.Event('change'));
 assert.equal(w.document.querySelector('#offer-showcase-nights').value,'minimum');assert.equal(w.document.querySelector('#offer-showcase-horizon').value,'21');
 w.document.querySelector('#offer-status').value='paused';w.document.querySelector('#offer-form').dispatchEvent(new w.Event('submit',{cancelable:true}));
 await until(()=>calls.some(c=>c.operation==='save'));
 const saved=calls.find(c=>c.operation==='save');assert.deepEqual(saved.product_ids,[]);assert.equal(saved.status,'paused');assert.equal(saved.showcase.duration_mode,'minimum');assert.deepEqual(saved.showcase.nights,[2]);assert.equal(saved.showcase.horizon_days,21);assert.equal(saved.discount_enabled,false);
 }finally{w.close()}
});
