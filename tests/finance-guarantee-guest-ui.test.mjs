import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const html=await readFile(new URL('../conta.html',import.meta.url),'utf8');
const js=await readFile(new URL('../account.js',import.meta.url),'utf8');
const rid='10000000-0000-4000-8000-000000000001',gid='20000000-0000-4000-8000-000000000001';
async function setup(){
 const dom=new JSDOM(html,{url:'https://example.test/conta.html',runScripts:'outside-only'}),w=dom.window,calls=[];
 const reservation={id:rid,confirmation_code:'QA-CAUCAO',user_id:rid,status:'confirmed',check_in:'2099-10-01',check_out:'2099-10-10',created_at:'2026-09-29',guests:2,total_amount:1000,stay_amount:1000,properties:{name:'Chalé QA'},payments:[],guarantees:[{id:gid,status:'pending',amount_cents:50000,captured_amount_cents:0,attention_code:'authorization_declined'}]};
 w.CHALEZINHO_CONFIG={supabaseUrl:'https://example.test',supabaseKey:'fixture',bookingEngine:'/engine',guaranteeEngine:'/guarantee'};
 const dataFor=t=>t==='profiles'?{id:rid,full_name:'Hospede Teste',role:'guest'}:t==='reservations'?[reservation]:[];
 w.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'fixture',user:{id:rid,email:'qa@example.test'}}}})},from:t=>{
  const q={};for(const name of ['select','eq','order','in','limit'])q[name]=()=>q;
  q.then=resolve=>Promise.resolve({data:dataFor(t)}).then(resolve);q.maybeSingle=()=>Promise.resolve({data:dataFor(t)});return q;
 }})};
 w.fetch=async(_url,options)=>{const body=JSON.parse(options.body);calls.push(body);
  return {ok:true,json:async()=>body.action==='config'?{ok:true,payment_settings:{}}:body.action==='pagbank_sandbox_card_key'?{ok:true,public_key:'fixture-public-key'}:{ok:true,requests:[],cases:[],finance:{guarantees:[],payments:[],events:[]}}};
 };
 w.PagSeguro={encryptCard:input=>{assert.equal(input.number,'4111111111111111');assert.equal(input.securityCode,'123');return {encryptedCard:'encrypted-fixture-only-no-real-card'}}};
 w.eval(js);
 for(let i=0;i<40&&!w.document.querySelector('[data-guarantee-card]');i++)await new Promise(r=>setTimeout(r,5));
 return {dom,w,calls};
}
test('guest sees declined guarantee independently from confirmed reservation',async()=>{
 const {dom,w}=await setup();assert.match(w.document.body.textContent,/banco recusou a caução/);assert.match(w.document.body.textContent,/Sua reserva continua confirmada/);
 assert.ok(w.document.querySelector('[data-guarantee-card]'));dom.window.close();
});
test('replacement sends encrypted card, reservation-scoped ID and explicit renewal choice only',async()=>{
 const {dom,w,calls}=await setup();w.document.querySelector('[data-guarantee-card]').click();
 const form=w.document.querySelector('[aria-label="Atualizar cartão da caução"] form');assert.ok(form);
 const f=form.elements;assert.equal(f.renewal.checked,false,'renewal requires explicit opt-in');
 f.holder.value='Hospede Teste';f.number.value='4111111111111111';f.month.value='12';f.year.value='2026';f.cvv.value='123';f.consent.checked=true;f.renewal.checked=true;
 form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 for(let i=0;i<40&&!calls.some(x=>x.action==='replace_card');i++)await new Promise(r=>setTimeout(r,5));
 const sent=calls.find(x=>x.action==='replace_card');assert.ok(sent);assert.equal(sent.guarantee_id,gid);assert.equal(sent.renewal_consent,true);
 assert.equal(sent.encrypted_card,'encrypted-fixture-only-no-real-card');assert.equal(sent.consent,true);
 assert.ok(!JSON.stringify(calls).includes('4111111111111111'));assert.equal(f.number.value,'');assert.equal(f.cvv.value,'');dom.window.close();
});
