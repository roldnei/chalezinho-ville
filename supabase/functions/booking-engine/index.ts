
import { createClient } from "npm:@supabase/supabase-js@2";

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

  const [propertiesQ,reservationsQ,ical,bookingIcal,prices] = await Promise.all([
    retryDb("search_properties",()=>admin.from("properties").select("id,code,name,slug,property_type,tagline,summary,cover_image,gallery,features,cleaning_fee,max_guests,guarantee_amount_cents").eq("active",true).order("id")),
    retryDb("search_reservations",()=>admin.from("reservations").select("id,property_id,check_in,check_out,status,hold_expires_at")
      .lt("check_in",end).gt("check_out",start).in("status",["hold","pending_payment","confirmed"])),
    prodJson("/api/ical-airbnb-all"),
    bookingCalendarData(),
    prodJson("/api/pricelabs-availability?start="+encodeURIComponent(start)+"&end="+encodeURIComponent(end)),
  ]);
  const {data:properties,error:pe}=propertiesQ;
  const {data:dbRows,error:re}=reservationsQ;
  if(pe||re){
    console.error(JSON.stringify({event:"booking_search_db_error",properties:pe?.code||null,reservations:re?.code||null}));
    throw new Error("database_unavailable");
  }
  if(!development && !bookingIcal.configured) throw new Error("booking_not_configured");
  const now=Date.now();
  const dbActive=(dbRows||[]).filter((r:any)=>String(r.id)!==String(excludeReservationId||"")).filter((r:any)=>r.status!=="hold" && r.status!=="pending_payment" ? true : !r.hold_expires_at || Date.parse(r.hold_expires_at)>now);
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
    const dbOccupied=dbActive.some((x:any)=>Number(x.property_id)===Number(p.id));
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
    for(const v of variants||[]){
      const prod=(v as any).experience_products;
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
    .select("id,code,name,multiplier_bps,selectable,cancellation_policy_id,policy_documents(title,body,version,code)")
    .eq("active",true).order("display_order");
  if(ple) throw new Error("rate_plan_failed");

  const inserted:any[]=[];
  const display:any[]=[];
  for(const p of plans||[]){
    const accommodation=Math.round(baseCents*Number(p.multiplier_bps)/10000);
    const total=accommodation+cleaningCents+experienceTotal;
    const row={
      quote_id:q.id,rate_plan_id:p.id,accommodation_amount_cents:accommodation,
      cleaning_fee_cents:cleaningCents,total_amount_cents:total,
      cancellation_policy_id:p.cancellation_policy_id
    };
    if(p.selectable) inserted.push(row);
    display.push({
      code:p.code,name:p.name,selectable:p.selectable,
      stay_amount_cents:accommodation+cleaningCents,
      experience_amount_cents:experienceTotal,total_amount_cents:total,
      cancellation_policy:p.policy_documents||null
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
    .select("id,name,package_type,price_cents,status")
    .in("id",productIds);
  if(pe) return json({ok:false,error:"experience_lookup_failed"},500);

  for(const item of qitems){
    const source=(products||[]).find((p:any)=>String(p.id)===String(item.product_id));
    if(!source||source.status!=="active") continue;

    const {data:above,error:ae}=await admin.from("experience_products")
      .select("id,name,package_type,price_cents,upsell_enabled,status,inventory,experience_property_eligibility!inner(property_id)")
      .eq("package_type",source.package_type)
      .eq("status","active")
      .eq("experience_property_eligibility.property_id",q.property_id)
      .gt("price_cents",Number(source.price_cents))
      .order("price_cents",{ascending:true})
      .limit(1);
    if(ae) return json({ok:false,error:"upsell_lookup_failed"},500);

    const next=(above||[])[0];
    if(!next || next.upsell_enabled!==true || (next.inventory!=null&&Number(next.inventory)<=0)) continue;
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
    .select("id,name,package_type,price_cents,status").in("id",productIds);
  if(cpe) return json({ok:false,error:"experience_lookup_failed"},500);

  const {data:target,error:te}=await admin.from("experience_products")
    .select("id,name,package_type,price_cents,upsell_enabled,status,inventory")
    .eq("id",target_product_id).single();
  if(te||!target||target.status!=="active"||target.upsell_enabled!==true||(target.inventory!=null&&Number(target.inventory)<=0)) return json({ok:false,error:"upsell_not_available"},409);

  const source=(currentProducts||[]).find((p:any)=>p.package_type===target.package_type);
  if(!source) return json({ok:false,error:"upsell_not_available"},409);

  const {data:eligible,error:ee}=await admin.from("experience_products")
    .select("id,name,package_type,price_cents,upsell_enabled,status,inventory,experience_property_eligibility!inner(property_id)")
    .eq("package_type",source.package_type)
    .eq("status","active")
    .eq("experience_property_eligibility.property_id",q.property_id)
    .gt("price_cents",Number(source.price_cents))
    .order("price_cents",{ascending:true})
    .limit(1);
  if(ee) return json({ok:false,error:"upsell_lookup_failed"},500);

  const nextAbove=(eligible||[])[0];
  if(!nextAbove || String(nextAbove.id)!==String(target.id) || nextAbove.upsell_enabled!==true || (nextAbove.inventory!=null&&Number(nextAbove.inventory)<=0))
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
    .select("id,code,name,selectable,cancellation_policy_id,policy_documents(title,body,version,code)")
    .in("id",planIds);
  const byPlan=Object.fromEntries((plans||[]).map((p:any)=>[String(p.id),p]));
  const display=newOptions.map((o:any)=>{
    const p=byPlan[String(o.rate_plan_id)]||{};
    return {
      quote_option_id:o.id,code:p.code,name:p.name,selectable:p.selectable!==false,
      stay_amount_cents:Number(o.accommodation_amount_cents)+Number(o.cleaning_fee_cents),
      experience_amount_cents:newExperienceTotal,total_amount_cents:o.total_amount_cents,
      cancellation_policy:p.policy_documents||null
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

async function startPayment(req:Request,body:any){
  const user=await currentUser(req);
  if(!user) return json({ok:false,error:"authentication_required"},401);
  const {quote_id,quote_option_id,guest_name,guest_email,guest_phone,guests,travel_purpose_code,accepted_document_ids=[],method="mock",installments=1}=body||{};
  if(!quote_id||!quote_option_id||!guest_name||!guest_email||!guest_phone) return json({ok:false,error:"missing_data"},400);

  const {data:settings}=await admin.from("payment_settings").select("*").eq("id",1).single();
  const maxInst=Math.max(1,Number(settings?.max_card_installments||1));
  if(method==="card"&&(Number(installments)<1||Number(installments)>maxInst)) return json({ok:false,error:"invalid_installments"},400);

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

  const policyIds=new Set<string>((Array.isArray(accepted_document_ids)?accepted_document_ids:[]).map(String));
  const cancellationId=(opt as any)?.rate_plans?.cancellation_policy_id;
  if(cancellationId) policyIds.add(String(cancellationId));
  if(policyIds.size){
    const {data:docs}=await admin.from("policy_documents").select("id,code,version").in("id",[...policyIds]);
    if(docs?.length){
      await admin.from("reservation_policy_acceptances").insert(docs.map((d:any)=>({
        reservation_id:reservationId,user_id:user.id,document_id:d.id,document_code:d.code,document_version:d.version
      })));
    }
  }

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

  const paymentIdempotency="mock-"+reservationId;
  const {data:payment,error:payErr}=await admin.from("payments").insert({
    reservation_id:reservationId,user_id:user.id,provider:settings?.active_provider||"mock",
    method:method==="pix"?"pix":method==="card"?"card":"mock",
    installments:method==="card"?Number(installments):null,
    amount_cents:Number(opt.total_amount_cents),
    status:"awaiting_payment",idempotency_key:paymentIdempotency,
    metadata:{development:true}
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

  return json({ok:true,reservation_id:reservationId,confirmation_code:hold.confirmation_code,hold_expires_at:hold.hold_expires_at,payment});
}

async function mockPayment(req:Request,body:any){
  const user=await currentUser(req);
  if(!user) return json({ok:false,error:"authentication_required"},401);
  const {payment_id,outcome}=body||{};
  const {data:p}=await admin.from("payments").select("*,reservations(id,user_id,property_id)").eq("id",payment_id).single();
  if(!p || (p as any).user_id!==user.id) return json({ok:false,error:"not_found"},404);
  const reservationId=(p as any).reservation_id;
  const allowed=["paid","refused","under_review","expired"];
  if(!allowed.includes(outcome)) return json({ok:false,error:"invalid_outcome"},400);

  const current=String((p as any).status||"");
  if(["paid","refused","expired","cancelled","refunded"].includes(current)){
    if(current===outcome) return json({ok:true,outcome,idempotent:true});
    return json({ok:false,error:"payment_state_final"},409);
  }
  if(current==="under_review" && !["paid","refused","expired","under_review"].includes(outcome))
    return json({ok:false,error:"invalid_payment_transition"},409);

  if(outcome==="paid"){
    await admin.from("payments").update({status:"paid"}).eq("id",payment_id);
    await admin.from("reservations").update({status:"confirmed",confirmed_at:new Date().toISOString(),hold_expires_at:null}).eq("id",reservationId);
    await admin.from("experience_orders").update({status:"active"}).eq("reservation_id",reservationId);
    const {data:prop}=await admin.from("reservations").select("property_id,properties(guarantee_amount_cents)").eq("id",reservationId).single();
    const amount=Number((prop as any)?.properties?.guarantee_amount_cents||0);
    if(amount>0){
      const {data:existing}=await admin.from("guarantees").select("id").eq("reservation_id",reservationId).maybeSingle();
      if(!existing) await admin.from("guarantees").insert({reservation_id:reservationId,provider:"mock",amount_cents:amount,status:"pending"});
    }
  } else if(outcome==="under_review"){
    await admin.from("payments").update({status:"under_review"}).eq("id",payment_id);
    await admin.from("reservations").update({status:"pending_payment",hold_expires_at:new Date(Date.now()+60*60000).toISOString()}).eq("id",reservationId);
  } else {
    await admin.from("payments").update({status:outcome==="refused"?"refused":"expired"}).eq("id",payment_id);
    await admin.from("reservations").update({status:"expired",hold_expires_at:new Date().toISOString()}).eq("id",reservationId);
  }
  return json({ok:true,outcome});
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
    .in("status",["requested","quoted","awaiting_guest_acceptance","accepted"])
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
  const option=quote.rate_options.find((x:any)=>x.code===r.rate_plan_code && x.selectable) || quote.rate_options.find((x:any)=>x.code==="non_refundable");
  const originalCents=Math.round(Number(r.stay_amount||0)*100);
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

async function modificationAction(req:Request,body:any){
  const user=await currentUser(req);
  if(!user) return json({ok:false,error:"authentication_required"},401);
  const action=body?.operation;
  const requestId=body?.request_id;
  const {data:m}=await admin.from("modification_requests").select("*,reservations(*)").eq("id",requestId).single();
  if(!m) return json({ok:false,error:"not_found"},404);

  if(action==="guest_cancel"){
    if(m.user_id!==user.id || !["requested","quoted","awaiting_guest_acceptance","accepted"].includes(m.status)) return json({ok:false,error:"not_allowed"},403);
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
      await admin.from("modification_requests").update({status:"rejected",admin_note:body?.admin_note||null,decided_at:new Date().toISOString()}).eq("id",m.id);
      await admin.from("reservation_change_events").insert({reservation_id:m.reservation_id,modification_request_id:m.id,event_type:"rejected",actor_user_id:user.id});
      return json({ok:true,status:"rejected"});
    }
    const amount=Math.max(0,Number(body?.additional_amount_cents||0));
    await admin.from("modification_requests").update({status:"awaiting_guest_acceptance",admin_additional_amount_cents:amount,admin_note:body?.admin_note||null,decided_at:new Date().toISOString()}).eq("id",m.id);
    await admin.from("reservation_change_events").insert({reservation_id:m.reservation_id,modification_request_id:m.id,event_type:"admin_decision",amount_cents:amount,actor_user_id:user.id});
    return json({ok:true,status:"awaiting_guest_acceptance",additional_amount_cents:amount});
  }

  if(action==="apply"){
    if(m.status!=="accepted") return json({ok:false,error:"guest_acceptance_required"},409);
    const {data:rpc,error:rpcErr}=await admin.rpc("apply_modification_mock_atomic",{
      p_request_id:m.id,p_actor_user_id:user.id
    });
    if(rpcErr){
      const msg=String(rpcErr.message||"");
      if(msg.includes("dates_unavailable")) return json({ok:false,error:"dates_unavailable"},409);
      if(msg.includes("additional_payment_not_paid")) return json({ok:false,error:"additional_payment_not_paid"},409);
      if(msg.includes("guest_acceptance_required")) return json({ok:false,error:"guest_acceptance_required"},409);
      return json({ok:false,error:"modification_apply_failed"},500);
    }
    const row=Array.isArray(rpc)?rpc[0]:rpc;
    return json({ok:true,status:"applied",payment_id:row?.result_payment_id||null,total_amount:row?.result_total_amount||null});
  }
  return json({ok:false,error:"invalid_operation"},400);
}

async function opsData(req:Request){
  const user=await currentUser(req);
  if(!user || !(await userIsAdmin(user))) return json({ok:false,error:"admin_required"},403);
  const [{data:mods},{data:guarantees}] = await Promise.all([
    admin.from("modification_requests").select("*,reservations(confirmation_code,check_in,check_out,total_amount,properties(name)),profiles:user_id(full_name,phone)").order("created_at",{ascending:false}).limit(50),
    admin.from("guarantees").select("*,reservations(confirmation_code,properties(name),profiles:user_id(full_name)),incidents(*)").order("created_at",{ascending:false}).limit(50)
  ]);
  return json({ok:true,modifications:mods||[],guarantees:guarantees||[]});
}

async function guaranteeAction(req:Request,body:any){
  const user=await currentUser(req);
  if(!user || !(await userIsAdmin(user))) return json({ok:false,error:"admin_required"},403);
  const {guarantee_id,operation,amount_cents=0,description=""}=body||{};
  const {data:g}=await admin.from("guarantees").select("*,reservations(id)").eq("id",guarantee_id).single();
  if(!g) return json({ok:false,error:"not_found"},404);

  if(operation==="release"){
    if(g.status==="released") return json({ok:true,status:"released"});
    if(["captured","incident_reported","capture_requested","disputed"].includes(g.status))
      return json({ok:false,error:g.status==="captured"?"guarantee_already_captured":"active_incident"},409);
    await admin.from("guarantees").update({status:"released",updated_at:new Date().toISOString()}).eq("id",g.id);
    return json({ok:true,status:"released"});
  }

  if(operation==="report_incident"){
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
    const amount=Math.max(0,Number(amount_cents||0));
    const {data:rpc,error:rpcErr}=await admin.rpc("capture_guarantee_mock_atomic",{
      p_guarantee_id:g.id,p_actor_user_id:user.id,p_amount_cents:amount
    });
    if(rpcErr){
      const msg=String(rpcErr.message||"");
      if(msg.includes("capture_exceeds_guarantee")) return json({ok:false,error:"capture_exceeds_guarantee"},400);
      if(msg.includes("incident_required")) return json({ok:false,error:"incident_required"},409);
      return json({ok:false,error:"guarantee_capture_failed"},500);
    }
    const row=Array.isArray(rpc)?rpc[0]:rpc;
    return json({ok:true,status:"captured",captured_amount_cents:Number(row?.captured_amount_cents||0),released_amount_cents:Number(row?.released_amount_cents||0)});
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
    .select("id,name,description,sales_headline,package_type,price_cents,minimum_lead_hours,daily_capacity,inventory,status,experience_variants(id,code,name,price_cents,active,display_order),experience_property_eligibility!inner(property_id),experience_media(id,media_url,alt_text,display_order)")
    .eq("status","active")
    .eq("experience_property_eligibility.property_id",r.property_id)
    .order("display_order");
  if(pe) return json({ok:false,error:"experience_catalog_unavailable"},500);

  const {data:existing}=await admin.from("experience_orders")
    .select("experience_order_items(product_id,status)")
    .eq("reservation_id",r.id)
    .in("status",["pending","active"]);
  const owned=new Set((existing||[]).flatMap((o:any)=>o.experience_order_items||[]).filter((i:any)=>i.status==="active").map((i:any)=>String(i.product_id)));

  const arrival=Date.parse(String(r.check_in)+"T15:00:00-03:00");
  const now=Date.now();
  const items=[];
  for(const p of products||[]){
    const variant=(p.experience_variants||[]).filter((v:any)=>v.active).sort((a:any,b:any)=>Number(a.display_order)-Number(b.display_order))[0];
    if(!variant) continue;
    const leadOk=(arrival-now)>=Number(p.minimum_lead_hours||0)*3600000;
    const stockOk=p.inventory==null||Number(p.inventory)>0;
    if(!leadOk||!stockOk||owned.has(String(p.id))) continue;

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
      price_cents:Number(variant.price_cents),
      media:(p.experience_media||[]).slice().sort((a:any,b:any)=>Number(a.display_order)-Number(b.display_order))
    });
  }
  return json({ok:true,reservation_id:r.id,items});
}

async function purchasePostBookingExperience(req:Request,body:any,development:boolean){
  const user=await currentUser(req);
  if(!user) return json({ok:false,error:"authentication_required"},401);
  if(!development) return json({ok:false,error:"payment_provider_not_ready"},409);

  const reservationId=String(body?.reservation_id||"");
  const variantId=String(body?.variant_id||"");
  if(!reservationId||!variantId) return json({ok:false,error:"missing_data"},400);

  const {data:settings}=await admin.from("payment_settings").select("active_provider").eq("id",1).single();
  if(settings?.active_provider!=="mock") return json({ok:false,error:"payment_provider_not_ready"},409);

  const {data,error}=await admin.rpc("purchase_post_booking_experience_mock_atomic",{
    p_reservation_id:reservationId,p_user_id:user.id,p_variant_id:variantId
  });
  if(error){
    const msg=String(error.message||"");
    for(const code of ["reservation_not_available","experience_unavailable","experience_lead_time","experience_out_of_stock","experience_already_added","experience_capacity_reached"]){
      if(msg.includes(code)) return json({ok:false,error:code},409);
    }
    return json({ok:false,error:"experience_purchase_failed"},500);
  }
  const row=Array.isArray(data)?data[0]:data;
  return json({
    ok:true,
    order_id:row?.result_order_id||null,
    item_id:row?.result_item_id||null,
    payment_id:row?.result_payment_id||null,
    amount_cents:Number(row?.result_amount_cents||0),
    total_amount:Number(row?.result_total_amount||0)
  });
}

async function trackEvent(req:Request,body:any){
  const allowed=new Set(["search_started","search_completed","property_viewed","rate_viewed","rate_selected","experience_viewed","experience_added","experience_upgraded","checkout_started","login_started","account_created","payment_started","payment_failed","booking_confirmed","modification_requested","precheckin_started","guarantee_completed","checkin_completed","checkout_completed","review_requested","repeat_booking_started"]);
  if(!allowed.has(String(body?.event_name||""))) return json({ok:false,error:"invalid_event"},400);
  const user=await currentUser(req);
  await admin.from("analytics_events").insert({
    event_name:body.event_name,anonymous_id:String(body.anonymous_id||"").slice(0,120)||null,user_id:user?.id||null,
    reservation_id:body.reservation_id||null,property_id:body.property_id||null,
    metadata:typeof body.metadata==="object"&&body.metadata?body.metadata:{}
  });
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
    const development=req.headers.get("x-chalezinho-env")==="development";

    if(action==="config"){
      const purposesQ=await retryDb("travel_purposes",()=>admin.from("travel_purposes").select("*").eq("active",true).order("display_order"));
      if(purposesQ.error) return json({ok:false,error:"config_unavailable"},500);

      const settingsQ=await retryDb("payment_settings",()=>admin.from("payment_settings").select("active_provider,charge_percent,pix_expiration_minutes,max_card_installments").eq("id",1).single());
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
    if(action==="start_payment") return await startPayment(req,body);
    if(action==="mock_payment") return await mockPayment(req,body);
    if(action==="request_modification") return await requestModification(req,body,development);
    if(action==="modification_action") return await modificationAction(req,body);
    if(action==="ops") return await opsData(req);
    if(action==="guarantee_action") return await guaranteeAction(req,body);
    if(action==="experience_admin") return await experienceAdminData(req);
    if(action==="experience_admin_action") return await experienceAdminAction(req,body);
    if(action==="guest_experience_catalog") return await guestExperienceCatalog(req,body);
    if(action==="purchase_post_booking_experience") return await purchasePostBookingExperience(req,body,development);
    if(action==="track") return await trackEvent(req,body);

    return json({ok:false,error:"unknown_action"},404);
  }catch(e){
    const msg=String((e as Error)?.message||"unexpected_error");
    const minMatch=/^minimum_stay:(\d+)$/.exec(msg);
    if(minMatch) return json({ok:false,error:"minimum_stay",min_stay:Number(minMatch[1])},400);
    if(msg==="booking_not_configured") return json({ok:false,error:"booking_not_configured"},503);
    const clientErrors=["invalid_dates","property_not_found","occupied","capacity","minimum_stay","rate_unavailable","experience_unavailable","modification_already_open","upsell_not_available"];
    return json({ok:false,error:msg},clientErrors.includes(msg)?400:500);
  }
});
