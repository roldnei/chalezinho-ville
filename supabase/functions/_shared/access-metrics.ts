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
export function summarizeAccess(events:any[],properties:any[]){
 const sessions=new Set<string>();
 const counts=new Map(properties.map(p=>[String(p.id),{property_id:p.id,name:p.name,views:0,sessions:new Set<string>()}]));
 for(const e of events){
  if(e.anonymous_id)sessions.add(e.anonymous_id);
  const p=counts.get(String(e.property_id));
  if(p){p.views++;if(e.anonymous_id)p.sessions.add(e.anonymous_id)}
 }
 const ranking=[...counts.values()].map(p=>({...p,sessions:p.sessions.size})).sort((a,b)=>b.views-a.views||a.name.localeCompare(b.name));
 return {page_views:events.length,sessions:sessions.size,ranking};
}
export async function accessReport(db:any,days:number,now=new Date()){
 if(![7,30,90].includes(days))throw Error("invalid_period");
 const end=now.toISOString(),start=new Date(now.getTime()-days*86400000).toISOString();
 const props=await db.from("properties").select("id,name");if(props.error)throw Error("analytics_unavailable");
 const events:any[]=[];
 // Range pagination avoids Supabase's default 1,000-row truncation. Fail explicitly at the cap.
 for(let offset=0;offset<=100000;offset+=1000){
  const result=await db.from("analytics_events").select("id,property_id,anonymous_id")
   .eq("event_name","site_page_view").gte("occurred_at",start).lt("occurred_at",end)
   .order("id",{ascending:true}).range(offset,offset+999);
  if(result.error)throw Error("analytics_unavailable");
  const rows=result.data||[];
  if(offset===100000&&rows.length)throw Error("analytics_volume_limit");
  events.push(...rows);if(rows.length<1000)break;
 }
 return {days,start,end,...summarizeAccess(events,props.data||[])};
}
