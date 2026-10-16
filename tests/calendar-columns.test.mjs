import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
const source=readFileSync('admin.js','utf8');
const scope={esc:x=>String(x).replaceAll('<','&lt;').replaceAll('"','&quot;'),sourceLabel:x=>x,date:String,stayButton:e=>`data-reservation="${e.id}"`};
vm.createContext(scope);
vm.runInContext(source.slice(source.indexOf('function calendarInterval('),source.indexOf('function calendarRow(')),scope);
const property={id:1,name:'Ville Signature',check_in_time:'15:00',check_out_time:'11:00'},bounds={start:'2026-10-16',days:7};
const event={id:'stay-a',property_id:1,source:'airbnb',guest_name:'Ana',start:'2026-10-16',end:'2026-10-18'};
const render=events=>new JSDOM(scope.calendarColumn(property,bounds,[],events)).window.document;
test('vertical stay preserves check-in/out hours and its original detail target',()=>{
 const button=render([event]).querySelector('button');
 assert.equal(button.dataset.reservation,'stay-a');
 assert.equal(button.querySelector('.calendar-column-range').textContent,'16/10 → 18/10');
 assert.equal(parseFloat(button.style.top),68*15/24);
 assert.ok(Math.abs(parseFloat(button.style.height)-68*(2-4/24))<1e-8);
 assert.match(button.getAttribute('aria-label'),/15:00.*11:00/);
});
test('overlapping stays occupy separate lanes; same-day turnover shares a lane',()=>{
 let buttons=render([event,{...event,id:'b'}]).querySelectorAll('button');
 assert.notEqual(buttons[0].style.left,buttons[1].style.left);
 buttons=render([event,{...event,id:'b',start:'2026-10-18',end:'2026-10-19'}]).querySelectorAll('button');
 assert.equal(buttons[0].style.left,buttons[1].style.left);
});
test('vertical calendar clips dates, omits other properties, and escapes guest labels',()=>{
 const doc=render([{...event,start:'2026-10-15',guest_name:'<img src=x>'},{...event,id:'other',property_id:2}]);
 assert.equal(doc.querySelectorAll('button').length,1);
 assert.equal(parseFloat(doc.querySelector('button').style.top),0);
 assert.equal(doc.querySelector('.calendar-column-range').textContent,'15/10 → 18/10');
 assert.equal(doc.querySelectorAll('img').length,0);
 assert.equal(doc.querySelector('strong').textContent,'<img src=x>');
});
