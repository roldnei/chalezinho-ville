import {test} from 'node:test';import assert from 'node:assert/strict';
import {staySelectionInput,villegramStayQuote,resolvePublicationStay} from '../supabase/functions/_shared/villegram-stay.ts';
import {publicationInput} from '../supabase/functions/_shared/villegram-publications.ts';
const selection={check_in:'2026-11-16',check_out:'2026-11-19',guests:2,rate_code:'refundable'},project='https://pxfqmnhqodqyaaqeyjgr.supabase.co';
test('reel booking choices validate real dates and tariff, strip prices, and permit accommodation without a package',()=>{
 assert.deepEqual(staySelectionInput({...selection,total_cents:1,discount:90}),selection);
 for(const update of [{check_in:'2026-02-30'},{check_out:selection.check_in},{check_out:'2027-11-19'},{rate_code:''},{rate_code:'cheapest'},{guests:0},{guests:1.5}])assert.throws(()=>staySelectionInput({...selection,...update}));
 const p=publicationInput({type:'offer',cta:'offer',title:'Dias no Ville',caption:'Estadia pronta',media:[{kind:'photo',url:'assets/photo.webp',zoom:1.5,position_x:0,position:100}],property_id:1,stay_selection:selection},project);assert.equal(p.offer_id,null);assert.equal(p.stay_selection.rate_code,'refundable');assert.equal(p.media[0].position_x,0);assert.equal(p.media[0].zoom,1.5);assert.throws(()=>publicationInput({...p,property_id:null},project));assert.throws(()=>publicationInput({...p,media:[{...p.media[0],zoom:4}]},project));
});
test('read-only stay query returns both complete tariffs and no card until an explicit tariff is chosen',async()=>{
 const calls=[],deps={search:async(...args)=>{calls.push(args);return [{id:1,code:'CH1',name:'Ville',available:true}]},quote:async(input,list)=>{calls.push(input);assert.equal(list[0].id,1);return {quote_id:null,rate_options:[{selectable:false,total_amount_cents:1},{selectable:true,code:'non_refundable',total_amount_cents:110000,contract_snapshot:{}},{selectable:true,code:'refundable',total_amount_cents:120000,contract_snapshot:{}}],experiences:[]}}};
 const q=await villegramStayQuote({...selection,rate_code:'',property_id:1},deps);assert.equal(q.card,null);assert.equal(q.rate_options.length,2);assert.deepEqual(calls[0],[selection.check_in,selection.check_out,2]);
 const selected=await villegramStayQuote({...selection,property_id:1},deps);assert.equal(selected.card.total_cents,120000);assert.equal(selected.card.rate_code,'refundable');assert.equal(selected.card.guests,2);assert.equal(selected.card.nights,3);assert.equal(selected.card.offer_id,null);
 await assert.rejects(villegramStayQuote({...selection,property_id:2},deps),/dates_unavailable/);
});
test('package inclusion and price updates use the booking result without embedding a historical total',async()=>{
 let price=20000;const deps={search:async()=>[{id:1,code:'CH1',available:true}],quote:async input=>({rate_options:[{selectable:true,code:'refundable',total_amount_cents:100000+(input.stay_offer_id?price:0),contract_snapshot:{}}],experiences:input.stay_offer_id?[{composition:{components:[{name:'Ambientação'}]}}]:[]})};
 const a=await villegramStayQuote({...selection,property_id:1,offer_id:'package'},deps);assert.equal(a.card.total_cents,120000);assert.equal(a.card.experiences[0].components[0].name,'Ambientação');price=30000;const b=await villegramStayQuote({...selection,property_id:1,offer_id:'package'},deps);assert.equal(b.card.total_cents,130000);const c=await villegramStayQuote({...selection,property_id:1},deps);assert.equal(c.card.total_cents,100000);assert.deepEqual(c.card.experiences,[]);
});
test('fixed-date posts never fall back to random calendar dates when their stay becomes unavailable',async()=>{
 const p={id:'post',property_id:1,offer_id:null,stay_selection:selection};let body;
 const resolved=await resolvePublicationStay(p,project,async(url,opts)=>{assert.equal(url,project+'/functions/v1/booking-engine');body=JSON.parse(opts.body);return {ok:true,json:async()=>({ok:true,card:{total_cents:123000,check_in:selection.check_in}})}});assert.equal(body.action,'villegram_quote');assert.equal(body.rate_code,'refundable');assert.equal(resolved.stay_card.total_cents,123000);assert.equal(p.stay_card,undefined);await assert.rejects(resolvePublicationStay(p,project,async()=>({ok:false,json:async()=>({ok:false,error:'dates_unavailable'})})),/stay_unavailable/);
});
