import {canUseProperty,hasPermission} from './access.ts';
export const canEditListing=(actor:any,id:number)=>['admin','host'].includes(actor.role)&&hasPermission(actor,'manage_listings')&&canUseProperty(actor,id);
export function listingPatch(body:any,previous:any){
 const section=body.section,features={...(previous.features||{})};let patch:any={};
 if(section==='amenities'){
  if(!Array.isArray(body.amenities)||body.amenities.length>100||body.amenities.some((s:any)=>typeof s!=='string'||!s.trim()||s.length>100))throw Error('invalid_amenities');
  features.amenities=[...new Set(body.amenities.map((s:string)=>s.trim()))];
  const highlighted=body.amenity_highlights??previous.features?.amenity_highlights;
  if(highlighted!==undefined){if(!Array.isArray(highlighted)||highlighted.length>8||highlighted.some((x:any)=>typeof x!=='string'||!features.amenities.includes(x))||new Set(highlighted).size!==highlighted.length)throw Error('invalid_highlights');features.amenity_highlights=highlighted;}
  const categories=body.amenity_categories??previous.features?.amenity_categories??{};
  const allowed=['Banheiro','Quarto e lavanderia','Entretenimento','Climatização','Segurança','Internet e escritório','Cozinha e sala de jantar','Lazer e área externa','Estacionamento e serviços','Outras comodidades'];
  if(!categories||typeof categories!=='object'||Array.isArray(categories)||Object.values(categories).some(x=>!allowed.includes(String(x))))throw Error('invalid_categories');
  features.amenity_categories=Object.fromEntries(features.amenities.filter((x:string)=>Object.hasOwn(categories,x)).map((x:string)=>[x,categories[x]]));patch.features=features;
 }else if(section==='space'){
  const name=String(body.name||'').trim(),summary=String(body.summary||'').trim(),tagline=String(body.tagline||'').trim();
  if(name.length<2||name.length>160||summary.length>3000||tagline.length>240)throw Error('invalid_listing');
  patch={name,summary,tagline};
 }else throw Error('invalid_section');
 return {...patch,updated_at:new Date().toISOString()};
}
export async function listingsAction(body:any,actor:any,db:any,json:any){
 if(!['admin','host'].includes(actor.role)||!hasPermission(actor,'manage_listings'))return json({ok:false,error:'listing_access_denied'},403);
 const columns='id,name,code,slug,tagline,summary,cover_image,gallery,max_guests,check_in_time,check_out_time,features,active,updated_at';
 if(body.operation==='list'){
  if(actor.role!=='admin'&&!actor.property_ids.length)return json({ok:true,properties:[]});
  let q=db.from('properties').select(columns).order('id');if(actor.role!=='admin')q=q.in('id',actor.property_ids);
  const r=await q;return r.error?json({ok:false,error:'listing_unavailable'},500):json({ok:true,properties:r.data});
 }
 const id=Number(body.property_id);if(!Number.isInteger(id)||!canEditListing(actor,id))return json({ok:false,error:'listing_not_found'},404);
 const {data:p,error}=await db.from('properties').select(columns).eq('id',id).maybeSingle();if(error||!p)return json({ok:false,error:'listing_not_found'},404);
 if(body.operation!=='save')return json({ok:false,error:'invalid_operation'},400);
 if(body.updated_at!==p.updated_at)return json({ok:false,error:'listing_conflict'},409);
 let patch;try{patch=listingPatch(body,p)}catch(e){return json({ok:false,error:e.message},400)}
 const result=await db.from('properties').update(patch).eq('id',id).eq('updated_at',p.updated_at).select('id').maybeSingle();
 if(result.error||!result.data)return json({ok:false,error:'listing_conflict'},409);
 await db.from('audit_events').insert({actor_user_id:actor.id,action:'listing_section_updated',entity_type:'property',entity_id:String(id),new_value:{section:body.section}});
 return json({ok:true});
}
