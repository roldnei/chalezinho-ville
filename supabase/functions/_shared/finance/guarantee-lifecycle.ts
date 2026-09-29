import type {PaymentGateway,ProviderCharge} from './gateway.ts';

const HOUR=3600000;
export function guaranteeCoverage(g:any,reservation:any,now=Date.now()) {
  const property=reservation?.properties;
  // Properties currently use the Sao Paulo timezone. SQL scheduling is the
  // authority and uses each property's time and timezone, never browser dates.
  const departure=Date.parse(`${reservation?.check_out}T${String(property?.check_out_time||'11:00').slice(0,5)}:00-03:00`);
  const expiry=Date.parse(g.provider_capture_before||'');
  const active=['guaranteed','incident_reported'].includes(g.status)&&Number.isFinite(expiry)&&expiry>now;
  return {active,covered_until:active?g.provider_capture_before:null,
    covers_checkout:active&&Number.isFinite(departure)&&expiry>=departure+HOUR,
    renewal_due:active&&expiry<departure+HOUR&&expiry<=now+48*HOUR,
    expired:['guaranteed','incident_reported'].includes(g.status)&&Number.isFinite(expiry)&&expiry<=now,
    attention:g.attention_code||g.provider_error_code||null};
}
export async function loadGuaranteeLifecycle(admin:any,id:string) {
  const {data,error}=await admin.from('guarantees').select('*,reservations(id,user_id,status,property_id,check_in,check_out,guest_name,guest_email,guest_phone,confirmation_code,properties(check_in_time,check_out_time,timezone))').eq('id',id).single();
  if(error)throw new Error('guarantee_unavailable');
  return data;
}
async function writeObservation(admin:any,a:any,charge:ProviderCharge) {
  if(charge.id!==a.provider_charge_id||charge.amount.currency!=='BRL')throw new Error('authorization_mismatch');
  // A partial capture can change amount.value. Its money is reconciled through
  // the incident ledger; it must not be interpreted as a replacement hold.
  if(charge.status==='PAID'){
    const {data:g}=await admin.from('guarantees').select('active_authorization_id,status').eq('id',a.guarantee_id).single();
    if(g?.active_authorization_id!==a.id||!['capture_requested','capture_uncertain','captured'].includes(g.status))
      await admin.from('guarantees').update({attention_code:'unexpected_provider_capture'}).eq('id',a.guarantee_id);
    return;
  }
  const {error}=await admin.rpc('observe_guarantee_authorization',{p_id:a.id,p_charge:charge.id,
    p_order:a.provider_order_id,p_status:charge.status,p_amount:charge.amount.value,
    p_paid:charge.summary?.paid??null,p_expiry:charge.captureBefore||null,
    p_error:charge.declineCode||null});
  if(error)throw new Error('authorization_observation_pending');
}
export async function reconcileGuaranteeAuthorizations(admin:any,guaranteeId:string,gateway:PaymentGateway) {
  const {data:rows,error}=await admin.from('guarantee_authorizations').select('*').eq('guarantee_id',guaranteeId)
    .in('state',['requested','uncertain','authorized','release_pending','expired']).order('created_at');
  if(error)throw new Error('authorization_history_unavailable');
  for(const a of rows||[]) {
    if(!a.provider_charge_id){
      if(Date.parse(a.created_at)<Date.now()-2*60000){
        await admin.from('guarantee_authorizations').update({state:'uncertain',provider_error_code:'provider_result_unknown'})
          .eq('id',a.id).in('state',['requested','uncertain']);
        await admin.from('guarantees').update({attention_code:'authorization_result_uncertain'}).eq('id',guaranteeId);
      }
      continue;
    }
    const charge=await gateway.getPayment(a.provider_charge_id,a.provider_order_id||undefined);
    await writeObservation(admin,a,charge);
    // A previous hold is released only after the new one was confirmed. A
    // failed cancellation is read again but never sent using a fresh key.
    const {data:current,error:readError}=await admin.from('guarantee_authorizations').select('state').eq('id',a.id).single();
    if(readError)throw new Error('authorization_history_unavailable');
    if(current.state==='release_pending'&&charge.status==='AUTHORIZED'&&charge.amount.value===Number(a.amount_cents)){
      const {data:claimed,error:claimError}=await admin.rpc('claim_obsolete_authorization_release',{p_id:a.id});
      if(claimError)throw new Error('authorization_release_claim_failed');
      if(claimed===true){
        try {
          await gateway.cancelAuthorization(charge.id,Number(a.amount_cents),`ga-release-${a.id}`);
          await writeObservation(admin,a,await gateway.getPayment(charge.id,a.provider_order_id||undefined));
        }catch{
          await admin.from('guarantees').update({attention_code:'authorization_cleanup_pending'}).eq('id',guaranteeId);
        }
      }
    }
  }
  return loadGuaranteeLifecycle(admin,guaranteeId);
}
export async function authorizeGuarantee(admin:any,guaranteeId:string,gateway:PaymentGateway,notificationUrl:string) {
  const g=await loadGuaranteeLifecycle(admin,guaranteeId),r=g.reservations;
  const {data:identity,error:identityError}=await admin.rpc('guest_payment_identity',{p_user_id:r.user_id});
  const holder=Array.isArray(identity)?identity[0]:identity;
  const phone=String(r.guest_phone||'').replace(/\D/g,'').replace(/^55(?=\d{10,11}$)/,'');
  if(identityError||holder?.document_type!=='cpf'||!/^\d{10,11}$/.test(phone)) {
    await admin.from('guarantees').update({attention_code:'identity_unavailable',next_action_at:new Date(Date.now()+HOUR).toISOString()}).eq('id',g.id);
    return {id:g.id,status:'identity_unavailable'};
  }
  try{gateway.validatePayment({referenceId:'guarantee_validation',amountCents:Number(g.amount_cents),method:'card',cardToken:'validation',installments:1,
    customer:{name:r.guest_name,email:r.guest_email,taxId:holder.document_number,phone:{area:phone.slice(0,2),number:phone.slice(2)}},notificationUrl});}
  catch{
    await admin.from('guarantees').update({attention_code:'identity_unavailable',next_action_at:new Date(Date.now()+HOUR).toISOString()}).eq('id',g.id);
    return {id:g.id,status:'identity_unavailable'};
  }
  const {data:a,error}=await admin.rpc('claim_guarantee_authorization',{p_guarantee:g.id});
  if(error)throw new Error('authorization_claim_failed');
  if(!a?.id)return {id:g.id,status:'not_due'};
  const {data:saved,error:tokenError}=await admin.from('guarantee_card_tokens').select('card_token,user_id,revision')
    .eq('reservation_id',r.id).eq('revision',a.token_revision).single();
  try {
    if(tokenError||saved?.user_id!==r.user_id)throw new Error('card_version_changed');
    const input={referenceId:a.reference_id,amountCents:Number(a.amount_cents),method:'card' as const,
      cardToken:saved.card_token,installments:1,preAuthorize:true,customer:{name:r.guest_name,email:r.guest_email,
      taxId:holder.document_number,phone:{area:phone.slice(0,2),number:phone.slice(2)}},
      notificationUrl,description:'Caucao Chalezinho Ville'};
    gateway.validatePayment(input);
    const created=await gateway.authorizeCard(input);
    const {error:persistError}=await admin.from('guarantee_authorizations').update({provider_order_id:created.orderId,
      provider_charge_id:created.chargeId,state:'uncertain',updated_at:new Date().toISOString()}).eq('id',a.id).eq('state','requested');
    if(persistError)throw new Error('authorization_persistence_uncertain');
    const updated=await reconcileGuaranteeAuthorizations(admin,g.id,gateway);
    return {id:g.id,status:updated.status};
  }catch {
    await admin.from('guarantee_authorizations').update({state:'uncertain',provider_error_code:'provider_result_unknown'})
      .eq('id',a.id).eq('state','requested');
    await admin.from('guarantees').update({attention_code:'authorization_result_uncertain'})
      .eq('id',g.id);
    return {id:g.id,status:'authorization_uncertain'};
  }
}

// An administrator can recover the provider ID from its portal after a timeout.
// The typed ID is merely a hint: ownership/reference/amount come from PagBank GET.
export async function recoverGuaranteeAuthorization(admin:any,guaranteeId:string,authorizationId:string,
  chargeId:string,orderId:string,gateway:PaymentGateway) {
  const {data:a,error}=await admin.from('guarantee_authorizations').select('*').eq('id',authorizationId)
    .eq('guarantee_id',guaranteeId).in('state',['requested','uncertain']).single();
  if(error||!a||a.provider_charge_id)throw new Error('authorization_recovery_unavailable');
  const charge=await gateway.getOrderPayment(orderId,chargeId);
  if(charge.referenceId!==a.reference_id||charge.id!==chargeId||charge.amount.currency!=='BRL'||charge.amount.value!==Number(a.amount_cents))
    throw new Error('authorization_recovery_mismatch');
  const {error:saveError}=await admin.from('guarantee_authorizations').update({provider_charge_id:chargeId,provider_order_id:orderId})
    .eq('id',a.id).is('provider_charge_id',null);
  if(saveError)throw new Error('authorization_recovery_unavailable');
  return reconcileGuaranteeAuthorizations(admin,guaranteeId,gateway);
}
