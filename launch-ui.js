(()=>{
 const C=window.CHALEZINHO_CONFIG;if(C.releaseProfile!=='whatsapp')return;
 const style=document.createElement('style');style.textContent='.direct-checkout .offer-context{display:block!important}.direct-checkout .review-purpose{display:grid!important}.vg-social,[data-account-mode="social"],#community-root{display:none!important}.consultation-summary{white-space:pre-wrap;font:inherit;line-height:1.65;overflow-wrap:anywhere;background:#f8f5ef;padding:20px;border-radius:14px}.whatsapp-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:16px}.whatsapp-actions a,.whatsapp-actions button{min-height:44px}.consultation-note{font-size:.85rem;line-height:1.5;color:#655c50}';document.head.append(style);
 function apply(){
  document.querySelector('#direct-checkout-status h1')?.replaceChildren(document.createTextNode('Sua consulta'));
  const preparing=document.querySelector('#direct-checkout-status p');if(preparing)preparing.textContent='Consultando disponibilidade e preços, sem bloquear datas…';
  document.querySelectorAll('.detail-book>p').forEach(p=>{if(p.textContent.includes('finalize a reserva diretamente pelo site'))p.textContent=p.textContent.replace('finalize a reserva diretamente pelo site','continue pelo WhatsApp para finalizar com nosso atendimento')});
  document.querySelectorAll('.booking-intro>small').forEach(e=>e.textContent='CONSULTA DE HOSPEDAGEM'+(C.environment==='development'?' · HOMOLOGAÇÃO':''));
  document.querySelectorAll('.booking-intro>p').forEach(e=>e.textContent='Consulte disponibilidade, compare tarifas e personalize sua estadia. Continue pelo WhatsApp, sem cadastro obrigatório.');
  document.querySelectorAll('.reservation-steps span:last-child').forEach(e=>e.textContent='3 · WhatsApp');
  const confidence=document.querySelector('.booking-confidence');if(confidence)confidence.innerHTML='<div><strong>Preço completo para suas datas</strong><span>Hospedagem, limpeza e experiências identificadas</span></div><div><strong>Finalize com nosso atendimento</strong><span>A consulta não confirma nem bloqueia datas</span></div><div><strong>Disponibilidade reconfirmada</strong><span>Valores sujeitos à nova consulta no atendimento</span></div>';
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
})();
