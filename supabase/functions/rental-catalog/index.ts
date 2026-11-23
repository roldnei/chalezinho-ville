import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {isPublicRental,publicRental,listingSettings,rentalSearchInput,rentalResult} from '../_shared/rental-catalog.ts';
const project=Deno.env.get('SUPABASE_URL')!;
const db=createClient(project,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
async function admin(req:Request){
 const token=(req.headers.get('authorization')||'').replace(/^Bearer /i,'');if(!token)throw Error('admin_required');
 const {data,error}=await db.auth.getUser(token);if(error||!data.user)throw Error('admin_required');
 const profile=await db.from('profiles').select('role,pms_access_status').eq('id',data.user.id).maybeSingle();
 if(profile.error||profile.data?.role!=='admin'||profile.data.pms_access_status!=='active')throw Error('admin_required');
 return data.user.id;
}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(!['GET','POST'].includes(req.method))return json({ok:false,error:'method_not_allowed'},405);
 try{
  if(Number(req.headers.get('content-length')||0)>12000)return json({ok:false,error:'request_too_large'},413);
  const url=new URL(req.url),body=req.method==='POST'?await req.json():{},action=body.action||url.searchParams.get('action')||'catalog';
  if(['admin_get','admin_save','admin_pricelabs'].includes(action)){
   await admin(req);const id=Number(body.property_id||url.searchParams.get('property_id'));
   if(!Number.isSafeInteger(id)||id<1)throw Error('invalid_property');
   if(action==='admin_save'){
    if(req.method!=='POST')throw Error('method_not_allowed');
    const listing=listingSettings(body.listing);
    const current=await db.from('properties').select('features,property_type,updated_at').eq('id',id).single();
    if(current.error||!['apartment','house','studio'].includes(current.data.property_type))throw Error('invalid_property_type');
    if(!body.updated_at||current.data.updated_at!==body.updated_at)throw Error('concurrent_update');
    const saved=await db.from('properties').update({features:{...current.data.features,public_listing:listing},updated_at:new Date().toISOString()}).eq('id',id).eq('updated_at',body.updated_at).select('id');
    if(saved.error)throw Error('save_failed');if(saved.data?.length!==1)throw Error('concurrent_update');
   }
   if(action==='admin_pricelabs'){
    if(req.method!=='POST')throw Error('method_not_allowed');
    const externalId=String(body.pricelabs_id||'').trim(),pms=String(body.pricelabs_pms||'airbnb').trim();
    if(!/^[A-Za-z0-9_-]{1,100}$/.test(externalId)||!(/^[a-z0-9_-]{1,40}$/).test(pms))throw Error('invalid_integration');
    const duplicate=await db.from('property_integrations').select('property_id').eq('provider','pricelabs').eq('external_listing_id',externalId).eq('pms',pms).eq('active',true).neq('property_id',id);
    if(duplicate.error||duplicate.data?.length)throw Error('invalid_duplicate_integration');
    const prior=await db.from('property_integrations').select('id,updated_at').eq('property_id',id).eq('provider','pricelabs').maybeSingle();
    if(prior.error)throw Error('integration_unavailable');
    if((prior.data?.updated_at||null)!==(body.integration_updated_at||null))throw Error('concurrent_update');
    const values={property_id:id,provider:'pricelabs',external_listing_id:externalId,pms,active:true,updated_at:new Date().toISOString()};
    const saved=prior.data?await db.from('property_integrations').update(values).eq('id',prior.data.id).eq('updated_at',prior.data.updated_at).select('id'):await db.from('property_integrations').insert(values).select('id');
    if(saved.error)throw Error('integration_save_failed');if(saved.data?.length!==1)throw Error('concurrent_update');
   }
   const [property,integration]=await Promise.all([db.from('properties').select('id,features,updated_at').eq('id',id).single(),db.from('property_integrations').select('external_listing_id,pms,active,updated_at').eq('property_id',id).eq('provider','pricelabs').maybeSingle()]);
   if(property.error||integration.error)throw Error('property_unavailable');
   return json({ok:true,property:property.data,pricelabs:integration.data});
  }
  if(req.method!=='GET')return json({ok:false,error:'method_not_allowed'},405);
  if(action==='pricing_sources'){
   const q=await db.from('property_integrations').select('property_id,external_listing_id,pms,properties!inner(name)').eq('provider','pricelabs').eq('active',true);
   if(q.error)throw Error('integration_unavailable');
   return json({ok:true,listings:(q.data||[]).filter((x:any)=>x.external_listing_id&&x.pms).map((x:any)=>({property_id:Number(x.property_id),id:x.external_listing_id,pms:x.pms,name:x.properties.name}))});
  }
  if(!['catalog','search'].includes(action))return json({ok:false,error:'invalid_action'},400);
  const q=await db.from('properties').select('id,code,slug,name,active,property_type,max_guests,tagline,summary,cover_image,gallery,features').eq('active',true).order('id');
  if(q.error)throw Error('catalog_unavailable');
  const listings=(q.data||[]).filter(isPublicRental).map(publicRental);
  if(action==='catalog')return json({ok:true,listings});
  const input=rentalSearchInput(Object.fromEntries(url.searchParams));
  // Reuse the canonical inventory, manual blocks, multi-channel iCal and price rules.
  // Consultation actions never create reservations, holds, payments or orders.
  const params=new URLSearchParams({action:'search',start:input.start,end:input.end,guests:String(input.guests)});
  const response=await fetch(project+'/functions/v1/public-consultation?'+params,{signal:AbortSignal.timeout(60000)});
  const data=await response.json();if(!response.ok||!data.ok)throw Error('availability_unavailable');
  return json({ok:true,...input,listings:listings.map((p:any)=>rentalResult(p,data.listings?.find((x:any)=>Number(x.id)===p.id)))});
 }catch(error){const code=error instanceof Error?error.message:'catalog_unavailable';return json({ok:false,error:code},code==='admin_required'?403:code.startsWith('invalid_')||code==='listing_incomplete'?400:code==='concurrent_update'?409:503)}
});
