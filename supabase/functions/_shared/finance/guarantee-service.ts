import type {PaymentGateway} from './gateway.ts';
import {confirmedCapture,confirmedRefund,guaranteeState} from './model.ts';

export async function reconcileGuarantee(admin:any,g:any,gateway:PaymentGateway) {
  if(!g.provider_authorization_id)return {...g,financial:guaranteeState(g)};
  const charge=await gateway.getPayment(g.provider_authorization_id,g.provider_order_id||undefined);
  if(charge.id!==g.provider_authorization_id||charge.amount?.currency!=='BRL')throw new Error('guarantee_charge_mismatch');
  const update=async(values:any,statuses:string[])=>{
    const {error}=await admin.from('guarantees').update({...values,updated_at:new Date().toISOString()})
      .eq('id',g.id).in('status',statuses);
    if(error)throw new Error('guarantee_write_failed');
  };
  if(['authorizing','authorization_uncertain'].includes(g.status)&&charge.status==='AUTHORIZED'&&charge.amount.value===Number(g.amount_cents)){
    const expiry=Date.parse(charge.captureBefore||g.provider_capture_before||'');
    const checkout=Date.parse(`${g.reservations.check_out}T11:00:00-03:00`);
    if(!Number.isFinite(expiry)||expiry<checkout+3600000)throw new Error('authorization_expires_before_checkout');
    await update({status:'guaranteed',provider_last_status:'AUTHORIZED',provider_error_code:null,provider_capture_before:new Date(expiry).toISOString()},[g.status]);
  }
  if(['authorizing','authorization_uncertain'].includes(g.status)&&charge.status==='DECLINED')
    await update({status:'pending',provider_last_status:'DECLINED',provider_error_code:'authorization_declined'},[g.status]);
  if(['capture_requested','capture_uncertain'].includes(g.status)&&confirmedCapture(charge,Number(g.amount_cents),Number(g.requested_capture_cents))){
    const {error}=await admin.rpc('capture_guarantee_mock_atomic',{p_guarantee_id:g.id,p_actor_user_id:null,p_amount_cents:Number(g.requested_capture_cents)});
    if(error)throw new Error('guarantee_capture_ledger_unavailable');
  }
  if(['guaranteed','incident_reported','authorizing','authorization_uncertain','release_requested','release_uncertain'].includes(g.status)&&charge.status==='CANCELED'&&
    charge.amount.value===Number(g.amount_cents)&&charge.summary?.paid===0){
    await update({status:'released',provider_last_status:'CANCELED',provider_error_code:null,
      released_amount_cents:Number(g.amount_cents),release_confirmed:true},[g.status]);
  }
  const {data:refunds,error:refundError}=await admin.from('guarantee_refunds').select('*').eq('guarantee_id',g.id).in('state',['dispatching','uncertain']);
  if(refundError)throw new Error('guarantee_refund_history_unavailable');
  for(const r of refunds||[]) {
    if(confirmedRefund(charge,Number(g.captured_amount_cents),Number(r.prior_refunded_cents)+Number(r.requested_cents))){
      const {error}=await admin.rpc('confirm_guarantee_refund',{p_refund_id:r.id,p_charge_id:charge.id,
        p_paid:charge.summary!.paid,p_refunded:charge.summary!.refunded});
      if(error)throw new Error('guarantee_refund_reconciliation_pending');
    }
  }
  const {data:updated,error}=await admin.from('guarantees').select('*').eq('id',g.id).single();
  if(error)throw new Error('guarantee_unavailable');
  return {...updated,financial:guaranteeState(updated),provider_observation:{charge_id:charge.id,status:charge.status,
    total_cents:charge.amount.value,paid_cents:charge.summary?.paid??null,refunded_cents:charge.summary?.refunded??null,
    observed_at:new Date().toISOString()}};
}

export async function requestGuaranteeRefund(admin:any,g:any,gateway:PaymentGateway,input:{actor:string;amount:number;reason:string;key:string}) {
  // Check live money BEFORE reserving or dispatching. Missing summary cannot confirm a refund.
  const before=await gateway.getPayment(g.provider_authorization_id,g.provider_order_id||undefined);
  if(before.amount?.currency!=='BRL'||before.id!==g.provider_authorization_id||
    !['PAID','CANCELED'].includes(before.status)||before.summary?.paid!==Number(g.captured_amount_cents)||
    before.summary?.refunded!==Number(g.refunded_amount_cents||0))throw new Error('refund_provider_balance_mismatch');
  const {data,error}=await admin.rpc('prepare_guarantee_refund',{p_guarantee_id:g.id,p_actor:input.actor,
    p_amount:input.amount,p_reason:input.reason,p_key:input.key});
  if(error)throw new Error(String(error.message||'refund_prepare_failed'));
  const refund=Array.isArray(data)?data[0]:data;
  const {data:claimed,error:claimError}=await admin.rpc('claim_guarantee_refund',{p_refund_id:refund.id});
  if(claimError)throw new Error('refund_claim_failed');
  if(claimed?.length){
    try{
      const receipt=await gateway.refund(g.provider_authorization_id,refund.requested_cents,`guarantee-refund-${refund.id}`);
      if(receipt.summary&&confirmedRefund({status:receipt.status,amount:{currency:'BRL'},summary:receipt.summary},
        Number(g.captured_amount_cents),Number(refund.prior_refunded_cents)+Number(refund.requested_cents))){
        const {error}=await admin.rpc('confirm_guarantee_refund',{p_refund_id:refund.id,p_charge_id:receipt.chargeId,
          p_paid:receipt.summary.paid,p_refunded:receipt.summary.refunded});
        if(error)throw new Error('refund_receipt_persistence_pending');
      }
    }catch(error){
      const code=String((error as any)?.errorCode||'provider_result_unknown');
      const {error:writeError}=await admin.from('guarantee_refunds').update({state:'uncertain',provider_error_code:code})
        .eq('id',refund.id).eq('state','dispatching');
      if(writeError)throw new Error('refund_outcome_persistence_pending');
    }
  }
  const guarantee=await reconcileGuarantee(admin,g,gateway);
  const {data:current,error:readError}=await admin.from('guarantee_refunds').select('*').eq('id',refund.id).single();
  if(readError)throw new Error('refund_status_unavailable');
  return {guarantee,refund:current};
}

export async function retryGuaranteeRefund(admin:any,g:any,gateway:PaymentGateway,actor:string,refundId:string) {
  const current=await reconcileGuarantee(admin,g,gateway);
  const {data:refund,error}=await admin.from('guarantee_refunds').select('*')
    .eq('id',refundId).eq('guarantee_id',g.id).single();
  if(error||!refund)throw new Error('refund_not_found');
  if(refund.state==='confirmed')return {guarantee:current,refund};
  const observation=current.provider_observation;
  if(!observation||!['PAID','CANCELED'].includes(observation.status))throw new Error('refund_provider_balance_mismatch');
  const {data:ready,error:retryError}=await admin.rpc('retry_transient_refund',{
    p_kind:'guarantee',p_refund_id:refund.id,p_actor:actor,
    p_paid:observation.paid_cents,p_refunded:observation.refunded_cents});
  if(retryError||ready!==true)throw new Error('refund_retry_not_ready');
  // Preserve the intent, actor and provider idempotency key of the original request.
  return requestGuaranteeRefund(admin,current,gateway,{actor:refund.actor_user_id,
    amount:Number(refund.requested_cents),reason:refund.reason,key:refund.operation_key});
}
