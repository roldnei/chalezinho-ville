// Positions only describe text actually present in the original, unrotated page.
const normal=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export const REVIEW_FIELDS={amount:'Valor (R$)',supplier_document:'CPF / CNPJ',supplier:'Estabelecimento',document_date:'Data de emissão',document_number:'Número da nota'};
export function receiptRegions(result,pages){
 const output={};
 for(const [name] of Object.entries(REVIEW_FIELDS)){
  const key=name==='amount'?'amount_cents':name,value=result.fields?.[key];if(!value)continue;
  let target=name==='amount'?(value/100).toFixed(2).replace('.',','):name==='document_date'?value.split('-').reverse().join('/'):value;
  const evidence=result.evidence?.[key],needle=normal(target);
  for(const page of pages){
   const line=page.lines.find(l=>l.confidence>=55&&evidence&&!evidence.startsWith('Chave de acesso')&&normal(l.text)===normal(evidence))||page.lines.find(l=>l.confidence>=55&&normal(l.text).includes(needle));
   if(!line?.bbox)continue;const b=line.bbox;
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
 const predicted={};for(const k of ['amount_cents','supplier','supplier_document','document_date','document_number'])if(item.readResult?.fields?.[k]!==undefined)predicted[k]=item.readResult.fields[k];
 const regions={};for(const [k,r] of Object.entries(item.regions||{}))if(k in REVIEW_FIELDS&&validRegion(r))regions[k]={...r};
 return {id:item.reviewId,receipt_id:item.id,predicted_fields:predicted,reviewed_fields:reviewedFields(p),regions,engine:'tesseract-por-1+receipt-v2'};
}
