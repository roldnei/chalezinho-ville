// PagBank Order adapter. This module does not activate payments by itself.
// Docs: https://developer.pagbank.com.br/reference/criar-pedido-com-qr-code-pix-v2
const bases = {
  sandbox: "https://sandbox.api.pagseguro.com",
  production: "https://api.pagseguro.com",
} as const;

export type PagBankEnvironment = keyof typeof bases;
export type PagBankCustomer = {
  name: string;
  email: string;
  taxId: string;
  phone: { area: string; number: string };
};

export function validPagBankCustomerName(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 &&
    !/[!@#$%¨*()"”\\|{}\[\]<>;]/.test(value);
}

export function pagBankOrder(input: {
  referenceId: string;
  amountCents: number;
  customer: PagBankCustomer;
  method: "pix" | "card";
  expiresAt?: Date;
  encryptedCard?: string;
  cardToken?: string;
  storeCard?: boolean;
  installments?: number;
  buyerInterest?: { total: number; installments: number };
  preAuthorize?: boolean;
  notificationUrl: string;
}) {
  const { referenceId, amountCents, customer, method, notificationUrl } = input;
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(referenceId) || !Number.isSafeInteger(amountCents) || amountCents < 1)
    throw new Error("invalid_payment_data");
  if (!/^https:\/\//.test(notificationUrl)) throw new Error("invalid_notification_url");
  if (!validPagBankCustomerName(customer.name) || !/^\S+@\S+\.\S+$/.test(customer.email) ||
      !/^\d{11,14}$/.test(customer.taxId) || !/^\d{2}$/.test(customer.phone.area) ||
      !/^\d{8,9}$/.test(customer.phone.number)) throw new Error("invalid_customer_data");

  let paymentMethod: Record<string, unknown>;
  if (method === "pix") {
    if (!input.expiresAt || !Number.isFinite(input.expiresAt.getTime()) || input.expiresAt.getTime() <= Date.now())
      throw new Error("invalid_pix_expiry");
    paymentMethod = { type: "PIX", pix: { expiration_date: input.expiresAt.toISOString() } };
  } else {
    if (Boolean(input.encryptedCard) === Boolean(input.cardToken) || !Number.isInteger(input.installments) || input.installments! < 1 || input.installments! > 24)
      throw new Error("invalid_card_data");
    paymentMethod = { type: "CREDIT_CARD", installments: input.installments, capture: !input.preAuthorize,
      card: { ...(input.cardToken ? {id:input.cardToken} : {encrypted:input.encryptedCard}),
        store: Boolean(input.storeCard), holder: { name: customer.name, tax_id: customer.taxId } } };
  }
  const interest = input.buyerInterest;
  if (interest && (method !== "card" || !Number.isSafeInteger(interest.total) || interest.total < 1 ||
      !Number.isInteger(interest.installments) || interest.installments < 1 || interest.installments > input.installments! ||
      amountCents <= interest.total)) throw new Error("invalid_buyer_interest");
  const chargeAmount = interest ? { value: amountCents, currency: "BRL",
    fees: { buyer: { interest: interest } } } : { value: amountCents, currency: "BRL" };
  return {
    reference_id: referenceId,
    customer: { name: customer.name, email: customer.email, tax_id: customer.taxId,
      phones: [{ country: "55", area: customer.phone.area, number: customer.phone.number, type: "MOBILE" }] },
    items: [{ reference_id: referenceId, name: "Reserva Chalezinho Ville", quantity: 1,
      unit_amount: amountCents - (interest?.total || 0) }],
    charges: [{ reference_id: referenceId, description: "Reserva Chalezinho Ville",
      amount: chargeAmount, payment_method: paymentMethod }],
    notification_urls: [notificationUrl],
  };
}

// The sandbox rate table is illustrative; never compute a percentage locally.
export async function pagBankInstallmentPlans(token: string, value: number, max: number,
  free: number, bin: string, fetcher: typeof fetch = fetch) {
  if (!token || !Number.isSafeInteger(value) || value < 500 || !Number.isInteger(max) || max < 1 || max > 12 ||
      !Number.isInteger(free) || free < 0 || free > max || free === 1 || !/^\d{6}(\d{2})?$/.test(bin))
    throw new Error("invalid_installment_request");
  const query = new URLSearchParams({ payment_methods: "CREDIT_CARD", value: String(value),
    max_installments: String(max), max_installments_no_interest: String(free), credit_card_bin: bin });
  const response = await fetcher(`${bases.sandbox}/charges/fees/calculate?${query}`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const messages = Array.isArray(errorBody?.error_messages) ? errorBody.error_messages :
      Array.isArray(errorBody?.errors) ? errorBody.errors : [];
    const codes = messages.map((item: any) => String(item?.code || item?.error || "")
      .replace(/[^a-zA-Z0-9_]/g, "").slice(0, 40)).filter(Boolean).slice(0, 4);
    if (!codes.length && typeof errorBody?.code === "string")
      codes.push(errorBody.code.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 40));
    throw new Error(`pagbank_fees_http_${response.status}${codes.length ? "_code_" + codes.join("_") : ""}`);
  }
  const body = await response.json().catch(() => null);
  const brands = Object.values(body?.payment_methods?.credit_card || {}) as any[];
  if (brands.length !== 1 || !Array.isArray(brands[0]?.installment_plans))
    throw new Error("pagbank_fees_response_invalid");
  return brands[0].installment_plans.map((p: any) => {
    const count = Number(p.installments), total = Number(p.amount?.value), fee = Number(p.amount?.fees?.buyer?.interest?.total || 0);
    const feeInstallments = Number(p.amount?.fees?.buyer?.interest?.installments || 0);
    if (!Number.isInteger(count) || count < 1 || count > max || !Number.isSafeInteger(total) ||
        !Number.isSafeInteger(fee) || fee < 0 || total !== value + fee ||
        Boolean(p.interest_free) !== (fee === 0) ||
        (count <= Math.max(1, free) && fee !== 0) ||
        (count > Math.max(1, free) && (fee < 1 || feeInstallments !== count - free)) ||
        !Number.isInteger(p.installment_value) || p.installment_value < 500)
      throw new Error("pagbank_fees_response_invalid");
    return { installments: count, installment_cents: p.installment_value as number,
      total_cents: total, buyer_interest_cents: fee, buyer_interest_installments: feeInstallments,
      interest_free: fee === 0 };
  });
}

export async function createPagBankOrder(environment: PagBankEnvironment, token: string,
  order: ReturnType<typeof pagBankOrder>, fetcher: typeof fetch = fetch) {
  if (!token) throw new Error("pagbank_token_missing");
  const response = await fetcher(`${bases[environment]}/orders`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, Accept: "application/json",
      "Content-Type": "application/json", "x-idempotency-key": order.reference_id },
    body: JSON.stringify(order), signal: AbortSignal.timeout(10000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 400 || response.status === 422) throw new Error("pagbank_order_rejected");
    throw new Error("pagbank_order_failed");
  }
  if (!body?.id || !body?.charges?.[0]?.id) throw new Error("pagbank_order_failed");
  const charge = body.charges[0];
  if (charge.amount?.currency !== "BRL" || Number(charge.amount?.value) !== order.charges[0].amount.value ||
      !["WAITING", "PAID", "IN_ANALYSIS", "AUTHORIZED", "DECLINED"].includes(charge.status) ||
      (order.charges[0].payment_method.type === "PIX" && charge.status!=="DECLINED" && !charge.qr_code?.text))
    throw new Error("pagbank_order_response_invalid");
  return { orderId: body.id as string, chargeId: charge.id as string,
    cardToken: charge.payment_method?.card?.id as string | undefined,
    status: charge.status as string, pixCode: charge.qr_code?.text as string | undefined,
    qrImageUrl: charge.links?.find((link: {rel:string}) => link.rel === "QRCODE.PNG")?.href as string | undefined };
}

export async function tokenizePagBankCard(token:string, encrypted:string, fetcher:typeof fetch=fetch){
  if(!token||typeof encrypted!=="string"||encrypted.length<20||encrypted.length>10000)
    throw new Error("invalid_card_tokenization");
  const response=await fetcher(`${bases.sandbox}/tokens/cards`,{method:"POST",
    headers:{Authorization:`Bearer ${token}`,Accept:"application/json","Content-Type":"application/json"},
    body:JSON.stringify({encrypted}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error(`pagbank_card_tokenization_http_${response.status}`);
  const body=await response.json().catch(()=>null);
  if(typeof body?.id!=="string"||!/^CARD_[A-Za-z0-9-]+$/.test(body.id))
    throw new Error("pagbank_card_tokenization_invalid");
  return body.id as string;
}

export async function getPagBankCharge(token: string, chargeId: string, fetcher: typeof fetch = fetch) {
  if (!token || !/^CHAR_[A-Za-z0-9-]+$/.test(chargeId)) throw new Error("invalid_charge_id");
  const response = await fetcher(`${bases.sandbox}/charges/${chargeId}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`pagbank_charge_unavailable_${response.status}`);
  return {...normalizeCharge(await response.json()),httpStatus:response.status};
}

// Charge responses put the cumulative refund under amount.summary. Keep the
// normalized shape internal so every reconciliation reads the same location.
function normalizeCharge(raw: any) {
  const summary=raw?.amount?.summary;
  return {id:raw?.id as string,status:raw?.status as string,
    referenceId:raw?.reference_id as string|undefined,
    declineCode:typeof raw?.payment_response?.code==='string'&&/^\d{1,5}$/.test(raw.payment_response.code)?raw.payment_response.code:undefined,
    amount:{value:raw?.amount?.value as number,currency:raw?.amount?.currency as string},
      captureBefore:raw?.payment_method?.capture_before as string|undefined,
      cardBrand:raw?.payment_method?.card?.brand as string|undefined,
    summary:summary&&Number.isSafeInteger(summary.paid)&&Number.isSafeInteger(summary.refunded)?
      {...(Number.isSafeInteger(summary.total)?{total:summary.total as number}:{}),
        paid:summary.paid as number,refunded:summary.refunded as number}:undefined,
    links:raw?.links as Array<{rel:string;href:string}>|undefined};
}

export function extractPagBankWebhookChargeId(payload: any) {
  const charge=Array.isArray(payload?.charges)?payload.charges.find((x:any)=>
    /^CHAR_[A-Za-z0-9-]+$/.test(String(x?.id||"")))?.id:null;
  const direct=/^CHAR_[A-Za-z0-9-]+$/.test(String(payload?.id||""))?payload.id:null;
  return String(charge||direct||"");
}

// The sandbox may omit `summary` even on a successful direct charge lookup.
// A first refund can still be requested against a PAID charge; PagBank must
// enforce the remaining balance. Without the summary, its result stays
// unconfirmed until a later provider read supplies exact refund evidence.
export function evaluateRefundPrecheck(charge: {
  id:string;status:string;amount?:{value:number;currency:string};
  summary?:{paid:number;refunded:number}
}, input:{chargeId:string;capturedCents:number;requestedCents:number;
  confirmedCents:number;otherOpenRefund:boolean}) {
  const base=charge.id===input.chargeId&&charge.status==="PAID"&&
    charge.amount?.currency==="BRL"&&charge.amount.value===input.capturedCents&&
    Number.isSafeInteger(input.capturedCents)&&Number.isSafeInteger(input.requestedCents)&&
    input.requestedCents>0&&input.requestedCents<=input.capturedCents-input.confirmedCents&&
    !input.otherOpenRefund;
  if(!base) return {ready:false,mode:"invalid_charge"};
  if(charge.summary!=null) return {ready:charge.summary.paid===input.capturedCents&&
    charge.summary.refunded===input.confirmedCents,mode:"provider_summary"};
  return {ready:input.confirmedCents===0,mode:"provider_limit"};
}

// A successful HTTP response records only a provider request. The caller must
// subsequently query the charge and reconcile the outcome before changing any
// local paid/refunded/captured/released state.
export async function changePagBankCharge(
  token: string, chargeId: string, operation: "cancel" | "capture",
  amountCents: number, idempotencyKey: string, fetcher: typeof fetch = fetch,
) {
  if (!token || !/^CHAR_[A-Za-z0-9-]+$/.test(chargeId) ||
      !Number.isSafeInteger(amountCents) || amountCents < 1 ||
      !/^[a-zA-Z0-9_-]{16,128}$/.test(idempotencyKey))
    throw new Error("invalid_charge_operation");
  const response = await fetcher(`${bases.sandbox}/charges/${chargeId}/${operation}`, {
    method: "POST",
    headers: {Authorization: `Bearer ${token}`,
      "Content-Type": "application/json", "x-idempotency-key": idempotencyKey},
    body: JSON.stringify({amount: {value: amountCents}}),
    signal: AbortSignal.timeout(10000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    // Never retain raw descriptions: they may contain customer data. Recognize
    // this exact, documented-in-support sandbox symptom as a fixed safe tag.
    const code=String(body?.error_messages?.[0]?.code||body?.error_messages?.[0]?.error||"");
    const errorHint=code==='40008'&&body?.error_messages?.[0]?.description==='Transaction is not found.'?
      'transaction_not_found':null;
    const suffix=/^[a-zA-Z0-9_]{1,40}$/.test(code)?`_code_${code}`:"";
    console.warn(JSON.stringify({event:'pagbank_charge_rejected',operation,http_status:response.status,
      code:/^[a-zA-Z0-9_]{1,40}$/.test(code)?code:null,hint:errorHint}));
    throw Object.assign(new Error(`pagbank_charge_operation_http_${response.status}${suffix}`),
      {httpStatus:response.status,errorCode:/^[a-zA-Z0-9_]{1,40}$/.test(code)?code:null,errorHint});
  }
  if (body?.id !== chargeId || body?.amount?.currency !== "BRL" ||
      !Number.isSafeInteger(body?.amount?.value) ||
      !["PAID","CANCELED","AUTHORIZED"].includes(body?.status))
    throw new Error("pagbank_charge_operation_uncertain");
  const charge=normalizeCharge(body);
  return {chargeId:charge.id,status:charge.status,amountCents:charge.amount.value,
    httpStatus:response.status,
    summary:charge.summary||null};
}

// The order lookup offers a secondary status read if the direct charge
// endpoint is temporarily unavailable; it may omit the refund summary.
export async function getPagBankOrderCharge(token:string, orderId:string, chargeId:string,
  fetcher:typeof fetch=fetch) {
  if(!token || !/^ORDE_[A-Za-z0-9-]+$/.test(orderId)) throw new Error("invalid_order_id");
  const response=await fetcher(`${bases.sandbox}/orders/${orderId}`,{
    headers:{Authorization:`Bearer ${token}`,Accept:"application/json"},signal:AbortSignal.timeout(10000)});
  if(!response.ok) throw new Error(`pagbank_order_unavailable_${response.status}`);
  const data=await response.json();
  const charge=data?.charges?.find((entry:{id:string})=>entry.id===chargeId);
  if(!charge) throw new Error("pagbank_order_charge_missing");
  return {...normalizeCharge(charge),httpStatus:response.status};
}

export async function getPagBankCardPublicKey(token: string, fetcher: typeof fetch = fetch) {
  let response = await fetcher(`${bases.sandbox}/public-keys/card`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if(response.status===404){
    response=await fetcher(`${bases.sandbox}/public-keys`,{
      method:"POST",headers:{Authorization:`Bearer ${token}`,Accept:"application/json",
        "Content-Type":"application/json"},body:JSON.stringify({type:"card"}),
      signal:AbortSignal.timeout(10000),
    });
  }
  if (!response.ok) throw new Error("pagbank_card_key_unavailable");
  const data = await response.json();
  if (typeof data?.public_key !== "string") throw new Error("pagbank_card_key_unavailable");
  return data.public_key as string;
}

// PagBank signs the exact unformatted request body with SHA-256(token + '-' + body).
export async function verifyPagBankNotification(token: string, rawBody: string, signature: string) {
  if (!token || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const bytes = new TextEncoder().encode(`${token}-${rawBody}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const expected = Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
  const actual = signature.toLowerCase();
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
  return diff === 0;
}

let webhookKeyCache:{key:CryptoKey;expires:number}|null=null;
export async function verifyPagBankSignedNotification(token:string, rawBody:string, signatureHeader:string,
  fetcher:typeof fetch=fetch) {
  const signatures=signatureHeader.split(",").map(x=>x.trim()).filter(Boolean);
  if(!token||!signatures.length) return false;
  if(!webhookKeyCache||webhookKeyCache.expires<Date.now()) {
    const response=await fetcher(`${bases.sandbox}/public-keys?type=webhook`,{
      headers:{Authorization:`Bearer ${token}`,Accept:"application/json"},signal:AbortSignal.timeout(10000)});
    if(!response.ok) throw new Error("pagbank_webhook_key_unavailable");
    const data=await response.json();
    if(typeof data?.public_key!=="string") throw new Error("pagbank_webhook_key_invalid");
    const bytes=Uint8Array.from(atob(data.public_key),c=>c.charCodeAt(0));
    const key=await crypto.subtle.importKey("spki",bytes,{name:"ECDSA",namedCurve:"P-256"},false,["verify"]);
    webhookKeyCache={key,expires:Date.now()+3600000};
  }
  const body=new TextEncoder().encode(rawBody);
  for(const signature of signatures){
    try {
      const der=Uint8Array.from(atob(signature),c=>c.charCodeAt(0));
      // PagBank sends ASN.1 DER. WebCrypto expects IEEE P1363 (r || s).
      if(der[0]!==0x30||der[1]!==der.length-2||der[2]!==0x02) continue;
      const rLen=der[3],sTag=4+rLen;
      if(der[sTag]!==0x02) continue;
      const sLen=der[sTag+1];
      if(sTag+2+sLen!==der.length) continue;
      const r=der.slice(4,sTag),s=der.slice(sTag+2);
      const normalize=(v:Uint8Array)=>{while(v.length>32&&v[0]===0)v=v.slice(1);if(v.length>32)throw Error("invalid_signature");const out=new Uint8Array(32);out.set(v,32-v.length);return out};
      const raw=new Uint8Array(64);raw.set(normalize(r));raw.set(normalize(s),32);
      if(await crypto.subtle.verify({name:"ECDSA",hash:"SHA-256"},webhookKeyCache.key,raw,body))return true;
    }catch{/* try remaining rotated signatures */}
  }
  return false;
}
