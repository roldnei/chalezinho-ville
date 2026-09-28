import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import { createPagBankOrder, getPagBankOrderCharge, pagBankOrder, verifyPagBankNotification, verifyPagBankSignedNotification } from '../supabase/functions/booking-engine/pagbank.ts';

const customer={name:'Hospede Teste',email:'teste@example.com',taxId:'12345678909',phone:{area:'27',number:'999999999'}};
const input={referenceId:'1234567890abcdef',amountCents:199250,customer,
  notificationUrl:'https://example.com/functions/v1/pagbank-webhook'};

test('Pix uses exact server amount and 15 minute expiration',()=>{
  const expiry=new Date(Date.now()+15*60000);
  const order=pagBankOrder({...input,method:'pix',expiresAt:expiry});
  assert.equal(order.items[0].unit_amount,199250);
  assert.equal(order.charges[0].amount.value,199250);
  assert.equal(order.charges[0].payment_method.pix.expiration_date,expiry.toISOString());
});

test('card sends encrypted payload, no raw card number, and captures 100 percent',()=>{
  const order=pagBankOrder({...input,method:'card',encryptedCard:'encrypted-only',installments:2});
  assert.equal(order.charges[0].payment_method.capture,true);
  assert.equal(order.charges[0].payment_method.card.encrypted,'encrypted-only');
  assert.equal(order.charges[0].payment_method.installments,2);
  assert.equal(JSON.stringify(order).includes('4242424242424242'),false);
});

test('invalid amounts and expired Pix cannot produce an order',()=>{
  assert.throws(()=>pagBankOrder({...input,amountCents:0,method:'pix',expiresAt:new Date(Date.now()+900000)}));
  assert.throws(()=>pagBankOrder({...input,method:'pix',expiresAt:new Date(Date.now()-1000)}));
});

test('provider request carries the bearer token and stable idempotency key',async()=>{
  let captured;
  const fetcher=async(url,options)=>{
    captured={url,options};
    return new Response(JSON.stringify({id:'ORDE_test',charges:[{id:'CHAR_test',status:'WAITING',amount:{value:input.amountCents,currency:'BRL'},qr_code:{text:'pix-test'}}]}),{status:201});
  };
  const order=pagBankOrder({...input,method:'pix',expiresAt:new Date(Date.now()+900000)});
  const result=await createPagBankOrder('sandbox','test-token',order,fetcher);
  assert.equal(result.pixCode,'pix-test');
  assert.equal(captured.url,'https://sandbox.api.pagseguro.com/orders');
  assert.equal(captured.options.headers['x-idempotency-key'],input.referenceId);
  assert.equal(captured.options.headers.Authorization,'Bearer test-token');
});

test('webhook rejects modified payload or signature',async()=>{
  const token='test-token',raw='{"id":"CHAR_1","status":"PAID"}';
  const signature=createHash('sha256').update(token+'-'+raw).digest('hex');
  assert.equal(await verifyPagBankNotification(token,raw,signature),true);
  assert.equal(await verifyPagBankNotification(token,raw+' ',signature),false);
  assert.equal(await verifyPagBankNotification(token,raw,'bad'),false);
});

test('order lookup requires the exact charge',async()=>{
  const fetcher=async()=>new Response(JSON.stringify({charges:[{id:'CHAR_test',status:'PAID',amount:{value:100,currency:'BRL'}}]}));
  assert.equal((await getPagBankOrderCharge('token','ORDE_test','CHAR_test',fetcher)).status,'PAID');
  await assert.rejects(getPagBankOrderCharge('token','ORDE_test','CHAR_other',fetcher));
});

test('new webhook signature accepts only matching ECDSA payload',async()=>{
  const {publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  const public_key=publicKey.export({type:'spki',format:'der'}).toString('base64');
  const fetcher=async()=>new Response(JSON.stringify({public_key}));
  const raw='{"id":"CHAR_test","status":"PAID"}';
  const signature=sign('sha256',Buffer.from(raw),privateKey).toString('base64');
  assert.equal(await verifyPagBankSignedNotification('token',raw,signature,fetcher),true);
  assert.equal(await verifyPagBankSignedNotification('token',raw+' ',signature,fetcher),false);
});
