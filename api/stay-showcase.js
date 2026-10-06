// Public merchandising only. Booking still rechecks and contracts in the engine.
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 if(process.env.VERCEL_ENV!=='preview')return res.status(403).json({ok:false,error:'development_only'});
 const host=String(req.headers.host||'');
 if(!/^chalezinho-ville-[a-z0-9]{9}-roldneicosta-4140\.vercel\.app$/.test(host))return res.status(403).json({ok:false,error:'development_only'});
 try{
  const r=await fetch('https://pxfqmnhqodqyaaqeyjgr.supabase.co/functions/v1/booking-engine?action=stay_showcase',{headers:{Origin:'https://'+host,'X-Chalezinho-Env':'development'},signal:AbortSignal.timeout(45000)});
  const timing=r.headers.get('server-timing');if(timing)res.setHeader('Server-Timing',timing);
  const data=await r.json();if(!r.ok||!data.ok)return res.status(503).json({ok:false,error:'showcase_unavailable'});
  // The browser changes catalog_version after catalog edits, invalidating this key.
  res.setHeader('Cache-Control','public, max-age=0, s-maxage=60, stale-while-revalidate=60');
  return res.status(200).json(data);
 }catch{return res.status(503).json({ok:false,error:'showcase_unavailable'})}
}
