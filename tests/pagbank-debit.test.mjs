import test from 'node:test';
import assert from 'node:assert/strict';
import {createPagBankSandbox3DSSession, pagBankOrder} from '../supabase/functions/booking-engine/pagbank.ts';
import {paymentGateway} from '../supabase/functions/_shared/finance/gateway.ts';
import {debitDevProject, debitPreviewOrigin, debitQuoteEligible, debitOrderEvidence, isDebitPreview} from '../supabase/functions/booking-engine/debit.ts';

const paymentId = '2ca148bb-5f5a-4707-883a-bf880b90226e';
const reference = paymentId.replaceAll('-', '');
const orderId = 'ORDE_fixture';
const option = {total_amount_cents: 2701, accommodation_amount_cents: 2600, cleaning_fee_cents: 101,
  contract_snapshot: {experiences: []}, quotes: {pricing_snapshot: {}}};
const property = {guarantee_amount_cents: 0};
const input = {
  referenceId: reference, amountCents: 2701,
  customer: {name: 'Hóspede Sintético', email: 'guest@example.com', taxId: '12345678909',
    phone: {area: '27', number: '999999999'}},
  method: 'debit', encryptedCard: 'encrypted-card-fixture-for-order',
  authenticationId: '3DS_15CB7893-4D23-44FA-97B7-AC1BE516D418', installments: 1,
  notificationUrl: 'https://example.com/webhook',
};

test('debit is isolated to the exact Supabase DEV preview route and lodging without a guarantee', () => {
  const endpoint = debitDevProject + '/functions/v1/booking-engine-debito';
  assert.equal(isDebitPreview(debitDevProject, endpoint, debitPreviewOrigin), true);
  assert.equal(isDebitPreview('https://irxsaladqhbzhkoaclxy.supabase.co', endpoint, debitPreviewOrigin), false);
  assert.equal(isDebitPreview(debitDevProject, endpoint.replace(/-debito$/, ''), debitPreviewOrigin), false);
  assert.equal(isDebitPreview(debitDevProject, endpoint, 'https://example.com'), false);
  assert.equal(debitQuoteEligible(option, property), true);
  assert.equal(debitQuoteEligible(option, {guarantee_amount_cents: 50000}), false);
  assert.equal(debitQuoteEligible({...option, contract_snapshot: {offer_id: 'package'}}, property), false);
  assert.equal(debitQuoteEligible({...option, contract_snapshot: {experiences: [{}]}}, property), false);
  assert.equal(debitQuoteEligible({...option, total_amount_cents: 2702}, property), false);
});

test('SDK session is obtained server-side with the Sandbox merchant credential', async () => {
  const session = await createPagBankSandbox3DSSession('test-credential', async (url, request) => {
    assert.equal(url, 'https://sandbox.sdk.pagseguro.com/checkout-sdk/sessions');
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.Authorization, 'Bearer test-credential');
    return Response.json({session: 'sdk-session'}, {status: 201});
  });
  assert.equal(session, 'sdk-session');
});

test('debit requires the 3DS id and encrypted card, with immediate capture in one installment', () => {
  const method = pagBankOrder(input).charges[0].payment_method;
  assert.equal(method.type, 'DEBIT_CARD');
  assert.equal(method.installments, 1);
  assert.equal(method.capture, true);
  assert.deepEqual(method.authentication_method, {type: 'THREEDS', id: input.authenticationId});
  assert.equal(method.card.encrypted, input.encryptedCard);
  assert.equal(method.card.store, false);
  for (const patch of [{authenticationId: ''}, {encryptedCard: ''}, {installments: 2}, {storeCard: true}, {preAuthorize: true}]) {
    assert.throws(() => pagBankOrder({...input, ...patch}), /invalid_debit_data/);
  }
});

test('debit uses a stable provider idempotency key for retries of the same payment', async () => {
  const orders = new Map();
  const gateway = paymentGateway('pagbank_sandbox', 'test-token', async (url, request) => {
    assert.equal(url, 'https://sandbox.api.pagseguro.com/orders');
    const key = request.headers['x-idempotency-key'];
    assert.equal(key, reference);
    if (!orders.has(key)) orders.set(key, {id: orderId,
      charges: [{id: 'CHAR_fixture', status: 'PAID', amount: {value: 2701, currency: 'BRL'}}]});
    return Response.json(orders.get(key), {status: 201});
  });
  const first = await gateway.createDebitPayment(input);
  const duplicate = await gateway.createDebitPayment(input);
  assert.equal(orders.size, 1);
  assert.equal(first.chargeId, duplicate.chargeId);
});

test('Order GET must match both references, the charged amount, and successful 3DS before confirmation', () => {
  const charge = {orderId, orderReferenceId: reference, referenceId: reference,
    paymentType: 'DEBIT_CARD', authenticationStatus: 'AUTHENTICATED',
    amount: {value: 2701, currency: 'BRL'}, summary: {paid: 2701, refunded: 0}, status: 'PAID', httpStatus: 200};
  assert.equal(debitOrderEvidence(charge, paymentId, orderId, 2701).status, 'PAID');
  assert.equal(debitOrderEvidence({...charge, status: 'DECLINED', summary: undefined}, paymentId, orderId, 2701).status, 'DECLINED');
  for (const patch of [{orderId: 'ORDE_other'}, {referenceId: 'unrelated'}, {paymentType: 'CREDIT_CARD'},
    {amount: {value: 2700, currency: 'BRL'}}, {authenticationStatus: 'NOT_AUTHENTICATED'},
    {summary: {paid: 2600, refunded: 0}}, {summary: {paid: 2701, refunded: 2701}}]) {
    assert.throws(() => debitOrderEvidence({...charge, ...patch}, paymentId, orderId, 2701), /pagbank_debit_order_mismatch/);
  }
});
