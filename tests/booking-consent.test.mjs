import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bookingDocuments,assertBookingConsent} from '../supabase/functions/_shared/booking-consent.ts';
const docs=['hosting_terms','property_rules','privacy_policy'].map((document_type,i)=>({id:'doc'+i,document_type,version:'1',status:'active'}));
const accepted={terms_consent:true,accepted_document_ids:['cancel',...docs.map(d=>d.id)],guarantee_card_consent:true,guarantee_renewal_consent:true,guarantee_consent_version:'guarantee-v2'};
test('reservation requires every explicit guarantee consent; truthy strings do not count',()=>{
 for(const k of ['guarantee_card_consent','guarantee_renewal_consent'])for(const value of [false,undefined,'true',1])assert.throws(()=>assertBookingConsent({...accepted,[k]:value},true,docs,'cancel'),/guarantee_consent_required/);
 assert.throws(()=>assertBookingConsent({...accepted,guarantee_consent_version:'guarantee-v1'},true,docs,'cancel'),/guarantee_consent_required/);
 assert.doesNotThrow(()=>assertBookingConsent(accepted,true,docs,'cancel'));
});
test('terms, cancellation and each document version are mandatory before payment',()=>{
 for(const id of accepted.accepted_document_ids)assert.throws(()=>assertBookingConsent({...accepted,accepted_document_ids:accepted.accepted_document_ids.filter(d=>d!==id)},true,docs,'cancel'),/policy_acceptance_required/);
 assert.throws(()=>assertBookingConsent({...accepted,terms_consent:false},true,docs,'cancel'),/policy_acceptance_required/);
 assert.throws(()=>assertBookingConsent(accepted,true,docs.slice(1),'cancel'),/booking_terms_unavailable/);
 assert.doesNotThrow(()=>assertBookingConsent({...accepted,guarantee_card_consent:false,guarantee_renewal_consent:false},false,docs,'cancel'));
});
test('development drafts never substitute active terms or become production terms',()=>{
 const draft={...docs[0],id:'draft',version:'2',status:'draft'};
 assert.equal(bookingDocuments([...docs,draft],true)[0].id,'doc0');
 assert.equal(bookingDocuments([draft],false).length,0);
 assert.equal(bookingDocuments([draft],true)[0].id,'draft');
});
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
test('checkout stops before payment without its single explicit acceptance',async()=>{
 const source=readFileSync('booking.js','utf8');
 const w=new JSDOM('<input id="accept-all" type="checkbox">',{runScripts:'outside-only'}).window;
 let payments=0;
 Object.assign(w,{$:s=>w.document.querySelector(s),state:{property:{guarantee_amount_cents:50000},upsellHandled:true},paymentChoice:()=>({method:'pix'}),setFlowError:()=>{},performStartPayment:async()=>{payments++}});
 w.eval(source.slice(source.indexOf('async function maybeOfferUpsell(){'),source.indexOf('async function refreshQuoteAfterExperiences')));
 try{
  const inputs=[...w.document.querySelectorAll('input')];assert.ok(inputs.every(i=>!i.checked));
  for(const absent of inputs){inputs.forEach(i=>i.checked=i!==absent);await w.maybeOfferUpsell();assert.equal(payments,0)}
  inputs.forEach(i=>i.checked=true);await w.maybeOfferUpsell();assert.equal(payments,1);
 }finally{w.close()}
});

test('single acceptance records each document and both guarantee authorizations without implicit consent',()=>{
 const source=readFileSync('booking.js','utf8');const w=new JSDOM('<input id="accept-all" type="checkbox">',{runScripts:'outside-only'}).window;
 Object.assign(w,{$:s=>w.document.querySelector(s),state:{property:{guarantee_amount_cents:50000},rate:{cancellation_policy:{id:'cancel'}},config:{required_booking_documents:docs}}});
 w.eval(source.slice(source.indexOf('function bookingConsentPayload(){'),source.indexOf('async function performStartPayment')));
 try{const input=w.document.querySelector('input');assert.throws(()=>assertBookingConsent(w.bookingConsentPayload(),true,docs,'cancel'),/consent_required/);input.checked=true;assert.doesNotThrow(()=>assertBookingConsent(w.bookingConsentPayload(),true,docs,'cancel'));assert.deepEqual(Array.from(w.bookingConsentPayload().accepted_document_ids),accepted.accepted_document_ids);input.checked=false;assert.equal(w.bookingConsentPayload().guarantee_renewal_consent,false)}finally{w.close()}
});
