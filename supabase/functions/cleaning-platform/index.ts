import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {cleaningPixOrder,orderObservation,providerRequest,validOrderWebhook} from './provider.ts';
import {validPhoto} from '../pms-operations/photos.ts';
const url=Deno.env.get('SUPABASE_URL')||'';
const db=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',{auth:{persistSession:false,autoRefreshToken:false}});
const headers={'access-control-allow-origin':'*','access-control-allow-headers':'authorization,apikey,content-type','access-control-allow-methods':'POST,OPTIONS','cache-control':'no-store'};
const json=(data:any,status=200)=>new Response(JSON.stringify(data),{status,headers:{...headers,'content-type':'application/json'}});
const checked=(r:any)=>{if(r.error)throw Error(r.error.message);return r.data;};
async function identity(req:Request){const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');if(!token)return null;const {data,error}=await db.auth.getUser(token);return error?null:data.user;}
async function admin(id:string){return !!checked(await db.from('cleaning_admins').select('user_id').eq('user_id',id).eq('active',true).maybeSingle());}
const credential=(env:string)=>Deno.env.get(env==='production'?'CLEANING_PAGBANK_PRODUCTION_TOKEN':'CLEANING_PAGBANK_SANDBOX_TOKEN')||'';
function credentialsReady(settings:any){const p=settings.provider;return p?.enabled===true&&p.split_verified===true&&p.pix_custody_verified===true&&p.settlement_verified===true&&!!credential(p.environment)&&!!Deno.env.get('CLEANING_PAGBANK_PLATFORM_ACCOUNT')&&Deno.env.get('CLEANING_SETTLEMENT_INTEGRATION')==='verified';}
function guardEnvironment(env:string){const prod=url.includes('irxsaladqhbzhkoaclxy.');if(prod!==(env==='production'))throw Error('payment_environment_mismatch');}
async function reconcile(pay:any){
 guardEnvironment(pay.environment);const order=await providerRequest(pay,credential(pay.environment),'/orders/'+pay.order_id);const observed=orderObservation(order,pay);checked(await db.rpc('cleaning_payment_observe',{p_payment:pay.id,p:observed}));return observed;
}
async function tick(){
 const pays=checked(await db.from('cleaning_payments').select('*').in('status',['pending','uncertain','paid']).not('order_id','is',null).limit(100));const failures=[];
 for(const pay of pays)try{await reconcile(pay);}catch{failures.push(pay.id);}
 checked(await db.rpc('cleaning_maintenance',{}));
 const c=checked(await db.from('cleaning_config').select('settings').eq('id',1).single());
 if(credentialsReady(c.settings)){
  const jobs=checked(await db.from('cleaning_jobs').select('*').eq('state','approved').eq('payout','authorized').eq('is_test',false).is('change_pending',null).limit(100));
  for(const j of jobs)try{const incidents=checked(await db.from('cleaning_incidents').select('id').eq('job_id',j.id).eq('state','open'));if(incidents.length)continue;
   const pay=checked(await db.from('cleaning_payments').select('*').eq('job_id',j.id).eq('status','paid').order('attempt',{ascending:false}).limit(1).single());guardEnvironment(pay.environment);if(!pay.split_id)continue;
   await providerRequest(pay,credential(pay.environment),'/splits/'+pay.split_id+'/custody/release','POST',{receivers:[{account:{id:pay.receiver_id}},{account:{id:Deno.env.get('CLEANING_PAGBANK_PLATFORM_ACCOUNT')}}]});
   checked(await db.rpc('cleaning_payout_observe',{p_payment:pay.id,p:{status:'processing',reference:pay.split_id}}));
  }catch{failures.push(j.id);}
 }
 return {ok:true,reconciled:pays.length-failures.length,failures};
}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});if(req.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
 try{
  if(Number(req.headers.get('content-length')||0)>750000)return json({ok:false,error:'photo_too_large'},413);
  const raw=await req.text();if(raw.length>750000)return json({ok:false,error:'photo_too_large'},413);const b=JSON.parse(raw);const action=new URL(req.url).searchParams.get('action')==='provider_webhook'?'provider_webhook':String(b.action||'');
  if(action==='bootstrap'){
   const c=checked(await db.from('cleaning_config').select('settings,version').eq('id',1).single());
   const {pilot,public_registration,categories,beds,service,addons,terms,terms_version}=c.settings;
   return json({ok:true,settings:{pilot,public_registration,categories,beds,service,addons,terms,terms_version},financial_ready:credentialsReady(c.settings),environment:url.includes('pxfqmnhqodqyaaqeyjgr.')?'development':'production'});
  }
  if(action==='provider_webhook'){
   // Orders API signature; do not accept unsigned sandbox or recurring API
   // ECDSA signatures as though they were Order notifications.
   const reference=String(b.reference_id||'');if(!/^faxina_[a-f0-9]{32}_\d+$/.test(reference))return json({ok:false,error:'unknown_payment'},404);
   const pay=checked(await db.from('cleaning_payments').select('*').eq('reference_id',reference).maybeSingle());if(!pay)return json({ok:false,error:'unknown_payment'},404);
   guardEnvironment(pay.environment);if(!await validOrderWebhook(raw,req.headers.get('x-authenticity-token')||'',credential(pay.environment)))return json({ok:false,error:'invalid_webhook_signature'},403);
   if(!pay.order_id)throw Error('provider_reconciliation_required');await reconcile(pay);checked(await db.rpc('cleaning_maintenance',{}));return json({ok:true});
  }
  if(action==='scheduled_tick'){
   const secret=req.headers.get('x-ops-secret')||'';if(!secret||!checked(await db.rpc('ops_verify_dispatch',{p_secret:secret})))return json({ok:false,error:'forbidden'},403);return json(await tick());
  }
  const user=await identity(req);if(!user)return json({ok:false,error:'login_required'},401);
  if(!user.email_confirmed_at)return json({ok:false,error:'email_confirmation_required'},403);
  if(action==='hub'){
   checked(await db.rpc('cleaning_import_pms',{p_actor:user.id}));
   checked(await db.rpc('cleaning_maintenance',{}));const hub=checked(await db.rpc('cleaning_read',{p_actor:user.id}));
   const c=checked(await db.from('cleaning_config').select('settings').eq('id',1).single());hub.financial_ready=credentialsReady(c.settings);return json({ok:true,...hub});
  }
  if(action==='job'){
   const detail=checked(await db.rpc('cleaning_read',{p_actor:user.id,p_job:b.job_id}));
   detail.photos=await Promise.all(detail.photos.map(async(p:any)=>{const signed=checked(await db.storage.from('cleaning-evidence').createSignedUrl(p.path,120));const {path,...safe}=p;return {...safe,url:signed.signedUrl};}));return json({ok:true,...detail});
  }
  if(action==='upload'){
   if(typeof b.base64!=='string'||b.base64.length>699052)throw Error('photo_too_large');let bytes:Uint8Array;try{bytes=Uint8Array.from(atob(b.base64),x=>x.charCodeAt(0));}catch{throw Error('invalid_photo');}
   if(!validPhoto(bytes,b.content_type))throw Error('invalid_photo');const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.buffer as ArrayBuffer))).map(x=>x.toString(16).padStart(2,'0')).join('');
   const params={job_id:b.job_id,item:b.item,upload_id:b.upload_id,sha256:hash,content_type:b.content_type,size_bytes:bytes.length,incident_id:b.incident_id};
   const photoCommand=b.incident_id?'cleaning_incident_photo':'cleaning_mutate';const photoArgs=b.incident_id?{p_actor:user.id,p:params}:{p_actor:user.id,p_action:'photo',p:params};
   const p=checked(await db.rpc(photoCommand,photoArgs));if(p.status==='ready')return json({ok:true,photo_id:p.id});
   const upload=await db.storage.from('cleaning-evidence').upload(p.path,bytes,{contentType:b.content_type,upsert:false});
   if(upload.error){const existing=checked(await db.storage.from('cleaning-evidence').download(p.path));const found=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await existing.arrayBuffer()))).map(x=>x.toString(16).padStart(2,'0')).join('');if(found!==hash)throw Error('upload_key_conflict');}
   checked(await db.rpc(photoCommand,{...photoArgs,p:{...params,complete:true}}));return json({ok:true,photo_id:p.id});
  }
  if(action==='pix'){
   const c=checked(await db.from('cleaning_config').select('settings').eq('id',1).single());if(!credentialsReady(c.settings))throw Error('financial_dependency_unavailable');guardEnvironment(c.settings.provider.environment);
   const taxId=String(b.tax_id||'').replace(/\D/g,'');if(!/^\d{11,14}$/.test(taxId))throw Error('payer_details_required');
   const member=checked(await db.from('cleaning_members').select('name,phone').eq('user_id',user.id).single());const phone=member.phone.replace(/\D/g,'').replace(/^55(?=\d{10,11}$)/,'');if(!/^\d{10,11}$/.test(phone)||!user.email)throw Error('payer_details_required');
   const pay=checked(await db.rpc('cleaning_payment_claim',{p_actor:user.id,p_job:b.job_id}));
   if(!pay.new){if(pay.order_id){await reconcile(pay);return json({ok:true});}throw Error('provider_reconciliation_required');}
   try{
    const payload=cleaningPixOrder(pay,{name:member.name,email:user.email,tax_id:taxId,phone},Deno.env.get('CLEANING_PAGBANK_PLATFORM_ACCOUNT')||'',url+'/functions/v1/cleaning-platform');
    // callback action is a URL query; external JSON stays untouched for signature.
    payload.notification_urls=[url+'/functions/v1/cleaning-platform?action=provider_webhook'];
    const order=await providerRequest(pay,credential(pay.environment),'/orders','POST',payload);const observed=orderObservation(order,pay);checked(await db.rpc('cleaning_payment_observe',{p_payment:pay.id,p:observed}));return json({ok:true});
   }catch(e){checked(await db.rpc('cleaning_payment_observe',{p_payment:pay.id,p:{operation:'uncertain'}}));throw e;}
  }
  if(action==='reconcile'){
   const detail=checked(await db.rpc('cleaning_read',{p_actor:user.id,p_job:b.job_id}));const pays=checked(await db.from('cleaning_payments').select('*').eq('job_id',detail.job.id).not('order_id','is',null));for(const pay of pays)await reconcile(pay);checked(await db.rpc('cleaning_maintenance',{}));return json({ok:true});
  }
  if(['process_refund','release_custody','tick'].includes(action)){
   if(!await admin(user.id))throw Error('cleaning_admin_required');if(action==='tick')return json(await tick());
   const j=checked(await db.from('cleaning_jobs').select('*').eq('id',b.job_id).single());if(j.is_test)throw Error('test_service_not_real');const pay=checked(await db.from('cleaning_payments').select('*').eq('job_id',j.id).eq('status','paid').single());
   guardEnvironment(pay.environment);
   if(action==='process_refund'){
    if(j.state!=='refund_pending'||j.payout==='paid')throw Error('refund_not_authorized');
    await providerRequest(pay,credential(pay.environment),'/charges/'+pay.charge_id+'/cancel','POST',{amount:{value:pay.amount_cents}});await reconcile(pay);return json({ok:true});
   }
   if(j.state!=='approved'||!['authorized','processing'].includes(j.payout)||j.change_pending)throw Error('payout_not_allowed');
   const incidents=checked(await db.from('cleaning_incidents').select('id').eq('job_id',j.id).eq('state','open'));if(incidents.length)throw Error('incident_requires_review');
   if(!pay.split_id)throw Error('provider_reconciliation_required');
   const c=checked(await db.from('cleaning_config').select('settings').eq('id',1).single());if(!credentialsReady(c.settings))throw Error('financial_dependency_unavailable');
   await providerRequest(pay,credential(pay.environment),'/splits/'+pay.split_id+'/custody/release','POST',{receivers:[{account:{id:pay.receiver_id}},{account:{id:Deno.env.get('CLEANING_PAGBANK_PLATFORM_ACCOUNT')}}]});
   checked(await db.rpc('cleaning_payout_observe',{p_payment:pay.id,p:{status:'processing',reference:pay.split_id}}));return json({ok:true});
  }
  if(['propose_change','respond_change'].includes(action))return json({ok:true,result:checked(await db.rpc('cleaning_change',{p_actor:user.id,p_action:action,p:b}))});
  const actions=['member','property','quote','favorite','request','accept','activate_routine','cancel','start','result','submit','approve','correction','incident','reply','config','release','receiver','admin','property_rules','resolve','rate','moderate'];
  if(!actions.includes(action))return json({ok:false,error:'invalid_action'},400);
  return json({ok:true,result:checked(await db.rpc('cleaning_mutate',{p_actor:user.id,p_action:action,p:b}))});
 }catch(e){const message=e instanceof Error?e.message:'unavailable';
  const known=['login_required','cleaning_admin_required','pilot_not_released','registration_closed','invalid_member','invalid_property','invalid_availability','invalid_beds','invalid_categories','invalid_fee','invalid_configuration','invalid_scope','invalid_checklist','invalid_addons','invalid_property_rules','invalid_provider','provider_verification_required','configuration_changed_reload','property_not_found','job_not_found','worker_not_found','member_not_found','request_key_conflict','quote_changed_review','assisted_quote_required','invalid_job_window','service_unavailable','schedule_conflict','professional_required','worker_fee_exceeds_service','payment_not_allowed','financial_dependency_unavailable','receiver_verification_required','custody_window_invalid','payment_environment_mismatch','payer_details_required','provider_identity_mismatch','provider_reconciliation_required','provider_request_failed','custody_not_confirmed','custody_release_homologation_required','start_not_allowed','execution_not_allowed','invalid_item','upload_key_conflict','photo_too_large','invalid_photo','checklist_and_photos_required','review_not_allowed','incident_requires_review','description_required','incident_not_found','photo_not_found','resolution_required','invalid_decision','performed_service_required','invalid_rating','moderation_reason_required','refund_not_authorized','payout_not_allowed','pms_link_not_authorized','cannot_remove_self','test_service_not_real','change_not_allowed','proposal_changed_reload','execution_not_started','correction_photo_required'];
  const code=known.find(k=>message.includes(k))||'unavailable';return json({ok:false,error:code},code==='cleaning_admin_required'?403:code==='unavailable'?503:409);
 }
});
