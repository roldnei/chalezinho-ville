import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=(await readFile(new URL('../supabase/functions/notification-webhook/index.ts',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
function fixture({eventFailure=false}={}){
 let handler;
 const row={id:'outbox',delivery_status:'accepted',delivered_at:null},events=[];
 const db={from(table){
  let update,filters=[];
  const q={select:()=>q,eq:(k,v)=>{filters.push(r=>r[k]===v);return q},is:(k,v)=>{filters.push(r=>r[k]===v);return q},neq:(k,v)=>{filters.push(r=>r[k]!==v);return q},maybeSingle:async()=>({data:{id:row.id}}),update:v=>{update=v;return q},upsert:async v=>{events.push(v);return {error:eventFailure?{code:'temporary'}:null}},then(resolve){if(update&&filters.every(f=>f(row)))Object.assign(row,update);return Promise.resolve({error:null}).then(resolve)}};
  return q;
 }};
 new Function('Deno','createClient',compiled)({env:{get:k=>k==='BREVO_WEBHOOK_SECRET'?'test-secret':'fixture'},serve:f=>handler=f},()=>db);
 const send=(event,ts_event=1790720000)=>handler(new Request('https://example.test/webhook',{method:'POST',headers:{'x-brevo-webhook-secret':'test-secret','content-type':'application/json'},body:JSON.stringify({'message-id':'provider-message',event,ts_event})}));
 return {row,events,send};
}
test('delivery remains confirmed after late request, bounce and repeated open callbacks',async()=>{
 const f=fixture();assert.equal((await f.send('delivered')).status,200);const first=f.row.delivered_at;
 for(const event of ['request','hard_bounce','opened'])assert.equal((await f.send(event,1790720100)).status,200);
 assert.equal(f.row.delivery_status,'delivered');assert.equal(f.row.delivered_at,first);assert.equal(f.events.length,4);
});
test('a late request does not erase failure, while delivery evidence can resolve it',async()=>{
 const f=fixture();await f.send('hard_bounce');await f.send('request');assert.equal(f.row.delivery_status,'failed');
 await f.send('delivered');assert.equal(f.row.delivery_status,'delivered');
});
test('database failure is retryable rather than acknowledged as stored',async()=>{
 const f=fixture({eventFailure:true});assert.equal((await f.send('delivered')).status,503);assert.equal(f.row.delivery_status,'accepted');
});
test('invalid provider timestamp returns a controlled error',async()=>{
 const f=fixture();assert.equal((await f.send('delivered','invalid')).status,400);assert.equal(f.events.length,0);
});
