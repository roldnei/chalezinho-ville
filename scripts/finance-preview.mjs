// Local visual fixture only. Never connects to Supabase or PagBank.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const rid='10000000-0000-4000-8000-000000000001',gid='20000000-0000-4000-8000-000000000001';
const hub={ok:true,properties:[{id:1,name:'Ville Essenza',code:'CH2',features:{}}],reservations:[{id:rid,property_id:1,guest_name:'Hóspede QA local',confirmation_code:'QA-189',status:'confirmed',check_in:'2026-10-01',check_out:'2026-10-03',created_at:'2026-09-28',total_amount:1172,guests:2}],
 guarantees:[{id:gid,reservation_id:rid,provider:'pagbank_sandbox',provider_authorization_id:'CHAR_QA_LOCAL',amount_cents:50000,captured_amount_cents:18900,refunded_amount_cents:0,status:'captured',created_at:'2026-09-28',incidents:[]}],payments:[],experience_orders:[],charges:[],modifications:[],notes:[],ledger:[],notifications:[],integrations:[],settings:{},calendar_blocks:[],channel_periods:[],channel_health:{},cancellation_policies:[]};
const bootstrap=`window.CHALEZINHO_CONFIG={supabaseUrl:location.origin,supabaseKey:'local-fixture',bookingEngine:'/engine',refundEngine:'/engine',guaranteeEngine:'/engine'};
window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'local-fixture',user:{id:'${rid}',email:'qa@example.test'}}}})},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{role:'admin',full_name:'QA LOCAL — DADOS FICTÍCIOS'}})})})})})};`;
const server=createServer(async(req,res)=>{
 try{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/engine'){
   let input='';for await(const chunk of req)input+=chunk;
   const body=JSON.parse(input);let output={ok:true};
   if(body.action==='admin_hub')output=hub;
   else if(body.action==='reservation_cancel_request')output.requests=[];
   else if(body.action==='reservation_refund_action')output.cases=[];
   else if(body.action==='reservation_finance')output.finance={events:[],events_count:0,paid_cents:117200,refunded_cents:0,net_received_cents:117200,pending_additional_cents:0,pending_refund_cents:0,damage_captured_cents:18900,damage_refunded_cents:0,total_net_received_cents:136100};
   else if(body.action==='refund')output.refund={state:'uncertain',confirmed_cents:0,provider_error_code:'40008'};
   else if(body.action==='report_incident')hub.guarantees[0].incidents.push({id:crypto.randomUUID(),description:body.description,category:body.category,requested_capture_cents:body.amount_cents,decision:'pending',status:'open'});
   else {res.writeHead(400);res.end(JSON.stringify({ok:false,error:'fixture_action_unsupported'}));return;}
   res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(output));return;
  }
  if(path==='/fixture.js'){res.writeHead(200,{'Content-Type':'application/javascript'});res.end(bootstrap);return;}
  // Explicit allowlist excludes credentials, repository internals and server source.
  const files=new Set(['/admin.html','/admin.js','/styles.css']);
  if(!files.has(path)){res.writeHead(404);res.end();return;}
  let data=await readFile(resolve(root,'.'+path));
  if(path==='/admin.html')data=Buffer.from(data.toString().replace(/<script src="https:\/\/cdn.jsdelivr[^>]+><\/script>/,'').replace(/<script src="app-config[^>]+><\/script>/,'<script src="fixture.js"></script>'));
  res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css'})[extname(path)],'Cache-Control':'no-store'});res.end(data);
 }catch{res.writeHead(500);res.end('Local fixture failed');}
});
server.listen(4173,'127.0.0.1',()=>console.log('Local visual fixture: http://127.0.0.1:4173/admin.html?view=reservations'));
