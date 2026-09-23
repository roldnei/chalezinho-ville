function parseDate(v){
  const m=String(v||'').match(/^(\d{4})(\d{2})(\d{2})/);
  return m?m[1]+'-'+m[2]+'-'+m[3]:null;
}
function unfold(s){return s.replace(/\r?\n[ \t]/g,'');}
async function readFeed(url){
  const r=await fetch(url,{headers:{'User-Agent':'ChalezinhoVille/1.0'},signal:AbortSignal.timeout(8000)});
  if(!r.ok) throw new Error('feed_'+r.status);
  const raw=unfold(await r.text());
  return raw.split('BEGIN:VEVENT').slice(1).map(x=>x.split('END:VEVENT')[0]).map(e=>{
    const s=e.match(/DTSTART(?:;[^:]*)?:(\d{8})/);
    const d=e.match(/DTEND(?:;[^:]*)?:(\d{8})/);
    return s&&d?{start:parseDate(s[1]),end:parseDate(d[1])}:null;
  }).filter(Boolean);
}
async function previewFallback(){
  const r=await fetch('https://chalezinhoville.com.br/api/ical-airbnb-all',{
    headers:{Accept:'application/json'},
    signal:AbortSignal.timeout(8000)
  });
  const data=await r.json().catch(()=>null);
  if(!r.ok||!data?.ok) throw new Error('production_ical_fallback_failed');
  return {...data,source:'production-read-fallback'};
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  if(req.method!=='GET') return res.status(405).json({ok:false,error:'method_not_allowed'});
  const props=[
    {name:'Ville Signature',env:'ICAL_AIRBNB_CH1'},
    {name:'Ville Essenza',env:'ICAL_AIRBNB_CH2'},
    {name:'Ville Amore',env:'ICAL_AIRBNB_CH3'}
  ];
  if(process.env.VERCEL_ENV==='preview'&&props.some(p=>!process.env[p.env])){
    try{return res.status(200).json(await previewFallback())}
    catch(e){return res.status(502).json({ok:false,error:'preview_ical_fallback_failed'})}
  }
  try{
    const listings=await Promise.all(props.map(async p=>{
      const url=process.env[p.env];
      if(!url) return {name:p.name,ok:false,error:'missing_calendar',periods:[]};
      try{return {name:p.name,ok:true,periods:await readFeed(url)};}
      catch(e){return {name:p.name,ok:false,error:'calendar_unreachable',periods:[]};}
    }));
    if(process.env.VERCEL_ENV==='preview'&&!listings.every(x=>x.ok)){
      try{return res.status(200).json(await previewFallback())}
      catch(e){}
    }
    return res.status(200).json({ok:listings.every(x=>x.ok),source:'airbnb_ical',listings});
  }catch(e){
    if(process.env.VERCEL_ENV==='preview'){
      try{return res.status(200).json(await previewFallback())}
      catch(x){}
    }
    return res.status(502).json({ok:false,error:'ical_unreachable'});
  }
}
