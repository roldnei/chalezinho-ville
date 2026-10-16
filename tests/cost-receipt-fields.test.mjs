import {test} from 'node:test';import assert from 'node:assert/strict';
import {extractReceiptFields,validCNPJ} from '../cost-receipt-fields.js';import {pdfTextLines} from '../cost-receipt-ocr.js';
const receipt=`CASA DA PISCINA TESTE LTDA
CNPJ: 11.222.333/0001-81
Rua Exemplo, 123
DOCUMENTO AUXILIAR DA NOTA FISCAL DE CONSUMIDOR ELETRONICA
NFC-e N. 000123
Emissão: 16/10/2026 14:22
Cloro para piscina 100,00
SUBTOTAL 150,00
DESCONTO 10,00
VALOR TOTAL A PAGAR R$ 140,00
VALOR PAGO R$ 200,00
TROCO R$ 60,00
CONSUMIDOR CNPJ 12.ABC.345/01DE-35`;
test('CNPJ supports numeric and official alphanumeric check digits without repairing guessed characters',()=>{assert.equal(validCNPJ('11.222.333/0001-81'),true);assert.equal(validCNPJ('12.ABC.345/01DE-35'),true);assert.equal(validCNPJ('11.222.333/0001-82'),false);assert.equal(validCNPJ('00.000.000/0000-00'),false);});
test('extracts issuer, issue date, invoice and payable total without using change or subtotal',()=>{const {fields,warnings}=extractReceiptFields(receipt);assert.equal(fields.supplier,'CASA DA PISCINA TESTE LTDA');assert.equal(fields.supplier_document,'11.222.333/0001-81');assert.equal(fields.amount_cents,14000);assert.equal(fields.document_date,'2026-10-16');assert.equal(fields.competence,'2026-10');assert.equal(fields.document_number,'000123');assert.equal(fields.category,'pool');assert.deepEqual(warnings,[]);});
test('does not replace missing issuer CNPJ with consumer CNPJ',()=>{const r=extractReceiptFields(receipt.replace('11.222.333/0001-81','11.222.333/0001-82'));assert.equal(r.fields.supplier_document,undefined);assert.ok(r.warnings.some(w=>w.includes('inválido')));});
test('never guesses largest number; conflicting totals and absent or impossible dates stay pending',()=>{const r=extractReceiptFields('LOJA TESTE\nCNPJ 11222333000181\nTOTAL A PAGAR 40,00\nTOTAL A PAGAR 50,00\nTROCO 500,00\nEmissão 31/02/2026');assert.equal(r.fields.amount_cents,undefined);assert.equal(r.fields.document_date,undefined);assert.ok(r.warnings.some(w=>w.includes('Mais de um total')));const missing=extractReceiptFields('LOJA TESTE\nSUBTOTAL 800,00\nTROCO 900,00');assert.equal(missing.fields.amount_cents,undefined);});
test('emission outranks other dates and total label can precede amount on next line',()=>{const r=extractReceiptFields('LOJA TESTE\nCNPJ 11222333000181\nVencimento 30/10/2026\nEmissão 15/10/2026\nTOTAL A PAGAR\nR$ 1.234,50');assert.equal(r.fields.amount_cents,123450);assert.equal(r.fields.document_date,'2026-10-15');});
test('blank/low confidence readings stay reviewable and never infer payment or tax exclusion',()=>{assert.deepEqual(extractReceiptFields('').fields,{});const r=extractReceiptFields(receipt,{confidence:40});assert.ok(r.warnings.some(w=>w.includes('baixa nitidez')));assert.equal(r.fields.exclusion_cents,undefined);assert.equal(r.fields.paid_on,undefined);});
test('PDF text positions retain row order and associate amount with its label',()=>{const text=pdfTextLines([{str:'140,00',transform:[1,0,0,1,200,100]},{str:'LOJA TESTE',transform:[1,0,0,1,10,200]},{str:'TOTAL A PAGAR',transform:[1,0,0,1,10,100]}]);assert.equal(text,'LOJA TESTE\nTOTAL A PAGAR 140,00');assert.equal(extractReceiptFields(text).fields.amount_cents,14000);});
// Synthetic IDs and keys only. Customer receipts never become public fixtures.
function accessKey(){const base='3226101122233300018165234000089628100089629';let sum=0,w=2;for(let i=42;i>=0;i--){sum+=Number(base[i])*w;w=w===9?2:w+1;}const r=sum%11;return base+(r<2?0:11-r);}
test('reads supplier after CNPJ, joins a wrapped legal suffix and handles OCR punctuation',()=>{
 const r=extractReceiptFields('oo A o RED RS RR RR\n11,222.333/0001-81 - MERCADO EXEMPLO DE ALIMENTO\nS LTDA\nDETERG YPE 500ML\nLAVA ROUPAS PO\nValor a Pagar R$: 40,94');
 assert.equal(r.fields.supplier_document,'11.222.333/0001-81');assert.equal(r.fields.supplier,'MERCADO EXEMPLO DE ALIMENTOS LTDA');assert.equal(r.fields.category,'cleaning_products');assert.equal(r.fields.amount_cents,4094);
});
test('background fragments and low confidence unanchored names stay blank',()=>{
 assert.equal(extractReceiptFields('oo A o RED RS RR RR\n1.E.: 123456789\nTOTAL A PAGAR 40,94').fields.supplier,undefined);
 assert.equal(extractReceiptFields('NOME APARENTEMENTE LEGIVEL\nTOTAL A PAGAR 40,94',{confidence:40}).fields.supplier,undefined);
 assert.equal(extractReceiptFields('LOJA EXEMPLO\nTOTAL A PAGAR 40,94').fields.category,undefined);
});
test('validated access key recovers issuer and invoice without guessing an erroneous digit',()=>{
 const key=accessKey(),r=extractReceiptFields('11.222.333/0001-82 - MERCADO EXEMPLO\nNFC-e: 00069628\nChave de acesso\n'+key.match(/.{1,4}/g).join(' '));
 assert.equal(r.fields.supplier_document,'11.222.333/0001-81');assert.equal(r.fields.document_number,'000089628');assert.match(r.evidence.document_number,/Chave de acesso validada/);assert.ok(r.warnings.some(w=>w.includes('divergiu')));
 const invalid=extractReceiptFields(key.slice(0,-1)+(Number(key.at(-1))+1)%10);assert.equal(invalid.fields.supplier_document,undefined);assert.equal(invalid.fields.document_number,undefined);
});
test('OCR dates require agreement across distinct lines when the emission day conflicts',()=>{
 const mixed='LOJA EXEMPLO\n16/10/2026 - Cupom: 123\nN.:192220 Serie:114 Emissão 15/10/2026 11:05\nTOTAL A PAGAR 48,90';
 const r=extractReceiptFields(mixed,{confidence:80});assert.equal(r.fields.document_date,undefined);assert.equal(r.fields.competence,undefined);assert.equal(r.fields.document_number,'192220');assert.ok(r.warnings.some(w=>w.includes('Datas com leituras diferentes')));
 const agreed=extractReceiptFields(mixed+'\nProtocolo de autorização 16/10/2026',{confidence:80});assert.equal(agreed.fields.document_date,'2026-10-16');
 assert.equal(extractReceiptFields(mixed).fields.document_date,'2026-10-15');
 assert.equal(extractReceiptFields('Cod Descr. Qtd. Unid. Preco Total\nTOTAL A PAGAR 48,90').fields.supplier,undefined);
});
test('explicit business labels do not throw and low quality dates stay pending even if repeated',()=>{const r=extractReceiptFields('Razão social: MERCADO EXEMPLO LTDA\nCNPJ 11222333000181\nEmissão 15/10/2026\nProtocolo 15/10/2026\nTOTAL A PAGAR 48,90',{confidence:50});assert.equal(r.fields.supplier,'MERCADO EXEMPLO LTDA');assert.equal(r.fields.document_date,undefined);assert.equal(r.fields.competence,undefined);assert.equal(r.fields.amount_cents,undefined);assert.ok(r.warnings.some(w=>w.includes('Valor sem nitidez')));assert.ok(r.warnings.some(w=>w.includes('Data sem nitidez')));assert.equal(extractReceiptFields('Nome fantasia: MERCADO EXEMPLO').fields.supplier,'MERCADO EXEMPLO');});
test('missing receipt header never turns a product or a value row into the supplier',()=>{
 for(const text of ['Documento Auxiliar da Nota Fiscal de Consumidor Eletronica\nCODIGO DESCRICAO\n123 ASSENTO SANIT.BCO\nValor Produtos R$ 85,60\nValor a Pagar R$ 85,60','Valor Produtos R$ 85,60\nTOTAL A PAGAR 85,60']){
  const r=extractReceiptFields(text,{confidence:90});assert.equal(r.fields.supplier,undefined);assert.equal(r.fields.description,undefined);assert.equal(r.fields.amount_cents,8560);
 }
 const r=extractReceiptFields('Documento Auxiliar\nCNPJ 11.222.333/0001-81');assert.equal(r.fields.supplier_document,'11.222.333/0001-81');assert.equal(r.fields.supplier,undefined);
});
test('spaced issuer CNPJ anchors the business name before the fiscal heading',()=>{
 const r=extractReceiptFields('CNPJ 11 222 333/0001-81 LOJA EXEMPLO LTDA ME\nRua Exemplo 10\nDocumento Auxiliar\nValor Produtos R$ 85,60\nValor a Pagar R$ 85,60');assert.equal(r.fields.supplier_document,'11.222.333/0001-81');assert.equal(r.fields.supplier,'LOJA EXEMPLO LTDA ME');
});
test('instalment due dates and instalment amounts do not replace issue date and full total',()=>{
 const r=extractReceiptFields('LOJA EXEMPLO\nDocumento Auxiliar\nNFC-e nº 54321 Série 001 10/08/2026\nValor total R$ 120,00\nParcela 01/02 Vencendo em 10/09/2026 Cartao 60,00\nParcela 02/02 Vencendo em 10/10/2026 Cartao 60,00',{confidence:90});assert.equal(r.fields.document_date,'2026-08-10');assert.equal(r.fields.competence,'2026-08');assert.equal(r.fields.amount_cents,12000);
 const pending=extractReceiptFields('Parcela 01/02 Venc. 10/09/2026 60,00');assert.equal(pending.fields.document_date,undefined);assert.equal(pending.fields.amount_cents,undefined);
});
test('sanitary fittings and electrical repair parts suggest maintenance',()=>{
 for(const item of ['ASSENTO SANIT.BCO ALMOF','PERFIL EMBUTIR ALUMINIO','FONTE DE ALIMENTACAO SLIM'])assert.equal(extractReceiptFields('LOJA EXEMPLO\nDocumento Auxiliar\n'+item).fields.category,'maintenance');
});
