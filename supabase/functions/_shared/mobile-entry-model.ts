export const EXPERIMENT='mobile-home-v1';
export const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const EVENTS=new Set(['entry_rendered','property_viewed','search_started','search_completed','consultation_prepared','whatsapp_clicked','summary_copied','entry_failed','search_failed','performance']);
export function phoneOS(ua:string){return /iPhone|iPod/i.test(ua)?'ios':/Android.+Mobile/i.test(ua)?'android':null;}
export function homeEligible(page:string,search:string,hash:string){
 if(!['/','/index.html'].includes(page)||hash)return false;
 const q=new URLSearchParams(search);
 return [...q.keys()].every(k=>/^utm_(source|medium|campaign|term|content)$/.test(k)||['gclid','fbclid'].includes(k));
}
export async function assignment(visitor:string,phase:string){
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(EXPERIMENT+':'+phase+':'+visitor)));
 const hex=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
 return {id:`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`,variant:phase==='baseline'?'baseline':bytes[16]<128?'A':'B',reference:'MV-'+hex.slice(0,12).toUpperCase()};
}
export function safeDetails(input:any={}){
 const out:Record<string,any>={};
 for(const key of ['check_in','check_out'])if(typeof input[key]==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(input[key])&&Number.isFinite(Date.parse(input[key])))out[key]=input[key];
 for(const key of ['nights','guests','available_count','duration_ms','lcp_ms'])if(Number.isFinite(input[key])&&input[key]>=0&&input[key]<=1e8)out[key]=Math.round(input[key]);
 if(['A','B','moments','site'].includes(input.rendered))out.rendered=input.rendered;
 if(['feed_unavailable','empty_feed','decision_timeout'].includes(input.reason))out.reason=input.reason;
 return out;
}
export function saoDay(value:string|Date){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));}
// Denominator is every assignment, including delivery failures (intent to treat).
export function summarizeMobile(participants:any[],events:any[],outcomes:any[],protocol:any={},now=new Date()){
 const windowDays=Number(protocol.attribution_days)||7,groups:any={};
 const byParticipant=new Map<string,any[]>();for(const e of events){const list=byParticipant.get(e.participant_id)||[];list.push(e);byParticipant.set(e.participant_id,list);}
 const byOutcome=new Map<string,any[]>();for(const o of outcomes){const list=byOutcome.get(o.participant_id)||[];list.push(o);byOutcome.set(o.participant_id,list);}
 for(const variant of ['baseline','A','B']){
  const rows=participants.filter(p=>!p.excluded&&p.variant===variant),mature=rows.filter(p=>Date.parse(p.assigned_at)+windowDays*86400000<=now.getTime());
  const count=(list:any[],name:string)=>list.filter(p=>(byParticipant.get(p.id)||[]).some(e=>e.event_name===name&&Date.parse(e.occurred_at)>=Date.parse(p.assigned_at)&&Date.parse(e.occurred_at)<=Math.min(now.getTime(),Date.parse(p.assigned_at)+(p.phase==='baseline'?Infinity:windowDays*86400000)))).length;
  const outcome=(list:any[],kind:string)=>list.filter(p=>(byOutcome.get(p.id)||[]).some(o=>o.kind===kind&&Date.parse(o.occurred_at)>=Date.parse(p.assigned_at)&&Date.parse(o.occurred_at)<=Math.min(now.getTime(),Date.parse(p.assigned_at)+(p.phase==='baseline'?Infinity:windowDays*86400000)))).length;
  const counts=Object.fromEntries([...EVENTS].map(name=>[name,count(rows,name)]));
  Object.assign(counts,{request_received:outcome(rows,'request_received'),reservation_confirmed:outcome(rows,'reservation_confirmed')});
  const matureCounts=Object.fromEntries([...EVENTS].map(name=>[name,count(mature,name)]));
  Object.assign(matureCounts,{request_received:outcome(mature,'request_received'),reservation_confirmed:outcome(mature,'reservation_confirmed')});
  groups[variant]={visitors:rows.length,mature_visitors:mature.length,counts,rates:Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,rows.length?100*Number(v)/rows.length:null])),mature_counts:matureCounts,mature_rates:Object.fromEntries(Object.entries(matureCounts).map(([k,v])=>[k,mature.length?100*Number(v)/mature.length:null]))};
 }
 return {groups,attribution_days:windowDays,verdict:'inconclusive',note:'Daily monitoring is descriptive; no automatic winner.'};
}
