(function(root){
 const money=c=>(Number(c)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 const date=d=>d.split('-').reverse().join('/');
 function summary({quote,rate}){
  if(!quote||!rate||!Number.isSafeInteger(rate.total_amount_cents))throw Error('current_quote_required');
  const c=rate.contract_snapshot,nights=(Date.parse(c.check_out)-Date.parse(c.check_in))/86400000;
  if(quote.consultation_pricing?.profile==='lodging-airbnb-base-v1')return [`Chalé: ${c.property_name}`,`Entrada: ${date(c.check_in)} · Saída: ${date(c.check_out)} · ${nights} noites`,`Hóspedes: ${c.guests}`,'Seleção: Escapada',`Total consultado: ${money(rate.total_amount_cents)}`,`Consulta: ${new Date(quote.checked_at||quote.consulted_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}`,'Disponibilidade e valores serão reconfirmados no atendimento. Esta consulta não confirma nem bloqueia a hospedagem.'].join('\n');
  const lines=[`Chalé: ${c.property_name}`,`Entrada: ${date(c.check_in)} · Saída: ${date(c.check_out)} · ${nights} noites`,`Hóspedes: ${c.guests}`,`Seleção: ${c.offer_name||((quote.experiences||[]).length?'Hospedagem com experiências':'Somente hospedagem')}`,`Tarifa: ${rate.name}`];
  for(const e of quote.experiences||[]){lines.push(`Experiência: ${e.product}${e.included?' (incluída)':''}`);if(e.composition?.commercial_condition)lines.push(`Condição da experiência: ${e.composition.commercial_condition.label}`);for(const item of e.composition?.components||[])lines.push(`  ${item.quantity||1} × ${item.name}${item.choice?' · '+item.choice:''}`);}
  const priceLines=c.lines||[];
  for(const [key,label,fallback] of [['accommodation','Hospedagem',rate.accommodation_amount_cents],['cleaning','Limpeza',rate.cleaning_fee_cents]])lines.push(`${label}: ${money(priceLines.find(l=>l.key===key)?.gross_cents??fallback)}`);
  for(const e of quote.experiences||[])lines.push(`${e.product}: ${money(priceLines.find(l=>l.key===e.product_id)?.gross_cents??e.price_cents)}`);
  lines.push(`Desconto: ${money(c.discount_cents||0)}`,`Total consultado: ${money(rate.total_amount_cents)}`);
  if(rate.cancellation_policy)lines.push(`Condições: ${rate.cancellation_policy.title||rate.name}${rate.cancellation_policy.version?' · versão '+rate.cancellation_policy.version:''}. Consulte os detalhes da tarifa no site.`);
  lines.push(`Consulta: ${new Date(quote.checked_at||quote.consulted_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}`);
  lines.push('Disponibilidade e valores serão reconfirmados no atendimento. Esta consulta não confirma nem bloqueia a hospedagem.');
  return lines.join('\n');
 }
 const api={summary,message:value=>'Olá! Gostaria de finalizar esta hospedagem pelo atendimento.\n\n'+summary(value)};
 root.VilleConsultationSummary=api;
 if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
