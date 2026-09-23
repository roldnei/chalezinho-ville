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
    const rows=Array.isArray(data)?data:Array.isArray(data?.data)?data.data:[];
    const safe=rows.map((x,i)=>{
      const keys=x&&typeof x==='object'?Object.keys(x):[];
      const shapes={};
      for(const k of keys){
        const v=x[k];
        if(Array.isArray(v)) shapes[k]={type:'array',length:v.length,item_keys:v[0]&&typeof v[0]==='object'?Object.keys(v[0]):[]};
        else if(v&&typeof v==='object') shapes[k]={type:'object',keys:Object.keys(v)};
        else shapes[k]={type:typeof v};
      }
      return {name:listings[i]?.name??null,id:String(x?.id??listings[i]?.id??''),top_level_keys:keys,shapes};
    });
    return res.status(200).json({ok:true,diagnostic:'field_names_only',rows:safe});
  }catch(e){return res.status(502).json({ok:false,error:'pricelabs_unreachable'});}
}