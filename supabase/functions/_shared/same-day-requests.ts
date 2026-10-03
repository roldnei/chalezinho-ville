import {brazilClock} from './availability.ts';
const uuid=(v:any)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
function checked(r:any){if(r.error)throw Error('request_service_unavailable');return r.data}
export function requestActive(r:any,now=new Date()){return ['pending','approved'].includes(r.status)&&r.check_in===brazilClock(now).date&&Date.parse(r.expires_at)>now.getTime()}
export async function sameDayRequests(db:any,body:any,user:any,manager:boolean,check:(r:any)=>Promise<any>,now=new Date()){
 if(!user)throw Error('authentication_required');
 const op=body.operation||'list';
 if(op==='list'){
  let q=db.from('same_day_requests').select('*').order('created_at',{ascending:false}).limit(200);if(!manager)q=q.eq('user_id',user.id);
  const rows=checked(await q);return {requests:rows.map((r:any)=>({...r,status:['pending','approved'].includes(r.status)&&!requestActive(r,now)?'expired':r.status}))};
 }
 if(op==='create'){
  const input={property_id:Number(body.property_id),check_in:String(body.check_in||''),check_out:String(body.check_out||''),guests:Number(body.guests),guest_name:String(body.guest_name||'').trim(),guest_phone:String(body.guest_phone||'').trim(),note:String(body.note||'').trim()};
  if(input.check_in!==brazilClock(now).date||!/^\d{4}-\d{2}-\d{2}$/.test(input.check_out)||!Number.isInteger(input.guests)||input.guests<1||input.guest_name.length<2||input.guest_name.length>160||!/^[+\d ()-]{8,30}$/.test(input.guest_phone)||input.note.length>1000)throw Error('invalid_request');
  const existing=checked(await db.from('same_day_requests').select('*').eq('user_id',user.id).eq('property_id',input.property_id).eq('check_in',input.check_in).eq('check_out',input.check_out).maybeSingle());if(existing)return {request:existing};
  const {count,error}=await db.from('same_day_requests').select('id',{count:'exact',head:true}).eq('user_id',user.id).eq('check_in',input.check_in);if(error)throw Error('request_service_unavailable');if(count>=5)throw Error('request_limit');
  const p=await check(input);if(!p?.available||!p.same_day_approval_required)throw Error('dates_unavailable');
  const expiry=new Date(input.check_in+'T23:59:59-03:00').toISOString();
  const result=await db.from('same_day_requests').insert({...input,user_id:user.id,expires_at:expiry}).select().single();
  if(result.error?.code==='23505')return {request:checked(await db.from('same_day_requests').select('*').eq('user_id',user.id).eq('property_id',input.property_id).eq('check_in',input.check_in).eq('check_out',input.check_out).single())};
  return {request:checked(result)};
 }
 if(!uuid(body.id))throw Error('invalid_request');
 const r=checked(await db.from('same_day_requests').select('*').eq('id',body.id).maybeSingle());if(!r||(!manager&&r.user_id!==user.id))throw Error('request_not_found');
 if(op==='get')return {request:{...r,status:['pending','approved'].includes(r.status)&&!requestActive(r,now)?'expired':r.status}};
 if(!manager||!['approve','reject'].includes(op))throw Error('admin_required');
 if(!requestActive(r,now))throw Error('request_expired');
 if(r.status!=='pending')throw Error('request_already_decided');
 if(op==='approve'){const p=await check(r);if(!p?.available)throw Error('dates_unavailable')}
 const decision_note=String(body.decision_note||'').trim().slice(0,1000),status=op==='approve'?'approved':'rejected';
 const expires_at=op==='approve'?new Date(Math.min(Date.parse(r.expires_at),now.getTime()+60*60000)).toISOString():r.expires_at;
 const result=checked(await db.from('same_day_requests').update({status,decision_note,expires_at,decided_by:user.id,decided_at:now.toISOString()}).eq('id',r.id).eq('status','pending').gt('expires_at',now.toISOString()).select().maybeSingle());
 if(!result)throw Error('request_already_decided');return {request:result};
}
export async function approvedSameDayRequest(db:any,id:any,userId:string,stay:any,now=new Date()){
 if(!uuid(id))throw Error('same_day_approval_required');
 const r=checked(await db.from('same_day_requests').select('*').eq('id',id).eq('user_id',userId).maybeSingle());
 if(!r||r.status!=='approved'||!requestActive(r,now)||Number(r.property_id)!==Number(stay.property_id)||r.check_in!==stay.check_in||r.check_out!==stay.check_out||Number(r.guests)!==Number(stay.guests))throw Error('same_day_approval_required');
 return r;
}
