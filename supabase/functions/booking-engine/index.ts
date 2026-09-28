
import { createClient } from "npm:@supabase/supabase-js@2";
import { changePagBankCharge, createPagBankOrder, getPagBankCardPublicKey, getPagBankCharge, getPagBankOrderCharge, pagBankOrder } from "./pagbank.ts";
import { calculateCancellationRefund } from "./refund-policy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-chalezinho-env",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

const json = (body: unknown, status=200) => new Response(JSON.stringify(body), {
  status,
  headers: {...corsHeaders, "Content-Type":"application/json", "Cache-Control":"no-store"}
});

const projectUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(projectUrl, serviceKey, {auth:{persistSession:false,autoRefreshToken:false}});

async function developmentPolicies(){
  const {data,error}=await admin.from("cancellation_policy_assignments")
    .select("rate_plan_code,cancellation_policy_rules!inner(withdrawal_days,full_refund_days_before_checkin,late_accommodation_refund_percent,policy_documents!inner(id,title,body,version,code))")
    .eq("environment","development");
  if(error) throw new Error("cancellation_policy_unavailable");
  return data||[];
}
function policyForPlan(rows:any[],code:string){
  return (rows.find((row:any)=>row.rate_plan_code===code)?.cancellation_policy_rules as any)?.policy_documents||null;
}

function overlaps(a:string,b:string,s:string,e:string){ return a < e && b > s; }
function nights(a:string,b:string){ return Math.round((Date.parse(b+"T12:00:00Z")-Date.parse(a+"T12:00:00Z"))/86400000); }
function validDate(v:string){ return /^\d{4}-\d{2}-\d{2}$/.test(v||""); }
function cents(v:number){ return Math.round(Number(v||0)*100); }

async function currentUser(req:Request){
  const auth=req.headers.get("authorization")||"";
  if(!auth.toLowerCase().startsWith("bearer ")) return null;
  const token=auth.slice(7);
  const client=createClient(projectUrl,anonKey,{global:{headers:{Authorization:"Bearer "+token}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await client.auth.getUser(token);
  return error ? null : data.user;
}

async function prodJson(path:string){
  const r=await fetch("https://chalezinhoville.com.br"+path,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(9000)});
  const d=await r.json().catch(()=>null);
  if(!r.ok || !d?.ok) throw new Error("upstream_failed");
  return d;
}

const bookingFeeds=[
  {name:"Ville Signature",env:"ICAL_BOOKING_CH1"},
  {name:"Ville Essenza",env:"ICAL_BOOKING_CH2"},
  {name:"Ville Amore",env:"ICAL_BOOKING_CH3"}
];
function bookingIcalConfigured(){
  return bookingFeeds.every(x=>Boolean(Deno.env.get(x.env)));
}
function unfoldIcal(s:string){return s.replace(/\r?\n[ \t]/g,"");}
function icalDate(v:string){
  const m=String(v||"").match(/^(\d{4})(\d{2})(\d{2})/);
  return m?m[1]+"-"+m[2]+"-"+m[3]:null;
}
async function readIcalFeed(url:string){
  const r=await fetch(url,{headers:{"User-Agent":"ChalezinhoVille/1.0"},signal:AbortSignal.timeout(8000)});
  if(!r.ok) throw new Error("feed_unreachable");
  const raw=unfoldIcal(await r.text());
  return raw.split("BEGIN:VEVENT").slice(1).map(x=>x.split("END:VEVENT")[0]).map(e=>{
    const s=e.match(/DTSTART(?:;[^:]*)?:(\d{8})/);
    const d=e.match(/DTEND(?:;[^:]*)?:(\d{8})/);
    const start=s?icalDate(s[1]):null,end=d?icalDate(d[1]):null;
    return start&&end?{start,end}:null;
  }).filter(Boolean);
}
async function bookingCalendarData(){
  const configured=bookingIcalConfigured();
  if(!configured) return {configured:false,ok:true,listings:bookingFeeds.map(x=>({name:x.name,ok:true,periods:[]}))};
  const listings=await Promise.all(bookingFeeds.map(async x=>{
    const url=Deno.env.get(x.env)||"";
    try{return {name:x.name,ok:true,periods:await readIcalFeed(url)}}
    catch{return {name:x.name,ok:false,periods:[]}}
  }));
  return {configured:true,ok:listings.every(x=>x.ok),listings};
}

async function searchData(start:string,end:string,guests:number,excludeReservationId:string|null=null,development=false){
  if(!validDate(start)||!validDate(end)||end<=start) throw new Error("invalid_dates");
  const stay=nights(start,end);
  if(stay<1) throw new Error("invalid_dates");

  const [propertiesQ,reservationsQ,changeHoldsQ,blocksQ,ical,bookingIcal,prices] = await Promise.all([
    retryDb("search_properties",()=>admin.from("properties").select("id,code,name,slug,property_type,tagline,summary,cover_image,gallery,features,cleaning_fee,max_guests,guarantee_amount_cents").eq("active",true).order("id")),
    retryDb("search_reservations",()=>admin.from("reservations").select("id,property_id,check_in,check_out,status,hold_expires_at")
      .lt("check_in",end).gt("check_out",start).in("status",["hold","pending_payment","confirmed"])),
    retryDb("search_change_holds",()=>admin.from("post_booking_charges").select("id,reservation_id,target_property_id,target_check_in,target_check_out,status,expires_at")
      .eq("kind","modification").in("status",["awaiting_payment","processing","paid"])
      .lt("target_check_in",end).gt("target_check_out",start).gt("expires_at",new Date().toISOString())),
    retryDb("search_operational_blocks",()=>admin.from("pms_calendar_blocks").select("id,property_id,start_date,end_date")
      .eq("status","active").lt("start_date",end).gt("end_date",start)),
    prodJson("/api/ical-airbnb-all"),
    bookingCalendarData(),
    prodJson("/api/pricelabs-availability?start="+encodeURIComponent(start)+"&end="+encodeURIComponent(end)),
  ]);
  const {data:properties,error:pe}=propertiesQ;
  const {data:dbRows,error:re}=reservationsQ;
  const {data:changeHolds,error:he}=changeHoldsQ;
  const {data:operationalBlocks,error:be}=blocksQ;
  if(pe||re||he||be){
    console.error(JSON.stringify({event:"booking_search_db_error",properties:pe?.code||null,reservations:re?.code||null,change_holds:he?.code||null,operational_blocks:be?.code||null}));
    throw new Error("database_unavailable");
  }
  if(!development && !bookingIcal.configured) throw new Error("booking_not_configured");
  const now=Date.now();
  const dbActive=(dbRows||[]).filter((r:any)=>String(r.id)!==String(excludeReservationId||"")).filter((r:any)=>r.status!=="hold" && r.status!=="pending_payment" ? true : !r.hold_expires_at || Date.parse(r.hold_expires_at)>now);
  const changeHoldActive=(changeHolds||[]).filter((c:any)=>String(c.reservation_id)!==String(excludeReservationId||"") && Date.parse(c.expires_at)>now);
  const icalMap=Object.fromEntries((ical.listings||[]).map((x:any)=>[x.name,x]));
  const bookingMap=Object.fromEntries((bookingIcal.listings||[]).map((x:any)=>[x.name,x]));
  const priceMap=Object.fromEntries((prices.listings||[]).map((x:any)=>[x.name,x]));

  return (properties||[]).map((p:any)=>{
    const cal=icalMap[p.name];
    const bookingCal=bookingMap[p.name];
    const pr=priceMap[p.name];
    const airbnbOccupied=!cal?.ok || (cal.periods||[]).some((x:any)=>overlaps(x.start,x.end,start,end));
    const bookingOccupied=bookingIcal.configured && (!bookingCal?.ok || (bookingCal.periods||[]).some((x:any)=>overlaps(x.start,x.end,start,end)));
    const channelOccupied=airbnbOccupied||bookingOccupied;
    const dbOccupied=dbActive.some((x:any)=>Number(x.property_id)===Number(p.id))
      || changeHoldActive.some((x:any)=>Number(x.target_property_id)===Number(p.id))
      || (operationalBlocks||[]).some((x:any)=>Number(x.property_id)===Number(p.id));
    const minStay=Math.max(1,Number(pr?.min_stay||1));
    const hasPrice=Array.isArray(pr?.days)&&pr.days.length===stay&&Number.isFinite(Number(pr?.total_price));
    const available=!channelOccupied&&!dbOccupied&&guests<=Number(p.max_guests)&&stay>=minStay&&hasPrice;
    return {
      ...p,
      cleaning_fee:Number(p.cleaning_fee||0),
      min_stay:minStay,
      base_price:hasPrice?Number(pr.total_price):null,
      available,
      unavailable_reason: channelOccupied||dbOccupied ? "occupied" : guests>Number(p.max_guests) ? "capacity" : stay<minStay ? "minimum_stay" : !hasPrice ? "rate_unavailable" : null
    };
  });
}

async function createQuote(body:any, development:boolean,excludeReservationId:string|null=null){
  const {property_id,check_in,check_out,guests,experience_variant_ids=[]}=body||{};
  const list=await searchData(String(check_in||""),String(check_out||""),Number(guests||0),excludeReservationId,development);
  const property=list.find((x:any)=>Number(x.id)===Number(property_id));
  if(!property) throw new Error("property_not_found");
  if(!property.available){
    if(property.unavailable_reason==="minimum_stay") throw new Error("minimum_stay:"+Number(property.min_stay||1));
    throw new Error(property.unavailable_reason||"unavailable");
  }

  let experienceTotal=0;
  const expSnapshots:any[]=[];
  if(Array.isArray(experience_variant_ids)&&experience_variant_ids.length){
    const {data:variants,error}=await admin.from("experience_variants")
      .select("id,code,name,price_cents,active,product_id,experience_products!inner(id,code,name,status,minimum_lead_hours,daily_capacity,inventory,package_type,price_cents,upsell_enabled)")
      .in("id",experience_variant_ids);
    if(error) throw new Error("experience_lookup_failed");
    const productIds=[...new Set((variants||[]).map((v:any)=>v.product_id))];
    const {data:eligibleRows}=await admin.from("experience_property_eligibility").select("product_id").eq("property_id",property.id).in("product_id",productIds);
    const eligible=new Set((eligibleRows||[]).map((x:any)=>String(x.product_id)));
    const seenPackageTypes=new Set<string>();
    for(const v of variants||[]){
      const prod=(v as any).experience_products;
      const packageType=String(prod.package_type||"other");
      if(seenPackageTypes.has(packageType)) throw new Error("experience_category_conflict");
      seenPackageTypes.add(packageType);
      const leadOk=(Date.parse(check_in+"T15:00:00-03:00")-Date.now()) >= Number(prod.minimum_lead_hours||0)*3600000;
      const stockOk=prod.inventory==null || Number(prod.inventory)>0;
      const allowed=v.active && eligible.has(String(prod.id)) && leadOk && stockOk && (prod.status==="active" || (development && prod.status==="draft"));
      if(!allowed) throw new Error("experience_unavailable");
      experienceTotal+=Number(v.price_cents||0);
      expSnapshots.push({variant:v,product:prod});
    }
  }

  const baseCents=cents(property.base_price);
  const cleaningCents=cents(property.cleaning_fee);
  const expiresAt=new Date(Date.now()+15*60000).toISOString();
  const {data:q,error:qe}=await admin.from("quotes").insert({
    property_id:property.id,
    client_token_hash:crypto.randomUUID(),
    check_in,check_out,guests:Number(guests),
    base_amount_cents:baseCents,
    cleaning_fee_cents:cleaningCents,
    pricing_snapshot:{source:"pricelabs",base_price:property.base_price,min_stay:property.min_stay,experience_total_cents:experienceTotal},
    rules_version:"2026-09-v1",
    expires_at:expiresAt
  }).select().single();
  if(qe||!q) throw new Error("quote_create_failed");

  if(expSnapshots.length){
    const rows=expSnapshots.map(x=>({
      quote_id:q.id,product_id:x.product.id,variant_id:x.variant.id,
      product_name_snapshot:x.product.name,variant_name_snapshot:x.variant.code==="package"?null:x.variant.name,
      unit_price_cents:Number(x.variant.price_cents),quantity:1
    }));
    const {error}=await admin.from("quote_experience_items").insert(rows);
    if(error) throw new Error("quote_experience_failed");
  }

  const {data:plans,error:ple}=await admin.from("rate_plans")
    .select("id,code,name,multiplier_bps,selectable,cancellation_policy_id,policy_documents(id,title,body,version,code)")
    .eq("active",true).order("display_order");
  if(ple) throw new Error("rate_plan_failed");
  const policyAssignments=development?await developmentPolicies():[];

  const inserted:any[]=[];
  const display:any[]=[];
  for(const p of plans||[]){
    const cancellationPolicy=development&&p.selectable?policyForPlan(policyAssignments,p.code):p.policy_documents;
    if(development&&p.selectable&&!cancellationPolicy) throw new Error("cancellation_policy_unavailable");
    const accommodation=Math.round(baseCents*Number(p.multiplier_bps)/10000);
    const total=accommodation+cleaningCents+experienceTotal;
    const row={
      quote_id:q.id,rate_plan_id:p.id,accommodation_amount_cents:accommodation,
      cleaning_fee_cents:cleaningCents,total_amount_cents:total,
      cancellation_policy_id:cancellationPolicy?.id||null
    };
    if(p.selectable) inserted.push(row);
    display.push({
      code:p.code,name:p.name,selectable:p.selectable,
      accommodation_amount_cents:accommodation,cleaning_fee_cents:cleaningCents,
      stay_amount_cents:accommodation+cleaningCents,
      experience_amount_cents:experienceTotal,total_amount_cents:total,
      cancellation_policy:cancellationPolicy||null
    });
  }
  let optionRows:any[]=[];
  if(inserted.length){
    const {data,error}=await admin.from("quote_options").insert(inserted).select("id,rate_plan_id,total_amount_cents");
    if(error) throw new Error("quote_options_failed");
    optionRows=data||[];
  }
  const byPlan=Object.fromEntries(optionRows.map(x=>[String(x.rate_plan_id),x.id]));
  for(const d of display){
    const plan=(plans||[]).find((x:any)=>x.code===d.code);
    d.quote_option_id=plan?byPlan[String(plan.id)]||null:null;
  }
  const {cleaning_fee:_hiddenCleaning,...guestProperty}=property;
  return {ok:true,quote_id:q.id,expires_at:expiresAt,property:guestProperty,rate_options:display,experiences:expSnapshots.map(x=>({
    product_id:x.product.id,product:x.product.name,package_type:x.product.package_type,
    variant:x.variant.code==="package"?null:x.variant.name,price_cents:Number(x.variant.price_cents)
  }))};
}



async function upsellPreview(body:any){
  const {quote_id}=body||{};
  if(!quote_id) return json({ok:false,error:"missing_data"},400);

  const {data:q,error:qe}=await admin.from("quotes")
    .select("id,property_id,status,expires_at")
    .eq("id",quote_id).eq("status","active").gt("expires_at",new Date().toISOString()).single();
  if(qe||!q) return json({ok:false,error:"quote_expired"},409);

  const {data:qitems,error:qie}=await admin.from("quote_experience_items")
    .select("product_id,unit_price_cents,created_at")
    .eq("quote_id",quote_id).order("created_at");
  if(qie) return json({ok:false,error:"experience_lookup_failed"},500);
  if(!qitems?.length) return json({ok:true,upsell:null});

  const productIds=[...new Set(qitems.map((x:any)=>x.product_id))];
  const {data:products,error:pe}=await admin.from("experience_products")
    .select("id,name,package_type,price_cents,upsell_enabled,status")
    .in("id",productIds);
  if(pe) return json({ok:false,error:"experience_lookup_failed"},500);

  for(const item of qitems){
    const source=(products||[]).find((p:any)=>String(p.id)===String(item.product_id));
    if(!source||source.status!=="active"||source.upsell_enabled!==true) continue;

    const {data:above,error:ae}=await admin.from("experience_products")
      .select("id,name,package_type,price_cents,status,inventory,experience_property_eligibility!inner(property_id)")
      .eq("package_type",source.package_type)
      .eq("status","active")
      .eq("experience_property_eligibility.property_id",q.property_id)
      .gt("price_cents",Number(source.price_cents))
      .order("price_cents",{ascending:true})
      .limit(1);
    if(ae) return json({ok:false,error:"upsell_lookup_failed"},500);

    const next=(above||[])[0];
    if(!next || (next.inventory!=null&&Number(next.inventory)<=0)) continue;
    const diff=Number(next.price_cents)-Number(source.price_cents);
    if(diff<=0) continue;

    return json({ok:true,upsell:{
      from_product_id:source.id,from_name:source.name,from_price_cents:Number(source.price_cents),
      to_product_id:next.id,to_name:next.name,to_price_cents:Number(next.price_cents),
      difference_cents:diff
    }});
  }
  return json({ok:true,upsell:null});
}

async function applyUpsell(body:any,development:boolean){
  const {quote_id,quote_option_id,target_product_id}=body||{};
  if(!quote_id||!quote_option_id||!target_product_id) return json({ok:false,error:"missing_data"},400);

  const {data:q,error:qe}=await admin.from("quotes")
    .select("*").eq("id",quote_id).eq("status","active").gt("expires_at",new Date().toISOString()).single();
  if(qe||!q) return json({ok:false,error:"quote_expired"},409);

  const {data:oldOptions,error:ooe}=await admin.from("quote_options")
    .select("id,rate_plan_id,accommodation_amount_cents,cleaning_fee_cents,total_amount_cents,cancellation_policy_id")
    .eq("quote_id",quote_id);
  if(ooe||!oldOptions?.length) return json({ok:false,error:"invalid_quote_option"},400);
  const oldSelected=oldOptions.find((x:any)=>String(x.id)===String(quote_option_id));
  if(!oldSelected) return json({ok:false,error:"invalid_quote_option"},400);

  const {data:qitems,error:qie}=await admin.from("quote_experience_items")
    .select("product_id,variant_id,product_name_snapshot,variant_name_snapshot,unit_price_cents,quantity,created_at")
    .eq("quote_id",quote_id).order("created_at");
  if(qie) return json({ok:false,error:"experience_lookup_failed"},500);
  if(!qitems?.length) return json({ok:false,error:"upsell_not_available"},409);

  const productIds=[...new Set(qitems.map((x:any)=>x.product_id))];
  const {data:currentProducts,error:cpe}=await admin.from("experience_products")
    .select("id,name,package_type,price_cents,upsell_enabled,status").in("id",productIds);
  if(cpe) return json({ok:false,error:"experience_lookup_failed"},500);

  const {data:target,error:te}=await admin.from("experience_products")
    .select("id,name,package_type,price_cents,status,inventory")
    .eq("id",target_product_id).single();
  if(te||!target||target.status!=="active"||(target.inventory!=null&&Number(target.inventory)<=0)) return json({ok:false,error:"upsell_not_available"},409);

  const source=(currentProducts||[]).find((p:any)=>p.package_type===target.package_type);
  if(!source||source.upsell_enabled!==true) return json({ok:false,error:"upsell_not_available"},409);

  const {data:eligible,error:ee}=await admin.from("experience_products")
    .select("id,name,package_type,price_cents,status,inventory,experience_property_eligibility!inner(property_id)")
    .eq("package_type",source.package_type)
    .eq("status","active")
    .eq("experience_property_eligibility.property_id",q.property_id)
    .gt("price_cents",Number(source.price_cents))
    .order("price_cents",{ascending:true})
    .limit(1);
  if(ee) return json({ok:false,error:"upsell_lookup_failed"},500);

  const nextAbove=(eligible||[])[0];
  if(!nextAbove || String(nextAbove.id)!==String(target.id) || (nextAbove.inventory!=null&&Number(nextAbove.inventory)<=0))
    return json({ok:false,error:"upsell_not_available"},409);

  const diff=Number(target.price_cents)-Number(source.price_cents);
  if(diff<=0) return json({ok:false,error:"upsell_not_available"},409);

  const {data:targetVariant,error:tve}=await admin.from("experience_variants")
    .select("id,code,name,price_cents").eq("product_id",target.id).eq("active",true).order("display_order").limit(1).maybeSingle();
  if(tve||!targetVariant) return json({ok:false,error:"upsell_not_available"},409);

  const sourceItem=qitems.find((x:any)=>String(x.product_id)===String(source.id));
  if(!sourceItem) return json({ok:false,error:"upsell_not_available"},409);

  const currentExperienceTotal=qitems.reduce((sum:number,x:any)=>sum+Number(x.unit_price_cents||0)*Number(x.quantity||1),0);
  const newExperienceTotal=currentExperienceTotal+diff;
  const snapshot={...(q.pricing_snapshot||{}),experience_total_cents:newExperienceTotal,upsell_from_quote_id:q.id,upsell_from_product_id:source.id,upsell_to_product_id:target.id,upsell_difference_cents:diff};

  const {data:newQ,error:nqe}=await admin.from("quotes").insert({
    property_id:q.property_id,user_id:q.user_id,client_token_hash:crypto.randomUUID(),
    check_in:q.check_in,check_out:q.check_out,guests:q.guests,
    base_amount_cents:q.base_amount_cents,cleaning_fee_cents:q.cleaning_fee_cents,
    pricing_snapshot:snapshot,rules_version:q.rules_version,status:"active",expires_at:q.expires_at
  }).select().single();
  if(nqe||!newQ) return json({ok:false,error:"quote_create_failed"},500);

  const newItems=qitems
    .filter((x:any)=>String(x.product_id)!==String(source.id))
    .map((x:any)=>({
      quote_id:newQ.id,product_id:x.product_id,variant_id:x.variant_id,
      product_name_snapshot:x.product_name_snapshot,variant_name_snapshot:x.variant_name_snapshot,
      unit_price_cents:x.unit_price_cents,quantity:x.quantity
    }));
  newItems.push({
    quote_id:newQ.id,product_id:target.id,variant_id:targetVariant.id,
    product_name_snapshot:target.name,variant_name_snapshot:targetVariant.code==="package"?null:targetVariant.name,
    unit_price_cents:Number(target.price_cents),quantity:1
  });
  const {error:nie}=await admin.from("quote_experience_items").insert(newItems);
  if(nie){await admin.from("quotes").delete().eq("id",newQ.id);return json({ok:false,error:"quote_experience_failed"},500);}

  const newOptionRows=oldOptions.map((o:any)=>({
    quote_id:newQ.id,rate_plan_id:o.rate_plan_id,
    accommodation_amount_cents:o.accommodation_amount_cents,
    cleaning_fee_cents:o.cleaning_fee_cents,
    total_amount_cents:Number(o.total_amount_cents)+diff,
    cancellation_policy_id:o.cancellation_policy_id
  }));
  const {data:newOptions,error:noe}=await admin.from("quote_options").insert(newOptionRows).select("*");
  if(noe||!newOptions?.length){
    await admin.from("quotes").delete().eq("id",newQ.id);
    return json({ok:false,error:"quote_options_failed"},500);
  }

  const planIds=[...new Set(newOptions.map((x:any)=>x.rate_plan_id))];
  const {data:plans}=await admin.from("rate_plans")
    .select("id,code,name,selectable,cancellation_policy_id,policy_documents(id,title,body,version,code)")
    .in("id",planIds);
  const byPlan=Object.fromEntries((plans||[]).map((p:any)=>[String(p.id),p]));
  const policyIds=[...new Set(newOptions.map((o:any)=>o.cancellation_policy_id).filter(Boolean))];
  const {data:policyDocs,error:policyError}=policyIds.length?await admin.from("policy_documents")
    .select("id,title,body,version,code").in("id",policyIds):{data:[],error:null};
  if(policyError) return json({ok:false,error:"cancellation_policy_unavailable"},500);
  const policyById=Object.fromEntries((policyDocs||[]).map((d:any)=>[String(d.id),d]));
  const display=newOptions.map((o:any)=>{
    const p=byPlan[String(o.rate_plan_id)]||{};
    return {
      quote_option_id:o.id,code:p.code,name:p.name,selectable:p.selectable!==false,
      stay_amount_cents:Number(o.accommodation_amount_cents)+Number(o.cleaning_fee_cents),
      experience_amount_cents:newExperienceTotal,total_amount_cents:o.total_amount_cents,
      cancellation_policy:policyById[String(o.cancellation_policy_id)]||null
    };
  });
  const selected=display.find((x:any)=>String(newOptions.find((o:any)=>String(o.id)===String(x.quote_option_id))?.rate_plan_id)===String(oldSelected.rate_plan_id));
  if(!selected){
    await admin.from("quotes").delete().eq("id",newQ.id);
    return json({ok:false,error:"rate_unavailable"},409);
  }

  const experiences=[
    ...qitems.filter((x:any)=>String(x.product_id)!==String(source.id)).map((x:any)=>({
      product_id:x.product_id,product:x.product_name_snapshot,package_type:(currentProducts||[]).find((p:any)=>String(p.id)===String(x.product_id))?.package_type||null,
      variant:x.variant_name_snapshot,price_cents:Number(x.unit_price_cents)
    })),
    {product_id:target.id,product:target.name,package_type:target.package_type,variant:targetVariant.code==="package"?null:targetVariant.name,price_cents:Number(target.price_cents)}
  ];

  await admin.from("quotes").update({status:"cancelled"}).eq("id",quote_id).eq("status","active");

  return json({
    ok:true,
    quote:{ok:true,quote_id:newQ.id,expires_at:newQ.expires_at,rate_options:display,experiences},
    selected_rate:selected,
    upsell:{
      from_product_id:source.id,from_name:source.name,from_price_cents:Number(source.price_cents),
      to_product_id:target.id,to_name:target.name,to_price_cents:Number(target.price_cents),
      difference_cents:diff
    }
  });
}

async function startPayment(req:Request,body:any,development:boolean){
  const user=await currentUser(req);
  if(!user) return json({ok:false,error:"authentication_required"},401);
  if(!development) return json({ok:false,error:"payment_provider_not_ready"},409);
  const {quote_id,quote_option_id,guest_name,guest_email,guest_phone,guests,travel_purpose_code,accepted_document_ids=[],method="mock",installments=1}=body||{};
  const sandbox=development && body?.provider==="pagbank_sandbox";
  const sandboxToken=Deno.env.get("PAGBANK_SANDBOX_TOKEN")||"";
  if(development&&!sandbox) return json({ok:false,error:"pagbank_sandbox_required"},409);
  if(body?.provider && body.provider!=="pagbank_sandbox") return json({ok:false,error:"invalid_provider"},400);
  if(sandbox && !sandboxToken) return json({ok:false,error:"pagbank_sandbox_not_configured"},503);
  if(body?.provider==="pagbank_sandbox" && !development) return json({ok:false,error:"not_allowed"},403);
  if(!["pix","card"].includes(method)) return json({ok:false,error:"invalid_method"},400);
  if(!quote_id||!quote_option_id||!guest_name||!guest_email||!guest_phone) return json({ok:false,error:"missing_data"},400);
  const {data:identityPresent,error:identityError}=await admin.rpc("guest_identity_present",{p_user_id:user.id});
  if(identityError) return json({ok:false,error:"identity_check_unavailable"},500);
  if(!identityPresent) return json({ok:false,error:"identity_required"},403);
  let sandboxIdentity:any=null;
  if(sandbox){
    const {data,error}=await admin.rpc("guest_payment_identity",{p_user_id:user.id});
    sandboxIdentity=Array.isArray(data)?data[0]:data;
    if(error||sandboxIdentity?.document_type!=="cpf") return json({ok:false,error:"pagbank_cpf_required"},400);
    if(method==="card" && typeof body?.encrypted_card!=="string") return json({ok:false,error:"encrypted_card_required"},400);
    const digits=String(guest_phone).replace(/\D/g,"");
    const phone=digits.startsWith("55")&&digits.length>=12?digits.slice(2):digits;
    if(!/^\d{2}\d{8,9}$/.test(phone)||!guest_name.trim()||
       String(guest_email).toLowerCase()!==String(user.email).toLowerCase())
      return json({ok:false,error:"pagbank_customer_invalid"},400);
  }

  const {data:settings}=await admin.from("payment_settings").select("*").eq("id",1).single();
  // Until the provider is wired to a verified webhook, never create a hold
  // that appears payable through the development-only mock workflow.
  if(settings?.active_provider!=="mock") return json({ok:false,error:"payment_provider_not_ready"},503);
  const maxInst=Math.max(1,Number(settings?.max_card_installments||1));
  if(method==="card"&&(Number(installments)<1||Number(installments)>maxInst)) return json({ok:false,error:"invalid_installments"},400);

  const {data:option,error:optionError}=await admin.from("quote_options")
    .select("id,quote_id,cancellation_policy_id,total_amount_cents")
    .eq("id",quote_option_id).eq("quote_id",quote_id).single();
  if(optionError||!option) return json({ok:false,error:"invalid_quote_option"},400);
  if(method==="card"&&Number(option.total_amount_cents)/Number(installments)<500)
    return json({ok:false,error:"installment_below_minimum"},400);
  const requiredPolicyId=option.cancellation_policy_id;
  const acceptedIds=Array.isArray(accepted_document_ids)?accepted_document_ids.map(String):[];
  if(!requiredPolicyId||!acceptedIds.includes(String(requiredPolicyId)))
    return json({ok:false,error:"policy_acceptance_required"},400);

  const {data:rpc,error:rpcErr}=await admin.rpc("start_payment_hold",{
    p_quote_id:quote_id,p_quote_option_id:quote_option_id,p_user_id:user.id,
    p_guest_name:guest_name,p_guest_email:guest_email,p_guest_phone:guest_phone,p_guests:Number(guests||2)
  });
  if(rpcErr){
    const msg=String(rpcErr.message||"");
    if(msg.includes("quote_expired")) return json({ok:false,error:"quote_expired"},409);
    if(msg.includes("dates_unavailable")) return json({ok:false,error:"dates_unavailable"},409);
    return json({ok:false,error:"hold_failed"},500);
  }
  const hold=Array.isArray(rpc)?rpc[0]:rpc;
  const reservationId=hold.reservation_id;

  await admin.from("reservations").update({travel_purpose_code:travel_purpose_code||null}).eq("id",reservationId);

  const {data:opt}=await admin.from("quote_options")
    .select("*,rate_plans(code,cancellation_policy_id),quotes(property_id)")
    .eq("id",quote_option_id).single();

  const {data:acceptedPolicy,error:policyError}=await admin.from("policy_documents")
    .select("id,code,version").eq("id",requiredPolicyId).single();
  if(policyError||!acceptedPolicy) return json({ok:false,error:"policy_unavailable"},409);
  const {error:acceptanceError}=await admin.from("reservation_policy_acceptances").insert({
    reservation_id:reservationId,user_id:user.id,document_id:acceptedPolicy.id,
    document_code:acceptedPolicy.code,document_version:acceptedPolicy.version
  });
  if(acceptanceError) return json({ok:false,error:"policy_acceptance_failed"},500);

  const {data:qitems}=await admin.from("quote_experience_items").select("*").eq("quote_id",quote_id);
  if(qitems?.length){
    const {data:order}=await admin.from("experience_orders").insert({reservation_id:reservationId,user_id:user.id,status:"pending"}).select().single();
    if(order?.id){
      await admin.from("experience_order_items").insert(qitems.map((x:any)=>({
        order_id:order.id,product_id:x.product_id,variant_id:x.variant_id,
        product_name_snapshot:x.product_name_snapshot,variant_name_snapshot:x.variant_name_snapshot,
        unit_price_cents:x.unit_price_cents,quantity:x.quantity,status:"active"
      })));
    }
  }

  const paymentIdempotency=(sandbox?"pagbank-sandbox-":"mock-")+reservationId;
  const {data:payment,error:payErr}=await admin.from("payments").insert({
    reservation_id:reservationId,user_id:user.id,provider:sandbox?"pagbank_sandbox":"mock",
    method:method==="pix"?"pix":method==="card"?"card":"mock",
    installments:method==="card"?Number(installments):null,
    amount_cents:Number(opt.total_amount_cents),
    status:"awaiting_payment",idempotency_key:paymentIdempotency,
    metadata:{development:true,environment:sandbox?"sandbox":"mock"}
  }).select().single();
  if(payErr) return json({ok:false,error:"payment_create_failed"},500);

  const ledger:any[]=[
    {reservation_id:reservationId,payment_id:payment.id,entry_type:"accommodation",amount_cents:Number(opt.accommodation_amount_cents),description:"Hospedagem"},
    {reservation_id:reservationId,payment_id:payment.id,entry_type:"cleaning",amount_cents:Number(opt.cleaning_fee_cents),description:"Taxa de limpeza"}
  ];
  if(qitems?.length){
    for(const x of qitems) ledger.push({
      reservation_id:reservationId,payment_id:payment.id,entry_type:"experience",
      amount_cents:Number(x.unit_price_cents)*Number(x.quantity),description:x.product_name_snapshot
    });
  }
  await admin.from("financial_entries").insert(ledger);

  if(sandbox){
    const digits=String(guest_phone).replace(/\D/g,"");
    const phone=digits.startsWith("55")&&digits.length>=12?digits.slice(2):digits;
    const expiry=new Date(Math.min(Date.parse(hold.hold_expires_at),Date.now()+900000));
    let order;
    try{
      order=pagBankOrder({referenceId:payment.id.replace(/-/g,""),amountCents:Number(opt.total_amount_cents),
        customer:{name:guest_name,email:guest_email,taxId:sandboxIdentity.document_number,
          phone:{area:phone.slice(0,2),number:phone.slice(2)}},method,
        expiresAt:expiry,encryptedCard:body?.encrypted_card,installments:Number(installments),
        notificationUrl:projectUrl+"/functions/v1/pagbank-webhook"});
    }catch{return json({ok:false,error:"pagbank_customer_invalid",payment_id:payment.id},400)}
    try{
      const result=await createPagBankOrder("sandbox",sandboxToken,order);
      const {error:saveError}=await admin.from("payments").update({provider_payment_id:result.chargeId,
        metadata:{development:true,environment:"sandbox",order_id:result.orderId}}).eq("id",payment.id);
      if(saveError) throw new Error("pagbank_payment_save_failed");
      if(result.status!=="WAITING") {
        try { await reconcileSandboxCharge(payment.id,result.chargeId,sandboxToken,result.orderId); }
        catch { console.error(JSON.stringify({event:"pagbank_sandbox_reconcile_deferred",payment_id:payment.id})); }
      }
      return json({ok:true,reservation_id:reservationId,confirmation_code:hold.confirmation_code,
        hold_expires_at:hold.hold_expires_at,payment:{...payment,provider:"pagbank_sandbox",
          provider_payment_id:result.chargeId,status:"processing",
          pix_code:result.pixCode,qr_image_url:result.qrImageUrl}});
    }catch{
      console.error(JSON.stringify({event:"pagbank_sandbox_start_failed",payment_id:payment.id}));
      return json({ok:false,error:"pagbank_start_uncertain",payment_id:payment.id},503);
    }
  }

  return json({ok:true,reservation_id:reservationId,confirmation_code:hold.confirmation_code,hold_expires_at:hold.hold_expires_at,payment});
}

async function reconcileSandboxCharge(paymentId:string,chargeId:string,token:string,orderId?:string,postBooking=false){
  let charge;
  try { charge=await getPagBankCharge(token,chargeId); }
  catch(error) {
    if(!orderId) throw error;
    charge=await getPagBankOrderCharge(token,orderId,chargeId);
  }
  if(charge.id!==chargeId||charge.amount?.currency!=="BRL") throw new Error("pagbank_charge_mismatch");
  const {data,error}=await admin.rpc(postBooking?"reconcile_pagbank_post_booking_payment":"reconcile_pagbank_sandbox_payment",{
    p_payment_id:paymentId,p_charge_id:chargeId,p_status:charge.status,
    p_amount_cents:Number(charge.amount.value)});
  if(error) throw error;
  return Array.isArray(data)?data[0]:data;
}

async function sandboxPaymentStatus(req:Request,body:any,development:boolean){
  if(!development) return json({ok:false,error:"not_allowed"},403);
  const user=await currentUser(req);
  if(!user) return json({ok:false,error:"authentication_required"},401);
  const token=Deno.env.get("PAGBANK_SANDBOX_TOKEN")||"";
  let paymentQuery=admin.from("payments")
    .select("id,user_id,provider,provider_payment_id,status,metadata,amount_cents,reservations(status)")
    .eq("user_id",user.id).eq("provider","pagbank_sandbox");
  if(body?.payment_id) paymentQuery=paymentQuery.eq("id",String(body.payment_id));
  else paymentQuery=paymentQuery.gte("created_at",new Date(Date.now()-86400000).toISOString()).order("created_at",{ascending:false}).limit(1);
  const {data:rows}=await paymentQuery.limit(1);
  const p=rows?.[0];
  if(!p||p.user_id!==user.id||p.provider!=="pagbank_sandbox") return json({ok:false,error:"not_found"},404);
  if(p.provider_payment_id && token) {
    try { await reconcileSandboxCharge(p.id,p.provider_payment_id,token,p.metadata?.order_id,p.metadata?.kind==="post_booking_charge"); }
    catch { console.error(JSON.stringify({event:"pagbank_sandbox_status_deferred",payment_id:p.id})); }
  }
  const {data:latest}=await admin.from("payments").select("status,metadata,reservations(status)").eq("id",p.id).single();
  const {data:postCharge}=p.metadata?.kind==="post_booking_charge"
    ?await admin.from("post_booking_charges").select("status").eq("payment_id",p.id).maybeSingle()
    :{data:null};
  return json({ok:true,payment_id:p.id,amount_cents:p.amount_cents,payment_status:latest?.status||p.status,
    charge_status:postCharge?.status||null,
    reservation_status:(latest?.reservations as any)?.status||null,
    manual_review:latest?.metadata?.manual_review||null});
}

async function reservationPolicy(req:Request,body:any){
  const user=await currentUser(req);
  if(!user) return json({ok:false,error:"authentication_required"},401);
  const reservationId=String(body?.reservation_id||"");
  if(!reservationId) return json({ok:false,error:"missing_data"},400);
  const {data:reservation,error:reservationError}=await admin.from("reservations")
    .select("id,user_id,confirmation_code").eq("id",reservationId).single();
  if(reservationError||!reservation||reservation.user_id!==user.id) return json({ok:false,error:"not_found"},404);
  const {data:rows,error}=await admin.from("reservation_policy_acceptances")
    .select("document_code,document_version,accepted_at,policy_documents(title,body,code,version)")
    .eq("reservation_id",reservationId).order("accepted_at");
  if(error) return json({ok:false,error:"policy_unavailable"},500);
  return json({ok:true,confirmation_code:reservation.confirmation_code,documents:(rows||[]).map((a:any)=>({
    code:a.document_code,version:a.document_version,accepted_at:a.accepted_at,
    title:a.policy_documents?.title||"Política de cancelamento",body:a.policy_documents?.body||""
  }))});
}

async function cancelPendingPayment(req:Request,body:any,development:boolean){
  const user=await currentUser(req);
  if(!user) return json({ok:false,error:"authentication_required"},401);
  if(!development) return json({ok:false,error:"not_allowed"},403);
  const paymentId=String(body?.payment_id||"");
  if(!paymentId) return json({ok:false,error:"missing_data"},400);

  const {data:settings}=await admin.from("payment_settings").select("active_provider").eq("id",1).single();
  if(settings?.active_provider!=="mock") return json({ok:false,error:"not_allowed"},403);

  const {data,error}=await admin.rpc("cancel_pending_payment_mock_atomic",{
    p_payment_id:paymentId,p_user_id:user.id
  });
  if(error){
    const msg=String(error.message||"");
    if(msg.includes("not_found")) return json({ok:false,error:"not_found"},404);
    if(msg.includes("payment_not_cancellable")) return json({ok:false,error:"payment_not_cancellable"},409);
    return json({ok:false,error:"cancel_payment_failed"},500);
  }
  const row=Array.isArray(data)?data[0]:data;
  return json({
    ok:true,
    payment_status:row?.result_payment_status||"cancelled",
    reservation_status:row?.result_reservation_status||"not_confirmed",
    reservation_id:row?.result_reservation_id||null
  });
}

async function mockPayment(req:Request,body:any,development:boolean){
  if(!development) return json({ok:false,error:"not_allowed"},403);
  const user=await currentUser(req);
  if(!user) return json({ok:false,error:"authentication_required"},401);
  const {payment_id,outcome}=body||{};
  const {data:p}=await admin.from("payments").select("*,reservations(id,user_id,property_id)").eq("id",payment_id).single();
  if(!p || (p as any).user_id!==user.id) return json({ok:false,error:"not_found"},404);
  if(p.provider!=="mock")
    return json({ok:false,error:"not_allowed"},403);
  const allowed=["paid","refused","under_review","expired"];
  if(!allowed.includes(outcome)) return json({ok:false,error:"invalid_outcome"},400);

  const isPostCharge=(p as any).metadata?.kind==="post_booking_charge";
  if(isPostCharge){
    if(outcome==="paid"){
      const {data,error}=await admin.rpc("finalize_post_booking_charge_atomic",{p_payment_id:payment_id,p_user_id:user.id});
      if(error){
        const msg=String(error.message||"");
        for(const code of ["payment_not_found","charge_not_found","charge_expired","payment_state_final","reservation_not_available","modification_not_payable","dates_unavailable","experience_upgrade_not_available","experience_category_conflict"])
          if(msg.includes(code)) return json({ok:false,error:code},409);
        return json({ok:false,error:"post_booking_finalize_failed"},500);
      }
      const row=Array.isArray(data)?data[0]:data;
      return json({ok:true,outcome:"paid",charge_id:row?.result_charge_id||null,charge_status:row?.result_status||"applied",amount_cents:Number(row?.result_amount_cents||0),total_amount:Number(row?.result_total_amount||0)});
    }

    const {data,error}=await admin.rpc("update_post_booking_payment_state_atomic",{p_payment_id:payment_id,p_user_id:user.id,p_outcome:outcome});
    if(error){
      const msg=String(error.message||"");
      for(const code of ["payment_not_found","charge_not_found","payment_state_final","invalid_outcome"])
        if(msg.includes(code)) return json({ok:false,error:code},409);
      return json({ok:false,error:"post_booking_payment_state_failed"},500);
    }
    const row=Array.isArray(data)?data[0]:data;
    return json({ok:true,outcome,charge_id:row?.result_charge_id||null,charge_status:row?.result_charge_status||null});
  }

  const {data,error}=await admin.rpc("update_initial_payment_state_mock_atomic",{
    p_payment_id:payment_id,p_user_id:user.id,p_outcome:outcome
  });
  if(error){
    const msg=String(error.message||"");
    for(const code of ["not_found","invalid_outcome","invalid_payment_kind","payment_state_final"])
      if(msg.includes(code)) return json({ok:false,error:code},409);
    if(msg.includes("no_overlapping_reservations")) return json({ok:false,error:"dates_unavailable"},409);
    return json({ok:false,error:"payment_state_update_failed"},500);
  }
  const row=Array.isArray(data)?data[0]:data;
  return json({
    ok:true,outcome,
    payment_status:row?.result_payment_status||outcome,
    reservation_status:row?.result_reservation_status||null,
    reservation_id:row?.result_reservation_id||(p as any).reservation_id
  });
}

async function userIsAdmin(user:any){
  if(!user) return false;
  const {data}=await admin.from("profiles").select("role").eq("id",user.id).maybeSingle();
  return data?.role==="admin";
}

async function requestModification(req:Request,body:any,development:boolean){
  const user=await currentUser(req);
  if(!user) return json({ok:false,error:"authentication_required"},401);
  const {reservation_id,requested_check_in,requested_check_out,requested_property_id}=body||{};
  const {data:r}=await admin.from("reservations").select("id,user_id,property_id,guests,stay_amount,total_amount,rate_plan_code,check_in,check_out,status").eq("id",reservation_id).single();
  if(!r || r.user_id!==user.id) return json({ok:false,error:"not_found"},404);
  if(!["confirmed","pending_payment"].includes(r.status)) return json({ok:false,error:"reservation_not_changeable"},409);
  const {data:openRequest}=await admin.from("modification_requests")
    .select("id,status,requested_check_in,requested_check_out,requested_property_id,reference_amount_cents,estimated_additional_amount_cents,admin_additional_amount_cents,created_at")
    .eq("reservation_id",r.id)
    .in("status",["requested","quoted","awaiting_guest_acceptance","awaiting_payment","accepted"])
    .order("created_at",{ascending:false})
    .limit(1)
    .maybeSingle();
  if(openRequest) return json({ok:false,error:"modification_already_open",request:openRequest},409);
  const targetProperty=Number(requested_property_id||r.property_id);
  let quote;
  try{
    quote=await createQuote({property_id:targetProperty,check_in:requested_check_in,check_out:requested_check_out,guests:r.guests,experience_variant_ids:[]},development,r.id);
  }catch(e){
    const msg=String((e as Error).message||"modification_quote_failed");
    const minMatch=/^minimum_stay:(\d+)$/.exec(msg);
    if(minMatch) return json({ok:false,error:"minimum_stay",min_stay:Number(minMatch[1])},409);
    return json({ok:false,error:msg},409);
  }
  const option=quote.rate_options.find((x:any)=>x.code===r.rate_plan_code && x.selectable);
  if(!option) return json({ok:false,error:"original_rate_unavailable"},409);
  // Include prior paid date/property changes in the price already committed by the guest.
  const {data:appliedChanges,error:appliedError}=await admin.from("modification_requests")
    .select("admin_additional_amount_cents").eq("reservation_id",r.id).eq("status","applied");
  if(appliedError) return json({ok:false,error:"modification_history_unavailable"},500);
  const originalCents=Math.round(Number(r.stay_amount||0)*100)+(appliedChanges||[])
    .reduce((sum:number,x:any)=>sum+Number(x.admin_additional_amount_cents||0),0);
  const referenceCents=Number(option?.stay_amount_cents||0);
  const estimatedAdditional=Math.max(0,referenceCents-originalCents);
  const {data:m,error}=await admin.from("modification_requests").insert({
    reservation_id:r.id,user_id:user.id,request_type:targetProperty===Number(r.property_id)?"dates":"property",
    requested_check_in,requested_check_out,requested_property_id:targetProperty,reference_quote_id:quote.quote_id,
    original_amount_cents:originalCents,reference_amount_cents:referenceCents,
    estimated_additional_amount_cents:estimatedAdditional,status:"quoted"
  }).select().single();
  if(error){
    if(String(error.code)==="23505") return json({ok:false,error:"modification_already_open"},409);
    return json({ok:false,error:"modification_create_failed"},500);
  }
  await admin.from("reservation_change_events").insert({
    reservation_id:r.id,modification_request_id:m.id,event_type:"quoted",
    before_snapshot:{property_id:r.property_id,check_in:r.check_in,check_out:r.check_out,total_amount:r.total_amount,rate_plan_code:r.rate_plan_code},
    after_snapshot:{requested_property_id:targetProperty,requested_check_in,requested_check_out,reference_amount_cents:referenceCents,estimated_additional_amount_cents:estimatedAdditional},
    actor_user_id:user.id
  });
  return json({ok:true,request:m,reference_quote:quote});
}

async function modificationAction(req:Request,body:any,development:boolean){
  const user=await currentUser(req);
  if(!user) return json({ok:false,error:"authentication_required"},401);
  const action=body?.operation;
  const requestId=body?.request_id;
  const {data:m}=await admin.from("modification_requests").select("*,reservations(*)").eq("id",requestId).single();
  if(!m) return json({ok:false,error:"not_found"},404);

  if(action==="guest_cancel"){
    if(m.user_id!==user.id) return json({ok:false,error:"not_allowed"},403);

    if(m.status==="awaiting_payment"&&m.payment_charge_id){
      const {data,error}=await admin.rpc("cancel_post_booking_charge_atomic",{p_charge_id:m.payment_charge_id,p_user_id:user.id});
      if(error){
        const msg=String(error.message||"");
        if(msg.includes("payment_processing")) return json({ok:false,error:"payment_processing"},409);
        if(msg.includes("charge_already_applied")||msg.includes("charge_already_paid")) return json({ok:false,error:"not_allowed"},403);
        return json({ok:false,error:"modification_cancel_failed"},500);
      }
      const row=Array.isArray(data)?data[0]:data;
      return json({ok:true,status:row?.result_modification_status||"cancelled"});
    }

    if(!["requested","quoted","awaiting_guest_acceptance","accepted"].includes(m.status))
      return json({ok:false,error:"not_allowed"},403);

    await admin.from("modification_requests").update({status:"cancelled",updated_at:new Date().toISOString()}).eq("id",m.id);
    await admin.from("reservation_change_events").insert({reservation_id:m.reservation_id,modification_request_id:m.id,event_type:"cancelled",actor_user_id:user.id});
    return json({ok:true,status:"cancelled"});
  }

  if(action==="guest_accept"){
    if(m.user_id!==user.id || m.status!=="awaiting_guest_acceptance") return json({ok:false,error:"not_allowed"},403);
    await admin.from("modification_requests").update({status:"accepted",guest_accepted_at:new Date().toISOString()}).eq("id",m.id);
    await admin.from("reservation_change_events").insert({reservation_id:m.reservation_id,modification_request_id:m.id,event_type:"guest_accepted",amount_cents:m.admin_additional_amount_cents,actor_user_id:user.id});
    return json({ok:true,status:"accepted"});
  }

  if(!(await userIsAdmin(user))) return json({ok:false,error:"admin_required"},403);

  if(action==="decide"){
    const decision=body?.decision;
    if(decision==="reject"){
      if(!["requested","quoted"].includes(m.status)) return json({ok:false,error:"modification_not_approvable"},409);
      await admin.from("modification_requests").update({status:"rejected",admin_note:body?.admin_note||null,decided_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",m.id);
      await admin.from("reservation_change_events").insert({reservation_id:m.reservation_id,modification_request_id:m.id,event_type:"rejected",actor_user_id:user.id});
      return json({ok:true,status:"rejected"});
    }

    if(!["requested","quoted"].includes(m.status)) return json({ok:false,error:"modification_not_approvable"},409);

    const targetProperty=Number(m.requested_property_id||m.reservations?.property_id);
    const targetIn=String(m.requested_check_in||m.reservations?.check_in||"");
    const targetOut=String(m.requested_check_out||m.reservations?.check_out||"");
    const listings=await searchData(targetIn,targetOut,Number(m.reservations?.guests||2),m.reservation_id,development);
    const target=listings.find((x:any)=>Number(x.id)===targetProperty);
    if(!target?.available){
      if(target?.unavailable_reason==="minimum_stay") return json({ok:false,error:"minimum_stay",min_stay:Number(target.min_stay||1)},409);
      return json({ok:false,error:target?.unavailable_reason||"dates_unavailable"},409);
    }

    // Refresh availability and price when approving; the request-time quote only lasts 15 minutes.
    let currentQuote:any;
    try{
      currentQuote=await createQuote({property_id:targetProperty,check_in:targetIn,check_out:targetOut,
        guests:Number(m.reservations?.guests||2),experience_variant_ids:[]},development,m.reservation_id);
    }catch(e){
      const message=String((e as Error)?.message||"modification_quote_failed");
      const min=/^minimum_stay:(\d+)$/.exec(message);
      return json({ok:false,error:min?"minimum_stay":message,min_stay:min?Number(min[1]):undefined},409);
    }
    const currentOption=currentQuote.rate_options.find((x:any)=>x.code===m.reservations?.rate_plan_code&&x.selectable);
    if(!currentOption) return json({ok:false,error:"original_rate_unavailable"},409);
    const freshReference=Number(currentOption.stay_amount_cents);
    const {error:repriceError}=await admin.from("modification_requests").update({
      reference_quote_id:currentQuote.quote_id,reference_amount_cents:freshReference,
      estimated_additional_amount_cents:Math.max(0,freshReference-Number(m.original_amount_cents))
    }).eq("id",m.id).in("status",["requested","quoted"]);
    if(repriceError) return json({ok:false,error:"modification_reprice_failed"},500);
    if(freshReference!==Number(m.reference_amount_cents))
      return json({ok:false,error:"modification_price_changed",reference_amount_cents:freshReference,
        additional_amount_cents:Math.max(0,freshReference-Number(m.original_amount_cents))},409);
    // The approved charge is calculated server-side; a cheaper replacement keeps the paid price.
    const originalCents=Number(m.original_amount_cents);
    const referenceCents=freshReference;
    if(!Number.isSafeInteger(originalCents)||!Number.isSafeInteger(referenceCents)||originalCents<0||referenceCents<0)
      return json({ok:false,error:"invalid_modification_quote"},409);
    const amount=Math.max(0,referenceCents-originalCents);
    const {data:settings}=await admin.from("payment_settings").select("modification_payment_deadline_hours").eq("id",1).single();
    const {data,error}=await admin.rpc("create_modification_charge_atomic",{
      p_request_id:m.id,
      p_admin_id:user.id,
      p_amount_cents:amount,
      p_deadline_hours:Number(settings?.modification_payment_deadline_hours||24),
      p_admin_note:body?.admin_note||null
    });
    if(error){
      const msg=String(error.message||"");
      for(const code of ["dates_unavailable","modification_not_approvable","reservation_not_changeable","modification_payment_deadline_passed","invalid_dates"])
        if(msg.includes(code)) return json({ok:false,error:code},409);
      return json({ok:false,error:"modification_approval_failed"},500);
    }
    const row=Array.isArray(data)?data[0]:data;
    return json({ok:true,status:"awaiting_payment",charge:{
      id:row?.charge_id||null,
      amount_cents:Number(row?.amount_cents||0),
      expires_at:row?.expires_at||null,
      reminder_at:row?.reminder_at||null
    }});
  }

  // Legacy path only for requests accepted before the payment-required workflow.
  if(action==="apply"){
    if(m.status!=="accepted") return json({ok:false,error:"guest_acceptance_required"},409);
    const {data:rpc,error:rpcErr}=await admin.rpc("apply_modification_mock_atomic",{p_request_id:m.id,p_actor_user_id:user.id});
    if(rpcErr) return json({ok:false,error:"modification_apply_failed"},500);
    const row=Array.isArray(rpc)?rpc[0]:rpc;
    return json({ok:true,status:"applied",payment_id:row?.result_payment_id||null,total_amount:row?.result_total_amount||null});
  }

  return json({ok:false,error:"invalid_operation"},400);
}

async function opsData(req:Request){
  const user=await currentUser(req);
  if(!user || !(await userIsAdmin(user))) return json({ok:false,error:"admin_required"},403);
  const [{data:mods},{data:guarantees},{data:payments},{data:charges},{data:settings},{data:properties},{data:integrations},{data:notifications}] = await Promise.all([
    admin.from("modification_requests").select("*,reservations(confirmation_code,check_in,check_out,total_amount,properties(name))").order("created_at",{ascending:false}).limit(50),
    admin.from("guarantees").select("*,reservations(confirmation_code,properties(name)),incidents(*)").order("created_at",{ascending:false}).limit(50),
    admin.from("payments").select("id,reservation_id,provider,method,installments,amount_cents,status,created_at,reservations(confirmation_code,properties(name))").order("created_at",{ascending:false}).limit(50),
    admin.from("post_booking_charges").select("id,reservation_id,kind,description,amount_cents,status,expires_at,created_at,reservations(confirmation_code,properties(name))").order("created_at",{ascending:false}).limit(50),
    admin.from("payment_settings").select("*").eq("id",1).single(),
    admin.from("properties").select("id,code,name,active,cleaning_fee,guarantee_amount_cents,max_guests").order("id"),
    admin.from("property_integrations").select("property_id,provider,environment_key,external_listing_id,active").order("provider"),
    admin.from("notification_outbox").select("id,template_code,status,send_after,attempt_count,max_attempts,last_error,created_at,reservations(confirmation_code)").order("created_at",{ascending:false}).limit(50)
  ]);
  const bookingConfigured=bookingFeeds.map(x=>({name:x.name,environment_key:x.env,configured:Boolean(Deno.env.get(x.env))}));
  return json({ok:true,modifications:mods||[],guarantees:guarantees||[],payments:payments||[],charges:charges||[],settings:settings||null,properties:properties||[],integrations:integrations||[],booking_configured:bookingConfigured,notifications:notifications||[]});
}

function localDate(offsetDays=0){
  const now=new Date(Date.now()+offsetDays*86400000);
  return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
}

async function adminHubData(req:Request,body:any){
  const user=await currentUser(req);
  if(!user || !(await userIsAdmin(user))) return json({ok:false,error:"admin_required"},403);
  const start=validDate(String(body?.start||""))?String(body.start):localDate(-31);
  const end=validDate(String(body?.end||""))?String(body.end):localDate(185);
  if(end<=start) return json({ok:false,error:"invalid_dates"},400);

  const [propertiesQ,reservationsQ,notificationsQ,integrationsQ,settingsQ,blocksQ,airbnb,booking] = await Promise.all([
    admin.from("properties").select("id,code,name,slug,property_type,tagline,summary,cover_image,gallery,features,active,cleaning_fee,max_guests,guarantee_amount_cents,check_in_time,check_out_time,timezone,created_at,updated_at").order("id"),
    admin.from("reservations").select("id,property_id,user_id,check_in,check_out,status,source,guests,guest_name,guest_email,guest_phone,stay_amount,experience_amount,total_amount,rate_plan_code,confirmation_code,hold_expires_at,created_at,updated_at,confirmed_at,cancelled_at,not_confirmed_at,not_confirmed_reason,cancellation_actor,cancellation_reason,no_show_at,operational_status,checked_in_at,checked_out_at").lte("check_in",end).gte("check_out",start).order("created_at",{ascending:false}).limit(750),
    admin.from("admin_notifications").select("id,notification_type,severity,title,message,reservation_id,entity_type,entity_id,payload,read_at,created_at").order("created_at",{ascending:false}).limit(150),
    admin.from("property_integrations").select("id,property_id,provider,external_listing_id,pms,environment_key,active,updated_at").order("provider"),
    admin.from("payment_settings").select("*").eq("id",1).single(),
    admin.from("pms_calendar_blocks").select("*").gte("end_date",start).lte("start_date",end).order("start_date"),
    prodJson("/api/ical-airbnb-all").catch(()=>({ok:false,listings:[]})),
    bookingCalendarData().catch(()=>({configured:bookingIcalConfigured(),ok:false,listings:[]}))
  ]);
  if(propertiesQ.error||reservationsQ.error||notificationsQ.error||integrationsQ.error||settingsQ.error||blocksQ.error)
    return json({ok:false,error:"admin_hub_unavailable"},500);
  let cancellationPolicies:any[];
  try { cancellationPolicies=await developmentPolicies(); }
  catch { return json({ok:false,error:"cancellation_policy_unavailable"},500); }

  const reservations=reservationsQ.data||[];
  const reservationIds=reservations.map((r:any)=>r.id);
  const empty:any[]=[];
  const [paymentsQ,ordersQ,chargesQ,modsQ,guaranteesQ,notesQ,ledgerQ] = reservationIds.length ? await Promise.all([
    admin.from("payments").select("id,reservation_id,provider,provider_payment_id,method,installments,amount_cents,status,metadata,created_at,updated_at").in("reservation_id",reservationIds).order("created_at",{ascending:false}),
    admin.from("experience_orders").select("id,reservation_id,status,created_at,experience_order_items(id,product_id,variant_id,product_name_snapshot,variant_name_snapshot,unit_price_cents,quantity,status,created_at)").in("reservation_id",reservationIds).order("created_at",{ascending:false}),
    admin.from("post_booking_charges").select("id,reservation_id,kind,status,amount_cents,payment_id,description,snapshot,expires_at,applied_at,created_at,updated_at").in("reservation_id",reservationIds).order("created_at",{ascending:false}),
    admin.from("modification_requests").select("id,reservation_id,request_type,requested_check_in,requested_check_out,requested_property_id,status,admin_additional_amount_cents,estimated_additional_amount_cents,admin_note,payment_due_at,created_at,updated_at").in("reservation_id",reservationIds).order("created_at",{ascending:false}),
    admin.from("guarantees").select("id,reservation_id,provider,amount_cents,captured_amount_cents,status,created_at,updated_at,incidents(id,description,requested_capture_cents,status,created_at,resolved_at)").in("reservation_id",reservationIds).order("created_at",{ascending:false}),
    admin.from("reservation_notes").select("id,reservation_id,author_user_id,note,created_at").in("reservation_id",reservationIds).order("created_at",{ascending:false}),
    admin.from("financial_entries").select("id,reservation_id,payment_id,experience_order_item_id,entry_type,amount_cents,currency,description,created_at").in("reservation_id",reservationIds).order("created_at",{ascending:false})
  ]) : [{data:empty},{data:empty},{data:empty},{data:empty},{data:empty},{data:empty},{data:empty}];

  const properties=propertiesQ.data||[];
  const propertyByName=new Map(properties.map((p:any)=>[String(p.name),p]));
  const channelPeriods:any[]=[];
  for(const listing of airbnb?.listings||[]){
    const p=propertyByName.get(String(listing.name));
    if(!p) continue;
    for(const period of listing.periods||[]) if(period.start<end&&period.end>start)
      channelPeriods.push({id:`airbnb:${p.id}:${period.start}:${period.end}`,property_id:p.id,source:"airbnb",start:period.start,end:period.end,status:listing.ok?"blocked":"integration_error"});
  }
  for(const listing of booking?.listings||[]){
    const p=propertyByName.get(String(listing.name));
    if(!p) continue;
    for(const period of listing.periods||[]) if(period.start<end&&period.end>start)
      channelPeriods.push({id:`booking:${p.id}:${period.start}:${period.end}`,property_id:p.id,source:"booking",start:period.start,end:period.end,status:listing.ok?"blocked":"integration_error"});
  }

  return json({
    ok:true,server_now:new Date().toISOString(),range:{start,end},properties,reservations,
    payments:paymentsQ.data||[],experience_orders:ordersQ.data||[],charges:chargesQ.data||[],
    modifications:modsQ.data||[],guarantees:guaranteesQ.data||[],notes:notesQ.data||[],ledger:ledgerQ.data||[],
    notifications:notificationsQ.data||[],integrations:integrationsQ.data||[],settings:settingsQ.data||{},
    cancellation_policies:cancellationPolicies,
    calendar_blocks:blocksQ.data||[],
    channel_periods:channelPeriods,
    channel_health:{airbnb:Boolean(airbnb?.ok),booking_configured:Boolean(booking?.configured),booking:Boolean(booking?.ok)}
  });
}

async function adminCancellationPolicyAction(req:Request,body:any,development:boolean){
  if(!development) return json({ok:false,error:"development_only"},403);
  const user=await currentUser(req);
  if(!user || !(await userIsAdmin(user))) return json({ok:false,error:"admin_required"},403);
  const code=String(body?.rate_plan_code||"");
  const withdrawal=Number(body?.withdrawal_days);
  const full=Number(body?.full_refund_days_before_checkin);
  const late=Number(body?.late_accommodation_refund_percent);
  if(!["refundable","non_refundable"].includes(code)||![withdrawal,full,late].every(Number.isInteger)
     ||withdrawal<7||withdrawal>30||full<1||full>365||late<0||late>100||(code==="non_refundable"&&late!==0))
    return json({ok:false,error:"invalid_policy_configuration"},400);
  const {data,error}=await admin.rpc("save_development_cancellation_policy",{
    p_rate_plan_code:code,p_withdrawal_days:withdrawal,
    p_full_refund_days_before_checkin:full,p_late_accommodation_refund_percent:late
  });
  if(error) return json({ok:false,error:"policy_save_failed"},500);
  return json({ok:true,document_id:data});
}

async function reservationRefundAction(req:Request,body:any,development:boolean){
  if(!development) return json({ok:false,error:"development_only"},403);
  const user=await currentUser(req);
  if(!user||!(await userIsAdmin(user))) return json({ok:false,error:"admin_required"},403);
  const reservationId=String(body?.reservation_id||""),operation=String(body?.operation||"");
  const kind=body?.kind==="voluntary_refund"?"voluntary_refund":"policy_cancellation";
  const {data:r}=await admin.from("reservations").select("id,status,rate_plan_code,check_in,checked_in_at,created_at")
    .eq("id",reservationId).maybeSingle();
  if(!r) return json({ok:false,error:"reservation_not_found"},404);
  if(operation==="list"){
    const {data:cases}=await admin.from("reservation_cancellations")
      .select("id,kind,status,reason,refund_due_cents,created_at")
      .eq("reservation_id",r.id).order("created_at",{ascending:false});
    return json({ok:true,cases:cases||[]});
  }
  if(r.status!=="confirmed") return json({ok:false,error:"reservation_not_confirmed"},409);
  if(r.checked_in_at) return json({ok:false,error:"individual_review_required"},409);
  const requestKey=String(body?.operation_key||"");
  if(kind==="voluntary_refund"&&operation==="prepare"&&!/^[0-9a-f-]{36}$/i.test(requestKey))
    return json({ok:false,error:"operation_key_required"},400);
  const caseQuery=admin.from("reservation_cancellations").select("*")
    .eq("reservation_id",r.id).eq("kind",kind);
  const {data:existing}=kind==="voluntary_refund"?
    (body?.case_id?await caseQuery.eq("id",String(body.case_id)).maybeSingle():
      operation==="prepare"?await caseQuery.eq("operation_key",requestKey).maybeSingle():{data:null}):
    await caseQuery.maybeSingle();
  let cancellation=existing;
  if(operation==="prepare"&&!cancellation){
    const reason=String(body?.reason||"").trim().slice(0,1000);
    if(!reason) return json({ok:false,error:"reason_required"},400);
    if(kind==="voluntary_refund"&&body?.case_id) return json({ok:false,error:"case_not_found"},404);
    const {data:request}=body?.guest_request_id&&kind==="policy_cancellation"?
      await admin.from("reservation_cancel_requests").select("id,reservation_id,status,requested_at,reason")
        .eq("id",String(body.guest_request_id)).eq("reservation_id",r.id).maybeSingle():{data:null};
    if(body?.guest_request_id&&(!request||request.status!=="requested"))
      return json({ok:false,error:"guest_request_not_pending"},409);
    const requestedAt=request?.requested_at||new Date().toISOString();
    const {data:accepted}=await admin.from("reservation_policy_acceptances")
      .select("document_id,document_version,accepted_at,document_code")
      .eq("reservation_id",r.id).eq("document_code",r.rate_plan_code+"_v1")
      .order("accepted_at",{ascending:true}).limit(1).maybeSingle();
    if(!accepted) return json({ok:false,error:"accepted_policy_missing"},409);
    const {data:rule}=await admin.from("cancellation_policy_rules").select("*")
      .eq("document_id",accepted.document_id).eq("rate_plan_code",r.rate_plan_code).maybeSingle();
    if(!rule) return json({ok:false,error:"accepted_policy_rule_missing"},409);
    const {data:payments,error:paymentsError}=await admin.from("payments")
      .select("id,provider,provider_payment_id,amount_cents,status")
      .eq("reservation_id",r.id).eq("provider","pagbank_sandbox")
      .in("status",["paid","refunded"]).order("created_at");
    if(paymentsError||!payments?.length||payments.some((p:any)=>!p.provider_payment_id))
      return json({ok:false,error:"captured_charges_required"},409);
    const {data:entries,error:entriesError}=await admin.from("financial_entries")
      .select("payment_id,entry_type,amount_cents").eq("reservation_id",r.id);
    if(entriesError) return json({ok:false,error:"ledger_unavailable"},503);
    const allocations:any[]=[];
    for(const p of payments){
      const lines=(entries||[]).filter((e:any)=>e.payment_id===p.id && e.entry_type!=="refund");
      if(lines.some((e:any)=>!Number.isSafeInteger(Number(e.amount_cents))||Number(e.amount_cents)<0||
        !["accommodation","cleaning","experience","upgrade","additional_charge"].includes(e.entry_type))||
        lines.reduce((sum:number,e:any)=>sum+Number(e.amount_cents),0)!==Number(p.amount_cents))
        return json({ok:false,error:"ledger_review_required",payment_id:p.id},409);
      const sum=(kind:string)=>lines.filter((e:any)=>e.entry_type===kind)
        .reduce((total:number,e:any)=>total+Number(e.amount_cents),0);
      const calculation=kind==="voluntary_refund"?null:calculateCancellationRefund({
        plan:r.rate_plan_code,acceptedAt:accepted.accepted_at,requestedAt:requestedAt,checkIn:r.check_in,
        withdrawalDays:Number(rule.withdrawal_days),fullRefundDaysBeforeCheckIn:Number(rule.full_refund_days_before_checkin),
        lateAccommodationRefundPercent:Number(rule.late_accommodation_refund_percent),
        accommodationCents:sum("accommodation"),paidModificationCents:sum("additional_charge"),
        cleaningCents:sum("cleaning"),unprovidedExperiencesCents:sum("experience")+sum("upgrade")
      });
      if(calculation?.requiresReview) return json({ok:false,error:"individual_review_required"},409);
      const {data:previous,error:previousError}=await admin.from("reservation_refunds")
        .select("confirmed_cents,state").eq("payment_id",p.id);
      if(previousError) return json({ok:false,error:"refund_history_unavailable"},503);
      if(kind==="policy_cancellation"&&(previous||[]).some((v:any)=>["prepared","dispatching","uncertain"].includes(v.state)))
        return json({ok:false,error:"previous_refund_pending"},409);
      const alreadyReturned=(previous||[]).reduce((s:number,v:any)=>s+Number(v.confirmed_cents),0);
      allocations.push({payment_id:p.id,charge_id:p.provider_payment_id,captured_cents:Number(p.amount_cents),
        refund_cents:Math.max(0,(calculation?.totalRefundCents||0)-alreadyReturned),
        previously_refunded_cents:alreadyReturned,calculation});
    }
    if(kind==="voluntary_refund"){
      const amount=Number(body?.amount_cents);
      if(!Number.isSafeInteger(amount)||amount<1) return json({ok:false,error:"invalid_refund_amount"},400);
      const {data:allRefunds,error:allRefundsError}=await admin.from("reservation_refunds")
        .select("payment_id,requested_cents,state").in("payment_id",allocations.map(x=>x.payment_id));
      if(allRefundsError) return json({ok:false,error:"refund_history_unavailable"},503);
      let remaining=amount;
      for(const x of allocations){
        const reserved=(allRefunds||[]).filter((v:any)=>v.payment_id===x.payment_id&&v.state!=="failed")
          .reduce((s:number,v:any)=>s+Number(v.requested_cents),0);
        x.refund_cents=Math.min(remaining,Math.max(0,x.captured_cents-reserved));
        x.calculation={reason:"voluntary_refund",refund_cents:x.refund_cents};
        remaining-=x.refund_cents;
      }
      if(remaining!==0) return json({ok:false,error:"refund_exceeds_captured"},409);
    }
    const refundDue=allocations.reduce((sum,x)=>sum+x.refund_cents,0);
    const {data:created,error:createError}=await admin.from("reservation_cancellations").insert({
      reservation_id:r.id,actor_user_id:user.id,accepted_document_id:accepted.document_id,
      accepted_version:accepted.document_version,accepted_at:accepted.accepted_at,
      reason:request?.reason||reason,kind,requested_at:requestedAt,guest_request_id:request?.id||null,
      operation_key:kind==="voluntary_refund"?requestKey:null,
      refund_due_cents:refundDue,calculation:{allocations,policy_rule_id:rule.id,requested_at:requestedAt,reason:request?.reason||reason}
    }).select().single();
    if(createError||!created) return json({ok:false,error:"cancellation_prepare_failed"},409);
    cancellation=created;
    for(const x of allocations.filter(x=>x.refund_cents>0)){
      const {error}=await admin.rpc("reserve_reservation_refund",{
        p_cancellation_id:created.id,p_payment_id:x.payment_id,p_charge_id:x.charge_id,p_amount_cents:x.refund_cents});
      if(error) return json({ok:false,error:"refund_allocation_requires_review",cancellation_id:created.id},409);
    }
  }
  if(!cancellation) return json({ok:false,error:"cancellation_not_prepared"},409);
  if(kind==="policy_cancellation"&&body?.guest_request_id&&cancellation.guest_request_id!==String(body.guest_request_id))
    return json({ok:false,error:"cancellation_already_in_progress"},409);
  const {data:refunds,error:refundsError}=await admin.from("reservation_refunds").select("id,payment_id,charge_id,requested_cents,confirmed_cents,state,idempotency_key")
    .eq("cancellation_id",cancellation.id).order("created_at");
  if(refundsError) return json({ok:false,error:"refund_history_unavailable",cancellation_id:cancellation.id},503);
  const due=Number(cancellation.refund_due_cents),allocated=(refunds||[]).reduce((s:number,x:any)=>s+Number(x.requested_cents),0);
  if(allocated!==due) return json({ok:false,error:"refund_allocation_requires_review",cancellation_id:cancellation.id},409);
  if(operation==="prepare"||operation==="status") return json({ok:true,cancellation_id:cancellation.id,kind:cancellation.kind,
    status:cancellation.status,accepted_version:cancellation.accepted_version,calculation:cancellation.calculation,
    refund_due_cents:due,confirmed_cents:(refunds||[]).reduce((s:number,x:any)=>s+Number(x.confirmed_cents),0),
    refunds:(refunds||[]).map((x:any)=>({payment_id:x.payment_id,requested_cents:x.requested_cents,confirmed_cents:x.confirmed_cents,state:x.state}))});
  if(!["approve","reconcile"].includes(operation)) return json({ok:false,error:"invalid_operation"},400);
  const token=Deno.env.get("PAGBANK_SANDBOX_TOKEN")||"";
  if(!token) return json({ok:false,error:"pagbank_sandbox_not_configured"},503);
  const providerChecks:any[]=[];
  async function readRefundCharge(refund:any){
    try{return {charge:await getPagBankCharge(token,refund.charge_id),source:"charge"}}
    catch(chargeError){
      const {data:payment}=await admin.from("payments").select("metadata")
        .eq("id",refund.payment_id).eq("provider_payment_id",refund.charge_id).maybeSingle();
      const orderId=String(payment?.metadata?.order_id||"");
      if(!/^ORDE_[A-Za-z0-9-]+$/.test(orderId)) throw chargeError;
      return {charge:await getPagBankOrderCharge(token,orderId,refund.charge_id),source:"order"};
    }
  }
  if(operation==="approve"){
    if(!["prepared","pending_provider"].includes(cancellation.status))
      return json({ok:false,error:"cancellation_already_submitted"},409);
    if(cancellation.status==="prepared"){
      const {data:activated,error:activationError}=await admin.from("reservation_cancellations")
        .update({status:"pending_provider",approved_at:new Date().toISOString()})
        .eq("id",cancellation.id).eq("status","prepared").select("id").maybeSingle();
      if(activationError||!activated) return json({ok:false,error:"cancellation_already_submitted"},409);
      if(cancellation.guest_request_id){
        const {data:updated}=await admin.from("reservation_cancel_requests")
          .update({status:"approved",decided_by:user.id,decided_at:new Date().toISOString()})
          .eq("id",cancellation.guest_request_id).eq("status","requested").select("id").maybeSingle();
        if(!updated) return json({ok:false,error:"guest_request_state_changed"},409);
      }
    }
    if(due===0&&cancellation.kind==="policy_cancellation"){
      const {error:zeroError}=await admin.rpc("confirm_zero_refund_cancellation",{p_cancellation_id:cancellation.id});
      if(zeroError) return json({ok:false,error:"cancellation_reconciliation_required",cancellation_id:cancellation.id},409);
      return json({ok:true,status:"confirmed",cancellation_id:cancellation.id,refund_due_cents:0,confirmed_cents:0,refunds:[]});
    }
  }
  for(const refund of refunds||[]){
    if(refund.state==="confirmed") continue;
    if(operation==="approve"&&refund.state==="prepared"){
      const {data:claim,error:claimError}=await admin.rpc("claim_reservation_refund",{p_refund_id:refund.id});
      if(claimError) return json({ok:false,error:"refund_claim_unavailable",cancellation_id:cancellation.id},503);
      const row=Array.isArray(claim)?claim[0]:claim;
      if(row){
        let precheckPassed=false;
        try{
          const before=(await readRefundCharge(refund)).charge;
          if(before.id!==row.charge_id||before.status!=="PAID"||before.amount?.currency!=="BRL"||
            Number(before.amount?.value)<Number(row.requested_cents)||
            !Number.isSafeInteger(before.summary?.refunded)||!Number.isSafeInteger(before.summary?.paid))
            throw new Error("provider_precheck_failed");
          const {data:priorRefunds,error:priorError}=await admin.from("reservation_refunds")
            .select("confirmed_cents").eq("payment_id",refund.payment_id).eq("state","confirmed");
          if(priorError) throw new Error("refund_history_unavailable");
          const prior=(priorRefunds||[]).reduce((sum:number,x:any)=>sum+Number(x.confirmed_cents),0);
          if(before.summary.paid!==Number(before.amount.value)||before.summary.refunded!==prior)
            throw new Error("provider_refund_balance_mismatch");
          const {error:dispatchError}=await admin.rpc("mark_refund_dispatch",{p_refund_id:refund.id});
          if(dispatchError) throw new Error("dispatch_not_recorded");
          precheckPassed=true;
          await changePagBankCharge(token,row.charge_id,"cancel",Number(row.requested_cents),row.idempotency_key);
          await admin.from("reservation_refund_attempts").insert({refund_id:refund.id,event:"request_accepted"});
        }catch{
          if(!precheckPassed){
            const {error:resetError}=await admin.rpc("refund_precheck_failed",{p_refund_id:refund.id});
            if(resetError) return json({ok:false,error:"refund_precheck_state_uncertain",cancellation_id:cancellation.id},503);
            providerChecks.push({refund_id:refund.id,status:"precheck_failed"});
            continue;
          }
          await admin.from("reservation_refund_attempts").insert({refund_id:refund.id,event:"request_uncertain"});
        }
        if(precheckPassed) await admin.from("reservation_refunds").update({state:"uncertain"})
          .eq("id",refund.id).eq("state","dispatching");
      }
    }
    if(["dispatching","uncertain"].includes(refund.state)||operation==="approve"&&refund.state==="prepared"){
      try{
        const observed=await readRefundCharge(refund),charge=observed.charge;
        providerChecks.push({refund_id:refund.id,status:charge.status,source:observed.source,
          amount_cents:charge.amount?.currency==="BRL"?Number(charge.amount.value):null,
          provider_refunded_cents:Number.isSafeInteger(charge.summary?.refunded)?charge.summary.refunded:null});
        const {data:priorRefunds,error:priorError}=await admin.from("reservation_refunds")
          .select("confirmed_cents").eq("payment_id",refund.payment_id).eq("state","confirmed");
        if(priorError) throw new Error("refund_history_unavailable");
        const prior=(priorRefunds||[]).reduce((sum:number,x:any)=>sum+Number(x.confirmed_cents),0);
        const {data:originalPayment,error:paymentError}=await admin.from("payments").select("amount_cents")
          .eq("id",refund.payment_id).maybeSingle();
        if(paymentError) throw new Error("payment_unavailable");
        if(charge.id===refund.charge_id&&["PAID","CANCELED"].includes(charge.status)&&
          charge.amount?.currency==="BRL"&&charge.amount.value===Number(originalPayment?.amount_cents)&&
          charge.summary?.paid===Number(originalPayment?.amount_cents)&&
          charge.summary?.refunded===prior+Number(refund.requested_cents)){
          const {error:confirmationError}=await admin.rpc("confirm_reservation_refund",{p_refund_id:refund.id,p_charge_id:refund.charge_id,
            p_provider_status:charge.status,p_provider_paid_cents:charge.summary.paid,
            p_provider_refunded_cents:charge.summary.refunded});
          if(confirmationError) await admin.from("reservation_refund_attempts")
            .insert({refund_id:refund.id,event:"provider_unknown",provider_status:charge.status});
        }
      }catch{providerChecks.push({refund_id:refund.id,status:"unavailable"});}
    }
  }
  const [{data:current,error:currentError},{data:currentRefunds,error:currentRefundsError}]=await Promise.all([
    admin.from("reservation_cancellations").select("status").eq("id",cancellation.id).single(),
    admin.from("reservation_refunds").select("state,requested_cents,confirmed_cents").eq("cancellation_id",cancellation.id)
  ]);
  if(currentError||currentRefundsError) return json({ok:false,error:"refund_reconciliation_unavailable",cancellation_id:cancellation.id},503);
  return json({ok:true,status:current?.status||"pending_provider",cancellation_id:cancellation.id,
    refund_due_cents:due,confirmed_cents:(currentRefunds||[]).reduce((s:number,x:any)=>s+Number(x.confirmed_cents),0),
    refunds:currentRefunds||[],provider_checks:providerChecks});
}

async function reservationRefundStatus(req:Request,body:any,development:boolean){
  if(!development) return json({ok:false,error:"development_only"},403);
  const user=await currentUser(req);
  if(!user) return json({ok:false,error:"authentication_required"},401);
  const reservationId=String(body?.reservation_id||"");
  const {data:r}=await admin.from("reservations").select("id,user_id").eq("id",reservationId).maybeSingle();
  if(!r||r.user_id!==user.id) return json({ok:false,error:"reservation_not_found"},404);
  const {data:cases}=await admin.from("reservation_cancellations")
    .select("id,kind,status,refund_due_cents,accepted_version,created_at")
    .eq("reservation_id",r.id).order("created_at",{ascending:false});
  const {data:refunds}=cases?.length?await admin.from("reservation_refunds")
    .select("cancellation_id,requested_cents,confirmed_cents,state").in("cancellation_id",cases.map((c:any)=>c.id)):{data:[]};
  return json({ok:true,cases:(cases||[]).map((c:any)=>{
    const confirmed=(refunds||[]).filter((x:any)=>x.cancellation_id===c.id)
      .reduce((s:number,x:any)=>s+Number(x.confirmed_cents),0);
    return {kind:c.kind,status:c.status,refund_due_cents:Number(c.refund_due_cents),
      confirmed_cents:confirmed,pending_cents:Number(c.refund_due_cents)-confirmed,
      accepted_version:c.accepted_version,created_at:c.created_at};
  })});
}

async function reservationCancelRequest(req:Request,body:any,development:boolean){
  if(!development) return json({ok:false,error:"development_only"},403);
  const user=await currentUser(req);
  if(!user) return json({ok:false,error:"authentication_required"},401);
  const operation=String(body?.operation||"");
  if(operation==="list"){
    if(!(await userIsAdmin(user))) return json({ok:false,error:"admin_required"},403);
    const {data,error}=await admin.from("reservation_cancel_requests")
      .select("id,reservation_id,reason,requested_at,status,decision_note,cancellation_id")
      .in("status",["requested","approved","processing"]).order("requested_at",{ascending:true});
    return error?json({ok:false,error:"requests_unavailable"},503):json({ok:true,requests:data||[]});
  }
  const reservationId=String(body?.reservation_id||"");
  const {data:r}=await admin.from("reservations")
    .select("id,user_id,status,check_in,checked_in_at").eq("id",reservationId).maybeSingle();
  if(!r) return json({ok:false,error:"reservation_not_found"},404);
  const isAdmin=await userIsAdmin(user);
  if(operation==="request"){
    if(r.user_id!==user.id) return json({ok:false,error:"reservation_not_found"},404);
    if(r.status!=="confirmed"||r.checked_in_at||Date.parse(`${r.check_in}T15:00:00-03:00`)<=Date.now())
      return json({ok:false,error:"cancellation_requires_review"},409);
    const {data:existingCancellation,error:cancelError}=await admin.from("reservation_cancellations")
      .select("id,status").eq("reservation_id",r.id).eq("kind","policy_cancellation").maybeSingle();
    if(cancelError) return json({ok:false,error:"cancellation_unavailable"},503);
    if(existingCancellation) return json({ok:false,error:"cancellation_already_in_progress"},409);
    const reason=String(body?.reason||"").trim().slice(0,1000);
    if(reason.length<5) return json({ok:false,error:"reason_required"},400);
    const {data:existing}=await admin.from("reservation_cancel_requests")
      .select("id,status,requested_at").eq("reservation_id",r.id)
      .in("status",["requested","approved","processing"]).maybeSingle();
    if(existing) return json({ok:true,request:existing});
    const {data,error}=await admin.from("reservation_cancel_requests")
      .insert({reservation_id:r.id,guest_user_id:user.id,reason}).select("id,status,requested_at").single();
    return error?json({ok:false,error:"request_already_exists"},409):json({ok:true,request:data});
  }
  if(operation==="status"){
    if(r.user_id!==user.id&&!isAdmin) return json({ok:false,error:"reservation_not_found"},404);
    const {data}=await admin.from("reservation_cancel_requests")
      .select("id,status,requested_at,decided_at,decision_note,cancellation_id")
      .eq("reservation_id",r.id).order("requested_at",{ascending:false}).limit(5);
    return json({ok:true,requests:data||[]});
  }
  if(operation==="reject"){
    if(!isAdmin) return json({ok:false,error:"admin_required"},403);
    const note=String(body?.decision_note||"").trim().slice(0,1000);
    if(!note) return json({ok:false,error:"reason_required"},400);
    const {data,error}=await admin.from("reservation_cancel_requests")
      .update({status:"rejected",decided_by:user.id,decided_at:new Date().toISOString(),decision_note:note})
      .eq("id",String(body?.request_id||"")).eq("reservation_id",r.id).eq("status","requested")
      .select("id").maybeSingle();
    return error||!data?json({ok:false,error:"request_state_changed"},409):json({ok:true,request_id:data.id,status:"rejected"});
  }
  return json({ok:false,error:"invalid_operation"},400);
}

async function adminReservationAction(req:Request,body:any){
  const user=await currentUser(req);
  if(!user || !(await userIsAdmin(user))) return json({ok:false,error:"admin_required"},403);
  const operation=String(body?.operation||"");

  if(operation==="create_manual"){
    const propertyId=Number(body?.property_id||0);
    const checkIn=String(body?.check_in||""),checkOut=String(body?.check_out||"");
    const guests=Math.max(1,Math.round(Number(body?.guests||1)));
    const guestName=String(body?.guest_name||"").trim().slice(0,200);
    const guestEmail=String(body?.guest_email||"").trim().toLowerCase().slice(0,320)||null;
    const guestPhone=String(body?.guest_phone||"").trim().slice(0,50)||null;
    const total=Math.max(0,Number(body?.total_amount||0));
    if(!propertyId||!validDate(checkIn)||!validDate(checkOut)||checkOut<=checkIn||!guestName) return json({ok:false,error:"invalid_reservation"},400);
    const [{data:property},{data:occupied},{data:changeHolds},{data:blocks},airbnb,booking]=await Promise.all([
      admin.from("properties").select("id,name,max_guests,cleaning_fee,active").eq("id",propertyId).single(),
      admin.from("reservations").select("id").eq("property_id",propertyId).in("status",["hold","pending_payment","confirmed"]).lt("check_in",checkOut).gt("check_out",checkIn).limit(1),
      admin.from("post_booking_charges").select("id").eq("kind","modification").eq("target_property_id",propertyId).in("status",["awaiting_payment","processing","paid"]).gt("expires_at",new Date().toISOString()).lt("target_check_in",checkOut).gt("target_check_out",checkIn).limit(1),
      admin.from("pms_calendar_blocks").select("id").eq("property_id",propertyId).eq("status","active").lt("start_date",checkOut).gt("end_date",checkIn).limit(1),
      prodJson("/api/ical-airbnb-all").catch(()=>({ok:false,listings:[]})),
      bookingCalendarData().catch(()=>({configured:bookingIcalConfigured(),ok:false,listings:[]}))
    ]);
    if(!property||!property.active) return json({ok:false,error:"property_not_found"},404);
    if(guests>Number(property.max_guests)) return json({ok:false,error:"capacity"},409);
    const externalBlocked=(source:any)=>{
      const listing=(source?.listings||[]).find((x:any)=>x.name===property.name);
      return !listing?.ok || (listing.periods||[]).some((x:any)=>overlaps(x.start,x.end,checkIn,checkOut));
    };
    if(occupied?.length||changeHolds?.length||blocks?.length||externalBlocked(airbnb)||(booking.configured&&externalBlocked(booking))) return json({ok:false,error:"occupied"},409);
    const code=crypto.randomUUID().replaceAll("-","").slice(0,10).toUpperCase();
    const cleaning=Number(property.cleaning_fee||0);
    const {data,error}=await admin.from("reservations").insert({
      property_id:propertyId,check_in:checkIn,check_out:checkOut,status:"confirmed",source:"manual",guests,
      guest_name:guestName,guest_email:guestEmail,guest_phone:guestPhone,stay_amount:total,experience_amount:0,
      total_amount:total,accommodation_amount:Math.max(0,total-cleaning),cleaning_fee:cleaning,
      confirmation_code:code,confirmed_at:new Date().toISOString(),operational_status:"upcoming"
    }).select().single();
    if(error||!data){
      if(String(error?.message||"").includes("no_overlapping_active_reservations")) return json({ok:false,error:"occupied"},409);
      return json({ok:false,error:"reservation_create_failed"},500);
    }
    await admin.from("audit_events").insert({actor_user_id:user.id,action:"manual_reservation_created",entity_type:"reservation",entity_id:data.id,new_value:{confirmation_code:code,check_in:checkIn,check_out:checkOut}});
    return json({ok:true,reservation:data});
  }

  const reservationId=String(body?.reservation_id||"");
  const {data:reservation,error}=await admin.from("reservations").select("*").eq("id",reservationId).single();
  if(error||!reservation) return json({ok:false,error:"reservation_not_found"},404);
  const now=new Date().toISOString();
  const todayInBrazil=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());

  if(operation==="add_note"){
    const note=String(body?.note||"").trim().slice(0,2000);
    if(!note) return json({ok:false,error:"note_required"},400);
    const {data,error:noteError}=await admin.from("reservation_notes").insert({reservation_id:reservation.id,author_user_id:user.id,note}).select().single();
    if(noteError) return json({ok:false,error:"note_create_failed"},500);
    return json({ok:true,note:data});
  }
  if(operation==="check_in"){
    if(reservation.status!=="confirmed") return json({ok:false,error:"reservation_not_confirmed"},409);
    if(reservation.check_in>todayInBrazil||reservation.check_out<todayInBrazil||reservation.checked_in_at) return json({ok:false,error:"check_in_not_allowed"},409);
    const {data,error:updateError}=await admin.from("reservations").update({operational_status:"checked_in",checked_in_at:reservation.checked_in_at||now,updated_at:now}).eq("id",reservation.id).select().single();
    if(updateError) return json({ok:false,error:"check_in_failed"},500);
    await admin.from("audit_events").insert({actor_user_id:user.id,action:"reservation_check_in",entity_type:"reservation",entity_id:reservation.id,new_value:{checked_in_at:data.checked_in_at}});
    return json({ok:true,reservation:data});
  }
  if(operation==="check_out"){
    if(reservation.status!=="confirmed") return json({ok:false,error:"reservation_not_confirmed"},409);
    if(reservation.check_in>todayInBrazil||!reservation.checked_in_at||reservation.checked_out_at) return json({ok:false,error:"check_out_not_allowed"},409);
    const {data,error:updateError}=await admin.from("reservations").update({operational_status:"checked_out",checked_out_at:reservation.checked_out_at||now,updated_at:now}).eq("id",reservation.id).select().single();
    if(updateError) return json({ok:false,error:"check_out_failed"},500);
    await admin.from("audit_events").insert({actor_user_id:user.id,action:"reservation_check_out",entity_type:"reservation",entity_id:reservation.id,new_value:{checked_out_at:data.checked_out_at}});
    return json({ok:true,reservation:data});
  }
  if(operation==="set_operational_status"){
    const next=String(body?.status||"");
    if(!["upcoming","preparing","ready","attention"].includes(next)) return json({ok:false,error:"invalid_operational_status"},400);
    const {data,error:updateError}=await admin.from("reservations").update({operational_status:next,updated_at:now}).eq("id",reservation.id).select().single();
    if(updateError) return json({ok:false,error:"status_update_failed"},500);
    return json({ok:true,reservation:data});
  }
  if(operation==="cancel"){
    if(reservation.status!=="confirmed") return json({ok:false,error:"reservation_not_cancellable"},409);
    const reason=String(body?.reason||"").trim().slice(0,1000);
    if(!reason) return json({ok:false,error:"cancellation_reason_required"},400);
    await admin.from("audit_events").insert({actor_user_id:user.id,action:"reservation_cancellation_requested",entity_type:"reservation",entity_id:reservation.id,new_value:{reason,state:"pending_refund_reconciliation"}});
    return json({ok:false,error:"refund_reconciliation_required",status:"pending",reservation_id:reservation.id},409);
  }
  return json({ok:false,error:"invalid_operation"},400);
}

async function adminNotificationAction(req:Request,body:any){
  const user=await currentUser(req);
  if(!user || !(await userIsAdmin(user))) return json({ok:false,error:"admin_required"},403);
  const operation=String(body?.operation||"");
  if(operation==="mark_read"){
    const id=String(body?.notification_id||"");
    const {error}=await admin.from("admin_notifications").update({read_at:new Date().toISOString()}).eq("id",id);
    if(error) return json({ok:false,error:"notification_update_failed"},500);
    return json({ok:true});
  }
  if(operation==="mark_all_read"){
    const {error}=await admin.from("admin_notifications").update({read_at:new Date().toISOString()}).is("read_at",null);
    if(error) return json({ok:false,error:"notification_update_failed"},500);
    return json({ok:true});
  }
  return json({ok:false,error:"invalid_operation"},400);
}

async function adminPropertyAction(req:Request,body:any){
  const user=await currentUser(req);
  if(!user || !(await userIsAdmin(user))) return json({ok:false,error:"admin_required"},403);
  const operation=String(body?.operation||"");
  if(operation!=="save") return json({ok:false,error:"invalid_operation"},400);
  const galleryInput=body?.gallery;
  if(!Array.isArray(galleryInput)||galleryInput.length>40) return json({ok:false,error:"invalid_gallery"},400);
  const gallery=galleryInput.map((item:any)=>({url:String(item?.url||""),alt:String(item?.alt||"").trim().slice(0,180)}));
  const allowedPrefix=projectUrl+"/storage/v1/object/public/property-media/";
  if(gallery.some((item:any)=>!(item.url.startsWith(allowedPrefix)||/^assets\/[a-zA-Z0-9._-]+\.(webp|jpg|jpeg|png|avif)(\?v=[0-9]+)?$/.test(item.url)))) return json({ok:false,error:"invalid_gallery_url"},400);
  const coverImage=String(body?.cover_image||"");
  if(coverImage && !gallery.some((item:any)=>item.url===coverImage)) return json({ok:false,error:"invalid_cover"},400);
  const id=body?.id?Number(body.id):null;
  const name=String(body?.name||"").trim().slice(0,160);
  const code=String(body?.code||"").trim().toUpperCase().replace(/[^A-Z0-9_-]/g,"").slice(0,30);
  const slug=String(body?.slug||"").trim().toLowerCase().replace(/[^a-z0-9-]/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"").slice(0,100);
  const propertyType=["chalet","apartment","house","cabin","other"].includes(String(body?.property_type))?String(body.property_type):"other";
  const checkIn=String(body?.check_in_time||"15:00").slice(0,5);
  const checkOut=String(body?.check_out_time||"11:00").slice(0,5);
  if(!name||!code||!slug||!/^\d{2}:\d{2}$/.test(checkIn)||!/^\d{2}:\d{2}$/.test(checkOut)) return json({ok:false,error:"invalid_property"},400);
  const payload={
    name,code,slug,property_type:propertyType,cover_image:coverImage||null,gallery,
    tagline:String(body?.tagline||"").trim().slice(0,240)||null,
    summary:String(body?.summary||"").trim().slice(0,3000)||null,
    max_guests:Math.max(1,Math.min(50,Math.round(Number(body?.max_guests||2)))),
    cleaning_fee:Math.max(0,Math.min(100000,Number(body?.cleaning_fee||0))),
    guarantee_amount_cents:Math.max(0,Math.min(100000000,Math.round(Number(body?.guarantee_amount_cents||0)))),
    check_in_time:checkIn,check_out_time:checkOut,timezone:"America/Sao_Paulo",active:body?.active!==false,updated_at:new Date().toISOString()
  };
  const result=id
    ? await admin.from("properties").update(payload).eq("id",id).select().single()
    : await admin.from("properties").insert({...payload,features:{}}).select().single();
  if(result.error||!result.data) return json({ok:false,error:"property_save_failed"},409);
  await admin.from("audit_events").insert({actor_user_id:user.id,action:id?"property_updated":"property_created",entity_type:"property",entity_id:String(result.data.id),new_value:{name,code,active:payload.active}});
  return json({ok:true,property:result.data});
}

async function opsSettingsAction(req:Request,body:any){
  const user=await currentUser(req);
  if(!user || !(await userIsAdmin(user))) return json({ok:false,error:"admin_required"},403);
  const operation=String(body?.operation||"");
  if(operation==="payment_settings"){
    const payload={
      max_card_installments:Math.max(1,Math.min(24,Math.round(Number(body?.max_card_installments||1)))),
      pix_expiration_minutes:Math.max(5,Math.min(1440,Math.round(Number(body?.pix_expiration_minutes||15)))),
      post_booking_payment_minutes:Math.max(5,Math.min(1440,Math.round(Number(body?.post_booking_payment_minutes||15)))),
      modification_payment_deadline_hours:Math.max(1,Math.min(168,Math.round(Number(body?.modification_payment_deadline_hours||24)))),
      updated_at:new Date().toISOString()
    };
    const {data,error}=await admin.from("payment_settings").update(payload).eq("id",1).select().single();
    if(error) return json({ok:false,error:"settings_update_failed"},500);
    return json({ok:true,settings:data});
  }
  if(operation==="property_settings"){
    const propertyId=Number(body?.property_id||0);
    const cleaningFee=Math.max(0,Math.min(100000,Number(body?.cleaning_fee||0)));
    const guaranteeCents=Math.max(0,Math.min(100000000,Math.round(Number(body?.guarantee_amount_cents||0))));
    if(!propertyId||!Number.isFinite(cleaningFee)||!Number.isFinite(guaranteeCents)) return json({ok:false,error:"invalid_settings"},400);
    const {data,error}=await admin.from("properties").update({cleaning_fee:cleaningFee,guarantee_amount_cents:guaranteeCents,updated_at:new Date().toISOString()}).eq("id",propertyId).select("id,code,name,cleaning_fee,guarantee_amount_cents").single();
    if(error) return json({ok:false,error:"settings_update_failed"},500);
    return json({ok:true,property:data});
  }
  return json({ok:false,error:"invalid_operation"},400);
}

async function guaranteeAction(req:Request,body:any){
  const user=await currentUser(req);
  if(!user || !(await userIsAdmin(user))) return json({ok:false,error:"admin_required"},403);
  const {guarantee_id,operation,amount_cents=0,description=""}=body||{};
  const {data:g}=await admin.from("guarantees").select("*,reservations(id)").eq("id",guarantee_id).single();
  if(!g) return json({ok:false,error:"not_found"},404);

  if(operation==="release"){
    return json({ok:false,error:"pagbank_authorization_reconciliation_required"},409);
  }

  if(operation==="report_incident"){
    if(g.provider!=="pagbank_sandbox"||!g.provider_authorization_id)
      return json({ok:false,error:"pagbank_authorization_required"},409);
    if(["released","captured","resolved"].includes(g.status)) return json({ok:false,error:"guarantee_not_available"},409);
    if(["incident_reported","capture_requested"].includes(g.status)){
      const {data:existing}=await admin.from("incidents").select("*").eq("guarantee_id",g.id).eq("status","open").order("created_at",{ascending:false}).limit(1).maybeSingle();
      if(existing) return json({ok:true,status:"incident_reported",incident:existing});
    }
    const {data:i,error}=await admin.from("incidents").insert({
      guarantee_id:g.id,description:description||"Ocorrência registrada",
      requested_capture_cents:Math.max(0,Number(amount_cents||0)),status:"open"
    }).select().single();
    if(error||!i) return json({ok:false,error:"incident_create_failed"},500);
    await admin.from("guarantees").update({status:"incident_reported",updated_at:new Date().toISOString()}).eq("id",g.id);
    return json({ok:true,status:"incident_reported",incident:i});
  }

  if(operation==="capture"){
    return json({ok:false,error:"pagbank_capture_reconciliation_required"},409);
  }

  return json({ok:false,error:"invalid_operation"},400);
}


async function experienceAdminData(req:Request){
  const user=await currentUser(req);
  if(!user || !(await userIsAdmin(user))) return json({ok:false,error:"admin_required"},403);
  const [{data:products,error:pe},{data:properties,error:pre},{data:purposes,error:pu}] = await Promise.all([
    admin.from("experience_products")
      .select("id,code,name,description,sales_headline,details,package_type,price_cents,upsell_enabled,status,minimum_lead_hours,daily_capacity,inventory,travel_purposes,display_order,experience_variants(id,code,name,price_cents,active,display_order),experience_property_eligibility(property_id),experience_media(id,media_url,alt_text,display_order)")
      .order("display_order"),
    admin.from("properties").select("id,code,name,active").eq("active",true).order("id"),
    admin.from("travel_purposes").select("code,label,active,display_order").eq("active",true).order("display_order")
  ]);
  if(pe||pre||pu) return json({ok:false,error:"experience_admin_unavailable"},500);
  return json({ok:true,products:products||[],properties:properties||[],purposes:purposes||[]});
}

async function experienceAdminAction(req:Request,body:any){
  const user=await currentUser(req);
  if(!user || !(await userIsAdmin(user))) return json({ok:false,error:"admin_required"},403);
  const operation=String(body?.operation||"");


  if(operation==="save_simple_product"){
    const id=body?.id||null;
    const name=String(body?.name||"").trim().slice(0,160);
    const description=String(body?.description||"").trim().slice(0,3000)||null;
    const packageType=["romantic","beach","breakfast","celebration","wellness","other"].includes(String(body?.package_type))?String(body.package_type):"other";
    const priceCents=Math.max(0,Math.round(Number(body?.price_cents||0)));
    const upsellEnabled=body?.upsell_enabled===true;
    const rawMedia=Array.isArray(body?.media_items)?body.media_items:[];
    const mediaItems=[...new Map(rawMedia
      .map((m:any,i:number)=>({
        media_url:String(m?.media_url||"").trim().slice(0,1000),
        alt_text:String(m?.alt_text||name).trim().slice(0,240)||name,
        display_order:Number.isFinite(Number(m?.display_order))?Number(m.display_order):(i+1)*10
      }))
      .filter((m:any)=>m.media_url)
      .map((m:any)=>[m.media_url,m])).values()];
    if(!name) return json({ok:false,error:"experience_name_required"},400);
    if(priceCents<=0) return json({ok:false,error:"experience_price_required"},400);
    if(mediaItems.length<5) return json({ok:false,error:"experience_requires_five_photos",photo_count:mediaItems.length},400);

    let existing:any=null;
    if(id){
      const {data,error}=await admin.from("experience_products").select("*").eq("id",id).single();
      if(error||!data) return json({ok:false,error:"experience_not_found"},404);
      existing=data;
    }
    const baseCode=(name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"").slice(0,60)||"pacote");
    const code=existing?.code || (baseCode+"_"+crypto.randomUUID().slice(0,6));
    const productPayload={
      code,name,description,package_type:packageType,price_cents:priceCents,upsell_enabled:upsellEnabled,
      status:existing?.status==="inactive"?"inactive":"active",
      sales_headline:existing?.sales_headline||null,
      details:existing?.details||{},
      minimum_lead_hours:Number(existing?.minimum_lead_hours||0),
      travel_purposes:Array.isArray(existing?.travel_purposes)?existing.travel_purposes:[],
      display_order:Number(existing?.display_order||0)
    };
    let product:any=null,error:any=null;
    if(id){
      const r=await admin.from("experience_products").update(productPayload).eq("id",id).select().single();product=r.data;error=r.error;
    }else{
      const r=await admin.from("experience_products").insert(productPayload).select().single();product=r.data;error=r.error;
    }
    if(error||!product) return json({ok:false,error:"experience_save_failed"},500);

    // New packages apply to all active properties by default; existing eligibility is preserved.
    if(!id){
      const {data:properties}=await admin.from("properties").select("id").eq("active",true);
      if(properties?.length) await admin.from("experience_property_eligibility").insert(properties.map((p:any)=>({product_id:product.id,property_id:p.id})));
    }

    // Keep the existing booking engine compatible: the first active variant mirrors package price.
    const {data:variants}=await admin.from("experience_variants").select("*").eq("product_id",product.id).eq("active",true).order("display_order");
    if(variants?.length){
      const primary=variants[0];
      await admin.from("experience_variants").update({code:"package",name:"Pacote",price_cents:priceCents,active:true,display_order:10}).eq("id",primary.id);
      if(variants.length>1) await admin.from("experience_variants").update({active:false}).in("id",variants.slice(1).map((v:any)=>v.id));
    }else{
      await admin.from("experience_variants").insert({product_id:product.id,code:"package",name:"Pacote",price_cents:priceCents,active:true,display_order:10});
    }

    const {data:oldMedia}=await admin.from("experience_media").select("id,media_url").eq("product_id",product.id);
    const kept=new Set(mediaItems.map((m:any)=>m.media_url));
    const removed=(oldMedia||[]).filter((m:any)=>!kept.has(m.media_url));
    await admin.from("experience_media").delete().eq("product_id",product.id);
    await admin.from("experience_media").insert(mediaItems.map((m:any)=>({...m,product_id:product.id})));

    // Clean up removed uploaded objects, but never touch repository asset paths.
    const storagePrefix=projectUrl+"/storage/v1/object/public/experience-media/";
    const storagePaths=removed.map((m:any)=>String(m.media_url||"")).filter((u:string)=>u.startsWith(storagePrefix)).map((u:string)=>decodeURIComponent(u.slice(storagePrefix.length)));
    if(storagePaths.length) await admin.storage.from("experience-media").remove(storagePaths);

    return json({ok:true,product,photo_count:mediaItems.length});
  }

  if(operation==="toggle_product_status"){
    if(!body?.id) return json({ok:false,error:"experience_not_found"},404);
    const {data:product}=await admin.from("experience_products").select("id,status").eq("id",body.id).single();
    if(!product) return json({ok:false,error:"experience_not_found"},404);
    const next=product.status==="active"?"inactive":"active";
    if(next==="active"){
      const {count}=await admin.from("experience_media").select("id",{count:"exact",head:true}).eq("product_id",product.id);
      if(Number(count||0)<5) return json({ok:false,error:"experience_requires_five_photos",photo_count:Number(count||0)},400);
    }
    const {data,error}=await admin.from("experience_products").update({status:next}).eq("id",product.id).select().single();
    if(error) return json({ok:false,error:"experience_status_failed"},500);
    return json({ok:true,product:data});
  }

  if(operation==="delete_product"){
    if(!body?.id) return json({ok:false,error:"experience_not_found"},404);
    const productId=body.id;
    const [{count:orders},{count:quotes},{data:media}]=await Promise.all([
      admin.from("experience_order_items").select("id",{count:"exact",head:true}).eq("product_id",productId),
      admin.from("quote_experience_items").select("id",{count:"exact",head:true}).eq("product_id",productId),
      admin.from("experience_media").select("media_url").eq("product_id",productId)
    ]);
    if(Number(orders||0)>0 || Number(quotes||0)>0){
      const {error}=await admin.from("experience_products").update({status:"archived"}).eq("id",productId);
      if(error) return json({ok:false,error:"experience_delete_failed"},500);
      return json({ok:true,archived:true});
    }
    const storagePrefix=projectUrl+"/storage/v1/object/public/experience-media/";
    const storagePaths=(media||[]).map((m:any)=>String(m.media_url||"")).filter((u:string)=>u.startsWith(storagePrefix)).map((u:string)=>decodeURIComponent(u.slice(storagePrefix.length)));
    const {error}=await admin.from("experience_products").delete().eq("id",productId);
    if(error) return json({ok:false,error:"experience_delete_failed"},500);
    if(storagePaths.length) await admin.storage.from("experience-media").remove(storagePaths);
    return json({ok:true,deleted:true});
  }

  if(operation==="save_product"){
    const payload={
      code:String(body?.code||"").trim().toLowerCase().replace(/[^a-z0-9_]+/g,"_").replace(/^_+|_+$/g,"").slice(0,80),
      name:String(body?.name||"").trim().slice(0,160),
      description:String(body?.description||"").trim().slice(0,2000)||null,
      sales_headline:String(body?.sales_headline||"").trim().slice(0,240)||null,
      status:["draft","active","inactive","archived"].includes(body?.status)?body.status:"draft",
      minimum_lead_hours:Math.max(0,Math.min(8760,Number(body?.minimum_lead_hours||0))),
      travel_purposes:Array.isArray(body?.travel_purposes)?body.travel_purposes.map(String).slice(0,20):[],
      display_order:Number(body?.display_order||0),
      details:typeof body?.details==="object"&&body.details?body.details:{}
    };
    if(!payload.code||!payload.name) return json({ok:false,error:"invalid_experience"},400);
    let product:any=null,error:any=null;
    if(body?.id){
      const r=await admin.from("experience_products").update(payload).eq("id",body.id).select().single();product=r.data;error=r.error;
    }else{
      const r=await admin.from("experience_products").insert(payload).select().single();product=r.data;error=r.error;
    }
    if(error||!product) return json({ok:false,error:"experience_save_failed"},500);
    const propertyIds=Array.isArray(body?.property_ids)?[...new Set(body.property_ids.map(Number).filter(Number.isFinite))]:[];
    await admin.from("experience_property_eligibility").delete().eq("product_id",product.id);
    if(propertyIds.length){
      const {error:eligErr}=await admin.from("experience_property_eligibility").insert(propertyIds.map((property_id:number)=>({product_id:product.id,property_id})));
      if(eligErr) return json({ok:false,error:"experience_eligibility_save_failed"},500);
    }
    return json({ok:true,product});
  }

  if(operation==="save_variant"){
    const payload={
      product_id:body?.product_id,
      code:String(body?.code||"").trim().toLowerCase().replace(/[^a-z0-9_]+/g,"_").replace(/^_+|_+$/g,"").slice(0,80),
      name:String(body?.name||"").trim().slice(0,120),
      price_cents:Math.max(0,Math.round(Number(body?.price_cents||0))),
      active:body?.active!==false,
      display_order:Number(body?.display_order||0)
    };
    if(!payload.product_id||!payload.code||!payload.name) return json({ok:false,error:"invalid_variant"},400);
    let variant:any=null,error:any=null;
    if(body?.id){
      const r=await admin.from("experience_variants").update(payload).eq("id",body.id).select().single();variant=r.data;error=r.error;
    }else{
      const r=await admin.from("experience_variants").insert(payload).select().single();variant=r.data;error=r.error;
    }
    if(error||!variant) return json({ok:false,error:"variant_save_failed"},500);
    return json({ok:true,variant});
  }

  if(operation==="save_media"){
    const payload={
      product_id:body?.product_id,
      media_url:String(body?.media_url||"").trim().slice(0,1000),
      alt_text:String(body?.alt_text||"").trim().slice(0,240)||null,
      display_order:Number(body?.display_order||0)
    };
    if(!payload.product_id||!payload.media_url) return json({ok:false,error:"invalid_media"},400);
    let media:any=null,error:any=null;
    if(body?.id){
      const r=await admin.from("experience_media").update(payload).eq("id",body.id).select().single();media=r.data;error=r.error;
    }else{
      const r=await admin.from("experience_media").insert(payload).select().single();media=r.data;error=r.error;
    }
    if(error||!media) return json({ok:false,error:"media_save_failed"},500);
    return json({ok:true,media});
  }

  if(operation==="delete_media"){
    if(!body?.id) return json({ok:false,error:"invalid_media"},400);
    const {error}=await admin.from("experience_media").delete().eq("id",body.id);
    if(error) return json({ok:false,error:"media_delete_failed"},500);
    return json({ok:true});
  }

  return json({ok:false,error:"invalid_operation"},400);
}


async function guestExperienceCatalog(req:Request,body:any){
  const user=await currentUser(req);
  if(!user) return json({ok:false,error:"authentication_required"},401);
  const reservationId=String(body?.reservation_id||"");
  if(!reservationId) return json({ok:false,error:"missing_data"},400);

  const {data:r,error:re}=await admin.from("reservations")
    .select("id,user_id,property_id,check_in,status")
    .eq("id",reservationId).single();
  if(re||!r||r.user_id!==user.id) return json({ok:false,error:"not_found"},404);
  if(r.status!=="confirmed") return json({ok:false,error:"reservation_not_available"},409);

  const {data:products,error:pe}=await admin.from("experience_products")
    .select("id,name,description,sales_headline,package_type,price_cents,upsell_enabled,minimum_lead_hours,daily_capacity,inventory,status,created_at,experience_variants(id,code,name,price_cents,active,display_order),experience_property_eligibility!inner(property_id),experience_media(id,media_url,alt_text,display_order)")
    .eq("status","active")
    .eq("experience_property_eligibility.property_id",r.property_id)
    .order("display_order");
  if(pe) return json({ok:false,error:"experience_catalog_unavailable"},500);

  const {data:existing}=await admin.from("experience_orders")
    .select("experience_order_items(id,product_id,product_name_snapshot,unit_price_cents,status,experience_products(package_type,price_cents,name,upsell_enabled))")
    .eq("reservation_id",r.id)
    .in("status",["pending","active"]);
  const activeItems=(existing||[]).flatMap((o:any)=>o.experience_order_items||[]).filter((i:any)=>i.status==="active");

  const arrival=Date.parse(String(r.check_in)+"T15:00:00-03:00");
  const now=Date.now();
  const items=[];
  for(const p of products||[]){
    const variant=(p.experience_variants||[]).filter((v:any)=>v.active).sort((a:any,b:any)=>Number(a.display_order)-Number(b.display_order))[0];
    if(!variant) continue;
    const leadOk=(arrival-now)>=Number(p.minimum_lead_hours||0)*3600000;
    const stockOk=p.inventory==null||Number(p.inventory)>0;
    if(!leadOk||!stockOk) continue;

    const current=activeItems.find((i:any)=>i.experience_products?.package_type===p.package_type);
    let purchaseMode="add",payableCents=Number(variant.price_cents),upgradeFrom=null;
    if(current){
      if(String(current.product_id)===String(p.id)) continue;
      if(current.experience_products?.upsell_enabled!==true) continue;
      const sourceCatalogPrice=Number(current.experience_products?.price_cents??current.unit_price_cents??0);
      const next=(products||[])
        .filter((x:any)=>x.package_type===p.package_type&&x.status==="active"&&Number(x.price_cents)>sourceCatalogPrice&&(x.inventory==null||Number(x.inventory)>0))
        .sort((a:any,b:any)=>Number(a.price_cents)-Number(b.price_cents)||String(a.created_at||"").localeCompare(String(b.created_at||"")))[0];
      if(!next||String(next.id)!==String(p.id)) continue;
      payableCents=Math.max(0,Number(variant.price_cents)-Number(current.unit_price_cents||0));
      if(payableCents<=0) continue;
      purchaseMode="upgrade";
      upgradeFrom={product_id:current.product_id,name:current.product_name_snapshot,price_cents:Number(current.unit_price_cents||0)};
    }

    let capacityOk=true;
    if(p.daily_capacity!=null){
      const {count}=await admin.from("experience_order_items")
        .select("id,experience_orders!inner(reservation_id,status,reservations!inner(check_in,status))",{count:"exact",head:true})
        .eq("product_id",p.id)
        .eq("status","active")
        .in("experience_orders.status",["pending","active"])
        .eq("experience_orders.reservations.check_in",r.check_in)
        .in("experience_orders.reservations.status",["confirmed","pending_payment"]);
      capacityOk=Number(count||0)<Number(p.daily_capacity);
    }
    if(!capacityOk) continue;

    items.push({
      product_id:p.id,variant_id:variant.id,name:p.name,description:p.description,
      sales_headline:p.sales_headline,package_type:p.package_type,
      price_cents:Number(variant.price_cents),payable_cents:payableCents,purchase_mode:purchaseMode,
      upgrade_from:upgradeFrom,
      media:(p.experience_media||[]).slice().sort((a:any,b:any)=>Number(a.display_order)-Number(b.display_order))
    });
  }
  return json({
    ok:true,
    reservation_id:r.id,
    items,
    owned_packages:activeItems.map((i:any)=>({
      product_id:i.product_id,
      name:i.product_name_snapshot,
      package_type:i.experience_products?.package_type||"other",
      price_cents:Number(i.unit_price_cents||0)
    }))
  });
}

async function purchasePostBookingExperience(req:Request,body:any,development:boolean){
  const user=await currentUser(req);
  if(!user) return json({ok:false,error:"authentication_required"},401);
  const reservationId=String(body?.reservation_id||"");
  const variantId=String(body?.variant_id||"");
  if(!reservationId||!variantId) return json({ok:false,error:"missing_data"},400);

  const {data,error}=await admin.rpc("add_experience_cart_item_atomic",{
    p_reservation_id:reservationId,
    p_user_id:user.id,
    p_variant_id:variantId
  });
  if(error){
    const msg=String(error.message||"");
    if(msg.includes("experience_payment_already_pending")){
      const {data:variant}=await admin.from("experience_variants")
        .select("product_id,experience_products(package_type)").eq("id",variantId).maybeSingle();
      const packageType=(variant as any)?.experience_products?.package_type;
      let existing:any=null;
      if(packageType){
        const {data}=await admin.from("post_booking_charges")
          .select("id,reservation_id,kind,status,amount_cents,payment_id,modification_request_id,description,expires_at,snapshot,created_at,payments(status,method,installments)")
          .eq("reservation_id",reservationId).eq("user_id",user.id)
          .in("kind",["experience_add","experience_upgrade"])
          .in("status",["awaiting_payment","processing","paid"])
          .gt("expires_at",new Date().toISOString())
          .eq("snapshot->>package_type",packageType)
          .order("created_at",{ascending:false}).limit(1).maybeSingle();
        existing=data;
      }
      return json({ok:false,error:"experience_payment_already_pending",existing_charge:existing},409);
    }
    for(const code of [
      "reservation_not_available","experience_unavailable","experience_lead_time","experience_out_of_stock",
      "experience_already_added","experience_upgrade_not_available","experience_capacity_reached",
      "experience_payment_already_pending"
    ]) if(msg.includes(code)) return json({ok:false,error:code},409);
    return json({ok:false,error:"experience_charge_failed"},500);
  }
  const row=Array.isArray(data)?data[0]:data;
  return json({
    ok:true,
    cart_item:{
      id:row?.cart_item_id||null,
      purchase_mode:row?.purchase_mode||"add",
      amount_cents:Number(row?.amount_cents||0),
      description:row?.description||"Experiência"
    }
  });
}

async function checkoutExperienceCartItem(req:Request,body:any){
  const user=await currentUser(req);
  if(!user) return json({ok:false,error:"authentication_required"},401);
  const cartItemId=String(body?.cart_item_id||"");
  if(!cartItemId) return json({ok:false,error:"missing_data"},400);
  const {data:settings}=await admin.from("payment_settings").select("post_booking_payment_minutes").eq("id",1).single();
  const {data,error}=await admin.rpc("checkout_experience_cart_item_atomic",{
    p_cart_item_id:cartItemId,p_user_id:user.id,
    p_expires_minutes:Number(settings?.post_booking_payment_minutes||15)
  });
  if(error){
    const msg=String(error.message||"");
    for(const code of ["cart_item_not_found","reservation_not_available","experience_unavailable","experience_lead_time",
      "experience_out_of_stock","experience_already_added","experience_upgrade_not_available",
      "experience_capacity_reached","experience_payment_already_pending"])
      if(msg.includes(code)) return json({ok:false,error:code},409);
    return json({ok:false,error:"experience_checkout_failed"},500);
  }
  const row=Array.isArray(data)?data[0]:data;
  return json({ok:true,charge:{id:row?.charge_id||null,
    kind:row?.purchase_mode==="upgrade"?"experience_upgrade":"experience_add",
    purchase_mode:row?.purchase_mode||"add",amount_cents:Number(row?.amount_cents||0),
    description:row?.description||"Experiência",expires_at:row?.expires_at||null}});
}

async function removeExperienceCartItem(req:Request,body:any){
  const user=await currentUser(req);
  if(!user) return json({ok:false,error:"authentication_required"},401);
  const cartItemId=String(body?.cart_item_id||"");
  if(!cartItemId) return json({ok:false,error:"missing_data"},400);
  const {data,error}=await admin.rpc("remove_experience_cart_item_atomic",{p_cart_item_id:cartItemId,p_user_id:user.id});
  if(error) return json({ok:false,error:"cart_remove_failed"},500);
  return json({ok:true,removed:data===true});
}

async function startPostBookingPayment(req:Request,body:any,development:boolean){
  const user=await currentUser(req);
  if(!user) return json({ok:false,error:"authentication_required"},401);
  if(!development) return json({ok:false,error:"payment_provider_not_ready"},409);

  const chargeId=String(body?.charge_id||"");
  const method=String(body?.method||"pix");
  const installments=Math.max(1,Number(body?.installments||1));
  const sandbox=body?.provider==="pagbank_sandbox";
  if(!sandbox) return json({ok:false,error:"invalid_provider"},400);
  if(!chargeId||!["pix","card"].includes(method)) return json({ok:false,error:"missing_data"},400);

  const {data:settings}=await admin.from("payment_settings")
    .select("active_provider,max_card_installments").eq("id",1).single();
  if(settings?.active_provider!=="mock") return json({ok:false,error:"payment_provider_not_ready"},409);
  if(method==="card"&&(!Number.isInteger(installments)||installments>Math.min(6,Number(settings?.max_card_installments||1))))
    return json({ok:false,error:"invalid_installments"},400);
  const token=Deno.env.get("PAGBANK_SANDBOX_TOKEN")||"";
  if(sandbox&&!token) return json({ok:false,error:"pagbank_sandbox_not_configured"},503);
  if(sandbox&&method==="card"&&typeof body?.encrypted_card!=="string")
    return json({ok:false,error:"encrypted_card_required"},400);

  const {data,error}=await admin.rpc("start_post_booking_payment_atomic",{
    p_charge_id:chargeId,p_user_id:user.id,p_provider:sandbox?"pagbank_sandbox":"mock",p_method:method,p_installments:installments
  });
  if(error){
    const msg=String(error.message||"");
    for(const code of ["charge_not_found","charge_already_applied","charge_expired","payment_not_required"])
      if(msg.includes(code)) return json({ok:false,error:code},409);
    return json({ok:false,error:"post_booking_payment_failed"},500);
  }
  const row=Array.isArray(data)?data[0]:data;
  if(sandbox){
    const paymentId=row?.payment_id;
    const {data:payment}=await admin.from("payments").select("provider,provider_payment_id,metadata,status")
      .eq("id",paymentId).single();
    if(payment?.provider!=="pagbank_sandbox") return json({ok:false,error:"payment_provider_mismatch"},409);
    if(payment.provider_payment_id){
      try{await reconcileSandboxCharge(paymentId,payment.provider_payment_id,token,payment.metadata?.order_id,true)}catch(e){
        console.error(JSON.stringify({event:"post_booking_status_deferred",payment_id:paymentId,error:String(e)}));
      }
      return json({ok:true,payment:{id:paymentId,status:payment.status,amount_cents:Number(row.amount_cents),
        method,installments:method==="card"?installments:null,provider:"pagbank_sandbox"},
        charge_status:row.charge_status,charge_expires_at:row.charge_expires_at});
    }
    const [{data:charge},{data:identity}]=await Promise.all([
      admin.from("post_booking_charges").select("reservation_id,amount_cents,expires_at,reservations(guest_name,guest_email,guest_phone)").eq("id",chargeId).eq("user_id",user.id).single(),
      admin.rpc("guest_payment_identity",{p_user_id:user.id})
    ]);
    const id=Array.isArray(identity)?identity[0]:identity;
    const guest=(charge?.reservations as any);
    if(!charge||Number(charge.amount_cents)!==Number(row.amount_cents)||id?.document_type!=="cpf"||
       !guest||String(guest.guest_email).toLowerCase()!==String(user.email).toLowerCase())
      return json({ok:false,error:"pagbank_customer_invalid",payment_id:paymentId},400);
    const digits=String(guest.guest_phone||"").replace(/\D/g,"");
    const phone=digits.startsWith("55")&&digits.length>=12?digits.slice(2):digits;
    try{
      const expiry=new Date(Math.min(Date.parse(charge.expires_at),Date.now()+900000));
      const order=pagBankOrder({referenceId:String(paymentId).replace(/-/g,""),amountCents:Number(row.amount_cents),
        customer:{name:guest.guest_name,email:guest.guest_email,taxId:id.document_number,
          phone:{area:phone.slice(0,2),number:phone.slice(2)}},method:method as "pix"|"card",
        expiresAt:expiry,encryptedCard:body?.encrypted_card,installments,
        notificationUrl:projectUrl+"/functions/v1/pagbank-webhook"});
      const result=await createPagBankOrder("sandbox",token,order);
      const {error:saveError}=await admin.from("payments").update({provider_payment_id:result.chargeId,
        metadata:{...(payment.metadata||{}),environment:"sandbox",order_id:result.orderId}}).eq("id",paymentId);
      if(saveError) throw saveError;
      if(result.status!=="WAITING") await reconcileSandboxCharge(paymentId,result.chargeId,token,result.orderId,true);
      return json({ok:true,payment:{id:paymentId,status:result.status==="PAID"?"paid":"awaiting_payment",
        amount_cents:Number(row.amount_cents),method,installments:method==="card"?installments:null,
        provider:"pagbank_sandbox",pix_code:result.pixCode,qr_image_url:result.qrImageUrl},
        charge_status:row.charge_status,charge_expires_at:row.charge_expires_at});
    }catch(e){
      console.error(JSON.stringify({event:"post_booking_pagbank_uncertain",payment_id:paymentId,error:String(e)}));
      return json({ok:false,error:"pagbank_start_uncertain",payment_id:paymentId},503);
    }
  }
  return json({ok:true,payment:{
    id:row?.payment_id||null,status:row?.payment_status||"awaiting_payment",
    amount_cents:Number(row?.amount_cents||0),method,installments:method==="card"?installments:null
  },charge_status:row?.charge_status||"processing",charge_expires_at:row?.charge_expires_at||null});
}

async function confirmFreePostBookingCharge(req:Request,body:any){
  const user=await currentUser(req);
  if(!user) return json({ok:false,error:"authentication_required"},401);
  const chargeId=String(body?.charge_id||"");
  const {data,error}=await admin.rpc("confirm_free_post_booking_charge_atomic",{p_charge_id:chargeId,p_user_id:user.id});
  if(error){
    const msg=String(error.message||"");
    for(const code of ["charge_not_found","payment_required","charge_expired","dates_unavailable","modification_not_payable"])
      if(msg.includes(code)) return json({ok:false,error:code},409);
    return json({ok:false,error:"charge_confirm_failed"},500);
  }
  const row=Array.isArray(data)?data[0]:data;
  return json({ok:true,status:row?.result_status||"applied",total_amount:Number(row?.result_total_amount||0)});
}

async function cancelPostBookingCharge(req:Request,body:any){
  const user=await currentUser(req);
  if(!user) return json({ok:false,error:"authentication_required"},401);
  const chargeId=String(body?.charge_id||"");
  const {data,error}=await admin.rpc("cancel_post_booking_charge_atomic",{p_charge_id:chargeId,p_user_id:user.id});
  if(error){
    const msg=String(error.message||"");
    for(const code of ["charge_not_found","charge_already_applied","charge_already_paid","payment_processing"])
      if(msg.includes(code)) return json({ok:false,error:code},409);
    return json({ok:false,error:"charge_cancel_failed"},500);
  }
  const row=Array.isArray(data)?data[0]:data;
  return json({ok:true,status:row?.result_charge_status||"cancelled",modification_status:row?.result_modification_status||null});
}

async function trackEvent(req:Request,body:any){
  const allowed=new Set(["search_started","search_completed","property_viewed","rate_viewed","rate_selected","experience_viewed","experience_added","experience_upgraded","checkout_started","login_started","account_created","payment_started","payment_failed","booking_confirmed","modification_requested","precheckin_started","guarantee_completed","checkin_completed","checkout_completed","review_requested","repeat_booking_started"]);
  if(!allowed.has(String(body?.event_name||""))) return json({ok:false,error:"invalid_event"},400);
  const user=await currentUser(req);
  const {error}=await admin.from("analytics_events").insert({
    event_name:body.event_name,anonymous_id:String(body.anonymous_id||"").slice(0,120)||null,user_id:user?.id||null,
    reservation_id:body.reservation_id||null,property_id:body.property_id||null,
    metadata:typeof body.metadata==="object"&&body.metadata?body.metadata:{}
  });
  if(error){
    console.error(JSON.stringify({event:"analytics_insert_failed",code:error.code||null,message:error.message||"unknown"}));
    return json({ok:false,error:"analytics_unavailable"},500);
  }
  return json({ok:true});
}



async function retryDb(label:string,run:()=>PromiseLike<any>,attempts=3){
  let last:any=null;
  for(let attempt=1;attempt<=attempts;attempt++){
    try{
      const result=await run();
      last=result;
      if(!result?.error) return result;
      console.error(JSON.stringify({event:"db_query_failed",label,attempt,code:result.error?.code||null,message:result.error?.message||"unknown"}));
    }catch(error){
      last={data:null,error};
      console.error(JSON.stringify({event:"db_query_exception",label,attempt,message:String((error as Error)?.message||error)}));
    }
    if(attempt<attempts) await new Promise(r=>setTimeout(r,250*attempt));
  }
  return last;
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
  try{
    const url=new URL(req.url);
    let body:any={};
    if(req.method==="POST") body=await req.json().catch(()=>({}));
    const action=url.searchParams.get("action")||body.action||"config";
    const origin=req.headers.get("origin")||"";
    const development=req.headers.get("x-chalezinho-env")==="development" &&
      (origin==="https://chalezinho-ville-git-desenvolvimento-roldneicosta-4140.vercel.app" ||
       origin==="https://chalezinho-ville-git-integracao-pagbank-roldneicosta-4140.vercel.app" ||
       /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));

    if(action==="identity_status"||action==="complete_identity"){
      const user=await currentUser(req);
      if(!user) return json({ok:false,error:"authentication_required"},401);
      if(!development) return json({ok:false,error:"not_available"},403);
      if(action==="identity_status"){
        const {data,error}=await admin.rpc("guest_identity_present",{p_user_id:user.id});
        if(error) return json({ok:false,error:"identity_check_unavailable"},500);
        return json({ok:true,complete:Boolean(data)});
      }
      const {data,error}=await admin.rpc("register_guest_identity",{
        p_user_id:user.id,
        p_document_type:body.document_type,
        p_issuing_country:body.issuing_country,
        p_document_number:body.document_number
      });
      if(error){
        if(error.code==="23505") return json({ok:false,error:"identity_conflict"},409);
        if(String(error.message).includes("invalid_document")) return json({ok:false,error:"invalid_document"},400);
        return json({ok:false,error:"identity_registration_failed"},500);
      }
      return json({ok:true,complete:Boolean(data)});
    }
    if(action==="config"){
      const purposesQ=await retryDb("travel_purposes",()=>admin.from("travel_purposes").select("*").eq("active",true).order("display_order"));
      if(purposesQ.error) return json({ok:false,error:"config_unavailable"},500);

      const settingsQ=await retryDb("payment_settings",()=>admin.from("payment_settings").select("active_provider,charge_percent,pix_expiration_minutes,max_card_installments,modification_payment_deadline_hours,post_booking_payment_minutes").eq("id",1).single());
      if(settingsQ.error) return json({ok:false,error:"config_unavailable"},500);

      const docsQ=await retryDb("policy_documents",()=>admin.from("policy_documents").select("id,document_type,code,version,title,body,status").in("status",development?["active","draft"]:["active"]).order("document_type"));
      if(docsQ.error) return json({ok:false,error:"config_unavailable"},500);

      const productsQ=await retryDb("experience_products",()=>admin.from("experience_products").select("id,code,name,description,sales_headline,details,package_type,price_cents,upsell_enabled,status,minimum_lead_hours,daily_capacity,inventory,travel_purposes,display_order,experience_variants(id,code,name,price_cents,active,display_order),experience_property_eligibility(property_id),experience_media(id,media_url,alt_text,display_order)").in("status",development?["active","draft"]:["active"]).order("display_order"));
      if(productsQ.error) return json({ok:false,error:"config_unavailable"},500);

      return json({
        ok:true,
        purposes:purposesQ.data||[],
        payment_settings:settingsQ.data||{},
        policy_documents:docsQ.data||[],
        experience_products:productsQ.data||[],
        availability_coverage:{direct:true,airbnb:true,booking:bookingIcalConfigured()}
      });
    }
    if(action==="property_media"){
      const {data,error}=await admin.from("properties").select("id,code,slug,name,tagline,summary,property_type,max_guests,cover_image,gallery").eq("active",true).order("id");
      if(error) return json({ok:false,error:"media_unavailable"},500);
      return json({ok:true,properties:data||[]});
    }
    if(action==="search"){
      const start=url.searchParams.get("start")||body.start;
      const end=url.searchParams.get("end")||body.end;
      const guests=Number(url.searchParams.get("guests")||body.guests||2);
      const listings=await searchData(start,end,guests,null,development);
      return json({ok:true,listings:listings.map((x:any)=>{
        const {cleaning_fee,...rest}=x;
        return {...rest,from_stay_price:x.base_price!=null?Number(x.base_price)*1.10+Number(x.cleaning_fee||0):null};
      })});
    }
    if(action==="quote") return json(await createQuote(body,development));
    if(action==="upsell_preview") return await upsellPreview(body);
    if(action==="apply_upsell") return await applyUpsell(body,development);
    if(action==="pagbank_sandbox_card_key"){
      if(!development) return json({ok:false,error:"not_allowed"},403);
      if(!await currentUser(req)) return json({ok:false,error:"authentication_required"},401);
      const token=Deno.env.get("PAGBANK_SANDBOX_TOKEN")||"";
      if(!token) return json({ok:false,error:"pagbank_sandbox_not_configured"},503);
      return json({ok:true,public_key:await getPagBankCardPublicKey(token)});
    }
    if(action==="pagbank_sandbox_status") return await sandboxPaymentStatus(req,body,development);
    if(action==="start_payment") return await startPayment(req,body,development);
    if(action==="reservation_policy") return await reservationPolicy(req,body);
    if(action==="cancel_pending_payment") return await cancelPendingPayment(req,body,development);
    if(action==="mock_payment") return json({ok:false,error:"not_allowed"},403);
    if(action==="start_post_booking_payment") return await startPostBookingPayment(req,body,development);
    if(action==="confirm_free_post_booking_charge") return await confirmFreePostBookingCharge(req,body);
    if(action==="cancel_post_booking_charge") return await cancelPostBookingCharge(req,body);
    if(action==="request_modification") return await requestModification(req,body,development);
    if(action==="modification_action") return await modificationAction(req,body,development);
    if(action==="ops") return await opsData(req);
    if(action==="ops_settings_action") return await opsSettingsAction(req,body);
    if(action==="admin_cancellation_policy_action") return await adminCancellationPolicyAction(req,body,development);
    if(action==="admin_hub") return await adminHubData(req,body);
    if(action==="reservation_refund_action") return await reservationRefundAction(req,body,development);
    if(action==="reservation_refund_status") return await reservationRefundStatus(req,body,development);
    if(action==="reservation_cancel_request") return await reservationCancelRequest(req,body,development);
    if(action==="admin_reservation_action") return await adminReservationAction(req,body);
    if(action==="admin_notification_action") return await adminNotificationAction(req,body);
    if(action==="admin_property_action") return await adminPropertyAction(req,body);
    if(action==="guarantee_action") return await guaranteeAction(req,body);
    if(action==="experience_admin") return await experienceAdminData(req);
    if(action==="experience_admin_action") return await experienceAdminAction(req,body);
    if(action==="guest_experience_catalog") return await guestExperienceCatalog(req,body);
    if(action==="purchase_post_booking_experience") return await purchasePostBookingExperience(req,body,development);
    if(action==="checkout_experience_cart_item") return await checkoutExperienceCartItem(req,body);
    if(action==="remove_experience_cart_item") return await removeExperienceCartItem(req,body);
    if(action==="track") return await trackEvent(req,body);

    return json({ok:false,error:"unknown_action"},404);
  }catch(e){
    const msg=String((e as Error)?.message||"unexpected_error");
    const minMatch=/^minimum_stay:(\d+)$/.exec(msg);
    if(minMatch) return json({ok:false,error:"minimum_stay",min_stay:Number(minMatch[1])},400);
    if(msg==="booking_not_configured") return json({ok:false,error:"booking_not_configured"},503);
    const clientErrors=["invalid_dates","property_not_found","occupied","capacity","minimum_stay","rate_unavailable","experience_unavailable","experience_category_conflict","modification_already_open","upsell_not_available"];
    return json({ok:false,error:msg},clientErrors.includes(msg)?400:500);
  }
});
