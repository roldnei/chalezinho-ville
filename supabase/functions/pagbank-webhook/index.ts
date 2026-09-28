import { createClient } from "npm:@supabase/supabase-js@2";
import { getPagBankCharge, getPagBankOrderCharge, verifyPagBankNotification, verifyPagBankSignedNotification } from "../booking-engine/pagbank.ts";

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
  if(!authenticated){
    console.error(JSON.stringify({event:"pagbank_webhook_signature_missing_or_invalid",legacy_header:!!signature,signed_header:!!signed}));
    return new Response("Invalid signature",{status:401});
  }
  let payload:any;
  try { payload=JSON.parse(raw); } catch { return new Response("Invalid body",{status:400}); }
  const chargeId=String(payload?.id||payload?.charges?.[0]?.id||"");
  if(!/^CHAR_[A-Za-z0-9-]+$/.test(chargeId)) return new Response("Invalid charge",{status:400});
  try {
    const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      {auth:{persistSession:false,autoRefreshToken:false}});
    const {data:payment,error:findError}=await admin.from("payments")
      .select("id,amount_cents,metadata").eq("provider","pagbank_sandbox")
      .eq("provider_payment_id",chargeId).single();
    // A webhook can arrive before the order ID is saved. A non-2xx response
    // lets PagBank retry; the guest can also reconcile via status polling.
    if(findError||!payment) return new Response("Charge not registered yet",{status:503});
    let charge;
    try{charge=await getPagBankCharge(token,chargeId)}
    catch(error){
      if(!payment.metadata?.order_id)throw error;
      charge=await getPagBankOrderCharge(token,payment.metadata.order_id,chargeId);
    }
    if(charge.id!==chargeId||charge.amount?.currency!=="BRL"||
      Number(charge.amount.value)!==Number(payment.amount_cents))
      return new Response("Charge mismatch",{status:409});
    const {error}=await admin.rpc("reconcile_pagbank_sandbox_payment",{
      p_payment_id:payment.id,p_charge_id:chargeId,p_status:charge.status,
      p_amount_cents:Number(charge.amount.value)});
    if(error) throw error;
    return new Response("ok",{status:200});
  } catch(error) {
    console.error(JSON.stringify({event:"pagbank_webhook_error",charge_id:chargeId,error:String(error)}));
    return new Response("Retry later",{status:503});
  }
});
