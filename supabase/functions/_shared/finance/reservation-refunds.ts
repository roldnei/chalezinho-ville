import {reconcileReservationRefunds} from './refund-reconciliation.ts';
import {paymentGateway} from './gateway.ts';
import {calculateCancellationRefund} from "../../booking-engine/refund-policy.ts";
import {evaluateRefundPrecheck} from "../../booking-engine/pagbank.ts";
export function reservationRefundService(context:any){
const {admin,currentUser,userIsAdmin,json}=context;
async function reservationRefundAction(req:Request,body:any,development:boolean){
  if(!development) return json({ok:false,error:"development_only"},403);
  const user=await currentUser(req);
  if(!user||!(await userIsAdmin(user))) return json({ok:false,error:"admin_required"},403);
  const reservationId=String(body?.reservation_id||""),operation=String(body?.operation||"");
  const kind=body?.kind==="voluntary_refund"?"voluntary_refund":"policy_cancellation";
  const {data:r}=await admin.from("reservations").select("id,status,rate_plan_code,check_in,checked_in_at,created_at")
    .eq("id",reservationId).maybeSingle();
  if(!r) return json({ok:false,error:"reservation_not_found"},404);
  if(operation==="list"){
    const {data:cases,error}=await admin.from("reservation_cancellations")
      .select("id,kind,status,reason,refund_due_cents,created_at")
      .eq("reservation_id",r.id).order("created_at",{ascending:false});
    if(error)return json({ok:false,error:"refund_history_unavailable"},503);
    return json({ok:true,cases:cases||[]});
  }
  const requestKey=String(body?.operation_key||"");
  if(kind==="voluntary_refund"&&operation==="prepare"&&!/^[0-9a-f-]{36}$/i.test(requestKey))
    return json({ok:false,error:"operation_key_required"},400);
  const caseQuery=admin.from("reservation_cancellations").select("*")
    .eq("reservation_id",r.id).eq("kind",kind);
  const {data:existing}=kind==="voluntary_refund"?
    (body?.case_id?await caseQuery.eq("id",String(body.case_id)).maybeSingle():
      operation==="prepare"?await caseQuery.eq("operation_key",requestKey).maybeSingle():{data:null}):
    await caseQuery.maybeSingle();
  let cancellation=existing;
  if(operation==="prepare"&&!cancellation){
    // Completed/cancelled reservations still require status reconciliation and
    // may receive a voluntary refund. Only a NEW policy cancellation has these gates.
    if(kind==="policy_cancellation"&&r.status!=="confirmed")return json({ok:false,error:"reservation_not_confirmed"},409);
    if(kind==="policy_cancellation"&&r.checked_in_at)return json({ok:false,error:"individual_review_required"},409);
    const reason=String(body?.reason||"").trim().slice(0,1000);
    if(!reason) return json({ok:false,error:"reason_required"},400);
    if(kind==="voluntary_refund"&&body?.case_id) return json({ok:false,error:"case_not_found"},404);
    const {data:request}=body?.guest_request_id&&kind==="policy_cancellation"?
      await admin.from("reservation_cancel_requests").select("id,reservation_id,status,requested_at,reason")
        .eq("id",String(body.guest_request_id)).eq("reservation_id",r.id).maybeSingle():{data:null};
    if(body?.guest_request_id&&(!request||request.status!=="requested"))
      return json({ok:false,error:"guest_request_not_pending"},409);
    const requestedAt=request?.requested_at||new Date().toISOString();
    const {data:accepted}=await admin.from("reservation_policy_acceptances")
      .select("document_id,document_version,accepted_at,document_code")
      .eq("reservation_id",r.id).eq("document_code",r.rate_plan_code+"_v1")
      .order("accepted_at",{ascending:true}).limit(1).maybeSingle();
    if(!accepted&&kind==="policy_cancellation") return json({ok:false,error:"accepted_policy_missing"},409);
    const {data:rule}=accepted?await admin.from("cancellation_policy_rules").select("*")
      .eq("document_id",accepted.document_id).eq("rate_plan_code",r.rate_plan_code).maybeSingle():{data:null};
    if(!rule&&kind==="policy_cancellation") return json({ok:false,error:"accepted_policy_rule_missing"},409);
    const {data:payments,error:paymentsError}=await admin.from("payments")
      .select("id,provider,provider_payment_id,amount_cents,status")
      .eq("reservation_id",r.id).eq("provider","pagbank_sandbox")
      .in("status",["paid","refunded"]).order("created_at");
    if(paymentsError||!payments?.length||payments.some((p:any)=>!p.provider_payment_id))
      return json({ok:false,error:"captured_charges_required"},409);
    const {data:entries,error:entriesError}=await admin.from("financial_entries")
      .select("payment_id,entry_type,amount_cents").eq("reservation_id",r.id);
    if(entriesError) return json({ok:false,error:"ledger_unavailable"},503);
    const allocations:any[]=[];
    for(const p of payments){
      const lines=(entries||[]).filter((e:any)=>e.payment_id===p.id && e.entry_type!=="refund");
      if(lines.some((e:any)=>!Number.isSafeInteger(Number(e.amount_cents))||Number(e.amount_cents)<0||
        !["accommodation","cleaning","experience","upgrade","additional_charge"].includes(e.entry_type))||
        lines.reduce((sum:number,e:any)=>sum+Number(e.amount_cents),0)!==Number(p.amount_cents))
        return json({ok:false,error:"ledger_review_required",payment_id:p.id},409);
      const sum=(kind:string)=>lines.filter((e:any)=>e.entry_type===kind)
        .reduce((total:number,e:any)=>total+Number(e.amount_cents),0);
      const calculation=kind==="voluntary_refund"?null:calculateCancellationRefund({
        plan:r.rate_plan_code,acceptedAt:accepted.accepted_at,requestedAt:requestedAt,checkIn:r.check_in,
        commercialFreeCancellationHours:Number(rule.commercial_free_cancellation_hours||0),
        withdrawalDays:Number(rule.withdrawal_days),fullRefundDaysBeforeCheckIn:Number(rule.full_refund_days_before_checkin),
        lateAccommodationRefundPercent:Number(rule.late_accommodation_refund_percent),
        accommodationCents:sum("accommodation"),paidModificationCents:sum("additional_charge"),
        cleaningCents:sum("cleaning"),unprovidedExperiencesCents:sum("experience")+sum("upgrade")
      });
      if(calculation?.requiresReview) return json({ok:false,error:"individual_review_required"},409);
      const {data:previous,error:previousError}=await admin.from("reservation_refunds")
        .select("confirmed_cents,state").eq("payment_id",p.id);
      if(previousError) return json({ok:false,error:"refund_history_unavailable"},503);
      if(kind==="policy_cancellation"&&(previous||[]).some((v:any)=>["prepared","dispatching","uncertain"].includes(v.state)))
        return json({ok:false,error:"previous_refund_pending"},409);
      const alreadyReturned=(previous||[]).reduce((s:number,v:any)=>s+Number(v.confirmed_cents),0);
      allocations.push({payment_id:p.id,charge_id:p.provider_payment_id,captured_cents:Number(p.amount_cents),
        refund_cents:Math.max(0,(calculation?.totalRefundCents||0)-alreadyReturned),
        previously_refunded_cents:alreadyReturned,calculation});
    }
    if(kind==="voluntary_refund"){
      const amount=Number(body?.amount_cents);
      if(!Number.isSafeInteger(amount)||amount<1) return json({ok:false,error:"invalid_refund_amount"},400);
      const {data:allRefunds,error:allRefundsError}=await admin.from("reservation_refunds")
        .select("payment_id,requested_cents,state").in("payment_id",allocations.map(x=>x.payment_id));
      if(allRefundsError) return json({ok:false,error:"refund_history_unavailable"},503);
      let remaining=amount;
      for(const x of allocations){
        const previousForCharge=(allRefunds||[]).filter((v:any)=>v.payment_id===x.payment_id);
        // An unresolved request may already have reached PagBank. Allocate a
        // separate voluntary refund to another charge, never the same one.
        const unresolved=previousForCharge.some((v:any)=>
          ["prepared","dispatching","uncertain"].includes(v.state));
        const reserved=previousForCharge.filter((v:any)=>v.state!=="failed")
          .reduce((s:number,v:any)=>s+Number(v.requested_cents),0);
        x.refund_cents=unresolved?0:Math.min(remaining,Math.max(0,x.captured_cents-reserved));
        x.calculation={reason:"voluntary_refund",refund_cents:x.refund_cents};
        remaining-=x.refund_cents;
      }
      if(remaining!==0) return json({ok:false,error:(allRefunds||[]).some((x:any)=>
        ["prepared","dispatching","uncertain"].includes(x.state))?"previous_refund_pending":"refund_exceeds_captured"},409);
    }
    const refundDue=allocations.reduce((sum,x)=>sum+x.refund_cents,0);
    const {data:created,error:createError}=await admin.rpc("prepare_reservation_refund_case",{p_actor:user.id,p_case:{
      reservation_id:r.id,accepted_document_id:accepted?.document_id||null,
      accepted_version:accepted?.document_version||null,accepted_at:accepted?.accepted_at||null,
      reason:request?.reason||reason,kind,requested_at:requestedAt,guest_request_id:request?.id||null,
      operation_key:kind==="voluntary_refund"?requestKey:null,
      refund_due_cents:refundDue,calculation:{allocations,policy_rule_id:rule?.id||null,requested_at:requestedAt,reason:request?.reason||reason}
    }});
    if(createError||!created) return json({ok:false,error:"cancellation_prepare_failed"},409);
    cancellation=Array.isArray(created)?created[0]:created;
  }
  if(!cancellation) return json({ok:false,error:"cancellation_not_prepared"},409);
  if(kind==="policy_cancellation"&&body?.guest_request_id&&cancellation.guest_request_id!==String(body.guest_request_id))
    return json({ok:false,error:"cancellation_already_in_progress"},409);
  const {data:refunds,error:refundsError}=await admin.from("reservation_refunds").select("id,payment_id,charge_id,requested_cents,confirmed_cents,state,idempotency_key")
    .eq("cancellation_id",cancellation.id).order("created_at");
  if(refundsError) return json({ok:false,error:"refund_history_unavailable",cancellation_id:cancellation.id},503);
  const due=Number(cancellation.refund_due_cents),allocated=(refunds||[]).reduce((s:number,x:any)=>s+Number(x.requested_cents),0);
  if(allocated!==due) return json({ok:false,error:"refund_allocation_requires_review",cancellation_id:cancellation.id},409);
  const {data:providerFailures,error:providerFailuresError}=(refunds||[]).length?
    await admin.from("reservation_refund_provider_observations")
      .select("refund_id,error_code,http_status,observed_at")
      .in("refund_id",(refunds||[]).map((x:any)=>x.id)).eq("phase","post")
      .not("error_code","is",null).order("observed_at",{ascending:false}):
    {data:[],error:null};
  if(providerFailuresError) return json({ok:false,error:"refund_history_unavailable",cancellation_id:cancellation.id},503);
  const latestIssues=(refunds||[]).filter((x:any)=>x.state!=="confirmed")
    .map((x:any)=>(providerFailures||[]).find((o:any)=>o.refund_id===x.id))
    .filter(Boolean);
  let providerIssue=latestIssues.some((o:any)=>o.error_code==="40005")?"pagbank_refund_key_in_use":
    latestIssues.some((o:any)=>o.error_code==="40008")?"pagbank_refund_temporarily_unavailable":null;
  if(operation==="prepare"||operation==="status") return json({ok:true,cancellation_id:cancellation.id,kind:cancellation.kind,
    status:cancellation.status,accepted_version:cancellation.accepted_version,calculation:cancellation.calculation,
    refund_due_cents:due,confirmed_cents:(refunds||[]).reduce((s:number,x:any)=>s+Number(x.confirmed_cents),0),
    provider_issue:providerIssue,
    refunds:(refunds||[]).map((x:any)=>({payment_id:x.payment_id,requested_cents:x.requested_cents,confirmed_cents:x.confirmed_cents,state:x.state}))});
  if(!["approve","reconcile","preflight","retry"].includes(operation)) return json({ok:false,error:"invalid_operation"},400);
  if(operation==="preflight"&&due===0&&cancellation.kind==="policy_cancellation")
    return json({ok:true,ready:true,checks:[],refund_due_cents:0});
  const token=Deno.env.get("PAGBANK_SANDBOX_TOKEN")||"";
  const gateway=paymentGateway('pagbank_sandbox',token);
  // A zero-value policy cancellation makes no provider request.
  if(!token&&!(operation==="approve"&&due===0&&cancellation.kind==="policy_cancellation"))
    return json({ok:false,error:"pagbank_sandbox_not_configured"},503);
  const providerChecks:any[]=[];
  async function recordRefundObservation(refund:any,phase:"post"|"get",source:"charge"|"order",
    charge:any,transport?:{httpStatus?:number;errorCode?:string|null}){
    const summary=charge?.summary;
    const {error}=await admin.from("reservation_refund_provider_observations").insert({
      refund_id:refund.id,phase,source,charge_id:refund.charge_id,
      http_status:Number.isInteger(transport?.httpStatus)?transport!.httpStatus:null,
      error_code:transport?.errorCode||null,
      charge_status:/^[A-Z_]{1,40}$/.test(String(charge?.status||""))?charge.status:null,
      amount_value:Number.isSafeInteger(charge?.amount?.value)?charge.amount.value:null,
      summary_total:Number.isSafeInteger(summary?.total)?summary.total:null,
      summary_paid:Number.isSafeInteger(summary?.paid)?summary.paid:null,
      summary_refunded:Number.isSafeInteger(summary?.refunded)?summary.refunded:null
    });
    if(error) throw new Error("refund_observation_unavailable");
  }
  async function readRefundCharge(refund:any){
      const {data:payment,error}=await admin.from("payments").select("metadata")
        .eq("id",refund.payment_id).eq("provider_payment_id",refund.charge_id).maybeSingle();
      if(error||!payment)throw new Error('refund_payment_unavailable');
      const orderId=String(payment?.metadata?.order_id||"");
      const charge=await gateway.getRefund(refund.charge_id,orderId||undefined);
      return {charge,source:charge.readSource||'charge'};
  }
  if(operation==="retry"){
    // Reconcile first: the original request may already have succeeded.
    for(const refund of refunds||[]){
      if(refund.state!=="uncertain")continue;
      const {charge,source}=await readRefundCharge(refund);
      const {data:payment,error}=await admin.from("payments")
        .select("id,amount_cents,provider_payment_id").eq("id",refund.payment_id).single();
      if(error||!payment)return json({ok:false,error:"refund_payment_unavailable"},503);
      await reconcileReservationRefunds(admin,payment,charge,source);
      if(!['PAID','CANCELED'].includes(charge.status)||!charge.summary)
        return json({ok:false,error:"refund_provider_balance_mismatch"},409);
      const {error:retryError}=await admin.rpc("retry_transient_refund",{
        p_kind:"reservation",p_refund_id:refund.id,p_actor:user.id,
        p_paid:charge.summary.paid,p_refunded:charge.summary.refunded});
      if(retryError)return json({ok:false,error:"refund_retry_not_ready"},409);
    }
    const {data:pending}=await admin.from("reservation_refunds").select("state").eq("cancellation_id",cancellation.id);
    return reservationRefundAction(req,{...body,case_id:cancellation.id,
      operation:pending?.some((x:any)=>x.state==="prepared")?"approve":"status"},development);
  }
  if(operation==="preflight"){
    const checks:any[]=[];
    for(const refund of refunds||[]){
      if(refund.state!=="prepared") continue;
      try{
        const {charge,source}=await readRefundCharge(refund);
        const {data:payment,error:paymentError}=await admin.from("payments")
          .select("amount_cents,status").eq("id",refund.payment_id).single();
        const {data:prior,error:priorError}=await admin.from("reservation_refunds")
          .select("id,confirmed_cents,state").eq("payment_id",refund.payment_id);
        if(paymentError||priorError) throw new Error("database_unavailable");
        const confirmed=(prior||[]).filter((x:any)=>x.state==="confirmed")
          .reduce((total:number,x:any)=>total+Number(x.confirmed_cents),0);
        const gate=evaluateRefundPrecheck(charge,{chargeId:refund.charge_id,
          capturedCents:Number(payment.amount_cents),requestedCents:Number(refund.requested_cents),
          confirmedCents:confirmed,otherOpenRefund:(prior||[]).some((x:any)=>x.id!==refund.id&&
            ["prepared","dispatching","uncertain"].includes(x.state))});
        checks.push({payment_id:refund.payment_id,source,status:charge.status,
          mode:gate.mode,
          ready:gate.ready&&payment.status==="paid",
          provider_refunded_cents:Number.isSafeInteger(charge.summary?.refunded)?charge.summary.refunded:null});
      }catch{checks.push({payment_id:refund.payment_id,ready:false,status:"unavailable"});}
    }
    return json({ok:true,ready:checks.length>0&&checks.every(x=>x.ready),checks});
  }
  if(operation==="approve"){
    if(!["prepared","pending_provider"].includes(cancellation.status))
      return json({ok:false,error:"cancellation_already_submitted"},409);
    if(cancellation.status==="prepared"){
      const {data:activated,error:activationError}=await admin.from("reservation_cancellations")
        .update({status:"pending_provider",approved_at:new Date().toISOString()})
        .eq("id",cancellation.id).eq("status","prepared").select("id").maybeSingle();
      if(activationError||!activated) return json({ok:false,error:"cancellation_already_submitted"},409);
      if(cancellation.guest_request_id){
        const {data:updated}=await admin.from("reservation_cancel_requests")
          .update({status:"approved",decided_by:user.id,decided_at:new Date().toISOString()})
          .eq("id",cancellation.guest_request_id).eq("status","requested").select("id").maybeSingle();
        if(!updated) return json({ok:false,error:"guest_request_state_changed"},409);
      }
    }
    if(due===0&&cancellation.kind==="policy_cancellation"){
      const {error:zeroError}=await admin.rpc("confirm_zero_refund_cancellation",{p_cancellation_id:cancellation.id});
      if(zeroError) return json({ok:false,error:"cancellation_reconciliation_required",cancellation_id:cancellation.id},409);
      return json({ok:true,status:"confirmed",cancellation_id:cancellation.id,refund_due_cents:0,confirmed_cents:0,refunds:[]});
    }
  }
  for(const refund of refunds||[]){
    if(refund.state==="confirmed") continue;
    if(operation==="approve"&&refund.state==="prepared"){
      const {data:claim,error:claimError}=await admin.rpc("claim_reservation_refund",{p_refund_id:refund.id});
      if(claimError) return json({ok:false,error:"refund_claim_unavailable",cancellation_id:cancellation.id},503);
      const row=Array.isArray(claim)?claim[0]:claim;
      if(row){
        let precheckPassed=false;
        try{
          const before=(await readRefundCharge(refund)).charge;
          const {data:originalPayment,error:paymentError}=await admin.from("payments")
            .select("amount_cents,status").eq("id",refund.payment_id).single();
          const {data:priorRefunds,error:priorError}=await admin.from("reservation_refunds")
            .select("id,confirmed_cents,state").eq("payment_id",refund.payment_id);
          if(priorError||paymentError||originalPayment?.status!=="paid") throw new Error("refund_history_unavailable");
          const prior=(priorRefunds||[]).filter((x:any)=>x.state==="confirmed")
            .reduce((sum:number,x:any)=>sum+Number(x.confirmed_cents),0);
          const gate=evaluateRefundPrecheck(before,{chargeId:row.charge_id,
            capturedCents:Number(originalPayment.amount_cents),requestedCents:Number(row.requested_cents),
            confirmedCents:prior,otherOpenRefund:(priorRefunds||[]).some((x:any)=>x.id!==refund.id&&
              ["prepared","dispatching","uncertain"].includes(x.state))});
          if(!gate.ready)
            throw new Error("provider_refund_balance_mismatch");
          const {error:dispatchError}=await admin.rpc("mark_refund_dispatch",{p_refund_id:refund.id});
          if(dispatchError) throw new Error("dispatch_not_recorded");
          precheckPassed=true;
          const receipt=await gateway.refund(row.charge_id,Number(row.requested_cents),row.idempotency_key);
          providerIssue=null;
          if(receipt.amountCents!==Number(originalPayment.amount_cents)) throw new Error("provider_response_amount_mismatch");
          await recordRefundObservation(refund,"post","charge",{
            status:receipt.status,amount:{value:receipt.amountCents},summary:receipt.summary},
            {httpStatus:receipt.httpStatus});
          const {error:receiptError}=await admin.from("reservation_refunds")
            .update({provider_status:receipt.status,provider_paid_cents:receipt.summary?.paid||null,
              provider_refunded_cents:receipt.summary?.refunded??null})
            .eq("id",refund.id).eq("state","dispatching");
          if(receiptError) throw new Error("provider_receipt_unavailable");
          const {error:attemptError}=await admin.from("reservation_refund_attempts")
            .insert({refund_id:refund.id,event:"request_accepted",provider_status:receipt.status});
          if(attemptError) throw new Error("provider_attempt_unavailable");
        }catch(error){
          if(!precheckPassed){
            const {error:resetError}=await admin.rpc("refund_precheck_failed",{p_refund_id:refund.id});
            if(resetError) return json({ok:false,error:"refund_precheck_state_uncertain",cancellation_id:cancellation.id},503);
            providerChecks.push({refund_id:refund.id,status:"precheck_failed"});
            continue;
          }
          const diagnostic=String((error as Error)?.message||"");
          const providerError=error as Error&{httpStatus?:number;errorCode?:string};
          providerIssue=providerError.errorCode==='40005'?'pagbank_refund_key_in_use':
            providerError.errorCode==='40008'?'pagbank_refund_temporarily_unavailable':null;
          if(Number.isInteger(providerError?.httpStatus)){
            try{await recordRefundObservation(refund,"post","charge",null,
              {httpStatus:providerError.httpStatus,errorCode:providerError.errorCode})}catch{/* the request stays uncertain */}
          }
          // Persist only a whitelisted transport/result code; provider bodies
          // can contain customer or card data and must never enter the ledger.
          const safeCode=/^pagbank_charge_operation_http_[1-5]\d\d(?:_code_[a-zA-Z0-9_]{1,40})?$/.test(diagnostic)?
            diagnostic:"pagbank_charge_operation_uncertain";
          await admin.from("reservation_refund_attempts").insert({refund_id:refund.id,
            event:"request_uncertain",provider_status:safeCode});
          if(providerError?.httpStatus===400&&providerError?.errorCode==="40008")
            providerChecks.push({refund_id:refund.id,status:"pagbank_refund_temporarily_unavailable"});
        }
        if(precheckPassed) await admin.from("reservation_refunds").update({state:"uncertain"})
          .eq("id",refund.id).eq("state","dispatching");
      }
    }
    if(["dispatching","uncertain"].includes(refund.state)||operation==="approve"&&refund.state==="prepared"){
      try{
        const observed=await readRefundCharge(refund),charge=observed.charge;

        providerChecks.push({refund_id:refund.id,status:charge.status,source:observed.source,
          amount_cents:charge.amount?.currency==="BRL"?Number(charge.amount.value):null,
          provider_refunded_cents:Number.isSafeInteger(charge.summary?.refunded)?charge.summary.refunded:null});
        const {data:originalPayment,error:paymentError}=await admin.from("payments")
          .select("id,amount_cents,provider_payment_id").eq("id",refund.payment_id).single();
        if(paymentError||!originalPayment)throw new Error("payment_unavailable");
        await reconcileReservationRefunds(admin,originalPayment,charge,observed.source as "charge"|"order");
      }catch{providerChecks.push({refund_id:refund.id,status:"unavailable"});}
    }
  }
  const [{data:current,error:currentError},{data:currentRefunds,error:currentRefundsError}]=await Promise.all([
    admin.from("reservation_cancellations").select("status").eq("id",cancellation.id).single(),
    admin.from("reservation_refunds").select("state,requested_cents,confirmed_cents").eq("cancellation_id",cancellation.id)
  ]);
  if(currentError||currentRefundsError) return json({ok:false,error:"refund_reconciliation_unavailable",cancellation_id:cancellation.id},503);
  return json({ok:true,status:current?.status||"pending_provider",cancellation_id:cancellation.id,
    refund_due_cents:due,confirmed_cents:(currentRefunds||[]).reduce((s:number,x:any)=>s+Number(x.confirmed_cents),0),
    refunds:currentRefunds||[],provider_issue:providerIssue||(
      providerChecks.some(x=>x.status==="pagbank_refund_temporarily_unavailable")?
        "pagbank_refund_temporarily_unavailable":null),provider_checks:providerChecks});
}

async function reservationRefundStatus(req:Request,body:any,development:boolean){
  if(!development) return json({ok:false,error:"development_only"},403);
  const user=await currentUser(req);
  if(!user) return json({ok:false,error:"authentication_required"},401);
  const reservationId=String(body?.reservation_id||"");
  const {data:r}=await admin.from("reservations").select("id,user_id").eq("id",reservationId).maybeSingle();
  if(!r||r.user_id!==user.id) return json({ok:false,error:"reservation_not_found"},404);
  const {data:cases}=await admin.from("reservation_cancellations")
    .select("id,kind,status,refund_due_cents,accepted_version,created_at,calculation")
    .eq("reservation_id",r.id).order("created_at",{ascending:false});
  const {data:refunds}=cases?.length?await admin.from("reservation_refunds")
    .select("cancellation_id,requested_cents,confirmed_cents,state").in("cancellation_id",cases.map((c:any)=>c.id)):{data:[]};
  return json({ok:true,cases:(cases||[]).map((c:any)=>{
    const confirmed=(refunds||[]).filter((x:any)=>x.cancellation_id===c.id)
      .reduce((s:number,x:any)=>s+Number(x.confirmed_cents),0);
    return {kind:c.kind,credit_reason:c.calculation?.reason==='unprovided_experience'?'unprovided_experience':null,status:c.status,refund_due_cents:Number(c.refund_due_cents),
      confirmed_cents:confirmed,pending_cents:Number(c.refund_due_cents)-confirmed,
      accepted_version:c.accepted_version,created_at:c.created_at};
  })});
}

async function reservationCancelRequest(req:Request,body:any,development:boolean){
  if(!development) return json({ok:false,error:"development_only"},403);
  const user=await currentUser(req);
  if(!user) return json({ok:false,error:"authentication_required"},401);
  const operation=String(body?.operation||"");
  if(operation==="list"){
    if(!(await userIsAdmin(user))) return json({ok:false,error:"admin_required"},403);
    const {data,error}=await admin.from("reservation_cancel_requests")
      .select("id,reservation_id,reason,requested_at,status,decision_note,cancellation_id")
      .in("status",["requested","approved","processing"]).order("requested_at",{ascending:true});
    return error?json({ok:false,error:"requests_unavailable"},503):json({ok:true,requests:data||[]});
  }
  const reservationId=String(body?.reservation_id||"");
  const {data:r}=await admin.from("reservations")
    .select("id,user_id,status,check_in,checked_in_at").eq("id",reservationId).maybeSingle();
  if(!r) return json({ok:false,error:"reservation_not_found"},404);
  const isAdmin=await userIsAdmin(user);
  if(operation==="request"){
    if(r.user_id!==user.id) return json({ok:false,error:"reservation_not_found"},404);
    if(r.status!=="confirmed"||r.checked_in_at||Date.parse(`${r.check_in}T15:00:00-03:00`)<=Date.now())
      return json({ok:false,error:"cancellation_requires_review"},409);
    const {data:existingCancellation,error:cancelError}=await admin.from("reservation_cancellations")
      .select("id,status").eq("reservation_id",r.id).eq("kind","policy_cancellation").maybeSingle();
    if(cancelError) return json({ok:false,error:"cancellation_unavailable"},503);
    if(existingCancellation) return json({ok:false,error:"cancellation_already_in_progress"},409);
    const reason=String(body?.reason||"").trim().slice(0,1000);
    if(reason.length<5) return json({ok:false,error:"reason_required"},400);
    const {data:existing}=await admin.from("reservation_cancel_requests")
      .select("id,status,requested_at").eq("reservation_id",r.id)
      .in("status",["requested","approved","processing"]).maybeSingle();
    if(existing) return json({ok:true,request:existing});
    const {data,error}=await admin.from("reservation_cancel_requests")
      .insert({reservation_id:r.id,guest_user_id:user.id,reason}).select("id,status,requested_at").single();
    return error?json({ok:false,error:"request_already_exists"},409):json({ok:true,request:data});
  }
  if(operation==="status"){
    if(r.user_id!==user.id&&!isAdmin) return json({ok:false,error:"reservation_not_found"},404);
    const {data}=await admin.from("reservation_cancel_requests")
      .select("id,status,requested_at,decided_at,decision_note,cancellation_id")
      .eq("reservation_id",r.id).order("requested_at",{ascending:false}).limit(5);
    return json({ok:true,requests:data||[]});
  }
  if(operation==="reject"){
    if(!isAdmin) return json({ok:false,error:"admin_required"},403);
    const note=String(body?.decision_note||"").trim().slice(0,1000);
    if(!note) return json({ok:false,error:"reason_required"},400);
    const {data,error}=await admin.from("reservation_cancel_requests")
      .update({status:"rejected",decided_by:user.id,decided_at:new Date().toISOString(),decision_note:note})
      .eq("id",String(body?.request_id||"")).eq("reservation_id",r.id).eq("status","requested")
      .select("id").maybeSingle();
    return error||!data?json({ok:false,error:"request_state_changed"},409):json({ok:true,request_id:data.id,status:"rejected"});
  }
  return json({ok:false,error:"invalid_operation"},400);
}


return {reservationRefundAction,reservationRefundStatus,reservationCancelRequest};
}
