// Positions only describe text actually present in the original, unrotated page.
const normal=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export const REVIEW_FIELDS={amount:'Valor (R$)',supplier_document:'CPF / CNPJ',supplier:'Estabelecimento',document_date:'Data de emissão',document_number:'Número da nota'};
function wordEvidence(name,lines,target){
 const box=words=>words.length?{x0:Math.min(...words.map(w=>w.bbox.x0)),y0:Math.min(...words.map(w=>w.bbox.y0)),x1:Math.max(...words.map(w=>w.bbox.x1)),y1:Math.max(...words.map(w=>w.bbox.y1))}:null;
 for(const line of lines){
  if(/CONSUMIDOR|DESTINATARIO|TOMADOR/.test(normal(line.text)))continue;
  const words=(line.words||[]).filter(w=>w.bbox),label=words.findIndex(w=>w.confidence>=75&&/^CNPJ[:.]?$/i.test(w.text));
  if(label>=0&&['supplier_document','supplier'].includes(name)){
   let end=label+1;while(end<words.length&&/[\d/]/.test(words[end].text))end++;
   if(name==='supplier_document'&&end>label+1)return box(words.slice(label,end));
   if(name==='supplier'){const company=words.slice(end).filter(w=>w.confidence>=40&&/[a-zA-Z]/.test(w.text));if(company.length>=2)return box(company);}
  }
  if(name==='amount'&&/VALORTOTAL|(?:VALOR|TOTAL)APAGAR/.test(normal(line.text))&&!/ITENS|PRODUTOS|SUBTOTAL|UNITARIO|TRIBUT|TROCO/.test(normal(line.text))){
   const trusted=words.filter(w=>w.confidence>=75),numeric=trusted.filter(w=>/\d/.test(w.text));
   if(numeric.length&&normal(numeric.map(w=>w.text).join(' '))===normal(target))return box(trusted);
  }
  if(name==='document_date'&&/NFC?E|EMISS|EMITID|AUTORIZA|^DATA/.test(normal(line.text))&&!/VENC|PARCELA|PAGAMENTO|ENTREGA/.test(normal(line.text))){
   const date=words.find(w=>w.confidence>=75&&normal(w.text)===normal(target));if(date)return box([date]);
  }
  if(name==='document_number'){
   const index=words.findIndex(w=>w.confidence>=75&&/^NF(?:C)?[- ]?E[:.]?$/i.test(w.text));
   if(index>=0){const selected=words.slice(index,index+4).filter(w=>w.confidence>=55);if(selected.some(w=>/\d{3}/.test(w.text)))return box(selected);}
  }
 }
 return null;
}
export function receiptRegions(result,pages){
 const output={};
 for(const [name] of Object.entries(REVIEW_FIELDS)){
  const key=name==='amount'?'amount_cents':name,value=result.fields?.[key];if(!value)continue;
  let target=name==='amount'?(value/100).toFixed(2).replace('.',','):name==='document_date'?value.split('-').reverse().join('/'):value;
  const evidence=result.evidence?.[key]||(name==='amount'?result.evidence?.amount:null),needle=normal(target);
  for(const page of pages){
   const lines=page.lines.filter(l=>!(['supplier_document','supplier'].includes(name)&&/CONSUMIDOR|DESTINATARIO|TOMADOR/.test(normal(l.text))));
   const line=lines.find(l=>l.confidence>=55&&evidence&&!evidence.startsWith('Chave de acesso')&&normal(l.text)===normal(evidence))||lines.find(l=>l.confidence>=55&&(name!=='document_number'||/NFC?E|NOTAFISCAL|NUMERO/.test(normal(l.text)))&&(name!=='supplier_document'||/CNPJ|CPF|[A-Z\d]{2}[.,\s]+[A-Z\d]{3}[.,\s]+[A-Z\d]{3}\s*\//i.test(l.text))&&normal(l.text).includes(needle));
   const b=line?.bbox||wordEvidence(name,lines,target);if(!b)continue;
   const region={page:page.page,x:b.x0/page.width,y:b.y0/page.height,width:(b.x1-b.x0)/page.width,height:(b.y1-b.y0)/page.height,source:'automatic'};
   if(validRegion(region)){output[name]=region;break;}
  }
 }
 return output;
}
export function validRegion(r){return r&&Number.isInteger(r.page)&&r.page>=1&&r.page<=6&&['automatic','manual'].includes(r.source)&&['x','y','width','height'].every(k=>Number.isFinite(r[k]))&&r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=1.001&&r.y+r.height<=1.001;}
export function ocrPage(data,canvas,page=1){return {page,width:canvas.width,height:canvas.height,lines:(data.blocks||[]).flatMap(b=>(b.paragraphs||[]).flatMap(p=>p.lines||[]))};}
export function reviewedFields(p){return {amount_cents:p.amount_cents,supplier:p.supplier,supplier_document:p.supplier_document,document_date:p.document_date,document_number:p.document_number};}
export function reviewExample(item,p){
 const prediction=item.readResult||item.partialResult;const predicted={};for(const k of ['amount_cents','supplier','supplier_document','document_date','document_number'])if(prediction?.fields?.[k]!==undefined)predicted[k]=prediction.fields[k];
 const regions={};for(const [k,r] of Object.entries(item.regions||{}))if(k in REVIEW_FIELDS&&validRegion(r))regions[k]={...r};
 return {id:item.reviewId,receipt_id:item.id,predicted_fields:predicted,reviewed_fields:reviewedFields(p),regions,engine:'tesseract-por-1+receipt-v2'};
}
