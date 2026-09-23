export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;
 if(!url||!key)return res.status(500).json({ok:false});
 const base=url.replace(/\/$/,'');
 const headers={apikey:key,Authorization:'Bearer '+key,Accept:'application/json','Content-Type':'application/json',Prefer:'return=representation'};
 try{
  const q=new URLSearchParams({check_in:'eq.2026-11-27',check_out:'eq.2026-11-29',status:'in.(hold,pending_payment)'});
  const r=await fetch(base+'/rest/v1/reservations?'+q,{method:'PATCH',headers,body:JSON.stringify({status:'cancelled'}),signal:AbortSignal.timeout(5000)});
  const data=await r.json().catch(()=>[]);
  return res.status(r.ok?200:r.status).json({ok:r.ok,released:Array.isArray(data)?data.length:0});
 }catch(e){return res.status(502).json({ok:false,error:'release_failed'})}
}