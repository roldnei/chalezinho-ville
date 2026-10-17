import {test} from 'node:test';import assert from 'node:assert/strict';import {localReceiptCandidates,recoverReceiptDetails} from '../cost-receipt-local-fields.js';
const base=()=>({fields:{},evidence:{},warnings:['Total da nota não identificado; informe o valor.','Data sem nitidez suficiente; informe a emissão no comprovante.'],confidence:40});
const row=(text,scores={})=>({text,confidence:30,words:text.split(' ').map(text=>({text,confidence:scores[text]??95}))});
const read=(...rows)=>({blocks:[{paragraphs:[{lines:rows}]}]});
test('local fiscal words recover cents and emission despite low global confidence only with independent agreement',()=>{
 const a=read(row('ruido Valor total R$ 123 45',{ruido:5}),row('NFC-e nº 321 Série 001 22/07/2026'));
 const b=read(row('Valor total R$ 12345'),row('Data de Autorização 22/07/2026'));
 const r=recoverReceiptDetails(base(),[a,b]);assert.equal(r.fields.amount_cents,12345);assert.equal(r.fields.document_date,'2026-07-22');assert.equal(r.fields.competence,'2026-07');assert.equal(r.fields.supplier,undefined);assert.ok(!r.warnings.some(w=>/não identificado|sem nitidez/.test(w)));
 assert.deepEqual(recoverReceiptDetails(base(),[a]).fields,{});
});
test('disagreement, weak digits, nonfiscal dates and invalid calendar days remain pending',()=>{
 const a=read(row('Valor total R$ 123 45'),row('Emissão 22/07/2026'));
 const b=read(row('Valor total R$ 123 46'),row('Emissão 23/07/2026'));
 assert.deepEqual(recoverReceiptDetails(base(),[a,b]).fields,{});
 const weak=read(row('Valor total R$ 123 45',{'45':65}),row('Emissão 32/07/2026'),row('Vencimento 22/07/2026'),row('Parcela 123 45'),row('Valor total de itens 123 45'));
 assert.deepEqual(localReceiptCandidates(weak),{totals:[],dates:[],suppliers:[]});assert.deepEqual(recoverReceiptDetails(base(),[a,weak]).fields,{});
});
test('local agreement never overwrites a populated value or revives an explicit conflict',()=>{
 const a=read(row('Valor total R$ 123 45'),row('Emissão 22/07/2026')),b=read(row('Valor total R$ 12345'),row('NFC-e nº 321 22/07/2026'));
 const conflict={...base(),warnings:['Leituras divergentes em valor; confira no comprovante.','Leituras divergentes em data; confira no comprovante.']};assert.deepEqual(recoverReceiptDetails(conflict,[a,b]).fields,{});
 const filled={...base(),fields:{amount_cents:9999,document_date:'2026-01-01'}};assert.deepEqual(recoverReceiptDetails(filled,[a,b]).fields,filled.fields);
});

test('explicit sales receipt date is recovered from a clear local label without requiring an NFCe label',()=>{
 const data=read(row('COMPROVANTE DE VENDA MODELO 02'),row('Data: 22/07/2026'),row('Vendedor: JOANA'),row('DADOS DO CLIENTE'),row('Data: 11/11/2025'));
 const r=recoverReceiptDetails(base(),[data]);assert.equal(r.fields.document_date,'2026-07-22');assert.equal(r.fields.competence,'2026-07');assert.equal(r.fields.amount_cents,undefined);
 assert.equal(recoverReceiptDetails(base(),[read(row('Data: 22/07/2026',{'22/07/2026':80}))]).fields.document_date,undefined);
 assert.equal(recoverReceiptDetails(base(),[read(row('Data: 22/07/2026'),row('Data: 23/07/2026'))]).fields.document_date,undefined);
});
test('issuer name recovery requires a company suffix, complete confident words, header position and agreement',()=>{
 const a=read(row('COMERCIO EXEMPLO LTDA'),row('NAO E DOCUMENTO FISCAL'),row('DADOS DO CLIENTE'),row('CLIENTE EXEMPLO LTDA')),b=read(row('COMERCIO EXEMPLO LTDA'),row('COMPROVANTE DE VENDA MODELO 02'));
 assert.equal(recoverReceiptDetails(base(),[a,b]).fields.supplier,'COMERCIO EXEMPLO LTDA');assert.equal(recoverReceiptDetails(base(),[a]).fields.supplier,undefined);
 const weak=read(row('COMERCIO EXEMPLO LTDA',{EXEMPLO:30}));assert.equal(recoverReceiptDetails(base(),[weak,weak]).fields.supplier,undefined);
});
