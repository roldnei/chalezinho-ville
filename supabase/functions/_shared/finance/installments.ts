import {money} from './model.ts';
export function selectInstallmentOffer(offer:any,input:{userId:string;quoteOptionId?:string;chargeId?:string;baseAmount:number;installments:number;cardBin?:string;now?:number}) {
 if(!offer||offer.user_id!==input.userId||offer.provider!=='pagbank_sandbox'||
    offer.quote_option_id!==(input.quoteOptionId||null)||offer.post_booking_charge_id!==(input.chargeId||null)||
    money(offer.base_amount_cents)!==money(input.baseAmount)||
    !Number.isFinite(Date.parse(offer.expires_at))||Date.parse(offer.expires_at)<=(input.now??Date.now()))
   throw new Error('installment_offer_invalid_or_expired');
 const plan=offer.plans.find((p:any)=>p.installments===input.installments);
 if(input.cardBin!==undefined&&(!/^\d{6}(\d{2})?$/.test(input.cardBin)||offer.terms?.card_bin!==input.cardBin))
   throw new Error('installment_card_changed');
 if(!plan||money(plan.total_cents)!==input.baseAmount+money(plan.buyer_interest_cents))throw new Error('installment_unavailable');
 return plan;
}
export async function loadInstallmentOffer(admin:any,id:string,input:Parameters<typeof selectInstallmentOffer>[1]) {
 const {data,error}=await admin.from('installment_offers').select('*').eq('id',id).eq('user_id',input.userId).maybeSingle();
 if(error)throw new Error('installment_offer_unavailable');
 return selectInstallmentOffer(data,input);
}
