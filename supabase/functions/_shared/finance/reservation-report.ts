import {projectFinance} from './model.ts';
export async function reservationFinance(admin:any,reservationId:string,viewer?:{userId:string;manager:boolean}){
  const {data:reservation,error:rError}=await admin.from('reservations')
    .select('id,user_id,total_amount,stay_amount,experience_amount,quote_option_id,status').eq('id',reservationId).single();
  if(rError||!reservation)throw new Error('reservation_finance_unavailable');
  if(viewer&&!viewer.manager&&reservation.user_id!==viewer.userId)throw new Error('reservation_not_found');
  // Keyset pagination avoids PostgREST's response cap silently dropping later
  // captures/refunds. Pin an upper sequence so concurrent events form a new read.
  const {data:last,error:lastError}=await admin.from('finance_events').select('sequence')
    .eq('reservation_id',reservationId).order('sequence',{ascending:false}).limit(1).maybeSingle();
  if(lastError)throw new Error('reservation_finance_unavailable');
  const events:any[]=[];let cursor=0;
  const ceiling=Number(last?.sequence||0);
  while(cursor<ceiling){
    const {data:page,error}=await admin.from('finance_events').select('*').eq('reservation_id',reservationId)
      .gt('sequence',cursor).lte('sequence',ceiling).order('sequence').limit(500);
    if(error||!page?.length)throw new Error('reservation_finance_unavailable');
    const next=Number(page[page.length-1].sequence);
    if(!Number.isSafeInteger(next)||next<=cursor)throw new Error('ledger_sequence_invalid');
    events.push(...page);cursor=next;
  }
  const projection=projectFinance(events);
  if(projection.contract_cents!==Math.round(Number(reservation.total_amount)*100))throw new Error('reservation_ledger_divergence');
  let original=null;
  if(reservation.quote_option_id){
    const {data,error}=await admin.from('quote_options').select('accommodation_amount_cents,cleaning_fee_cents,total_amount_cents,quote_id').eq('id',reservation.quote_option_id).single();
    if(error)throw new Error('original_quote_unavailable');original=data;
  }
  const {data:incidents,error:iError}=await admin.from('incidents').select('id,reservation_id,guarantee_id,category,description,requested_capture_cents,status,decision,created_at,decided_at,actor_user_id').eq('reservation_id',reservationId).order('created_at');
  if(iError)throw new Error('incident_history_unavailable');
  const result={reservation_id:reservationId,original_quote:original,current_contract_cents:Math.round(Number(reservation.total_amount)*100),
    ...projection,incidents,events,history_migrated:events.some((e:any)=>e.event_type==='baseline')};
  if(!viewer||viewer.manager)return result;
  // Guests receive the same monetary projection without internal audit payloads.
  const {events:internalEvents,payments:internalPayments,incidents:internalIncidents,...summary}=result;
  return {...summary,payments:internalPayments.map((p:any)=>({id:p.id,status:p.status,method:p.method,
    amount_cents:p.amount_cents,installments:p.installments})),
    incidents:(internalIncidents||[]).map((i:any)=>({id:i.id,category:i.category,description:i.description,
      requested_capture_cents:i.requested_capture_cents,status:i.status,decision:i.decision,created_at:i.created_at}))};
}
