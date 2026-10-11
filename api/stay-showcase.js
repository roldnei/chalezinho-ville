import {publicServiceTarget} from '../scripts/public-service-target.mjs';
// Public merchandising only. Booking still rechecks and contracts in the engine.
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const host=String(req.headers.host||'');
 let target;try{target=publicServiceTarget(process.env,host)}catch{return res.status(403).json({ok:false,error:'release_not_enabled'})}
 try{
  const r=await fetch(target.endpoint+'?action=stay_showcase',{headers:{Origin:'https://'+host,'X-Chalezinho-Env':target.environment},signal:AbortSignal.timeout(45000)});
  const timing=r.headers.get('server-timing');if(timing)res.setHeader('Server-Timing',timing);
  const data=await r.json();if(!r.ok||!data.ok)return res.status(503).json({ok:false,error:'showcase_unavailable'});
  // The browser changes catalog_version after catalog edits, invalidating this key.
  // Never carry yesterday's suggestions across midnight in Guarapari.
  const now=new Date(),localDate=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const midnight=Date.parse(localDate+'T00:00:00-03:00')+86400000;
  const ttl=Math.max(0,Math.min(60,Math.floor((midnight-now.getTime())/1000)));
  res.setHeader('Cache-Control',ttl?'public, max-age=0, s-maxage='+ttl:'no-store');
  return res.status(200).json(data);
 }catch{return res.status(503).json({ok:false,error:'showcase_unavailable'})}
}
