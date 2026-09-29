// Recording an occurrence is independent of creating a payment.
export async function reservationIncident(admin:any,actor:string,body:any){
 const {data:reservation,error:rError}=await admin.from('reservations').select('id').eq('id',body.reservation_id).single();
 if(rError||!reservation)throw new Error('reservation_not_found');
 if(body.operation==='record'){
  const description=String(body.description||'').trim();
  if(description.length<5||description.length>1000||!Number.isSafeInteger(body.amount_cents)||body.amount_cents<0||
     !/^[0-9a-f-]{36}$/i.test(String(body.operation_key||'')))throw new Error('invalid_incident');
  // Evidence uploads use the guarantee endpoint's verified private storage path.
  if(body.evidence?.length)throw new Error('verified_evidence_required');
  const {data,error}=await admin.rpc('record_reservation_incident',{p_reservation:reservation.id,p_guarantee:null,
   p_actor:actor,p_category:body.category,p_description:description,p_amount:body.amount_cents,p_evidence:[],p_key:body.operation_key});
  if(error)throw error;return {incident:data};
 }
 if(body.operation==='no_charge'){
  const {data:i,error}=await admin.from('incidents').select('id').eq('id',body.incident_id).eq('reservation_id',reservation.id).single();
  if(error||!i)throw new Error('incident_not_found');
  const {error:decisionError}=await admin.rpc('decide_reservation_incident',{p_incident:i.id,p_actor:actor,p_decision:'no_charge'});
  if(decisionError)throw decisionError;return {incident_id:i.id};
 }
 throw new Error('invalid_incident_operation');
}
