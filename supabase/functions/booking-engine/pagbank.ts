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
    paymentMethod = { type: "CREDIT_CARD", installments: input.installments, capture: true,
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
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("pagbank_charge_unavailable");
  return await response.json() as { id: string; status: string; amount: {value: number; currency: string} };
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
