// Sales presentation reads the property's persisted PMS conditions. Quotes remain unchanged.
(function(root){
 'use strict';
 const money=cents=>(cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 let rows=new Map(),validUntil=0,loading=null,scope='';
 function valid(row){return row&&Number.isSafeInteger(row.property_id)&&row.property_id>0&&Number.isInteger(row.credit_fee_bps)&&row.credit_fee_bps>=0&&row.credit_fee_bps<=10000&&Number.isInteger(row.installments_count)&&row.installments_count>=1&&row.installments_count<=12&&row.cash_price_source==='quote';}
 function configure(values){rows=new Map(values.filter(valid).map(row=>[row.property_id,Object.freeze({...row})]));validUntil=Date.now()+60000;return [...rows.values()];}
 async function load({force=false}={}){
  const C=root.CHALEZINHO_CONFIG;
  if(!C?.supabaseUrl||!C.supabaseKey)return [...rows.values()];
  if(scope&&scope!==C.supabaseUrl){rows.clear();validUntil=0;}scope=C.supabaseUrl;
  if(loading)return loading;
  if(!force&&validUntil>Date.now())return [...rows.values()];
  loading=(async()=>{
   try{
    const response=await fetch(C.supabaseUrl+'/rest/v1/property_commercial_payment_terms?select=property_id,credit_fee_bps,installments_count,cash_price_source,updated_at',{headers:{apikey:C.supabaseKey,Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(10000)});
    const body=await response.json();if(!response.ok||!Array.isArray(body))throw Error('payment_conditions_unavailable');return configure(body);
   }catch{rows.clear();validUntil=0;return [];}finally{loading=null;}
  })();return loading;
 }
 const propertyId=subject=>Number(typeof subject==='object'?subject?.property_id??subject?.id:subject);
 function terms(subject){const embedded=subject?.commercial_payment_terms;return valid(embedded)&&embedded.property_id===propertyId(subject)?embedded:rows.get(propertyId(subject))??null;}
 function installment(cents,subject){
  if(!Number.isSafeInteger(cents)||cents<=0)throw Error('Preço inválido para parcelamento.');
  const t=terms(subject);if(!t)throw Error('Configure a taxa e as parcelas deste imóvel em Taxas e pagamento no PMS.');
  const calculated=Math.round(cents*(10000+t.credit_fee_bps)/10000),value=Math.round(calculated/t.installments_count);
  if(!Number.isSafeInteger(calculated)||value<1)throw Error('Preço inválido para parcelamento.');
  return {count:t.installments_count,total_cents:value*t.installments_count,value_cents:value,value:(value/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})};
 }
 const text=(cents,subject)=>terms(subject)?installment(cents,subject).count+'x R$'+installment(cents,subject).value:money(cents)+' no Pix';
 const html=(cents,subject)=>{if(!terms(subject))return money(cents);const p=installment(cents,subject);return '<span class="site-installments"><span class="site-installment-count">'+p.count+'x</span><span class="site-installment-value">R$'+p.value+'</span></span>';};
 const heading=subject=>terms(subject)?'ESTADIA EM '+terms(subject).installments_count+' PARCELAS':'TOTAL À VISTA';
 const totalText=(cents,subject)=>terms(subject)?'Total no cartão: '+money(installment(cents,subject).total_cents):'';
 const cashText=cents=>'Total à vista: '+money(cents)+' no Pix';
 const cashHTML=cents=>'Total à vista: '+money(cents)+' <small class="site-pix-label">no Pix</small>';
 root.VillePrices=Object.freeze({load,configure,terms,installment,text,html,heading,totalText,cashText,cashHTML});
})(typeof window==='undefined'?globalThis:window);
