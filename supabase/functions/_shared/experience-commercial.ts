type Pricing = {cash_cents:number;card_cents:number;max_installments:number};
export function commercialPricing(input:any):Pricing|null {
 if(input==null)return null;
 const value={cash_cents:Number(input.cash_cents),card_cents:Number(input.card_cents),max_installments:Number(input.max_installments)};
 if(!Object.values(value).every(Number.isSafeInteger)||value.cash_cents<=0||value.card_cents<value.cash_cents||value.max_installments<1||value.max_installments>12)throw Error('invalid_commercial_pricing');
 return value;
}
export function experienceCommercial(product:any,preferences:any={}) {
 const pricing=commercialPricing(product.details?.commercial_pricing);if(!pricing)return null;
 const code=preferences._commercial_condition;
 if(code!=='cash'&&code!=='card')throw Error('commercial_condition_required');
 return {code,label:code==='cash'?'À vista':`Cartão · até ${pricing.max_installments}x sem juros`,price_cents:code==='cash'?pricing.cash_cents:pricing.card_cents,max_installments:code==='card'?pricing.max_installments:1,consultation_only:true};
}
