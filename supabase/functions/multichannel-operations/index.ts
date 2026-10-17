import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {fetchCalendarRaw} from '../_shared/calendars.ts';
import {parseOperationalCalendar,operationSummary} from '../_shared/operational-calendar.ts';
import {validPhoto} from '../pms-operations/photos.ts';
import {operationalGuests} from '../_shared/operational-guests.ts';
const projectUrl=Deno.env.get('SUPABASE_URL')||'';
const admin=createClient(projectUrl,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',{auth:{persistSession:false,autoRefreshToken:false}});
const headers={'access-control-allow-origin':'*','access-control-allow-headers':'authorization,apikey,content-type,x-ops-secret','access-control-allow-methods':'POST,OPTIONS','cache-control':'no-store'};
const json=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{...headers,'content-type':'application/json'}});
const checked=(q:any)=>{if(q.error)throw Error(q.error.message);return q.data};
const propertyAccess=(a:any,id:number)=>a.role==='admin'||a.pms_property_ids?.includes(Number(id));
const taskAccess=(a:any,t:any)=>a.role==='admin'||propertyAccess(a,t.property_id)&&a.pms_permissions?.housekeeping===true&&t.assigned_to===a.id;
async function actor(req:Request){
 const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
 const {data,error}=await admin.auth.getUser(token);if(error||!data.user)return null;
 const p=checked(await admin.from('profiles').select('id,role,full_name,pms_property_ids,pms_permissions,pms_access_status').eq('id',data.user.id).maybeSingle());
 return p&&p.pms_access_status==='active'&&['admin','host','staff','service_provider'].includes(p.role)?p:null;
}
async function all(table:string,columns='*',order='id'){
 const result:any[]=[];for(let offset=0;;offset+=500){const rows=checked(await admin.from(table).select(columns).order(order).range(offset,offset+499));result.push(...rows);if(rows.length<500)return result;}
}
async function sync(){
 const sources=checked(await admin.from('property_calendar_sources').select('*').eq('enabled',true).is('deleted_at',null));
 const results=[];
 // Sequential sources keep runtime and provider load bounded. Each source has a fenced lease.
 for(const source of sources){
  const token=checked(await admin.rpc('ops_claim_sync',{p_source:source.id}));
  if(!token){results.push({source_id:source.id,status:'already_running'});continue;}
  let events:any[]=[],failure:string|null=null,attempt=0;
  for(attempt=1;attempt<=3;attempt++){
   try{events=parseOperationalCalendar(await fetchCalendarRaw(source.feed_url,source.provider),source.provider);failure=null;break;}
   catch(e){failure=e instanceof Error?e.message:'calendar_unavailable';if(!['calendar_unreachable','fetch failed'].includes(failure)&&!failure.toLowerCase().includes('timeout'))break;if(attempt<3)await new Promise(r=>setTimeout(r,attempt*400));}
  }
  const applied=await admin.rpc('ops_apply_sync',{p_source:source.id,p_token:token,p_config_updated:source.updated_at,p_events:events,p_error:failure,p_attempts:Math.min(attempt,3)});
  if(applied.error)checked(await admin.rpc('ops_fail_sync',{p_source:source.id,p_token:token,p_error:'database_reconciliation_failed'}));
  results.push({source_id:source.id,status:applied.error?'reconciliation_failed':failure?'failed':'success',events:events.length,error:applied.error?'database_reconciliation_failed':failure});
 }
 checked(await admin.rpc('ops_refresh_tasks',{}));
 return {ok:true,results};
}
async function hub(a:any){
 const [properties,stays,tasks,events,sources,syncState,templates,team,runs]=await Promise.all([
  all('properties','id,name,code,check_in_time,check_out_time,timezone'),all('ops_stays'),all('ops_tasks'),all('ops_calendar_events'),
  all('property_calendar_sources','id,property_id,provider,label,enabled,deleted_at'),
  admin.from('ops_sync_state').select('*').then(checked),all('ops_templates'),
  admin.from('profiles').select('id,full_name,role,pms_property_ids,pms_permissions,pms_access_status').in('role',['admin','host','staff','service_provider']).then(checked),
  admin.from('ops_sync_runs').select('*').order('started_at',{ascending:false}).limit(60).then(checked)
 ]);
 const fixtureIds=new Set(stays.filter(s=>s.is_test).map(s=>s.id));
 const approvedPreparations=new Set(tasks.filter(t=>t.stage==='preparation'&&t.status==='approved').map(t=>JSON.stringify([t.stay_id,t.stay_version])));
 const visibleTasks=tasks.filter(t=>!fixtureIds.has(t.stay_id)&&taskAccess(a,t)).map(t=>({...t,preparation_approved:t.stage==='departure'&&!!t.stay_id&&approvedPreparations.has(JSON.stringify([t.stay_id,t.stay_version]))}));
 const assignedStayIds=new Set(visibleTasks.map(t=>t.stay_id));
 const guestAccess=a.role==='admin'||a.pms_permissions?.reservations===true;
 let visibleStays=stays.filter(s=>!s.is_test&&propertyAccess(a,s.property_id)&&(guestAccess||assignedStayIds.has(s.id))).map(s=>guestAccess?s:{...s,guest_name:null,guest_phone:null,guests:null,notes:null,departure_report_note:null});
 if(guestAccess){
  const [links,contacts]=await Promise.all([all('guest_stay_links','stay_key,guest_id,reservation_id,property_id,source,check_in,check_out','stay_key'),all('guest_contacts','id,name,phone')]);
  visibleStays=operationalGuests(visibleStays,events,links,contacts);
 }
 const sourceIds=new Set(sources.filter(s=>propertyAccess(a,s.property_id)).map(s=>s.id));
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 return {ok:true,operator:a,server_now:new Date().toISOString(),today,properties:properties.filter(p=>propertyAccess(a,p.id)),stays:visibleStays,tasks:visibleTasks,
  summary:operationSummary(visibleStays,visibleTasks,today,new Date(),properties),events:guestAccess?events.filter(e=>propertyAccess(a,e.property_id)):[],
  sources:sources.filter(s=>sourceIds.has(s.id)&&!s.deleted_at).map(s=>({...s,sync:syncState.find(x=>x.source_id===s.id)||null})),
  runs:a.role==='admin'?runs:[],templates:a.role==='admin'?templates:[],team:a.role==='admin'?team.filter(m=>m.pms_access_status==='active'):team.filter(m=>m.id===a.id)};
}
async function taskDetail(a:any,id:string){
 const t=checked(await admin.from('ops_tasks').select('*').eq('id',id).maybeSingle());if(!t||!taskAccess(a,t))return json({ok:false,error:'task_not_found'},404);
 const [results,photos]=await Promise.all([admin.from('ops_task_results').select('*').eq('task_id',id).then(checked),admin.from('ops_evidence').select('*').eq('task_id',id).eq('status','ready').order('created_at').then(checked)]);
 const evidence=await Promise.all(photos.map(async(p:any)=>{const signed=checked(await admin.storage.from('operation-evidence').createSignedUrl(p.storage_path,300));const {storage_path,sha256,...safe}=p;return {...safe,url:signed.signedUrl};}));
 return json({ok:true,task:t,results,photos:evidence});
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
 try{
  const body=await req.json();
  if(body.action==='scheduled_sync'){
   const secret=req.headers.get('x-ops-secret')||'';
   if(!secret||!checked(await admin.rpc('ops_verify_dispatch',{p_secret:secret})))return json({ok:false,error:'forbidden'},403);
   return json(await sync());
  }
  const a=await actor(req);if(!a)return json({ok:false,error:'operator_required'},403);
  if(body.action==='hub')return json(await hub(a));
  if(body.action==='sync'){if(a.role!=='admin')return json({ok:false,error:'admin_required'},403);return json(await sync());}
  if(body.action==='task')return await taskDetail(a,String(body.task_id||''));
  if(body.action==='link_preparation'){if(a.role!=='admin')return json({ok:false,error:'admin_required'},403);return json({ok:true,result:checked(await admin.rpc('ops_link_preparation',{p_actor:a.id,p:body}))});}
  if(body.action==='close_preparation'){if(a.role!=='admin')return json({ok:false,error:'admin_required'},403);return json({ok:true,result:checked(await admin.rpc('ops_close_preparation',{p_actor:a.id,p:body}))});}
  if(body.action==='complete_task')return json({ok:true,result:checked(await admin.rpc('ops_complete_task',{p_actor:a.id,p:body}))});
  if(body.action==='upload'){
   const base64=String(body.base64||'');if(!base64||base64.length>699052)return json({ok:false,error:'photo_too_large'},413);
   let bytes:Uint8Array;try{bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));}catch{return json({ok:false,error:'invalid_photo'},400);}
   if(!validPhoto(bytes,body.content_type))return json({ok:false,error:'invalid_photo'},400);
   const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.buffer as ArrayBuffer))).map(x=>x.toString(16).padStart(2,'0')).join('');
   const p={task_id:body.task_id,item_index:body.item_index,upload_id:body.upload_id,content_type:body.content_type,size_bytes:bytes.length,sha256};
   const record=checked(await admin.rpc('ops_mutate',{p_actor:a.id,p_action:'photo',p}));
   if(record.status==='ready')return json({ok:true,photo_id:record.id});
   const uploaded=await admin.storage.from('operation-evidence').upload(record.storage_path,bytes,{contentType:body.content_type,upsert:false});
   if(uploaded.error){
    const existing=await admin.storage.from('operation-evidence').download(record.storage_path);
    if(existing.error)throw Error('photo_upload_failed_retry');
    const existingHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await existing.data.arrayBuffer()))).map(x=>x.toString(16).padStart(2,'0')).join('');
    if(existingHash!==sha256)throw Error('upload_key_conflict');
   }
   checked(await admin.rpc('ops_mutate',{p_actor:a.id,p_action:'photo',p:{...p,complete:true}}));
   return json({ok:true,photo_id:record.id});
  }
  if(['save_stay','classify','template','manual_task','attendance','assign','result','status'].includes(body.action)){
   const result=checked(await admin.rpc('ops_mutate',{p_actor:a.id,p_action:body.action,p:body}));return json({ok:true,result});
  }
  return json({ok:false,error:'invalid_action'},400);
 }catch(e){
  const message=e instanceof Error?e.message:'operation_unavailable';
  const known=['preparation_closed','preparation_not_approved','invalid_closure_reason','link_target_unavailable','standalone_preparation_required','preparation_already_linked','preparation_not_submitted','link_property_mismatch','preparation_after_arrival','intervening_stay_requires_cleaning','preparation_evidence_pending','preparation_has_work','stay_changed_reload','linked_identity_locked','invalid_task_window','permission_denied','admin_required','task_not_found','invalid_assignee','invalid_status','task_locked','departure_not_due','checklist_and_photos_required','inspection_required','invalid_item','upload_key_conflict','photo_upload_failed_retry','existing_stay_link_required','use_reservation_flow','manual_dates_required','already_linked','link_dates_or_property_differ','attendance_not_allowed','invalid_checklist'];
  return json({ok:false,error:known.find(k=>message.includes(k))||'operation_unavailable'},known.some(k=>message.includes(k))?409:503);
 }
});
