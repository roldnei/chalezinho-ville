import {validCalendarDate} from './calendars.ts';

// Occupancy and an operational stay are different assertions. Never infer a
// booking from a closed date, a name, or STATUS:CONFIRMED on a generic feed.
export function parseOperationalCalendar(raw:string,provider:string){
 raw=raw.replace(/\r?\n[ \t]/g,'');
 if(!/^BEGIN:VCALENDAR\s*$/m.test(raw)||!/^END:VCALENDAR\s*$/m.test(raw))throw Error('invalid_calendar');
 const seen=new Set<string>();
 return raw.split('BEGIN:VEVENT').slice(1).flatMap(chunk=>{
  if(!chunk.includes('END:VEVENT'))throw Error('invalid_calendar_event');
  const event=chunk.split('END:VEVENT')[0];
  const read=(key:string)=>event.match(new RegExp('^'+key+'(?:;[^:]*)?:(.*)$','mi'))?.[1]?.trim()||'';
  const uid=read('UID');
  if(uid.endsWith('@chalezinho-site')||read('TRANSP')==='TRANSPARENT')return [];
  if(!uid||uid.length>1000||seen.has(uid)||read('RRULE'))throw Error('unsupported_or_duplicate_event');
  seen.add(uid);
  const date=(key:string)=>{const value=read(key);return /^\d{8}$/.test(value)?value.slice(0,4)+'-'+value.slice(4,6)+'-'+value.slice(6,8):null};
  const start=date('DTSTART'),end=date('DTEND');
  // Timestamp/TZID feeds require human review of their intended lodging dates.
  const dates=!!start&&!!end&&validCalendarDate(start)&&validCalendarDate(end)&&end>start;
  const summary=read('SUMMARY').slice(0,500),cancelled=read('STATUS')==='CANCELLED';
  const reserved=['airbnb','booking'].includes(provider)&&/^(reserved|reservation|reservado)$/i.test(summary);
  const closed=/^(airbnb \(not available\)|closed - not available|not available|blocked|unavailable)$/i.test(summary);
  return [{uid,start:dates?start:null,end:dates?end:null,summary,kind:dates&&reserved?'stay':closed?'block':'ambiguous',cancelled,sequence:Number(read('SEQUENCE'))||0,reason:!dates?'dates_need_review':reserved?'provider_reserved':closed?'unavailability_only':'insufficient_booking_evidence'}];
 });
}

export function operationSummary(stays:any[],tasks:any[],today:string,now=new Date(),properties:any[]=[]){
 const fixtureIds=new Set(stays.filter(s=>s.is_test).map(s=>s.id));
 tasks=tasks.filter(t=>!fixtureIds.has(t.stay_id));
 const active=stays.filter(s=>!s.is_test&&s.status==='confirmed');
 const ended=(s:any)=>!!(s.checked_out_at||s.departure_reported_on);
 const boundary=(s:any,stage:'check_in'|'check_out')=>{
  const p=properties.find(p=>p.id===s.property_id);
  const time=p?.[stage+'_time']||(stage==='check_in'?'15:00:00':'11:00:00');
  return Date.parse(s[stage]+'T'+(time.length===5?time+':00':time)+'-03:00');
 };
 const current=(s:any)=>!ended(s)&&boundary(s,'check_in')<=now.getTime()&&boundary(s,'check_out')>now.getTime();
 return {arrivals:active.filter(s=>s.check_in===today),departures:active.filter(s=>s.check_out===today),
  expected:active.filter(current),
  present:active.filter(s=>s.checked_in_at&&current(s)),
  upcoming:active.filter(s=>!ended(s)&&boundary(s,'check_out')>now.getTime()),
  attendance_review:active.filter(s=>!ended(s)&&boundary(s,'check_out')<=now.getTime()),
  pending:tasks.filter(t=>!['approved','cancelled','superseded'].includes(t.status)),
  overdue:tasks.filter(t=>!['approved','cancelled','superseded'].includes(t.status)&&Date.parse(t.due_at)<now.getTime())};
}
