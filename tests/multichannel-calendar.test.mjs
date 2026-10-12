import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseOperationalCalendar,operationSummary} from '../supabase/functions/_shared/operational-calendar.ts';
const ical=(lines)=>'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:qa-calendar\r\nDTSTART;VALUE=DATE:20261009\r\nDTEND;VALUE=DATE:20261012\r\n'+lines+'\r\nEND:VEVENT\r\nEND:VCALENDAR';
test('provider evidence, not occupancy, classifies Airbnb/Booking stays',()=>{
 for(const provider of ['airbnb','booking'])assert.equal(parseOperationalCalendar(ical('SUMMARY:Reserved'),provider)[0].kind,'stay');
 assert.equal(parseOperationalCalendar(ical('SUMMARY:Reserved'),'ical')[0].kind,'ambiguous');
 assert.equal(parseOperationalCalendar(ical('SUMMARY:Closed - Not Available'),'booking')[0].kind,'block');
 assert.equal(parseOperationalCalendar(ical('SUMMARY:Someone\r\nSTATUS:CONFIRMED'),'booking')[0].kind,'ambiguous');
});
test('timestamp, invalid dates, malformed and recurring feeds never invent stays',()=>{
 assert.equal(parseOperationalCalendar(ical('SUMMARY:Reserved').replace('20261009','20261009T150000Z'),'airbnb')[0].kind,'ambiguous');
 assert.equal(parseOperationalCalendar(ical('SUMMARY:Reserved').replace('20261009','20260230'),'airbnb')[0].start,null);
 assert.throws(()=>parseOperationalCalendar(ical('SUMMARY:Reserved').replace('END:VEVENT',''),'airbnb'));
 assert.throws(()=>parseOperationalCalendar(ical('SUMMARY:Reserved\r\nRRULE:FREQ=DAILY'),'airbnb'));
});
test('operational summary distinguishes projected dates, attendance, cancelled stays and overdue work',()=>{
 const stays=[{id:'a',status:'confirmed',check_in:'2026-10-09',check_out:'2026-10-12'}, {id:'b',status:'confirmed',check_in:'2026-10-12',check_out:'2026-10-14'}, {id:'c',status:'cancelled',check_in:'2026-10-12',check_out:'2026-10-14'}];
 const s=operationSummary(stays,[{status:'pending',due_at:'2026-10-12T15:00:00Z'},{status:'approved',due_at:'2026-10-12T15:00:00Z'}],'2026-10-12',new Date('2026-10-12T19:00:00Z'));
 assert.deepEqual(s.arrivals.map(x=>x.id),['b']);assert.deepEqual(s.departures.map(x=>x.id),['a']);assert.equal(s.present.length,0);assert.equal(s.expected.length,1);assert.equal(s.overdue.length,1);
});
test('explicit fixtures do not contribute to operational summaries',()=>{
 const stay={id:'fixture',is_test:true,status:'confirmed',check_in:'2026-10-12',check_out:'2026-11-01',checked_in_at:'2026-10-12T15:00:00Z'};
 const s=operationSummary([stay],[{stay_id:'fixture',status:'pending',due_at:'2026-10-12T15:00:00Z'}],'2026-10-12',new Date('2026-10-12T19:00:00Z'));
 for(const items of Object.values(s))assert.equal(items.length,0);
});
