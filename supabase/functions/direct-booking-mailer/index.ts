import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {createEmailProvider,EmailProviderError} from '../_shared/email-provider.ts';
import {formatDate} from '../_shared/email-format.ts';
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
Deno.serve(async req=>{
 if(req.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
 const key=req.headers.get('x-direct-booking-review-key')||'';
 if(!/^[a-f0-9]{64}$/.test(key))return json({ok:false,error:'unauthorized'},401);
 const url=Deno.env.get('SUPABASE_URL')||'',development=url==='https://pxfqmnhqodqyaaqeyjgr.supabase.co';
 if(!development&&url!=='https://irxsaladqhbzhkoaclxy.supabase.co')return json({ok:false,error:'unknown_project'},403);
 const db=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 const claimed=await db.rpc('claim_direct_booking_review_emails',{p_dispatch_key:key});
 if(claimed.error)return json({ok:false,error:'unauthorized'},401);
 const results=[];
 for(const item of claimed.data||[]){try{
  if(!['direct_booking_review_requested','direct_booking_review_enabled'].includes(item.template_code))throw new EmailProviderError('template_not_allowed',false);
  const user=await db.auth.admin.getUserById(item.user_id),email=user.data?.user?.email||'';
  const profile=await db.from('profiles').select('role,pms_access_status').eq('id',item.user_id).maybeSingle();
  if(user.error||!email||profile.error||profile.data?.role!=='admin'||profile.data?.pms_access_status!=='active')throw new EmailProviderError('recipient_unavailable',false);
  const template=await db.from('notification_templates').select('subject,body_text,active').eq('code',item.template_code).maybeSingle();
  if(template.error||!template.data?.active)throw new EmailProviderError('template_unavailable',false);
  const variables:Record<string,unknown>={};let requestId='';
  if(item.template_code==='direct_booking_review_requested'){
   const r=await db.from('direct_booking_requests').select('id,invitation_id,status,full_name,property_id,check_in,check_out').eq('id',item.payload?.request_id).maybeSingle();
   if(r.error)throw new EmailProviderError('review_lookup_failed',true);
   const i=r.data?await db.from('direct_booking_invitations').select('created_by').eq('id',r.data.invitation_id).maybeSingle():null;
   if(i?.error)throw new EmailProviderError('review_lookup_failed',true);
   if(!r.data||r.data.status!=='pending'||i?.data?.created_by!==item.user_id){
    await db.from('notification_outbox').update({status:'cancelled',last_error:'review_no_longer_pending'}).eq('id',item.id);results.push({id:item.id,status:'cancelled'});continue;
   }
   const p=await db.from('properties').select('name').eq('id',r.data.property_id).maybeSingle();
   if(p.error||!p.data)throw new EmailProviderError('property_lookup_failed',true);
   requestId=r.data.id;Object.assign(variables,{guest_name:r.data.full_name,property_name:p.data.name,check_in:formatDate(r.data.check_in),check_out:formatDate(r.data.check_out)});
  }
  const site=development?'https://chalezinho-ville-b620ysjua-roldneicosta-4140.vercel.app':'https://chalezinhoville.com.br';
  const link=new URL('/reservas-diretas-admin.html',site);if(requestId)link.searchParams.set('request',requestId);
  const render=(t:string)=>t.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,(_,k)=>String(variables[k]??''));
  const subject=render(template.data.subject),text=render(template.data.body_text),from=Deno.env.get('EMAIL_FROM_ADDRESS')||'';
  if(!from)throw new EmailProviderError('sender_not_configured',false);
  const env={get:(name:string)=>development&&name==='EMAIL_SANDBOX'?'true':Deno.env.get(name)},sandbox=env.get('EMAIL_SANDBOX')==='true';
  const sent=await createEmailProvider(env).send({to:{email},from:{email:from,name:'Chalezinho Ville'},subject,text:text+'\n\nConferir no PMS: '+link.href,html:'<!doctype html><html lang="pt-BR"><body style="font:16px/1.6 Arial,sans-serif;color:#27221b"><h1 style="font-size:23px">'+esc(subject)+'</h1><p>'+esc(text)+'</p><p><a style="display:inline-block;padding:12px 20px;background:#30251d;color:white;text-decoration:none" href="'+esc(link.href)+'">Conferir cadastro</a></p><p>Entre com sua conta administrativa. Abrir este link não aprova nem confirma uma reserva. Os documentos ficam disponíveis somente no PMS.</p></body></html>',idempotencyKey:item.id,tags:['direct-booking-review']});
  const saved=await db.from('notification_outbox').update({provider:sent.provider,provider_message_id:sent.messageId,delivery_status:sandbox?'sandbox_dropped':'accepted'}).eq('id',item.id);
  if(saved.error)throw new EmailProviderError('delivery_record_failed',true);
  const completed=await db.rpc('complete_notification_outbox',{p_id:item.id,p_sent:true});if(completed.error)throw new EmailProviderError('delivery_record_failed',true);
  results.push({id:item.id,status:sandbox?'sandbox_dropped':'accepted'});
 }catch(e){
  const error=e instanceof EmailProviderError?e:new EmailProviderError('direct_booking_email_failed',true);
  if(/^brevo_http_(401|403)$/.test(error.code)){
   // Credential/configuration failures must not consume or lose a guest alert.
   await db.from('notification_outbox').update({status:'queued',attempt_count:Math.max(0,Number(item.attempt_count||1)-1),send_after:new Date(Date.now()+3600000).toISOString(),last_error:error.code}).eq('id',item.id);
   results.push({id:item.id,status:'queued',error:error.code});continue;
  }
  if(!error.retryable)await db.from('notification_outbox').update({attempt_count:item.max_attempts}).eq('id',item.id);
  await db.rpc('complete_notification_outbox',{p_id:item.id,p_sent:false,p_error:error.code,p_retry_after_seconds:error.retryAfterSeconds});
  results.push({id:item.id,status:'failed',error:error.code});
 }}
 return json({ok:true,processed:results.length,results});
});
