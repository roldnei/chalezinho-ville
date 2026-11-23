import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite(),admin='10000000-0000-4000-8000-000000000001',guest='10000000-0000-4000-8000-000000000002',other='10000000-0000-4000-8000-000000000003',staff='10000000-0000-4000-8000-000000000004';
const one=async(q,p=[])=>(await db.query(q,p)).rows[0];
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table public.properties(id bigint primary key);insert into properties values(1),(2);
 create table public.profiles(id uuid primary key,role text,pms_access_status text,full_name text,phone text,updated_at timestamptz);
 insert into auth.users values('${admin}'),('${guest}'),('${other}'),('${staff}');insert into profiles(id,role,pms_access_status) values('${admin}','admin','active'),('${guest}','guest','active'),('${staff}','staff','active');
 create table public.ops_stays(id uuid primary key default gen_random_uuid(),property_id bigint,channel text,origin text,status text,check_in date,check_out date,guest_name text,guest_phone text,guests int,payment_origin text,created_by uuid,updated_by uuid,notes text,is_test boolean default false,reservation_id uuid);
 create table public.reservations(id uuid primary key default gen_random_uuid(),property_id bigint,status text,hold_expires_at timestamptz,check_in date,check_out date);
 create table public.pms_calendar_blocks(id uuid primary key default gen_random_uuid(),property_id bigint,status text,start_date date,end_date date);
 create table public.property_calendar_sources(id uuid primary key default gen_random_uuid(),enabled boolean default true,deleted_at timestamptz);
 create table public.ops_calendar_events(id uuid primary key default gen_random_uuid(),source_id uuid,property_id bigint,cancelled boolean default false,start_date date,end_date date,uid text);
 create schema private;grant usage on schema private to service_role;create table private.guest_identities(user_id uuid,document_type text,document_number text,issuing_country text);
 insert into private.guest_identities values('${guest}','cpf','QA-ONLY','BR'),('${other}','passport','QA-OTHER','US');
 create function public.guest_payment_identity(p_user_id uuid)returns table(document_type text,document_number text) language sql as $$select document_type,document_number from private.guest_identities where user_id=p_user_id$$;
 `);
 await db.exec(await readFile(new URL('../supabase/migrations/20261123173305_direct_booking_manual_approval.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/20261123175718_direct_guest_identification_complete.sql',import.meta.url),'utf8'));
});
after(()=>db.close());
let serial=0;
async function invite({start='2099-01-01',end='2099-01-04',stay=null}={}){serial++;return one("insert into direct_booking_invitations(token_hash,property_id,existing_stay_id,check_in,check_out,guests,total_cents,cancellation_terms,terms_snapshot,terms_hash,created_by)values($1,1,$2,$3,$4,2,183500,'Condições sintéticas para QA','{\"documents\":[{\"body\":\"QA\",\"version\":\"1\"}]}','terms-v1',$5) returning *",[serial.toString(16).padStart(64,'0'),stay,start,end,admin]);}
async function file(i,user=guest){return one("insert into direct_booking_attachments(invitation_id,user_id,storage_path,content_type,size_bytes,sha256)values($1,$2,$3,'image/png',10,'qa')returning *",[i.id,user,crypto.randomUUID()]);}
const body=i=>({invitation_id:i.id,full_name:'Pessoa Sintética QA',phone:'27999999999',check_in:i.check_in.toISOString().slice(0,10),check_out:i.check_out.toISOString().slice(0,10),guests:2,accepted:true,terms_hash:'terms-v1',verified_account:true,verified_email:'qa@example.invalid',photo_document:{type:'rg',number:'QA123456',issuer:'SSP',state:'ES'}});
const submit=async(i,overrides={},actor=guest)=>(await one('select direct_booking_submit($1,$2) as result',[actor,{...body(i),...overrides}])).result;
const review=async(id,overrides={},actor=admin)=>(await one('select direct_booking_review($1,$2) as result',[actor,{request_id:id,decision:'approve',payment_confirmed:true,payment_method:'pix',payment_reference:'QA manual check',external_checked_at:new Date().toISOString(),...overrides}])).result;
test('guest submission snapshots acceptance and identity without inventory or payments',async()=>{
 const i=await invite();const a=await file(i),r=await submit(i);assert.equal(r.status,'pending');assert.equal((await one('select count(*)::int n from ops_stays')).n,0);
 const stored=await one('select * from direct_booking_requests where id=$1',[r.id]);assert.equal(stored.identity_snapshot.document_number,'QA-ONLY');assert.equal(stored.identity_snapshot.issuing_country,'BR');assert.equal(stored.identity_snapshot.photo_document.number,'QA123456');const profile=await one('select full_name,phone,role from profiles where id=$1',[guest]);assert.equal(profile.full_name,'Pessoa Sintética QA');assert.equal(profile.phone,'27999999999');assert.equal(profile.role,'guest');assert.deepEqual(stored.attachment_ids,[a.id]);assert.ok(stored.accepted_at);assert.equal(stored.terms_snapshot.documents[0].body,'QA');
 assert.equal((await submit(i)).id,r.id);await assert.rejects(submit(i,{},other),/invitation_already_used/);
});
test('verified email, identity, attachment, explicit terms and exact proposed dates are mandatory',async()=>{
 const i=await invite();await assert.rejects(submit(i,{verified_account:false}),/verified_account_required/);await assert.rejects(submit(i,{},staff),/identity_required/);
 await assert.rejects(submit(i),/document_required/);await file(i);await assert.rejects(submit(i,{accepted:false}),/terms_acceptance_required/);await assert.rejects(submit(i,{terms_hash:'stale'}),/terms_acceptance_required/);await assert.rejects(submit(i,{check_out:'2099-01-05'}),/invitation_dates_changed/);
});
test('expired or revoked invitation cannot be claimed',async()=>{
 const i=await invite();await file(i);await db.query("update direct_booking_invitations set expires_at=now()-interval '1 day' where id=$1",[i.id]);await assert.rejects(submit(i),/invitation_expired/);await db.query('update direct_booking_invitations set revoked_at=now() where id=$1',[i.id]);await assert.rejects(submit(i),/invitation_unavailable/);
});
test('guest/staff cannot approve, manual payment is mandatory and missing calendars fail closed',async()=>{
 const i=await invite({start:'2099-02-01',end:'2099-02-04'});await file(i);const r=await submit(i);
 await assert.rejects(review(r.id,{},guest),/admin_required/);await assert.rejects(review(r.id,{},staff),/admin_required/);await assert.rejects(review(r.id,{payment_confirmed:false}),/manual_payment_confirmation_required/);await assert.rejects(review(r.id,{external_checked_at:null}),/calendar_check_required/);await assert.rejects(review(r.id,{payment_method:'previously_confirmed'}),/invalid_payment_method/);
 assert.equal((await one('select status from direct_booking_requests where id=$1',[r.id])).status,'pending');assert.equal((await one('select count(*)::int n from ops_stays')).n,0);
});
test('approval creates exactly one confirmed manual direct stay, suitable for existing iCal export',async()=>{
 const i=await invite({start:'2099-03-01',end:'2099-03-04'});await file(i);const r=await submit(i),out=await review(r.id);assert.equal(out.status,'approved');assert.equal((await review(r.id)).stay_id,out.stay_id);
 const s=await one('select * from ops_stays where id=$1',[out.stay_id]);assert.equal(s.channel,'direct');assert.equal(s.origin,'manual');assert.equal(s.status,'confirmed');assert.equal(s.reservation_id,null);assert.equal(s.check_out.toISOString().slice(0,10),'2099-03-04');
 const second=await invite({start:'2099-03-02',end:'2099-03-05'});await file(second);await assert.rejects(review((await submit(second)).id),/dates_unavailable/);
});
test('reservation, PMS block and external event conflicts are checked at final approval',async()=>{
 const i=await invite({start:'2099-04-01',end:'2099-04-04'});await file(i);const r=await submit(i);
 const block=await one("insert into pms_calendar_blocks(property_id,status,start_date,end_date)values(1,'active','2099-04-03','2099-04-05')returning id");await assert.rejects(review(r.id),/dates_unavailable/);await db.query("update pms_calendar_blocks set status='cancelled' where id=$1",[block.id]);
 const res=await one("insert into reservations(property_id,status,check_in,check_out)values(1,'confirmed','2099-04-01','2099-04-02')returning id");await assert.rejects(review(r.id),/dates_unavailable/);await db.query("update reservations set status='cancelled' where id=$1",[res.id]);
 const source=await one('insert into property_calendar_sources default values returning id');const ev=await one("insert into ops_calendar_events(source_id,property_id,start_date,end_date,uid)values($1,1,'2099-04-01','2099-04-02','external-event')returning id",[source.id]);await assert.rejects(review(r.id),/dates_unavailable/);await db.query('update ops_calendar_events set cancelled=true where id=$1',[ev.id]);assert.equal((await review(r.id)).status,'approved');
});
test('checkout adjacency is available; rejected requests never occupy inventory',async()=>{
 const i=await invite({start:'2099-04-04',end:'2099-04-06'});await file(i);assert.equal((await review((await submit(i)).id)).status,'approved');
 const reject=await invite({start:'2099-05-01',end:'2099-05-04'});await file(reject);const r=await submit(reject);await assert.rejects(review(r.id,{decision:'reject',note:''}),/review_note_required/);assert.equal((await review(r.id,{decision:'reject',note:'QA rejected'})).status,'rejected');assert.equal((await one("select count(*)::int n from ops_stays where check_in='2099-05-01'")).n,0);
});
test('existing stay remains confirmed while pending and approved without duplication or edits',async()=>{
 const s=await one("insert into ops_stays(property_id,channel,origin,status,check_in,check_out,guest_name)values(1,'direct','manual','confirmed','2099-06-01','2099-06-04','Original QA')returning *");const i=await invite({start:'2099-06-01',end:'2099-06-04',stay:s.id});await file(i);const r=await submit(i);
 assert.equal((await one('select status from ops_stays where id=$1',[s.id])).status,'confirmed');const count=(await one('select count(*)::int n from ops_stays')).n;
 assert.equal((await review(r.id,{payment_method:'previously_confirmed'})).stay_id,s.id);assert.equal((await one('select count(*)::int n from ops_stays')).n,count);assert.equal((await one('select guest_name from ops_stays where id=$1',[s.id])).guest_name,'Original QA');
});
test('snapshot and final review are immutable; invitation cannot change after acceptance',async()=>{
 const i=await invite({start:'2099-07-01',end:'2099-07-04'});await file(i);const r=await submit(i);
 await assert.rejects(db.query("update direct_booking_requests set terms_hash='new' where id=$1",[r.id]),/acceptance_is_immutable/);await assert.rejects(db.query("update direct_booking_invitations set terms_hash='new' where id=$1",[i.id]),/request_already_submitted/);await review(r.id);await assert.rejects(db.query("update direct_booking_requests set status='pending' where id=$1",[r.id]),/review_is_final/);
});
test('PII tables are not readable by anonymous or authenticated API roles',async()=>{
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from direct_booking_requests'),/permission denied/);await assert.rejects(db.query('select direct_booking_review($1,$2)',[admin,{}]),/permission denied/);await db.exec('reset role');}
 assert.equal((await one("select public from storage.buckets where id='direct-booking-documents'")).public,false);
});

test('service role can execute the invoker transaction without grants to private identities or auth users',async()=>{
 await db.exec("grant select on public.profiles,public.ops_calendar_events,public.property_calendar_sources to service_role;grant update on public.profiles to service_role;grant all on public.ops_stays,public.reservations,public.pms_calendar_blocks to service_role");
 const i=await invite({start:'2099-08-01',end:'2099-08-04'});await file(i);
 await db.exec('set role service_role');
 try{const r=await submit(i);assert.equal((await review(r.id)).status,'approved');}finally{await db.exec('reset role');}
});

test('photo never replaces typed identification and mismatched CIN/passport cannot be accepted',async()=>{
 const i=await invite({start:'2099-09-01',end:'2099-09-04'});await file(i);
 await assert.rejects(submit(i,{photo_document:null}),/photo_document_details_required/);
 await assert.rejects(submit(i,{photo_document:{type:'rg',number:'QA123456',issuer:'',state:''}}),/photo_document_details_required/);
 await assert.rejects(submit(i,{photo_document:{type:'cin',number:'12345678901'}}),/cin_must_match_cpf/);
 const p=await invite({start:'2099-10-01',end:'2099-10-04'});await file(p,other);
 await assert.rejects(submit(p,{photo_document:{type:'passport',number:'WRONG123'}},other),/passport_must_match_identity/);
 assert.equal((await one('select count(*)::int n from direct_booking_requests where invitation_id=$1',[i.id])).n,0);
});
