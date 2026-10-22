import {commercialItem} from './release-policy.ts';
import {eligiblePublication} from './villegram-publications.ts';
export function galleryEligible(p:any,property:any,consents:any[],profiles:any[]){
 return !p.deleted_at&&p.status==='published'&&Date.parse(p.published_at||'')<=Date.now()&&p.source==='guest_submission'&&!p.offer_id&&!p.experience_id&&property?.active!==false&&property?.id===p.property_id&&commercialItem(p)&&commercialItem(property)&&profiles.some(v=>v.id===p.author_id&&v.is_public)&&consents.some(t=>t.user_id===p.author_id&&t.terms_version==='2026-10-22.1'&&Date.parse(t.accepted_at)<=Date.parse(p.created_at));
}
export function rankedGallery(guests:any[],fallback:any[],code:string,properties:any[],views:any[]){
 const shared=code==='CH2'||code==='CH3',codes=shared?['CH2','CH3']:[code],ids=properties.filter(p=>codes.includes(p.code)).map(p=>p.id);
 const count=new Map(views.map(v=>[v.publication_id,Number(v.views)||0]));
 const sorted=guests.filter(p=>ids.includes(p.property_id)).sort((a,b)=>(count.get(b.id)||0)-(count.get(a.id)||0)||Date.parse(b.published_at)-Date.parse(a.published_at)||a.id.localeCompare(b.id));
 const chosen=sorted.slice(0,6),spares=fallback.filter(p=>ids.includes(p.property_id)).sort((a,b)=>Number(String(a.id).startsWith('property:'))-Number(String(b.id).startsWith('property:'))||Number(b.source==='manual')-Number(a.source==='manual')||Date.parse(b.published_at)-Date.parse(a.published_at)||a.id.localeCompare(b.id));
 return [...chosen,...spares.slice(0,6-chosen.length)];
}
export async function publicGallery(ctx:any,body:any){
 const fail=(status:number)=>({status,body:{ok:false,error:'gallery_unavailable'}});
 if(body.publication_id&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.publication_id))return fail(400);
 if(body.property_code&&!['CH1','CH2','CH3'].includes(body.property_code))return fail(400);
 const c=await ctx.catalog(true),properties=c.properties.filter((p:any)=>p.active!==false&&['CH1','CH2','CH3'].includes(p.code)&&commercialItem(p));
 const property=body.property_code?properties.find((p:any)=>p.code===body.property_code):null;if(body.property_code&&!property)return fail(404);
 // Resolve permission before signing files; do not project account, booking or storage paths.
 let q=ctx.db.from('villegram_publications').select('*').eq('status','published').is('deleted_at',null);
 if(body.publication_id)q=q.eq('id',body.publication_id);
 const r=await q.order('published_at',{ascending:false}).order('id').limit(5000);if(r.error)throw Error('gallery_unavailable');
 const authors=[...new Set((r.data||[]).filter((p:any)=>p.source==='guest_submission').map((p:any)=>p.author_id))];
 const [t,v]=authors.length?await Promise.all([ctx.db.from('account_terms_acceptances').select('user_id,terms_version,accepted_at').in('user_id',authors).eq('terms_version','2026-10-22.1'),ctx.db.from('villegram_profiles').select('id,handle,display_name,is_public').in('id',authors).eq('is_public',true)]):[{data:[]},{data:[]}];
 if(t.error||v.error)throw Error('gallery_unavailable');
 const guests=(r.data||[]).filter((p:any)=>galleryEligible(p,properties.find((x:any)=>x.id===p.property_id),t.data,v.data));
 let fallback=(r.data||[]).filter((p:any)=>p.source!=='guest_submission'&&p.property_id&&commercialItem(p)&&eligiblePublication(p,properties,c.products,c.offers));
 const today=new Date().toISOString().slice(0,10);
 for(const prop of properties){
  for(const offer of c.offers.filter((o:any)=>o.status==='active'&&o.property_ids.includes(prop.id)&&(!o.end_date||o.end_date>=today)&&commercialItem(o))){
   const photo=offer.villegram?.photos?.find((m:any)=>m.property_id===prop.id)?.url||prop.cover_image;
   fallback.push({id:'offer:'+offer.id+':'+prop.code,source:'catalog',property_id:prop.id,title:offer.name,caption:offer.description,author_name:'Chalezinho Ville',published_at:new Date().toISOString(),cover_index:0,media:[{kind:'photo',url:photo,alt:prop.name}],link:'/api/villegram?villegram='+encodeURIComponent(offer.id)+'&chalet='+prop.code});
  }
  fallback.push({id:'property:'+prop.code,source:'catalog',property_id:prop.id,title:prop.name+' · Preços e disponibilidade',caption:prop.summary||prop.tagline||'Conheça o chalé e escolha suas datas.',author_name:'Chalezinho Ville',published_at:new Date().toISOString(),cover_index:0,media:[{kind:'photo',url:prop.cover_image,alt:prop.name}],link:'/reservar.html?chalet='+prop.code});
 }
 let selected:any[];
 if(body.publication_id){selected=guests;if(!selected.length)return fail(404);}
 else{const counts=guests.length?await ctx.db.rpc('villegram_gallery_views',{post_ids:guests.map((p:any)=>p.id)}):{data:[]};if(counts.error)throw Error('gallery_unavailable');selected=property?rankedGallery(guests,fallback,property.code,properties,counts.data):[...new Map(properties.flatMap((p:any)=>rankedGallery(guests,fallback,p.code,properties,counts.data)).map((p:any)=>[p.id,p])).values()];}
 const signed=await ctx.resolveMedia(selected);
 const posts=signed.map((p:any)=>{const author=v.data.find((a:any)=>a.id===p.author_id),prop=properties.find((x:any)=>x.id===p.property_id);return {id:p.id,title:p.title,caption:p.caption,property_code:prop.code,link:p.link||null,thumb_url:p.source==='catalog'?p.media[p.cover_index||0]?.url:null,is_guest:p.source==='guest_submission',author_name:author?.display_name||p.author_name,author_handle:author?.handle||null,published_at:p.published_at,updated_at:p.updated_at,cover_index:p.cover_index,media:p.media.map((m:any)=>({kind:m.kind,url:m.url,poster:m.poster,alt:m.alt,duration:m.duration}))};});
 return {status:200,body:{ok:true,property:property?{code:property.code,name:property.name}:null,publications:posts}};
}
