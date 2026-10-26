// Optional Google measurement. Disabled until real account IDs are configured.
// This module never asserts that a WhatsApp click is a confirmed reservation.
(()=>{
 const C=window.CHALEZINHO_CONFIG?.marketing;
 if(!C?.enabled||!/^G-[A-Z0-9]+$/.test(C.ga4Id||''))return;
 const key='ville-marketing-consent-v1',campaigns=new Set(['cv_search_guarapari','cv_brand']),groups=new Set(['signature','essenza','amore','romantico','marca']);
 let choice=null,attribution=null,loaded=false,lead=null;
 const blocked=()=>navigator.webdriver||navigator.globalPrivacyControl||navigator.doNotTrack==='1'||localStorage.getItem('ville-measurement-excluded')==='true';
 const safePage=()=>location.origin+location.pathname;
 function read(k){try{return JSON.parse(localStorage.getItem(k)||'null')}catch{return null}}
 function command(){window.dataLayer.push(arguments)}
 function capture(){
  const q=new URLSearchParams(location.search),existing=read('ville-ad-attribution-v1');
  if(q.get('utm_source')==='google'&&q.get('utm_medium')==='cpc'&&campaigns.has(q.get('utm_campaign'))){
   attribution={campaign:q.get('utm_campaign'),group:groups.has(q.get('utm_content'))?q.get('utm_content'):null,at:Date.now()};
   for(const field of ['gclid','gbraid','wbraid']){const v=q.get(field);if(v&&/^[A-Za-z0-9_-]{1,512}$/.test(v))attribution[field]=v}
   try{localStorage.setItem('ville-ad-attribution-v1',JSON.stringify(attribution))}catch{}
  }else if(existing&&Date.now()-existing.at>=0&&Date.now()-existing.at<30*86400000)attribution=existing;
  else try{localStorage.removeItem('ville-ad-attribution-v1')}catch{}
 }
 function start(){
  if(loaded||choice!=='accepted')return;
  try{if(blocked())return}catch{return}
  loaded=true;capture();window.dataLayer=window.dataLayer||[];
  command('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
  command('consent','update',{analytics_storage:'granted',ad_storage:'granted',ad_user_data:'denied',ad_personalization:'denied'});
  command('js',new Date());
  command('config',C.ga4Id,{send_page_view:false,page_location:safePage(),page_referrer:'',allow_google_signals:false,allow_ad_personalization_signals:false});
  if(/^AW-\d+$/.test(C.googleAdsId||''))command('config',C.googleAdsId,{send_page_view:false,page_location:safePage(),page_referrer:'',allow_ad_personalization_signals:false});
  const script=document.createElement('script');script.async=true;script.src='https://www.googletagmanager.com/gtag/js?id='+C.ga4Id;document.head.append(script);
  event('page_view');
  const code=({'chale-premium.html':'CH1','chale-com-hidro.html':'CH2','chale-romantico.html':'CH3'})[location.pathname.split('/').pop()];
  if(code)event('view_item',{property_code:code});
 }
 function event(name,payload={}){
  if(!loaded||choice!=='accepted'||!['page_view','view_item','search_started','search_completed','consultation_prepared','whatsapp_clicked','summary_copied'].includes(name))return;
  try{if(blocked())return}catch{return}
  const data={page_location:safePage(),page_referrer:'',send_to:C.ga4Id};
  // No URL query strings, customer details, message text, dates or trip purpose.
  if(/^CH[123]$/.test(payload.property_code||''))data.property_code=payload.property_code;
  if(lead)data.lead_reference=lead.reference;
  if(attribution){data.campaign_name=attribution.campaign;if(attribution.group)data.ad_group=attribution.group}
  command('event',name,data);
  if(name==='whatsapp_clicked'&&/^AW-\d+$/.test(C.googleAdsId||'')&&/^[A-Za-z0-9_-]+$/.test(C.whatsappLabel||''))command('event','conversion',{send_to:C.googleAdsId+'/'+C.whatsappLabel,page_location:safePage(),page_referrer:''});
 }
 function message(text){
  if(!loaded||choice!=='accepted'||!attribution)return text;
  // Stable for the same prepared quote, new reference when its contents change.
  if(!lead||lead.text!==text)lead={text,reference:'VA-'+crypto.randomUUID().replaceAll('-','').slice(0,12).toUpperCase()};
  return text+'\nOrigem: Google · '+attribution.campaign+(attribution.group?' · '+attribution.group:'')+'\nReferência do anúncio: '+lead.reference;
 }
 function choose(value){
  choice=value;try{localStorage.setItem(key,JSON.stringify({value,at:Date.now()}))}catch{}
  document.querySelector('#ville-marketing-consent')?.remove();
  if(value==='accepted')start();
  else{attribution=null;lead=null;try{localStorage.removeItem('ville-ad-attribution-v1')}catch{}
   if(loaded)command('consent','update',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
  }
 }
 function prompt(){
  document.querySelector('#ville-marketing-consent')?.remove();
  const box=document.createElement('section');box.id='ville-marketing-consent';box.setAttribute('aria-label','Preferências de medição');
  box.style.cssText='position:fixed;z-index:10000;inset:auto 12px 12px;background:#fff;color:#17130f;padding:18px;border:1px solid #b9aa94;border-radius:14px;box-shadow:0 6px 30px #0003;max-width:620px;font:16px/1.5 system-ui';
  const copy=document.createElement('p');copy.textContent='Podemos usar cookies para medir visitas e resultados dos anúncios no Google? Você pode consultar preços e reservar com qualquer escolha.';box.append(copy);
  for(const [label,value]of [['Aceitar medição','accepted'],['Somente necessários','rejected']]){const b=document.createElement('button');b.type='button';b.textContent=label;b.style.cssText='padding:12px;margin:4px;border:1px solid #78634c;border-radius:8px;background:#fff;color:#17130f;font:inherit';b.onclick=()=>choose(value);box.append(b)}
  const policy=document.createElement('a');policy.href='/documentos.html?type=privacy_policy';policy.textContent='Política de Privacidade';policy.style.cssText='display:inline-block;margin:8px;color:#51402c';box.append(policy);document.body.append(box);
 }
 window.VilleAds={event,message,preferences:prompt,attribution:()=>choice==='accepted'&&attribution?{...attribution,reference:lead?.reference||null}:null};
 document.addEventListener('click',e=>{
  const a=e.target.closest?.('a[href]');if(!a)return;let url;try{url=new URL(a.href,location.href)}catch{return}
  const number=(window.CHALEZINHO_CONFIG.whatsappNumber||'').replace(/\D/g,'');
  if(number&&url.hostname==='wa.me'&&url.pathname.replace(/\D/g,'')===number){
   if(!url.searchParams.get('text')?.includes('\nReferência do anúncio: VA-'))url.searchParams.set('text',message(url.searchParams.get('text')||'Olá! Gostaria de informações sobre os chalés.'));
   a.href=url.href;event('whatsapp_clicked');
  }
 },true);
 try{if(blocked())return;const saved=read(key);if(saved&&Date.now()-saved.at>=0&&Date.now()-saved.at<180*86400000)choice=saved.value;if(choice==='accepted')start();else if(choice!=='rejected')prompt();
  const settings=document.createElement('button');settings.type='button';settings.textContent='Preferências de medição';settings.onclick=prompt;settings.style.cssText='display:block;margin:16px auto;padding:8px;font:inherit;background:transparent;color:inherit;border:1px solid currentColor;border-radius:6px';(document.querySelector('footer')||document.body).append(settings);
 }catch{/* Storage restrictions never interrupt pricing or WhatsApp. */}
})();
