import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseOperationalCalendar,operationSummary} from '../supabase/functions/_shared/operational-calendar.ts';
import {parseCalendar,resolveCalendarPeriod,reconcileCalendarPeriods} from '../supabase/functions/_shared/calendars.ts';
const ical=(lines)=>'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:qa-calendar\r\nDTSTART;VALUE=DATE:20261009\r\nDTEND;VALUE=DATE:20261012\r\n'+lines+'\r\nEND:VEVENT\r\nEND:VCALENDAR';
test('confirmed Booking 18–20 October survives changed UID and a shortened CLOSED event',()=>{
 const stay={id:'booking-stay',property_id:1,channel:'booking',status:'confirmed',check_in:'2026-10-18',check_out:'2026-10-20'};
 const evidence={source_id:'booking-source',uid:'original-uid',stay_id:stay.id,kind:'stay',start_date:stay.check_in,end_date:stay.check_out,missing_count:8};
 const periods=[{id:'airbnb-today',property_id:1,source:'airbnb',calendar_id:'airbnb-source',start:'2026-10-18',end:'2026-10-19',event_kind:'block'},
  {id:'booking-shortened',property_id:1,source:'booking',calendar_id:'booking-source',calendar_label:'Booking — CH1',event_uid:'new-uid',start:'2026-10-19',end:'2026-10-20',event_kind:'block'}];
 const rows=reconcileCalendarPeriods(periods,[evidence],[stay]);
 const confirmed=rows.filter(e=>e.event_kind==='stay');assert.equal(confirmed.length,1);
 assert.equal(confirmed[0].operational_stay_id,stay.id);assert.equal(confirmed[0].start,stay.check_in);assert.equal(confirmed[0].end,stay.check_out);assert.equal(confirmed[0].source,'booking');assert.equal(confirmed[0].status,'confirmed');
 assert.equal(rows.filter(e=>e.event_kind==='block').length,2);assert.deepEqual(periods.map(e=>e.event_kind),['block','block']);
 assert.equal(reconcileCalendarPeriods([], [evidence],[stay])[0].operational_stay_id,stay.id);
});
test('reconciliation deduplicates linked live events, excludes fixtures, cancelled and site reservations, and supports every channel',()=>{
 for(const channel of ['airbnb','booking','ical','direct','other']){
  const stay={id:'s',property_id:1,channel,status:'confirmed',check_in:'2026-10-18',check_out:'2026-10-20'};
  const period={id:'calendar:source:2026-10-18:2026-10-20',calendar_id:'source',event_uid:'uid',property_id:1,source:channel,start:stay.check_in,end:stay.check_out,event_kind:'block'};
  const event={source_id:'source',uid:'uid',stay_id:stay.id,kind:'stay',start_date:stay.check_in,end_date:stay.check_out};
  const rows=reconcileCalendarPeriods([period],[event],[stay,{...stay,id:'test',is_test:true},{...stay,id:'cancelled',status:'cancelled'},{...stay,id:'site',reservation_id:'reservation'}]);
  assert.equal(rows.length,1);assert.equal(rows[0].operational_stay_id,'s');
  assert.equal(rows[0].id,period.id);
 }
 assert.equal(reconcileCalendarPeriods([{event_kind:'block'}],[],[])[0].event_kind,'block');
});
test('provider evidence, not occupancy, classifies Airbnb/Booking stays',()=>{
 for(const provider of ['airbnb','booking'])assert.equal(parseOperationalCalendar(ical('SUMMARY:Reserved'),provider)[0].kind,'stay');
 assert.equal(parseOperationalCalendar(ical('SUMMARY:Reserved'),'ical')[0].kind,'ambiguous');
 assert.equal(parseOperationalCalendar(ical('SUMMARY:Closed - Not Available'),'booking')[0].kind,'block');
 assert.equal(parseOperationalCalendar(ical('SUMMARY:Someone\r\nSTATUS:CONFIRMED'),'booking')[0].kind,'ambiguous');
});
test('all current and future connection types share the same block and review rules',()=>{
 for(const provider of ['airbnb','booking','ical','future-provider']){
  for(const summary of ['Blocked','CLOSED - Not available','Airbnb (Not available)']){
   const feed=ical('SUMMARY:'+summary+'\r\nSTATUS:CONFIRMED');
   assert.equal(parseCalendar(feed,provider)[0].event_kind,'block');assert.equal(parseOperationalCalendar(feed,provider)[0].kind,'block');
  }
  const unknown=ical('SUMMARY:Calendar event\r\nSTATUS:CONFIRMED');assert.equal(parseCalendar(unknown,provider)[0].event_kind,'ambiguous');assert.equal(parseOperationalCalendar(unknown,provider)[0].kind,'ambiguous');
  const period={source:provider,calendar_id:'source',event_uid:'uid',property_id:1,start:'2099-10-01',end:'2099-10-03',event_kind:'block'};
  const evidence={source_id:'source',uid:'uid',start_date:period.start,end_date:period.end,kind:'stay',stay_id:'confirmed',classification_at:'2026-10-17T22:00:00Z'};
  assert.equal(resolveCalendarPeriod(period,[evidence],[{id:'confirmed',status:'confirmed',property_id:1,check_in:period.start,check_out:period.end}]).event_kind,'stay');
 }
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

test('configured departure time and dated report prevent false presence; unknown departure needs review',()=>{
 const base={status:'confirmed',property_id:1,check_in:'2026-10-11',check_out:'2026-10-12',checked_in_at:'2026-10-11T18:00:00Z'};
 const stays=[{...base,id:'unknown'},{...base,id:'reported',departure_reported_on:'2026-10-12'}];
 const early=operationSummary(stays,[],'2026-10-12',new Date('2026-10-12T13:00:00Z'),[{id:1,check_out_time:'11:00:00'}]);
 assert.deepEqual(early.present.map(s=>s.id),['unknown']);
 const late=operationSummary(stays,[],'2026-10-12',new Date('2026-10-12T14:00:00Z'),[{id:1,check_out_time:'11:00:00'}]);
 assert.equal(late.present.length,1);assert.equal(late.expected.length,0);assert.equal(late.upcoming.length,0);
 assert.deepEqual(late.attendance_review.map(s=>s.id),['unknown']);
});


test('today forecasts exclude recorded arrivals and departures while attendance reports actual stays',()=>{
 const now=new Date('2026-10-15T19:00:00Z'),base={status:'confirmed',check_in:'2026-10-15',check_out:'2026-10-16'};
 const marcelly={...base,id:'marcelly',checked_in_at:'2026-10-15T18:54:00Z'};
 const future={...base,id:'future',check_in:'2026-10-16',check_out:'2026-10-18'};
 const stale={...base,id:'old',check_in:'2026-10-09',check_out:'2026-10-13',checked_in_at:'2026-10-09T18:00:00Z'};
 let result=operationSummary([marcelly,future,stale],[],'2026-10-15',now);
 assert.equal(result.arrivals.length,0);assert.deepEqual(result.present.map(s=>s.id),['marcelly']);assert.equal(result.departures.length,0);assert.deepEqual(result.attendance_review.map(s=>s.id),['old']);
 result=operationSummary([{...marcelly,checked_in_at:null}],[],'2026-10-15',now);assert.equal(result.arrivals.length,1);assert.equal(result.present.length,0);
 const departure={...marcelly,check_out:'2026-10-15'};
 result=operationSummary([departure],[],'2026-10-15',now);assert.equal(result.departures.length,1);assert.equal(result.present.length,1);
 for(const closed of [{checked_out_at:'2026-10-15T19:00:00Z'},{departure_reported_on:'2026-10-15'}]){result=operationSummary([{...departure,...closed}],[],'2026-10-15',now);assert.equal(result.arrivals.length,0);assert.equal(result.present.length,0);assert.equal(result.departures.length,0);}
});
test('daily cleaning agenda uses scheduled date and completion uses submitted date, never approval date',()=>{
 const task={stage:'preparation',status:'pending',scheduled_for:'2026-10-16T01:00:00Z',due_at:'2026-10-16T02:00:00Z'};
 const tasks=[{...task,id:'standalone'},{...task,id:'started',status:'in_progress'},{...task,id:'blocked',status:'blocked'},...['inspection','approved','cancelled','superseded'].map(status=>({...task,id:status,status,submitted_at:'2026-10-15T18:00:00Z'})),{...task,id:'future',scheduled_for:'2026-10-16T03:00:00Z',due_at:'2026-10-16T04:00:00Z'},{...task,id:'fixture',is_test:true},{...task,id:'departure',stage:'departure'},{...task,id:'due-today',scheduled_for:'2026-10-14T18:00:00Z',due_at:'2026-10-15T17:30:00Z'}];
 const s=operationSummary([],tasks,'2026-10-15',new Date('2026-10-15T19:00:00Z'));
 assert.deepEqual(s.cleanings.map(t=>t.id),['standalone','started','blocked']);assert.deepEqual(s.cleaning_completed.map(t=>t.id),['inspection','approved']);assert.ok(!s.cleanings.some(t=>t.id==='due-today'));assert.ok(s.today_tasks.some(t=>t.id==='inspection'));assert.ok(!s.today_tasks.some(t=>t.id==='future'||t.id==='fixture'));
});

test('approval on another day does not move the cleaning execution date',()=>{
 const base={stage:'preparation',status:'approved',scheduled_for:'2026-10-14T18:00:00Z',submitted_at:'2026-10-14T19:00:00Z',completed_at:'2026-10-15T19:00:00Z'};
 const s=operationSummary([],[base,{...base,id:'completed-today',status:'inspection',submitted_at:'2026-10-15T19:00:00Z'}],'2026-10-15',new Date('2026-10-15T20:00:00Z'));
 assert.equal(s.cleanings.length,0);assert.deepEqual(s.cleaning_completed.map(t=>t.id),['completed-today']);
});

test('early cleaning is completed on its execution day and never forecast again on its scheduled day',()=>{
 const task={id:'redley-preparation',property_id:3,stage:'preparation',status:'approved',scheduled_for:'2026-10-22T18:00:00Z',submitted_at:'2026-10-22T00:21:10.261667Z',completed_at:'2026-10-22T00:23:28.352783Z'};
 const yesterday=operationSummary([],[task],'2026-10-21',new Date('2026-10-22T01:00:00Z'));
 assert.deepEqual(yesterday.cleaning_completed.map(t=>t.id),[task.id]);assert.equal(yesterday.cleanings.length,0);
 for(const date of ['2026-10-22','2026-10-23','2026-10-24','2026-10-25','2026-10-26','2026-10-27','2026-10-28']){
  const summary=operationSummary([],[task],date,new Date(date+'T16:00:00Z'));
  assert.equal(summary.cleanings.length,0);assert.equal(summary.cleaning_completed.length,0);assert.equal(summary.pending.length,0);
 }
});

test('sent for approval is finished work, while reopened cleaning becomes forecast again',()=>{
 const task={id:'awaiting-review',stage:'preparation',status:'inspection',scheduled_for:'2026-10-22T18:00:00Z',submitted_at:'2026-10-22T16:00:00Z'};
 let summary=operationSummary([],[task],'2026-10-22',new Date('2026-10-22T17:00:00Z'));
 assert.equal(summary.cleanings.length,0);assert.equal(summary.cleaning_completed.length,1);assert.equal(summary.pending.length,1);
 summary=operationSummary([],[{...task,status:'pending'}],'2026-10-22',new Date('2026-10-22T17:00:00Z'));
 assert.equal(summary.cleanings.length,1);assert.equal(summary.cleaning_completed.length,0);
});
