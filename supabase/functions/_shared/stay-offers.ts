import {showcaseSettings} from "./stay-showcase.ts";
type Row = Record<string, any>;
const fail = (code: string): never => {throw new Error(code)};
export function experienceComponents(details: Row = {}) {
  const raw = details.components ?? (details.includes || []).map((name: string) => ({name, quantity: 1, frequency: 'arrival'}));
  if (!Array.isArray(raw) || raw.length > 60) fail('invalid_components');
  const seen=new Set<string>();
  return raw.map((item: Row) => {
    const name = String(item.name || '').trim().slice(0,160), quantity = Number(item.quantity ?? 1);
    const frequency = item.frequency || 'arrival', choices = item.choices || [];
    if (!name || !Number.isInteger(quantity) || quantity < 1 || quantity > 100 || !['arrival','daily','departure'].includes(frequency)
      || !Array.isArray(choices) || choices.length > 12 || choices.some(x => typeof x !== 'string' || !x.trim() || x.length > 100)) fail('invalid_components');
    const key=name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();if(seen.has(key))fail('invalid_components');seen.add(key);
    return {name, quantity, frequency, choices: [...new Set(choices.map(x => x.trim()))]};
  });
}
export function validateStayOffer(input: Row) {
  const name=String(input.name||'').trim().slice(0,160), description=String(input.description||'').trim().slice(0,3000);
  const property_ids=[...new Set((input.property_ids||[]).map(Number))] as number[];
  const product_ids=[...new Set(input.product_ids||[])] as string[];
  const min_nights=Number(input.min_nights??1),max_nights=input.max_nights?Number(input.max_nights):null;
  const discount_bps=Number(input.discount_bps??500),media=Array.isArray(input.media)?input.media:[];
  if(!name||!description||!property_ids.length||!product_ids.length||property_ids.some(x=>!Number.isSafeInteger(x)||x<1)
    ||product_ids.some(x=>!/^[-a-f0-9]{36}$/i.test(x))||product_ids.length>12||media.length>20
    ||!Number.isInteger(min_nights)||min_nights<1||min_nights>365||max_nights!==null&&(!Number.isInteger(max_nights)||max_nights<min_nights||max_nights>365)
    ||!Number.isInteger(discount_bps)||discount_bps<0||discount_bps>10000)fail('invalid_offer');
  const start_date=input.start_date||null,end_date=input.end_date||null;
  if([start_date,end_date].some(x=>x&&!/^\d{4}-\d{2}-\d{2}$/.test(x))||start_date&&end_date&&end_date<start_date)fail('invalid_offer_period');
  return {name,description,property_ids,product_ids,min_nights,max_nights,discount_bps,discount_enabled:input.discount_enabled!==false,
    start_date,end_date,media,showcase:showcaseSettings(input.showcase),status:input.status==='active'?'active':'paused'};
}
export function offerIssues(offer: Row, products: Row[], propertyId?: number, dates?: {check_in:string;check_out:string}, now=Date.now()) {
  const issues: string[]=[];
  if(offer.status!=='active')issues.push('offer_paused');
  if(propertyId&&!offer.property_ids?.map(Number).includes(propertyId))issues.push('offer_property_incompatible');
  if(dates){
    const nights=Math.round((Date.parse(dates.check_out+'T12:00:00Z')-Date.parse(dates.check_in+'T12:00:00Z'))/86400000);
    if(nights<offer.min_nights||offer.max_nights&&nights>offer.max_nights)issues.push('offer_duration');
    if(offer.start_date&&dates.check_in<offer.start_date||offer.end_date&&dates.check_out>offer.end_date)issues.push('offer_period');
  }
  const categories=new Set(),components=new Set();
  for(const id of offer.product_ids||[]){
    const p=products.find(x=>x.id===id);
    if(!p){issues.push('package_missing');continue}
    if(p.status!=='active')issues.push('package_paused');
    if(!experienceComponents(p.details).length)issues.push('package_components_required');
    if(!p.experience_variants?.some((v:Row)=>v.active))issues.push('package_unavailable');
    if(p.details?.offer_enabled===false)issues.push('package_not_for_offers');
    if(propertyId&&!p.experience_property_eligibility?.some(x=>Number(x.property_id)===propertyId))issues.push('package_property_incompatible');
    if(p.inventory!=null&&p.inventory<1)issues.push('package_out_of_stock');
    // Exact lead time uses the property check-in time and timezone in experience_sale_issue.
    if(categories.has(p.package_type))issues.push('experience_category_conflict');categories.add(p.package_type);
    for(const item of experienceComponents(p.details)){
      const key=item.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
      if(components.has(key))issues.push('experience_component_conflict');components.add(key);
    }
  }
  return [...new Set(issues)];
}
/** Largest-remainder allocation keeps every cent and leaves optional extras at full price. */
export function priceStayOffer(lines: {key:string;gross_cents:number;included:boolean}[],offer?:Row|null){
  if(lines.some(x=>!Number.isSafeInteger(x.gross_cents)||x.gross_cents<0))fail('invalid_offer_price');
  const base=lines.filter(x=>x.included).reduce((s,x)=>s+x.gross_cents,0);
  const bps=offer?.discount_enabled?Number(offer.discount_bps):0;
  if(!Number.isInteger(bps)||bps<0||bps>10000)fail('invalid_offer_discount');
  const gross=lines.reduce((s,x)=>s+x.gross_cents,0);
  if(!Number.isSafeInteger(gross))fail('invalid_offer_price');
  const discount=Number((BigInt(base)*BigInt(bps)+5000n)/10000n);
  const shares=lines.map((line,index)=>({index,amount:line.included&&base?Number(BigInt(discount)*BigInt(line.gross_cents)/BigInt(base)):0,
    remainder:line.included&&base?Number(BigInt(discount)*BigInt(line.gross_cents)%BigInt(base)):0}));
  let left=discount-shares.reduce((s,x)=>s+x.amount,0);
  for(const share of [...shares].filter(x=>lines[x.index].included).sort((a,b)=>b.remainder-a.remainder||a.index-b.index)){
    if(left<=0)break;share.amount++;left--;
  }
  const allocated=lines.map((line,index)=>({...line,discount_cents:shares[index].amount,net_cents:line.gross_cents-shares[index].amount}));
  return {gross_cents:lines.reduce((s,x)=>s+x.gross_cents,0),discount_cents:discount,total_cents:allocated.reduce((s,x)=>s+x.net_cents,0),lines:allocated};
}
export function compositionSnapshot(product:Row,preferences:Row={},required=false){
  const components=experienceComponents(product.details).map(item=>{
    const choice=preferences[item.name];
    if(choice!==undefined&&!item.choices.includes(choice))fail('invalid_experience_choice');
    if(required&&item.choices.length&&!choice)fail('experience_choice_required');
    return {...item,choice:choice||null};
  });
  return {components,preferences:Object.fromEntries(components.filter(x=>x.choice).map(x=>[x.name,x.choice])),product_id:product.id,name:product.name,gross_price_cents:Number(product.price_cents)};
}
