import {createClient} from "npm:@supabase/supabase-js@2";

import {paymentGateway} from "../_shared/finance/gateway.ts";
import {assertFinanceDevelopment} from "../_shared/finance/environment.ts";
import {reconcileReservationRefunds} from "../_shared/finance/refund-reconciliation.ts";
import {reconcileGuarantee,requestGuaranteeRefund,retryGuaranteeRefund} from "../_shared/finance/guarantee-service.ts";

const projectUrl=Deno.env.get("SUPABASE_URL")!;
const token=Deno.env.get("PAGBANK_SANDBOX_TOKEN")||"";
const admin=createClient(projectUrl,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
const headers={"Content-Type":"application/json","Cache-Control":"no-store",
  "Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-chalezinho-env",
  "Access-Control-Allow-Methods":"POST,OPTIONS"};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const id=(v:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v||""));
const asMoney=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>0;
const brazilTime=(date:string,hour:string)=>Date.parse(`${date}T${hour}:00-03:00`);
const evidenceBucket="guarantee-evidence";
async function verifiedEvidence(guaranteeId:string,input:unknown){
  if(!Array.isArray(input)||input.length<2||input.length>11)return null;
  const seen=new Set<string>(),result=[];
  for(const item of input){
    const kind=item?.kind, path=String(item?.path||""), name=String(item?.name||"").slice(0,120);
    const match=new RegExp(`^${guaranteeId}/(damage|receipt)/([0-9a-f-]{36})\\.(jpg|png|webp|pdf)$`,"i").exec(path);
    if(!match||match[1]!==kind||seen.has(path)||!name||
      (kind==="damage"&&match[3]==="pdf"))return null;
    seen.add(path);
    const {data,error}=await admin.storage.from(evidenceBucket).list(`${guaranteeId}/${kind}`,{limit:100});
    const object=data?.find(x=>x.name===path.split("/").pop());
    if(error||!object||!object.metadata?.size||object.metadata.size>8388608)return null;
    result.push({bucket:evidenceBucket,kind,path,name,content_type:object.metadata.mimetype});
  }
  if(result.filter(x=>x.kind==="damage").length<1||result.filter(x=>x.kind==="receipt").length!==1)return null;
  return result;
}

async function caller(req:Request){
  const jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(!jwt)return null;
  const sb=createClient(projectUrl,Deno.env.get("SUPABASE_ANON_KEY")!,{
    auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${jwt}`}}});
  const {data,error}=await sb.auth.getUser(jwt);
  return error?null:data.user;
}
async function isAdmin(userId:string){
  const {data}=await admin.from("profiles").select("role").eq("id",userId).maybeSingle();
  return data?.role==="admin";
}
async function loadGuarantee(guaranteeId:string){
  const {data,error}=await admin.from("guarantees")
    .select("*,reservations(id,user_id,status,check_in,check_out,guest_name,guest_email,guest_phone,confirmation_code)")
    .eq("id",guaranteeId).maybeSingle();
  if(error)throw new Error("guarantee_unavailable");
  return data;
}
function publicState(g:any){return {id:g.id,status:g.status,amount_cents:Number(g.amount_cents),
  captured_amount_cents:Number(g.captured_amount_cents),capture_before:g.provider_capture_before,
  provider_error_code:g.provider_error_code||null};}
async function setState(g:any,expected:string,values:Record<string,unknown>){
  const {data,error}=await admin.from("guarantees").update({...values,updated_at:new Date().toISOString()})
    .eq("id",g.id).eq("status",expected).select("id").maybeSingle();
  if(error)throw new Error("guarantee_write_failed");
  return Boolean(data);
}
async function observe(g:any){
  if(!token||!g.provider_authorization_id)return null;
  const charge=await paymentGateway("pagbank_sandbox",token).getPayment(g.provider_authorization_id,g.provider_order_id||undefined);
  if(charge.id!==g.provider_authorization_id||charge.amount?.currency!=="BRL")
    throw new Error("guarantee_charge_mismatch");
  return charge;
}
async function reconcile(g:any){
  return reconcileGuarantee(admin,g,paymentGateway("pagbank_sandbox",token));
}

// Run by pg_cron through an authenticated server-to-server request. The
// reservation card was tokenized at checkout; no card details enter this job.
async function authorizeDueGuarantees(guaranteeId?:string){
  if(!token)return reply({ok:false,error:"pagbank_sandbox_not_configured"},503);
  await admin.rpc("purge_unconfirmed_guarantee_tokens");
  const today=new Date().toISOString().slice(0,10),latest=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
  let query=admin.from("guarantees")
    .select("*,reservations!inner(id,user_id,status,check_in,check_out,guest_name,guest_email,guest_phone)")
    .eq("status","pending").eq("reservations.status","confirmed")
    .gte("reservations.check_out",today).lte("reservations.check_in",latest);
  if(guaranteeId)query=query.eq("id",guaranteeId);
  const {data:rows,error}=await query.order("created_at").limit(50);
  if(error)return reply({ok:false,error:"guarantees_unavailable"},503);
  const now=Date.now(),results:{id:string;status:string}[]=[];
  for(const g of rows||[]){
    const r=g.reservations,checkin=brazilTime(r?.check_in||"","15:00"),
      checkout=brazilTime(r?.check_out||"","11:00");
    if(r?.status!=="confirmed"||!Number.isFinite(checkin)||!Number.isFinite(checkout)||
      now<checkin-48*3600000||now>checkout||checkout>now+5*86400000)continue;
    const {data:saved}=await admin.from("guarantee_card_tokens").select("card_token,user_id")
      .eq("reservation_id",r.id).maybeSingle();
    if(!saved||saved.user_id!==r.user_id){
      await admin.from("guarantees").update({provider_error_code:"card_token_missing"}).eq("id",g.id).eq("status","pending");
      results.push({id:g.id,status:"card_token_missing"});continue;
    }
    const {data:identity}=await admin.rpc("guest_payment_identity",{p_user_id:r.user_id});
    const holder=Array.isArray(identity)?identity[0]:identity;
    const phone=String(r.guest_phone||"").replace(/\D/g,"").replace(/^55(?=\d{10,11}$)/,"");
    if(holder?.document_type!=="cpf"||!/^[0-9]{10,11}$/.test(phone)){
      results.push({id:g.id,status:"identity_unavailable"});continue;
    }
    const attempt=Number(g.authorization_attempt||0)+1;
    if(attempt>3||!(await setState(g,"pending",{status:"authorizing",authorization_attempt:attempt,
      provider:"pagbank_sandbox",provider_error_code:null})))continue;
    try{
      const referenceId=g.id.replaceAll("-","")+"a"+attempt;
      const orderInput={referenceId,amountCents:Number(g.amount_cents),method:"card" as const,
        cardToken:saved.card_token,installments:1,preAuthorize:true,
        customer:{name:r.guest_name,email:r.guest_email,taxId:holder.document_number,
          phone:{area:phone.slice(0,2),number:phone.slice(2)}},
        notificationUrl:projectUrl+"/functions/v1/pagbank-webhook",description:"Caucao Chalezinho Ville"};
      const created=await paymentGateway("pagbank_sandbox",token).authorizeCard(orderInput);
      const {data:savedOrder,error:saveError}=await admin.from("guarantees").update({
        provider_order_id:created.orderId,provider_authorization_id:created.chargeId,
        provider_last_status:created.status,status:"authorization_uncertain",updated_at:new Date().toISOString()})
        .eq("id",g.id).eq("status","authorizing").select("id").maybeSingle();
      if(saveError||!savedOrder)throw new Error("authorization_persistence_uncertain");
      const state=await reconcile(await loadGuarantee(g.id));
      results.push({id:g.id,status:state.status});
    }catch{
      // The provider may have created an authorization. Never retry the
      // payment blindly; an uncertain result requires reconciliation.
      await setState(g,"authorizing",{status:"authorization_uncertain",
        provider_error_code:"provider_result_unknown"});
      results.push({id:g.id,status:"authorization_uncertain"});
    }
  }
  return reply({ok:true,results});
}
async function claimRelease(guaranteeId:string,actor:string|null=null){
  const {data,error}=await admin.rpc('claim_guarantee_release',{p_guarantee:guaranteeId,p_actor:actor});
  if(error)throw new Error('guarantee_release_claim_failed');
  return data===true;
}

// Provider reads recover missed notifications. All writes use the same atomic
// reconciliation functions as checkout and webhooks; this job never invents money.
async function maintainFinance(){
  if(!token)return reply({ok:false,error:"pagbank_sandbox_not_configured"},503);
  const gateway=paymentGateway("pagbank_sandbox",token),results:{id:string;status:string}[]=[];
  const {data:payments,error:paymentError}=await admin.from('payments')
    .select('id,amount_cents,metadata,provider_payment_id,status')
    .eq('provider','pagbank_sandbox').in('status',['awaiting_payment','processing','under_review','expired'])
    .not('provider_payment_id','is',null).gte('created_at',new Date(Date.now()-48*3600000).toISOString())
    .order('updated_at').limit(50);
  if(paymentError)return reply({ok:false,error:'payments_unavailable'},503);
  const {data:openRefunds,error:refundError}=await admin.from('reservation_refunds').select('payment_id')
    .in('state',['dispatching','uncertain']).order('created_at').limit(50);
  if(refundError)return reply({ok:false,error:'refunds_unavailable'},503);
  const {data:refundPayments,error:refundPaymentError}=openRefunds?.length?
    await admin.from('payments').select('id,amount_cents,metadata,provider_payment_id,status')
      .eq('provider','pagbank_sandbox').in('id',openRefunds.map(x=>x.payment_id)):{data:[],error:null};
  if(refundPaymentError)return reply({ok:false,error:'refunds_unavailable'},503);
  const paymentBatch=[...new Map([...(payments||[]),...(refundPayments||[])].map(p=>[p.id,p])).values()];
  for(const p of paymentBatch){
    try{
      const charge=await gateway.getPayment(p.provider_payment_id,p.metadata?.order_id);
      if(charge.id!==p.provider_payment_id||charge.amount?.currency!=='BRL'||charge.amount.value!==Number(p.amount_cents))
        throw new Error('charge_mismatch');
      const {error}=await admin.rpc(p.metadata?.kind==='post_booking_charge'?'reconcile_pagbank_post_booking_payment':'reconcile_pagbank_sandbox_payment',{
        p_payment_id:p.id,p_charge_id:charge.id,p_status:charge.status,p_amount_cents:charge.amount.value});
      if(error)throw error;
      await reconcileReservationRefunds(admin,p,charge,charge.readSource||'charge');
      results.push({id:p.id,status:charge.status});
    }catch{results.push({id:p.id,status:'reconciliation_pending'});}
  }
  const {data:rows,error}=await admin.from('guarantees')
    .select('*,reservations(id,user_id,status,check_in,check_out)')
    .eq('provider','pagbank_sandbox').not('provider_authorization_id','is',null)
    .in('status',['authorizing','authorization_uncertain','guaranteed','incident_reported','capture_requested','capture_uncertain','release_requested','release_uncertain'])
    .order('updated_at').limit(50);
  if(error)return reply({ok:false,error:'guarantees_unavailable'},503);
  const {data:openGuaranteeRefunds,error:guaranteeRefundError}=await admin.from('guarantee_refunds').select('guarantee_id')
    .in('state',['dispatching','uncertain']).order('created_at').limit(50);
  if(guaranteeRefundError)return reply({ok:false,error:'refunds_unavailable'},503);
  const refundGuarantees=[];
  for(const id of new Set<string>((openGuaranteeRefunds||[]).map((x:any)=>String(x.guarantee_id))))refundGuarantees.push(await loadGuarantee(id));
  const guaranteeBatch=[...new Map([...(rows||[]),...refundGuarantees.filter(Boolean)].map(g=>[g.id,g])).values()];
  for(const g of guaranteeBatch){
    try{
      const current=await reconcile(g);
      // Only cancelled bookings with no incident can release automatically.
      if(g.reservations?.status==='cancelled'&&current.status==='guaranteed'){
        const before=await observe(current);
        if(before?.status==='AUTHORIZED'&&before.amount.value===Number(g.amount_cents)&&
          await claimRelease(g.id)){
          await gateway.cancelAuthorization(g.provider_authorization_id,Number(g.amount_cents),g.id.replaceAll('-','')+'release');
          await reconcile(await loadGuarantee(g.id));
        }
      }
      results.push({id:g.id,status:current.status});
    }catch{results.push({id:g.id,status:'reconciliation_pending'});}
  }
  const authorization=await authorizeDueGuarantees();
  if(!authorization.ok)return authorization;
  const due=await authorization.json();
  return reply({ok:true,observed:results,authorizations:due.results});
}

async function handler(req:Request){
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
  try{assertFinanceDevelopment(projectUrl,Deno.env.get("FINANCE_ENVIRONMENT"))}
  catch{return reply({ok:false,error:"isolated_finance_environment_required"},503)}
  if(req.method!=="POST"||req.headers.get("x-chalezinho-env")!=="development")
    return reply({ok:false,error:"development_only"},403);
  const dispatchSecret=req.headers.get("x-guarantee-dispatch-secret");
  if(dispatchSecret){
    const {data, error}=await admin.rpc("verify_guarantee_dispatch_secret",{p_secret:dispatchSecret});
    if(error||data!==true)return reply({ok:false,error:"dispatch_forbidden"},403);
    return maintainFinance();
  }
  const user=await caller(req);
  if(!user)return reply({ok:false,error:"authentication_required"},401);
  const body=await req.json().catch(()=>null),action=String(body?.action||"");
  if(!id(body?.guarantee_id))return reply({ok:false,error:"invalid_guarantee"},400);
  let g=await loadGuarantee(String(body.guarantee_id));
  if(!g)return reply({ok:false,error:"not_found"},404);
  const owner=g.reservations?.user_id===user.id,manager=await isAdmin(user.id);
  if(!owner&&!manager)return reply({ok:false,error:"not_found"},404);
  if(action==="status"){
    try{return reply({ok:true,guarantee:await reconcile(g)})}
    catch{return reply({ok:true,guarantee:publicState(g),reconciliation:"unavailable"})}
  }
  if(action==="authorize_saved"){
    if(!manager)return reply({ok:false,error:"admin_required"},403);
    const result=await authorizeDueGuarantees(g.id);
    if(!result.ok)return result;
    const updated=await loadGuarantee(g.id);
    if(updated.status==="pending")return reply({ok:false,error:updated.provider_error_code||"authorization_window_unavailable"},409);
    return reply({ok:true,guarantee:publicState(updated)});
  }
  if(!token)return reply({ok:false,error:"pagbank_sandbox_not_configured"},503);
  if(action==="authorize"){
    if(!owner||g.reservations?.status!=="confirmed"||g.status!=="pending")
      return reply({ok:false,error:"authorization_not_available"},409);
    const now=Date.now(),checkin=brazilTime(g.reservations.check_in,"15:00"),checkout=brazilTime(g.reservations.check_out,"11:00");
    // Six days is the shortest published card window. Leave a safety margin.
    if(now<checkin-48*3600000||now>checkout||checkout>now+5*86400000)
      return reply({ok:false,error:"authorization_window_unavailable"},409);
    const encrypted=String(body?.encrypted_card||"");
    if(encrypted.length<20||encrypted.length>10000)return reply({ok:false,error:"encrypted_card_required"},400);
    const {data:identity,error:identityError}=await admin.rpc("guest_payment_identity",{p_user_id:user.id});
    if(identityError)return reply({ok:false,error:"identity_unavailable"},503);
    if(identity?.[0]?.document_type!=="cpf")return reply({ok:false,error:"cpf_required"},409);
    const phone=String(g.reservations.guest_phone||"").replace(/\D/g,"").replace(/^55(?=\d{10,11}$)/,"");
    if(!/^\d{10,11}$/.test(phone))return reply({ok:false,error:"phone_required"},409);
    const attempt=Number(g.authorization_attempt||0)+1;
    if(attempt>3)return reply({ok:false,error:"authorization_attempts_exhausted"},409);
    if(!(await setState(g,"pending",{status:"authorizing",authorization_attempt:attempt,
      provider:"pagbank_sandbox",provider_error_code:null})))
      return reply({ok:false,error:"authorization_in_progress"},409);
    const referenceId=g.id.replaceAll("-","")+"a"+attempt;
    try{
      const orderInput={referenceId,amountCents:Number(g.amount_cents),method:"card" as const,
        encryptedCard:encrypted,installments:1,preAuthorize:true,
        customer:{name:g.reservations.guest_name,email:g.reservations.guest_email,
          taxId:identity[0].document_number,phone:{area:phone.slice(0,2),number:phone.slice(2)}},
        notificationUrl:projectUrl+"/functions/v1/pagbank-webhook",description:"Caucao Chalezinho Ville"};
      const created=await paymentGateway("pagbank_sandbox",token).authorizeCard(orderInput);
      const {data:saved,error:saveError}=await admin.from("guarantees").update({provider_order_id:created.orderId,
        provider_authorization_id:created.chargeId,provider_last_status:created.status,
        status:"authorization_uncertain",updated_at:new Date().toISOString()})
        .eq("id",g.id).eq("status","authorizing").select("id").maybeSingle();
      if(saveError||!saved)throw new Error("authorization_persistence_uncertain");
      g=await loadGuarantee(g.id);
      const state=await reconcile(g);
      return reply({ok:true,guarantee:state});
    }catch{
      await setState(g,"authorizing",{status:"authorization_uncertain",provider_error_code:"provider_result_unknown"});
      return reply({ok:false,error:"authorization_result_uncertain"},503);
    }
  }
  if(!manager)return reply({ok:false,error:"admin_required"},403);
  if(action==="retry_refund"){
    if(!id(body.refund_id))return reply({ok:false,error:"invalid_refund_request"},400);
    return reply({ok:true,...await retryGuaranteeRefund(admin,g,paymentGateway("pagbank_sandbox",token),user.id,body.refund_id)});
  }
  if(action==="refund"){
    if(!id(body.operation_key)||!asMoney(body.amount_cents)||String(body.reason||"").trim().length<5)
      return reply({ok:false,error:"invalid_refund_request"},400);
    return reply({ok:true,...await requestGuaranteeRefund(admin,g,paymentGateway("pagbank_sandbox",token),{
      actor:user.id,amount:Number(body.amount_cents),reason:String(body.reason).trim().slice(0,1000),key:body.operation_key})});
  }
  if(action==="report_incident"){
    const description=String(body.description||"").trim().slice(0,1000);
    const evidence=body.evidence?.length?await verifiedEvidence(g.id,body.evidence):[];
    if(!id(body.operation_key)||!evidence||description.length<5||!Number.isSafeInteger(body.amount_cents)||body.amount_cents<0)
      return reply({ok:false,error:"invalid_incident"},400);
    const {data,error}=await admin.rpc("record_reservation_incident",{p_reservation:g.reservation_id,p_guarantee:g.id,
      p_actor:user.id,p_category:body.category||"damage",p_description:description,p_amount:body.amount_cents,
      p_evidence:evidence,p_key:body.operation_key});
    if(error)throw error;
    return reply({ok:true,incident:data});
  }
  if(action==="attach_incident_evidence"){
    if(!id(body.incident_id))return reply({ok:false,error:"invalid_incident"},400);
    const evidence=await verifiedEvidence(g.id,body.evidence);
    if(!evidence)return reply({ok:false,error:"incident_evidence_missing"},409);
    const {data,error}=await admin.from("incidents").update({evidence}).eq("id",body.incident_id)
      .eq("guarantee_id",g.id).eq("decision","pending").eq("status","open").select("id").maybeSingle();
    if(error||!data)return reply({ok:false,error:"incident_already_decided"},409);
    return reply({ok:true,incident_id:data.id});
  }
  if(action==="decide_incident"){
    if(!id(body.incident_id)||!["approved","no_charge"].includes(body.decision))return reply({ok:false,error:"invalid_incident_decision"},400);
    const {data:incident}=await admin.from("incidents").select("*").eq("id",body.incident_id).eq("guarantee_id",g.id).maybeSingle();
    if(!incident)return reply({ok:false,error:"incident_not_found"},404);
    if(body.decision==="approved"&&!await verifiedEvidence(g.id,incident.evidence))return reply({ok:false,error:"incident_evidence_missing"},409);
    const {data,error}=await admin.rpc("decide_reservation_incident",{p_incident:incident.id,p_actor:user.id,p_decision:body.decision});
    if(error)throw error;
    return reply({ok:true,decision:data});
  }
  if(!["capture","release"].includes(action))return reply({ok:false,error:"invalid_action"},400);
  if(!g.provider_authorization_id)return reply({ok:false,error:"authorization_required"},409);
  if(action==="capture"){
    const amount=body?.amount_cents;
    if(!asMoney(amount)||Number(amount)>Number(g.amount_cents))return reply({ok:false,error:"capture_exceeds_guarantee"},400);
    if(g.status!=="incident_reported")return reply({ok:false,error:"incident_required"},409);
    const {data:incident}=await admin.from("incidents").select("id,requested_capture_cents,evidence")
      .eq("id",g.capture_incident_id).eq("guarantee_id",g.id).eq("decision","approved").eq("status","open").maybeSingle();
    if(!incident?.evidence?.length||Number(incident.requested_capture_cents)!==Number(amount))
      return reply({ok:false,error:"incident_amount_mismatch"},409);
    if(incident.evidence.some((x:any)=>x.bucket===evidenceBucket)&&
      !await verifiedEvidence(g.id,incident.evidence))return reply({ok:false,error:"incident_evidence_missing"},409);
    const before=await observe(g);
    if(['AMEX','AMERICAN_EXPRESS'].includes(String(before?.cardBrand||'').toUpperCase())&&Number(amount)!==Number(g.amount_cents))
      return reply({ok:false,error:"card_partial_capture_unsupported"},409);
    if(before?.status!=="AUTHORIZED"||Number(before.amount.value)!==Number(g.amount_cents)||
      Date.parse(g.provider_capture_before||"")<=Date.now()+3600000)
      return reply({ok:false,error:"authorization_not_capturable"},409);
    if(!(await setState(g,"incident_reported",{status:"capture_requested",requested_capture_cents:Number(amount)})))
      return reply({ok:false,error:"guarantee_state_changed"},409);
    try{await paymentGateway("pagbank_sandbox",token).captureAuthorization(g.provider_authorization_id,Number(amount),
      g.id.replaceAll("-","")+"capture");}
    catch{return reply({ok:false,error:"capture_result_uncertain"},503)}
    try{return reply({ok:true,guarantee:await reconcile(await loadGuarantee(g.id))})}
    catch{return reply({ok:false,error:"capture_reconciliation_pending"},503)}
  }
  if(g.status!=="guaranteed")return reply({ok:false,error:"active_incident_or_operation"},409);
  const before=await observe(g);
  if(before?.status!=="AUTHORIZED"||Number(before.amount.value)!==Number(g.amount_cents))
    return reply({ok:false,error:"authorization_not_releasable"},409);
  if(!(await claimRelease(g.id,user.id)))
    return reply({ok:false,error:"active_incident_or_operation"},409);
  try{await paymentGateway("pagbank_sandbox",token).cancelAuthorization(g.provider_authorization_id,Number(g.amount_cents),
    g.id.replaceAll("-","")+"release");}
  catch{return reply({ok:false,error:"release_result_uncertain"},503)}
  try{return reply({ok:true,guarantee:await reconcile(await loadGuarantee(g.id))})}
  catch{return reply({ok:false,error:"release_reconciliation_pending"},503)}
}

Deno.serve(async req=>{try{return await handler(req)}catch(error){
  console.error(JSON.stringify({event:"guarantee_preview_error",code:String((error as Error).message).slice(0,80)}));
  const known=["refund_exceeds_captured","previous_refund_pending","idempotency_conflict","incident_not_chargeable","incident_already_decided","refund_provider_balance_mismatch"];
  const code=known.find(c=>String((error as Error).message).includes(c));
  return reply({ok:false,error:code||"guarantee_unavailable"},code?409:503);
}});
