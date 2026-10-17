import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import ts from 'typescript';
const code=ts.transpileModule(await readFile(new URL('../supabase/functions/_shared/calendars.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {parseCalendar,calendarUrl,calendarText,calendarService,publicCalendarIp,calendarHttpResponse,calendarPeriodKey,bookingStayOverlap,resolveCalendarPeriod}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const wrap=body=>'BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'+body+'END:VCALENDAR\r\n';
const event='BEGIN:VEVENT\r\nUID:external\r\nDTSTART;VALUE=DATE:20270310\r\nDTEND;VALUE=DATE:20270312\r\nEND:VEVENT\r\n';
test('valid empty calendar and exclusive checkout parse correctly',()=>{assert.deepEqual(parseCalendar(wrap('')),[]);assert.deepEqual(parseCalendar(wrap(event)),[{start:'2027-03-10',end:'2027-03-12'}]);});
test('Airbnb unavailability retains blocked dates but is distinguished from a reserved stay',()=>{
 const feed=summary=>wrap(event.replace('UID:external','UID:external\r\nSUMMARY:'+summary));
 assert.deepEqual(parseCalendar(feed('Airbnb (Not available)'),'airbnb'),[{start:'2027-03-10',end:'2027-03-12',event_kind:'block',event_uid:'external'}]);
 assert.equal(parseCalendar(feed('Reserved'),'airbnb')[0].event_kind,'stay');
 assert.equal(parseCalendar(feed('Unknown'),'airbnb')[0].event_kind,'ambiguous');
 assert.equal(parseCalendar(feed('CLOSED - Not available'),'booking')[0].event_kind,'block');
 assert.equal(parseCalendar(feed('Reserved'),'booking')[0].event_kind,'stay');
 assert.equal(parseCalendar(feed('Reserved'),'ical')[0].event_kind,'ambiguous');
});
test('Booking CLOSED periods need matching independently confirmed evidence to become stays',()=>{
 const period={property_id:1,calendar_id:'source',event_uid:'uid',source:'booking',start:'2026-10-18',end:'2026-10-20',event_kind:'block'};
 const reviewed={source_id:'source',uid:'uid',start_date:period.start,end_date:period.end,kind:'stay',stay_id:'real',classification_at:'2026-10-17T22:00:00Z'};
 const stay={id:'real',property_id:1,status:'confirmed',check_in:period.start,check_out:period.end,guest_name:'Verified guest'};
 assert.equal(resolveCalendarPeriod(period,[],[]).event_kind,'block');
 assert.equal(resolveCalendarPeriod(period,[reviewed],[stay]).event_kind,'stay');
 for(const wrong of [{...reviewed,source_id:'other'},{...reviewed,uid:'other'},{...reviewed,start_date:'2026-10-17'}])assert.equal(resolveCalendarPeriod(period,[wrong],[stay]).event_kind,'block');
 for(const wrong of [{...stay,status:'cancelled'},{...stay,is_test:true},{...stay,property_id:2},{...stay,check_out:'2026-10-21'}])assert.equal(resolveCalendarPeriod(period,[reviewed],[wrong]).event_kind,'ambiguous');
 assert.equal(resolveCalendarPeriod({...period,event_kind:undefined},[],[]).event_kind,'ambiguous');
});
test('invalid pages, missing dates, impossible dates and recurrence fail closed',()=>{for(const raw of ['<html>error</html>',wrap('BEGIN:VEVENT\r\nEND:VEVENT\r\n'),wrap(event.replace('20270310','20270230')),wrap(event.replace('UID:external','RRULE:FREQ=DAILY'))])assert.throws(()=>parseCalendar(raw),/calendar/);});
test('cancelled events and own exported events are not reimported',()=>{assert.deepEqual(parseCalendar(wrap(event.replace('UID:external','UID:reservation-123@chalezinho-site'))),[]);assert.deepEqual(parseCalendar(wrap(event.replace('UID:external','STATUS:CANCELLED'))),[]);});
test('private network, unexpected hosts, redirects targets and credentials cannot become import URLs',()=>{for(const url of ['http://ical.booking.com/v1/export','https://127.0.0.1/v1/export','https://ical.booking.com.evil.test/v1/export','https://user:pass@ical.booking.com/v1/export','https://ical.booking.com:444/v1/export','https://ical.booking.com/v1/export#x'])assert.throws(()=>calendarUrl(url,'booking'));assert.ok(calendarUrl('https://ical.booking.com/v1/export?t=test','booking'));assert.ok(calendarUrl('https://www.airbnb.com/calendar/ical/example.ics?s=test','airbnb'));});
test('export is valid iCalendar with stable UID, exclusive checkout and no personal fields',()=>{const row={uid:'reservation-123',start:'2027-03-10',end:'2027-03-12',updated:'2026-09-30T01:00:00Z',guest_name:'PRIVATE',email:'private@example.test',total_amount:900};const text=calendarText([row]);assert.match(text,/UID:reservation-123@chalezinho-site/);assert.match(text,/DTEND;VALUE=DATE:20270312/);assert.ok(text.endsWith('\r\n'));assert.ok(!text.includes('PRIVATE')&&!text.includes('private@')&&!text.includes('900'));assert.equal(text,calendarText([row]));});
test('wrong export token never queries reservation data',async()=>{const tables=[];const service=calendarService({from:t=>{tables.push(t);return {select(){return this},eq(){return this},maybeSingle:async()=>({data:null})}}},'https://example.test');assert.equal((await service.exportFeed('wrong')).status,404);assert.deepEqual(tables,[]);assert.equal((await service.exportFeed('a'.repeat(64))).status,404);assert.deepEqual(tables,['property_calendar_exports']);});
test('every exported connection keeps confirmed stays separate from manual blocks and temporary holds',async()=>{
 const dates={check_in:'2099-10-01',check_out:'2099-10-03',updated_at:'2026-10-17T22:00:00Z'};
 const tables={reservations:[{...dates,id:'confirmed',status:'confirmed',source:'direct'},{...dates,id:'hold',status:'hold',source:'direct',hold_expires_at:'2099-01-01T00:00:00Z'},{...dates,id:'payment',status:'pending_payment',source:'direct',hold_expires_at:'2099-01-01T00:00:00Z'},{...dates,id:'expired',status:'hold',source:'direct',hold_expires_at:'2000-01-01T00:00:00Z'}],ops_stays:[{...dates,id:'manual',channel:'direct'}],pms_calendar_blocks:[{id:'manual-block',start_date:dates.check_in,end_date:dates.check_out,updated_at:dates.updated_at}],post_booking_charges:[{id:'change',target_check_in:dates.check_in,target_check_out:dates.check_out,created_at:dates.updated_at}]};
 const db={from(table){let columns;const q={select(c){columns=c;return q},eq(){return q},in(){return q},gte(){return q},gt(){return q},is(){return q},not(){return q},maybeSingle:async()=>({data:{property_id:1,enabled:true}}),then(resolve){return Promise.resolve({data:columns==='reservation_id'?[]:tables[table]||[]}).then(resolve)}};return q}};
 const response=await calendarService(db,'https://site.invalid').exportFeed('a'.repeat(64)),text=await response.text();
 const chunks=text.split('BEGIN:VEVENT').slice(1);assert.equal(chunks.length,6);
 for(const chunk of chunks){const stay=/UID:(reservation-confirmed|operational-stay-manual)@/.test(chunk);assert.ok(chunk.includes('SUMMARY:'+(stay?'Reservado':'Blocked')));assert.ok(chunk.includes('X-CHALEZINHO-KIND:'+(stay?'STAY':'BLOCK')));}
 assert.doesNotMatch(text,/reservation-expired/);
});

test('generic feeds reject private networks and allow public addresses',()=>{
 for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','172.16.0.1','192.168.1.1','::1','::ffff:127.0.0.1','fc00::1','2001:db8::1'])assert.equal(publicCalendarIp(ip),false);
 for(const ip of ['8.8.8.8','2606:4700:4700::1111'])assert.equal(publicCalendarIp(ip),true);
 assert.ok(calendarUrl('https://calendar.vendor.com/export.ics'));
 for(const url of ['https://localhost/x','https://service.internal/x','https://127.0.0.1/x','http://calendar.vendor.com/x'])assert.throws(()=>calendarUrl(url));
});
test('transparent events do not block availability',()=>assert.deepEqual(parseCalendar(wrap(event.replace('UID:external','TRANSP:TRANSPARENT'))),[]));
test('HTTP calendar transfer handles chunked bodies, redirects and truncation',()=>{
 const encode=s=>new TextEncoder().encode(s);
 assert.equal(calendarHttpResponse(encode('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n3\r\nabc\r\n0\r\n\r\n')).body,'abc');
 assert.equal(calendarHttpResponse(encode('HTTP/1.1 302 Found\r\nLocation: /other\r\n\r\n')).redirect,'/other');
 assert.throws(()=>calendarHttpResponse(encode('HTTP/1.1 200 OK\r\nContent-Length: 4\r\n\r\nabc')));
 assert.throws(()=>calendarHttpResponse(encode('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n9\r\nabc')));
});
test('multiple sources combine dates and one failure keeps availability protected',async()=>{
 const original=globalThis.fetch;
 const sources=[{id:'a',property_id:1,provider:'booking',enabled:true,feed_url:'https://ical.booking.com/v1/export?t=a',label:'A'},{id:'b',property_id:1,provider:'booking',enabled:true,feed_url:'https://ical.booking.com/v1/export?t=b',label:'B'},{id:'c',property_id:1,provider:'booking',enabled:false}];
 const admin={from(table){const rows=table==='properties'?[{id:1,name:'Test'}]:sources;return {select(){return this},eq(){return this},is(){return this},order(){return this},range(){return this},update(){return this},then(resolve){return Promise.resolve({data:rows}).then(resolve)}}}};
 try{globalThis.fetch=async()=>new Response(wrap(event));let data=await calendarService(admin,'https://test.invalid').channels('booking');assert.equal(data.listings[0].periods.length,2);assert.equal(data.ok,true);
 globalThis.fetch=async url=>new Response(String(url).includes('t=b')?'invalid':wrap(event));data=await calendarService(admin,'https://test.invalid').channels('booking');assert.equal(data.ok,false);assert.equal(data.listings[0].periods.length,1);
 }finally{globalThis.fetch=original}
});

test('calendar keys distinguish sources and preserve legacy Airbnb links',()=>{
 const p={start:'2027-03-10',end:'2027-03-12'};
 assert.equal(calendarPeriodKey('airbnb',3,p),'airbnb:3:2027-03-10:2027-03-12');
 assert.notEqual(calendarPeriodKey('booking',1,{...p,calendar_id:'a'}),calendarPeriodKey('booking',1,{...p,calendar_id:'b'}));
});
test('configuration reads all sources beyond the API cap',async()=>{
 const rows=Array.from({length:1201},(_,i)=>({id:String(i),label:'Calendar '+i}));
 const db={from(t){return {select(){return this},is(){return this},order(){return this},range(a,b){return Promise.resolve({data:rows.slice(a,b+1)})},then(resolve){return Promise.resolve({data:[]}).then(resolve)}}}};
 assert.equal((await calendarService(db,'https://example.test').configuration()).sources.length,1201);
});

test('Booking 18-20 October allows adjacent stays and rejects occupied nights',()=>{
 const block={source:'booking',start:'2026-10-18',end:'2026-10-20'};
 assert.equal(bookingStayOverlap('2026-10-17','2026-10-18',block),false);
 assert.equal(bookingStayOverlap('2026-10-20','2026-10-21',block),false);
 for(const [start,end] of [['2026-10-18','2026-10-19'],['2026-10-19','2026-10-20'],['2026-10-17','2026-10-19'],['2026-10-19','2026-10-21']])assert.equal(bookingStayOverlap(start,end,block),true);
 assert.equal(bookingStayOverlap('2026-10-17','2026-10-18',block,{},1),true);
 assert.equal(bookingStayOverlap('2026-10-20','2026-10-21',block,{},1),true);
 assert.equal(bookingStayOverlap('2026-10-17','2026-10-18',block,{check_in_time:'10:00',check_out_time:'11:00'}),true);
 assert.equal(bookingStayOverlap('2026-10-17','2026-10-18',{...block,source:'ical'}),true);
});
