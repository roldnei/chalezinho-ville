import {test} from 'node:test';import assert from 'node:assert/strict';
import {lodgingLaunchCatalog,lodgingLaunchPlans,assertLodgingLaunchSelection} from '../supabase/functions/_shared/lodging-launch.ts';
test('public catalog excludes experiences, synthetic offers and discounts without editing saved catalog',()=>{
 const original={products:[{id:'romance'}],offers:[{name:'Hospedagem',product_ids:[],discount_enabled:true,discount_bps:500},{name:'Romance',product_ids:['romance']},{name:'[DEV] Teste',product_ids:[]}]};
 const result=lodgingLaunchCatalog(original);assert.deepEqual(result.products,[]);assert.equal(result.offers.length,1);assert.equal(result.offers[0].name,'Escapada');assert.equal(result.offers[0].discount_bps,0);assert.equal(original.offers[0].discount_bps,500);
});
test('public rate has zero markup; checkout multipliers and cancellation policies are preserved',()=>{
 const plans=[{code:'refundable',selectable:true,multiplier_bps:12000},{code:'non_refundable',selectable:true,multiplier_bps:11000,policy_documents:{id:'historical'}}];
 const result=lodgingLaunchPlans(plans);assert.equal(result.length,1);assert.equal(result[0].multiplier_bps,10000);assert.equal(result[0].name,'Escapada');assert.equal(result[0].policy_documents,null);assert.equal(plans[1].multiplier_bps,11000);assert.equal(plans[1].policy_documents.id,'historical');assert.throws(()=>lodgingLaunchPlans([]),/launch_price_unavailable/);
});
test('server rejects experience variants and included packages even when supplied directly',()=>{
 assertLodgingLaunchSelection({experience_variant_ids:[]},{product_ids:[]});assert.throws(()=>assertLodgingLaunchSelection({experience_variant_ids:['romance']}),/experiences_not_available_in_launch/);assert.throws(()=>assertLodgingLaunchSelection({}, {product_ids:['romance']}),/experiences_not_available_in_launch/);
});

test('Airbnb promotion uses eligible nights only, excludes cleaning and preserves cents', async()=>{
 const {lodgingLaunchPrice}=await import('../supabase/functions/_shared/lodging-launch.ts');
 const features={channel_pricing:{last_minute:{enabled:true,discount_bps:500,horizon_days:7}}};
 const price=(days)=>lodgingLaunchPrice({features,pricing_days:days},days.reduce((s,d)=>s+d.price*100,0),29000,'2026-10-11');
 assert.equal(price([{date:'2026-10-17',price:863},{date:'2026-10-18',price:680}]).total_cents,175585);
 assert.equal(price([{date:'2026-10-18',price:680},{date:'2026-10-19',price:569}]).total_cents,150500);
 assert.equal(price([{date:'2026-10-19',price:569},{date:'2026-10-20',price:560}]).total_cents,141900);
 assert.equal(price([{date:'2026-10-17',price:731},{date:'2026-10-18',price:534}]).lines[1].net_cents,29000);
 assert.throws(()=>lodgingLaunchPrice({features,pricing_days:[]},154300,29000,'2026-10-11'),/launch_price_unavailable/);
});
