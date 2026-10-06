type Row=Record<string,any>;
/** Public merchandising snapshots survive worker cold starts. Never used for checkout.
 * Catalog identity invalidates edits immediately. Fresh for two minutes; a snapshot
 * older than five minutes is never served. An atomic refresh lease avoids stampedes. */
export async function persistentShowcase({admin,key,build,background,now=Date.now()}:Row){
 const current=new Date(now).toISOString();
 const result=await admin.from('stay_showcase_cache').select('payload,checked_at,refresh_after').eq('cache_key',key).maybeSingle();
 const row=result.error?null:result.data;
 const age=row?now-Date.parse(row.checked_at):Infinity;
 const usable=row&&Array.isArray(row.payload?.cards)&&Number.isFinite(age)&&age>=0;
 const compute=async()=>{
  const payload=await build();
  if(!Array.isArray(payload?.cards))throw Error('showcase_unavailable');
  const stamp=payload.checked_at&&Number.isFinite(Date.parse(payload.checked_at))?payload.checked_at:new Date().toISOString();
  const write=await admin.from('stay_showcase_cache').upsert({cache_key:key,payload,checked_at:stamp,refresh_after:new Date(Date.now()+120000).toISOString()});
  if(write.error)console.warn('showcase_cache_write_failed');
  return payload;
 };
 if(usable&&age<=120000)return {...row.payload,cache_status:'fresh'};
 if(usable&&age<=300000&&background){
  if(Date.parse(row.refresh_after)<=now){
   const lease=await admin.from('stay_showcase_cache').update({refresh_after:new Date(now+60000).toISOString()}).eq('cache_key',key).lte('refresh_after',current).select('cache_key');
   if(!lease.error&&lease.data?.length)background(compute().catch(()=>console.warn('showcase_cache_refresh_failed')));
  }
  return {...row.payload,cache_status:'refreshing'};
 }
 return {...await compute(),cache_status:'computed'};
}
export async function showcaseCacheKey(today:string,catalog:Row){
 const bytes=new TextEncoder().encode(JSON.stringify(catalog));
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 return 'showcase-v3:'+today+':'+[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
