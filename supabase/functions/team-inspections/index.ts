import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {validPhoto} from '../pms-operations/photos.ts';
const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const headers={'access-control-allow-origin':'*','access-control-allow-headers':'authorization,apikey,content-type','access-control-allow-methods':'POST,OPTIONS','cache-control':'no-store','content-type':'application/json'};
const json=(data:any,status=200)=>new Response(JSON.stringify(data),{status,headers});
const hash=async(v:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',v as BufferSource))).map(x=>x.toString(16).padStart(2,'0')).join('');
const checked=(x:any)=>{if(x.error)throw Error(x.error.message);return x.data};
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST')return json({error:'method_not_allowed'},405);
 try{
  if(Number(req.headers.get('content-length'))>750000)return json({error:'photo_too_large'},413);
  const b=await req.json();let actor:string|null=null,tokenHash:string|null=null;
  if(b.token){if(!/^[a-f0-9]{64}$/.test(b.token))throw Error('access_unavailable');tokenHash=await hash(new TextEncoder().encode(b.token));}
  else{const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');const {data,error}=await admin.auth.getUser(token);if(error||!data.user)throw Error('access_unavailable');actor=data.user.id;}
  const call=async(action:string,p:any=b)=>checked(await admin.rpc('inspection_dispatch',{p_actor:actor,p_hash:tokenHash,p_action:action,p}));
  if(b.action==='contact'){
   const phone=String(b.phone||'').replace(/\D/g,'');if(!/^55\d{10,11}$/.test(phone)||String(b.name||'').trim().length<2)throw Error('invalid_profile');
   // Admin authorization is checked before any Auth account is provisioned.
   const existing=await call('lookup',{phone});let id=b.user_id||existing.id;
   if(!id){for(let page=1;page<=20;page++){const users=checked(await admin.auth.admin.listUsers({page,perPage:1000})).users;id=users.find((u:any)=>u.phone===phone)?.id;if(id||users.length<1000)break;if(page===20)throw Error('inspection_unavailable');}}
   if(!id){const created=checked(await admin.auth.admin.createUser({phone,phone_confirm:false,app_metadata:{provider:'phone',providers:['phone']},user_metadata:{full_name:String(b.name).slice(0,120)}}));id=created.user.id;}
   return json({ok:true,data:await call('contact',{user_id:id,phone,name:b.name})});
  }
  if(b.action==='issue_link'){
   const token=Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join('');
   const data=await call('issue_link',{task_id:b.task_id,hash:await hash(new TextEncoder().encode(token))});return json({ok:true,data:{...data,token}});
  }
  if(b.action==='upload'){
   if(typeof b.base64!=='string'||b.base64.length>699052)throw Error('invalid_photo');
   let bytes:Uint8Array;try{bytes=Uint8Array.from(atob(b.base64),c=>c.charCodeAt(0));}catch{throw Error('invalid_photo');}
   if(!['image/jpeg','image/webp'].includes(b.content_type)||!validPhoto(bytes,b.content_type))throw Error('invalid_photo');
   const p={task_id:b.task_id,item_index:b.item_index,upload_id:b.upload_id,content_type:b.content_type,size_bytes:bytes.length,sha256:await hash(bytes)};
   const record=await call('photo',p);if(record.status!=='ready'){
    const upload=await admin.storage.from('operation-evidence').upload(record.storage_path,bytes,{contentType:b.content_type,upsert:false});
    if(upload.error){const file=checked(await admin.storage.from('operation-evidence').download(record.storage_path));if(await hash(new Uint8Array(await file.arrayBuffer()))!==p.sha256)throw Error('photo_upload_failed_retry');}
    await call('photo',{...p,complete:true});
   }
   return json({ok:true,data:{id:record.id}});
  }
  if(b.action==='photo_read'){
   const e=await call('photo_read');const blob=checked(await admin.storage.from('operation-evidence').download(e.storage_path));
   // Check again after storage retrieval; no reusable signed URLs are returned.
   await call('photo_read');const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(const v of bytes)binary+=String.fromCharCode(v);
   return json({ok:true,data:{src:`data:${e.content_type};base64,${btoa(binary)}`}});
  }
  return json({ok:true,data:await call(b.action)});
 }catch(e){const m=e instanceof Error?e.message:'';const known=['access_unavailable','admin_required','invalid_profile','invalid_assignee','contact_required','task_locked','reopen_reason_required','invalid_item','invalid_checklist','not_applicable_forbidden','departure_not_due','uploads_pending','problem_description_required','checklist_and_photos_required','upload_key_conflict','invalid_photo','photo_upload_failed_retry','cleaning_task_managed_in_platform'];const error=known.find(k=>m.includes(k));return json({ok:false,error:error||'inspection_unavailable'},error==='access_unavailable'?403:409);}
});
