import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {assignment,homeEligible,phoneOS,safeDetails,summarizeMobile} from '../supabase/functions/_shared/mobile-entry-model.ts';
import {mobileEntryService} from '../supabase/functions/_shared/mobile-entry-service.ts';
const visitor='11111111-1111-4111-8111-111111111111';
test('assignment remains stable across reloads, separates baseline and balances a large deterministic sample',async()=>{
 assert.deepEqual(await assignment(visitor,'test'),await assignment(visitor,'test'));
 assert.notEqual((await assignment(visitor,'test')).id,(await assignment(visitor,'baseline')).id);
 let a=0;for(let i=0;i<2000;i++)if((await assignment('00000000-0000-4000-8000-'+String(i).padStart(12,'0'),'test')).variant==='A')a++;
 assert.ok(a>900&&a<1100,a);
});
test('only phone homepage entries qualify; explicit navigation and shared publications retain destinations',()=>{
 assert.equal(phoneOS('Mozilla iPhone Mobile'),'ios');assert.equal(phoneOS('Mozilla Android 15 Mobile'),'android');
 for(const ua of ['Windows Chrome','Mozilla iPad','Mozilla Android 15 Tablet'])assert.equal(phoneOS(ua),null);
 assert.equal(homeEligible('/','?utm_source=instagram',''),true);
 for(const [path,q,hash]of [['/index.html','?view=site',''],['/index.html','?publication=123',''],['/index.html','','#colecao'],['/chale-premium.html','','']])assert.equal(homeEligible(path,q,hash),false);
 assert.deepEqual(safeDetails({email:'secret@example.com',url:'?token=secret',guests:2,nights:2,rendered:'site'}),{guests:2,nights:2,rendered:'site'});
});
test('counts visitors once, retains failed delivery in denominator, separates cohorts and respects conversion windows',()=>{
 const p=[{id:'a',variant:'A',assigned_at:'2026-10-01T10:00:00Z'},{id:'a2',variant:'A',assigned_at:'2026-10-01T10:00:00Z'},{id:'b',variant:'B',assigned_at:'2026-10-09T10:00:00Z'},{id:'qa',variant:'B',excluded:true,assigned_at:'2026-10-01T10:00:00Z'}];
 const event=(id,name,date='2026-10-02T10:00:00Z')=>({participant_id:id,event_name:name,occurred_at:date});
 const events=[event('a','property_viewed'),event('a','property_viewed'),event('qa','property_viewed'),event('a','whatsapp_clicked','2026-10-09T10:00:00Z'),event('b','property_viewed','2026-10-09T11:00:00Z')];
 const outcomes=[{participant_id:'a',kind:'request_received',occurred_at:'2026-10-03T00:00:00Z'}];
 const r=summarizeMobile(p,events,outcomes,{attribution_days:7},new Date('2026-10-10T10:00:00Z'));
 assert.equal(r.groups.A.visitors,2);assert.equal(r.groups.A.counts.property_viewed,1);assert.equal(r.groups.A.rates.property_viewed,50);assert.equal(r.groups.A.counts.whatsapp_clicked,0);
 assert.equal(r.groups.B.visitors,1);assert.equal(r.groups.B.mature_visitors,0);assert.equal(r.groups.B.mature_rates.property_viewed,null);assert.equal(r.groups.A.counts.reservation_confirmed,0);assert.equal(r.groups.A.counts.request_received,1);assert.equal(r.verdict,'inconclusive');
});
function fakeDb(data){return {from(table){let rows=data[table]||[],single=false,mutation=null;const q={select(){return q},eq(k,v){rows=rows.filter(r=>r[k]===v);return q},gte(){return q},order(){return q},limit(n){rows=rows.slice(0,n);return q},range(a,b){rows=rows.slice(a,b+1);return q},single(){single=true;return q},maybeSingle(){single=true;return q},update(v){mutation=()=>rows.forEach(r=>Object.assign(r,v));return q},upsert(v){mutation=()=>{if(!data[table])data[table]=[];if(!data[table].some(r=>r.id===v.id))data[table].push(v)};return q},then(resolve){mutation?.();return Promise.resolve({data:single?rows[0]||null:rows,error:null}).then(resolve)}};return q}}}
const req=new Request('https://dev.example',{headers:{'user-agent':'Mozilla iPhone Mobile'}});
test('server rejects client-asserted commercial conversions and reserves reports/outcomes to an active admin',async()=>{
 const db=fakeDb({mobile_entry_experiments:[{id:'mobile-home-v1',status:'baseline',protocol:{}}]});
 await assert.rejects(()=>mobileEntryService(db,req,{operation:'report'}),/admin_required/);
 await assert.rejects(()=>mobileEntryService(db,req,{operation:'record_outcome'}),/admin_required/);
 await assert.rejects(()=>mobileEntryService(db,req,{operation:'event',visitor_id:visitor,participant_id:visitor,event_id:visitor,event_name:'reservation_confirmed'}),/invalid_event/);
});
test('authenticated team is excluded retroactively instead of joining the experiment',async()=>{
 const data={mobile_entry_experiments:[{id:'mobile-home-v1',status:'baseline',protocol:{}}],profiles:[{id:'staff',role:'staff',pms_access_status:'active'}],mobile_entry_participants:[{visitor_id:visitor,experiment_id:'mobile-home-v1',excluded:false}]};
 assert.equal((await mobileEntryService(fakeDb(data),req,{operation:'enroll',visitor_id:visitor},{id:'staff'})).excluded,true);
 assert.equal(data.mobile_entry_participants[0].excluded,true);
});
const script=readFileSync(new URL('../mobile-entry.js',import.meta.url),'utf8');
async function browser(url='https://site.example/',variant='baseline',status='baseline',ua='Mozilla iPhone Mobile'){
 const dom=new JSDOM('<a id="contact" href="https://wa.me/5593991592266?text=Oi">Contato</a>',{url,runScripts:'outside-only'}),w=dom.window,calls=[];
 Object.defineProperty(w.navigator,'userAgent',{value:ua});w.matchMedia=()=>({matches:true});w.AbortSignal=AbortSignal;
 Object.defineProperty(w,'innerWidth',{value:390});w.CHALEZINHO_CONFIG={supabaseUrl:'https://dev.example',environment:'development',whatsappNumber:'5593991592266',mobileEntryExperimentEnabled:true};
 w.fetch=async(_,options)=>{const body=JSON.parse(options.body);calls.push(body);return {ok:true,json:async()=>body.operation==='enroll'?{ok:true,participant:{id:visitor,variant,phase:variant==='baseline'?'baseline':'test',reference:'MV-0123456789AB'},experiment:{id:'mobile-home-v1',status}}:{ok:true}}};
 w.eval(script);await w.VilleMobileMeasurement.ready;return {dom,w,calls};
}
test('baseline never switches entry, reference follows contact, conversion claims are not emitted',async()=>{
 const {dom,w,calls}=await browser();assert.equal(await w.VilleMobileMeasurement.entry(),null);
 w.document.querySelector('#contact').dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true}));
 await new Promise(r=>setTimeout(r,5));assert.match(w.document.querySelector('#contact').href,/MV-0123456789AB/);
 assert.ok(calls.some(c=>c.event_name==='whatsapp_clicked'));assert.ok(!calls.some(c=>c.event_name==='request_received'||c.event_name==='reservation_confirmed'));dom.window.close();
});
test('B is delivered only during a running test on an eligible homepage; desktop sends nothing',async()=>{
 for(const [url,status,expected]of [['https://site.example/','running','B'],['https://site.example/?publication=123','running',null],['https://site.example/','paused',null]]){const {dom,w}=await browser(url,'B',status);assert.equal(await w.VilleMobileMeasurement.entry(),expected);dom.window.close()}
 const {dom,calls}=await browser('https://site.example/','B','running','Windows Chrome');assert.equal(calls.length,0);dom.window.close();
});
test('storage/privacy failures do not break browsing or allocate a new identity per page',async()=>{
 const {dom,w,calls}=await browser();Object.defineProperty(w.navigator,'globalPrivacyControl',{value:true});const before=calls.length;w.eval(script);await w.VilleMobileMeasurement.ready;assert.equal(calls.length,before);dom.window.close();
});
test('disabled split flag never delays or switches the mobile entry during calibration',async()=>{
 const {dom,w}=await browser('https://site.example/','B','running');
 w.CHALEZINHO_CONFIG.mobileEntryExperimentEnabled=false;
 assert.equal(await w.VilleMobileMeasurement.entry(),null);dom.window.close();
});

test('lost enrollment response retries the same visitor instead of counting a new visitor',async()=>{
 const {dom,w,calls}=await browser();let attempts=0;const ids=[];
 w.fetch=async(_,o)=>{const b=JSON.parse(o.body);ids.push(b.visitor_id);if(++attempts===1)throw Error('response lost');return {ok:true,json:async()=>({ok:true,participant:{id:visitor,variant:'baseline',phase:'baseline',reference:'MV-0123456789AB'},experiment:{status:'baseline'}})}};
 w.eval(script);assert.equal((await w.VilleMobileMeasurement.ready).phase,'baseline');assert.equal(attempts,2);assert.equal(ids[0],ids[1]);w.close();
});
