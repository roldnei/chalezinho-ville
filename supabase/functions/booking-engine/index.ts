import {villegramStayQuote} from '../_shared/villegram-stay.ts';
import {isCelebration} from "../_shared/stay-showcase.ts";
import {villegramService} from "../_shared/villegram.ts";
import {bookingDocuments,assertBookingConsent} from "../_shared/booking-consent.ts";
import {publicProperty} from "../_shared/public-property.ts";
import {offerIssues,priceStayOffer,compositionSnapshot,experienceComponents} from "../_shared/stay-offers.ts";
import {cachedWeekdayShowcase} from "../_shared/stay-showcase.ts";
import {persistentShowcase,showcaseCacheKey} from "../_shared/showcase-cache.ts";
import {stayOfferService} from "../_shared/stay-offer-service.ts";
import {sameDayRequests,approvedSameDayRequest} from "../_shared/same-day-requests.ts";
import {brazilClock,availabilityRules,availabilityDecision,preparationOverlap,shiftDate} from "../_shared/availability.ts";
import {guestDirectory} from "../_shared/guest-directory.ts";
import {accessInput,accessReport,recordAccessBooking} from "../_shared/access-metrics.ts";
import {calendarService,calendarUrl,calendarProvider,fetchCalendar,calendarPeriodKey} from "../_shared/calendars.ts";
import {experiencePaymentEntries} from "../_shared/finance/experience-payment-entries.ts";
import {experienceCreditService} from "../_shared/finance/experience-credits.ts";
import {paymentGateway} from "../_shared/finance/gateway.ts";
import {assertFinanceDevelopment} from "../_shared/finance/environment.ts";
import {reservationRefundService} from "../_shared/finance/reservation-refunds.ts";
import {loadInstallmentOffer} from "../_shared/finance/installments.ts";
import {reservationFinance} from "../_shared/finance/reservation-report.ts";
import {reservationIncident} from "../_shared/finance/incidents.ts";
import {paymentTerms,assertPaymentMethod,validatePaymentSettings} from "../_shared/finance/settings.ts";
import {guaranteeCoverage} from "../_shared/finance/guarantee-lifecycle.ts";
import {guaranteeState} from "../_shared/finance/model.ts";

import { createClient } from "npm:@supabase/supabase-js@2";
import { getPagBankCardPublicKey, pagBankInstallmentPlans, tokenizePagBankCard, validPagBankCustomerName } from "./pagbank.ts";

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
const {reservationRefundAction,reservationRefundStatus,reservationCancelRequest}=reservationRefundService({admin,currentUser,userIsAdmin,json});

const experienceCredit=experienceCreditService({admin,currentUser,userIsAdmin,json});
const villegram=villegramService({admin,currentUser,userIsAdmin,json});
const stayOffers=stayOfferService({admin,currentUser,userIsAdmin,json,projectUrl});

async function developmentPolicies(){
  const {data,error}=await admin.from("cancellation_policy_assignments")
    .select("rate_plan_code,cancellation_policy_rules!inner(commercial_free_cancellation_hours,withdrawal_days,full_refund_days_before_checkin,late_accommodation_refund_percent,policy_documents!inner(id,title,body,version,code))")
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
function spreadBuyerFee(amounts:number[],fee:number){
  const base=amounts.reduce((s,v)=>s+v,0);
  if(!Number.isSafeInteger(base)||base<1||!Number.isSafeInteger(fee)||fee<0||
      amounts.some(v=>!Number.isSafeInteger(v)||v<0)) throw new Error("invalid_fee_allocation");
  let remaining=fee;
  return amounts.map((value,index)=>{
    const share=index===amounts.length-1?remaining:Math.floor(fee*value/base);
    remaining-=share;return value+share;
  });
}
async function chargeInstallments(propertyId:number,amountCents:number,installments:number,bin:string,token:string){
  const {data:property,error}=await admin.from("properties").select("features").eq("id",propertyId).single();
  if(error||!property) throw new Error("property_unavailable");
  const terms=paymentTerms(property.features);
  const free=terms.interest_payer==='merchant'?terms.max_installments:terms.no_interest_installments;
  if(!Number.isInteger(installments)||installments<1||installments>terms.max_installments)
    throw new Error("invalid_installments");
  let plans,feeFallback=false;
  try{
    plans=await pagBankInstallmentPlans(token,amountCents,terms.max_installments,
      free,bin);
  }catch(error){
    if(bin.length===8&&error instanceof Error&&error.message==="pagbank_fees_http_400_code_credit_card_bin_data_not_found"){
      try{plans=await pagBankInstallmentPlans(token,amountCents,terms.max_installments,
        free,bin.slice(0,6));}
      catch(retryError){error=retryError;}
    }
    if(plans){const plan=plans.find(p=>p.installments===installments);
      if(!plan)throw new Error("installment_unavailable");
      return {plan,terms,plans,feeFallback:false};}
    // Some sandbox card BINs are rejected by the fee simulator. Never invent
    // buyer interest; the merchant-funded installments still use the exact
    // reservation total and can be presented safely.
    if(!(error instanceof Error)||error.message!=="pagbank_fees_http_400_code_credit_card_bin_data_not_found"||
       !/^\d{6}(\d{2})?$/.test(bin))throw error;
    feeFallback=true;
    plans=Array.from({length:Math.min(terms.max_installments,Math.max(1,free))},(_,i)=>({
      installments:i+1,installment_cents:Math.ceil(amountCents/(i+1)),total_cents:amountCents,
      buyer_interest_cents:0,buyer_interest_installments:0,interest_free:true
    })).filter(p=>p.installment_cents>=500);
  }
  const plan=plans.find(p=>p.installments===installments);
  if(!plan) throw new Error("installment_unavailable");
  return {plan,terms,plans,feeFallback};
}
async function installmentOptions(req:Request,body:any,development:boolean){
  if(!development) return json({ok:false,error:"not_allowed"},403);
  const user=await currentUser(req);
  if(!user) return json({ok:false,error:"authentication_required"},401);
  // Before card entry, show an estimate only. Freeze the provider quote for the
  // actual BIN before the guest confirms the total and starts payment.
  const {data:settings,error:settingsError}=await admin.from("payment_settings").select("active_provider,pix_enabled,card_enabled").eq("id",1).single();
  if(settingsError)return json({ok:false,error:"payment_settings_unavailable"},503);
  try{assertPaymentMethod(settings,"card")}catch(e){return json({ok:false,error:(e as Error).message},409)}
  const actualBin=String(body?.credit_card_bin||"");
  const indicative=!actualBin;
  const bin=actualBin||"552100";
  if(!/^\d{6}(\d{2})?$/.test(bin)) return json({ok:false,error:"invalid_card_bin"},400);
  const token=Deno.env.get("PAGBANK_SANDBOX_TOKEN")||"";
  if(!token) return json({ok:false,error:"pagbank_sandbox_not_configured"},503);
  let amount=0,propertyId=0,expiresAt="";
  if(body?.quote_option_id){
    const {data:option}=await admin.from("quote_options").select("total_amount_cents,quotes(property_id,expires_at)")
      .eq("id",String(body.quote_option_id)).maybeSingle();
    const quote=option?.quotes as any;
    if(!quote||Date.parse(quote.expires_at)<=Date.now()) return json({ok:false,error:"quote_expired"},409);
    amount=Number(option.total_amount_cents);propertyId=Number(quote.property_id);expiresAt=quote.expires_at;
  }else if(body?.post_booking_charge_id){
    const {data:charge}=await admin.from("post_booking_charges")
      .select("amount_cents,expires_at,reservations(property_id)")
      .eq("id",String(body.post_booking_charge_id)).eq("user_id",user.id).maybeSingle();
    if(!charge||Date.parse(charge.expires_at)<=Date.now()) return json({ok:false,error:"charge_expired"},409);
    amount=Number(charge.amount_cents);propertyId=Number((charge.reservations as any)?.property_id);expiresAt=charge.expires_at;
  }else return json({ok:false,error:"missing_data"},400);
  try{
    const {terms,plans,feeFallback}=await chargeInstallments(propertyId,amount,1,bin,token);
    if(indicative)return json({ok:true,offer_id:null,expires_at:expiresAt,base_amount_cents:amount,terms,plans,indicative:true});
    const {data:offer,error}=await admin.from("installment_offers").insert({user_id:user.id,
      quote_option_id:body.quote_option_id||null,post_booking_charge_id:body.post_booking_charge_id||null,
      base_amount_cents:amount,provider:"pagbank_sandbox",plans,terms:{...terms,card_bin:actualBin},expires_at:expiresAt}).select("id").single();
    if(error)throw new Error("installment_offer_unavailable");
    return json({ok:true,offer_id:offer.id,expires_at:expiresAt,base_amount_cents:amount,terms,plans,indicative:false,fee_fallback:feeFallback});
  }catch(e){console.error(JSON.stringify({event:"installment_options_failed",code:e instanceof Error?e.message:"unknown"}));return json({ok:false,error:e instanceof Error&&e.message==="invalid_payment_terms"?
    "invalid_payment_terms":"installment_plans_unavailable"},503)}
}

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

const calendars=calendarService(admin,projectUrl);
async function bookingCalendarData(){return calendars.channels("booking")}
async function airbnbCalendarData(){
 const data=await calendars.channels("airbnb");
 // Transitional compatibility for existing Airbnb channels; newly entered links always win.
 if(!data.listings.some((x:any)=>x.error==="calendar_not_configured"))return data;
 const legacy=await prodJson("/api/ical-airbnb-all").catch(()=>({listings:[]}));
 const listings=data.listings.map((x:any)=>x.error==="calendar_not_configured"?(()=>{const old=(legacy.listings||[]).find((y:any)=>y.name===x.name);return {...x,...(old||{}),periods:[...x.periods,...(old?.periods||[])],migration_pending:true}})():x);
 return {...data,listings,ok:listings.every((x:any)=>x.ok)};
}
async function adminCalendarAction(req:Request,body:any){
 const user=await currentUser(req);
 if(!user||!await userIsAdmin(user))return json({ok:false,error:"admin_required"},403);
 const operation=String(body.operation||"list");
 if(operation==="list")return json({ok:true,...await calendars.configuration()});
 const propertyId=Number(body.property_id);
 const {data:property,error:propertyError}=await admin.from("properties").select("id").eq("id",propertyId).maybeSingle();
 if(propertyError||!property)return json({ok:false,error:"property_not_found"},404);
 if(operation==="rotate"){
  const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,"0")).join("");
  const {error}=await admin.from("property_calendar_exports").update({token}).eq("property_id",propertyId);
  if(error)return json({ok:false,error:"calendar_save_failed"},500);
 }else if(["save","test","delete"].includes(operation)){
  const sourceId=body.source_id?String(body.source_id):null;
  let existing:any=null;
  if(sourceId){const result=await admin.from("property_calendar_sources").select("*").eq("id",sourceId).eq("property_id",propertyId).is("deleted_at",null).maybeSingle();if(result.error||!result.data)return json({ok:false,error:"calendar_not_found"},404);existing=result.data}
  if(operation==="delete"){
   if(!existing)return json({ok:false,error:"calendar_not_found"},404);
   const now=new Date().toISOString();const {error}=await admin.from("property_calendar_sources").update({deleted_at:now,enabled:false,updated_at:now}).eq("id",sourceId).eq("property_id",propertyId);
   if(error)return json({ok:false,error:"calendar_save_failed"},500);
  }else if(operation==="test"){
   if(!existing?.feed_url)return json({ok:false,error:"calendar_not_configured"},400);
   let events=0,failure=null;
   try{events=(await fetchCalendar(existing.feed_url,existing.provider)).length}catch{failure="calendar_validation_failed"}
   const now=new Date().toISOString();await admin.from("property_calendar_sources").update({last_checked_at:now,last_error:failure,...(!failure?{last_success_at:now,event_count:events}:{})}).eq("id",sourceId).eq("updated_at",existing.updated_at);
   return json({ok:true,result:{healthy:!failure,events}});
  }else{
   const label=String(body.label||"").trim().slice(0,120),enabled=body.enabled!==false;
   if(!label)return json({ok:false,error:"calendar_name_required"},400);
   let url:string,provider:string,periods:any[]=[];
   try{url=calendarUrl(String(body.feed_url||"").trim());provider=calendarProvider(url);if(enabled)periods=await fetchCalendar(url,provider)}catch(e){return json({ok:false,error:"calendar_validation_failed"},400)}
   // Prevent importing this site's own feed into itself.
   if(new URL(url).origin===projectUrl&&new URL(url).searchParams.get("action")==="calendar_export")return json({ok:false,error:"calendar_self_import"},400);
   const now=new Date().toISOString(),values={property_id:propertyId,provider,label,feed_url:url,enabled,last_error:null,last_checked_at:enabled?now:null,last_success_at:enabled?now:null,event_count:enabled?periods.length:null,updated_at:now};
   const {error}=existing?await admin.from("property_calendar_sources").update(values).eq("id",sourceId).eq("property_id",propertyId):await admin.from("property_calendar_sources").insert(values);
   if(error)return json({ok:false,error:error.code==="23505"?"calendar_duplicate":"calendar_save_failed"},error.code==="23505"?409:500);
  }
 }else return json({ok:false,error:"invalid_operation"},400);
 await admin.from("audit_events").insert({actor_user_id:user.id,action:"calendar_"+operation,entity_type:"property",entity_id:String(propertyId),new_value:{source_id:body.source_id||null}});
 return json({ok:true,...await calendars.configuration()});
}

async function searchSources(start:string,end:string){
  return Promise.all([
    retryDb("search_properties",()=>admin.from("properties").select("id,code,name,slug,property_type,tagline,summary,cover_image,gallery,features,cleaning_fee,max_guests,guarantee_amount_cents,check_in_time,check_out_time,timezone").eq("active",true).order("id")),
    retryDb("search_reservations",()=>admin.from("reservations").select("id,property_id,check_in,check_out,status,hold_expires_at")
      .lt("check_in",shiftDate(end,7)).gt("check_out",shiftDate(start,-7)).in("status",["hold","pending_payment","confirmed"])),
    retryDb("search_change_holds",()=>admin.from("post_booking_charges").select("id,reservation_id,target_property_id,target_check_in,target_check_out,status,expires_at")
      .eq("kind","modification").in("status",["awaiting_payment","processing","paid"])
      .lt("target_check_in",shiftDate(end,7)).gt("target_check_out",shiftDate(start,-7)).gt("expires_at",new Date().toISOString())),
    retryDb("search_operational_blocks",()=>admin.from("pms_calendar_blocks").select("id,property_id,start_date,end_date")
      .eq("status","active").lt("start_date",end).gt("end_date",start)),
    airbnbCalendarData(),
    bookingCalendarData(),
    prodJson("/api/pricelabs-availability?start="+encodeURIComponent(start)+"&end="+encodeURIComponent(end)),
  ]);
}
async function searchData(start:string,end:string,guests:number,excludeReservationId:string|null=null,development=false,approvedSameDay=false,sources:any=null){
  if(!validDate(start)||!validDate(end)||end<=start)throw Error("invalid_dates");
  const stay=nights(start,end);if(stay<1)throw Error("invalid_dates");
  const [propertiesQ,reservationsQ,changeHoldsQ,blocksQ,ical,bookingIcal,prices]=sources||await searchSources(start,end);
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
    const rawPrice:any=priceMap[p.name];
    const pricedDays=sources?(rawPrice?.days||[]).filter((d:any)=>d.date>=start&&d.date<end):null;
    const pr=sources&&rawPrice?{...rawPrice,days:pricedDays,total_price:pricedDays.reduce((sum:number,d:any)=>sum+Number(d.price),0),min_stay:pricedDays.find((d:any)=>d.date===start)?.min_stay}:rawPrice;
    const rules=availabilityRules(p.features?.availability||{});
    const sameDayApproval=rules.allow_same_day_requests&&start===brazilClock().date;
    const decision=availabilityDecision(sameDayApproval?{...rules,lead_days:0,same_day_cutoff:"23:59"}:rules,start,end,pr?.min_stay);
    const occupied=(x:any)=>preparationOverlap(start,end,x.start,x.end,rules.preparation_days);
    const airbnbOccupied=!cal?.ok || (cal.periods||[]).some(occupied);
    const bookingOccupied=bookingIcal.configured && (!bookingCal?.ok || (bookingCal.periods||[]).some(occupied));
    const channelOccupied=airbnbOccupied||bookingOccupied;
    const dbOccupied=dbActive.some((x:any)=>Number(x.property_id)===Number(p.id)&&occupied({start:x.check_in,end:x.check_out}))
      || changeHoldActive.some((x:any)=>Number(x.target_property_id)===Number(p.id)&&occupied({start:x.target_check_in,end:x.target_check_out}))
      || (operationalBlocks||[]).some((x:any)=>Number(x.property_id)===Number(p.id)&&overlaps(start,end,x.start_date,x.end_date));
    const minStay=decision.min_stay;
    const hasPrice=Array.isArray(pr?.days)&&pr.days.length===stay&&Number.isFinite(Number(pr?.total_price));
    const requestable=!channelOccupied&&!dbOccupied&&guests<=Number(p.max_guests)&&!decision.reason&&hasPrice;
    const available=requestable&&(!sameDayApproval||approvedSameDay);
    return {
      ...p,
      cleaning_fee:Number(p.cleaning_fee||0),
      min_stay:minStay,
      base_price:hasPrice?Number(pr.total_price):null,
      available,same_day_approval_required:sameDayApproval,requestable:sameDayApproval&&requestable,
      unavailable_reason: channelOccupied||dbOccupied ? "occupied" : guests>Number(p.max_guests) ? "capacity" : decision.reason ? decision.reason : !hasPrice ? "rate_unavailable" : sameDayApproval&&!approvedSameDay ? "same_day_approval_required" : null
    };
  });
}

// One read snapshot per merchandising batch; actual checkout never uses this context.
async function showcaseQuoteContext(catalog:any,development:boolean){
 const ids=[...new Set(catalog.products.flatMap((p:any)=>(p.experience_variants||[]).map((v:any)=>v.id)))];
 const [variants,eligible,plans,policies]=await Promise.all([
  admin.from("experience_variants").select("id,code,name,price_cents,active,product_id,experience_products!inner(id,code,name,status,minimum_lead_hours,daily_capacity,inventory,package_type,price_cents,upsell_enabled,details)").in("id",ids),
  admin.from("experience_property_eligibility").select("product_id,property_id"),
  admin.from("rate_plans").select("id,code,name,multiplier_bps,selectable,cancellation_policy_id,policy_documents(id,title,body,version,code)").eq("active",true).order("display_order"),
  development?developmentPolicies():Promise.resolve([])
 ]);
 if(variants.error||eligible.error)throw Error("experience_lookup_failed");if(plans.error)throw Error("rate_plan_failed");
 return {variants:variants.data||[],eligible:eligible.data||[],plans:plans.data||[],policies};
}
async function createQuote(body:any, development:boolean,excludeReservationId:string|null=null,approvedRequest:any=null,availableList:any[]=null,persist=true,offerCatalog:any=null,readContext:any=null){
  const {property_id,check_in,check_out,guests}=body||{};
  let experience_variant_ids=Array.isArray(body.experience_variant_ids)?[...new Set(body.experience_variant_ids)]:[];
  let offer:any=null;
  if(body.stay_offer_id){
    const catalog=offerCatalog||await stayOffers.catalog();offer=catalog.offers.find((x:any)=>x.id===body.stay_offer_id);
    if(offer?.showcase&&isCelebration(body.check_in,body.check_out,offer.showcase)&&!offer.showcase.celebration_discount)offer={...offer,discount_enabled:false};
    if(!offer)throw Error("offer_unavailable");
    const issues=offerIssues(offer,catalog.products,Number(property_id),{check_in,check_out});
    if(issues.length)throw Error(issues[0]);
    for(const id of offer.product_ids){
      const product=catalog.products.find((x:any)=>x.id===id);
      const variant=product.experience_variants.filter((x:any)=>x.active).sort((a:any,b:any)=>a.display_order-b.display_order)[0];
      if(!variant)throw Error("package_unavailable");
      experience_variant_ids=experience_variant_ids.filter((vid:any)=>!product.experience_variants.some((x:any)=>x.id===vid));
      experience_variant_ids.push(variant.id);
    }
  }
  const list=availableList||await searchData(String(check_in||""),String(check_out||""),Number(guests||0),excludeReservationId,development,!!approvedRequest);
  const property=list.find((x:any)=>Number(x.id)===Number(property_id));
  if(!property) throw new Error("property_not_found");
  if(!property.available){
    if(property.unavailable_reason==="minimum_stay") throw new Error("minimum_stay:"+Number(property.min_stay||1));
    throw new Error(property.unavailable_reason||"unavailable");
  }

  let experienceTotal=0;
  const expSnapshots:any[]=[];
  if(Array.isArray(experience_variant_ids)&&experience_variant_ids.length){
    const {data:variants,error}=!persist&&readContext?{data:readContext.variants.filter((v:any)=>experience_variant_ids.includes(v.id)),error:null}:await admin.from("experience_variants")
      .select("id,code,name,price_cents,active,product_id,experience_products!inner(id,code,name,status,minimum_lead_hours,daily_capacity,inventory,package_type,price_cents,upsell_enabled,details)")
      .in("id",experience_variant_ids);
    if(error) throw new Error("experience_lookup_failed");
    if(variants?.length!==experience_variant_ids.length)throw Error("experience_unavailable");
    const productIds=[...new Set((variants||[]).map((v:any)=>v.product_id))];
    const {data:eligibleRows}=!persist&&readContext?{data:readContext.eligible.filter((r:any)=>Number(r.property_id)===Number(property.id)&&productIds.includes(r.product_id))}:await admin.from("experience_property_eligibility").select("product_id").eq("property_id",property.id).in("product_id",productIds);
    const eligible=new Set((eligibleRows||[]).map((x:any)=>String(x.product_id)));
    const seenPackageTypes=new Set<string>();
    const seenComponents=new Set<string>();
    for(const v of variants||[]){
      const prod=(v as any).experience_products;
      const packageType=String(prod.package_type||"other");
      if(seenPackageTypes.has(packageType)) throw new Error("experience_category_conflict");
      seenPackageTypes.add(packageType);
      const leadOk=(Date.parse(check_in+"T15:00:00-03:00")-Date.now()) >= Number(prod.minimum_lead_hours||0)*3600000;
      const stockOk=prod.inventory==null || Number(prod.inventory)>0;
      const allowed=v.active && eligible.has(String(prod.id)) && stockOk && prod.status==="active";
      if(!allowed) throw new Error("experience_unavailable");
      const viability=await admin.rpc("experience_sale_issue",{p_product:prod.id,p_property:property.id,p_start:check_in,p_end:check_out,p_exclude:excludeReservationId});
      if(viability.error)throw Error("experience_lookup_failed");if(viability.data)throw Error(viability.data);
      const included=offer?.product_ids.includes(prod.id)||false;
      if(!included&&prod.details?.standalone_enabled===false)throw Error("experience_not_sold_separately");
      for(const c of experienceComponents(prod.details)){const key=c.name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();if(seenComponents.has(key))throw Error("experience_component_conflict");seenComponents.add(key)}
      experienceTotal+=Number(v.price_cents||0);
      expSnapshots.push({variant:v,product:prod,included,composition:compositionSnapshot(prod,body.experience_preferences?.[prod.id]||{})});
    }
  }

  const baseCents=cents(property.base_price);
  const cleaningCents=cents(property.cleaning_fee);
  const expiresAt=new Date(Date.now()+15*60000).toISOString();
  const result=persist?await admin.from("quotes").insert({
    property_id:property.id,
    client_token_hash:crypto.randomUUID(),
    check_in,check_out,guests:Number(guests),
    base_amount_cents:baseCents,
    cleaning_fee_cents:cleaningCents,
    pricing_snapshot:{source:"pricelabs",base_price:property.base_price,min_stay:property.min_stay,experience_total_cents:experienceTotal,stay_offer_id:offer?.id||null,...(approvedRequest?{same_day_request_id:approvedRequest.id,same_day_user_id:approvedRequest.user_id}:{})},
    rules_version:"2026-09-v1",
    expires_at:expiresAt
  }).select().single():{data:{id:null},error:null};
  const {data:q,error:qe}=result;
  if(qe||!q) throw new Error("quote_create_failed");

  if(persist&&expSnapshots.length){
    const rows=expSnapshots.map(x=>({
      quote_id:q.id,product_id:x.product.id,variant_id:x.variant.id,
      product_name_snapshot:x.product.name,variant_name_snapshot:x.variant.code==="package"?null:x.variant.name,
      unit_price_cents:Number(x.variant.price_cents),quantity:1,composition_snapshot:x.composition
    }));
    const {error}=await admin.from("quote_experience_items").insert(rows);
    if(error) throw new Error("quote_experience_failed");
  }

  const {data:plans,error:ple}=!persist&&readContext?{data:readContext.plans,error:null}:await admin.from("rate_plans")
    .select("id,code,name,multiplier_bps,selectable,cancellation_policy_id,policy_documents(id,title,body,version,code)")
    .eq("active",true).order("display_order");
  if(ple) throw new Error("rate_plan_failed");
  const policyAssignments=!persist&&readContext?readContext.policies:development?await developmentPolicies():[];

  const inserted:any[]=[];
  const display:any[]=[];
  for(const p of plans||[]){
    const cancellationPolicy=development&&p.selectable?policyForPlan(policyAssignments,p.code):p.policy_documents;
    if(development&&p.selectable&&!cancellationPolicy) throw new Error("cancellation_policy_unavailable");
    const accommodation=Math.round(baseCents*Number(p.multiplier_bps)/10000);
    const price=priceStayOffer([{key:"accommodation",gross_cents:accommodation,included:!!offer},{key:"cleaning",gross_cents:cleaningCents,included:!!offer},...expSnapshots.map(x=>({key:x.product.id,gross_cents:Number(x.variant.price_cents),included:x.included}))],offer);
    const contract={property_id:property.id,property_name:property.name,check_in,check_out,guests:Number(guests),rate_code:p.code,rate_name:p.name,cancellation_policy:cancellationPolicy,offer_version:offer?.updated_at||null,offer_rules:offer?{min_nights:offer.min_nights,max_nights:offer.max_nights,start_date:offer.start_date,end_date:offer.end_date,property_ids:offer.property_ids}:null,payment_terms:property.features?.payment_terms||null,price_source:"pricelabs",offer_id:offer?.id||null,offer_name:offer?.name||null,description:offer?.description||null,discount_bps:offer?.discount_bps||0,discount_enabled:offer?.discount_enabled||false,...price,experiences:expSnapshots.map(x=>({...x.composition,included:x.included,net_price_cents:price.lines.find(l=>l.key===x.product.id)?.net_cents}))};
    const netAccommodation=price.lines[0].net_cents,netCleaning=price.lines[1].net_cents,netExperiences=price.lines.slice(2).reduce((s,x)=>s+x.net_cents,0);
    const total=price.total_cents;
    const row={
      quote_id:q.id,rate_plan_id:p.id,accommodation_amount_cents:netAccommodation,
      cleaning_fee_cents:netCleaning,total_amount_cents:total,contract_snapshot:contract,
      cancellation_policy_id:cancellationPolicy?.id||null
    };
    if(p.selectable) inserted.push(row);
    display.push({
      code:p.code,name:p.name,selectable:p.selectable,
      accommodation_amount_cents:netAccommodation,cleaning_fee_cents:netCleaning,
      stay_amount_cents:netAccommodation+netCleaning,contract_snapshot:contract,
      experience_amount_cents:netExperiences,total_amount_cents:total,
      cancellation_policy:cancellationPolicy||null
    });
  }
  let optionRows:any[]=[];
  if(persist&&inserted.length){
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
    product_id:x.product.id,product:x.product.name,package_type:x.product.package_type,included:x.included,composition:x.composition,
    variant:x.variant.code==="package"?null:x.variant.name,price_cents:Number(x.variant.price_cents)
  }))};
}



async function upsellPreview(body:any){
  const {quote_id}=body||{};
  if(!quote_id) return json({ok:false,error:"missing_data"},400);

  const {data:q,error:qe}=await admin.from("quotes")
    .select("id,property_id,status,expires_at,pricing_snapshot")
    .eq("id",quote_id).eq("status","active").gt("expires_at",new Date().toISOString()).single();
  if(qe||!q) return json({ok:false,error:"quote_expired"},409);

  const {data:qitems,error:qie}=await admin.from("quote_experience_items")
    .select("product_id,unit_price_cents,created_at")
    .eq("quote_id",quote_id).order("created_at");
  if(qie) return json({ok:false,error:"experience_lookup_failed"},500);
  if(!qitems?.length||q.pricing_snapshot?.stay_offer_id) return json({ok:true,upsell:null});

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

  if(q.pricing_snapshot?.stay_offer_id)return json({ok:false,error:"offer_composition_fixed"},409);
  const {data:oldOptions,error:ooe}=await admin.from("quote_options")
    .select("id,rate_plan_id,accommodation_amount_cents,cleaning_fee_cents,total_amount_cents,cancellation_policy_id")
    .eq("quote_id",quote_id);
  if(ooe||!oldOptions?.length) return json({ok:false,error:"invalid_quote_option"},400);
  const oldSelected=oldOptions.find((x:any)=>String(x.id)===String(quote_option_id));
  if(!oldSelected) return json({ok:false,error:"invalid_quote_option"},400);

  const {data:qitems,error:qie}=await admin.from("quote_experience_items")
    .select("product_id,variant_id,product_name_snapshot,variant_name_snapshot,unit_price_cents,quantity,composition_snapshot,created_at")
    .eq("quote_id",quote_id).order("created_at");
  if(qie) return json({ok:false,error:"experience_lookup_failed"},500);
  if(!qitems?.length) return json({ok:false,error:"upsell_not_available"},409);

  const productIds=[...new Set(qitems.map((x:any)=>x.product_id))];
  const {data:currentProducts,error:cpe}=await admin.from("experience_products")
    .select("id,name,package_type,price_cents,upsell_enabled,status").in("id",productIds);
  if(cpe) return json({ok:false,error:"experience_lookup_failed"},500);

  const {data:target,error:te}=await admin.from("experience_products")
    .select("id,name,package_type,price_cents,status,inventory,details")
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
      unit_price_cents:x.unit_price_cents,quantity:x.quantity,composition_snapshot:x.composition_snapshot
    }));
  newItems.push({
    quote_id:newQ.id,product_id:target.id,variant_id:targetVariant.id,
    product_name_snapshot:target.name,variant_name_snapshot:targetVariant.code==="package"?null:targetVariant.name,
    unit_price_cents:Number(target.price_cents),quantity:1,composition_snapshot:compositionSnapshot(target)
  });
  const {error:nie}=await admin.from("quote_experience_items").insert(newItems);
  if(nie){await admin.from("quotes").delete().eq("id",newQ.id);return json({ok:false,error:"quote_experience_failed"},500);}

  const newOptionRows=oldOptions.map((o:any)=>({
    contract_snapshot:{...priceStayOffer([{key:"accommodation",gross_cents:Number(o.accommodation_amount_cents),included:false},{key:"cleaning",gross_cents:Number(o.cleaning_fee_cents),included:false},...newItems.map((i:any)=>({key:i.product_id,gross_cents:Number(i.unit_price_cents),included:false}))]),offer_id:null,experiences:newItems.map((i:any)=>({...i.composition_snapshot,included:false,net_price_cents:Number(i.unit_price_cents)}))},
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
      experience_amount_cents:newExperienceTotal,total_amount_cents:o.total_amount_cents,contract_snapshot:o.contract_snapshot,
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
    if(!validPagBankCustomerName(guest_name))return json({ok:false,error:"pagbank_customer_name_invalid"},400);
    if(!/^\d{2}\d{8,9}$/.test(phone)||
       String(guest_email).toLowerCase()!==String(user.email).toLowerCase())
      return json({ok:false,error:"pagbank_customer_invalid"},400);
  }

  const {data:settings}=await admin.from("payment_settings").select("*").eq("id",1).single();
  try{assertPaymentMethod(settings,method)}catch(e){return json({ok:false,error:(e as Error).message},409)}
  if(method==="card"&&(!Number.isInteger(Number(installments))||Number(installments)<1||Number(installments)>12))
    return json({ok:false,error:"invalid_installments"},400);

  const {data:option,error:optionError}=await admin.from("quote_options")
    .select("id,quote_id,cancellation_policy_id,total_amount_cents,contract_snapshot,quotes(property_id,pricing_snapshot)")
    .eq("id",quote_option_id).eq("quote_id",quote_id).single();
  if(optionError||!option) return json({ok:false,error:"invalid_quote_option"},400);
  if((option.quotes as any)?.pricing_snapshot?.modification_only)return json({ok:false,error:"modification_quote_not_payable"},409);
  if(option.contract_snapshot?.experiences?.some((p:any)=>p.components?.some((c:any)=>c.choices?.length&&!c.choice)))return json({ok:false,error:"experience_choice_required"},400);
  const {data:property}=await admin.from("properties").select("guarantee_amount_cents")
    .eq("id",(option.quotes as any)?.property_id).single();
  if(!property)return json({ok:false,error:"property_unavailable"},503);
  const needsGuarantee=Number(property.guarantee_amount_cents)>0;
  if(needsGuarantee&&(typeof body?.encrypted_card!=="string"||
     body.encrypted_card.length<20||body.encrypted_card.length>10000))
    return json({ok:false,error:"guarantee_card_required"},400);
  if(method==="card"&&Number(option.total_amount_cents)/Number(installments)<500)
    return json({ok:false,error:"installment_below_minimum"},400);
  let selectedPlan:any=null;
  if(method==="card"){
    try{
      selectedPlan=await loadInstallmentOffer(admin,String(body.installment_offer_id||""),{
          userId:user.id,quoteOptionId:option.id,baseAmount:Number(option.total_amount_cents),installments:Number(installments),cardBin:String(body.credit_card_bin||"")});
    }catch(e){return json({ok:false,error:e instanceof Error&&e.message==="invalid_installments"?
      "invalid_installments":"installment_plans_unavailable"},409)}
  }
  const baseAmount=Number(option.total_amount_cents);
  const buyerInterest=Number(selectedPlan?.buyer_interest_cents||0);
  const chargedAmount=baseAmount+buyerInterest;
  if(method==="card"&&Number(body?.quoted_total_cents)!==chargedAmount)
    return json({ok:false,error:"installment_quote_changed"},409);
  const requiredPolicyId=option.cancellation_policy_id;
  const {data:termsRows,error:termsError}=await admin.from("policy_documents").select("id,document_type,code,version,status,title,body").in("document_type",["hosting_terms","property_rules","privacy_policy"]).in("status",development?["active","draft"]:["active"]);
  if(termsError)return json({ok:false,error:"booking_terms_unavailable"},503);
  const requiredTerms=bookingDocuments(termsRows||[],development);
  try{assertBookingConsent(body,needsGuarantee,requiredTerms,requiredPolicyId)}catch(e){return json({ok:false,error:(e as Error).message},400)}

  const {data:paymentQuote,error:paymentQuoteError}=await admin.from("quotes").select("property_id,check_in,check_out,guests,pricing_snapshot").eq("id",quote_id).single();
  const {data:existingHold,error:existingHoldError}=await admin.from("reservations").select("id").eq("quote_id",quote_id).in("status",["hold","pending_payment","confirmed"]).limit(1);
  if(paymentQuoteError||existingHoldError||!paymentQuote)return json({ok:false,error:"availability_unavailable"},503);
  if(paymentQuote.pricing_snapshot?.same_day_user_id&&paymentQuote.pricing_snapshot.same_day_user_id!==user.id)return json({ok:false,error:"same_day_approval_required"},403);
  if(!existingHold?.length){
    const requestId=paymentQuote.pricing_snapshot?.same_day_request_id;
    if(requestId)await approvedSameDayRequest(admin,requestId,user.id,paymentQuote);
    const refreshed=await searchData(paymentQuote.check_in,paymentQuote.check_out,paymentQuote.guests,null,development,!!requestId);
    const selected=refreshed.find((p:any)=>p.id===paymentQuote.property_id);
    if(!selected?.available)return json({ok:false,error:selected?.unavailable_reason||"dates_unavailable",min_stay:selected?.min_stay},409);
  }

  // PIX still needs a card for the guarantee. Tokenize before creating any hold;
  // if PagBank cannot vault it, no reservation or PIX payment is started.
  let guaranteeToken:string|undefined;
  if(needsGuarantee&&method==="pix"){
    try{guaranteeToken=await tokenizePagBankCard(sandboxToken,body.encrypted_card)}
    catch{return json({ok:false,error:"guarantee_card_unavailable"},503)}
  }

  const {data:rpc,error:rpcErr}=await admin.rpc("start_payment_hold",{
    p_quote_id:quote_id,p_quote_option_id:quote_option_id,p_user_id:user.id,
    p_guest_name:guest_name,p_guest_email:guest_email,p_guest_phone:guest_phone,p_guests:Number(guests||2)
  });
  if(rpcErr){
    const msg=String(rpcErr.message||"");
    if(msg.includes("quote_expired")) return json({ok:false,error:"quote_expired"},409);
    if(msg.includes("dates_unavailable")) return json({ok:false,error:"dates_unavailable"},409);
    for(const code of ["experience_unavailable","experience_capacity","offer_unavailable"])if(msg.includes(code))return json({ok:false,error:code},409);
    return json({ok:false,error:"hold_failed"},500);
  }
  const hold=Array.isArray(rpc)?rpc[0]:rpc;
  const reservationId=hold.reservation_id;
  if(paymentQuote.pricing_snapshot?.same_day_request_id)await admin.from("same_day_requests").update({status:"booked"}).eq("id",paymentQuote.pricing_snapshot.same_day_request_id).eq("user_id",user.id).eq("status","approved");
  // Analytics is optional and must never change the result of a payment.
  await recordAccessBooking(admin,reservationId,body.access_session_id);

  if(guaranteeToken){
    const {error}=await admin.from("guarantee_card_tokens").insert({reservation_id:reservationId,
      user_id:user.id,card_token:guaranteeToken,consented_at:new Date().toISOString(),consent_version:body.guarantee_consent_version==="guarantee-v2"?"guarantee-v2":"guarantee-v1",renewal_consent:body.guarantee_consent_version==="guarantee-v2"&&body.guarantee_renewal_consent===true});
    if(error)return json({ok:false,error:"guarantee_token_save_failed"},503);
  }

  await admin.from("reservations").update({travel_purpose_code:travel_purpose_code||null}).eq("id",reservationId);

  const {data:opt}=await admin.from("quote_options")
    .select("*,rate_plans(code,cancellation_policy_id),quotes(property_id)")
    .eq("id",quote_option_id).single();

  const {data:acceptedPolicy,error:policyError}=await admin.from("policy_documents")
    .select("id,code,version").eq("id",requiredPolicyId).single();
  if(policyError||!acceptedPolicy) return json({ok:false,error:"policy_unavailable"},409);
  const {error:acceptanceError}=await admin.from("reservation_policy_acceptances").insert([acceptedPolicy,...requiredTerms].map(doc=>({
    reservation_id:reservationId,user_id:user.id,document_id:doc.id,
    document_code:doc.code,document_version:doc.version
  })));
  if(acceptanceError) return json({ok:false,error:acceptanceError.message?.includes("policy_version_changed")?"policy_version_changed":"policy_acceptance_failed"},409);

  const {data:qitems}=await admin.from("quote_experience_items").select("*").eq("quote_id",quote_id);
  let paidExperienceItems:any[]=[];
  if(qitems?.length){
    const {data:order,error:orderError}=await admin.from("experience_orders").insert({reservation_id:reservationId,user_id:user.id,status:"pending"}).select().single();
    if(orderError||!order?.id)return json({ok:false,error:"experience_order_create_failed"},503);
    if(order?.id){
      const {data:items,error:itemsError}=await admin.from("experience_order_items").insert(qitems.map((x:any)=>({
        order_id:order.id,product_id:x.product_id,variant_id:x.variant_id,
        product_name_snapshot:x.product_name_snapshot,variant_name_snapshot:x.variant_name_snapshot,
        unit_price_cents:opt.contract_snapshot?.lines?.find((l:any)=>l.key===x.product_id)?.net_cents??x.unit_price_cents,quantity:x.quantity,status:"active",composition_snapshot:x.composition_snapshot
      }))).select("id,unit_price_cents,quantity,product_name_snapshot");
      if(itemsError||items?.length!==qitems.length)return json({ok:false,error:"experience_order_create_failed"},503);
      paidExperienceItems=items;
    }
  }

  const paymentIdempotency=(sandbox?"pagbank-sandbox-":"mock-")+reservationId;
  const {data:payment,error:payErr}=await admin.from("payments").insert({
    reservation_id:reservationId,user_id:user.id,provider:sandbox?"pagbank_sandbox":"mock",
    method:method==="pix"?"pix":method==="card"?"card":"mock",
    installments:method==="card"?Number(installments):null,
    amount_cents:chargedAmount,
    status:"awaiting_payment",idempotency_key:paymentIdempotency,
    metadata:{development:true,environment:sandbox?"sandbox":"mock",
      base_amount_cents:baseAmount,buyer_interest_cents:buyerInterest}
  }).select().single();
  if(payErr) return json({ok:false,error:"payment_create_failed"},500);

  const ledger:any[]=[
    {reservation_id:reservationId,payment_id:payment.id,entry_type:"accommodation",amount_cents:Number(opt.accommodation_amount_cents),description:"Hospedagem"},
    {reservation_id:reservationId,payment_id:payment.id,entry_type:"cleaning",amount_cents:Number(opt.cleaning_fee_cents),description:"Taxa de limpeza"}
  ];
  try{
    ledger.push(...experiencePaymentEntries(reservationId,payment.id,paidExperienceItems,
      Number(opt.total_amount_cents)-Number(opt.accommodation_amount_cents)-Number(opt.cleaning_fee_cents)));
  }catch{return json({ok:false,error:"experience_allocation_invalid",payment_id:payment.id},503)}
  const allocated=spreadBuyerFee(ledger.map(x=>x.amount_cents),buyerInterest);
  ledger.forEach((line,index)=>line.amount_cents=allocated[index]);
  const {error:ledgerError}=await admin.from("financial_entries").insert(ledger);
  if(ledgerError) return json({ok:false,error:"ledger_create_failed",payment_id:payment.id},503);

  if(sandbox){
    const digits=String(guest_phone).replace(/\D/g,"");
    const phone=digits.startsWith("55")&&digits.length>=12?digits.slice(2):digits;
    const expiry=new Date(Math.min(Date.parse(hold.hold_expires_at),Date.now()+Number(settings.pix_expiration_minutes)*60000));
    const gateway=paymentGateway('pagbank_sandbox',sandboxToken);
    let order;
    try{
      order={referenceId:payment.id.replace(/-/g,""),amountCents:chargedAmount,
        customer:{name:guest_name,email:guest_email,taxId:sandboxIdentity.document_number,
          phone:{area:phone.slice(0,2),number:phone.slice(2)}},method,
        expiresAt:expiry,encryptedCard:method==="card"?body?.encrypted_card:undefined,
        storeCard:needsGuarantee&&method==="card",installments:Number(installments),
        buyerInterest:buyerInterest?{total:buyerInterest,installments:Number(selectedPlan.buyer_interest_installments)}:undefined,
        notificationUrl:projectUrl+"/functions/v1/pagbank-webhook"};
      gateway.validatePayment(order);
    }catch{return json({ok:false,error:"pagbank_customer_invalid",payment_id:payment.id},400)}
    try{
      const result=await (method==='pix'?gateway.createPix(order):gateway.createCardPayment(order));
      // Persist the provider IDs first. If vaulting fails after a successful
      // charge, status reconciliation can still find the payment safely.
      const {error:saveError}=await admin.from("payments").update({provider_payment_id:result.chargeId,
        metadata:{development:true,environment:"sandbox",order_id:result.orderId,
          base_amount_cents:baseAmount,buyer_interest_cents:buyerInterest}}).eq("id",payment.id);
      if(saveError) throw new Error("pagbank_payment_save_failed");
      if(needsGuarantee&&method==="card"){
        if(!result.cardToken||!/^CARD_[A-Za-z0-9-]+$/.test(result.cardToken))
          throw new Error("guarantee_token_missing");
        const {error}=await admin.from("guarantee_card_tokens").insert({reservation_id:reservationId,
          user_id:user.id,card_token:result.cardToken,consented_at:new Date().toISOString(),consent_version:body.guarantee_consent_version==="guarantee-v2"?"guarantee-v2":"guarantee-v1",renewal_consent:body.guarantee_consent_version==="guarantee-v2"&&body.guarantee_renewal_consent===true});
        if(error)throw new Error("guarantee_token_save_failed");
      }
      if(result.status!=="WAITING") {
        try { await reconcileSandboxCharge(payment.id,result.chargeId,sandboxToken,result.orderId); }
        catch { console.error(JSON.stringify({event:"pagbank_sandbox_reconcile_deferred",payment_id:payment.id})); }
      }
      return json({ok:true,reservation_id:reservationId,confirmation_code:hold.confirmation_code,
        hold_expires_at:hold.hold_expires_at,payment:{...payment,provider:"pagbank_sandbox",
          provider_payment_id:result.chargeId,status:"processing",
          pix_code:result.pixCode,qr_image_url:result.qrImageUrl}});
    }catch(error){
      if(error instanceof Error&&error.message==="pagbank_order_rejected"){
        const {error:cancelError}=await admin.rpc("cancel_pending_payment_mock_atomic",{
          p_payment_id:payment.id,p_user_id:user.id});
        if(!cancelError)return json({ok:false,error:"pagbank_card_rejected"},409);
      }
      console.error(JSON.stringify({event:"pagbank_sandbox_start_failed",payment_id:payment.id}));
      return json({ok:false,error:"pagbank_start_uncertain",payment_id:payment.id},503);
    }
  }

  return json({ok:true,reservation_id:reservationId,confirmation_code:hold.confirmation_code,hold_expires_at:hold.hold_expires_at,payment});
}

async function reconcileSandboxCharge(paymentId:string,chargeId:string,token:string,orderId?:string,postBooking=false){
  const charge=await paymentGateway('pagbank_sandbox',token).getPayment(chargeId,orderId);
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
  if(reservationError||!reservation||(reservation.user_id!==user.id&&!await userIsAdmin(user))) return json({ok:false,error:"not_found"},404);
  const {data:rows,error}=await admin.from("reservation_policy_acceptances")
    .select("document_code,document_version,accepted_at,snapshot_recorded_at,document_snapshot,policy_documents(title,body,code,version)")
    .eq("reservation_id",reservationId).order("accepted_at");
  if(error) return json({ok:false,error:"policy_unavailable"},500);
  return json({ok:true,confirmation_code:reservation.confirmation_code,documents:(rows||[]).map((a:any)=>({
    code:a.document_code,version:a.document_version,accepted_at:a.accepted_at,
    snapshot_recorded_at:a.snapshot_recorded_at,title:a.document_snapshot?.title||a.policy_documents?.title||"Documento",body:a.document_snapshot?.body||a.policy_documents?.body||""
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
  const {data}=await admin.from("profiles").select("role,pms_access_status").eq("id",user.id).maybeSingle();
  return data?.role==="admin" && data.pms_access_status==="active";
}

async function modificationQuote(r:any,propertyId:number,checkIn:string,checkOut:string,development:boolean){
  const {data:orders,error:oe}=await admin.from("experience_orders").select("experience_order_items(product_id,status)").eq("reservation_id",r.id).eq("status","active");
  if(oe)throw Error("experience_lookup_failed");
  for(const item of (orders||[]).flatMap((o:any)=>o.experience_order_items||[]).filter((i:any)=>i.status==="active")){
    const issue=await admin.rpc("experience_sale_issue",{p_product:item.product_id,p_property:propertyId,p_start:checkIn,p_end:checkOut,p_exclude:r.id,p_require_active:false});
    if(issue.error)throw Error("experience_lookup_failed");if(issue.data)throw Error(issue.data);
  }
  const quote=await createQuote({property_id:propertyId,check_in:checkIn,check_out:checkOut,guests:r.guests,experience_variant_ids:[]},development,r.id);
  const mark=await admin.from("quotes").update({pricing_snapshot:{modification_only:true,reservation_id:r.id,source:"pricelabs"}}).eq("id",quote.quote_id);if(mark.error)throw Error("modification_quote_failed");
  const original=r.contract_snapshot;
  if(original?.offer_id){
    const count=nights(checkIn,checkOut),rules=original.offer_rules||{};
    if(count<Number(rules.min_nights||1)||rules.max_nights&&count>rules.max_nights)throw Error("offer_duration");
    if(rules.property_ids&&!rules.property_ids.includes(propertyId))throw Error("offer_property_incompatible");
    const bps=original.discount_enabled?Number(original.discount_bps||0):0;
    for(const option of quote.rate_options){
      const price=priceStayOffer([{key:"accommodation",gross_cents:option.accommodation_amount_cents,included:true},{key:"cleaning",gross_cents:option.cleaning_fee_cents,included:true}],{discount_enabled:true,discount_bps:bps});
      option.accommodation_amount_cents=price.lines[0].net_cents;option.cleaning_fee_cents=price.lines[1].net_cents;
      option.stay_amount_cents=price.total_cents;option.total_amount_cents=price.total_cents;
      option.contract_snapshot={...original,...price,check_in:checkIn,check_out:checkOut,property_id:propertyId,amendment:true,original_contract_total_cents:original.total_cents,experiences:original.experiences};
      if(option.quote_option_id){const result=await admin.from("quote_options").update({accommodation_amount_cents:option.accommodation_amount_cents,cleaning_fee_cents:option.cleaning_fee_cents,total_amount_cents:option.total_amount_cents,contract_snapshot:option.contract_snapshot}).eq("id",option.quote_option_id);if(result.error)throw Error("modification_quote_failed")}
    }
  }
  return quote;
}

async function requestModification(req:Request,body:any,development:boolean){
  const user=await currentUser(req);
  if(!user) return json({ok:false,error:"authentication_required"},401);
  const {reservation_id,requested_check_in,requested_check_out,requested_property_id}=body||{};
  const {data:r}=await admin.from("reservations").select("id,user_id,property_id,guests,stay_amount,total_amount,contract_snapshot,rate_plan_code,check_in,check_out,status").eq("id",reservation_id).single();
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
    quote=await modificationQuote(r,targetProperty,requested_check_in,requested_check_out,development);
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
      currentQuote=await modificationQuote(m.reservations,targetProperty,targetIn,targetOut,development);
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
    admin.from("guarantees").select("*,reservations(confirmation_code,properties(name)),incidents!incidents_guarantee_id_fkey(*),guarantee_refunds(id,state,requested_cents,confirmed_cents,provider_error_code)").order("created_at",{ascending:false}).limit(50),
    admin.from("payments").select("id,reservation_id,provider,method,installments,amount_cents,status,created_at,reservations(confirmation_code,properties(name))").order("created_at",{ascending:false}).limit(50),
    admin.from("post_booking_charges").select("id,reservation_id,kind,description,amount_cents,status,expires_at,created_at,reservations(confirmation_code,properties(name))").order("created_at",{ascending:false}).limit(50),
    admin.from("payment_settings").select("*").eq("id",1).single(),
    admin.from("properties").select("id,code,name,active,cleaning_fee,guarantee_amount_cents,max_guests").order("id"),
    admin.from("property_integrations").select("property_id,provider,environment_key,external_listing_id,active").order("provider"),
    admin.from("notification_outbox").select("id,template_code,status,send_after,attempt_count,max_attempts,last_error,created_at,reservations(confirmation_code)").order("created_at",{ascending:false}).limit(50)
  ]);
  const bookingConfigured=(await calendars.channels("booking")).listings.map((x:any)=>({name:x.name,configured:x.ok}));
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
    airbnbCalendarData().catch(()=>({ok:false,listings:[]})),
    bookingCalendarData().catch(()=>({configured:true,ok:false,listings:[]}))
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
    admin.from("guarantees").select("id,reservation_id,provider,provider_authorization_id,provider_capture_before,attention_code,provider_error_code,amount_cents,captured_amount_cents,refunded_amount_cents,released_amount_cents,release_confirmed,status,created_at,updated_at,incidents!incidents_guarantee_id_fkey(id,description,requested_capture_cents,evidence,status,category,decision,actor_user_id,decided_at,created_at,resolved_at),guarantee_refunds(id,state,requested_cents,confirmed_cents,provider_error_code)").in("reservation_id",reservationIds).order("created_at",{ascending:false}),
    admin.from("reservation_notes").select("id,reservation_id,author_user_id,note,created_at").in("reservation_id",reservationIds).order("created_at",{ascending:false}),
    admin.from("financial_entries").select("id,reservation_id,payment_id,experience_order_item_id,entry_type,amount_cents,currency,description,created_at").in("reservation_id",reservationIds).order("created_at",{ascending:false})
  ]) : [{data:empty},{data:empty},{data:empty},{data:empty},{data:empty},{data:empty},{data:empty}];

  if([paymentsQ,ordersQ,chargesQ,modsQ,guaranteesQ,notesQ,ledgerQ].some(q=>q.error))
    return json({ok:false,error:"reservation_financial_data_unavailable"},503);
  const properties=propertiesQ.data||[];
  const propertyByName=new Map<string,any>(properties.map((p:any)=>[String(p.name),p]));
  const channelPeriods:any[]=[];
  for(const listing of airbnb?.listings||[]){
    const p=propertyByName.get(String(listing.name));
    if(!p) continue;
    for(const period of listing.periods||[]) if(period.start<end&&period.end>start)
      channelPeriods.push({id:calendarPeriodKey("airbnb",p.id,period),property_id:p.id,source:"airbnb",calendar_label:period.calendar_label,start:period.start,end:period.end,status:listing.ok?"blocked":"integration_error"});
  }
  for(const listing of booking?.listings||[]){
    const p=propertyByName.get(String(listing.name));
    if(!p) continue;
    for(const period of listing.periods||[]) if(period.start<end&&period.end>start)
      channelPeriods.push({id:calendarPeriodKey("booking",p.id,period),property_id:p.id,source:period.source||"booking",calendar_label:period.calendar_label,start:period.start,end:period.end,status:listing.ok?"blocked":"integration_error"});
  }

  return json({
    ok:true,server_now:new Date().toISOString(),range:{start,end},properties,reservations,
    payments:paymentsQ.data||[],experience_orders:ordersQ.data||[],charges:chargesQ.data||[],
    modifications:modsQ.data||[],guarantees:(guaranteesQ.data||[]).map((g:any)=>({...g,financial:guaranteeState(g)})),notes:notesQ.data||[],ledger:ledgerQ.data||[],
    notifications:notificationsQ.data||[],integrations:integrationsQ.data||[],settings:settingsQ.data||{},
    cancellation_policies:cancellationPolicies,
    calendar_blocks:blocksQ.data||[],
    channel_periods:channelPeriods,
    channel_health:{airbnb:Boolean(airbnb?.ok),booking_configured:Boolean(booking?.configured),booking:Boolean(booking?.ok)}
  });
}

async function legalDocuments(req:Request,body:any,development:boolean){
 const user=await currentUser(req);
 if(body?.operation==="publish"){
  if(!development)return json({ok:false,error:"development_only"},403);
  if(!user||!await userIsAdmin(user))return json({ok:false,error:"admin_required"},403);
  const {data,error}=await admin.rpc("publish_booking_document",{p_type:body.document_type,p_title:body.title,p_body:String(body.body||"").replace(/^Chalezinho Ville • Versão .*$/gm,"").trim(),p_actor:user.id,p_previous_id:body.previous_id||null});
  if(error)return json({ok:false,error:error.message?.includes("policy_version_changed")?"policy_version_changed":"document_save_failed"},409);
  return json({ok:true,document_id:data});
 }
 const isAdmin=!!user&&await userIsAdmin(user);
 const {data,error}=await admin.from("policy_documents").select("id,document_type,code,version,title,body,status,effective_at,created_at,published_by").in("document_type",["hosting_terms","property_rules","privacy_policy"]).in("status",development?["active","draft","archived"]:["active"]).order("created_at",{ascending:false});
 if(error)return json({ok:false,error:"booking_terms_unavailable"},503);
 return json({ok:true,documents:bookingDocuments(data||[],development),...(isAdmin?{history:data||[]}:{} )});
}

async function adminCancellationPolicyAction(req:Request,body:any,development:boolean){
  if(!development) return json({ok:false,error:"development_only"},403);
  const user=await currentUser(req);
  if(!user || !(await userIsAdmin(user))) return json({ok:false,error:"admin_required"},403);
  const code=String(body?.rate_plan_code||"");
  const withdrawal=Number(body?.withdrawal_days);
  const commercial=Number(body?.commercial_free_cancellation_hours);
  const full=Number(body?.full_refund_days_before_checkin);
  const late=Number(body?.late_accommodation_refund_percent);
  if(!["refundable","non_refundable"].includes(code)||![commercial,withdrawal,full,late].every(Number.isInteger)
     ||commercial<0||commercial>720||withdrawal<7||withdrawal>30||full<1||full>365||late<0||late>100||(code==="non_refundable"&&late!==0))
    return json({ok:false,error:"invalid_policy_configuration"},400);
  const {data,error}=await admin.rpc("save_finance_cancellation_policy",{
    p_rate_plan_code:code,p_withdrawal_days:withdrawal,p_commercial_free_hours:commercial,
    p_full_refund_days_before_checkin:full,p_late_accommodation_refund_percent:late
  });
  if(error) return json({ok:false,error:"policy_save_failed"},500);
  return json({ok:true,document_id:data});
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
      airbnbCalendarData().catch(()=>({ok:false,listings:[]})),
      bookingCalendarData().catch(()=>({configured:true,ok:false,listings:[]}))
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
    const {data,error:updateError}=await admin.rpc("check_in_with_guarantee",{p_reservation:reservation.id,
      p_actor:user.id,p_exception_reason:body.guarantee_exception_reason||null});
    if(updateError)return json({ok:false,error:String(updateError.message).includes("guarantee_check_in_exception_required")?
      "guarantee_check_in_exception_required":"check_in_failed"},409);
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

async function adminAvailabilityAction(req:Request,body:any){
 const user=await currentUser(req);if(!user||!await userIsAdmin(user))return json({ok:false,error:"admin_required"},403);
 const {data:p,error}=await admin.from("properties").select("id,features,updated_at").eq("id",Number(body.property_id)).single();
 if(error||!p)return json({ok:false,error:"property_not_found"},404);
 if(body.operation==="get")return json({ok:true,rules:availabilityRules(p.features?.availability||{}),updated_at:p.updated_at});
 if(body.operation!=="save")return json({ok:false,error:"invalid_operation"},400);
 let rules;try{rules=availabilityRules(body.rules)}catch(e){return json({ok:false,error:(e as Error).message},400)}
 if(body.updated_at!==p.updated_at)return json({ok:false,error:"availability_conflict"},409);
 const saved=await admin.from("properties").update({features:{...p.features,availability:rules},updated_at:new Date().toISOString()}).eq("id",p.id).eq("updated_at",p.updated_at).select("id").maybeSingle();
 if(saved.error||!saved.data)return json({ok:false,error:"availability_conflict"},409);
 await admin.from("audit_events").insert({actor_user_id:user.id,action:"availability_updated",entity_type:"property",entity_id:String(p.id),new_value:rules});
 return json({ok:true,rules});
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
  let terms;
  try { terms=paymentTerms({payment_terms:{max_installments:Number(body?.max_installments??12),
    no_interest_installments:Number(body?.no_interest_installments??6),interest_payer:body?.interest_payer}}); }
  catch { return json({ok:false,error:"invalid_payment_terms"},400); }
  const {data:previous}=id?await admin.from("properties").select("features").eq("id",id).single():{data:null};
  const payload={
    name,code,slug,property_type:propertyType,cover_image:coverImage||null,gallery,
    tagline:String(body?.tagline||"").trim().slice(0,240)||null,
    summary:String(body?.summary||"").trim().slice(0,3000)||null,
    max_guests:Math.max(1,Math.min(50,Math.round(Number(body?.max_guests||2)))),
    cleaning_fee:Math.max(0,Math.min(100000,Number(body?.cleaning_fee||0))),
    guarantee_amount_cents:Math.max(0,Math.min(100000000,Math.round(Number(body?.guarantee_amount_cents||0)))),
    check_in_time:checkIn,check_out_time:checkOut,timezone:"America/Sao_Paulo",active:body?.active!==false,
    features:{...(previous?.features||{}),payment_terms:terms},updated_at:new Date().toISOString()
  };
  const result=id
    ? await admin.from("properties").update(payload).eq("id",id).select().single()
    : await admin.from("properties").insert(payload).select().single();
  if(result.error||!result.data) return json({ok:false,error:"property_save_failed"},409);
  await admin.from("audit_events").insert({actor_user_id:user.id,action:id?"property_updated":"property_created",entity_type:"property",entity_id:String(result.data.id),new_value:{name,code,active:payload.active}});
  return json({ok:true,property:result.data});
}

async function opsSettingsAction(req:Request,body:any){
  const user=await currentUser(req);
  if(!user || !(await userIsAdmin(user))) return json({ok:false,error:"admin_required"},403);
  const operation=String(body?.operation||"");
  if(operation==="payment_settings"){
    let payload;try{payload={...validatePaymentSettings(body),updated_at:new Date().toISOString()}}
    catch{return json({ok:false,error:"invalid_payment_settings"},400)}
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

async function guaranteeAction(_req:Request,_body:any){
  return json({ok:false,error:"legacy_guarantee_endpoint_removed"},410);
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
    let components;try{components=experienceComponents({components:body.components||[]})}catch{return json({ok:false,error:"invalid_components"},400)}
    const propertyIds=Array.isArray(body.property_ids)?[...new Set(body.property_ids.map(Number))]:null;
    if(propertyIds&&(!propertyIds.length||propertyIds.some((x:any)=>!Number.isSafeInteger(x)||x<1)))return json({ok:false,error:"experience_property_required"},400);
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
    if(mediaItems.length<1) return json({ok:false,error:"experience_photo_required",photo_count:mediaItems.length},400);

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
      status:body.status==="active"?"active":body.status==="inactive"?"inactive":existing?.status||"draft",
      sales_headline:existing?.sales_headline||null,
      details:{...(existing?.details||{}),...(body.components?{components}:{}),standalone_enabled:body.standalone_enabled??existing?.details?.standalone_enabled??true,offer_enabled:body.offer_enabled??existing?.details?.offer_enabled??true},
      minimum_lead_hours:Number(body.minimum_lead_hours??existing?.minimum_lead_hours??0),daily_capacity:body.daily_capacity===null?null:Number(body.daily_capacity??existing?.daily_capacity??0)||null,inventory:body.inventory===null?null:body.inventory!==undefined?Number(body.inventory):existing?.inventory??null,
      travel_purposes:Array.isArray(existing?.travel_purposes)?existing.travel_purposes:[],
      display_order:Number(existing?.display_order||0)
    };
    if(!components.length&&body.components)return json({ok:false,error:"package_components_required"},400);
    if([productPayload.minimum_lead_hours,productPayload.daily_capacity,productPayload.inventory].some(x=>x!==null&&(!Number.isInteger(x)||x<0||x>100000)))return json({ok:false,error:"invalid_experience_limits"},400);
    const prefix=projectUrl+"/storage/v1/object/public/experience-media/";
    if(mediaItems.some((m:any)=>!(m.media_url.startsWith(prefix)||/^assets\/[a-zA-Z0-9._-]+\.(webp|jpg|jpeg|png|avif)$/.test(m.media_url))))return json({ok:false,error:"invalid_offer_photo"},400);
    const {data:props}=await admin.from("properties").select("id").eq("active",true);
    const eligibleIds=propertyIds||(existing?(await admin.from("experience_property_eligibility").select("property_id").eq("product_id",id)).data?.map((x:any)=>x.property_id):props?.map((x:any)=>x.id))||[];
    const {data:product,error}=await admin.rpc("save_experience_package_atomic",{p_id:id,p_actor:user.id,p_product:productPayload,p_properties:eligibleIds,p_media:mediaItems});
    if(error||!product)return json({ok:false,error:"experience_save_failed"},409);
    return json({ok:true,product});
  }

  if(operation==="toggle_product_status"){
    if(!body?.id) return json({ok:false,error:"experience_not_found"},404);
    const {data:product}=await admin.from("experience_products").select("id,status").eq("id",body.id).single();
    if(!product) return json({ok:false,error:"experience_not_found"},404);
    const next=product.status==="active"?"inactive":"active";
    if(next==="active"){
      const {count}=await admin.from("experience_media").select("id",{count:"exact",head:true}).eq("product_id",product.id);
      if(Number(count||0)<1) return json({ok:false,error:"experience_photo_required",photo_count:Number(count||0)},400);
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
    .select("id,user_id,property_id,check_in,check_out,status")
    .eq("id",reservationId).single();
  if(re||!r||r.user_id!==user.id) return json({ok:false,error:"not_found"},404);
  if(r.status!=="confirmed") return json({ok:false,error:"reservation_not_available"},409);

  const {data:products,error:pe}=await admin.from("experience_products")
    .select("id,name,description,sales_headline,package_type,price_cents,upsell_enabled,minimum_lead_hours,daily_capacity,inventory,status,details,created_at,experience_variants(id,code,name,price_cents,active,display_order),experience_property_eligibility!inner(property_id),experience_media(id,media_url,alt_text,display_order)")
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
    if(!variant||p.details?.standalone_enabled===false) continue;
    const leadOk=(arrival-now)>=Number(p.minimum_lead_hours||0)*3600000;
    const stockOk=p.inventory==null||Number(p.inventory)>0;
    if(!stockOk) continue;
    const viability=await admin.rpc("experience_sale_issue",{p_product:p.id,p_property:r.property_id,p_start:r.check_in,p_end:r.check_out,p_exclude:r.id});if(viability.error||viability.data)continue;

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
      sales_headline:p.sales_headline,package_type:p.package_type,components:experienceComponents(p.details),
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
    p_variant_id:variantId,p_preferences:body.experience_preferences||{}
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
      "experience_payment_already_pending","experience_component_conflict","experience_choice_required","invalid_experience_choice"
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
      "experience_out_of_stock","experience_already_added","experience_upgrade_not_available","experience_choice_required","invalid_experience_choice","experience_component_conflict",
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
    .select("active_provider,pix_enabled,card_enabled,max_card_installments,pix_expiration_minutes").eq("id",1).single();
  try{assertPaymentMethod(settings,method)}catch(e){return json({ok:false,error:(e as Error).message},409)}
  if(method==="card"&&(!Number.isInteger(installments)||installments>12))
    return json({ok:false,error:"invalid_installments"},400);
  const token=Deno.env.get("PAGBANK_SANDBOX_TOKEN")||"";
  if(sandbox&&!token) return json({ok:false,error:"pagbank_sandbox_not_configured"},503);
  if(sandbox&&method==="card"&&typeof body?.encrypted_card!=="string")
    return json({ok:false,error:"encrypted_card_required"},400);

  const {data:chargeTerms}=await admin.from("post_booking_charges")
    .select("amount_cents,reservations(property_id)").eq("id",chargeId).eq("user_id",user.id).maybeSingle();
  if(!chargeTerms) return json({ok:false,error:"charge_not_found"},404);
  const baseAmount=Number(chargeTerms.amount_cents);
  let plan:any=null;
  if(method==="card"){
    try{plan=await loadInstallmentOffer(admin,String(body.installment_offer_id||""),{
        userId:user.id,chargeId,baseAmount,installments,cardBin:String(body.credit_card_bin||"")})}
    catch{return json({ok:false,error:"installment_plans_unavailable"},409)}
  }
  const buyerInterest=Number(plan?.buyer_interest_cents||0);
  const chargeTotal=baseAmount+buyerInterest;
  if(method==="card"&&Number(body?.quoted_total_cents)!==chargeTotal)
    return json({ok:false,error:"installment_quote_changed"},409);

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
    const {data:payment}=await admin.from("payments").select("provider,provider_payment_id,metadata,status,amount_cents,method,installments")
      .eq("id",paymentId).single();
    if(payment?.provider!=="pagbank_sandbox") return json({ok:false,error:"payment_provider_mismatch"},409);
    if(payment.method!==method||Number(payment.installments||1)!==installments||
       ![baseAmount,chargeTotal].includes(Number(payment.amount_cents)))
      return json({ok:false,error:"payment_terms_mismatch"},409);
    if(payment.provider_payment_id){
      if(Number(payment.amount_cents)!==chargeTotal) return json({ok:false,error:"payment_terms_mismatch"},409);
      try{await reconcileSandboxCharge(paymentId,payment.provider_payment_id,token,payment.metadata?.order_id,true)}catch(e){
        console.error(JSON.stringify({event:"post_booking_status_deferred",payment_id:paymentId,error:String(e)}));
      }
      return json({ok:true,payment:{id:paymentId,status:payment.status,amount_cents:chargeTotal,
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
      const {data:amountSaved,error:amountError}=await admin.from("payments").update({amount_cents:chargeTotal,
        metadata:{...(payment.metadata||{}),environment:"sandbox",base_amount_cents:baseAmount,
          buyer_interest_cents:buyerInterest}}).eq("id",paymentId)
        .eq("status","awaiting_payment").is("provider_payment_id",null).select("id").maybeSingle();
      if(amountError||!amountSaved) throw new Error("payment_state_changed");
      const expiry=new Date(Math.min(Date.parse(charge.expires_at),Date.now()+Number(settings.pix_expiration_minutes)*60000));
      const orderInput={referenceId:String(paymentId).replace(/-/g,""),amountCents:chargeTotal,
        customer:{name:guest.guest_name,email:guest.guest_email,taxId:id.document_number,
          phone:{area:phone.slice(0,2),number:phone.slice(2)}},method:method as "pix"|"card",
        expiresAt:expiry,encryptedCard:body?.encrypted_card,installments,
        buyerInterest:buyerInterest?{total:buyerInterest,installments:Number(plan.buyer_interest_installments)}:undefined,
        notificationUrl:projectUrl+"/functions/v1/pagbank-webhook"};
      const gateway=paymentGateway("pagbank_sandbox",token);
      const result=await (method==="pix"?gateway.createPix(orderInput):gateway.createCardPayment(orderInput));
      const {error:saveError}=await admin.from("payments").update({provider_payment_id:result.chargeId,
        metadata:{...(payment.metadata||{}),environment:"sandbox",order_id:result.orderId,
          base_amount_cents:baseAmount,buyer_interest_cents:buyerInterest}}).eq("id",paymentId);
      if(saveError) throw saveError;
      if(result.status!=="WAITING") await reconcileSandboxCharge(paymentId,result.chargeId,token,result.orderId,true);
      return json({ok:true,payment:{id:paymentId,status:result.status==="PAID"?"paid":"awaiting_payment",
        amount_cents:chargeTotal,method,installments:method==="card"?installments:null,
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
  try{assertFinanceDevelopment(projectUrl,Deno.env.get("FINANCE_ENVIRONMENT"))}
  catch{return json({ok:false,error:"isolated_finance_environment_required"},503)}
  try{
    const url=new URL(req.url);
    let body:any={};
    if(req.method==="POST") body=await req.json().catch(()=>({}));
    const action=url.searchParams.get("action")||body.action||"config";
    if(action==="calendar_export"){
      if(req.method!=="GET")return json({ok:false,error:"method_not_allowed"},405);
      return await calendars.exportFeed(url.searchParams.get("token")||"");
    }
    if(action==="admin_calendar")return await adminCalendarAction(req,body);
    const origin=req.headers.get("origin")||"";
    const development=req.headers.get("x-chalezinho-env")==="development" &&
      (origin==="https://chalezinho-ville-git-feature-romantic-fdde70-roldneicosta-4140.vercel.app" ||
       origin==="https://chalezinho-ville-git-desenvolvimento-roldneicosta-4140.vercel.app" ||
       origin==="https://chalezinho-ville-git-fix-reservation-f-9818b3-roldneicosta-4140.vercel.app" ||
       origin==="https://chalezinho-ville-git-feature-guest-directory-roldneicosta-4140.vercel.app" ||
       origin==="https://chalezinho-ville-git-integracao-pagbank-roldneicosta-4140.vercel.app" ||
       origin==="https://chalezinho-ville-8q4qwux69-roldneicosta-4140.vercel.app" ||
       origin==="https://chalezinho-ville-g7cqw9cxg-roldneicosta-4140.vercel.app" ||
       origin==="https://chalezinho-ville-my0vnqxks-roldneicosta-4140.vercel.app" ||
       origin==="https://chalezinho-ville-b1ai8z78g-roldneicosta-4140.vercel.app" ||
       origin==="https://chalezinho-ville-9nrmtmt7w-roldneicosta-4140.vercel.app" ||
       /^https:\/\/chalezinho-ville-[a-z0-9]{9}-roldneicosta-4140\.vercel\.app$/.test(origin) ||
       /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));

    if(action==="identity_status"||action==="complete_identity"){
      const user=await currentUser(req);
      if(!user) return json({ok:false,error:"authentication_required"},401);
      if(!development) return json({ok:false,error:"not_available"},403);
      if(action==="identity_status"){
        const {data,error}=await admin.rpc("guest_identity_present",{p_user_id:user.id});
        if(error) return json({ok:false,error:"identity_check_unavailable"},500);
const {data:paymentIdentity,error:paymentIdentityError}=await admin.rpc("guest_payment_identity",{p_user_id:user.id});
        if(paymentIdentityError) return json({ok:false,error:"identity_check_unavailable"},500);
        const identity=Array.isArray(paymentIdentity)?paymentIdentity[0]:paymentIdentity;
        return json({ok:true,complete:Boolean(data),payment_eligible:identity?.document_type==="cpf"});
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

      const settingsQ=await retryDb("payment_settings",()=>admin.from("payment_settings").select("active_provider,pix_enabled,card_enabled,charge_percent,pix_expiration_minutes,max_card_installments,modification_payment_deadline_hours,post_booking_payment_minutes").eq("id",1).single());
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
        required_booking_documents:bookingDocuments(docsQ.data||[],development),
        experience_products:productsQ.data||[],stay_offers:(await stayOffers.catalog()).offers,
        availability_coverage:{direct:true,airbnb:true,booking:true}
      });
    }
    if(action==="villegram_quote"){
      // Public read-only merchandising also serves this project's server-side feed.
      if(req.headers.get('x-chalezinho-env')!=='development'||new URL(projectUrl).hostname!=='pxfqmnhqodqyaaqeyjgr.supabase.co')return json({ok:false,error:'development_only'},403);
      try{return json(await villegramStayQuote(body,{search:(start:string,end:string,guests:number)=>searchData(start,end,guests,null,true),quote:(input:any,list:any[])=>createQuote(input,true,null,null,list,false)}))}
      catch(e){return json({ok:false,error:(e as Error).message||'quote_unavailable'},409)}
    }
    if(action==="villegram_offer"){
      if(!development)return json({ok:false,error:'development_only'},403);
      const data=await stayOffers.catalog(),offer=data.offers.find((o:any)=>o.id===body.offer_id);
      if(!offer)return json({ok:false,error:'offer_unavailable'},404);
      try{
       const list=await searchData(body.check_in,body.check_out,2,null,development),property=list.find((p:any)=>p.code===body.property_code);
       if(!property?.available)return json({ok:false,error:'dates_unavailable'},409);
       const q=await createQuote({property_id:property.id,check_in:body.check_in,check_out:body.check_out,guests:2,stay_offer_id:offer.id},development,null,null,list,false,data);
       const rate=q.rate_options.filter((r:any)=>r.selectable).sort((a:any,b:any)=>a.total_amount_cents-b.total_amount_cents)[0];
       if(!rate)return json({ok:false,error:'quote_unavailable'},409);
       return json({ok:true,card:{offer_id:offer.id,offer_name:offer.name,property_id:property.id,property_code:property.code,property_name:property.name,image:offer.villegram?.photos?.find((p:any)=>p.property_id===property.id)?.url||property.cover_image,check_in:body.check_in,check_out:body.check_out,nights:nights(body.check_in,body.check_out),guests:2,rate_code:rate.code,rate_name:rate.name,total_cents:rate.total_amount_cents,gross_cents:rate.contract_snapshot.gross_cents,discount_cents:rate.contract_snapshot.discount_cents,experiences:q.experiences.map((p:any)=>p.composition),category:isCelebration(body.check_in,body.check_out,offer.showcase)?'celebration':'weekday'}});
      }catch{return json({ok:false,error:'offer_unavailable'},409)}
    }
    if(action==="stay_showcase"){
      if(!development)return json({ok:false,error:"development_only"},403);
      const started=performance.now();
      const catalog=await stayOffers.catalog(),today=brazilClock().date,key=await showcaseCacheKey(today,catalog),catalogMs=performance.now()-started;
      let context:Promise<any>|null=null;
      const build=()=>cachedWeekdayShowcase({catalog:async()=>catalog,today,sources:searchSources,search:(start:string,end:string,sources:any)=>searchData(start,end,2,null,development,false,sources),quote:async(body:any,list:any[],catalog:any)=>{context ||= showcaseQuoteContext(catalog,development);return createQuote(body,development,null,null,list,false,catalog,await context)}});
      const runtime=(globalThis as any).EdgeRuntime;
      const cards=await persistentShowcase({admin,key,build,background:runtime?.waitUntil?(work:Promise<any>)=>runtime.waitUntil(work):null});
      const response=json({ok:true,...cards});response.headers.set("Server-Timing",`catalog;dur=${catalogMs.toFixed(1)},showcase;dur=${(performance.now()-started).toFixed(1)}`);return response;
    }
    if(action==="stay_offers"){const data=await stayOffers.catalog();return json({ok:true,offers:data.offers.map((o:any)=>({...o,issues_by_property:Object.fromEntries(o.property_ids.map((id:number)=>[id,offerIssues(o,data.products,id)])),packages:data.products.filter((p:any)=>o.product_ids.includes(p.id))}))})}
    if(action==="villegram")return await villegram(req,body,development);
    if(action==="stay_offer_action")return await stayOffers.action(req,body,development);
    if(action==="legal_documents")return await legalDocuments(req,body,development);
    if(action==="property_media"){
      const {data,error}=await admin.from("properties").select("id,code,slug,name,tagline,summary,property_type,max_guests,cover_image,gallery,features").eq("active",true).order("id");
      if(error) return json({ok:false,error:"media_unavailable"},500);
      return json({ok:true,properties:(data||[]).map(publicProperty)});
    }
    if(action==="search"){
      const start=url.searchParams.get("start")||body.start;
      const end=url.searchParams.get("end")||body.end;
      const guests=Number(url.searchParams.get("guests")||body.guests||2);
      const listings=await searchData(start,end,guests,null,development);
      const offerId=body.stay_offer_id||url.searchParams.get("stay_offer_id");
      const catalog=offerId?await stayOffers.catalog():null;
      const listingOffers=await Promise.all(listings.map(async(x:any)=>{
        const {cleaning_fee,...rest}=x;
        if(!x.available)return {...rest,from_stay_price:null};
        const selected=catalog?.offers.find((o:any)=>o.id===offerId);
        const issues=offerId?selected?offerIssues(selected,catalog.products,x.id,{check_in:start,check_out:end}):["offer_unavailable"]:[];
        if(issues.length)return {...rest,offer_issues:issues,from_stay_price:null};
        let quote;try{quote=await createQuote({property_id:x.id,check_in:start,check_out:end,guests,stay_offer_id:offerId||undefined},development,null,null,listings)}catch(e){return {...rest,from_stay_price:null,offer_issues:[(e as Error).message]}};
        const available=quote.rate_options.filter((p:any)=>p.selectable);
        return {...rest,from_stay_price:Math.min(...available.map((p:any)=>p.total_amount_cents))/100,quote,offer_issues:[]};
      }));
      return json({ok:true,listings:listingOffers});
    }
    if(action==="same_day_request"){
      const user=await currentUser(req);if(!user)return json({ok:false,error:"authentication_required"},401);
      try{return json({ok:true,...await sameDayRequests(admin,body,user,await userIsAdmin(user),async(r:any)=>(await searchData(r.check_in,r.check_out,r.guests,null,development,true)).find((p:any)=>Number(p.id)===Number(r.property_id)))})}
      catch(e){return json({ok:false,error:(e as Error).message},409)}
    }
    if(action==="quote"){
      let approved=null;
      if(body.same_day_request_id){const user=await currentUser(req);if(!user)return json({ok:false,error:"authentication_required"},401);approved=await approvedSameDayRequest(admin,body.same_day_request_id,user.id,body)}
      return json(await createQuote(body,development,null,approved));
    }
    if(action==="reservation_incident"){
      const user=await currentUser(req);
      if(!development||!user||!await userIsAdmin(user))return json({ok:false,error:"admin_required"},403);
      try{return json({ok:true,...await reservationIncident(admin,user.id,body)})}
      catch(e){const code=String((e as Error)?.message||"");
        const safe=["reservation_not_found","invalid_incident","verified_evidence_required","incident_not_found","incident_already_decided","invalid_incident_operation","idempotency_conflict"];
        return json({ok:false,error:safe.includes(code)?code:"incident_operation_failed"},409);}
    }
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
    if(action==="installment_options") return await installmentOptions(req,body,development);
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
    if(action==="reservation_finance"){
      const user=await currentUser(req);
      if(!development||!user)return json({ok:false,error:"authentication_required"},403);
      try{return json({ok:true,finance:await reservationFinance(admin,String(body.reservation_id||""),
        {userId:user.id,manager:await userIsAdmin(user)})})}
      catch(e){return json({ok:false,error:(e as Error).message==='reservation_not_found'?'reservation_not_found':'reservation_finance_unavailable'},409)}
    }
    if(action==="admin_guests"){
      const user=await currentUser(req);
      if(!development||!user||!await userIsAdmin(user))return json({ok:false,error:"admin_required"},403);
      try{return json(await guestDirectory(admin,body,user.id,async()=>{
        const response=await adminHubData(req,{start:localDate(-365),end:localDate(730)});
        if(!response.ok)throw Error("guest_directory_unavailable");
        return (await response.json()).channel_periods||[];
      }))}catch(e){const code=e instanceof Error?e.message:"guest_directory_unavailable";return json({ok:false,error:code},code.includes("unavailable")?503:400)}
    }
    if(action==="admin_hub") return await adminHubData(req,body);
    if(action==="experience_credit") return await experienceCredit(req,body,development);
    if(action==="reservation_refund_action") return await reservationRefundAction(req,body,development);
    if(action==="reservation_refund_status") return await reservationRefundStatus(req,body,development);
    if(action==="reservation_cancel_request") return await reservationCancelRequest(req,body,development);
    if(action==="admin_reservation_action") return await adminReservationAction(req,body);
    if(action==="admin_notification_action") return await adminNotificationAction(req,body);
    if(action==="admin_availability") return await adminAvailabilityAction(req,body);
    if(action==="admin_property_action") return await adminPropertyAction(req,body);
    if(action==="guarantee_action") return await guaranteeAction(req,body);
    if(action==="experience_admin") return await experienceAdminData(req);
    if(action==="experience_admin_action") return await experienceAdminAction(req,body);
    if(action==="guest_experience_catalog") return await guestExperienceCatalog(req,body);
    if(action==="purchase_post_booking_experience") return await purchasePostBookingExperience(req,body,development);
    if(action==="checkout_experience_cart_item") return await checkoutExperienceCartItem(req,body);
    if(action==="remove_experience_cart_item") return await removeExperienceCartItem(req,body);
    if(action==="track_access"){
      if(!development)return json({ok:false,error:"not_available"},403);
      let input;try{input=accessInput(body)}catch{return json({ok:false,error:"invalid_access_event"},400)}
      let property_id=null;
      if(input.code){
        const p=await admin.from("properties").select("id").eq("code",input.code).maybeSingle();
        if(p.error)return json({ok:false,error:"analytics_unavailable"},503);
        if(!p.data)return json({ok:false,error:"property_not_found"},400);
        property_id=p.data.id;
      }
      const result=await admin.from("analytics_events").insert({event_name:"site_page_view",anonymous_id:input.session_id,property_id,metadata:{page:input.page}});
      return result.error?json({ok:false,error:"analytics_unavailable"},503):json({ok:true});
    }
    if(action==="admin_access_metrics"){
      const user=await currentUser(req);
      if(!user||!await userIsAdmin(user))return json({ok:false,error:"admin_required"},403);
      if(![7,30,90].includes(body.days))return json({ok:false,error:"invalid_period"},400);
      try{return json({ok:true,...await accessReport(admin,body.days)})}
      catch{return json({ok:false,error:"analytics_unavailable"},503)}
    }
    if(action==="track") return await trackEvent(req,body);

    return json({ok:false,error:"unknown_action"},404);
  }catch(e){
    const msg=String((e as Error)?.message||"unexpected_error");
    const minMatch=/^minimum_stay:(\d+)$/.exec(msg);
    if(minMatch) return json({ok:false,error:"minimum_stay",min_stay:Number(minMatch[1])},400);
    if(msg==="booking_not_configured") return json({ok:false,error:"booking_not_configured"},503);
    const clientErrors=["same_day_approval_required","past_date","advance_notice","same_day_cutoff","availability_window","checkin_day","checkout_day","maximum_stay","invalid_dates","property_not_found","occupied","capacity","minimum_stay","rate_unavailable","experience_unavailable","experience_category_conflict","modification_already_open","upsell_not_available","offer_unavailable","offer_duration","offer_period","offer_property_incompatible","package_paused","package_lead_time","package_property_incompatible","package_unavailable","experience_component_conflict","invalid_experience_choice","experience_choice_required","experience_capacity","package_out_of_stock","package_components_required","experience_not_sold_separately"];
    return json({ok:false,error:msg},clientErrors.includes(msg)?400:500);
  }
});
