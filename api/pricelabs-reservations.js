const ALLOWED_PMS = ['airbnb', 'bcom'];

function iso(d){ return d.toISOString().slice(0,10); }

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET') return res.status(405).json({ok:false,error:'method_not_allowed'});
  const key=process.env.PRICELABS_API_KEY;
  if(!key) return res.status(500).json({ok:false,error:'missing_pricelabs_key'});

  const today=new Date();
  const defaultEnd=new Date(today);
  defaultEnd.setFullYear(defaultEnd.getFullYear()+1);
  const start=/^\d{4}-\d{2}-\d{2}$/.test(req.query.start||'') ? req.query.start : iso(today);
  const end=/^\d{4}-\d{2}-\d{2}$/.test(req.query.end||'') ? req.query.end : iso(defaultEnd);

  try{
    const results=await Promise.all(ALLOWED_PMS.map(async pms=>{
      const u=new URL('https://api.pricelabs.co/v1/reservation_data');
      u.searchParams.set('pms',pms);
      u.searchParams.set('start_date',start);
      u.searchParams.set('end_date',end);
      u.searchParams.set('limit','100');
      const r=await fetch(u,{headers:{'X-API-Key':key,'Accept':'application/json'}});
      const data=await r.json().catch(()=>null);
      if(!r.ok) return {pms,ok:false,status:r.status,error:data};
      const rows=Array.isArray(data?.data)?data.data:[];
      return {pms,ok:true,next_page:!!data?.next_page,reservations:rows.map(x=>({
        listing_id:String(x.listing_id??''),
        listing_name:x.listing_name??null,
        check_in:x.check_in??null,
        check_out:x.check_out??null,
        booking_status:x.booking_status??null,
        booking_channel:x.booking_channel??null
      }))};
    }));
    return res.status(200).json({ok:results.every(x=>x.ok),start,end,results});
  }catch(e){
    return res.status(502).json({ok:false,error:'pricelabs_unreachable'});
  }
}
