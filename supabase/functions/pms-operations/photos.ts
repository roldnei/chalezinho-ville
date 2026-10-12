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
 return json({ok:false,error:'legacy_evidence_read_only'},409);
}
