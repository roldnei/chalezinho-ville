import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {creditDatabase} from './support/finance-credit-db.mjs';
import {guaranteeCoverage} from '../supabase/functions/_shared/finance/guarantee-lifecycle.ts';
let db;const guest=randomUUID(),manager=randomUUID();
const one=async(sql,args=[]) => (await db.query(sql,args)).rows[0];
before(async()=>{
 db=await creditDatabase();
 await db.exec(`
 create table properties(id bigint primary key,guarantee_amount_cents bigint default 50000,check_in_time time default '15:00',check_out_time time default '11:00',timezone text default 'America/Sao_Paulo');
 insert into properties(id) values(1);
 alter table reservations add user_id uuid,add property_id bigint default 1,add check_out date,add operational_status text;
 alter table guarantees add provider_order_id text,add provider_capture_before timestamptz,add provider_error_code text,
 add authorization_attempt integer default 0,add created_at timestamptz default now();
 create table guarantee_card_tokens(reservation_id uuid primary key references reservations,user_id uuid,card_token text,consented_at timestamptz);
 create table audit_events(id bigint generated always as identity,actor_user_id uuid,action text,entity_type text,entity_id text,new_value jsonb);
 `);
 await db.exec(await readFile(new URL('../supabase/migrations/20260929130207_finance_guarantee_authorization_history.sql',import.meta.url),'utf8'));
 for(const [id,role] of [[guest,'guest'],[manager,'admin']]){await db.query('insert into auth.users values($1)',[id]);await db.query('insert into profiles values($1,$2)',[id,role]);}
});
after(async()=>db?.close());
async function fixture({future=0,length=2,consent=false}={}){
 const r=await one("insert into reservations(user_id,check_in,check_out) values($1,current_date+$2::int,current_date+$2::int+$3::int) returning *",[guest,future,length]);
 const g=await one("insert into guarantees(reservation_id,status,provider,amount_cents) values($1,'pending','pagbank_sandbox',50000) returning *",[r.id]);
 await db.query("insert into guarantee_card_tokens(reservation_id,user_id,card_token,consented_at,renewal_consent) values($1,$2,'CARD_TEST',now(),$3)",[r.id,guest,consent]);
 return {r:r.id,g:g.id};
}
const claim=id=>one('select * from claim_guarantee_authorization($1)',[id]);
async function observe(a,status='AUTHORIZED',hours=144){
 await db.query("select observe_guarantee_authorization($1,$2,'ORDE_TEST',$3,50000,0,now()+make_interval(hours=>$4),null)",[a.id,'CHAR_'+a.id,status,hours]);
}
test('booking two months ahead stores token without authorizing',async()=>{
 const f=await fixture({future:60});assert.equal((await claim(f.g)).id,null);
 assert.equal((await one('select count(*)::int n from guarantee_authorizations where guarantee_id=$1',[f.g])).n,0);
});
test('long stay authorizes before check-in and preserves its actual deadline',async()=>{
 const f=await fixture({length:15,consent:true});const a=await claim(f.g);assert.ok(a.id);
 await observe(a);const g=await one('select * from guarantees where id=$1',[f.g]);assert.equal(g.status,'guaranteed');
 const coverage=guaranteeCoverage(g,{check_out:'2099-01-01'});assert.equal(coverage.active,true);assert.equal(coverage.covers_checkout,false);
 assert.equal((await claim(f.g)).id,null,'not renewed before renewal window');
});
test('claims serialize one bank authorization and unknown outcomes block new requests',async()=>{
 const f=await fixture();const results=await Promise.all([claim(f.g),claim(f.g)]);assert.equal(results.filter(x=>x.id).length,1);
 await db.query("update guarantee_authorizations set state='uncertain' where guarantee_id=$1",[f.g]);
 await db.query("update guarantees set next_action_at=now()-interval '1 hour' where id=$1",[f.g]);
 assert.equal((await claim(f.g)).id,null);
});
test('decline preserves confirmed booking and same card is never retried automatically',async()=>{
 const f=await fixture(),a=await claim(f.g);await observe(a,'DECLINED');
 assert.equal((await one('select status from reservations where id=$1',[f.r])).status,'confirmed');
 await db.query('update guarantees set next_action_at=now() where id=$1',[f.g]);assert.equal((await claim(f.g)).id,null);
 assert.equal((await one('select attention_code from guarantees where id=$1',[f.g])).attention_code,'authorization_declined');
 const key=randomUUID();await one('select claim_guarantee_card_update($1,$2,$3)',[f.g,guest,key]);
 await one("select save_guarantee_card($1,$2,$3,'CARD_REPLACED',true)",[f.g,guest,key]);
 assert.ok((await claim(f.g)).id,'a new consented card permits a bounded new attempt');
});
test('card replacement cannot cross owners, interrupt unknown authorization, or reuse the save claim',async()=>{
 const f=await fixture();await assert.rejects(one('select claim_guarantee_card_update($1,$2,$3)',[f.g,manager,randomUUID()]),/card_update_unavailable/);
 const key=randomUUID();await one('select claim_guarantee_card_update($1,$2,$3)',[f.g,guest,key]);
 assert.equal((await claim(f.g)).id,null,'token replacement locks authorization dispatch');
 await one("select save_guarantee_card($1,$2,$3,'CARD_REPLACED',false)",[f.g,guest,key]);
 await assert.rejects(one("select save_guarantee_card($1,$2,$3,'CARD_OTHER',true)",[f.g,guest,key]),/card_update_unavailable/);
 await claim(f.g);await assert.rejects(one('select claim_guarantee_card_update($1,$2,$3)',[f.g,guest,randomUUID()]),/authorization_in_progress|card_update_unavailable/);
});
test('renewal confirms new hold before allowing old hold release, with only one dispatch',async()=>{
 const f=await fixture({length:10,consent:true}),a=await claim(f.g);await observe(a,'AUTHORIZED',24);
 const b=await claim(f.g);assert.equal(b.purpose,'renewal');
 assert.equal((await one('select state from guarantee_authorizations where id=$1',[a.id])).state,'authorized');
 await observe(b,'AUTHORIZED',144);
 assert.equal((await one('select active_authorization_id from guarantees where id=$1',[f.g])).active_authorization_id,b.id);
 const release=()=>one('select claim_obsolete_authorization_release($1) ready',[a.id]);
 assert.equal((await release()).ready,true);assert.equal((await release()).ready,false);
 await observe(a,'CANCELED');
 assert.equal((await one('select state from guarantee_authorizations where id=$1',[a.id])).state,'released');
 assert.equal((await one('select status from guarantees where id=$1',[f.g])).status,'guaranteed');
});
test('renewal refusal retains old coverage and does not release it',async()=>{
 const f=await fixture({length:10,consent:true}),a=await claim(f.g);await observe(a,'AUTHORIZED',24);
 const b=await claim(f.g);await observe(b,'DECLINED');await observe(a,'AUTHORIZED',24);
 const g=await one('select * from guarantees where id=$1',[f.g]);assert.equal(g.active_authorization_id,a.id);assert.equal(g.attention_code,'authorization_declined');
 assert.equal((await one('select claim_obsolete_authorization_release($1) ready',[a.id])).ready,false);
});
test('provider observation preserves current authorization while an incident or capture is in progress',async()=>{
 const f=await fixture(),a=await claim(f.g);await observe(a);
 for(const status of ['incident_reported','capture_requested','release_requested']){
  await db.query('update guarantees set status=$2 where id=$1',[f.g,status]);await observe(a);
  assert.equal((await one('select state from guarantee_authorizations where id=$1',[a.id])).state,'authorized');
  assert.equal((await one('select status from guarantees where id=$1',[f.g])).status,status);
 }
});
test('old consent does not authorize an overlapping renewal',async()=>{
 const f=await fixture({length:10}),a=await claim(f.g);await observe(a,'AUTHORIZED',24);
 assert.equal((await claim(f.g)).id,null);
 assert.equal((await one('select attention_code from guarantees where id=$1',[f.g])).attention_code,'renewal_consent_required');
});
test('cancellation racing with provider confirmation cannot install a new active guarantee',async()=>{
 const f=await fixture(),a=await claim(f.g);await db.query("update reservations set status='cancelled' where id=$1",[f.r]);await observe(a);
 assert.equal((await one('select state from guarantee_authorizations where id=$1',[a.id])).state,'release_pending');
 assert.notEqual((await one('select status from guarantees where id=$1',[f.g])).status,'guaranteed');
 assert.equal((await one('select claim_obsolete_authorization_release($1) ready',[a.id])).ready,true);
});
test('date extension wakes renewal; moving stay far ahead releases obsolete hold',async()=>{
 const f=await fixture(),a=await claim(f.g);await observe(a,'AUTHORIZED',24);
 await db.query("update reservations set check_in=current_date+60,check_out=current_date+62 where id=$1",[f.r]);
 assert.equal((await one('select claim_guarantee_release($1,null) ready',[f.g])).ready,true);
 await observe(a,'CANCELED');assert.equal((await one('select status from guarantees where id=$1',[f.g])).status,'pending');
 assert.equal((await claim(f.g)).id,null);
});
test('check-in without coverage requires explicit audited host exception',async()=>{
 const f=await fixture();await assert.rejects(one('select check_in_with_guarantee($1,$2,null)',[f.r,manager]),/guarantee_check_in_exception_required/);
 await assert.rejects(one("select check_in_with_guarantee($1,$2,'Decisão registrada')",[f.r,guest]),/admin_required/);
 await one("select check_in_with_guarantee($1,$2,'Hospedagem liberada pelo responsável')",[f.r,manager]);
 const audit=await one("select new_value from audit_events where entity_id=$1 and action='reservation_check_in'",[f.r]);assert.equal(audit.new_value.guarantee_exception,true);
});
test('expired coverage cannot be presented as protected',()=>{
 const c=guaranteeCoverage({status:'guaranteed',provider_capture_before:'2026-01-01T00:00:00Z'},{check_out:'2026-01-10'},Date.parse('2026-01-02'));
 assert.equal(c.active,false);assert.equal(c.covers_checkout,false);assert.equal(c.expired,true);
});
test('authorization identities and service operations cannot be rewritten by guest',async()=>{
 const f=await fixture(),a=await claim(f.g);await observe(a);
 await assert.rejects(db.query("update guarantee_authorizations set provider_charge_id='CHAR_OTHER' where id=$1",[a.id]),/immutable/);
 await db.exec('set role authenticated');
 try{await assert.rejects(claim(f.g),/permission denied/);await assert.rejects(db.query('select * from guarantee_authorizations'),/permission denied/);}
 finally{await db.exec('reset role')}
});
