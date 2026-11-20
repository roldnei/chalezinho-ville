(()=>{
 'use strict';
 const V=window.VilleEscapadaVideo,Z=window.VilleEscapadaZip;
 // User-requested one-night stays expire automatically; amounts always come from a new quote.
 const requestedStays=['2026-11-27','2026-11-28','2026-12-04','2026-12-05'];
 const check=signal=>{if(signal?.aborted)throw new DOMException('Cancelado','AbortError');};
 async function loadCatalog({signal}={}){
  const timeout=AbortSignal.timeout(55000),r=await fetch('/api/stay-showcase',{cache:'no-store',signal:signal?AbortSignal.any([signal,timeout]):timeout}),d=await r.json();
  if(!r.ok||!d.ok||!Array.isArray(d.cards))throw Error('Não foi possível atualizar as escapadas. Tente novamente.');
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),property=(d.properties||[]).find(p=>p.code==='CH2'),issues=[];
  if(property)for(const day of requestedStays.filter(day=>day>=today)){
   check(signal);const out=new Date(day+'T12:00:00Z');out.setUTCDate(out.getUTCDate()+1);
   const seed={property_id:Number(property.id),property_code:'CH2',property_name:property.name,image:property.cover_image,offer_id:null,offer_name:'Escapada de 1 noite',check_in:day,check_out:out.toISOString().slice(0,10),guests:2,nights:1,rate_code:'non_refundable',requested:true};
   if(d.cards.some(c=>V.key(c)===V.key(seed)))continue;
   try{d.cards.push(await V.refresh(seed,{signal}));}catch(e){check(signal);issues.push('Essenza · '+day.split('-').reverse().join('/')+': sem disponibilidade confirmada.');}
  }
  return {...d,issues};
 }
 async function generate(cards,catalog,{signal,progress=()=>{},status=()=>{},onFresh=()=>{}}={}){
  if(!cards.length)throw Error('Selecione pelo menos um vídeo.');
  const files=[];
  try{
   for(let i=0;i<cards.length;i++){
    check(signal);const previous=cards[i];status('Confirmando vídeo '+(i+1)+' de '+cards.length+' · '+previous.property_name+' · '+V.range(previous));
    // Requote immediately before each recording, even in long batches.
    const fresh=await V.refresh(previous,{signal});onFresh(fresh);
    const blob=await V.exportVideo(fresh,V.mediaFor(fresh,catalog),{signal,progress:n=>{progress(Math.round((i+n/100)/cards.length*90));status('Gerando vídeo '+(i+1)+' de '+cards.length+' · '+fresh.property_name+' · '+n+'%');}});
    files.push({name:V.fileName(fresh),blob});
   }
   status('Reunindo os vídeos no ZIP…');return await Z.create(files,{signal,progress:(n,total)=>progress(90+Math.round(n/total*10))});
  }finally{files.length=0;}
 }
 window.VilleEscapadaSelection={loadCatalog,generate};
})();
