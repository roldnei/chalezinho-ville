type ExperienceLine = {id:string;experience_order_item_id?:string|null};
type Delivery = "provided"|"unprovided";

// A paid ledger line alone does not prove delivery. All charges linked to
// the same item must agree, including an upgrade charged separately.
export function assessExperienceRefund(lines:ExperienceLine[], input:unknown) {
  if (!lines.length) return {ok:true,unprovided:new Set<string>(),decisions:[]} as const;
  if(!Array.isArray(input)||input.length!==lines.length)return {ok:false} as const;
  const byId=new Map(lines.map(line=>[line.id,line]));
  const byItem=new Map<string,Delivery>(), seen=new Set<string>(),unprovided=new Set<string>();
  const decisions:{id:string;status:Delivery}[]=[];
  for(const entry of input){
    const line=byId.get(entry?.id),status=entry?.status;
    if(!line||seen.has(line.id)||(status!=="provided"&&status!=="unprovided"))return {ok:false} as const;
    if(line.experience_order_item_id){
      const previous=byItem.get(line.experience_order_item_id);
      if(previous&&previous!==status)return {ok:false} as const;
      byItem.set(line.experience_order_item_id,status);
    }
    seen.add(line.id);
    if(status==="unprovided")unprovided.add(line.id);
    decisions.push({id:line.id,status});
  }
  return {ok:true,unprovided,decisions} as const;
}
