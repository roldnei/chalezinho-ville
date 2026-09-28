import {createClient} from "npm:@supabase/supabase-js@2";
import {changePagBankCharge,createPagBankOrder,getPagBankCharge,pagBankOrder} from "../booking-engine/pagbank.ts";

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
  const charge=await getPagBankCharge(token,g.provider_authorization_id);
  if(charge.id!==g.provider_authorization_id||charge.amount?.currency!=="BRL")
    throw new Error("guarantee_charge_mismatch");
  return charge;
}
async function reconcile(g:any){
  if(!g.provider_authorization_id)return publicState(g);
  const charge=await observe(g);
  const initial=Number(g.amount_cents),captured=Number(g.requested_capture_cents||0);
  if(["authorizing","authorization_uncertain"].includes(g.status)){
    if(charge?.status==="AUTHORIZED"&&Number(charge.amount.value)===initial){
      const expiry=Date.parse(charge.captureBefore||g.provider_capture_before||"");
      const checkout=brazilTime(g.reservations.check_out,"11:00");
      if(!Number.isFinite(expiry)||expiry<checkout+3600000)
        return { ...publicState(g),provider_status:"AUTHORIZED",error:"authorization_expires_before_checkout"};
      await setState(g,g.status,{status:"guaranteed",provider:"pagbank_sandbox",
        provider_capture_before:new Date(expiry).toISOString(),provider_last_status:"AUTHORIZED",provider_error_code:null});
    }else if(charge?.status==="DECLINED"){
      await setState(g,g.status,{status:"pending",provider_last_status:"DECLINED",provider_error_code:"authorization_declined"});
    }
  }
  if(g.status==="capture_requested"||g.status==="capture_uncertain"){
    if(charge?.status==="PAID"&&captured>0&&(
      (Number(charge.amount.value)===captured&&(!charge.summary||charge.summary.paid===captured))||
      (Number(charge.amount.value)===initial&&charge.summary?.paid===captured))){
      const {error}=await admin.rpc("capture_guarantee_mock_atomic",{
        p_guarantee_id:g.id,p_actor_user_id:null,p_amount_cents:captured});
      if(error)throw new Error("guarantee_capture_ledger_unavailable");
      const {error:statusError}=await admin.from("guarantees").update({provider_last_status:"PAID",
        provider_error_code:null,updated_at:new Date().toISOString()}).eq("id",g.id).eq("status","captured");
      if(statusError)throw new Error("guarantee_capture_status_unavailable");
    }
  }
  if(g.status==="captured"&&charge?.status==="PAID"&&captured>0&&(
    (Number(charge.amount.value)===captured&&(!charge.summary||charge.summary.paid===captured))||
    (Number(charge.amount.value)===initial&&charge.summary?.paid===captured))){
    const {error}=await admin.from("guarantees").update({provider_last_status:"PAID",
      provider_error_code:null,updated_at:new Date().toISOString()}).eq("id",g.id).eq("status","captured");
    if(error)throw new Error("guarantee_capture_status_unavailable");
  }
  if(["release_requested","release_uncertain"].includes(g.status)&&charge?.status==="CANCELED"){
    await setState(g,g.status,{status:"released",provider_last_status:"CANCELED",provider_error_code:null});
  }
  const updated=await loadGuarantee(g.id);
  return {...publicState(updated),provider_status:charge?.status};
}

async function handler(req:Request){
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
  if(req.method!=="POST"||req.headers.get("x-chalezinho-env")!=="development")
    return reply({ok:false,error:"development_only"},403);
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
    if(!(await setState(g,"pending",{status:"authorizing",authorization_attempt:attempt,
      provider:"pagbank_sandbox",provider_error_code:null})))
      return reply({ok:false,error:"authorization_in_progress"},409);
    const referenceId=g.id.replaceAll("-","")+"a"+attempt;
    try{
      const order=pagBankOrder({referenceId,amountCents:Number(g.amount_cents),method:"card",
        encryptedCard:encrypted,installments:1,preAuthorize:true,
        customer:{name:g.reservations.guest_name,email:g.reservations.guest_email,
          taxId:identity[0].document_number,phone:{area:phone.slice(0,2),number:phone.slice(2)}},
        notificationUrl:projectUrl+"/functions/v1/pagbank-webhook"});
      order.items[0].name="Caucao Chalezinho Ville";
      order.charges[0].description="Caucao Chalezinho Ville";
      const created=await createPagBankOrder("sandbox",token,order);
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
  if(action==="report_incident"){
    if(g.status!=="guaranteed"||!g.provider_authorization_id)return reply({ok:false,error:"authorization_required"},409);
    const description=String(body?.description||"").trim().slice(0,1000);
    const evidenceUrl=String(body?.evidence_url||"").trim();
    if(description.length<10||!/^https:\/\/[a-z0-9.-]+\//i.test(evidenceUrl))
      return reply({ok:false,error:"incident_evidence_required"},400);
    if(!(await setState(g,"guaranteed",{status:"incident_reported"})))
      return reply({ok:false,error:"guarantee_state_changed"},409);
    const {data:incident,error}=await admin.from("incidents").insert({guarantee_id:g.id,
      description,requested_capture_cents:Number(body?.amount_cents||0),evidence:[{url:evidenceUrl}],status:"open"})
      .select("id").single();
    if(error){await setState(g,"incident_reported",{status:"guaranteed"});
      return reply({ok:false,error:"incident_create_failed"},503)}
    return reply({ok:true,incident_id:incident.id});
  }
  if(!["capture","release"].includes(action))return reply({ok:false,error:"invalid_action"},400);
  if(!g.provider_authorization_id)return reply({ok:false,error:"authorization_required"},409);
  if(action==="capture"){
    const amount=body?.amount_cents;
    if(!asMoney(amount)||Number(amount)>Number(g.amount_cents))return reply({ok:false,error:"capture_exceeds_guarantee"},400);
    if(g.status!=="incident_reported")return reply({ok:false,error:"incident_required"},409);
    const {data:incident}=await admin.from("incidents").select("id,requested_capture_cents,evidence")
      .eq("guarantee_id",g.id).eq("status","open").order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(!incident?.evidence?.length||Number(incident.requested_capture_cents)!==Number(amount))
      return reply({ok:false,error:"incident_amount_mismatch"},409);
    const before=await observe(g);
    if(before?.status!=="AUTHORIZED"||Number(before.amount.value)!==Number(g.amount_cents)||
      Date.parse(g.provider_capture_before||"")<=Date.now()+3600000)
      return reply({ok:false,error:"authorization_not_capturable"},409);
    if(!(await setState(g,"incident_reported",{status:"capture_requested",requested_capture_cents:Number(amount)})))
      return reply({ok:false,error:"guarantee_state_changed"},409);
    try{await changePagBankCharge(token,g.provider_authorization_id,"capture",Number(amount),
      g.id.replaceAll("-","")+"capture");}
    catch{return reply({ok:false,error:"capture_result_uncertain"},503)}
    try{return reply({ok:true,guarantee:await reconcile(await loadGuarantee(g.id))})}
    catch{return reply({ok:false,error:"capture_reconciliation_pending"},503)}
  }
  if(g.status!=="guaranteed")return reply({ok:false,error:"active_incident_or_operation"},409);
  const before=await observe(g);
  if(before?.status!=="AUTHORIZED"||Number(before.amount.value)!==Number(g.amount_cents))
    return reply({ok:false,error:"authorization_not_releasable"},409);
  if(!(await setState(g,"guaranteed",{status:"release_requested"})))
    return reply({ok:false,error:"guarantee_state_changed"},409);
  try{await changePagBankCharge(token,g.provider_authorization_id,"cancel",Number(g.amount_cents),
    g.id.replaceAll("-","")+"release");}
  catch{return reply({ok:false,error:"release_result_uncertain"},503)}
  try{return reply({ok:true,guarantee:await reconcile(await loadGuarantee(g.id))})}
  catch{return reply({ok:false,error:"release_reconciliation_pending"},503)}
}

Deno.serve(async req=>{try{return await handler(req)}catch(error){
  console.error(JSON.stringify({event:"guarantee_preview_error",code:String((error as Error).message).slice(0,80)}));
  return reply({ok:false,error:"guarantee_unavailable"},503);
}});
