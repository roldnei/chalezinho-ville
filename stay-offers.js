(()=>{
 const esc=value=>String(value??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
 const components=p=>p.details?.components||(p.details?.includes||[]).map(name=>({name,quantity:1,frequency:'arrival',choices:[]}));
 const label=c=>`${c.quantity||1} × ${c.name}${c.choice?' · '+c.choice:''}${c.frequency==='daily'?' · por dia':c.frequency==='departure'?' · na saída':' · na chegada'}`;
 const issues={offer_paused:'Estadia completa pausada',offer_property_incompatible:'Esta oferta não atende este imóvel',offer_duration:'Duração fora do permitido nesta oferta',offer_period:'Oferta fora do período de venda',package_missing:'Pacote não encontrado',package_paused:'Um pacote está pausado',package_not_for_offers:'Pacote não disponível em estadias completas',package_property_incompatible:'Pacote não atende este imóvel',package_out_of_stock:'Pacote sem disponibilidade',package_lead_time:'Antecedência insuficiente para preparar a experiência',experience_category_conflict:'Pacotes da mesma categoria não podem ser combinados',experience_component_conflict:'Há itens repetidos na composição',package_components_required:'Cadastre os itens incluídos no pacote',package_unavailable:'Pacote sem opção ativa para venda',experience_capacity:'Limite de atendimento da experiência atingido',experience_choice_required:'Escolha as preferências dos itens',offer_unavailable:'Oferta indisponível'};
 function contractMarkup(c){if(!c)return '';return `<section class="contract-inclusions"><h3>${esc(c.offer_name||'Sua estadia')}</h3>${c.discount_cents?`<p>Desconto da estadia completa: <strong>${(c.discount_cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</strong></p>`:''}${(c.experiences||[]).map(p=>`<details ${p.included?'open':''}><summary>${esc(p.name)}${p.included?' · incluído':''}</summary><ul>${(p.components||[]).map(item=>`<li>${esc(label(item))}</li>`).join('')}</ul></details>`).join('')}</section>`}
 window.VilleOffers={esc,components,label,issues,contractMarkup};
 let bootVersion=0;
 async function boot(){
  const version=++bootVersion;
  if(!document.querySelector('.hero,[data-property-code],#property-detail'))return;
  if(document.querySelector('.hero')&&!document.querySelector('main[data-property-code],#property-detail')&&window.VilleShowcase){await window.VilleShowcase.load([]);return}
  try{
   const res=await fetch(window.CHALEZINHO_CONFIG.bookingEngine+'?action=stay_offers',{cache:'no-store',headers:{'X-Chalezinho-Env':'development'}});
   if(!res.ok)throw Error("offer_catalog_unavailable");const {offers=[]}=await res.json();
   const code=document.querySelector('main[data-property-code]')?.dataset.propertyCode||new URLSearchParams(location.search).get('codigo');
   if(!code&&document.querySelector('.hero')&&window.VilleShowcase){await window.VilleShowcase.load(offers);return}
   let property=null;if(code){const r=await fetch(window.CHALEZINHO_CONFIG.bookingEngine+'?action=property_media',{cache:'no-store'});property=(await r.json()).properties?.find(p=>p.code===code)}
   const available=offers.filter(o=>!property?Object.values(o.issues_by_property||{}).some(x=>!x.length):o.property_ids.map(Number).includes(property.id)&&!(o.issues_by_property?.[property.id]||[]).length);
   const section=document.createElement('section');section.className='stay-offers-public';section.id='estadias-completas';
   section.innerHTML=`${available.length?'<small>PREPARADO PARA A CHEGADA</small><h2>Escolha os dias.<br><em>A chegada já vem preparada.</em></h2><p>Reserve a hospedagem com os detalhes da experiência incluídos. O preço completo é calculado para suas datas.</p>':'<h2>Escolha seus dias.</h2><p>Consulte as datas e o preço da sua hospedagem.</p>'}<div class="stay-offer-cards">${available.map(o=>{
    const photos=o.media?.length?o.media:o.packages?.flatMap(p=>(p.experience_media||[]).map(m=>m.media_url))||[];
    const inclusions=o.packages?.flatMap(components)||[];
    return `<article>${photos[0]?`<img src="${esc(photos[0])}" alt="${esc(o.name)}" loading="lazy">`:''}<div><small>COM EXPERIÊNCIA INCLUÍDA</small><h3>${esc(o.name)}</h3><p>${esc(o.description)}</p><ul>${inclusions.map(c=>`<li>${esc(label(c))}</li>`).join('')}</ul>${o.discount_enabled&&o.discount_bps?`<p class="offer-saving">${o.discount_bps/100}% de desconto na hospedagem, limpeza e pacotes desta oferta.</p>`:''}<a class="primary-action" href="reservar.html?stay_offer=${encodeURIComponent(o.id)}${code?'&chalet='+encodeURIComponent(code):''}">Consultar datas e preço completo</a></div></article>`;
   }).join('')}</div>${!available.length?'<p>Este imóvel não tem estadias completas ativas no momento.</p>':''}<a class="stay-only-link" href="reservar.html?mode=stay${code?'&chalet='+encodeURIComponent(code):''}">Prefiro somente hospedagem →</a><p class="offer-help">Também é possível acrescentar pacotes avulsos pelo preço cheio. A duração segue as regras do imóvel e da oferta.</p>`;
   if(property&&window.Villegram){
    const feed=await fetch(window.CHALEZINHO_CONFIG.bookingEngine+'?action=stay_showcase',{headers:{'X-Chalezinho-Env':'development'}}).then(r=>r.json()).catch(()=>({cards:[]}));
    const cards=(feed.cards||[]).filter(c=>c.property_id===property.id);await window.Villegram.configure(cards,offers);
    section.querySelectorAll('article').forEach((article,i)=>{const c=cards.find(c=>c.offer_id===available[i]?.id);if(!c)return;const b=document.createElement('button');b.type='button';b.className='villegram-watch';b.textContent='▶ Assistir no Ville Moments · '+(c.total_cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});b.onclick=()=>window.Villegram.open(c);article.querySelector('div').append(b)});
   }
   if(version!==bootVersion)return;document.querySelector('#estadias-completas')?.remove();
   const main=document.querySelector('main[data-property-code],#property-detail')||document.querySelector('main');
   const hero=main?.querySelector('.detail-hero');if(hero)hero.after(section);else{const target=document.querySelector('#experiencias,#estadias-completas');if(target)target.replaceWith(section);else document.querySelector('.hero')?.after(section)}
  }catch(error){console.warn('Não foi possível carregar as estadias completas.',error);if(!document.querySelector('main[data-property-code],#property-detail')&&window.VilleShowcase&&!document.querySelector('.stay-showcase'))await window.VilleShowcase.load([])}
 }
 document.addEventListener('DOMContentLoaded',boot);document.addEventListener('ville:property-ready',()=>{document.querySelector('#estadias-completas')?.remove();boot()});
})();
