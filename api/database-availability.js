const propertyMap = {
  'Ville Signature': 'CH1',
  'Ville Essenza': 'CH2',
  'Ville Amore': 'CH3'
};

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET') return res.status(405).json({ok:false,error:'method_not_allowed'});

  const url=process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_SECRET_KEY;
  const start=String(req.query.start||'');
  const end=String(req.query.end||'');
  const valid=/^\d{4}-\d{2}-\d{2}$/;

  if(!url||!key) return res.status(500).json({ok:false,error:'missing_supabase_environment_variables'});
  if(!valid.test(start)||!valid.test(end)||end<=start) return res.status(400).json({ok:false,error:'invalid_dates'});

  const headers={apikey:key,Authorization:'Bearer '+key,Accept:'application/json'};
  const base=url.replace(/\/$/,'');

  try{
    const p=await fetch(base+'/rest/v1/properties?select=id,code,name&order=id.asc',{headers});
    const properties=await p.json().catch(()=>[]);
    if(!p.ok) return res.status(p.status).json({ok:false,error:'supabase_properties_error'});

    const now=new Date().toISOString();
    const q=new URLSearchParams({
      select:'property_id,check_in,check_out,status,hold_expires_at',
      check_in:'lt.'+end,
      check_out:'gt.'+start,
      status:'in.(hold,pending_payment,confirmed)'
    });
    const rr=await fetch(base+'/rest/v1/reservations?'+q.toString(),{headers});
    const reservations=await rr.json().catch(()=>[]);
    if(!rr.ok) return res.status(rr.status).json({ok:false,error:'supabase_reservations_error'});

    const active=(Array.isArray(reservations)?reservations:[]).filter(x=>{
      if(x.status!=='hold') return true;
      return !x.hold_expires_at || x.hold_expires_at>now;
    });

    const listings=(Array.isArray(properties)?properties:[]).map(x=>({
      name:x.name,
      code:x.code,
      available:!active.some(r=>Number(r.property_id)===Number(x.id))
    }));

    return res.status(200).json({ok:true,start,end,listings});
  }catch(e){
    return res.status(502).json({ok:false,error:'supabase_unreachable'});
  }
}
