import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['supabase/functions/_shared/finance/reservation-refunds.ts'],platform:'node',bundle:true,format:'esm',write:false});
const {reservationRefundService}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
function scenario({afterCheckin=false,within=false}={}){
 const reservation={id:'r',user_id:'guest',status:'confirmed',rate_plan_code:'refundable',check_in:afterCheckin?'2026-11-03':'2026-11-20',checked_in_at:afterCheckin?'2026-11-03T19:00Z':null};
 const request={id:'req',requested_at:'2026-11-05T20:00:00Z',status:'requested',reason:'Sem justificativa'};
 const values={reservations:reservation,reservation_cancel_requests:null,reservation_cancellations:null,
  reservation_policy_acceptances:{document_id:'old',document_version:'1.2',accepted_at:within?'2026-11-04T20:00:00Z':'2026-10-01T20:00:00Z'},
  cancellation_policy_rules:{id:'rule-old',withdrawal_days:7,full_refund_days_before_checkin:20,late_accommodation_refund_percent:50},
  payments:[{id:'pay',provider_payment_id:'CHAR_X',amount_cents:10000,status:'paid'}],
  financial_entries:[{id:'s',payment_id:'pay',entry_type:'accommodation',amount_cents:6000},{id:'l',payment_id:'pay',entry_type:'cleaning',amount_cents:1000},{id:'e1',payment_id:'pay',entry_type:'experience',amount_cents:2000,description:'Experiência A'},{id:'e2',payment_id:'pay',entry_type:'upgrade',amount_cents:1000,description:'Experiência B'}],reservation_refunds:[]};
 let captured=null,lookup=null;
 const admin={from(table){
   let inserted=false,byRequest=false;
   const q={select(){return q},eq(k,v){if(table==='cancellation_policy_rules'&&k==='document_id')lookup=v;if(table==='reservation_cancel_requests'&&k==='id')byRequest=true;return q},in(){return q},order(){return q},limit(){return q},insert(data){inserted=true;captured=data;return q},maybeSingle:async()=>({data:byRequest?request:values[table]}),single:async()=>({data:inserted?request:values[table]}),then(ok){return Promise.resolve({data:values[table]}).then(ok)}};
   return q;
 },rpc:async(name,params)=>{captured=params;return {data:{id:'c',guest_request_id:'req',refund_due_cents:params.p_case.refund_due_cents}}}};
 const svc=reservationRefundService({admin,currentUser:async req=>({id:req.headers.get('actor')}),userIsAdmin:async user=>user.id==='admin',json:(data,status=200)=>({data,status})});
 return {svc,captured:()=>captured,lookup:()=>lookup,request};
}
const req=actor=>new Request('https://test.example',{headers:{actor}});
test('guest can register an unreasoned request after check-in, with protocol, without automatically issuing a refund',async()=>{
 const s=scenario({afterCheckin:true});
 const result=await s.svc.reservationCancelRequest(req('guest'),{operation:'request',reservation_id:'r'},true);
 assert.equal(result.status,200);assert.equal(result.data.request.id,'req');assert.match(s.captured().reason,/sem justificativa/);
 assert.equal((await s.svc.reservationCancelRequest(req('someone-else'),{operation:'request',reservation_id:'r'},true)).status,404);
 const admin=await s.svc.reservationRefundAction(req('admin'),{operation:'prepare',reservation_id:'r',guest_request_id:'req'},true);
 assert.equal(admin.data.error,'individual_review_required');
});
test('late calculation uses the accepted document and excludes the experience marked delivered',async()=>{
 const s=scenario();
 const base={operation:'prepare',reservation_id:'r',guest_request_id:'req'};
 const blocked=await s.svc.reservationRefundAction(req('admin'),base,true);
 assert.equal(blocked.data.error,'experience_delivery_review_required');
 assert.equal(s.captured(),null);
 const decisions=[{id:'e1',status:'provided'},{id:'e2',status:'unprovided'}];
 await s.svc.reservationRefundAction(req('admin'),{...base,experience_delivery:decisions},true);
 assert.equal(s.lookup(),'old');
 assert.equal(s.captured().p_case.refund_due_cents,5000);
 assert.deepEqual(s.captured().p_case.calculation.experience_delivery,decisions);
});
test('statutory window includes all paid items without asking about experience delivery',async()=>{
 const s=scenario({within:true});
 await s.svc.reservationRefundAction(req('admin'),{operation:'prepare',reservation_id:'r',guest_request_id:'req'},true);
 assert.equal(s.captured().p_case.refund_due_cents,10000);
});
test('version switch in SQL rejects old unsigned quotes and preserves a prior reservation snapshot',async()=>{
 const db=new PGlite();
 const ids=['old','new','qOld','qNew','oOld','oNew','rOld','rStale','rNew','ruleOld','ruleNew'].reduce((a,k,i)=>({...a,[k]:'00000000-0000-0000-0000-'+String(i+1).padStart(12,'0')}),{});
 const {old,new:latest,qOld,qNew,oOld,oNew,rOld,rStale,rNew,ruleOld,ruleNew}=ids;
 try {
  await db.exec(`create role anon;create role authenticated;
  create table policy_documents(id uuid primary key,document_type text,body text);
  create table quotes(id uuid primary key,pricing_snapshot jsonb);
  create table quote_options(id uuid primary key,quote_id uuid,cancellation_policy_id uuid);
  create table reservations(id uuid primary key,quote_option_id uuid,rate_plan_code text);
  create table cancellation_policy_rules(id uuid primary key,document_id uuid,rate_plan_code text);
  create table cancellation_policy_assignments(environment text,rate_plan_code text,rule_id uuid);
  create table reservation_policy_acceptances(reservation_id uuid,document_id uuid,document_snapshot jsonb);
  insert into policy_documents values ('${old}','cancellation_policy','Texto 1.2'),('${latest}','cancellation_policy','Texto 1.3');
  insert into quotes values ('${qOld}','{"cancellation_policy_scope":"development"}'),('${qNew}','{"cancellation_policy_scope":"development"}');
  insert into quote_options values ('${oOld}','${qOld}','${old}'),('${oNew}','${qNew}','${latest}');
  insert into reservations values ('${rOld}','${oOld}','refundable'),('${rStale}','${oOld}','refundable'),('${rNew}','${oNew}','refundable');
  insert into cancellation_policy_rules values ('${ruleOld}','${old}','refundable'),('${ruleNew}','${latest}','refundable');
  insert into cancellation_policy_assignments values ('development','refundable','${ruleOld}');`);
  await db.exec(await readFile('supabase/migrations/20261105235000_guard_quoted_cancellation_policy_acceptance.sql','utf8'));
  const accept=(r,d)=>db.query("insert into reservation_policy_acceptances select $1::uuid,d.id,jsonb_build_object('body',d.body) from policy_documents d where d.id=$2::uuid",[r,d]);
  await accept(rOld,old);
  await db.query('update cancellation_policy_assignments set rule_id=$1',[ruleNew]);
  await assert.rejects(accept(rStale,old),/cancellation_policy_version_changed/);
  await assert.rejects(accept(rStale,latest),/cancellation_policy_version_changed/);
  await accept(rNew,latest);
  const result=await db.query("select document_snapshot->>'body' body from reservation_policy_acceptances order by reservation_id");
  assert.deepEqual(result.rows.map(x=>x.body),['Texto 1.2','Texto 1.3']);
 }finally{await db.close()}
});

test('public policy page shows the current tariff version, not a hosting document or a previous version',async()=>{
 const {JSDOM}=await import('jsdom');
 const dom=new JSDOM('<div id="legal-content"></div>',{url:'https://example.test/documentos.html?type=cancellation_refundable',runScripts:'outside-only'});
 try{
  const w=dom.window;
  w.CHALEZINHO_CONFIG={bookingEngine:'/engine',environment:'development'};
  w.fetch=async()=>({ok:true,json:async()=>({ok:true,documents:[{title:'Termos 1.2',version:'1.2'}],cancellation_policies:[{title:'Cancelamento',version:'1.3',code:'refundable_v1',body:'Texto vigente 1.3',rate_plan_code:'refundable'},{title:'Não reembolsável',version:'1.2',body:'Outra tarifa',rate_plan_code:'non_refundable'}]})});
  await w.eval(await readFile('legal-documents.js','utf8'));
  const displayed=w.document.querySelector('#legal-content').textContent;
  assert.match(displayed,/Versão 1\.3/);assert.match(displayed,/Texto vigente 1\.3/);
  assert.doesNotMatch(displayed,/Outra tarifa|Termos 1\.2/);
 }finally{dom.window.close()}
});
