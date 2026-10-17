// Locate the receipt using recognized fiscal lines, rather than the colour of
// the table behind it. A margin accommodates the small deskew applied during recognition.
export function receiptBounds(blocks,width,height){
 const lines=(blocks||[]).flatMap(b=>(b.paragraphs||[]).flatMap(p=>p.lines||[]));
 // Background texture can lower an entire line's confidence and enlarge its
 // box across the photo. Fiscal words still provide a reliable paper crop.
 const fiscal=/^(?:CNPJ|TOTAL|VALOR|PAGAR|NFC[- ]?E|EMISS[AÃ]O|FORMA)[:.]?$/i;
 const words=lines.flatMap(l=>l.words||[]).filter(w=>w.confidence>=65&&w.bbox&&fiscal.test(w.text));
 if(words.length>=4&&words.some(w=>/CNPJ|NFC/i.test(w.text))&&words.some(w=>/TOTAL|PAGAR/i.test(w.text))){
  const numbers=lines.filter(l=>(l.words||[]).some(w=>w.confidence>=65&&fiscal.test(w.text))).flatMap(l=>l.words||[]).filter(w=>w.bbox&&w.confidence>=65&&/^\d+(?:\.\d{3})*,\d{2}$/.test(w.text));
  const extents=[...words,...numbers];
  const left=Math.max(0,Math.min(...extents.map(w=>w.bbox.x0))-width*.03),right=Math.min(width,Math.max(...extents.map(w=>w.bbox.x1))+width*.10);
  const top=Math.max(0,Math.min(...words.map(w=>w.bbox.y0))-height*.055),bottom=Math.min(height,Math.max(...words.map(w=>w.bbox.y1))+height*.04);
  if(right-left>=width*.2&&bottom-top>=height*.15)return {left,top,width:right-left,height:bottom-top};
 }
 const anchors=lines.filter(l=>l.confidence>=55&&/CNPJ|\d{2}[.,]\d{3}[.,]\d{3}|TOTAL|A PAGAR|NFC[- ]?E|EMISS|FORMA PAGAMENTO/i.test(l.text)&&l.bbox);
 if(anchors.length<2)return null;
 const pad=Math.max(16,Math.round(width*.021)),verticalPad=Math.max(16,Math.round(height*.013));
 const left=Math.max(0,Math.min(...anchors.map(l=>l.bbox.x0))-pad),top=Math.max(0,Math.min(...anchors.map(l=>l.bbox.y0))-verticalPad);
 const right=Math.min(width,Math.max(...anchors.map(l=>l.bbox.x1))+pad),bottom=Math.min(height,Math.max(...anchors.map(l=>l.bbox.y1))+verticalPad);
 if(right-left<width*.15||bottom-top<height*.1)return null;
 return {left,top,width:right-left,height:bottom-top};
}
export function enhanceReceipt(source,blocks,createCanvas,bounds=receiptBounds(blocks,source.width,source.height)||{left:0,top:0,width:source.width,height:source.height}){
 const scale=Math.min(1.5,2400/bounds.width,6000/bounds.height),canvas=createCanvas();canvas.width=Math.round(bounds.width*scale);canvas.height=Math.round(bounds.height*scale);
 const ctx=canvas.getContext('2d');ctx.drawImage(source,bounds.left,bounds.top,bounds.width,bounds.height,0,0,canvas.width,canvas.height);
 const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
 for(let i=0;i<pixels.data.length;i+=4){const gray=pixels.data[i]*.299+pixels.data[i+1]*.587+pixels.data[i+2]*.114,v=Math.max(0,Math.min(255,(gray-65)*255/145));pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;}
 ctx.putImageData(pixels,0,0);return canvas;
}
// A second pass may recover missing values. Conflicting readings remain blank
// so a confident-looking value is never silently chosen over another value.
export function combineReceiptReadings(first,second){
 const fields={...first.fields},evidence={...first.evidence},warnings=[...first.warnings,...second.warnings];
 for(const [name,value] of Object.entries(second.fields)){
  if(fields[name]===undefined){fields[name]=value;evidence[name]=second.evidence[name];}
  else if(fields[name]!==value&&['supplier_document','amount_cents','document_date','competence','document_number'].includes(name)){
   if(name==='document_number'&&second.evidence[name]?.startsWith('Chave de acesso validada:')&&!first.evidence[name]?.startsWith('Chave de acesso validada:')){fields[name]=value;evidence[name]=second.evidence[name];if(Number(first.fields[name])!==Number(value))warnings.push('Número da nota recuperado da chave de acesso validada; confira antes de salvar.');continue;}
   if(name==='document_number'&&first.evidence[name]?.startsWith('Chave de acesso validada:')&&!second.evidence[name]?.startsWith('Chave de acesso validada:')){warnings.push('Número impresso divergiu da chave de acesso; confira o número recuperado da chave.');continue;}
   // Different zero padding denotes the same invoice number.
   if(name==='document_number'&&Number(fields[name])===Number(value))continue;
   delete fields[name];delete evidence[name];warnings.push(`Leituras divergentes em ${({supplier_document:'CNPJ',amount_cents:'valor',document_date:'data',competence:'mês de referência',document_number:'número da nota'})[name]}; confira no comprovante.`);
  }
 }
 if(first.fields.supplier&&second.fields.supplier&&first.fields.supplier!==second.fields.supplier)warnings.push('O nome do estabelecimento teve leituras diferentes; confira e complete se necessário.');
 const missing={'CNPJ do estabelecimento não identificado.':'supplier_document','Nome do estabelecimento não identificado.':'supplier','Data de emissão não identificada.':'document_date','Total da nota não identificado; informe o valor.':'amount_cents','Categoria não identificada; selecione antes de salvar.':'category','CNPJ lido com dígito inválido; confira no comprovante.':'supplier_document'};
 return {fields,evidence,confidence:second.confidence,warnings:[...new Set(warnings)].filter(w=>!missing[w]||fields[missing[w]]===undefined)};
}
// A clean, unrotated crop may recover a total that the full photograph missed.
// Explicit conflicts stay pending even if a later pass agrees with one side.
export function recoverPositionedTotal(result,reading){
 if(result.fields.amount_cents||!reading.fields.amount_cents||reading.confidence===null||reading.confidence<65||result.warnings.some(w=>/divergentes em valor|Mais de um total|Linha de total com mais/i.test(w)))return result;
 return combineReceiptReadings(result,{fields:{amount_cents:reading.fields.amount_cents},evidence:{amount_cents:reading.evidence.amount_cents||reading.evidence.amount},confidence:reading.confidence,warnings:[...reading.warnings.filter(w=>/Separador decimal/.test(w)),'Total recuperado da leitura localizada. Confira o valor.']});
}
