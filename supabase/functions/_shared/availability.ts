// Property rules use civil dates in Brazil; checkout is exclusive.
export const availabilityDefaults={min_nights:1,weekend_min_nights:2,max_nights:1125,lead_days:0,same_day_cutoff:'11:00',preparation_days:0,window_months:9,checkin_days:[0,1,2,3,4,5,6],checkout_days:[0,1,2,3,4,5,6],custom_stays:[],use_pricelabs_min:true};
export function shiftDate(date:string,days:number){return new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10)}
export function brazilClock(now=new Date()){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);const get=(s:string)=>parts.find(p=>p.type===s)!.value;return {date:`${get('year')}-${get('month')}-${get('day')}`,time:`${get('hour')}:${get('minute')}`}}
const dateValid=(s:any)=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
export function availabilityRules(input:any={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('invalid_availability');
 const r:any={...availabilityDefaults,...input};
 for(const [k,min,max] of [['min_nights',1,1125],['weekend_min_nights',1,1125],['max_nights',1,1125],['lead_days',0,365],['preparation_days',0,7],['window_months',1,36]] as const){if(!Number.isInteger(r[k])||r[k]<min||r[k]>max)throw Error('invalid_availability')}
 if(r.min_nights>r.max_nights||r.weekend_min_nights>r.max_nights||!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.same_day_cutoff))throw Error('invalid_availability');
 for(const k of ['checkin_days','checkout_days'])if(!Array.isArray(r[k])||!r[k].length||r[k].length>7||new Set(r[k]).size!==r[k].length||r[k].some((x:any)=>!Number.isInteger(x)||x<0||x>6))throw Error('invalid_availability');
 for(const k of ['use_pricelabs_min'])if(typeof r[k]!=='boolean')throw Error('invalid_availability');
 if(!Array.isArray(r.custom_stays)||r.custom_stays.length>100)throw Error('invalid_availability');
 r.custom_stays=r.custom_stays.map((x:any)=>{if(!dateValid(x.start)||!dateValid(x.end)||x.end<x.start||!Number.isInteger(x.min_nights)||!Number.isInteger(x.max_nights)||x.min_nights<1||x.max_nights<x.min_nights||x.max_nights>1125)throw Error('invalid_availability');return {start:x.start,end:x.end,min_nights:x.min_nights,max_nights:x.max_nights}}).sort((a:any,b:any)=>a.start.localeCompare(b.start));
 for(let i=1;i<r.custom_stays.length;i++)if(r.custom_stays[i].start<=r.custom_stays[i-1].end)throw Error('overlapping_availability_rules');
 return Object.fromEntries(Object.keys(availabilityDefaults).map(k=>[k,r[k]])) as typeof r;
}
export function availabilityDecision(input:any,start:string,end:string,priceMin=1,now=new Date()){
 if(!dateValid(start)||!dateValid(end)||end<=start)return {reason:'invalid_dates',min_stay:1,max_stay:1125};
 const r=availabilityRules(input),clock=brazilClock(now),nights=(Date.parse(end)-Date.parse(start))/86400000;
 let min=r.min_nights,max=r.max_nights;
 for(let day=start;day<end;day=shiftDate(day,1)){if([5,6].includes(new Date(day+'T12:00:00Z').getUTCDay()))min=Math.max(min,r.weekend_min_nights)}
 const custom=r.custom_stays.find((x:any)=>start>=x.start&&start<=x.end);if(custom){min=custom.min_nights;max=custom.max_nights}
 if(r.use_pricelabs_min)min=Math.max(min,Number(priceMin)||1);
 const horizon=new Date(clock.date+'T12:00:00Z'),day=horizon.getUTCDate();horizon.setUTCDate(1);horizon.setUTCMonth(horizon.getUTCMonth()+r.window_months);const last=new Date(Date.UTC(horizon.getUTCFullYear(),horizon.getUTCMonth()+1,0)).getUTCDate();horizon.setUTCDate(Math.min(day,last));
 const reason=!dateValid(start)||!dateValid(end)||nights<1?'invalid_dates':start<clock.date?'past_date':start<shiftDate(clock.date,r.lead_days)?'advance_notice':start===clock.date&&clock.time>=r.same_day_cutoff?'same_day_cutoff':end>shiftDate(horizon.toISOString().slice(0,10),1)?'availability_window':!r.checkin_days.includes(new Date(start+'T12:00:00Z').getUTCDay())?'checkin_day':!r.checkout_days.includes(new Date(end+'T12:00:00Z').getUTCDay())?'checkout_day':nights<min?'minimum_stay':nights>max?'maximum_stay':null;
 return {reason,min_stay:min,max_stay:max};
}
export function preparationOverlap(start:string,end:string,occupiedStart:string,occupiedEnd:string,days:number){return start<shiftDate(occupiedEnd,days)&&end>shiftDate(occupiedStart,-days)}
