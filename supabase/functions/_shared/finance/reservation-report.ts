import {projectFinance} from './model.ts';
export async function reservationFinance(admin:any,reservationId:string){
  const [{data:reservation,error:rError},{data:events,error:eError}]=await Promise.all([
    admin.from('reservations').select('id,total_amount,stay_amount,experience_amount,quote_option_id,status').eq('id',reservationId).single(),
    admin.from('finance_events').select('*').eq('reservation_id',reservationId).order('sequence').limit(10001),
  ]);
  if(rError||eError||!reservation)throw new Error('reservation_finance_unavailable');
  if(events.length>10000)throw new Error('finance_history_requires_pagination');
  const projection=projectFinance(events);
  if(projection.contract_cents!==Math.round(Number(reservation.total_amount)*100))throw new Error('reservation_ledger_divergence');
  let original=null;
  if(reservation.quote_option_id){
    const {data,error}=await admin.from('quote_options').select('accommodation_amount_cents,cleaning_fee_cents,total_amount_cents,quote_id').eq('id',reservation.quote_option_id).single();
    if(error)throw new Error('original_quote_unavailable');original=data;
  }
  const {data:incidents,error:iError}=await admin.from('incidents').select('id,reservation_id,guarantee_id,category,description,requested_capture_cents,status,decision,created_at,decided_at,actor_user_id').eq('reservation_id',reservationId).order('created_at');
  if(iError)throw new Error('incident_history_unavailable');
  return {reservation_id:reservationId,original_quote:original,current_contract_cents:Math.round(Number(reservation.total_amount)*100),
    ...projection,incidents,events,history_migrated:events.some((e:any)=>e.event_type==='baseline')};
}
