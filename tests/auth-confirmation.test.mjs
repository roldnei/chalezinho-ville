import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM,VirtualConsole} from 'jsdom';
const tick=()=>new Promise(r=>setTimeout(r,0));
function signup(signUp){
 const w=new JSDOM(readFileSync('auth.html','utf8'),{url:'https://qa.example/auth.html?mode=signup',runScripts:'outside-only',virtualConsole:new VirtualConsole()}).window;
 w.CHALEZINHO_CONFIG={supabaseUrl:'https://qa.supabase.co',supabaseKey:'fixture',bookingEngine:'https://qa.example/engine'};
 w.VilleSession={remembered:()=>false,choose(){}};w.fetch=async()=>({ok:true});
 w.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),signUp}})};
 w.eval(readFileSync('auth-bootstrap.js','utf8'));w.eval(readFileSync('auth.js','utf8'));
 for(const [id,value]of Object.entries({'signup-name':'Hóspede QA','signup-phone':'27900000000','signup-document-number':'11144477735','signup-email':'qa@example.test','signup-password':'fixture-only-123'}))w.document.getElementById(id).value=value;
 return w;
}
const submit=w=>w.document.getElementById('pane-signup').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
test('double signup sends once and success opens a visible confirmation page',async()=>{
 let release,calls=0;const pending=new Promise(r=>release=r),w=signup(async()=>{calls++;return pending});
 try{submit(w);submit(w);assert.equal(calls,1);release({data:{session:null},error:null});await tick();assert.equal(w.document.getElementById('pane-signup').hidden,true);assert.equal(w.document.getElementById('pane-confirm').hidden,false);assert.match(w.document.getElementById('confirmation-state').textContent,/enviado/);assert.equal(w.document.getElementById('confirmation-email').textContent,'qa@example.test');assert.equal(w.document.getElementById('confirmation-resend').disabled,true);assert.equal(w.sessionStorage.getItem('ville-signup-confirmation').includes('fixture-only'),false)}finally{w.close()}
});
test('email rate limit guides to the existing message without claiming a new send',async()=>{
 const w=signup(async()=>({data:null,error:{status:429,code:'over_email_send_rate_limit'}}));try{submit(w);await tick();assert.equal(w.document.getElementById('pane-confirm').hidden,false);assert.match(w.document.getElementById('confirmation-state').textContent,/já recebeu/);assert.doesNotMatch(w.document.getElementById('confirmation-state').textContent,/enviado/);assert.equal(w.document.getElementById('signup-email').value,'qa@example.test')}finally{w.close()}
});
function callback(search='',hash='',auth={}){
 const w=new JSDOM(readFileSync('auth-callback.html','utf8'),{url:'https://qa.example/auth-callback.html'+search+hash,runScripts:'outside-only',virtualConsole:new VirtualConsole()}).window;
 w.CHALEZINHO_CONFIG={supabaseUrl:'https://qa.supabase.co',supabaseKey:'fixture'};w.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),...auth}})};w.eval(readFileSync('auth-callback.js','utf8'));return w;
}
test('email preview does not consume the token; confirmation requires a deliberate click',async()=>{
 let calls=0;const w=callback('?token_hash=fixture&type=email','',{verifyOtp:async()=>{calls++;return {data:null,error:{code:'otp_expired'}}}});try{await tick();assert.equal(calls,0);assert.equal(w.document.getElementById('callback-confirm').hidden,false);w.document.getElementById('callback-confirm').click();await tick();assert.equal(calls,1);assert.match(w.document.getElementById('callback-status').textContent,/expirado/);assert.equal(w.document.getElementById('callback-login').hidden,false)}finally{w.close()}
});
test('callback without a token never claims that the email was confirmed',async()=>{
 const w=callback('?next=https://untrusted.example/');try{await tick();assert.doesNotMatch(w.document.getElementById('callback-status').textContent,/E-mail confirmado/);assert.match(w.document.getElementById('callback-login').href,/return=conta.html/)}finally{w.close()}
});
test('legacy email links restore the fragment session explicitly and remove tokens from the URL',async()=>{
 let received;const w=callback('','#access_token=fixture-access&refresh_token=fixture-refresh',{setSession:async v=>{received=v;return {error:null}},getSession:async()=>({data:{session:{user:{id:'fixture'}}}})});try{await tick();assert.deepEqual({...received},{access_token:'fixture-access',refresh_token:'fixture-refresh'});assert.equal(w.location.hash,'')}finally{w.close()}
});

test('signup uses one Create account action with visible terms and records the presented version',async()=>{
 let captured;const w=signup(async args=>{captured=args;return {data:{session:null},error:null}});
 try{const notice=w.document.getElementById('signup-terms');assert.match(notice.textContent,/Ao tocar em Criar conta/);assert.ok(notice.querySelector('a[href="termos-de-uso.html"]'));assert.equal(w.document.querySelector('#pane-signup button[type=submit]').textContent,'Criar conta');submit(w);await tick();assert.equal(captured.options.data.terms_version,'2026-10-22.1');assert.equal(captured.options.data.terms_acceptance_source,'signup_create_account');assert.equal(captured.options.data.marketing_opt_in,false)}finally{w.close()}
});
