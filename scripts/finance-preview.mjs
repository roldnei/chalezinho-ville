// Local visual fixture only. Never connects to Supabase or PagBank.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const rid='10000000-0000-4000-8000-000000000001',gid='20000000-0000-4000-8000-000000000001';
const qa={id:2,name:'Imóvel QA DEV local',code:'QA-DEV-LOCAL',active:true,features:{},updated_at:'v1',own_pricing:{mode:'own',weekdays_cents:[8000,8000,8000,8000,8000,10000,10000],periods:[],discounts:[]}};
const rules={min_nights:1,weekend_min_nights:1,max_nights:90,lead_days:0,same_day_cutoff:'18:00',preparation_days:0,window_months:12,checkin_days:[0,1,2,3,4,5,6],checkout_days:[0,1,2,3,4,5,6],custom_stays:[],use_pricelabs_min:false,allow_same_day_requests:false};
const hub={ok:true,properties:[{id:1,name:'Ville Essenza',code:'CH2',features:{}},qa],reservations:[{id:rid,property_id:1,guest_name:'Hóspede QA local',confirmation_code:'QA-189',status:'confirmed',check_in:'2026-10-01',check_out:'2026-10-03',created_at:'2026-09-28',total_amount:1172,guests:2}],
 guarantees:[{id:gid,reservation_id:rid,provider:'pagbank_sandbox',provider_authorization_id:'CHAR_QA_LOCAL',amount_cents:50000,captured_amount_cents:18900,refunded_amount_cents:0,status:'captured',created_at:'2026-09-28',incidents:[]}],payments:[],experience_orders:[{reservation_id:rid,experience_order_items:[{id:'30000000-0000-4000-8000-000000000001',status:'active',product_name_snapshot:'Experiência Romântica',unit_price_cents:49900,quantity:1}]}],charges:[],modifications:[],notes:[],ledger:[],notifications:[],integrations:[],settings:{},calendar_blocks:[],channel_periods:[],channel_health:{},cancellation_policies:[{rate_plan_code:'refundable',cancellation_policy_rules:{commercial_free_cancellation_hours:24,withdrawal_days:7,full_refund_days_before_checkin:20,late_accommodation_refund_percent:50,policy_documents:{version:'1.3',body:'Fixture local: janela comercial de 24 horas; contratos anteriores preservados.'}}}]};
const bootstrap=`window.CHALEZINHO_CONFIG={supabaseUrl:location.origin,supabaseKey:'local-fixture',bookingEngine:'/engine',refundEngine:'/engine',guaranteeEngine:'/engine'};
window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'local-fixture',user:{id:'${rid}',email:'qa@example.test'}}}})},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{role:'admin',full_name:'QA LOCAL — DADOS FICTÍCIOS'}})})})})})};`;
const server=createServer(async(req,res)=>{
 try{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/engine'||path==='/functions/v1/pms-operations'){
   let input='';for await(const chunk of req)input+=chunk;
   const body=JSON.parse(input);let output={ok:true};
   if(body.action==='admin_hub')output=hub;
   else if(body.action==='admin_property_action'&&body.operation==='pricing_calendar'){
    const [year,month]=body.start.split('-').map(Number),count=new Date(Date.UTC(year,month,0)).getUTCDate();
    output={ok:true,property:qa,pricelabs_connected:false,calendar_unavailable:false,events:hub.calendar_blocks.filter(b=>b.status==='active').map(b=>({start:b.start_date,end:b.end_date,label:b.reason,block_id:b.id})),days:Array.from({length:count},(_,i)=>{const date=`${body.start.slice(0,7)}-${String(i+1).padStart(2,'0')}`,day=new Date(date+'T12:00:00Z').getUTCDay(),period=qa.own_pricing.periods.find(p=>p.start<=date&&p.end>=date);return {date,price_cents:period?.cents??qa.own_pricing.weekdays_cents[day],source:'own'}})};
   }
   else if(body.action==='admin_property_action'&&body.operation==='save_pricing'){qa.own_pricing=body.own_pricing;qa.updated_at='v'+(Number(qa.updated_at.slice(1))+1);output={ok:true,property:qa}}
   else if(body.action==='admin_availability'&&body.operation==='get')output={ok:true,rules,updated_at:'v1'};
   else if(body.action==='admin_availability'&&body.operation==='save'){Object.assign(rules,body.rules);output={ok:true,rules,updated_at:'v2'}}
   else if(body.action==='admin_calendar'&&body.operation==='list')output={ok:true,sources:[]};
   else if(body.action==='block_action'&&body.operation==='create'){hub.calendar_blocks.push({id:crypto.randomUUID(),property_id:body.property_id,start_date:body.start_date,end_date:body.end_date,reason:body.reason,status:'active'});output={ok:true}}
   else if(body.action==='block_action'&&body.operation==='cancel'){const item=hub.calendar_blocks.find(b=>b.id===body.block_id);if(item)item.status='cancelled';output={ok:true}}
   else if(body.action==='reservation_cancel_request')output.requests=[];
   else if(body.action==='experience_credit')output.cancellation_id='40000000-0000-4000-8000-000000000001';
   else if(body.action==='admin_cancellation_policy_action')output.document_id='50000000-0000-4000-8000-000000000001';
   else if(body.action==='reservation_refund_action'){
    if(body.operation==='list')output.cases=[];
    else if(body.operation==='status')output={ok:true,cancellation_id:'40000000-0000-4000-8000-000000000001',kind:'voluntary_refund',status:'prepared',accepted_version:'1.3',refund_due_cents:49900,confirmed_cents:0,calculation:{reason:'unprovided_experience',allocations:[{charge_id:'CHAR_LOCAL',captured_cents:149900,refund_cents:49900,calculation:{reason:'unprovided_experience'}}]}};
    else if(body.operation==='preflight')output={ok:true,ready:false,checks:[]};
    else output={ok:false,error:'fixture_action_unsupported'};
   }
   else if(body.action==='reservation_finance')output.finance={events:[],events_count:0,paid_cents:117200,refunded_cents:0,net_received_cents:117200,pending_additional_cents:0,pending_refund_cents:0,damage_captured_cents:18900,damage_refunded_cents:0,total_net_received_cents:136100};
   else if(body.action==='refund')output.refund={state:'uncertain',confirmed_cents:0,provider_error_code:'40008'};
   else if(body.action==='report_incident')hub.guarantees[0].incidents.push({id:crypto.randomUUID(),description:body.description,category:body.category,requested_capture_cents:body.amount_cents,decision:'pending',status:'open'});
   else {res.writeHead(400);res.end(JSON.stringify({ok:false,error:'fixture_action_unsupported'}));return;}
   res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(output));return;
  }
  if(path==='/fixture.js'){res.writeHead(200,{'Content-Type':'application/javascript'});res.end(bootstrap);return;}
  // Explicit allowlist excludes credentials, repository internals and server source.
  const files=new Set(['/admin.html','/admin.js','/styles.css','/same-day-admin.css','/admin-workspace.css','/amenities.css','/amenities.js','/image-manifest.js','/responsive-images.js','/stay-offers.css','/stay-offers.js','/ui-controls.css','/villegram-review-notifications.css','/villegram-review-notifications.js','/operations-workspace.css','/operations-workspace.js','/approval-inbox.css','/approval-inbox.js','/property-pricing-calendar.css','/property-pricing-calendar.js','/listing-editor.js','/villegram-audio-dsp.js']);
  if(!files.has(path)){res.writeHead(404);res.end();return;}
  let data=await readFile(resolve(root,'.'+path));
  if(path==='/admin.html')data=Buffer.from(data.toString().replace(/<script src="https:\/\/cdn.jsdelivr[^>]+><\/script>/,'').replace(/<script src="app-config[^>]+><\/script>/,'<script src="fixture.js"></script>'));
  res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css'})[extname(path)],'Cache-Control':'no-store'});res.end(data);
 }catch{res.writeHead(500);res.end('Local fixture failed');}
});
server.listen(4173,'127.0.0.1',()=>console.log('Local visual fixture: http://127.0.0.1:4173/admin.html?view=reservations'));
