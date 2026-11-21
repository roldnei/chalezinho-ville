// Guest sales presentation. Source quotes and payment amounts stay in cents.
(function(root){
 'use strict';
 const money=cents=>(cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 function installment(cents){
  if(!Number.isSafeInteger(cents)||cents<=0)throw Error('Preço inválido para parcelamento.');
  const calculated=Math.round(cents*107/100),value=Math.round(calculated/10);
  if(!Number.isSafeInteger(calculated)||value<1)throw Error('Preço inválido para parcelamento.');
  // The displayed total equals the ten displayed installments, including rounding.
  return {count:10,total_cents:value*10,value_cents:value,value:(value/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})};
 }
 const text=cents=>'10x R$'+installment(cents).value;
 const html=cents=>'<span class="site-installments"><span class="site-installment-count">10x</span><span class="site-installment-value">R$'+installment(cents).value+'</span></span>';
 const totalText=cents=>'Total no cartão: '+money(installment(cents).total_cents);
 const cashText=cents=>'À vista: '+money(cents);
 root.VillePrices=Object.freeze({installment,text,html,totalText,cashText});
})(typeof window==='undefined'?globalThis:window);
