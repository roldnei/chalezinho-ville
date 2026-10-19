// Anonymous measurement for mobile homepage entrants. It never starts an experiment.
(()=>{
 const C=window.CHALEZINHO_CONFIG,endpoint=C?.supabaseUrl+'/functions/v1/public-consultation';
 const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
 const page=location.pathname.split('/').pop()||'index.html';
 const pages=['index.html','reservar.html','imovel.html','chale-premium.html','chale-com-hidro.html','chale-romantico.html'];
 let participant=null,experiment=null,visitor='',enabled=false,decisionTaken=false;
 const eligibleHome=()=>page==='index.html'&&!location.hash&&[...new URLSearchParams(location.search).keys()].every(k=>/^utm_(source|medium|campaign|term|content)$/.test(k)||['gclid','fbclid'].includes(k));
 const phone=()=>/iPhone|iPod|Android.+Mobile/i.test(navigator.userAgent)&&matchMedia('(max-width:700px)').matches;
 const key='ville-mobile-visitor:'+C?.environment;
 function auth(){try{const prefix='sb-'+new URL(C.supabaseUrl).hostname.split('.')[0]+'-auth-token';const raw=C.authOptions?.auth?.storage?.getItem(prefix)||localStorage.getItem(prefix)||sessionStorage.getItem(prefix);return raw?JSON.parse(raw)?.access_token:null}catch{return null}}
 async function api(body,timeout=3500){
  const token=auth(),r=await fetch(endpoint,{method:'POST',keepalive:true,signal:AbortSignal.timeout(timeout),headers:{'Content-Type':'application/json','X-Chalezinho-Env':C.environment,...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({action:'mobile_telemetry',visitor_id:visitor,...body})});
  const data=await r.json();if(!r.ok||!data.ok)throw Error('measurement_unavailable');if(data.excluded){enabled=false;participant=null;}return data;
 }
 function source(){const q=new URLSearchParams(location.search),tag=q.get('utm_source')||'';let host='';try{host=new URL(document.referrer).hostname}catch{}
  for(const [name,pattern] of [['instagram',/instagram/i],['facebook',/facebook|fb\./i],['google',/google/i],['whatsapp',/whatsapp|wa\.me/i]])if(pattern.test(tag+' '+host))return name;
  return !tag&&(!host||host===location.hostname)?'direct':'other';
 }
 async function initialize(){
  try{
   if(!C?.supabaseUrl||!pages.includes(page)||!phone()||navigator.webdriver||navigator.globalPrivacyControl||navigator.doNotTrack==='1'||localStorage.getItem('ville-measurement-excluded')==='true')return null;
   visitor=localStorage.getItem(key)||'';if(!uuid.test(visitor)){visitor=crypto.randomUUID();localStorage.setItem(key,visitor)}
   const enrollment={operation:'enroll',routing_ready:C.mobileEntryExperimentEnabled===true,page:location.pathname,search:eligibleHome()?new URLSearchParams([...new URLSearchParams(location.search)].filter(([k])=>k==='utm_campaign')).toString():'?direct_target=1',hash:location.hash,width:innerWidth,source:source(),campaign:new URLSearchParams(location.search).get('utm_campaign')};
   let data;try{data=await api(enrollment,10000)}catch{data=await api(enrollment,10000)}
   if(!data.participant||data.participant.excluded)return null;
   participant=data.participant;experiment=data.experiment;enabled=true;
   return {variant:participant.variant,status:experiment.status,phase:participant.phase};
  }catch{return null}
 }
 const ready=initialize();
 async function track(event_name,payload={}){
  await ready;if(!enabled||!participant)return false;
  const body={operation:'event',participant_id:participant.id,event_id:crypto.randomUUID(),event_name,...payload};
  try{await api(body);return true}catch{try{await api(body);return true}catch{return false}}
 }
 async function entry(){
  if(C?.mobileEntryExperimentEnabled!==true){decisionTaken=true;return null;}
  // Do not delay the experience indefinitely on a failed analytics request.
  const value=await Promise.race([ready,new Promise(resolve=>setTimeout(()=>resolve(null),1300))]);decisionTaken=true;
  if(!value){ready.then(v=>{if(v&&eligibleHome())track('entry_failed',{details:{reason:'decision_timeout'}})});return null;}
  return eligibleHome()&&value.status==='running'&&value.phase==='test'?value.variant:null;
 }
 function message(text){return enabled&&participant?text+'\nReferência: '+participant.reference:text;}
 window.VilleMobileMeasurement={ready,entry,track,message,rendered(rendered){if(eligibleHome()&&decisionTaken)track('entry_rendered',{details:{rendered}})},excluded(){try{localStorage.setItem('ville-measurement-excluded','true')}catch{}enabled=false;participant=null;}};
 // This listener covers floating/contact links, but not social sharing to wa.me/?text.
 document.addEventListener('click',e=>{
  const a=e.target.closest?.('a[href]');if(!a)return;let url;try{url=new URL(a.href,location.href)}catch{return}
  const number=(C.whatsappNumber||'').replace(/\D/g,'');
  if(url.hostname==='wa.me'&&url.pathname.replace(/\D/g,'')===number&&number){
   if(!url.searchParams.get('text')?.includes('\nReferência: MV-'))url.searchParams.set('text',message(url.searchParams.get('text')||'Olá! Gostaria de informações sobre os chalés.'));
   a.href=url.href;track('whatsapp_clicked');
  }
 },true);
 const code=({'chale-premium.html':'CH1','chale-com-hidro.html':'CH2','chale-romantico.html':'CH3'})[page]||(page==='imovel.html'?(new URLSearchParams(location.search).get('codigo')||new URLSearchParams(location.search).get('chalet')):null);
 if(code)track('property_viewed',{property_code:code});
 window.addEventListener('load',()=>track('performance',{details:{duration_ms:Math.round(performance.now())}}),{once:true});
})();
