import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {accessInput,accessReport,summarizeAccess} from '../supabase/functions/_shared/access-metrics.ts';
const sid='access:12345678-1234-1234-1234-123456789abc';
test('page identification uses authoritative mapping and rejects arbitrary pages',()=>{
 assert.equal(accessInput({page:'chale-premium.html',session_id:sid,property_code:'CH3'}).code,'CH1');
 assert.equal(accessInput({page:'imovel.html',session_id:sid,property_code:'CH42'}).code,'CH42');
 for(const page of ['admin.html','__proto__','index.html?email=private'])assert.throws(()=>accessInput({page,session_id:sid}));
 assert.throws(()=>accessInput({page:'index.html',session_id:'email@example.com'}));
});
test('ranking separates total views from per-chalet sessions and includes zero-access chalets',()=>{
 const props=[{id:1,name:'Signature'},{id:2,name:'Essenza'},{id:3,name:'Amore'}];
 const events=[{property_id:null,anonymous_id:'a'},{property_id:1,anonymous_id:'a'},{property_id:1,anonymous_id:'a'},{property_id:2,anonymous_id:'a'},{property_id:2,anonymous_id:'b'}];
 const r=summarizeAccess(events,props);
 assert.equal(r.page_views,5);assert.equal(r.sessions,2);
 assert.deepEqual(r.ranking.map(p=>[p.name,p.views,p.sessions]),[['Essenza',2,2],['Signature',2,1],['Amore',0,0]]);
});
test('reports read beyond default 1000 rows and propagate database errors',async()=>{
 const ranges=[];const rows=Array.from({length:1002},(_,id)=>({id,property_id:1,anonymous_id:'a'}));
 const db={from(table){if(table==='properties')return {select:async()=>({data:[{id:1,name:'Signature'}]})};
 const q={select(){return q},eq(){return q},gte(){return q},lt(){return q},order(){return q},async range(a,b){ranges.push([a,b]);return {data:rows.slice(a,b+1)}}};return q}};
 assert.equal((await accessReport(db,7)).page_views,1002);assert.equal(ranges.length,2);
 await assert.rejects(()=>accessReport(db,365),/invalid_period/);
 await assert.rejects(()=>accessReport({from:()=>({select:async()=>({error:{}})})},7),/analytics_unavailable/);
});
test('browser tracking sends no URL parameters or user identity and reuses session across reloads',async()=>{
 const dom=new JSDOM('',{url:'https://preview.example/chale-premium.html?email=private',runScripts:'outside-only'});
 const w=dom.window,calls=[];w.CHALEZINHO_CONFIG={bookingEngine:'https://dev.example/engine',environment:'development'};
 w.fetch=async(url,options)=>{calls.push(JSON.parse(options.body));return {ok:true}};
 const script=readFileSync(new URL('../access-metrics.js',import.meta.url),'utf8');w.eval(script);w.eval(script);
 assert.equal(calls.length,2);assert.equal(calls[0].session_id,calls[1].session_id);
 assert.deepEqual(Object.keys(calls[0]).sort(),['page','property_code','session_id']);
 assert.equal(calls[0].page,'chale-premium.html');assert.ok(!JSON.stringify(calls).includes('private'));
 w.sessionStorage.setItem('ville-access-session',JSON.stringify({id:sid,last:Date.now()-31*60000}));w.eval(script);
 assert.notEqual(calls[2].session_id,sid);
 Object.defineProperty(w.navigator,'globalPrivacyControl',{value:true});w.eval(script);assert.equal(calls.length,3);w.close();
});
test('admin view renders ranking, changes period, and displays errors without false zeroes',async()=>{
 const dom=new JSDOM(readFileSync(new URL('../admin.html',import.meta.url),'utf8'),{url:'https://preview.example/admin.html?view=access',runScripts:'outside-only'});
 const w=dom.window,periods=[];let fail=false;
 w.CHALEZINHO_CONFIG={bookingEngine:'https://dev.example/engine'};
 w.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'test',user:{id:'admin'}}}})},from:()=>({select(){return this},eq(){return this},single:async()=>({data:{role:'admin',full_name:'QA'}})})})};
 w.fetch=async(url,options)=>{
  const b=JSON.parse(options.body);let data={ok:true};
  if(b.action==='admin_hub')data={ok:true,reservations:[],notifications:[],properties:[]};
  if(b.action==='admin_access_metrics'){periods.push(b.days);data=fail?{ok:false,error:'unavailable'}:{ok:true,page_views:6,sessions:2,ranking:[{name:'Signature',views:4,sessions:2},{name:'Essenza',views:2,sessions:1},{name:'Amore',views:0,sessions:0}]}};
  return {ok:data.ok,json:async()=>data};
 };
 w.eval(readFileSync(new URL('../admin.js',import.meta.url),'utf8'));
 // Drain async boot/auth/report promises, with bounded polling for completion.
 const wait=async predicate=>{for(let i=0;i<20;i++){if(predicate())return;await new Promise(r=>setTimeout(r,5))}assert.fail('admin did not settle')};
 await wait(()=>w.document.querySelector('#access-results table'));
 assert.match(w.document.querySelector('#access-results').textContent,/66,7%/);
 assert.equal(w.document.querySelectorAll('#access-results tbody tr').length,3);
 const select=w.document.querySelector('#access-period');select.value='7';select.dispatchEvent(new w.Event('change'));
 await wait(()=>w.document.querySelector('#access-results table'));assert.deepEqual(periods,[30,7]);
 fail=true;w.document.querySelector('#access-period').dispatchEvent(new w.Event('change'));
 await wait(()=>w.document.querySelector('#access-results').textContent.includes('Não foi possível'));
 assert.equal(w.document.querySelector('#access-results table'),null);w.close();
});
