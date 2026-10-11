import {commercialItem} from './release-policy.ts';
import {priceStayOffer} from './stay-offers.ts';
import {brazilClock,shiftDate} from './availability.ts';
/** Server-owned scope of the first public launch. Checkout plans remain unchanged. */
export function lodgingLaunchCatalog(catalog:any){
 return {...catalog,products:[],offers:catalog.offers.filter((o:any)=>commercialItem(o)&&!o.product_ids?.length).map((o:any)=>({...o,name:'Escapada',discount_enabled:false,discount_bps:0}))};
}
export function lodgingLaunchPlans(plans:any[]){
 const plan=plans.find(p=>p.code==='non_refundable'&&p.selectable);
 if(!plan)throw Error('launch_price_unavailable');
 return [{...plan,name:'Escapada',multiplier_bps:10000,cancellation_policy_id:null,policy_documents:null}];
}
export function assertLodgingLaunchSelection(body:any,offer:any=null){
 if(body.experience_variant_ids?.length||offer?.product_ids?.length)throw Error('experiences_not_available_in_launch');
}
/** Mirror the separately configured channel promotion, using the canonical allocator.
 * Apply only to eligible nights, never to cleaning or to the whole check-in range. */
export function lodgingLaunchPrice(property:any,baseCents:number,cleaningCents:number,today=brazilClock().date){
 const promotion=property.features?.channel_pricing?.last_minute;
 if(!promotion?.enabled)return priceStayOffer([{key:'accommodation',gross_cents:baseCents,included:false},{key:'cleaning',gross_cents:cleaningCents,included:false}]);
 const bps=Number(promotion.discount_bps),horizon=Number(promotion.horizon_days),days=property.pricing_days;
 if(!Number.isInteger(bps)||bps<0||bps>10000||!Number.isInteger(horizon)||horizon<0||horizon>365||!Array.isArray(days))throw Error('launch_price_unavailable');
 const amounts=days.map((d:any)=>({date:d.date,cents:Math.round(Number(d.price)*100)}));
 if(amounts.some((d:any)=>!Number.isSafeInteger(d.cents)||d.cents<0)||amounts.reduce((s:number,d:any)=>s+d.cents,0)!==baseCents)throw Error('launch_price_unavailable');
 const eligible=amounts.filter((d:any)=>d.date>=today&&d.date<=shiftDate(today,horizon)).reduce((s:number,d:any)=>s+d.cents,0);
 const price=priceStayOffer([{key:'eligible_nights',gross_cents:eligible,included:true},{key:'remaining_nights',gross_cents:baseCents-eligible,included:false},{key:'cleaning',gross_cents:cleaningCents,included:false}],{discount_enabled:true,discount_bps:bps});
 return {...price,lines:[{key:'accommodation',gross_cents:baseCents,included:true,discount_cents:price.discount_cents,net_cents:baseCents-price.discount_cents},price.lines[2]]};
}
