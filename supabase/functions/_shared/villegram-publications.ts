import {staySelectionInput} from './villegram-stay.ts';
type Row=Record<string,any>;
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
export const publicationTypes=['property','experience','offer','trust'];
export const signalTypes=['view','progress','complete','repeat','skip','like','share','comment','property_open','experience_open','inclusions_open','dates_query','reservation_start'];
export function publicationInput(raw:Row,projectUrl:string){
 const stay_selection=staySelectionInput(raw.stay_selection);
 const type=raw.type,caption=String(raw.caption||'').trim(),title=String(raw.title||'').trim();
 const status=raw.status||'draft',media=raw.media,property_id=raw.property_id?Number(raw.property_id):null,experience_id=raw.experience_id||null,offer_id=raw.offer_id||null;
 if(!publicationTypes.includes(type)||!['draft','published','archived','pending_review'].includes(status)||!title||title.length>140||!caption||caption.length>3000||!Array.isArray(media)||media.length<1||media.length>8)throw Error('invalid_publication');
 if(property_id!==null&&(!Number.isSafeInteger(property_id)||property_id<1)||experience_id&&!uuid(experience_id)||offer_id&&!uuid(offer_id))throw Error('invalid_link');
 if(type==='property'&&!property_id||type==='experience'&&!experience_id||type==='offer'&&!offer_id&&!stay_selection)throw Error('link_required');
 // Catalog photos may carry a cache version, e.g. cover.webp?v=2.
 // Keep the original URL while validating the asset path separately from its query.
 const safeURL=(url:any)=>typeof url==='string'&&((/^assets\/[a-zA-Z0-9._/-]+\.(webp|jpg|jpeg|png|avif)(\?[a-zA-Z0-9._~%=&+-]*)?$/.test(url)&&!url.split('?')[0].split('/').some(segment=>segment==='.'||segment==='..'))||url.startsWith(projectUrl+'/storage/v1/object/public/property-media/')||url.startsWith(projectUrl+'/storage/v1/object/public/experience-media/'));
 const path=(v:any)=>typeof v==='string'&&/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.(webp|mp4|webm|jpg)$/i.test(v);
 const normalized=media.map((m:Row)=>{
  if(!['photo','video'].includes(m.kind)||m.path&&!path(m.path)||!m.path&&!safeURL(m.url)||m.kind==='video'&&!m.path||!['contain','cover'].includes(m.fit||'contain')||!Number.isFinite(Number(m.position??50))||Number(m.position??50)<0||Number(m.position??50)>100||!Number.isFinite(Number(m.position_x??50))||Number(m.position_x??50)<0||Number(m.position_x??50)>100||!Number.isFinite(Number(m.zoom??1))||Number(m.zoom??1)<1||Number(m.zoom??1)>3)throw Error('invalid_media');
  if(['offset_x','offset_y'].some(key=>!Number.isFinite(Number(m[key]??0))||Math.abs(Number(m[key]??0))>300))throw Error('invalid_media');
  if(m.path&&!(m.kind==='video'?/\.(mp4|webm)$/i:/\.(webp|jpg)$/i).test(m.path))throw Error('invalid_media');
  if(m.kind==='video'&&(!path(m.poster_path)||!(/\.(webp|jpg)$/i).test(m.poster_path)||!Number.isFinite(Number(m.duration))||Number(m.duration)<=0||Number(m.duration)>120||!Number.isSafeInteger(Number(m.bytes))||Number(m.bytes)<=0||Number(m.bytes)>50*1024*1024))throw Error('invalid_video');
  return {kind:m.kind,path:null,url:null,poster_path:null,...(m.path?{path:m.path}:{url:m.url}),...(m.poster_path?{poster_path:m.poster_path}:{}),fit:m.fit||'contain',position:Number(m.position??50),position_x:Number(m.position_x??50),zoom:Number(m.zoom??1),offset_x:Number(m.offset_x??0),offset_y:Number(m.offset_y??0),alt:String(m.alt||title).slice(0,160),...(m.kind==='video'?{duration:Number(m.duration),bytes:Number(m.bytes)}:{})};
 });
 if(normalized.some(m=>m.kind==='video')&&normalized.length!==1)throw Error('one_video_required');
 const cover_index=Number(raw.cover_index||0),display_order=Number(raw.display_order||0),cta=raw.cta||({property:'property',experience:'experience',offer:'offer',trust:'dates'} as Row)[type];
 if(!Number.isInteger(cover_index)||cover_index<0||cover_index>=media.length||!Number.isInteger(display_order)||Math.abs(display_order)>10000||!['property','experience','offer','dates'].includes(cta)||cta==='property'&&!property_id||cta==='experience'&&!experience_id||cta==='offer'&&!offer_id&&!stay_selection)throw Error('invalid_action');
 const published_at=raw.published_at||null,expires_at=raw.expires_at||null;
 if([published_at,expires_at].some(x=>x&&!Number.isFinite(Date.parse(x)))||published_at&&expires_at&&Date.parse(expires_at)<=Date.parse(published_at))throw Error('invalid_period');
 if(stay_selection&&!property_id)throw Error('invalid_stay_selection');
 return {stay_selection,type,title,caption,status,media:normalized,property_id,experience_id,offer_id,cta,cover_index,display_order,featured:raw.featured===true,published_at,expires_at};
}
export function automationInput(raw:Row={}){
 const frequency_hours=Number(raw.frequency_hours??24),max_offers=Number(raw.max_offers??3);
 if(![6,12,24,48,168].includes(frequency_hours)||!Number.isInteger(max_offers)||max_offers<0||max_offers>6)throw Error('invalid_automation');
 const templates:Row={};
 for(const type of publicationTypes){const t=raw.templates?.[type]||{};templates[type]={enabled:t.enabled!==false,title:String(t.title||'{name}').slice(0,140),caption:String(t.caption||'{description}').slice(0,3000),motion:['gentle','slow','romantic'].includes(t.motion)?t.motion:'gentle'};}
 return {enabled:raw.enabled!==false,auto_publish:raw.auto_publish===true,frequency_hours,max_offers,templates};
}
export function eligiblePublication(p:Row,properties:Row[],products:Row[],offers:Row[],now=Date.now()){
 return p.status==='published'&&Date.parse(p.published_at||'')<=now&&(!p.expires_at||Date.parse(p.expires_at)>now)&&(!p.property_id||properties.some(x=>x.id===p.property_id&&x.active!==false))&&(!p.experience_id||products.some(x=>x.id===p.experience_id&&x.status==='active'&&(x.inventory==null||x.inventory>0)))&&(!p.offer_id||offers.some(x=>x.id===p.offer_id&&x.status==='active'));
}
export function generatePublications(properties:Row[],products:Row[],offers:Row[],settings:Row,now=new Date()){
 const rows:Row[]=[],template=(type:string,p:Row)=>{const t=settings.templates[type];return {title:t.title.replaceAll('{name}',p.name||'Como reservar').replaceAll('{description}',p.description||'').trim().slice(0,140),caption:t.caption.replaceAll('{name}',p.name||'Como reservar').replaceAll('{description}',p.description||'').trim().slice(0,3000)};};
 function add(type:string,key:string,p:Row,links:Row,media:Row[]){if(!settings.templates[type].enabled||!media.length)return;const text=template(type,p);if(!text.caption.trim())return;rows.push({type,source:'automatic',source_key:key,...text,...links,media:media.slice(0,8).map(m=>({...m,fit:'contain',position:50,alt:p.name})),cover_index:0,cta:({property:'property',experience:'experience',offer:'offer',trust:'dates'} as Row)[type],motion:settings.templates[type].motion,status:settings.auto_publish?'published':'draft',published_at:settings.auto_publish?now.toISOString():null,display_order:rows.length*10,author_name:'Equipe Chalezinho Ville'});}
 for(const p of properties.filter(p=>p.active!==false)){const media=(p.gallery?.length?p.gallery:[p.cover_image]).filter(Boolean).map((m:any)=>({kind:'photo',url:typeof m==='string'?m:m.url})).filter((m:Row)=>m.url);add('property','property:'+p.id,{name:p.name,description:p.summary||p.tagline},{property_id:p.id},media);}
 for(const p of products.filter(p=>p.status==='active')){const media=(p.experience_media||[]).sort((a:Row,b:Row)=>a.display_order-b.display_order).map((m:Row)=>({kind:'photo',url:m.media_url}));add('experience','experience:'+p.id,p,{experience_id:p.id,property_id:p.experience_property_eligibility?.[0]?.property_id||null},media);}
 for(const o of offers.filter(o=>o.status==='active'))for(const id of o.property_ids){const p=properties.find(p=>p.id===id&&p.active!==false);if(p)add('offer','offer:'+o.id+':'+id,{name:o.name,description:o.description},{offer_id:o.id,property_id:id},(o.villegram?.photos||[]).filter((m:Row)=>m.property_id===id).map((m:Row)=>({kind:'photo',url:m.url})).concat([{kind:'photo',url:p.cover_image}]).filter((m:Row)=>m.url));}
 const p=properties.find(p=>p.cover_image);if(p)add('trust','trust:booking',{name:'Do seu jeito',description:'Escolha datas, hóspedes e motivo. Compare os chalés disponíveis, componha a estadia e escolha sua tarifa. O login vem na finalização.'},{},[{kind:'photo',url:p.cover_image}]);
 return rows;
}
export function signalInput(raw:Row){
 if(!uuid(raw.event_id)||!uuid(raw.publication_id)||!uuid(raw.visitor_id)||!uuid(raw.session_id)||!uuid(raw.view_id)||!signalTypes.includes(raw.kind))throw Error('invalid_signal');
 const active_ms=Number(raw.active_ms||0),sequence=Number(raw.sequence||0),loop=Number(raw.loop||0);
 if(!Number.isInteger(active_ms)||active_ms<0||active_ms>7200000||!Number.isInteger(sequence)||sequence<0||sequence>10000||!Number.isInteger(loop)||loop<0||loop>1000)throw Error('invalid_signal');
 return {id:raw.event_id,publication_id:raw.publication_id,visitor_id:raw.visitor_id,session_id:raw.session_id,view_id:raw.view_id,kind:raw.kind,active_ms,sequence,loop,metadata:{}};
}
export function summarizePublications(posts:Row[],events:Row[],attributions:Row[],reservations:Row[]){
 const paid=new Set(reservations.filter(r=>r.status==='confirmed'&&r.source==='direct'&&(r.payments||[]).some((p:Row)=>['paid','partially_refunded'].includes(p.status)&&['pagbank','pagbank_sandbox'].includes(p.provider)&&(!p.metadata?.kind||p.metadata.kind==='reservation'))).map(r=>r.id));
 return posts.map(p=>{const signals=events.filter(e=>e.publication_id===p.id),k=(kind:string)=>new Set(signals.filter(e=>e.kind===kind).map(e=>e.view_id)).size,starts=attributions.filter(a=>a.publication_id===p.id);const views=new Set(signals.filter(e=>e.kind==='view').map(e=>e.view_id));
  const times=new Map<string,number>();for(const e of signals)times.set(e.view_id,Math.max(times.get(e.view_id)||0,e.active_ms||0));
  return {id:p.id,title:p.title,status:p.status,views:views.size,visitors:new Set(signals.filter(e=>e.kind==='view').map(e=>e.visitor_id)).size,sessions:new Set(signals.filter(e=>e.kind==='view').map(e=>e.session_id)).size,active_ms:[...times.values()].reduce((a,b)=>a+b,0),completed:k('complete'),repeated:k('repeat'),quick_passes:k('skip'),interest:k('like')+k('comment')+k('share'),clicks:k('property_open')+k('experience_open'),date_queries:k('dates_query'),reservation_intent:k('reservation_start'),reservations_started:new Set(starts.map(a=>a.reservation_id)).size,reservations_paid:new Set(starts.filter(a=>paid.has(a.reservation_id)).map(a=>a.reservation_id)).size};});
}
// Attribution can only be committed by the authenticated checkout. Browser events cannot assert payment.
export async function recordVillegramBooking(db:any,reservationId:string,raw:Row,userId:string){
 if(!raw||![raw.publication_id,raw.visitor_id,raw.session_id,raw.view_id].every(uuid))return;
 try{const v=await db.from('villegram_signals').select('id,created_at').eq('publication_id',raw.publication_id).eq('visitor_id',raw.visitor_id).eq('session_id',raw.session_id).eq('view_id',raw.view_id).eq('kind','view').gte('created_at',new Date(Date.now()-86400000).toISOString()).maybeSingle();if(!v.data||v.error)return;
  await db.from('villegram_attributions').upsert({reservation_id:reservationId,publication_id:raw.publication_id,visitor_id:raw.visitor_id,session_id:raw.session_id,view_id:raw.view_id,user_id:userId},{onConflict:'reservation_id',ignoreDuplicates:true});
 }catch{console.warn('villegram_attribution_unavailable');}
}
