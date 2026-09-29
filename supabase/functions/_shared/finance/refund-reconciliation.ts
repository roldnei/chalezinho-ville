import {confirmedRefund,money} from './model.ts';

// charge must come from an authenticated gateway GET, never the webhook payload.
export async function reconcileReservationRefunds(admin:any,payment:any,charge:any,source:'charge'|'order'='charge'){
 if(charge.id!==payment.provider_payment_id||charge.amount?.currency!=='BRL'||charge.amount.value!==money(payment.amount_cents))
  throw new Error('refund_payment_mismatch');
 const {data:rows,error}=await admin.from('reservation_refunds').select('*').eq('payment_id',payment.id);
 if(error)throw new Error('refund_history_unavailable');
 const pending=rows.filter((r:any)=>['dispatching','uncertain'].includes(r.state));
 if(pending.length>1)throw new Error('multiple_refunds_pending_review');
 const prior=rows.filter((r:any)=>r.state==='confirmed').reduce((s:number,r:any)=>s+money(r.confirmed_cents),0);
 let confirmed=0;
 for(const r of pending){
  if(r.charge_id!==charge.id)throw new Error('refund_charge_mismatch');
  const {error:observationError}=await admin.from('reservation_refund_provider_observations').insert({
   refund_id:r.id,phase:'get',source,charge_id:charge.id,http_status:charge.httpStatus||200,
   charge_status:charge.status,amount_value:charge.amount.value,
   summary_total:charge.summary?.total??null,summary_paid:charge.summary?.paid??null,
   summary_refunded:charge.summary?.refunded??null});
  if(observationError)throw new Error('refund_observation_unavailable');
  if(confirmedRefund(charge,Number(payment.amount_cents),prior+money(r.requested_cents))){
   const {error:confirmError}=await admin.rpc('confirm_reservation_refund',{p_refund_id:r.id,p_charge_id:charge.id,
    p_provider_status:charge.status,p_provider_paid_cents:charge.summary.paid,p_provider_refunded_cents:charge.summary.refunded});
   if(confirmError)throw new Error('refund_confirmation_failed');confirmed++;
  }else if(!charge.summary&&source==='charge'&&charge.httpStatus===200&&['PAID','CANCELED'].includes(charge.status)){
   const {error:receiptError}=await admin.rpc('confirm_reservation_refund_from_receipt',{
    p_refund_id:r.id,p_charge_id:charge.id,p_get_status:charge.status,p_get_amount:charge.amount.value});
   if(!receiptError)confirmed++;
   else if(!String(receiptError.message).includes('provider_receipt_not_reconciled'))throw new Error('refund_receipt_confirmation_failed');
  }
 }
 return {confirmed,pending:pending.length-confirmed};
}
