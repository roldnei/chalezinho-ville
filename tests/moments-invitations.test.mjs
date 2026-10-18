import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {JSDOM,VirtualConsole} from 'jsdom';
import {PGlite} from '@electric-sql/pglite';
const tick=()=>new Promise(r=>setTimeout(r,10));
const token='11111111-1111-4111-8111-11111111111122222222-2222-4222-8222-222222222222';
const target='conta.html?convite='+token+'#villegram';
function authPage({next=target,session=null,auth={}}={}){
 const dom=new JSDOM(readFileSync('auth.html','utf8'),{url:'https://preview.example/auth.html?mode=signup&return='+encodeURIComponent(next),runScripts:'outside-only',virtualConsole:new VirtualConsole()}),w=dom.window;
 const location={origin:w.location.origin,search:w.location.search,href:w.location.href};
 w.CHALEZINHO_CONFIG={supabaseUrl:'https://dev.supabase.co',supabaseKey:'fixture',environment:'development',bookingEngine:'https://dev.example/engine'};
 w.VilleSession={remembered:()=>false,choose(){}};
 w.VilleAuthBoot={ready(){w.document.querySelectorAll('button[type=submit]').forEach(b=>b.disabled=false)},fail(){assert.fail('Auth initialization failed')}};
 w.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session}}),...auth}})};
 runInNewContext(readFileSync('auth.js','utf8'),{window:w,document:w.document,location,URL,URLSearchParams,crypto,localStorage:w.localStorage,sessionStorage:w.sessionStorage,fetch:async()=>({ok:true}),setTimeout:w.setTimeout.bind(w)});
 for(const [id,value]of Object.entries({'signup-name':'Maria Silva','signup-email':'maria@example.invalid','signup-password':'fixture-only-123'}))w.document.getElementById(id).value=value;
 const submit=id=>w.document.getElementById(id).dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));
 return {w,location,submit,close:()=>w.close()};
}
test('admin invitation shares the same first-access link without collecting recipient email or sending a message',async()=>{
 const w=new JSDOM(readFileSync('villegram-admin.html','utf8'),{url:'https://preview.example/villegram-admin.html',runScripts:'outside-only'}).window;
 try{
  assert.equal(w.document.getElementById('vg-invite-tools').hidden,true);
  w.eval(readFileSync('villegram-invitations.js','utf8'));w.VilleMomentsInvites.setupAdmin();
  const link=new URL(w.document.getElementById('vg-invite-link').value),wa=new URL(w.document.getElementById('vg-invite-whatsapp').href);
  assert.equal(link.origin,'https://preview.example');assert.equal(link.pathname,'/auth.html');assert.equal(link.searchParams.get('mode'),'signup');assert.equal(link.searchParams.get('return'),'/conta.html?moments_invite=1');
  assert.equal(wa.origin,'https://wa.me');assert.ok(wa.searchParams.get('text').includes(link.href));assert.equal(wa.searchParams.has('phone'),false);
  assert.equal(w.document.getElementById('vg-invite-whatsapp').rel,'noopener noreferrer');
  let copied;Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async v=>{copied=v}}});w.document.getElementById('vg-invite-copy').click();await tick();assert.equal(copied,wa.searchParams.get('text'));
  w.navigator.clipboard.writeText=async()=>{throw Error('denied')};w.document.getElementById('vg-invite-copy').click();await tick();assert.match(w.document.getElementById('vg-invite-feedback').textContent,/copie o link/);
 }finally{w.close()}
});
test('WhatsApp first access registers name/email/password, confirms email, and returns to the exact companion invite',async()=>{
 let signup,verified;const p=authPage({auth:{signUp:async v=>{signup=v;return {data:{session:null},error:null}},verifyOtp:async v=>{verified=v;return {data:{session:{user:{id:'fixture'}}},error:null}}}});
 try{
  assert.equal(p.w.document.getElementById('signup-stay-details').disabled,true);assert.equal(p.w.document.getElementById('moments-invite-note').hidden,false);
  assert.equal(p.w.document.getElementById('pane-signup').checkValidity(),true);
  p.submit('pane-signup');await tick();assert.equal(signup.options.data.onboarding,'moments');assert.equal(signup.options.data.document_number,undefined);assert.equal(signup.options.data.phone,undefined);
  assert.equal(new URL(signup.options.emailRedirectTo).searchParams.get('next'),target);
  assert.equal(p.w.document.getElementById('pane-confirm').hidden,false);assert.ok(!p.location.href.endsWith(target));
  p.w.document.getElementById('confirmation-code').value='123456';p.submit('confirmation-code-form');await tick();assert.equal(verified.email,'maria@example.invalid');assert.equal(p.location.href,target);
 }finally{p.close()}
});
test('existing account login, active session, and recovery keep the invitation',async()=>{
 let recovery;
 const p=authPage({auth:{signInWithPassword:async()=>({data:{session:{user:{id:'fixture'}}}}),resetPasswordForEmail:async(_email,v)=>{recovery=v;return {error:null}}}});
 try{
  p.w.document.querySelector('[data-auth-mode=login]').click();p.w.document.getElementById('login-email').value='maria@example.invalid';p.w.document.getElementById('login-password').value='fixture-only-123';p.submit('pane-login');await tick();assert.equal(p.location.href,target);
  p.w.document.getElementById('recover-email').value='maria@example.invalid';p.submit('pane-recover');await tick();const reset=new URL(new URL(recovery.redirectTo).searchParams.get('next'),'https://preview.example');assert.equal(reset.searchParams.get('return'),target);
 }finally{p.close()}
 const active=authPage({session:{user:{id:'fixture'}}});try{await tick();assert.equal(active.location.href,target)}finally{active.close()}
});
test('lodging registration and unsafe or malformed invitations retain normal identity fields',()=>{
 for(const next of ['conta.html','https://untrusted.example/conta.html?moments_invite=1','conta.html?convite=invalid','admin.html?moments_invite=1']){
  const p=authPage({next});try{assert.equal(p.w.document.getElementById('signup-stay-details').disabled,false);p.submit('pane-signup');assert.equal(p.w.document.getElementById('pane-confirm').hidden,true)}finally{p.close()}
 }
 const general=authPage({next:'conta.html?moments_invite=1'});try{assert.equal(general.w.document.getElementById('signup-stay-details').disabled,true)}finally{general.close()}
});
test('email confirmation callback preserves invitation in another browser and failed confirmation login',async()=>{
 for(const confirmed of [false,true]){
  const w=new JSDOM(readFileSync('auth-callback.html','utf8'),{url:'https://preview.example/auth-callback.html?type=email&token_hash=fixture&next='+encodeURIComponent(target),runScripts:'outside-only'}).window,location={origin:w.location.origin,search:w.location.search,hash:'',pathname:w.location.pathname};let calls=0;
  try{
   w.CHALEZINHO_CONFIG={supabaseUrl:'https://dev.supabase.co',supabaseKey:'fixture'};w.supabase={createClient:()=>({auth:{verifyOtp:async()=>{calls++;return confirmed?{data:{session:{}}}:{error:{code:'otp_expired'}}}}})};
   runInNewContext(readFileSync('auth-callback.js','utf8'),{window:w,document:w.document,location,URL,URLSearchParams,history:{replaceState(){}}});await tick();assert.equal(calls,0);w.document.getElementById('callback-confirm').click();await tick();assert.equal(calls,1);
   if(confirmed)assert.equal(location.href,target);else assert.equal(new URL(w.document.getElementById('callback-login').href).searchParams.get('return'),target);
  }finally{w.close()}
 }
});
let db;
before(async()=>{
 db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,invited_at timestamptz,raw_app_meta_data jsonb default '{"provider":"email"}',raw_user_meta_data jsonb default '{}');create table public.profiles(id uuid,role text,pms_access_status text);create table public.pms_team_invitations(email text,status text,expires_at timestamptz,cancelled_at timestamptz,invited_user_id uuid,invited_by uuid);`);
 for(const name of ['20260927193000_guest_identity_signup.sql','20260927201000_guest_identity_checkout_guard.sql','20261013175230_cleaning_short_signup.sql','20261015193233_pms_invitation_identity_guard.sql','20261018001251_moments_short_signup.sql','20261018001251_moments_short_signup.sql'])await db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
});after(()=>db.close());
test('short Moments signup defers identity without satisfying lodging checkout or granting PMS access',async()=>{
 const id=crypto.randomUUID();await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[id,'moments@example.invalid',{onboarding:'moments',role:'admin'}]);
 assert.equal((await db.query('select guest_identity_present($1) v',[id])).rows[0].v,false);assert.equal((await db.query('select count(*)::int n from profiles where id=$1',[id])).rows[0].n,0);
 await assert.rejects(db.query('insert into auth.users(id,email) values($1,$2)',[crypto.randomUUID(),'stay@example.invalid']),/document_required/);
 await assert.rejects(db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[crypto.randomUUID(),'invalid@example.invalid',{onboarding:'moments',document_type:'cpf',document_number:'11111111111',issuing_country:'BR'}]),/invalid_document/);
 await db.exec('set role authenticated');try{await assert.rejects(db.query('select guest_identity_present($1)',[id]),/permission denied/)}finally{await db.exec('reset role')}
});
test('old account invitation links keep the token when an unauthenticated recipient is sent to registration',async()=>{
 for(const query of ['?convite='+token,'?moments_invite=1','']){
  const w=new JSDOM(readFileSync('conta.html','utf8'),{url:'https://preview.example/conta.html'+query+'#villegram',runScripts:'outside-only'}).window,location={origin:w.location.origin,search:w.location.search,hash:w.location.hash};
  try{
   w.CHALEZINHO_CONFIG={bookingEngine:'https://dev.example/engine',supabaseUrl:'https://dev.supabase.co',supabaseKey:'fixture'};w.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}})}})};
   runInNewContext(readFileSync('account.js','utf8'),{window:w,document:w.document,location,URL,URLSearchParams,crypto,localStorage:w.localStorage,sessionStorage:w.sessionStorage,setInterval:w.setInterval.bind(w),setTimeout:w.setTimeout.bind(w)});await tick();
   const auth=new URL(location.href,location.origin);assert.equal(auth.searchParams.get('mode'),query?'signup':'login');assert.equal(auth.searchParams.get('return'),'conta.html'+query+'#villegram');
  }finally{w.close()}
 }
});
