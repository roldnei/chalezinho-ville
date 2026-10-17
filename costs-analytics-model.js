const matches=(row,property)=>property==='all'||(property==='shared'?row.property_id==null:String(row.property_id)===String(property));
export function costAnalytics(entries,properties,{month,property='all',basis='competence',period='year'}){
 const year=month.slice(0,4),fiscal=basis==='fiscal_month';
 const rows=entries.filter(r=>!r.archived_at&&/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(String(r[basis]||''))&&(!fiscal||r.fiscal_status==='confirmed'));
 const value=r=>Number(fiscal?r.exclusion_cents:r.amount_cents)||0;
 const sum=list=>list.reduce((n,r)=>n+value(r),0),filtered=rows.filter(r=>matches(r,property));
 const inYear=rows.filter(r=>r[basis].slice(0,4)===year),selectedYear=filtered.filter(r=>r[basis].slice(0,4)===year);
 const months=Array.from({length:12},(_,i)=>{const key=year+'-'+String(i+1).padStart(2,'0');return {key,value:sum(filtered.filter(r=>r[basis].slice(0,7)===key))};});
 const years=[...new Set([year,...rows.map(r=>r[basis].slice(0,4))])].sort().map(key=>({key,value:sum(filtered.filter(r=>r[basis].slice(0,4)===key))}));
 const comparison=rows.filter(r=>r[basis].slice(0,period==='month'?7:4)===(period==='month'?month:year));
 const names=new Map(properties.map(p=>[String(p.id),p.name]));for(const r of rows)if(r.property_id!=null&&!names.has(String(r.property_id)))names.set(String(r.property_id),'Imóvel #'+r.property_id);
 names.set('shared','Compartilhado / geral');
 const byProperty=[...names].map(([key,label])=>({key,label,value:sum(comparison.filter(r=>matches(r,key)))})).sort((a,b)=>b.value-a.value||a.label.localeCompare(b.label,'pt-BR'));
 return {year,month,property,period,fiscal,months,years,byProperty,monthTotal:sum(filtered.filter(r=>r[basis].slice(0,7)===month)),yearTotal:sum(selectedYear),generalYearTotal:sum(inYear),comparisonTotal:sum(comparison),count:selectedYear.length};
}
