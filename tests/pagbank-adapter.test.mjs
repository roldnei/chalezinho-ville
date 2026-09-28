import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import { changePagBankCharge, createPagBankOrder, evaluateRefundPrecheck, getPagBankCharge, getPagBankOrderCharge, pagBankOrder, verifyPagBankNotification, verifyPagBankSignedNotification } from '../supabase/functions/booking-engine/pagbank.ts';

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

test('one and six installments charge the same booking total without a buyer fee',()=>{
  for(const installments of [1,6]){
    const order=pagBankOrder({...input,method:'card',encryptedCard:'encrypted-only',installments});
    assert.equal(order.charges[0].amount.value,input.amountCents);
    assert.equal(order.items[0].unit_amount,input.amountCents);
    assert.equal(order.charges[0].payment_method.installments,installments);
  }
});

test('damage authorization is requested without immediate capture',()=>{
  const order=pagBankOrder({...input,method:'card',encryptedCard:'encrypted-only',installments:1,preAuthorize:true});
  assert.equal(order.charges[0].payment_method.capture,false);
  assert.equal(order.charges[0].amount.value,input.amountCents);
});

test('partial refund and capture preserve amount, sandbox URL and idempotency key',async()=>{
  const calls=[];
  const fetcher=async(url,options)=>{
    calls.push({url,options});
    return new Response(JSON.stringify({id:'CHAR_test',status:'CANCELED',amount:{currency:'BRL',value:2500}}),{status:201});
  };
  for(const op of ['cancel','capture'])
    assert.equal((await changePagBankCharge('sandbox-token','CHAR_test',op,2500,'refund-attempt-0001',fetcher)).chargeId,'CHAR_test');
  assert.equal(calls[0].url,'https://sandbox.api.pagseguro.com/charges/CHAR_test/cancel');
  assert.equal(calls[1].url,'https://sandbox.api.pagseguro.com/charges/CHAR_test/capture');
  for(const call of calls){
    assert.deepEqual(JSON.parse(call.options.body),{amount:{value:2500}});
    assert.equal(call.options.headers['x-idempotency-key'],'refund-attempt-0001');
    assert.equal(call.options.headers.Authorization,'Bearer sandbox-token');
    assert.equal(call.options.headers.Accept,undefined);
  }
});

test('uncertain refund response cannot confirm a refund',async()=>{
  const fetcher=async()=>new Response('{"status":"CANCELED"}',{status:201});
  await assert.rejects(changePagBankCharge('token','CHAR_test','cancel',100,'refund-attempt-0002',fetcher),/uncertain/);
  await assert.rejects(changePagBankCharge('token','CHAR_test','cancel',0,'refund-attempt-0003',fetcher),/invalid/);
});

test('cancel response keeps only charge receipt and cumulative refund amount',async()=>{
  const result=await changePagBankCharge('token','CHAR_test','cancel',100,
    'refund-attempt-0004',async()=>new Response(JSON.stringify({
      id:'CHAR_test',status:'PAID',amount:{value:2500,currency:'BRL'},
      summary:{paid:2500,refunded:100},payment_method:{card:{number:'sensitive-test-value'}}
    }),{status:201}));
  assert.deepEqual(result,{chargeId:'CHAR_test',status:'PAID',amountCents:2500,
    summary:{paid:2500,refunded:100}});
  assert.equal(JSON.stringify(result).includes('sensitive-test-value'),false);
});

test('direct charge consultation omits unsupported Accept header and retains refund summary',async()=>{
  const charge={id:'CHAR_test',status:'PAID',amount:{value:2500,currency:'BRL'},summary:{paid:2500,refunded:0}};
  const fetcher=async(_url,options)=>{
    assert.equal(options.headers.Accept,undefined);
    return new Response(JSON.stringify(charge),{status:200});
  };
  assert.deepEqual((await getPagBankCharge('sandbox-token','CHAR_test',fetcher)).summary,charge.summary);
});

test('first refund may be requested without summary but cannot be confirmed from PAID alone',()=>{
  const charge={id:'CHAR_test',status:'PAID',amount:{value:2500,currency:'BRL'}};
  const input={chargeId:'CHAR_test',capturedCents:2500,requestedCents:100,
    confirmedCents:0,otherOpenRefund:false};
  assert.deepEqual(evaluateRefundPrecheck(charge,input),{ready:true,mode:'provider_limit'});
  assert.equal(evaluateRefundPrecheck(charge,{...input,confirmedCents:100}).ready,false);
  assert.equal(evaluateRefundPrecheck(charge,{...input,otherOpenRefund:true}).ready,false);
  assert.equal(evaluateRefundPrecheck(charge,{...input,requestedCents:2501}).ready,false);
  assert.deepEqual(evaluateRefundPrecheck({...charge,summary:{paid:2500,refunded:100}},
    {...input,confirmedCents:100}),{ready:true,mode:'provider_summary'});
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
