export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET') return res.status(405).json({ok:false,error:'method_not_allowed'});
  const key=process.env.PRICELABS_API_KEY;
  if(!key) return res.status(500).json({ok:false,error:'missing_pricelabs_key'});
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
    const data=await r.json().catch(()=>null);
    if(!r.ok) return res.status(r.status).json({ok:false,error:data});
    const date=req.query.date||'2026-09-28';
    const compact=(Array.isArray(data)?data:[]).map((x,i)=>{
      const arr=Array.isArray(x.pricing_array)?x.pricing_array:Array.isArray(x.prices)?x.prices:[];
      const day=arr.find(d=>d.date===date);
      return {name:listings[i]?.name,id:String(x.id??listings[i]?.id??''),pms:x.pms??listings[i]?.pms,date,last_refreshed_at:x.last_refreshed_at??null,day:day||null,array_key:Array.isArray(x.pricing_array)?'pricing_array':Array.isArray(x.prices)?'prices':null};
    });
    return res.status(200).json({ok:true,date,listings:compact});
  }catch(e){return res.status(502).json({ok:false,error:'pricelabs_unreachable'});}
}