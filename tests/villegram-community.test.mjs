import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {JSDOM} from 'jsdom';
import {profileInput,guestInput,mentionHandles,communityPublic,communityOperation,avatarBytes} from '../supabase/functions/_shared/villegram-community.ts';
const owner='4069a585-7cc6-48ad-9263-567358a45c0c',other='11111111-1111-4111-8111-111111111111',staff='22222222-2222-4222-8222-222222222222',dev='https://pxfqmnhqodqyaaqeyjgr.supabase.co';
const draft={title:'Meu momento',caption:'Café no chalé',status:'published',property_id:1,media:[{kind:'photo',path:owner+'/'+other+'.webp'}],cover_index:0};
const db=new PGlite();
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;create table public.profiles(id uuid primary key,role text,pms_access_status text);create table public.properties(id bigint primary key);create table public.experience_products(id uuid primary key);create table public.stay_offers(id uuid primary key);create table public.reservations(id uuid primary key);create table storage.buckets(id text primary key,name text,public bool,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid,name text,bucket_id text);create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;create table public.audit_events(actor_user_id uuid,action text,entity_type text,entity_id uuid,new_value jsonb);`);
 for(const file of ['20261006170228_villegram_publications.sql','20261007033341_villegram_stay_selection.sql','20261007120738_villegram_guest_community.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 await db.exec(`insert into auth.users values('${owner}'),('${other}'),('${staff}');insert into properties values(1);insert into profiles values('${staff}','admin','active');insert into villegram_profiles(id,handle,display_name,is_public,can_post) values('${owner}','hospede','Nome público',true,true),('${other}','amiga','Amiga',true,true);`);
});after(()=>db.close());
test('guest sanitization cannot impersonate team, publish directly, store prices or use another owner media',()=>{
 const p=guestInput({...draft,source:'automatic',author_name:'Equipe',featured:true,offer_id:other,stay_selection:{total_cents:1}},dev,owner);
 assert.equal(p.status,'pending_review');assert.equal(p.featured,false);assert.equal(p.offer_id,null);assert.equal(p.stay_selection,null);assert.equal(p.cta,'property');assert.equal(p.author_name,undefined);
 assert.throws(()=>guestInput({...draft,media:[{kind:'photo',path:other+'/'+owner+'.webp'}]},dev,owner),/invalid_media_owner/);
 assert.throws(()=>guestInput({...draft,media:[{kind:'photo',url:'assets/photo.webp'}]},dev,owner),/invalid_media_owner/);
 assert.equal(guestInput({...draft,property_id:null},dev,owner).cta,'dates');
});
test('public profile fields are explicit and mentions are bounded',()=>{
 assert.deepEqual(profileInput({handle:'@Maria_1',display_name:'Maria',bio:'Olá',is_public:true,email:'secret',document:'secret',can_post:true}),{handle:'maria_1',display_name:'Maria',bio:'Olá',is_public:true,avatar_path:null});
 assert.throws(()=>profileInput({handle:'admin',display_name:'Nome',is_public:true}),/invalid_profile/);
 assert.deepEqual(mentionHandles(['@amiga','amiga']),['amiga']);assert.throws(()=>mentionHandles(Array(11).fill('abc')),/invalid_mentions/);
});
test('community tables and privileged RPCs deny direct client writes; own profile read uses RLS',async()=>{
 for(const role of ['anon','authenticated'])for(const table of ['villegram_profiles','villegram_follows','villegram_mentions','villegram_notifications','villegram_invites'])assert.equal((await db.query(`select has_table_privilege($1,$2,'INSERT') as allowed`,[role,table])).rows[0].allowed,false);
 for(const role of ['anon','authenticated'])for(const fn of ['villegram_accept_invite(uuid,text)','villegram_save_guest(uuid,uuid,timestamptz,jsonb,uuid[])','villegram_moderate(uuid,uuid,timestamptz,text,text)'])assert.equal((await db.query(`select has_function_privilege($1,$2,'EXECUTE') as allowed`,[role,fn])).rows[0].allowed,false);
 await db.exec(`set test.uid='${owner}';set role authenticated;`);assert.equal((await db.query('select handle from villegram_profiles')).rows.length,1);await db.exec('reset role');
});
let saved;
test('guest save, moderation, notifications, mentions, edits and ownership execute atomically in Postgres',async()=>{
 const p=guestInput(draft,dev,owner);
 saved=(await db.query('select villegram_save_guest($1,null,null,$2,$3) as p',[owner,JSON.stringify(p),[other]])).rows[0].p;
 assert.equal(saved.status,'pending_review');assert.equal(saved.source,'guest_submission');assert.equal(saved.author_id,owner);
 assert.equal((await db.query('select count(*)::int as n from villegram_notifications')).rows[0].n,0);
 await assert.rejects(db.query('select villegram_moderate($1,$2,$3,$4,$5)',[other,saved.id,saved.updated_at,'published','']),/admin_required/);
 await db.query('select villegram_moderate($1,$2,$3,$4,$5)',[staff,saved.id,saved.updated_at,'published','']);
 let row=(await db.query('select * from villegram_publications where id=$1',[saved.id])).rows[0];assert.equal(row.status,'published');
 assert.deepEqual((await db.query('select kind from villegram_notifications order by kind')).rows.map(n=>n.kind),['mention','published']);
 await db.query("update villegram_mentions set status='accepted' where publication_id=$1",[saved.id]);
 await assert.rejects(db.query('select villegram_save_guest($1,$2,$3,$4,$5)',[other,row.id,row.updated_at,JSON.stringify(p),[]]),/edit_conflict/);
 const edited=(await db.query('select villegram_save_guest($1,$2,$3,$4,$5) as p',[owner,row.id,row.updated_at,JSON.stringify({...p,caption:'Legenda revisada'}),[other]])).rows[0].p;
 assert.equal(edited.status,'pending_review');assert.equal(edited.published_at,null);assert.equal((await db.query('select status from villegram_mentions where publication_id=$1',[row.id])).rows[0].status,'pending');
 await assert.rejects(db.query('select villegram_save_guest($1,$2,$3,$4,$5)',[owner,row.id,row.updated_at,JSON.stringify(p),[]]),/edit_conflict/);
 await db.query('select villegram_moderate($1,$2,$3,$4,$5)',[staff,edited.id,edited.updated_at,'archived','Solicitar autorização de imagem']);
 assert.equal((await db.query('select moderation_reason from villegram_publications where id=$1',[saved.id])).rows[0].moderation_reason,'Solicitar autorização de imagem');
});
test('follow and like retries do not duplicate notifications',async()=>{
 for(let i=0;i<2;i++)await db.query('insert into villegram_follows(follower_id,followed_id) values($1,$2) on conflict do nothing',[other,owner]);
 assert.equal((await db.query("select count(*)::int as n from villegram_notifications where kind='follow'")).rows[0].n,1);
 await db.query("update villegram_publications set status='published',published_at=now() where id=$1",[saved.id]);
 for(let i=0;i<2;i++)await db.query('insert into villegram_post_likes(publication_id,user_id) values($1,$2) on conflict do nothing',[saved.id,other]);
 assert.equal((await db.query("select count(*)::int as n from villegram_notifications where kind='like'")).rows[0].n,1);
 await db.query('delete from villegram_post_likes where publication_id=$1 and user_id=$2',[saved.id,other]);await db.query('insert into villegram_post_likes(publication_id,user_id) values($1,$2)',[saved.id,other]);
 assert.equal((await db.query("select count(*)::int as n from villegram_notifications where kind='like'")).rows[0].n,1);
});
test('invites are single-use, expire and cannot be self-redeemed',async()=>{
 const hash='a'.repeat(64);await db.query("insert into villegram_invites(inviter_id,token_hash,expires_at) values($1,$2,now()+interval '7 days')",[owner,hash]);
 await assert.rejects(db.query('select villegram_accept_invite($1,$2)',[owner,hash]),/invalid_invite/);
 await db.query('select villegram_accept_invite($1,$2)',[other,hash]);
 await assert.rejects(db.query('select villegram_accept_invite($1,$2)',[staff,hash]),/invalid_invite/);
 await db.query("insert into villegram_invites(inviter_id,token_hash,expires_at) values($1,$2,now()-interval '1 second')",[owner,'b'.repeat(64)]);
 await assert.rejects(db.query('select villegram_accept_invite($1,$2)',[other,'b'.repeat(64)]),/invalid_invite/);
});
test('anonymous callers cannot mutate community and non-admin cannot moderate',async()=>{
 const args={db:{},body:{},op:'guest_save',u:null};assert.equal((await communityOperation(args)).status,401);assert.equal((await communityOperation({...args,u:{id:owner,is_anonymous:true}})).status,401);assert.equal((await communityOperation({...args,u:{id:owner},op:'community_moderate'})).status,403);
});
test('public feed excludes disabled guest profiles and only projects accepted public mentions',async()=>{
 const data={villegram_profiles:[{id:owner,handle:'hospede',display_name:'Nome público',is_public:true}],villegram_mentions:[{publication_id:owner,user_id:owner,status:'accepted'}]};
 const mock={from(t){let rows=data[t]||[];return {select(){return this},in(k,v){rows=rows.filter(r=>v.includes(r[k]));return this},eq(k,v){rows=rows.filter(r=>r[k]===v);return this},then(fn){return Promise.resolve({data:rows}).then(fn)}}}};
 const result=await communityPublic(mock,[{id:owner,source:'guest_submission',author_id:owner},{id:other,source:'guest_submission',author_id:other},{id:staff,source:'automatic'}]);
 assert.equal(result.length,2);assert.equal(result[0].author_name,'Nome público');assert.deepEqual(result[0].mentions,[{handle:'hospede',display_name:'Nome público'}]);
});
test('account defaults to community but charge links and reservations tab preserve private flow',async()=>{
 for(const query of ['','?charge=example','#reservas']){const dom=new JSDOM(await readFile(new URL('../conta.html',import.meta.url),'utf8'),{url:dev+'/conta.html'+query,runScripts:'outside-only'});dom.window.eval(await readFile(new URL('../account-navigation.js',import.meta.url),'utf8'));const d=dom.window.document;assert.equal(d.querySelector('#account-private').hidden,!query);assert.ok(d.querySelector('#account-private #reservation-list'));assert.ok(d.querySelector('#account-private #profile-form'));d.querySelector('[data-account-mode="private"]').click();assert.equal(d.querySelector('#account-private').hidden,false);assert.equal(d.querySelector('#community-root').hidden,true);dom.window.close()}
});

test('private storage only permits own paths and requires guest eligibility for video',async()=>{
 await db.exec(`grant usage on schema auth,storage to authenticated;grant select on profiles to authenticated;grant select,insert on storage.objects to authenticated;alter table storage.objects enable row level security;update villegram_profiles set can_post=false where id='${owner}';set test.uid='${owner}';set role authenticated;`);
 try{
  await db.query("insert into storage.objects(name,bucket_id) values($1,'villegram-media')",[owner+'/'+other+'.webp']);
  await assert.rejects(db.query("insert into storage.objects(name,bucket_id) values($1,'villegram-media')",[other+'/'+owner+'.webp']),/row-level security/);
  await assert.rejects(db.query("insert into storage.objects(name,bucket_id) values($1,'villegram-media')",[owner+'/'+other+'.mp4']),/row-level security/);
 }finally{await db.exec(`reset role;update villegram_profiles set can_post=true where id='${owner}'`)}
});

const tick=()=>new Promise(r=>setTimeout(r,20));
async function communityPage(file,query,responses){const dom=new JSDOM(await readFile(new URL('../'+file,import.meta.url),'utf8'),{url:dev+'/'+file+query,runScripts:'outside-only'}),w=dom.window,calls=[];w.CHALEZINHO_CONFIG={supabaseUrl:dev,supabaseKey:'public-key'};w.AbortSignal.timeout=()=>undefined;w.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'test',user:{id:owner}}}})}})};w.fetch=async(_url,opts)=>{const b=JSON.parse(opts.body);calls.push(b);return {ok:true,json:async()=>({ok:true,...await responses(b)})}};w.URL.revokeObjectURL=()=>{};w.URL.createObjectURL=()=>"blob:avatar";w.eval(await readFile(new URL('../villegram-community.js',import.meta.url),'utf8'));await tick();return {dom,w,calls}}

test('public profile follows and unfollows through explicit actions; public text is escaped',async()=>{
 let following=false;const {dom,w,calls}=await communityPage('villegram-perfil.html','?perfil=amiga',b=>{if(b.operation==='community_follow'){following=b.following;return {}}return {profile:{id:other,handle:'amiga',display_name:'<script>bad</script>',bio:'Viagem'},followers:following?1:0,following:0,is_following:following,is_self:false,publications:[]}});
 assert.equal(w.document.querySelector('#community-public-profile script'),null);assert.equal(w.document.querySelector('#community-follow').textContent,'Seguir');w.document.querySelector('#community-follow').click();await tick();assert.equal(following,true);assert.equal(w.document.querySelector('#community-follow').getAttribute('aria-pressed'),'true');w.document.querySelector('#community-follow').click();await tick();assert.equal(following,false);assert.deepEqual(calls.filter(c=>c.operation==='community_follow').map(c=>c.following),[true,false]);dom.window.close();
});

test('Meu Villegram saves opt-in profile, accepts mentions, reads notifications and creates companion link',async()=>{
 const state={profile:{id:owner,handle:'hospede',display_name:'Nome público',bio:'',is_public:true},allowed:true,publications:[],notifications:[{id:other,kind:'mention',created_at:new Date().toISOString(),read_at:null,actor:{handle:'amiga',display_name:'Amiga'}}],mentions:[{id:other,title:'Foto',author_name:'Amiga',mention_status:'pending'}],invites:[]};
 const {dom,w,calls}=await communityPage('conta.html','',b=>{if(b.operation==='community_me')return state;if(b.operation==='community_save_profile'){state.profile={...state.profile,...b.profile};return {profile:state.profile}}if(b.operation==='community_mention'){state.mentions[0].mention_status=b.status;return {}}if(b.operation==='community_read'){state.notifications[0].read_at=new Date().toISOString();return {}}if(b.operation==='community_invite')return {token:owner+other};return {}}),d=w.document;
 assert.match(d.querySelector('#community-profile-card').textContent,/Nome público/);d.querySelector('#community-edit-profile').click();const f=d.querySelector('#community-profile-form');f.elements.display_name.value='Novo nome';f.requestSubmit();await tick();assert.equal(state.profile.display_name,'Novo nome');assert.equal(calls.find(c=>c.operation==='community_save_profile').profile.email,undefined);
 d.querySelector('[data-community-tab="mentions"]').click();d.querySelector('[data-tag="accepted"]').click();await tick();assert.equal(state.mentions[0].mention_status,'accepted');assert.match(d.querySelector('#community-mentions').textContent,/Marcação aceita/);
 d.querySelector('[data-community-tab="activity"]').click();d.querySelector('#community-mark-read').click();await tick();assert.equal(d.querySelector('#community-notification-count').textContent,'');
 d.querySelector('[data-community-tab="people"]').click();d.querySelector('#community-invite-create').click();await tick();assert.equal(d.querySelector('#community-invite-result').hidden,false);assert.equal(new URL(d.querySelector('#community-invite-link').value).searchParams.get('convite'),owner+other);dom.window.close();
});

test('public people API awaits database builders and returns safe fields; service errors stay failures',async()=>{
 const person={id:owner,handle:'hospede',display_name:'Nome público',bio:'Olá',avatar_path:'private/path',is_public:true};
 function database(error=null){return {from(){return {select(){return this},eq(){return this},ilike(){return this},order(){return this},limit(){return this},then(resolve){return Promise.resolve({data:[person],error}).then(resolve)}}}};}
 const result=await communityOperation({db:database(),u:null,op:'community_people',body:{search:'hosp'},isAdmin:false});assert.equal(result.status,200);assert.equal(result.body.people[0].handle,'hospede');assert.equal(result.body.people[0].avatar_path,undefined);assert.equal(result.body.people[0].is_public,undefined);
 await assert.rejects(communityOperation({db:database({message:'unavailable'}),u:null,op:'community_people',body:{search:'hosp'}}),/community_unavailable/);
});

test('profile accepts @ and uppercase before native validation, normalizes the API value and explains avatar eligibility',async()=>{
 const state={profile:null,allowed:false,publications:[],notifications:[],mentions:[],invites:[]};
 const {dom,w,calls}=await communityPage('conta.html','',b=>{if(b.operation==='community_save_profile'){state.profile={id:owner,...b.profile};return {profile:state.profile}}return state});
 const d=w.document,f=d.querySelector('#community-profile-form'),handle=f.elements.handle;
 assert.equal(d.querySelector('#community-avatar-file').disabled,false);
 f.elements.display_name.value='Rolds';f.elements.bio.value='Minha viagem';f.elements.is_public.checked=true;
 for(const value of ['@Rolds','Rolds','rolds','@a12345678901234567890123']){handle.value=value;assert.equal(f.checkValidity(),true,value)}
 for(const value of ['@ab','@1rolds','@@rolds','nome com espaço','a1234567890123456789012345']){handle.value=value;assert.equal(f.checkValidity(),false,value)}
 handle.value=' @Rolds ';handle.dispatchEvent(new w.Event('blur'));assert.equal(handle.value,'rolds');
 handle.value='@Rolds';f.requestSubmit();await tick();
 assert.equal(calls.find(c=>c.operation==='community_save_profile').profile.handle,'rolds');
 assert.equal(d.querySelector('#community-avatar-file').disabled,false);assert.match(d.querySelector('#community-avatar-help').textContent,/Tudo será salvo/);
 dom.window.close();
});

test('avatar crop waits for the single profile save and account opens in Watch, not own posts',async()=>{
 const state={profile:{id:owner,handle:'hospede',display_name:'Hóspede',is_public:true},allowed:true,publications:[],notifications:[],mentions:[],invites:[]};
 const {dom,w,calls}=await communityPage('conta.html','',b=>{if(b.operation==='community_save_profile'){state.profile={...state.profile,...b.profile};return {profile:state.profile}}return state});const d=w.document;
 assert.equal(d.querySelector('[data-community-panel=watch]').hidden,false);assert.equal(d.querySelector('[data-community-panel=moments]').hidden,true);assert.match(d.querySelector('iframe').src,/view=reels&embed=community/);
 d.querySelector('#community-edit-profile').click();const f=d.querySelector('#community-profile-form');w.VillegramAvatar={crop:async()=>new w.Blob(['RIFFtestWEBPtest'],{type:'image/webp'})};const input=d.querySelector('#community-avatar-file');Object.defineProperty(input,'files',{value:[new w.File(['image'],'test.jpg',{type:'image/jpeg'})]});input.dispatchEvent(new w.Event('change'));await tick();
 assert.equal(calls.some(c=>c.operation==='community_save_profile'),false);assert.equal(d.querySelector('#community-avatar-pending').hidden,false);assert.ok(input.compareDocumentPosition(f.querySelector('[type=submit]')) & w.Node.DOCUMENT_POSITION_FOLLOWING);
 f.requestSubmit();await tick();await tick();assert.equal(calls.filter(c=>c.operation==='community_save_profile').length,1);assert.equal(calls.find(c=>c.operation==='community_save_profile').profile.avatar_data,w.btoa('RIFFtestWEBPtest'));assert.equal(d.querySelector('#community-avatar-pending').hidden,true);
 d.querySelector('[data-community-tab=moments]').click();assert.equal(d.querySelector('[data-community-panel=watch]').hidden,true);dom.window.close();
});

test('avatar server validates size/type, derives own path, and removes upload if profile save fails',async()=>{
 const data=btoa('RIFF0000WEBP0000');assert.equal(avatarBytes(data).length,16);for(const input of ['x',btoa('<svg>bad</svg>'),'a'.repeat(1400001)])assert.throws(()=>avatarBytes(input),/invalid_avatar/);
 const uploaded=[],removed=[],written=[];
 function database(fail=false){return {
  from(table){return {select(){return this},eq(){return this},limit(){return this},maybeSingle(){return this},upsert(v){this.write=v;written.push(v);return this},single(){return this},then(resolve){return Promise.resolve(table==='reservations'||table==='villegram_invites'?{data:[],error:null}:this.write?{data:this.write,error:fail?{code:'23505'}:null}:{data:null,error:null}).then(resolve)}}},
  storage:{from(){return {upload:async(path,bytes)=>{uploaded.push({path,bytes});return {error:null}},remove:async paths=>{removed.push(...paths);return {error:null}}}}}
 };}

 const body={profile:{handle:'novo',display_name:'Novo',bio:'',is_public:true,avatar_data:data,avatar_path:other+'/foreign.webp'}};
 const result=await communityOperation({db:database(),u:{id:owner},op:'community_save_profile',body,isAdmin:false});assert.equal(result.status,200);assert.ok(uploaded[0].path.startsWith(owner+'/'));assert.equal(written[0].avatar_path,uploaded[0].path);assert.equal(removed.length,0);
 const failed=await communityOperation({db:database(true),u:{id:owner},op:'community_save_profile',body,isAdmin:false});assert.equal(failed.body.error,'handle_taken');assert.equal(removed[0],uploaded[1].path);
});

test('profile Trips group by month and day in Brazil, retain dates and edit destinations',async()=>{
 const posts=[
  {id:'old',title:'Setembro',status:'published',published_at:'2026-10-01T01:00:00Z',created_at:'2026-09-01T12:00:00Z'},
  {id:'new',title:'Outubro',status:'published',published_at:'2026-10-09T12:00:00Z'},
  {id:'draft',title:'Rascunho',status:'draft',created_at:'2026-10-09T14:00:00Z'},
  {id:'missing',title:'Sem data',status:'archived'}
 ];
 const state={profile:null,allowed:false,publications:posts,notifications:[],mentions:[],invites:[]};
 const {dom,w}=await communityPage('conta.html','',()=>state),d=w.document;
 assert.deepEqual([...d.querySelectorAll('.community-tile-title')].map(n=>n.textContent),['Rascunho','Outubro','Setembro','Sem data']);
 assert.deepEqual([...d.querySelectorAll('.community-month')].map(n=>n.textContent),['outubro de 2026','setembro de 2026','Sem data registrada']);
 assert.equal(d.querySelectorAll('.community-day').length,3);
 assert.deepEqual([...d.querySelectorAll('time.community-post-date')].map(n=>n.textContent),['Criado em 09/10/2026','Publicado em 09/10/2026','Publicado em 30/09/2026']);
 assert.match(d.querySelector('.community-tile>a').href,/mode=guest&edit=draft/);
 assert.equal(d.querySelectorAll('.community-edit').length,4);
 assert.equal(posts[0].id,'old','input order remains intact');
 dom.window.close();
});
