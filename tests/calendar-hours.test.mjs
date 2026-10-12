import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync('admin.js','utf8');
const scope={state:{experience_orders:[]},esc:String,sourceLabel:String,date:String,stayButton:()=>'',byReservation:()=>[]};
vm.createContext(scope);vm.runInContext(source.slice(source.indexOf('function calendarInterval('),source.indexOf('function calendarAgendaItem(')),scope);
const p={id:1,name:'Chalé',check_in_time:'15:00:00',check_out_time:'11:00:00'},bounds={start:'2026-10-01',days:31};
test('one night spans arrival 15h to departure 11h, not whole date cells',()=>{
 const event={property_id:1,start:'2026-10-09',end:'2026-10-10',source:'airbnb'},t=scope.calendarInterval(event,p);
 assert.equal((t.end-t.start)/3600000,20);assert.equal(t.external,true);
 const html=scope.calendarRow(p,bounds,[],[event]),match=html.match(/left:([\d.]+)%;width:([\d.]+)%/);
 assert.ok(Math.abs(+match[1]-(8+15/24)/31*100)<1e-8);assert.ok(Math.abs(+match[2]-20/24/31*100)<1e-8);
 assert.match(html,/horários previstos/);
});
test('same-day turnover uses same lane while preserving four-hour gap',()=>{
 const html=scope.calendarRow(p,bounds,[{property_id:1,check_in:'2026-10-09',check_out:'2026-10-10'},{property_id:1,check_in:'2026-10-10',check_out:'2026-10-11'}],[]);
 assert.equal((html.match(/top:8px/g)||[]).length,2);assert.doesNotMatch(html,/top:52px/);
});
test('clipped period retains departure morning and respects custom property hours',()=>{
 const e={property_id:1,start:'2026-09-30',end:'2026-10-01',source:'booking'};
 const html=scope.calendarRow(p,bounds,[],[e]);assert.match(html,/left:0%/);assert.match(html,/11:00/);
 const t=scope.calendarInterval({start:'2026-10-09',end:'2026-10-10'},{check_in_time:'16:30',check_out_time:'10:15'});assert.equal((t.end-t.start)/3600000,17.75);
});
test('operational blocks remain whole days and actual overlaps use separate lanes',()=>{
 const event={property_id:1,start:'2026-10-09',end:'2026-10-10',source:'operational'};
 assert.equal((scope.calendarInterval(event,p).end-scope.calendarInterval(event,p).start)/3600000,24);
 const html=scope.calendarRow(p,bounds,[],[event,{...event,source:'airbnb'}]);assert.match(html,/top:52px/);
});
