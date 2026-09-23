export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET') return res.status(405).json({ok:false,error:'method_not_allowed'});
  const key=process.env.PRICELABS_API_KEY;
  if(!key) return res.status(500).json({ok:false,error:'missing_pricelabs_key'});
  const start=String(req.query.start||''),end=String(req.query.end||'');
  const valid=/^\d{4}-\d{2}-\d{2}$/;
  if(!valid.test(start)||!valid.test(end)||end<=start) return res.status(400).json({ok:false,error:'invalid_dates'});
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
    const result=listings.map((listing,i)=>{
      const row=rows.find(x=>String(x?.id)===listing.id)||rows[i]||{};
      const days=(Array.isArray(row?.data)?row.data:[]).filter(d=>d?.date>=start&&d?.date<end);
      const blockedDays=days.filter(d=>{
        const status=String(d?.booking_status??'').toLowerCase();
        const u=String(d?.unbookable??'').toLowerCase();
        return ['booked','blocked','unavailable'].includes(status)||['1','true','yes'].includes(u);
      }).map(d=>({date:d.date,booking_status:d.booking_status??null,unbookable:d.unbookable??null}));
      return {name:listing.name,id:listing.id,available:days.length>0&&blockedDays.length===0,blocked_days:blockedDays};
    });
    return res.status(200).json({ok:true,start,end,listings:result});
  }catch(e){return res.status(502).json({ok:false,error:'pricelabs_unreachable'});}
}