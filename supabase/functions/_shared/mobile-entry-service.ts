import {EXPERIMENT,UUID,EVENTS,phoneOS,homeEligible,assignment,safeDetails,saoDay,summarizeMobile} from './mobile-entry-model.ts';
async function checked(query:any){const r=await query;if(r.error)throw Error('measurement_unavailable');return r.data;}
async function all(db:any,table:string,query:(q:any)=>any){
 const rows:any[]=[];
 for(let offset=0;offset<=100000;offset+=1000){const part=await checked(query(db.from(table).select('*')).order(table==='mobile_entry_participants'?'assigned_at':'occurred_at').order(table==='mobile_entry_outcomes'?'participant_id':'id').range(offset,offset+999));if(offset===100000&&part.length)throw Error('measurement_volume_limit');rows.push(...part);if(part.length<1000)return rows;}
 return rows;
}
export async function mobileEntryService(db:any,req:Request,body:any,user:any=null){
 const operation=body.operation;
 const profile=user?await checked(db.from('profiles').select('role,pms_access_status').eq('id',user.id).maybeSingle()):null;
 const admin=profile?.role==='admin'&&profile?.pms_access_status==='active';
 if(['report','record_outcome'].includes(operation)&&!admin)throw Error('admin_required');
 const cfg=await checked(db.from('mobile_entry_experiments').select('*').eq('id',EXPERIMENT).single());
 if(operation==='report'){
  const participants=await all(db,'mobile_entry_participants',q=>q.eq('experiment_id',EXPERIMENT));
  const start=participants.length?participants.reduce((a,p)=>p.assigned_at<a?p.assigned_at:a,participants[0].assigned_at):new Date().toISOString();
  const [events,outcomes]=await Promise.all([all(db,'mobile_entry_events',q=>q.gte('occurred_at',start)),all(db,'mobile_entry_outcomes',q=>q.gte('occurred_at',start))]);
  const now=new Date(),yesterday=saoDay(new Date(now.getTime()-86400000)),ids=new Set(participants.filter(p=>!p.excluded).map(p=>p.id));
  const ownEvents=events.filter(e=>ids.has(e.participant_id)),ownOutcomes=outcomes.filter(e=>ids.has(e.participant_id));
  const dayEvents=ownEvents.filter(e=>saoDay(e.occurred_at)===yesterday),dayOutcomes=ownOutcomes.filter(e=>saoDay(e.occurred_at)===yesterday);
  const active=new Set([...dayEvents,...dayOutcomes].map(e=>e.participant_id));
  return {ok:true,experiment:cfg,checked_at:now.toISOString(),last_event_at:ownEvents.map(e=>e.occurred_at).sort().at(-1)||null,
   cumulative:summarizeMobile(participants,ownEvents,ownOutcomes,cfg.protocol,now),
   yesterday:{date:yesterday,denominator:'unique active assigned visitors on this day',...summarizeMobile(participants.filter(p=>active.has(p.id)),dayEvents,dayOutcomes,cfg.protocol,now)},
   excluded:participants.filter(p=>p.excluded).length};
 }
 if(operation==='record_outcome'){
  if(!/^MV-[A-F0-9]{12}$/.test(body.reference)||!['request_received','reservation_confirmed'].includes(body.kind))throw Error('invalid_outcome');
  const p=await checked(db.from('mobile_entry_participants').select('*').eq('reference',body.reference).single());
  if(p.excluded)throw Error('excluded_visitor');
  const prepared=await checked(db.from('mobile_entry_events').select('*').eq('participant_id',p.id).eq('event_name','consultation_prepared').order('occurred_at',{ascending:false}).limit(100));
  if(!prepared.length)throw Error('qualified_consultation_required');
  let reservationId=null;
  if(body.kind==='reservation_confirmed'){
   if(!UUID.test(body.reservation_id||''))throw Error('invalid_reservation');
   const r=await checked(db.from('reservations').select('id,status,source,created_at,property_id,check_in,check_out,guests').eq('id',body.reservation_id).single());
   const property=await checked(db.from('properties').select('code,name').eq('id',r.property_id).single());
   if(r.status!=='confirmed'||!['direct','manual'].includes(r.source)||Date.parse(r.created_at)<Date.parse(p.assigned_at)||/\bQA\b|\[DEV\]|teste/i.test(property.name)||!prepared.some(e=>e.property_code===property.code&&e.details.check_in===r.check_in&&e.details.check_out===r.check_out&&e.details.guests===r.guests))throw Error('reservation_not_attributable');
   reservationId=r.id;
  }
  await checked(db.from('mobile_entry_outcomes').upsert({participant_id:p.id,kind:body.kind,reservation_id:reservationId,actor_id:user.id},{onConflict:'participant_id,kind',ignoreDuplicates:true}));
  return {ok:true};
 }
 const internal=profile&&['admin','host','staff','service_provider'].includes(profile.role);
 if(internal){if(UUID.test(body.visitor_id||''))await checked(db.from('mobile_entry_participants').update({excluded:true}).eq('experiment_id',EXPERIMENT).eq('visitor_id',body.visitor_id));return {ok:true,excluded:true};}
 const os=phoneOS(req.headers.get('user-agent')||'');
 if(!os||!UUID.test(body.visitor_id||''))return {ok:true,eligible:false};
 if(operation==='enroll'){
  if(cfg.status==='running'&&body.routing_ready!==true)return {ok:true,eligible:false,client_not_ready:true};
  const active=await checked(db.from('mobile_entry_participants').select('*').eq('experiment_id',EXPERIMENT).eq('visitor_id',body.visitor_id).eq('phase','test').maybeSingle());
  if(active)return {ok:true,participant:active,experiment:{id:cfg.id,status:cfg.status}};
  if(cfg.status==='baseline'){
   const baseline=await checked(db.from('mobile_entry_participants').select('*').eq('experiment_id',EXPERIMENT).eq('visitor_id',body.visitor_id).eq('phase','baseline').maybeSingle());
   if(baseline)return {ok:true,participant:baseline,experiment:{id:cfg.id,status:cfg.status}};
  }
  if(!homeEligible(body.page||'',body.search||'',body.hash||'')||!Number.isFinite(body.width)||body.width>700||body.width<200||['paused','completed'].includes(cfg.status))return {ok:true,eligible:false};
  if(cfg.status==='running'&&Date.now()>=Date.parse(cfg.started_at)+Number(cfg.protocol.enrollment_days)*86400000)return {ok:true,eligible:false,enrollment_closed:true};
  const phase=cfg.status==='running'?'test':'baseline',a=await assignment(body.visitor_id,phase);
  const source=['direct','instagram','facebook','google','whatsapp','other'].includes(body.source)?body.source:'other';
  const campaign=typeof body.campaign==='string'&&/^[\w .-]{1,64}$/.test(body.campaign)?body.campaign:null;
  await checked(db.from('mobile_entry_participants').upsert({...a,experiment_id:EXPERIMENT,visitor_id:body.visitor_id,phase,os,source,campaign},{onConflict:'experiment_id,visitor_id,phase',ignoreDuplicates:true}));
  const p=await checked(db.from('mobile_entry_participants').select('*').eq('experiment_id',EXPERIMENT).eq('visitor_id',body.visitor_id).eq('phase',phase).single());
  return {ok:true,participant:p,experiment:{id:cfg.id,status:cfg.status}};
 }
 if(operation==='event'){
  if(!UUID.test(body.participant_id||'')||!UUID.test(body.event_id||'')||!EVENTS.has(body.event_name))throw Error('invalid_event');
  const p=await checked(db.from('mobile_entry_participants').select('*').eq('id',body.participant_id).eq('visitor_id',body.visitor_id).eq('experiment_id',EXPERIMENT).single());
  if(p.excluded)return {ok:true,excluded:true};
  const deadline=Date.parse(p.assigned_at)+(Number(cfg.protocol.attribution_days)||7)*86400000;
  if(p.phase==='test'&&Date.now()>deadline)return {ok:true,expired:true};
  if(p.phase==='baseline'&&cfg.status!=='baseline')return {ok:true,expired:true};
  const details=safeDetails(body.details);
  const propertyCode=typeof body.property_code==='string'&&/^CH\d{1,6}$/.test(body.property_code)?body.property_code:null;
  if(body.event_name==='consultation_prepared'&&(!propertyCode||!details.check_in||!details.check_out||!details.guests||details.check_out<=details.check_in))throw Error('qualified_consultation_required');
  await checked(db.from('mobile_entry_events').upsert({id:body.event_id,participant_id:p.id,event_name:body.event_name,property_code:propertyCode,details},{onConflict:'id',ignoreDuplicates:true}));
  return {ok:true};
 }
 throw Error('measurement_operation_not_allowed');
}
