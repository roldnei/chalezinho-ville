import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {creditDatabase} from './support/finance-credit-db.mjs';
let db;const actor=randomUUID();
const one=async(sql,args=[]) => (await db.query(sql,args)).rows[0];
before(async()=>{db=await creditDatabase();
 await db.exec(await readFile(new URL('../supabase/migrations/20260929054951_finance_claim_guarantee_release.sql',import.meta.url),'utf8'));
 await db.query('insert into auth.users values($1)',[actor]);await db.query("insert into profiles values($1,'admin')",[actor]);});
after(async()=>db?.close());
async function fixture(status='cancelled'){
 const r=await one('insert into reservations(status) values($1) returning id',[status]);
 const g=await one("insert into guarantees(reservation_id,status,provider_authorization_id,amount_cents) values($1,'guaranteed','CHAR_RELEASE',50000) returning id",[r.id]);
 return {r:r.id,g:g.id};
}
const claim=(id,who=null)=>one('select claim_guarantee_release($1,$2) ready',[id,who]);
test('automatic release requires cancellation; manual release requires an administrator',async()=>{
 const f=await fixture('confirmed');assert.equal((await claim(f.g)).ready,false);
 await assert.rejects(claim(f.g,randomUUID()),/admin_required/);
 assert.equal((await claim(f.g,actor)).ready,true);
 assert.equal((await claim(f.g,actor)).ready,false);
});
test('an open reservation incident blocks release even without a guarantee link',async()=>{
 const f=await fixture();
 const i=await one("select (record_reservation_incident($1,null,$2,'damage','Dano em análise',1000,'[]',$3)).*",[f.r,actor,randomUUID()]);
 assert.equal((await claim(f.g)).ready,false);assert.equal((await claim(f.g,actor)).ready,false);
 await one("select decide_reservation_incident($1,$2,'no_charge')",[i.id,actor]);
 const attempts=await Promise.all([claim(f.g),claim(f.g)]);
 assert.equal(attempts.filter(x=>x.ready).length,1);
});
test('release cannot interrupt an approved capture or be called directly by a guest',async()=>{
 const f=await fixture();await db.query("update guarantees set status='capture_requested' where id=$1",[f.g]);
 assert.equal((await claim(f.g)).ready,false);
 await db.exec('set role authenticated');
 try{await assert.rejects(claim(f.g,actor),/permission denied/)}finally{await db.exec('reset role')}
});
