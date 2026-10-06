import {createClient} from 'npm:@supabase/supabase-js@2';
import {publicationInput,automationInput,eligiblePublication,generatePublications,signalInput,summarizePublications,recordVillegramBooking} from '../_shared/villegram-publications.ts';
import {commentText} from '../_shared/villegram.ts';
const projectUrl=Deno.env.get('SUPABASE_URL')!,admin=createClient(projectUrl,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-chalezinho-env','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
async function user(req:Request){const token=(req.headers.get('authorization')||'').replace(/^Bearer /i,'');if(!token)return null;const r=await admin.auth.getUser(token);return r.error?null:r.data.user;}
async function manager(u:any){if(!u)return false;const p=await admin.from('profiles').select('role,pms_access_status').eq('id',u.id).maybeSingle();return p.data?.role==='admin'&&p.data?.pms_access_status==='active';}
async function catalog(){const [p,e,o]=await Promise.all([admin.from('properties').select('id,code,slug,name,active,tagline,summary,cover_image,gallery,features,max_guests'),admin.from('experience_products').select('id,name,status,description,inventory,travel_purposes,experience_media(media_url,alt_text,display_order),experience_property_eligibility(property_id)'),admin.from('stay_offers').select('id,name,description,status,property_ids,villegram,product_ids')]);if(p.error||e.error||o.error)throw Error('catalog_unavailable');return {properties:p.data||[],products:e.data||[],offers:o.data||[]};}
async function settings(){const r=await admin.from('villegram_automation').select('*').eq('id',1).single();if(r.error)throw Error('settings_unavailable');return r.data;}
async function generate(force=false){const s=await settings();if(!s.enabled&&!force)return {created:0};const now=new Date(),since=now.getTime()-Number(s.frequency_hours)*3600000;if(!force&&Date.parse(s.last_generated_at||'')>since)return {created:0};
 const claim=admin.from('villegram_automation').update({last_generated_at:now.toISOString()}).eq('id',1);const r=await(s.last_generated_at?claim.eq('last_generated_at',s.last_generated_at):claim.is('last_generated_at',null)).select('id');if(r.error)throw Error('generation_failed');if(!r.data?.length)return {created:0};
 try{const c=await catalog(),rows=generatePublications(c.properties,c.products,c.offers,s,now);if(!rows.length)return {created:0};const saved=await admin.from('villegram_publications').upsert(rows,{onConflict:'source_key',ignoreDuplicates:true}).select('id');if(saved.error)throw Error('generation_failed');return {created:saved.data?.length||0};}
 catch(e){await admin.from('villegram_automation').update({last_generated_at:s.last_generated_at}).eq('last_generated_at',now.toISOString());throw e;}
}
async function resolveMedia(posts:any[]){return Promise.all(posts.map(async p=>({...p,media:await Promise.all(p.media.map(async(m:any)=>{const out={...m};for(const [path,key] of [[m.path,'url'],[m.poster_path,'poster']])if(path){const r=await admin.storage.from('villegram-media').createSignedUrl(path,1800);if(r.error)throw Error('media_unavailable');out[key]=r.data.signedUrl;}return out;}))})));}
async function paginated(table:string,columns:string,days:number){const rows:any[]=[];for(let n=0;n<100000;n+=1000){const r=await admin.from(table).select(columns).gte('created_at',new Date(Date.now()-days*86400000).toISOString()).order('created_at').order('id').range(n,n+999);if(r.error)throw Error('report_unavailable');rows.push(...r.data||[]);if(r.data!.length<1000)return rows;}throw Error('report_volume_limit');}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 // This function cannot operate on PROD, even if a caller spoofs its environment header.
 if(new URL(projectUrl).hostname!=='pxfqmnhqodqyaaqeyjgr.supabase.co')return json({ok:false,error:'development_only'},403);
 try{
 const query=new URL(req.url).searchParams,body=req.method==='POST'?await req.json():{},op=body.operation||query.get('operation')||'feed';
 if(op==='feed'||op==='generate_due'){
  await generate();if(op==='generate_due')return json({ok:true});
  const [c,s,posts]=await Promise.all([catalog(),settings(),admin.from('villegram_publications').select('*').eq('status','published').order('featured',{ascending:false}).order('display_order').order('created_at').limit(200)]);if(posts.error)throw Error('feed_unavailable');
  const eligible=(posts.data||[]).filter(p=>eligiblePublication(p,c.properties,c.products,c.offers));return json({ok:true,publications:await resolveMedia(eligible),...c,max_offers:s.max_offers,checked_at:new Date().toISOString()});
 }
 if(op==='signals'){
  if(!Array.isArray(body.events)||body.events.length<1||body.events.length>25)return json({ok:false,error:'invalid_signals'},400);
  const events=body.events.map(signalInput),ids=[...new Set(events.map((e:any)=>e.publication_id))];const p=await admin.from('villegram_publications').select('id').eq('status','published').in('id',ids);if(p.error||p.data?.length!==ids.length)return json({ok:false,error:'publication_unavailable'},404);
  // Natural keys also deduplicate a retry with a different event ID.
  const r=await admin.from('villegram_signals').upsert(events,{onConflict:'view_id,kind,sequence',ignoreDuplicates:true});if(r.error)throw Error('signal_failed');return json({ok:true});
 }
 const u=await user(req),isAdmin=await manager(u);
 if(op==='attribute'){
  if(!u)return json({ok:false,error:'authentication_required'},401);
  const r=await admin.from('reservations').select('id,user_id,source,created_at').eq('id',body.reservation_id).eq('user_id',u.id).maybeSingle();
  if(r.error||!r.data||r.data.source!=='direct'||Date.parse(r.data.created_at)<Date.now()-86400000)return json({ok:false,error:'reservation_unavailable'},404);
  await recordVillegramBooking(admin,r.data.id,body.attribution,u.id);return json({ok:true});
 }
 if(op==='social'||op==='like'||op==='comment'||op==='remove_comment'){
  const p=await admin.from('villegram_publications').select('id,status').eq('id',body.publication_id).maybeSingle();if(!p.data||p.data.status!=='published'&&!isAdmin)return json({ok:false,error:'publication_unavailable'},404);
  if(op!=='social'&&!u)return json({ok:false,error:'authentication_required'},401);
  if(op==='like'){if(typeof body.liked!=='boolean')return json({ok:false,error:'invalid_like'},400);const r=body.liked?await admin.from('villegram_post_likes').upsert({publication_id:p.data.id,user_id:u!.id},{onConflict:'publication_id,user_id',ignoreDuplicates:true}):await admin.from('villegram_post_likes').delete().eq('publication_id',p.data.id).eq('user_id',u!.id);if(r.error)throw Error('interaction_failed');}
  if(op==='comment'){const text=commentText(body.text);if(!/^[a-f0-9-]{36}$/i.test(body.request_id||''))return json({ok:false,error:'invalid_request'},400);const existing=await admin.from('villegram_post_comments').select('user_id,publication_id').eq('id',body.request_id).maybeSingle();if(existing.error)throw Error('interaction_failed');if(existing.data&&(existing.data.user_id!==u!.id||existing.data.publication_id!==p.data.id))return json({ok:false,error:'invalid_request'},409);
   if(!existing.data){const recent=await admin.from('villegram_post_comments').select('id',{head:true,count:'exact'}).eq('user_id',u!.id).gte('created_at',new Date(Date.now()-60000).toISOString());if(recent.error)throw Error('interaction_failed');if((recent.count||0)>=3)return json({ok:false,error:'comment_rate_limit'},429);const profile=await admin.from('profiles').select('full_name').eq('id',u!.id).maybeSingle();const r=await admin.from('villegram_post_comments').upsert({id:body.request_id,publication_id:p.data.id,user_id:u!.id,display_name:(profile.data?.full_name||'Hóspede').trim().split(/\s+/)[0].slice(0,80),body:text},{onConflict:'id',ignoreDuplicates:true});if(r.error)throw Error('interaction_failed');}}
  if(op==='remove_comment'){if(!isAdmin)return json({ok:false,error:'admin_required'},403);const r=await admin.from('villegram_post_comments').update({status:'removed',removed_at:new Date().toISOString()}).eq('id',body.comment_id).eq('publication_id',p.data.id);if(r.error)throw Error('interaction_failed');}
  const [likes,comments,mine]=await Promise.all([admin.from('villegram_post_likes').select('user_id',{head:true,count:'exact'}).eq('publication_id',p.data.id),admin.from('villegram_post_comments').select('id,display_name,body,created_at').eq('publication_id',p.data.id).eq('status','visible').order('created_at',{ascending:false}).limit(50),u?admin.from('villegram_post_likes').select('user_id').eq('publication_id',p.data.id).eq('user_id',u.id).maybeSingle():Promise.resolve({data:null,error:null})]);if(likes.error||comments.error||mine.error)throw Error('interaction_failed');return json({ok:true,likes:likes.count||0,liked:!!mine.data,comments:comments.data||[]});
 }
 if(!isAdmin)return json({ok:false,error:'admin_required'},403);
 if(op==='admin_list'){const [c,s,p]=await Promise.all([catalog(),settings(),admin.from('villegram_publications').select('*').order('display_order').order('created_at',{ascending:false}).limit(300)]);if(p.error)throw Error('list_unavailable');return json({ok:true,...c,settings:s,publications:await resolveMedia(p.data||[])});}
 if(op==='save_settings'){const value=automationInput(body.settings);const r=await admin.from('villegram_automation').update({...value,updated_at:new Date().toISOString()}).eq('id',1).eq('updated_at',body.updated_at||'').select().maybeSingle();if(r.error||!r.data)return json({ok:false,error:'edit_conflict'},409);return json({ok:true,settings:r.data});}
 if(op==='generate')return json({ok:true,...await generate(true)});
 if(op==='save'||op==='preview'){
  const value=publicationInput(body.publication,projectUrl),c=await catalog();
  if(value.property_id&&!c.properties.some(p=>p.id===value.property_id)||value.experience_id&&!c.products.some(p=>p.id===value.experience_id)||value.offer_id&&!c.offers.some(p=>p.id===value.offer_id))return json({ok:false,error:'invalid_link'},400);
  // Uploaded paths belong to this editor's author. An edit may retain the original author's files.
  const existing=body.id?await admin.from('villegram_publications').select('*').eq('id',body.id).maybeSingle():{data:null,error:null};if(body.id&&(!existing.data||existing.error))return json({ok:false,error:'publication_unavailable'},404);
  for(const m of value.media)for(const path of [m.path,m.poster_path].filter(Boolean)){if(!path.startsWith(u!.id+'/')&&!existing.data?.media.some((x:any)=>x.path===path||x.poster_path===path))return json({ok:false,error:'invalid_media_owner'},400);const [folder,name]=path.split('/');const files=await admin.storage.from('villegram-media').list(folder,{search:name,limit:1});if(files.error||!files.data?.some(f=>f.name===name))return json({ok:false,error:'media_upload_incomplete'},409);}
  if(value.status==='published'){value.published_at ||= new Date().toISOString();if(!eligiblePublication(value,c.properties,c.products,c.offers,Math.max(Date.now(),Date.parse(value.published_at))))return json({ok:false,error:'link_unavailable'},409);}
  if(op==='preview')return json({ok:true,publication:(await resolveMedia([{...existing.data,...value}]))[0],...c});
  const r=body.id?await admin.from('villegram_publications').update({...value,updated_at:new Date().toISOString()}).eq('id',body.id).eq('updated_at',body.updated_at||'').select().maybeSingle():await admin.from('villegram_publications').insert({...value,source:'manual',author_id:u!.id,author_name:'Equipe Chalezinho Ville'}).select().single();if(r.error||!r.data)return json({ok:false,error:body.id?'edit_conflict':'save_failed'},409);
  await admin.from('audit_events').insert({actor_user_id:u!.id,action:'villegram_publication_saved',entity_type:'villegram_publication',entity_id:r.data.id,new_value:{status:r.data.status,type:r.data.type}});return json({ok:true,publication:(await resolveMedia([r.data]))[0]});
 }
 if(op==='report'){const days=Number(body.days||30);if(![7,30,90].includes(days))return json({ok:false,error:'invalid_period'},400);const [p,events,attrs]=await Promise.all([admin.from('villegram_publications').select('id,title,status').limit(300),paginated('villegram_signals','id,publication_id,visitor_id,session_id,view_id,kind,active_ms',days),paginated('villegram_attributions','id,publication_id,reservation_id',days)]);if(p.error)throw Error('report_unavailable');const ids=[...new Set(attrs.map(a=>a.reservation_id))],reservations:any[]=[];for(let n=0;n<ids.length;n+=100){const r=await admin.from('reservations').select('id,status,source,payments(status,provider,metadata)').in('id',ids.slice(n,n+100));if(r.error)throw Error('report_unavailable');reservations.push(...r.data||[]);}return json({ok:true,days,rows:summarizePublications(p.data||[],events,attrs,reservations)});}
 return json({ok:false,error:'invalid_operation'},400);
 }catch(error){const code=(error as Error).message;const invalid=/^invalid_|^link_required|^one_video|^audio_|^comment_/.test(code);return json({ok:false,error:invalid?code:'service_unavailable'},invalid?400:503);}
});
