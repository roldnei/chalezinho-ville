// Read-only date suggestions; every result is checked by the canonical inventory.
(()=>{
 'use strict';
 const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const shift=(date,days)=>new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);
 function periods(today){
  const list=[];
  // Start tomorrow or later. Two-night windows respect actual minimum-stay
  // rules through search; no unavailable period receives an advertised price.
  for(let i=1;i<=21;i++){const start=shift(today,i),weekday=new Date(start+'T12:00:00Z').getUTCDay();if(weekday===1||weekday===5)list.push({start,end:shift(start,2)})}
  return list;
 }
 const date=value=>new Date(value+'T12:00:00Z').toLocaleDateString('pt-BR',{day:'numeric',month:'short',timeZone:'UTC'});
 function mount({host,property,request,onChoose}){
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),candidates=periods(today);
  let offset=0,loading=false,shown=0;
  host.innerHTML='<div class="rental-showcase-heading"><div><span class="eyebrow">ENCONTRE SEUS PRÓXIMOS DIAS</span><h2>Uma estadia <em>para você.</em></h2><p>Períodos para '+property.max_guests+' hóspedes, com hospedagem e limpeza no total.</p></div><a class="text-link" href="#consultar">Escolher outras datas</a></div><p class="rental-status" data-showcase-status role="status">Veja sugestões de datas para este imóvel.</p><div class="rental-showcase-track" aria-label="Sugestões de estadia" tabindex="0"></div><button type="button" class="rental-button secondary" data-showcase-more>Ver mais períodos</button>';
  const track=host.querySelector('.rental-showcase-track'),status=host.querySelector('[data-showcase-status]'),more=host.querySelector('[data-showcase-more]');
  async function load(){
   if(loading||offset>=candidates.length)return;loading=true;more.disabled=true;status.textContent='Consultando disponibilidade e valores…';
   const batch=candidates.slice(offset,offset+3);offset+=batch.length;
   await window.VillePrices.load();
   // Two concurrent searches at most; remaining suggestions are requested only
   // when the visitor chooses to see more. No background polling or holds.
   const results=new Array(batch.length);let cursor=0;
   await Promise.all([0,1].map(async()=>{while(cursor<batch.length){const i=cursor++,period=batch[i];try{const d=await request({action:'search',...period,guests:property.max_guests});results[i]=d.listings.find(p=>p.id===property.id&&p.available&&Number.isSafeInteger(p.total_cents)&&p.total_cents>0)}catch{results[i]=null}}}));
   results.forEach((p,i)=>{
    if(!p)return;shown++;const period=batch[i],article=document.createElement('article');article.className='rental-period-card';
    const images=window.VilleRentalGallery.photos(property),src=images[(shown-1)%images.length]||property.cover_image;
    article.innerHTML='<div class="bf-rental-photo"><img src="'+escape(src)+'" alt="'+escape(property.name)+'" width="640" height="480" loading="lazy"><span class="bf-stamp bf-stamp-full"><span>BLACK</span><strong>FRIDAY</strong><b>-15%</b></span></div><div><span class="eyebrow">'+(new Date(period.start+'T12:00:00Z').getUTCDay()===5?'FIM DE SEMANA':'DIAS DE SEMANA')+'</span><h3>'+escape(date(period.start))+' a '+escape(date(period.end))+'</h3><p>2 noites · '+property.max_guests+' hóspedes</p><div class="rental-price"><small>'+window.VillePrices.heading(p)+'</small><strong>'+window.VillePrices.html(p.total_cents,p)+'</strong><p>'+window.VillePrices.cashHTML(p.total_cents)+'</p></div><button type="button" class="rental-button">Quero estes dias</button><small class="rental-period-note">Confirmação pelo WhatsApp.</small></div>';
    // Refresh the chosen period in the main consultation before handing off.
    article.querySelector('button').onclick=()=>onChoose({...period,guests:property.max_guests});track.append(article);
   });
   loading=false;more.disabled=false;more.hidden=offset>=candidates.length;
   status.textContent=shown?'Valores consultados para estes períodos. Confira as datas antes de combinar sua reserva.':offset<candidates.length?'Não encontramos disponibilidade nesses primeiros períodos. Veja mais datas ou escolha as suas.':'Não encontramos sugestões disponíveis agora. Escolha suas datas para consultar pelo WhatsApp.';
  }
  more.onclick=load;
  if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();void load()}},{rootMargin:'250px'});observer.observe(host)}else void load();
 }
 window.VilleRentalShowcase=Object.freeze({mount,periods});
})();
