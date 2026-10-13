// Read-through only: the existing directory remains authoritative for explicit links.
// Never infer a guest from dates alone or create a stay from a directory link.
export function operationalGuests(stays:any[],events:any[],links:any[],contacts:any[]){
 const byContact=new Map(contacts.map(c=>[c.id,c]));
 return stays.map(stay=>{
  const candidates=links.filter(link=>{
   if(Number(link.property_id)!==Number(stay.property_id))return false;
   if(stay.reservation_id)return link.reservation_id===stay.reservation_id&&link.stay_key===`reservation:${stay.reservation_id}`;
   if(link.reservation_id||link.source!==(stay.channel==='other'?'ical':stay.channel)||link.check_in!==stay.check_in||link.check_out!==stay.check_out)return false;
   if(link.stay_key===`ops:${stay.id}`)return true;
   return events.some(event=>event.stay_id===stay.id&&Number(event.property_id)===Number(stay.property_id)&&event.start_date===stay.check_in&&event.end_date===stay.check_out&&
    (link.stay_key===`calendar:${event.source_id}:${event.start_date}:${event.end_date}`||link.stay_key===`${link.source}:${stay.property_id}:${event.start_date}:${event.end_date}`));
  });
  const ids=new Set(candidates.map(link=>link.guest_id));
  if(ids.size!==1)return stay;
  const contact=byContact.get([...ids][0]);
  return contact?{...stay,guest_name:contact.name,guest_phone:contact.phone||null}:stay;
 });
}
