export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;
 if(!url||!key)return res.status(500).json({ok:false,step:'env'});
 const h={apikey:key,Authorization:'Bearer '+key,Accept:'application/json'};
 const base=url.replace(/\/$/,'');
 const fields=['id','property_id','check_in','check_out','status','hold_expires_at','guests','total_price'];
 const result={};
 for(const field of fields){
  try{
   const r=await fetch(base+'/rest/v1/reservations?select='+field+'&limit=1',{headers:h});
   result[field]=r.ok?'ok':'missing';
  }catch{result[field]='error'}
 }
 return res.status(200).json({ok:true,fields:result});
}