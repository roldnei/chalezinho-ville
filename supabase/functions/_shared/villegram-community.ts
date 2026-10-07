import {publicationInput} from './villegram-publications.ts';
type Row=Record<string,any>;
export const publicProfileColumns='id,handle,display_name,bio,avatar_path,is_public';
export function profileInput(raw:Row={}){
 const handle=String(raw.handle||'').trim().toLowerCase().replace(/^@/,'');
 const display_name=String(raw.display_name||'').trim(),bio=String(raw.bio||'').trim();
 if(!/^[a-z][a-z0-9_]{2,23}$/.test(handle)||['admin','villegram','chalezinho','equipe','suporte'].includes(handle)||!display_name||display_name.length>60||bio.length>240||typeof raw.is_public!=='boolean')throw Error('invalid_profile');
 return {handle,display_name,bio,is_public:raw.is_public,avatar_path:raw.avatar_path||null};
}
export function avatarBytes(value:unknown){
 if(typeof value!=='string'||!value||value.length>1400000||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))throw Error('invalid_avatar');
 let bytes:Uint8Array;try{bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0))}catch{throw Error('invalid_avatar')}
 if(bytes.length>1024*1024||bytes.length<16||String.fromCharCode(...bytes.slice(0,4))!=='RIFF'||String.fromCharCode(...bytes.slice(8,12))!=='WEBP')throw Error('invalid_avatar');return bytes;
}
export function guestInput(raw:Row,projectUrl:string,userId:string){
 // Guest author, source, moderation, commercial links and dates are server-controlled.
 const value=publicationInput({...raw,type:raw.property_id?'property':'trust',cta:raw.property_id?'property':'dates',status:raw.status==='archived'?'archived':raw.status==='draft'?'draft':'pending_review',offer_id:null,experience_id:null,stay_selection:null,display_order:0,featured:false,published_at:null,expires_at:null},projectUrl);
 if(value.media.some(m=>!m.path?.startsWith(userId+'/')||m.poster_path&&!m.poster_path.startsWith(userId+'/')))throw Error('invalid_media_owner');
 return value;
}
export function mentionHandles(raw:unknown){
 if(raw==null)return [];
 if(!Array.isArray(raw)||raw.length>10)throw Error('invalid_mentions');
 const handles=[...new Set(raw.map(v=>String(v).replace(/^@/,'').toLowerCase().trim()))];
 if(handles.some(v=>! /^[a-z][a-z0-9_]{2,23}$/.test(v)))throw Error('invalid_mentions');
 return handles;
}
export async function communityPublic(db:any,posts:Row[]){
 const ids=[...new Set(posts.filter(p=>p.source==='guest_submission').map(p=>p.author_id))];
 if(!ids.length)return posts;
 const r=await db.from('villegram_profiles').select(publicProfileColumns).in('id',ids).eq('is_public',true);if(r.error)throw Error('community_unavailable');
 const tags=await db.from('villegram_mentions').select('publication_id,user_id').in('publication_id',posts.map(p=>p.id)).eq('status','accepted');if(tags.error)throw Error('community_unavailable');
 const tagIds=[...new Set((tags.data||[]).map((t:Row)=>t.user_id))];
 const people=tagIds.length?await db.from('villegram_profiles').select('id,handle,display_name').in('id',tagIds).eq('is_public',true):{data:[]};if(people.error)throw Error('community_unavailable');
 return posts.filter(p=>p.source!=='guest_submission'||r.data.some((v:Row)=>v.id===p.author_id)).map(p=>{
  const author=r.data.find((v:Row)=>v.id===p.author_id);
  return {...p,...(author?{author_name:author.display_name,author_handle:author.handle}:{}),mentions:(tags.data||[]).filter((t:Row)=>t.publication_id===p.id).map((t:Row)=>people.data.find((v:Row)=>v.id===t.user_id)).filter(Boolean).map((v:Row)=>({handle:v.handle,display_name:v.display_name}))};
 });
}
export async function communityOperation(ctx:any){
 const {db,u,isAdmin,body,op,projectUrl,catalog,resolveMedia}=ctx;
 const fail=(code:string,status=400)=>({body:{ok:false,error:code},status});
 const ok=(data:Row={})=>({body:{ok:true,...data},status:200});
 const mine=async()=>{const r=await db.from('villegram_profiles').select('*').eq('id',u.id).maybeSingle();if(r.error)throw Error('community_unavailable');return r.data;};
 const check=async(query:any)=>{const r=await query;if(r.error)throw Error('community_unavailable');return r.data;};
 const mediaExists=async(path:string)=>{if(!new RegExp('^'+u.id+'/[a-f0-9-]{36}\\.(webp|jpg|mp4|webm)$','i').test(path))throw Error('invalid_media_owner');const [folder,name]=path.split('/'),r=await db.storage.from('villegram-media').list(folder,{search:name,limit:1});if(r.error||!r.data?.some((f:Row)=>f.name===name))throw Error('invalid_media_upload');};
 const eligible=async()=>{const r=await db.from('reservations').select('property_id').eq('user_id',u.id).eq('status','confirmed').limit(30);if(r.error)throw Error('community_unavailable');const invite=await db.from('villegram_invites').select('id').eq('accepted_by',u.id).limit(1);if(invite.error)throw Error('community_unavailable');return {allowed:!!r.data?.length||!!invite.data?.length||isAdmin,property_ids:[...new Set((r.data||[]).map((v:Row)=>v.property_id))]};};
 if(op==='community_profile'||op==='community_people'){
  const q=db.from('villegram_profiles').select(publicProfileColumns).eq('is_public',true);
  if(op==='community_people'){const term=String(body.search||'').toLowerCase().replace(/[^a-z0-9_]/g,'').slice(0,24);const rows=await check(q.ilike('handle',term+'%').order('handle').limit(30));return ok({people:rows.map(({avatar_path,is_public,...p}:Row)=>p)});}
  const p=await check(q.eq('handle',String(body.handle||'').toLowerCase()).maybeSingle());if(!p)return fail('profile_unavailable',404);
  const [posts,followers,following,self]=await Promise.all([db.from('villegram_publications').select('*').eq('author_id',p.id).eq('source','guest_submission').eq('status','published').order('published_at',{ascending:false}).limit(60),db.from('villegram_follows').select('*',{count:'exact',head:true}).eq('followed_id',p.id),db.from('villegram_follows').select('*',{count:'exact',head:true}).eq('follower_id',p.id),u?db.from('villegram_follows').select('followed_id').eq('follower_id',u.id).eq('followed_id',p.id).maybeSingle():Promise.resolve({data:null})]);
  if(posts.error||followers.error||following.error||self.error)throw Error('community_unavailable');
  let avatar_url=null;if(p.avatar_path){const signed=await db.storage.from('villegram-media').createSignedUrl(p.avatar_path,1800);avatar_url=signed.data?.signedUrl||null;}
  return ok({profile:{id:p.id,handle:p.handle,display_name:p.display_name,bio:p.bio,avatar_url},followers:followers.count,following:following.count,is_following:!!self.data,is_self:u?.id===p.id,publications:await resolveMedia(await communityPublic(db,posts.data||[]))});
 }
 if(!u||u.is_anonymous)return fail('authentication_required',401);
 if(op==='community_review_status'){
  if(!isAdmin)return ok({can_moderate:false});
  const r=await db.from('villegram_publications').select('id',{count:'exact',head:true}).eq('source','guest_submission').eq('status','pending_review');
  if(r.error)throw Error('community_unavailable');return ok({can_moderate:true,pending_count:r.count||0});
 }
 if(op==='community_review_queue'){
  if(!isAdmin)return fail('admin_required',403);
  const page=body.page??0;if(!Number.isSafeInteger(page)||page<0||page>10000)return fail('invalid_page');
  const r=await db.from('villegram_publications').select('*',{count:'exact'}).eq('source','guest_submission').eq('status','pending_review').order('created_at').order('id').range(page*50,page*50+49);
  if(r.error)throw Error('community_unavailable');return ok({publications:await resolveMedia(r.data||[]),total:r.count||0,page});
 }
 if(op==='community_me'){
  const [profile,rights,posts,notifications,mentions,invites]=await Promise.all([mine(),eligible(),db.from('villegram_publications').select('*').eq('author_id',u.id).eq('source','guest_submission').order('created_at',{ascending:false}).limit(100),db.from('villegram_notifications').select('id,kind,actor_id,publication_id,created_at,read_at').eq('user_id',u.id).order('created_at',{ascending:false}).limit(60),db.from('villegram_mentions').select('publication_id,status').eq('user_id',u.id).neq('status','removed'),db.from('villegram_invites').select('id,expires_at,accepted_by,revoked_at').eq('inviter_id',u.id).order('created_at',{ascending:false}).limit(10)]);
  for(const r of [posts,notifications,mentions,invites])if(r.error)throw Error('community_unavailable');
  const taggedIds=(mentions.data||[]).map((m:Row)=>m.publication_id);const tagged=taggedIds.length?await db.from('villegram_publications').select('*').in('id',taggedIds).eq('status','published'):{data:[]};if(tagged.error)throw Error('community_unavailable');
  const publicTagged=await resolveMedia(await communityPublic(db,tagged.data||[]));
  const actors=[...new Set((notifications.data||[]).map((n:Row)=>n.actor_id).filter(Boolean))];const people=actors.length?await db.from('villegram_profiles').select('id,handle,display_name').in('id',actors).eq('is_public',true):{data:[]};if(people.error)throw Error('community_unavailable');
  let avatar_url=null;if(profile?.avatar_path){const r=await db.storage.from('villegram-media').createSignedUrl(profile.avatar_path,1800);avatar_url=r.data?.signedUrl||null;}
  return ok({profile:profile?{...profile,avatar_url}:null,...rights,publications:await resolveMedia(posts.data||[]),notifications:(notifications.data||[]).map((n:Row)=>({...n,actor:people.data.find((p:Row)=>p.id===n.actor_id)||null})),mentions:publicTagged.map((p:Row)=>({...p,mention_status:mentions.data.find((m:Row)=>m.publication_id===p.id).status})),invites:invites.data});
 }
 if(op==='community_save_profile'){
  const value=profileInput(body.profile),rights=await eligible();
  const previous=await mine();let uploaded:string|null=null;
  if(body.profile.avatar_data){const bytes=avatarBytes(body.profile.avatar_data);uploaded=u.id+'/'+crypto.randomUUID()+'.webp';const result=await db.storage.from('villegram-media').upload(uploaded,bytes,{contentType:'image/webp',upsert:false});if(result.error)return fail('avatar_upload_failed',503);value.avatar_path=uploaded;}
  else if(value.avatar_path){if(!/\.(webp|jpg)$/i.test(value.avatar_path))return fail('invalid_avatar');await mediaExists(value.avatar_path);}
  const r=await db.from('villegram_profiles').upsert({...value,id:u.id,can_post:rights.allowed,updated_at:new Date().toISOString(),consented_at:previous?.consented_at||(value.is_public?new Date().toISOString():null)}).select().single();
  if(r.error){if(uploaded)await db.storage.from('villegram-media').remove([uploaded]);return fail(r.error.code==='23505'?'handle_taken':'profile_save_failed',409)}return ok({profile:r.data});
 }
 if(op==='community_follow'){
  if(typeof body.following!=='boolean'||body.user_id===u.id)return fail('invalid_follow');
  const own=await mine();if(!own?.is_public)return fail('public_profile_required',403);
  const target=await check(db.from('villegram_profiles').select('id').eq('id',body.user_id).eq('is_public',true).maybeSingle());if(!target)return fail('profile_unavailable',404);
  await check(body.following?db.from('villegram_follows').upsert({follower_id:u.id,followed_id:target.id},{onConflict:'follower_id,followed_id',ignoreDuplicates:true}):db.from('villegram_follows').delete().eq('follower_id',u.id).eq('followed_id',target.id));return ok();
 }
 if(op==='community_read'){
  if(!Array.isArray(body.ids)||body.ids.length>60)return fail('invalid_notifications');
  await check(db.from('villegram_notifications').update({read_at:new Date().toISOString()}).eq('user_id',u.id).in('id',body.ids).is('read_at',null));return ok();
 }
 if(op==='community_mention'){
  if(!['accepted','removed'].includes(body.status))return fail('invalid_mention');
  const own=await mine();if(body.status==='accepted'&&!own?.is_public)return fail('public_profile_required',403);
  const r=await db.from('villegram_mentions').update({status:body.status}).eq('user_id',u.id).eq('publication_id',body.publication_id).select('publication_id');if(r.error)throw Error('community_unavailable');return r.data?.length?ok():fail('mention_unavailable',404);
 }
 if(op==='community_invite'){
  const own=await mine(),rights=await eligible();if(!rights.allowed||!own?.is_public)return fail('guest_profile_required',403);
  const token=crypto.randomUUID()+crypto.randomUUID(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),x=>x.toString(16).padStart(2,'0')).join('');
  const n=await db.from('villegram_invites').select('id',{count:'exact',head:true}).eq('inviter_id',u.id).gte('created_at',new Date(Date.now()-86400000).toISOString());if(n.error)throw Error('community_unavailable');if(n.count>=5)return fail('invite_limit',429);
  const expires_at=new Date(Date.now()+7*86400000).toISOString();const r=await db.from('villegram_invites').insert({inviter_id:u.id,token_hash:hash,expires_at}).select('id').single();if(r.error)throw Error('community_unavailable');return ok({token,id:r.data.id,expires_at});
 }
 if(op==='community_revoke_invite'){await check(db.from('villegram_invites').update({revoked_at:new Date().toISOString()}).eq('id',body.id).eq('inviter_id',u.id).is('accepted_by',null));return ok();}
 if(op==='community_accept_invite'){
  if(!/^[a-f0-9-]{72}$/i.test(body.token||''))return fail('invalid_invite');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body.token))),x=>x.toString(16).padStart(2,'0')).join('');
  const r=await db.rpc('villegram_accept_invite',{actor:u.id,token_digest:hash});if(r.error)return fail('invalid_invite',409);return ok();
 }
 if(op==='guest_list'){
  const profile=await mine(),rights=await eligible();if(!profile?.is_public)return fail('public_profile_required',403);if(!rights.allowed)return fail('guest_required',403);
  await check(db.from('villegram_profiles').update({can_post:true}).eq('id',u.id));
  const [c,p]=await Promise.all([catalog(),db.from('villegram_publications').select('*').eq('author_id',u.id).eq('source','guest_submission').order('created_at',{ascending:false}).limit(100)]);if(p.error)throw Error('community_unavailable');const t=p.data.length?await db.from('villegram_mentions').select('publication_id,user_id,status').in('publication_id',p.data.map((v:Row)=>v.id)):{data:[]};if(t.error)throw Error('community_unavailable');
  const tagIds=[...new Set((t.data||[]).filter((m:Row)=>p.data.some((v:Row)=>v.id===m.publication_id)).map((m:Row)=>m.user_id))];const people=tagIds.length?await db.from('villegram_profiles').select('id,handle').in('id',tagIds).eq('is_public',true):{data:[]};if(people.error)throw Error('community_unavailable');
  return ok({...c,profile,suggested_property_id:rights.property_ids[0]||null,publications:await resolveMedia(p.data.map((v:Row)=>({...v,mention_handles:t.data.filter((m:Row)=>m.publication_id===v.id&&m.status!=='removed').map((m:Row)=>people.data.find((x:Row)=>x.id===m.user_id)?.handle).filter(Boolean)}))),settings:{templates:{}}});
 }
 if(op==='guest_save'||op==='guest_preview'){
  const profile=await mine(),rights=await eligible();if(!profile?.is_public||!rights.allowed)return fail('guest_profile_required',403);
  const existing=body.id?await check(db.from('villegram_publications').select('*').eq('id',body.id).eq('author_id',u.id).eq('source','guest_submission').maybeSingle()):null;if(body.id&&!existing)return fail('publication_unavailable',404);
  const value=guestInput(body.publication,projectUrl,u.id),handles=mentionHandles(body.mentions),c=await catalog();
  if(value.property_id&&!c.properties.some((p:Row)=>p.id===value.property_id&&p.active))return fail('invalid_link');
  for(const m of value.media)for(const path of [m.path,m.poster_path].filter(Boolean))await mediaExists(path);
  const tags=handles.length?await db.from('villegram_profiles').select('id,handle').in('handle',handles).eq('is_public',true):{data:[]};if(tags.error)throw Error('community_unavailable');if(tags.data.length!==handles.length)return fail('mention_profile_unavailable');
  if(op==='guest_preview')return ok({...c,publication:(await resolveMedia([{...value,id:body.id,author_name:profile.display_name,source:'guest_submission'}]))[0]});
  const r=await db.rpc('villegram_save_guest',{actor:u.id,post_id:body.id||null,revision:body.updated_at||null,value,tagged_ids:tags.data.filter((p:Row)=>p.id!==u.id).map((p:Row)=>p.id)});if(r.error)return fail(r.error.message?.includes('post_limit')?'post_limit':'edit_conflict',409);
  return ok({publication:(await resolveMedia([{...r.data,mention_handles:handles}]))[0]});
 }
 if(op==='community_moderate'){
  if(!isAdmin)return fail('admin_required',403);if(!['published','archived'].includes(body.status))return fail('invalid_status');
  const reason=String(body.reason||'').trim().slice(0,500);if(body.status==='archived'&&!reason)return fail('moderation_reason_required');
  const r=await db.rpc('villegram_moderate',{actor:u.id,post_id:body.id,revision:body.updated_at,decision:body.status,reason});if(r.error)return fail('edit_conflict',409);return ok();
 }
 return fail('invalid_operation');
}
