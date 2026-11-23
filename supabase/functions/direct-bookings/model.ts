export const uuid=(v:unknown)=>/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(String(v||''));
export const tokenValid=(v:unknown)=>/^[a-f0-9]{64}$/.test(String(v||''));
export function validDocument(bytes:Uint8Array,type:string){
 if(!bytes.length||bytes.length>5242880)return false;
 if(type==='image/jpeg')return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(type==='image/png')return [137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b);
 const text=new TextDecoder().decode(bytes.slice(0,12));
 if(type==='image/webp')return text.startsWith('RIFF')&&text.slice(8)==='WEBP';
 return type==='application/pdf'&&text.startsWith('%PDF-');
}
export function proposal(p:any,body:any,stay:any=null){
 const check_in=stay?.check_in||String(body.check_in||''),check_out=stay?.check_out||String(body.check_out||'');
 const valid=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
 const guests=Number(body.guests||stay?.guests||2),total_cents=Number(body.total_cents);
 if(!valid(check_in)||!valid(check_out)||check_out<=check_in||(Date.parse(check_out)-Date.parse(check_in))/86400000>365||!Number.isInteger(guests)||guests<1||guests>Number(p.max_guests||30))throw Error('invalid_dates_or_guests');
 if(!Number.isSafeInteger(total_cents)||total_cents<0||total_cents>100000000||!stay&&total_cents===0)throw Error('invalid_total');
 const cancellation_terms=String(body.cancellation_terms||'').trim();
 if(cancellation_terms.length<10||cancellation_terms.length>5000)throw Error('cancellation_terms_required');
 return {check_in,check_out,guests,total_cents,cancellation_terms};
}
