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

export function pagBankOrder(input: {
  referenceId: string;
  amountCents: number;
  customer: PagBankCustomer;
  method: "pix" | "card";
  expiresAt?: Date;
  encryptedCard?: string;
  installments?: number;
  preAuthorize?: boolean;
  notificationUrl: string;
}) {
  const { referenceId, amountCents, customer, method, notificationUrl } = input;
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(referenceId) || !Number.isSafeInteger(amountCents) || amountCents < 1)
    throw new Error("invalid_payment_data");
  if (!/^https:\/\//.test(notificationUrl)) throw new Error("invalid_notification_url");
  if (!customer.name.trim() || !/^\S+@\S+\.\S+$/.test(customer.email) ||
      !/^\d{11,14}$/.test(customer.taxId) || !/^\d{2}$/.test(customer.phone.area) ||
      !/^\d{8,9}$/.test(customer.phone.number)) throw new Error("invalid_customer_data");

  let paymentMethod: Record<string, unknown>;
  if (method === "pix") {
    if (!input.expiresAt || !Number.isFinite(input.expiresAt.getTime()) || input.expiresAt.getTime() <= Date.now())
      throw new Error("invalid_pix_expiry");
    paymentMethod = { type: "PIX", pix: { expiration_date: input.expiresAt.toISOString() } };
  } else {
    if (!input.encryptedCard || !Number.isInteger(input.installments) || input.installments! < 1 || input.installments! > 24)
      throw new Error("invalid_card_data");
    paymentMethod = { type: "CREDIT_CARD", installments: input.installments, capture: !input.preAuthorize,
      card: { encrypted: input.encryptedCard, store: false,
        holder: { name: customer.name, tax_id: customer.taxId } } };
  }
  return {
    reference_id: referenceId,
    customer: { name: customer.name, email: customer.email, tax_id: customer.taxId,
      phones: [{ country: "55", area: customer.phone.area, number: customer.phone.number, type: "MOBILE" }] },
    items: [{ reference_id: referenceId, name: "Reserva Chalezinho Ville", quantity: 1, unit_amount: amountCents }],
    charges: [{ reference_id: referenceId, description: "Reserva Chalezinho Ville",
      amount: { value: amountCents, currency: "BRL" }, payment_method: paymentMethod }],
    notification_urls: [notificationUrl],
  };
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
  if (!response.ok || !body?.id || !body?.charges?.[0]?.id) throw new Error("pagbank_order_failed");
  const charge = body.charges[0];
  if (charge.amount?.currency !== "BRL" || Number(charge.amount?.value) !== order.charges[0].amount.value ||
      !["WAITING", "PAID", "IN_ANALYSIS", "AUTHORIZED", "DECLINED"].includes(charge.status) ||
      (order.charges[0].payment_method.type === "PIX" && !charge.qr_code?.text))
    throw new Error("pagbank_order_response_invalid");
  return { orderId: body.id as string, chargeId: charge.id as string,
    status: charge.status as string, pixCode: charge.qr_code?.text as string | undefined,
    qrImageUrl: charge.links?.find((link: {rel:string}) => link.rel === "QRCODE.PNG")?.href as string | undefined };
}

export async function getPagBankCharge(token: string, chargeId: string, fetcher: typeof fetch = fetch) {
  if (!token || !/^CHAR_[A-Za-z0-9-]+$/.test(chargeId)) throw new Error("invalid_charge_id");
  const response = await fetcher(`${bases.sandbox}/charges/${chargeId}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`pagbank_charge_unavailable_${response.status}`);
  return normalizeCharge(await response.json());
}

// Charge responses put the cumulative refund under amount.summary. Keep the
// normalized shape internal so every reconciliation reads the same location.
function normalizeCharge(raw: any) {
  const summary=raw?.amount?.summary;
  return {id:raw?.id as string,status:raw?.status as string,
    amount:{value:raw?.amount?.value as number,currency:raw?.amount?.currency as string},
    summary:summary&&Number.isSafeInteger(summary.paid)&&Number.isSafeInteger(summary.refunded)?
      {paid:summary.paid as number,refunded:summary.refunded as number}:undefined,
    links:raw?.links as Array<{rel:string;href:string}>|undefined};
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
    // Only the provider's machine-readable error code is safe to retain.
    // Descriptions and the rest of the response may contain customer data.
    const code=String(body?.error_messages?.[0]?.code||body?.error_messages?.[0]?.error||"");
    const suffix=/^[a-zA-Z0-9_]{1,40}$/.test(code)?`_code_${code}`:"";
    throw new Error(`pagbank_charge_operation_http_${response.status}${suffix}`);
  }
  if (body?.id !== chargeId || body?.amount?.currency !== "BRL" ||
      !Number.isSafeInteger(body?.amount?.value) ||
      !["PAID","CANCELED","AUTHORIZED"].includes(body?.status))
    throw new Error("pagbank_charge_operation_uncertain");
  const charge=normalizeCharge(body);
  return {chargeId:charge.id,status:charge.status,amountCents:charge.amount.value,
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
  return normalizeCharge(charge);
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
