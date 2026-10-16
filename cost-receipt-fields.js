// Receipt text is untrusted data. Only explicit document labels produce fields;
// neither arbitrary instructions nor the largest number become a financial value.
const plain=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
export function validCNPJ(value){
 const id=String(value).toUpperCase().replace(/[.,\/\s-]/g,'');
 if(!/^[A-Z\d]{12}\d{2}$/.test(id)||/^(\d)\1{13}$/.test(id))return false;
 const digit=base=>{let weight=2,sum=0;for(let i=base.length-1;i>=0;i--){sum+=(base.charCodeAt(i)-48)*weight;weight=weight===9?2:weight+1;}const r=sum%11;return r<2?0:11-r;};
 return digit(id.slice(0,12))===Number(id[12])&&digit(id.slice(0,13))===Number(id[13]);
}
function formattedCNPJ(id){const s=id.toUpperCase().replace(/[.,\/\s-]/g,'');return `${s.slice(0,2)}.${s.slice(2,5)}.${s.slice(5,8)}/${s.slice(8,12)}-${s.slice(12)}`;}
function isoDate(value){const m=value.match(/(\d{2})[\/.-](\d{2})[\/.-](\d{4})/);if(!m)return null;const [,d,mo,y]=m,date=new Date(`${y}-${mo}-${d}T12:00:00Z`);return date.getUTCFullYear()===Number(y)&&date.getUTCMonth()+1===Number(mo)&&date.getUTCDate()===Number(d)?`${y}-${mo}-${d}`:null;}
function moneyValues(line){return [...line.matchAll(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})(?!\d)/g)].map(m=>{const [whole,decimal]=m[1].replaceAll('.','').split(',');return Number(whole)*100+Number(decimal)}).filter(n=>Number.isSafeInteger(n)&&n>0&&n<=1000000000);}
// Thermal printers/OCR can lose the decimal comma. Never reinterpret an
// arbitrary integer: require a labelled total and a matching separate payment.
function separatedMoney(line,{allowFused=false}={}){
 const m=line.match(/(?<![\d.])(\d{1,3}(?:\.\d{3})+|\d{1,7})\s+(\d{2})\s*$/);
 if(m&&!/\d/.test(line.slice(0,m.index))){const value=Number(m[1].replaceAll('.',''))*100+Number(m[2]);return Number.isSafeInteger(value)&&value>0&&value<=1000000000?value:null;}
 // Only OCR (never native PDF/manual values) can have lost the printed comma.
 // A second labelled payment must still agree before this becomes a total.
 if(allowFused){const fused=line.match(/(?<!\d)(\d{3,10})\s*$/);if(fused&&!/\d/.test(line.slice(0,fused.index))){const value=Number(fused[1]);if(value>0&&value<=1000000000)return value;}}
 return null;
}
// Short fragments from background texture must never become a business name.
export function nameCandidate(value){
 const s=value.trim().replace(/^[:\s-]+/,'');const words=plain(s).match(/[A-Z]+/g)||[],letters=words.join('');
 const meaningful=words.filter(w=>w.length>=3&&/[AEIOUY]/.test(w));
 return s.length>=3&&s.length<=160&&meaningful.length>0&&words.filter(w=>w.length<=2).length<=words.length/2&&
  (letters.match(/[AEIOUY]/g)||[]).length>=letters.length*.18&&
  !/(?:R\$|\bVALOR\b|\bQTD(?:E)?\b|\bDESCR(?:ICAO)?\b|\bVL[. ]|\bITENS\b|\bUNITARIO\b|CNPJ|CPF|INSCRICAO|NOTA FISCAL|CUPOM|DANFE|DOC[UO]MENTO AUXILIAR|CONSUMIDOR|DESTINATARIO|TOMADOR|EMISSAO|ENDERECO|CEP|TELEFONE|VENDEDOR|CLIENTE|COMPROVANTE|ORCAMENTO|PEDIDO|MODELO|PREENCHER|^DATA\b|TOTAL|AUTORIZACAO|HTTP|WWW\.|CHAVE DE ACESSO|RODOVIA|RUA\b|AVENIDA\b|BAIRRO\b|^AV\.|^I[. ]?E[.:]|^OPER:|^COD(?:IGO)?\b|^FORMA PAGAMENTO|^CARTAO|^REDE )/.test(plain(s))&&
  !/\d{2}\/\d{2}|\d+[.,]\d{2}|\d{4,}/.test(s)?s:null;
}
const cnpjPattern=/\b[A-Z\d]{2}[.,\s]+[A-Z\d]{3}[.,\s]+[A-Z\d]{3}\s*\/\s*[A-Z\d]{4}\s*-\s*\d{2}\b/g;
// The access key carries the issuer and invoice number. Require both check
// digits (key and CNPJ) and an NFe/NFCe model before using that fallback.
function accessKeys(lines){return lines.flatMap(line=>[...line.matchAll(/(?<!\d)(?:\d[ \t]*){43}\d(?!\d)/g)].map(m=>m[0].replace(/\s/g,''))).filter(k=>{
 if(!['55','65'].includes(k.slice(20,22))||!validCNPJ(k.slice(6,20)))return false;
 let sum=0,weight=2;for(let i=42;i>=0;i--){sum+=Number(k[i])*weight;weight=weight===9?2:weight+1;}const rest=sum%11,digit=rest<2?0:11-rest;return digit===Number(k[43]);
});}
export function extractReceiptKey(value){
 if(typeof value!=='string'||value.length>4096)return null;
 let candidate=value.trim();
 if(!/^\d{44}$/.test(candidate)){try{const uri=new URL(candidate);if(!['https:','http:'].includes(uri.protocol)||!uri.hostname.endsWith('.gov.br'))return null;candidate=(uri.searchParams.get('p')||'').split('|')[0];}catch{return null;}}
 if(!/^\d{44}$/.test(candidate)||accessKeys([candidate]).length!==1)return null;
 const fields={supplier_document:formattedCNPJ(candidate.slice(6,20)),document_number:candidate.slice(25,34),description:(candidate.slice(20,22)==='65'?'NFC-e':'NF-e')+' · '+Number(candidate.slice(25,34))},source='Chave de acesso validada: '+candidate;
 return {fields,evidence:{supplier_document:source,document_number:source,description:source},warnings:[],confidence:null};
}
export function extractReceiptFields(text,{confidence=null}={}){
 const lines=String(text||'').slice(0,200000).split(/\r?\n/).map(s=>s.trim()).filter(Boolean),normalized=lines.map(plain),fields={},warnings=[],evidence={};
 if(!lines.length)return {fields,warnings:['Não foi possível encontrar texto legível.'],evidence,confidence};
 const recipient=normalized.findIndex(s=>/^(?:DADOS\s+(?:DO|DA)\s+)?(?:CLIENTE|CONSUMIDOR|DESTINATARIO|TOMADOR)\b/.test(s)),issuerLines=recipient<0?lines:lines.slice(0,recipient);
 const headerEnd=issuerLines.findIndex(s=>/DOCUMENTO\s+AUXILIAR|DANFE|NAO\s+E\s+DOCUMENTO\s+FISCAL|COMPROVANTE\s+DE\s+VENDA|ORCAMENTO|PEDIDO\s+DE\s+VENDA|CODIGO\s+DESCRICAO|^COD[. ]+DESCR/i.test(plain(s)));
 const headerLines=headerEnd<0?issuerLines.slice(0,12):issuerLines.slice(0,headerEnd);
 let issuerIndex=-1,invalidCNPJ=false;
 for(let i=0;i<issuerLines.length;i++){
  const line=plain(issuerLines[i]),candidates=[...line.matchAll(cnpjPattern)];
  if(/CNPJ/.test(line))for(const m of line.matchAll(/\b[A-Z\d]{12}\d{2}\b/g))candidates.push(m);
  for(const match of candidates){if(!validCNPJ(match[0])){invalidCNPJ=true;continue;}fields.supplier_document=formattedCNPJ(match[0]);evidence.supplier_document=issuerLines[i];issuerIndex=i;break;}
  if(fields.supplier_document)break;
 }
 const keys=[...new Set(accessKeys(issuerLines))];
 if(!fields.supplier_document&&keys.length===1){fields.supplier_document=formattedCNPJ(keys[0].slice(6,20));evidence.supplier_document='Chave de acesso validada: '+keys[0];}
 if(!fields.supplier_document)warnings.push(invalidCNPJ?'CNPJ lido com dígito inválido; confira no comprovante.':'CNPJ do estabelecimento não identificado.');
 for(let i=0;i<headerLines.length;i++){const match=headerLines[i].match(/(?:raz[aã]o\s+social|nome\s+fantasia)\s*:\s*(.+)/i);if(match){const name=nameCandidate(match[1]);if(name){fields.supplier=name;evidence.supplier=headerLines[i];break;}}}
 // A printed issuer ID can precede the company name on the same line.
 // Keep that contextual name even when a digit of the ID failed its checksum.
 if(!fields.supplier)for(let i=0;i<headerLines.length;i++){
  const match=[...plain(headerLines[i]).matchAll(cnpjPattern)][0];if(!match)continue;
  const suffix=nameCandidate(headerLines[i].slice(match.index+match[0].length));
  if(suffix){fields.supplier=suffix;const continuation=headerLines[i+1];
   if(continuation&&/^(?:S\s+)?(?:LTDA|S[.\s/]*A|ME|EPP)\.?$/i.test(continuation)){fields.supplier+=/\bS\s+LTDA/i.test(continuation)?continuation.replace(/^S\s+/i,'S '):' '+continuation;}
   if(continuation&&!/^(?:S\s+)?(?:LTDA|S[.\s/]*A|ME|EPP)\.?$/i.test(continuation)&&/^(?:S\s*)?L[A-Z. ]{0,8}$/i.test(continuation))warnings.push('O final do nome do estabelecimento não ficou legível; confira e complete.');
   evidence.supplier=headerLines[i];break;}
 }
 if(!fields.supplier&&issuerIndex>=0&&issuerIndex<headerLines.length){
  const prefix=headerLines[issuerIndex].split(/CNPJ/i)[0],same=nameCandidate(prefix);if(same)fields.supplier=same;
  for(let i=issuerIndex-1;!fields.supplier&&i>=Math.max(0,issuerIndex-4);i--){const name=nameCandidate(headerLines[i]);if(name){fields.supplier=name;evidence.supplier=headerLines[i];}}
 }
 if(!fields.supplier&&(confidence===null||confidence>=65)){const candidates=headerLines.slice(0,8).map(nameCandidate).filter(s=>s&&(plain(s).match(/[A-Z]{3,}/g)||[]).length>=2),top=candidates.find(s=>/\b(?:LTDA|EIRELI|EPP|S[.\s/]*A)\b/.test(plain(s)))||((confidence===null||confidence>=80)?candidates[0]:null);if(top){fields.supplier=top;evidence.supplier=top;}}
 if(!fields.supplier)warnings.push('Nome do estabelecimento não identificado.');
 const dated=[];
 lines.forEach((line,i)=>{if(/VENC(?:IMENTO|ENDO)?|PARCELA|PAGAMENTO|ENTREGA|SAIDA|ENTRADA/.test(normalized[i])&&!/EMISSAO/.test(normalized[i]))return;for(const match of line.matchAll(/\b\d{2}[\/.-]\d{2}[\/.-]\d{4}\b/g)){const value=isoDate(match[0]);if(value)dated.push({value,score:/EMISSAO|EMITIDA|EMITIDO/.test(normalized[i])?3:1,line});}});
 if(confidence!==null&&confidence<65){warnings.push('Data sem nitidez suficiente; informe a emissão no comprovante.');}
 else if(dated.length){
  const values=[...new Set(dated.map(d=>d.value))];let best;
  if(confidence!==null&&values.length>1){
   // OCR can read the same printed day differently beside the emission label.
   // Require agreement in separate lines instead of trusting that label alone.
   const counts=values.map(value=>({value,count:new Set(dated.filter(d=>d.value===value).map(d=>d.line)).size})).sort((a,b)=>b.count-a.count);
   if(counts[0].count>=2&&counts[0].count>counts[1].count)best=dated.filter(d=>d.value===counts[0].value);
   warnings.push('Datas com leituras diferentes; confira a emissão no comprovante.');
  }else{const score=Math.max(...dated.map(d=>d.score));best=dated.filter(d=>d.score===score);}
  const selected=[...new Set((best||[]).map(d=>d.value))];
  if(selected.length===1){fields.document_date=selected[0];fields.competence=selected[0].slice(0,7);evidence.document_date=best[0].line;}
  else warnings.push('Mais de uma data possível; confira a emissão.');
 }else warnings.push('Data de emissão não identificada.');
 const amounts=[];
 normalized.forEach((line,i)=>{
  if(/SUB\s*TOTAL|TROCO|TRIBUT|IMPOST|VALOR\s+PAGO|TOTAL\s+(?:DE\s+|DOS\s+)?(?:ITENS|PRODUTOS)|QTD|UNITARIO/.test(line))return;
  let score=0;
  if(/(?:TOTAL|VALOR)\s+(?:TOTAL\s+)?A\s+PAGAR|VALOR\s+(?:TOTAL\s+)?(?:DA\s+)?NOTA|TOTAL\s+(?:DA\s+)?NOTA|VALOR\s+LIQUIDO|TOTAL\s+LIQUIDO/.test(line))score=5;
  else if(/VALOR\s+TOTAL|^\s*TOTAL(?:\s|:|\(|R\$)/.test(line))score=4;
  if(!score)return;
  let values=moneyValues(lines[i]),source=lines[i];
  if(!values.length){const separated=separatedMoney(lines[i],{allowFused:confidence!==null});if(separated&&lines.some((other,j)=>j!==i&&!/PARCELA|VENC|TROCO|TRIBUT|SUBTOTAL/.test(normalized[j])&&/VALOR\s+PAGO|CARTAO(?:\s+DE)?\s+(?:CREDITO|DEBITO)|DINHEIRO|\bPIX\b/.test(normalized[j])&&(separatedMoney(other,{allowFused:confidence!==null})===separated||moneyValues(other).length===1&&moneyValues(other)[0]===separated))){values=[separated];warnings.push('Separador decimal recuperado por concordância entre total e pagamento. Confira o valor.');}}

  if(!values.length&&lines[i+1]&&/^\s*(?:R\$\s*)?[\d.,]+\s*$/.test(lines[i+1])){values=moneyValues(lines[i+1]);source+=' '+lines[i+1];}
  if(values.length===1)amounts.push({value:values[0],score,line:source});else if(values.length>1)warnings.push('Linha de total com mais de um valor; confira o total.');
 });
 if(amounts.length){const score=Math.max(...amounts.map(a=>a.score)),best=amounts.filter(a=>a.score===score),values=[...new Set(best.map(a=>a.value))];if(values.length===1){fields.amount_cents=values[0];evidence.amount=evidence.amount_cents=best[0].line;}else warnings.push('Mais de um total encontrado. Informe o valor correto.');}else warnings.push('Total da nota não identificado; informe o valor.');
 for(const line of lines){const invoice=line.match(/\bN\s*[.º°o]*\s*:\s*(\d{1,9})\s+S[eé]rie\s*:/i);if(invoice){fields.document_number=invoice[1];evidence.document_number=line;break;}}
 for(const line of lines){if(fields.document_number)break;const match=line.match(/(?:NFC[- ]?E|NF[- ]?E|NOTA\s+FISCAL|CUPOM(?:\s+FISCAL)?|N[UÚ]MERO\s+DA\s+NOTA)\s*(?:N[º°o.]?\s*[:.]?\s*|N[UÚ]MERO\s*:?\s*|[:#]\s*)(\d{1,12})\b/i);if(match){fields.document_number=match[1];evidence.document_number=line;break;}}
 if(keys.length===1){const number=keys[0].slice(25,34);if(fields.document_number&&Number(fields.document_number)!==Number(number))warnings.push('Número impresso divergiu da chave de acesso; confira o número recuperado da chave.');fields.document_number=number;evidence.document_number='Chave de acesso validada: '+keys[0];}
 const all=normalized.join(' '),rules=[['pool_service',/PISCINEIRO|SERVICO.{0,30}PISCINA/],['energy',/ENERGIA ELETRICA|\bEDP\b/],['water',/\bCESAN\b|ABASTECIMENTO DE AGUA/],['pool',/\bCLORO\b|ALGICIDA|BARRILHA|PRODUTOS.{0,25}PISCINA/],['cleaning_products',/\bDETERG(?:ENTE)?\b|LAVA\s+ROUPAS|SABAO\s+(?:EM\s+)?PO|PAPEL\s+HIG(?:IENICO)?\b|AGUA SANITARIA|DESINFETANTE|PRODUTOS DE LIMPEZA/],['laundry',/LAVANDERIA|LAVAGEM.{0,25}ENXOVAL/],['cleaning',/FAXINA|SERVICO.{0,20}LIMPEZA/],['maintenance',/MANUTENCAO|REPAROS?|ASSENTO\s+SANIT|PERFIL\s+(?:DE\s+)?EMBUTIR|FONTE\s+DE\s+ALIMENTACAO/]];
 const category=rules.find(([,rule])=>rule.test(all));if(category)fields.category=category[0];else warnings.push('Categoria não identificada; selecione antes de salvar.');
 if(confidence!==null&&confidence<65&&fields.amount_cents!==undefined){delete fields.amount_cents;delete evidence.amount;delete evidence.amount_cents;warnings.push('Valor sem nitidez suficiente; informe o total do comprovante.');}
 if(fields.supplier)fields.description='Nota · '+fields.supplier;
 if(confidence!==null&&confidence<65)warnings.push('Leitura com baixa nitidez. Confira todos os dados.');
 return {fields,warnings:[...new Set(warnings)],evidence,confidence};
}
