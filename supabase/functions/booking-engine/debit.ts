import { getPagBankOrderCharge } from "./pagbank.ts";

export const debitDevProject = "https://pxfqmnhqodqyaaqeyjgr.supabase.co";
export const debitPreviewOrigin = "https://chalezinho-ville-git-feat-dev-debito-3ds-roldneicosta-4140.vercel.app";
export const debitPreviewFunction = "booking-engine-debito";

export function isDebitPreview(projectUrl: string, requestUrl: string, origin: string | null) {
  return projectUrl === debitDevProject && origin === debitPreviewOrigin &&
    new URL(requestUrl).pathname.split("/").at(-1) === debitPreviewFunction;
}

export function debitQuoteEligible(option: any, property: any) {
  const snapshot = option?.contract_snapshot;
  const pricing = option?.quotes?.pricing_snapshot;
  return Boolean(property && Number(property.guarantee_amount_cents) === 0 && snapshot &&
    !snapshot.offer_id && !snapshot.experiences?.length && !pricing?.modification_only &&
    !pricing?.same_day_request_id && !pricing?.stay_offer_id &&
    Number.isSafeInteger(option.total_amount_cents) && option.total_amount_cents >= 100 &&
    option.total_amount_cents === option.accommodation_amount_cents + option.cleaning_fee_cents);
}

export function debitOrderEvidence(charge: Awaited<ReturnType<typeof getPagBankOrderCharge>>, paymentId: string, orderId: string, cents: number) {
  const reference = paymentId.replace(/-/g, "");
  if (charge.orderId !== orderId || charge.orderReferenceId !== reference || charge.referenceId !== reference ||
      charge.paymentType !== "DEBIT_CARD" || charge.amount.currency !== "BRL" ||
      charge.amount.value !== cents ||
      (charge.status === "PAID" && (charge.authenticationStatus !== "AUTHENTICATED" ||
        charge.summary?.paid !== cents || charge.summary?.refunded !== 0))) {
    throw new Error("pagbank_debit_order_mismatch");
  }
  return {
    http: charge.httpStatus, status: charge.status, amount_cents: charge.amount.value, currency: "BRL",
    method: charge.paymentType, authentication_status: charge.authenticationStatus || null,
    paid_cents: charge.summary?.paid ?? null, refunded_cents: charge.summary?.refunded ?? null,
    payment_code: charge.declineCode || null, paid_at: charge.paidAt || null,
  };
}

export async function reconcileDebitOrder(admin: any, token: string, payment: any, orderId: string, chargeId: string) {
  const charge = await getPagBankOrderCharge(token, orderId, chargeId);
  const evidence = debitOrderEvidence(charge, payment.id, orderId, payment.amount_cents);
  const terminal = ["PAID", "DECLINED", "CANCELED", "CANCELLED", "EXPIRED"].includes(charge.status);
  const { error: saveError } = await admin.from("payments").update({
    ...(terminal ? { provider_payment_id: chargeId } : {}),
    metadata: { ...payment.metadata, order_id: orderId, debit_charge_id: chargeId, debit_verification: evidence },
  }).eq("id", payment.id).is("provider_payment_id", null);
  if (saveError) throw saveError;
  if (!terminal) return;

  const { error } = await admin.rpc("reconcile_pagbank_sandbox_payment", {
    p_payment_id: payment.id, p_charge_id: chargeId, p_status: charge.status, p_amount_cents: payment.amount_cents,
  });
  if (error) throw error;
}
