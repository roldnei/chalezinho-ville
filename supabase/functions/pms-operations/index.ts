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
  const {data:profile}=await admin.from("profiles").select("role,full_name,pms_property_ids,pms_permissions").eq("id",user.id).maybeSingle();
  if(!profile||!["admin","host","staff"].includes(profile.role))return null;
  return {id:user.id,role:profile.role,name:profile.full_name||user.email||"Equipe",property_ids:profile.pms_property_ids||[],permissions:profile.pms_permissions||{}};
}

const canManage=(actor:any)=>actor.role==="admin"||actor.role==="host";
const canUseProperty=(actor:any,propertyId:number)=>canManage(actor)||!actor.property_ids?.length||actor.property_ids.includes(propertyId);

async function syncTurnovers(actorId:string){
  const start=new Date(Date.now()-2*86400000).toISOString().slice(0,10),end=new Date(Date.now()+45*86400000).toISOString().slice(0,10);
  const {data:reservations}=await admin.from("reservations").select("id,property_id,check_in,check_out,guest_name,status,properties(name,check_in_time,check_out_time),experience_orders(status,experience_order_items(product_name_snapshot,variant_name_snapshot,quantity,status))").eq("status","confirmed").gte("check_out",start).lte("check_out",end);
  for(const r of reservations||[]){
    const property=Array.isArray(r.properties)?r.properties[0]:r.properties;
    const scheduled=`${r.check_out}T${String(property?.check_out_time||"11:00").slice(0,5)}:00-03:00`;
    const due=`${r.check_out}T14:30:00-03:00`;
    const {data:existing}=await admin.from("pms_tasks").select("id").eq("reservation_id",r.id).eq("task_type","turnover").maybeSingle();
    if(!existing){
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
    const experiences=(r.experience_orders||[]).filter((o:any)=>o.status==="active").flatMap((o:any)=>o.experience_order_items||[]).filter((x:any)=>x.status==="active");
    if(experiences.length){
      const {data:setupExists}=await admin.from("pms_tasks").select("id").eq("reservation_id",r.id).eq("task_type","setup").maybeSingle();
      if(!setupExists){
        const checkInAt=new Date(`${r.check_in}T${String(property?.check_in_time||"15:00").slice(0,5)}:00-03:00`);
        const scheduledAt=new Date(checkInAt.getTime()-24*60*60*1000).toISOString(),dueAt=new Date(checkInAt.getTime()-60*60*1000).toISOString();
        const summary=experiences.map((x:any)=>`${Number(x.quantity||1)}x ${x.product_name_snapshot}${x.variant_name_snapshot?` · ${x.variant_name_snapshot}`:""}`).join(", ");
        const {data:setup}=await admin.from("pms_tasks").insert({property_id:r.property_id,reservation_id:r.id,task_type:"setup",title:`Preparar experiências · ${property?.name||"imóvel"}`,description:`Itens confirmados para ${r.guest_name||"hóspede"}: ${summary}`,scheduled_for:scheduledAt,due_at:dueAt,priority:"high",created_by:actorId}).select("id").single();
        if(setup?.id)await admin.from("pms_task_checklist_items").insert(experiences.map((x:any,index:number)=>({task_id:setup.id,label:`Separar ${Number(x.quantity||1)}x ${x.product_name_snapshot}${x.variant_name_snapshot?` · ${x.variant_name_snapshot}`:""}`,display_order:index})));
      }
    }
  }
}

async function hub(actor:any){
  await syncTurnovers(actor.id);
  const start=new Date(Date.now()-7*86400000).toISOString(),end=new Date(Date.now()+60*86400000).toISOString();
  const [properties,tasks,issues,reservations,team,templates,attachments,blocks,notifications,activity]=await Promise.all([
    admin.from("properties").select("id,code,name,cover_image,active,check_in_time,check_out_time").eq("active",true).order("id"),
    admin.from("pms_tasks").select("*,pms_task_checklist_items(*)").gte("scheduled_for",start).lte("scheduled_for",end).order("scheduled_for"),
    admin.from("pms_issues").select("*").not("status","in",'(resolved,cancelled)').order("created_at",{ascending:false}),
    admin.from("reservations").select("id,property_id,user_id,confirmation_code,guest_name,guest_email,guest_phone,guests,check_in,check_out,status,source,rate_plan_code,stay_amount,experience_amount,total_amount,operational_status,checked_in_at,checked_out_at,created_at,experience_orders(status,experience_order_items(product_name_snapshot,variant_name_snapshot,unit_price_cents,quantity,status))").in("status",["confirmed","cancelled","no_show"]).gte("check_out",new Date(Date.now()-365*86400000).toISOString().slice(0,10)).lte("check_in",new Date(Date.now()+730*86400000).toISOString().slice(0,10)).order("created_at",{ascending:false}).limit(750),
    admin.from("profiles").select("id,full_name,role,pms_property_ids,pms_permissions").in("role",["admin","host","staff"]).order("full_name"),
    admin.from("pms_checklist_templates").select("*,pms_checklist_template_items(*)").order("name"),
    admin.from("pms_issue_attachments").select("*").order("created_at",{ascending:false}),
    admin.from("pms_calendar_blocks").select("*").gte("end_date",new Date(Date.now()-30*86400000).toISOString().slice(0,10)).order("start_date"),
    admin.from("admin_notifications").select("*").order("created_at",{ascending:false}).limit(150),
    admin.from("pms_activity_events").select("*").order("created_at",{ascending:false}).limit(250)
  ]);
  if(properties.error||tasks.error||issues.error||reservations.error||team.error||templates.error||attachments.error||blocks.error||notifications.error||activity.error)return json({ok:false,error:"pms_unavailable"},500);
  const evidence=await Promise.all((attachments.data||[]).map(async (x:any)=>{const {data}=await admin.storage.from("pms-evidence").createSignedUrl(x.storage_path,900);return {...x,signed_url:data?.signedUrl||null}}));
  const visibleProperties=(properties.data||[]).filter((p:any)=>canUseProperty(actor,Number(p.id)));
  const propertyIds=new Set(visibleProperties.map((p:any)=>Number(p.id)));
  const visibleReservations=(reservations.data||[]).filter((r:any)=>propertyIds.has(Number(r.property_id)));
  const reservationIds=visibleReservations.map((r:any)=>r.id);
  const [payments,charges,guarantees,notes,audit]=reservationIds.length?await Promise.all([
    admin.from("payments").select("id,reservation_id,provider,method,installments,amount_cents,status,created_at,updated_at").in("reservation_id",reservationIds).order("created_at",{ascending:false}),
    admin.from("post_booking_charges").select("id,reservation_id,kind,description,amount_cents,status,expires_at,created_at").in("reservation_id",reservationIds).order("created_at",{ascending:false}),
    admin.from("guarantees").select("id,reservation_id,amount_cents,captured_amount_cents,status,created_at").in("reservation_id",reservationIds),
    admin.from("reservation_notes").select("id,reservation_id,note,author_user_id,created_at").in("reservation_id",reservationIds).order("created_at",{ascending:false}),
    admin.from("audit_events").select("id,actor_user_id,action,entity_type,entity_id,old_value,new_value,created_at").in("entity_id",reservationIds).order("created_at",{ascending:false}).limit(250)
  ]):[{data:[]},{data:[]},{data:[]},{data:[]},{data:[]}];
  const visibleTasks=(tasks.data||[]).filter((x:any)=>propertyIds.has(Number(x.property_id))&&(actor.role!=="staff"||!x.assigned_user_id||x.assigned_user_id===actor.id));
  return json({ok:true,server_now:new Date().toISOString(),properties:visibleProperties,tasks:visibleTasks,issues:(issues.data||[]).filter((x:any)=>propertyIds.has(Number(x.property_id))),reservations:visibleReservations,team:team.data||[],templates:templates.data||[],attachments:evidence,blocks:(blocks.data||[]).filter((x:any)=>propertyIds.has(Number(x.property_id))),notifications:notifications.data||[],activity:activity.data||[],payments:payments.data||[],charges:charges.data||[],guarantees:guarantees.data||[],notes:notes.data||[],audit:audit.data||[],operator:actor});
}

async function taskAction(body:any,actor:any){
  const op=clip(body.operation,30);
  if(op==="create"){
    const assignedUser=clip(body.assigned_user_id,80)||null;
    const payload={property_id:Number(body.property_id),reservation_id:body.reservation_id||null,task_type:["turnover","inspection","maintenance","setup","guest_request"].includes(body.task_type)?body.task_type:"setup",title:clip(body.title,180),description:clip(body.description,2000)||null,status:"todo",priority:["low","normal","high","urgent"].includes(body.priority)?body.priority:"normal",scheduled_for:new Date(body.scheduled_for).toISOString(),due_at:body.due_at?new Date(body.due_at).toISOString():null,assigned_user_id:assignedUser,assigned_name:clip(body.assigned_name,160)||null,created_by:actor.id};
    if(!payload.property_id||!payload.title||!canUseProperty(actor,payload.property_id))return json({ok:false,error:"invalid_task"},400);
    const {data,error}=await admin.from("pms_tasks").insert(payload).select().single();
    if(error)return json({ok:false,error:"task_create_failed"},500);
    await admin.from("pms_activity_events").insert({task_id:data.id,actor_user_id:actor.id,event_type:"created"});
    return json({ok:true,task:data});
  }
  const id=clip(body.task_id,80);const {data:task}=await admin.from("pms_tasks").select("*").eq("id",id).maybeSingle();
  if(!task||!canUseProperty(actor,Number(task.property_id))||(actor.role==="staff"&&task.assigned_user_id&&task.assigned_user_id!==actor.id))return json({ok:false,error:"task_not_found"},404);
  if(op==="assign"){
    if(!canManage(actor))return json({ok:false,error:"manager_required"},403);
    const assignedUser=clip(body.assigned_user_id,80)||null;
    let assignedName:string|null=null;
    if(assignedUser){const {data:person}=await admin.from("profiles").select("id,full_name,role").eq("id",assignedUser).in("role",["admin","host","staff"]).maybeSingle();if(!person)return json({ok:false,error:"member_not_found"},404);assignedName=person.full_name||"Equipe";}
    const {data,error}=await admin.from("pms_tasks").update({assigned_user_id:assignedUser,assigned_name:assignedName,updated_at:new Date().toISOString()}).eq("id",id).select().single();
    if(error)return json({ok:false,error:"task_assign_failed"},500);
    await admin.from("pms_activity_events").insert({task_id:id,actor_user_id:actor.id,event_type:"assigned",details:{assigned_user_id:assignedUser,assigned_name:assignedName}});
    return json({ok:true,task:data});
  }
  if(op==="set_status"){
    const status=clip(body.status,30);if(!["todo","in_progress","inspection","ready","blocked","cancelled"].includes(status))return json({ok:false,error:"invalid_status"},400);
    if(status==="ready"&&!canManage(actor))return json({ok:false,error:"manager_required"},403);
    if(["inspection","ready"].includes(status)){
      const {count}=await admin.from("pms_task_checklist_items").select("id",{count:"exact",head:true}).eq("task_id",id).eq("completed",false);
      if(Number(count||0)>0)return json({ok:false,error:"checklist_incomplete"},409);
    }
    const now=new Date().toISOString(),update:any={status,updated_at:now};
    if(status==="in_progress"&&!task.started_at)update.started_at=now;
    if(status==="inspection")update.submitted_at=now;
    if(status==="ready")update.completed_at=now;
    const {data,error}=await admin.from("pms_tasks").update(update).eq("id",id).select().single();
    if(error)return json({ok:false,error:"task_update_failed"},500);
    await admin.from("pms_activity_events").insert({task_id:id,actor_user_id:actor.id,event_type:"status_changed",details:{from:task.status,to:status}});
    if(task.reservation_id&&task.task_type==="turnover"&&status==="in_progress")await admin.from("reservations").update({operational_status:"preparing",updated_at:now}).eq("id",task.reservation_id);
    if(task.reservation_id&&task.task_type==="turnover"&&status==="ready")await admin.from("reservations").update({operational_status:"ready",updated_at:now}).eq("id",task.reservation_id);
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

async function blockAction(body:any,actor:any){
  if(!canManage(actor))return json({ok:false,error:"manager_required"},403);
  const operation=clip(body.operation,30);
  if(operation==="create"){
    const propertyId=Number(body.property_id),start=clip(body.start_date,10),end=clip(body.end_date,10),reason=clip(body.reason,500);
    const blockType=["maintenance","owner_use","operational","other"].includes(body.block_type)?body.block_type:"operational";
    if(!propertyId||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(start)||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(end)||end<=start||reason.length<2)return json({ok:false,error:"invalid_block"},400);
    const [{data:property},{data:reservation},{data:block}]=await Promise.all([
      admin.from("properties").select("id").eq("id",propertyId).eq("active",true).maybeSingle(),
      admin.from("reservations").select("id").eq("property_id",propertyId).in("status",["hold","pending_payment","confirmed"]).lt("check_in",end).gt("check_out",start).limit(1),
      admin.from("pms_calendar_blocks").select("id").eq("property_id",propertyId).eq("status","active").lt("start_date",end).gt("end_date",start).limit(1)
    ]);
    if(!property)return json({ok:false,error:"property_not_found"},404);
    if(reservation?.length||block?.length)return json({ok:false,error:"period_occupied"},409);
    const {data,error}=await admin.from("pms_calendar_blocks").insert({property_id:propertyId,start_date:start,end_date:end,block_type:blockType,reason,created_by:actor.id}).select().single();
    if(error)return json({ok:false,error:"block_create_failed"},500);
    await admin.from("audit_events").insert({actor_user_id:actor.id,action:"pms_calendar_block_created",entity_type:"pms_calendar_block",entity_id:data.id,new_value:data});
    return json({ok:true,block:data});
  }
  if(operation==="cancel"){
    const id=clip(body.block_id,80),now=new Date().toISOString();
    const {data,error}=await admin.from("pms_calendar_blocks").update({status:"cancelled",cancelled_by:actor.id,cancelled_at:now,updated_at:now}).eq("id",id).eq("status","active").select().maybeSingle();
    if(error||!data)return json({ok:false,error:"block_not_found"},404);
    await admin.from("audit_events").insert({actor_user_id:actor.id,action:"pms_calendar_block_cancelled",entity_type:"pms_calendar_block",entity_id:id,old_value:{status:"active"},new_value:{status:"cancelled"}});
    return json({ok:true,block:data});
  }
  return json({ok:false,error:"invalid_operation"},400);
}

async function reservationAction(body:any,actor:any){
  if(!canManage(actor)&&actor.permissions?.reservations!==true)return json({ok:false,error:"permission_required"},403);
  const reservationId=clip(body.reservation_id,80),operation=clip(body.operation,30);
  const {data:reservation}=await admin.from("reservations").select("*").eq("id",reservationId).maybeSingle();
  if(!reservation||!canUseProperty(actor,Number(reservation.property_id)))return json({ok:false,error:"reservation_not_found"},404);
  const now=new Date().toISOString();
  if(operation==="add_note"){
    const note=clip(body.note,2000);if(!note)return json({ok:false,error:"note_required"},400);
    const {data,error}=await admin.from("reservation_notes").insert({reservation_id:reservationId,author_user_id:actor.id,note}).select().single();
    if(error)return json({ok:false,error:"note_create_failed"},500);return json({ok:true,note:data});
  }
  if(operation==="check_in"){
    if(reservation.status!=="confirmed")return json({ok:false,error:"reservation_not_confirmed"},409);
    const {data,error}=await admin.from("reservations").update({operational_status:"checked_in",checked_in_at:reservation.checked_in_at||now,updated_at:now}).eq("id",reservationId).select().single();
    if(error)return json({ok:false,error:"check_in_failed"},500);
    await admin.from("audit_events").insert({actor_user_id:actor.id,action:"reservation_check_in",entity_type:"reservation",entity_id:reservationId,new_value:{checked_in_at:data.checked_in_at}});
    return json({ok:true,reservation:data});
  }
  if(operation==="check_out"){
    if(reservation.status!=="confirmed")return json({ok:false,error:"reservation_not_confirmed"},409);
    const {data,error}=await admin.from("reservations").update({operational_status:"preparing",checked_out_at:reservation.checked_out_at||now,updated_at:now}).eq("id",reservationId).select().single();
    if(error)return json({ok:false,error:"check_out_failed"},500);
    await admin.from("audit_events").insert({actor_user_id:actor.id,action:"reservation_check_out",entity_type:"reservation",entity_id:reservationId,new_value:{checked_out_at:data.checked_out_at,operational_status:"preparing"}});
    await syncTurnovers(actor.id);
    return json({ok:true,reservation:data});
  }
  if(operation==="no_show"){
    if(reservation.status!=="confirmed")return json({ok:false,error:"reservation_not_confirmed"},409);
    const {data,error}=await admin.from("reservations").update({status:"no_show",no_show_at:now,cancellation_actor:"admin",cancellation_reason:clip(body.reason,1000)||"Não comparecimento registrado pela operação",updated_at:now}).eq("id",reservationId).select().single();
    if(error)return json({ok:false,error:"no_show_failed"},500);
    await admin.from("audit_events").insert({actor_user_id:actor.id,action:"reservation_no_show",entity_type:"reservation",entity_id:reservationId,old_value:{status:"confirmed"},new_value:{status:"no_show"}});
    return json({ok:true,reservation:data});
  }
  return json({ok:false,error:"invalid_operation"},400);
}

async function issueAction(body:any,actor:any){
  const op=clip(body.operation,30);
  if(op==="create"){
    const payload={property_id:Number(body.property_id),reservation_id:body.reservation_id||null,title:clip(body.title,180),description:clip(body.description,2000)||null,area:clip(body.area,100)||null,severity:["low","normal","high","critical"].includes(body.severity)?body.severity:"normal",status:"open",assigned_user_id:clip(body.assigned_user_id,80)||null,assigned_name:clip(body.assigned_name,160)||null,due_at:body.due_at?new Date(body.due_at).toISOString():null,created_by:actor.id};
    if(!payload.property_id||!payload.title||!canUseProperty(actor,payload.property_id))return json({ok:false,error:"invalid_issue"},400);
    const {data,error}=await admin.from("pms_issues").insert(payload).select().single();if(error)return json({ok:false,error:"issue_create_failed"},500);
    await admin.from("pms_activity_events").insert({issue_id:data.id,actor_user_id:actor.id,event_type:"created"});return json({ok:true,issue:data});
  }
  const id=clip(body.issue_id,80),status=clip(body.status,30);if(!["open","scheduled","in_progress","resolved","cancelled"].includes(status))return json({ok:false,error:"invalid_status"},400);
  const {data:before}=await admin.from("pms_issues").select("status,property_id").eq("id",id).maybeSingle();if(!before||!canUseProperty(actor,Number(before.property_id)))return json({ok:false,error:"issue_not_found"},404);
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
  if(body.action==="block_action")return blockAction(body,actor);
  if(body.action==="reservation_action")return reservationAction(body,actor);
  if(body.action==="issue_action")return issueAction(body,actor);
  if(body.action==="template_action")return templateAction(body,actor);
  if(body.action==="team_action")return teamAction(body,actor);
  if(body.action==="attachment_action")return attachmentAction(body,actor);
  return json({ok:false,error:"invalid_action"},400);
});
