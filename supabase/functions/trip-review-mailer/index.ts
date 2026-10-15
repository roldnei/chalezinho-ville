import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {createEmailProvider,EmailProviderError} from '../_shared/email-provider.ts';
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
Deno.serve(async req=>{
 if(req.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
 const key=req.headers.get('x-trip-review-key')||'';if(!/^[a-f0-9]{64}$/.test(key))return json({ok:false,error:'unauthorized'},401);
 const url=Deno.env.get('SUPABASE_URL')||'',development=url==='https://pxfqmnhqodqyaaqeyjgr.supabase.co';
 if(!development&&url!=='https://irxsaladqhbzhkoaclxy.supabase.co')return json({ok:false,error:'unknown_project'},403);
 const db=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 const claimed=await db.rpc('claim_trip_review_emails',{p_dispatch_key:key});if(claimed.error)return json({ok:false,error:'unauthorized'},401);
 const results=[];
 for(const item of claimed.data||[]){try{
  const user=await db.auth.admin.getUserById(item.user_id),email=user.data?.user?.email||'';
  if(user.error||email.toLowerCase()!=='roldneicosta@gmail.com')throw new EmailProviderError('recipient_changed',false);
  const profile=await db.from('profiles').select('role,pms_access_status').eq('id',item.user_id).maybeSingle();
  if(profile.error||profile.data?.role!=='admin'||profile.data?.pms_access_status!=='active')throw new EmailProviderError('recipient_changed',false);
  const template=await db.from('notification_templates').select('subject,body_text,active').eq('code',item.template_code).maybeSingle();
  if(template.error||!template.data?.active)throw new EmailProviderError('template_unavailable',false);
  const id=item.payload?.publication_id;
  if(item.template_code==='trip_review_requested'){
   const post=await db.from('villegram_publications').select('status,source,updated_at').eq('id',id).maybeSingle();
   if(post.error)throw new EmailProviderError('review_lookup_failed',true);
   if(post.data?.status!=='pending_review'||post.data?.source!=='guest_submission'||Date.parse(post.data.updated_at)!==Date.parse(item.payload.revision)){
    await db.from('notification_outbox').update({status:'cancelled',last_error:'review_no_longer_pending'}).eq('id',item.id);results.push({id:item.id,status:'cancelled'});continue;
   }
  }
  const site=development?'https://chalezinho-ville-b620ysjua-roldneicosta-4140.vercel.app':'https://chalezinhoville.com.br';
  // DEV always discards at the provider; no real recipient gets fixture emails.
  const env={get:(name:string)=>development&&name==='EMAIL_SANDBOX'?'true':Deno.env.get(name)};
  const sandbox=env.get('EMAIL_SANDBOX')==='true';
  const link=new URL('/villegram-admin.html?review=pending',site);if(id)link.searchParams.set('trip',id);
  const render=(t:string)=>t.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,(_,k)=>String(item.payload?.[k]||''));
  const subject=render(template.data.subject),text=render(template.data.body_text),from=Deno.env.get('EMAIL_FROM_ADDRESS')||'';
  if(!from)throw new EmailProviderError('sender_not_configured',false);
  const sent=await createEmailProvider(env).send({to:{email},from:{email:from,name:'Chalezinho Ville'},subject,text:text+'\n\nRevisar Trips: '+link.href,html:'<!doctype html><html lang="pt-BR"><body><h1>'+esc(subject)+'</h1><p>'+esc(text)+'</p><p><a href="'+esc(link.href)+'">Revisar Trip</a></p><p>Entre com sua conta administrativa. Abrir o link não aprova a publicação.</p></body></html>',idempotencyKey:item.id,tags:['trip-review']});
  await db.from('notification_outbox').update({provider:sent.provider,provider_message_id:sent.messageId,delivery_status:sandbox?'sandbox_dropped':'accepted'}).eq('id',item.id);
  await db.rpc('complete_notification_outbox',{p_id:item.id,p_sent:true});results.push({id:item.id,status:sandbox?'sandbox_dropped':'accepted'});
 }catch(e){const error=e instanceof EmailProviderError?e:new EmailProviderError('review_email_failed',true);if(!error.retryable)await db.from('notification_outbox').update({attempt_count:item.max_attempts}).eq('id',item.id);await db.rpc('complete_notification_outbox',{p_id:item.id,p_sent:false,p_error:error.code,p_retry_after_seconds:error.retryAfterSeconds});results.push({id:item.id,status:'failed',error:error.code});}}
 return json({ok:true,processed:results.length,results});
});
