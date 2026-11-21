// This editor uses the existing authenticated Supabase client; RLS authorizes writes.
(()=>{
 const fields='property_id,credit_fee_bps,installments_count,cash_price_source,updated_at';
 async function mount({host,property,sb,onSaved=()=>{}}){
  const section=document.createElement('section');section.className='admin-panel';section.innerHTML='<h3>Preço anunciado no site</h3><p role="status">Carregando as condições de pagamento…</p>';const original=host.querySelector('#property-form');if(original)original.before(section);else host.append(section);
  try{
   const result=await sb.from('property_commercial_payment_terms').select(fields).eq('property_id',property.id).maybeSingle();if(result.error)throw result.error;
   if(!section.isConnected)return;
   let saved=result.data;const max=Number(property.features?.payment_terms?.max_installments??12);
   section.innerHTML='<h3>Preço anunciado no site</h3><form class="admin-form" data-commercial-payment><div class="admin-form-grid"><label>Taxa no crédito (%)<input name="credit_fee_percent" inputmode="decimal" type="number" min="0" max="100" step="0.01" required value="'+(saved?saved.credit_fee_bps/100:'')+'"></label><label>Número de parcelas anunciado<input name="installments_count" type="number" min="1" max="'+max+'" required value="'+(saved?saved.installments_count:'')+'"></label></div><p>À vista: preço já consultado para as datas, com a indicação <small>no Pix</small>.</p><p>O limite atual do cartão é '+max+' parcelas. A condição anunciada aparece no site, no resumo e nos vídeos.</p><p class="admin-form-message" role="status"></p><button class="admin-primary" type="submit">Salvar condição anunciada</button></form>';
   const form=section.querySelector('form'),message=form.querySelector('[role=status]'),button=form.querySelector('button');
   form.onsubmit=async event=>{
    event.preventDefault();if(!form.reportValidity()||button.disabled)return;
    const percent=Number(form.elements.credit_fee_percent.value),count=Number(form.elements.installments_count.value),bps=Math.round(percent*100);
    if(!Number.isFinite(percent)||percent<0||percent>100||Math.abs(percent*100-bps)>.00001||!Number.isInteger(count)||count<1||count>max){message.textContent='Confira a taxa e o número de parcelas.';return;}
    button.disabled=true;message.textContent='Salvando…';
    try{
     const value={property_id:property.id,credit_fee_bps:bps,installments_count:count,cash_price_source:'quote'};
     let query=saved?sb.from('property_commercial_payment_terms').update(value).eq('property_id',property.id).eq('updated_at',saved.updated_at):sb.from('property_commercial_payment_terms').insert(value);
     const result=await query.select(fields).maybeSingle();if(result.error)throw result.error;
     if(!result.data){message.textContent='As condições foram alteradas em outra tela. Feche e abra novamente antes de salvar.';return;}
     saved=result.data;await onSaved(saved);message.textContent='Condição salva. Site e vídeos usarão estes valores nas próximas consultas.';
    }catch(error){message.textContent=error.code==='42501'?'Seu acesso não permite alterar estas condições.':error.code==='23505'?'Outra tela já salvou estas condições. Feche e abra novamente.':'Não foi possível salvar. Confira os valores e tente novamente.';}finally{button.disabled=false;}
   };
  }catch{section.querySelector('[role=status]').textContent='Não foi possível carregar as condições. Feche e abra novamente para tentar.';}
 }
 window.VillePropertyPaymentEditor={mount};
})();
