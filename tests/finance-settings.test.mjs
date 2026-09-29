import {test} from 'node:test';
import assert from 'node:assert/strict';
import {paymentTerms,assertPaymentMethod,validatePaymentSettings} from '../supabase/functions/_shared/finance/settings.ts';
const settings={active_provider:'pagbank_sandbox',pix_enabled:true,card_enabled:false,pix_expiration_minutes:15,post_booking_payment_minutes:30,modification_payment_deadline_hours:24};
test('method disabled administratively cannot create payment even if browser sends it',()=>{
 assert.doesNotThrow(()=>assertPaymentMethod(settings,'pix'));
 assert.throws(()=>assertPaymentMethod(settings,'card'),/disabled/);
 assert.throws(()=>assertPaymentMethod({...settings,active_provider:'mock'},'pix'),/provider/);
});
test('settings reject fractions and invalid provider instead of silently coercing money rules',()=>{
 assert.equal(validatePaymentSettings(settings).pix_expiration_minutes,15);
 for(const overrides of [{pix_expiration_minutes:0},{modification_payment_deadline_hours:1.5},{active_provider:'production'},{card_enabled:'true'}])assert.throws(()=>validatePaymentSettings({...settings,...overrides}));
});
test('installment policy comes from property configuration with explicit interest payer',()=>{
 assert.throws(()=>paymentTerms({}),/invalid/);
 assert.equal(paymentTerms({payment_terms:{max_installments:12,no_interest_installments:6,interest_payer:'merchant'}}).interest_payer,'merchant');
 assert.equal(paymentTerms({payment_terms:{max_installments:8,no_interest_installments:4,interest_payer:'guest'}}).max_installments,8);
});
