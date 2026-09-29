export const canUseProperty = (actor:any, propertyId:number) => actor.role === 'admin' || actor.property_ids?.includes(propertyId) === true;
export const hasPermission = (actor:any, permission:string) => actor.role === 'admin' || actor.permissions?.[permission] === true;
export const canManage = (actor:any) => ['admin','host'].includes(actor.role);
export const canUseTask = (actor:any, task:any) => canUseProperty(actor,Number(task.property_id))
  && hasPermission(actor,task.task_type === 'maintenance' ? 'maintenance' : 'housekeeping')
  && (canManage(actor) || task.assigned_user_id === actor.id);
export const canUseIssue = (actor:any, issue:any) => canUseProperty(actor,Number(issue.property_id))
  && hasPermission(actor,'maintenance') && (canManage(actor) || issue.assigned_user_id === actor.id || issue.created_by === actor.id);
export const canEditTemplate = (actor:any, template:any) => canManage(actor)
  && hasPermission(actor,template.task_type === 'maintenance' ? 'maintenance' : 'housekeeping')
  && (template.property_id == null ? actor.role === 'admin' : canUseProperty(actor,Number(template.property_id)));

// Filter before signing evidence URLs or returning service-role query results.
export function scopeHub(actor:any, input:any) {
  const tasks=(input.tasks||[]).filter((x:any)=>canUseTask(actor,x));
  const issues=(input.issues||[]).filter((x:any)=>canUseIssue(actor,x));
  const taskIds=new Set(tasks.map((x:any)=>x.id)),issueIds=new Set(issues.map((x:any)=>x.id));
  const finance=hasPermission(actor,'finance'),guests=hasPermission(actor,'reservations');
  const reservations=(input.reservations||[]).filter((r:any)=>canUseProperty(actor,Number(r.property_id))).map((r:any)=>({
    ...r,...(!guests?{guest_name:null,guest_email:null,guest_phone:null,user_id:null}:{}),
    ...(!finance?{stay_amount:null,experience_amount:null,total_amount:null,experience_orders:(r.experience_orders||[]).map((o:any)=>({...o,experience_order_items:(o.experience_order_items||[]).map((i:any)=>({...i,unit_price_cents:null}))}))}:{})
  }));
  return {tasks,issues,reservations,
    attachments:(input.attachments||[]).filter((x:any)=>issueIds.has(x.issue_id)),
    activity:(input.activity||[]).filter((x:any)=>taskIds.has(x.task_id)||issueIds.has(x.issue_id)),
    templates:(input.templates||[]).filter((x:any)=>x.property_id==null||canUseProperty(actor,Number(x.property_id))),
    notifications:actor.role==='admin'?(input.notifications||[]):[]};
}
