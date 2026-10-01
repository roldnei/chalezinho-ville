import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
export type CalendarPeriod={start:string;end:string};
export function publicCalendarIp(ip:string){
 if(isIP(ip)===4){const [a,b,c]=ip.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||a===100&&b>=64&&b<=127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2)||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113)}
 if(isIP(ip)===6){const parts=ip.toLowerCase().split(':'),first=parseInt(parts[0],16),second=parseInt(parts[1]||'0',16);return first>=0x2000&&first<=0x3fff&&!(first===0x2001&&(second<0x200||second===0xdb8))&&first!==0x2002}
 return false;
}
export function calendarProvider(value:string){const h=new URL(value).hostname.toLowerCase();return h==='ical.booking.com'?'booking':['airbnb.com','www.airbnb.com','airbnb.com.br','www.airbnb.com.br'].includes(h)?'airbnb':'ical'}
export function validCalendarDate(value:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+'T12:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function calendarUrl(value:string,provider='ical'){
 let u:URL;try{u=new URL(value)}catch{throw new Error('invalid_calendar_url')}
 const host=u.hostname.toLowerCase();
 const allowed=provider==='booking'?host==='ical.booking.com':provider==='airbnb'?(host==='airbnb.com'||host==='www.airbnb.com'||host==='www.airbnb.com.br'||host==='airbnb.com.br'):provider==='ical'&&/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(host)&&!/(^|\.)(localhost|local|internal|test|invalid|example)$/.test(host)&&!isIP(host);
 if(u.protocol!=='https:'||!allowed||u.username||u.password||u.port||u.hash||value.length>2048)throw new Error('invalid_calendar_url');
 if(provider==='booking'&&!u.pathname.startsWith('/v1/export'))throw new Error('invalid_calendar_url');
 if(provider==='airbnb'&&!u.pathname.startsWith('/calendar/ical/'))throw new Error('invalid_calendar_url');
 return u.toString();
}
// Pin the connection to a validated public address, while preserving TLS hostname validation.
async function genericCalendarBody(value:string,remaining=3):Promise<string>{
 const url=new URL(calendarUrl(value));
 const addresses=await Promise.race([lookup(url.hostname,{all:true}),new Promise<never>((_,reject)=>{const timer=setTimeout(()=>reject(Error('calendar_unreachable')),8000);timer.unref?.()})]);
 if(!addresses.length||addresses.some(x=>!publicCalendarIp(x.address)))throw Error('invalid_calendar_url');
 const address=addresses.find(x=>x.family===4)||addresses[0];
 const runtime=(globalThis as any).Deno;
 let connection:any;
 const exchange=async()=>{
  connection=await runtime.connect({hostname:address.address,port:443});
  connection=await runtime.startTls(connection,{hostname:url.hostname,alpnProtocols:['http/1.1']});
  const bytes=new TextEncoder().encode(`GET ${url.pathname}${url.search} HTTP/1.1\r\nHost: ${url.host}\r\nAccept: text/calendar\r\nAccept-Encoding: identity\r\nUser-Agent: ChalezinhoVille/1.0\r\nConnection: close\r\n\r\n`);
  let sent=0;while(sent<bytes.length)sent+=await connection.write(bytes.subarray(sent));
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const buf=new Uint8Array(16384),count=await connection.read(buf);if(count===null)break;size+=count;if(size>2162688)throw Error('calendar_too_large');chunks.push(buf.slice(0,count))}
  const all=new Uint8Array(size);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length}
  return calendarHttpResponse(all);
 };
 let timer:any;let result:{body:string;redirect?:string};
 try{result=await Promise.race([exchange(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('calendar_unreachable')),8000)})])}finally{clearTimeout(timer);try{connection?.close()}catch{}}

 if(result.redirect){if(!remaining)throw Error('calendar_unreachable');return genericCalendarBody(new URL(result.redirect,url).toString(),remaining-1)}
 return result.body;
}
export function calendarHttpResponse(raw:Uint8Array):{body:string;redirect?:string}{
 const text=new TextDecoder('latin1').decode(raw),split=text.indexOf('\r\n\r\n');
 if(split<0||split>32768)throw Error('calendar_unreachable');
 const header=text.slice(0,split),status=Number(header.match(/^HTTP\/1\.[01] (\d{3})/)?.[1]);
 const get=(name:string)=>header.match(new RegExp('^'+name+':\\s*(.*?)\\r?$','im'))?.[1];
 if([301,302,303,307,308].includes(status)){const redirect=get('location');if(!redirect)throw Error('calendar_unreachable');return {body:'',redirect}}
 if(status!==200||get('content-encoding')&&!/^identity$/i.test(get('content-encoding')!))throw Error('calendar_unreachable');
 let body=raw.subarray(split+4);
 if(get('transfer-encoding')){
  if(!/^chunked$/i.test(get('transfer-encoding')!))throw Error('calendar_unreachable');
  const parts:Uint8Array[]=[];let offset=0,total=0;
  while(true){let end=offset;while(end+1<body.length&&!(body[end]===13&&body[end+1]===10))end++;const line=new TextDecoder().decode(body.subarray(offset,end));if(!/^[0-9a-f]+(?:;.*)?$/i.test(line))throw Error('invalid_calendar');const length=parseInt(line,16);offset=end+2;if(length===0)break;if(!Number.isSafeInteger(length)||offset+length+2>body.length||body[offset+length]!==13||body[offset+length+1]!==10)throw Error('invalid_calendar');total+=length;if(total>2097152)throw Error('calendar_too_large');parts.push(body.subarray(offset,offset+length));offset+=length+2}
  body=new Uint8Array(total);offset=0;for(const part of parts){body.set(part,offset);offset+=part.length}
 }else if(get('content-length')&&Number(get('content-length'))!==body.length)throw Error('invalid_calendar');
 if(body.length>2097152)throw Error('calendar_too_large');
 return {body:new TextDecoder().decode(body)};
}
export function parseCalendar(raw:string):CalendarPeriod[]{
 raw=raw.replace(/\r?\n[ \t]/g,'');
 if(!/^BEGIN:VCALENDAR\s*$/m.test(raw)||!/^END:VCALENDAR\s*$/m.test(raw))throw new Error('invalid_calendar');
 const chunks=raw.split('BEGIN:VEVENT').slice(1);
 return chunks.flatMap(chunk=>{
  if(!chunk.includes('END:VEVENT'))throw new Error('invalid_calendar_event');
  const event=chunk.split('END:VEVENT')[0];
  // Never re-import this site's own events echoed by an OTA.
  if(/^UID:.*@chalezinho-site\s*$/m.test(event)||/^STATUS:CANCELLED\s*$/m.test(event)||/^TRANSP:TRANSPARENT\s*$/m.test(event))return [];
  if(/^RRULE[;:]/m.test(event))throw new Error('unsupported_calendar_recurrence');
  const read=(key:string)=>{const m=event.match(new RegExp('^'+key+'(?:;[^:]*)?:(\\d{4})(\\d{2})(\\d{2})(?:T\\d{6}Z?)?\\s*$','m'));return m?m[1]+'-'+m[2]+'-'+m[3]:''};
  const start=read('DTSTART'),end=read('DTEND');
  if(!validCalendarDate(start)||!validCalendarDate(end)||end<=start)throw new Error('invalid_calendar_event');
  return [{start,end}];
 });
}
export async function fetchCalendar(url:string,provider:string){
 const safe=calendarUrl(url,provider);
 if(provider==='ical')return parseCalendar(await genericCalendarBody(safe));
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
  const sources=checked(await admin.from('property_calendar_sources').select('*').is('deleted_at',null)).filter((x:any)=>x.provider===provider||(provider==='booking'&&x.provider==='ical'));
  const listings=await Promise.all(properties.map(async(p:any)=>{
   const selected=sources.filter((x:any)=>x.property_id===p.id&&x.enabled);
   const results=await Promise.all(selected.map(async(s:any)=>{
   let periods:CalendarPeriod[]=[],error:string|null=null;
   try{if(!s.feed_url)throw new Error('calendar_not_configured');periods=await fetchCalendar(s.feed_url,s.provider)}catch(e){error=e instanceof Error&&['invalid_calendar','invalid_calendar_event','unsupported_calendar_recurrence','calendar_not_configured','invalid_calendar_url','calendar_too_large'].includes(e.message)?e.message:'calendar_unreachable'}
   const now=new Date().toISOString();
   await admin.from('property_calendar_sources').update({last_checked_at:now,last_error:error,...(!error?{last_success_at:now,event_count:periods.length}:{})}).eq('id',s.id).eq('updated_at',s.updated_at);
   return {ok:!error,error,periods:periods.map(period=>({...period,source:s.provider,calendar_label:s.label,calendar_id:s.id}))};
   }));const failure=results.find((r:any)=>r.error&&r.error!=='calendar_not_configured')||results.find((r:any)=>r.error);
   return {property_id:p.id,name:p.name,ok:!failure,error:failure?.error||null,periods:results.flatMap((r:any)=>r.periods)};
  }));return {configured:true,ok:listings.every((x:any)=>x.ok),listings};
 }
 async function configuration(){
  const sources=checked(await admin.from('property_calendar_sources').select('*').is('deleted_at',null).order('label'));
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
