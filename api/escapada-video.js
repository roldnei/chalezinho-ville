import {publicServiceTarget} from '../scripts/public-service-target.mjs';
const iso=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
export function quoteInput(q){
  const check_in=q.get('check_in'),check_out=q.get('check_out'),guests=Number(q.get('guests')),property_id=Number(q.get('property_id')),offer_id=q.get('offer_id')||null,rate_code=q.get('rate_code')||'';
  if(!iso(check_in)||!iso(check_out)||check_out<=check_in||(Date.parse(check_out)-Date.parse(check_in))/86400000>90||!Number.isInteger(guests)||guests<1||guests>12||!Number.isSafeInteger(property_id)||property_id<1||offer_id&&!/^[a-f0-9-]{36}$/i.test(offer_id)||!['','refundable','non_refundable'].includes(rate_code))throw Error('invalid_selection');
  return {action:'villegram_quote',property_id,offer_id,check_in,check_out,guests,rate_code};
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
  let target,input;try{target=publicServiceTarget(process.env,String(req.headers.host||''));input=quoteInput(new URL(req.url,'https://'+req.headers.host).searchParams);}catch{return res.status(400).json({ok:false,error:'invalid_selection'});}
  try{
    const r=await fetch(target.endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Chalezinho-Env':target.environment},body:JSON.stringify(input),signal:AbortSignal.timeout(40000),redirect:'error'}),body=await r.json();
    // Never replace a failed package quote with a lodging-only or historical price.
    const card=body.card;
    if(!r.ok||!body.ok||!card||!Number.isSafeInteger(card.total_cents)||card.total_cents<=0||Number(card.property_id)!==input.property_id||card.check_in!==input.check_in||card.check_out!==input.check_out||Number(card.guests)!==input.guests||(card.offer_id||null)!==input.offer_id||input.rate_code&&card.rate_code!==input.rate_code)return res.status(409).json({ok:false,error:body.error||'quote_unavailable'});
    return res.status(200).json({ok:true,card:body.card,checked_at:body.checked_at});
  }catch{return res.status(503).json({ok:false,error:'quote_unavailable'});}
}
