import {validateStayOffer,offerIssues} from './stay-offers.ts';
export function stayOfferService({admin,currentUser,userIsAdmin,json,projectUrl}:any){
 async function catalog(includePaused=false){
  const query=admin.from('stay_offers').select('*').order('created_at');
  const {data:offers,error}=await(includePaused?query:query.eq('status','active'));
  const {data:products,error:pe}=await admin.from('experience_products').select('id,name,status,description,price_cents,details,package_type,minimum_lead_hours,daily_capacity,inventory,experience_variants(id,code,name,price_cents,active,display_order),experience_property_eligibility(property_id),experience_media(media_url,alt_text,display_order)');
  if(error||pe)throw Error('offer_catalog_unavailable');
  return {offers:offers||[],products:products||[]};
 }
 async function action(req:Request,body:any,development:boolean){
  if(!development)return json({ok:false,error:'development_only'},403);
  const user=await currentUser(req);if(!user||!await userIsAdmin(user))return json({ok:false,error:'admin_required'},403);
  const data=await catalog(true);
  if(body.operation==='list')return json({ok:true,...data});
  if(!['save','preview'].includes(body.operation))return json({ok:false,error:'invalid_operation'},400);
  let offer;try{offer=validateStayOffer(body)}catch(e){return json({ok:false,error:(e as Error).message},400)}
  const {data:properties,error}=await admin.from('properties').select('id').eq('active',true).in('id',offer.property_ids);
  if(error||properties?.length!==offer.property_ids.length)return json({ok:false,error:'offer_property_incompatible'},400);
  const prefix=projectUrl+'/storage/v1/object/public/experience-media/';
  if(offer.media.some((x:any)=>typeof x!=='string'||!(x.startsWith(prefix)||/^assets\/[a-zA-Z0-9._-]+\.(webp|jpg|jpeg|png|avif)$/.test(x))))return json({ok:false,error:'invalid_offer_photo'},400);
  const issues=[...new Set(offer.property_ids.flatMap(id=>offerIssues({...offer,status:'active'},data.products,id)))];
  if(body.operation==='preview')return json({ok:true,offer,issues,packages:data.products.filter((x:any)=>offer.product_ids.includes(x.id))});
  if(offer.status==='active'&&issues.length)return json({ok:false,error:'offer_not_ready',issues},409);
  const result=body.id?await admin.from('stay_offers').update({...offer,updated_at:new Date().toISOString()}).eq('id',body.id).eq('updated_at',body.updated_at||'').select().maybeSingle():await admin.from('stay_offers').insert(offer).select().single();
  if(result.error||!result.data)return json({ok:false,error:body.id?'offer_conflict':'offer_save_failed'},409);
  await admin.from('audit_events').insert({actor_user_id:user.id,action:'stay_offer_saved',entity_type:'stay_offer',entity_id:result.data.id,new_value:offer});
  return json({ok:true,offer:result.data});
 }
 return {catalog,action};
}
