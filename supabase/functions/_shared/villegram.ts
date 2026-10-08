type Row=Record<string,any>;
export function validateVillegram(raw:Row={}) {
 const title=String(raw.title||'').trim().slice(0,140),audio=raw.audio||null;
 const photos=Array.isArray(raw.photos)?raw.photos:[];
 if(photos.length>30||photos.some((p:Row)=>typeof p.url!=='string'||!Number.isInteger(Number(p.property_id))||Number(p.property_id)<1))throw Error('invalid_villegram_media');
 if(audio&&(!audio.url||!String(audio.origin||'').trim()||!String(audio.license||'').trim()))throw Error('audio_license_required');
 return {title,photos:photos.map((p:Row)=>({url:p.url,property_id:Number(p.property_id),alt:String(p.alt||'').slice(0,160)})),motion:['gentle','slow','romantic'].includes(raw.motion)?raw.motion:'gentle',audio:audio?{url:String(audio.url),origin:String(audio.origin).slice(0,500),license:String(audio.license).slice(0,1000)}:null};
}
export function commentText(value:any){const text=String(value||'').trim();if(!text||text.length>500||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))throw Error('invalid_comment');return text;}
export function villegramService({admin,currentUser,userIsAdmin,json}:Row){
 return async(req:Request,body:Row,development:boolean)=>{
  if(!development)return json({ok:false,error:'development_only'},403);
  const id=body.offer_id;if(!/^[a-f0-9-]{36}$/i.test(id||''))return json({ok:false,error:'invalid_offer'},400);
  const user=await currentUser(req),manager=user&&await userIsAdmin(user);
  const {data:offer}=await admin.from('stay_offers').select('id,status').eq('id',id).maybeSingle();
  if(!offer||(offer.status!=='active'&&!manager))return json({ok:false,error:'offer_unavailable'},404);
  const op=body.operation||'list';
  if(op!=='list'&&!user)return json({ok:false,error:'authentication_required'},401);
  if(op==='like'){
   if(typeof body.liked!=='boolean')return json({ok:false,error:'invalid_like'},400);
   const r=body.liked?await admin.from('villegram_likes').upsert({offer_id:id,user_id:user.id},{onConflict:'offer_id,user_id',ignoreDuplicates:true}):await admin.from('villegram_likes').delete().eq('offer_id',id).eq('user_id',user.id);
   if(r.error)return json({ok:false,error:'interaction_failed'},500);
  }else if(op==='comment'){
   let text;try{text=commentText(body.text)}catch{return json({ok:false,error:'invalid_comment'},400)}
   // A unique request id makes repeated submissions idempotent. Author checks prevent cross-user retries.
   if(!/^[a-f0-9-]{36}$/i.test(body.request_id||''))return json({ok:false,error:'invalid_request'},400);
   const existing=await admin.from('villegram_comments').select('user_id').eq('id',body.request_id).maybeSingle();
   if(existing.data&&existing.data.user_id!==user.id)return json({ok:false,error:'invalid_request'},409);
   if(!existing.data){
    const recent=await admin.from('villegram_comments').select('id',{count:'exact',head:true}).eq('user_id',user.id).gte('created_at',new Date(Date.now()-60000).toISOString());
    if(recent.error)return json({ok:false,error:'interaction_failed'},500);
    if((recent.count||0)>=3)return json({ok:false,error:'comment_rate_limit'},429);
    const profile=await admin.from('profiles').select('full_name').eq('id',user.id).maybeSingle();
    const name=String(profile.data?.full_name||'Hóspede').trim().split(/\s+/)[0].slice(0,80)||'Hóspede';
    const r=await admin.from('villegram_comments').upsert({id:body.request_id,offer_id:id,user_id:user.id,display_name:name,body:text},{onConflict:'id',ignoreDuplicates:true});
    if(r.error)return json({ok:false,error:'interaction_failed'},500);
   }
  }else if(op==='remove'){
   if(!manager)return json({ok:false,error:'admin_required'},403);
   const r=await admin.from('villegram_comments').update({status:'removed',removed_at:new Date().toISOString()}).eq('id',body.comment_id).eq('offer_id',id);
   if(r.error)return json({ok:false,error:'interaction_failed'},500);
   await admin.from('audit_events').insert({actor_user_id:user.id,action:'villegram_comment_removed',entity_type:'stay_offer',entity_id:id,new_value:{comment_id:body.comment_id}});
  }else if(op!=='list')return json({ok:false,error:'invalid_operation'},400);
  const [likes,comments,mine]=await Promise.all([
   admin.from('villegram_likes').select('user_id',{count:'exact',head:true}).eq('offer_id',id),
   admin.from('villegram_comments').select('id,display_name,body,created_at,status',{count:'exact'}).eq('offer_id',id).eq('status','visible').order('created_at',{ascending:false}).limit(50),
   user?admin.from('villegram_likes').select('offer_id').eq('offer_id',id).eq('user_id',user.id).maybeSingle():Promise.resolve({data:null,error:null})]);
  if(likes.error||comments.error||mine.error)return json({ok:false,error:'interaction_failed'},500);
  return json({ok:true,likes:likes.count||0,liked:!!mine.data,comments_count:comments.count||0,comments:comments.data||[],can_moderate:!!manager});
 };
}
