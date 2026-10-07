type Row=Record<string,any>;
const validDate=(value:any)=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
/** Persist choices only. Totals always come from the existing booking calculation. */
export function staySelectionInput(raw:Row|null,requireRate=true){
 if(raw==null)return null;
 const {check_in,check_out}=raw,guests=Number(raw.guests),rate_code=String(raw.rate_code||'');
 if(!validDate(check_in)||!validDate(check_out)||check_out<=check_in||(Date.parse(check_out)-Date.parse(check_in))/86400000>90||!Number.isInteger(guests)||guests<1||guests>12||(!rate_code&&requireRate)||rate_code&&!['refundable','non_refundable'].includes(rate_code))throw Error('invalid_stay_selection');
 return {check_in,check_out,guests,rate_code};
}
export async function villegramStayQuote(raw:Row,{search,quote}:Row){
 const selection=staySelectionInput(raw,false)!,property_id=Number(raw.property_id);
 if(!Number.isSafeInteger(property_id)||property_id<1)throw Error('invalid_property');
 const list=await search(selection.check_in,selection.check_out,selection.guests),property=list.find((p:Row)=>Number(p.id)===property_id);
 if(!property?.available)throw Error('dates_unavailable');
 const q=await quote({property_id,...selection,stay_offer_id:raw.offer_id||undefined},list);
 const rates=q.rate_options.filter((r:Row)=>r.selectable&&Number.isSafeInteger(r.total_amount_cents));
 const rate=selection.rate_code?rates.find((r:Row)=>r.code===selection.rate_code):null;
 if(!rates.length||selection.rate_code&&!rate)throw Error('quote_unavailable');
 const card=rate?{offer_id:raw.offer_id||null,property_id,property_code:property.code,property_name:property.name,...selection,nights:(Date.parse(selection.check_out)-Date.parse(selection.check_in))/86400000,rate_name:rate.name,total_cents:rate.total_amount_cents,gross_cents:rate.contract_snapshot?.gross_cents,discount_cents:rate.contract_snapshot?.discount_cents,experiences:q.experiences.map((p:Row)=>p.composition),category:'manual'}:null;
 return {ok:true,rate_options:rates,experiences:q.experiences,card,checked_at:new Date().toISOString()};
}
export async function resolvePublicationStay(p:Row,projectUrl:string,request=fetch){
 if(!p.stay_selection)return p;
 const r=await request(projectUrl+'/functions/v1/booking-engine',{method:'POST',headers:{'Content-Type':'application/json','X-Chalezinho-Env':'development'},body:JSON.stringify({action:'villegram_quote',property_id:p.property_id,offer_id:p.offer_id,...p.stay_selection}),signal:AbortSignal.timeout(25000)}),d=await r.json();
 if(!r.ok||!d.ok||!d.card)throw Error('stay_unavailable');
 return {...p,stay_card:d.card};
}
