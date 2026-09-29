// No provider calls here. A credit intent reuses the reservation refund lifecycle.
export function experienceCreditService({admin,currentUser,userIsAdmin,json}:any){
  return async function experienceCredit(req:Request,body:any,development:boolean){
    if(!development)return json({ok:false,error:'development_only'},403);
    const user=await currentUser(req);
    if(!user||!await userIsAdmin(user))return json({ok:false,error:'admin_required'},403);
    if(body?.service_not_provided!==true)return json({ok:false,error:'service_review_required'},409);
    if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(body?.operation_key||''))
      return json({ok:false,error:'operation_key_required'},400);
    const reason=String(body?.reason||'').trim();
    if(reason.length<5||reason.length>1000)return json({ok:false,error:'reason_required'},400);
    const {data,error}=await admin.rpc('prepare_experience_credit',{
      p_reservation:body.reservation_id,p_item:body.item_id,p_actor:user.id,
      p_reason:reason,p_key:body.operation_key,p_not_provided:true
    });
    if(error){
      const known=['experience_not_active','experience_credit_review_required','reservation_not_changeable',
        'accepted_policy_rule_missing','previous_refund_pending','refund_exceeds_captured',
        'idempotency_conflict','service_review_required','experience_credit_already_exists'];
      return json({ok:false,error:known.find(c=>String(error.message).includes(c))||'experience_credit_unavailable'},409);
    }
    return json({ok:true,kind:'voluntary_refund',cancellation_id:data});
  };
}
