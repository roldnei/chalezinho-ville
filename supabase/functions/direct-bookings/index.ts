import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {fetchCalendarRaw,parseCalendar} from '../_shared/calendars.ts';
import {directTerms} from '../_shared/direct-booking-terms.ts';
import {validDocument,proposal,tokenValid,uuid} from './model.ts';
const admin=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',{auth:{persistSession:false,autoRefreshToken:false}});
const headers={'access-control-allow-origin':'*','access-control-allow-headers':'authorization,apikey,content-type','access-control-allow-methods':'POST,OPTIONS','cache-control':'no-store','x-content-type-options':'nosniff'};
const json=(data:any,status=200)=>new Response(JSON.stringify(data),{status,headers:{...headers,'content-type':'application/json'}});
const checked=(r:any)=>{if(r.error)throw Error(r.error.message);return r.data;};
const hex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const sha=async(s:string|Uint8Array)=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof s==='string'?new TextEncoder().encode(s):s as Uint8Array<ArrayBuffer>)));
const property=async(id:number)=>checked(await admin.from('properties').select('id,code,name,max_guests,check_in_time,check_out_time,active').eq('id',id).single());
async function actor(req:Request){
 const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
 if(!token)return null;const {data,error}=await admin.auth.getUser(token);return error?null:data.user;
}
async function requireAdmin(user:any){
 if(!user)throw Error('authentication_required');
 const p=checked(await admin.from('profiles').select('role,pms_access_status').eq('id',user.id).maybeSingle());
 if(p?.role!=='admin'||!['active',null].includes(p.pms_access_status))throw Error('admin_required');
}
async function invitation(token:any){
 if(!tokenValid(token))throw Error('invitation_unavailable');
 const i=checked(await admin.from('direct_booking_invitations').select('*').eq('token_hash',await sha(token)).maybeSingle());
 if(!i||i.revoked_at)throw Error('invitation_unavailable');return i;
}
const safeRequest=(r:any)=>r?{id:r.id,status:r.status,check_in:r.check_in,check_out:r.check_out,guests:r.guests,full_name:r.full_name,phone:r.phone,accepted_at:r.accepted_at,reviewed_at:r.reviewed_at,review_note:r.review_note,terms_snapshot:r.terms_snapshot,total_cents:r.total_cents,cancellation_terms:r.cancellation_terms}:null;
async function context(i:any,user:any){
 const p=await property(i.property_id);
 const r=checked(await admin.from('direct_booking_requests').select('*').eq('invitation_id',i.id).maybeSingle());
 if(r&&r.user_id!==user?.id)return {ok:true,used:true};
 if(!r&&new Date(i.expires_at)<new Date())throw Error('invitation_expired');
 let profile=null,identity=null,attachments:any[]=[];
 if(user){
  profile=checked(await admin.from('profiles').select('full_name,phone').eq('id',user.id).maybeSingle());
  const g=checked(await admin.rpc('direct_booking_identity_snapshot',{p_user_id:user.id}));
  identity=g?{complete:true,...g,last_digits:g.document_number.slice(-4)}:{complete:false};
  attachments=checked(await admin.from('direct_booking_attachments').select('id,content_type,size_bytes,created_at').eq('invitation_id',i.id).eq('user_id',user.id));
 }
 return {ok:true,invitation:{id:i.id,property:p,check_in:i.check_in,check_out:i.check_out,guests:i.guests,total_cents:i.total_cents,cancellation_terms:i.cancellation_terms,existing_stay:!!i.existing_stay_id,terms_snapshot:i.terms_snapshot,terms_hash:i.terms_hash,expires_at:i.expires_at},request:safeRequest(r),profile,identity,attachments};
}
async function checkExternal(r:any){
 const sources=checked(await admin.from('property_calendar_sources').select('provider,feed_url').eq('property_id',r.property_id).eq('enabled',true).is('deleted_at',null));
 for(const s of sources){
  let periods;try{periods=parseCalendar(await fetchCalendarRaw(s.feed_url,s.provider),s.provider);}catch{throw Error('calendar_unavailable');}
  if(periods.some((p:any)=>p.start<r.check_out&&p.end>r.check_in))throw Error('dates_unavailable');
 }
 return new Date().toISOString();
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
 try{
  if(Number(req.headers.get('content-length')||0)>7200000)return json({ok:false,error:'document_too_large'},413);
  const b=await req.json(),user=await actor(req);
  if(b.action==='context')return json(await context(await invitation(b.token),user));
  if(['list','create_invitation','review','detail','revoke'].includes(b.action)){
   await requireAdmin(user);
   if(b.action==='list'){
    const [properties,invitations,requests,stays]=await Promise.all([
     admin.from('properties').select('id,name,code,max_guests').eq('active',true).order('id').then(checked),
     admin.from('direct_booking_invitations').select('id,property_id,existing_stay_id,check_in,check_out,guests,total_cents,cancellation_terms,created_at,expires_at,revoked_at').order('created_at',{ascending:false}).limit(200).then(checked),
     admin.from('direct_booking_requests').select('id,invitation_id,property_id,existing_stay_id,stay_id,full_name,phone,check_in,check_out,guests,status,accepted_at,total_cents').order('submitted_at',{ascending:false}).limit(200).then(checked),
     admin.from('ops_stays').select('id,property_id,guest_name,check_in,check_out,guests').eq('status','confirmed').eq('channel','direct').eq('origin','manual').eq('is_test',false).is('reservation_id',null).gte('check_out',new Date().toISOString().slice(0,10)).order('check_in').limit(200).then(checked)
    ]);return json({ok:true,properties,invitations,requests,stays});
   }
   if(b.action==='create_invitation'){
    let stay=null;if(b.stay_id){if(!uuid(b.stay_id))throw Error('invalid_stay');stay=checked(await admin.from('ops_stays').select('*').eq('id',b.stay_id).single());if(stay.status!=='confirmed'||stay.channel!=='direct'||stay.origin!=='manual'||stay.is_test||stay.reservation_id)throw Error('invalid_stay');}
    const p=await property(Number(stay?.property_id||b.property_id));if(!p.active)throw Error('property_unavailable');
    const values=proposal(p,b,stay),docs=directTerms(p);
    const terms_snapshot={documents:docs,property:{id:p.id,name:p.name,code:p.code,check_in_time:p.check_in_time,check_out_time:p.check_out_time},...values};
    const token=hex(crypto.getRandomValues(new Uint8Array(32))),payload={...values,property_id:p.id,existing_stay_id:stay?.id||null,terms_snapshot,terms_hash:await sha(JSON.stringify(terms_snapshot)),token_hash:await sha(token),created_by:user.id,expires_at:new Date(Date.now()+14*86400000).toISOString(),revoked_at:null};
    let prior=stay?checked(await admin.from('direct_booking_invitations').select('id').eq('existing_stay_id',stay.id).maybeSingle()):null;
    if(prior&&checked(await admin.from('direct_booking_requests').select('id').eq('invitation_id',prior.id).maybeSingle()))throw Error('request_already_submitted');
    // A database trigger fences regeneration against a simultaneous guest submission.
    const row=checked(prior?await admin.from('direct_booking_invitations').update(payload).eq('id',prior.id).select('id').single():await admin.from('direct_booking_invitations').insert(payload).select('id').single());
    return json({ok:true,id:row.id,token});
   }
   if(b.action==='revoke'){
    if(!uuid(b.invitation_id))throw Error('invitation_unavailable');
    const r=checked(await admin.from('direct_booking_requests').select('id').eq('invitation_id',b.invitation_id).maybeSingle());if(r)throw Error('request_already_submitted');
    checked(await admin.from('direct_booking_invitations').update({revoked_at:new Date().toISOString()}).eq('id',b.invitation_id));return json({ok:true});
   }
   if(!uuid(b.request_id))throw Error('request_not_found');
   const r=checked(await admin.from('direct_booking_requests').select('*').eq('id',b.request_id).single());
   if(b.action==='detail'){
    const attachments=checked(await admin.from('direct_booking_attachments').select('id,content_type,size_bytes,created_at').eq('invitation_id',r.invitation_id).eq('user_id',r.user_id));
    return json({ok:true,request:r,attachments});
   }
   const external_checked_at=b.decision==='approve'&&!r.existing_stay_id&&r.status==='pending'?await checkExternal(r):null;
   return json({ok:true,result:checked(await admin.rpc('direct_booking_review',{p_actor:user.id,p:{request_id:r.id,decision:b.decision,payment_confirmed:b.payment_confirmed,payment_method:b.payment_method,payment_reference:b.payment_reference,note:b.note,external_checked_at}}))});
  }
  if(!user)throw Error('authentication_required');
  if(b.action==='document_url'){
   const a=checked(await admin.from('direct_booking_attachments').select('*').eq('id',b.attachment_id).single());
   if(a.user_id!==user.id)await requireAdmin(user);
   const r=checked(await admin.from('direct_booking_requests').select('id').eq('invitation_id',a.invitation_id).maybeSingle());
   if(r)checked(await admin.from('direct_booking_audit').insert({request_id:r.id,actor_id:user.id,action:'identification_document_viewed'}));
   return json({ok:true,url:checked(await admin.storage.from('direct-booking-documents').createSignedUrl(a.storage_path,120)).signedUrl});
  }
  if(!user.email_confirmed_at)throw Error('verified_account_required');
  const i=await invitation(b.token);
  const existing=checked(await admin.from('direct_booking_requests').select('id,user_id').eq('invitation_id',i.id).maybeSingle());
  if(existing&&existing.user_id!==user.id)throw Error('invitation_already_used');
  if(b.action==='submit')return json({ok:true,result:checked(await admin.rpc('direct_booking_submit',{p_actor:user.id,p:{invitation_id:i.id,full_name:b.full_name,phone:String(b.phone||'').replace(/[^\d+]/g,''),photo_document:b.photo_document,check_in:b.check_in,check_out:b.check_out,guests:b.guests,accepted:b.accepted,terms_hash:b.terms_hash,verified_account:true,verified_email:user.email}}))});
  if(existing)throw Error('request_already_submitted');
  if(new Date(i.expires_at)<new Date())throw Error('invitation_expired');
  if(b.action==='identity'){
   const present=checked(await admin.rpc('guest_identity_present',{p_user_id:user.id}));
   if(!present)checked(await admin.rpc('register_guest_identity',{p_user_id:user.id,p_document_type:b.document_type,p_issuing_country:b.issuing_country,p_document_number:b.document_number}));
   return json({ok:true});
  }
  if(b.action==='upload'){
   if(!uuid(b.upload_id))throw Error('invalid_document');
   const prior=checked(await admin.from('direct_booking_attachments').select('id').eq('id',b.upload_id).eq('user_id',user.id).eq('invitation_id',i.id).maybeSingle());if(prior)return json({ok:true,id:prior.id});
   const rows=checked(await admin.from('direct_booking_attachments').select('id').eq('invitation_id',i.id).eq('user_id',user.id));if(rows.length>=3)throw Error('document_limit');
   if(typeof b.base64!=='string'||b.base64.length>6990510)throw Error('document_too_large');
   let bytes;try{bytes=Uint8Array.from(atob(b.base64),c=>c.charCodeAt(0));}catch{throw Error('invalid_document');}
   if(!validDocument(bytes,b.content_type))throw Error('invalid_document');
   const ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'} as any)[b.content_type];
   const storage_path=user.id+'/'+i.id+'/'+b.upload_id+'.'+ext,hash=await sha(bytes);
   const uploaded=await admin.storage.from('direct-booking-documents').upload(storage_path,bytes,{contentType:b.content_type,upsert:false});
   if(uploaded.error){const old=checked(await admin.storage.from('direct-booking-documents').download(storage_path));if(await sha(new Uint8Array(await old.arrayBuffer()))!==hash)throw Error('document_upload_failed');}
   checked(await admin.from('direct_booking_attachments').insert({id:b.upload_id,invitation_id:i.id,user_id:user.id,storage_path,content_type:b.content_type,size_bytes:bytes.length,sha256:hash}));return json({ok:true,id:b.upload_id});
  }
  return json({ok:false,error:'invalid_action'},400);
 }catch(e){
  const message=e instanceof Error?e.message:'';
  const errors=['admin_required','authentication_required','verified_account_required','invitation_unavailable','invitation_expired','invitation_already_used','request_already_submitted','request_not_found','document_required','document_too_large','document_limit','document_upload_failed','identity_required','photo_document_details_required','cin_must_match_cpf','passport_must_match_identity','invalid_document','identity_conflict','invalid_guest','terms_acceptance_required','invitation_dates_changed','existing_stay_changed','invalid_dates_or_guests','invalid_dates','invalid_total','cancellation_terms_required','manual_payment_confirmation_required','invalid_payment_method','calendar_unavailable','calendar_check_required','dates_unavailable','property_unavailable','invalid_stay','review_note_required'];
  const error=errors.find(k=>message.includes(k))||(message.includes('duplicate key')?'identity_conflict':'operation_unavailable');
  return json({ok:false,error},['authentication_required','admin_required'].includes(error)?403:error==='operation_unavailable'?503:409);
 }
});
