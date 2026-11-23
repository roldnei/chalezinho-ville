(()=>{
 'use strict';
 const $=s=>document.querySelector(s),C=window.CHALEZINHO_CONFIG,endpoint=C.supabaseUrl+'/functions/v1/rental-catalog',escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const form=$('#rental-search'),status=$('#rental-status'),detail=document.body.dataset.rentalPage==='detail',slug=new URLSearchParams(location.search).get('slug');
 let catalog=[],list=[],selection=null,selected=null,sequence=0;
 const money=cents=>(cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),day=s=>s.split('-').reverse().join('/');
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 form.elements.start.min=today;form.elements.end.min=today;form.elements.guests.value='2';
 form.elements.start.addEventListener('change',()=>{const date=form.elements.start.value;if(!date)return;const next=new Date(Date.parse(date+'T12:00:00Z')+86400000).toISOString().slice(0,10);form.elements.end.min=next;if(form.elements.end.value<=date)form.elements.end.value=next});
 const href=p=>'/imoveis/'+encodeURIComponent(p.slug);
 const facts=p=>'<div class="rental-facts"><span>Até '+p.max_guests+' hóspedes</span><span>'+p.listing.bedrooms+' quartos</span><span>'+p.listing.bathrooms+' '+(p.listing.bathrooms===1?'banheiro':'banheiros')+'</span></div>';
 const amenities=p=>'<div class="rental-amenities">'+[p.listing.parking?'Com garagem':'Sem garagem',p.listing.air_conditioning?'Ar-condicionado':'Sem ar-condicionado',p.listing.linen?'Enxoval incluído':'Traga seu enxoval'].map(x=>'<span>'+x+'</span>').join('')+'</div>';
 function whatsapp(p){
  let text='Olá! Vim pelo site do Chalezinho Ville e gostaria de consultar '+p.name+'.';
  if(selection)text+='\nEntrada: '+day(selection.start)+'\nSaída: '+day(selection.end)+'\nHóspedes: '+selection.guests;
  if(p.available&&Number.isSafeInteger(p.total_cents))text+='\nValor consultado: '+money(p.total_cents)+' à vista no Pix (hospedagem e limpeza).';
  text+='\nPodem confirmar a disponibilidade e as condições?';
  return 'https://wa.me/'+C.whatsappNumber.replace(/\D/g,'')+'?text='+encodeURIComponent(text);
 }
 function resultNote(p){
  if(!selection)return '';
  if(p.available){const terms=window.VillePrices.terms(p);return '<div class="rental-price"><span class="availability-label">Datas disponíveis na consulta</span><small>'+(terms?window.VillePrices.heading(p):'TOTAL DA ESTADIA')+'</small><strong>'+window.VillePrices.html(p.total_cents,p)+'</strong><p>'+window.VillePrices.cashHTML(p.total_cents)+'</p><small>Hospedagem e limpeza incluídas. Confirmação pelo WhatsApp.</small></div>'}
  const messages={occupied:'Estas datas estão ocupadas.',minimum_stay:'Para estas datas, a estadia mínima é de '+p.min_stay+' noites.',capacity:'Este imóvel recebe até '+p.max_guests+' hóspedes.',calendar_unavailable:'Não foi possível verificar o calendário agora.',rate_unavailable:'Valor para estas datas sob consulta.',past_date:'Escolha uma data de entrada futura.',availability_window:'Estas datas estão fora do período aberto.',same_day_approval_required:'Reservas para hoje precisam de confirmação.'};
  return '<div class="rental-price"><p role="status">'+escape(messages[p.unavailable_reason]||'Consulte a disponibilidade para estas datas.')+'</p></div>';
 }
 function render(){
  let rows=detail?list.filter(p=>p.slug===slug):list.filter(p=>(!$('#filter-parking').checked||p.listing.parking)&&(!$('#filter-ac').checked||p.listing.air_conditioning));
  $('#rental-list').innerHTML=rows.length?rows.map(p=>'<article class="rental-card"><a class="rental-card-image" href="'+href(p)+'"><img src="'+escape(p.cover_image)+'" alt="'+escape(p.name)+'" width="1440" height="1080" loading="lazy"><span>'+escape(p.listing.location_label)+'</span></a><div class="rental-card-body"><span class="eyebrow">'+escape(p.listing.eyebrow||'SEU LUGAR EM GUARAPARI')+'</span><h3><a href="'+href(p)+'">'+escape(p.name)+'</a></h3>'+facts(p)+'<p>'+escape(p.tagline||p.summary)+'</p>'+amenities(p)+resultNote(p)+'<div class="rental-card-actions">'+(!detail?'<a class="rental-button secondary" href="'+href(p)+'">Conhecer o imóvel</a>':'')+'<a class="rental-button" href="'+escape(whatsapp(p))+'" target="_blank" rel="noopener">'+(selection&&p.available?'Consultar esta estadia':'Falar pelo WhatsApp')+'</a></div></div></article>').join(''):'<p>Nenhum imóvel com esses filtros. Experimente outra combinação.</p>';
 }
 function renderDetail(p){
  document.title=p.name+' | Chalezinho Ville';
  const images=[...new Set([p.cover_image,...p.gallery])].filter(x=>typeof x==='string'&&x);
  $('#rental-detail').innerHTML='<div class="detail-heading"><span class="eyebrow">'+escape(p.listing.location_label)+' · GUARAPARI</span><h1>'+escape(p.name)+'</h1>'+facts(p)+'</div><div class="rental-gallery">'+images.slice(0,5).map((src,i)=>'<button type="button" data-photo="'+i+'" aria-label="Ampliar foto '+(i+1)+' de '+escape(p.name)+'"><img src="'+escape(src)+'" alt="'+escape(p.name)+' — foto '+(i+1)+'" '+(i?'loading="lazy"':'fetchpriority="high"')+'></button>').join('')+'</div><div class="gallery-more"><button class="text-link" type="button" id="all-photos">Ver todas as '+images.length+' fotos</button></div><section class="detail-copy"><div><h2>'+escape(p.tagline||'Um lugar para ficar.')+'</h2><p>'+escape(p.summary)+'</p>'+amenities(p)+'<div class="rental-amenities">'+p.amenities.map(x=>'<span>'+escape(x)+'</span>').join('')+'</div></div><aside class="detail-notes"><h2>Antes de reservar</h2><p>'+escape(p.listing.notes)+'</p></aside></section>';
  let current=0;const dialog=$('#photo-dialog');
  function showPhoto(i){current=(i+images.length)%images.length;$('#large-photo').src=images[current];$('#large-photo').alt=p.name+' — foto '+(current+1);$('#photo-caption').textContent='Foto '+(current+1)+' de '+images.length+'. Use as setas do teclado ou toque na foto para avançar.';if(!dialog.open)dialog.showModal()}
  document.querySelectorAll('[data-photo]').forEach(b=>b.onclick=()=>showPhoto(Number(b.dataset.photo)));$('#all-photos').onclick=()=>showPhoto(0);$('#close-photo').onclick=()=>dialog.close();$('#large-photo').onclick=()=>showPhoto(current+1);dialog.addEventListener('keydown',e=>{if(e.key==='ArrowRight')showPhoto(current+1);if(e.key==='ArrowLeft')showPhoto(current-1)});
  [...form.elements.guests.options].forEach(o=>o.disabled=Number(o.value)>p.max_guests);
 }
 async function request(params){const response=await fetch(endpoint+'?'+new URLSearchParams(params),{signal:AbortSignal.timeout(65000)});const d=await response.json();if(!response.ok||!d.ok)throw Error(d.error||'catalog_unavailable');return d}
 form.onsubmit=async event=>{
  event.preventDefault();if(!form.reportValidity())return;
  const start=form.elements.start.value,end=form.elements.end.value,guests=Number(form.elements.guests.value),nights=(Date.parse(end)-Date.parse(start))/86400000;
  if(start<today||nights<1||nights>90){status.textContent='Escolha uma estadia futura de 1 a 90 noites.';return}
  const token=++sequence;selection={start,end,guests};status.textContent='Consultando datas e valores…';form.querySelector('button').disabled=true;
  try{await window.VillePrices.load({force:true});const d=await request({action:'search',...selection});if(token!==sequence)return;list=d.listings;render();status.textContent='Consulta atualizada. A reserva é confirmada pelo WhatsApp.';if(!detail)$('#reset-rental-search').hidden=false}catch{if(token!==sequence)return;list=catalog.map(p=>({...p,available:false,unavailable_reason:'calendar_unavailable'}));render();status.textContent='Não foi possível verificar as datas agora. Fale com a gente pelo WhatsApp para confirmar.'}finally{if(token===sequence)form.querySelector('button').disabled=false}
 };
 if(!detail){for(const id of ['#filter-parking','#filter-ac'])$(id).onchange=render;$('#reset-rental-search').onclick=()=>{sequence++;selection=null;list=catalog;form.reset();form.elements.guests.value='2';form.querySelector('button').disabled=false;status.textContent='';$('#reset-rental-search').hidden=true;render()}}
 (async()=>{try{const d=await request({action:'catalog'});catalog=d.listings;list=catalog;if(detail){selected=catalog.find(p=>p.slug===slug);if(!selected){$('#rental-detail').innerHTML='<h1>Imóvel não encontrado</h1><p>Veja os imóveis disponíveis em Casas e apartamentos.</p>';$('.detail-consult').hidden=true;return}renderDetail(selected)}render()}catch{$('#rental-list').innerHTML='<p>Não foi possível carregar os imóveis. <a href="https://wa.me/'+C.whatsappNumber+'" target="_blank" rel="noopener">Fale com a gente pelo WhatsApp</a>.</p>';status.textContent='Consulta indisponível no momento.'}})();
})();
