import {test} from 'node:test';
import assert from 'node:assert/strict';
import {commercialPricing,experienceCommercial,offerExperiencePreferences} from '../supabase/functions/_shared/experience-commercial.ts';
import {priceStayOffer} from '../supabase/functions/_shared/stay-offers.ts';
test('commercial prices come only from the server catalog; a condition is required',()=>{
 for(const [cash,card] of [[49900,54900],[53900,56900]]){
  const p={details:{commercial_pricing:{cash_cents:cash,card_cents:card,max_installments:4}}};
  assert.throws(()=>experienceCommercial(p),/commercial_condition_required/);
  assert.throws(()=>experienceCommercial(p,{_commercial_condition:'anything'}),/commercial_condition_required/);
  assert.equal(experienceCommercial(p,{_commercial_condition:'cash',price_cents:1}).price_cents,cash);
  const chosen=experienceCommercial(p,{_commercial_condition:'card',max_installments:12});
  assert.equal(chosen.price_cents,card);assert.equal(chosen.max_installments,4);assert.equal(chosen.consultation_only,true);
  assert.equal(priceStayOffer([{key:'stay',gross_cents:100000,included:false},{key:'experience',gross_cents:chosen.price_cents,included:false}]).total_cents,100000+card);
 }
 assert.equal(experienceCommercial({details:{}}),null);
});
test('invalid commercial setup cannot be saved or priced',()=>{
 for(const value of [{cash_cents:0,card_cents:54900,max_installments:4},{cash_cents:49900,card_cents:1,max_installments:4},{cash_cents:49900,card_cents:54900,max_installments:13}])assert.throws(()=>commercialPricing(value),/invalid_commercial_pricing/);
});

test('named escape fixes cash/card server condition and refuses browser substitution',()=>{
 const p={id:'ultra',details:{commercial_pricing:{cash_cents:53900,card_cents:56900,max_installments:4}}};
 for(const code of ['cash','card']){
  const offer={product_ids:['ultra'],showcase:{commercial_condition:code}};
  const prefs=offerExperiencePreferences(offer,p,{Bebida:'Vinho',price_cents:1});
  assert.equal(prefs.Bebida,'Vinho');assert.equal(experienceCommercial(p,prefs).price_cents,code==='cash'?53900:56900);
  assert.throws(()=>offerExperiencePreferences(offer,p,{_commercial_condition:code==='cash'?'card':'cash'}),/commercial_condition_mismatch/);
 }
});
