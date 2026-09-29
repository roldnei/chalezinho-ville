export function paymentTerms(features:any){
 const value=features?.payment_terms;
 if(!value)throw new Error('invalid_payment_terms');
 const max=Number(value.max_installments),free=Number(value.no_interest_installments),payer=value.interest_payer;
 if(!Number.isInteger(max)||max<1||max>12||!Number.isInteger(free)||free<0||free>max||free===1||
    !['merchant','guest'].includes(payer))throw new Error('invalid_payment_terms');
 return {max_installments:max,no_interest_installments:free,interest_payer:payer};
}
export function assertPaymentMethod(settings:any,method:string){
 if(settings?.active_provider!=='pagbank_sandbox')throw new Error('payment_provider_not_ready');
 if(!['pix','card'].includes(method)||settings[method+'_enabled']!==true)throw new Error('payment_method_disabled');
}
export function validatePaymentSettings(input:any){
 if(!['disabled','pagbank_sandbox'].includes(input.active_provider)||typeof input.pix_enabled!=='boolean'||typeof input.card_enabled!=='boolean')throw new Error('invalid_payment_settings');
 const bounds={pix_expiration_minutes:[1,1440],post_booking_payment_minutes:[5,1440],modification_payment_deadline_hours:[1,168]};
 const result:any={active_provider:input.active_provider,pix_enabled:input.pix_enabled,card_enabled:input.card_enabled};
 for(const [key,[min,max]] of Object.entries(bounds)){
  const value=input[key];if(!Number.isSafeInteger(value)||value<min||value>max)throw new Error('invalid_payment_settings');result[key]=value;
 }
 return result;
}
