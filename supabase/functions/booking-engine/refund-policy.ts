// Pure calculation. A refund decision must use the rule attached to the
// document accepted for this reservation, never the currently active rule.
export type RefundPolicyInput = {
  plan: "refundable" | "non_refundable";
  acceptedAt: string;
  requestedAt: string;
  checkIn: string;
  withdrawalDays: number;
  fullRefundDaysBeforeCheckIn: number;
  lateAccommodationRefundPercent: number;
  accommodationCents: number;
  cleaningCents: number;
  unprovidedExperiencesCents: number;
  paidModificationCents: number;
};

export function calculateCancellationRefund(input: RefundPolicyInput) {
  const {plan,acceptedAt,requestedAt,checkIn,withdrawalDays,
    fullRefundDaysBeforeCheckIn,lateAccommodationRefundPercent,
    accommodationCents,cleaningCents,unprovidedExperiencesCents,paidModificationCents}=input;
  if(!["refundable","non_refundable"].includes(plan)||
    ![withdrawalDays,fullRefundDaysBeforeCheckIn,lateAccommodationRefundPercent,
      accommodationCents,cleaningCents,unprovidedExperiencesCents,paidModificationCents]
      .every(Number.isSafeInteger)||
    [accommodationCents,cleaningCents,unprovidedExperiencesCents,paidModificationCents].some(x=>x<0)||
    withdrawalDays<7||fullRefundDaysBeforeCheckIn<1||
    lateAccommodationRefundPercent<0||lateAccommodationRefundPercent>100||
    (plan==="non_refundable"&&lateAccommodationRefundPercent!==0))
    throw new Error("invalid_refund_policy");
  const accepted=Date.parse(acceptedAt),requested=Date.parse(requestedAt);
  const arrival=Date.parse(`${checkIn}T15:00:00-03:00`);
  if(!Number.isFinite(accepted)||!Number.isFinite(requested)||!Number.isFinite(arrival)||requested<accepted)
    throw new Error("invalid_refund_dates");
  // A stay already in progress and legal exceptions require a human decision.
  if(requested>=arrival) return {requiresReview:true,reason:"stay_started"} as const;
  const withdrawal=requested<=accepted+withdrawalDays*86400000;
  const fullBeforeArrival=requested<=arrival-fullRefundDaysBeforeCheckIn*86400000;
  const percent=withdrawal||plan==="refundable"&&fullBeforeArrival?100:
    plan==="refundable"?lateAccommodationRefundPercent:0;
  // A paid price increase is part of the accommodation consideration.
  const lodgingCents=accommodationCents+paidModificationCents;
  const lodgingRefundCents=Math.round(lodgingCents*percent/100);
  return {requiresReview:false,reason:withdrawal?"withdrawal_window":
    fullBeforeArrival&&plan==="refundable"?"early_refundable":"late_policy",
    lodgingRefundCents,cleaningRefundCents:cleaningCents,
    experienceRefundCents:unprovidedExperiencesCents,
    totalRefundCents:lodgingRefundCents+cleaningCents+unprovidedExperiencesCents,
    retentionCents:lodgingCents-lodgingRefundCents} as const;
}
