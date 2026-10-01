import {test} from 'node:test';
import assert from 'node:assert/strict';
import {money,paymentState,guaranteeState,confirmedCapture,confirmedRefund,projectFinance} from '../supabase/functions/_shared/finance/model.ts';
import {selectInstallmentOffer} from '../supabase/functions/_shared/finance/installments.ts';
import {paymentGateway} from '../supabase/functions/_shared/finance/gateway.ts';
import {assertFinanceDevelopment} from '../supabase/functions/_shared/finance/environment.ts';

test('development build cannot target the shared database or enable production',()=>{
 assert.throws(()=>assertFinanceDevelopment('https://irxsaladqhbzhkoaclxy.supabase.co','development'));
 assert.throws(()=>assertFinanceDevelopment('https://isolated.supabase.co','production'));
 assert.throws(()=>assertFinanceDevelopment('https://isolated.supabase.co',undefined));
 assert.doesNotThrow(()=>assertFinanceDevelopment('http://127.0.0.1:54321','development'));
});

test('money rejects negative, fractional, unsafe or coerced values',()=>{
 for(const v of [-1,1.5,Number.MAX_SAFE_INTEGER+1,null,true,{},'1.1'])assert.throws(()=>money(v));
 assert.equal(money('18900'),18900);
});
for(const [provider,expected] of [['WAITING','awaiting_payment'],['PAID','paid'],['DECLINED','failed'],['IN_ANALYSIS','processing'],['AUTHORIZED','authorized'],['expired','expired']])
 test(`canonical state ${provider}`,()=>assert.equal(paymentState(provider,provider==='PAID'?100:0,0),expected));
test('partial and full refunds derive from confirmed money',()=>{
 assert.equal(paymentState('paid',10000,1000),'partially_refunded');
 assert.equal(paymentState('paid',10000,10000),'refunded');
 assert.throws(()=>paymentState('paid',10000,10001));
});
test('declined guarantee is not an authorization merely because a charge ID exists',()=>{
 const g=guaranteeState({amount_cents:50000,status:'pending',provider_authorization_id:'CHAR_DECLINED'});
 assert.equal(g.authorized_cents,0);assert.equal(g.required_cents,50000);assert.equal(g.available_cents,0);
});
test('capture availability requires an identified authorization and the server expiry margin',()=>{
 const g={amount_cents:50000,status:'guaranteed',provider_authorization_id:'CHAR_VALID'};
 for(const expiry of [undefined,null,'invalid']){
  const state=guaranteeState({...g,provider_capture_before:expiry});
  assert.equal(state.available_cents,0);assert.equal(state.status,'processing');
 }
 const future=new Date(Date.now()+7200000).toISOString();
 assert.equal(guaranteeState({...g,provider_capture_before:future}).available_cents,50000);
 assert.equal(guaranteeState({...g,provider_authorization_id:null,provider_capture_before:future}).available_cents,0);
 assert.equal(guaranteeState({...g,provider_capture_before:new Date(Date.now()+1800000).toISOString()}).available_cents,0);
 const expired=guaranteeState({...g,provider_capture_before:new Date(Date.now()-1000).toISOString()});
 assert.equal(expired.available_cents,0);assert.equal(expired.status,'expired');
 assert.equal(expired.released_cents,0,'expiry alone does not prove the bank released the limit');
});

test('damage refund never exceeds capture and changes the canonical state',()=>{
 const g={amount_cents:50000,captured_amount_cents:18000,status:'captured',provider_authorization_id:'CHAR_TEST'};
 assert.equal(guaranteeState({...g,refunded_amount_cents:3000}).status,'partially_refunded');
 assert.equal(guaranteeState({...g,refunded_amount_cents:18000}).status,'refunded');
 assert.throws(()=>guaranteeState({...g,refunded_amount_cents:18001}),/refund_exceeds/);
});
test('500 authorized and 189 paid is partial capture; unreconciled remainder is never labeled released',()=>{
 const g=guaranteeState({amount_cents:50000,captured_amount_cents:18900,status:'captured',provider_authorization_id:'CHAR_X'});
 assert.equal(g.status,'partially_captured');assert.equal(g.captured_cents,18900);assert.equal(g.uncaptured_cents,31100);assert.equal(g.available_cents,0);assert.equal(g.released_cents,0);
});
test('capture verifies paid summary when original authorization value is retained',()=>{
 const c={status:'PAID',amount:{currency:'BRL',value:50000},summary:{paid:18900,refunded:0}};
 assert.equal(confirmedCapture(c,50000,18900),true);
 assert.equal(confirmedCapture({...c,summary:{paid:50000}},50000,18900),false);
 assert.equal(confirmedCapture({...c,summary:undefined},50000,18900),false);
});
test('refund requested or cancelled status alone is never refund confirmation',()=>{
 assert.equal(confirmedRefund({status:'CANCELED',amount:{currency:'BRL'}},29000,29000),false);
 assert.equal(confirmedRefund({status:'PAID',amount:{currency:'BRL'},summary:{paid:29000,refunded:10000}},29000,10000),true);
});
const offer={user_id:'guest',provider:'pagbank_sandbox',quote_option_id:'option',post_booking_charge_id:null,base_amount_cents:100000,
 expires_at:'2099-01-01',plans:[{installments:7,total_cents:106000,buyer_interest_cents:6000}]};
test('installment total before card is same immutable total selected for charging',()=>{
 const p=selectInstallmentOffer(offer,{userId:'guest',quoteOptionId:'option',baseAmount:100000,installments:7});assert.equal(p.total_cents,106000);
});
test('offer prevents cross-account, cross-reservation, repricing and expiry',()=>{
 const input={userId:'guest',quoteOptionId:'option',baseAmount:100000,installments:7};
 for(const override of [{userId:'other'},{quoteOptionId:'other'},{baseAmount:1},{now:Date.parse('2100-01-01')},{installments:12}])assert.throws(()=>selectInstallmentOffer(offer,{...input,...override}));
});
test('confirmed installment offer cannot be reused after changing the card BIN',()=>{
 const input={userId:'guest',quoteOptionId:'option',baseAmount:100000,installments:7,cardBin:'552100'};
 const actual={...offer,terms:{card_bin:'552100'}};
 assert.equal(selectInstallmentOffer(actual,input).total_cents,106000);
 assert.throws(()=>selectInstallmentOffer(actual,{...input,cardBin:'411111'}),/card_changed/);
 assert.throws(()=>selectInstallmentOffer(offer,input),/card_changed/);
});
test('gateway selection cannot activate production from a browser parameter',()=>assert.throws(()=>paymentGateway('production','test')));
test('gateway partial refund preserves exact request amount and operation id',async()=>{
 let sent;
 const gateway=paymentGateway('pagbank_sandbox','test',async(url,options)=>{
  sent={url,options};return new Response(JSON.stringify({id:'CHAR_TEST',status:'CANCELED',amount:{value:50000,currency:'BRL',summary:{total:50000,paid:29000,refunded:18900}}}));
 });
 const r=await gateway.refund('CHAR_TEST',18900,'refund-unique-identifier');
 assert.equal(JSON.parse(sent.options.body).amount.value,18900);assert.match(sent.url,/sandbox/);assert.equal(r.summary.refunded,18900);
});
test('projection replays repeated payment snapshots without doubling paid revenue',()=>{
 const events=[1,2].map(sequence=>({sequence,source:'payments',entity_id:'p',payload:{id:'p',status:'paid',amount_cents:10000}}));
 assert.equal(projectFinance(events).paid_cents,10000);
});
test('ledger reconstructs additional debt, settled change, approved credit and damage without counting authorization as cash',()=>{
 const events=[];let sequence=0;
 const add=(source,id,payload)=>events.push({sequence:++sequence,source,entity_id:id,payload:{id,...payload}});
 add('reservations','r',{status:'confirmed',total_amount:2149});
 add('payments','p1',{status:'paid',amount_cents:214900});
 add('guarantees','g',{status:'guaranteed',amount_cents:50000,provider_authorization_id:'CHAR_G'});
 assert.equal(projectFinance(events).balance_due_cents,0);assert.equal(projectFinance(events).total_net_received_cents,214900);
 add('post_booking_charges','c',{status:'awaiting_payment',amount_cents:18000});
 assert.equal(projectFinance(events).balance_due_cents,18000);
 add('post_booking_charges','c',{status:'applied',amount_cents:18000});
 add('reservations','r',{status:'confirmed',total_amount:2329});
 add('payments','p2',{status:'paid',amount_cents:18000});
 assert.equal(projectFinance(events).balance_due_cents,0);
 add('reservation_cancellations','credit',{status:'pending_provider',approved_at:'2026-09-29',refund_due_cents:49900});
 assert.equal(projectFinance(events).credit_balance_cents,49900);
 add('reservation_refunds','refund',{payment_id:'p1',state:'confirmed',requested_cents:49900,confirmed_cents:49900});
 assert.equal(projectFinance(events).credit_balance_cents,0);
 add('incidents','incident',{decision:'approved',requested_capture_cents:18900});
 assert.equal(projectFinance(events).balance_due_cents,18900);
 add('guarantees','g',{status:'captured',amount_cents:50000,captured_amount_cents:18900,provider_authorization_id:'CHAR_G'});
 assert.equal(projectFinance(events).balance_due_cents,0);
 assert.equal(projectFinance(events).total_net_received_cents,201900);
});
test('expired unpaid reservation does not remain collectible in the financial balance',()=>{
 const events=[{sequence:1,source:'reservations',entity_id:'r',payload:{id:'r',status:'not_confirmed',total_amount:1500}}];
 assert.equal(projectFinance(events).balance_due_cents,0);
});
