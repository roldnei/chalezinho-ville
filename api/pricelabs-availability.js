import {publicServiceTarget} from '../scripts/public-service-target.mjs';
import {mapListingPrices} from '../scripts/listing-prices.mjs';
async function previewFallback(start,end){
  const u='https://chalezinhoville.com.br/api/pricelabs-availability?start='+encodeURIComponent(start)+'&end='+encodeURIComponent(end);
  const r=await fetch(u,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(8000)});
  const data=await r.json().catch(()=>null);
  if(!r.ok||!data?.ok) throw new Error('production_pricelabs_fallback_failed');
  return {...data,source:'production-read-fallback'};
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET') return res.status(405).json({ok:false,error:'method_not_allowed'});
  const start=String(req.query.start||''),end=String(req.query.end||'');
  const valid=/^\d{4}-\d{2}-\d{2}$/;
  if(!valid.test(start)||!valid.test(end)||end<=start) return res.status(400).json({ok:false,error:'invalid_dates'});
  const key=process.env.PRICELABS_API_KEY;
  if(!key){
    if(process.env.VERCEL_ENV==='preview'){
      try{return res.status(200).json(await previewFallback(start,end))}
      catch(e){return res.status(502).json({ok:false,error:'preview_pricelabs_fallback_failed'})}
    }
    return res.status(500).json({ok:false,error:'missing_pricelabs_key'});
  }
  try{
    const target=publicServiceTarget(process.env,String(req.headers.host||''));
    const directory=await fetch(target.endpoint.replace(/\/[^/]+$/,'/rental-catalog')+'?action=pricing_sources',{signal:AbortSignal.timeout(8000)});
    const catalog=await directory.json();
    if(!directory.ok||!catalog.ok||!Array.isArray(catalog.listings)||!catalog.listings.length)throw Error('pricing_directory_unavailable');
    const listings=catalog.listings;
    const r=await fetch('https://api.pricelabs.co/v1/listing_prices',{
      method:'POST',headers:{'X-API-Key':key,'Accept':'application/json','Content-Type':'application/json'},
      body:JSON.stringify({listings:listings.map(x=>({id:x.id,pms:x.pms}))}),
      signal:AbortSignal.timeout(8000)
    });
    const raw=await r.json().catch(()=>null);
    if(!r.ok) return res.status(r.status).json({ok:false,error:'pricelabs_error'});
    const rows=Array.isArray(raw)?raw:Array.isArray(raw?.data)?raw.data:[];
    const result=mapListingPrices(listings,rows,start,end);
    return res.status(200).json({ok:true,start,end,listings:result});
  }catch(e){return res.status(502).json({ok:false,error:e?.name==='TimeoutError'?'pricelabs_timeout':'pricelabs_unreachable'});}
}
