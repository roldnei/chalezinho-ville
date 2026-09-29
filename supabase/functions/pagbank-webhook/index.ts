import {paymentGateway} from "../_shared/finance/gateway.ts";
import {assertFinanceDevelopment} from "../_shared/finance/environment.ts";
import {reconcileGuarantee} from "../_shared/finance/guarantee-service.ts";
import {reconcileReservationRefunds} from "../_shared/finance/refund-reconciliation.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { extractPagBankWebhookChargeId, verifyPagBankNotification, verifyPagBankSignedNotification } from "../booking-engine/pagbank.ts";

// Public endpoint: verify_jwt is off because PagBank does not send a Supabase JWT.
// Every notification is authenticated using the PagBank signature and then
// reconciled against a fresh GET from PagBank; the payload alone is not trusted.
Deno.serve(async (request) => {
  try{assertFinanceDevelopment(Deno.env.get("SUPABASE_URL")||"",Deno.env.get("FINANCE_ENVIRONMENT"))}
  catch{return new Response("Isolated development environment required",{status:503})}
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
  if(!authenticated&&(signature||signed||Deno.env.get("ALLOW_UNSIGNED_SANDBOX_WEBHOOK")!=="true")) return new Response("Invalid signature",{status:401});
  let payload:any;
  try { payload=JSON.parse(raw); } catch { return new Response("Invalid body",{status:400}); }
  const chargeId=extractPagBankWebhookChargeId(payload);
  if(!/^CHAR_[A-Za-z0-9-]+$/.test(chargeId)) return new Response("Invalid charge",{status:400});
  try {
    const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      {auth:{persistSession:false,autoRefreshToken:false}});
    const {data:payment,error:findError}=await admin.from("payments")
      .select("id,amount_cents,metadata,provider_payment_id").eq("provider","pagbank_sandbox")
      .eq("provider_payment_id",chargeId).single();
    // A webhook can arrive before the order ID is saved. A non-2xx response
    // lets PagBank retry; the guest can also reconcile via status polling.
    if(findError||!payment){
      const {data:guarantee}=await admin.from("guarantees")
        .select("*,reservations(check_out)")
        .eq("provider","pagbank_sandbox").eq("provider_authorization_id",chargeId).maybeSingle();
      if(!guarantee)return new Response("Charge not registered yet",{status:503});
      await reconcileGuarantee(admin,guarantee,paymentGateway("pagbank_sandbox",token));
      return new Response("ok",{status:200});
    }
    const charge=await paymentGateway('pagbank_sandbox',token).getPayment(chargeId,payment.metadata?.order_id);
    if(charge.id!==chargeId||charge.amount?.currency!=="BRL"||
      Number(charge.amount.value)!==Number(payment.amount_cents))
      return new Response("Charge mismatch",{status:409});
    const {error}=await admin.rpc(payment.metadata?.kind==="post_booking_charge"
      ?"reconcile_pagbank_post_booking_payment":"reconcile_pagbank_sandbox_payment",{
      p_payment_id:payment.id,p_charge_id:chargeId,p_status:charge.status,
      p_amount_cents:Number(charge.amount.value)});
    if(error) throw error;
    await reconcileReservationRefunds(admin,payment,charge,charge.readSource||'charge');
    return new Response("ok",{status:200});
  } catch(error) {
    console.error(JSON.stringify({event:"pagbank_webhook_error",charge_id:chargeId,error:String(error)}));
    return new Response("Retry later",{status:503});
  }
});
