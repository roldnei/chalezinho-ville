import { createClient } from "npm:@supabase/supabase-js@2";
import { extractPagBankWebhookChargeId, getPagBankCharge, getPagBankOrderCharge, verifyPagBankNotification, verifyPagBankSignedNotification } from "../booking-engine/pagbank.ts";

// Public endpoint: verify_jwt is off because PagBank does not send a Supabase JWT.
// Every notification is authenticated using the PagBank signature and then
// reconciled against a fresh GET from PagBank; the payload alone is not trusted.
Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", {status:405});
  const token=Deno.env.get("PAGBANK_SANDBOX_TOKEN")||"";
  const raw=await request.text();
  const signature=request.headers.get("x-authenticity-token")||"";
  const signed=request.headers.get("x-payload-signature")||"";
  let authenticated=await verifyPagBankNotification(token,raw,signature);
  if(!authenticated&&signed){
    try { authenticated=await verifyPagBankSignedNotification(token,raw,signed); }
    catch(error){console.error(JSON.stringify({event:"pagbank_webhook_key_error",error:String(error)}));return new Response("Retry later",{status:503});}
  }
  // The PagBank sandbox can omit both documented signature headers. An
  // unsigned message is only a hint: never trust its status, amount or user.
  // Reconcile exclusively from the server-authenticated PagBank lookup below.
  if(!authenticated&&(signature||signed)) return new Response("Invalid signature",{status:401});
  let payload:any;
  try { payload=JSON.parse(raw); } catch { return new Response("Invalid body",{status:400}); }
  const chargeId=extractPagBankWebhookChargeId(payload);
  if(!/^CHAR_[A-Za-z0-9-]+$/.test(chargeId)) return new Response("Invalid charge",{status:400});
  try {
    const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      {auth:{persistSession:false,autoRefreshToken:false}});
    const {data:payment,error:findError}=await admin.from("payments")
      .select("id,amount_cents,metadata").eq("provider","pagbank_sandbox")
      .eq("provider_payment_id",chargeId).single();
    // A webhook can arrive before the order ID is saved. A non-2xx response
    // lets PagBank retry; the guest can also reconcile via status polling.
    if(findError||!payment){
      const {data:guarantee}=await admin.from("guarantees")
        .select("id,amount_cents,requested_capture_cents,status,provider_capture_before,reservations(check_out)")
        .eq("provider","pagbank_sandbox").eq("provider_authorization_id",chargeId).maybeSingle();
      if(!guarantee)return new Response("Charge not registered yet",{status:503});
      const charge=await getPagBankCharge(token,chargeId);
      const original=Number(guarantee.amount_cents);
      if(charge.id!==chargeId||charge.amount?.currency!=="BRL")return new Response("Charge mismatch",{status:409});
      if(["authorizing","authorization_uncertain"].includes(guarantee.status)&&charge.status==="AUTHORIZED"&&
        Number(charge.amount.value)===original){
        const expiry=Date.parse(charge.captureBefore||guarantee.provider_capture_before||"");
        const checkout=Date.parse(String((guarantee.reservations as any)?.check_out)+"T11:00:00-03:00");
        if(Number.isFinite(expiry)&&expiry>checkout+3600000){
          const {error}=await admin.from("guarantees").update({status:"guaranteed",provider_capture_before:new Date(expiry).toISOString(),
            provider_last_status:"AUTHORIZED",updated_at:new Date().toISOString()})
            .eq("id",guarantee.id).in("status",["authorizing","authorization_uncertain"]);
          if(error)throw error;
        }
      }
      const captured=Number(guarantee.requested_capture_cents);
      if(["capture_requested","capture_uncertain"].includes(guarantee.status)&&charge.status==="PAID"&&captured>0&&(
        (Number(charge.amount.value)===captured&&(!charge.summary||charge.summary.paid===captured))||
        (Number(charge.amount.value)===original&&charge.summary?.paid===captured))){
        const {error}=await admin.rpc("capture_guarantee_mock_atomic",{
          p_guarantee_id:guarantee.id,p_actor_user_id:null,
          p_amount_cents:captured});
        if(error)throw error;
        const {error:statusError}=await admin.from("guarantees").update({provider_last_status:"PAID",
          provider_error_code:null,updated_at:new Date().toISOString()}).eq("id",guarantee.id).eq("status","captured");
        if(statusError)throw statusError;
      }
      if(["release_requested","release_uncertain"].includes(guarantee.status)&&charge.status==="CANCELED"){
        const {error}=await admin.from("guarantees").update({status:"released",provider_last_status:"CANCELED",updated_at:new Date().toISOString()})
          .eq("id",guarantee.id).in("status",["release_requested","release_uncertain"]);
        if(error)throw error;
      }
      return new Response("ok",{status:200});
    }
    let charge;
    try{charge=await getPagBankCharge(token,chargeId)}
    catch(error){
      if(!payment.metadata?.order_id)throw error;
      charge=await getPagBankOrderCharge(token,payment.metadata.order_id,chargeId);
    }
    if(charge.id!==chargeId||charge.amount?.currency!=="BRL"||
      Number(charge.amount.value)!==Number(payment.amount_cents))
      return new Response("Charge mismatch",{status:409});
    const {error}=await admin.rpc(payment.metadata?.kind==="post_booking_charge"
      ?"reconcile_pagbank_post_booking_payment":"reconcile_pagbank_sandbox_payment",{
      p_payment_id:payment.id,p_charge_id:chargeId,p_status:charge.status,
      p_amount_cents:Number(charge.amount.value)});
    if(error) throw error;
    return new Response("ok",{status:200});
  } catch(error) {
    console.error(JSON.stringify({event:"pagbank_webhook_error",charge_id:chargeId,error:String(error)}));
    return new Response("Retry later",{status:503});
  }
});
