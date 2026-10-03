// Anonymous, session-based counters. No user identity, IP or query string is stored.
export const accessPages:Record<string,string|null>={
 "index.html":null,"reservar.html":null,"imovel.html":null,
 "chale-premium.html":"CH1","chale-com-hidro.html":"CH2","chale-romantico.html":"CH3"
};
export function accessInput(body:any){
 const page=body?.page;
 if(typeof page!=="string"||!Object.hasOwn(accessPages,page))throw Error("invalid_page");
 if(typeof body.session_id!=="string"||!/^access:[a-f0-9-]{36}$/i.test(body.session_id))throw Error("invalid_session");
 const code=page==="imovel.html"?body.property_code:accessPages[page];
 if(page==="imovel.html"&&(typeof code!=="string"||!/^CH[0-9]{1,6}$/.test(code)))throw Error("invalid_property");
 return {page,code:code||null,session_id:body.session_id};
}
export function summarizeAccess(events:any[],properties:any[],attributions:any[]=[],reservations:any[]=[]){
 const sessions=new Set<string>();
 const counts=new Map(properties.map(p=>[String(p.id),{property_id:p.id,name:p.name,views:0,sessions:new Set<string>()}]));
 for(const e of events){
  if(e.anonymous_id)sessions.add(e.anonymous_id);
  const p=counts.get(String(e.property_id));
  if(p){p.views++;if(e.anonymous_id)p.sessions.add(e.anonymous_id)}
 }
 const firstVisit=new Map<string,string>();
 for(const e of events){const key=JSON.stringify([String(e.property_id),e.anonymous_id]);if(e.occurred_at&&(!firstVisit.has(key)||e.occurred_at<firstVisit.get(key)!))firstVisit.set(key,e.occurred_at)}
 const converted=new Map<string,Set<string>>();
 const eligible=new Map(reservations.filter(r=>r.status==="confirmed"&&r.source==="direct"&&(r.payments||[]).some((p:any)=>["paid","partially_refunded"].includes(p.status)&&p.provider!=="mock"&&(!p.metadata?.kind||p.metadata.kind==="reservation"))).map(r=>[String(r.id),r]));
 for(const a of attributions){
  const reservation=eligible.get(String(a.reservation_id));
  if(!reservation)continue;
  const key=String(reservation.property_id),counter=counts.get(key);
  const visitedAt=firstVisit.get(JSON.stringify([key,a.anonymous_id]));
  const priorVisit=visitedAt&&visitedAt<=a.occurred_at;
  if(!counter||!priorVisit)continue;
  if(!converted.has(key))converted.set(key,new Set());
  converted.get(key)!.add(String(reservation.id));
 }
 const ranking=[...counts.values()].map(p=>({...p,sessions:p.sessions.size,confirmed_bookings:converted.get(String(p.property_id))?.size||0,conversion_percent:p.sessions.size?100*(converted.get(String(p.property_id))?.size||0)/p.sessions.size:null})).sort((a,b)=>b.views-a.views||a.name.localeCompare(b.name));
 return {page_views:events.length,sessions:sessions.size,ranking};
}
export async function accessReport(db:any,days:number,now=new Date()){
 if(![7,30,90].includes(days))throw Error("invalid_period");
 const end=now.toISOString(),start=new Date(now.getTime()-days*86400000).toISOString();
 const props=await db.from("properties").select("id,name");if(props.error)throw Error("analytics_unavailable");
 const events:any[]=[];
 // Range pagination avoids Supabase's default 1,000-row truncation. Fail explicitly at the cap.
 for(let offset=0;offset<=100000;offset+=1000){
  const result=await db.from("analytics_events").select("id,event_name,property_id,anonymous_id,reservation_id,occurred_at")
   .in("event_name",["site_page_view","site_booking_attribution"]).gte("occurred_at",start).lt("occurred_at",end)
   .order("id",{ascending:true}).range(offset,offset+999);
  if(result.error)throw Error("analytics_unavailable");
  const rows=result.data||[];
  if(offset===100000&&rows.length)throw Error("analytics_volume_limit");
  events.push(...rows);if(rows.length<1000)break;
 }
 const pages=events.filter(e=>e.event_name==="site_page_view"),attributions=events.filter(e=>e.event_name==="site_booking_attribution");
 const ids=[...new Set(attributions.map(e=>e.reservation_id).filter(Boolean))],reservations:any[]=[];
 for(let i=0;i<ids.length;i+=100){
  const result=await db.from("reservations").select("id,property_id,status,source,payments(status,provider,metadata)").in("id",ids.slice(i,i+100));
  if(result.error)throw Error("analytics_unavailable");
  reservations.push(...result.data||[]);
 }
 return {days,start,end,...summarizeAccess(pages,props.data||[],attributions,reservations)};
}

// Only the authenticated server-side checkout can associate a visit with a hold.
// Confirmation is read from reservations/payments later, not asserted by the browser.
export async function recordAccessBooking(db:any,reservationId:string,sessionId:unknown){
 if(typeof sessionId!=="string"||!/^access:[a-f0-9-]{36}$/i.test(sessionId))return;
 try{
  const result=await db.from("analytics_events").insert({event_name:"site_booking_attribution",anonymous_id:sessionId,reservation_id:reservationId,metadata:{}});
  if(result.error)console.warn("access_booking_attribution_unavailable");
 }catch{console.warn("access_booking_attribution_unavailable")}
}
