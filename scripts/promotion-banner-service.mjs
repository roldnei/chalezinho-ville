const definitions = [
  {code:'CH3',name:'Ville Amore',description:'Hidromassagem\nprivativa',fallback:'/assets/amore.webp'},
  {code:'CH2',name:'Ville Essenza',description:'Hidromassagem\nprivativa',fallback:'/assets/essenza.webp'},
  {code:'CH1',name:'Ville Signature',description:'Piscina e spa\nprivativos',fallback:'/assets/ch1-08-spa-piscina-chale-noite.webp'},
];
const fail=message=>{throw Object.assign(Error(message),{status:400})};
const iso=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
export function selection(params){
  const from=params.get('from'),to=params.get('to'),guests=Number(params.get('guests')),rate=params.get('rate')||'lowest';
  const nights=(Date.parse(to)-Date.parse(from))/86400000;
  if(!iso(from)||!iso(to)||!Number.isInteger(nights)||nights<1||nights>60)fail('Escolha uma estadia de 1 a 60 noites.');
  if(!Number.isInteger(guests)||guests<1||guests>16)fail('Informe de 1 a 16 hóspedes.');
  if(!['lowest','non_refundable','refundable'].includes(rate))fail('Tarifa inválida.');
  if(params.get('source')!=='site')fail('Consulte os preços do site ou digite manualmente.');
  const offer=params.get('offer')||'',property=params.get('property')||'';
  if(offer&&(!/^[a-f0-9-]{36}$/i.test(offer)||!definitions.some(d=>d.code===property)))fail('Promoção inválida.');
  return {from,to,guests,rate,offer,property};
}
export function quotePrice(property,s){
  const q=property?.quote,options=(q?.rate_options||[]).filter(r=>r.selectable===true&&Number.isSafeInteger(r.total_amount_cents)&&r.total_amount_cents>0);
  const rate=s.rate==='lowest'?options.toSorted((a,b)=>a.total_amount_cents-b.total_amount_cents)[0]:options.find(r=>r.code===s.rate);
  const c=rate?.contract_snapshot;
  if(!property?.available||!rate||c?.check_in!==s.from||c?.check_out!==s.to||Number(c?.guests)!==s.guests)return {status:'unavailable',cents:null,message:property?.unavailable_reason||'Sem oferta confirmada para estas datas, hóspedes e tarifa.'};
  return {status:'price',cents:rate.total_amount_cents,observed:q.consulted_at,expiresAt:q.expires_at,message:'Total do site, incluindo limpeza e itens da tarifa consultada.'};
}
export function trustedPhoto(value,projectOrigin){
  try{const u=new URL(value,'https://chalezinhoville.com.br');if(u.origin===projectOrigin&&u.pathname.startsWith('/storage/v1/object/public/property-media/')&&!u.search)return u.href;}catch{}
  return null;
}
export function createPromotionService({endpoint,environment,fetchData=fetch}){
  const projectOrigin=new URL(endpoint).origin;
  async function read(action,params={}){
    const r=await fetchData(endpoint+'?'+new URLSearchParams({action,...params}),{headers:{Accept:'application/json','X-Chalezinho-Env':environment},signal:AbortSignal.timeout(30000),redirect:'error'});
    const body=await r.json();if(!r.ok||body.ok!==true)throw Error('O site não confirmou a consulta. Tente novamente.');return body;
  }
  async function catalog(){
    let rows=[];try{rows=(await read('property_media')).properties||[];}catch{}
    return definitions.map(d=>{const p=rows.find(r=>r.code===d.code);const photos=[{url:p?.cover_image,alt:'Capa do '+d.name},...(p?.gallery||[])].map(photo=>({...photo,url:trustedPhoto(photo.url,projectOrigin)})).filter(photo=>photo.url).filter((p,i,a)=>a.findIndex(o=>o.url===p.url)===i);
      if(!photos.length)photos.push({url:d.fallback,alt:'Foto do '+d.name});
      return {...d,id:p?.id,defaultPhoto:0,photos:photos.map(p=>({url:p.url.startsWith('/')?p.url:'/api/promotion-banner?action=photo&url='+encodeURIComponent(p.url),original:p.url,label:p.alt||d.name}))};});
  }
  return {catalog,async prices(s){
    if(s.offer){
      const property=(await catalog()).find(p=>p.code===s.property);if(!property?.id)throw Error('Chalé não encontrado.');
      const r=await fetchData(endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Chalezinho-Env':environment},body:JSON.stringify({action:'villegram_quote',property_id:property.id,offer_id:s.offer,check_in:s.from,check_out:s.to,guests:s.guests}),signal:AbortSignal.timeout(30000),redirect:'error'});
      const body=await r.json();if(!r.ok||!body.ok)throw Error('Esta promoção não confirmou oferta para as datas escolhidas.');
      return definitions.map(d=>({...d,...(d.code!==s.property?{cents:null,status:'unavailable',message:'Escolha o chalé desta promoção.'}:quotePrice({available:true,quote:{...body,consulted_at:body.checked_at,expires_at:new Date(Date.now()+300000).toISOString()}},s))}));
    }
    const body=await read('search',{start:s.from,end:s.to,guests:String(s.guests)});if(!Array.isArray(body.listings))throw Error('Consulta incompleta.');return definitions.map(d=>({...d,...quotePrice(body.listings.find(p=>p.code===d.code),s)}));},
    async photo(value){const url=trustedPhoto(value,projectOrigin);if(!url)fail('Foto inválida.');const r=await fetchData(url,{signal:AbortSignal.timeout(20000),redirect:'error'});const type=r.headers.get('content-type')||'';
      if(!r.ok||!/^image\/(webp|jpeg|png|avif)(;|$)/.test(type))throw Error('Foto indisponível.');
      const chunks=[];let size=0;for await(const chunk of r.body){size+=chunk.length;if(size>10000000)fail('Foto muito grande.');chunks.push(chunk);}return {type,body:Buffer.concat(chunks)};}};
}
