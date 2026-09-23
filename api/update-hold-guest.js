export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;
 if(!url||!key)return res.status(500).json({ok:false,error:'missing_supabase_environment_variables'});
 const {hold_id,guest_name,guest_email,guest_phone,accommodation_amount,cleaning_fee,total_amount}=req.body||{};
 if(!hold_id||!guest_name||!guest_email||!guest_phone)return res.status(400).json({ok:false,error:'missing_guest_data'});
 const base=url.replace(/\/$/,'');
 const headers={apikey:key,Authorization:'Bearer '+key,Accept:'application/json','Content-Type':'application/json'};
 try{
  const q=new URLSearchParams({id:'eq.'+hold_id,status:'eq.hold',hold_expires_at:'gt.'+new Date().toISOString()});
  const payload={
   guest_name:String(guest_name).trim().slice(0,120),
   guest_email:String(guest_email).trim().slice(0,180),
   guest_phone:String(guest_phone).trim().slice(0,40),
   accommodation_amount:Number(accommodation_amount)||0,
   cleaning_fee:Number(cleaning_fee)||0,
   total_amount:Number(total_amount)||0,
   status:'pending_payment'
  };
  const r=await fetch(base+'/rest/v1/reservations?'+q.toString(),{method:'PATCH',headers:{...headers,Prefer:'return=representation'},body:JSON.stringify(payload),signal:AbortSignal.timeout(5000)});
  const data=await r.json().catch(()=>null);
  if(!r.ok)return res.status(r.status).json({ok:false,error:'update_failed'});
  if(!Array.isArray(data)||!data.length)return res.status(409).json({ok:false,error:'hold_expired'});
  return res.status(200).json({ok:true,reservation_id:data[0].id,status:data[0].status});
 }catch(e){return res.status(502).json({ok:false,error:'supabase_unreachable'})}
}