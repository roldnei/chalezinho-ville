import {readFile,writeFile} from 'node:fs/promises';
const config=await readFile('app-config.js','utf8'),url=/supabaseUrl:"([^"]+)"/.exec(config)[1],key=/supabaseKey:"([^"]+)"/.exec(config)[1];
const evidence=[];
for(const [action,extra,expected] of [['bootstrap',{},200],['hub',{},401],['config',{settings:{pilot:false}},401],['provider_webhook',{reference_id:'unrelated'},404]]){
 const r=await fetch(url+'/functions/v1/cleaning-platform',{method:'POST',headers:{apikey:key,'content-type':'application/json'},body:JSON.stringify({action,...extra}),signal:AbortSignal.timeout(20000)}),body=await r.json();
 const pass=r.status===expected&&(action!=='bootstrap'||body.financial_ready===false&&body.settings.categories.length===8&&body.environment==='development');evidence.push({action,status:r.status,error:body.error,pass});if(!pass)throw Error('Remote API boundary failed: '+action+':'+r.status+':'+body.error);
}
await writeFile('docs/cleaning/remote-smoke.json',JSON.stringify({environment:'DEV only',at:new Date().toISOString(),evidence},null,2));console.log(JSON.stringify(evidence));
