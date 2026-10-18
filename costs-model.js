export const CATEGORIES = {
 pool:['Piscina · produtos e manutenção',false],pool_service:['Piscineiro',false],cleaning:['Faxina',false],energy:['Energia',false],water:['Água',false],cleaning_products:['Produtos de limpeza',false],laundry:['Lavanderia e enxoval',false],maintenance:['Manutenção e reparos',false],equipment:['Equipamentos e melhorias',false],platform_commission:['Comissão Airbnb / Booking',true],administration:['Administração / recebimento do aluguel',true],property_tax:['IPTU e tributos do imóvel',true],condominium:['Condomínio',true],sublease:['Aluguel do imóvel sublocado',true],other:['Outros',false]
};
export const TAX_SOURCE='https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/perguntas-e-respostas/dirpf/p-r-irpf-2026-v1-00-2026-04-23.pdf';
export const CHANNELS={airbnb:'Airbnb',booking:'Booking.com',site:'Site próprio'};
export function cents(value){
 let text=String(value).trim().replace(/^R\$\s*/, '');
 // Decimal keyboards can emit a dot even with pt-BR selected. A single dot
 // followed by one or two digits is a decimal separator, never a thousands mark.
 if(/^\d+\.\d{1,2}$/.test(text))text=text.replace('.',',');
 if(!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(text))throw Error('Informe o valor em reais, por exemplo 120,50.');
 const [whole,decimal='']=text.replaceAll('.','').split(',');
 const n=Number(whole)*100+Number(decimal.padEnd(2,'0'));
 if(!Number.isSafeInteger(n)||n<=0||n>1000000000)throw Error('Informe um valor entre R$ 0,01 e R$ 10.000.000,00.');return n;
}
export function monthStart(value){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(value))throw Error('Escolha um mês válido.');return value+'-01';}
export function selection(rows,month,property='all',basis='competence'){
 return rows.filter(r=>!r.archived_at&&(property==='all'||(property==='shared'?r.property_id==null:String(r.property_id)===String(property)))&&String(r[basis]||'').slice(0,7)===month);
}
export function totals(rows){return {cost:rows.reduce((s,r)=>s+Number(r.amount_cents),0),paid:rows.filter(r=>r.paid_on).reduce((s,r)=>s+Number(r.amount_cents),0),exclusions:rows.filter(r=>r.fiscal_status==='confirmed').reduce((s,r)=>s+Number(r.exclusion_cents),0),pending:rows.filter(r=>r.fiscal_status==='review').length};}
export function csvCell(v){let s=String(v??'');if(/^[\s]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export function reportCSV(rows,receipts,properties){
 const header=['ID','Imóvel','Categoria','Canal','Referência da reserva','Descrição','Fornecedor','CPF/CNPJ fornecedor','Número documento','Data documento','Competência','Pagamento','Custo R$','Situação fiscal','Mês fiscal','Exclusão revisada R$','Justificativa fiscal','Observações','Comprovantes'];
 const data=rows.map(r=>[r.id,properties.find(p=>String(p.id)===String(r.property_id))?.name||'Compartilhado / geral',CATEGORIES[r.category]?.[0]||r.category,CHANNELS[r.channel]||'',r.external_reference,r.description,r.supplier,r.supplier_document,r.document_number,r.document_date,r.competence,r.paid_on,(r.amount_cents/100).toFixed(2).replace('.',','),r.fiscal_status==='confirmed'?'Exclusão revisada':r.fiscal_status==='review'?'Revisar':'Custo operacional',r.fiscal_month,(r.exclusion_cents/100).toFixed(2).replace('.',','),r.fiscal_note,r.notes,receipts.filter(f=>f.expense_id===r.id).map(f=>`${r.id}/${f.id}-${safeName(f.original_name)}`).join(' | ')]);
 const t=totals(rows),total=Array(header.length).fill('');total[0]='TOTAL DO FILTRO';total[12]=(t.cost/100).toFixed(2).replace('.',',');total[15]=(t.exclusions/100).toFixed(2).replace('.',',');total[16]='Exclusões revisadas para conferência; não equivale ao imposto devido.';
 return '\ufeff'+[header,...data,total].map(r=>r.map(csvCell).join(';')).join('\r\n');
}
// Fiscal exports use the reviewed exclusion month, independently of the operational view.
export function fiscalRows(entries,receipts,month,property='all'){
 const evidenced=new Set(receipts.map(r=>r.expense_id));
 return entries.filter(r=>!r.archived_at&&r.fiscal_status==='confirmed'&&CATEGORIES[r.category]?.[1]&&
  r.owner_borne&&r.paid_on&&r.property_id!=null&&Number(r.exclusion_cents)>0&&
  String(r.fiscal_month||'').slice(0,7)===month&&evidenced.has(r.id)&&
  (property==='all'||(property!=='shared'&&String(r.property_id)===String(property))));
}
export function fiscalCSV(rows,receipts,properties){
 const header=['Mês fiscal','Imóvel','Tipo de exclusão','Canal','Referência da reserva','Descrição','Pagamento','Valor excluído R$','Justificativa','Comprovantes'];
 const data=rows.map(r=>[r.fiscal_month,properties.find(p=>String(p.id)===String(r.property_id))?.name||'Imóvel #'+r.property_id,CATEGORIES[r.category][0],CHANNELS[r.channel]||'',r.external_reference,r.description,r.paid_on,(Number(r.exclusion_cents)/100).toFixed(2).replace('.',','),r.fiscal_note,receipts.filter(f=>f.expense_id===r.id).map(f=>`${r.id}/${f.id}-${safeName(f.original_name)}`).join(' | ')]);
 const total=Array(header.length).fill('');total[0]='TOTAL PARA CONFERÊNCIA';total[7]=(rows.reduce((n,r)=>n+Number(r.exclusion_cents),0)/100).toFixed(2).replace('.',',');
 return '\ufeff'+[header,...data,total].map(r=>r.map(csvCell).join(';')).join('\r\n');
}
export function channelFees(entries,month,property='all'){
 const selected=entries.filter(r=>!r.archived_at&&['platform_commission','administration'].includes(r.category)&&
  CHANNELS[r.channel]&&(property==='all'||String(r.property_id)===String(property))&&
  String(r.paid_on||'').slice(0,4)===month.slice(0,4));
 return Object.entries(CHANNELS).map(([channel,label])=>({channel,label,year:selected.filter(r=>r.channel===channel).reduce((n,r)=>n+Number(r.amount_cents),0),month:selected.filter(r=>r.channel===channel&&r.paid_on.slice(0,7)===month).reduce((n,r)=>n+Number(r.amount_cents),0),count:selected.filter(r=>r.channel===channel).length}));
}
export function safeName(v){return String(v).normalize('NFKC').replace(/[^\p{L}\p{N}._ -]/gu,'_').replace(/^\.+/,'').slice(0,150)||'comprovante';}

// ZIP STORE: no external CDN dependency; originals are preserved byte for byte.
const crcTable=Array.from({length:256},(_,i)=>{for(let j=0;j<8;j++)i=i&1?0xedb88320^(i>>>1):i>>>1;return i>>>0});
function crc32(data){let crc=0xffffffff;for(const b of data)crc=crcTable[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
export async function zipBlob(files){
 const parts=[],directory=[];let offset=0;const enc=new TextEncoder();
 for(const file of files){const name=enc.encode(file.name),data=new Uint8Array(await file.blob.arrayBuffer()),crc=crc32(data),head=new Uint8Array(30+name.length),v=new DataView(head.buffer);
  v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);head.set(name,30);
  const central=new Uint8Array(46+name.length),c=new DataView(central.buffer);c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint16(14,33,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);central.set(name,46);
  parts.push(head,data);directory.push(central);offset+=head.length+data.length;
 }
 const size=directory.reduce((n,b)=>n+b.length,0),end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);v.setUint32(12,size,true);v.setUint32(16,offset,true);return new Blob([...parts,...directory,end],{type:'application/zip'});
}

// Match the database invoice identity; formatting and leading zeros are irrelevant.
export function invoiceKey(entry){
 const clean=v=>String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
 const number=clean(entry.document_number);return number?clean(entry.supplier_document)+':'+(number.replace(/^0+/,'')||'0'):null;
}
export const DUPLICATE_INVOICE_MESSAGE='Esta nota já está cadastrada para este CPF/CNPJ, inclusive se estiver arquivada. Confira o lançamento existente e o número da nota.';
