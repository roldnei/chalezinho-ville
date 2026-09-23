const HOLD_MINUTES=15;

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'method_not_allowed'});

  const url=process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_SECRET_KEY;
  if(!url||!key) return res.status(500).json({ok:false,error:'missing_supabase_environment_variables'});

  const {property_code,check_in,check_out,guests,total_price}=req.body||{};
  const valid=/^\d{4}-\d{2}-\d{2}$/;
  if(!['CH1','CH2','CH3'].includes(property_code)||!valid.test(check_in||'')||!valid.test(check_out||'')||check_out<=check_in)
    return res.status(400).json({ok:false,error:'invalid_request'});

  const base=url.replace(/\/$/,'');
  const headers={apikey:key,Authorization:'Bearer '+key,Accept:'application/json','Content-Type':'application/json'};
  try{
    const p=await fetch(base+'/rest/v1/properties?code=eq.'+encodeURIComponent(property_code)+'&select=id,code,name&limit=1',{headers,signal:AbortSignal.timeout(5000)});
    const props=await p.json().catch(()=>[]);
    if(!p.ok||!props?.[0]) return res.status(404).json({ok:false,error:'property_not_found'});
    const property=props[0];

    const q=new URLSearchParams({
      select:'id,status,hold_expires_at',
      property_id:'eq.'+property.id,
      check_in:'lt.'+check_out,
      check_out:'gt.'+check_in,
      status:'in.(hold,pending_payment,confirmed)'
    });
    const cr=await fetch(base+'/rest/v1/reservations?'+q.toString(),{headers,signal:AbortSignal.timeout(5000)});
    const conflicts=await cr.json().catch(()=>[]);
    if(!cr.ok) return res.status(cr.status).json({ok:false,error:'availability_check_failed'});
    const now=new Date();
    const active=(conflicts||[]).some(x=>x.status!=='hold'||!x.hold_expires_at||new Date(x.hold_expires_at)>now);
    if(active) return res.status(409).json({ok:false,error:'dates_unavailable'});

    const expires=new Date(Date.now()+HOLD_MINUTES*60000).toISOString();
    const payload={
      property_id:property.id,
      check_in,
      check_out,
      guests:Math.max(1,Math.min(2,Number(guests)||2)),
      status:'hold',
      hold_expires_at:expires
    };
    if(Number.isFinite(Number(total_price))&&Number(total_price)>0) payload.total_price=Number(total_price);

    const ir=await fetch(base+'/rest/v1/reservations',{
      method:'POST',
      headers:{...headers,Prefer:'return=representation'},
      body:JSON.stringify(payload),
      signal:AbortSignal.timeout(5000)
    });
    const inserted=await ir.json().catch(()=>null);
    if(ir.status===409) return res.status(409).json({ok:false,error:'dates_unavailable'});
    if(!ir.ok) return res.status(ir.status).json({ok:false,error:'hold_create_failed',details:inserted});
    const row=Array.isArray(inserted)?inserted[0]:inserted;
    return res.status(201).json({ok:true,hold_id:row?.id??null,property:property.name,expires_at:expires,minutes:HOLD_MINUTES});
  }catch(e){
    return res.status(502).json({ok:false,error:e?.name==='TimeoutError'?'supabase_timeout':'supabase_unreachable'});
  }
}
