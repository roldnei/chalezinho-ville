import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const html=await readFile(new URL('../reservar.html',import.meta.url),'utf8');
const js=await readFile(new URL('../booking.js',import.meta.url),'utf8');
test('advancing unchanged experiences preserves the quoted price and original expiry',async()=>{
 const dom=new JSDOM(html,{url:'https://example.test/reservar.html?resume=1',runScripts:'outside-only'}),w=dom.window,calls=[];
 const session={access_token:'fixture',user:{id:'qa',email:'qa@example.test',user_metadata:{full_name:'Hospede QA'}}};
 w.CHALEZINHO_CONFIG={supabaseUrl:'https://example.test',supabaseKey:'fixture',bookingEngine:'/engine',environment:'development'};
 w.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session}}),getUser:async()=>({data:{user:session.user}})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null})})})})})};
 w.fetch=async(url,options)=>{const action=new URL(url,'https://example.test').searchParams.get('action');calls.push(action);return {ok:true,json:async()=>({ok:true,experience_products:[],travel_purposes:[]})};};
 const expiry=new Date(Date.now()+600000).toISOString();
 w.sessionStorage.setItem('chalezinho_booking_resume',JSON.stringify({property:{id:1,name:'QA'},selectedByProduct:{},rateCode:'non_refundable',check_in:'2099-10-01',check_out:'2099-10-03',guests:2,
 quote:{quote_id:'snapshot',expires_at:expiry,experiences:[],selected_variant_ids:[],rate_options:[{code:'non_refundable',selectable:true,quote_option_id:'option-snapshot',total_amount_cents:808}]}}));
 try{
  w.eval(js);for(let i=0;i<50&&w.document.querySelector('#checkout-panel').dataset.step!=='4';i++)await new Promise(r=>setTimeout(r,5));
  w.document.querySelector('#step-back').click();w.document.querySelector('#step-back').click();
  w.document.querySelector('#step-next').click();for(let i=0;i<50&&w.document.querySelector('#checkout-panel').dataset.step!=='3';i++)await new Promise(r=>setTimeout(r,5));
  assert.equal(w.document.querySelector('#checkout-panel').dataset.step,'3');
  assert.equal(calls.filter(x=>x==='quote').length,0,'no new price snapshot or renewed quote timer');
  assert.equal(w.document.querySelector('#checkout-error').textContent,'');
 }finally{dom.window.close()}
});
