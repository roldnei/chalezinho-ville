import {test} from 'node:test';
import assert from 'node:assert/strict';
import {priceStayOffer,validateStayOffer,offerIssues,compositionSnapshot} from '../supabase/functions/_shared/stay-offers.ts';
const offer={discount_enabled:true,discount_bps:500};
const lines=[{key:'accommodation',gross_cents:100001,included:true},{key:'cleaning',gross_cents:15000,included:true},{key:'romance',gross_cents:29999,included:true},{key:'extra',gross_cents:12345,included:false}];
test('offer discount allocated to contracted components, optional extra full price',()=>{
 const p=priceStayOffer(lines,offer);assert.equal(p.discount_cents,7250);assert.equal(p.total_cents,150095);assert.equal(p.lines[3].discount_cents,0);assert.equal(p.lines.reduce((s,l)=>s+l.discount_cents,0),7250);assert.equal(p.lines.reduce((s,l)=>s+l.net_cents,0),p.total_cents);
});
test('discount belongs to explicit offer, configurable or disabled',()=>{
 assert.equal(priceStayOffer(lines).discount_cents,0);assert.equal(priceStayOffer(lines,{...offer,discount_bps:1000}).discount_cents,14500);assert.equal(priceStayOffer(lines,{...offer,discount_enabled:false}).discount_cents,0);
});
test('all tariffs apply to dynamic accommodation before discount',()=>{
 for(const bps of [11000,12000,12800]){const p=priceStayOffer([{key:'stay',gross_cents:Math.round(10000*bps/10000),included:true},{key:'cleaning',gross_cents:15000,included:true},{key:'romance',gross_cents:29999,included:true}],offer);assert.equal(p.total_cents,p.gross_cents-Math.round(p.gross_cents*.05));}
});
test('cent allocation handles tiny and large integer amounts without lost cents',()=>{
 for(const price of [1,2,3,99999999999999]){const p=priceStayOffer([{key:'a',gross_cents:price,included:true},{key:'b',gross_cents:price,included:true}],{...offer,discount_bps:3333});assert.equal(p.lines.reduce((s,l)=>s+l.discount_cents,0),p.discount_cents);assert.ok(p.lines.every(l=>l.net_cents>=0));}
 assert.throws(()=>priceStayOffer([{key:'x',gross_cents:1.5,included:true}],offer),/price/);
});
test('two nights and flexible duration follow configuration; no global three-night minimum',()=>{
 const input={name:'Chegada romântica',description:'Ambientação',property_ids:[1],product_ids:['d7c8da18-e089-46d1-962b-f90816135ef5'],status:'active'};
 const o=validateStayOffer(input);assert.equal(o.min_nights,1);assert.equal(o.max_nights,null);assert.equal(o.discount_bps,500);
 const products=[{id:o.product_ids[0],status:'active',package_type:'romantic',details:{includes:['Ambientação']},experience_variants:[{active:true}],experience_property_eligibility:[{property_id:1}]}];
 assert.deepEqual(offerIssues(o,products,1,{check_in:'2030-01-01',check_out:'2030-01-03'}),[]);
 assert.ok(offerIssues({...o,min_nights:3},products,1,{check_in:'2030-01-01',check_out:'2030-01-03'}).includes('offer_duration'));
 assert.ok(offerIssues(o,[{...products[0],status:'inactive'}],1).includes('package_paused'));
 assert.ok(offerIssues(o,products,2).includes('offer_property_incompatible'));
});
test('preferences use only allowed choices and required choice is enforced before purchase',()=>{
 const p={id:'romance',name:'Romance',price_cents:30000,details:{components:[{name:'Bebida',quantity:1,frequency:'arrival',choices:['Vinho','Espumante']}]}};
 const c=compositionSnapshot(p,{Bebida:'Vinho',arbitrary:'ignored'},true);assert.deepEqual(c.preferences,{Bebida:'Vinho'});assert.equal(c.components[0].choice,'Vinho');
 assert.throws(()=>compositionSnapshot(p,{},true),/choice_required/);assert.throws(()=>compositionSnapshot(p,{Bebida:'Gin'}),/invalid_experience_choice/);
 p.details.components[0].name='Changed';assert.equal(c.components[0].name,'Bebida');
});
