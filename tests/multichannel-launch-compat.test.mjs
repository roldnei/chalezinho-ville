import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {taskPhotos} from '../supabase/functions/pms-operations/photos.ts';
const actor={id:'qa-admin',role:'admin',property_ids:[1],permissions:{reservations:true}};
for(const variant of ['pms-launch-compat','pms-operations']){
 test(`${variant}: checkout records departure without invoking legacy task generation`,async()=>{
  const source=readFileSync(`supabase/functions/${variant}/index.ts`,'utf8');
  const start=source.indexOf('async function reservationAction('),end=source.indexOf('\nasync function ',start+1);
  const code=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const writes=[];const reservation={id:'qa',property_id:1,status:'confirmed',check_in:'2020-01-01',checked_in_at:'2020-01-01T15:00:00Z',checked_out_at:null};
  const admin={from(table){let patch;const q=new Proxy({}, {get(_,key){if(key==='then')return resolve=>resolve({data:table==='reservations'?{...reservation,...patch}:null,error:null});return value=>{if(key==='update'||key==='insert'){patch=value;writes.push({table,operation:key,value});}return q;};}});return q;}};
  const context={admin,clip:(v,n)=>String(v||'').slice(0,n),canManage:()=>true,hasPermission:()=>true,canUseProperty:()=>true,json:(body,status=200)=>({body,status}),syncTurnovers:()=>{throw Error('legacy generation must never run after checkout');},Date,Intl};
  vm.createContext(context);vm.runInContext(code,context);
  const result=await context.reservationAction({operation:'check_out',reservation_id:'qa'},actor);
  assert.equal(result.status,200);assert.ok(result.body.reservation.checked_out_at);assert.deepEqual(writes.map(x=>x.table),['reservations','audit_events']);
 });
 test(`${variant}: opening hub cannot call legacy generator`,()=>{
  const source=readFileSync(`supabase/functions/${variant}/index.ts`,'utf8');const start=source.indexOf('async function hub('),end=source.indexOf('\nasync function ',start+1);
  assert.doesNotMatch(source.slice(start,end),/syncTurnovers\s*\(/);
 });
}
test('legacy photos remain readable but cannot replace historical evidence',async()=>{
 let uploads=0;const admin={from(table){const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:{id:'legacy',property_id:1,task_type:'turnover'}}),then:resolve=>resolve({data:[{id:'photo',storage_path:'existing.jpg'}],error:null})};return q;},storage:{from(){return {createSignedUrl:async()=>({data:{signedUrl:'https://test.invalid/signed'}}),upload:()=>{uploads++}}}}};
 const json=(body,status=200)=>({body,status});const read=await taskPhotos({task_id:'legacy',operation:'list'},actor,admin,json);assert.equal(read.status,200);assert.equal(read.body.photos.length,1);assert.equal(read.body.photos[0].storage_path,undefined);
 const write=await taskPhotos({task_id:'legacy',operation:'upload'},actor,admin,json);assert.equal(write.status,409);assert.equal(write.body.error,'legacy_evidence_read_only');assert.equal(uploads,0);
});

