import assert from 'node:assert/strict';
import {test} from 'node:test';
import {calculateCancellationRefund} from '../supabase/functions/booking-engine/refund-policy.ts';

const base={acceptedAt:'2026-09-28T04:00:00Z',checkIn:'2026-12-01',
  withdrawalDays:7,fullRefundDaysBeforeCheckIn:20,lateAccommodationRefundPercent:50,
  accommodationCents:163920,cleaningCents:29200,unprovidedExperiencesCents:100,
  paidModificationCents:0,plan:'refundable'};

test('seven day boundary is inclusive for both plans',()=>{
  for(const plan of ['refundable','non_refundable']){
    const row=calculateCancellationRefund({...base,plan,
      lateAccommodationRefundPercent:plan==='refundable'?50:0,
      requestedAt:'2026-10-05T04:00:00Z'});
    assert.equal(row.totalRefundCents,193220);
  }
});

test('after withdrawal: full early refund, partial late refund, cleaning and unprovided package intact',()=>{
  const early=calculateCancellationRefund({...base,requestedAt:'2026-10-06T04:00:00Z'});
  assert.equal(early.totalRefundCents,193220);
  const late=calculateCancellationRefund({...base,requestedAt:'2026-11-25T04:00:00Z',paidModificationCents:5000});
  assert.equal(late.totalRefundCents,113760);
  assert.equal(late.retentionCents,84460);
});

test('non-refundable after withdrawal returns only cleaning and unprovided experience',()=>{
  const row=calculateCancellationRefund({...base,plan:'non_refundable',lateAccommodationRefundPercent:0,
    accommodationCents:150260,requestedAt:'2026-10-06T04:00:00Z'});
  assert.equal(row.totalRefundCents,29300);
});

test('started stay requires review and cannot produce automatic amount',()=>{
  const row=calculateCancellationRefund({...base,requestedAt:'2026-12-01T18:00:00Z'});
  assert.equal(row.requiresReview,true);
  assert.equal('totalRefundCents' in row,false);
});

test('commercial 24h boundary is inclusive, separate from accepted additional window',()=>{
 for(const plan of ['refundable','non_refundable']){
  const policy={...base,plan,commercialFreeCancellationHours:24,lateAccommodationRefundPercent:plan==='refundable'?50:0};
  const boundary=calculateCancellationRefund({...policy,requestedAt:'2026-09-29T04:00:00Z'});
  assert.equal(boundary.reason,'commercial_free_window');assert.equal(boundary.totalRefundCents,193220);
  assert.equal(calculateCancellationRefund({...policy,requestedAt:'2026-09-29T04:00:00.001Z'}).reason,'withdrawal_window');
 }
});
test('commercial window never rewrites old rules and rejects malformed hours',()=>{
 assert.equal(calculateCancellationRefund({...base,requestedAt:'2026-09-29T04:00:00Z'}).reason,'withdrawal_window');
 for(const hours of [-1,1.5,721,NaN])assert.throws(()=>calculateCancellationRefund({...base,commercialFreeCancellationHours:hours,requestedAt:'2026-09-29T04:00:00Z'}),/invalid_refund_policy/);
});
test('commercial window still sends an already started stay to individual review',()=>{
 assert.equal(calculateCancellationRefund({...base,acceptedAt:'2026-12-01T17:00:00Z',requestedAt:'2026-12-01T18:00:00Z',commercialFreeCancellationHours:24}).requiresReview,true);
});
