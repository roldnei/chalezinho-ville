import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {reconcileCalendarPeriods} from '../supabase/functions/_shared/calendars.ts';
const stay={id:'verified-booking',property_id:1,channel:'booking',status:'confirmed',check_in:'2026-10-18',check_out:'2026-10-20',version:1};
const properties=[{id:1,name:'Ville Signature',active:true,check_in_time:'15:00',check_out_time:'11:00'},{id:2,name:'Ville Essenza',active:true}];
const blocks=[{id:'airbnb:cutoff',property_id:1,source:'airbnb',event_kind:'block',start:'2026-10-18',end:'2026-10-19'},
 {id:'booking:shortened',property_id:1,source:'booking',calendar_id:'source',event_uid:'new',calendar_label:'Booking — CH1',event_kind:'block',start:'2026-10-19',end:'2026-10-20'},
 {id:'airbnb:essenza',property_id:2,source:'airbnb',event_kind:'block',start:'2026-10-18',end:'2026-10-19'}];
const periods=reconcileCalendarPeriods(blocks,[{source_id:'source',uid:'old',kind:'stay',stay_id:stay.id,start_date:stay.check_in,end_date:stay.check_out}],[stay]);
const wait=async f=>{for(let i=0;i<150&&!f();i++)await new Promise(r=>setTimeout(r,5));assert.ok(f(),'UI did not settle');};
function setup(page,url){
 const w=new JSDOM(readFileSync(page,'utf8'),{url,runScripts:'outside-only'}).window;
 const RealDate=w.Date;w.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-10-18T16:40:00Z']));}static now(){return new RealDate('2026-10-18T16:40:00Z').getTime();}};
 w.CHALEZINHO_CONFIG={supabaseUrl:'https://qa.invalid',bookingEngine:'https://qa.invalid/engine'};
 w.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'test-only',user:{id:'qa'}}}})},from:()=>({select(){return this},eq(){return this},single:async()=>({data:{role:'admin'}})})})};return w;
}
test('multicalendar shows the canonical Booking stay, preserves another chalet cutoff, and opens confirmed details',async()=>{
 const w=setup('admin.html','https://qa.invalid/admin.html?view=calendar');
 try{
  w.fetch=async(_,o)=>{const p=JSON.parse(o.body);const data=p.action==='admin_hub'?{ok:true,properties,reservations:[],notifications:[],channel_periods:periods,calendar_blocks:[],experience_orders:[],payments:[],guarantees:[],modifications:[],charges:[],notes:[]}:{ok:true,requests:[],contacts:[],links:[]};return {ok:true,json:async()=>data};};
  w.eval(readFileSync('admin.js','utf8'));await wait(()=>w.document.querySelector('.calendar-column-event'));
  const buttons=[...w.document.querySelectorAll('.calendar-column-event')];assert.equal(buttons.length,2);
  const booking=buttons.find(b=>b.classList.contains('booking'));assert.ok(booking);assert.equal(booking.classList.contains('availability-block'),false);assert.equal(booking.querySelector('.calendar-column-range').textContent,'18/10 → 20/10');
  booking.click();const modal=w.document.querySelector('#admin-modal-content');assert.match(modal.textContent,/HOSPEDAGEM CONFIRMADA/);assert.doesNotMatch(modal.textContent,/Sem hospedagem/);assert.match(modal.textContent,/18\/10\/2026 15:00.*20\/10\/2026 11:00/);
  const link=modal.querySelector('a');assert.equal(new URL(link.href).searchParams.get('stay'),stay.id);
  buttons.find(b=>b.classList.contains('availability-block')).click();assert.match(modal.textContent,/INDISPONIBILIDADE/);assert.equal(modal.querySelector('a'),null);
 }finally{w.close();}
});
test('calendar PMS link opens the exact confirmed stay after host navigation updates the URL',async()=>{
 const w=setup('pms-operacao.html','https://qa.invalid/pms-operacao.html?view=reservations&stay='+stay.id);
 try{
  const summary={arrivals:[stay],departures:[],present:[],expected:[],upcoming:[stay],pending:[],overdue:[]};
  w.fetch=async(url)=>({ok:true,json:async()=>String(url).includes('team-inspections')?{ok:true,data:{}}:{ok:true,operator:{role:'admin'},today:'2026-10-18',server_now:'2026-10-18T16:40:00Z',properties,stays:[stay],reservations:[],tasks:[],team:[],sources:[],events:[],templates:[],issues:[],summary}});
  w.eval(readFileSync('operations-workspace.js','utf8'));w.eval(readFileSync('pms-operacao.js','utf8'));
  await wait(()=>w.document.querySelector('[data-attendance="check_in"]'));
  assert.match(w.document.querySelector('#content').textContent,/18\/10\/2026.*20\/10\/2026/);assert.match(w.document.querySelector('#content').textContent,/Situação: Confirmada/);
  assert.ok(w.document.querySelector('[data-edit]'));assert.equal(w.document.querySelectorAll('[data-stay]:not([hidden])').length,0);
 }finally{w.close();}
});
