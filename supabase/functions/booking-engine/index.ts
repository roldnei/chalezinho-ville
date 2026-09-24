
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

async function searchData(start:string,end:string,guests:number,excludeReservationId:string|null=null){
  if(!validDate(start)||!validDate(end)||end<=start) throw new Error("invalid_dates");
  const stay=nights(start,end);
  if(stay<1) throw new Error("invalid_dates");

  const [{data:properties,error:pe},{data:dbRows,error:re},ical,prices] = await Promise.all([
    admin.from("properties").select("id,code,name,slug,property_type,tagline,summary,cover_image,gallery,features,cleaning_fee,max_guests,guarantee_amount_cents").eq("active",true).order("id"),
    admin.from("reservations").select("id,property_id,check_in,check_out,status,hold_expires_at")
      .lt("check_in",end).gt("check_out",start).in("status",["hold","pending_payment","confirmed"]),
    prodJson("/api/ical-airbnb-all"),
    prodJson("/api/pricelabs-availability?start="+encodeURIComponent(start)+"&end="+encodeURIComponent(end)),
  ]);
  if(pe||re){
    console.error("booking_search_db_error", pe?.code||null, re?.code||null);
    throw new Error("database_unavailable");
  }
  const now=Date.now();
  const dbActive=(dbRows||[]).filter((r:any)=>String(r.id)!==String(excludeReservationId||"")).filter((r:any)=>r.status!=="hold" && r.status!=="pending_payment" ? true : !r.hold_expires_at || Date.parse(r.hold_expires_at)>now);
  const icalMap=Object.fromEntries((ical.listings||[]).map((x:any)=>[x.name,x]));
  const priceMap=Object.fromEntries((prices.listings||[]).map((x:any)=>[x.name,x]));

  return (properties||[]).map((p:any)=>{
    const cal=icalMap[p.name];
    const pr=priceMap[p.name];
    const channelOccupied=!cal?.ok || (cal.periods||[]).some((x:any)=>overlaps(x.start,x.end,start,end));
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
  const list=await searchData(String(check_in||""),String(check_out||""),Number(guests||0),excludeReservationId);
  const property=list.find((x:any)=>Number(x.id)===Number(property_id));
  if(!property) throw new Error("property_not_found");
  if(!property.available) throw new Error(property.unavailable_reason||"unavailable");

  let experienceTotal=0;
  const expSnapshots:any[]=[];
  if(Array.isArray(experience_variant_ids)&&experience_variant_ids.length){
    const {data:variants,error}=await admin.from("experience_variants")
      .select("id,code,name,price_cents,active,product_id,experience_products!inner(id,code,name,status,minimum_lead_hours,package_type,price_cents,upsell_enabled)")
      .in("id",experience_variant_ids);
    if(error) throw new Error("experience_lookup_failed");
    const productIds=[...new Set((variants||[]).map((v:any)=>v.product_id))];
    const {data:eligibleRows}=await admin.from("experience_property_eligibility").select("product_id").eq("property_id",property.id).in("product_id",productIds);
    const eligible=new Set((eligibleRows||[]).map((x:any)=>String(x.product_id)));
    for(const v of variants||[]){
      const prod=(v as any).experience_products;
      const leadOk=(Date.parse(check_in+"T15:00:00-03:00")-Date.now()) >= Number(prod.minimum_lead_hours||0)*3600000;
      const allowed=v.active && eligible.has(String(prod.id)) && leadOk && (prod.status==="active" || (development && prod.status==="draft"));
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
      code:p.code,name:p.name,selectable:p.selectable,accommodation_amount_cents:accommodation,
      cleaning_fee_cents:cleaningCents,experience_amount_cents:experienceTotal,total_amount_cents:total,
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
  return {ok:true,quote_id:q.id,expires_at:expiresAt,property,rate_options:display,experiences:expSnapshots.map(x=>({
    product_id:x.product.id,product:x.product.name,package_type:x.product.package_type,
    variant:x.variant.code==="package"?null:x.variant.name,price_cents:Number(x.variant.price_cents)
  }))};
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
  const {data:r}=await admin.from("reservations").select("id,user_id,property_id,guests,total_amount,rate_plan_code,check_in,check_out,status").eq("id",reservation_id).single();
  if(!r || r.user_id!==user.id) return json({ok:false,error:"not_found"},404);
  if(!["confirmed","pending_payment"].includes(r.status)) return json({ok:false,error:"reservation_not_changeable"},409);
  const {data:openRequest}=await admin.from("modification_requests")
    .select("id,status,requested_check_in,requested_check_out,requested_property_id,reference_amount_cents,admin_additional_amount_cents,created_at")
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
  }catch(e){return json({ok:false,error:String((e as Error).message||"modification_quote_failed")},409)}
  const option=quote.rate_options.find((x:any)=>x.code===r.rate_plan_code && x.selectable) || quote.rate_options.find((x:any)=>x.code==="non_refundable");
  const originalCents=Math.round(Number(r.total_amount||0)*100);
  const referenceCents=Number(option?.total_amount_cents||0);
  const {data:m,error}=await admin.from("modification_requests").insert({
    reservation_id:r.id,user_id:user.id,request_type:targetProperty===Number(r.property_id)?"dates":"property",
    requested_check_in,requested_check_out,requested_property_id:targetProperty,reference_quote_id:quote.quote_id,
    original_amount_cents:originalCents,reference_amount_cents:referenceCents,status:"quoted"
  }).select().single();
  if(error){
    if(String(error.code)==="23505") return json({ok:false,error:"modification_already_open"},409);
    return json({ok:false,error:"modification_create_failed"},500);
  }
  await admin.from("reservation_change_events").insert({
    reservation_id:r.id,modification_request_id:m.id,event_type:"quoted",
    before_snapshot:{property_id:r.property_id,check_in:r.check_in,check_out:r.check_out,total_amount:r.total_amount,rate_plan_code:r.rate_plan_code},
    after_snapshot:{requested_property_id:targetProperty,requested_check_in,requested_check_out,reference_amount_cents:referenceCents},
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
    const before=m.reservations;
    const amount=Math.max(0,Number(m.admin_additional_amount_cents||0));
    let paymentId=null;
    if(amount>0){
      const idem="mod-"+m.id;
      const {data:existing}=await admin.from("payments").select("id,status").eq("idempotency_key",idem).maybeSingle();
      if(existing && existing.status!=="paid") return json({ok:false,error:"additional_payment_not_paid"},409);
      if(!existing){
        const {data:p}=await admin.from("payments").insert({
          reservation_id:m.reservation_id,user_id:m.user_id,provider:"mock",method:"mock",amount_cents:amount,status:"paid",
          idempotency_key:idem,metadata:{development:true,kind:"modification",modification_request_id:m.id}
        }).select().single();
        paymentId=p?.id||null;
        await admin.from("financial_entries").insert({reservation_id:m.reservation_id,payment_id:paymentId,entry_type:"additional_charge",amount_cents:amount,description:"Alteração de reserva"});
      }
    }
    const newTotal=Number(before.total_amount||0)+amount/100;
    const {error}=await admin.from("reservations").update({
      property_id:m.requested_property_id||before.property_id,check_in:m.requested_check_in||before.check_in,check_out:m.requested_check_out||before.check_out,total_amount:newTotal
    }).eq("id",m.reservation_id);
    if(error){
      if(String(error.code)==="23P01") return json({ok:false,error:"dates_unavailable"},409);
      return json({ok:false,error:"modification_apply_failed"},500);
    }
    await admin.from("modification_requests").update({status:"applied",applied_at:new Date().toISOString()}).eq("id",m.id);
    await admin.from("reservation_change_events").insert({
      reservation_id:m.reservation_id,modification_request_id:m.id,event_type:"applied",
      before_snapshot:before,after_snapshot:{property_id:m.requested_property_id||before.property_id,check_in:m.requested_check_in||before.check_in,check_out:m.requested_check_out||before.check_out,total_amount:newTotal},
      amount_cents:amount,actor_user_id:user.id
    });
    return json({ok:true,status:"applied"});
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
    await admin.from("guarantees").update({status:"released"}).eq("id",g.id);
    return json({ok:true,status:"released"});
  }
  if(operation==="report_incident"){
    const {data:i}=await admin.from("incidents").insert({guarantee_id:g.id,description:description||"Ocorrência registrada",requested_capture_cents:Math.max(0,Number(amount_cents||0)),status:"open"}).select().single();
    await admin.from("guarantees").update({status:"incident_reported"}).eq("id",g.id);
    return json({ok:true,status:"incident_reported",incident:i});
  }
  if(operation==="capture"){
    const amount=Math.max(0,Number(amount_cents||0));
    if(amount>Number(g.amount_cents)) return json({ok:false,error:"capture_exceeds_guarantee"},400);
    await admin.from("guarantees").update({status:"captured",captured_amount_cents:amount}).eq("id",g.id);
    if(amount>0) await admin.from("financial_entries").insert({reservation_id:g.reservation_id,entry_type:"guarantee_capture",amount_cents:amount,description:"Captura parcial de garantia"});
    await admin.from("incidents").update({status:"resolved",resolved_at:new Date().toISOString()}).eq("guarantee_id",g.id).eq("status","open");
    return json({ok:true,status:"captured",captured_amount_cents:amount,released_amount_cents:Number(g.amount_cents)-amount});
  }
  return json({ok:false,error:"invalid_operation"},400);
}


async function experienceAdminData(req:Request){
  const user=await currentUser(req);
  if(!user || !(await userIsAdmin(user))) return json({ok:false,error:"admin_required"},403);
  const [{data:products,error:pe},{data:properties,error:pre},{data:purposes,error:pu}] = await Promise.all([
    admin.from("experience_products")
      .select("id,code,name,description,sales_headline,details,package_type,price_cents,upsell_enabled,status,minimum_lead_hours,travel_purposes,display_order,experience_variants(id,code,name,price_cents,active,display_order),experience_property_eligibility(property_id),experience_media(id,media_url,alt_text,display_order)")
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
    const {data:variants}=await admin.from("experience_variants").select("*").eq("product_id",product.id).eq("active",true).order("display_order").limit(1);
    if(variants?.length){
      await admin.from("experience_variants").update({price_cents:priceCents}).eq("id",variants[0].id);
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



Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
  try{
    const url=new URL(req.url);
    let body:any={};
    if(req.method==="POST") body=await req.json().catch(()=>({}));
    const action=url.searchParams.get("action")||body.action||"config";
    const development=req.headers.get("x-chalezinho-env")==="development";

    if(action==="config"){
      const [purposesQ,settingsQ,docsQ,productsQ] = await Promise.all([
        admin.from("travel_purposes").select("*").eq("active",true).order("display_order"),
        admin.from("payment_settings").select("active_provider,charge_percent,pix_expiration_minutes,max_card_installments").eq("id",1).single(),
        admin.from("policy_documents").select("id,document_type,code,version,title,body,status").in("status",development?["active","draft"]:["active"]).order("document_type"),
        admin.from("experience_products").select("id,code,name,description,sales_headline,details,package_type,price_cents,upsell_enabled,status,minimum_lead_hours,travel_purposes,display_order,experience_variants(id,code,name,price_cents,active,display_order),experience_property_eligibility(property_id),experience_media(id,media_url,alt_text,display_order)")
          .in("status",development?["active","draft"]:["active"]).order("display_order")
      ]);
      const errs=[purposesQ.error,settingsQ.error,docsQ.error,productsQ.error].filter(Boolean);
      if(errs.length) return json({ok:false,error:"config_unavailable"},500);
      return json({ok:true,purposes:purposesQ.data||[],payment_settings:settingsQ.data||{},policy_documents:docsQ.data||[],experience_products:productsQ.data||[]});
    }
    if(action==="search"){
      const start=url.searchParams.get("start")||body.start;
      const end=url.searchParams.get("end")||body.end;
      const guests=Number(url.searchParams.get("guests")||body.guests||2);
      return json({ok:true,listings:await searchData(start,end,guests)});
    }
    if(action==="quote") return json(await createQuote(body,development));
    if(action==="start_payment") return await startPayment(req,body);
    if(action==="mock_payment") return await mockPayment(req,body);
    if(action==="request_modification") return await requestModification(req,body,development);
    if(action==="modification_action") return await modificationAction(req,body);
    if(action==="ops") return await opsData(req);
    if(action==="guarantee_action") return await guaranteeAction(req,body);
    if(action==="experience_admin") return await experienceAdminData(req);
    if(action==="experience_admin_action") return await experienceAdminAction(req,body);
    if(action==="track") return await trackEvent(req,body);

    return json({ok:false,error:"unknown_action"},404);
  }catch(e){
    const msg=String((e as Error)?.message||"unexpected_error");
    const clientErrors=["invalid_dates","property_not_found","occupied","capacity","minimum_stay","rate_unavailable","experience_unavailable","modification_already_open"];
    return json({ok:false,error:msg},clientErrors.includes(msg)?400:500);
  }
});
