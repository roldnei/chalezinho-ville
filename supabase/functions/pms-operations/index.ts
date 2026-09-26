import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const url=Deno.env.get("SUPABASE_URL")||"";
const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
const headers={"access-control-allow-origin":"*","access-control-allow-headers":"authorization,content-type,x-client-info","access-control-allow-methods":"POST,OPTIONS","cache-control":"no-store"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...headers,"content-type":"application/json"}});
const clip=(v:unknown,n:number)=>String(v||"").trim().slice(0,n);

async function operator(request:Request){
  const token=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(!token)return null;
  const {data:{user},error}=await admin.auth.getUser(token);
  if(error||!user)return null;
  const {data:profile}=await admin.from("profiles").select("role,full_name").eq("id",user.id).maybeSingle();
  if(!profile||!["admin","host","staff"].includes(profile.role))return null;
  return {id:user.id,role:profile.role,name:profile.full_name||user.email||"Equipe"};
}

async function syncTurnovers(actorId:string){
  const start=new Date(Date.now()-2*86400000).toISOString().slice(0,10),end=new Date(Date.now()+45*86400000).toISOString().slice(0,10);
  const {data:reservations}=await admin.from("reservations").select("id,property_id,check_in,check_out,guest_name,status,properties(name,check_out_time)").eq("status","confirmed").gte("check_out",start).lte("check_out",end);
  for(const r of reservations||[]){
    const property=Array.isArray(r.properties)?r.properties[0]:r.properties;
    const scheduled=`${r.check_out}T${String(property?.check_out_time||"11:00").slice(0,5)}:00-03:00`;
    const due=`${r.check_out}T14:30:00-03:00`;
    const {data:existing}=await admin.from("pms_tasks").select("id").eq("reservation_id",r.id).eq("task_type","turnover").maybeSingle();
    if(existing)continue;
    const {data:task}=await admin.from("pms_tasks").insert({property_id:r.property_id,reservation_id:r.id,task_type:"turnover",title:`Preparar ${property?.name||"imóvel"}`,description:`Saída de ${r.guest_name||"hóspede"}. Limpeza e vistoria antes da próxima entrada.`,scheduled_for:scheduled,due_at:due,created_by:actorId}).select("id").single();
    if(task?.id){
      const {data:templates}=await admin.from("pms_checklist_templates").select("id,property_id,pms_checklist_template_items(label,display_order)").eq("task_type","turnover").eq("active",true).or(`property_id.eq.${r.property_id},property_id.is.null`).order("property_id",{ascending:false});
      const template=(templates||[]).find((x:any)=>Number(x.property_id)===Number(r.property_id))||(templates||[]).find((x:any)=>x.property_id===null);
      const labels=template?.pms_checklist_template_items?.sort((a:any,b:any)=>a.display_order-b.display_order).map((x:any)=>x.label)||[
        "Recolher lixo e itens esquecidos","Trocar enxoval e toalhas","Higienizar banheiro e hidro/spa","Limpar cozinha e conferir utensílios","Repor amenities e itens de boas-vindas","Conferir área externa","Fotografar vistoria final"
      ];
      await admin.from("pms_task_checklist_items").insert(labels.map((label:string,index:number)=>({task_id:task.id,label,display_order:index})));
    }
  }
}

async function hub(actor:{id:string}){
  await syncTurnovers(actor.id);
  const start=new Date(Date.now()-7*86400000).toISOString(),end=new Date(Date.now()+60*86400000).toISOString();
  const [properties,tasks,issues,reservations,team,templates,attachments]=await Promise.all([
    admin.from("properties").select("id,code,name,cover_image,active,check_in_time,check_out_time").eq("active",true).order("id"),
    admin.from("pms_tasks").select("*,pms_task_checklist_items(*)").gte("scheduled_for",start).lte("scheduled_for",end).order("scheduled_for"),
    admin.from("pms_issues").select("*").not("status","in",'(resolved,cancelled)').order("created_at",{ascending:false}),
    admin.from("reservations").select("id,property_id,confirmation_code,guest_name,guest_phone,guests,check_in,check_out,status,operational_status,experience_orders(status,experience_order_items(product_name_snapshot,quantity,status))").eq("status","confirmed").gte("check_out",new Date(Date.now()-2*86400000).toISOString().slice(0,10)).lte("check_in",new Date(Date.now()+60*86400000).toISOString().slice(0,10)).order("check_in"),
    admin.from("profiles").select("id,full_name,role").in("role",["admin","host","staff"]).order("full_name"),
    admin.from("pms_checklist_templates").select("*,pms_checklist_template_items(*)").order("name"),
    admin.from("pms_issue_attachments").select("*").order("created_at",{ascending:false})
  ]);
  if(properties.error||tasks.error||issues.error||reservations.error||team.error||templates.error||attachments.error)return json({ok:false,error:"pms_unavailable"},500);
  const evidence=await Promise.all((attachments.data||[]).map(async (x:any)=>{const {data}=await admin.storage.from("pms-evidence").createSignedUrl(x.storage_path,900);return {...x,signed_url:data?.signedUrl||null}}));
  return json({ok:true,server_now:new Date().toISOString(),properties:properties.data||[],tasks:tasks.data||[],issues:issues.data||[],reservations:reservations.data||[],team:team.data||[],templates:templates.data||[],attachments:evidence,operator:actor});
}

async function taskAction(body:any,actor:{id:string}){
  const op=clip(body.operation,30);
  if(op==="create"){
    const assignedUser=clip(body.assigned_user_id,80)||null;
    const payload={property_id:Number(body.property_id),reservation_id:body.reservation_id||null,task_type:["turnover","inspection","maintenance","setup","guest_request"].includes(body.task_type)?body.task_type:"setup",title:clip(body.title,180),description:clip(body.description,2000)||null,status:"todo",priority:["low","normal","high","urgent"].includes(body.priority)?body.priority:"normal",scheduled_for:new Date(body.scheduled_for).toISOString(),due_at:body.due_at?new Date(body.due_at).toISOString():null,assigned_user_id:assignedUser,assigned_name:clip(body.assigned_name,160)||null,created_by:actor.id};
    if(!payload.property_id||!payload.title)return json({ok:false,error:"invalid_task"},400);
    const {data,error}=await admin.from("pms_tasks").insert(payload).select().single();
    if(error)return json({ok:false,error:"task_create_failed"},500);
    await admin.from("pms_activity_events").insert({task_id:data.id,actor_user_id:actor.id,event_type:"created"});
    return json({ok:true,task:data});
  }
  const id=clip(body.task_id,80);const {data:task}=await admin.from("pms_tasks").select("*").eq("id",id).maybeSingle();
  if(!task)return json({ok:false,error:"task_not_found"},404);
  if(op==="set_status"){
    const status=clip(body.status,30);if(!["todo","in_progress","inspection","ready","blocked","cancelled"].includes(status))return json({ok:false,error:"invalid_status"},400);
    const update:any={status,updated_at:new Date().toISOString()};if(status==="ready")update.completed_at=new Date().toISOString();
    const {data,error}=await admin.from("pms_tasks").update(update).eq("id",id).select().single();
    if(error)return json({ok:false,error:"task_update_failed"},500);
    await admin.from("pms_activity_events").insert({task_id:id,actor_user_id:actor.id,event_type:"status_changed",details:{from:task.status,to:status}});
    return json({ok:true,task:data});
  }
  if(op==="toggle_item"){
    const itemId=clip(body.item_id,80),completed=body.completed===true;
    const {data:item}=await admin.from("pms_task_checklist_items").select("id,task_id").eq("id",itemId).eq("task_id",id).maybeSingle();if(!item)return json({ok:false,error:"item_not_found"},404);
    await admin.from("pms_task_checklist_items").update({completed,completed_at:completed?new Date().toISOString():null,completed_by:completed?actor.id:null}).eq("id",itemId);
    await admin.from("pms_activity_events").insert({task_id:id,actor_user_id:actor.id,event_type:completed?"check_completed":"check_reopened",details:{item_id:itemId}});
    return json({ok:true});
  }
  return json({ok:false,error:"invalid_operation"},400);
}

async function issueAction(body:any,actor:{id:string}){
  const op=clip(body.operation,30);
  if(op==="create"){
    const payload={property_id:Number(body.property_id),reservation_id:body.reservation_id||null,title:clip(body.title,180),description:clip(body.description,2000)||null,area:clip(body.area,100)||null,severity:["low","normal","high","critical"].includes(body.severity)?body.severity:"normal",status:"open",assigned_user_id:clip(body.assigned_user_id,80)||null,assigned_name:clip(body.assigned_name,160)||null,due_at:body.due_at?new Date(body.due_at).toISOString():null,created_by:actor.id};
    if(!payload.property_id||!payload.title)return json({ok:false,error:"invalid_issue"},400);
    const {data,error}=await admin.from("pms_issues").insert(payload).select().single();if(error)return json({ok:false,error:"issue_create_failed"},500);
    await admin.from("pms_activity_events").insert({issue_id:data.id,actor_user_id:actor.id,event_type:"created"});return json({ok:true,issue:data});
  }
  const id=clip(body.issue_id,80),status=clip(body.status,30);if(!["open","scheduled","in_progress","resolved","cancelled"].includes(status))return json({ok:false,error:"invalid_status"},400);
  const {data:before}=await admin.from("pms_issues").select("status").eq("id",id).maybeSingle();if(!before)return json({ok:false,error:"issue_not_found"},404);
  const {data,error}=await admin.from("pms_issues").update({status,resolved_at:status==="resolved"?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq("id",id).select().single();if(error)return json({ok:false,error:"issue_update_failed"},500);
  await admin.from("pms_activity_events").insert({issue_id:id,actor_user_id:actor.id,event_type:"status_changed",details:{from:before.status,to:status}});return json({ok:true,issue:data});
}

async function templateAction(body:any,actor:{id:string,role?:string}){
  if(actor.role!=="admin"&&actor.role!=="host")return json({ok:false,error:"manager_required"},403);
  const op=clip(body.operation,30);
  if(op==="save"){
    const taskType=clip(body.task_type,30),name=clip(body.name,120),propertyId=body.property_id?Number(body.property_id):null;
    const items=Array.isArray(body.items)?body.items.map((x:any)=>clip(x,180)).filter(Boolean).slice(0,50):[];
    if(!["turnover","inspection","maintenance","setup","guest_request"].includes(taskType)||!name||!items.length)return json({ok:false,error:"invalid_template"},400);
    const id=clip(body.template_id,80);
    let template:any;
    if(id){
      const {data,error}=await admin.from("pms_checklist_templates").update({name,property_id:propertyId,task_type:taskType,active:body.active!==false,updated_at:new Date().toISOString()}).eq("id",id).select().single();
      if(error)return json({ok:false,error:"template_update_failed"},500);template=data;
      await admin.from("pms_checklist_template_items").delete().eq("template_id",id);
    }else{
      const {data,error}=await admin.from("pms_checklist_templates").insert({name,property_id:propertyId,task_type:taskType,active:true,created_by:actor.id}).select().single();
      if(error)return json({ok:false,error:"template_create_failed"},500);template=data;
    }
    const {error:itemError}=await admin.from("pms_checklist_template_items").insert(items.map((label:string,index:number)=>({template_id:template.id,label,display_order:index})));
    if(itemError)return json({ok:false,error:"template_items_failed"},500);
    return json({ok:true,template});
  }
  if(op==="set_active"){
    const id=clip(body.template_id,80);const {data,error}=await admin.from("pms_checklist_templates").update({active:body.active===true,updated_at:new Date().toISOString()}).eq("id",id).select().single();
    if(error)return json({ok:false,error:"template_update_failed"},500);return json({ok:true,template:data});
  }
  return json({ok:false,error:"invalid_operation"},400);
}

async function teamAction(body:any,actor:{id:string,role?:string}){
  if(actor.role!=="admin")return json({ok:false,error:"admin_required"},403);
  if(clip(body.operation,30)!=="set_role")return json({ok:false,error:"invalid_operation"},400);
  const userId=clip(body.user_id,80),role=clip(body.role,30);
  if(!userId||!["admin","host","staff","guest"].includes(role))return json({ok:false,error:"invalid_role"},400);
  if(userId===actor.id&&role!=="admin")return json({ok:false,error:"cannot_demote_self"},409);
  const {data,error}=await admin.from("profiles").update({role,updated_at:new Date().toISOString()}).eq("id",userId).select("id,full_name,role").single();
  if(error)return json({ok:false,error:"team_update_failed"},500);
  await admin.from("audit_events").insert({actor_user_id:actor.id,action:"pms_team_role_changed",entity_type:"profile",entity_id:userId,new_value:{role}});
  return json({ok:true,member:data});
}

async function attachmentAction(body:any,actor:{id:string}){
  const issueId=clip(body.issue_id,80),fileName=clip(body.file_name,180),contentType=clip(body.content_type,80);
  if(!issueId||!fileName||!["image/jpeg","image/png","image/webp"].includes(contentType))return json({ok:false,error:"invalid_attachment"},400);
  const {data:issue}=await admin.from("pms_issues").select("id").eq("id",issueId).maybeSingle();if(!issue)return json({ok:false,error:"issue_not_found"},404);
  const raw=String(body.base64||"").replace(/^data:[^;]+;base64,/,"");
  if(!raw||raw.length>7_000_000)return json({ok:false,error:"attachment_too_large"},413);
  let bytes:Uint8Array;try{bytes=Uint8Array.from(atob(raw),c=>c.charCodeAt(0))}catch{return json({ok:false,error:"invalid_attachment"},400)}
  if(bytes.byteLength>5_242_880)return json({ok:false,error:"attachment_too_large"},413);
  const ext=contentType==="image/png"?"png":contentType==="image/webp"?"webp":"jpg",path=`${issueId}/${crypto.randomUUID()}.${ext}`;
  const {error:uploadError}=await admin.storage.from("pms-evidence").upload(path,bytes,{contentType,upsert:false});if(uploadError)return json({ok:false,error:"attachment_upload_failed"},500);
  const {data,error}=await admin.from("pms_issue_attachments").insert({issue_id:issueId,storage_path:path,file_name:fileName,content_type:contentType,uploaded_by:actor.id}).select().single();
  if(error){await admin.storage.from("pms-evidence").remove([path]);return json({ok:false,error:"attachment_record_failed"},500)}
  await admin.from("pms_activity_events").insert({issue_id:issueId,actor_user_id:actor.id,event_type:"attachment_added",details:{attachment_id:data.id}});
  return json({ok:true,attachment:data});
}

Deno.serve(async request=>{
  if(request.method==="OPTIONS")return new Response("ok",{headers});
  if(request.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
  const actor=await operator(request);if(!actor)return json({ok:false,error:"operator_required"},403);
  const body=await request.json().catch(()=>({}));
  if(body.action==="hub")return hub(actor);
  if(body.action==="task_action")return taskAction(body,actor);
  if(body.action==="issue_action")return issueAction(body,actor);
  if(body.action==="template_action")return templateAction(body,actor);
  if(body.action==="team_action")return teamAction(body,actor);
  if(body.action==="attachment_action")return attachmentAction(body,actor);
  return json({ok:false,error:"invalid_action"},400);
});
