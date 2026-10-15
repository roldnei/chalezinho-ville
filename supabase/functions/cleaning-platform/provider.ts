// Dedicated cleaning credentials and ledger. Never imports lodging payment code.
const bases={sandbox:'https://sandbox.api.pagseguro.com',production:'https://api.pagseguro.com'};
export function providerBase(env:string){if(!(env in bases))throw Error('invalid_provider_environment');return bases[env as keyof typeof bases];}
export function cleaningPixOrder(pay:any,customer:any,platform:string,webhook:string){
 if(!/^ACCO_[a-zA-Z0-9-]+$/.test(platform)||!/^ACCO_[a-zA-Z0-9-]+$/.test(pay.receiver_id)||platform===pay.receiver_id||!/^https:\/\//.test(webhook))throw Error('invalid_receiver');
 if(!Number.isSafeInteger(pay.amount_cents)||pay.amount_cents<1||pay.net_cents<0||pay.platform_cents<0||pay.net_cents+pay.platform_cents!==pay.amount_cents)throw Error('invalid_split');
 if(!customer?.name||!/^\S+@\S+\.\S+$/.test(customer.email)||!/^\d{11,14}$/.test(customer.tax_id)||!/^\d{10,11}$/.test(customer.phone))throw Error('payer_details_required');
 if(Date.parse(pay.expires_at)<=Date.now()||!Number.isFinite(Date.parse(pay.custody_until)))throw Error('invalid_expiry');
 const receiver=(id:string,value:number,reason:string)=>({account:{id},amount:{value},reason,configurations:{custody:{apply:true,release:{scheduled:pay.custody_until}}}});
 return {reference_id:pay.reference_id,customer:{name:customer.name,email:customer.email,tax_id:customer.tax_id,phones:[{country:'55',area:customer.phone.slice(0,2),number:customer.phone.slice(2),type:'MOBILE'}]},items:[{reference_id:pay.reference_id,name:'Serviço de limpeza',quantity:1,unit_amount:pay.amount_cents}],charges:[{reference_id:pay.reference_id,description:'Serviço de limpeza',amount:{value:pay.amount_cents,currency:'BRL'},payment_method:{type:'PIX',pix:{expiration_date:pay.expires_at}},splits:{method:'FIXED',receivers:[receiver(platform,pay.platform_cents,'Taxas da plataforma'),receiver(pay.receiver_id,pay.net_cents,'Serviço de limpeza')]}}],notification_urls:[webhook]};
}
export function orderObservation(order:any,pay:any,now=Date.now()){
 const ch=order?.charges?.[0];
 if(!/^ORDE_[a-zA-Z0-9-]+$/.test(order?.id)||order.reference_id!==pay.reference_id||order.charges?.length!==1||!/^CHAR_[a-zA-Z0-9-]+$/.test(ch?.id)||ch.reference_id!==pay.reference_id||ch.payment_method?.type!=='PIX'||ch.amount?.currency!=='BRL'||ch.amount?.value!==pay.amount_cents||pay.order_id&&order.id!==pay.order_id||pay.charge_id&&ch.id!==pay.charge_id)throw Error('provider_identity_mismatch');
 const receivers=ch.splits?.receivers;
 if(!Array.isArray(receivers)||!receivers.some((r:any)=>r.account?.id===pay.receiver_id&&r.amount?.value===pay.net_cents&&r.configurations?.custody?.apply===true))throw Error('custody_not_confirmed');
 let status:string;
 if(ch.status==='CANCELED'&&ch.amount?.summary?.refunded===pay.amount_cents)status='refunded';
 else if(ch.status==='PAID'&&ch.amount?.summary?.paid===pay.amount_cents&&!(ch.amount?.summary?.refunded>0))status='paid';
 else if(['WAITING','DECLINED'].includes(ch.status)&&!(ch.amount?.summary?.paid>0))status=now>=Date.parse(pay.expires_at)||ch.status==='DECLINED'?'expired':'pending';
 else throw Error('provider_reconciliation_required');
 return {status,order_id:order.id,charge_id:ch.id,reference_id:pay.reference_id,amount_cents:pay.amount_cents,split_id:ch.splits?.id,qr_text:ch.qr_code?.text,event_key:ch.id+':'+status+':'+(ch.amount?.summary?.refunded||0)};
}
export async function providerRequest(pay:any,token:string,path:string,method='GET',body?:any){
 if(!token||!/^\/(orders|charges|splits)\/[a-zA-Z0-9_/-]+$/.test(path)&&path!=='/orders')throw Error('financial_dependency_unavailable');
 const r=await fetch(providerBase(pay.environment)+path,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json','x-idempotency-key':'cleaning-'+pay.id+(path.endsWith('/cancel')?'-refund':path.endsWith('/release')?'-release':''),'x-api-version':'1.0'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('provider_request_failed');if(r.status===204||path.endsWith('/release'))return null;return await r.json();
}
export async function validOrderWebhook(raw:string,signature:string,token:string){
 if(!token||!/^\w{64}$/.test(signature))return false;
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token+'-'+raw)))).map(x=>x.toString(16).padStart(2,'0')).join('');
 let different=0;for(let i=0;i<64;i++)different|=digest.charCodeAt(i)^signature.toLowerCase().charCodeAt(i);return different===0;
}
