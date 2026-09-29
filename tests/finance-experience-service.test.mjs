import {test} from 'node:test';
import assert from 'node:assert/strict';
import {experienceCreditService} from '../supabase/functions/_shared/finance/experience-credits.ts';
const id='10000000-0000-4000-8000-000000000001';
function setup(isAdmin=true,error=null){const calls=[];return {calls,run:experienceCreditService({admin:{rpc:async(name,args)=>{calls.push({name,args});return {data:id,error}}},currentUser:async()=>({id}),userIsAdmin:async()=>isAdmin,json:(body,status=200)=>({body,status})})};}
const body={reservation_id:id,item_id:id,operation_key:id,service_not_provided:true,reason:'Ainda não prestado'};
test('experience endpoint forbids production, guests and missing service evidence before DB writes',async()=>{
 const f=setup();assert.equal((await f.run(null,body,false)).status,403);
 assert.equal((await f.run(null,{...body,service_not_provided:false},true)).status,409);assert.equal(f.calls.length,0);
 const guest=setup(false);assert.equal((await guest.run(null,body,true)).status,403);assert.equal(guest.calls.length,0);
});
test('experience endpoint passes authenticated actor and operation key, never client amount',async()=>{
 const f=setup(),result=await f.run(null,{...body,amount_cents:1,actor:'attacker'},true);
 assert.equal(result.body.cancellation_id,id);assert.equal(f.calls[0].args.p_actor,id);assert.equal(f.calls[0].args.p_key,id);assert.equal('amount_cents' in f.calls[0].args,false);
});
test('experience endpoint reports allocation review without claiming a refund',async()=>{
 const f=setup(true,{message:'experience_credit_review_required'}),result=await f.run(null,body,true);
 assert.equal(result.status,409);assert.equal(result.body.ok,false);assert.equal(result.body.error,'experience_credit_review_required');
});
