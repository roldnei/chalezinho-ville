import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import ts from 'typescript';
const code=ts.transpileModule(await readFile(new URL('../supabase/functions/_shared/calendars.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {parseCalendar,calendarUrl,calendarText,calendarService,publicCalendarIp,calendarHttpResponse}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const wrap=body=>'BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'+body+'END:VCALENDAR\r\n';
const event='BEGIN:VEVENT\r\nUID:external\r\nDTSTART;VALUE=DATE:20270310\r\nDTEND;VALUE=DATE:20270312\r\nEND:VEVENT\r\n';
test('valid empty calendar and exclusive checkout parse correctly',()=>{assert.deepEqual(parseCalendar(wrap('')),[]);assert.deepEqual(parseCalendar(wrap(event)),[{start:'2027-03-10',end:'2027-03-12'}]);});
test('invalid pages, missing dates, impossible dates and recurrence fail closed',()=>{for(const raw of ['<html>error</html>',wrap('BEGIN:VEVENT\r\nEND:VEVENT\r\n'),wrap(event.replace('20270310','20270230')),wrap(event.replace('UID:external','RRULE:FREQ=DAILY'))])assert.throws(()=>parseCalendar(raw),/calendar/);});
test('cancelled events and own exported events are not reimported',()=>{assert.deepEqual(parseCalendar(wrap(event.replace('UID:external','UID:reservation-123@chalezinho-site'))),[]);assert.deepEqual(parseCalendar(wrap(event.replace('UID:external','STATUS:CANCELLED'))),[]);});
test('private network, unexpected hosts, redirects targets and credentials cannot become import URLs',()=>{for(const url of ['http://ical.booking.com/v1/export','https://127.0.0.1/v1/export','https://ical.booking.com.evil.test/v1/export','https://user:pass@ical.booking.com/v1/export','https://ical.booking.com:444/v1/export','https://ical.booking.com/v1/export#x'])assert.throws(()=>calendarUrl(url,'booking'));assert.ok(calendarUrl('https://ical.booking.com/v1/export?t=test','booking'));assert.ok(calendarUrl('https://www.airbnb.com/calendar/ical/example.ics?s=test','airbnb'));});
test('export is valid iCalendar with stable UID, exclusive checkout and no personal fields',()=>{const row={uid:'reservation-123',start:'2027-03-10',end:'2027-03-12',updated:'2026-09-30T01:00:00Z',guest_name:'PRIVATE',email:'private@example.test',total_amount:900};const text=calendarText([row]);assert.match(text,/UID:reservation-123@chalezinho-site/);assert.match(text,/DTEND;VALUE=DATE:20270312/);assert.ok(text.endsWith('\r\n'));assert.ok(!text.includes('PRIVATE')&&!text.includes('private@')&&!text.includes('900'));assert.equal(text,calendarText([row]));});
test('wrong export token never queries reservation data',async()=>{const tables=[];const service=calendarService({from:t=>{tables.push(t);return {select(){return this},eq(){return this},maybeSingle:async()=>({data:null})}}},'https://example.test');assert.equal((await service.exportFeed('wrong')).status,404);assert.deepEqual(tables,[]);assert.equal((await service.exportFeed('a'.repeat(64))).status,404);assert.deepEqual(tables,['property_calendar_exports']);});

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
 const admin={from(table){const rows=table==='properties'?[{id:1,name:'Test'}]:sources;return {select(){return this},eq(){return this},is(){return this},update(){return this},then(resolve){return Promise.resolve({data:rows}).then(resolve)}}}};
 try{globalThis.fetch=async()=>new Response(wrap(event));let data=await calendarService(admin,'https://test.invalid').channels('booking');assert.equal(data.listings[0].periods.length,2);assert.equal(data.ok,true);
 globalThis.fetch=async url=>new Response(String(url).includes('t=b')?'invalid':wrap(event));data=await calendarService(admin,'https://test.invalid').channels('booking');assert.equal(data.ok,false);assert.equal(data.listings[0].periods.length,1);
 }finally{globalThis.fetch=original}
});
