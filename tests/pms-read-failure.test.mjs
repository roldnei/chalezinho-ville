import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=readFileSync('supabase/functions/booking-engine/index.ts','utf8');
function harness(name,failedTable){
 const start=source.indexOf(`async function ${name}(`);
 const end=source.indexOf('\nasync function ',start+1);
 const fn=source.slice(start,end<0?undefined:end);
 let writes=0;
 const context={Response,Date,Intl,Number,String,Math,crypto,
  currentUser:async()=>({id:'qa-admin'}),userIsAdmin:async()=>true,
  json:(body,status=200)=>Response.json(body,{status}),
  validDate:()=>true,overlaps:()=>false,
  airbnbCalendarData:async()=>({ok:true,listings:[{name:'QA chalet',ok:true,periods:[]}]}),
  bookingCalendarData:async()=>({configured:false,listings:[]}),
  calendars:{channels:async()=>({listings:[]})},
  admin:{from(table){const q={select(){return q},eq(){return q},in(){return q},lt(){return q},gt(){return q},order(){return q},limit(){return q},single(){return q},insert(){writes++;return q},
   then(resolve){return Promise.resolve({data:table==='properties'?{id:1,name:'QA chalet',active:true,max_guests:2}:[],error:table===failedTable?{code:'08006',message:'fixture unavailable'}:null}).then(resolve)}};return q}}};
 vm.createContext(context);vm.runInContext(ts.transpileModule(fn,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 return {run:body=>context[name](new Request('https://example.test'),body),writes:()=>writes};
}
test('PMS does not report empty financial lists when a query fails',async()=>{
 for(const table of ['modification_requests','guarantees','payments','post_booking_charges','payment_settings','properties','property_integrations','notification_outbox']){
  const h=harness('opsData',table),r=await h.run({});assert.equal(r.status,503,table);assert.equal((await r.json()).error,'ops_data_unavailable');assert.equal(h.writes(),0);
 }
});
test('manual reservation fails closed if any local availability query fails',async()=>{
 for(const table of ['properties','reservations','post_booking_charges','pms_calendar_blocks']){
  const h=harness('adminReservationAction',table),r=await h.run({operation:'create_manual',property_id:1,check_in:'2026-12-01',check_out:'2026-12-03',guests:2,guest_name:'QA DEV'});
  assert.equal(r.status,503,table);assert.equal((await r.json()).error,'availability_unavailable');assert.equal(h.writes(),0);
 }
});
