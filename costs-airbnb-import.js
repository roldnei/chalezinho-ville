// Airbnb's paid-transactions CSV, filtered to the owner's listings. No fee is
// inferred from the payout or from an advertised percentage.
function csvRows(source){
 const rows=[];let row=[],cell='',quoted=false;const text=source.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;}
 else if(c==='"')quoted=true;else if(c===','){row.push(cell);cell='';}else if(c==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}else cell+=c;}
 if(quoted)throw Error('O CSV tem aspas sem fechamento.');if(cell||row.length){row.push(cell);rows.push(row);}return rows;
}
function dateUS(value){const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);if(!m)throw Error('Data inválida no extrato: '+value);const d=`${m[3]}-${m[1]}-${m[2]}`;if(new Date(d+'T12:00:00Z').toISOString().slice(0,10)!==d)throw Error('Data inválida: '+value);return d;}
function feeCents(value){const s=String(value).trim().replace(/\s/g,'');if(!/^\d+(?:[.,]\d{1,2})?$/.test(s))throw Error('Taxa inválida no extrato: '+value);const [major,minor='']=s.replace(',','.').split('.');const n=Number(major)*100+Number(minor.padEnd(2,'0'));if(!Number.isSafeInteger(n)||n<=0||n>1000000000)throw Error('Taxa inválida: '+value);return n;}
export function parseAirbnbCSV(source){
 const [header,...rows]=csvRows(source),required=['Data','Tipo','Código de Confirmação','Anúncio','Taxa de serviço'];
 if(!header||required.some(h=>!header.includes(h)))throw Error('Selecione o CSV de transações pagas do Airbnb, com a coluna Taxa de serviço.');
 const col=Object.fromEntries(header.map((h,i)=>[h,i])),seen=new Set(),out=[];
 for(const row of rows){if(row[col.Tipo]!=='Reserva'||!String(row[col['Taxa de serviço']]||'').trim())continue;
  const reference=String(row[col['Código de Confirmação']]||'').trim().toUpperCase(),listing=String(row[col['Anúncio']]||'').trim();
  if(!/^[A-Z0-9]{6,30}$/.test(reference)||!listing)throw Error('Reserva sem código ou anúncio no extrato.');
  if(seen.has(reference))throw Error('Código de reserva repetido no CSV: '+reference);seen.add(reference);
  out.push({reference,listing,paid_on:dateUS(row[col.Data]),amount_cents:feeCents(row[col['Taxa de serviço']])});
 }
 if(!out.length)throw Error('Nenhuma taxa de serviço de reserva encontrada no CSV.');return out;
}
