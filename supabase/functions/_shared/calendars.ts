export type CalendarPeriod={start:string;end:string};
export function validCalendarDate(value:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+'T12:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function calendarUrl(value:string,provider:string){
 let u:URL;try{u=new URL(value)}catch{throw new Error('invalid_calendar_url')}
 const host=u.hostname.toLowerCase();
 const allowed=provider==='booking'?host==='ical.booking.com':provider==='airbnb'&&(host==='airbnb.com'||host==='www.airbnb.com'||host==='www.airbnb.com.br'||host==='airbnb.com.br');
 if(u.protocol!=='https:'||!allowed||u.username||u.password||u.port||u.hash||value.length>2048)throw new Error('invalid_calendar_url');
 if(provider==='booking'&&!u.pathname.startsWith('/v1/export'))throw new Error('invalid_calendar_url');
 if(provider==='airbnb'&&!u.pathname.startsWith('/calendar/ical/'))throw new Error('invalid_calendar_url');
 return u.toString();
}
export function parseCalendar(raw:string):CalendarPeriod[]{
 raw=raw.replace(/\r?\n[ \t]/g,'');
 if(!/^BEGIN:VCALENDAR\s*$/m.test(raw)||!/^END:VCALENDAR\s*$/m.test(raw))throw new Error('invalid_calendar');
 const chunks=raw.split('BEGIN:VEVENT').slice(1);
 return chunks.flatMap(chunk=>{
  if(!chunk.includes('END:VEVENT'))throw new Error('invalid_calendar_event');
  const event=chunk.split('END:VEVENT')[0];
  // Never re-import this site's own events echoed by an OTA.
  if(/^UID:.*@chalezinho-site\s*$/m.test(event)||/^STATUS:CANCELLED\s*$/m.test(event))return [];
  if(/^RRULE[;:]/m.test(event))throw new Error('unsupported_calendar_recurrence');
  const read=(key:string)=>{const m=event.match(new RegExp('^'+key+'(?:;[^:]*)?:(\\d{4})(\\d{2})(\\d{2})(?:T\\d{6}Z?)?\\s*$','m'));return m?m[1]+'-'+m[2]+'-'+m[3]:''};
  const start=read('DTSTART'),end=read('DTEND');
  if(!validCalendarDate(start)||!validCalendarDate(end)||end<=start)throw new Error('invalid_calendar_event');
  return [{start,end}];
 });
}
export async function fetchCalendar(url:string,provider:string){
 const safe=calendarUrl(url,provider);
 const r=await fetch(safe,{redirect:'error',signal:AbortSignal.timeout(8000),headers:{'User-Agent':'ChalezinhoVille/1.0'}});
 if(!r.ok)throw new Error('calendar_unreachable');
 if(Number(r.headers.get('content-length')||0)>2097152)throw new Error('calendar_too_large');
 const reader=r.body?.getReader();if(!reader)throw new Error('invalid_calendar');
 let size=0,raw='';const decoder=new TextDecoder();
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2097152){await reader.cancel();throw new Error('calendar_too_large')}raw+=decoder.decode(value,{stream:true})}raw+=decoder.decode();
 return parseCalendar(raw);
}
export function calendarText(events:Array<CalendarPeriod&{uid:string;updated?:string}>,now=new Date()){
 const stamp=(v:string)=>new Date(v).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Chalezinho Ville//Availability//PT-BR','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
 for(const e of events){if(!validCalendarDate(e.start)||!validCalendarDate(e.end)||e.end<=e.start)continue;
 lines.push('BEGIN:VEVENT','UID:'+e.uid+'@chalezinho-site','DTSTAMP:'+stamp(e.updated||now.toISOString()),'DTSTART;VALUE=DATE:'+e.start.replaceAll('-',''),'DTEND;VALUE=DATE:'+e.end.replaceAll('-',''),'SUMMARY:Reservado','STATUS:CONFIRMED','TRANSP:OPAQUE','END:VEVENT');}
 lines.push('END:VCALENDAR');return lines.map(line=>line.match(/.{1,73}/g)?.join('\r\n ')||'').join('\r\n')+'\r\n';
}
export function calendarService(admin:any,projectUrl:string){
 const checked=(r:any)=>{if(r.error)throw new Error('calendar_database_unavailable');return r.data||[]};
 async function channels(provider:string){
  const properties=checked(await admin.from('properties').select('id,name').eq('active',true));
  const sources=checked(await admin.from('property_calendar_sources').select('*').eq('provider',provider));
  const listings=await Promise.all(properties.map(async(p:any)=>{
   const s=sources.find((x:any)=>x.property_id===p.id);
   if(!s||!s.enabled)return {property_id:p.id,name:p.name,ok:true,periods:[]};
   let periods:CalendarPeriod[]=[],error:string|null=null;
   try{if(!s.feed_url)throw new Error('calendar_not_configured');periods=await fetchCalendar(s.feed_url,provider)}catch(e){error=e instanceof Error&&['invalid_calendar','invalid_calendar_event','unsupported_calendar_recurrence','calendar_not_configured','invalid_calendar_url','calendar_too_large'].includes(e.message)?e.message:'calendar_unreachable'}
   const now=new Date().toISOString();
   await admin.from('property_calendar_sources').update({last_checked_at:now,last_error:error,...(!error?{last_success_at:now,event_count:periods.length}:{})}).eq('id',s.id).eq('updated_at',s.updated_at);
   return {property_id:p.id,name:p.name,ok:!error,error,periods};
  }));return {configured:true,ok:listings.every((x:any)=>x.ok),listings};
 }
 async function configuration(){
  const sources=checked(await admin.from('property_calendar_sources').select('*').order('provider'));
  const exports=checked(await admin.from('property_calendar_exports').select('*'));
  return {sources,exports:exports.map((x:any)=>({property_id:x.property_id,enabled:x.enabled,url:projectUrl+'/functions/v1/booking-engine?action=calendar_export&token='+x.token}))};
 }
 async function exportFeed(token:string){
  if(!/^[a-f0-9]{64}$/.test(token))return new Response('Not found',{status:404});
  const r=await admin.from('property_calendar_exports').select('property_id,enabled').eq('token',token).maybeSingle();
  if(r.error)throw new Error('calendar_database_unavailable');if(!r.data?.enabled)return new Response('Not found',{status:404});
  const id=r.data.property_id,now=new Date().toISOString(),past=new Date(Date.now()-90*86400000).toISOString().slice(0,10);
  const reservations=checked(await admin.from('reservations').select('id,check_in,check_out,status,hold_expires_at,updated_at,source').eq('property_id',id).in('status',['confirmed','hold','pending_payment']).gte('check_out',past));
  const blocks=checked(await admin.from('pms_calendar_blocks').select('id,start_date,end_date,updated_at').eq('property_id',id).eq('status','active').gte('end_date',past));
  const changes=checked(await admin.from('post_booking_charges').select('id,target_check_in,target_check_out,expires_at,created_at').eq('kind','modification').eq('target_property_id',id).in('status',['awaiting_payment','processing','paid']).gt('expires_at',now));
  const events=[...reservations.filter((r:any)=>!['booking','airbnb'].includes(r.source)&&(r.status==='confirmed'||!r.hold_expires_at||r.hold_expires_at>now)).map((r:any)=>({uid:'reservation-'+r.id,start:r.check_in,end:r.check_out,updated:r.updated_at})),...blocks.map((b:any)=>({uid:'block-'+b.id,start:b.start_date,end:b.end_date,updated:b.updated_at})),...changes.map((c:any)=>({uid:'change-'+c.id,start:c.target_check_in,end:c.target_check_out,updated:c.created_at}))];
  return new Response(calendarText(events),{headers:{'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'inline; filename="availability.ics"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }
 return {channels,configuration,exportFeed};
}
