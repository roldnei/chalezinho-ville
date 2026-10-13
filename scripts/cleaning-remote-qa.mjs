// DEV-only authenticated verification. Credentials arrive on hidden stdin, never
// files/arguments/logs. Later execution state is an explicitly simulated fixture.
import {readFile,writeFile} from 'node:fs/promises';
const raw=await readFile('app-config.js','utf8'),url=/supabaseUrl:"([^"]+)"/.exec(raw)[1],key=/supabaseKey:"([^"]+)"/.exec(raw)[1];if(!url.includes('pxfqmnhqodqyaaqeyjgr.'))throw Error('DEV required');
if(process.stdin.isTTY)process.stdin.setRawMode(true);
const inputs=[];let waiter,buffer='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>{buffer+=chunk;let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);if(waiter){const done=waiter;waiter=null;done(line);}else inputs.push(line);}});
const next=()=>inputs.length?Promise.resolve(inputs.shift()):new Promise(resolve=>waiter=resolve);
console.log('Ready for QA JSON on hidden stdin.');const credentials=JSON.parse(await next()),tokens=new Map(),ids=new Map(),evidence=[];
const check=(name,condition,detail={})=>{if(!condition)throw Error('QA failed: '+name);evidence.push({name,pass:true,...detail});};
for(const u of credentials.users){const r=await fetch(url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'content-type':'application/json'},body:JSON.stringify({email:u.email,password:credentials.password}),signal:AbortSignal.timeout(20000)}),b=await r.json();if(!r.ok||!b.access_token)throw Error('QA login failed: '+u.role);tokens.set(u.role,b.access_token);ids.set(u.role,b.user.id);}
async function api(role,action,data={},expected=200){const r=await fetch(url+'/functions/v1/cleaning-platform',{method:'POST',headers:{apikey:key,authorization:'Bearer '+tokens.get(role),'content-type':'application/json'},body:JSON.stringify({action,...data}),signal:AbortSignal.timeout(25000)}),body=await r.json();if(r.status!==expected)throw Error(action+' expected '+expected+' got '+r.status+' '+body.error);return body;}
const member=(role)=>({name:'QA Faxinas '+role+' — teste isolado',phone:'27999999999',owner:['owner','admin'].includes(role),worker:['worker','other'].includes(role),city:'Guarapari',bairros:['Setiba'],services:['standard'],availability:{days:[0,1,2,3,4,5,6],start:'00:00',end:'23:59'}});
for(const role of ['owner','worker','other','admin'])await api(role,'member',member(role));
check('owner signup defers identity and starts unapproved',(await api('owner','hub')).member.owner_released===false);
check('normal participant cannot configure',(await api('owner','config',{settings:{}},403)).error==='cleaning_admin_required');
check('dedicated administrator can open console',(await api('admin','hub')).admin===true);
const unknown=(await api('owner','property',{name:'QA Faxinas sem área — não é imóvel real',type:'chalet',city:'Guarapari',bairro:'Setiba',address:'Endereço fictício para validação, sem imóvel real',area:null,rooms:1,bathrooms:1,beds:[{double:1}]})).result;
check('unknown area is never invented',(await api('owner','quote',{property_id:unknown.id})).result.quote_required===true);
const prop=(await api('owner','property',{name:'QA Faxinas imóvel de teste — sem operação real',type:'chalet',city:'Guarapari',bairro:'Setiba',address:'Endereço fictício QA, sem instrução de acesso real',area:50,rooms:1,bathrooms:1,beds:[{double:1,single:1}]})).result;
const quote=(await api('owner','quote',{property_id:prop.id})).result;
check('remote category, mixed beds and independent fee',quote.base_cents===13000&&quote.beds_cents===500&&quote.owner_total_cents===14850&&quote.worker_net_cents===13500);
const starts_at=new Date(Date.now()+2*86400000).toISOString(),ends_at=new Date(Date.parse(starts_at)+4*3600000).toISOString();
const draft={property_id:prop.id,starts_at,ends_at,accepted_quote:quote,accept_terms:true,request_key:crypto.randomUUID()};
check('pilot release required',(await api('owner','request',draft,409)).error==='pilot_not_released');
for(const role of ['owner','worker','other'])await api('admin','release',{user_id:ids.get(role),owner_released:true,worker_released:true,worker_approved:true,blocked:false,owner_fee:null,worker_fee:null});
const job=(await api('owner','request',draft)).result;
check('request replay is idempotent',(await api('owner','request',draft)).result.id===job.id);
const accepts=await Promise.all(['worker','other'].map(async role=>{const r=await fetch(url+'/functions/v1/cleaning-platform',{method:'POST',headers:{apikey:key,authorization:'Bearer '+tokens.get(role),'content-type':'application/json'},body:JSON.stringify({action:'accept',job_id:job.id,expected_net_cents:quote.worker_net_cents}),signal:AbortSignal.timeout(25000)});return {role,status:r.status,body:await r.json()};}));
check('remote concurrent accept has one winner',accepts.filter(a=>a.status===200).length===1&&accepts.filter(a=>a.status===409).length===1);
const winner=accepts.find(a=>a.status===200).role,loser=winner==='worker'?'other':'worker';
check('worker sees no address before real payment',(await api(winner,'job',{job_id:job.id})).access===null);
check('other worker cannot see private service',(await api(loser,'job',{job_id:job.id},409)).error==='job_not_found');
check('Pix gate creates no pretend payment',(await api('owner','pix',{job_id:job.id,tax_id:'12345678909'},409)).error==='financial_dependency_unavailable');
const second=(await api('owner','request',{...draft,request_key:crypto.randomUUID()})).result;
check('remote agenda conflict prevented',(await api(winner,'accept',{job_id:second.id,expected_net_cents:quote.worker_net_cents},409)).error==='schedule_conflict');
console.log(JSON.stringify({phase:'authenticated API passed',job_id:job.id,worker_id:ids.get(winner),evidence_count:evidence.length,waiting_for:'isolated simulated execution state; no Pix'}));
await next();
const image=JSON.parse(await next());
check('simulated execution starts via authenticated endpoint',(await api(winner,'start',{job_id:job.id})).result.state==='in_progress');
check('missing evidence blocks completion',(await api(winner,'submit',{job_id:job.id},409)).error==='checklist_and_photos_required');
const detail=await api(winner,'job',{job_id:job.id});
for(let item=0;item<detail.job.snapshot.service.checklist.length;item++){
 await api(winner,'result',{job_id:job.id,item,result:true});const upload_id=crypto.randomUUID(),payload={job_id:job.id,item,upload_id,content_type:'image/jpeg',base64:image.base64};await api(winner,'upload',payload);await api(winner,'upload',payload);
}
await api(winner,'submit',{job_id:job.id});const photos=(await api('owner','job',{job_id:job.id})).photos;check('private photos saved with idempotent replay',photos.length===3&&photos.every(p=>p.url&&p.status==='ready'));
const photoResponse=await fetch(photos[0].url);check('authorized signed image actually available',photoResponse.ok);
await api('owner','approve',{job_id:job.id});check('approval authorizes, never claims paid',(await api('owner','job',{job_id:job.id})).job.payout==='authorized');
await api('owner','rate',{job_id:job.id,stars:5,comment:'QA validação simulada'});check('first rating remains unpublished to other side',(await api(winner,'job',{job_id:job.id})).ratings.length===0);
await api(winner,'rate',{job_id:job.id,stars:5,comment:'QA validação simulada'});check('bilateral ratings publish together',(await api('owner','job',{job_id:job.id})).ratings.length===2);
const incident=(await api('owner','incident',{job_id:job.id,description:'QA ocorrência simulada, sem dano real'})).result;await api(winner,'reply',{job_id:job.id,incident_id:incident.id,description:'QA resposta da profissional, sem fato real'});await api('admin','resolve',{job_id:job.id,incident_id:incident.id,description:'QA análise encerrada; registros de validação apenas',decision:'no_change'});
check('occurrence and right of response saved',(await api('owner','job',{job_id:job.id})).incidents[0].messages.length===1);
const h=await api('admin','hub');check('snapshot preserved after execution',h.jobs.find(j=>j.id===job.id).snapshot.owner_total_cents===14850);
await writeFile('docs/cleaning/remote-authenticated-tests.json',JSON.stringify({environment:'DEV',at:new Date().toISOString(),financial_operations:'NONE. Execution used an explicitly simulated QA state.',evidence},null,2));console.log(JSON.stringify({phase:'complete',passed:evidence.length,financial_operations:0}));
if(process.stdin.isTTY)process.stdin.setRawMode(false);process.stdin.destroy();
