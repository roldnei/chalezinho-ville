import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {contactInput,guestDirectory} from '../supabase/functions/_shared/guest-directory.ts';
const gid='10000000-0000-4000-8000-000000000001',rid='20000000-0000-4000-8000-000000000001';
function memoryDB(){
 const data={guest_contacts:[],guest_stay_links:[],reservations:[{id:rid,property_id:1,source:'direct',check_in:'2099-10-01',check_out:'2099-10-03'}]};
 return {data,from(table){let filters=[],mode='select',fields,range=null;const q={select(){return q},order(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},range(a,b){range=[a,b];return q},insert(v){mode='insert';fields=v;return q},update(v){mode='update';fields=v;return q},delete(){mode='delete';return q},single(){q.one=true;return q},maybeSingle(){q.one=true;return q},then(resolve){let rows=data[table].filter(r=>filters.every(f=>f(r)));if(mode==='insert'){data[table].push(fields);rows=[fields]}if(mode==='update')rows.forEach(r=>Object.assign(r,fields));if(mode==='delete')data[table]=data[table].filter(r=>!rows.includes(r));if(range)rows=rows.slice(range[0],range[1]+1);return Promise.resolve({data:q.one?rows[0]||null:structuredClone(rows)}).then(resolve)}};return q}};
}
const ext=[{id:'airbnb:3:2099-10-04:2099-10-06',property_id:3,source:'airbnb',status:'blocked',start:'2099-10-04',end:'2099-10-06'}];
test('normalizes Brazilian and international phones and rejects invalid input',()=>{
 assert.equal(contactInput({name:' Ana ',phone:'(27) 99999-1234'}).phone,'+5527999991234');
 assert.equal(contactInput({name:'Ana',phone:'+1 202-555-0123'}).phone,'+12025550123');
 assert.equal(contactInput({name:'Ana'}).phone,null);
 for(const phone of ['123','abc','++5527999991234'])assert.throws(()=>contactInput({name:'Ana',phone}),/invalid_phone/);
 assert.throws(()=>contactInput({name:'A'}),/invalid_contact/);
});
test('reuses one guest for direct and external stays; edit changes contact, not financial reservation',async()=>{
 const db=memoryDB(),run=body=>guestDirectory(db,body,gid,async()=>ext);
 await run({operation:'save',id:gid,name:'Pessoa QA',phone:'27999991234'});
 await run({operation:'link',guest_id:gid,reservation_id:rid,property_id:999,check_in:'1900-01-01'});
 await run({operation:'link',guest_id:gid,stay_key:ext[0].id});
 await run({operation:'link',guest_id:gid,stay_key:ext[0].id});
 assert.equal(db.data.guest_stay_links.length,2);assert.equal(db.data.guest_stay_links[0].property_id,1);
 await run({operation:'save',id:gid,name:'Pessoa QA',phone:'27999994321'});
 assert.equal(db.data.guest_contacts.length,1);assert.equal(db.data.guest_contacts[0].phone,'+5527999994321');
 assert.equal(db.data.reservations[0].guest_phone,undefined);
 await run({operation:'unlink',guest_id:gid,stay_key:ext[0].id});assert.equal(db.data.guest_stay_links.length,1);
});
test('does not trust invented, duplicate, failed external periods or steal another guest link',async()=>{
 const db=memoryDB();db.data.guest_contacts.push({id:gid,name:'QA'});
 for(const external of [[],[...ext,...ext],[{...ext[0],status:'integration_error'}]])await assert.rejects(()=>guestDirectory(db,{operation:'link',guest_id:gid,stay_key:ext[0].id},gid,async()=>external),/stay_not_found/);
 db.data.guest_stay_links.push({stay_key:ext[0].id,guest_id:rid});
 await assert.rejects(()=>guestDirectory(db,{operation:'link',guest_id:gid,stay_key:ext[0].id},gid,async()=>ext),/stay_already_linked/);
});
test('reads all pages beyond default API row cap and fails loudly on DB error',async()=>{
 const db=memoryDB();db.data.guest_contacts=Array.from({length:1100},(_,i)=>({id:String(i),name:'QA'}));
 assert.equal((await guestDirectory(db,{},gid,async()=>[])).contacts.length,1100);
 const broken={from(){return {select(){return this},order(){return this},range:async()=>({error:{code:'permission_denied'}})}}};
 await assert.rejects(()=>guestDirectory(broken,{},gid,async()=>[]),/unavailable/);
});
async function setup({fail=false}={}){
 const dom=new JSDOM(readFileSync(new URL('../admin.html',import.meta.url),'utf8'),{url:'https://preview.example/admin.html?view=guests',runScripts:'outside-only'}),w=dom.window,db=memoryDB();
 w.CHALEZINHO_CONFIG={bookingEngine:'https://dev.example/engine'};
 w.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'fixture',user:{id:gid}}}})},from:()=>({select(){return this},eq(){return this},single:async()=>({data:{role:'admin',full_name:'QA'}})})})};
 const hub={ok:true,reservations:db.data.reservations,notifications:[],properties:[{id:1,name:'QA1',active:true},{id:3,name:'QA3',active:true}],channel_periods:ext,experience_orders:[],payments:[],guarantees:[],modifications:[],charges:[],notes:[]};
 w.fetch=async(_,o)=>{const b=JSON.parse(o.body);let d={ok:true};try{if(b.action==='admin_hub')d=structuredClone(hub);if(b.action==='admin_guests'){if(fail)throw Error('unavailable');d=await guestDirectory(db,b,gid,async()=>ext);}}catch(e){d={ok:false,error:e.message}}return {ok:d.ok,json:async()=>d}};
 w.eval(readFileSync(new URL('../admin.js',import.meta.url),'utf8'));
 const wait=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,3))}assert.fail('UI did not settle')};
 await wait(()=>w.document.querySelector('#new-guest'));return {w,db,dom,wait};
}
test('UI creates contact, links two stays, edits phone, unlinks, and escapes names',async()=>{
 const {w,db,wait}=await setup();const $=s=>w.document.querySelector(s);const submit=f=>f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 try{
 $('#new-guest').click();let f=$('#guest-form');f.elements.name.value='Pessoa <img src=x onerror=alert(1)>';f.elements.phone.value='27999991234';submit(f);
 await wait(()=>$('#guest-link-form'));assert.equal($('#admin-modal-content img'),null);
 for(const key of ['reservation:'+rid,ext[0].id]){f=$('#guest-link-form');f.elements.stay_key.value=key;submit(f);await wait(()=>db.data.guest_stay_links.some(l=>l.stay_key===key)&&$('#guest-link-form')!==f);}
 f=$('#guest-form');f.elements.phone.value='27999994321';submit(f);await wait(()=>$('#guest-form')!==f);
 assert.equal(db.data.guest_contacts.length,1);assert.equal(db.data.guest_stay_links.length,2);
 $('[data-close-modal]').click();$('[data-view="calendar"]').click();$('#calendar-month').value='2099-10';$('#calendar-month').dispatchEvent(new w.Event('change'));
 assert.equal(w.document.querySelectorAll('[data-guest-stay]').length,2);assert.match($('#admin-content').textContent,/5527999994321/);
  $('[data-guest-stay]').click();assert.ok($('#event-contact'));$('#event-contact').click();const old=$('#guest-form');$('[data-unlink-stay]').click();await wait(()=>$('#guest-form')!==old);assert.equal(db.data.guest_stay_links.length,1);
 }finally{w.close()}
});
test('UI shows unavailable contact service without hiding the admin shell',async()=>{const {w}=await setup({fail:true});try{assert.match(w.document.body.textContent,/Não foi possível consultar os hóspedes/);assert.equal(w.document.querySelector('#new-guest').disabled,true)}finally{w.close()}});
