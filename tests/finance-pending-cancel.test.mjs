import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
const source=fs.readFileSync('supabase/functions/booking-engine/index.ts','utf8');const fn=source.slice(source.indexOf('async function cancelPendingPayment('),source.indexOf('async function mockPayment('));
const make=new Function('admin','currentUser','json','Deno','reconcileSandboxCharge',ts.transpile(fn,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext})+';return cancelPendingPayment;');
function fixture({paid=false,lookupFails=false,other=false}={}){
 const events=[];const query={select(){return this},eq(){return this},single:async()=>({data:{active_provider:'pagbank_sandbox'}}),maybeSingle:async()=>({data:other?null:{id:'payment',provider:'pagbank_sandbox',provider_payment_id:'CHAR_TEST',metadata:{order_id:'ORDE_TEST'}}})};
 const admin={from:()=>query,rpc:async()=>{events.push('cancel');return paid?{error:{message:'payment_not_cancellable'}}:{data:{result_payment_status:'cancelled',result_reservation_status:'not_confirmed',result_reservation_id:'reservation'}}}};
 const call=make(admin,async()=>({id:'owner'}),(body,status=200)=>({body,status}),{env:{get:()=> 'fake-token'}},async()=>{events.push('provider-read');if(lookupFails)throw Error('network')});return {events,run:()=>call({}, {payment_id:'payment'},true)};
}
test('pending sandbox cancellation reconciles provider evidence before the atomic local cancellation',async()=>{const f=fixture();assert.equal((await f.run()).status,200);assert.deepEqual(f.events,['provider-read','cancel'])});
test('a paid race cannot be locally cancelled',async()=>{const f=fixture({paid:true});assert.equal((await f.run()).status,409)});
test('provider outage and another owner never release the dates',async()=>{for(const options of [{lookupFails:true},{other:true}]){const f=fixture(options);assert.ok([404,503].includes((await f.run()).status));assert.ok(!f.events.includes('cancel'))}});
