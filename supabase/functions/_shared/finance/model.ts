// Integer centavos only. This module is the canonical read model, not a second pricing engine.
export function money(value: unknown): number {
  const n=typeof value==='string'&&/^\d+$/.test(value)?Number(value):value;
  if(typeof n!=='number'||!Number.isSafeInteger(n)||n<0)throw new Error('invalid_money');
  return n;
}
export function paymentState(status:string, paid:number, refunded:number) {
  money(paid);money(refunded);
  if(refunded>paid)throw new Error('refund_exceeds_paid');
  if(paid>0&&refunded===paid)return 'refunded';
  if(refunded>0)return 'partially_refunded';
  return ({under_review:'processing',refused:'failed',WAITING:'awaiting_payment',PAID:'paid',
    AUTHORIZED:'authorized',DECLINED:'failed',IN_ANALYSIS:'processing',CANCELED:'cancelled'} as Record<string,string>)[status]||status;
}
export function guaranteeState(g:any) {
  const authorized=money(g.amount_cents), captured=money(g.captured_amount_cents||0);
  const refunded=money(g.refunded_amount_cents||0);
  if(captured>authorized)throw new Error('capture_exceeds_authorized');
  if(refunded>captured)throw new Error('refund_exceeds_captured');
  const confirmedAuthorization=Boolean(g.provider_authorization_id)&&
    (captured>0||['guaranteed','incident_reported','capture_requested','capture_uncertain',
      'release_requested','release_uncertain','released','expired'].includes(g.status));
  const status=refunded>0?(refunded===captured?'refunded':'partially_refunded'):captured>0?(captured<authorized?'partially_captured':'captured'):
    ({pending:'pending_authorization',guaranteed:'authorized',incident_reported:'authorized',authorizing:'processing',
      authorization_uncertain:'processing',release_requested:'processing',release_uncertain:'processing',
      capture_requested:'processing',capture_uncertain:'processing'} as Record<string,string>)[g.status]||g.status;
  return {status,required_cents:authorized,authorized_cents:confirmedAuthorization?authorized:0,captured_cents:captured,
    refunded_cents:refunded,
    available_cents:['guaranteed','incident_reported'].includes(g.status)&&
      (!g.provider_capture_before||Date.parse(g.provider_capture_before)>Date.now())?authorized-captured:0,
    released_cents:g.status==='released'?authorized:money(g.released_amount_cents||0),
    uncaptured_cents:authorized-captured,
    release_confirmed:g.status==='released'||g.release_confirmed===true};
}
export function confirmedCapture(charge:any, authorization:number, requested:number) {
  return charge?.amount?.currency==='BRL'&&charge.status==='PAID'&&requested>0&&requested<=authorization&&
    ((charge.amount.value===authorization&&charge.summary?.paid===requested)||
    (charge.amount.value===requested&&(!charge.summary||charge.summary.paid===requested)));
}
export function confirmedRefund(charge:any, captured:number, cumulative:number) {
  return charge?.amount?.currency==='BRL'&&['PAID','CANCELED'].includes(charge.status)&&
    charge.summary?.paid===captured&&charge.summary?.refunded===cumulative&&cumulative<=captured;
}
export function assertRefundCapacity(captured:number,confirmed:number,reserved:number,requested:number) {
  [captured,confirmed,reserved,requested].forEach(money);
  if(!requested||confirmed+reserved+requested>captured)throw new Error('refund_exceeds_captured');
}

export function projectFinance(events:any[]) {
  const entities=new Map<string,any>(); let sequence=0;
  for(const event of [...events].sort((a,b)=>Number(a.sequence)-Number(b.sequence))) {
    if(Number(event.sequence)<=sequence)throw new Error('ledger_sequence_invalid');
    sequence=Number(event.sequence);
    entities.set(`${event.source}:${event.entity_id}`,{...event.payload,source:event.source});
  }
  const rows=[...entities.values()];
  const pick=(name:string)=>rows.filter(r=>r.source===name);
  const payments=pick('payments'),refunds=pick('reservation_refunds'),guarantees=pick('guarantees');
  const guaranteeRefunds=pick('guarantee_refunds');
  const receivedStatuses=['paid','partially_refunded','refunded'];
  const paid=payments.filter(p=>receivedStatuses.includes(p.status)).reduce((s,p)=>s+money(p.amount_cents),0);
  const refunded=refunds.reduce((s,r)=>s+money(r.confirmed_cents||0),0);
  const pendingRefund=refunds.filter(r=>!['confirmed','failed'].includes(r.state))
    .reduce((s,r)=>s+money(r.requested_cents)-money(r.confirmed_cents||0),0);
  const captured=guarantees.reduce((s,g)=>s+money(g.captured_amount_cents||0),0);
  const damageRefunded=guaranteeRefunds.reduce((s,r)=>s+money(r.confirmed_cents||0),0);
  if(refunded>paid||damageRefunded>captured)throw new Error('ledger_refund_mismatch');
  const pending=pick('post_booking_charges').filter(c=>['awaiting_payment','processing'].includes(c.status))
    .reduce((s,c)=>s+money(c.amount_cents),0);
  const reservations=pick('reservations');
  if(reservations.length>1)throw new Error('ledger_multiple_reservations');
  const reservation=reservations[0];
  const contract=reservation?money(Math.round(Number(reservation.total_amount)*100)):null;
  const approvedCredits=pick('reservation_cancellations').filter(c=>c.approved_at||c.status==='confirmed')
    .reduce((s,c)=>s+money(c.refund_due_cents||0),0);
  const damageDue=pick('incidents').filter(i=>i.decision==='approved').reduce((s,i)=>s+money(i.requested_capture_cents||0),0);
  // A legacy captured guarantee can predate occurrence decisions. Its capture is
  // part of the imported obligation; never invent a new credit for missing history.
  const damageObligation=Math.max(captured,damageDue);
  const obligation=contract===null?null:
    ((paid===0&&['cancelled','not_confirmed'].includes(reservation.status)?0:contract)+pending-approvedCredits+damageObligation-damageRefunded);
  const netReceived=paid-refunded+captured-damageRefunded;
  const balance=obligation===null?null:obligation-netReceived;
  return {contract_cents:contract,approved_credit_cents:approvedCredits,obligation_cents:obligation,
    balance_due_cents:balance===null?null:Math.max(0,balance),credit_balance_cents:balance===null?null:Math.max(0,-balance),
    paid_cents:paid,refunded_cents:refunded,net_received_cents:paid-refunded,
    pending_additional_cents:pending,pending_refund_cents:pendingRefund,
    damage_captured_cents:captured,damage_refunded_cents:damageRefunded,
    total_net_received_cents:paid-refunded+captured-damageRefunded,
    guarantees:guarantees.map(g=>({id:g.id,...guaranteeState(g)})),
    payments:payments.map(p=>({...p,status:paymentState(p.status,receivedStatuses.includes(p.status)?money(p.amount_cents):0,
      refunds.filter(r=>r.payment_id===p.id).reduce((s,r)=>s+money(r.confirmed_cents||0),0))})),
    events_count:events.length,last_sequence:sequence};
}
