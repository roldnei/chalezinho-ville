import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM,VirtualConsole} from 'jsdom';
function setup({missing=false,storageError=false,login=async()=>({error:{name:'AuthRetryableFetchError',message:'Failed to fetch'}})}={}){
 const w=new JSDOM(readFileSync('auth.html','utf8'),{url:'https://dev.example/auth.html?mode=login&return=admin.html',runScripts:'outside-only',virtualConsole:new VirtualConsole()}).window;
 w.fetch=async()=>({ok:true});w.CHALEZINHO_CONFIG={supabaseUrl:'https://example.supabase.co',supabaseKey:'test',bookingEngine:'https://example/engine'};
 w.VilleSession={remembered:()=>false,choose(){if(storageError)throw Object.assign(new Error(),{name:'SecurityError'})}};
 if(!missing)w.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),signInWithPassword:login}})};
 w.eval(readFileSync('auth-bootstrap.js','utf8'));w.eval(readFileSync('auth.js','utf8'));return w;
}
const submit=w=>{const e=new w.Event('submit',{bubbles:true,cancelable:true});w.document.querySelector('#pane-login').dispatchEvent(e);return e};
const settle=()=>new Promise(r=>setTimeout(r,0));
test('missing login dependency disables submission and prevents silent native reload',()=>{const w=setup({missing:true});try{assert.equal(w.document.querySelector('#pane-login button[type=submit]').disabled,true);assert.match(w.document.querySelector('#auth-message').textContent,/não foram enviados/);assert.equal(submit(w).defaultPrevented,true);assert.match(w.location.search,/return=admin.html/)}finally{w.close()}});
test('network failure preserves fields and return target and allows a deliberate retry',async()=>{const w=setup();try{w.document.querySelector('#login-email').value='qa@example.test';w.document.querySelector('#login-password').value='fixture-only';assert.equal(submit(w).defaultPrevented,true);await settle();assert.equal(w.document.querySelector('#login-email').value,'qa@example.test');assert.equal(w.document.querySelector('#login-password').value,'fixture-only');assert.match(w.document.querySelector('#auth-message').textContent,/senha ainda não foi validada/);assert.equal(w.document.querySelector('#pane-login button[type=submit]').disabled,false);assert.match(w.location.search,/return=admin.html/)}finally{w.close()}});
test('double submission produces one login attempt and no session means no navigation',async()=>{let calls=0,release;const pending=new Promise(r=>release=r);const w=setup({login:async()=>{calls++;return pending}});try{submit(w);submit(w);assert.equal(calls,1);release({data:{session:null}});await settle();assert.match(w.document.querySelector('#auth-message').textContent,/não retornou uma sessão/);assert.match(w.location.pathname,/auth.html/)}finally{w.close()}});
test('blocked storage is reported without submitting credentials or reloading',async()=>{let calls=0;const w=setup({storageError:true,login:async()=>{calls++}});try{assert.equal(submit(w).defaultPrevented,true);await settle();assert.equal(calls,0);assert.match(w.document.querySelector('#auth-message').textContent,/armazenamento/);assert.equal(w.document.querySelector('#pane-login button[type=submit]').disabled,false)}finally{w.close()}});
