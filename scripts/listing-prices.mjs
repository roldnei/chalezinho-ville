// Never associate another property's rates by array position.
export function mapListingPrices(listings,rows,start,end){
 return listings.map(listing=>{
  const matches=rows.filter(x=>String(x?.id)===String(listing.id)&&(!x.pms||x.pms===listing.pms));
  const row=matches.length===1?matches[0]:null;
  const raw=Array.isArray(row?.data)?row.data:[];
  const valid=raw.filter(d=>d?.date>=start&&d?.date<end).map(d=>({date:d.date,price:Number(d.price??d.user_price),min_stay:Number(d.min_stay??1)})).filter(d=>Number.isFinite(d.price)&&d.price>0&&Number.isInteger(d.min_stay)&&d.min_stay>0);
  const days=[...new Map(valid.map(d=>[d.date,d])).values()].sort((a,b)=>a.date.localeCompare(b.date));
  const nights=(Date.parse(end)-Date.parse(start))/86400000;
  const complete=days.length===nights&&days.every((d,i)=>d.date===new Date(Date.parse(start+'T12:00:00Z')+i*86400000).toISOString().slice(0,10));
  return {name:listing.name,id:listing.id,property_id:listing.property_id,days:complete?days:[],total_price:complete?days.reduce((sum,d)=>sum+d.price,0):null,min_stay:days.find(d=>d.date===start)?.min_stay||1};
 });
}
