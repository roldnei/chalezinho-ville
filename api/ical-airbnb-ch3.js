function parseDate(v){
  const m=String(v||'').match(/^(\d{4})(\d{2})(\d{2})/);
  return m?m[1]+'-'+m[2]+'-'+m[3]:null;
}
function unfold(s){return s.replace(/\r?\n[ \t]/g,'');}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  if(req.method!=='GET') return res.status(405).json({ok:false,error:'method_not_allowed'});
  const url=process.env.ICAL_AIRBNB_CH3;
  if(!url) return res.status(500).json({ok:false,error:'missing_ical_airbnb_ch3'});
  try{
    const r=await fetch(url,{headers:{'User-Agent':'ChalezinhoVille/1.0'}});
    if(!r.ok) return res.status(502).json({ok:false,error:'airbnb_ical_error',status:r.status});
    const text=unfold(await r.text());
    const events=text.split('BEGIN:VEVENT').slice(1).map(x=>x.split('END:VEVENT')[0]);
    const periods=events.map(e=>{
      const si=e.match(/DTSTART(?:;[^:]*)?:(\d{8})/);
      const ei=e.match(/DTEND(?:;[^:]*)?:(\d{8})/);
      return si&&ei?{start:parseDate(si[1]),end:parseDate(ei[1])}:null;
    }).filter(Boolean);
    return res.status(200).json({ok:true,source:'airbnb_ical',property:'Ville Amore',periods});
  }catch(e){return res.status(502).json({ok:false,error:'airbnb_ical_unreachable'});}
}