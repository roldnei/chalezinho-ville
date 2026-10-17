import {nameCandidate} from './cost-receipt-fields.js';
import {combineReceiptReadings} from './cost-receipt-image.js';
const plain=v=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const lines=data=>(data.blocks||[]).flatMap(b=>(b.paragraphs||[]).flatMap(p=>p.lines||[]));
// Judge fiscal words locally: noise elsewhere on the table must not veto a
// clearly printed total/date. Require agreement across distinct OCR passes;
// a date explicitly labelled in the issuer header can use strong local words.
export function localReceiptCandidates(data){
 const totals=[],dates=[],suppliers=[];let issuer=true,header=true;
 for(const line of lines(data)){
  const raw=plain(line.text);if(/DADOS\s+(?:DO|DA)\s+CLIENTE|^(?:CLIENTE|CONSUMIDOR|DESTINATARIO|TOMADOR)\b/.test(raw))issuer=false;
  if(/DOCUMENTO\s+AUXILIAR|DANFE|NAO\s+E\s+DOCUMENTO\s+FISCAL|COMPROVANTE\s+DE\s+VENDA|ORCAMENTO|PEDIDO\s+DE\s+VENDA|CODIGO\s+DESCRICAO/.test(raw))header=false;
  const words=(line.words||[]).filter(w=>w.confidence>=75),text=words.map(w=>w.text).join(' '),label=plain(text);
  if(issuer&&header&&words.length>=2&&(line.words||[]).filter(w=>/[A-Za-zÀ-ÿ]/.test(w.text)).every(w=>w.confidence>=85)&&/\b(?:LTDA|EIRELI|EPP)\b/.test(label)){const value=nameCandidate(text);if(value)suppliers.push({value,line:line.text.trim()});}
  if(!/SUB\s*TOTAL|TROCO|TRIBUT|IMPOST|ITENS|PRODUTOS|QTD|UNIT|PARCELA|VENC/.test(label)&&/VALOR\s+TOTAL|(?:VALOR|TOTAL)\s+A\s+PAGAR|^TOTAL\s*(?:R\$|:)/.test(label)){
   const original=line.words||[],index=original.findIndex(w=>w.confidence>=80&&/^(?:TOTAL|PAGAR)[:.]?$/i.test(w.text)),tail=original.slice(index+1).filter(w=>/\d/.test(w.text));
   if(tail.length&&tail.every(w=>w.confidence>=85)){
    const value=tail.map(w=>w.text).join(' '),m=value.match(/^(\d{1,7}|\d{1,3}(?:\.\d{3})+)[,\s](\d{2})$/),fused=value.match(/^\d{3,10}$/);
    const cents=m?Number(m[1].replaceAll('.',''))*100+Number(m[2]):fused?Number(value):0;
    if(Number.isSafeInteger(cents)&&cents>0&&cents<=1000000000)totals.push({value:cents,line:line.text.trim()});
   }
  }
  if((!issuer&&/^DATA\s*:/.test(label))||/VENC|PARCELA|PAGAMENTO|ENTREGA|SAIDA|ENTRADA/.test(label)||!/NFC?[- ]?E\b|EMISS|EMITID|AUTORIZA|^DATA\s*:/.test(plain((line.words||[]).filter(w=>w.confidence>=60).map(w=>w.text).join(' '))))continue;
  for(const word of words){const m=word.text.match(/^(\d{2})[\/.-](\d{2})[\/.-](\d{4})$/);if(!m)continue;const iso=`${m[3]}-${m[2]}-${m[1]}`,date=new Date(iso+'T12:00:00Z');if(Number.isFinite(date.getTime())&&date.getUTCFullYear()===Number(m[3])&&date.getUTCMonth()+1===Number(m[2])&&date.getUTCDate()===Number(m[1]))dates.push({value:iso,line:line.text.trim(),explicit:issuer&&word.confidence>=90&&words.some(w=>w.confidence>=90&&/^Data:$/i.test(w.text))});}
 }
 return {totals,dates,suppliers};
}
export function recoverReceiptDetails(result,readings){
 const candidates=readings.map(localReceiptCandidates),fields={},evidence={},warnings=[];
 for(const [key,kind,conflict] of [['amount_cents','totals',/divergentes em valor|Mais de um total|Linha de total com mais/],['document_date','dates',/divergentes em data|Mais de uma data|Datas com leituras diferentes/],['supplier','suppliers',/nome do estabelecimento teve leituras diferentes/i]]){
  if(result.fields[key]!==undefined||result.warnings.some(w=>conflict.test(w)))continue;
  const values=[...new Set(candidates.flatMap(c=>c[kind].map(x=>x.value)))];
  if(values.length!==1)continue;const value=values[0];
  if(candidates.filter(c=>c[kind].some(x=>x.value===value)).length<2&&!(key==='document_date'&&candidates.some(c=>c.dates.some(d=>d.value===value&&d.explicit))))continue;
  fields[key]=value;evidence[key]=candidates.flatMap(c=>c[kind]).find(x=>x.value===value).line;
  if(key==='document_date'){fields.competence=value.slice(0,7);warnings.push('Data recuperada no trecho do comprovante. Confira a emissão.');}
  else if(key==='supplier'){fields.description='Nota · '+value;warnings.push('Estabelecimento recuperado no cabeçalho. Confira o nome.');}
  else warnings.push('Total recuperado por concordância entre leituras do trecho; os dois últimos dígitos são centavos. Confira o valor.');
 }
 const combined=combineReceiptReadings(result,{fields,evidence,warnings,confidence:result.confidence});
 combined.warnings=combined.warnings.filter(w=>!(fields.amount_cents&&/^Valor sem nitidez/.test(w))&&!(fields.document_date&&/^Data sem nitidez/.test(w)));
 return combined;
}
