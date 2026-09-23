export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET') return res.status(405).json({ok:false,error:'method_not_allowed'});
  const key=process.env.PRICELABS_API_KEY;
  if(!key) return res.status(500).json({ok:false,error:'missing_pricelabs_key'});
  const date=/^\d{4}-\d{2}-\d{2}$/.test(req.query.date||'')?req.query.date:'2026-09-28';
  const listings=[
    {id:'1526341230074666349',pms:'airbnb',name:'Ville Signature'},
    {id:'1547126637360310141',pms:'airbnb',name:'Ville Essenza'},
    {id:'1745999870058886727',pms:'airbnb',name:'Ville Amore'}
  ];
  try{
    const r=await fetch('https://api.pricelabs.co/v1/listing_prices',{
      method:'POST',
      headers:{'X-API-Key':key,'Accept':'application/json','Content-Type':'application/json'},
      body:JSON.stringify({listings:listings.map(x=>({id:x.id,pms:x.pms}))})
    });
    const raw=await r.json().catch(()=>null);
    if(!r.ok) return res.status(r.status).json({ok:false,error:'pricelabs_error'});
    const rows=Array.isArray(raw)?raw:Array.isArray(raw?.data)?raw.data:[];
    const out=rows.map((x,i)=>{
      const d=Array.isArray(x?.data)?x.data.find(v=>v?.date===date):null;
      return {name:listings[i]?.name??null,id:String(x?.id??listings[i]?.id??''),date,
        day:d?{price:d.price??null,user_price:d.user_price??null,min_stay:d.min_stay??null,booking_status:d.booking_status??null,booking_status_STLY:d.booking_status_STLY??null,booked_date:d.booked_date??null,booked_date_STLY:d.booked_date_STLY??null,unbookable:d.unbookable??null,occupancy:d.occupancy??null}:null};
    });
    return res.status(200).json({ok:true,listings:out});
  }catch(e){return res.status(502).json({ok:false,error:'pricelabs_unreachable'});}
}