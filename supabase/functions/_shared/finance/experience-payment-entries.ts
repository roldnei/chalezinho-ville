// Bind the original payment to the persisted contract items. Refunds reuse these
// immutable entries; no catalogue price or browser amount participates here.
export function experiencePaymentEntries(reservationId:string,paymentId:string,items:any[],expectedCents:number){
  const entries=items.map(item=>{
    const unit=Number(item.unit_price_cents),quantity=Number(item.quantity);
    if(!item.id||!Number.isSafeInteger(unit)||unit<0||!Number.isSafeInteger(quantity)||quantity<1)
      throw new Error("experience_allocation_invalid");
    const amount=unit*quantity;
    if(!Number.isSafeInteger(amount))throw new Error("experience_allocation_invalid");
    return {reservation_id:reservationId,payment_id:paymentId,experience_order_item_id:item.id,
      entry_type:"experience",amount_cents:amount,description:item.product_name_snapshot};
  });
  if(!Number.isSafeInteger(expectedCents)||expectedCents<0||entries.reduce((sum,item)=>sum+item.amount_cents,0)!==expectedCents)
    throw new Error("experience_allocation_invalid");
  return entries;
}
