import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import ts from 'typescript';
import vm from 'node:vm';
const db=new PGlite(),owner='10000000-0000-4000-8000-000000000001',guest='10000000-0000-4000-8000-000000000002',invite='20000000-0000-4000-8000-000000000001',request='30000000-0000-4000-8000-000000000001',key='a'.repeat(64);
const rows=async(s,p=[])=>(await db.query(s,p)).rows;
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema private;create schema cron;create schema net;
 create table profiles(id uuid primary key,role text,pms_access_status text);insert into profiles values('${owner}','admin','active'),('${guest}','guest','active');
 create table direct_booking_invitations(id uuid primary key,created_by uuid);insert into direct_booking_invitations values('${invite}','${owner}');
 create table direct_booking_requests(id uuid primary key,invitation_id uuid,status text);insert into direct_booking_requests values('${request}','${invite}','pending');
 create table notification_templates(code text primary key,subject text,body_text text,active boolean,provider_managed boolean);
 create table notification_outbox(id uuid primary key default gen_random_uuid(),user_id uuid,template_code text,payload jsonb,dedupe_key text unique,status text default 'queued',send_after timestamptz default now(),created_at timestamptz default now(),last_attempt_at timestamptz,attempt_count int default 0,max_attempts int default 5,last_error text);
 create table private.trip_review_delivery_settings(id boolean primary key,project_url text,dispatch_key text);insert into private.trip_review_delivery_settings values(true,'https://irxsaladqhbzhkoaclxy.supabase.co','${key}');
 create function cron.schedule(text,text,text) returns bigint language sql as 'select 1::bigint';
 create function public.claim_notification_outbox(p_limit integer default 20) returns setof public.notification_outbox language plpgsql as $$begin return query select * from notification_outbox where status='queued' and template_code not in ('trip_review_requested','trip_review_enabled') limit p_limit;end$$;
 revoke all on all tables in schema public from public,anon,authenticated;grant all on all tables in schema public to service_role;grant usage on schema private to service_role;grant select on private.trip_review_delivery_settings to service_role;`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261123192812_direct_booking_review_emails.sql',import.meta.url),'utf8'));
});
after(()=>db.close());
test('existing pending submission is queued once to its inviting admin, with no documents in payload',async()=>{
 await db.query('select enqueue_direct_booking_review_email($1)',[request]);
 const q=await rows('select * from notification_outbox');assert.equal(q.length,1);assert.equal(q[0].user_id,owner);assert.deepEqual(q[0].payload,{request_id:request});
 assert.equal((await rows('select status from direct_booking_requests'))[0].status,'pending');
 assert.equal((await rows('select * from claim_notification_outbox()')).length,0,'generic worker cannot take dedicated emails');
});
test('new completed submission triggers one admin alert; credential required; guests cannot enqueue or claim',async()=>{
 const id='30000000-0000-4000-8000-000000000002';await db.query("insert into direct_booking_requests values($1,$2,'pending')",[id,invite]);
 assert.equal((await rows('select * from notification_outbox')).length,2);
 await assert.rejects(db.query('select * from claim_direct_booking_review_emails($1)',['wrong']),/unauthorized/);
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select enqueue_direct_booking_review_email($1)',[request]),/permission denied/);await assert.rejects(db.query('select * from claim_direct_booking_review_emails($1)',[key]),/permission denied/);await db.exec('reset role');}
 await db.exec('set role service_role');const claimed=await rows('select * from claim_direct_booking_review_emails($1)',[key]);await db.exec('reset role');assert.equal(claimed.length,2);assert.ok(claimed.every(r=>r.attempt_count===1&&r.status==='processing'));
 assert.equal((await rows('select * from claim_direct_booking_review_emails($1)',[key])).length,0,'overlapping workers cannot claim twice');
});
test('reviewed requests are cancelled, stale work retries, inactive admins cannot receive',async()=>{
 await db.query("update direct_booking_requests set status='approved' where id=$1",[request]);await db.exec("update notification_outbox set last_attempt_at=now()-interval '11 minutes'");
 let q=await rows('select * from claim_direct_booking_review_emails($1)',[key]);assert.equal(q.length,1);assert.equal(q[0].attempt_count,2);
 assert.equal((await rows("select status from notification_outbox where payload->>'request_id'=$1",[request]))[0].status,'cancelled');
 await db.query("update profiles set pms_access_status='inactive' where id=$1",[owner]);assert.equal((await rows('select * from claim_direct_booking_review_emails($1)',[key])).length,0);
 await db.exec("update notification_outbox set status='sent'");const id='30000000-0000-4000-8000-000000000003';await db.query("insert into direct_booking_requests values($1,$2,'pending')",[id,invite]);assert.equal((await rows('select * from notification_outbox')).length,2,'inactive owner produces no alert');
});
class ProviderError extends Error{constructor(code,retryable){super(code);this.code=code;this.retryable=retryable;this.retryAfterSeconds=60;}}
async function mailer({stale=false,ownerChanged=false,development=false,failure=false,failureCode='provider_temporary'}={}){
 const sends=[],completions=[],updates=[];let handler;
 const item={id:'mail-id',user_id:owner,template_code:'direct_booking_review_requested',payload:{request_id:request},max_attempts:5,attempt_count:1};
 const db={auth:{admin:{getUserById:async()=>({data:{user:{email:'owner@example.test'}}})}},rpc:async(name,args)=>{if(name==='claim_direct_booking_review_emails')return args.p_dispatch_key===key?{data:[item]}:{error:{message:'unauthorized'}};completions.push(args);return{}},from:table=>({select(){return this},eq(){return this},update(v){updates.push(v);return this},then(resolve){return Promise.resolve({}).then(resolve)},async maybeSingle(){return {data:table==='profiles'?{role:'admin',pms_access_status:'active'}:table==='notification_templates'?{subject:'Cadastro {{guest_name}}',body_text:'{{guest_name}} · {{property_name}} · {{check_in}} a {{check_out}}',active:true}:table==='direct_booking_requests'?{id:request,invitation_id:invite,property_id:3,status:stale?'approved':'pending',full_name:'<Hóspede>',check_in:'2026-11-27',check_out:'2026-11-30'}:table==='direct_booking_invitations'?{created_by:ownerChanged?guest:owner}:{name:'Ville Amore'}}}})};
 const source=await readFile(new URL('../supabase/functions/direct-booking-mailer/index.ts',import.meta.url),'utf8');
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:{},require(name){if(name.startsWith('jsr:'))return{};if(name.startsWith('npm:'))return{createClient:()=>db};if(name.includes('email-format'))return{formatDate:d=>d};return{EmailProviderError:ProviderError,createEmailProvider:env=>({send:async message=>{sends.push({message,sandbox:env.get('EMAIL_SANDBOX')});if(failure)throw new ProviderError(failureCode,failureCode==='provider_temporary');return{provider:'brevo',messageId:'test-id'}}})}},Deno:{env:{get:k=>k==='SUPABASE_URL'?'https://'+(development?'pxfqmnhqodqyaaqeyjgr':'irxsaladqhbzhkoaclxy')+'.supabase.co':k==='EMAIL_FROM_ADDRESS'?'site@example.test':undefined},serve:fn=>handler=fn},Response,URL});
 return {call:k=>handler(new Request('https://example.test',{method:'POST',headers:{'x-direct-booking-review-key':k||key}})),sends,completions,updates};
}
test('email uses validated admin, links to exact PMS request, escapes content, and never changes approval',async()=>{
 const m=await mailer();await m.call();assert.equal(m.sends.length,1);const msg=m.sends[0].message;assert.equal(msg.to.email,'owner@example.test');assert.match(msg.text,new RegExp('reservas-diretas-admin.html\\?request='+request));assert.match(msg.html,/&lt;Hóspede&gt;/);assert.equal(msg.idempotencyKey,'mail-id');assert.equal(m.completions[0].p_sent,true);assert.equal(m.updates.some(x=>x.status==='approved'),false);
});
test('invalid credential and already reviewed/changed ownership cannot send; DEV sandbox is forced',async()=>{
 const bad=await mailer();assert.equal((await bad.call('b'.repeat(64))).status,401);assert.equal(bad.sends.length,0);
 for(const options of [{stale:true},{ownerChanged:true}]){const m=await mailer(options);await m.call();assert.equal(m.sends.length,0);assert.equal(m.updates[0].status,'cancelled');}
 const dev=await mailer({development:true});await dev.call();assert.equal(dev.sends[0].sandbox,'true');
});
test('temporary provider failure keeps alert retryable rather than marking it sent',async()=>{
 const m=await mailer({failure:true});const d=await(await m.call()).json();assert.equal(d.results[0].status,'failed');assert.equal(m.completions[0].p_sent,false);assert.equal(m.completions[0].p_error,'provider_temporary');
});

test('provider credential failure preserves the alert for recovery instead of losing it',async()=>{
 const m=await mailer({failure:true,failureCode:'brevo_http_401'});const d=await(await m.call()).json();assert.equal(d.results[0].status,'queued');assert.equal(m.completions.length,0);assert.equal(m.updates[0].status,'queued');assert.equal(m.updates[0].attempt_count,0);assert.ok(Date.parse(m.updates[0].send_after)>Date.now()+3500000);
});
