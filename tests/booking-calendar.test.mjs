import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const full=await readFile(new URL('../supabase/functions/booking-engine/index.ts',import.meta.url),'utf8');
const source=full.slice(full.indexOf('const bookingFeeds='),full.indexOf('async function searchData('));
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
function fixture(fetch){return new Function('fetch','Deno','validDate',compiled+';return {readIcalFeed,bookingCalendarData};')(fetch,{env:{get:()=> 'https://calendar.example.test/private'}},s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&new Date(s).toISOString().slice(0,10)===s);}
const calendar=e=>'BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'+e+'END:VCALENDAR\r\n';
test('Booking valid empty feeds remain valid; occupied dates preserve exclusive checkout',async()=>{
 const f=fixture(async()=>new Response(calendar('BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20270310\r\nDTEND;VALUE=DATE:20270312\r\nEND:VEVENT\r\n')));
 assert.deepEqual(await f.readIcalFeed('fixture'),[{start:'2027-03-10',end:'2027-03-12'}]);
 assert.deepEqual(await fixture(async()=>new Response(calendar(''))).readIcalFeed('fixture'),[]);
});
test('Booking HTML, malformed event and HTTP failure are not treated as empty calendars',async()=>{
 for(const response of [new Response('<html>Error</html>'),new Response(calendar('BEGIN:VEVENT\r\nDTSTART:20270310\r\nEND:VEVENT\r\n')),new Response('Unavailable',{status:503})]){
  await assert.rejects(fixture(async()=>response).readIcalFeed('fixture'),/feed_/);
 }
});
test('Booking failure marks each configured listing unhealthy instead of available',async()=>{
 const r=await fixture(async()=>{throw new Error('network');}).bookingCalendarData();
 assert.equal(r.configured,true); assert.equal(r.ok,false);assert.equal(r.listings.length,3);assert.ok(r.listings.every(x=>x.ok===false));
});
