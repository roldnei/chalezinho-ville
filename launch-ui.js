(()=>{
 const C=window.CHALEZINHO_CONFIG;if(C.releaseProfile!=='whatsapp')return;
 const suppressed='#direct-extras{display:none!important}'+(C.features?.social===false?'.vg-social{display:none!important}':'')+(C.features?.guestPublications===false?'[data-account-mode="social"],#community-root{display:none!important}':'');
 const style=document.createElement('style');style.textContent=suppressed+'.booking-page .offer-context{display:none!important}.whatsapp-actions[hidden]{display:none!important}.booking-page #step-next[hidden]{display:none!important}.direct-checkout .review-purpose[hidden]{display:none!important}.booking-page .consultation-summary{white-space:pre-wrap;font:inherit;line-height:1.65;overflow-wrap:anywhere;background:#202125;color:#f5f3ed;border:1px solid #ffffff24;padding:20px;border-radius:14px}.whatsapp-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:16px}.whatsapp-actions a,.whatsapp-actions button{min-height:44px}.consultation-note{font-size:.85rem;line-height:1.5;color:#c7bfb5}';document.head.append(style);
 function apply(){
  const extras=document.querySelector('#direct-extras');if(extras)extras.hidden=true;
  const changeDates=document.querySelector('#change-dates');if(changeDates)changeDates.textContent='← Alterar datas e hóspedes';
  const priceHint=document.querySelector('.availability-summary>span');if(priceHint)priceHint.textContent='Preço total da escapada para as datas e hóspedes escolhidos.';
  document.querySelector('#direct-checkout-status h1')?.replaceChildren(document.createTextNode('Sua consulta'));
  const preparing=document.querySelector('#direct-checkout-status p');if(preparing)preparing.textContent='Consultando disponibilidade e preços, sem bloquear datas…';
  document.querySelectorAll('.detail-book>p').forEach(p=>{if(p.textContent.includes('finalize a reserva diretamente pelo site'))p.textContent=p.textContent.replace('finalize a reserva diretamente pelo site','continue pelo WhatsApp para finalizar com nosso atendimento')});
  document.querySelectorAll('.booking-intro>small').forEach(e=>e.textContent='CONSULTA DE HOSPEDAGEM'+(C.environment==='development'?' · HOMOLOGAÇÃO':''));
  document.querySelectorAll('.booking-intro>p').forEach(e=>e.textContent='Consulte disponibilidade e o preço total da sua escapada. Continue pelo WhatsApp, sem cadastro obrigatório.');
  document.querySelectorAll('.reservation-steps span:last-child').forEach(e=>e.textContent='3 · WhatsApp');
  for(const id of ['#trip-purpose-initial','#trip-purpose-review']){const field=document.querySelector(id);if(field)field.closest('label').hidden=true;}
  const heading=document.querySelector('.review-purpose')?.parentElement?.querySelector('h3');if(heading)heading.textContent='Sua escapada';
  const countdown=document.querySelector('#quote-countdown');if(countdown)countdown.hidden=true;
  const choice=document.querySelector('#checkout-stay-mode')?.closest('label');if(choice){for(const n of choice.childNodes)if(n.nodeType===3)n.textContent='Escapada';}
  const confidence=document.querySelector('.booking-confidence');if(confidence)confidence.innerHTML='<div><strong>Preço completo para suas datas</strong><span>Total da escapada para seus dias</span></div><div><strong>Finalize com nosso atendimento</strong><span>A consulta não confirma nem bloqueia datas</span></div><div><strong>Disponibilidade reconfirmada</strong><span>Valores sujeitos à nova consulta no atendimento</span></div>';
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
})();
