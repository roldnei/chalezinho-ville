export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;
 if(!url||!key)return res.status(500).json({ok:false,step:'env'});
 const base=url.replace(/\/$/,'');
 const headers={apikey:key,Authorization:'Bearer '+key,Accept:'application/json','Content-Type':'application/json'};

 try{
  const p=await fetch(base+'/rest/v1/properties?code=eq.CH1&select=id,code,name&limit=1',{headers,signal:AbortSignal.timeout(5000)});
  const props=await p.json().catch(()=>[]);
  if(!p.ok||!props?.[0])return res.status(200).json({ok:false,step:'property_lookup',status:p.status});
  const payload={
   property_id:props[0].id,
   check_in:'2099-12-27',
   check_out:'2099-12-29',
   guests:2,
   status:'hold',
   hold_expires_at:new Date(Date.now()+60000).toISOString()
  };
  const ir=await fetch(base+'/rest/v1/reservations',{
   method:'POST',
   headers:{...headers,Prefer:'return=representation,tx=rollback'},
   body:JSON.stringify(payload),
   signal:AbortSignal.timeout(5000)
  });
  const raw=await ir.text();
  let details;try{details=JSON.parse(raw)}catch{details=raw}
  return res.status(200).json({ok:ir.ok,step:'insert',status:ir.status,details});
 }catch(e){
  return res.status(200).json({ok:false,step:'exception',error:e?.name||'unknown',message:String(e?.message||'')});
 }
}