// Called only after the engine's administrator and development checks.
export function contactInput(body:any){
 const name=String(body.name||'').trim(),notes=String(body.notes||'').trim();
 let phone=String(body.phone||'').trim().replace(/[()\s.-]/g,'');
 if(phone&&!phone.startsWith('+')&&/^\d{10,11}$/.test(phone))phone='+55'+phone;
 else if(phone&&!phone.startsWith('+')&&/^55\d{10,11}$/.test(phone))phone='+'+phone;
 if(name.length<2||name.length>160||notes.length>2000)throw Error('invalid_contact');
 if(phone&&!/^\+[1-9]\d{7,14}$/.test(phone))throw Error('invalid_phone');
 return {name,phone:phone||null,notes};
}
const uuid=(s:any)=>typeof s==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s);
function checked(r:any){if(r.error)throw Error('guest_directory_unavailable');return r.data}
export async function guestDirectory(db:any,body:any,actor:string,getExternal:()=>Promise<any[]>){
 const operation=body.operation||'list';
 if(operation==='list'){
  const readAll=async(table:string)=>{const rows:any[]=[];for(let offset=0;;offset+=500){const page=checked(await db.from(table).select('*').order(table==='guest_contacts'?'id':'stay_key').range(offset,offset+499));rows.push(...page);if(rows.length>10000)throw Error('guest_directory_volume_limit');if(page.length<500)return rows;}};
  const [contacts,links]=await Promise.all([readAll('guest_contacts'),readAll('guest_stay_links')]);
  contacts.sort((a,b)=>a.name.localeCompare(b.name));
  return {ok:true,contacts,links};
 }
 if(operation==='save'){
  const input=contactInput(body);if(!uuid(body.id))throw Error('invalid_contact');
  const current=checked(await db.from('guest_contacts').select('id').eq('id',body.id).maybeSingle());
  const fields={...input,updated_by:actor,updated_at:new Date().toISOString()};
  const contact=current?checked(await db.from('guest_contacts').update(fields).eq('id',body.id).select().single()):checked(await db.from('guest_contacts').insert({id:body.id,...fields,created_by:actor}).select().single());
  return {ok:true,contact};
 }
 if(operation==='link'){
  if(!uuid(body.guest_id))throw Error('invalid_contact');
  if(!checked(await db.from('guest_contacts').select('id').eq('id',body.guest_id).maybeSingle()))throw Error('contact_not_found');
  let stay:any;
  if(uuid(body.reservation_id)){
   const r=checked(await db.from('reservations').select('id,property_id,source,check_in,check_out').eq('id',body.reservation_id).maybeSingle());
   if(!r)throw Error('stay_not_found');stay={stay_key:'reservation:'+r.id,reservation_id:r.id,property_id:r.property_id,source:r.source,check_in:r.check_in,check_out:r.check_out};
  }else{
   const matches=(await getExternal()).filter(e=>e.id===body.stay_key&&e.status!=='integration_error');
   if(matches.length!==1)throw Error('stay_not_found');
   const e=matches[0];stay={stay_key:e.id,reservation_id:null,property_id:e.property_id,source:e.source,check_in:e.start,check_out:e.end};
  }
  const existing=checked(await db.from('guest_stay_links').select('guest_id').eq('stay_key',stay.stay_key).maybeSingle());
  if(existing){if(existing.guest_id!==body.guest_id)throw Error('stay_already_linked');return {ok:true};}
  const inserted=await db.from('guest_stay_links').insert({...stay,guest_id:body.guest_id,updated_by:actor,updated_at:new Date().toISOString()});
  if(inserted.error?.code==='23505')throw Error('stay_already_linked');checked(inserted);
  return {ok:true};
 }
 if(operation==='unlink'){
  if(typeof body.stay_key!=='string'||body.stay_key.length>250)throw Error('invalid_stay');
  if(!uuid(body.guest_id))throw Error('invalid_contact');
  checked(await db.from('guest_stay_links').delete().eq('stay_key',body.stay_key).eq('guest_id',body.guest_id));return {ok:true};
 }
 throw Error('invalid_operation');
}
