import {canUseTask} from "./access.ts";
export const photoPoints = [
 {key:"glasses",label:"Taças e copos",hint:"Mostre bordas e interior, sem manchas ou lascas."},
 {key:"drain",label:"Ralo do banheiro",hint:"Mostre o ralo limpo, sem cabelos ou resíduos."},
 {key:"tub",label:"Banheira / spa",hint:"Mostre interior, ralo e jatos limpos."},
 {key:"bath_towels",label:"Toalhas de banho",hint:"Mostre quantidade, disposição e tecido sem manchas."},
 {key:"face_towels",label:"Toalhas de rosto",hint:"Mostre todas as toalhas de rosto preparadas."},
 {key:"bed",label:"Cama e travesseiros",hint:"Mostre toda a cama pronta, com enxoval limpo."},
 {key:"bathroom",label:"Vaso sanitário e pia",hint:"Mostre a limpeza final do vaso e da pia."}
];
export function validPhoto(bytes:Uint8Array,type:string){
 if(bytes.length<12||bytes.length>524288)return false;
 return type==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:
 type==='image/webp'&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
}
export async function taskPhotos(body:any,actor:any,admin:any,json:any){
 const {data:task}=await admin.from('pms_tasks').select('*').eq('id',String(body.task_id||'')).maybeSingle();
 if(!task||!canUseTask(actor,task))return json({ok:false,error:'task_not_found'},404);
 if(task.task_type!=='turnover')return json({ok:false,error:'not_cleaning_task'},400);
 if(body.operation==='list'){
  const {data,error}=await admin.from('pms_task_photos').select('*').eq('task_id',task.id);
  if(error)return json({ok:false,error:'photos_unavailable'},500);
  const photos=await Promise.all((data||[]).map(async(x:any)=>{const {data:s}=await admin.storage.from('cleaning-evidence').createSignedUrl(x.storage_path,900);const {storage_path,...safe}=x;return {...safe,signed_url:s?.signedUrl||null}}));
  return json({ok:true,points:photoPoints,photos});
 }
 if(body.operation!=='upload')return json({ok:false,error:'invalid_operation'},400);
 if(!['todo','in_progress','blocked'].includes(task.status))return json({ok:false,error:'task_photos_locked'},409);
 if(!photoPoints.some(p=>p.key===body.point_key))return json({ok:false,error:'invalid_photo_point'},400);
 const raw=String(body.base64||'');if(!raw||raw.length>699052)return json({ok:false,error:'photo_too_large'},413);
 let bytes:Uint8Array;try{bytes=Uint8Array.from(atob(raw),c=>c.charCodeAt(0))}catch{return json({ok:false,error:'invalid_photo'},400)}
 if(!validPhoto(bytes,body.content_type))return json({ok:false,error:'invalid_photo'},400);
 const path=`${task.id}/${body.point_key}/${crypto.randomUUID()}.${body.content_type==='image/webp'?'webp':'jpg'}`;
 const {data:old}=await admin.from('pms_task_photos').select('storage_path').eq('task_id',task.id).eq('point_key',body.point_key).maybeSingle();
 const {error:up}=await admin.storage.from('cleaning-evidence').upload(path,bytes,{contentType:body.content_type,upsert:false});
 if(up)return json({ok:false,error:'photo_upload_failed'},500);
 const {data,error}=await admin.from('pms_task_photos').upsert({task_id:task.id,point_key:body.point_key,storage_path:path,content_type:body.content_type,size_bytes:bytes.length,uploaded_by:actor.id,uploaded_name:actor.name,created_at:new Date().toISOString()},{onConflict:'task_id,point_key'}).select('id').single();
 if(error){await admin.storage.from('cleaning-evidence').remove([path]);return json({ok:false,error:error.message.includes('task_photos_locked')?'task_photos_locked':'photo_save_failed'},409)}
 await admin.from('pms_activity_events').insert({task_id:task.id,actor_user_id:actor.id,event_type:'cleaning_photo_saved',details:{point_key:body.point_key,photo_id:data.id,size_bytes:bytes.length}});
 if(old?.storage_path)await admin.storage.from('cleaning-evidence').remove([old.storage_path]);
 return json({ok:true,photo_id:data.id,size_bytes:bytes.length});
}
